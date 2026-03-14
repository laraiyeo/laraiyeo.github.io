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
  Modal,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Circle,
} from "react-native-svg";
import {
  FontAwesome6,
  FontAwesome5,
  MaterialCommunityIcons,
  Ionicons,
} from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useGamePresence } from "../../../hooks/useGamePresence";
import { useTheme } from "../../../context/ThemeContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";

const { width } = Dimensions.get("window");

const FOOTBALL_BASE = "https://laraiyeogithubio-production-08da.up.railway.app";

const GAME_CACHE_KEY = (id) => `@gameDetail_v1:${id}`;
const GAME_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const GAME_AUX_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const GAME_H2H_CACHE_KEY = (homeId, awayId) =>
  `@gameDetail_h2h_v1:${homeId}:${awayId}`;
const GAME_FACTS_CACHE_KEY = (fixtureId) => `@gameDetail_facts_v1:${fixtureId}`;

// ─── Polling helpers (same pattern as Top5ScoreboardScreen) ──────────────────
const INTERVAL_SLOW = 30 * 60 * 1000; // 30 minutes
const INTERVAL_FAST = 10 * 1000; // 10 seconds
const INTERVAL_SOON = 60 * 1000; // 1 minute
const INTERVAL_FINISHED = 6 * 60 * 60 * 1000; // 6 hours
const LIVE_SHORT_NAMES = new Set(["1ST", "2ND", "HT"]);

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

const shortNameOf = (fixture) =>
  String(fixture?.state?.short_name || "").toUpperCase();

const startMsOf = (fixture) => {
  try {
    return new Date(fixture.starting_at.replace(" ", "T") + "Z").getTime();
  } catch (_) {
    return null;
  }
};

const getFixturePolicy = (fixture) => {
  if (!fixture) {
    return { mode: "default", intervalMs: INTERVAL_SLOW, cacheMs: 0 };
  }

  const short = shortNameOf(fixture);
  if (LIVE_SHORT_NAMES.has(short)) {
    return { mode: "live", intervalMs: INTERVAL_FAST, cacheMs: INTERVAL_FAST };
  }

  if (short === "FT") {
    return {
      mode: "finished",
      intervalMs: INTERVAL_FINISHED,
      cacheMs: INTERVAL_FINISHED,
    };
  }

  if (short === "NS") {
    const now = Date.now();
    const startMs = startMsOf(fixture);
    const withinHour =
      Number.isFinite(startMs) &&
      startMs > now &&
      startMs - now <= 60 * 60 * 1000;

    if (withinHour) {
      return {
        mode: "scheduled_soon",
        intervalMs: INTERVAL_SOON,
        cacheMs: INTERVAL_SOON,
      };
    }

    return {
      mode: "scheduled",
      intervalMs: INTERVAL_SLOW,
      cacheMs: INTERVAL_SLOW,
    };
  }

  return {
    mode: "default",
    intervalMs: INTERVAL_SLOW,
    cacheMs: INTERVAL_SLOW,
  };
};

const formatFixtureTime = (fixture) => {
  try {
    const date = new Date(fixture.starting_at.replace(" ", "T") + "Z");
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    const h = hours % 12 || 12;
    return { time: `${h}:${minutes}`, ampm };
  } catch (_) {
    return { time: "--:--", ampm: "" };
  }
};

const pad2 = (v) => String(Math.max(0, v)).padStart(2, "0");

const getTickingClock = (fixture, nowMs, snapshotTsMs) => {
  const ticking = (fixture?.periods ?? []).find((p) => p?.ticking === true);
  if (!ticking) return null;

  const anchorTotal = Number(fixture?.__tickAnchorTotal ?? 0);
  const anchorTs = Number(fixture?.__tickAnchorTs ?? snapshotTsMs ?? nowMs);
  const safeAnchorTotal = Number.isFinite(anchorTotal) ? anchorTotal : 0;
  const safeAnchorTs = Number.isFinite(anchorTs) ? anchorTs : nowMs;

  const elapsed = Math.max(0, Math.floor((nowMs - safeAnchorTs) / 1000));
  const total = safeAnchorTotal + elapsed;
  const mm = Math.floor(total / 60);
  const ss = total % 60;

  return `${mm}:${pad2(ss)}`;
};

const getStatusInfo = (fixture, nowMs = Date.now(), snapshotTsMs = nowMs) => {
  const code = (fixture?.state?.state || "").toUpperCase();
  const long = fixture?.state?.name || "";
  const short =
    getTickingClock(fixture, nowMs, snapshotTsMs) ||
    fixture?.state?.short_name ||
    code;
  const isFinished = [
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
  const isScheduled = !code || ["NS", "TBA", "DELAYED"].includes(code);
  const isLive = !isFinished && !isScheduled;

  if (isLive) {
    return {
      line1: short || "LIVE",
      line2: long || "",
      isLive: true,
      isFinished: false,
    };
  }

  if (isFinished) {
    const { time, ampm } = formatFixtureTime(fixture);
    return {
      line1: short || "FT",
      line2: `${time} ${ampm}`,
      isLive: false,
      isFinished: true,
    };
  }

  const { time, ampm } = formatFixtureTime(fixture);
  return { line1: time, line2: ampm, isLive: false, isFinished: false };
};

// ─── Goal time formatter ──────────────────────────────────────────────────────
function formatGoalTime(e) {
  const min = e.minute != null ? `${e.minute}'` : "";
  const extra = e.extra_minute ? `+${e.extra_minute}'` : "";
  const low = `${e?.addition || ""} ${e?.info || ""}`
    .toLowerCase()
    .replace(/\s+/g, " ");
  const isP =
    low.includes("penalty") &&
    !low.includes("awarded") &&
    !low.includes("missed");
  const isOG = low.includes("own goal") || low.includes("owngoal");
  return `${min}${extra}${isP ? " (P.)" : ""}${isOG ? " (OG.)" : ""}`;
}

const parseEventScore = (scoreText) => {
  const parts = String(scoreText || "").split("-");
  if (parts.length !== 2) return null;
  const home = Number(parts[0]);
  const away = Number(parts[1]);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return { home, away };
};

const isGoalLikeEvent = (event) => {
  const addLow = String(event?.addition || "").toLowerCase();
  return (
    event?.rescinded !== true &&
    (addLow.includes("goal") ||
      (addLow.includes("penalty") &&
        !addLow.includes("missed") &&
        !addLow.includes("awarded")))
  );
};

const isPenaltyGoalEvent = (event) => {
  const addLow = String(event?.addition || "").toLowerCase();
  return (
    addLow.includes("penalty") &&
    !addLow.includes("missed") &&
    !addLow.includes("awarded")
  );
};

const isOwnGoalEvent = (event, commentText = "") => {
  const low = `${event?.addition || ""} ${event?.info || ""} ${commentText}`
    .toLowerCase()
    .replace(/\s+/g, " ");
  return low.includes("own goal") || low.includes("owngoal");
};

const isDisallowedGoalEvent = (event) => {
  const low = `${event?.addition || ""} ${event?.info || ""}`
    .toLowerCase()
    .replace(/\s+/g, " ");
  return low.includes("disallowed");
};

const deriveGoalSituation = (scoreAfter, scoringSide) => {
  if (!scoreAfter || !scoringSide) return "";
  const homeScore = Number(scoreAfter.home ?? 0);
  const awayScore = Number(scoreAfter.away ?? 0);

  if (scoringSide === "home") {
    if (homeScore > awayScore) {
      if (homeScore - awayScore === 1) {
        return awayScore === 0 ? "Opening Goal" : "Go-ahead Goal";
      }
      return "Extends Lead";
    }
    if (homeScore === awayScore) return "Equalizer";
    return "Pulls One Back";
  }

  if (scoringSide === "away") {
    if (awayScore > homeScore) {
      if (awayScore - homeScore === 1) {
        return homeScore === 0 ? "Opening Goal" : "Go-ahead Goal";
      }
      return "Extends Lead";
    }
    if (awayScore === homeScore) return "Equalizer";
    return "Pulls One Back";
  }

  return "";
};

const normalizeDetailKey = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

const parseStatNum = (value) => {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = Number(String(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const getLineupDetailStat = (lineup, ...keys) => {
  const wanted = keys.map((key) => normalizeDetailKey(key));
  const detail = (lineup?.details ?? []).find((row) =>
    wanted.includes(normalizeDetailKey(row?.type?.name)),
  );
  return parseStatNum(detail?.data?.value);
};

const formatGoalMinute = (minute, extraMinute) => {
  if (minute == null) return "";
  const extra = Number(extraMinute ?? 0);
  return extra > 0 ? `${minute}'+${extra}` : `${minute}'`;
};

const buildGoalShareStats = (lineup, isOwnGoal) => {
  const rating = getLineupRating(lineup);
  const stats = {
    rtg: rating != null ? Number(rating.toFixed(1)) : null,
    gls: getLineupDetailStat(lineup, "goals", "goal"),
    ast: getLineupDetailStat(lineup, "assists", "assist"),
    sot: getLineupDetailStat(lineup, "shots on target", "shot on target"),
    sht: getLineupDetailStat(lineup, "shots total", "shots", "shots on"),
    yc: getLineupDetailStat(lineup, "yellowcards", "yellowcard"),
    og: getLineupDetailStat(lineup, "owngoals", "owngoal"),
  };

  if (isOwnGoal) {
    return [
      { label: "RTG", value: stats.rtg },
      { label: "OG", value: stats.og },
      { label: "GLS", value: stats.gls },
      { label: "AST", value: stats.ast },
      { label: "SOT", value: stats.sot },
      { label: "SHT", value: stats.sht },
    ];
  }

  return [
    { label: "RTG", value: stats.rtg },
    { label: "GLS", value: stats.gls },
    { label: "AST", value: stats.ast },
    { label: "SOT", value: stats.sot },
    { label: "SHT", value: stats.sht },
    { label: "YC", value: stats.yc },
  ];
};

const getBallZone = (x) => {
  if (!Number.isFinite(x)) return "Unknown";
  if (x < 0.33) return "Defensive third";
  if (x < 0.67) return "Middle third";
  return "Attacking third";
};

const calculateZoneDistribution = (coordinates) => {
  const zones = { defensive: 0, middle: 0, attacking: 0 };

  for (const coord of coordinates ?? []) {
    const x = Number(coord?.x);
    if (!Number.isFinite(x)) continue;
    if (x < 0.33) zones.defensive += 1;
    else if (x < 0.67) zones.middle += 1;
    else zones.attacking += 1;
  }

  const total = zones.defensive + zones.middle + zones.attacking;
  if (total <= 0) {
    return { defensive: 0, middle: 0, attacking: 0 };
  }

  return {
    defensive: (zones.defensive / total) * 100,
    middle: (zones.middle / total) * 100,
    attacking: (zones.attacking / total) * 100,
  };
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeBallPoint = (coord) => {
  const x = Number(coord?.x);
  const y = Number(coord?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const xNorm = clamp((x - 0.01) / 1.0, 0, 1);
  const yNorm = clamp((y + 0.02) / 1.04, 0, 1);

  return {
    id: coord?.id ?? `${coord?.timer || "time"}_${x}_${y}`,
    periodId: coord?.period_id ?? null,
    timer: coord?.timer || "--:--",
    x,
    y,
    xNorm,
    yNorm,
    zone: getBallZone(x),
  };
};

const formatPeriodLabel = (period) => {
  const desc = String(period?.description || "")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!desc) return `Period ${period?.id ?? "-"}`;
  return desc
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

const HEATMAP_COLS = 24;
const HEATMAP_ROWS = 16;

const buildBallHeatmap = (points, cols = HEATMAP_COLS, rows = HEATMAP_ROWS) => {
  const size = cols * rows;
  const raw = new Array(size).fill(0);
  const indexOf = (r, c) => r * cols + c;

  for (const p of points ?? []) {
    const col = clamp(Math.floor((p?.xNorm ?? 0) * cols), 0, cols - 1);
    const row = clamp(Math.floor((p?.yNorm ?? 0) * rows), 0, rows - 1);
    raw[indexOf(row, col)] += 1;
  }

  const smoothOnce = (source) => {
    const target = new Array(size).fill(0);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        let sum = 0;
        let weight = 0;
        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
            const w = dr === 0 && dc === 0 ? 4 : dr === 0 || dc === 0 ? 2 : 1;
            sum += source[indexOf(rr, cc)] * w;
            weight += w;
          }
        }
        target[indexOf(r, c)] = weight > 0 ? sum / weight : 0;
      }
    }
    return target;
  };

  const smoothed = smoothOnce(smoothOnce(raw));
  const maxVal = smoothed.reduce((mx, v) => (v > mx ? v : mx), 0);

  return {
    cols,
    rows,
    maxVal,
    cells: smoothed.map((v) => (maxVal > 0 ? v / maxVal : 0)),
  };
};

const getHeatColor = (intensity) => {
  const t = clamp(Number(intensity) || 0, 0, 1);
  const r = 255;
  const g = Math.round(210 - t * 180);
  const b = Math.round(70 - t * 60);
  const a = 0.06 + t * 0.84;
  return `rgba(${r},${g},${Math.max(0, b)},${a.toFixed(3)})`;
};

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
const StatusBadge = ({ fixture, theme, nowMs, snapshotTsMs }) => {
  const si = getStatusInfo(fixture, nowMs, snapshotTsMs);

  return (
    <View style={styles.statusBadge}>
      {si.isLive ? (
        <View style={{ alignItems: "center" }}>
          <Text
            style={[styles.statusMain, { color: theme.error || "#e03131" }]}
          >
            {si.line1}
          </Text>
          {!!si.line2 && (
            <Text style={[styles.statusSub, { color: theme.textTertiary }]}>
              {si.line2}
            </Text>
          )}
        </View>
      ) : si.isFinished ? (
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.statusMain, { color: theme.textSecondary }]}>
            {si.line1}
          </Text>
          {!!si.line2 && (
            <Text style={[styles.statusSub, { color: theme.textTertiary }]}>
              {si.line2}
            </Text>
          )}
        </View>
      ) : (
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.statusMain, { color: theme.text }]}>
            {si.line1}
          </Text>
          {!!si.line2 && (
            <Text style={[styles.statusSub, { color: theme.textTertiary }]}>
              {si.line2}
            </Text>
          )}
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
  return distance <= 70;
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
const ManOfTheMatch = ({
  entry,
  home,
  away,
  homeColor,
  awayColor,
  theme,
  colors,
  onPress,
}) => {
  const { lineup, team, rating } = entry;
  const player = lineup.player;
  const teamColor =
    team?.id === home?.id
      ? homeColor
      : team?.id === away?.id
        ? awayColor
        : team?.colorPrimary || colors.primary;
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
    <TouchableOpacity
      activeOpacity={onPress ? 0.78 : 1}
      onPress={onPress}
      disabled={!onPress}
      style={[motmStyles.card, { backgroundColor: theme.surface }]}
    >
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
    </TouchableOpacity>
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
  onPlayerPress,
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
                    onPlayerPress?.({
                      lineup: entry?.lineup,
                      playerId,
                      playerName,
                      team:
                        side === "home" ? home : side === "away" ? away : null,
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
  comments,
  periods,
  scores,
  lineups,
  participants,
  stateCode,
  homeId,
  awayId,
  theme,
  accentColor,
  colors,
  onPlayerPress,
}) => {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [goalSharePayload, setGoalSharePayload] = useState(null);

  const lineupsByPlayerId = useMemo(() => {
    const m = new Map();
    for (const l of lineups ?? []) {
      const id = l?.player_id;
      if (id == null) continue;
      if (!m.has(id)) m.set(id, l);
    }
    return m;
  }, [lineups]);

  const participantsById = useMemo(() => {
    const m = new Map();
    for (const p of participants ?? []) {
      if (p?.id != null) m.set(p.id, p);
    }
    return m;
  }, [participants]);

  const periodById = useMemo(() => {
    const m = new Map();
    for (const p of periods ?? []) {
      if (p?.id != null) m.set(p.id, p);
    }
    return m;
  }, [periods]);

  const homeTeam = (participants ?? []).find(
    (p) => String(p?.meta?.location || "").toLowerCase() === "home",
  );
  const awayTeam = (participants ?? []).find(
    (p) => String(p?.meta?.location || "").toLowerCase() === "away",
  );
  const { homeColor: resolvedHomeColor, awayColor: resolvedAwayColor } =
    useMemo(
      () =>
        resolveMatchColors({
          homePrimary: homeTeam?.colorPrimary,
          homeSecondary: homeTeam?.colorSecondary,
          awayPrimary: awayTeam?.colorPrimary,
          awaySecondary: awayTeam?.colorSecondary,
          homeFallback: accentColor || colors.primary,
          awayFallback: colors.secondary || colors.primary,
        }),
      [homeTeam, awayTeam, accentColor, colors.primary, colors.secondary],
    );

  const getResolvedTeamColor = useCallback(
    (team) => {
      if (team?.id === homeTeam?.id) return resolvedHomeColor;
      if (team?.id === awayTeam?.id) return resolvedAwayColor;
      return team?.colorPrimary || accentColor || colors.primary;
    },
    [
      homeTeam?.id,
      awayTeam?.id,
      resolvedHomeColor,
      resolvedAwayColor,
      accentColor,
      colors.primary,
    ],
  );

  const closeEventPlayerModal = () => setSelectedEvent(null);
  const closeGoalShareModal = () => setGoalSharePayload(null);

  const navigateFromEventPlayer = ({ playerId, lineup, team }) => {
    if (playerId == null) return;
    setSelectedEvent(null);
    onPlayerPress?.({
      playerId,
      lineup: lineup ?? null,
      player: lineup?.player ?? null,
      team: team ?? null,
    });
  };

  const getEventRelatedParticipantId = (event) =>
    event?.relatedparticipant_id ??
    event?.related_participant_id ??
    event?.relatedParticipantId ??
    null;

  const parseCommentMinute = useCallback((item) => {
    if (item?.minute != null && Number.isFinite(Number(item.minute))) {
      return Number(item.minute);
    }
    const text = String(item?.comment || "");
    const minuteMatch = text.match(/(\d{1,3})(?:st|nd|rd|th)?\s*minute/i);
    if (minuteMatch?.[1] != null) return Number(minuteMatch[1]);
    const markMatch = text.match(/(\d{1,3})\s*-\s*minute\s*mark/i);
    if (markMatch?.[1] != null) return Number(markMatch[1]);
    return null;
  }, []);

  const findGoalCommentForEvent = useCallback(
    (event) => {
      if (!event) return "";
      const minute = Number(event?.minute);
      const extra = Number(event?.extra_minute ?? 0);
      if (!Number.isFinite(minute)) return "";

      const playerLow = String(event?.player_name || "").toLowerCase();
      const relatedLow = String(event?.related_player_name || "").toLowerCase();
      const teamLow = String(
        participantsById.get(event?.participant_id)?.name || "",
      ).toLowerCase();

      const candidates = (comments ?? [])
        .filter((c) => c?.is_goal === true)
        .map((c) => ({
          comment: c,
          minute: parseCommentMinute(c),
          extra: Number(c?.extra_minute ?? 0),
        }))
        .filter((row) => row.minute === minute && row.extra === extra)
        .map((row) => row.comment);

      if (!candidates.length) return "";

      const playerMatch = candidates.find((c) =>
        String(c?.comment || "")
          .toLowerCase()
          .includes(playerLow),
      );
      if (playerMatch) return playerMatch.comment || "";

      const relatedMatch = candidates.find((c) =>
        String(c?.comment || "")
          .toLowerCase()
          .includes(relatedLow),
      );
      if (relatedMatch) return relatedMatch.comment || "";

      const teamMatch = candidates.find((c) =>
        String(c?.comment || "")
          .toLowerCase()
          .includes(teamLow),
      );
      if (teamMatch) return teamMatch.comment || "";

      return candidates[0]?.comment || "";
    },
    [comments, parseCommentMinute, participantsById],
  );

  const resolveEventPlayerMeta = (event, kind = "player") => {
    const isRelated = kind === "related";
    const playerId = isRelated ? event?.related_player_id : event?.player_id;
    const fallbackName = isRelated
      ? event?.related_player_name
      : event?.player_name;
    const lineup =
      playerId != null ? (lineupsByPlayerId.get(playerId) ?? null) : null;
    const participantId = isRelated
      ? (getEventRelatedParticipantId(event) ??
        lineup?.team_id ??
        event?.participant_id)
      : (event?.participant_id ?? lineup?.team_id);
    const team =
      (participantId != null ? participantsById.get(participantId) : null) ??
      (lineup?.team_id != null ? participantsById.get(lineup.team_id) : null) ??
      null;

    return { playerId, fallbackName, lineup, team };
  };

  const openGoalShareFromEvent = useCallback(
    (event) => {
      if (!event || !isGoalLikeEvent(event)) return;
      if (isDisallowedGoalEvent(event)) return;
      const playerMeta = resolveEventPlayerMeta(event, "player");
      const relatedMeta = resolveEventPlayerMeta(event, "related");
      const lineup = playerMeta?.lineup ?? null;
      const player = lineup?.player ?? null;
      const relatedPlayer = relatedMeta?.lineup?.player ?? null;
      const playerName =
        player?.name ||
        `${player?.firstname ?? ""} ${player?.lastname ?? ""}`.trim() ||
        event?.player_name ||
        "Unknown Player";
      const assistName =
        relatedPlayer?.name ||
        `${relatedPlayer?.firstname ?? ""} ${relatedPlayer?.lastname ?? ""}`.trim() ||
        relatedMeta?.fallbackName ||
        event?.related_player_name ||
        null;
      const playerInitials =
        [player?.firstname?.[0], player?.lastname?.[0]]
          .filter(Boolean)
          .join("")
          .toUpperCase() ||
        playerName
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0])
          .join("")
          .toUpperCase() ||
        "?";

      const commentText = findGoalCommentForEvent(event);
      const isOwnGoal = isOwnGoalEvent(event, commentText);
      const isPenalty = isPenaltyGoalEvent(event);
      const scoreAfter = parseEventScore(event?.result) || {
        home: null,
        away: null,
      };

      const scoringSide =
        event?.participant_id === homeTeam?.id
          ? "home"
          : event?.participant_id === awayTeam?.id
            ? "away"
            : null;

      const scoringTeam =
        scoringSide === "home"
          ? homeTeam
          : scoringSide === "away"
            ? awayTeam
            : (playerMeta?.team ?? null);

      const ownGoalerTeam =
        isOwnGoal && scoringSide
          ? scoringSide === "home"
            ? awayTeam
            : homeTeam
          : null;

      const displayTeam = ownGoalerTeam || playerMeta?.team || scoringTeam;
      const teamColor = getResolvedTeamColor(displayTeam);

      const periodRaw = String(
        periodById.get(event?.period_id)?.description || "",
      ).toLowerCase();
      const periodLabel =
        periodRaw === "1st-half"
          ? "1st Half"
          : periodRaw === "2nd-half"
            ? "2nd Half"
            : periodRaw.replace(/-/g, " ");

      const payload = {
        scorerName: playerName,
        scorerInitials: playerInitials,
        playerImageUri:
          player?.image_path &&
          !String(player.image_path).includes("placeholder")
            ? player.image_path
            : null,
        teamName: displayTeam?.name || "Team",
        teamAbbr: displayTeam?.short_code || "",
        teamLogoUri: displayTeam?.image_path || null,
        teamColor,
        homeLogo: homeTeam?.image_path || null,
        awayLogo: awayTeam?.image_path || null,
        minuteLabel: formatGoalMinute(event?.minute, event?.extra_minute),
        periodLabel,
        comment: commentText,
        isPenalty,
        isOwnGoal,
        assistName,
        scoreAfter,
        goalSituation: deriveGoalSituation(scoreAfter, scoringSide),
        statsItems: buildGoalShareStats(lineup, isOwnGoal),
      };

      setSelectedEvent(null);
      setTimeout(() => setGoalSharePayload(payload), 70);
    },
    [
      resolveEventPlayerMeta,
      findGoalCommentForEvent,
      homeTeam,
      awayTeam,
      getResolvedTeamColor,
      periodById,
    ],
  );

  const renderEventPlayerSection = (title, meta) => {
    if (!meta?.playerId && !meta?.fallbackName) return null;

    const player = meta?.lineup?.player ?? null;
    const firstName =
      player?.firstname ||
      String(meta?.fallbackName || "")
        .split(" ")
        .slice(0, -1)
        .join(" ");
    const lastName =
      player?.lastname ||
      String(meta?.fallbackName || "")
        .split(" ")
        .slice(-1)
        .join(" ") ||
      String(meta?.fallbackName || "Unknown");

    const imageUri =
      player?.image_path && !String(player.image_path).includes("placeholder")
        ? player.image_path
        : null;
    const effectiveTeam = meta?.displayTeam ?? meta?.team;
    const teamColor = getResolvedTeamColor(effectiveTeam);
    const textOnTeam = getTextOnColor(teamColor);
    const initials =
      [player?.firstname?.[0], player?.lastname?.[0]]
        .filter(Boolean)
        .join("")
        .toUpperCase() ||
      String(meta?.fallbackName || "?")
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase() ||
      "?";

    return (
      <View
        key={`${title}:${meta?.playerId ?? meta?.fallbackName}`}
        style={[evStyles.playerPopupSection, { borderColor: theme.border }]}
      >
        <Text
          style={[evStyles.playerPopupTitle, { color: theme.textSecondary }]}
        >
          {title}
        </Text>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => navigateFromEventPlayer(meta)}
          disabled={!meta?.playerId || !onPlayerPress}
          style={[
            evStyles.playerPopupRow,
            { backgroundColor: theme.surfaceSecondary },
          ]}
        >
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={[
                evStyles.playerPopupAvatar,
                {
                  backgroundColor: `${teamColor}30`,
                  borderColor: teamColor,
                },
              ]}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View
              style={[
                evStyles.playerPopupAvatar,
                evStyles.playerPopupAvatarFallback,
                {
                  backgroundColor: `${teamColor}30`,
                  borderColor: teamColor,
                },
              ]}
            >
              <Text
                style={[evStyles.playerPopupInitials, { color: textOnTeam }]}
              >
                {initials}
              </Text>
            </View>
          )}

          <View style={evStyles.playerPopupNameCol}>
            <Text
              style={[
                evStyles.playerPopupFirstName,
                { color: theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {firstName || " "}
            </Text>
            <Text
              style={[evStyles.playerPopupLastName, { color: theme.text }]}
              numberOfLines={1}
            >
              {lastName}
            </Text>
          </View>

          {effectiveTeam?.image_path ? (
            <Image
              source={{ uri: effectiveTeam.image_path }}
              style={evStyles.playerPopupTeamLogo}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          ) : (
            <View
              style={[
                evStyles.playerPopupTeamLogoFallback,
                { backgroundColor: `${teamColor}30` },
              ]}
            >
              <Text
                style={[
                  evStyles.playerPopupTeamLogoFallbackText,
                  { color: teamColor },
                ]}
              >
                {(effectiveTeam?.name || "?")[0]?.toUpperCase?.() || "?"}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

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

  // If the match is live, show newest events first (reverse chronological)
  const liveMatch = isLiveState(stateCode);
  if (liveMatch) rows.reverse();

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

  // If match is live, show later periods first (e.g. 2nd half above 1st)
  const displayPeriodBlocks = isLiveState(stateCode)
    ? periodBlocks.slice().reverse()
    : periodBlocks;

  const totalBlocks = displayPeriodBlocks.length;

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
    if (addLow.includes("red")) {
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
    if (addLow.includes("own goal") && e.result != null) {
      return (
        <FontAwesome6
          name="soccer-ball"
          size={14}
          color={theme.error || "#e67700"}
          style={evStyles.ballIcon}
        />
      );
    }
    if (
      (addLow.includes("disallowed") || addLow.includes("var")) &&
      e.result == null
    ) {
      return (
        <FontAwesome6
          name="video-slash"
          size={12}
          color={theme.error || "#e03131"}
          style={evStyles.ballIcon}
        />
      );
    }
    if (addLow.includes("goal") || addLow.includes("penalty")) {
      return (
        <FontAwesome6
          name="soccer-ball"
          size={14}
          color="#FFFFFF"
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
    const isOwnGoal = isOwnGoalEvent(event);
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
        ) : isOwnGoal ? (
          <Text
            style={[
              evStyles.goalDetailText,
              { color: theme.textSecondary },
              !isHome && evStyles.goalDetailTextAway,
            ]}
            numberOfLines={1}
          >
            Own Goal - {goalDetail || ""}
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
        {displayPeriodBlocks.map((block, blockIdx) => (
          <View key={`${block.key}:${blockIdx}`}>
            {block.events.map((event, idx) => {
              const isHome = event.participant_id === homeId;
              return (
                <TouchableOpacity
                  key={`${event.participant_id}:${event.player_id ?? idx}:${event.minute}:${event.extra_minute ?? 0}:${idx}`}
                  style={evStyles.row}
                  activeOpacity={0.75}
                  onPress={() => setSelectedEvent(event)}
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
                </TouchableOpacity>
              );
            })}

            {blockIdx < totalBlocks - 1
              ? renderPeriodDivider("HT", `ht:${block.key}`)
              : isFinished && renderPeriodDivider("FT", `ft:${block.key}`)}
          </View>
        ))}
      </View>

      <Modal
        visible={!!selectedEvent}
        transparent
        animationType="fade"
        onRequestClose={closeEventPlayerModal}
      >
        <View style={evStyles.playerPopupOverlay}>
          <TouchableOpacity
            style={evStyles.playerPopupBackdropTap}
            activeOpacity={1}
            onPress={closeEventPlayerModal}
          />
          <View
            style={[
              evStyles.playerPopupCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View
              style={[
                evStyles.playerPopupHeader,
                { borderBottomColor: theme.border },
              ]}
            >
              <Text
                style={[evStyles.playerPopupHeaderTitle, { color: theme.text }]}
              >
                Event Players
              </Text>
              <TouchableOpacity
                onPress={closeEventPlayerModal}
                style={[
                  evStyles.playerPopupCloseBtn,
                  { backgroundColor: theme.error },
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    evStyles.playerPopupCloseText,
                    { color: theme.textSecondary },
                  ]}
                >
                  ✕
                </Text>
              </TouchableOpacity>
            </View>

            <View style={evStyles.playerPopupBody}>
              {(() => {
                const playerMeta = selectedEvent
                  ? resolveEventPlayerMeta(selectedEvent, "player")
                  : null;
                const commentText = selectedEvent
                  ? findGoalCommentForEvent(selectedEvent)
                  : "";
                const ownGoal = selectedEvent
                  ? isOwnGoalEvent(selectedEvent, commentText)
                  : false;
                const ownGoalDisplayTeam = ownGoal
                  ? selectedEvent?.participant_id === homeTeam?.id
                    ? awayTeam
                    : selectedEvent?.participant_id === awayTeam?.id
                      ? homeTeam
                      : null
                  : null;
                const effectivePlayerMeta = playerMeta
                  ? {
                      ...playerMeta,
                      displayTeam: ownGoalDisplayTeam || playerMeta.team,
                    }
                  : null;

                return effectivePlayerMeta
                  ? renderEventPlayerSection("Player", effectivePlayerMeta)
                  : null;
              })()}
              {selectedEvent
                ? renderEventPlayerSection(
                    "Related Player",
                    resolveEventPlayerMeta(selectedEvent, "related"),
                  )
                : null}

              {selectedEvent &&
              isGoalLikeEvent(selectedEvent) &&
              !isDisallowedGoalEvent(selectedEvent) ? (
                <View
                  style={[
                    evStyles.playerPopupSection,
                    { borderColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      evStyles.playerPopupTitle,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Goal Share Card
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => openGoalShareFromEvent(selectedEvent)}
                    style={[
                      evStyles.goalShareActionBtn,
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
                        evStyles.goalShareActionText,
                        { color: theme.text },
                      ]}
                    >
                      Open Goal Share Card
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      <GoalShareCardModal
        visible={!!goalSharePayload}
        onClose={closeGoalShareModal}
        payload={goalSharePayload}
        theme={theme}
        colors={colors}
      />
    </View>
  );
};

const CommentarySection = ({
  comments,
  events,
  periods,
  lineups,
  participants,
  theme,
  colors,
  onPlayerPress,
}) => {
  const [activeType, setActiveType] = useState("ALL");
  const [selectedGoalEntry, setSelectedGoalEntry] = useState(null);
  const [goalSharePayload, setGoalSharePayload] = useState(null);

  const homeTeam = (participants ?? []).find(
    (p) => String(p?.meta?.location || "").toLowerCase() === "home",
  );
  const awayTeam = (participants ?? []).find(
    (p) => String(p?.meta?.location || "").toLowerCase() === "away",
  );
  const { homeColor: resolvedHomeColor, awayColor: resolvedAwayColor } =
    useMemo(
      () =>
        resolveMatchColors({
          homePrimary: homeTeam?.colorPrimary,
          homeSecondary: homeTeam?.colorSecondary,
          awayPrimary: awayTeam?.colorPrimary,
          awaySecondary: awayTeam?.colorSecondary,
          homeFallback: colors.primary,
          awayFallback: colors.secondary || colors.primary,
        }),
      [homeTeam, awayTeam, colors.primary, colors.secondary],
    );

  const getResolvedTeamColor = useCallback(
    (team) => {
      if (team?.id === homeTeam?.id) return resolvedHomeColor;
      if (team?.id === awayTeam?.id) return resolvedAwayColor;
      return team?.colorPrimary || theme.border;
    },
    [
      homeTeam?.id,
      awayTeam?.id,
      resolvedHomeColor,
      resolvedAwayColor,
      theme.border,
    ],
  );

  const getCommentType = useCallback((item) => {
    if (item?.is_goal) return "GOAL";
    const text = String(item?.comment || "").toLowerCase();

    if (text.includes("corner awarded") || text.includes("corner kick")) {
      return "CORNER";
    }
    if (
      text.includes("right-footed shot") ||
      text.includes("left-footed shot") ||
      text.includes("heads the ball")
    ) {
      return "SHOT ATTEMPT";
    }
    if (text.includes("yellow card")) return "YELLOW CARD";
    if (text.includes("red card")) return "RED CARD";
    if (text.includes("offside")) return "OFFSIDE";
    if (text.includes("substitution")) return "SUBSTITUTION";
    return "UPDATE";
  }, []);

  const lineupByPlayerId = useMemo(() => {
    const map = new Map();
    for (const lineup of lineups ?? []) {
      if (lineup?.player_id != null) map.set(lineup.player_id, lineup);
    }
    return map;
  }, [lineups]);

  const teamByParticipantId = useMemo(() => {
    const map = new Map();
    for (const p of participants ?? []) {
      if (p?.id != null) map.set(p.id, p);
    }
    return map;
  }, [participants]);

  const periodById = useMemo(() => {
    const map = new Map();
    for (const p of periods ?? []) {
      if (p?.id != null) map.set(p.id, p);
    }
    return map;
  }, [periods]);

  const eventTimelines = useMemo(() => {
    const parseScore = (scoreText) => {
      const parts = String(scoreText || "").split("-");
      if (parts.length !== 2) return null;
      const home = Number(parts[0]);
      const away = Number(parts[1]);
      if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
      return { home, away };
    };

    const scoreTimeline = (events ?? [])
      .map((e, idx) => {
        const parsed = parseScore(e?.result);
        const minute = Number(e?.minute);
        if (!parsed || !Number.isFinite(minute)) return null;
        return {
          idx,
          event: e,
          minute,
          extra: Number(e?.extra_minute ?? 0),
          timeKey: minute * 100 + Number(e?.extra_minute ?? 0),
          home: parsed.home,
          away: parsed.away,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.timeKey - b.timeKey || a.idx - b.idx);

    const goalLike = (e) => {
      const addLow = String(e?.addition || "").toLowerCase();
      return (
        e?.rescinded !== true &&
        (addLow.includes("goal") ||
          (addLow.includes("penalty") &&
            !addLow.includes("missed") &&
            !addLow.includes("awarded")))
      );
    };

    const goalTimeline = scoreTimeline.filter((entry) => goalLike(entry.event));

    return { scoreTimeline, goalTimeline };
  }, [events]);

  const commentsPrepared = useMemo(() => {
    const sorted = [...(comments ?? [])].sort(
      (a, b) => Number(b?.order ?? 0) - Number(a?.order ?? 0),
    );

    const summarizeEvent = (event) => {
      if (!event) return null;
      return {
        id: event?.id ?? null,
        minute: event?.minute ?? null,
        extra: event?.extra_minute ?? 0,
        participantId: event?.participant_id ?? null,
        player: event?.player_name ?? null,
        relatedPlayer: event?.related_player_name ?? null,
        addition: event?.addition ?? null,
        result: event?.result ?? null,
      };
    };

    const parseCommentMinute = (item) => {
      if (item?.minute != null && Number.isFinite(Number(item.minute))) {
        return Number(item.minute);
      }
      const text = String(item?.comment || "");
      const minuteMatch = text.match(/(\d{1,3})(?:st|nd|rd|th)?\s*minute/i);
      if (minuteMatch?.[1] != null) return Number(minuteMatch[1]);
      const markMatch = text.match(/(\d{1,3})\s*-\s*minute\s*mark/i);
      if (markMatch?.[1] != null) return Number(markMatch[1]);
      return null;
    };

    const parseCommentExtra = (item) => {
      if (
        item?.extra_minute != null &&
        Number.isFinite(Number(item.extra_minute))
      ) {
        return Number(item.extra_minute);
      }
      return 0;
    };

    const getCommentMinuteExtra = (item) => ({
      minute: parseCommentMinute(item),
      extra: parseCommentExtra(item),
    });

    const detectCommentTeam = (item) => {
      const text = String(item?.comment || "").toLowerCase();
      const homeName = String(homeTeam?.name || "").toLowerCase();
      const awayName = String(awayTeam?.name || "").toLowerCase();
      if (homeName && text.includes(homeName)) return homeTeam;
      if (awayName && text.includes(awayName)) return awayTeam;
      return null;
    };

    const getCommentTimeKey = (item) => {
      const parsed = getCommentMinuteExtra(item);
      if (parsed.minute == null) return null;
      return Number(parsed.minute) * 100 + Number(parsed.extra ?? 0);
    };

    const scoreAtOrBeforeKey = (timeKey) => {
      let found = null;
      for (const row of eventTimelines.scoreTimeline) {
        if (row.timeKey <= timeKey) found = row;
        else break;
      }
      return found
        ? { home: found.home, away: found.away }
        : { home: 0, away: 0 };
    };

    const parseEventScore = (resultText) => {
      const parts = String(resultText || "").split("-");
      if (parts.length !== 2) return null;
      const homeScore = Number(parts[0]);
      const awayScore = Number(parts[1]);
      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore))
        return null;
      return { home: homeScore, away: awayScore };
    };

    const findGoalEvent = (item) => {
      if (!item?.is_goal) return null;

      const commentKey = getCommentTimeKey(item);
      const text = String(item?.comment || "").toLowerCase();
      const parsed = getCommentMinuteExtra(item);
      const commentTeam = detectCommentTeam(item);

      const atSameTime = eventTimelines.goalTimeline.filter(
        (g) =>
          g?.event?.minute === parsed.minute &&
          Number(g?.event?.extra_minute ?? 0) === Number(parsed.extra ?? 0),
      );

      const getClosestCandidate = (
        candidateRows = eventTimelines.goalTimeline,
      ) => {
        const candidates = candidateRows;
        if (!candidates.length) return null;

        const ranked = candidates
          .map((g) => {
            const evt = g?.event;
            const eventPlayer = String(evt?.player_name || "").toLowerCase();
            const eventRelated = String(
              evt?.related_player_name || "",
            ).toLowerCase();
            const playerMatch = !!eventPlayer && text.includes(eventPlayer);
            const relatedMatch = !!eventRelated && text.includes(eventRelated);
            const teamMatch =
              !!commentTeam && evt?.participant_id === commentTeam?.id;
            const timeDiff =
              commentKey != null
                ? Math.abs((g?.timeKey ?? 0) - commentKey)
                : Number.MAX_SAFE_INTEGER;

            // Lower score is better: prioritize minute proximity first, then text/team hints.
            const score =
              timeDiff +
              (playerMatch ? -300 : 0) +
              (relatedMatch ? -220 : 0) +
              (teamMatch ? -120 : 0);

            return {
              g,
              score,
              timeDiff,
              playerMatch,
              relatedMatch,
              teamMatch,
            };
          })
          .sort((a, b) => a.score - b.score || a.timeDiff - b.timeDiff);

        const top = ranked[0];
        if (!top?.g?.event) return null;

        return {
          event: top.g.event,
          minuteDiff:
            top.timeDiff === Number.MAX_SAFE_INTEGER ? null : top.timeDiff,
          playerMatch: top.playerMatch,
          relatedMatch: top.relatedMatch,
          teamMatch: top.teamMatch,
          score: top.score,
        };
      };

      const teamFilteredSameTime = commentTeam
        ? atSameTime.filter((g) => g?.event?.participant_id === commentTeam?.id)
        : atSameTime;

      console.log("[Top5CommentaryGoalMatch] same-time candidates", {
        commentOrder: item?.order ?? null,
        commentMinute: parsed.minute,
        commentExtra: parsed.extra,
        commentText: item?.comment ?? "",
        detectedTeamId: commentTeam?.id ?? null,
        sameTimeCandidates: atSameTime.map((g) => summarizeEvent(g?.event)),
        teamFilteredCandidates: teamFilteredSameTime.map((g) =>
          summarizeEvent(g?.event),
        ),
      });

      if (teamFilteredSameTime.length) {
        const playerNameMatch = teamFilteredSameTime.find((g) =>
          text.includes(String(g?.event?.player_name || "").toLowerCase()),
        );
        const relatedNameMatch = teamFilteredSameTime.find((g) =>
          text.includes(
            String(g?.event?.related_player_name || "").toLowerCase(),
          ),
        );
        const picked =
          playerNameMatch?.event ||
          relatedNameMatch?.event ||
          teamFilteredSameTime[0]?.event ||
          null;
        console.log("[Top5CommentaryGoalMatch] same-time selected", {
          commentOrder: item?.order ?? null,
          selectedEvent: summarizeEvent(picked),
          reason: playerNameMatch
            ? "player-name-match"
            : relatedNameMatch
              ? "related-player-match"
              : "first-team-filtered-candidate",
        });
        return picked;
      }

      if (commentKey != null) {
        const nearBy = eventTimelines.goalTimeline.filter(
          (g) => Math.abs(g.timeKey - commentKey) <= 100,
        );

        const teamFilteredNearBy = commentTeam
          ? nearBy.filter((g) => g?.event?.participant_id === commentTeam?.id)
          : nearBy;

        console.log("[Top5CommentaryGoalMatch] nearby candidates", {
          commentOrder: item?.order ?? null,
          commentKey,
          commentText: item?.comment ?? "",
          detectedTeamId: commentTeam?.id ?? null,
          nearByCandidates: nearBy.map((g) => ({
            timeKey: g?.timeKey ?? null,
            event: summarizeEvent(g?.event),
          })),
          teamFilteredCandidates: teamFilteredNearBy.map((g) => ({
            timeKey: g?.timeKey ?? null,
            event: summarizeEvent(g?.event),
          })),
        });

        if (teamFilteredNearBy.length) {
          const playerNameMatch = teamFilteredNearBy.find((g) =>
            text.includes(String(g?.event?.player_name || "").toLowerCase()),
          );
          const relatedNameMatch = teamFilteredNearBy.find((g) =>
            text.includes(
              String(g?.event?.related_player_name || "").toLowerCase(),
            ),
          );
          const picked =
            playerNameMatch?.event ||
            relatedNameMatch?.event ||
            teamFilteredNearBy[0]?.event ||
            null;
          console.log("[Top5CommentaryGoalMatch] nearby selected", {
            commentOrder: item?.order ?? null,
            selectedEvent: summarizeEvent(picked),
            reason: playerNameMatch
              ? "player-name-match"
              : relatedNameMatch
                ? "related-player-match"
                : "first-nearby-team-candidate",
          });
          return picked;
        }

        if (nearBy.length) {
          const closestNearBy = getClosestCandidate(nearBy);
          if (closestNearBy?.event) {
            console.log("[Top5CommentaryGoalMatch] nearby selected", {
              commentOrder: item?.order ?? null,
              selectedEvent: summarizeEvent(closestNearBy.event),
              reason: "closest-nearby-candidate",
              minuteDiff: closestNearBy.minuteDiff,
              playerMatch: closestNearBy.playerMatch,
              relatedMatch: closestNearBy.relatedMatch,
              teamMatch: closestNearBy.teamMatch,
            });
            return closestNearBy.event;
          }
        }
      }

      console.log("[Top5CommentaryGoalMatch] no event match", {
        commentOrder: item?.order ?? null,
        commentMinute: parsed.minute,
        commentExtra: parsed.extra,
        commentText: item?.comment ?? "",
        closestCandidate: (() => {
          const closest = getClosestCandidate();
          if (!closest) return null;
          return {
            minuteDiff: closest.minuteDiff,
            playerMatch: closest.playerMatch,
            relatedMatch: closest.relatedMatch,
            teamMatch: closest.teamMatch,
            score: closest.score,
            event: summarizeEvent(closest.event),
          };
        })(),
      });
      return null;
    };

    const findScoreAtComment = (item) => {
      if (!eventTimelines.scoreTimeline.length) return { home: 0, away: 0 };

      const parsed = getCommentMinuteExtra(item);
      if (parsed.minute == null) {
        const text = String(item?.comment || "").toLowerCase();
        if (
          text.includes("opening half") ||
          text.includes("underway") ||
          text.includes("begins")
        ) {
          return { home: 0, away: 0 };
        }
        const last =
          eventTimelines.scoreTimeline[eventTimelines.scoreTimeline.length - 1];
        return last
          ? { home: last.home, away: last.away }
          : { home: 0, away: 0 };
      }

      const key = Number(parsed.minute) * 100 + Number(parsed.extra ?? 0);
      return scoreAtOrBeforeKey(key);
    };

    return sorted.map((item) => {
      const parsed = getCommentMinuteExtra(item);
      const type = getCommentType(item);
      const goalEvent = findGoalEvent(item);
      const commentTeam = detectCommentTeam(item);
      const timeKey = getCommentTimeKey(item);
      const goalEventScore = goalEvent
        ? parseEventScore(goalEvent?.result)
        : null;
      const scoreAt =
        type === "GOAL" && goalEventScore
          ? goalEventScore
          : findScoreAtComment(item);
      const scoreBefore =
        timeKey != null ? scoreAtOrBeforeKey(timeKey - 1) : scoreAt;

      const inferredGoalSide =
        scoreAt && scoreBefore
          ? scoreAt.home > scoreBefore.home
            ? "home"
            : scoreAt.away > scoreBefore.away
              ? "away"
              : null
          : null;

      const fallbackGoalTeam =
        inferredGoalSide === "home"
          ? homeTeam
          : inferredGoalSide === "away"
            ? awayTeam
            : commentTeam;

      const team = goalEvent
        ? teamByParticipantId.get(goalEvent.participant_id) || null
        : fallbackGoalTeam;
      const lineup = goalEvent
        ? lineupByPlayerId.get(goalEvent.player_id) || null
        : null;
      const relatedLineup = goalEvent
        ? lineupByPlayerId.get(goalEvent.related_player_id) || null
        : null;
      const scoreTeamSide =
        goalEvent?.participant_id === homeTeam?.id
          ? "home"
          : goalEvent?.participant_id === awayTeam?.id
            ? "away"
            : commentTeam?.id === homeTeam?.id
              ? "home"
              : commentTeam?.id === awayTeam?.id
                ? "away"
                : inferredGoalSide;

      if (type === "GOAL") {
        console.log("[Top5CommentaryGoalMatch] final mapping", {
          commentOrder: item?.order ?? null,
          commentMinute: parsed.minute,
          commentExtra: parsed.extra,
          commentText: item?.comment ?? "",
          matchedGoalEvent: summarizeEvent(goalEvent),
          scoreAt,
          scoreBefore,
          inferredGoalSide,
          scoreTeamSide,
          resolvedTeamId: team?.id ?? null,
          lineupPlayerId: lineup?.player_id ?? null,
          relatedLineupPlayerId: relatedLineup?.player_id ?? null,
        });
      }

      return {
        item,
        commentMinute: parsed.minute,
        commentExtra: parsed.extra,
        type,
        goalEvent,
        scoreAt,
        team,
        lineup,
        relatedLineup,
        scoreTeamSide,
      };
    });
  }, [
    comments,
    getCommentType,
    eventTimelines,
    homeTeam,
    awayTeam,
    lineupByPlayerId,
    teamByParticipantId,
  ]);

  const filterTypes = useMemo(() => {
    const all = ["ALL"];
    const found = new Set(commentsPrepared.map((x) => x.type));
    const preferredOrder = [
      "GOAL",
      "SUBSTITUTION",
      "YELLOW CARD",
      "RED CARD",
      "CORNER",
      "SHOT ATTEMPT",
      "OFFSIDE",
      "UPDATE",
    ];

    for (const t of preferredOrder) {
      if (found.has(t)) all.push(t);
    }
    for (const t of found) {
      if (!all.includes(t)) all.push(t);
    }
    return all;
  }, [commentsPrepared]);

  useEffect(() => {
    if (!filterTypes.includes(activeType)) setActiveType("ALL");
  }, [filterTypes, activeType]);

  const visibleItems = useMemo(() => {
    if (activeType === "ALL") return commentsPrepared;
    return commentsPrepared.filter((entry) => entry.type === activeType);
  }, [commentsPrepared, activeType]);

  const closeGoalPlayerModal = () => setSelectedGoalEntry(null);
  const closeGoalShareModal = () => setGoalSharePayload(null);

  const getRelatedParticipantId = (goalEvent) =>
    goalEvent?.relatedparticipant_id ??
    goalEvent?.related_participant_id ??
    goalEvent?.relatedParticipantId ??
    null;

  const resolveGoalPlayerMeta = (entry, kind = "player") => {
    const isRelated = kind === "related";
    const goalEvent = entry?.goalEvent ?? null;
    const lineup = isRelated
      ? (entry?.relatedLineup ?? null)
      : (entry?.lineup ?? null);
    const fallbackName = isRelated
      ? goalEvent?.related_player_name
      : goalEvent?.player_name;
    const playerId =
      (isRelated ? goalEvent?.related_player_id : goalEvent?.player_id) ??
      lineup?.player_id ??
      null;

    const participantId = isRelated
      ? (getRelatedParticipantId(goalEvent) ??
        lineup?.team_id ??
        goalEvent?.participant_id)
      : (goalEvent?.participant_id ?? lineup?.team_id);

    const team =
      (participantId != null ? teamByParticipantId.get(participantId) : null) ??
      (lineup?.team_id != null
        ? teamByParticipantId.get(lineup.team_id)
        : null) ??
      (!isRelated ? (entry?.team ?? null) : null);

    return { playerId, lineup, team, fallbackName };
  };

  const openFromGoalPlayer = (meta) => {
    if (!meta?.playerId) return;
    setSelectedGoalEntry(null);
    onPlayerPress?.({
      playerId: meta.playerId,
      lineup: meta.lineup ?? null,
      player: meta.lineup?.player ?? null,
      team: meta.team ?? null,
    });
  };

  const openGoalShareFromCommentary = useCallback(
    (entry) => {
      if (!entry?.goalEvent) return;

      const goalEvent = entry.goalEvent;
      const playerMeta = resolveGoalPlayerMeta(entry, "player");
      const relatedMeta = resolveGoalPlayerMeta(entry, "related");
      const lineup = playerMeta?.lineup ?? null;
      const player = lineup?.player ?? null;
      const playerName =
        player?.name ||
        `${player?.firstname ?? ""} ${player?.lastname ?? ""}`.trim() ||
        goalEvent?.player_name ||
        "Unknown Player";
      const playerInitials =
        [player?.firstname?.[0], player?.lastname?.[0]]
          .filter(Boolean)
          .join("")
          .toUpperCase() ||
        playerName
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0])
          .join("")
          .toUpperCase() ||
        "?";

      const commentText = String(entry?.item?.comment || "");
      const isOwnGoal = isOwnGoalEvent(goalEvent, commentText);
      const isPenalty = isPenaltyGoalEvent(goalEvent);
      const scoreAfter =
        parseEventScore(goalEvent?.result) ||
        (entry?.scoreAt
          ? {
              home: Number(entry.scoreAt.home ?? 0),
              away: Number(entry.scoreAt.away ?? 0),
            }
          : { home: null, away: null });

      const scoringSide = entry?.scoreTeamSide ?? null;
      const scoringTeam =
        scoringSide === "home"
          ? homeTeam
          : scoringSide === "away"
            ? awayTeam
            : (entry?.team ?? playerMeta?.team ?? null);
      const ownGoalerTeam =
        isOwnGoal && scoringSide
          ? scoringSide === "home"
            ? awayTeam
            : homeTeam
          : null;

      const displayTeam = ownGoalerTeam || playerMeta?.team || scoringTeam;
      const teamColor = getResolvedTeamColor(displayTeam);

      const periodRaw = String(
        periodById.get(goalEvent?.period_id)?.description || "",
      ).toLowerCase();
      const periodLabel =
        periodRaw === "1st-half"
          ? "1st Half"
          : periodRaw === "2nd-half"
            ? "2nd Half"
            : periodRaw.replace(/-/g, " ");

      const relatedPlayer = relatedMeta?.lineup?.player ?? null;
      const assistName =
        relatedPlayer?.name ||
        `${relatedPlayer?.firstname ?? ""} ${relatedPlayer?.lastname ?? ""}`.trim() ||
        relatedMeta?.fallbackName ||
        goalEvent?.related_player_name ||
        null;

      const payload = {
        scorerName: playerName,
        scorerInitials: playerInitials,
        playerImageUri:
          player?.image_path &&
          !String(player.image_path).includes("placeholder")
            ? player.image_path
            : null,
        teamName: displayTeam?.name || "Team",
        teamAbbr: displayTeam?.short_code || "",
        teamLogoUri: displayTeam?.image_path || null,
        teamColor,
        homeLogo: homeTeam?.image_path || null,
        awayLogo: awayTeam?.image_path || null,
        minuteLabel: formatGoalMinute(
          entry?.commentMinute,
          entry?.commentExtra,
        ),
        periodLabel,
        comment: commentText,
        isPenalty,
        isOwnGoal,
        assistName,
        scoreAfter,
        goalSituation: deriveGoalSituation(scoreAfter, scoringSide),
        statsItems: buildGoalShareStats(lineup, isOwnGoal),
      };

      setSelectedGoalEntry(null);
      setTimeout(() => setGoalSharePayload(payload), 70);
    },
    [resolveGoalPlayerMeta, homeTeam, awayTeam, getResolvedTeamColor],
  );

  const renderGoalPlayerSection = (title, meta) => {
    if (!meta?.playerId && !meta?.fallbackName) return null;

    const player = meta?.lineup?.player ?? null;
    const fullName =
      player?.name ||
      `${player?.firstname ?? ""} ${player?.lastname ?? ""}`.trim() ||
      String(meta?.fallbackName || "Unknown Player");
    const firstName =
      player?.firstname ||
      fullName.split(" ").slice(0, -1).join(" ") ||
      fullName;
    const lastName =
      player?.lastname || fullName.split(" ").slice(-1).join(" ") || fullName;

    const effectiveTeam = meta?.displayTeam ?? meta?.team;
    const teamColor = getResolvedTeamColor(effectiveTeam);
    const imageUri =
      player?.image_path && !String(player.image_path).includes("placeholder")
        ? player.image_path
        : null;
    const initials =
      [player?.firstname?.[0], player?.lastname?.[0]]
        .filter(Boolean)
        .join("")
        .toUpperCase() ||
      fullName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase() ||
      "?";

    return (
      <View
        key={`${title}:${meta?.playerId ?? fullName}`}
        style={[cmStyles.goalPopupSection, { borderColor: theme.border }]}
      >
        <Text
          style={[
            cmStyles.goalPopupSectionTitle,
            { color: theme.textSecondary },
          ]}
        >
          {title}
        </Text>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => openFromGoalPlayer(meta)}
          disabled={!meta?.playerId || !onPlayerPress}
          style={[
            cmStyles.goalPopupPlayerRow,
            { backgroundColor: theme.surfaceSecondary },
          ]}
        >
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={[
                cmStyles.goalPopupAvatar,
                {
                  backgroundColor: `${teamColor}30`,
                  borderColor: teamColor,
                },
              ]}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View
              style={[
                cmStyles.goalPopupAvatar,
                cmStyles.goalPopupAvatarFallback,
                {
                  backgroundColor: `${teamColor}30`,
                  borderColor: teamColor,
                },
              ]}
            >
              <Text
                style={[
                  cmStyles.goalPopupInitials,
                  { color: getTextOnColor(teamColor) },
                ]}
              >
                {initials}
              </Text>
            </View>
          )}

          <View style={cmStyles.goalPopupNameCol}>
            <Text
              style={[
                cmStyles.goalPopupFirstName,
                { color: theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {firstName || " "}
            </Text>
            <Text
              style={[cmStyles.goalPopupLastName, { color: theme.text }]}
              numberOfLines={1}
            >
              {lastName}
            </Text>
          </View>

          {effectiveTeam?.image_path ? (
            <Image
              source={{ uri: effectiveTeam.image_path }}
              style={cmStyles.goalPopupTeamLogo}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          ) : (
            <View
              style={[
                cmStyles.goalPopupTeamLogoFallback,
                { backgroundColor: `${teamColor}30` },
              ]}
            >
              <Text
                style={[
                  cmStyles.goalPopupTeamLogoFallbackText,
                  { color: teamColor },
                ]}
              >
                {(effectiveTeam?.name || "?")[0]?.toUpperCase?.() || "?"}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  if (!commentsPrepared.length) return null;

  const renderScore = (entry, colorOverride = null) => {
    if (!entry?.scoreAt) return null;
    const isGoal = entry?.type === "GOAL";
    const textColor = colorOverride || theme.text;
    return (
      <Text style={[cmStyles.scoreText, { color: textColor }]}>
        <Text
          style={
            isGoal && entry?.scoreTeamSide === "home"
              ? [cmStyles.scoreTextBold, { color: textColor }]
              : [cmStyles.scoreTextNormal, { color: textColor }]
          }
        >
          {entry.scoreAt.home}
        </Text>
        {" - "}
        <Text
          style={
            isGoal && entry?.scoreTeamSide === "away"
              ? [cmStyles.scoreTextBold, { color: textColor }]
              : [cmStyles.scoreTextNormal, { color: textColor }]
          }
        >
          {entry.scoreAt.away}
        </Text>
      </Text>
    );
  };

  return (
    <View style={cmStyles.sectionWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={cmStyles.filterRow}
      >
        {filterTypes.map((type) => {
          const active = activeType === type;
          return (
            <TouchableOpacity
              key={type}
              activeOpacity={0.8}
              onPress={() => setActiveType(type)}
              style={[
                cmStyles.filterChip,
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
                  cmStyles.filterChipText,
                  { color: active ? theme.text : theme.textSecondary },
                ]}
              >
                {type}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={cmStyles.cardsWrap}>
        {visibleItems.map((entry, idx) => {
          const c = entry.item;
          const hasMinute = entry?.commentMinute != null;
          const hasExtra = Number(entry?.commentExtra ?? 0) > 0;
          const teamColor = getResolvedTeamColor(entry?.team);
          const goalBg = `${teamColor}50`;
          const goalTextColor = getTextOnColor(teamColor);
          const ownGoalForComment =
            entry.type === "GOAL" &&
            !!entry.goalEvent &&
            isOwnGoalEvent(entry.goalEvent, c?.comment || "");
          const ownGoalDisplayTeam = ownGoalForComment
            ? entry?.scoreTeamSide === "home"
              ? awayTeam
              : entry?.scoreTeamSide === "away"
                ? homeTeam
                : null
            : null;
          const goalPlayerColor = ownGoalDisplayTeam
            ? getResolvedTeamColor(ownGoalDisplayTeam)
            : teamColor;

          let cardBorderColor = theme.border;
          if (entry.type === "YELLOW CARD") cardBorderColor = "#facc15";
          if (entry.type === "RED CARD") cardBorderColor = "#d62828";
          if (entry.type === "GOAL") cardBorderColor = teamColor;

          const cardBackgroundColor =
            entry.type === "GOAL" ? goalBg : theme.surface;

          const goalPlayer = entry?.lineup?.player || null;
          const goalPlayerName =
            goalPlayer?.name ||
            `${goalPlayer?.firstname ?? ""} ${goalPlayer?.lastname ?? ""}`.trim() ||
            entry?.goalEvent?.player_name ||
            "Unknown Player";
          const goalRelated =
            entry?.relatedLineup?.player?.name ||
            `${entry?.relatedLineup?.player?.firstname ?? ""} ${entry?.relatedLineup?.player?.lastname ?? ""}`.trim() ||
            entry?.goalEvent?.related_player_name ||
            null;
          const goalInfo = entry?.goalEvent?.info || null;
          const goalSubtitle = goalRelated
            ? `Assisted by ${goalRelated}`
            : goalInfo || null;

          const goalImgUri =
            goalPlayer?.image_path &&
            !goalPlayer.image_path.includes("placeholder")
              ? goalPlayer.image_path
              : null;
          const goalInitial = (goalPlayerName || "?")[0].toUpperCase();
          const goalRating = entry?.lineup
            ? getLineupRating(entry.lineup)
            : null;
          const goalPos = motmGetPosAbbr(
            entry?.lineup?.detailedposition?.name ??
              entry?.lineup?.position?.name ??
              null,
          );

          return (
            <View
              key={`${c?.id ?? idx}:${c?.order ?? idx}`}
              style={cmStyles.rowWrap}
            >
              <View style={cmStyles.timeCol}>
                {hasMinute ? (
                  <>
                    <Text style={[cmStyles.minuteText, { color: theme.text }]}>
                      {entry.commentMinute}'
                    </Text>
                    {hasExtra ? (
                      <Text
                        style={[
                          cmStyles.extraMinuteText,
                          { color: theme.textSecondary },
                        ]}
                      >
                        +{entry.commentExtra}'
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </View>

              <TouchableOpacity
                style={[
                  cmStyles.card,
                  {
                    backgroundColor: cardBackgroundColor,
                    borderColor: cardBorderColor,
                  },
                ]}
                activeOpacity={
                  entry.type === "GOAL" && entry.goalEvent ? 0.8 : 1
                }
                disabled={!(entry.type === "GOAL" && entry.goalEvent)}
                onPress={() =>
                  entry.type === "GOAL" && entry.goalEvent
                    ? setSelectedGoalEntry(entry)
                    : null
                }
              >
                <View style={cmStyles.cardHeaderRow}>
                  <View style={cmStyles.cardHeaderLeft}>
                    {entry.type === "GOAL" ? (
                      <MaterialCommunityIcons
                        name="soccer"
                        size={14}
                        color={goalTextColor}
                      />
                    ) : entry.type === "YELLOW CARD" ? (
                      <MaterialCommunityIcons
                        name="card"
                        size={14}
                        color="#facc15"
                        style={cmStyles.headerCardIcon}
                      />
                    ) : entry.type === "RED CARD" ? (
                      <MaterialCommunityIcons
                        name="card"
                        size={14}
                        color="#d62828"
                        style={cmStyles.headerCardIcon}
                      />
                    ) : null}

                    <Text
                      style={[
                        cmStyles.cardHeaderTitle,
                        {
                          color:
                            entry.type === "GOAL" ? goalTextColor : theme.text,
                        },
                      ]}
                    >
                      {entry.type}
                    </Text>
                  </View>
                  {renderScore(
                    entry,
                    entry.type === "GOAL" ? goalTextColor : theme.text,
                  )}
                </View>

                <Text
                  style={[
                    cmStyles.commentText,
                    {
                      color:
                        entry.type === "GOAL"
                          ? goalTextColor
                          : theme.textSecondary,
                    },
                  ]}
                >
                  {c?.comment || ""}
                </Text>

                {entry.type === "GOAL" && entry.goalEvent ? (
                  <View style={cmStyles.goalPlayerRow}>
                    <View style={cmStyles.goalAvatarWrap}>
                      {goalImgUri ? (
                        <Image
                          source={{ uri: goalImgUri }}
                          style={[
                            cmStyles.goalAvatar,
                            {
                              backgroundColor: `${goalPlayerColor}30`,
                              borderColor: goalPlayerColor,
                            },
                          ]}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                        />
                      ) : (
                        <View
                          style={[
                            cmStyles.goalAvatar,
                            {
                              backgroundColor: `${goalPlayerColor}30`,
                              borderColor: goalPlayerColor,
                              alignItems: "center",
                              justifyContent: "center",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              cmStyles.goalAvatarInitial,
                              { color: getTextOnColor(goalPlayerColor) },
                            ]}
                          >
                            {goalInitial}
                          </Text>
                        </View>
                      )}

                      {goalRating != null ? (
                        <View
                          style={[
                            cmStyles.goalRatingBadge,
                            { backgroundColor: motmGetRatingColor(goalRating) },
                          ]}
                        >
                          <Text
                            style={[
                              cmStyles.goalRatingText,
                              {
                                color: motmTextOnBg(
                                  motmGetRatingColor(goalRating),
                                ),
                              },
                            ]}
                          >
                            {goalRating.toFixed(1)}
                          </Text>
                        </View>
                      ) : null}

                      {!!goalPos && (
                        <View
                          style={[
                            cmStyles.goalPosBadge,
                            { backgroundColor: theme.surfaceSecondary },
                          ]}
                        >
                          <Text
                            style={[
                              cmStyles.goalPosText,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {goalPos}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={cmStyles.goalPlayerTextWrap}>
                      <Text
                        style={[
                          cmStyles.goalPlayerName,
                          { color: goalTextColor },
                        ]}
                        numberOfLines={1}
                      >
                        {goalPlayerName}
                      </Text>
                      {goalSubtitle ? (
                        <Text
                          style={[
                            cmStyles.goalPlayerSub,
                            { color: goalTextColor },
                          ]}
                          numberOfLines={2}
                        >
                          {goalSubtitle}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <Modal
        visible={!!selectedGoalEntry}
        transparent
        animationType="fade"
        onRequestClose={closeGoalPlayerModal}
      >
        <View style={cmStyles.goalPopupOverlay}>
          <TouchableOpacity
            style={cmStyles.goalPopupBackdropTap}
            activeOpacity={1}
            onPress={closeGoalPlayerModal}
          />

          <View
            style={[
              cmStyles.goalPopupCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View
              style={[
                cmStyles.goalPopupHeader,
                { borderBottomColor: theme.border },
              ]}
            >
              <Text
                style={[cmStyles.goalPopupHeaderTitle, { color: theme.text }]}
              >
                Goal Players
              </Text>
              <TouchableOpacity
                onPress={closeGoalPlayerModal}
                style={[
                  cmStyles.goalPopupCloseBtn,
                  { backgroundColor: theme.error },
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    cmStyles.goalPopupCloseText,
                    { color: theme.textSecondary },
                  ]}
                >
                  ✕
                </Text>
              </TouchableOpacity>
            </View>

            <View style={cmStyles.goalPopupBody}>
              {(() => {
                if (!selectedGoalEntry) return null;
                const playerMeta = resolveGoalPlayerMeta(
                  selectedGoalEntry,
                  "player",
                );
                const ownGoal = isOwnGoalEvent(
                  selectedGoalEntry?.goalEvent,
                  selectedGoalEntry?.item?.comment || "",
                );
                const ownGoalDisplayTeam = ownGoal
                  ? selectedGoalEntry?.scoreTeamSide === "home"
                    ? awayTeam
                    : selectedGoalEntry?.scoreTeamSide === "away"
                      ? homeTeam
                      : null
                  : null;
                const effectivePlayerMeta = playerMeta
                  ? {
                      ...playerMeta,
                      displayTeam: ownGoalDisplayTeam || playerMeta.team,
                    }
                  : null;
                return effectivePlayerMeta
                  ? renderGoalPlayerSection("Player", effectivePlayerMeta)
                  : null;
              })()}
              {selectedGoalEntry
                ? renderGoalPlayerSection(
                    "Related Player",
                    resolveGoalPlayerMeta(selectedGoalEntry, "related"),
                  )
                : null}

              {selectedGoalEntry?.goalEvent ? (
                <View
                  style={[
                    cmStyles.goalPopupSection,
                    { borderColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      cmStyles.goalPopupSectionTitle,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Goal Share Card
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() =>
                      openGoalShareFromCommentary(selectedGoalEntry)
                    }
                    style={[
                      cmStyles.goalShareActionBtn,
                      {
                        backgroundColor: theme.surfaceSecondary,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name="share-social-outline"
                      size={16}
                      color={theme.text}
                    />
                    <Text
                      style={[
                        cmStyles.goalShareActionText,
                        { color: theme.text },
                      ]}
                    >
                      Open Goal Share Card
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      <GoalShareCardModal
        visible={!!goalSharePayload}
        onClose={closeGoalShareModal}
        payload={goalSharePayload}
        theme={theme}
        colors={colors}
      />
    </View>
  );
};

const BallSection = ({
  ballCoordinates,
  periods,
  home,
  away,
  homeColor,
  awayColor,
  theme,
  colors,
}) => {
  const [selectedWindow, setSelectedWindow] = useState("all");
  const [selectedPeriod, setSelectedPeriod] = useState("all");

  const windowOptions = ["100", "250", "500", "all"];

  const parsedCoords = useMemo(
    () =>
      (ballCoordinates ?? [])
        .map((coord) => normalizeBallPoint(coord))
        .filter(Boolean),
    [ballCoordinates],
  );

  const periodOptions = useMemo(() => {
    const labelsById = new Map(
      (periods ?? []).map((p) => [String(p?.id), formatPeriodLabel(p)]),
    );

    const idsFromData = new Set(
      parsedCoords
        .map((p) => p?.periodId)
        .filter((id) => id != null)
        .map((id) => String(id)),
    );

    const merged = [];
    for (const id of idsFromData) {
      merged.push({
        value: id,
        label: labelsById.get(id) || `Period ${id}`,
      });
    }

    return [{ value: "all", label: "All Periods" }, ...merged];
  }, [periods, parsedCoords]);

  const periodFilteredCoords = useMemo(() => {
    if (selectedPeriod === "all") return parsedCoords;
    return parsedCoords.filter((p) => String(p?.periodId) === selectedPeriod);
  }, [parsedCoords, selectedPeriod]);

  const scopedCoords = useMemo(() => {
    if (selectedWindow === "all") return periodFilteredCoords;
    const n = Number(selectedWindow);
    if (!Number.isFinite(n) || n <= 0) return periodFilteredCoords;
    return periodFilteredCoords.slice(-n);
  }, [periodFilteredCoords, selectedWindow]);

  const zoneDistribution = useMemo(
    () => calculateZoneDistribution(scopedCoords),
    [scopedCoords],
  );

  const trailPoints = scopedCoords;
  const trailUniqueSpots = useMemo(() => {
    const buckets = new Set(
      trailPoints.map(
        (p) => `${Math.round(p.xNorm * 100)}:${Math.round(p.yNorm * 100)}`,
      ),
    );
    return buckets.size;
  }, [trailPoints]);
  const heatmap = useMemo(() => buildBallHeatmap(scopedCoords), [scopedCoords]);

  return (
    <View style={{ paddingTop: 6 }}>
      <View
        style={[
          ballStyles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View
          style={[
            ballStyles.headerRow,
            {
              borderBottomColor: theme.border,
              backgroundColor: theme.surfaceSecondary,
            },
          ]}
        >
          <Text style={[ballStyles.headerTitle, { color: theme.text }]}>
            Ball Tracking
          </Text>
          <Text style={[ballStyles.headerMeta, { color: theme.textSecondary }]}>
            Entries: {scopedCoords.length} / {parsedCoords.length}
          </Text>
        </View>

        {parsedCoords.length === 0 ? (
          <View style={ballStyles.emptyWrap}>
            <Text
              style={[ballStyles.emptyText, { color: theme.textSecondary }]}
            >
              No ball coordinate data for this fixture.
            </Text>
          </View>
        ) : (
          <>
            <View
              style={[
                ballStyles.filtersWrap,
                {
                  borderBottomColor: theme.border,
                  backgroundColor: theme.surface,
                },
              ]}
            >
              <Text
                style={[ballStyles.filterLabel, { color: theme.textSecondary }]}
              >
                Period
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={ballStyles.filterRow}
              >
                {periodOptions.map((opt) => {
                  const active = selectedPeriod === opt.value;
                  return (
                    <TouchableOpacity
                      key={`period_${opt.value}`}
                      style={[
                        ballStyles.filterChip,
                        {
                          borderColor: active ? colors.primary : theme.border,
                          backgroundColor: active
                            ? `${colors.primary}20`
                            : theme.surface,
                        },
                      ]}
                      onPress={() => setSelectedPeriod(opt.value)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          ballStyles.filterChipText,
                          {
                            color: active
                              ? colors.primary
                              : theme.textSecondary,
                          },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text
                style={[ballStyles.filterLabel, { color: theme.textSecondary }]}
              >
                Window
              </Text>
              <View style={ballStyles.filterRow}>
                {windowOptions.map((opt) => {
                  const active = selectedWindow === opt;
                  return (
                    <TouchableOpacity
                      key={`window_${opt}`}
                      style={[
                        ballStyles.filterChip,
                        {
                          borderColor: active ? colors.primary : theme.border,
                          backgroundColor: active
                            ? `${colors.primary}20`
                            : theme.surface,
                        },
                      ]}
                      onPress={() => setSelectedWindow(opt)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          ballStyles.filterChipText,
                          {
                            color: active
                              ? colors.primary
                              : theme.textSecondary,
                          },
                        ]}
                      >
                        {opt === "all" ? "All" : opt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View
              style={[
                ballStyles.pitch,
                { backgroundColor: "#2d5a2d", borderColor: "#6b7280" },
              ]}
            >
              <View style={ballStyles.pitchOutline} />
              <View style={ballStyles.pitchMidline} />
              <View style={ballStyles.pitchCenterCircle} />
              <View style={ballStyles.pitchLeftBox} />
              <View style={ballStyles.pitchRightBox} />

              {trailPoints.map((coord, idx, arr) => {
                const isLatest = idx === arr.length - 1;
                const dotColor =
                  coord.zone === "Defensive third"
                    ? homeColor
                    : coord.zone === "Middle third"
                      ? "#f59e0b"
                      : awayColor;
                return (
                  <View
                    key={`ball_${coord.id}_${idx}`}
                    style={[
                      ballStyles.dot,
                      {
                        left: `${coord.xNorm * 100}%`,
                        top: `${coord.yNorm * 100}%`,
                        backgroundColor: dotColor,
                        width: isLatest ? 8 : 5,
                        height: isLatest ? 8 : 5,
                        borderRadius: isLatest ? 4 : 2.5,
                        opacity: isLatest ? 1 : 0.45,
                        transform: [
                          { translateX: isLatest ? -4 : -2.5 },
                          { translateY: isLatest ? -4 : -2.5 },
                        ],
                      },
                    ]}
                  />
                );
              })}
            </View>

            <Text
              style={[ballStyles.trailHintText, { color: theme.textTertiary }]}
            >
              Showing {trailPoints.length} points for selected filters. Many
              overlap at the same locations (about {trailUniqueSpots} unique
              spots).
            </Text>

            <View
              style={[
                ballStyles.heatmapWrap,
                {
                  borderTopColor: theme.border,
                  borderBottomColor: theme.border,
                  backgroundColor: theme.surfaceSecondary,
                },
              ]}
            >
              <Text style={[ballStyles.heatmapTitle, { color: theme.text }]}>
                Ball Concentration Heatmap
              </Text>

              <View
                style={[
                  ballStyles.heatPitch,
                  {
                    backgroundColor: "#1f3d1f",
                    borderColor: "#5b6470",
                  },
                ]}
              >
                <View style={ballStyles.heatGrid}>
                  {heatmap.cells.map((intensity, idx) => (
                    <View
                      key={`heat_${idx}`}
                      style={{
                        width: `${100 / heatmap.cols}%`,
                        height: `${100 / heatmap.rows}%`,
                        backgroundColor:
                          intensity > 0
                            ? getHeatColor(intensity)
                            : "rgba(0,0,0,0)",
                      }}
                    />
                  ))}
                </View>

                <View style={ballStyles.pitchOutline} />
                <View style={ballStyles.pitchMidline} />
                <View style={ballStyles.pitchCenterCircle} />
                <View style={ballStyles.pitchLeftBox} />
                <View style={ballStyles.pitchRightBox} />
              </View>

              <View style={ballStyles.heatLegendRow}>
                <Text
                  style={[
                    ballStyles.heatLegendText,
                    { color: theme.textSecondary },
                  ]}
                >
                  Low
                </Text>
                <View style={ballStyles.heatLegendScale}>
                  {Array.from({ length: 10 }).map((_, idx) => {
                    const t = idx / 9;
                    return (
                      <View
                        key={`heat_scale_${idx}`}
                        style={[
                          ballStyles.heatLegendSwatch,
                          { backgroundColor: getHeatColor(t) },
                        ]}
                      />
                    );
                  })}
                </View>
                <Text
                  style={[
                    ballStyles.heatLegendText,
                    { color: theme.textSecondary },
                  ]}
                >
                  High
                </Text>
              </View>
            </View>

            <View style={ballStyles.zoneRow}>
              <View
                style={[
                  ballStyles.zoneCard,
                  { backgroundColor: `${homeColor}20` },
                ]}
              >
                <Text
                  style={[ballStyles.zoneLabel, { color: theme.textSecondary }]}
                >
                  Defensive
                </Text>
                <Text style={[ballStyles.zoneValue, { color: homeColor }]}>
                  {zoneDistribution.defensive.toFixed(1)}%
                </Text>
              </View>
              <View
                style={[
                  ballStyles.zoneCard,
                  { backgroundColor: "rgba(245,158,11,0.2)" },
                ]}
              >
                <Text
                  style={[ballStyles.zoneLabel, { color: theme.textSecondary }]}
                >
                  Middle
                </Text>
                <Text style={[ballStyles.zoneValue, { color: "#d97706" }]}>
                  {zoneDistribution.middle.toFixed(1)}%
                </Text>
              </View>
              <View
                style={[
                  ballStyles.zoneCard,
                  { backgroundColor: `${awayColor}20` },
                ]}
              >
                <Text
                  style={[ballStyles.zoneLabel, { color: theme.textSecondary }]}
                >
                  Attacking
                </Text>
                <Text style={[ballStyles.zoneValue, { color: awayColor }]}>
                  {zoneDistribution.attacking.toFixed(1)}%
                </Text>
              </View>
            </View>

            <View style={ballStyles.legendRow}>
              <View style={ballStyles.legendItem}>
                <View
                  style={[ballStyles.legendDot, { backgroundColor: homeColor }]}
                />
                <Text
                  style={[
                    ballStyles.legendText,
                    { color: theme.textSecondary },
                  ]}
                >
                  {home?.short_code || home?.name || "Home"}
                </Text>
              </View>
              <View style={ballStyles.legendItem}>
                <View
                  style={[ballStyles.legendDot, { backgroundColor: "#f59e0b" }]}
                />
                <Text
                  style={[
                    ballStyles.legendText,
                    { color: theme.textSecondary },
                  ]}
                >
                  Middle
                </Text>
              </View>
              <View style={ballStyles.legendItem}>
                <View
                  style={[ballStyles.legendDot, { backgroundColor: awayColor }]}
                />
                <Text
                  style={[
                    ballStyles.legendText,
                    { color: theme.textSecondary },
                  ]}
                >
                  {away?.short_code || away?.name || "Away"}
                </Text>
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );
};

const GoalShareCardModal = ({ visible, onClose, payload, theme, colors }) => {
  const shareCardRef = useRef(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!visible) setSharing(false);
  }, [visible]);

  const handleShare = useCallback(async () => {
    if (sharing || !shareCardRef.current) return;
    try {
      setSharing(true);
      await new Promise((resolve) => setTimeout(resolve, 260));
      const uri = await shareCardRef.current.capture();
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: "Share Goal",
      });
    } catch (error) {
      console.error("Error sharing goal card:", error);
    } finally {
      setSharing(false);
    }
  }, [sharing]);

  const teamColor = payload?.teamColor || colors.primary;
  const textOnTeam = getTextOnColor(teamColor);
  const homeScore = payload?.scoreAfter?.home ?? "-";
  const awayScore = payload?.scoreAfter?.away ?? "-";
  const homeBold = Number(homeScore) > Number(awayScore);
  const awayBold = Number(awayScore) > Number(homeScore);
  const cardWidth = Math.min(width - 48, 540);
  const playerImageUri = payload?.playerImageUri || null;
  const scorerName = payload?.scorerName || "Unknown Player";
  const scorerInitials =
    payload?.scorerInitials ||
    scorerName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() ||
    "?";
  const isOwnGoal = !!payload?.isOwnGoal;
  const goalType = isOwnGoal
    ? "Own Goal"
    : payload?.isPenalty
      ? "Penalty Goal"
      : "Goal";
  const goalSituation = payload?.goalSituation || "";
  const teamLogoUri = payload?.teamLogoUri || null;
  const teamName = payload?.teamName || payload?.teamAbbr || "Team";
  const FIELD_LEFT_PANEL_W = Math.round(cardWidth * 0.41);
  const FIELD_SCALE = (FIELD_LEFT_PANEL_W - 12) / 120;

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={gscStyles.overlay}>
        <TouchableOpacity
          style={gscStyles.backdropTap}
          activeOpacity={1}
          onPress={onClose}
        />

        <View style={gscStyles.centerWrap}>
          <ViewShot
            ref={shareCardRef}
            options={{ format: "png", quality: 1 }}
            style={{ overflow: "hidden" }}
          >
            <View
              style={[
                gscStyles.card,
                {
                  width: cardWidth,
                  backgroundColor: theme.surface,
                },
              ]}
            >
              <View
                style={[
                  gscStyles.header,
                  {
                    backgroundColor: `${teamColor}33`,
                    borderBottomColor: teamColor,
                  },
                ]}
              >
                <View style={gscStyles.headerTopRow}>
                  <Text style={[gscStyles.timeText, { color: theme.text }]}>
                    {payload?.minuteLabel || ""}
                    {payload?.periodLabel ? ` • ${payload.periodLabel}` : ""}
                  </Text>

                  <View style={gscStyles.scoreWrap}>
                    {payload?.homeLogo ? (
                      <Image
                        source={{ uri: payload.homeLogo }}
                        style={gscStyles.scoreLogo}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                      />
                    ) : null}
                    <Text style={[gscStyles.scoreText, { color: theme.text }]}>
                      <Text style={{ fontWeight: homeBold ? "800" : "400" }}>
                        {homeScore}
                      </Text>
                      {" - "}
                      <Text style={{ fontWeight: awayBold ? "800" : "400" }}>
                        {awayScore}
                      </Text>
                    </Text>
                    {payload?.awayLogo ? (
                      <Image
                        source={{ uri: payload.awayLogo }}
                        style={gscStyles.scoreLogo}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                      />
                    ) : null}
                  </View>
                </View>

                <Text style={[gscStyles.goalTypeText, { color: theme.text }]}>
                  <FontAwesome6 name="soccer-ball" size={18} color="#fff" />{" "}
                  {goalType}
                  {goalSituation ? ` • ${goalSituation}` : ""}
                </Text>

                {!!payload?.comment && (
                  <Text
                    style={[
                      gscStyles.commentText,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={2}
                  >
                    {payload.comment}
                  </Text>
                )}
              </View>

              <View style={gscStyles.bodyRow}>
                <View
                  style={[
                    gscStyles.goalCardFieldPane,
                    {
                      width: 150 * FIELD_SCALE,
                      height: 200 * FIELD_SCALE,
                      borderRightColor: theme.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      gscStyles.goalCardFieldContainer,
                      {
                        transform: [
                          { rotate: "90deg" },
                          { scale: FIELD_SCALE },
                        ],
                      },
                    ]}
                  >
                    <View style={gscStyles.miniField}>
                      <View
                        style={[
                          gscStyles.fieldContainer,
                          { backgroundColor: "#2d5a2d" },
                        ]}
                      >
                        <View style={gscStyles.fieldOutline} />
                        <View style={gscStyles.centerLine} />
                        <View style={gscStyles.centerCircleMini} />
                        <View style={gscStyles.penaltyAreaLeft} />
                        <View style={gscStyles.penaltyAreaRight} />
                        <View style={gscStyles.goalAreaLeft} />
                        <View style={gscStyles.goalAreaRight} />
                        <View style={gscStyles.goalLeft} />
                        <View style={gscStyles.goalRight} />
                      </View>
                    </View>
                  </View>
                </View>

                <View style={gscStyles.infoPanel}>
                  {playerImageUri ? (
                    <Image
                      source={{ uri: playerImageUri }}
                      style={[
                        gscStyles.avatar,
                        {
                          backgroundColor: `${teamColor}30`,
                          borderColor: teamColor,
                        },
                      ]}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View
                      style={[
                        gscStyles.avatar,
                        gscStyles.avatarFallback,
                        {
                          backgroundColor: `${teamColor}30`,
                          borderColor: teamColor,
                        },
                      ]}
                    >
                      <Text
                        style={[gscStyles.avatarInitial, { color: textOnTeam }]}
                      >
                        {scorerInitials}
                      </Text>
                    </View>
                  )}

                  <Text
                    style={[gscStyles.playerName, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {scorerName}
                  </Text>

                  <View style={gscStyles.teamRow}>
                    {teamLogoUri ? (
                      <Image
                        source={{ uri: teamLogoUri }}
                        style={gscStyles.teamLogo}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                      />
                    ) : null}
                    <Text
                      style={[
                        gscStyles.teamName,
                        { color: theme.textSecondary },
                      ]}
                      numberOfLines={2}
                    >
                      {teamName}
                    </Text>
                  </View>

                  {!!payload?.assistName && (
                    <View style={gscStyles.assistWrap}>
                      <Text
                        style={[gscStyles.assistName, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {payload.assistName}
                      </Text>
                      <Text
                        style={[
                          gscStyles.assistLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Assist
                      </Text>
                    </View>
                  )}

                  <View style={gscStyles.statsGrid}>
                    {(payload?.statsItems ?? []).map((item) => (
                      <View key={item.label} style={gscStyles.statCell}>
                        <Text
                          style={[gscStyles.statValue, { color: theme.text }]}
                        >
                          {item.value != null ? String(item.value) : "0"}
                        </Text>
                        <Text
                          style={[
                            gscStyles.statLabel,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {item.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>

              <View
                style={[
                  gscStyles.footer,
                  {
                    borderTopColor: theme.border,
                    backgroundColor: theme.surface,
                  },
                ]}
              >
                <Text style={[gscStyles.footerBrand, { color: theme.text }]}>
                  SportsHeart{" "}
                  <Ionicons name="heart" size={10} color={colors.primary} />
                </Text>
              </View>
            </View>
          </ViewShot>

          <View style={gscStyles.actionsRow}>
            <TouchableOpacity
              style={[gscStyles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={handleShare}
              disabled={sharing}
            >
              <Ionicons name="share-outline" size={18} color="#fff" />
              <Text style={gscStyles.actionBtnText}>
                {sharing ? "Sharing..." : "Share"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                gscStyles.actionBtn,
                { backgroundColor: theme.surfaceSecondary },
              ]}
              onPress={onClose}
            >
              <Ionicons name="close" size={18} color={theme.text} />
              <Text style={[gscStyles.actionBtnText, { color: theme.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const StatsSection = ({
  statistics,
  lineups,
  home,
  away,
  homeColor,
  awayColor,
  theme,
}) => {
  const sections = useMemo(() => {
    const parseNumeric = (v) => {
      if (v == null) return null;
      if (typeof v === "number") return Number.isFinite(v) ? v : null;
      const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(n) ? n : null;
    };

    const titleCase = (s) =>
      String(s || "")
        .toLowerCase()
        .replace(/(^|\s|-|_)[a-z]/g, (m) => m.toUpperCase())
        .replace(/_/g, " ");

    const toKey = (s) =>
      String(s || "")
        .toLowerCase()
        .replace(/[_-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const isExcludedStat = (name) => {
      const l = toKey(name);
      return (
        l.includes("rating") ||
        l.includes("goals") ||
        l.includes("captain") ||
        l.includes("minutes played")
      );
    };

    const isPercentageStat = (name) => {
      const l = toKey(name);
      return l.includes("percentage") || l.includes("%");
    };

    const stripPercentageWord = (name) =>
      toKey(name)
        .replace(/\bpercentage\b/g, "")
        .replace(/%/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const formatStatValue = (value, statName) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return "0";
      const isPct = String(statName || "")
        .toLowerCase()
        .includes("percentage");
      if (isPct) {
        return Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`;
      }
      if (Number.isInteger(n)) return String(n);
      return n.toFixed(1);
    };

    const lowerBetterKeywords = [
      "foul",
      "yellow",
      "red",
      "card",
      "offside",
      "offsides",
      "conceded",
      "error",
      "errors",
      "turnover",
      "turnovers",
      "lost",
    ];

    const isLowerBetter = (name) => {
      const l = String(name || "").toLowerCase();
      return lowerBetterKeywords.some((kw) => l.includes(kw));
    };

    const toBarShares = (homeValue, awayValue, reverse = false) => {
      const h = Number(homeValue) || 0;
      const a = Number(awayValue) || 0;
      if (!reverse) {
        const total = h + a;
        if (total <= 0) return { homeShare: 0.5, awayShare: 0.5 };
        return { homeShare: h / total, awayShare: a / total };
      }

      const max = Math.max(h, a);
      const compHome = Math.max(0, max - h);
      const compAway = Math.max(0, max - a);
      const total = compHome + compAway;
      if (total <= 0) return { homeShare: 0.5, awayShare: 0.5 };
      return { homeShare: compHome / total, awayShare: compAway / total };
    };

    const groupedMap = {
      overall: new Map(),
      offensive: new Map(),
      defensive: new Map(),
      other: new Map(),
    };

    const seenMainStatNames = new Set();

    for (const row of statistics ?? []) {
      const statName = row?.type?.name;
      if (!statName) continue;
      const groupRaw = String(row?.type?.stat_group || "overall").toLowerCase();
      const group = ["overall", "offensive", "defensive"].includes(groupRaw)
        ? groupRaw
        : "other";
      const value = parseNumeric(row?.data?.value);
      if (value == null) continue;

      seenMainStatNames.add(statName.toLowerCase());

      if (!groupedMap[group].has(statName)) {
        groupedMap[group].set(statName, { home: 0, away: 0, name: statName });
      }

      const rec = groupedMap[group].get(statName);
      if (row?.participant_id === home?.id) rec.home = value;
      if (row?.participant_id === away?.id) rec.away = value;
    }

    const lineupAgg = new Map();

    for (const lineup of lineups ?? []) {
      const teamId = lineup?.team_id;
      if (teamId !== home?.id && teamId !== away?.id) continue;

      for (const detail of lineup?.details ?? []) {
        const statNameRaw = detail?.type?.name;
        if (!statNameRaw) continue;

        if (seenMainStatNames.has(String(statNameRaw).toLowerCase())) continue;

        const value = parseNumeric(detail?.data?.value);
        if (value == null) continue;

        if (!lineupAgg.has(statNameRaw)) {
          lineupAgg.set(statNameRaw, {
            name: statNameRaw,
            homeSum: 0,
            awaySum: 0,
            homeCount: 0,
            awayCount: 0,
          });
        }

        const rec = lineupAgg.get(statNameRaw);
        if (teamId === home?.id) {
          rec.homeSum += value;
          rec.homeCount += 1;
        }
        if (teamId === away?.id) {
          rec.awaySum += value;
          rec.awayCount += 1;
        }
      }
    }

    for (const [name, rec] of lineupAgg.entries()) {
      const statNameLower = String(name).toLowerCase();
      const shouldAverage =
        statNameLower.includes("percentage") ||
        statNameLower === "rating" ||
        statNameLower.includes(" rating");

      const homeValue = shouldAverage
        ? rec.homeCount > 0
          ? rec.homeSum / rec.homeCount
          : 0
        : rec.homeSum;
      const awayValue = shouldAverage
        ? rec.awayCount > 0
          ? rec.awaySum / rec.awayCount
          : 0
        : rec.awaySum;

      groupedMap.other.set(name, {
        name,
        home: homeValue,
        away: awayValue,
      });
    }

    const buildRows = (map) => {
      const rows = [...map.values()]
        .filter((row) => !isExcludedStat(row.name))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .map((row) => {
          const reverse = isLowerBetter(row.name);
          const shares = toBarShares(row.home, row.away, reverse);
          return {
            ...row,
            keyNorm: normalizeDetailKey(row.name),
            label: titleCase(row.name),
            homeText: formatStatValue(row.home, row.name),
            awayText: formatStatValue(row.away, row.name),
            reverse,
            ...shares,
          };
        });

      const nonPercentageByKey = new Map(
        rows
          .filter((r) => !isPercentageStat(r.name))
          .map((r) => [r.keyNorm, r]),
      );

      for (const row of rows) {
        if (!isPercentageStat(row.name)) continue;
        const baseKey = normalizeDetailKey(stripPercentageWord(row.name));
        const baseMatch = nonPercentageByKey.get(baseKey);
        if (!baseMatch) continue;
        baseMatch.homeText = `${baseMatch.homeText} (${row.homeText})`;
        baseMatch.awayText = `${baseMatch.awayText} (${row.awayText})`;
        row._mergedIntoBase = true;
      }

      return rows.filter((r) => !r._mergedIntoBase);
    };

    return {
      overall: buildRows(groupedMap.overall),
      offensive: buildRows(groupedMap.offensive),
      defensive: buildRows(groupedMap.defensive),
      other: buildRows(groupedMap.other),
    };
  }, [statistics, lineups, home, away]);

  const allRows = useMemo(
    () => [
      ...sections.overall,
      ...sections.offensive,
      ...sections.defensive,
      ...sections.other,
    ],
    [sections],
  );

  const findMainStat = useCallback(
    (matcher) =>
      allRows.find((row) => {
        const k = normalizeDetailKey(row?.name || "");
        return matcher(k);
      }) ?? null,
    [allRows],
  );

  const mainStats = useMemo(
    () => ({
      possession: findMainStat(
        (k) => k === "ballpossession" || k === "possession",
      ),
      dangerousAttacks: findMainStat((k) => k === "dangerousattacks"),
      shotsOffTarget: findMainStat(
        (k) => k === "shotsofftarget" || k === "shotofftarget",
      ),
      shotsOnTarget: findMainStat(
        (k) => k === "shotsontarget" || k === "shotontarget",
      ),
      shotsOutsideBox: findMainStat(
        (k) => k === "shotsoutsidebox" || k === "shotoutsidebox",
      ),
      shotsInsideBox: findMainStat(
        (k) => k === "shotsinsidebox" || k === "shotinsidebox",
      ),
    }),
    [findMainStat],
  );

  const mainStatKeys = useMemo(() => {
    const keys = new Set();
    for (const r of Object.values(mainStats)) {
      if (r?.name) keys.add(String(r.name));
    }
    return keys;
  }, [mainStats]);

  const filteredSections = useMemo(
    () => ({
      overall: sections.overall.filter(
        (r) => !mainStatKeys.has(String(r.name)),
      ),
      offensive: sections.offensive.filter(
        (r) => !mainStatKeys.has(String(r.name)),
      ),
      defensive: sections.defensive.filter(
        (r) => !mainStatKeys.has(String(r.name)),
      ),
      other: sections.other.filter((r) => !mainStatKeys.has(String(r.name))),
    }),
    [sections, mainStatKeys],
  );

  const arrowScale = useCallback((homeVal, awayVal) => {
    const h = Number(homeVal) || 0;
    const a = Number(awayVal) || 0;
    const max = Math.max(h, a, 1);
    return Math.min(1, Math.abs(h - a) / max);
  }, []);

  const shouldShowSideValue = useCallback((own, other) => {
    const a = Number(own) || 0;
    const b = Number(other) || 0;
    if (a === 0 && b > 0) return false;
    return true;
  }, []);

  const renderPossession = (row) => {
    if (!row) return null;
    const leftWidth = Math.max(0, Math.min(100, row.homeShare * 100));
    const rightWidth = Math.max(0, Math.min(100, row.awayShare * 100));
    const showHome = shouldShowSideValue(row.home, row.away);
    const showAway = shouldShowSideValue(row.away, row.home);
    return (
      <View style={stStyles.mainBlock}>
        <Text style={[stStyles.mainLabel, { color: theme.textSecondary }]}>
          Ball Possession
        </Text>
        <View
          style={[
            stStyles.posTrack,
            { backgroundColor: theme.surfaceSecondary },
          ]}
        >
          <View
            style={[
              stStyles.posFillLeft,
              {
                width: `${leftWidth}%`,
                backgroundColor: homeColor,
              },
            ]}
          >
            {showHome ? (
              <Text
                style={[
                  stStyles.posFillText,
                  { color: getTextOnColor(homeColor) },
                ]}
              >
                {row.homeText}%
              </Text>
            ) : null}
          </View>
          <View
            style={[
              stStyles.posFillRight,
              {
                width: `${rightWidth}%`,
                backgroundColor: awayColor,
              },
            ]}
          >
            {showAway ? (
              <Text
                style={[
                  stStyles.posFillText,
                  { color: getTextOnColor(awayColor) },
                ]}
              >
                {row.awayText}%
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const renderGoalShotsWidget = (onTarget, offTarget) => {
    if (!onTarget && !offTarget) return null;
    const onRow = onTarget || {
      home: 0,
      away: 0,
      homeShare: 0.5,
      awayShare: 0.5,
      homeText: "0",
      awayText: "0",
    };
    const offRow = offTarget || {
      home: 0,
      away: 0,
      homeShare: 0.5,
      awayShare: 0.5,
      homeText: "0",
      awayText: "0",
    };
    const showHome = shouldShowSideValue(onRow.home, onRow.away);
    const showAway = shouldShowSideValue(onRow.away, onRow.home);
    const showHomeOff = shouldShowSideValue(offRow.home, offRow.away);
    const showAwayOff = shouldShowSideValue(offRow.away, offRow.home);
    const homeFillWidth = Math.max(0, Math.min(100, onRow.homeShare * 100));
    const awayFillWidth = Math.max(0, Math.min(100, onRow.awayShare * 100));
    const homeOuterWidth = Math.max(0, Math.min(100, offRow.homeShare * 100));
    const awayOuterWidth = Math.max(0, Math.min(100, offRow.awayShare * 100));
    return (
      <View style={stStyles.mainBlock}>
        <Text style={[stStyles.mainLabel, { color: theme.textSecondary }]}>
          Shots (On / Off Target)
        </Text>

        <View
          style={[
            stStyles.shotsSimpleOuter,
            {
              backgroundColor: theme.surfaceSecondary,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={stStyles.shotsSimpleOuterValuesLayer}>
            <View
              style={[
                stStyles.shotsSimpleOuterFillLeft,
                {
                  width: `${homeOuterWidth}%`,
                  backgroundColor: homeColor,
                },
              ]}
            />
            <View
              style={[
                stStyles.shotsSimpleOuterFillRight,
                {
                  width: `${awayOuterWidth}%`,
                  backgroundColor: awayColor,
                },
              ]}
            />
          </View>

          <View style={stStyles.shotsSimpleOuterValuesRow}>
            {showHomeOff ? (
              <Text
                style={[
                  stStyles.shotsSimpleOuterValueText,
                  stStyles.shotsSimpleOuterValueLeft,
                  { color: getTextOnColor(homeColor) },
                ]}
              >
                {offRow.homeText}
              </Text>
            ) : (
              <View style={stStyles.shotsSimpleOuterValueSpacer} />
            )}

            {showAwayOff ? (
              <Text
                style={[
                  stStyles.shotsSimpleOuterValueText,
                  stStyles.shotsSimpleOuterValueRight,
                  { color: getTextOnColor(awayColor) },
                ]}
              >
                {offRow.awayText}
              </Text>
            ) : (
              <View style={stStyles.shotsSimpleOuterValueSpacer} />
            )}
          </View>

          <View
            style={[
              stStyles.shotsSimpleInner,
              {
                borderColor: "#ccc",
                backgroundColor: theme.surfaceSecondary,
              },
            ]}
          >
            <View style={stStyles.shotsSimpleInnerValues}>
              <View
                style={[
                  stStyles.shotsSimpleFillLeft,
                  {
                    width: `${homeFillWidth}%`,
                    backgroundColor: homeColor,
                  },
                ]}
              >
                {showHome ? (
                  <Text
                    style={[
                      stStyles.shotsSimpleInnerValueText,
                      { color: getTextOnColor(homeColor) },
                    ]}
                  >
                    {onRow.homeText}
                  </Text>
                ) : null}
              </View>
              <View
                style={[
                  stStyles.shotsSimpleFillRight,
                  {
                    width: `${awayFillWidth}%`,
                    backgroundColor: awayColor,
                  },
                ]}
              >
                {showAway ? (
                  <Text
                    style={[
                      stStyles.shotsSimpleInnerValueText,
                      { color: getTextOnColor(awayColor) },
                    ]}
                  >
                    {onRow.awayText}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderBoxShotsWidget = (insideBox, outsideBox) => {
    if (!insideBox && !outsideBox) return null;
    const inRow = insideBox || {
      home: 0,
      away: 0,
      homeShare: 0.5,
      awayShare: 0.5,
      homeText: "0",
      awayText: "0",
    };
    const outRow = outsideBox || {
      home: 0,
      away: 0,
      homeShare: 0.5,
      awayShare: 0.5,
      homeText: "0",
      awayText: "0",
    };
    const showHomeOut = shouldShowSideValue(outRow.home, outRow.away);
    const showAwayOut = shouldShowSideValue(outRow.away, outRow.home);
    const showHomeIn = shouldShowSideValue(inRow.home, inRow.away);
    const showAwayIn = shouldShowSideValue(inRow.away, inRow.home);

    const outLeftWidth = Math.max(0, Math.min(100, outRow.homeShare * 100));
    const outRightWidth = Math.max(0, Math.min(100, outRow.awayShare * 100));
    const inLeftWidth = Math.max(0, Math.min(100, inRow.homeShare * 100));
    const inRightWidth = Math.max(0, Math.min(100, inRow.awayShare * 100));

    return (
      <View style={stStyles.mainBlock}>
        <Text style={[stStyles.mainLabel, { color: theme.textSecondary }]}>
          Shots (Inside / Outside Box)
        </Text>

        <View
          style={[
            stStyles.boxOuter,
            {
              borderColor: theme.border,
              backgroundColor: theme.surfaceSecondary,
            },
          ]}
        >
          {/* outer fills (outside box) */}
          <View
            style={[
              stStyles.boxOuterFillLeft,
              { width: `${outLeftWidth}%`, backgroundColor: homeColor },
            ]}
          />
          <View
            style={[
              stStyles.boxOuterFillRight,
              { width: `${outRightWidth}%`, backgroundColor: awayColor },
            ]}
          />

          {/* outer values raised above inner */}
          <View style={stStyles.boxOuterValuesRow} pointerEvents="none">
            <Text
              style={[
                stStyles.boxOuterValueText,
                stStyles.boxOuterValueLeft,
                {
                  color: getTextOnColor(homeColor),
                  opacity: showHomeOut ? 1 : 0.35,
                },
              ]}
            >
              {outRow.homeText}
            </Text>
            <Text style={stStyles.boxOuterValueSpacer} />
            <Text
              style={[
                stStyles.boxOuterValueText,
                stStyles.boxOuterValueRight,
                {
                  color: getTextOnColor(awayColor),
                  opacity: showAwayOut ? 1 : 0.35,
                },
              ]}
            >
              {outRow.awayText}
            </Text>
          </View>

          {/* inner box (inside box) */}
          <View
            style={[
              stStyles.boxInner,
              {
                borderColor: "#CCC",
                backgroundColor: theme.surfaceSecondary,
              },
            ]}
          >
            <View style={stStyles.boxInnerValues}>
              <View
                style={[
                  stStyles.boxFillLeft,
                  { width: `${inLeftWidth}%`, backgroundColor: homeColor },
                ]}
              >
                {showHomeIn ? (
                  <Text
                    style={[
                      stStyles.boxInnerValueText,
                      stStyles.boxInnerValuePosLeft,
                      { color: getTextOnColor(homeColor) },
                    ]}
                  >
                    {inRow.homeText}
                  </Text>
                ) : null}
              </View>
              <View
                style={[
                  stStyles.boxFillRight,
                  { width: `${inRightWidth}%`, backgroundColor: awayColor },
                ]}
              >
                {showAwayIn ? (
                  <Text
                    style={[
                      stStyles.boxInnerValueText,
                      stStyles.boxInnerValuePosRight,
                      { color: getTextOnColor(awayColor) },
                    ]}
                  >
                    {inRow.awayText}
                  </Text>
                ) : null}
              </View>

              {/* second inner box centered */}
              <View style={stStyles.boxInnerInner} />
            </View>

            {/* semicircle on top of first inner */}
            <View style={stStyles.boxSemiCircle} pointerEvents="none" />
          </View>
        </View>
      </View>
    );
  };

  const renderDangerousAttacks = (row) => {
    if (!row) return null;
    const h = Number(row.home) || 0;
    const a = Number(row.away) || 0;
    const maxVal = Math.max(h, a, 1);
    const homeRel = h / maxVal;
    const awayRel = a / maxVal;
    const homeArrowSize = 20 + Math.round(homeRel * 30);
    const awayArrowSize = 20 + Math.round(awayRel * 30);
    const homeValSize = 20 + Math.round(homeRel * 30);
    const awayValSize = 20 + Math.round(awayRel * 30);

    const isDarkMode = theme.text === "#ffffff";

    return (
      <View style={stStyles.mainBlock}>
        <Text style={[stStyles.mainLabel, { color: theme.textSecondary }]}>
          Dangerous Attacks
        </Text>

        <View
          style={[
            stStyles.attackField,
            {
              borderColor: theme.border,
              backgroundColor: isDarkMode ? "#1f5b2b" : "#67c06d",
            },
          ]}
        >
          <View
            style={[
              stStyles.attackFillLeft,
              {
                width: `${Math.max(0, Math.min(100, row.homeShare * 100))}%`,
                backgroundColor: homeColor,
              },
            ]}
          >
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 6,
                paddingHorizontal: 6,
              }}
            >
              <Text
                style={{
                  color: getTextOnColor(homeColor),
                  fontSize: homeValSize,
                  fontWeight: "900",
                  lineHeight: homeValSize + 6,
                }}
              >
                {row.homeText}
              </Text>
              <Text
                style={{
                  color: getTextOnColor(homeColor),
                  fontSize: homeArrowSize + 4,
                  fontWeight: "900",
                  lineHeight: homeArrowSize + 10,
                }}
              >
                →
              </Text>
            </View>
          </View>
          <View
            style={[
              stStyles.attackFillRight,
              {
                width: `${Math.max(0, Math.min(100, row.awayShare * 100))}%`,
                backgroundColor: awayColor,
              },
            ]}
          >
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 6,
                paddingHorizontal: 6,
              }}
            >
              <Text
                style={{
                  color: getTextOnColor(awayColor),
                  fontSize: awayArrowSize + 4,
                  fontWeight: "900",
                  lineHeight: awayArrowSize + 10,
                }}
              >
                ←
              </Text>
              <Text
                style={{
                  color: getTextOnColor(awayColor),
                  fontSize: awayValSize,
                  fontWeight: "900",
                  lineHeight: awayValSize + 6,
                }}
              >
                {row.awayText}
              </Text>
            </View>
          </View>
          <View style={[stStyles.attackLineMid, { backgroundColor: "#ccc" }]} />
          <View style={[stStyles.attackCircle, { borderColor: "#ccc" }]} />
          <View style={[stStyles.attackBoxLeft, { borderColor: "#ccc" }]} />
          <View style={[stStyles.attackBoxRight, { borderColor: "#ccc" }]} />

          {/* values are rendered inside the left/right fills for proper centering */}
        </View>
      </View>
    );
  };

  const renderSection = (title, rows) => (
    <View
      style={[
        stStyles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={[stStyles.headerRow, { borderBottomColor: theme.border }]}>
        <Text style={[stStyles.headerTitle, { color: theme.text }]}>
          {title}
        </Text>
      </View>

      <View style={stStyles.body}>
        {rows.length === 0 ? (
          <Text style={[stStyles.emptyText, { color: theme.textTertiary }]}>
            No stats
          </Text>
        ) : (
          rows.map((row) => (
            <View key={row.name} style={stStyles.rowWrap}>
              <View style={stStyles.valueRow}>
                <Text
                  style={[
                    stStyles.valueText,
                    stStyles.valueLeft,
                    { color: theme.text },
                  ]}
                >
                  {row.homeText}
                </Text>
                <Text
                  style={[
                    stStyles.valueText,
                    stStyles.valueRight,
                    { color: theme.text },
                  ]}
                >
                  {row.awayText}
                </Text>
              </View>

              <View
                style={[
                  stStyles.barTrack,
                  { backgroundColor: theme.surfaceSecondary },
                ]}
              >
                <View
                  style={[
                    stStyles.barFillLeft,
                    {
                      width: `${Math.max(0, Math.min(100, row.homeShare * 100))}%`,
                      backgroundColor: homeColor,
                    },
                  ]}
                />
                <View
                  style={[
                    stStyles.barFillRight,
                    {
                      width: `${Math.max(0, Math.min(100, row.awayShare * 100))}%`,
                      backgroundColor: awayColor,
                    },
                  ]}
                />
              </View>

              <Text
                style={[stStyles.statName, { color: theme.textSecondary }]}
                numberOfLines={2}
              >
                {row.label}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );

  return (
    <View style={{ paddingTop: 6 }}>
      <View
        style={[
          stStyles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={[stStyles.headerRow, { borderBottomColor: theme.border }]}>
          <Text style={[stStyles.headerTitle, { color: theme.text }]}>
            MAIN STATS
          </Text>
        </View>
        <View style={stStyles.body}>
          {renderPossession(mainStats.possession)}
          {renderGoalShotsWidget(
            mainStats.shotsOnTarget,
            mainStats.shotsOffTarget,
          )}
          {renderBoxShotsWidget(
            mainStats.shotsInsideBox,
            mainStats.shotsOutsideBox,
          )}
          {renderDangerousAttacks(mainStats.dangerousAttacks)}
        </View>
      </View>

      {renderSection("OVERALL", filteredSections.overall)}
      {renderSection("OFFENSIVE", filteredSections.offensive)}
      {renderSection("DEFENSIVE", filteredSections.defensive)}
      {renderSection("OTHER", filteredSections.other)}
    </View>
  );
};

// ─── Game Info section ───────────────────────────────────────────────────────
const degreesToCompass = (deg) => {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
};

const GameInfoSection = ({
  venue,
  weather,
  league,
  round,
  startingAt,
  theme,
  isDarkMode,
}) => {
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
  const roundName = round?.name ?? null;

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
            <View
              style={[giStyles.divider, { backgroundColor: theme.border }]}
            />
          )}
          <View style={giStyles.metaRow}>
            <View style={giStyles.metaLeft}>
              {(league?.name || leagueImgUri) && (
                <View style={giStyles.metaLine}>
                  {leagueImgUri ? (
                    <Image
                      source={{ uri: leagueImgUri }}
                      style={[
                        giStyles.metaLogo,
                        {
                          tintColor:
                            league?.id === 8 && isDarkMode
                              ? theme.text
                              : undefined,
                        },
                      ]}
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
                    {league?.name || "League"}{" "}
                    {roundName && `∙ Round ${roundName}`}
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

const H2HSummarySection = ({
  home,
  away,
  summary,
  theme,
  homeColor,
  awayColor,
  homeOnly,
  onToggleHomeOnly,
}) => {
  if (!home || !away || !summary) return null;

  const homeLogoUri =
    home?.image_path && !home.image_path.includes("placeholder")
      ? home.image_path
      : null;
  const awayLogoUri =
    away?.image_path && !away.image_path.includes("placeholder")
      ? away.image_path
      : null;

  const homeWinsCount = Number(summary?.homeWins ?? 0);
  const drawsCount = Number(summary?.draws ?? 0);
  const awayWinsCount = Number(summary?.awayWins ?? 0);
  const total = homeWinsCount + drawsCount + awayWinsCount;

  const homeFlex = total > 0 ? homeWinsCount : 1;
  const drawsFlex = total > 0 ? drawsCount : 1;
  const awayFlex = total > 0 ? awayWinsCount : 1;

  return (
    <View style={[h2hStyles.card, { backgroundColor: theme.surface }]}>
      <View style={[h2hStyles.headerRow, { borderBottomColor: theme.border }]}>
        <Text style={[h2hStyles.headerTitle, { color: theme.text }]}>H2H</Text>
        <TouchableOpacity
          style={[
            h2hStyles.homeFilterBtn,
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
              style={h2hStyles.homeFilterLogo}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          ) : (
            <View
              style={[
                h2hStyles.homeFilterLogoFallback,
                { backgroundColor: theme.surfaceSecondary },
              ]}
            >
              <Text
                style={[
                  h2hStyles.homeFilterLogoFallbackText,
                  { color: theme.textSecondary },
                ]}
              >
                {(home?.name || "?")[0].toUpperCase()}
              </Text>
            </View>
          )}
          <Text
            style={[
              h2hStyles.homeFilterText,
              { color: homeOnly ? homeColor : theme.textSecondary },
            ]}
          >
            HOME
          </Text>
        </TouchableOpacity>
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
              <Text
                style={[h2hStyles.logoInitial, { color: theme.textSecondary }]}
              >
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
              <Text
                style={[h2hStyles.logoInitial, { color: theme.textSecondary }]}
              >
                {(away?.name || "?")[0].toUpperCase()}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View
        style={[
          h2hStyles.summaryFooter,
          {
            borderTopColor: theme.surface,
            backgroundColor: theme.surfaceSecondary,
          },
        ]}
      >
        <View
          style={[
            h2hStyles.summaryFooterFill,
            {
              flex: homeFlex,
              backgroundColor: homeColor,
              borderRightColor: theme.surface,
              borderRightWidth: 2.5,
            },
          ]}
        />
        <View
          style={[
            h2hStyles.summaryFooterFill,
            {
              flex: drawsFlex,
              backgroundColor: theme.border,
              borderRightColor: theme.surface,
              borderRightWidth: 2.5,
            },
          ]}
        />
        <View
          style={[
            h2hStyles.summaryFooterFill,
            { flex: awayFlex, backgroundColor: awayColor },
          ]}
        />
      </View>
    </View>
  );
};

const H2HMatchCard = ({ match, theme, navigation }) => {
  const participants = match?.participants ?? [];
  const homeTeam = participants.find((p) => p?.meta?.location === "home");
  const awayTeam = participants.find((p) => p?.meta?.location === "away");
  if (!homeTeam || !awayTeam) return null;

  const homeWon = homeTeam?.meta?.winner === true;
  const awayWon = awayTeam?.meta?.winner === true;

  const { homeColor, awayColor } = resolveMatchColors({
    homePrimary: homeTeam?.colorPrimary,
    homeSecondary: homeTeam?.colorSecondary,
    awayPrimary: awayTeam?.colorPrimary,
    awaySecondary: awayTeam?.colorSecondary,
    homeFallback: theme.text,
    awayFallback: theme.text,
  });

  const homeScoreEntry =
    match?.scores?.find(
      (s) => s?.description === "CURRENT" && s?.score?.participant === "home",
    ) ?? match?.scores?.find((s) => s?.score?.participant === "home");
  const awayScoreEntry =
    match?.scores?.find(
      (s) => s?.description === "CURRENT" && s?.score?.participant === "away",
    ) ?? match?.scores?.find((s) => s?.score?.participant === "away");

  const homeScore = homeScoreEntry?.score?.goals;
  const awayScore = awayScoreEntry?.score?.goals;

  const toOrdinal = (n) => {
    if (n == null) return null;
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
  };

  const homePlace =
    homeTeam?.meta?.position != null
      ? `${toOrdinal(homeTeam.meta.position)} Place`
      : null;
  const awayPlace =
    awayTeam?.meta?.position != null
      ? `${toOrdinal(awayTeam.meta.position)} Place`
      : null;

  let topDate = "";
  try {
    const d = new Date((match?.starting_at || "").replace(" ", "T") + "Z");
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
    topDate = `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  } catch (_) {
    topDate = "";
  }

  const leagueName = match?.league?.name || "";
  const seasonName = match?.season?.name || "";

  const names = [leagueName, seasonName].filter(Boolean);

  const topLine =
    topDate && names.length > 0
      ? `${topDate} \u00B7 ${names.join(" \u00B7 ")}`
      : topDate || names.join(" \u00B7 ");

  const venueLine = match?.venue?.name || "Venue unavailable";
  const statusLabel = match?.state?.short_name || match?.state?.state || "-";
  const gradId = `h2h_grad_${String(match?.id ?? Math.random()).replace(/[^a-zA-Z0-9_]/g, "_")}`;

  const homeLogoUri =
    homeTeam?.image_path && !homeTeam.image_path.includes("placeholder")
      ? homeTeam.image_path
      : null;
  const awayLogoUri =
    awayTeam?.image_path && !awayTeam.image_path.includes("placeholder")
      ? awayTeam.image_path
      : null;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() =>
        navigation?.navigate("Top5GameDetail", {
          fixtureId: match?.id,
          homeTeamId: homeTeam?.id,
          awayTeamId: awayTeam?.id,
          matchTitle: `${homeTeam?.name || "Home"} vs ${awayTeam?.name || "Away"}`,
        })
      }
      disabled={!navigation || !match?.id || !homeTeam?.id || !awayTeam?.id}
      style={[
        h2hStyles.matchCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={h2hStyles.matchCardTopRow}>
        <Text
          style={[h2hStyles.matchCardTopText, { color: theme.textSecondary }]}
          numberOfLines={1}
        >
          {topLine}
        </Text>
      </View>

      <View
        style={[
          h2hStyles.matchCardBody,
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
              <Stop offset="0%" stopColor={homeColor} stopOpacity="0.35" />
              <Stop offset="35%" stopColor={homeColor} stopOpacity="0" />
              <Stop offset="65%" stopColor={awayColor} stopOpacity="0" />
              <Stop offset="100%" stopColor={awayColor} stopOpacity="0.35" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${gradId})`} />
        </Svg>

        <View style={h2hStyles.matchCardInner}>
          <View style={h2hStyles.matchTeamSide}>
            {homeLogoUri ? (
              <Image
                source={{ uri: homeLogoUri }}
                style={h2hStyles.matchTeamLogo}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            ) : (
              <View
                style={[
                  h2hStyles.matchTeamLogo,
                  h2hStyles.logoFallback,
                  { backgroundColor: `${homeColor}40` },
                ]}
              >
                <Text
                  style={[h2hStyles.logoFallbackText, { color: theme.text }]}
                >
                  {(homeTeam?.name || "?")[0]}
                </Text>
              </View>
            )}
            <View style={h2hStyles.matchTeamTextCol}>
              <Text
                style={[
                  h2hStyles.matchTeamName,
                  {
                    color: homeWon ? theme.text : theme.textSecondary,
                    fontWeight: homeWon ? "700" : "500",
                  },
                ]}
                numberOfLines={2}
              >
                {homeTeam?.name || "Home"}
              </Text>
              {homePlace ? (
                <Text
                  style={[
                    h2hStyles.matchTeamPlace,
                    { color: theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {homePlace}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={h2hStyles.matchScoreBlock}>
            <View style={h2hStyles.matchScoreRow}>
              <Text
                style={[
                  h2hStyles.matchScore,
                  {
                    color: homeWon ? theme.text : theme.textSecondary,
                    fontWeight: homeWon ? "800" : "500",
                  },
                ]}
              >
                {homeScore != null ? homeScore : "-"}
              </Text>
              <Text
                style={[
                  h2hStyles.matchScoreDash,
                  { color: theme.textTertiary ?? theme.textSecondary },
                ]}
              >
                -
              </Text>
              <Text
                style={[
                  h2hStyles.matchScore,
                  {
                    color: awayWon ? theme.text : theme.textSecondary,
                    fontWeight: awayWon ? "800" : "500",
                  },
                ]}
              >
                {awayScore != null ? awayScore : "-"}
              </Text>
            </View>
          </View>

          <View style={h2hStyles.matchTeamSideAway}>
            <View
              style={[
                h2hStyles.matchTeamTextCol,
                h2hStyles.matchTeamTextColAway,
              ]}
            >
              <Text
                style={[
                  h2hStyles.matchTeamName,
                  h2hStyles.matchTeamNameAway,
                  {
                    color: awayWon ? theme.text : theme.textSecondary,
                    fontWeight: awayWon ? "700" : "500",
                  },
                ]}
                numberOfLines={2}
              >
                {awayTeam?.name || "Away"}
              </Text>
              {awayPlace ? (
                <Text
                  style={[
                    h2hStyles.matchTeamPlace,
                    h2hStyles.matchTeamPlaceAway,
                    { color: theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {awayPlace}
                </Text>
              ) : null}
            </View>
            {awayLogoUri ? (
              <Image
                source={{ uri: awayLogoUri }}
                style={h2hStyles.matchTeamLogo}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            ) : (
              <View
                style={[
                  h2hStyles.matchTeamLogo,
                  h2hStyles.logoFallback,
                  { backgroundColor: `${awayColor}40` },
                ]}
              >
                <Text
                  style={[h2hStyles.logoFallbackText, { color: theme.text }]}
                >
                  {(awayTeam?.name || "?")[0]}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <Text
        style={[h2hStyles.matchCardBottomText, { color: theme.textTertiary }]}
      >
        {venueLine}
      </Text>
    </TouchableOpacity>
  );
};

const HomeTeamOverviewSection = ({
  team,
  formations,
  lineups,
  teamColor,
  theme,
}) => {
  if (!team) return null;

  const formation =
    (formations ?? []).find((f) => f?.participant_id === team?.id)?.formation ||
    "-";

  const ratings = (lineups ?? [])
    .filter((lineup) => lineup?.team_id === team?.id)
    .map((lineup) => getLineupRating(lineup))
    .filter((r) => r != null);

  const avgRating =
    ratings.length > 0
      ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
      : null;

  const ratingColor =
    avgRating != null ? motmGetRatingColor(avgRating) : theme.textSecondary;

  const logoUri =
    team?.image_path && !team.image_path.includes("placeholder")
      ? team.image_path
      : null;

  return (
    <View
      style={[
        styles.homeTabTeamCard,
        { backgroundColor: theme.surface, borderColor: teamColor },
      ]}
    >
      <View style={styles.homeTabTeamLeft}>
        {logoUri ? (
          <Image
            source={{ uri: logoUri }}
            style={styles.homeTabTeamLogo}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        ) : (
          <View
            style={[
              styles.homeTabTeamLogoFallback,
              { backgroundColor: `${teamColor}30` },
            ]}
          >
            <Text
              style={[styles.homeTabTeamLogoFallbackText, { color: teamColor }]}
            >
              {(team?.name || "?")[0].toUpperCase()}
            </Text>
          </View>
        )}

        <View style={styles.homeTabTeamTextWrap}>
          <Text
            style={[styles.homeTabTeamName, { color: theme.text }]}
            numberOfLines={1}
          >
            {team?.name || "Home Team"}
          </Text>
          <Text
            style={[
              styles.homeTabTeamFormation,
              { color: theme.textSecondary },
            ]}
            numberOfLines={1}
          >
            {formation}
          </Text>
        </View>
      </View>

      <View style={styles.homeTabRatingWrap}>
        <Text style={[styles.homeTabRatingValue, { color: ratingColor }]}>
          {avgRating != null ? avgRating.toFixed(2) : "-"}
        </Text>
        <Text
          style={[styles.homeTabRatingLabel, { color: theme.textSecondary }]}
        >
          RTG
        </Text>
      </View>
    </View>
  );
};

const HomeManagerSection = ({ manager, teamColor, theme, navigation }) => {
  if (!manager) return null;

  const coach = manager?.coach ?? manager;
  const coachId = manager?.coach_id ?? coach?.id ?? coach?.coach_id ?? null;
  const coachName =
    coach?.name ||
    `${coach?.firstname ?? ""} ${coach?.lastname ?? ""}`.trim() ||
    "Coach";
  const firstName =
    coach?.firstname || coach?.name?.split(" ").slice(0, -1).join(" ") || "";
  const lastName =
    coach?.lastname ||
    coach?.name?.split(" ").slice(-1).join(" ") ||
    coach?.name ||
    "Manager";

  const avatarUri =
    coach?.image_path && !coach.image_path.includes("placeholder")
      ? coach.image_path
      : null;
  const initial = (lastName || "?")[0]?.toUpperCase?.() || "?";

  return (
    <TouchableOpacity
      activeOpacity={coachId && navigation ? 0.78 : 1}
      disabled={!coachId || !navigation}
      onPress={() =>
        navigation?.navigate("Top5CoachDetail", {
          coachId,
          coachName,
        })
      }
      style={[
        styles.homeManagerCard,
        {
          backgroundColor: theme.surface,
          borderColor: teamColor ?? theme.border,
        },
      ]}
    >
      <View
        style={[styles.homeManagerHeader, { borderBottomColor: theme.surface }]}
      >
        <Text style={[styles.homeManagerTitle, { color: theme.text }]}>
          MANAGER
        </Text>
      </View>

      <View style={styles.homeManagerBody}>
        {avatarUri ? (
          <Image
            source={{ uri: avatarUri }}
            style={[
              styles.homeManagerAvatar,
              {
                backgroundColor: `${teamColor}30`,
                borderColor: teamColor,
              },
            ]}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View
            style={[
              styles.homeManagerAvatar,
              {
                backgroundColor: `${teamColor}30`,
                borderColor: teamColor,
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Text
              style={[
                styles.homeManagerInitial,
                { color: getTextOnColor(teamColor) },
              ]}
            >
              {initial}
            </Text>
          </View>
        )}

        <View style={styles.homeManagerNameWrap}>
          <Text
            style={[
              styles.homeManagerFirstName,
              { color: theme.textSecondary },
            ]}
            numberOfLines={1}
          >
            {firstName}
          </Text>
          <Text
            style={[styles.homeManagerLastName, { color: theme.text }]}
            numberOfLines={1}
          >
            {lastName}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const HomeTeamPitchSection = ({
  team,
  formations,
  lineups,
  events,
  teamColor,
  isDarkMode,
  reverseFormationX = true,
  onPlayerPress,
  theme,
}) => {
  const pitchGreen = isDarkMode ? "#1f5b2b" : "#67c06d";

  const formationStr =
    (formations ?? []).find((f) => f?.participant_id === team?.id)?.formation ||
    "4-3-3";

  const formationParts = formationStr
    .split("-")
    .map((part) => parseInt(String(part).trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  const rowColumnCounts = [
    1,
    ...(formationParts.length ? formationParts : [4, 3, 3]),
  ];

  const substitutionEvents = (events ?? []).filter((e) =>
    (e?.addition || "").toLowerCase().includes("substitution"),
  );

  const normalizeTypeName = (name) =>
    String(name || "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");

  const getDetailNumber = (details, keys) => {
    for (const d of details ?? []) {
      const typeName = normalizeTypeName(d?.type?.name);
      if (!keys.includes(typeName)) continue;
      const value = Number(d?.data?.value);
      if (Number.isFinite(value)) return Math.max(0, value);
    }
    return 0;
  };

  const getDetailBool = (details, keys) => {
    for (const d of details ?? []) {
      const typeName = normalizeTypeName(d?.type?.name);
      if (!keys.includes(typeName)) continue;
      const value = d?.data?.value;
      if (
        value === true ||
        value === 1 ||
        String(value).toLowerCase() === "true" ||
        String(value) === "1"
      ) {
        return true;
      }
    }
    return false;
  };

  const formatEventMinute = (event) => {
    if (!event || event?.minute == null) return "";
    return event?.extra_minute != null
      ? `${event.minute}'+${event.extra_minute}'`
      : String(event.minute) + "'";
  };

  const mapLineupPlayer = (l, extras = {}) => ({
    id: l?.player_id,
    jersey: l?.jersey_number,
    lastname:
      l?.player?.lastname ||
      l?.player?.name?.split(" ").slice(-1).join(" ") ||
      "",
    imagePath: l?.player?.image_path,
    positionName: l?.detailedposition?.name || l?.position?.name || "-",
    rating: getLineupRating(l),
    goals: getDetailNumber(l?.details, ["goals", "goal"]),
    assists: getDetailNumber(l?.details, ["assists", "assist"]),
    ownGoals: getDetailNumber(l?.details, ["owngoals", "owngoal"]),
    redCards: getDetailNumber(l?.details, ["redcards", "redcard"]),
    yellowCards: getDetailNumber(l?.details, ["yellowcards", "yellowcard"]),
    yellowRedCards: getDetailNumber(l?.details, [
      "yellowredcards",
      "yellowredcard",
    ]),
    captain: getDetailBool(l?.details, ["captain"]),
    subInEvent:
      substitutionEvents.find((e) => e?.related_player_id === l?.player_id) ||
      null,
    subOutEvent:
      substitutionEvents.find((e) => e?.player_id === l?.player_id) || null,
    sourceLineup: l,
    ...extras,
  });

  const lineupPlayers = (lineups ?? [])
    .filter(
      (l) =>
        l?.team_id === team?.id &&
        (l?.type?.name ?? "").toLowerCase() === "lineup" &&
        typeof l?.formation_field === "string" &&
        l.formation_field.includes(":"),
    )
    .map((l) => {
      const [yRaw, xRaw] = l.formation_field.split(":");
      const row = parseInt(yRaw, 10);
      const colRaw = parseInt(xRaw, 10);
      if (!Number.isFinite(row) || !Number.isFinite(colRaw)) return null;

      const colCountForRow = rowColumnCounts[row - 1] ?? 1;
      const col = reverseFormationX ? colCountForRow - colRaw + 1 : colRaw;

      return mapLineupPlayer(l, { row, col });
    })
    .filter(Boolean);

  const benchPlayers = (lineups ?? [])
    .filter(
      (l) =>
        l?.team_id === team?.id &&
        (l?.type?.name ?? "").toLowerCase() === "bench",
    )
    .map((l) => mapLineupPlayer(l))
    .filter(Boolean)
    .sort((a, b) => {
      const getSubOnSortMinute = (player) => {
        const directSubOn = substitutionEvents.find(
          (e) => e?.participant_id === team?.id && e?.player_id === player?.id,
        );
        const ev = directSubOn || player?.subInEvent || null;
        if (ev?.minute == null) return Number.MAX_SAFE_INTEGER;
        return ev.minute * 100 + (ev.extra_minute ?? 0);
      };

      const aMinute = getSubOnSortMinute(a);
      const bMinute = getSubOnSortMinute(b);

      if (aMinute !== bMinute) return aMinute - bMinute;
      return String(a?.lastname || "").localeCompare(String(b?.lastname || ""));
    });

  const playersByRowCol = new Map();
  for (const p of lineupPlayers) {
    const key = `${p.row}:${p.col}`;
    if (!playersByRowCol.has(key)) playersByRowCol.set(key, p);
  }

  const renderPlayerTile = (player, showPosition = false) => {
    const logoUri =
      player?.imagePath && !player.imagePath.includes("placeholder")
        ? player.imagePath
        : null;
    const initial = (player?.lastname || "?")[0]?.toUpperCase?.() || "?";
    const subInLeft = player?.subOutEvent ? -3 : -3;

    return (
      <TouchableOpacity
        style={styles.homePitchPlayerWrap}
        activeOpacity={onPlayerPress ? 0.75 : 1}
        disabled={!onPlayerPress}
        onPress={() =>
          onPlayerPress?.({
            lineup: player?.sourceLineup ?? null,
            playerId: player?.id,
            team,
          })
        }
      >
        <View style={styles.homePitchPlayerCard}>
          {logoUri ? (
            <Image
              source={{ uri: logoUri }}
              style={[
                styles.homePitchPlayerAvatar,
                {
                  backgroundColor: `${teamColor}30`,
                  borderColor: teamColor,
                },
              ]}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View
              style={[
                styles.homePitchPlayerAvatar,
                {
                  backgroundColor: `${teamColor}30`,
                  borderColor: teamColor,
                  alignItems: "center",
                  justifyContent: "center",
                },
              ]}
            >
              <Text
                style={[
                  styles.homePitchPlayerInitial,
                  { color: getTextOnColor(teamColor) },
                ]}
              >
                {initial}
              </Text>
            </View>
          )}

          {player.rating != null ? (
            <View
              style={[
                styles.homePitchRatingBadge,
                {
                  backgroundColor: motmGetRatingColor(player.rating),
                },
              ]}
            >
              <Text
                style={[
                  styles.homePitchRatingBadgeText,
                  {
                    color: motmTextOnBg(motmGetRatingColor(player.rating)),
                  },
                ]}
              >
                {player.rating.toFixed(1)}
              </Text>
            </View>
          ) : null}

          {player.goals > 0
            ? Array.from({ length: player.goals }).map((_, idx) => (
                <View
                  key={`goal-${player.id}-${idx}`}
                  style={[
                    styles.homePitchIconBubble,
                    styles.homePitchIconBottomRight,
                    { right: 0 - idx * 8 },
                  ]}
                >
                  <FontAwesome6 name="soccer-ball" size={12} color="#000" />
                </View>
              ))
            : null}

          {player.ownGoals > 0
            ? Array.from({ length: player.ownGoals }).map((_, idx) => (
                <View
                  key={`owngoal-${player.id}-${idx}`}
                  style={[
                    styles.homePitchIconBubble,
                    styles.homePitchIconBottomRight,
                    { right: 0 - (player.goals + idx) * 8 },
                  ]}
                >
                  <FontAwesome6 name="soccer-ball" size={12} color="#d62828" />
                </View>
              ))
            : null}

          {player.assists > 0
            ? Array.from({ length: player.assists }).map((_, idx) => (
                <View
                  key={`assist-${player.id}-${idx}`}
                  style={[
                    styles.homePitchIconBubble,
                    styles.homePitchIconBottomLeft,
                    { left: 0 - idx * 8 },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="shoe-cleat"
                    size={14}
                    color="#000"
                    style={{ transform: [{ rotate: "-30deg" }] }}
                  />
                </View>
              ))
            : null}

          {player.yellowCards > 0
            ? Array.from({ length: player.yellowCards }).map((_, idx) => (
                <View
                  key={`yellow-${player.id}-${idx}`}
                  style={[
                    styles.homePitchIconBubble,
                    styles.homePitchIconMiddleLeft,
                    { left: -8 - idx * 8 },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="card"
                    size={11}
                    color="#facc15"
                    style={{ transform: [{ rotate: "90deg" }] }}
                  />
                </View>
              ))
            : null}

          {player.redCards > 0
            ? Array.from({ length: player.redCards }).map((_, idx) => (
                <View
                  key={`red-${player.id}-${idx}`}
                  style={[
                    styles.homePitchIconBubble,
                    styles.homePitchIconMiddleLeft,
                    {
                      left: -8 - (player.yellowCards + idx) * 8,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="card"
                    size={11}
                    color="#d62828"
                    style={{ transform: [{ rotate: "90deg" }] }}
                  />
                </View>
              ))
            : null}

          {player.yellowRedCards > 0
            ? Array.from({ length: player.yellowRedCards }).map((_, idx) => (
                <View
                  key={`yellowred-${player.id}-${idx}`}
                  style={[
                    styles.homePitchIconBubble,
                    styles.homePitchIconMiddleLeft,
                    {
                      left:
                        -8 - (player.yellowCards + player.redCards + idx) * 8,
                    },
                  ]}
                >
                  <View style={styles.homePitchDualCardWrap}>
                    <MaterialCommunityIcons
                      name="card"
                      size={8}
                      color="#facc15"
                      style={{ transform: [{ rotate: "90deg" }] }}
                    />
                    <MaterialCommunityIcons
                      name="card"
                      size={8}
                      color="#d62828"
                      style={[
                        styles.homePitchDualCardTop,
                        { transform: [{ rotate: "90deg" }] },
                      ]}
                    />
                  </View>
                </View>
              ))
            : null}

          {player.subInEvent ? (
            <View
              style={[
                styles.homePitchIconBubble,
                styles.homePitchIconTopLeft,
                { left: subInLeft },
              ]}
            >
              <Text
                style={[styles.homePitchSubMinuteText, { color: theme.text }]}
                numberOfLines={1}
                ellipsizeMode="clip"
              >
                {formatEventMinute(player.subInEvent)}
              </Text>
              <MaterialCommunityIcons
                name="arrow-left-bold-circle"
                size={15}
                color="#d62828"
              />
            </View>
          ) : null}

          {player.subOutEvent ? (
            <View
              style={[
                styles.homePitchIconBubble,
                styles.homePitchIconTopLeft,
                { left: -3 },
              ]}
            >
              <Text
                style={[styles.homePitchSubMinuteText, { color: theme.text }]}
                numberOfLines={1}
                ellipsizeMode="clip"
              >
                {formatEventMinute(player.subOutEvent)}
              </Text>
              <MaterialCommunityIcons
                name="arrow-left-bold-circle"
                size={15}
                color="#2a9d4b"
                style={{ transform: [{ rotate: "180deg" }] }}
              />
            </View>
          ) : null}

          {player.captain ? (
            <View
              style={[
                styles.homePitchIconBubble,
                styles.homePitchIconMiddleRight,
              ]}
            >
              <Text style={styles.homePitchCaptainText}>C</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.homePitchPlayerMetaRow}>
          <Text
            style={[
              styles.homePitchPlayerJersey,
              { color: theme.textSecondary },
            ]}
            numberOfLines={1}
          >
            {player.jersey ?? ""}
          </Text>
          <Text
            style={[styles.homePitchPlayerLastName, { color: theme.text }]}
            numberOfLines={1}
          >
            {player.lastname}
          </Text>
        </View>

        {showPosition ? (
          <Text
            style={[styles.homeBenchPosition, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {player.positionName || "-"}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  const totalRows = rowColumnCounts.length;
  const visualRows = Array.from({ length: totalRows }, (_, i) => totalRows - i);

  return (
    <>
      <View style={[styles.homeFootballPitch, { backgroundColor: pitchGreen }]}>
        <View style={styles.homePitchCenterCircle} />
        <View style={styles.homePitchPenaltyBox} />
        <View style={styles.homePitchGoalBox} />
        <View style={styles.homePitchPenaltyArc} />

        <View pointerEvents="box-none" style={styles.homePitchPlayersOverlay}>
          {visualRows.map((row) => {
            const colCount = rowColumnCounts[row - 1] ?? 1;
            return (
              <View key={`players-row-${row}`} style={styles.homePitchGridRow}>
                {Array.from({ length: colCount }).map((_, colIdx) => {
                  const col = colIdx + 1;
                  const player = playersByRowCol.get(`${row}:${col}`);

                  return (
                    <View
                      key={`players-cell-${row}-${col}`}
                      style={styles.homePitchGridCell}
                    >
                      {player ? renderPlayerTile(player) : null}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </View>

      {benchPlayers.length > 0 ? (
        <View
          style={[
            styles.homeBenchCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              borderColor: teamColor ?? theme.border,
              borderWidth: 2,
            },
          ]}
        >
          <View style={[styles.homeBenchHeader, { borderBottomWidth: 0 }]}>
            <Text style={[styles.homeBenchTitle, { color: theme.text }]}>
              BENCH
            </Text>
          </View>
          <View style={styles.homeBenchGrid}>
            {benchPlayers.map((player, idx) => (
              <View
                key={`bench-${player.id ?? idx}`}
                style={styles.homeBenchItem}
              >
                {renderPlayerTile(player, true)}
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </>
  );
};

const HomeSidelinedSection = ({
  team,
  sidelined,
  teamColor,
  theme,
  onPlayerPress,
}) => {
  if (!team) return null;

  const entries = (sidelined ?? []).filter(
    (s) => s?.participant_id === team?.id,
  );

  if (!entries.length) return null;

  const formatSidelineEndDate = (value) => {
    if (!value) return null;
    const d = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return null;
    const day = String(d.getUTCDate()).padStart(2, "0");
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
    const mon = months[d.getUTCMonth()] || "";
    const year = d.getUTCFullYear();
    return `${day} ${mon} ${year}`;
  };

  const renderSidelinedTile = (entry) => {
    const p = entry?.player ?? {};
    const imagePath = p?.image_path ?? null;
    const logoUri =
      imagePath && !String(imagePath).includes("placeholder")
        ? imagePath
        : null;
    const lastName =
      p?.lastname || p?.name?.split(" ").slice(-1).join(" ") || "Player";
    const initial = (lastName || "?")[0]?.toUpperCase?.() || "?";
    const statusLabel = entry?.type?.name || "Unavailable";
    const typeLow = String(entry?.type?.name || "").toLowerCase();
    const sidelineEndDate = formatSidelineEndDate(entry?.sideline?.end_date);

    let statusIcon = (
      <FontAwesome5
        name="user-injured"
        size={11}
        color={theme.error || "#e03131"}
      />
    );

    if (typeLow.includes("yellow")) {
      statusIcon = (
        <MaterialCommunityIcons
          name="card"
          size={12}
          color="#facc15"
          style={styles.redCardIcon}
        />
      );
    } else if (typeLow.includes("red")) {
      statusIcon = (
        <MaterialCommunityIcons
          name="card"
          size={12}
          color={theme.error || "#e03131"}
          style={styles.redCardIcon}
        />
      );
    }

    return (
      <TouchableOpacity
        style={styles.homePitchPlayerWrap}
        activeOpacity={0.75}
        onPress={() =>
          onPlayerPress?.({
            playerId: entry?.player_id,
            player: entry?.player ?? null,
            team,
          })
        }
        disabled={!onPlayerPress}
      >
        <View style={styles.homePitchPlayerCard}>
          {logoUri ? (
            <Image
              source={{ uri: logoUri }}
              style={[
                styles.homePitchPlayerAvatar,
                {
                  backgroundColor: `${teamColor}30`,
                  borderColor: teamColor,
                },
              ]}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View
              style={[
                styles.homePitchPlayerAvatar,
                {
                  backgroundColor: `${teamColor}30`,
                  borderColor: teamColor,
                  alignItems: "center",
                  justifyContent: "center",
                },
              ]}
            >
              <Text
                style={[
                  styles.homePitchPlayerInitial,
                  { color: getTextOnColor(teamColor) },
                ]}
              >
                {initial}
              </Text>
            </View>
          )}

          <View
            style={[
              styles.homePitchIconBubble,
              styles.homePitchIconBottomRight,
              { backgroundColor: "#fff" },
            ]}
          >
            {statusIcon}
          </View>
        </View>

        <View style={styles.homePitchPlayerMetaRow}>
          <Text
            style={[styles.homePitchPlayerLastName, { color: theme.text }]}
            numberOfLines={1}
          >
            {lastName}
          </Text>
        </View>

        <Text
          style={[styles.homeBenchPosition, { color: theme.textSecondary }]}
          numberOfLines={2}
        >
          {statusLabel}
        </Text>

        {entry?.sideline != null && sidelineEndDate ? (
          <Text
            style={[styles.homeBenchPosition, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {sidelineEndDate}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.homeBenchCard,
        {
          backgroundColor: theme.surface,
          borderColor: teamColor ?? theme.border,
          borderWidth: 2,
        },
      ]}
    >
      <View style={[styles.homeBenchHeader, { borderBottomWidth: 0 }]}>
        <Text style={[styles.homeBenchTitle, { color: theme.text }]}>
          SIDELINED
        </Text>
      </View>

      <View style={styles.homeBenchGrid}>
        {entries.map((entry, idx) => (
          <View
            key={`sidelined-${entry?.player_id ?? idx}`}
            style={styles.homeBenchItem}
          >
            {renderSidelinedTile(entry)}
          </View>
        ))}
      </View>
    </View>
  );
};

const SoccerPlayerDetailModal = ({
  visible,
  onClose,
  lineup,
  team,
  allLineups,
  home,
  away,
  homeScore,
  awayScore,
  startingAt,
  theme,
  colors,
}) => {
  const player = lineup?.player ?? {};
  const resolvedTeam =
    team ??
    (lineup?.team_id === home?.id
      ? home
      : lineup?.team_id === away?.id
        ? away
        : null);
  const fullName =
    player?.name ||
    `${player?.firstname ?? ""} ${player?.lastname ?? ""}`.trim() ||
    `Player ${lineup?.player_id ?? ""}`;
  const jerseyNum = lineup?.jersey_number ? `#${lineup.jersey_number}` : "";
  const teamName = resolvedTeam?.name || "";
  const subtitleText = [jerseyNum, teamName].filter(Boolean).join(" \u00B7 ");
  const positionName =
    lineup?.detailedposition?.name ?? lineup?.position?.name ?? "—";
  const rating = getLineupRating(lineup);
  const minutesPlayed = motmGetStat(
    lineup?.details,
    "minutes played",
    "minutes",
  );
  const lineupTypeName = lineup?.type?.name ?? "";

  const age = (() => {
    const dob = player?.date_of_birth;
    if (!dob) return null;
    const birth = new Date(`${dob}T00:00:00Z`);
    if (Number.isNaN(birth.getTime())) return null;
    const now = new Date();
    let years = now.getUTCFullYear() - birth.getUTCFullYear();
    const mDiff = now.getUTCMonth() - birth.getUTCMonth();
    const dDiff = now.getUTCDate() - birth.getUTCDate();
    if (mDiff < 0 || (mDiff === 0 && dDiff < 0)) years -= 1;
    return years >= 0 ? years : null;
  })();

  const { statRows, keyStats } = useMemo(() => {
    const parseNum = (v) => {
      if (v == null) return null;
      if (typeof v === "number") return Number.isFinite(v) ? v : null;
      const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(n) ? n : null;
    };

    const label = (name) =>
      String(name || "")
        .replace(/([A-Z])/g, " $1")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^./, (c) => c.toUpperCase());

    const minMaxByKey = {};
    for (const l of allLineups ?? []) {
      for (const d of l?.details ?? []) {
        const key = String(d?.type?.name || "").toLowerCase();
        if (!key) continue;
        const value = parseNum(d?.data?.value);
        if (value == null) continue;
        if (!minMaxByKey[key]) {
          minMaxByKey[key] = { min: value, max: value };
        } else {
          minMaxByKey[key].min = Math.min(minMaxByKey[key].min, value);
          minMaxByKey[key].max = Math.max(minMaxByKey[key].max, value);
        }
      }
    }

    const byName = new Map();
    for (const d of lineup?.details ?? []) {
      const rawName = d?.type?.name;
      if (!rawName) continue;
      const value = parseNum(d?.data?.value);
      if (value == null) continue;
      byName.set(rawName, value);
    }

    const keyToMetric = {
      rating: "rtg",
      goals: "gls",
      goal: "gls",
      assists: "ast",
      assist: "ast",
    };

    const keyStatsMap = {
      rtg: null,
      gls: null,
      ast: null,
    };

    const rows = [...byName.entries()]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([rawName, value]) => {
        const key = String(rawName).toLowerCase();
        const mm = minMaxByKey[key] ?? { min: value, max: value };
        const pct =
          mm.max === mm.min
            ? 1
            : Math.max(0, Math.min(1, (value - mm.min) / (mm.max - mm.min)));
        const isPct = key.includes("percentage");
        const valueText = isPct
          ? Number.isInteger(value)
            ? `${value}%`
            : `${value.toFixed(1)}%`
          : Number.isInteger(value)
            ? String(value)
            : value.toFixed(1);

        return {
          key,
          name: label(rawName),
          valueText,
          pct,
          rawValue: value,
        };
      });

    for (const row of rows) {
      const metric = keyToMetric[row.key];
      if (!metric) continue;
      const max =
        metric === "rtg"
          ? Math.max(10, minMaxByKey.rating?.max ?? row.rawValue ?? 0)
          : Math.max(1, minMaxByKey[row.key]?.max ?? row.rawValue ?? 0);
      const ratio = Math.max(0, Math.min(1, (row.rawValue ?? 0) / max));
      if (!keyStatsMap[metric]) {
        keyStatsMap[metric] = {
          key: metric,
          label: metric === "rtg" ? "RTG" : metric === "gls" ? "GLS" : "AST",
          valueText: row.valueText,
          ratio,
        };
      }
    }

    const filteredRows = rows.filter(
      (row) =>
        !["rating", "goals", "goal", "assists", "assist"].includes(row.key),
    );

    const finalKeyStats = [
      keyStatsMap.rtg,
      keyStatsMap.gls,
      keyStatsMap.ast,
    ].filter(Boolean);

    return { statRows: filteredRows, keyStats: finalKeyStats };
  }, [lineup, allLineups]);

  const playerImageUri =
    player?.image_path && !String(player.image_path).includes("placeholder")
      ? player.image_path
      : null;
  const resolvedPlayerId =
    lineup?.player_id ?? player?.id ?? player?.player_id ?? null;
  const playerInitials =
    [player?.firstname?.[0], player?.lastname?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() ||
    fullName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() ||
    "?";
  const { homeColor: resolvedHomeColor, awayColor: resolvedAwayColor } =
    useMemo(
      () =>
        resolveMatchColors({
          homePrimary: home?.colorPrimary,
          homeSecondary: home?.colorSecondary,
          awayPrimary: away?.colorPrimary,
          awaySecondary: away?.colorSecondary,
          homeFallback: colors.primary,
          awayFallback: colors.secondary || colors.primary,
        }),
      [home, away, colors.primary, colors.secondary],
    );
  const teamColor =
    resolvedTeam?.id === home?.id
      ? resolvedHomeColor
      : resolvedTeam?.id === away?.id
        ? resolvedAwayColor
        : resolvedTeam?.colorPrimary || "#4c6ef5";
  const [playerShareVisible, setPlayerShareVisible] = useState(false);
  const [sharingPlayerCard, setSharingPlayerCard] = useState(false);
  const shareCardRef = useRef(null);

  useEffect(() => {
    if (!visible) {
      setPlayerShareVisible(false);
      setSharingPlayerCard(false);
    }
  }, [visible]);

  useEffect(() => {
    console.log("[Top5Share] playerShareVisible changed:", playerShareVisible);
  }, [playerShareVisible]);

  useEffect(() => {
    if (!playerShareVisible) return;
    console.log("[Top5Share] Share modal requested", {
      resolvedPlayerId,
      hasLineup: !!lineup,
      hasPlayer: !!player,
      hasShareCardRef: !!shareCardRef.current,
    });

    const t = setTimeout(() => {
      console.log("[Top5Share] Post-open ref check", {
        hasShareCardRef: !!shareCardRef.current,
      });
    }, 250);

    return () => clearTimeout(t);
  }, [playerShareVisible, resolvedPlayerId, lineup, player]);

  const handlePlayerShare = useCallback(async () => {
    console.log("[Top5Share] Share action tapped", {
      sharingPlayerCard,
      hasShareCardRef: !!shareCardRef.current,
      playerId: resolvedPlayerId,
      lineupPlayerId: lineup?.player_id,
    });

    if (sharingPlayerCard || !shareCardRef.current) {
      console.warn("[Top5Share] Share action aborted", {
        reason: sharingPlayerCard
          ? "already-sharing"
          : "missing-share-card-ref",
      });
      return;
    }

    try {
      setSharingPlayerCard(true);
      // Let dynamic images paint before capture for stable output.
      await new Promise((resolve) => setTimeout(resolve, 350));
      console.log("[Top5Share] Capturing share card...");
      const uri = await shareCardRef.current.capture();
      console.log("[Top5Share] Share card captured", { uri });
      console.log("[Top5Share] Opening native share sheet...");
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: "Share Player Stats",
      });
      console.log("[Top5Share] Native share sheet completed");
    } catch (err) {
      console.error("[Top5Share] Error sharing soccer player card", err);
    } finally {
      console.log("[Top5Share] Share action finished");
      setSharingPlayerCard(false);
    }
  }, [sharingPlayerCard, resolvedPlayerId, lineup?.player_id]);

  const normalizedPos = String(positionName || "").toLowerCase();
  const posAbbr = motmGetPosAbbr(positionName) || "";
  const isGK = normalizedPos.includes("goalkeeper") || normalizedPos === "gk";
  const isDEF =
    normalizedPos.includes("def") ||
    normalizedPos.includes("back") ||
    normalizedPos.includes("sweeper") ||
    normalizedPos.includes("centre back") ||
    normalizedPos.includes("center back");
  const isMF =
    normalizedPos.includes("mid") ||
    normalizedPos.includes("wing") ||
    normalizedPos.includes("playmaker");

  const normalizeStatKey = (name) =>
    String(name || "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");

  const getLineupStat = (...keys) => {
    const wanted = keys.map((k) => normalizeStatKey(k));
    const d = (lineup?.details ?? []).find((item) =>
      wanted.includes(normalizeStatKey(item?.type?.name)),
    );
    return d?.data?.value ?? null;
  };

  const parseNum = (v) => {
    if (v == null) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const statNum = (v) => {
    const n = parseNum(v);
    return n == null ? null : n;
  };

  const passesAcc = statNum(
    getLineupStat("accurate passes", "successful passes", "passes accurate"),
  );
  const passesTotal = statNum(
    getLineupStat("passes total", "passes", "total passes"),
  );
  const passPct =
    passesAcc != null && passesTotal != null && passesTotal > 0
      ? `${Math.round((passesAcc / passesTotal) * 100)}%`
      : null;
  const passDisplay =
    passesAcc != null && passesTotal != null && passesTotal > 0
      ? `${passesAcc}-${passesTotal}`
      : "—";

  const duelsWon = statNum(
    getLineupStat("duels won", "tackles won", "duels success"),
  );
  const duelsTotal = statNum(getLineupStat("total duels", "duels"));
  const duelsPct =
    duelsWon != null && duelsTotal != null && duelsTotal > 0
      ? `${Math.round((duelsWon / duelsTotal) * 100)}%`
      : null;
  const duelsDisplay =
    duelsWon != null && duelsTotal != null && duelsTotal > 0
      ? `${duelsWon}-${duelsTotal}`
      : "—";

  const statsObj = {
    rating: statNum(getLineupRating("rating")),
    goals: statNum(getLineupStat("goals", "goal")),
    assists: statNum(getLineupStat("assists", "assist")),
    shots: statNum(getLineupStat("shots total", "shots", "shots on")),
    shotsOnTarget: statNum(getLineupStat("shots on target", "shot on target")),
    tackles: statNum(getLineupStat("tackles", "duels won")),
    interceptions: statNum(getLineupStat("interceptions")),
    clearances: statNum(getLineupStat("clearances", "clearance")),
    blockedShots: statNum(getLineupStat("blocked shots", "blocks")),
    foulsCommitted: statNum(getLineupStat("fouls", "fouls committed")),
    foulsDrawn: statNum(getLineupStat("fouls drawn", "was fouled")),
    saves: statNum(getLineupStat("saves", "goalkeeper saves")),
    goalsConceded: statNum(getLineupStat("goals conceded")),
    yellowCards: statNum(getLineupStat("yellowcards", "yellowcard")),
    redCards: statNum(getLineupStat("redcards", "redcard")),
    ownGoals: statNum(getLineupStat("owngoals", "owngoal")),
    touches: statNum(getLineupStat("touches")),
    duels: statNum(getLineupStat("total duels", "duels")),
    recovery: statNum(getLineupStat("ball recovery")),
    minutes: minutesPlayed != null ? parseNum(minutesPlayed) : null,
    rating: rating != null ? Number(rating.toFixed(1)) : null,
  };

  let shareStatItems;
  if (isGK) {
    shareStatItems = [
      { label: "RTG", value: statsObj.rating },
      { label: "SVS", value: statsObj.saves },
      { label: "GA", value: statsObj.goalsConceded },
      { label: "PASS", value: passDisplay, pct: passPct },
      { label: "REC", value: statsObj.recovery },
      { label: "TCH", value: statsObj.touches },
      { label: "MIN", value: statsObj.minutes },
      { label: "YC", value: statsObj.yellowCards },
      { label: "RC", value: statsObj.redCards },
    ];
  } else if (isDEF) {
    shareStatItems = [
      { label: "RTG", value: statsObj.rating },
      { label: "TCKL", value: statsObj.tackles },
      { label: "INT", value: statsObj.interceptions },
      { label: "CLR", value: statsObj.clearances },
      { label: "PASS", value: passDisplay, pct: passPct },
      { label: "DUEL", value: duelsDisplay, pct: duelsPct },
      { label: "SHB", value: statsObj.blockedShots },
      { label: "MIN", value: statsObj.minutes },
      { label: "YC", value: statsObj.yellowCards },
    ];
  } else if (isMF) {
    shareStatItems = [
      { label: "RTG", value: statsObj.rating },
      { label: "GLS", value: statsObj.goals },
      { label: "AST", value: statsObj.assists },
      { label: "SHT", value: statsObj.shots },
      { label: "DUEL", value: duelsDisplay, pct: duelsPct },
      { label: "TCH", value: statsObj.touches },
      { label: "PASS", value: passDisplay, pct: passPct },
      { label: "MIN", value: statsObj.minutes },
      { label: "YC", value: statsObj.yellowCards },
    ];
  } else {
    shareStatItems = [
      { label: "RTG", value: statsObj.rating },
      { label: "GLS", value: statsObj.goals },
      { label: "AST", value: statsObj.assists },
      { label: "SHT", value: statsObj.shots },
      { label: "SOT", value: statsObj.shotsOnTarget },
      { label: "TCH", value: statsObj.touches },
      { label: "PASS", value: passDisplay, pct: passPct },
      { label: "MIN", value: statsObj.minutes },
      { label: "YC", value: statsObj.yellowCards },
    ];
  }

  const summaryPriority = isGK
    ? ["RTG", "SVS", "GA", "PASS", "MIN"]
    : isDEF
      ? ["RTG", "TCKL", "INT", "CLR", "MIN"]
      : isMF
        ? ["RTG", "GLS", "AST", "SHT", "DUEL", "TCH", "MIN"]
        : ["RTG", "GLS", "AST", "SOT", "TCH", "MIN"];

  const summaryOrdered = shareStatItems
    .filter(({ label }) => summaryPriority.includes(label))
    .sort(
      (a, b) =>
        summaryPriority.indexOf(a.label) - summaryPriority.indexOf(b.label),
    );
  const summaryNonZero = summaryOrdered.filter(
    ({ value }) =>
      value != null && value !== 0 && value !== "0%" && value !== "—",
  );
  const summaryFill = summaryOrdered.filter(
    ({ label }) => !summaryNonZero.find((n) => n.label === label),
  );
  const summaryStats = [...summaryNonZero, ...summaryFill].slice(0, 4);

  const scoreHome = homeScore != null ? String(homeScore) : "-";
  const scoreAway = awayScore != null ? String(awayScore) : "-";
  const homeWon = Number(scoreHome) > Number(scoreAway);
  const awayWon = Number(scoreAway) > Number(scoreHome);
  const textOnTeam = getTextOnColor(teamColor);

  const gameDateParts = (() => {
    if (!startingAt) return null;
    try {
      const d = new Date(startingAt.replace(" ", "T") + "Z");
      const monthDate = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const year = d.toLocaleDateString("en-US", { year: "numeric" });
      return { monthDate, year };
    } catch {
      return null;
    }
  })();

  if (!lineup) return null;

  return (
    <>
      <Modal
        visible={visible && !playerShareVisible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={spmStyles.backdrop}>
          <TouchableOpacity
            style={spmStyles.backdropTap}
            activeOpacity={1}
            onPress={onClose}
          />

          <View
            style={[
              spmStyles.sheet,
              {
                backgroundColor: theme.surface,
                borderTopColor: teamColor,
              },
            ]}
          >
            <View
              style={[spmStyles.dragStrip, { borderBottomColor: theme.border }]}
            >
              <View style={spmStyles.handleRow}>
                <View style={spmStyles.handleRowSpacer} />
                <View style={spmStyles.headerActions}>
                  <TouchableOpacity
                    onPress={() => {
                      console.log("[Top5Share] Header share icon tapped", {
                        playerId: resolvedPlayerId,
                        lineupPlayerId: lineup?.player_id,
                      });
                      if (!resolvedPlayerId) {
                        console.warn(
                          "[Top5Share] Missing resolvedPlayerId at share tap; modal will still open",
                        );
                      }
                      console.log(
                        "[Top5Share] Switching from stats modal to share modal",
                      );
                      setPlayerShareVisible(true);
                    }}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={[
                      spmStyles.iconBtn,
                      { backgroundColor: `${teamColor}2B` },
                    ]}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="share-outline"
                      size={16}
                      color={teamColor}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={onClose}
                    style={[
                      spmStyles.iconBtn,
                      { backgroundColor: theme.error },
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        spmStyles.closeBtnText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      ✕
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {playerImageUri ? (
                <Image
                  source={{ uri: playerImageUri }}
                  style={[spmStyles.headshot, { borderColor: teamColor }]}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <View
                  style={[
                    spmStyles.headshot,
                    {
                      borderColor: teamColor,
                      backgroundColor: `${teamColor}30`,
                      alignItems: "center",
                      justifyContent: "center",
                    },
                  ]}
                >
                  <Text
                    style={[
                      spmStyles.headshotInitial,
                      { color: getTextOnColor(teamColor) },
                    ]}
                  >
                    {playerInitials}
                  </Text>
                </View>
              )}

              <Text
                style={[spmStyles.playerName, { color: theme.text }]}
                numberOfLines={2}
              >
                {fullName}
              </Text>
              <Text
                style={[spmStyles.jerseyNum, { color: theme.textSecondary }]}
              >
                {subtitleText || " "}
              </Text>

              <View style={spmStyles.triRow}>
                <View style={spmStyles.triCell}>
                  <Text
                    style={[spmStyles.triValue, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {positionName}
                  </Text>
                  <Text
                    style={[spmStyles.triLabel, { color: theme.textSecondary }]}
                  >
                    POSITION
                  </Text>
                </View>
                <View
                  style={[
                    spmStyles.triCell,
                    spmStyles.triCellMid,
                    { borderColor: theme.border },
                  ]}
                >
                  <Text style={[spmStyles.triValue, { color: theme.text }]}>
                    {minutesPlayed != null
                      ? `${minutesPlayed}${String(minutesPlayed).includes("'") ? "" : "'"}`
                      : lineupTypeName || "—"}
                  </Text>
                  {minutesPlayed != null ? (
                    <Text
                      style={[
                        spmStyles.triLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      MIN PLAYED
                    </Text>
                  ) : null}
                </View>
                <View style={spmStyles.triCell}>
                  <Text style={[spmStyles.triValue, { color: theme.text }]}>
                    {age ?? "—"}
                  </Text>
                  <Text
                    style={[spmStyles.triLabel, { color: theme.textSecondary }]}
                  >
                    AGE
                  </Text>
                </View>
              </View>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={spmStyles.scrollContent}
            >
              <Text
                style={[spmStyles.statSection, { color: theme.textSecondary }]}
              >
                STATS
              </Text>

              {keyStats.length > 0 ? (
                <View style={spmStyles.keyStatsRow}>
                  {keyStats.map((stat) => (
                    <View key={stat.key} style={spmStyles.keyStatItem}>
                      <View style={spmStyles.keyStatRing}>
                        <Svg
                          width={62}
                          height={62}
                          style={spmStyles.keyStatRingSvg}
                        >
                          <Circle
                            cx={31}
                            cy={31}
                            r={27}
                            stroke={`${teamColor}33`}
                            strokeWidth={4}
                            fill="none"
                          />
                          <Circle
                            cx={31}
                            cy={31}
                            r={27}
                            stroke={teamColor}
                            strokeWidth={4}
                            fill="none"
                            strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 27} ${2 * Math.PI * 27}`}
                            strokeDashoffset={
                              2 *
                              Math.PI *
                              27 *
                              (1 - Math.max(0, Math.min(1, stat.ratio)))
                            }
                            transform="rotate(-90 31 31)"
                          />
                        </Svg>
                        <View
                          style={[
                            spmStyles.keyStatCoreTrack,
                            {
                              backgroundColor: theme.surfaceSecondary,
                              borderColor: `${teamColor}22`,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              spmStyles.keyStatValue,
                              { color: theme.text },
                            ]}
                          >
                            {stat.valueText}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[
                          spmStyles.keyStatLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {stat.label}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {keyStats.length > 0 && statRows.length > 0 ? (
                <View
                  style={[
                    spmStyles.keyStatsDivider,
                    { backgroundColor: theme.border },
                  ]}
                />
              ) : null}

              {statRows.length === 0 ? (
                <Text
                  style={[spmStyles.emptyText, { color: theme.textTertiary }]}
                >
                  No player stats available.
                </Text>
              ) : (
                statRows.map((row) => (
                  <View key={row.name} style={spmStyles.statRow}>
                    <Text
                      style={[spmStyles.statRowLabel, { color: theme.text }]}
                      numberOfLines={2}
                    >
                      {row.name}
                    </Text>
                    <View style={spmStyles.statRowRight}>
                      <View
                        style={[
                          spmStyles.statBarTrack,
                          { backgroundColor: theme.surfaceSecondary },
                        ]}
                      >
                        <View
                          style={[
                            spmStyles.statBarFill,
                            {
                              width: `${Math.max(3, row.pct * 100)}%`,
                              backgroundColor: teamColor,
                            },
                          ]}
                        />
                      </View>
                      <Text
                        style={[spmStyles.statRowValue, { color: theme.text }]}
                      >
                        {row.valueText}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={visible && playerShareVisible}
        animationType="fade"
        transparent
        onShow={() =>
          console.log("[Top5Share] Share modal shown", {
            hasShareCardRef: !!shareCardRef.current,
          })
        }
        onRequestClose={() => setPlayerShareVisible(false)}
      >
        <View
          style={spmStyles.shareOverlay}
          onLayout={() => {
            console.log("[Top5Share] Share modal overlay layout", {
              hasShareCardRef: !!shareCardRef.current,
              resolvedPlayerId,
            });
          }}
        >
          <ViewShot
            ref={shareCardRef}
            options={{ format: "png", quality: 1 }}
            style={{ overflow: "hidden" }}
          >
            <View
              collapsable={false}
              style={[spmStyles.shareCard, { backgroundColor: theme.surface }]}
            >
              <View
                style={[
                  spmStyles.shareHeader,
                  {
                    backgroundColor: `${teamColor}22`,
                    borderBottomColor: teamColor,
                  },
                ]}
              >
                <View style={spmStyles.shareTopRow}>
                  <View
                    style={[
                      spmStyles.sharePosBadge,
                      { backgroundColor: teamColor },
                    ]}
                  >
                    <Text
                      style={[
                        spmStyles.sharePosBadgeText,
                        { color: textOnTeam },
                      ]}
                    >
                      {jerseyNum || "#?"}
                      {positionName ? ` \u00B7 ${positionName}` : ""}
                    </Text>
                  </View>

                  <View style={spmStyles.shareScoreWrap}>
                    {home?.image_path ? (
                      <Image
                        source={{ uri: home.image_path }}
                        style={spmStyles.shareScoreLogo}
                        contentFit="contain"
                      />
                    ) : null}
                    <Text
                      style={[spmStyles.shareScoreText, { color: theme.text }]}
                    >
                      <Text style={{ fontWeight: homeWon ? "800" : "400" }}>
                        {scoreHome}
                      </Text>
                      {" - "}
                      <Text style={{ fontWeight: awayWon ? "800" : "400" }}>
                        {scoreAway}
                      </Text>
                    </Text>
                    {away?.image_path ? (
                      <Image
                        source={{ uri: away.image_path }}
                        style={spmStyles.shareScoreLogo}
                        contentFit="contain"
                      />
                    ) : null}
                  </View>
                </View>

                <View style={spmStyles.shareNameRow}>
                  {playerImageUri ? (
                    <Image
                      source={{ uri: playerImageUri }}
                      style={[
                        spmStyles.shareInitialsCircle,
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
                        spmStyles.shareInitialsCircle,
                        {
                          backgroundColor: `${teamColor}30`,
                          borderColor: teamColor,
                          borderWidth: 2,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          spmStyles.shareInitialsText,
                          { color: textOnTeam },
                        ]}
                      >
                        {playerInitials}
                      </Text>
                    </View>
                  )}

                  <View style={spmStyles.shareNameRight}>
                    <View style={spmStyles.shareSummaryRow}>
                      {summaryStats.map(({ label, value }) => (
                        <View key={label} style={spmStyles.shareSummaryCell}>
                          <Text
                            style={[
                              spmStyles.shareSummaryVal,
                              { color: theme.text },
                            ]}
                          >
                            {value != null ? String(value) : "0"}
                          </Text>
                          <Text
                            style={[
                              spmStyles.shareSummaryLbl,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {label}
                          </Text>
                        </View>
                      ))}
                    </View>

                    <View style={spmStyles.shareMetaRow}>
                      <View style={spmStyles.shareMetaLeft}>
                        <Text
                          style={[spmStyles.shareName, { color: theme.text }]}
                          numberOfLines={1}
                        >
                          {fullName}
                        </Text>
                        <View style={spmStyles.shareTeamRow}>
                          {resolvedTeam?.image_path ? (
                            <Image
                              source={{ uri: resolvedTeam.image_path }}
                              style={spmStyles.shareTeamLogo}
                              contentFit="contain"
                            />
                          ) : null}
                          <Text
                            style={[
                              spmStyles.shareTeamLabel,
                              { color: theme.textSecondary },
                            ]}
                            numberOfLines={1}
                          >
                            {teamName}
                          </Text>
                        </View>
                      </View>

                      {gameDateParts ? (
                        <View style={spmStyles.shareDateBlock}>
                          <Text
                            style={[
                              spmStyles.shareDateText,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {gameDateParts.monthDate}
                          </Text>
                          <Text
                            style={[
                              spmStyles.shareDateText,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {gameDateParts.year}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>

              <View style={spmStyles.shareStatGrid}>
                {shareStatItems.map(({ label, value, pct }, i) => (
                  <View
                    key={label}
                    style={[
                      spmStyles.shareStatCell,
                      { borderColor: theme.border },
                      i % 3 !== 2 && {
                        borderRightWidth: StyleSheet.hairlineWidth,
                      },
                      i < 6 && { borderBottomWidth: StyleSheet.hairlineWidth },
                    ]}
                  >
                    {!!pct && (
                      <Text
                        style={[
                          spmStyles.shareStatPct,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {pct}
                      </Text>
                    )}
                    <Text
                      style={[spmStyles.shareStatVal, { color: theme.text }]}
                    >
                      {value != null ? String(value) : "0"}
                    </Text>
                    <Text
                      style={[
                        spmStyles.shareStatLbl,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {label}
                    </Text>
                  </View>
                ))}
              </View>

              <View
                style={[
                  spmStyles.shareFooter,
                  { borderTopColor: theme.border },
                ]}
              >
                <Text style={[spmStyles.shareBrand, { color: theme.text }]}>
                  SportsHeart{" "}
                  <Ionicons name="heart" size={10} color={colors.primary} />
                </Text>
              </View>
            </View>
          </ViewShot>

          <View style={spmStyles.shareActions}>
            <TouchableOpacity
              style={[
                spmStyles.shareActionBtn,
                { backgroundColor: colors.primary },
              ]}
              onPress={handlePlayerShare}
              disabled={sharingPlayerCard}
            >
              {sharingPlayerCard ? (
                <Text style={spmStyles.shareActionBtnText}>Sharing...</Text>
              ) : (
                <>
                  <Ionicons name="share-outline" size={18} color="#fff" />
                  <Text style={spmStyles.shareActionBtnText}>Share</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                spmStyles.shareActionBtn,
                { backgroundColor: theme.surfaceSecondary },
              ]}
              onPress={() => setPlayerShareVisible(false)}
            >
              <Text
                style={[spmStyles.shareActionBtnText, { color: theme.text }]}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

// ─── Tabs ────────────────────────────────────────────────────────────────────
const TABS = ["Main", "Home", "Away", "Stats", "Commentary", "Ball", "H2H"];

// ─── Main screen ──────────────────────────────────────────────────────────────
const Top5GameDetailsScreen = ({ navigation, route }) => {
  const { colors, theme, isDarkMode } = useTheme();
  const { fixtureId, homeTeamId, awayTeamId } = route.params ?? {};

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { viewerData, isJoined } = useGamePresence(fixtureId);
  const [error, setError] = useState(null);
  const [headerH, setHeaderH] = useState(180);
  const [activeTab, setActiveTab] = useState("Main");
  const [performerMode, setPerformerMode] = useState("match");
  const [playerModalContext, setPlayerModalContext] = useState(null);
  const [h2hVisibleCount, setH2hVisibleCount] = useState(5);
  const [h2hHomeOnly, setH2hHomeOnly] = useState(false);
  const [snapshotTsMs, setSnapshotTsMs] = useState(Date.now());
  const [nowMs, setNowMs] = useState(Date.now());
  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const dataRef = useRef(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const fetchCacheRef = useRef(null);
  const inFlightRef = useRef(null);
  const tickClockStateRef = useRef({});

  const applyTickingSnapshot = useCallback(
    (fixtureData) => {
      if (!fixtureData) return fixtureData;

      const key = String(fixtureData?.id ?? fixtureId ?? "fixture");
      const fetchTs = Date.now();
      const ticking = (fixtureData?.periods ?? []).find(
        (p) => p?.ticking === true,
      );

      if (!ticking) {
        delete tickClockStateRef.current[key];
        return {
          ...fixtureData,
          __tickAnchorTotal: null,
          __tickAnchorTs: null,
        };
      }

      const m = Number(ticking?.minutes ?? 0);
      const s = Number(ticking?.seconds ?? 0);
      const safeM = Number.isFinite(m) ? m : 0;
      const safeS = Number.isFinite(s) ? s : 0;
      const tickSig = `${safeM}:${safeS}`;
      const prev = tickClockStateRef.current[key];

      if (!prev || prev.lastFetchedSig !== tickSig) {
        tickClockStateRef.current[key] = {
          lastFetchedSig: tickSig,
          anchorTotal: safeM * 60 + safeS,
          anchorTs: fetchTs,
        };
      }

      const current = tickClockStateRef.current[key];
      return {
        ...fixtureData,
        __tickAnchorTotal: current.anchorTotal,
        __tickAnchorTs: current.anchorTs,
      };
    },
    [fixtureId],
  );

  const loadData = useCallback(
    async (silent = false, background = false) => {
      const now = Date.now();
      const cached = fetchCacheRef.current;
      if (cached) {
        const policy = getFixturePolicy(cached.data?.fixtureData ?? null);
        const cacheMs = policy.cacheMs ?? 0;
        const canUseCache =
          cacheMs > 0 &&
          now - cached.ts < cacheMs &&
          !(background && policy.mode === "live");

        if (canUseCache) {
          setData(cached.data);
          setSnapshotTsMs(cached.ts);
          return cached.data;
        }
      }

      if (inFlightRef.current) return inFlightRef.current;

      const promise = (async () => {
        if (!silent) setLoading(true);
        setError(null);
        try {
          const gameUrl = `${FOOTBALL_BASE}/football/game/${fixtureId}/${homeTeamId}/${awayTeamId}`;
          const h2hUrl = `${FOOTBALL_BASE}/football/game/h2h/${homeTeamId}/${awayTeamId}`;
          const factsUrl = `${FOOTBALL_BASE}/football/game/facts/${fixtureId}`;

          // ── AsyncStorage cache for finished / old games ───────────────────
          if (!silent) {
            try {
              const raw = await AsyncStorage.getItem(GAME_CACHE_KEY(fixtureId));
              if (raw) {
                const { data: cachedData, ts } = JSON.parse(raw);
                if (Date.now() - ts < GAME_CACHE_TTL_MS) {
                  setData(cachedData);
                  setSnapshotTsMs(Number(ts) || Date.now());
                }
              }
            } catch (_) {}
          }

          let responseData = null;

          if (background) {
            const gameRes = await fetch(gameUrl);
            if (!gameRes.ok) throw new Error(`HTTP ${gameRes.status}`);

            const gameJson = await gameRes.json();
            responseData = {
              fixtureData: applyTickingSnapshot(
                gameJson?.data?.fixtureData ?? null,
              ),
              h2hData: dataRef.current?.h2hData ?? [],
              matchFacts: dataRef.current?.matchFacts ?? [],
            };
          } else {
            let cachedH2hData = dataRef.current?.h2hData ?? [];
            let cachedFactsData = dataRef.current?.matchFacts ?? [];
            let shouldFetchH2h = true;
            let shouldFetchFacts = true;

            try {
              const [h2hRaw, factsRaw] = await Promise.all([
                AsyncStorage.getItem(
                  GAME_H2H_CACHE_KEY(homeTeamId, awayTeamId),
                ),
                AsyncStorage.getItem(GAME_FACTS_CACHE_KEY(fixtureId)),
              ]);

              if (h2hRaw) {
                const parsed = JSON.parse(h2hRaw);
                if (
                  Date.now() - Number(parsed?.ts ?? 0) <
                    GAME_AUX_CACHE_TTL_MS &&
                  Array.isArray(parsed?.data)
                ) {
                  cachedH2hData = parsed.data;
                  shouldFetchH2h = false;
                }
              }

              if (factsRaw) {
                const parsed = JSON.parse(factsRaw);
                if (
                  Date.now() - Number(parsed?.ts ?? 0) <
                    GAME_AUX_CACHE_TTL_MS &&
                  Array.isArray(parsed?.data)
                ) {
                  cachedFactsData = parsed.data;
                  shouldFetchFacts = false;
                }
              }
            } catch (_) {}

            const [gameRes, h2hRes, factsRes] = await Promise.all([
              fetch(gameUrl),
              shouldFetchH2h ? fetch(h2hUrl) : Promise.resolve(null),
              shouldFetchFacts ? fetch(factsUrl) : Promise.resolve(null),
            ]);

            if (!gameRes.ok) throw new Error(`HTTP ${gameRes.status}`);

            const gameJson = await gameRes.json();

            let h2hData = cachedH2hData;
            if (h2hRes) {
              if (h2hRes.ok) {
                const h2hJson = await h2hRes.json();
                h2hData = h2hJson?.data?.h2hData ?? cachedH2hData;
                AsyncStorage.setItem(
                  GAME_H2H_CACHE_KEY(homeTeamId, awayTeamId),
                  JSON.stringify({ data: h2hData, ts: Date.now() }),
                ).catch(() => {});
              } else {
                console.warn(`Top5 h2h fetch error: HTTP ${h2hRes.status}`);
              }
            }

            let matchFacts = cachedFactsData;
            if (factsRes) {
              if (factsRes.ok) {
                const factsJson = await factsRes.json();
                matchFacts = factsJson?.data?.matchFacts ?? cachedFactsData;
                AsyncStorage.setItem(
                  GAME_FACTS_CACHE_KEY(fixtureId),
                  JSON.stringify({ data: matchFacts, ts: Date.now() }),
                ).catch(() => {});
              } else {
                console.warn(`Top5 facts fetch error: HTTP ${factsRes.status}`);
              }
            }

            responseData = {
              fixtureData: applyTickingSnapshot(
                gameJson?.data?.fixtureData ?? null,
              ),
              h2hData,
              matchFacts,
            };
          }

          setData(responseData);
          const ts = Date.now();
          setSnapshotTsMs(ts);
          fetchCacheRef.current = { data: responseData, ts };

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
          return responseData;
        } catch (err) {
          console.error("Top5 game fetch error:", err);
          if (!silent) setError("Failed to load match data.");
          return null;
        } finally {
          if (!silent) setLoading(false);
        }
      })();

      inFlightRef.current = promise;
      try {
        return await promise;
      } finally {
        inFlightRef.current = null;
      }
    },
    [fixtureId, homeTeamId, awayTeamId, applyTickingSnapshot],
  );

  // ── Polling (same pattern as Top5ScoreboardScreen) ───────────────────────
  const intervalRef = useRef(null);
  const currentIntervalMs = useRef(null);
  const isFocusedRef = useRef(false);

  const schedulePolling = useCallback(
    (fixture) => {
      if (!isFocusedRef.current) return;
      const desired = getFixturePolicy(fixture).intervalMs;

      if (currentIntervalMs.current === desired && intervalRef.current) return;

      if (intervalRef.current) clearInterval(intervalRef.current);
      currentIntervalMs.current = desired;
      intervalRef.current = setInterval(async () => {
        const fresh = await loadData(true, true);
        schedulePolling(
          fresh?.fixtureData ?? dataRef.current?.fixtureData ?? null,
        );
      }, desired);
    },
    [loadData],
  );

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      const hasExistingData = !!dataRef.current?.fixtureData;
      loadData(hasExistingData, false).then((fresh) => {
        schedulePolling(
          fresh?.fixtureData ?? dataRef.current?.fixtureData ?? null,
        );
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
    const fresh = await loadData(true, false);
    schedulePolling(fresh?.fixtureData ?? dataRef.current?.fixtureData ?? null);
    setRefreshing(false);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const fixture = data?.fixtureData ?? null;
  const ballCoordinates =
    fixture?.ballcoordinates ?? fixture?.ballCoordinates ?? [];

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
  const statusInfo = getStatusInfo(fixture, nowMs, snapshotTsMs);
  const hasLineups = (fixture?.lineups ?? []).length > 0;
  const isScheduledGame =
    !stateCode ||
    ["NS", "TBA", "DELAYED"].includes((stateCode || "").toUpperCase());

  const availableTabs = useMemo(
    () =>
      TABS.filter((tab) => {
        if (
          (tab === "Stats" || tab === "Commentary" || tab === "Ball") &&
          isScheduledGame
        ) {
          return false;
        }
        if ((tab === "Home" || tab === "Away") && !hasLineups) {
          return false;
        }
        return true;
      }),
    [isScheduledGame, hasLineups],
  );

  useEffect(() => {
    if (!availableTabs.includes(activeTab)) {
      setActiveTab("Main");
    }
  }, [availableTabs, activeTab]);

  const homeWins = home?.meta?.winner === true;
  const awayWins = away?.meta?.winner === true;

  const { homeColor, awayColor } = resolveMatchColors({
    homePrimary: home?.colorPrimary,
    homeSecondary: home?.colorSecondary,
    awayPrimary: away?.colorPrimary,
    awaySecondary: away?.colorSecondary,
    homeFallback: colors.primary,
    awayFallback: colors.secondary || "#666",
  });

  const { homeManager, awayManager } = useMemo(() => {
    const coaches = fixture?.coaches ?? [];
    if (!coaches.length) {
      return { homeManager: null, awayManager: null };
    }

    const getCoachParticipantId = (coachEntry) =>
      coachEntry?.meta?.participant_id ??
      coachEntry?.coach?.meta?.participant_id ??
      coachEntry?.participant_id ??
      coachEntry?.coach?.participant_id ??
      null;

    let mappedHome = null;
    let mappedAway = null;

    for (const coachEntry of coaches) {
      const participantId = getCoachParticipantId(coachEntry);
      if (participantId === home?.id && !mappedHome) mappedHome = coachEntry;
      if (participantId === away?.id && !mappedAway) mappedAway = coachEntry;
    }

    // If coaches do not expose participant mapping, fallback to array order.
    const coachesWithoutParticipant = coaches.filter(
      (coachEntry) => getCoachParticipantId(coachEntry) == null,
    );

    if (!mappedHome && coachesWithoutParticipant.length > 0) {
      mappedHome = coachesWithoutParticipant[0];
    }

    if (!mappedAway && coachesWithoutParticipant.length > 1) {
      mappedAway = coachesWithoutParticipant[1];
    }

    if (!mappedHome) mappedHome = coaches[0] ?? null;
    if (!mappedAway) mappedAway = coaches[1] ?? coaches[0] ?? null;

    return { homeManager: mappedHome, awayManager: mappedAway };
  }, [fixture, home, away]);

  const redCardsByTeam = useMemo(() => {
    const counts = { home: 0, away: 0 };
    for (const event of fixture?.events ?? []) {
      const addLow = (event?.addition || "").toLowerCase();
      if (!addLow.includes("red")) continue;
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

  const openPlayerModal = useCallback(
    (payload) => {
      if (!payload) return;

      const allLineups = fixture?.lineups ?? [];
      const team = payload?.team ?? null;

      let lineup = payload?.lineup ?? null;
      if (!lineup && payload?.playerId != null) {
        lineup =
          allLineups.find(
            (l) =>
              l?.player_id === payload.playerId &&
              (team?.id == null || l?.team_id === team.id),
          ) ?? allLineups.find((l) => l?.player_id === payload.playerId);
      }

      if (!lineup && !payload?.player) return;

      const resolvedTeam =
        team ??
        (lineup?.team_id === home?.id
          ? home
          : lineup?.team_id === away?.id
            ? away
            : null);

      const fallbackLineup = lineup ?? {
        player_id: payload?.playerId ?? payload?.player?.id ?? null,
        team_id: resolvedTeam?.id ?? null,
        player: payload?.player ?? null,
        details: [],
        position: null,
        detailedposition: null,
      };

      setPlayerModalContext({ lineup: fallbackLineup, team: resolvedTeam });
    },
    [fixture, home, away],
  );

  const closePlayerModal = useCallback(() => {
    setPlayerModalContext(null);
  }, []);

  const h2hMatches = useMemo(() => {
    const matches = data?.h2hData ?? [];
    if (!matches.length || !home?.id || !away?.id) return [];

    return matches.filter((m) => {
      if (m?.id === fixture?.id) return false;

      const participants = m?.participants ?? [];
      const homeParticipant = participants.find((p) => p?.id === home.id);
      const awayParticipant = participants.find((p) => p?.id === away.id);
      if (!homeParticipant || !awayParticipant) return false;

      if (h2hHomeOnly && homeParticipant?.meta?.location !== "home") {
        return false;
      }

      return true;
    });
  }, [data, fixture, home, away, h2hHomeOnly]);

  const h2hSummary = useMemo(() => {
    if (!h2hMatches.length || !home?.id || !away?.id) {
      return { homeWins: 0, awayWins: 0, draws: 0 };
    }

    let homeWinsCount = 0;
    let awayWinsCount = 0;
    let drawsCount = 0;

    for (const m of h2hMatches) {
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
  }, [h2hMatches, home, away]);

  useEffect(() => {
    if (activeTab !== "H2H") {
      setH2hVisibleCount(5);
      setH2hHomeOnly(false);
    }
  }, [activeTab]);

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
                  style={[
                    styles.leagueLogo,
                    {
                      tintColor:
                        fixture.league?.id === 8 && isDarkMode
                          ? theme.text
                          : undefined,
                    },
                  ]}
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
            <StatusBadge
              fixture={fixture}
              theme={theme}
              nowMs={nowMs}
              snapshotTsMs={snapshotTsMs}
            />

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
                    style={[
                      styles.scorerText,
                      { color: theme.textSecondary, textAlign: "right" },
                    ]}
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
              <Text style={[styles.miniAbbr, { color: theme.text }]}>
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
              {statusInfo.isLive ? (
                <>
                  <Text
                    style={[
                      styles.miniStatusLine,
                      { color: theme.error || "#e03131" },
                    ]}
                  >
                    {statusInfo.line1}
                  </Text>
                  <Text
                    style={[
                      styles.miniStatusSub,
                      { color: theme.textTertiary },
                    ]}
                  >
                    {statusInfo.line2 || ""}
                  </Text>
                </>
              ) : statusInfo.isFinished ? (
                <>
                  <Text
                    style={[
                      styles.miniStatusLine,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {statusInfo.line1}
                  </Text>
                  <Text
                    style={[
                      styles.miniStatusSub,
                      { color: theme.textTertiary },
                    ]}
                    numberOfLines={1}
                  >
                    {statusInfo.line2}
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
                    {statusInfo.line1}
                  </Text>
                  <Text
                    style={[
                      styles.miniStatusSub,
                      { color: theme.textTertiary },
                    ]}
                    numberOfLines={1}
                  >
                    {statusInfo.line2}
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
              <Text style={[styles.miniAbbr, { color: theme.text }]}>
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
            {availableTabs.map((tab) => (
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
                  home={home}
                  away={away}
                  homeColor={homeColor}
                  awayColor={awayColor}
                  theme={theme}
                  colors={colors}
                  onPress={() =>
                    openPlayerModal({
                      lineup: manOfTheMatch?.lineup,
                      team: manOfTheMatch?.team,
                    })
                  }
                />
              ) : null}
              <EventsSection
                events={fixture.events ?? []}
                comments={fixture.comments ?? []}
                periods={fixture.periods ?? []}
                scores={fixture.scores ?? []}
                lineups={fixture.lineups ?? []}
                participants={fixture.participants ?? []}
                stateCode={stateCode}
                homeId={home?.id}
                awayId={away?.id}
                theme={theme}
                accentColor={homeColor}
                colors={colors}
                onPlayerPress={openPlayerModal}
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
                onPlayerPress={openPlayerModal}
              />
              <GameInfoSection
                venue={fixture.venue ?? null}
                weather={fixture.weatherreport ?? null}
                league={fixture.league ?? null}
                round={fixture.round ?? null}
                startingAt={fixture.starting_at ?? null}
                theme={theme}
                isDarkMode={isDarkMode}
              />
              <RefereesSection
                referees={fixture.referees ?? []}
                theme={theme}
                navigation={navigation}
              />
            </View>
          )}
          {activeTab === "Home" && (
            <View style={{ paddingTop: 6 }}>
              <HomeTeamOverviewSection
                team={home}
                formations={fixture.formations ?? []}
                lineups={fixture.lineups ?? []}
                teamColor={homeColor}
                theme={theme}
              />
              <HomeTeamPitchSection
                team={home}
                formations={fixture.formations ?? []}
                lineups={fixture.lineups ?? []}
                events={fixture.events ?? []}
                teamColor={homeColor}
                isDarkMode={isDarkMode}
                reverseFormationX={true}
                onPlayerPress={openPlayerModal}
                theme={theme}
              />
              <HomeSidelinedSection
                team={home}
                sidelined={fixture.sidelined ?? []}
                teamColor={homeColor}
                onPlayerPress={openPlayerModal}
                theme={theme}
              />
              <HomeManagerSection
                manager={homeManager}
                teamColor={homeColor}
                theme={theme}
                navigation={navigation}
              />
            </View>
          )}
          {activeTab === "Away" && (
            <View style={{ paddingTop: 6 }}>
              <HomeTeamOverviewSection
                team={away}
                formations={fixture.formations ?? []}
                lineups={fixture.lineups ?? []}
                teamColor={awayColor}
                theme={theme}
              />
              <HomeTeamPitchSection
                team={away}
                formations={fixture.formations ?? []}
                lineups={fixture.lineups ?? []}
                events={fixture.events ?? []}
                teamColor={awayColor}
                isDarkMode={isDarkMode}
                reverseFormationX={false}
                onPlayerPress={openPlayerModal}
                theme={theme}
              />
              <HomeSidelinedSection
                team={away}
                sidelined={fixture.sidelined ?? []}
                teamColor={awayColor}
                onPlayerPress={openPlayerModal}
                theme={theme}
              />
              <HomeManagerSection
                manager={awayManager}
                teamColor={awayColor}
                theme={theme}
                navigation={navigation}
              />
            </View>
          )}
          {activeTab === "Stats" && (
            <StatsSection
              statistics={fixture.statistics ?? []}
              lineups={fixture.lineups ?? []}
              home={home}
              away={away}
              homeColor={homeColor}
              awayColor={awayColor}
              theme={theme}
            />
          )}
          {activeTab === "Commentary" && (
            <View style={{ paddingTop: 6 }}>
              <CommentarySection
                comments={fixture.comments ?? []}
                events={fixture.events ?? []}
                periods={fixture.periods ?? []}
                lineups={fixture.lineups ?? []}
                participants={fixture.participants ?? []}
                theme={theme}
                colors={colors}
                onPlayerPress={openPlayerModal}
              />
            </View>
          )}
          {activeTab === "Ball" && (
            <BallSection
              ballCoordinates={ballCoordinates}
              periods={fixture.periods ?? []}
              home={home}
              away={away}
              homeColor={homeColor}
              awayColor={awayColor}
              theme={theme}
              colors={colors}
            />
          )}
          {activeTab === "H2H" && (
            <View style={{ paddingTop: 6 }}>
              <H2HSummarySection
                home={home}
                away={away}
                summary={h2hSummary}
                theme={theme}
                homeColor={homeColor}
                awayColor={away?.colorPrimary || colors.primary}
                homeOnly={h2hHomeOnly}
                onToggleHomeOnly={() => {
                  setH2hHomeOnly((prev) => !prev);
                  setH2hVisibleCount(5);
                }}
              />

              <View style={h2hStyles.matchesWrap}>
                {h2hMatches.slice(0, h2hVisibleCount).map((match) => (
                  <H2HMatchCard
                    key={String(match?.id)}
                    match={match}
                    theme={theme}
                    navigation={navigation}
                  />
                ))}

                {h2hMatches.length === 0 ? (
                  <Text
                    style={[
                      h2hStyles.emptyText,
                      { color: theme.textTertiary, borderColor: theme.border },
                    ]}
                  >
                    No H2H matches available for this filter.
                  </Text>
                ) : null}

                {h2hVisibleCount < h2hMatches.length ? (
                  <TouchableOpacity
                    style={[
                      h2hStyles.showMoreBtn,
                      {
                        borderColor: theme.border,
                        backgroundColor: theme.surface,
                      },
                    ]}
                    onPress={() =>
                      setH2hVisibleCount((prev) =>
                        Math.min(prev + 5, h2hMatches.length),
                      )
                    }
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        h2hStyles.showMoreText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Show more
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          )}
        </View>

        <SoccerPlayerDetailModal
          visible={!!playerModalContext}
          onClose={closePlayerModal}
          lineup={playerModalContext?.lineup ?? null}
          team={playerModalContext?.team ?? null}
          allLineups={fixture?.lineups ?? []}
          home={home}
          away={away}
          homeScore={homeScore}
          awayScore={awayScore}
          startingAt={fixture?.starting_at ?? null}
          theme={theme}
          colors={colors}
        />

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

  homeTabTeamCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  homeTabTeamLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  homeTabTeamLogo: {
    width: 36,
    height: 36,
  },
  homeTabTeamLogoFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  homeTabTeamLogoFallbackText: {
    fontSize: 14,
    fontWeight: "800",
  },
  homeTabTeamTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  homeTabTeamName: {
    fontSize: 16,
    fontWeight: "800",
  },
  homeTabTeamFormation: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
  },
  homeTabRatingWrap: {
    alignItems: "flex-end",
    minWidth: 58,
  },
  homeTabRatingValue: {
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 28,
  },
  homeTabRatingLabel: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  homeFootballPitch: {
    width: width - 24,
    height: Math.round((width - 40) * 1.2),
    alignSelf: "center",
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#777",
    position: "relative",
    overflow: "hidden",
  },
  homePitchCenterCircle: {
    position: "absolute",
    top: "-0.5%",
    left: "29.5%",
    width: "41%",
    height: "20%",
    borderWidth: 2,
    borderColor: "#777",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 120,
    borderBottomRightRadius: 120,
    backgroundColor: "transparent",
  },
  homePitchPenaltyBox: {
    position: "absolute",
    bottom: 0,
    left: "20%",
    width: "60%",
    height: "25%",
    borderWidth: 2,
    borderColor: "#777",
    borderBottomWidth: 0,
    backgroundColor: "transparent",
  },
  homePitchGoalBox: {
    position: "absolute",
    bottom: 0,
    left: "32.5%",
    width: "35%",
    height: "12%",
    borderWidth: 2,
    borderColor: "#777",
    borderBottomWidth: 0,
    backgroundColor: "transparent",
  },
  homePitchPenaltyArc: {
    position: "absolute",
    top: "63.5%",
    left: "37.7%",
    width: "24.6%",
    height: "12%",
    borderWidth: 2,
    borderColor: "#777",
    borderTopLeftRadius: 60,
    borderTopRightRadius: 60,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: "transparent",
  },
  homePitchGridRow: {
    flex: 1,
    flexDirection: "row",
  },
  homePitchGridCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  homePitchPlayersOverlay: {
    transform: [{ translateY: 5 }],
    ...StyleSheet.absoluteFillObject,
  },
  homePitchPlayerWrap: {
    width: 86,
    alignItems: "center",
  },
  homePitchPlayerCard: {
    width: 55,
    height: 55,
    position: "relative",
  },
  homePitchPlayerAvatar: {
    width: 55,
    height: 55,
    borderRadius: 27.5,
    borderWidth: 1,
  },
  homePitchPlayerInitial: {
    fontSize: 20,
    fontWeight: "800",
  },
  homePitchPlayerMetaRow: {
    marginTop: 3,
    maxWidth: 86,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  homePitchPlayerJersey: {
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 12,
  },
  homePitchPlayerLastName: {
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 12,
    maxWidth: 66,
  },
  homePitchRatingBadge: {
    position: "absolute",
    top: -3,
    right: -9,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    minWidth: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  homePitchRatingBadgeText: {
    fontSize: 9,
    fontWeight: "800",
  },
  homePitchIconBubble: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  homePitchIconTopLeft: {
    top: 0,
    left: -3,
  },
  homePitchIconBottomRight: {
    bottom: -3,
    right: 3,
  },
  homePitchIconBottomLeft: {
    bottom: -3,
    left: 3,
  },
  homePitchIconMiddleLeft: {
    top: 21,
    left: 3,
  },
  homePitchIconMiddleRight: {
    top: 21,
    right: -9,
  },
  homePitchSubMinuteText: {
    position: "absolute",
    top: -12,
    left: "50%",
    marginLeft: -20,
    width: 40,
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  homePitchDualCardWrap: {
    width: 12,
    height: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  homePitchDualCardTop: {
    position: "absolute",
    top: -1,
    right: -1,
  },
  homePitchCaptainText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#000",
    lineHeight: 12,
  },
  homeBenchCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  homeBenchHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  homeBenchTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  homeBenchGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingTop: 12,
    paddingHorizontal: 6,
  },
  homeBenchItem: {
    width: "50%",
    alignItems: "center",
    marginBottom: 24,
  },
  homeBenchPosition: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "500",
    textAlign: "center",
    maxWidth: 86,
  },
  homeManagerCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 2,
    overflow: "hidden",
  },
  homeManagerHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: -10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  homeManagerTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  homeManagerBody: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  homeManagerAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
  },
  homeManagerInitial: {
    fontSize: 20,
    fontWeight: "800",
  },
  homeManagerNameWrap: {
    flex: 1,
    minWidth: 0,
  },
  homeManagerFirstName: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
  homeManagerLastName: {
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 24,
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
    flex: 1,
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
  playerPopupTeamLogo: {
    width: 26,
    height: 26,
  },
  playerPopupTeamLogoFallback: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  playerPopupTeamLogoFallbackText: {
    fontSize: 10,
    fontWeight: "800",
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
  summaryFooter: {
    height: 12.5,
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summaryFooterFill: {
    height: "100%",
  },
  homeFilterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  homeFilterLogo: {
    width: 14,
    height: 14,
  },
  homeFilterLogoFallback: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  homeFilterLogoFallbackText: {
    fontSize: 8,
    fontWeight: "800",
  },
  homeFilterText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  matchesWrap: {
    marginHorizontal: 12,
    marginTop: 10,
    gap: 10,
  },
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
  matchCardTopText: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  matchCardBody: {
    overflow: "hidden",
  },
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
  matchTeamLogo: { width: 36, height: 36 },
  logoFallback: {
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  logoFallbackText: {
    fontSize: 13,
    fontWeight: "700",
  },
  matchTeamName: {
    fontSize: 13,
    fontWeight: "500",
    flexWrap: "wrap",
  },
  matchTeamTextCol: {
    flex: 1,
    minWidth: 0,
  },
  matchTeamTextColAway: {
    alignItems: "flex-end",
  },
  matchTeamNameAway: {
    textAlign: "right",
  },
  matchTeamPlace: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "500",
  },
  matchTeamPlaceAway: {
    textAlign: "right",
  },
  matchScoreBlock: {
    alignItems: "center",
    paddingHorizontal: 8,
    minWidth: 80,
  },
  matchScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  matchScore: {
    fontSize: 22,
    minWidth: 24,
    textAlign: "center",
  },
  matchScoreDash: {
    fontSize: 18,
  },
  matchStatusText: {
    fontSize: 10,
    marginTop: 4,
  },
  matchCardBottomText: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
  },
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
  showMoreText: {
    fontSize: 12,
    fontWeight: "700",
  },
});

const stStyles = StyleSheet.create({
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  rowWrap: {
    gap: 5,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  valueText: {
    fontSize: 12,
    fontWeight: "700",
    minWidth: 44,
  },
  valueLeft: {
    textAlign: "left",
  },
  valueRight: {
    textAlign: "right",
  },
  barTrack: {
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    position: "relative",
  },
  barFillLeft: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
  },
  barFillRight: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  statName: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 1,
  },
  mainBlock: {
    gap: 8,
    marginBottom: 4,
  },
  mainLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  posTrack: {
    height: 28,
    borderRadius: 999,
    overflow: "hidden",
    position: "relative",
  },
  posFillLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
  },
  posFillRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  posFillText: {
    fontSize: 11,
    fontWeight: "800",
  },
  goalWidgetWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  outerShotPill: {
    minWidth: 44,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  outerShotText: {
    fontSize: 12,
    fontWeight: "800",
  },
  goalFrame: {
    flex: 1,
    height: 56,
    borderWidth: 1,
    borderRadius: 10,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  goalInner: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  goalInnerPill: {
    flex: 1,
    borderRadius: 999,
    minHeight: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  goalInnerText: {
    fontSize: 12,
    fontWeight: "800",
  },
  shotsSimpleOuter: {
    height: 130,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "hidden",
    position: "relative",
  },
  shotsSimpleOuterValuesLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  shotsSimpleOuterFillLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  shotsSimpleOuterFillRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
  },
  shotsSimpleOuterValuesRow: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 2,
  },
  shotsSimpleOuterValueText: {
    fontSize: 25,
    fontWeight: "900",
    minWidth: 36,
  },
  shotsSimpleOuterValueLeft: {
    textAlign: "left",
  },
  shotsSimpleOuterValueRight: {
    textAlign: "right",
  },
  shotsSimpleOuterValueSpacer: {
    minWidth: 36,
  },
  shotsSimpleInner: {
    width: "62%",
    height: "62.5%",
    borderBottomWidth: 0,
    borderWidth: 10,
    borderColor: "#ffffff",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    justifyContent: "center",
  },
  shotsSimpleInnerValues: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  shotsSimpleFillLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  shotsSimpleFillRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  shotsSimpleInnerValueText: {
    fontSize: 22,
    fontWeight: "900",
  },
  /* Box (copied from shotsSimple and renamed to box*) */
  boxOuter: {
    height: 130,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "hidden",
    position: "relative",
  },
  boxOuterValuesLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  boxOuterFillLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  boxOuterFillRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
  },
  boxOuterValuesRow: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 2,
  },
  boxOuterValueText: {
    fontSize: 25,
    fontWeight: "900",
    minWidth: 36,
  },
  boxOuterValueLeft: {
    textAlign: "left",
  },
  boxOuterValueRight: {
    textAlign: "right",
  },
  boxOuterValueSpacer: {
    minWidth: 36,
  },
  boxInner: {
    width: "62%",
    height: "62.5%",
    borderBottomWidth: 0,
    borderWidth: 10,
    borderColor: "#ffffff",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    justifyContent: "center",
  },
  boxInnerValues: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  boxFillLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  boxFillRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  boxInnerValueText: {
    fontSize: 22,
    fontWeight: "900",
  },
  boxInnerValuePosLeft: {
    position: "absolute",
    top: 8,
    left: 8,
  },
  boxInnerValuePosRight: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  /* Second inner box */
  boxInnerInner: {
    bottom: -40,
    width: "44%",
    height: "44%",
    borderBottomWidth: 0,
    borderWidth: 8,
    borderColor: "#ccc",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    alignSelf: "center",
    marginBottom: 6,
    overflow: "hidden",
    justifyContent: "center",
  },
  /* Semicircle sitting on top of the first inner */
  boxSemiCircle: {
    position: "absolute",
    top: -45,
    alignSelf: "center",
    width: "45%",
    height: 45,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: "hidden",
    borderWidth: 8,
    borderColor: "#ccc",
    backgroundColor: "transparent",
  },
  shotsGoalPanel: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 12,
    overflow: "hidden",
    gap: 10,
  },
  shotsRow: {
    minHeight: 38,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
  },
  shotsHalfFillLeft: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "50%",
  },
  shotsHalfFillRight: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: "50%",
  },
  shotsRowValue: {
    width: 40,
    fontSize: 13,
    fontWeight: "900",
  },
  shotsRowValueLeft: {
    textAlign: "left",
    paddingLeft: 4,
  },
  shotsRowValueRight: {
    textAlign: "right",
    paddingRight: 4,
  },
  shotsRowLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
  },
  goalFrameCard: {
    marginHorizontal: 2,
    borderWidth: 1.25,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  goalInnerFrameCard: {
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 36,
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  boxAreaFrame: {
    flex: 1,
    height: 62,
    borderWidth: 1,
    borderRadius: 10,
    justifyContent: "flex-end",
    paddingHorizontal: 8,
    paddingBottom: 7,
    position: "relative",
  },
  boxAreaInner: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  boxSemiArc: {
    position: "absolute",
    top: -11,
    left: "50%",
    width: 44,
    height: 22,
    marginLeft: -22,
    borderWidth: 1,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomWidth: 0,
    backgroundColor: "transparent",
  },
  customBarsWrap: {
    gap: 4,
  },
  customBarsLabel: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  attackField: {
    height: 130,
    borderRadius: 10,
    borderWidth: 2,
    overflow: "hidden",
    position: "relative",
    justifyContent: "center",
  },
  attackFillLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  attackFillRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
  },
  attackLineTopLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    width: "50%",
    height: 1,
  },
  attackLineTopRight: {
    position: "absolute",
    right: 0,
    top: 0,
    width: "50%",
    height: 1,
  },
  attackLineBottomLeft: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: "50%",
    height: 1,
  },
  attackLineBottomRight: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: "50%",
    height: 1,
  },
  attackLineMid: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "50%",
    width: 1,
  },
  attackCircle: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    left: "50%",
    top: "50%",
    marginLeft: -15,
    marginTop: -15,
  },
  attackBoxLeft: {
    position: "absolute",
    left: 0,
    top: "33%",
    width: 24,
    height: "34%",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderRightWidth: 1,
  },
  attackBoxRight: {
    position: "absolute",
    right: 0,
    top: "33%",
    width: 24,
    height: "34%",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
  },
  attackValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
  },
  attackSideLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  attackSideRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  attackArrow: {
    fontWeight: "900",
    lineHeight: 20,
  },
  attackValue: {
    fontWeight: "900",
    lineHeight: 24,
  },
  emptyText: {
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 8,
  },
});

const ballStyles = StyleSheet.create({
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
  headerMeta: {
    fontSize: 11,
    fontWeight: "700",
  },
  emptyWrap: {
    paddingHorizontal: 14,
    paddingVertical: 18,
  },
  emptyText: {
    fontSize: 12,
    textAlign: "center",
  },
  filtersWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 7,
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  pitch: {
    marginHorizontal: 14,
    marginTop: 12,
    height: 190,
    borderRadius: 10,
    borderWidth: 1.5,
    overflow: "hidden",
    position: "relative",
  },
  pitchOutline: {
    position: "absolute",
    top: 5,
    left: 5,
    right: 5,
    bottom: 5,
    borderWidth: 1.5,
    borderColor: "#ffffff",
    borderRadius: 8,
  },
  pitchMidline: {
    position: "absolute",
    top: 5,
    bottom: 5,
    left: "50%",
    width: 1.5,
    marginLeft: -0.75,
    backgroundColor: "#ffffff",
  },
  pitchCenterCircle: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "#ffffff",
    marginTop: -22,
    marginLeft: -22,
  },
  pitchLeftBox: {
    position: "absolute",
    left: 5,
    top: "30%",
    width: 34,
    height: "40%",
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: "#ffffff",
  },
  pitchRightBox: {
    position: "absolute",
    right: 5,
    top: "30%",
    width: 34,
    height: "40%",
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderLeftWidth: 1.5,
    borderColor: "#ffffff",
  },
  dot: {
    position: "absolute",
  },
  trailHintText: {
    marginTop: 8,
    paddingHorizontal: 14,
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 15,
  },
  heatmapWrap: {
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
  },
  heatmapTitle: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.35,
    marginBottom: 8,
  },
  heatPitch: {
    height: 190,
    borderRadius: 10,
    borderWidth: 1.5,
    overflow: "hidden",
    position: "relative",
  },
  heatGrid: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  heatLegendRow: {
    marginTop: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heatLegendScale: {
    flex: 1,
    flexDirection: "row",
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.35)",
  },
  heatLegendSwatch: {
    flex: 1,
    height: 8,
  },
  heatLegendText: {
    fontSize: 10,
    fontWeight: "700",
    minWidth: 26,
    textAlign: "center",
  },
  zoneRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  zoneCard: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  zoneLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  zoneValue: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "800",
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  legendText: {
    fontSize: 10,
    fontWeight: "600",
  },
});

const cmStyles = StyleSheet.create({
  sectionWrap: {
    marginTop: 8,
  },
  filterRow: {
    paddingHorizontal: 12,
    paddingBottom: 6,
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  cardsWrap: {
    marginTop: 6,
    gap: 10,
    paddingHorizontal: 12,
  },
  rowWrap: {
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
  },
  timeCol: {
    width: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  minuteText: {
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 18,
    textAlign: "center",
  },
  extraMinuteText: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  card: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  headerCardIcon: {
    transform: [{ rotate: "90deg" }],
  },
  cardHeaderTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.35,
  },
  scoreText: {
    fontSize: 12,
    fontWeight: "500",
  },
  scoreTextNormal: {
    fontWeight: "500",
  },
  scoreTextBold: {
    fontWeight: "800",
  },
  commentText: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  goalPlayerRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  goalAvatarWrap: {
    width: 44,
    height: 44,
    position: "relative",
    flexShrink: 0,
  },
  goalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
  },
  goalAvatarInitial: {
    fontSize: 16,
    fontWeight: "800",
  },
  goalRatingBadge: {
    position: "absolute",
    top: -3,
    right: -6,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 24,
    alignItems: "center",
  },
  goalRatingText: {
    fontSize: 8,
    fontWeight: "800",
  },
  goalPosBadge: {
    position: "absolute",
    bottom: -3,
    right: -6,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  goalPosText: {
    fontSize: 8,
    fontWeight: "700",
  },
  goalPlayerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  goalPlayerName: {
    fontSize: 13,
    fontWeight: "800",
  },
  goalPlayerSub: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15,
  },
  goalPopupOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  goalPopupBackdropTap: {
    ...StyleSheet.absoluteFillObject,
  },
  goalPopupCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  goalPopupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  goalPopupHeaderTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  goalPopupCloseBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  goalPopupCloseText: {
    fontSize: 13,
    fontWeight: "800",
  },
  goalPopupBody: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  goalPopupSection: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 10,
  },
  goalPopupSectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.45,
    marginBottom: 8,
  },
  goalPopupPlayerRow: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  goalPopupAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
  },
  goalPopupAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  goalPopupInitials: {
    fontSize: 17,
    fontWeight: "800",
  },
  goalPopupNameCol: {
    flex: 1,
    minWidth: 0,
  },
  goalPopupFirstName: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
  goalPopupLastName: {
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 18,
  },
  goalPopupTeamLogo: {
    width: 26,
    height: 26,
  },
  goalPopupTeamLogoFallback: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  goalPopupTeamLogoFallbackText: {
    fontSize: 10,
    fontWeight: "800",
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
});

const gscStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  backdropTap: {
    ...StyleSheet.absoluteFillObject,
  },
  centerWrap: {
    alignItems: "center",
  },
  card: {
    borderRadius: 0,
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 2,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    gap: 8,
  },
  timeText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    flexShrink: 1,
  },
  scoreWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  scoreLogo: {
    width: 18,
    height: 18,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: "700",
  },
  goalTypeText: {
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 3,
  },
  commentText: {
    fontSize: 12,
    lineHeight: 16,
  },
  bodyRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  goalCardFieldPane: {
    borderRightWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
  },
  goalCardFieldContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  miniField: {
    width: 180,
    height: 120, // Landscape orientation - wider than tall
    marginVertical: 16,
    alignSelf: "center",
  },
  fieldContainer: {
    width: "100%",
    height: "100%",
    backgroundColor: "#2d5a2d",
    borderRadius: 8,
    position: "relative",
    overflow: "hidden",
  },
  fieldOutline: {
    position: "absolute",
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderWidth: 2,
    borderColor: "white",
    borderRadius: 4,
  },
  centerLine: {
    position: "absolute",
    left: "50%",
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: "white",
    marginLeft: -1,
  },
  centerCircleMini: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 40,
    height: 40,
    borderWidth: 2,
    borderColor: "white",
    borderRadius: 20,
    marginLeft: -20,
    marginTop: -20,
  },
  penaltyAreaLeft: {
    position: "absolute",
    left: 4,
    top: "25%",
    bottom: "25%",
    width: 30,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: "white",
  },
  penaltyAreaRight: {
    position: "absolute",
    right: 4,
    top: "25%",
    bottom: "25%",
    width: 30,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: "white",
  },
  goalAreaLeft: {
    position: "absolute",
    left: 4,
    top: "37.5%",
    bottom: "37.5%",
    width: 15,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: "white",
  },
  goalAreaRight: {
    position: "absolute",
    right: 4,
    top: "37.5%",
    bottom: "37.5%",
    width: 15,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: "white",
  },
  goalLeft: {
    position: "absolute",
    left: 2,
    top: "42.5%",
    bottom: "42.5%",
    width: 4,
    backgroundColor: "white",
  },
  goalRight: {
    position: "absolute",
    right: 2,
    top: "42.5%",
    bottom: "42.5%",
    width: 4,
    backgroundColor: "white",
  },
  infoPanel: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    marginBottom: 5,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 22,
    fontWeight: "800",
  },
  playerName: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 3,
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 8,
  },
  teamLogo: {
    width: 14,
    height: 14,
  },
  teamName: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    maxWidth: 160,
  },
  assistWrap: {
    alignItems: "center",
    marginBottom: 8,
  },
  assistName: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  assistLabel: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    width: "100%",
  },
  statCell: {
    width: "33.333%",
    alignItems: "center",
    paddingVertical: 6,
  },
  statValue: {
    fontSize: 15,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 2,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: "flex-end",
  },
  footerBrand: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
    paddingHorizontal: 4,
  },
  actionBtn: {
    minWidth: 132,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 28,
    gap: 6,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});

const spmStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.52)",
    justifyContent: "flex-end",
  },
  backdropTap: {
    flex: 1,
  },
  sheet: {
    maxHeight: 720,
    height: "88%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 3,
    overflow: "hidden",
  },
  dragStrip: {
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  handleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: -10,
  },
  handleRowSpacer: {
    width: 64,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    opacity: 0.7,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: "800",
  },
  headshot: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 2,
    alignSelf: "center",
    marginTop: 2,
  },
  headshotInitial: {
    fontSize: 26,
    fontWeight: "800",
  },
  playerName: {
    marginTop: 10,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
    textAlign: "center",
    paddingHorizontal: 24,
  },
  jerseyNum: {
    marginTop: 2,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
  },
  triRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "stretch",
  },
  triCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  triCellMid: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  triValue: {
    fontSize: 14,
    fontWeight: "800",
  },
  triLabel: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.35,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 10,
  },
  statSection: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  keyStatsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 16,
    marginTop: 2,
    marginBottom: 4,
  },
  keyStatItem: {
    alignItems: "center",
    width: 82,
  },
  keyStatRing: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  keyStatRingSvg: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  keyStatCoreTrack: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  keyStatValue: {
    fontSize: 14,
    fontWeight: "800",
  },
  keyStatLabel: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  keyStatsDivider: {
    height: 1,
    marginTop: 8,
    marginBottom: 4,
    marginHorizontal: 4,
    opacity: 0.85,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: "600",
    paddingVertical: 8,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statRowLabel: {
    flex: 0.48,
    fontSize: 13,
    fontWeight: "600",
  },
  statRowRight: {
    flex: 0.52,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  statBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  statRowValue: {
    minWidth: 34,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "700",
  },
  shareOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  shareCard: {
    width: width - 48,
    overflow: "hidden",
  },
  shareHeader: {
    padding: 14,
    borderBottomWidth: 2,
  },
  shareTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sharePosBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sharePosBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  shareScoreWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  shareScoreLogo: {
    width: 18,
    height: 18,
  },
  shareScoreText: {
    fontSize: 15,
    fontWeight: "700",
  },
  shareNameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  shareInitialsCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  shareInitialsText: {
    fontSize: 20,
    fontWeight: "800",
  },
  shareNameRight: {
    flex: 1,
    marginLeft: 10,
  },
  shareSummaryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 2,
  },
  shareSummaryCell: {
    alignItems: "flex-start",
    gap: 1,
  },
  shareSummaryVal: {
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 20,
  },
  shareSummaryLbl: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  shareMetaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 6,
  },
  shareMetaLeft: {
    flex: 1,
    gap: 3,
  },
  shareName: {
    fontSize: 13,
    fontWeight: "600",
  },
  shareTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  shareTeamLogo: {
    width: 14,
    height: 14,
  },
  shareTeamLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  shareDateText: {
    fontSize: 11,
    fontWeight: "500",
    marginLeft: 6,
    lineHeight: 13,
    textAlign: "right",
  },
  shareDateBlock: {
    marginLeft: 6,
    alignItems: "flex-end",
  },
  shareStatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  shareStatCell: {
    width: "33.333%",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    position: "relative",
  },
  shareStatPct: {
    position: "absolute",
    top: 5,
    right: 7,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  shareStatVal: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  shareStatLbl: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 3,
    textAlign: "center",
  },
  shareFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignItems: "flex-end",
  },
  shareBrand: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  shareActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
    width: width - 48,
  },
  shareActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 28,
    gap: 6,
  },
  shareActionBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});

export default Top5GameDetailsScreen;

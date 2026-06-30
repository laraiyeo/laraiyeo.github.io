import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../../../context/ThemeContext";
import { useBetSlip } from "../../../context/BetSlipContext";
import { BannerAdWrapper } from "../../../services/ads";
import Top5ServiceEnhanced, {
  getMatchStatusType,
} from "../../../services/soccer/Top5ServiceEnhanced";
import { LiveViewerBadge } from "../../../components/ViewerCounter";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";
import { count } from "firebase/firestore";

const { width } = Dimensions.get("window");

// Small helper used in list view to show star + venue name and reflect favorite state
const FavoriteVenue = ({ match, theme, colors }) => {
  const [isFav, setIsFav] = useState(false);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const id = match?.id;
        if (!id) return;
        const v = await AsyncStorage.getItem(`@fav_fixture:${id}`);
        if (mounted) setIsFav(!!v);
      } catch (e) {
        // ignore
      }
    })();

    const sub = DeviceEventEmitter.addListener("favoritesChanged", (ev) => {
      if (!mounted) return;
      if (ev?.id === match?.id) setIsFav(!!ev?.fav);
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, [match?.id]);

  // Only show the star icon when favorited; otherwise just show venue text
  if (!isFav)
    return (
      <Text style={[styles.venue, { color: theme.textSecondary }]}>
        {match.venue?.name}
      </Text>
    );

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Ionicons
        name="star"
        size={14}
        color={colors.primary}
        style={{ marginRight: 6 }}
      />
      <Text style={[styles.venue, { color: theme.textSecondary }]}>
        {match.venue?.name}
      </Text>
    </View>
  );
};

// Hook: subscribe to favorite state for a fixture id
const useIsFavorited = (fixtureId) => {
  const [isFav, setIsFav] = useState(false);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!fixtureId) return;
        const v = await AsyncStorage.getItem(`@fav_fixture:${fixtureId}`);
        if (mounted) setIsFav(!!v);
      } catch (e) {
        // ignore
      }
    })();

    const sub = DeviceEventEmitter.addListener("favoritesChanged", (ev) => {
      if (!mounted) return;
      if (ev?.id === fixtureId) setIsFav(!!ev?.fav);
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, [fixtureId]);
  return isFav;
};

// ─── Polling helpers ──────────────────────────────────────────────────────────

const INTERVAL_SLOW = 30 * 60 * 1000; // 30 minutes
const INTERVAL_FAST = 5 * 1000; // 5 seconds
const INTERVAL_SOON = 60 * 1000; // 1 minute
const INTERVAL_FINISHED = 6 * 60 * 60 * 1000; // 6 hours
const LIVE_SHORT_NAMES = new Set([
  "1ST",
  "2ND",
  "HT",
  "BRK",
  "BREAK",
  "INPLAY_ET",
  "INPLAY_PEN",
  "ET",
  "PEN",
  "INT",
]);

// Force ordering for leagues on scoreboard (those keys appear first, in this order)
const FORCE_LEAGUE_ORDER = ["8", "564", "82", "384", "301"];

const shortNameOf = (match) =>
  String(match?.state?.short_name || "").toUpperCase();

const parseUtcDateTime = (dateStr) => {
  const raw = String(dateStr || "").trim();
  if (!raw) return null;
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
  const parsed = new Date(hasZone ? iso : `${iso}Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getTime() + 4 * 60 * 60 * 1000);
};

const startMsOf = (match) => {
  try {
    const parsed = parseUtcDateTime(match?.starting_at);
    return parsed ? parsed.getTime() : null;
  } catch (_) {
    return null;
  }
};

const getScoreboardPolicy = (groups) => {
  const allMatches = groups.flatMap((g) => g.matches);
  if (allMatches.length === 0)
    return { mode: "none", intervalMs: null, cacheMs: 0 };

  const hasLive = allMatches.some((m) => LIVE_SHORT_NAMES.has(shortNameOf(m)));
  if (hasLive) {
    return { mode: "live", intervalMs: INTERVAL_FAST, cacheMs: INTERVAL_FAST };
  }

  const allFinished = allMatches.every(
    (m) =>
      shortNameOf(m) === "FT" ||
      shortNameOf(m) === "AET" ||
      shortNameOf(m) === "FT_PEN" ||
      shortNameOf(m) === "POSTP" ||
      shortNameOf(m) === "CANC" ||
      shortNameOf(m) === "ABAN" ||
      shortNameOf(m) === "WO" ||
      shortNameOf(m) === "WALKOVER" ||
      shortNameOf(m) === "CUT" ||
      shortNameOf(m) === "AWA" ||
      shortNameOf(m) === "POST" ||
      shortNameOf(m) === "POSTPONED" ||
      shortNameOf(m) === "CANCELLED",
  );
  if (allFinished) {
    return {
      mode: "finished",
      intervalMs: INTERVAL_FINISHED,
      cacheMs: INTERVAL_FINISHED,
    };
  }

  const hasScheduledNs = allMatches.some((m) => shortNameOf(m) === "NS");
  if (hasScheduledNs) {
    const now = Date.now();
    const hasWithinHourStart = allMatches.some((m) => {
      if (shortNameOf(m) !== "NS") return false;
      const startMs = startMsOf(m);
      return (
        Number.isFinite(startMs) &&
        startMs > now &&
        startMs - now <= 60 * 60 * 1000
      );
    });

    // Check if any scheduled matches have crossed their start time
    const hasStartedMatches = allMatches.some((m) => {
      if (shortNameOf(m) !== "NS") return false;
      const startMs = startMsOf(m);
      return Number.isFinite(startMs) && startMs <= now;
    });

    if (hasStartedMatches) {
      // Force immediate refresh if matches have started
      return {
        mode: "transition",
        intervalMs: INTERVAL_FAST,
        cacheMs: 0,
      };
    }

    if (hasWithinHourStart) {
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

const getPollingInterval = (groups) => {
  return getScoreboardPolicy(groups).intervalMs;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatMatchTime = (match) => {
  try {
    const date = parseUtcDateTime(match?.starting_at);
    if (!date) return { time: "--:--", ampm: "" };
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

const getTickingClock = (match, nowMs, snapshotTsMs) => {
  const ticking = (match?.periods ?? []).find((p) => p?.ticking === true);
  if (!ticking) return null;

  const anchorTotal = Number(match?.__tickAnchorTotal ?? 0);
  const anchorTs = Number(match?.__tickAnchorTs ?? snapshotTsMs ?? nowMs);
  const safeAnchorTotal = Number.isFinite(anchorTotal) ? anchorTotal : 0;
  const safeAnchorTs = Number.isFinite(anchorTs) ? anchorTs : nowMs;

  const elapsed = Math.max(0, Math.floor((nowMs - safeAnchorTs) / 1000));
  const total = safeAnchorTotal + elapsed;
  const mm = Math.floor(total / 60);
  const ss = total % 60;

  return `${mm}:${pad2(ss)}`;
};

const getStatusInfo = (match, nowMs = Date.now(), snapshotTsMs = nowMs) => {
  const code = (match?.state?.state || "").toUpperCase();
  const long = match?.state?.name || "";
  const short = match?.state?.short_name || code;

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
    "POST",
    "POSTPONED",
    "CANCELLED",
  ].includes(code);

  const isScheduled = !code || ["NS", "TBA", "DELAYED"].includes(code);
  const isLive = !isFinished && !isScheduled;

  // Only show ticking clock for live games, not finished or scheduled games
  let displayShort = short;
  if (isLive) {
    const tickingClock = getTickingClock(match, nowMs, snapshotTsMs);
    if (tickingClock) {
      displayShort = tickingClock;
    }
  }

  if (isLive) {
    return {
      line1: displayShort || "LIVE",
      line2: long || "",
      isLive: true,
      isFinished: false,
    };
  }

  if (isFinished) {
    const { time, ampm } = formatMatchTime(match);
    return {
      line1: short || "FT", // Always show the actual status for finished games
      line2: `${time} ${ampm}`,
      isLive: false,
      isFinished: true,
    };
  }

  const { time, ampm } = formatMatchTime(match);
  return {
    line1: time,
    line2: ampm,
    isLive: false,
    isFinished: false,
  };
};

const parseHexColor = (hex) => {
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
};

const areColorsSimilar = (colorA, colorB) => {
  const a = parseHexColor(colorA);
  const b = parseHexColor(colorB);
  if (!a || !b) return false;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  const distance = Math.sqrt(dr * dr + dg * dg + db * db);
  return distance <= 70;
};

const resolveMatchColors = ({
  homePrimary,
  homeSecondary,
  awayPrimary,
  awaySecondary,
  homeFallback,
  awayFallback,
}) => {
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
};

const getHome = (match) =>
  match.participants?.find((p) => p.meta?.location === "home");
const getAway = (match) =>
  match.participants?.find((p) => p.meta?.location === "away");
const getGoals = (match, side) =>
  match.scores?.find((s) => s.participant === side)?.goals ?? null;
const getAbbr = (p) =>
  p?.short_code || (p?.name ? p.name.substring(0, 3).toUpperCase() : "???");

// Convert a position number to an ordinal string (e.g. 1 -> "1st")
const ordinal = (n) => {
  if (n == null || Number.isNaN(Number(n))) return "";
  const num = Number(n);
  const s = ["th", "st", "nd", "rd"];
  const v = num % 100;
  const suf = s[(v - 20) % 10] || s[v] || s[0];
  return `${num}${suf}`;
};

// Parse aggregate score from match.aggregate — returns home/away aggregate numbers
const parseAggregate = (match) => {
  const agg = match?.aggregate;
  if (!agg?.result || !agg?.name) return null;
  const res = String(agg.result || "").trim();
  const m = res.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!m) return null;
  const leftScore = parseInt(m[1], 10);
  const rightScore = parseInt(m[2], 10);
  const nameParts = String(agg.name || "").split(/\s+vs\.?\s+|\s+v\s+/i);
  if (!nameParts || nameParts.length < 2) return null;
  const leftName = nameParts[0].trim().toLowerCase();
  const rightName = nameParts[1].trim().toLowerCase();

  const participants = match?.participants ?? [];
  const findByName = (needle) =>
    participants.find((p) => {
      if (!p?.name) return false;
      const n = p.name.toLowerCase();
      return n === needle || n.includes(needle) || needle.includes(n);
    });

  const leftP = findByName(leftName);
  const rightP = findByName(rightName);

  let homeAgg = null;
  let awayAgg = null;
  if (leftP && leftP.meta?.location === "home") {
    homeAgg = leftScore;
    awayAgg = rightScore;
  } else if (leftP && leftP.meta?.location === "away") {
    awayAgg = leftScore;
    homeAgg = rightScore;
  } else if (rightP && rightP.meta?.location === "home") {
    homeAgg = rightScore;
    awayAgg = leftScore;
  } else if (rightP && rightP.meta?.location === "away") {
    awayAgg = rightScore;
    homeAgg = leftScore;
  } else {
    // Fallback: assume left => home, right => away
    homeAgg = leftScore;
    awayAgg = rightScore;
  }

  return { homeAgg, awayAgg };
};

// ─── Date utilities ───────────────────────────────────────────────────────────

const toDateStr = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
};

const PST_TIMEZONE = "America/Los_Angeles";

const getDateFromDateStr = (dateStr) => {
  const safe = String(dateStr || "");
  const y = Number(safe.slice(0, 4));
  const m = Number(safe.slice(4, 6));
  const d = Number(safe.slice(6, 8));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return new Date();
  }
  return new Date(y, m - 1, d);
};

const getPstNowParts = (date = new Date()) => {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: PST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const read = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
  };
};

const getTodayDateStr = () => toDateStr(new Date());

const getAutoSelectedDateStr = () => {
  const { year, month, day } = getPstNowParts();
  return toDateStr(new Date(year, month - 1, day));
};

const DATE_OPTIONS = (() => {
  const today = getDateFromDateStr(getTodayDateStr());
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i - 3);
    return d;
  });
})();

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
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

const getDateLabel = (date) => {
  const ds = toDateStr(date);
  if (ds === getTodayDateStr()) return "Today";
  const base = getDateFromDateStr(getTodayDateStr());
  base.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d - base) / 86400000);
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
};

const DEBUG_LOGGING = true;

const logDebug = (...args) => {
  if (DEBUG_LOGGING) {
    console.log("[Top5Scoreboard]", ...args);
  }
};

// ─── Date picker bar ─────────────────────────────────────────────────────────

const DATE_ITEM_W = 90;
const DATE_FADE_W = 50;
const DATE_BAR_H = 52;

const DatePickerBar = ({
  dates,
  selectedDateStr,
  onSelect,
  isGridView,
  toggleViewMode,
  theme,
  colors,
}) => {
  const scrollRef = useRef(null);
  const [scrollW, setScrollW] = useState(0);
  const N = dates.length;
  const selectedIdx = dates.findIndex((d) => toDateStr(d) === selectedDateStr);

  const scrollToIdx = useCallback(
    (idx, animated = true) => {
      if (!scrollRef.current || scrollW === 0) return;
      const maxOffset = Math.max(0, N * DATE_ITEM_W - scrollW);
      const raw = idx * DATE_ITEM_W - (scrollW / 2 - DATE_ITEM_W / 2);
      scrollRef.current.scrollTo({
        x: Math.max(0, Math.min(raw, maxOffset)),
        animated,
      });
    },
    [scrollW, N],
  );

  useEffect(() => {
    if (selectedIdx < 0 || scrollW === 0) return;
    const t = setTimeout(() => scrollToIdx(selectedIdx, true), 80);
    return () => clearTimeout(t);
  }, [selectedDateStr, selectedIdx, scrollToIdx, scrollW]);

  return (
    <View
      style={[
        dateBarStyles.outerWrapper,
        { backgroundColor: theme.background },
      ]}
    >
      <View style={dateBarStyles.wrapper}>
        {/* Scrollable date list */}
        <View
          style={dateBarStyles.scrollArea}
          onLayout={(e) => setScrollW(e.nativeEvent.layout.width)}
        >
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
          >
            {dates.map((date, idx) => {
              const ds = toDateStr(date);
              const isSelected = ds === selectedDateStr;
              const dist = Math.abs(idx - selectedIdx);
              const opacity =
                dist === 0 ? 1 : dist === 1 ? 0.6 : dist === 2 ? 0.35 : 0.18;
              return (
                <TouchableOpacity
                  key={ds}
                  style={dateBarStyles.item}
                  onPress={() => onSelect(ds)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      dateBarStyles.itemText,
                      {
                        color: isSelected ? colors.primary : theme.text,
                        fontWeight: isSelected ? "700" : "500",
                        opacity,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {getDateLabel(date)}
                  </Text>
                  <View
                    style={[
                      dateBarStyles.itemIndicator,
                      {
                        backgroundColor: isSelected
                          ? colors.primary
                          : "transparent",
                      },
                    ]}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {/* Left fade overlay */}
          <Svg
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: DATE_FADE_W,
              height: DATE_BAR_H,
            }}
            width={DATE_FADE_W}
            height={DATE_BAR_H}
            pointerEvents="none"
          >
            <Defs>
              <LinearGradient id="dfL" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop
                  offset="0%"
                  stopColor={theme.background}
                  stopOpacity="1"
                />
                <Stop
                  offset="100%"
                  stopColor={theme.background}
                  stopOpacity="0"
                />
              </LinearGradient>
            </Defs>
            <Rect
              x={0}
              y={0}
              width={DATE_FADE_W}
              height={DATE_BAR_H}
              fill="url(#dfL)"
            />
          </Svg>
          {/* Right fade overlay */}
          <Svg
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: DATE_FADE_W,
              height: DATE_BAR_H,
            }}
            width={DATE_FADE_W}
            height={DATE_BAR_H}
            pointerEvents="none"
          >
            <Defs>
              <LinearGradient id="dfR" x1="100%" y1="0%" x2="0%" y2="0%">
                <Stop
                  offset="0%"
                  stopColor={theme.background}
                  stopOpacity="1"
                />
                <Stop
                  offset="100%"
                  stopColor={theme.background}
                  stopOpacity="0"
                />
              </LinearGradient>
            </Defs>
            <Rect
              x={0}
              y={0}
              width={DATE_FADE_W}
              height={DATE_BAR_H}
              fill="url(#dfR)"
            />
          </Svg>
        </View>

        {/* Grid/list toggle */}
        <TouchableOpacity
          onPress={toggleViewMode}
          style={dateBarStyles.toggleBtn}
        >
          <Ionicons
            name={isGridView ? "list-outline" : "grid-outline"}
            size={22}
            color={theme.text}
          />
        </TouchableOpacity>
      </View>
      {/* Border as its own element — completely separated from the gradient overlays */}
      <View
        style={[dateBarStyles.separator, { backgroundColor: theme.border }]}
      />
    </View>
  );
};

// ─── List-view card gradient overlay (SVG) – top to bottom ──────────────────

const CardGradient = ({
  gradId,
  awayColor,
  homeColor,
  fallbackColor,
  theme,
}) => {
  const bot = awayColor || fallbackColor;
  const top = homeColor || fallbackColor;
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

// ─── Grid-view constants ──────────────────────────────────────────────────────
const SOCCER_GRID_H_PAD = 16;
const SOCCER_GRID_GAP = 8;
const SOCCER_CARD_WIDTH = (width - SOCCER_GRID_H_PAD * 2 - SOCCER_GRID_GAP) / 2;

// ─── Grid left–right gradient ─────────────────────────────────────────────────
const SoccerGridCardGradient = ({
  gradId,
  awayColor,
  homeColor,
  fallbackColor,
  cardHeight,
}) => {
  const right = awayColor || fallbackColor;
  const left = homeColor || fallbackColor;
  const safeHeight = Math.max(cardHeight || 1, 1);
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width={SOCCER_CARD_WIDTH}
      height={safeHeight}
      viewBox={`0 0 ${SOCCER_CARD_WIDTH} ${safeHeight}`}
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id={`sgL_${gradId}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={left} stopOpacity="0.35" />
          <Stop offset="30%" stopColor={left} stopOpacity="0" />
          <Stop offset="70%" stopColor={right} stopOpacity="0" />
          <Stop offset="100%" stopColor={right} stopOpacity="0.35" />
        </LinearGradient>
      </Defs>
      <Rect
        x={0}
        y={0}
        width={SOCCER_CARD_WIDTH}
        height={safeHeight}
        fill={`url(#sgL_${gradId})`}
      />
    </Svg>
  );
};

// ─── Individual soccer grid card ──────────────────────────────────────────────
const Top5GridCard = React.memo(
  ({ match, theme, colors, gIdx, mIdx, navigation, nowMs, snapshotTsMs }) => {
    const [cardHeight, setCardHeight] = useState(0);
    const home = match.participants?.find((p) => p.meta?.location === "home");
    const away = match.participants?.find((p) => p.meta?.location === "away");
    const homeScore =
      match.scores?.find((s) => s.participant === "home")?.goals ?? null;
    const awayScore =
      match.scores?.find((s) => s.participant === "away")?.goals ?? null;
    const agg = parseAggregate(match);
    const { homeColor, awayColor } = resolveMatchColors({
      homePrimary: home?.colorPrimary,
      homeSecondary: home?.colorSecondary,
      awayPrimary: away?.colorPrimary,
      awaySecondary: away?.colorSecondary,
      homeFallback: null,
      awayFallback: null,
    });
    const si = getStatusInfo(match, nowMs, snapshotTsMs);
    const gradId = `gc_${gIdx}_${mIdx}`;

    const [isFav, setIsFav] = useState(false);
    useEffect(() => {
      let mounted = true;
      (async () => {
        try {
          const id = match?.id;
          if (!id) return;
          const v = await AsyncStorage.getItem(`@fav_fixture:${id}`);
          if (mounted) setIsFav(!!v);
        } catch (e) {
          // ignore
        }
      })();

      const sub = DeviceEventEmitter.addListener("favoritesChanged", (ev) => {
        if (!mounted) return;
        if (ev?.id === match?.id) setIsFav(!!ev?.fav);
      });

      return () => {
        mounted = false;
        sub.remove();
      };
    }, [match?.id]);

    const homeWins = home.meta.winner;
    const awayWins = away.meta.winner;
    const awayAbbr = getAbbr(away);
    const homeAbbr = getAbbr(home);
    function ordinal(n) {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    const homePos = ordinal(home.meta.position);
    const awayPos = ordinal(away.meta.position);

    const homeShort = home.short_code ?? home.name.slice(0, 3).toUpperCase();
    const awayShort = away.short_code ?? away.name.slice(0, 3).toUpperCase();

    return (
      <TouchableOpacity
        style={[
          soccerGridStyles.card,
          {
            backgroundColor: theme.surfaceSecondary,
            width: SOCCER_CARD_WIDTH,
            borderColor: isFav ? colors.primary : undefined,
            borderWidth: isFav ? 1 : StyleSheet.hairlineWidth,
          },
        ]}
        onLayout={(e) => {
          const nextHeight = Math.round(e.nativeEvent.layout.height || 0);
          setCardHeight((prev) => (prev !== nextHeight ? nextHeight : prev));
        }}
        activeOpacity={0.8}
        onPress={() => {
          if (!home || !away) return;
          navigation.navigate("Top5GameDetail", {
            fixtureId: match.id,
            homeTeamId: home.id,
            awayTeamId: away.id,
            matchTitle: `${homeShort} vs ${awayShort}`,
          });
        }}
      >
        <SoccerGridCardGradient
          gradId={gradId}
          awayColor={awayColor}
          homeColor={homeColor}
          fallbackColor={colors.primary}
          cardHeight={cardHeight}
        />

        {isFav ? (
          <View
            style={{
              position: "absolute",
              top: 6,
              left: 6,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: colors.primary + "40",
              borderWidth: 0.5,
              borderColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
              zIndex: 5,
            }}
          >
            <Ionicons name="star" size={12} color={colors.primary} />
          </View>
        ) : null}

        {/* Status / Time */}
        <View style={soccerGridStyles.cardTop}>
          {si.isLive ? (
            <Text
              style={[soccerGridStyles.statusLive, { color: colors.primary }]}
            >
              {si.line1} ∙{si.line2 ? ` ${si.line2}` : ""}
            </Text>
          ) : si.isFinished ? (
            <Text
              style={[
                soccerGridStyles.statusText,
                { color: theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {si.line1}
            </Text>
          ) : (
            <Text
              style={[soccerGridStyles.statusText, { color: theme.text }]}
              numberOfLines={1}
            >
              {si.line1}{" "}
              <Text style={{ color: theme.textTertiary }}>{si.line2}</Text>
            </Text>
          )}
          {agg && agg.homeAgg != null && agg.awayAgg != null && (
            <Text
              style={{
                marginTop: 2.5,
                fontSize: 10,
                color: theme.textTertiary,
                fontWeight: "600",
              }}
              numberOfLines={1}
            >
              {`AGG: ${agg.homeAgg} - ${agg.awayAgg}`}
            </Text>
          )}
          <LiveViewerBadge
            gameId={String(match.id)}
            status={si.isLive ? "live" : si.isFinished ? "final" : "pre"}
            scale={0.7}
            style={soccerGridStyles.cardBadge}
          />
        </View>

        {/* Teams side by side */}
        <View style={soccerGridStyles.teamsRow}>
          {/* Home */}
          <View style={soccerGridStyles.teamSide}>
            {si.isLive || si.isFinished ? (
              <View style={soccerGridStyles.scoreCell}>
                <Text
                  style={[
                    soccerGridStyles.scoreText,
                    {
                      color: homeWins ? colors.primary : theme.text,
                      fontWeight: homeWins ? "700" : "400",
                      opacity:
                        si.isFinished && !homeWins && !awayWins
                          ? 1
                          : si.isFinished && !homeWins
                            ? 0.55
                            : 1,
                    },
                  ]}
                >
                  {homeScore ?? "\u2014"}
                </Text>
                {home?.image_path && (
                  <Image
                    source={{ uri: home.image_path }}
                    style={[
                      soccerGridStyles.scoreLogoOverlay,
                      {
                        opacity:
                          si.isFinished && !homeWins && !awayWins
                            ? 1
                            : si.isFinished
                              ? homeWins
                                ? 1
                                : 0.55
                              : 1,
                      },
                    ]}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                  />
                )}
              </View>
            ) : home?.image_path ? (
              <Image
                source={{ uri: home.image_path }}
                style={soccerGridStyles.teamLogo}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            ) : (
              <View
                style={[
                  soccerGridStyles.teamLogoPlaceholder,
                  { backgroundColor: homeColor || colors.secondary },
                ]}
              >
                <Text style={soccerGridStyles.teamLogoPlaceholderText}>
                  {(home?.name || "H")[0]}
                </Text>
              </View>
            )}
            <Text
              style={[
                soccerGridStyles.teamAbbr,
                {
                  color:
                    si.isFinished && !homeWins && !awayWins
                      ? theme.text
                      : si.isFinished
                        ? homeWins
                          ? theme.text
                          : theme.textTertiary
                        : theme.text,
                },
              ]}
            >
              {homeAbbr}
            </Text>
            {homePos != "nullth" && (
              <Text
                style={[
                  soccerGridStyles.teamPosition,
                  {
                    color:
                      si.isFinished && !homeWins && !awayWins
                        ? theme.textSecondary
                        : si.isFinished
                          ? homeWins
                            ? theme.textSecondary
                            : theme.textTertiary
                          : theme.textSecondary,
                    fontSize: 10,
                  },
                ]}
              >
                {homePos} Place
              </Text>
            )}
          </View>

          <View
            style={[
              soccerGridStyles.divider,
              { backgroundColor: theme.border },
            ]}
          />

          {/* Away */}
          <View style={soccerGridStyles.teamSide}>
            {si.isLive || si.isFinished ? (
              <View style={soccerGridStyles.scoreCell}>
                <Text
                  style={[
                    soccerGridStyles.scoreText,
                    {
                      color: awayWins ? colors.primary : theme.text,
                      fontWeight: awayWins ? "700" : "400",
                      opacity:
                        si.isFinished && !homeWins && !awayWins
                          ? 1
                          : si.isFinished && !awayWins
                            ? 0.55
                            : 1,
                    },
                  ]}
                >
                  {awayScore ?? "\u2014"}
                </Text>
                {away?.image_path && (
                  <Image
                    source={{ uri: away.image_path }}
                    style={[
                      soccerGridStyles.scoreLogoOverlay,
                      {
                        opacity:
                          si.isFinished && !homeWins && !awayWins
                            ? 1
                            : si.isFinished
                              ? awayWins
                                ? 1
                                : 0.55
                              : 1,
                      },
                    ]}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                  />
                )}
              </View>
            ) : away?.image_path ? (
              <Image
                source={{ uri: away.image_path }}
                style={soccerGridStyles.teamLogo}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            ) : (
              <View
                style={[
                  soccerGridStyles.teamLogoPlaceholder,
                  { backgroundColor: awayColor || colors.primary },
                ]}
              >
                <Text style={soccerGridStyles.teamLogoPlaceholderText}>
                  {(away?.name || "A")[0]}
                </Text>
              </View>
            )}
            <Text
              style={[
                soccerGridStyles.teamAbbr,
                {
                  color:
                    si.isFinished && !homeWins && !awayWins
                      ? theme.text
                      : si.isFinished
                        ? awayWins
                          ? theme.text
                          : theme.textTertiary
                        : theme.text,
                },
              ]}
            >
              {awayAbbr}
            </Text>
            {awayPos != "nullth" && (
              <Text
                style={[
                  soccerGridStyles.teamPosition,
                  {
                    color:
                      si.isFinished && !homeWins && !awayWins
                        ? theme.textSecondary
                        : si.isFinished
                          ? awayWins
                            ? theme.textSecondary
                            : theme.textTertiary
                          : theme.textSecondary,
                    fontSize: 10,
                  },
                ]}
              >
                {awayPos} Place
              </Text>
            )}
          </View>
        </View>

        {/* Footer: venue */}
        <View
          style={[
            soccerGridStyles.cardFooter,
            { borderTopColor: theme.border },
          ]}
        >
          {match.group?.name ? (
            <Text
              style={[soccerGridStyles.groupText, { color: theme.text }]}
              numberOfLines={1}
            >
              {match.group.name}
            </Text>
          ) : null}
          <Text
            style={[soccerGridStyles.venueText, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {match.venue?.name || ""}
          </Text>
        </View>
      </TouchableOpacity>
    );
  },
);

// List-row component reusing favorite logic from grid card
const Top5ListRow = ({
  match,
  idx,
  gIdx,
  theme,
  colors,
  navigation,
  nowMs,
  snapshotTsMs,
  displayedLength,
}) => {
  const home = getHome(match);
  const away = getAway(match);
  if (!home || !away) return null;

  const isFav = useIsFavorited(match?.id);
  const si = getStatusInfo(match, nowMs, snapshotTsMs);
  const agg = parseAggregate(match);
  const { homeColor, awayColor } = resolveMatchColors({
    homePrimary: home?.colorPrimary,
    homeSecondary: home?.colorSecondary,
    awayPrimary: away?.colorPrimary,
    awaySecondary: away?.colorSecondary,
    homeFallback: null,
    awayFallback: null,
  });
  const group = match.group?.name || "";

  return (
    <TouchableOpacity
      key={match.id || idx}
      style={[
        styles.gameRow,
        {
          backgroundColor: theme.surfaceSecondary,
          borderWidth: isFav ? 1 : 0,
          borderColor: isFav ? colors.primary : theme.border,
        },
      ]}
      activeOpacity={0.75}
      onPress={() => {
        navigation.navigate("Top5GameDetail", {
          fixtureId: match.id,
          homeTeamId: home.id,
          awayTeamId: away.id,
          matchTitle: `${home.short_code || home.name} vs ${away.short_code || away.name}`,
        });
      }}
    >
      <CardGradient
        gradId={`${gIdx}_${idx}`}
        awayColor={awayColor}
        homeColor={homeColor}
        fallbackColor={colors.primary}
        theme={theme}
      />

      <View style={styles.matchRow}>
        {/* Status column */}
        <View style={styles.statusContainer}>
          {si.isLive ? (
            <View style={{ alignItems: "center" }}>
              <Text
                style={[
                  styles.statusLine1,
                  { color: theme.error || "#e03131", fontWeight: "700" },
                ]}
              >
                {si.line1}
              </Text>
              {si.line2 && (
                <Text
                  style={[styles.statusLine2, { color: theme.textTertiary }]}
                  numberOfLines={2}
                >
                  {si.line2}
                </Text>
              )}
            </View>
          ) : (
            <>
              <Text
                style={[
                  styles.statusLine1,
                  {
                    color: si.isFinished ? theme.textSecondary : theme.text,
                    fontWeight: "500",
                  },
                ]}
                numberOfLines={1}
              >
                {si.line1}
              </Text>
              {!!si.line2 && (
                <Text
                  style={[styles.statusLine2, { color: theme.textTertiary }]}
                  numberOfLines={1}
                >
                  {si.line2}
                </Text>
              )}
            </>
          )}
        </View>

        {/* Teams (condensed) */}
        <View style={styles.stackedTeams}>
          <View style={styles.teamWithLogo}>
            <View style={styles.teamLogoSmall}>
              {home?.image_path ? (
                <Image
                  source={{ uri: home.image_path }}
                  style={[
                    styles.teamLogoSmallImg,
                    si.isFinished && !home.meta.winner && !away.meta.winner
                      ? { opacity: 1 }
                      : !home.meta.winner && si.isFinished
                        ? { opacity: 0.55 }
                        : null,
                  ]}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              ) : (
                <View
                  style={[
                    styles.teamLogoSmallImg,
                    {
                      backgroundColor: homeColor || colors.primary,
                      justifyContent: "center",
                      alignItems: "center",
                    },
                  ]}
                >
                  <Text style={styles.teamLogoFallback}>
                    {getAbbr(home).substring(0, 1)}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.teamName,
                  {
                    color:
                      si.isFinished && !home.meta.winner && !away.meta.winner
                        ? theme.text
                        : si.isFinished
                          ? home.meta.winner
                            ? theme.text
                            : theme.textTertiary
                          : theme.text,
                    fontWeight: home.meta.winner ? "700" : "400",
                    marginTop: home.meta.position ? 0 : 9,
                  },
                ]}
                numberOfLines={1}
              >
                {home?.name || "Home"}
              </Text>
              {home.meta.position && (
                <Text
                  style={[
                    styles.teamName,
                    {
                      color:
                        si.isFinished && !home.meta.winner && !away.meta.winner
                          ? theme.textSecondary
                          : si.isFinished
                            ? home.meta.winner
                              ? theme.textSecondary
                              : theme.textTertiary
                            : theme.textSecondary,
                      fontSize: 11,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {ordinal(home.meta.position)} Place
                </Text>
              )}
            </View>
            {(si.isLive || si.isFinished) &&
              getGoals(match, "home") != null && (
                <Text
                  style={[
                    styles.scoreText,
                    {
                      color: home.meta.winner ? colors.primary : theme.text,
                      fontWeight: home.meta.winner ? "700" : "400",
                      opacity:
                        si.isFinished && !home.meta.winner && !away.meta.winner
                          ? 1
                          : !home.meta.winner && si.isFinished
                            ? 0.55
                            : 1,
                    },
                  ]}
                >
                  {getGoals(match, "home")}
                </Text>
              )}
          </View>

          <View style={styles.teamWithLogo}>
            <View style={styles.teamLogoSmall}>
              {away?.image_path ? (
                <Image
                  source={{ uri: away.image_path }}
                  style={[
                    styles.teamLogoSmallImg,
                    si.isFinished && !home.meta.winner && !away.meta.winner
                      ? { opacity: 1 }
                      : !away.meta.winner && si.isFinished
                        ? { opacity: 0.55 }
                        : null,
                  ]}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              ) : (
                <View
                  style={[
                    styles.teamLogoSmallImg,
                    {
                      backgroundColor: awayColor || colors.primary,
                      justifyContent: "center",
                      alignItems: "center",
                    },
                  ]}
                >
                  <Text style={styles.teamLogoFallback}>
                    {getAbbr(away).substring(0, 1)}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.teamName,
                  {
                    color:
                      si.isFinished && !home.meta.winner && !away.meta.winner
                        ? theme.text
                        : si.isFinished
                          ? away.meta.winner
                            ? theme.text
                            : theme.textTertiary
                          : theme.text,
                    fontWeight: away.meta.winner ? "700" : "400",
                    marginTop: away.meta.position ? 0 : 9,
                  },
                ]}
                numberOfLines={1}
              >
                {away?.name || "Away"}
              </Text>
              {away.meta.position && (
                <Text
                  style={[
                    styles.teamName,
                    {
                      color:
                        si.isFinished && !home.meta.winner && !away.meta.winner
                          ? theme.textSecondary
                          : si.isFinished
                            ? away.meta.winner
                              ? theme.textSecondary
                              : theme.textTertiary
                            : theme.textSecondary,
                      fontSize: 11,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {ordinal(away.meta.position)} Place
                </Text>
              )}
            </View>
            {(si.isLive || si.isFinished) &&
              getGoals(match, "away") != null && (
                <Text
                  style={[
                    styles.scoreText,
                    {
                      color: away.meta.winner ? colors.primary : theme.text,
                      fontWeight: away.meta.winner ? "700" : "400",
                      opacity:
                        si.isFinished && !home.meta.winner && !away.meta.winner
                          ? 1
                          : !away.meta.winner && si.isFinished
                            ? 0.55
                            : 1,
                    },
                  ]}
                >
                  {getGoals(match, "away")}
                </Text>
              )}
          </View>
        </View>
      </View>

      {/* Footer */}
      <View style={[styles.gameFooter, { borderTopColor: theme.border }]}>
        <View style={styles.gameFooterLeft}>
          {agg && agg.homeAgg != null && agg.awayAgg != null ? (
            <Text
              style={[styles.venue, { color: theme.textSecondary }]}
            >{`AGGREGATE ${agg.homeAgg} - ${agg.awayAgg}`}</Text>
          ) : null}
          {group ? (
            <Text
              style={[
                styles.venue,
                { color: theme.text, fontWeight: "500", fontStyle: "italic" },
              ]}
            >{`${group}`}</Text>
          ) : null}
          {match.venue?.name ? (
            <FavoriteVenue match={match} theme={theme} colors={colors} />
          ) : null}
        </View>
        <View style={styles.gameFooterRight}>
          <LiveViewerBadge
            gameId={String(match.id)}
            status={si.isLive ? "live" : si.isFinished ? "final" : "pre"}
            style={styles.viewerBadge}
          />
        </View>
      </View>

      {idx < displayedLength - 1 && (
        <View
          style={[styles.matchSeparator, { backgroundColor: theme.border }]}
        />
      )}
    </TouchableOpacity>
  );
};

// ─── Soccer Grid section (floating bubble headers + 2-col cards) ──────────────
const Top5GridSection = ({
  groups,
  theme,
  colors,
  isDarkMode,
  activeFilter,
  collapsedGroups,
  toggleCollapse,
  navigation,
  nowMs,
  snapshotTsMs,
}) => (
  <View style={soccerGridStyles.container}>
    {groups.map((group, gIdx) => (
      <View key={group.leagueKey} style={soccerGridStyles.groupWrapper}>
        {/* Floating bubble group label */}
        <TouchableOpacity
          style={[
            soccerGridStyles.groupBubble,
            { backgroundColor: theme.surfaceSecondary },
          ]}
          activeOpacity={activeFilter > getTodayDateStr() ? 0.7 : 1}
          onPress={() =>
            activeFilter > getTodayDateStr() && toggleCollapse(group.leagueKey)
          }
        >
          {group.imagePath ? (
            <Image
              source={{ uri: group.imagePath }}
              style={[
                soccerGridStyles.groupBubbleLogo,
                {
                  tintColor:
                    (group.leagueKey === "8" || group.leagueKey === "2") &&
                    isDarkMode
                      ? theme.text
                      : undefined,
                },
              ]}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          ) : (
            <Text style={{ fontSize: 18, marginRight: 6 }}>\u26bd</Text>
          )}
          <Text
            style={[soccerGridStyles.groupBubbleName, { color: theme.text }]}
            numberOfLines={1}
          >
            {group.label.includes(group.countryName)
              ? "FIFA"
              : group.countryName || ""}{" "}
            {group.label}
          </Text>
          <Text
            style={[
              soccerGridStyles.groupBubbleCount,
              { color: theme.textTertiary },
            ]}
          >
            {" "}
            {group.matches.length}
          </Text>
          {activeFilter > getTodayDateStr() && (
            <Text
              style={{ color: theme.textTertiary, marginLeft: 4, fontSize: 12 }}
            >
              {collapsedGroups[group.leagueKey] ? "\u25b6" : "\u25bc"}
            </Text>
          )}
        </TouchableOpacity>
        {/* 2-column card grid */}
        {(() => {
          const isCollapsed =
            activeFilter > getTodayDateStr() &&
            !!collapsedGroups[group.leagueKey];
          const displayed = isCollapsed
            ? group.matches.slice(0, 2)
            : group.matches;
          return (
            <View style={soccerGridStyles.cardsRow}>
              {displayed.map((match, mIdx) => (
                <Top5GridCard
                  key={match.id || mIdx}
                  match={match}
                  theme={theme}
                  colors={colors}
                  gIdx={gIdx}
                  mIdx={mIdx}
                  navigation={navigation}
                  nowMs={nowMs}
                  snapshotTsMs={snapshotTsMs}
                />
              ))}
            </View>
          );
        })()}
      </View>
    ))}
  </View>
);

// ─── Scoreboard section ───────────────────────────────────────────────────────

const Top5ScoreboardSection = ({
  groups,
  navigation,
  theme,
  colors,
  isDarkMode,
  activeFilter,
  collapsedGroups,
  toggleCollapse,
  nowMs,
  snapshotTsMs,
}) => (
  <View style={styles.scoreboardContainer}>
    {groups.map((group, gIdx) => (
      <View
        key={group.leagueKey}
        style={[styles.eventContainer, { backgroundColor: theme.background }]}
      >
        {/* League header */}
        <TouchableOpacity
          style={[
            styles.eventHeaderContainer,
            { backgroundColor: theme.surfaceSecondary },
          ]}
          activeOpacity={activeFilter > getTodayDateStr() ? 0.7 : 1}
          onPress={() =>
            activeFilter > getTodayDateStr() && toggleCollapse(group.leagueKey)
          }
        >
          <View style={styles.eventLogoContainer}>
            {group.imagePath ? (
              <Image
                source={{ uri: group.imagePath }}
                style={[
                  styles.eventLogoImage,
                  {
                    tintColor:
                      (group.leagueKey === "8" || group.leagueKey === "2") &&
                      isDarkMode
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
                  styles.eventLogoImage,
                  { justifyContent: "center", alignItems: "center" },
                ]}
              >
                <Text style={{ fontSize: 20 }}>⚽</Text>
              </View>
            )}
          </View>
          <View style={styles.eventInfo}>
            <Text
              style={[styles.eventName, { color: theme.text }]}
              numberOfLines={1}
            >
              {group.label}
            </Text>
            <View style={styles.countryInfo}>
              {group.countryImage ? (
                <Image
                  source={{ uri: group.countryImage }}
                  style={styles.countryFlag}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              ) : null}
              {group.countryName ? (
                <Text
                  style={[styles.eventSubLabel, { color: theme.textTertiary }]}
                >
                  {group.label.includes(group.countryName)
                    ? "FIFA"
                    : group.countryName || ""}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.eventHeaderRight} pointerEvents="none">
            <Text style={[styles.eventCount, { color: theme.textTertiary }]}>
              {" "}
              {group.matches.length}{" "}
            </Text>
            {activeFilter > getTodayDateStr() && (
              <Text style={[styles.eventArrow, { color: theme.textTertiary }]}>
                {" "}
                {collapsedGroups[group.leagueKey] ? "▶" : "▼"}{" "}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Match rows */}
        <View style={styles.matchesList}>
          {(() => {
            const isCollapsed =
              activeFilter > getTodayDateStr() &&
              !!collapsedGroups[group.leagueKey];
            const displayed = isCollapsed
              ? group.matches.slice(0, 1)
              : group.matches;

            return displayed.map((match, idx) => {
              const home = getHome(match);
              const away = getAway(match);
              const homeScore = getGoals(match, "home");
              const awayScore = getGoals(match, "away");
              const si = getStatusInfo(match, nowMs, snapshotTsMs);
              const agg = parseAggregate(match);
              const { homeColor, awayColor } = resolveMatchColors({
                homePrimary: home?.colorPrimary,
                homeSecondary: home?.colorSecondary,
                awayPrimary: away?.colorPrimary,
                awaySecondary: away?.colorSecondary,
                homeFallback: null,
                awayFallback: null,
              });
              const homeWins = home.meta.winner;
              const awayWins = away.meta.winner;
              function ordinal(n) {
                const s = ["th", "st", "nd", "rd"];
                const v = n % 100;
                return n + (s[(v - 20) % 10] || s[v] || s[0]);
              }

              const homePos = ordinal(home.meta.position);
              const awayPos = ordinal(away.meta.position);

              return (
                <Top5ListRow
                  key={match.id || idx}
                  match={match}
                  idx={idx}
                  gIdx={gIdx}
                  theme={theme}
                  colors={colors}
                  navigation={navigation}
                  nowMs={nowMs}
                  snapshotTsMs={snapshotTsMs}
                  displayedLength={displayed.length}
                />
              );
            });
          })()}
        </View>
      </View>
    ))}
  </View>
);

// ─── Main screen ──────────────────────────────────────────────────────────────

const Top5ScoreboardScreen = ({ navigation }) => {
  const { colors, theme, isDarkMode } = useTheme();
  const { isPro } = useBetSlip();
  const AD_SPACE = 80;

  const [groups, setGroups] = useState([]);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState(getAutoSelectedDateStr());
  const [isGridView, setIsGridView] = useState(false);
  const [snapshotTsMs, setSnapshotTsMs] = useState(Date.now());
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Persist grid/list preference
  useEffect(() => {
    AsyncStorage.getItem("viewMode_top5").then((val) => {
      if (val !== null) setIsGridView(val === "grid");
    });
  }, []);

  const toggleViewMode = () => {
    setIsGridView((v) => {
      const next = !v;
      AsyncStorage.setItem("viewMode_top5", next ? "grid" : "list");
      return next;
    });
  };

  const intervalRef = useRef(null);
  const currentIntervalMs = useRef(null);
  const isFocusedRef = useRef(false);
  const lastLoadedFilterRef = useRef(null);
  const fetchCacheRef = useRef({});
  const inFlightRef = useRef({});
  const tickClockStateRef = useRef({});

  const applyTickingSnapshot = useCallback((sourceGroups) => {
    const fetchTs = Date.now();

    return sourceGroups.map((group) => ({
      ...group,
      matches: (group.matches ?? []).map((match, idx) => {
        const ticking = (match?.periods ?? []).find((p) => p?.ticking === true);
        const key = String(match?.id ?? `${group.leagueKey}:${idx}`);

        if (!ticking) {
          delete tickClockStateRef.current[key];
          return { ...match, __tickAnchorTotal: null, __tickAnchorTs: null };
        }

        const m = Number(ticking?.minutes ?? 0);
        const s = Number(ticking?.seconds ?? 0);
        const safeM = Number.isFinite(m) ? m : 0;
        const safeS = Number.isFinite(s) ? s : 0;
        const tickSig = `${safeM}:${safeS}`;
        const prev = tickClockStateRef.current[key];

        // Only reset baseline when fetched ticking value actually changes.
        if (!prev || prev.lastFetchedSig !== tickSig) {
          tickClockStateRef.current[key] = {
            lastFetchedSig: tickSig,
            anchorTotal: safeM * 60 + safeS,
            anchorTs: fetchTs,
          };
        }

        const current = tickClockStateRef.current[key];

        return {
          ...match,
          __tickAnchorTotal: current.anchorTotal,
          __tickAnchorTs: current.anchorTs,
        };
      }),
    }));
  }, []);

  // Update the loadData function to properly handle force refresh
  const loadData = useCallback(
    async (filter, silent = false, background = false, force = false) => {
      const now = Date.now();
      logDebug("loadData called", { filter, silent, background, force, now });

      // ONLY check cache if NOT forcing refresh
      if (!force) {
        const cached = fetchCacheRef.current[filter];
        if (cached) {
          const policy = getScoreboardPolicy(cached.groups ?? []);
          const cacheMs = policy.cacheMs ?? 0;
          const cacheAge = now - cached.ts;
          const canUseCache =
            cacheMs > 0 &&
            cacheAge < cacheMs &&
            !(background && policy.mode === "live");

          logDebug("Cache check", {
            filter,
            hasCache: !!cached,
            cacheAge,
            cacheMs,
            policyMode: policy.mode,
            canUseCache,
            background,
            force,
          });

          if (canUseCache) {
            logDebug("Using cached data for filter:", filter);
            setGroups(cached.groups);
            setSnapshotTsMs(cached.ts);
            lastLoadedFilterRef.current = filter;
            return cached.groups;
          } else {
            logDebug("Cache expired or invalid for filter:", filter, {
              cacheAge,
              cacheMs,
              policyMode: policy.mode,
              background,
            });
          }
        }
      } else if (force) {
        logDebug(
          "Force refresh requested, bypassing cache for filter:",
          filter,
        );
      } else {
        logDebug("No cached data available for filter:", filter);
      }

      // ONLY check in-flight if NOT forcing refresh
      if (!force && inFlightRef.current[filter]) {
        logDebug("Request already in flight for filter:", filter);
        return inFlightRef.current[filter];
      }

      const promise = (async () => {
        logDebug("Starting data fetch for filter:", filter);
        if (!silent) setLoading(true);
        else if (!background) setFetching(true);

        try {
          logDebug(
            "Calling Top5ServiceEnhanced.getScoreboard with filter:",
            filter,
          );
          const raw = await Top5ServiceEnhanced.getScoreboard(filter);
          logDebug("Raw data received from service for filter:", filter, {
            groupsCount: raw?.data?.groups?.length || 0,
          });

          const rawGroups = Top5ServiceEnhanced.toGroups(raw);
          logDebug("Processed groups count:", rawGroups.length);

          const nextGroups = applyTickingSnapshot(rawGroups);
          logDebug("Applied ticking snapshot, groups:", nextGroups.length);

          // Apply forced league ordering
          if (Array.isArray(nextGroups) && nextGroups.length > 0) {
            const orderMap = new Map(
              FORCE_LEAGUE_ORDER.map((k, i) => [String(k), i]),
            );
            const withIdx = nextGroups.map((g, idx) => ({ g, idx }));
            const ordered = withIdx
              .slice()
              .sort((a, b) => {
                const aKey = String(a.g.leagueKey ?? a.g.league_id ?? "");
                const bKey = String(b.g.leagueKey ?? b.g.league_id ?? "");
                const ai = orderMap.has(aKey)
                  ? orderMap.get(aKey)
                  : 1000 + a.idx;
                const bi = orderMap.has(bKey)
                  ? orderMap.get(bKey)
                  : 1000 + b.idx;
                return ai - bi;
              })
              .map((x) => x.g);

            const ts = Date.now();
            const orderedGroups = ordered;
            logDebug("Applied league ordering, groups:", orderedGroups.length);
          }

          const ts = Date.now();

          // Sort matches within groups
          const sortMatchesWithinGroup = (groupsArr) => {
            const statusWeight = (m) => {
              const code = String(m?.state?.state || "").toUpperCase();
              const short = String(m?.state?.short_name || "").toUpperCase();
              if (LIVE_SHORT_NAMES.has(short)) return 0; // live
              if (!code || ["NS", "TBA", "DELAYED", "SCHEDULED"].includes(code))
                return 1; // scheduled
              return 2; // finished/other
            };

            return groupsArr.map((g) => ({
              ...g,
              matches: (g.matches ?? []).slice().sort((a, b) => {
                const wa = statusWeight(a);
                const wb = statusWeight(b);
                if (wa !== wb) return wa - wb;
                const sa = startMsOf(a) || 0;
                const sb = startMsOf(b) || 0;
                return sa - sb || 0;
              }),
            }));
          };

          const baseGroups =
            typeof orderedGroups !== "undefined" ? orderedGroups : nextGroups;
          const sortedGroups = sortMatchesWithinGroup(baseGroups);
          logDebug(
            "Sorted groups by match status, groups:",
            sortedGroups.length,
          );

          setGroups(sortedGroups);
          setSnapshotTsMs(ts);
          lastLoadedFilterRef.current = filter;

          // Cache the data
          fetchCacheRef.current[filter] = {
            groups: sortedGroups,
            ts,
          };
          logDebug("Data cached for filter:", filter);

          if (filter > getTodayDateStr()) {
            setCollapsedGroups((prev) => {
              const map = { ...prev };
              nextGroups.forEach((g) => {
                if (map[g.leagueKey] === undefined) map[g.leagueKey] = true;
              });
              return map;
            });
          }

          return nextGroups;
        } catch (err) {
          logDebug("Data fetch error for filter:", filter, err);
          console.error("Top5 scoreboard fetch error:", err);
          setGroups([]);
          setSnapshotTsMs(Date.now());
          return [];
        } finally {
          setLoading(false);
          if (!background) setFetching(false);
          logDebug("loadData completed for filter:", filter);
        }
      })();

      inFlightRef.current[filter] = promise;
      try {
        return await promise;
      } finally {
        delete inFlightRef.current[filter];
      }
    },
    [applyTickingSnapshot],
  );

  const toggleCollapse = (key) =>
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  const schedulePolling = useCallback(
    (filter, latestGroups) => {
      logDebug("schedulePolling called", {
        filter,
        groupsCount: latestGroups?.length,
      });

      if (!isFocusedRef.current) {
        logDebug("Not focused, skipping polling setup");
        return;
      }

      if (filter !== getTodayDateStr()) {
        logDebug("Non-today filter, clearing interval");
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          currentIntervalMs.current = null;
        }
        return;
      }

      const desired = getPollingInterval(latestGroups);
      logDebug("Calculated polling interval:", desired, {
        groupsCount: latestGroups?.length,
      });

      if (!desired) {
        logDebug("No polling interval, clearing existing");
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          currentIntervalMs.current = null;
        }
        return;
      }

      if (currentIntervalMs.current === desired && intervalRef.current) {
        logDebug("Polling interval unchanged, keeping existing:", desired);
        return;
      }

      if (intervalRef.current) {
        logDebug("Clearing existing interval");
        clearInterval(intervalRef.current);
      }

      currentIntervalMs.current = desired;
      logDebug("Setting new polling interval:", desired);

      intervalRef.current = setInterval(async () => {
        logDebug("Polling interval triggered");
        const fresh = await loadData(filter, true, true);
        schedulePolling(filter, fresh);
      }, desired);
    },
    [loadData],
  );

  useFocusEffect(
    useCallback(() => {
      logDebug("Screen focused, activeFilter:", activeFilter);
      isFocusedRef.current = true;

      // Always refresh when this screen regains focus
      logDebug("Forcing refresh on focus");
      loadData(activeFilter, true, true, true).then((fresh) =>
        schedulePolling(activeFilter, fresh),
      );

      return () => {
        logDebug("Screen losing focus");
        isFocusedRef.current = false;
        if (intervalRef.current) {
          logDebug("Clearing polling interval on unfocus");
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          currentIntervalMs.current = null;
        }
      };
    }, [activeFilter, loadData, schedulePolling]),
  );

  const lastSeenDayRef = useRef(getTodayDateStr());
  useEffect(() => {
    const currentDay = toDateStr(new Date(nowMs));
    if (currentDay !== lastSeenDayRef.current) {
      const prevDay = lastSeenDayRef.current;
      lastSeenDayRef.current = currentDay;
      // If the user is currently viewing the previous 'today' tab, advance them to the new day
      if (activeFilter === prevDay) {
        setActiveFilter(currentDay);
        loadData(currentDay, true).then((fresh) =>
          schedulePolling(currentDay, fresh),
        );
      }
    }
  }, [nowMs, activeFilter, loadData, schedulePolling]);

  // Update the onRefresh function (around line 1500) to properly clear cache
  const onRefresh = async () => {
    logDebug("onRefresh triggered for active filter:", activeFilter);
    setRefreshing(true);

    // Log current cache state before clearing
    logDebug("Current cache state before refresh:", {
      hasCacheForFilter: !!fetchCacheRef.current[activeFilter],
      cacheKeys: Object.keys(fetchCacheRef.current),
    });

    // Explicit user refresh should bypass any short-term cache
    if (fetchCacheRef.current && fetchCacheRef.current[activeFilter]) {
      logDebug("Deleting cache for filter:", activeFilter);
      delete fetchCacheRef.current[activeFilter];
    }

    // Also clear AsyncStorage cache for this filter
    try {
      const cacheKey = `@top5_scoreboard_${activeFilter}`;
      logDebug("Clearing AsyncStorage cache with key:", cacheKey);
      await AsyncStorage.removeItem(cacheKey);
    } catch (e) {
      logDebug("Failed to clear AsyncStorage cache:", e);
      console.warn("Failed to clear AsyncStorage cache:", e);
    }

    logDebug("Calling loadData with force refresh for filter:", activeFilter);
    const fresh = await loadData(activeFilter, true, false, true);
    schedulePolling(activeFilter, fresh);
    setRefreshing(false);
    logDebug("Refresh completed for filter:", activeFilter);
  };

  const handleDateSelect = (dateStr) => {
    setActiveFilter(dateStr);
    // Mark this filter as last-loaded immediately to prevent useFocusEffect
    // from triggering a duplicate fetch while this request runs.
    lastLoadedFilterRef.current = dateStr;
    loadData(dateStr, true).then((fresh) => schedulePolling(dateStr, fresh));
  };

  if (loading) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading matches…
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
      >
        {/* Title (not sticky) */}

        {/* Sticky date picker bar */}
        <DatePickerBar
          dates={DATE_OPTIONS}
          selectedDateStr={activeFilter}
          onSelect={handleDateSelect}
          isGridView={isGridView}
          toggleViewMode={toggleViewMode}
          theme={theme}
          colors={colors}
        />

        {/* Groups or empty state */}
        <View style={{ opacity: fetching ? 0.45 : 1 }}>
          {groups.length > 0 ? (
            isGridView ? (
              <Top5GridSection
                groups={groups}
                theme={theme}
                colors={colors}
                isDarkMode={isDarkMode}
                activeFilter={activeFilter}
                collapsedGroups={collapsedGroups}
                toggleCollapse={toggleCollapse}
                navigation={navigation}
                nowMs={nowMs}
                snapshotTsMs={snapshotTsMs}
              />
            ) : (
              <View style={styles.listContainer}>
                <Top5ScoreboardSection
                  groups={groups}
                  navigation={navigation}
                  theme={theme}
                  colors={colors}
                  isDarkMode={isDarkMode}
                  activeFilter={activeFilter}
                  collapsedGroups={collapsedGroups}
                  toggleCollapse={toggleCollapse}
                  nowMs={nowMs}
                  snapshotTsMs={snapshotTsMs}
                />
              </View>
            )
          ) : (
            <View style={styles.emptyState}>
              <Text
                style={[styles.emptyStateText, { color: theme.textSecondary }]}
              >
                No matches found
              </Text>
            </View>
          )}
        </View>

        <View
          style={[styles.bottomPadding, { height: isPro ? 32 : 32 + AD_SPACE }]}
        />
      </ScrollView>
      {!isPro && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
          }}
        >
          <BannerAdWrapper />
        </View>
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  gridToggleBtn: {
    padding: 4,
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
  filtersRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 14,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyStateText: {
    fontSize: 16,
    textAlign: "center",
  },
  bottomPadding: { height: 32 },
  listContainer: {
    paddingHorizontal: 16,
  },
  scoreboardContainer: {
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
    marginBottom: 5,
    borderRadius: 12,
  },
  eventLogoContainer: {
    marginRight: 12,
  },
  eventLogoImage: {
    width: 50,
    height: 32,
  },
  eventHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
    paddingRight: 5,
  },
  eventCount: {
    fontSize: 13.5,
  },
  eventArrow: {
    marginLeft: 2,
    fontSize: 16,
    fontWeight: "700",
  },
  eventInfo: { flex: 1 },
  eventName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  countryInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  eventSubLabel: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
  },
  countryFlag: {
    width: 16,
    height: 16,
  },
  matchesList: { gap: 5 },
  gameRow: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 12,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  statusContainer: {
    width: 55,
    marginRight: 14,
    alignItems: "center",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: 3,
  },
  statusLine1: {
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  statusLine2: {
    fontSize: 11,
    opacity: 0.7,
    textAlign: "center",
  },
  stackedTeams: { flex: 1 },
  teamWithLogo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  teamLogoSmall: {
    width: 35,
    height: 35,
    marginRight: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  teamLogoSmallImg: {
    width: 35,
    height: 35,
    borderRadius: 3,
  },
  teamLogoFallback: {
    fontSize: 8,
    fontWeight: "bold",
    color: "white",
  },
  teamName: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  scoreText: {
    fontSize: 16,
    marginLeft: 8,
    minWidth: 22,
    textAlign: "right",
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
  venue: {
    fontSize: 12,
    marginBottom: 2,
  },
  matchSeparator: {
    height: 1,
    opacity: 0.3,
  },
});

// ─── Date picker bar styles ───────────────────────────────────────────────────
const dateBarStyles = StyleSheet.create({
  outerWrapper: {
    marginBottom: 15,
  },
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: DATE_BAR_H,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  scrollArea: {
    flex: 1,
    height: DATE_BAR_H,
    overflow: "hidden",
  },
  item: {
    width: DATE_ITEM_W,
    height: DATE_BAR_H,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  itemText: {
    fontSize: 13,
    textAlign: "center",
  },
  itemIndicator: {
    height: 2,
    width: 24,
    borderRadius: 1,
    marginTop: 4,
  },
  toggleBtn: {
    height: DATE_BAR_H,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});

// ─── Soccer Grid-view styles ──────────────────────────────────────────────────
const soccerGridStyles = StyleSheet.create({
  container: {
    paddingHorizontal: SOCCER_GRID_H_PAD,
    marginBottom: 24,
  },
  groupWrapper: {
    marginBottom: 16,
  },
  groupBubble: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
  },
  groupBubbleLogo: {
    width: 28,
    height: 18,
    marginRight: 6,
  },
  groupBubbleName: {
    fontSize: 13,
    fontWeight: "600",
    maxWidth: 200,
  },
  groupBubbleCount: {
    marginLeft: 6,
    fontSize: 12,
  },
  cardsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SOCCER_GRID_GAP,
  },
  card: {
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 2,
  },
  cardTop: {
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 6,
    minHeight: 30,
    justifyContent: "center",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  statusLive: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  teamsRow: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingBottom: 10,
    alignItems: "flex-start",
  },
  teamSide: {
    flex: 1,
    alignItems: "center",
  },
  divider: {
    width: 1,
    alignSelf: "stretch",
    marginHorizontal: 4,
    opacity: 0.35,
  },
  teamLogo: {
    width: 40,
    height: 40,
    marginBottom: 5,
  },
  teamLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 5,
  },
  teamLogoPlaceholderText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "white",
  },
  scoreCell: {
    width: 52,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 5,
    position: "relative",
  },
  scoreText: {
    fontSize: 38,
    lineHeight: 50,
  },
  scoreLogoOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    opacity: 0.75,
  },
  teamAbbr: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    textTransform: "uppercase",
  },
  cardFooter: {
    borderTopWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: "center",
    minHeight: 30,
    justifyContent: "center",
  },
  venueText: {
    fontSize: 9,
    textAlign: "center",
  },
  groupText: {
    fontSize: 10,
    textAlign: "center",
    fontWeight: "500",
    marginBottom: 3,
    marginTop: -2,
  },
  cardBadge: {
    position: "absolute",
    top: 4,
    right: 4,
  },
});

export default Top5ScoreboardScreen;

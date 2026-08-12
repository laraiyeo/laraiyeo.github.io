import React, { useState, useEffect, useRef, useCallback } from "react";
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
import { useTheme } from "../../context/ThemeContext";
import { useBetSlip } from "../../context/BetSlipContext";
import { BannerAdWrapper } from "../../services/ads";
import { useFavorites } from "../../context/FavoritesContext";
import { LiveViewerBadge } from "../../components/ViewerCounter";
import { WNBAService } from "../../services/WNBAService";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width } = Dimensions.get("window");

// ── Date helpers ────────────────────────────────────────────────────
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

// ── Date picker bar constants ───────────────────────────────────────
const DATE_ITEM_W = 90;
const DATE_FADE_W = 50;
const DATE_BAR_H = 52;

const DATE_OPTIONS = (() => {
  const today = getDateFromDateStr(getTodayDateStr());
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i - 3);
    return d;
  });
})();

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
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
};

// ── Polling intervals (WNBA has no ticking clock) ────────────────────
const INTERVAL_PRE_FAR = 60 * 60 * 1000;
const INTERVAL_PRE_MEDIUM = 10 * 60 * 1000;
const INTERVAL_PRE_SOON = 30 * 1000;
const INTERVAL_LIVE = 5 * 1000;
const PRE_MEDIUM_THRESHOLD = 65 * 60 * 1000;
const PRE_SOON_THRESHOLD = 5 * 60 * 1000;

const getPregamePollingInterval = (msUntilStart) => {
  if (!Number.isFinite(msUntilStart)) return INTERVAL_PRE_FAR;
  if (msUntilStart > PRE_MEDIUM_THRESHOLD) return INTERVAL_PRE_FAR;
  if (msUntilStart > PRE_SOON_THRESHOLD) return INTERVAL_PRE_MEDIUM;
  if (msUntilStart >= 0) return INTERVAL_PRE_SOON;
  return INTERVAL_LIVE;
};

// ── Color utilities ─────────────────────────────────────────────────
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
  return Math.sqrt(dr * dr + dg * dg + db * db) <= 70;
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
    homeColor: homeSecondary ?? homeColor,
    awayColor: awaySecondary ?? awayColor,
  };
};

const getSmartTeamColors = (homeTeam, awayTeam, colors) => {
  return resolveMatchColors({
    homePrimary: homeTeam?.color ? `#${homeTeam.color}` : null,
    homeSecondary: homeTeam?.alternateColor
      ? homeTeam.alternateColor.startsWith("#")
        ? homeTeam.alternateColor
        : `#${homeTeam.alternateColor}`
      : null,
    awayPrimary: awayTeam?.color ? `#${awayTeam.color}` : null,
    awaySecondary: awayTeam?.alternateColor
      ? awayTeam.alternateColor.startsWith("#")
        ? awayTeam.alternateColor
        : `#${awayTeam.alternateColor}`
      : null,
    homeFallback: colors.primary,
    awayFallback: colors.secondary || "#666",
  });
};

// ── Game status helpers ─────────────────────────────────────────────
const hasMeaningfulClock = (clock) => {
  if (!clock) return false;
  const clockStr =
    typeof clock === "object" && clock !== null
      ? clock.displayValue || clock.summary || ""
      : String(clock);
  const s = clockStr.trim();
  if (/^0+(:0+)*$/i.test(s.replace(/\s/g, ""))) return false;
  return /\d/.test(s);
};

const isWnbaGameLive = (item) => {
  if (item.gameStatus !== "live" && item.gameStatus !== "in") return false;
  const statusText = (item.status || "").toString();
  const isHalftime = /halftime/i.test(statusText);
  const isEndOf = /end of/i.test(statusText);
  return (
    !item.isCompleted &&
    (isHalftime || isEndOf || hasMeaningfulClock(item.displayClock))
  );
};

const isWnbaGameFinished = (item) => {
  if (item.isCompleted) return true;
  const state = String(item.gameStatus || "").toLowerCase();
  return state === "post";
};

const getStatusPriority = (game) => {
  if (isWnbaGameLive(game)) return 1;
  if (isWnbaGameFinished(game)) return 3;
  return 2;
};

const formatLocalTime = (dateString) => {
  try {
    const date = new Date(dateString);
    const fmt = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const parts = fmt.formatToParts(date);
    const hour = parts.find((p) => p.type === "hour")?.value || "";
    const minute = parts.find((p) => p.type === "minute")?.value || "00";
    const ampm = parts.find((p) => p.type === "dayPeriod")?.value || "";
    return { time: `${hour}:${minute}`, ampm };
  } catch {
    return { time: "", ampm: "" };
  }
};

const formatDateGroupLabel = (dateString) => {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
};

const groupGamesByDate = (games = []) => {
  const map = {};
  games.forEach((game) => {
    const d = new Date(game.date);
    const key = d.toDateString();
    if (!map[key]) {
      map[key] = {
        dateKey: key,
        dateTs: d.getTime(),
        label: formatDateGroupLabel(game.date),
        games: [],
      };
    }
    map[key].games.push(game);
  });
  // Sort within each group: live → scheduled → finished
  Object.values(map).forEach((group) => {
    group.games.sort((a, b) => {
      const pa = getStatusPriority(a);
      const pb = getStatusPriority(b);
      if (pa !== pb) return pa - pb;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  });
  return Object.values(map).sort((a, b) => a.dateTs - b.dateTs);
};

const getGameClockText = (item) => {
  const clockRaw = item.displayClock;
  const clock =
    typeof clockRaw === "object" && clockRaw !== null
      ? clockRaw.displayValue || clockRaw.summary || ""
      : String(clockRaw || "");
  return clock;
};

const getPeriodText = (period) => {
  if (period === 1) return "1st";
  if (period === 2) return "2nd";
  if (period === 3) return "3rd";
  if (period === 4) return "4th";
  if (period === 5) return "OT";
  return `${period - 4}OT`;
};

const getLiveStatusLine = (item) => {
  const clock = getGameClockText(item);
  const period = getPeriodText(item.period || 1);
  if (item.status && /halftime/i.test(item.status)) return "Halftime";
  if (clock) return `${clock === "0.0" ? "End" : clock} - ${period}`;
  return `Q${item.period || 1}`;
};

const getWnbaLogoUrl = (team, isDarkMode) => {
  const abbrev = (team?.abbreviation || "").toLowerCase();
  if (!abbrev) return null;
  const themeSuffix = isDarkMode ? "-dark" : "";
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/wnba/500${themeSuffix}/scoreboard/${abbrev}.png&w=200&h=200`;
};

// ── Polling interval calculation ────────────────────────────────────
const getWnbaGamePollingInterval = (game, nowMs) => {
  if (isWnbaGameLive(game)) return INTERVAL_LIVE;
  if (isWnbaGameFinished(game)) return INTERVAL_PRE_FAR;
  const startMs = Date.parse(String(game?.date || ""));
  if (Number.isFinite(startMs)) {
    return getPregamePollingInterval(startMs - nowMs);
  }
  return INTERVAL_PRE_FAR;
};

const getPollingInterval = (groups) => {
  const allGames = groups.flatMap((g) => g.games);
  if (allGames.length === 0) return null;
  const now = Date.now();
  let desired = INTERVAL_PRE_FAR;
  allGames.forEach((game) => {
    desired = Math.min(desired, getWnbaGamePollingInterval(game, now));
  });
  return desired;
};

// ── DatePickerBar ───────────────────────────────────────────────────
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
              <LinearGradient id="dfL_wnba" x1="0%" y1="0%" x2="100%" y2="0%">
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
              fill="url(#dfL_wnba)"
            />
          </Svg>

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
              <LinearGradient id="dfR_wnba" x1="100%" y1="0%" x2="0%" y2="0%">
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
              fill="url(#dfR_wnba)"
            />
          </Svg>
        </View>

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
      <View
        style={[dateBarStyles.separator, { backgroundColor: theme.border }]}
      />
    </View>
  );
};

// ── Grid view ───────────────────────────────────────────────────────
const WNBA_GRID_H_PAD = 16;
const WNBA_GRID_GAP = 8;
const WNBA_CARD_WIDTH = (width - WNBA_GRID_H_PAD * 2 - WNBA_GRID_GAP) / 2;

const WNBAGridCardGradient = ({
  gradId,
  awayColor,
  homeColor,
  fallbackColor,
  cardHeight,
}) => {
  const left = awayColor || fallbackColor;
  const right = homeColor || fallbackColor;
  const safeHeight = Math.max(cardHeight || 1, 1);
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width={WNBA_CARD_WIDTH}
      height={safeHeight}
      viewBox={`0 0 ${WNBA_CARD_WIDTH} ${safeHeight}`}
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id={`ngL_${gradId}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={left} stopOpacity="0.35" />
          <Stop offset="30%" stopColor={left} stopOpacity="0" />
          <Stop offset="70%" stopColor={right} stopOpacity="0" />
          <Stop offset="100%" stopColor={right} stopOpacity="0.35" />
        </LinearGradient>
      </Defs>
      <Rect
        x={0}
        y={0}
        width={WNBA_CARD_WIDTH}
        height={safeHeight}
        fill={`url(#ngL_${gradId})`}
      />
    </Svg>
  );
};

const WNBAGridCard = ({
  game,
  navigation,
  theme,
  colors,
  isDarkMode,
  isFavorite,
  getTeamLogoUrl,
}) => {
  const [cardHeight, setCardHeight] = useState(0);
  const [awayLogoError, setAwayLogoError] = useState(false);
  const [homeLogoError, setHomeLogoError] = useState(false);
  const away = game.awayTeam || {};
  const home = game.homeTeam || {};

  const { awayColor, homeColor } = getSmartTeamColors(home, away, colors);

  const awayLogo = getTeamLogoUrl("wnba", away?.abbreviation) || getWnbaLogoUrl(away, isDarkMode);
  const homeLogo = getTeamLogoUrl("wnba", home?.abbreviation) || getWnbaLogoUrl(home, isDarkMode);

  React.useEffect(() => { setAwayLogoError(false); }, [awayLogo]);
  React.useEffect(() => { setHomeLogoError(false); }, [homeLogo]);

  const awayAbbr = (away.abbreviation || "AWY").toUpperCase();
  const homeAbbr = (home.abbreviation || "HME").toUpperCase();

  const isLive = isWnbaGameLive(game);
  const isFinished = isWnbaGameFinished(game);
  const isScheduled = !isLive && !isFinished;

  const awayScore = away.score;
  const homeScore = home.score;
  const awayWins =
    isFinished &&
    awayScore != null &&
    homeScore != null &&
    parseInt(awayScore, 10) > parseInt(homeScore, 10);
  const homeWins =
    isFinished &&
    awayScore != null &&
    homeScore != null &&
    parseInt(homeScore, 10) > parseInt(awayScore, 10);

  const awayFav = isFavorite(String(away.id || ""), "wnba");
  const homeFav = isFavorite(String(home.id || ""), "wnba");

  const awayRecord =
    typeof away.record === "object" && away.record !== null
      ? away.record.displayValue || away.record.summary || ""
      : away.record || "";
  const homeRecord =
    typeof home.record === "object" && home.record !== null
      ? home.record.displayValue || home.record.summary || ""
      : home.record || "";

  const gradId = `ng_${game.id}`;
  const { time, ampm } = formatLocalTime(game.date);

  let statusLine = "";
  let statusLine2 = "";
  if (isLive) {
    statusLine = getLiveStatusLine(game);
  } else if (isFinished) {
    statusLine2 = "Final";
  } else {
    statusLine = `${time}`;
    statusLine2 = ampm;
  }

  return (
    <TouchableOpacity
      style={[
        wnbaGridStyles.card,
        { backgroundColor: theme.surfaceSecondary, width: WNBA_CARD_WIDTH },
      ]}
      onLayout={(e) => {
        const nextHeight = Math.round(e.nativeEvent.layout.height || 0);
        setCardHeight((prev) => (prev !== nextHeight ? nextHeight : prev));
      }}
      onPress={() =>
        navigation.navigate("GameDetails", {
          gameId: String(game.id),
          sport: "wnba",
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          summerLeague: game.summerLeague || null,
        })
      }
      activeOpacity={0.8}
    >
      <WNBAGridCardGradient
        gradId={gradId}
        awayColor={awayColor}
        homeColor={homeColor}
        fallbackColor={colors.primary}
        cardHeight={cardHeight}
      />

      <View style={wnbaGridStyles.cardTop}>
        <Text
          style={[
            wnbaGridStyles.statusText,
            {
              color: isLive ? colors.primary : theme.text,
            },
          ]}
          numberOfLines={1}
        >
          <Text style={{ fontWeight: "800" }}>{statusLine}</Text>
          {statusLine2 ? (
            <Text style={{ fontWeight: "500", color: theme.textSecondary }}>
              {` ${statusLine2}`}
            </Text>
          ) : null}
        </Text>
        <LiveViewerBadge
          gameId={game.id}
          status={{ isCompleted: game.isCompleted, status: game.gameStatus }}
          scale={0.7}
          style={wnbaGridStyles.cardBadge}
        />
      </View>

      <View style={wnbaGridStyles.teamsRow}>
        <View style={wnbaGridStyles.teamSide}>
          {isScheduled ? (
            awayLogo && !awayLogoError ? (
              <Image
                cachePolicy="memory-disk"
                source={{ uri: awayLogo }}
                style={wnbaGridStyles.teamLogo}
                contentFit="contain"
                onError={() => setAwayLogoError(true)}
              />
            ) : (
              <View
                style={[
                  wnbaGridStyles.teamLogoPlaceholder,
                  { backgroundColor: awayColor || colors.primary },
                ]}
              >
                <Text style={[wnbaGridStyles.teamLogoPlaceholderText, { fontSize: 11 }]}>
                  {awayAbbr || "A"}
                </Text>
              </View>
            )
          ) : (
            <View style={wnbaGridStyles.scoreCell}>
              <Text
                style={[
                  wnbaGridStyles.scoreText,
                  {
                    color: awayFav
                      ? colors.primary
                      : awayWins
                        ? colors.primary
                        : theme.text,
                    fontWeight: awayWins ? "700" : "400",
                    opacity: isFinished && !awayWins ? 0.55 : 1,
                  },
                ]}
              >
                {awayScore ?? "-"}
              </Text>
              {awayLogo && !awayLogoError && (
                <Image
                  cachePolicy="memory-disk"
                  source={{ uri: awayLogo }}
                  style={[
                    wnbaGridStyles.scoreLogoOverlay,
                    { opacity: isFinished && !awayWins ? 0.55 : 1 },
                  ]}
                  contentFit="contain"
                  onError={() => setAwayLogoError(true)}
                />
              )}
            </View>
          )}
          <Text
            style={[
              wnbaGridStyles.teamAbbr,
              {
                color: awayFav ? colors.primary : theme.text,
                opacity: isFinished && !awayWins ? 0.55 : 1,
              },
            ]}
          >
            {awayFav ? "★ " : ""}
            {awayAbbr}
          </Text>
          {!!awayRecord && (
            <Text
              style={[
                wnbaGridStyles.teamRecord,
                {
                  color: theme.textSecondary,
                  opacity: isFinished && !awayWins ? 0.55 : 1,
                },
              ]}
            >
              {awayRecord}
            </Text>
          )}
        </View>

        <View
          style={[wnbaGridStyles.divider, { backgroundColor: theme.border }]}
        />

        <View style={wnbaGridStyles.teamSide}>
          {isScheduled ? (
            homeLogo && !homeLogoError ? (
              <Image
                cachePolicy="memory-disk"
                source={{ uri: homeLogo }}
                style={wnbaGridStyles.teamLogo}
                contentFit="contain"
                onError={() => setHomeLogoError(true)}
              />
            ) : (
              <View
                style={[
                  wnbaGridStyles.teamLogoPlaceholder,
                  { backgroundColor: homeColor || colors.secondary },
                ]}
              >
                <Text style={[wnbaGridStyles.teamLogoPlaceholderText, { fontSize: 11 }]}>
                  {homeAbbr || "H"}
                </Text>
              </View>
            )
          ) : (
            <View style={wnbaGridStyles.scoreCell}>
              <Text
                style={[
                  wnbaGridStyles.scoreText,
                  {
                    color: homeFav
                      ? colors.primary
                      : homeWins
                        ? colors.primary
                        : theme.text,
                    fontWeight: homeWins ? "700" : "400",
                    opacity: isFinished && !homeWins ? 0.55 : 1,
                  },
                ]}
              >
                {homeScore ?? "-"}
              </Text>
              {homeLogo && !homeLogoError && (
                <Image
                  cachePolicy="memory-disk"
                  source={{ uri: homeLogo }}
                  style={[
                    wnbaGridStyles.scoreLogoOverlay,
                    { opacity: isFinished && !homeWins ? 0.55 : 1 },
                  ]}
                  contentFit="contain"
                  onError={() => setHomeLogoError(true)}
                />
              )}
            </View>
          )}
          <Text
            style={[
              wnbaGridStyles.teamAbbr,
              {
                color: homeFav ? colors.primary : theme.text,
                opacity: isFinished && !homeWins ? 0.55 : 1,
              },
            ]}
          >
            {homeFav ? "★ " : ""}
            {homeAbbr}
          </Text>
          {!!homeRecord && (
            <Text
              style={[
                wnbaGridStyles.teamRecord,
                {
                  color: theme.textSecondary,
                  opacity: isFinished && !homeWins ? 0.55 : 1,
                },
              ]}
            >
              {homeRecord}
            </Text>
          )}
        </View>
      </View>

      <View
        style={[wnbaGridStyles.cardFooter, { borderTopColor: theme.border }]}
      >
        <Text
          style={[wnbaGridStyles.venueText, { color: theme.textSecondary }]}
          numberOfLines={1}
        >
          {game.venue || ""}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const WNBAGridSection = ({
  groups,
  navigation,
  theme,
  colors,
  isDarkMode,
  isFavorite,
  getTeamLogoUrl,
}) => (
  <View style={wnbaGridStyles.container}>
    {groups.map((group) => (
      <View key={group.dateKey} style={wnbaGridStyles.groupWrapper}>
        <View style={wnbaGridStyles.groupHeaderRow}>
          <View
            style={[
              wnbaGridStyles.groupBubble,
              { backgroundColor: theme.surfaceSecondary },
            ]}
          >
                          <Image
                            cachePolicy="memory-disk"
                            source={require("../../../assets/wnba.png")}
                            style={{ width: 50, height: 30, marginHorizontal: -12 }}
                            resizeMode="contain"
                          />
            <Text
              style={[wnbaGridStyles.groupBubbleName, { color: theme.text }]}
              numberOfLines={1}
            >
              {group.label}
            </Text>
            <Text
              style={[
                wnbaGridStyles.groupBubbleCount,
                { color: theme.textTertiary },
              ]}
            >
              {" "}
              {group.games.length}
            </Text>
          </View>
        </View>

        <View style={wnbaGridStyles.cardsRow}>
          {group.games.map((game) => (
            <WNBAGridCard
              key={game.id}
              game={game}
              navigation={navigation}
              theme={theme}
              colors={colors}
              isDarkMode={isDarkMode}
              isFavorite={isFavorite}
              getTeamLogoUrl={getTeamLogoUrl}
            />
          ))}
        </View>
      </View>
    ))}
  </View>
);

// ── List view ───────────────────────────────────────────────────────
const CardGradient = ({
  gradId,
  awayColor,
  homeColor,
  fallbackColor,
  theme,
}) => {
  const top = awayColor || fallbackColor;
  const bot = homeColor || fallbackColor;
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

const ScoreboardSection = ({
  groups,
  navigation,
  theme,
  isDarkMode,
  colors,
  isFavorite,
  getTeamLogoUrl,
}) => {
  const [logoErrorMap, setLogoErrorMap] = useState({});

  const markLogoError = useCallback((gameId, side) => {
    setLogoErrorMap((prev) => {
      const key = `${gameId}_${side}`;
      if (prev[key]) return prev;
      return { ...prev, [key]: true };
    });
  }, []);

  const hasLogoError = (gameId, side) => !!logoErrorMap[`${gameId}_${side}`];

  return (
  <View style={styles.scoreboardContainer}>
    {groups.map((group, gIdx) => (
      <View
        key={group.dateKey}
        style={[styles.eventContainer, { backgroundColor: theme.background }]}
      >
        <View
          style={[
            styles.eventHeaderContainer,
            { backgroundColor: theme.surfaceSecondary },
          ]}
        >
          <View style={styles.eventHeaderMainTap}>
            <View style={styles.eventLogoContainer}>
              <Image
                            cachePolicy="memory-disk"
                            source={require("../../../assets/wnba.png")}
                            style={{ width: 80, height: 40, marginRight: 6 }}
                            resizeMode="contain"
                          />
            </View>
            <View style={styles.eventInfo}>
              <Text
                style={[styles.eventName, { color: theme.text }]}
                numberOfLines={1}
              >
                {group.label}
              </Text>
              <Text
                style={[styles.eventSubLabel, { color: theme.textTertiary }]}
              >
                WNBA
              </Text>
            </View>
          </View>
          <View style={styles.eventHeaderRight}>
            <Text style={[styles.eventCount, { color: theme.textTertiary }]}>
              {" "}
              {group.games.length}{" "}
            </Text>
          </View>
        </View>

        <View style={styles.matchesList}>
          {group.games.map((game, idx) => {
            const away = game.awayTeam || {};
            const home = game.homeTeam || {};

            const awayAbbr = (away.abbreviation || "").toUpperCase();
            const homeAbbr = (home.abbreviation || "").toUpperCase();

            const { awayColor, homeColor } = getSmartTeamColors(
              home,
              away,
              colors,
            );

            const awayLogo = getTeamLogoUrl("wnba", away?.abbreviation) || getWnbaLogoUrl(away, isDarkMode);
            const homeLogo = getTeamLogoUrl("wnba", home?.abbreviation) || getWnbaLogoUrl(home, isDarkMode);

            const isLive = isWnbaGameLive(game);
            const isFinished = isWnbaGameFinished(game);
            const awayScore = away.score;
            const homeScore = home.score;

            const awayWins =
              isFinished &&
              awayScore != null &&
              homeScore != null &&
              parseInt(awayScore, 10) > parseInt(homeScore, 10);
            const homeWins =
              isFinished &&
              awayScore != null &&
              homeScore != null &&
              parseInt(homeScore, 10) > parseInt(awayScore, 10);

            let statusLine1 = "";
            let statusLine2 = "";
            if (isFinished) {
              statusLine1 = "Final";
              const { time, ampm } = formatLocalTime(game.date);
              statusLine2 = `${time} ${ampm}`.trim();
            } else if (isLive) {
              statusLine1 = getLiveStatusLine(game).split(" - ")[0] || "";
              statusLine2 = getLiveStatusLine(game).split(" - ")[1] || "";
            } else {
              const { time, ampm } = formatLocalTime(game.date);
              statusLine1 = time;
              statusLine2 = ampm;
            }

            const awayFav = isFavorite(String(away.id || ""), "wnba");
            const homeFav = isFavorite(String(home.id || ""), "wnba");

            const awayRecord =
              typeof away.record === "object" && away.record !== null
                ? away.record.displayValue || away.record.summary || ""
                : away.record || "";
            const homeRecord =
              typeof home.record === "object" && home.record !== null
                ? home.record.displayValue || home.record.summary || ""
                : home.record || "";
            const awayHasRecord = !!awayRecord;
            const homeHasRecord = !!homeRecord;

            return (
              <TouchableOpacity
                key={game.id || idx}
                style={[
                  styles.gameRow,
                  { backgroundColor: theme.surfaceSecondary },
                ]}
                onPress={() =>
                  navigation.navigate("GameDetails", {
                    gameId: String(game.id),
                    sport: "wnba",
                    homeTeam: game.homeTeam,
                    awayTeam: game.awayTeam,
                    summerLeague: game.summerLeague || null,
                  })
                }
              >
                <CardGradient
                  gradId={`${gIdx}_${idx}`}
                  awayColor={awayColor}
                  homeColor={homeColor}
                  fallbackColor={colors.primary}
                  theme={theme}
                />

                <View style={styles.matchRow}>
                  <View style={styles.statusContainer}>
                    <Text
                      style={[
                        styles.statusLine1,
                        {
                          color: isLive
                            ? colors.primary
                            : isFinished
                              ? theme.textSecondary
                              : theme.text,
                          fontWeight: "800",
                          fontSize: 13,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {statusLine1}
                    </Text>
                    {!!statusLine2 && (
                      <Text
                        style={[
                          styles.statusLine2,
                          { color: theme.textTertiary },
                        ]}
                        numberOfLines={1}
                      >
                        {statusLine2}
                      </Text>
                    )}
                  </View>

                  <View style={styles.stackedTeams}>
                    {/* Away */}
                    <View style={styles.teamWithLogo}>
                      <View style={styles.teamLogoSmall}>
                        {awayLogo && !hasLogoError(game.id, "away") ? (
                          <Image
                            cachePolicy="memory-disk"
                            source={{ uri: awayLogo }}
                            style={[
                              styles.teamLogoSmallImg,
                              {
                                opacity: isFinished && !awayWins ? 0.55 : 1,
                              },
                            ]}
                            contentFit="contain"
                            onError={() => markLogoError(game.id, "away")}
                          />
                        ) : (
                          <View
                            style={[
                              styles.teamLogoSmallImg,
                              {
                                borderRadius: 17.5,
                                backgroundColor: awayColor || colors.primary,
                                justifyContent: "center",
                                alignItems: "center",
                                opacity: isFinished && !awayWins ? 0.55 : 1,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                color: "#fff",
                                fontSize: 10,
                                fontWeight: "800",
                              }}
                              numberOfLines={1}
                            >
                              {awayAbbr}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View
                        style={[
                          styles.teamTextStack,
                          awayHasRecord
                            ? styles.teamTextStackWithRecord
                            : styles.teamTextStackNoRecord,
                        ]}
                      >
                        <Text
                          style={[
                            styles.teamName,
                            !awayHasRecord && styles.teamNameNoRecord,
                            {
                              color: awayFav ? colors.primary : theme.text,
                              fontWeight: awayWins ? "700" : "400",
                              opacity: awayWins ? 1 : isFinished ? 0.55 : 1,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {awayFav ? "★ " : ""}
                          {away.displayName || "Away"}
                        </Text>
                        {awayHasRecord ? (
                          <Text
                            style={[
                              styles.teamRecord,
                              {
                                color: theme.textSecondary,
                                opacity: isFinished && !awayWins ? 0.55 : 1,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {awayRecord}
                          </Text>
                        ) : null}
                      </View>
                      {(isLive || isFinished) && awayScore != null && (
                        <Text
                          style={[
                            styles.scoreText,
                            {
                              color: awayWins ? colors.primary : theme.text,
                              fontWeight: awayWins ? "700" : "400",
                              opacity: !awayWins && isFinished ? 0.55 : 1,
                            },
                          ]}
                        >
                          {awayScore}
                        </Text>
                      )}
                    </View>

                    {/* Home */}
                    <View style={styles.teamWithLogo}>
                      <View style={styles.teamLogoSmall}>
                        {homeLogo && !hasLogoError(game.id, "home") ? (
                          <Image
                            cachePolicy="memory-disk"
                            source={{ uri: homeLogo }}
                            style={[
                              styles.teamLogoSmallImg,
                              {
                                opacity: isFinished && !homeWins ? 0.55 : 1,
                              },
                            ]}
                            contentFit="contain"
                            onError={() => markLogoError(game.id, "home")}
                          />
                        ) : (
                          <View
                            style={[
                              styles.teamLogoSmallImg,
                              {
                                borderRadius: 17.5,
                                backgroundColor: homeColor || colors.secondary,
                                justifyContent: "center",
                                alignItems: "center",
                                opacity: isFinished && !homeWins ? 0.55 : 1,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                color: "#fff",
                                fontSize: 10,
                                fontWeight: "800",
                              }}
                              numberOfLines={1}
                            >
                              {homeAbbr}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View
                        style={[
                          styles.teamTextStack,
                          homeHasRecord
                            ? styles.teamTextStackWithRecord
                            : styles.teamTextStackNoRecord,
                        ]}
                      >
                        <Text
                          style={[
                            styles.teamName,
                            !homeHasRecord && styles.teamNameNoRecord,
                            {
                              color: homeFav ? colors.primary : theme.text,
                              fontWeight: homeWins ? "700" : "400",
                              opacity: homeWins ? 1 : isFinished ? 0.55 : 1,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {homeFav ? "★ " : ""}
                          {home.displayName || "Home"}
                        </Text>
                        {homeHasRecord ? (
                          <Text
                            style={[
                              styles.teamRecord,
                              {
                                color: theme.textSecondary,
                                opacity: isFinished && !homeWins ? 0.55 : 1,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {homeRecord}
                          </Text>
                        ) : null}
                      </View>
                      {(isLive || isFinished) && homeScore != null && (
                        <Text
                          style={[
                            styles.scoreText,
                            {
                              color: homeWins ? colors.primary : theme.text,
                              fontWeight: homeWins ? "700" : "400",
                              opacity: !homeWins && isFinished ? 0.55 : 1,
                            },
                          ]}
                        >
                          {homeScore}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>

                <View
                  style={[styles.gameFooter, { borderTopColor: theme.border }]}
                >
                  <View style={styles.gameFooterLeft}>
                    {game.venue ? (
                      <Text
                        style={[styles.venue, { color: theme.textSecondary }]}
                      >
                        {game.venue}
                      </Text>
                    ) : null}
                    {(game.season?.type === 3 ||
                      game.season?.type === 4 ||
                      game.season?.type === 5) &&
                    game.notes ? (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                        }}
                      >
                        <Ionicons
                          name="trophy"
                          size={14}
                          color={colors.primary}
                          style={{ marginRight: 6 }}
                        />
                        <Text
                          style={[
                            styles.broadcast,
                            {
                              color: colors.primary,
                              fontWeight: "700",
                              fontStyle: "normal",
                            },
                          ]}
                        >
                          {game.notes}
                        </Text>
                      </View>
                    ) : null}
                    {game.broadcast ? (
                      <Text
                        style={[
                          styles.broadcast,
                          { color: theme.textTertiary },
                        ]}
                      >
                        {game.broadcast}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.gameFooterRight}>
                    <LiveViewerBadge
                      gameId={game.id}
                      status={{
                        isCompleted: game.isCompleted,
                        status: game.gameStatus,
                      }}
                      style={styles.viewerBadge}
                    />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    ))}
  </View>
);
};

// ── Main screen ─────────────────────────────────────────────────────
const WNBAScoreboardScreen = ({ navigation }) => {
  const { colors, theme, getTeamLogoUrl, isDarkMode } = useTheme();
  const { isPro } = useBetSlip();
  const { isFavorite } = useFavorites();

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState(getAutoSelectedDateStr());
  const [isGridView, setIsGridView] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("viewMode_wnba").then((val) => {
      if (val !== null) setIsGridView(val === "grid");
    });
  }, []);

  const toggleViewMode = () => {
    setIsGridView((v) => {
      const next = !v;
      AsyncStorage.setItem("viewMode_wnba", next ? "grid" : "list");
      return next;
    });
  };

  const intervalRef = useRef(null);
  const currentIntervalMs = useRef(null);
  const isFocusedRef = useRef(false);
  const fetchCacheRef = useRef({});
  const inFlightRef = useRef({});
  const IN_MEMORY_CACHE_MS = 10 * 1000;

  const loadData = useCallback(
    async (filter, silent = false, background = false, force = false) => {
      const now = Date.now();
      const cacheEntry = fetchCacheRef.current[filter];
      if (!force && cacheEntry && now - cacheEntry.ts < IN_MEMORY_CACHE_MS) {
        setGroups(cacheEntry.groups);
        return cacheEntry.groups;
      }

      if (inFlightRef.current[filter]) return inFlightRef.current[filter];

      const promise = (async () => {
        if (!silent) setLoading(true);
        else if (!background) setFetching(true);

        try {
          const data = await WNBAService.getScoreboard(filter, filter);
          const events = Array.isArray(data?.events) ? data.events : [];
          const games = events
            .map((e) => WNBAService.formatGameForMobile(e))
            .filter(Boolean);

          const sorted = [...games].sort((a, b) => {
            const pa = getStatusPriority(a);
            const pb = getStatusPriority(b);
            if (pa !== pb) return pa - pb;
            return new Date(a.date).getTime() - new Date(b.date).getTime();
          });

          const nextGroups = groupGamesByDate(sorted);
          setGroups(nextGroups);
          fetchCacheRef.current[filter] = {
            groups: nextGroups,
            ts: Date.now(),
          };

          return nextGroups;
        } catch (err) {
          console.error("WNBA scoreboard fetch error:", err);
          setGroups([]);
          return [];
        } finally {
          setLoading(false);
          if (!background) setFetching(false);
        }
      })();

      inFlightRef.current[filter] = promise;
      try {
        const res = await promise;
        return res;
      } finally {
        delete inFlightRef.current[filter];
      }
    },
    [],
  );

  const schedulePolling = useCallback(
    (filter, latestGroups) => {
      if (!isFocusedRef.current) return;

      const isTodayFilter = String(filter) === getTodayDateStr();
      const allGames = latestGroups.flatMap((g) => g.games);
      const hasLiveGames = allGames.some((game) => isWnbaGameLive(game));

      // Only skip polling if it's not today AND there are no live games
      if (!isTodayFilter && !hasLiveGames) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          currentIntervalMs.current = null;
        }
        return;
      }

      const desired = getPollingInterval(latestGroups);

      if (!desired) {
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
        const fresh = await loadData(filter, true, true);
        schedulePolling(filter, fresh);
      }, desired);
    },
    [loadData],
  );

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      loadData(activeFilter, true, true, true).then((fresh) =>
        schedulePolling(activeFilter, fresh),
      );

      return () => {
        isFocusedRef.current = false;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          currentIntervalMs.current = null;
        }
      };
    }, [activeFilter, loadData, schedulePolling]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    const fresh = await loadData(activeFilter, true, false, true);
    schedulePolling(activeFilter, fresh);
    setRefreshing(false);
  };

  const handleDateSelect = (dateStr) => {
    setActiveFilter(dateStr);
    loadData(dateStr, true).then((fresh) => schedulePolling(dateStr, fresh));
  };

  const AD_SPACE = 80;

  if (loading) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading WNBA Scoreboard...
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
        <DatePickerBar
          dates={DATE_OPTIONS}
          selectedDateStr={activeFilter}
          onSelect={handleDateSelect}
          isGridView={isGridView}
          toggleViewMode={toggleViewMode}
          theme={theme}
          colors={colors}
        />

        <View style={{ opacity: fetching ? 0.45 : 1 }}>
          {groups.length > 0 ? (
            isGridView ? (
              <WNBAGridSection
                groups={groups}
                navigation={navigation}
                theme={theme}
                colors={colors}
                isDarkMode={isDarkMode}
                isFavorite={isFavorite}
                getTeamLogoUrl={getTeamLogoUrl}
              />
            ) : (
              <View style={styles.listContainer}>
                <ScoreboardSection
                  groups={groups}
                  navigation={navigation}
                  theme={theme}
                  colors={colors}
                  isDarkMode={isDarkMode}
                  isFavorite={isFavorite}
                  getTeamLogoUrl={getTeamLogoUrl}
                />
              </View>
            )
          ) : (
            <View style={styles.emptyState}>
              <Ionicons
                name="basketball-outline"
                size={48}
                color={theme.textSecondary}
              />
              <Text
                style={[styles.emptyStateText, { color: theme.textSecondary }]}
              >
                No games found
              </Text>
            </View>
          )}
        </View>

        <View
          style={[styles.bottomPadding, { height: isPro ? 40 : 40 + AD_SPACE }]}
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

// ── Styles ──────────────────────────────────────────────────────────
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
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyStateText: {
    marginTop: 12,
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
  eventHeaderMainTap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  eventLogoContainer: {
    marginRight: 12,
    width: 24,
    alignItems: "center",
    justifyContent: "center",
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
  eventInfo: { flex: 1 },
  eventName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  eventSubLabel: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
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
    width: 60,
    marginRight: 14,
    alignItems: "center",
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
  teamName: {
    fontSize: 14,
    fontWeight: "500",
  },
  teamNameNoRecord: {
    fontSize: 15,
    lineHeight: 18,
  },
  teamTextStack: {
    flex: 1,
  },
  teamTextStackWithRecord: {
    justifyContent: "flex-start",
  },
  teamTextStackNoRecord: {
    justifyContent: "center",
  },
  teamRecord: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "500",
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
  broadcast: {
    fontSize: 12,
    fontStyle: "italic",
  },
  matchSeparator: {
    height: 1,
    opacity: 0.3,
  },
});

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

const wnbaGridStyles = StyleSheet.create({
  container: {
    paddingHorizontal: WNBA_GRID_H_PAD,
    marginBottom: 24,
  },
  groupWrapper: {
    marginBottom: 16,
  },
  groupHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 8,
  },
  groupBubble: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
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
    gap: WNBA_GRID_GAP,
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
    width: 50,
    height: 50,
    marginBottom: 5,
  },
  teamLogoPlaceholder: {
    width: 50,
    height: 50,
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
    width: 80,
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
    bottom: -5,
    right: -5,
    width: 30,
    height: 30,
    opacity: 0.75,
  },
  teamAbbr: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    textTransform: "uppercase",
  },
  teamRecord: {
    fontSize: 9,
    fontWeight: "500",
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
  cardBadge: {
    position: "absolute",
    top: 4,
    right: 4,
  },
});

export default WNBAScoreboardScreen;

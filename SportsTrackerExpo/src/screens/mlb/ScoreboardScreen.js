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
import { useTheme } from "../../context/ThemeContext";
import { useBetSlip } from "../../context/BetSlipContext";
import { BannerAdWrapper } from "../../services/ads";
import { useFavorites } from "../../context/FavoritesContext";
import { MLBService } from "../../services/MLBService";
import { convertMLBIdToESPNId } from "../../utils/TeamIdMapping";
import { LiveViewerBadge } from "../../components/ViewerCounter";
import WBCService from "../../services/WBCService";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width } = Dimensions.get("window");

// ─── Date utilities (shared with Top5) ───────────────────────────────────────
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
              <LinearGradient id="dfL_mlb" x1="0%" y1="0%" x2="100%" y2="0%">
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
              fill="url(#dfL_mlb)"
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
              <LinearGradient id="dfR_mlb" x1="100%" y1="0%" x2="0%" y2="0%">
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
              fill="url(#dfR_mlb)"
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

// ─── Polling helpers ──────────────────────────────────────────────────────────

const INTERVAL_SLOW = 30 * 60 * 1000; // 30 minutes
const INTERVAL_FAST = 5 * 1000; // 5 seconds
const SOON_THRESHOLD = 5 * 60 * 1000; // 5 minutes before game time

/**
 * Returns desired polling interval (ms) or null if no polling needed.
 *  - FAST (5s) : any game is live, OR a scheduled game starts within 5 min
 *  - SLOW (30m): games exist but none are live/imminent
 *  - null      : no games
 */
const getPollingInterval = (groups) => {
  const allGames = groups.flatMap((g) => g.games);
  if (allGames.length === 0) return null;

  const now = Date.now();

  for (const game of allGames) {
    // Live game → fast
    if (game.isLive || game.statusType === "I" || game.statusType === "IR") return INTERVAL_FAST;
    // Scheduled and starts within 5 min → fast
    const isScheduled =
      !game.isCompleted &&
      !game.isLive &&
      game.statusType !== "F" &&
      game.statusType !== "O" &&
      game.statusType !== "FT";
    if (isScheduled && game.date) {
      const msUntil = new Date(game.date).getTime() - now;
      if (msUntil >= 0 && msUntil <= SOON_THRESHOLD) return INTERVAL_FAST;
    }
  }
  return INTERVAL_SLOW;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getDatesForFilter = (filter) => {
  const today = new Date();
  if (filter === "yesterday") {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return { startDate: formatDate(d), endDate: formatDate(d) };
  }
  if (filter === "today") {
    return { startDate: formatDate(today), endDate: formatDate(today) };
  }
  // upcoming: tomorrow through tomorrow+6
  const start = new Date(today);
  start.setDate(today.getDate() + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { startDate: formatDate(start), endDate: formatDate(end) };
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

const groupGamesByDate = (events = []) => {
  const map = {};
  events.forEach((game) => {
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
  return Object.values(map).sort((a, b) => a.dateTs - b.dateTs);
};

const getTeamAbbr = (team) => {
  if (!team) return "MLB";
  if (team.abbreviation) return team.abbreviation;
  return (
    team.shortDisplayName ||
    team.displayName?.substring(0, 3).toUpperCase() ||
    "MLB"
  );
};

const getTeamProbablePitcher = (game, side) => {
  if (!game || (side !== "away" && side !== "home")) return null;
  return (
    game?.[`${side}Team`]?.probablePitcher ||
    game?.probablePitchers?.[side] ||
    game?.teams?.[side]?.probablePitcher ||
    null
  );
};

const isMlbGameLive = (game) => !!(game?.isLive || game?.statusType === "I" || game?.statusType === "IR");

const isMlbGameFinished = (game) =>
  !!(
    !isMlbGameLive(game) &&
    (game?.isCompleted ||
      ["F", "O", "FT", "D", "C", "Q", "R", "FM", "DI", "FR"].includes(
        game?.statusType,
      ))
  );

const isMlbGameScheduled = (game) =>
  !isMlbGameLive(game) && !isMlbGameFinished(game);

const groupHasScheduledGames = (group) =>
  !!group?.games?.some((game) => isMlbGameScheduled(game));

const getPitcherSummary = (pitcher) =>
  pitcher?.stats?.[3]?.stats?.summary || "";

const getShortPitcherName = (fullName, fallback = "Pitcher") => {
  if (!fullName || typeof fullName !== "string") return fallback;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return fullName;
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
};

const GridPitcherBlock = ({ pitcher, teamColor, theme }) => {
  if (!pitcher) return null;
  const summary = getPitcherSummary(pitcher);
  const displayName = getShortPitcherName(pitcher.fullName, "Pitcher");
  const headshotUrl = MLBService.getHeadshotUrl(pitcher.id);
  return (
    <View style={{ width: "100%", alignItems: "center" }}>
      <View
        style={[
          mlbGridStyles.pitcherDivider,
          { backgroundColor: theme.border },
        ]}
      />
      <View style={mlbGridStyles.pitcherWrap}>
        {!!summary && (
          <Text
            style={[mlbGridStyles.pitcherSummary, { color: theme.text }]}
            numberOfLines={1}
          >
            {summary}
          </Text>
        )}
        <Image
          cachePolicy="memory-disk"
          source={{ uri: headshotUrl }}
          style={[mlbGridStyles.pitcherHeadshot, { borderColor: teamColor }]}
        />
        <Text
          style={[mlbGridStyles.pitcherName, { color: theme.textSecondary }]}
          numberOfLines={1}
        >
          {displayName}
        </Text>
      </View>
    </View>
  );
};

const getGroupPitcherDebugSummary = (group) => {
  if (!group?.games?.length) {
    return {
      totalGames: 0,
      scheduledGames: 0,
      withAnyProbable: 0,
      withBothProbables: 0,
    };
  }

  let scheduledGames = 0;
  let withAnyProbable = 0;
  let withBothProbables = 0;

  group.games.forEach((game) => {
    const isLive = game.isLive || game.statusType === "I" || game.statusType === "IR";
    const isFinished =
      game.isCompleted ||
      ["F", "O", "FT", "D", "C", "Q", "R", "FM", "DI", "FR"].includes(
        game.statusType,
      );
    const isScheduled = !isLive && !isFinished;
    if (!isScheduled) return;

    scheduledGames += 1;
    const awayProbable = getTeamProbablePitcher(game, "away");
    const homeProbable = getTeamProbablePitcher(game, "home");
    const hasAway = !!awayProbable;
    const hasHome = !!homeProbable;
    if (hasAway || hasHome) withAnyProbable += 1;
    if (hasAway && hasHome) withBothProbables += 1;
  });

  return {
    totalGames: group.games.length,
    scheduledGames,
    withAnyProbable,
    withBothProbables,
  };
};

// ─── BSO dot row ─────────────────────────────────────────────────────────────

const BSODots = ({ filled, total, filledColor, theme }) => (
  <View style={{ flexDirection: "row", gap: 3, justifyContent: "center" }}>
    {Array.from({ length: total }).map((_, i) => (
      <View
        key={i}
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: i < filled ? filledColor : "transparent",
          borderWidth: 1,
          borderColor: i < filled ? filledColor : theme.border,
          shadowColor: i < filled ? filledColor : "transparent",
          elevation: 2,
          shadowOpacity: 0.6,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
    ))}
  </View>
);

const MiniBasesDiamond = ({ bases = {}, theme, occupiedColor, style }) => {
  const first = !!bases?.first;
  const second = !!bases?.second;
  const third = !!bases?.third;

  const baseStyle = (occupied) => [
    miniBaseStyles.baseDiamond,
    occupied
      ? {
          backgroundColor: occupiedColor,
          shadowColor: occupiedColor,
          elevation: 2,
          shadowOpacity: 0.6,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 0 },
        }
      : {
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: theme.border,
        },
  ];

  return (
    <View style={[miniBaseStyles.basesSmall, style]}>
      <View style={miniBaseStyles.basesSmallRow}>
        <View style={baseStyle(second)} />
      </View>
      <View style={miniBaseStyles.basesSmallRow}>
        <View style={baseStyle(third)} />
        <View style={baseStyle(first)} />
      </View>
    </View>
  );
};

const LiveLinescoreStatus = ({
  inning,
  isTopInning,
  balls,
  strikes,
  outs,
  bases,
  theme,
  colors,
}) => {
  const ordinal = MLBService.getOrdinalSuffix(inning || 0);
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <MiniBasesDiamond
        bases={bases}
        theme={theme}
        occupiedColor={colors.primary}
      />
      <Text
        style={{
          fontSize: 13,
          fontWeight: "700",
          color: colors.primary,
          textAlign: "center",
        }}
      >
        {isTopInning ? "▲" : "▼"} {ordinal}
      </Text>
      <View style={{ gap: 3 }}>
        <BSODots
          filled={balls ?? 0}
          total={4}
          filledColor={theme.success}
          theme={theme}
        />
        <BSODots
          filled={strikes ?? 0}
          total={3}
          filledColor={theme.warning}
          theme={theme}
        />
        <BSODots
          filled={outs ?? 0}
          total={3}
          filledColor={theme.error}
          theme={theme}
        />
      </View>
    </View>
  );
};

// ─── Card gradient overlay (SVG) ─────────────────────────────────────────────

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

// ─── Grid-view constants ──────────────────────────────────────────────────────
const MLB_GRID_H_PAD = 16;
const MLB_GRID_GAP = 8;
const MLB_CARD_WIDTH = (width - MLB_GRID_H_PAD * 2 - MLB_GRID_GAP) / 2;

// ─── Grid left–right gradient ─────────────────────────────────────────────────
const MLBGridCardGradient = ({
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
      width={MLB_CARD_WIDTH}
      height={safeHeight}
      viewBox={`0 0 ${MLB_CARD_WIDTH} ${safeHeight}`}
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id={`mgL_${gradId}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={left} stopOpacity="0.35" />
          <Stop offset="30%" stopColor={left} stopOpacity="0" />
          <Stop offset="70%" stopColor={right} stopOpacity="0" />
          <Stop offset="100%" stopColor={right} stopOpacity="0.35" />
        </LinearGradient>
      </Defs>
      <Rect
        x={0}
        y={0}
        width={MLB_CARD_WIDTH}
        height={safeHeight}
        fill={`url(#mgL_${gradId})`}
      />
    </Svg>
  );
};

// ─── Individual MLB grid card ─────────────────────────────────────────────────
const MLBGridCard = ({
  game,
  navigation,
  theme,
  colors,
  isDarkMode,
  isFavorite,
  showPitchers,
}) => {
  const [cardHeight, setCardHeight] = useState(0);
  const away = game.awayTeam || {};
  const home = game.homeTeam || {};
  const awayColor =
    away.color || MLBService.getTeamColor(away.displayName || "");
  const homeColor =
    home.color || MLBService.getTeamColor(home.displayName || "");
  const awayLogo =
    MLBService.getTeamLogo(away.id, isDarkMode) ||
    WBCService.getTeamLogo(away.id, isDarkMode);
  const homeLogo =
    MLBService.getTeamLogo(home.id, isDarkMode) ||
    WBCService.getTeamLogo(home.id, isDarkMode);
  const awayAbbr = (
    away.abbreviation ||
    MLBService.getTeamAbbrById(away.id) ||
    (away.displayName || "AWY").slice(0, 3)
  ).toUpperCase();
  const homeAbbr = (
    home.abbreviation ||
    MLBService.getTeamAbbrById(home.id) ||
    (home.displayName || "HME").slice(0, 3)
  ).toUpperCase();

  const { time, ampm } = formatLocalTime(game.date);
  const isLive = game.isLive || game.statusType === "I" || game.statusType === "IR";
  const isFinished =
    !isLive &&
    (game.isCompleted ||
      ["F", "O", "FT", "D", "C", "Q", "R", "FM", "DI", "FR"].includes(
        game.statusType,
      ));
  const isScheduled = !isLive && !isFinished;
  const isPostponed = game.status === "Postponed";
  const reason = game.reason || game.statusReason || "";

  const inning = game.inning;
  const show = isFinished && game.statusType !== "DI" && inning != 9;

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

  const awayFav = isFavorite(
    convertMLBIdToESPNId(away.id?.toString()) || away.id?.toString(),
    "mlb",
  );
  const homeFav = isFavorite(
    convertMLBIdToESPNId(home.id?.toString()) || home.id?.toString(),
    "mlb",
  );

  const gradId = `mg_${game.id}`;
  const awayProbable = getTeamProbablePitcher(game, "away");
  const homeProbable = getTeamProbablePitcher(game, "home");
  const liveBases = game?.bases || game?.situation?.bases || {};

  return (
    <TouchableOpacity
      style={[
        mlbGridStyles.card,
        { backgroundColor: theme.surfaceSecondary, width: MLB_CARD_WIDTH },
      ]}
      onLayout={(e) => {
        const nextHeight = Math.round(e.nativeEvent.layout.height || 0);
        setCardHeight((prev) => (prev !== nextHeight ? nextHeight : prev));
      }}
      onPress={() =>
        navigation.navigate("GameDetails", { gamePk: game.id, sport: "mlb" })
      }
      activeOpacity={0.8}
    >
      <MLBGridCardGradient
        gradId={gradId}
        awayColor={awayColor}
        homeColor={homeColor}
        fallbackColor={colors.primary}
        cardHeight={cardHeight}
      />

      {/* Status / Time */}
      <View style={mlbGridStyles.cardTop}>
        {isLive ? (
          <Text style={[mlbGridStyles.statusLive, { color: colors.primary }]}>
            {game.inningState === "Top" ? "▲" : "▼"}{" "}
            {MLBService.getOrdinalSuffix(game.inning || 0)}
          </Text>
        ) : isFinished ? (
          <Text
            style={[mlbGridStyles.statusText, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {(game.status || "Final").slice(0, 9)}
            {show ? `/${inning}` : ""}
          </Text>
        ) : isPostponed ? (
          <Text
            style={[mlbGridStyles.statusText, { color: theme.text }]}
            numberOfLines={1}
          >
            PP · <Text style={{ color: theme.textTertiary }}>{reason}</Text>
          </Text>
        ) : (
          <Text
            style={[mlbGridStyles.statusText, { color: theme.text, fontWeight: "800" }]}
            numberOfLines={1}
          >
            {time} <Text style={{ color: theme.textSecondary, fontWeight: "500" }}>{ampm}</Text>
          </Text>
        )}
        <LiveViewerBadge
          gameId={game.id}
          status={game.status}
          scale={0.7}
          style={mlbGridStyles.cardBadge}
        />
      </View>

      {/* Teams side by side */}
      <View style={mlbGridStyles.teamsRow}>
        {/* Away */}
        <View style={mlbGridStyles.teamSide}>
          {isScheduled ? (
            awayLogo ? (
              <Image
                cachePolicy="memory-disk"
                source={{ uri: awayLogo }}
                style={mlbGridStyles.teamLogo}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  mlbGridStyles.teamLogoPlaceholder,
                  { backgroundColor: awayColor || colors.primary },
                ]}
              >
                <Text style={mlbGridStyles.teamLogoPlaceholderText}>
                  {(away.displayName || "A")[0]}
                </Text>
              </View>
            )
          ) : (
            <View style={mlbGridStyles.scoreCell}>
              <Text
                style={[
                  mlbGridStyles.scoreText,
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
                {awayScore ?? "—"}
              </Text>
              {awayLogo && (
                <Image
                  cachePolicy="memory-disk"
                  source={{ uri: awayLogo }}
                  style={[mlbGridStyles.scoreLogoOverlay, { opacity: isFinished && !awayWins ? 0.55 : 1}]}
                  resizeMode="contain"
                />
              )}
            </View>
          )}
          <Text
            style={[
              mlbGridStyles.teamAbbr,
              { color: awayFav ? colors.primary : theme.text, opacity: isFinished && !awayWins ? 0.55 : 1 },
            ]}
          >
            {awayFav ? "★ " : ""}
            {awayAbbr}
          </Text>
          {away.record ? (
            <Text
              style={[mlbGridStyles.teamRecord, { color: theme.textSecondary, opacity: isFinished && !awayWins ? 0.55 : 1 }]}
            >
              {away.record}
            </Text>
          ) : null}
          {isScheduled && showPitchers && (
            <GridPitcherBlock
              pitcher={awayProbable}
              teamColor={awayColor || colors.primary}
              theme={theme}
            />
          )}
        </View>

        <View
          style={[mlbGridStyles.divider, { backgroundColor: theme.border }]}
        />

        {/* Home */}
        <View style={mlbGridStyles.teamSide}>
          {isScheduled ? (
            homeLogo ? (
              <Image
                cachePolicy="memory-disk"
                source={{ uri: homeLogo }}
                style={mlbGridStyles.teamLogo}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  mlbGridStyles.teamLogoPlaceholder,
                  { backgroundColor: homeColor || colors.secondary },
                ]}
              >
                <Text style={mlbGridStyles.teamLogoPlaceholderText}>
                  {(home.displayName || "H")[0]}
                </Text>
              </View>
            )
          ) : (
            <View style={mlbGridStyles.scoreCell}>
              <Text
                style={[
                  mlbGridStyles.scoreText,
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
                {homeScore ?? "—"}
              </Text>
              {homeLogo && (
                <Image
                  cachePolicy="memory-disk"
                  source={{ uri: homeLogo }}
                  style={[mlbGridStyles.scoreLogoOverlay, { opacity: isFinished && !homeWins ? 0.55 : 1 }]}
                  resizeMode="contain"
                />
              )}
            </View>
          )}
          <Text
            style={[
              mlbGridStyles.teamAbbr,
              { color: homeFav ? colors.primary : theme.text, opacity: isFinished && !homeWins ? 0.55 : 1 },
            ]}
          >
            {homeFav ? "★ " : ""}
            {homeAbbr}
          </Text>
          {home.record ? (
            <Text
              style={[mlbGridStyles.teamRecord, { color: theme.textSecondary, opacity: isFinished && !homeWins ? 0.55 : 1 }]}
            >
              {home.record}
            </Text>
          ) : null}
          {isScheduled && showPitchers && (
            <GridPitcherBlock
              pitcher={homeProbable}
              teamColor={homeColor || colors.secondary}
              theme={theme}
            />
          )}
        </View>
      </View>

      {/* Footer: venue or BSO */}
      <View
        style={[mlbGridStyles.cardFooter, { borderTopColor: theme.border }]}
      >
        {isLive ? (
          <View style={[mlbGridStyles.liveFooterContent, { gap: 50 }]}>
            <View style={mlbGridStyles.liveCountStack}>
              <BSODots
                filled={game.balls ?? 0}
                total={4}
                filledColor={theme.success}
                theme={theme}
              />
              <BSODots
                filled={game.strikes ?? 0}
                total={3}
                filledColor={theme.warning}
                theme={theme}
              />
              <BSODots
                filled={game.outs ?? 0}
                total={3}
                filledColor={theme.error}
                theme={theme}
              />
            </View>
            <MiniBasesDiamond
              bases={liveBases}
              theme={theme}
              occupiedColor={colors.primary}
              style={mlbGridStyles.liveDiamondWrap}
            />
          </View>
        ) : (
          <Text
            style={[mlbGridStyles.venueText, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {game.venue || ""}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ─── MLB Grid section (floating bubble headers + 2-col cards) ─────────────────
const MLBGridSection = ({
  groups,
  navigation,
  theme,
  colors,
  isDarkMode,
  isFavorite,
  activeFilter,
  collapsedGroups,
  toggleCollapse,
  showPitchersEnabled,
  togglePitchersGroup,
}) => (
  <View style={mlbGridStyles.container}>
    {groups.map((group) => {
      const showPitchersToggle = groupHasScheduledGames(group);
      return (
        <View key={group.dateKey} style={mlbGridStyles.groupWrapper}>
          <View style={mlbGridStyles.groupHeaderRow}>
            {/* Floating bubble group label */}
            <TouchableOpacity
              style={[
                mlbGridStyles.groupBubble,
                { backgroundColor: theme.surfaceSecondary },
              ]}
              activeOpacity={activeFilter === "upcoming" ? 0.7 : 1}
              onPress={() =>
                activeFilter === "upcoming" && toggleCollapse(group.dateKey)
              }
            >
              <Image
                cachePolicy="memory-disk"
                source={require("../../../assets/mlb.png")}
                style={mlbGridStyles.groupBubbleLogo}
                resizeMode="contain"
              />
              <Text
                style={[mlbGridStyles.groupBubbleName, { color: theme.text }]}
                numberOfLines={1}
              >
                {group.label}
              </Text>
              <Text
                style={[
                  mlbGridStyles.groupBubbleCount,
                  { color: theme.textTertiary },
                ]}
              >
                {" "}
                {group.games.length}
              </Text>
              {activeFilter === "upcoming" && (
                <Text
                  style={[
                    { color: theme.textTertiary, marginLeft: 4, fontSize: 12 },
                  ]}
                >
                  {collapsedGroups[group.dateKey] ? "▶" : "▼"}
                </Text>
              )}
            </TouchableOpacity>
            {showPitchersToggle && (
              <TouchableOpacity
                style={[
                  mlbGridStyles.pitchersBtn,
                  {
                    borderColor: showPitchersEnabled
                      ? colors.primary
                      : theme.border,
                    backgroundColor: showPitchersEnabled
                      ? theme.surface
                      : "transparent",
                  },
                ]}
                onPress={() => togglePitchersGroup(group.dateKey)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="person-outline"
                  size={14}
                  color={
                    showPitchersEnabled ? colors.primary : theme.textSecondary
                  }
                />
                <Text
                  style={[
                    mlbGridStyles.pitchersBtnText,
                    {
                      color: showPitchersEnabled
                        ? colors.primary
                        : theme.textSecondary,
                    },
                  ]}
                >
                  Pitchers
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {/* 2-column card grid */}
          {(() => {
            const isCollapsed =
              activeFilter === "upcoming" && !!collapsedGroups[group.dateKey];
            const displayedGames = isCollapsed
              ? group.games.slice(0, 2)
              : group.games;
            return (
              <View style={mlbGridStyles.cardsRow}>
                {displayedGames.map((game) => (
                  <MLBGridCard
                    key={game.id}
                    game={game}
                    navigation={navigation}
                    theme={theme}
                    colors={colors}
                    isDarkMode={isDarkMode}
                    isFavorite={isFavorite}
                    showPitchers={showPitchersEnabled}
                  />
                ))}
              </View>
            );
          })()}
        </View>
      );
    })}
  </View>
);

// ─── Scoreboard section ───────────────────────────────────────────────────────

const ScoreboardSection = ({
  groups,
  navigation,
  theme,
  isDarkMode,
  colors,
  isFavorite,
  getTeamLogoUrl,
  activeFilter,
  collapsedGroups,
  toggleCollapse,
  showPitchersEnabled,
  togglePitchersGroup,
}) => (
  <View style={styles.scoreboardContainer}>
    {groups.map((group, gIdx) => {
      const showPitchersToggle = groupHasScheduledGames(group);
      return (
        <View
          key={group.dateKey}
          style={[styles.eventContainer, { backgroundColor: theme.background }]}
        >
          {/* Date header (tappable to collapse/expand when upcoming) */}
          <View
            style={[
              styles.eventHeaderContainer,
              { backgroundColor: theme.surfaceSecondary },
            ]}
          >
            <TouchableOpacity
              style={styles.eventHeaderMainTap}
              activeOpacity={0.8}
              onPress={() =>
                activeFilter === "upcoming" && toggleCollapse(group.dateKey)
              }
            >
              <View style={styles.eventLogoContainer}>
                <Image
                  cachePolicy="memory-disk"
                  source={require("../../../assets/mlb.png")}
                  style={styles.eventLogoImage}
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
                  MLB
                </Text>
              </View>
            </TouchableOpacity>
            <View style={styles.eventHeaderRight}>
              <Text style={[styles.eventCount, { color: theme.textTertiary }]}>
                {" "}
                {group.games.length}{" "}
              </Text>
              {showPitchersToggle && (
                <TouchableOpacity
                  onPress={() => togglePitchersGroup(group.dateKey)}
                  style={[
                    styles.listPitcherToggleBtn,
                    {
                      borderColor: showPitchersEnabled
                        ? colors.primary
                        : theme.border,
                      backgroundColor: showPitchersEnabled
                        ? theme.surface
                        : "transparent",
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="person-outline"
                    size={16}
                    color={
                      showPitchersEnabled ? colors.primary : theme.textTertiary
                    }
                  />
                </TouchableOpacity>
              )}
              {activeFilter === "upcoming" && (
                <Text
                  style={[styles.eventArrow, { color: theme.textTertiary }]}
                >
                  {" "}
                  {collapsedGroups[group.dateKey] ? "▶" : "▼"}{" "}
                </Text>
              )}
            </View>
          </View>

          {/* Match rows */}
          <View style={styles.matchesList}>
            {(() => {
              const isCollapsed =
                activeFilter === "upcoming" && !!collapsedGroups[group.dateKey];
              const displayedGames = isCollapsed
                ? group.games.slice(0, 1)
                : group.games;
              return displayedGames.map((game, idx) => {
                const away = game.awayTeam || {};
                const home = game.homeTeam || {};
                const awayAbbr = getTeamAbbr(away);
                const homeAbbr = getTeamAbbr(home);
                const awayColor =
                  away.color || MLBService.getTeamColor(away.displayName || "");
                const homeColor =
                  home.color || MLBService.getTeamColor(home.displayName || "");
                // prefer the pre-computed logo from MLBService (built from full team name map)
                const awayLogo = WBCService.getTeamLogo(away?.id, isDarkMode);
                const homeLogo = WBCService.getTeamLogo(home?.id, isDarkMode);

                const isLive = game.isLive || game.statusType === "I" || game.statusType === "IR";
                const isFinished =
                  game.isCompleted ||
                  [
                    "F",
                    "O",
                    "FT",
                    "D",
                    "C",
                    "Q",
                    "R",
                    "FM",
                    "DI",
                    "FR",
                  ].includes(game.statusType);
                const isScheduled = !isLive && !isFinished;
                const isPostponed = game.status === "Postponed";
                const reason = game.reason || game.statusReason || "";
                const awayProbable = getTeamProbablePitcher(game, "away");
                const homeProbable = getTeamProbablePitcher(game, "home");
                const awaySummary = getPitcherSummary(awayProbable);
                const homeSummary = getPitcherSummary(homeProbable);
                const awayHeadshot = MLBService.getHeadshotUrl(
                  awayProbable?.id,
                );
                const homeHeadshot = MLBService.getHeadshotUrl(
                  homeProbable?.id,
                );
                const liveBases = game?.bases || game?.situation?.bases || {};

                const inning = game.inning || 0;
                const show =
                  isFinished && game.statusType !== "DI" && inning != 9;

                const awayScore = game.awayTeam?.score;
                const homeScore = game.homeTeam?.score;
                const awayWins =
                  isFinished &&
                  awayScore != null &&
                  homeScore != null &&
                  parseInt(awayScore) > parseInt(homeScore);
                const homeWins =
                  isFinished &&
                  awayScore != null &&
                  homeScore != null &&
                  parseInt(homeScore) > parseInt(awayScore);

                // Status column text (non-live only; live shows LiveLinescoreStatus)
                let statusLine1 = "";
                let statusLine2 = "";
                if (isFinished) {
                  const { time, ampm } = formatLocalTime(game.date);
                  statusLine1 = show ? `Final/${inning}` : "Final";
                  statusLine2 = `${time} ${ampm}`;
                } else if (!isLive) {
                  const { time, ampm } = formatLocalTime(game.date);
                  statusLine1 = time;
                  statusLine2 = ampm;
                }

                // Favorites
                const awayEspnId =
                  convertMLBIdToESPNId(away.id?.toString()) ||
                  away.id?.toString();
                const homeEspnId =
                  convertMLBIdToESPNId(home.id?.toString()) ||
                  home.id?.toString();
                const awayFav = isFavorite(awayEspnId, "mlb");
                const homeFav = isFavorite(homeEspnId, "mlb");

                return (
                  <TouchableOpacity
                    key={game.id || idx}
                    style={[
                      styles.gameRow,
                      { backgroundColor: theme.surfaceSecondary },
                    ]}
                    onPress={() =>
                      navigation.navigate("GameDetails", {
                        gamePk: game.id,
                        sport: "mlb",
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
                      {/* Status column */}
                      <View style={styles.statusContainer}>
                        {isLive ? (
                          <LiveLinescoreStatus
                            inning={game.inning}
                            isTopInning={game.inningState === "Top"}
                            balls={game.balls}
                            strikes={game.strikes}
                            outs={game.outs}
                            bases={liveBases}
                            theme={theme}
                            colors={colors}
                          />
                        ) : isPostponed ? (
                          <>
                            <Text
                              style={[
                                styles.statusLine1,
                                {
                                  color: isFinished
                                    ? theme.textSecondary
                                    : theme.text,
                                  fontWeight: "700",
                                },
                              ]}
                              numberOfLines={1}
                            >
                              Post.
                            </Text>
                            {!!statusLine2 && (
                              <Text
                                style={[
                                  styles.statusLine2,
                                  { color: theme.textTertiary },
                                ]}
                                numberOfLines={1}
                              >
                                {reason}
                              </Text>
                            )}
                          </>
                        ) : (
                          <>
                            <Text
                              style={[
                                styles.statusLine1,
                                {
                                  color: isFinished
                                    ? theme.textSecondary
                                    : theme.text,
                                  fontWeight: "800",
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
                          </>
                        )}
                      </View>

                      {/* Stacked teams */}
                      <View style={styles.stackedTeams}>
                        {/* Away */}
                        <View style={styles.teamWithLogo}>
                          <View style={styles.teamLogoSmall}>
                            {awayLogo ? (
                              <Image
                                cachePolicy="memory-disk"
                                source={{ uri: awayLogo }}
                                style={[styles.teamLogoSmallImg, { opacity: isFinished && !awayWins ? 0.55 : 1 }]}
                                resizeMode="contain"
                              />
                            ) : (
                              <View
                                style={[
                                  styles.teamLogoSmallImg,
                                  {
                                    backgroundColor:
                                      awayColor || colors.primary,
                                    justifyContent: "center",
                                    alignItems: "center",
                                    opacity: isFinished && !awayWins ? 0.55 : 1,
                                  },
                                ]}
                              >
                                <Text style={styles.teamLogoFallback}>
                                  {awayAbbr.substring(0, 1)}
                                </Text>
                              </View>
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.teamName,
                                {
                                  color: awayFav ? colors.primary : theme.text,
                                  fontWeight: awayWins ? "700" : "400",
                                  opacity: isFinished && !awayWins ? 0.55 : 1,
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {awayFav ? "★ " : ""}
                              {away.displayName || "Away"}
                            </Text>
                            {away.record ? (
                              <Text
                                style={[
                                  styles.teamRecord,
                                  { color: theme.textSecondary, opacity: isFinished && !awayWins ? 0.55 : 1 },
                                ]}
                              >
                                {away.record}
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
                            {homeLogo ? (
                              <Image
                                cachePolicy="memory-disk"
                                source={{ uri: homeLogo }}
                                style={[styles.teamLogoSmallImg, { opacity: isFinished && !homeWins ? 0.55 : 1 }]}
                                resizeMode="contain"
                              />
                            ) : (
                              <View
                                style={[
                                  styles.teamLogoSmallImg,
                                  {
                                    backgroundColor:
                                      homeColor || colors.primary,
                                    justifyContent: "center",
                                    alignItems: "center",
                                    opacity: isFinished && !homeWins ? 0.55 : 1,
                                  },
                                ]}
                              >
                                <Text style={styles.teamLogoFallback}>
                                  {homeAbbr.substring(0, 1)}
                                </Text>
                              </View>
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.teamName,
                                {
                                  color: homeFav ? colors.primary : theme.text,
                                  fontWeight: homeWins ? "700" : "400",
                                  opacity: isFinished && !homeWins ? 0.55 : 1,
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {homeFav ? "★ " : ""}
                              {home.displayName || "Home"}
                            </Text>
                            {home.record ? (
                              <Text
                                style={[
                                  styles.teamRecord,
                                  { color: theme.textSecondary, opacity: isFinished && !homeWins ? 0.55 : 1 },
                                ]}
                              >
                                {home.record}
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

                    {showPitchersEnabled && isScheduled && (
                      <View
                        style={[
                          styles.pitchersRow,
                          { borderTopColor: theme.border },
                        ]}
                      >
                        <View style={styles.pitcherSideCell}>
                          <View style={styles.pitcherInfoRowAway}>
                            {!!awayProbable?.id && (
                              <Image
                                cachePolicy="memory-disk"
                                source={{ uri: awayHeadshot }}
                                style={[
                                  styles.listPitcherHeadshot,
                                  { borderColor: awayColor || colors.primary },
                                ]}
                              />
                            )}
                            <View style={styles.pitcherTextStackAway}>
                              {!!awaySummary && (
                                <Text
                                  style={[
                                    styles.pitcherSummaryText,
                                    { color: theme.text },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {awaySummary}
                                </Text>
                              )}
                              <Text
                                style={[
                                  styles.pitcherNameText,
                                  { color: theme.textSecondary },
                                ]}
                                numberOfLines={1}
                              >
                                {getShortPitcherName(
                                  awayProbable?.fullName,
                                  "TBD",
                                )}
                              </Text>
                            </View>
                          </View>
                        </View>

                        <Text
                          style={[
                            styles.pitchersVsText,
                            { color: theme.textTertiary },
                          ]}
                        >
                          vs
                        </Text>

                        <View style={styles.pitcherSideCell}>
                          <View style={styles.pitcherInfoRowHome}>
                            <View style={styles.pitcherTextStackHome}>
                              {!!homeSummary && (
                                <Text
                                  style={[
                                    styles.pitcherSummaryText,
                                    { color: theme.text },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {homeSummary}
                                </Text>
                              )}
                              <Text
                                style={[
                                  styles.pitcherNameText,
                                  { color: theme.textSecondary },
                                ]}
                                numberOfLines={1}
                              >
                                {getShortPitcherName(
                                  homeProbable?.fullName,
                                  "TBD",
                                )}
                              </Text>
                            </View>
                            {!!homeProbable?.id && (
                              <Image
                                cachePolicy="memory-disk"
                                source={{ uri: homeHeadshot }}
                                style={[
                                  styles.listPitcherHeadshot,
                                  { borderColor: homeColor || colors.primary },
                                ]}
                              />
                            )}
                          </View>
                        </View>
                      </View>
                    )}

                    {/* Footer: venue + live viewer badge */}
                    <View
                      style={[
                        styles.gameFooter,
                        { borderTopColor: theme.border },
                      ]}
                    >
                      <View style={styles.gameFooterLeft}>
                        {game.venue ? (
                          <Text
                            style={[
                              styles.venue,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {game.venue}
                          </Text>
                        ) : null}
                        {game.notes1 ||
                        (game.notes && game.gameType !== "R") ? (
                          <Text
                            style={[
                              styles.broadcast,
                              { color: theme.textTertiary },
                            ]}
                          >
                            {game.notes && game.notes1
                              ? `${game.notes} · ${game.notes1}`
                              : game.notes1 || game.notes}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.gameFooterRight}>
                        <LiveViewerBadge
                          gameId={game.id}
                          status={game.status}
                          style={styles.viewerBadge}
                        />
                      </View>
                    </View>

                    {idx < group.games.length - 1 && (
                      <View
                        style={[
                          styles.matchSeparator,
                          { backgroundColor: theme.border },
                        ]}
                      />
                    )}
                  </TouchableOpacity>
                );
              });
            })()}
          </View>
        </View>
      );
    })}
  </View>
);

// ─── Main screen ──────────────────────────────────────────────────────────────

const MLBScoreboardScreen = ({ navigation }) => {
  const { colors, theme, isDarkMode, getTeamLogoUrl } = useTheme();
  const { isFavorite } = useFavorites();
  const { isPro } = useBetSlip();
  const AD_SPACE = 80;

  const [groups, setGroups] = useState([]);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState(getAutoSelectedDateStr());
  const [isGridView, setIsGridView] = useState(false);
  const [showPitchersEnabled, setShowPitchersEnabled] = useState(false);

  // Persist grid/list preference
  useEffect(() => {
    AsyncStorage.getItem("viewMode_mlb").then((val) => {
      if (val !== null) setIsGridView(val === "grid");
    });

    AsyncStorage.getItem("showPitchersEnabled_mlb").then((val) => {
      if (val !== null) {
        setShowPitchersEnabled(val === "true");
        return;
      }

      // Backward compatibility: migrate old per-day map to global boolean.
      AsyncStorage.getItem("showPitchersByGroup_mlb").then((legacyVal) => {
        if (!legacyVal) return;
        try {
          const parsed = JSON.parse(legacyVal);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const anyEnabled = Object.values(parsed).some(Boolean);
            setShowPitchersEnabled(anyEnabled);
          }
        } catch {
          // ignore malformed persisted state
        }
      });
    });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(
      "showPitchersEnabled_mlb",
      String(showPitchersEnabled),
    );
  }, [showPitchersEnabled]);

  const toggleViewMode = () => {
    setIsGridView((v) => {
      const next = !v;
      AsyncStorage.setItem("viewMode_mlb", next ? "grid" : "list");
      return next;
    });
  };

  const handleDateSelect = (dateStr) => {
    setActiveFilter(dateStr);
    lastLoadedFilterRef.current = dateStr;
    loadData(dateStr, true).then((fresh) => schedulePolling(dateStr, fresh));
  };

  const intervalRef = useRef(null);
  const currentIntervalMs = useRef(null);
  const isFocusedRef = useRef(false);
  const lastLoadedFilterRef = useRef(null);
  const fetchCacheRef = useRef({});
  const inFlightRef = useRef({});
  const IN_MEMORY_CACHE_MS = 10 * 1000; // 10s UI-level cache to avoid rapid refetches

  const loadData = useCallback(
    async (filter, silent = false, background = false, force = false) => {
      // UI-level dedupe: return cached groups if very recently loaded
      const now = Date.now();
      const cacheEntry = fetchCacheRef.current[filter];
      if (!force && cacheEntry && now - cacheEntry.ts < IN_MEMORY_CACHE_MS) {
        // Use cached data, don't refetch
        setGroups(cacheEntry.groups);
        lastLoadedFilterRef.current = filter;
        return cacheEntry.groups;
      }

      // If there's an in-flight fetch for the same filter, reuse it
      if (inFlightRef.current[filter]) return inFlightRef.current[filter];

      const promise = (async () => {
        if (!silent) setLoading(true);
        else if (!background) setFetching(true);
        try {
          let startDate, endDate;
          // support date-string filter from DatePickerBar (YYYYMMDD)
          if (/^\d{8}$/.test(String(filter))) {
            const y = Number(String(filter).slice(0, 4));
            const m = Number(String(filter).slice(4, 6)) - 1;
            const d = Number(String(filter).slice(6, 8));
            const dt = new Date(y, m, d);
            startDate = formatDate(dt);
            endDate = formatDate(dt);
          } else {
            const tmp = getDatesForFilter(filter);
            startDate = tmp.startDate;
            endDate = tmp.endDate;
          }
          const data = await MLBService.getScoreboard(startDate, endDate);

          let events = data?.events || [];

          // Sort: live → scheduled → finished, then by time within group
          const getStatusPriority = (game) => {
            if (game.isLive || game.statusType === "I" || game.statusType === "IR") return 1;
            if (
              game.isCompleted ||
              ["F", "O", "FT", "D", "C", "Q", "R", "FM", "DI", "FR"].includes(
                game.statusType,
              )
            )
              return 3;
            return 2;
          };
          events = [...events].sort((a, b) => {
            const pa = getStatusPriority(a);
            const pb = getStatusPriority(b);
            if (pa !== pb) return pa - pb;
            return new Date(a.date).getTime() - new Date(b.date).getTime();
          });

          const nextGroups = groupGamesByDate(events);
          setGroups(nextGroups);
          // Track last loaded filter to avoid unnecessary reloads on focus
          lastLoadedFilterRef.current = filter;
          // Cache results at UI level to prevent rapid repeated fetches
          fetchCacheRef.current[filter] = {
            groups: nextGroups,
            ts: Date.now(),
          };

          // For upcoming filter, default groups to collapsed (unless user toggled before)
          if (
            filter === "upcoming" ||
            (typeof filter === "string" &&
              /^\d{8}$/.test(filter) &&
              filter > getTodayDateStr())
          ) {
            setCollapsedGroups((prev) => {
              const map = { ...prev };
              nextGroups.forEach((g) => {
                if (map[g.dateKey] === undefined) map[g.dateKey] = true;
              });
              return map;
            });
          }

          return nextGroups;
        } catch (err) {
          console.error("MLB scoreboard fetch error:", err);
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

  const toggleCollapse = (dateKey) =>
    setCollapsedGroups((prev) => ({ ...prev, [dateKey]: !prev[dateKey] }));

  const togglePitchersGroup = (dateKey) =>
    setShowPitchersEnabled((prev) => {
      const group = groups.find((g) => g.dateKey === dateKey);
      if (!groupHasScheduledGames(group)) return prev;

      const nextValue = !prev;
      const summary = getGroupPitcherDebugSummary(group);

      console.log("[MLB Pitchers Toggle]", {
        dateKey,
        nextValue,
        appliesToAllDays: true,
        label: group?.label || "Unknown",
        ...summary,
      });

      return nextValue;
    });

  useEffect(() => {
    if (!showPitchersEnabled) return;

    const details = groups
      .filter((group) => groupHasScheduledGames(group))
      .map((group) => {
        return {
          dateKey: group.dateKey,
          label: group?.label || "Unknown",
          ...getGroupPitcherDebugSummary(group),
        };
      });

    console.log("[MLB Pitchers Visible Groups]", details);
  }, [showPitchersEnabled, groups]);

  const schedulePolling = useCallback(
    (filter, latestGroups) => {
      // Don't schedule if screen is not focused
      if (!isFocusedRef.current) return;

      // Only auto-poll for "today". Accept either the literal "today"
      // or a YYYYMMDD date string that matches today's date.
      const isTodayFilter =
        filter === "today" ||
        (/^\d{8}$/.test(String(filter)) &&
          String(filter) === getTodayDateStr());
      if (!isTodayFilter) {
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

  // Start/stop polling based on screen focus
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      // Always refresh when returning to this screen so game detail -> back
      // immediately reflects latest scores.
      loadData(activeFilter, true, true, true).then((fresh) =>
        schedulePolling(activeFilter, fresh),
      );

      return () => {
        // Stop polling immediately when screen loses focus
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
    const fresh = await loadData(activeFilter, true);
    schedulePolling(activeFilter, fresh);
    setRefreshing(false);
  };

  const handleFilterChange = (filter) => {
    setActiveFilter(filter);
    loadData(filter, true).then((fresh) => schedulePolling(filter, fresh));
  };

  if (loading) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading MLB Scoreboard…
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
        {/* Sticky date picker bar (copied from Top5) */}
        <DatePickerBar
          dates={DATE_OPTIONS}
          selectedDateStr={activeFilter}
          onSelect={handleDateSelect}
          isGridView={isGridView}
          toggleViewMode={toggleViewMode}
          theme={theme}
          colors={colors}
        />

        {/* Games or empty state */}
        <View style={{ opacity: fetching ? 0.45 : 1 }}>
          {groups.length > 0 ? (
            isGridView ? (
              <MLBGridSection
                groups={groups}
                navigation={navigation}
                theme={theme}
                colors={colors}
                isDarkMode={isDarkMode}
                isFavorite={isFavorite}
                activeFilter={activeFilter}
                collapsedGroups={collapsedGroups}
                toggleCollapse={toggleCollapse}
                showPitchersEnabled={showPitchersEnabled}
                togglePitchersGroup={togglePitchersGroup}
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
                  activeFilter={activeFilter}
                  collapsedGroups={collapsedGroups}
                  toggleCollapse={toggleCollapse}
                  showPitchersEnabled={showPitchersEnabled}
                  togglePitchersGroup={togglePitchersGroup}
                />
              </View>
            )
          ) : (
            <View style={styles.emptyState}>
              <Text
                style={[styles.emptyStateText, { color: theme.textSecondary }]}
              >
                No games found
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.bottomPadding, { height: 40 }]} />
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
  listPitcherToggleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    marginLeft: 4,
    alignItems: "center",
    justifyContent: "center",
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
    width: 55,
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
  teamRecord: {
    fontSize: 11,
    marginTop: 1,
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
  pitchersRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginTop: -8,
    paddingTop: 8,
    paddingBottom: 8,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  pitcherSideCell: {
    flex: 1,
  },
  pitcherInfoRowAway: {
    flexDirection: "row",
    alignItems: "center",
  },
  pitcherInfoRowHome: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  pitcherTextStackAway: {
    flex: 1,
    marginLeft: 6,
    alignItems: "flex-start",
  },
  pitcherTextStackHome: {
    flex: 1,
    marginRight: 6,
    alignItems: "flex-end",
  },
  listPitcherHeadshot: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    borderWidth: 1.5,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  pitcherSummaryText: {
    fontSize: 11,
    fontWeight: "700",
  },
  pitcherNameText: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
  },
  pitchersVsText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
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

// ─── Date picker bar styles (copied from Top5)
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

const miniBaseStyles = StyleSheet.create({
  basesSmall: {
    alignItems: "center",
    gap: 2,
    marginBottom: 2,
  },
  basesSmallRow: {
    flexDirection: "row",
    gap: 15,
  },
  baseDiamond: {
    width: 12,
    height: 12,
    borderRadius: 0.5,
    transform: [{ rotate: "45deg" }],
  },
});

// ─── MLB Grid-view styles ──────────────────────────────────────────────────────
const mlbGridStyles = StyleSheet.create({
  container: {
    paddingHorizontal: MLB_GRID_H_PAD,
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
  pitchersBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  pitchersBtnText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
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
    gap: MLB_GRID_GAP,
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
  teamRecord: {
    fontSize: 10,
    textAlign: "center",
    marginTop: 1,
  },
  pitcherWrap: {
    marginTop: 6,
    width: "100%",
    paddingHorizontal: 2,
    alignItems: "center",
    minHeight: 72,
  },
  pitcherDivider: {
    height: StyleSheet.hairlineWidth,
    width: "78%",
    alignSelf: "center",
    borderRadius: 1,
    marginTop: 8,
    marginBottom: 6,
  },
  pitcherSummary: {
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  pitcherHeadshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  pitcherName: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "500",
    maxWidth: "100%",
  },
  cardFooter: {
    borderTopWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: "center",
    minHeight: 30,
    justifyContent: "center",
  },
  liveFooterContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  liveCountStack: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  liveDiamondWrap: {
    marginBottom: 0,
  },
  venueText: {
    fontSize: 9,
    textAlign: "center",
  },
  bsoContainer: {
    alignItems: "center",
    gap: 3,
  },
  bsoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  cardBadge: {
    position: "absolute",
    top: 4,
    right: 4,
  },
});

export default MLBScoreboardScreen;

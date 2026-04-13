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
import { useFavorites } from "../../context/FavoritesContext";
import { LiveViewerBadge } from "../../components/ViewerCounter";
import { NHLService } from "../../services/NHLService";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width } = Dimensions.get("window");

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
              <LinearGradient id="dfL_nhl" x1="0%" y1="0%" x2="100%" y2="0%">
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
              fill="url(#dfL_nhl)"
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
              <LinearGradient id="dfR_nhl" x1="100%" y1="0%" x2="0%" y2="0%">
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
              fill="url(#dfR_nhl)"
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

const INTERVAL_SLOW = 30 * 60 * 1000;
const INTERVAL_FAST = 5 * 1000;
const SOON_THRESHOLD = 5 * 60 * 1000;

const isNhlGameLive = (game) => {
  const state = String(game?.gameState || "").toUpperCase();
  return state === "LIVE" || state === "CRIT";
};

const isNhlGameFinished = (game) => {
  const state = String(game?.gameState || "").toUpperCase();
  return ["OFF", "FINAL", "OVER"].includes(state);
};

const pad2 = (v) => String(Math.max(0, v)).padStart(2, "0");

const getLiveRemainingFromAnchor = (game, nowMs) => {
  const base = Number(
    game?.__tickAnchorRemaining ?? game?.clock?.secondsRemaining ?? 0,
  );
  if (!Number.isFinite(base)) return 0;
  const running = game?.__tickRunning === true;
  const anchorTs = Number(game?.__tickAnchorTs ?? nowMs);
  const elapsed = running
    ? Math.max(0, Math.floor((nowMs - anchorTs) / 1000))
    : 0;
  return Math.max(0, base - elapsed);
};

const formatRemainingClock = (seconds) => {
  const safe = Math.max(0, Number(seconds) || 0);
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${mm}:${pad2(ss)}`;
};

const normalizeGamesWithClockState = (games, prevById, nowMs) => {
  return (games || []).map((game) => {
    if (!isNhlGameLive(game)) return game;

    const gameId = String(game?.id ?? "");
    const prev = prevById[gameId];
    const jsonRemaining = Number(game?.clock?.secondsRemaining ?? 0);
    const safeJsonRemaining = Number.isFinite(jsonRemaining)
      ? Math.max(0, jsonRemaining)
      : 0;
    const jsonRunning = game?.clock?.running === true;

    let nextRemaining = safeJsonRemaining;

    if (prev && jsonRunning) {
      const prevRemainingNow = getLiveRemainingFromAnchor(prev, nowMs);
      if (prevRemainingNow > safeJsonRemaining) {
        // Keep local forward clock when feed lags behind but still says clock is running.
        nextRemaining = prevRemainingNow;
      }
    }

    if (prev && !jsonRunning) {
      // On stoppage, trust official feed snapshot.
      nextRemaining = safeJsonRemaining;
    }

    return {
      ...game,
      __tickAnchorRemaining: nextRemaining,
      __tickAnchorTs: nowMs,
      __tickRunning: jsonRunning,
    };
  });
};

const getPollingInterval = (groups) => {
  const allGames = groups.flatMap((g) => g.games);
  if (allGames.length === 0) return null;

  const now = Date.now();

  for (const game of allGames) {
    if (isNhlGameLive(game)) return INTERVAL_FAST;

    const isScheduled = !isNhlGameLive(game) && !isNhlGameFinished(game);
    const ts = new Date(game?.startTimeUTC).getTime();
    if (isScheduled && !Number.isNaN(ts)) {
      const msUntil = ts - now;
      if (msUntil >= 0 && msUntil <= SOON_THRESHOLD) return INTERVAL_FAST;
    }
  }

  return INTERVAL_SLOW;
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
    const d = new Date(game.startTimeUTC);
    const key = d.toDateString();
    if (!map[key]) {
      map[key] = {
        dateKey: key,
        dateTs: d.getTime(),
        label: formatDateGroupLabel(game.startTimeUTC),
        games: [],
      };
    }
    map[key].games.push(game);
  });
  return Object.values(map).sort((a, b) => a.dateTs - b.dateTs);
};

const getTeamAbbr = (team) => {
  if (!team) return "NHL";
  if (team.abbrev) return team.abbrev;
  return team.name?.substring(0, 3).toUpperCase() || "NHL";
};

const getPeriodLabel = (game) => {
  const number = Number(game?.periodDescriptor?.number ?? game?.period ?? 0);
  if (!Number.isFinite(number) || number <= 0) return "";
  if (number === 1) return "1st";
  if (number === 2) return "2nd";
  if (number === 3) return "3rd";
  return `OT ${number - 3}`;
};

const getNhlLogo = (team, isDarkMode) => {
  if (!team) return null;
  return isDarkMode
    ? team.logoDark || team.logoLight || null
    : team.logoLight || team.logoDark || null;
};

const getLiveClockAndPeriod = (game, nowMs) => {
  if (!isNhlGameLive(game)) return { clock: "", period: "" };
  const period = getPeriodLabel(game);
  if (game?.clock?.inIntermission === true) return { clock: "INT", period };
  if (game?.clock?.timeRemaining === "00:00") return { clock: "END", period };
  const remaining = getLiveRemainingFromAnchor(game, nowMs);
  return { clock: formatRemainingClock(remaining), period };
};

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

const NHL_GRID_H_PAD = 16;
const NHL_GRID_GAP = 8;
const NHL_CARD_WIDTH = (width - NHL_GRID_H_PAD * 2 - NHL_GRID_GAP) / 2;

const NHLGridCardGradient = ({
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
      width={NHL_CARD_WIDTH}
      height={safeHeight}
      viewBox={`0 0 ${NHL_CARD_WIDTH} ${safeHeight}`}
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
        width={NHL_CARD_WIDTH}
        height={safeHeight}
        fill={`url(#ngL_${gradId})`}
      />
    </Svg>
  );
};

const NHLGridCard = ({
  game,
  navigation,
  theme,
  colors,
  isDarkMode,
  isFavorite,
  nowMs,
}) => {
  const [cardHeight, setCardHeight] = useState(0);
  const away = game.awayTeam || {};
  const home = game.homeTeam || {};

  const awayColor = NHLService.getTeamColor(away, colors.primary);
  const homeColor = NHLService.getTeamColor(home, colors.primary);

  const awayLogo = getNhlLogo(away, isDarkMode);
  const homeLogo = getNhlLogo(home, isDarkMode);

  const awayAbbr = (getTeamAbbr(away) || "AWY").toUpperCase();
  const homeAbbr = (getTeamAbbr(home) || "HME").toUpperCase();

  const isLive = isNhlGameLive(game);
  const isFinished = isNhlGameFinished(game);
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

  const awayFav = isFavorite(String(away.id || ""), "nhl");
  const homeFav = isFavorite(String(home.id || ""), "nhl");

  const awayRecord = away?.record ? away.record : null;
  const homeRecord = home?.record ? home.record : null;

  const gradId = `ng_${game.id}`;
  const { time, ampm } = formatLocalTime(game.startTimeUTC);
  const live = getLiveClockAndPeriod(game, nowMs);

  const periodType = game.periodDescriptor?.periodType || "";

  let statusLine = "";
  let statusLine2 = "";
  if (isLive) {
    statusLine = live.period ? `${live.clock} - ${live.period}` : live.clock;
  } else if (isFinished) {
    statusLine2 = "Final" + (periodType !== "REG" ? ` (${periodType})` : "");
  } else {
    statusLine = `${time}`.trim();
    statusLine2 = ampm;
  }

  return (
    <TouchableOpacity
      style={[
        nhlGridStyles.card,
        { backgroundColor: theme.surfaceSecondary, width: NHL_CARD_WIDTH },
      ]}
      onLayout={(e) => {
        const nextHeight = Math.round(e.nativeEvent.layout.height || 0);
        setCardHeight((prev) => (prev !== nextHeight ? nextHeight : prev));
      }}
      onPress={() =>
        navigation.navigate("GameDetails", {
          gameId: String(game.id),
          sport: "nhl",
        })
      }
      activeOpacity={0.8}
    >
      <NHLGridCardGradient
        gradId={gradId}
        awayColor={awayColor}
        homeColor={homeColor}
        fallbackColor={colors.primary}
        cardHeight={cardHeight}
      />

      <View style={nhlGridStyles.cardTop}>
        <Text
            style={[
                nhlGridStyles.statusText,
                {
                color: isLive ? colors.primary : theme.text,
                },
            ]}
            numberOfLines={1}
            >
            <Text style={{ fontWeight: "800" }}>
                {statusLine}
            </Text>

            {statusLine2 ? (
                <Text style={{ fontWeight: "500", color: theme.textSecondary }}>
                {` ${statusLine2}`}
                </Text>
            ) : null}
        </Text>
        <LiveViewerBadge
          gameId={game.id}
          status={game.gameState}
          scale={0.7}
          style={nhlGridStyles.cardBadge}
        />
      </View>

      <View style={nhlGridStyles.teamsRow}>
        <View style={nhlGridStyles.teamSide}>
          {isScheduled ? (
            awayLogo ? (
              <Image
                cachePolicy="memory-disk"
                source={{ uri: awayLogo }}
                style={nhlGridStyles.teamLogo}
                contentFit="contain"
              />
            ) : (
              <View
                style={[
                  nhlGridStyles.teamLogoPlaceholder,
                  { backgroundColor: awayColor || colors.primary },
                ]}
              >
                <Text style={nhlGridStyles.teamLogoPlaceholderText}>
                  {(awayAbbr || "A")[0]}
                </Text>
              </View>
            )
          ) : (
            <View style={nhlGridStyles.scoreCell}>
              <Text
                style={[
                  nhlGridStyles.scoreText,
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
              {awayLogo && (
                <Image
                  cachePolicy="memory-disk"
                  source={{ uri: awayLogo }}
                  style={nhlGridStyles.scoreLogoOverlay}
                  contentFit="contain"
                />
              )}
            </View>
          )}
          <Text
            style={[
              nhlGridStyles.teamAbbr,
              { color: awayFav ? colors.primary : theme.text },
            ]}
          >
            {awayFav ? "★ " : ""}
            {awayAbbr}
          </Text>
          {awayRecord && (
          <Text
            style={[
              nhlGridStyles.teamRecord,
              { color: theme.textSecondary },
            ]}
          >
            {awayRecord}
          </Text>
          )}
        </View>

        <View
          style={[nhlGridStyles.divider, { backgroundColor: theme.border }]}
        />

        <View style={nhlGridStyles.teamSide}>
          {isScheduled ? (
            homeLogo ? (
              <Image
                cachePolicy="memory-disk"
                source={{ uri: homeLogo }}
                style={nhlGridStyles.teamLogo}
                contentFit="contain"
              />
            ) : (
              <View
                style={[
                  nhlGridStyles.teamLogoPlaceholder,
                  { backgroundColor: homeColor || colors.secondary },
                ]}
              >
                <Text style={nhlGridStyles.teamLogoPlaceholderText}>
                  {(homeAbbr || "H")[0]}
                </Text>
              </View>
            )
          ) : (
            <View style={nhlGridStyles.scoreCell}>
              <Text
                style={[
                  nhlGridStyles.scoreText,
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
              {homeLogo && (
                <Image
                  cachePolicy="memory-disk"
                  source={{ uri: homeLogo }}
                  style={nhlGridStyles.scoreLogoOverlay}
                  contentFit="contain"
                />
              )}
            </View>
          )}
          <Text
            style={[
              nhlGridStyles.teamAbbr,
              { color: homeFav ? colors.primary : theme.text },
            ]}
          >
            {homeFav ? "★ " : ""}
            {homeAbbr}
          </Text>
          {homeRecord && (
          <Text
            style={[
              nhlGridStyles.teamRecord,
              { color: theme.textSecondary },
            ]}
          >
            {homeRecord}
          </Text>
          )}
        </View>
      </View>

      <View
        style={[nhlGridStyles.cardFooter, { borderTopColor: theme.border }]}
      >
        <Text
          style={[nhlGridStyles.venueText, { color: theme.textSecondary }]}
          numberOfLines={1}
        >
          {game.venue || ""}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const NHLGridSection = ({
  groups,
  navigation,
  theme,
  colors,
  isDarkMode,
  isFavorite,
  nowMs,
  activeFilter,
  collapsedGroups,
  toggleCollapse,
}) => (
  <View style={nhlGridStyles.container}>
    {groups.map((group) => {
      return (
        <View key={group.dateKey} style={nhlGridStyles.groupWrapper}>
          <View style={nhlGridStyles.groupHeaderRow}>
            <TouchableOpacity
              style={[
                nhlGridStyles.groupBubble,
                { backgroundColor: theme.surfaceSecondary },
              ]}
              activeOpacity={1}
              onPress={() => {}}
            >
              <Image
                cachePolicy="memory-disk"
                source={require("../../../assets/nhl.png")}
                style={nhlGridStyles.groupBubbleLogo}
                contentFit="contain"
              />
              <Text
                style={[nhlGridStyles.groupBubbleName, { color: theme.text }]}
                numberOfLines={1}
              >
                {group.label}
              </Text>
              <Text
                style={[
                  nhlGridStyles.groupBubbleCount,
                  { color: theme.textTertiary },
                ]}
              >
                {" "}
                {group.games.length}
              </Text>
            </TouchableOpacity>
          </View>

          {(() => {
            const displayedGames = group.games;
            return (
              <View style={nhlGridStyles.cardsRow}>
                {displayedGames.map((game) => (
                  <NHLGridCard
                    key={game.id}
                    game={game}
                    navigation={navigation}
                    theme={theme}
                    colors={colors}
                    isDarkMode={isDarkMode}
                    isFavorite={isFavorite}
                    nowMs={nowMs}
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

const ScoreboardSection = ({
  groups,
  navigation,
  theme,
  isDarkMode,
  colors,
  isFavorite,
  nowMs,
  activeFilter,
  collapsedGroups,
  toggleCollapse,
}) => (
  <View style={styles.scoreboardContainer}>
    {groups.map((group, gIdx) => {
      return (
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
            <TouchableOpacity
              style={styles.eventHeaderMainTap}
              activeOpacity={0.8}
              onPress={() => {}}
            >
              <View style={styles.eventLogoContainer}>
                <Image
                  cachePolicy="memory-disk"
                  source={require("../../../assets/nhl.png")}
                  style={styles.eventLogoImage}
                  contentFit="contain"
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
                  NHL
                </Text>
              </View>
            </TouchableOpacity>
            <View style={styles.eventHeaderRight}>
              <Text style={[styles.eventCount, { color: theme.textTertiary }]}>
                {" "}
                {group.games.length}{" "}
              </Text>
            </View>
          </View>

          <View style={styles.matchesList}>
            {(() => {
              const displayedGames = group.games;
              return displayedGames.map((game, idx) => {
                const away = game.awayTeam || {};
                const home = game.homeTeam || {};

                const awayAbbr = getTeamAbbr(away);
                const homeAbbr = getTeamAbbr(home);

                const awayColor = NHLService.getTeamColor(away, colors.primary);
                const homeColor = NHLService.getTeamColor(home, colors.primary);

                const awayLogo = getNhlLogo(away, isDarkMode);
                const homeLogo = getNhlLogo(home, isDarkMode);

                const isLive = isNhlGameLive(game);
                const isFinished = isNhlGameFinished(game);
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

                const periodType = game.periodDescriptor?.periodType || "";

                let statusLine1 = "";
                let statusLine2 = "";
                if (isFinished) {
                  statusLine1 = "Final" + (periodType !== "REG" ? ` (${periodType})` : "");
                  const { time, ampm } = formatLocalTime(game.startTimeUTC);
                  statusLine2 = `${time} ${ampm}`.trim();
                } else if (isLive) {
                  const live = getLiveClockAndPeriod(game, nowMs);
                  statusLine1 = live.clock;
                  statusLine2 = live.period;
                } else {
                  const { time, ampm } = formatLocalTime(game.startTimeUTC);
                  statusLine1 = time;
                  statusLine2 = ampm;
                }

                const awayFav = isFavorite(String(away.id || ""), "nhl");
                const homeFav = isFavorite(String(home.id || ""), "nhl");
                const awayRecord =
                  away.record || away.teamRecord || away.recordSummary || "";
                const homeRecord =
                  home.record || home.teamRecord || home.recordSummary || "";
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
                        sport: "nhl",
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
                        <View style={styles.teamWithLogo}>
                          <View style={styles.teamLogoSmall}>
                            {awayLogo ? (
                              <Image
                                cachePolicy="memory-disk"
                                source={{ uri: awayLogo }}
                                style={styles.teamLogoSmallImg}
                                contentFit="contain"
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
                                  },
                                ]}
                              >
                                <Text style={styles.teamLogoFallback}>
                                  {awayAbbr.substring(0, 1)}
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
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {awayFav ? "★ " : ""}
                              {away.name || "Away"}
                            </Text>
                            {awayHasRecord ? (
                              <Text
                                style={[
                                  styles.teamRecord,
                                  { color: theme.textSecondary },
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

                        <View style={styles.teamWithLogo}>
                          <View style={styles.teamLogoSmall}>
                            {homeLogo ? (
                              <Image
                                cachePolicy="memory-disk"
                                source={{ uri: homeLogo }}
                                style={styles.teamLogoSmallImg}
                                contentFit="contain"
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
                                  },
                                ]}
                              >
                                <Text style={styles.teamLogoFallback}>
                                  {homeAbbr.substring(0, 1)}
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
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {homeFav ? "★ " : ""}
                              {home.name || "Home"}
                            </Text>
                            {homeHasRecord ? (
                              <Text
                                style={[
                                  styles.teamRecord,
                                  { color: theme.textSecondary },
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
                      </View>
                      <View style={styles.gameFooterRight}>
                        <LiveViewerBadge
                          gameId={game.id}
                          status={game.gameState}
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

const NHLScoreboardScreen = ({ navigation }) => {
  const { colors, theme, isDarkMode } = useTheme();
  const { isFavorite } = useFavorites();

  const [groups, setGroups] = useState([]);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState(getAutoSelectedDateStr());
  const [isGridView, setIsGridView] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    AsyncStorage.getItem("viewMode_nhl").then((val) => {
      if (val !== null) setIsGridView(val === "grid");
    });
  }, []);

  const toggleViewMode = () => {
    setIsGridView((v) => {
      const next = !v;
      AsyncStorage.setItem("viewMode_nhl", next ? "grid" : "list");
      return next;
    });
  };

  const intervalRef = useRef(null);
  const currentIntervalMs = useRef(null);
  const isFocusedRef = useRef(false);
  const fetchCacheRef = useRef({});
  const inFlightRef = useRef({});
  const lastGamesByIdRef = useRef({});
  const IN_MEMORY_CACHE_MS = 10 * 1000;

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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
          const data = await NHLService.getScoreboard(filter);
          const games = Array.isArray(data?.games) ? data.games : [];
          const normalized = normalizeGamesWithClockState(
            games,
            lastGamesByIdRef.current,
            Date.now(),
          );

          const getStatusPriority = (game) => {
            if (isNhlGameLive(game)) return 1;
            if (isNhlGameFinished(game)) return 3;
            return 2;
          };

          const sorted = [...normalized].sort((a, b) => {
            const pa = getStatusPriority(a);
            const pb = getStatusPriority(b);
            if (pa !== pb) return pa - pb;
            return (
              new Date(a.startTimeUTC).getTime() -
              new Date(b.startTimeUTC).getTime()
            );
          });

          const nextGroups = groupGamesByDate(sorted);
          setGroups(nextGroups);
          const nextMap = {};
          nextGroups.forEach((group) => {
            group.games.forEach((g) => {
              nextMap[String(g.id)] = g;
            });
          });
          lastGamesByIdRef.current = nextMap;
          fetchCacheRef.current[filter] = {
            groups: nextGroups,
            ts: Date.now(),
          };

          return nextGroups;
        } catch (err) {
          console.error("NHL scoreboard fetch error:", err);
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

  const schedulePolling = useCallback(
    (filter, latestGroups) => {
      if (!isFocusedRef.current) return;

      const isTodayFilter = String(filter) === getTodayDateStr();
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

  if (loading) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading NHL Scoreboard...
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
              <NHLGridSection
                groups={groups}
                navigation={navigation}
                theme={theme}
                colors={colors}
                isDarkMode={isDarkMode}
                isFavorite={isFavorite}
                nowMs={nowMs}
                activeFilter={activeFilter}
                collapsedGroups={collapsedGroups}
                toggleCollapse={toggleCollapse}
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
                  nowMs={nowMs}
                  activeFilter={activeFilter}
                  collapsedGroups={collapsedGroups}
                  toggleCollapse={toggleCollapse}
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
    </View>
  );
};

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
  eventLogoImage: {
    width: 50,
    height: 32,
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
    width: 50,
    height: 50,
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

const nhlGridStyles = StyleSheet.create({
  container: {
    paddingHorizontal: NHL_GRID_H_PAD,
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
  groupBubbleLogo: {
    width: 28,
    height: 18,
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
    gap: NHL_GRID_GAP,
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
  statusSubText: {
    marginTop: 1,
    fontSize: 10,
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

export default NHLScoreboardScreen;

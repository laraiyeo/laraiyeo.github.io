import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Dimensions,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../../../context/ThemeContext";
import Top5ServiceEnhanced, {
  getMatchStatusType,
} from "../../../services/soccer/Top5ServiceEnhanced";
import { LiveViewerBadge } from "../../../components/ViewerCounter";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width } = Dimensions.get("window");

// ─── Polling helpers ──────────────────────────────────────────────────────────

const INTERVAL_SLOW = 30 * 60 * 1000; // 30 minutes
const INTERVAL_FAST = 5 * 1000; // 5 seconds
const SOON_THRESHOLD = 5 * 60 * 1000; // 5 minutes before kick-off

const getPollingInterval = (groups) => {
  const allMatches = groups.flatMap((g) => g.matches);
  if (allMatches.length === 0) return null;

  const now = Date.now();
  for (const m of allMatches) {
    if (getMatchStatusType(m) === "live") return INTERVAL_FAST;
  }
  for (const m of allMatches) {
    if (getMatchStatusType(m) === "scheduled") {
      try {
        const startMs = new Date(
          m.starting_at.replace(" ", "T") + "Z",
        ).getTime();
        if (startMs - now <= SOON_THRESHOLD && startMs > now)
          return INTERVAL_FAST;
      } catch (_) {}
    }
  }
  return INTERVAL_SLOW;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatMatchTime = (match) => {
  try {
    const date = new Date(match.starting_at.replace(" ", "T") + "Z");
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    const h = hours % 12 || 12;
    return { time: `${h}:${minutes}`, ampm };
  } catch (_) {
    return { time: "--:--", ampm: "" };
  }
};

const getStatusInfo = (match) => {
  const code = (match?.state?.state || "").toUpperCase();
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
  ].includes(code);
  const isScheduled = !code || ["NS", "TBA", "DELAYED"].includes(code);
  const isLive = !isFinished && !isScheduled;

  if (isLive) {
    return { line1: short || "LIVE", line2: "", isLive: true, isFinished: false };
  }
  if (isFinished) {
    const { time, ampm } = formatMatchTime(match);
    return {
      line1: short || "FT",
      line2: `${time} ${ampm}`,
      isLive: false,
      isFinished: true,
    };
  }
  const { time, ampm } = formatMatchTime(match);
  return { line1: time, line2: ampm, isLive: false, isFinished: false };
};

const getHome = (match) =>
  match.participants?.find((p) => p.meta?.location === "home");
const getAway = (match) =>
  match.participants?.find((p) => p.meta?.location === "away");
const getGoals = (match, side) =>
  match.scores?.find((s) => s.participant === side)?.goals ?? null;
const getAbbr = (p) =>
  p?.short_code || (p?.name ? p.name.substring(0, 3).toUpperCase() : "???");

// ─── Date utilities ───────────────────────────────────────────────────────────

const toDateStr = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
};

const todayDateStr = toDateStr(new Date());

const DATE_OPTIONS = (() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i - 3);
    return d;
  });
})();

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const getDateLabel = (date) => {
  const ds = toDateStr(date);
  if (ds === todayDateStr) return "Today";
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d - base) / 86400000);
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
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
              <Stop offset="0%" stopColor={theme.background} stopOpacity="1" />
              <Stop
                offset="100%"
                stopColor={theme.background}
                stopOpacity="0"
              />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={DATE_FADE_W} height={DATE_BAR_H} fill="url(#dfL)" />
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
              <Stop offset="0%" stopColor={theme.background} stopOpacity="1" />
              <Stop
                offset="100%"
                stopColor={theme.background}
                stopOpacity="0"
              />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={DATE_FADE_W} height={DATE_BAR_H} fill="url(#dfR)" />
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
      <View style={[dateBarStyles.separator, { backgroundColor: theme.border }]} />
    </View>
  );
};

// ─── List-view card gradient overlay (SVG) – top to bottom ──────────────────

const CardGradient = ({ gradId, awayColor, homeColor, fallbackColor, theme }) => {
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
const SoccerGridCardGradient = ({ gradId, awayColor, homeColor, fallbackColor }) => {
  const right = awayColor || fallbackColor;
  const left = homeColor || fallbackColor;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={`sgL_${gradId}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={left} stopOpacity="0.35" />
          <Stop offset="30%" stopColor={left} stopOpacity="0" />
          <Stop offset="70%" stopColor={right} stopOpacity="0" />
          <Stop offset="100%" stopColor={right} stopOpacity="0.35" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#sgL_${gradId})`} />
    </Svg>
  );
};

// ─── Individual soccer grid card ──────────────────────────────────────────────
const Top5GridCard = ({ match, theme, colors, gIdx, mIdx }) => {
  const home = match.participants?.find((p) => p.meta?.location === "home");
  const away = match.participants?.find((p) => p.meta?.location === "away");
  const homeScore =
    match.scores?.find((s) => s.participant === "home")?.goals ?? null;
  const awayScore =
    match.scores?.find((s) => s.participant === "away")?.goals ?? null;
  const awayColor = away?.colorPrimary || null;
  const homeColor = home?.colorPrimary || null;
  const si = getStatusInfo(match);
  const gradId = `gc_${gIdx}_${mIdx}`;

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

  return (
    <TouchableOpacity
      style={[
        soccerGridStyles.card,
        { backgroundColor: theme.surfaceSecondary, width: SOCCER_CARD_WIDTH },
      ]}
      activeOpacity={0.8}
    >
      <SoccerGridCardGradient
        gradId={gradId}
        awayColor={awayColor}
        homeColor={homeColor}
        fallbackColor={colors.primary}
      />

      {/* Status / Time */}
      <View style={soccerGridStyles.cardTop}>
        {si.isLive ? (
          <Text style={[soccerGridStyles.statusLive, { color: colors.primary }]}>
            {si.line1}
          </Text>
        ) : si.isFinished ? (
          <Text
            style={[soccerGridStyles.statusText, { color: theme.textSecondary }]}
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
                    opacity: si.isFinished && !homeWins ? 0.55 : 1,
                  },
                ]}
              >
                {homeScore ?? "\u2014"}
              </Text>
              {home?.image_path && (
                <Image
                  source={{ uri: home.image_path }}
                  style={soccerGridStyles.scoreLogoOverlay}
                  resizeMode="contain"
                />
              )}
            </View>
          ) : home?.image_path ? (
            <Image
              source={{ uri: home.image_path }}
              style={soccerGridStyles.teamLogo}
              resizeMode="contain"
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
          <Text style={[soccerGridStyles.teamAbbr, { color: theme.text }]}>
            {homeAbbr}
          </Text>
          <Text style={[soccerGridStyles.teamPosition, { color: theme.textSecondary, fontSize: 10 }]}>
            {homePos} Place
          </Text>
        </View>

        <View style={[soccerGridStyles.divider, { backgroundColor: theme.border }]} />

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
                    opacity: si.isFinished && !awayWins ? 0.55 : 1,
                  },
                ]}
              >
                {awayScore ?? "\u2014"}
              </Text>
              {away?.image_path && (
                <Image
                  source={{ uri: away.image_path }}
                  style={soccerGridStyles.scoreLogoOverlay}
                  resizeMode="contain"
                />
              )}
            </View>
          ) : away?.image_path ? (
            <Image
              source={{ uri: away.image_path }}
              style={soccerGridStyles.teamLogo}
              resizeMode="contain"
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
          <Text style={[soccerGridStyles.teamAbbr, { color: theme.text }]}>
            {awayAbbr}
          </Text>
          <Text style={[soccerGridStyles.teamPosition, { color: theme.textSecondary, fontSize: 10 }]}>
            {awayPos} Place
          </Text>
        </View>
      </View>

      {/* Footer: venue */}
      <View style={[soccerGridStyles.cardFooter, { borderTopColor: theme.border }]}>
        <Text
          style={[soccerGridStyles.venueText, { color: theme.textSecondary }]}
          numberOfLines={1}
        >
          {match.venue?.name || ""}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

// ─── Soccer Grid section (floating bubble headers + 2-col cards) ──────────────
const Top5GridSection = ({
  groups,
  theme,
  colors,
  activeFilter,
  collapsedGroups,
  toggleCollapse,
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
          activeOpacity={activeFilter > todayDateStr ? 0.7 : 1}
          onPress={() =>
            activeFilter > todayDateStr && toggleCollapse(group.leagueKey)
          }
        >
          {group.imagePath ? (
            <Image
              source={{ uri: group.imagePath }}
              style={soccerGridStyles.groupBubbleLogo}
              resizeMode="contain"
            />
          ) : (
            <Text style={{ fontSize: 18, marginRight: 6 }}>\u26bd</Text>
          )}
          <Text
            style={[soccerGridStyles.groupBubbleName, { color: theme.text }]}
            numberOfLines={1}
          >
            {group.countryName || ""} {group.label}
          </Text>
          <Text
            style={[
              soccerGridStyles.groupBubbleCount,
              { color: theme.textTertiary },
            ]}
          >
            {" "}{group.matches.length}
          </Text>
          {activeFilter > todayDateStr && (
            <Text style={{ color: theme.textTertiary, marginLeft: 4, fontSize: 12 }}>
              {collapsedGroups[group.leagueKey] ? "\u25b6" : "\u25bc"}
            </Text>
          )}
        </TouchableOpacity>
        {/* 2-column card grid */}
        {(() => {
          const isCollapsed =
            activeFilter > todayDateStr && !!collapsedGroups[group.leagueKey];
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
  activeFilter,
  collapsedGroups,
  toggleCollapse,
}) => (
  <View style={styles.scoreboardContainer}>
    {groups.map((group, gIdx) => (
      <View
        key={group.leagueKey}
        style={[
          styles.eventContainer,
          { backgroundColor: theme.surfaceSecondary },
        ]}
      >
        {/* League header */}
        <TouchableOpacity
          style={styles.eventHeaderContainer}
          activeOpacity={activeFilter > todayDateStr ? 0.7 : 1}
          onPress={() =>
            activeFilter > todayDateStr && toggleCollapse(group.leagueKey)
          }
        >
          <View style={styles.eventLogoContainer}>
            {group.imagePath ? (
              <Image
                source={{ uri: group.imagePath }}
                style={styles.eventLogoImage}
                resizeMode="contain"
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
            {group.countryName ? (
              <Text
                style={[styles.eventSubLabel, { color: theme.textTertiary }]}
              >
                {group.countryName}
              </Text>
            ) : null}
          </View>
          <View style={styles.eventHeaderRight} pointerEvents="none">
            <Text style={[styles.eventCount, { color: theme.textTertiary }]}>
              {" "}
              {group.matches.length}{" "}
            </Text>
            {activeFilter > todayDateStr && (
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
              activeFilter > todayDateStr &&
              !!collapsedGroups[group.leagueKey];
            const displayed = isCollapsed
              ? group.matches.slice(0, 1)
              : group.matches;

            return displayed.map((match, idx) => {
              const home = getHome(match);
              const away = getAway(match);
              const homeScore = getGoals(match, "home");
              const awayScore = getGoals(match, "away");
              const si = getStatusInfo(match);
              const awayColor = away?.colorPrimary || null;
              const homeColor = home?.colorPrimary || null;
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
                <TouchableOpacity
                  key={match.id || idx}
                  style={styles.gameRow}
                  activeOpacity={0.75}
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
                          <View
                            style={[
                              styles.liveDot,
                              { backgroundColor: theme.error || "#e03131" },
                            ]}
                          />
                          <Text
                            style={[
                              styles.statusLine1,
                              {
                                color: theme.error || "#e03131",
                                fontWeight: "700",
                              },
                            ]}
                          >
                            {si.line1}
                          </Text>
                        </View>
                      ) : (
                        <>
                          <Text
                            style={[
                              styles.statusLine1,
                              {
                                color: si.isFinished
                                  ? theme.textSecondary
                                  : theme.text,
                                fontWeight: "500",
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {si.line1}
                          </Text>
                          {!!si.line2 && (
                            <Text
                              style={[
                                styles.statusLine2,
                                { color: theme.textTertiary },
                              ]}
                              numberOfLines={1}
                            >
                              {si.line2}
                            </Text>
                          )}
                        </>
                      )}
                    </View>

                    {/* Stacked teams */}
                    <View style={styles.stackedTeams}>
                      {/* Home */}
                      <View style={styles.teamWithLogo}>
                        <View style={styles.teamLogoSmall}>
                          {home?.image_path ? (
                            <Image
                              source={{ uri: home.image_path }}
                              style={[
                                styles.teamLogoSmallImg,
                                !homeWins && si.isFinished
                                  ? { opacity: 0.55 }
                                  : null,
                              ]}
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
                                color: theme.text,
                                fontWeight: homeWins ? "700" : "400",
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {home?.name || "Home"}
                          </Text>
                          <Text
                            style={[
                              styles.teamName,
                              {
                                color: theme.textSecondary,
                                fontSize: 11,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {homePos} Place
                          </Text>
                        </View>
                        {(si.isLive || si.isFinished) && homeScore != null && (
                          <Text
                            style={[
                              styles.scoreText,
                              {
                                color: homeWins ? colors.primary : theme.text,
                                fontWeight: homeWins ? "700" : "400",
                                opacity: !homeWins && si.isFinished ? 0.55 : 1,
                              },
                            ]}
                          >
                            {homeScore}
                          </Text>
                        )}
                      </View>

                      {/* Away */}
                      <View style={styles.teamWithLogo}>
                        <View style={styles.teamLogoSmall}>
                          {away?.image_path ? (
                            <Image
                              source={{ uri: away.image_path }}
                              style={[
                                styles.teamLogoSmallImg,
                                !awayWins && si.isFinished
                                  ? { opacity: 0.55 }
                                  : null,
                              ]}
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
                                color: theme.text,
                                fontWeight: awayWins ? "700" : "400",
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {away?.name || "Away"}
                          </Text>
                          <Text
                            style={[
                              styles.teamName,
                              {
                                color: theme.textSecondary,
                                fontSize: 11,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {awayPos} Place
                          </Text>
                        </View>
                        {(si.isLive || si.isFinished) && awayScore != null && (
                          <Text
                            style={[
                              styles.scoreText,
                              {
                                color: awayWins ? colors.primary : theme.text,
                                fontWeight: awayWins ? "700" : "400",
                                opacity: !awayWins && si.isFinished ? 0.55 : 1,
                              },
                            ]}
                          >
                            {awayScore}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Footer: venue + viewer badge */}
                  <View
                    style={[
                      styles.gameFooter,
                      { borderTopColor: theme.border },
                    ]}
                  >
                    <View style={styles.gameFooterLeft}>
                      {match.venue?.name ? (
                        <Text
                          style={[styles.venue, { color: theme.textSecondary }]}
                        >
                          {match.venue.name}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.gameFooterRight}>
                      <LiveViewerBadge
                        gameId={String(match.id)}
                        status={
                          si.isLive ? "live" : si.isFinished ? "final" : "pre"
                        }
                        style={styles.viewerBadge}
                      />
                    </View>
                  </View>

                  {idx < displayed.length - 1 && (
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
    ))}
  </View>
);

// ─── Main screen ──────────────────────────────────────────────────────────────

const Top5ScoreboardScreen = ({ navigation }) => {
  const { colors, theme } = useTheme();

  const [groups, setGroups] = useState([]);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState(todayDateStr);
  const [isGridView, setIsGridView] = useState(false);

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
  const IN_MEMORY_CACHE_MS = 10 * 1000;

  const loadData = useCallback(
    async (filter, silent = false, background = false) => {
      const now = Date.now();
      const cached = fetchCacheRef.current[filter];
      if (cached && now - cached.ts < IN_MEMORY_CACHE_MS) {
        setGroups(cached.groups);
        lastLoadedFilterRef.current = filter;
        return cached.groups;
      }

      if (inFlightRef.current[filter]) return inFlightRef.current[filter];

      const promise = (async () => {
        if (!silent) setLoading(true);
        else if (!background) setFetching(true);
        try {
          const raw = await Top5ServiceEnhanced.getScoreboard(filter);
          const nextGroups = Top5ServiceEnhanced.toGroups(raw);
          setGroups(nextGroups);
          lastLoadedFilterRef.current = filter;
          fetchCacheRef.current[filter] = { groups: nextGroups, ts: Date.now() };

          if (filter > todayDateStr) {
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
          console.error("Top5 scoreboard fetch error:", err);
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

  const toggleCollapse = (key) =>
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  const schedulePolling = useCallback(
    (filter, latestGroups) => {
      if (!isFocusedRef.current) return;

      if (filter !== todayDateStr) {
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
      if (groups.length === 0 || lastLoadedFilterRef.current !== activeFilter) {
        loadData(activeFilter, false).then((fresh) =>
          schedulePolling(activeFilter, fresh),
        );
      } else {
        schedulePolling(activeFilter, groups);
      }
      return () => {
        isFocusedRef.current = false;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          currentIntervalMs.current = null;
        }
      };
    }, [activeFilter, loadData, schedulePolling, groups]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    const fresh = await loadData(activeFilter, true);
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
        stickyHeaderIndices={[1]}
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
                activeFilter={activeFilter}
                collapsedGroups={collapsedGroups}
                toggleCollapse={toggleCollapse}
              />
            ) : (
              <View style={styles.listContainer}>
                <Top5ScoreboardSection
                  groups={groups}
                  navigation={navigation}
                  theme={theme}
                  colors={colors}
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
                No matches found
              </Text>
            </View>
          )}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
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
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
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
  eventSubLabel: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
  },
  matchesList: {},
  gameRow: {
    position: "relative",
    overflow: "hidden",
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  statusContainer: {
    width: 50,
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
    marginTop: 5,
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
  cardBadge: {
    position: "absolute",
    top: 4,
    right: 4,
  },
});

export default Top5ScoreboardScreen;

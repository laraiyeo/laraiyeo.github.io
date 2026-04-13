import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
} from "react-native";
import { Image } from "expo-image";
import { FontAwesome6, MaterialIcons } from "@expo/vector-icons";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../../context/ThemeContext";
import { NHLService } from "../../services/NHLService";

const { width } = Dimensions.get("window");

const HeaderGradient = ({ homeColor, awayColor, theme, height }) => (
  <View style={[StyleSheet.absoluteFill, { height }]} pointerEvents="none">
    <Svg width={width} height={height} pointerEvents="none">
      <Defs>
        <LinearGradient id="nhlHeaderGrad" x1="0%" y1="0%" x2="100%" y2="0%">
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
      <Rect width={width} height={height} fill="url(#nhlHeaderGrad)" />
    </Svg>
  </View>
);

const StatusBadge = ({ game, theme, colors }) => (
  <View style={styles.statusBadge}>
    <Text
      style={[
        styles.statusMain,
        {
          color: isNhlGameFinished(game)
            ? theme.textSecondary
            : game?.isPre
              ? theme.text
              : theme.error || colors.primary,
        },
      ]}
    >
      {game?.statusMain || "--"}
    </Text>
    <Text style={[styles.statusSub, { color: theme.textTertiary }]}>
      {game?.statusSub || ""}
    </Text>
  </View>
);

const TeamSide = ({
  team,
  logo,
  score,
  side,
  isPre,
  isWinner,
  isLoser,
  theme,
  onPress,
}) => (
  <View style={styles.teamSide}>
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <View style={styles.logoScoreRow}>
        {side === "home" && !isPre ? (
          <Text
            style={[
              styles.teamScore,
              {
                color: isWinner
                  ? theme.text
                  : isLoser
                    ? theme.textSecondary
                    : theme.text,
                fontWeight: isWinner ? "800" : "400",
              },
            ]}
          >
            {score}
          </Text>
        ) : null}

        <Image
          source={{ uri: logo }}
          style={styles.teamLogo}
          contentFit="contain"
        />

        {side === "away" && !isPre ? (
          <Text
            style={[
              styles.teamScore,
              {
                color: isWinner
                  ? theme.text
                  : isLoser
                    ? theme.textSecondary
                    : theme.text,
                fontWeight: isWinner ? "800" : "400",
              },
            ]}
          >
            {score}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>

    <View style={styles.teamNameRow}>
      <Text
        style={[
          styles.teamName,
          { color: isLoser ? theme.textSecondary : theme.text },
        ]}
        numberOfLines={2}
      >
        {team?.name || team?.abbreviation || ""}
      </Text>
    </View>
  </View>
);

const toOrdinal = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "";
  if (v % 100 >= 11 && v % 100 <= 13) return `${v}th`;
  if (v % 10 === 1) return `${v}st`;
  if (v % 10 === 2) return `${v}nd`;
  if (v % 10 === 3) return `${v}rd`;
  return `${v}th`;
};

const parseClockSecs = (mmss) => {
  const m = String(mmss || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
};

const TABS = ["Main", "Home", "Away", "Stats", "Plays", "Shifts", "Series"];
const INTERVAL_FAST = 5 * 1000;
const INTERVAL_SLOW = 30 * 60 * 1000;
const SOON_THRESHOLD = 5 * 60 * 1000;

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
    return { time: "--:--", ampm: "" };
  }
};

const getPeriodLabel = (number) => {
  const n = Number(number || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `OT ${n - 3}`;
};

const getPeriodHeaderLabel = (number) => {
  const n = Number(number || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n <= 3) return `${toOrdinal(n)} Period`;
  return `${toOrdinal(n - 3)} Overtime`;
};

const getScorerPeriodLabel = (number) => {
  const n = Number(number || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n <= 3) return toOrdinal(n);
  return `OT${n - 3}`;
};

const isNhlGameLive = (game) => {
  const state = String(game?.rawState || "").toUpperCase();
  return state === "LIVE" || state === "CRIT" || state === "IN";
};

const isNhlGameFinished = (game) => {
  const state = String(game?.rawState || "").toUpperCase();
  return ["OFF", "FINAL", "OVER", "POST"].includes(state);
};

const pad2 = (v) => String(Math.max(0, v)).padStart(2, "0");

const formatRemainingClock = (seconds) => {
  const safe = Math.max(0, Number(seconds) || 0);
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${mm}:${pad2(ss)}`;
};

const getLiveRemainingFromAnchor = (game, nowMs) => {
  const base = Number(
    game?.__tickAnchorRemaining ?? game?.clockSecondsRemaining ?? 0,
  );
  if (!Number.isFinite(base)) return 0;
  const running = game?.__tickRunning === true;
  const anchorTs = Number(game?.__tickAnchorTs ?? nowMs);
  const elapsed = running
    ? Math.max(0, Math.floor((nowMs - anchorTs) / 1000))
    : 0;
  return Math.max(0, base - elapsed);
};

const normalizeGameWithClockState = (game, prev, nowMs) => {
  if (!isNhlGameLive(game)) return game;

  const safeJsonRemaining = Number.isFinite(Number(game?.clockSecondsRemaining))
    ? Math.max(0, Number(game.clockSecondsRemaining))
    : parseClockSecs(game?.statusMain || "");
  const jsonRunning = game?.clockRunning === true;

  let nextRemaining = Math.max(0, safeJsonRemaining || 0);

  if (prev && jsonRunning) {
    const prevRemainingNow = getLiveRemainingFromAnchor(prev, nowMs);
    if (prevRemainingNow > nextRemaining) {
      nextRemaining = prevRemainingNow;
    }
  }

  if (prev && !jsonRunning) {
    nextRemaining = Math.max(0, safeJsonRemaining || 0);
  }

  return {
    ...game,
    __tickAnchorRemaining: nextRemaining,
    __tickAnchorTs: nowMs,
    __tickRunning: jsonRunning,
  };
};

const getStatusLines = (game, nowMs) => {
  if (!game) return { line1: "--", line2: "" };
  if (isNhlGameLive(game)) {
    const period = getPeriodLabel(game?.periodNumber) || "1st";
    return {
      line1: formatRemainingClock(getLiveRemainingFromAnchor(game, nowMs)),
      line2: period,
    };
  }
  if (isNhlGameFinished(game)) {
    const { time, ampm } = formatLocalTime(game.startTimeUtc);
    return { line1: game.statusMain || "FT", line2: `${time} ${ampm}`.trim() };
  }
  return { line1: game.statusMain || "--", line2: game.statusSub || "" };
};

const normalizeGameData = (details, isDarkMode) => {
  if (!details) return null;

  const landing = details?.data?.landing;

  if (landing) {
    const away = landing?.awayTeam || {};
    const home = landing?.homeTeam || {};
    const state = String(landing?.gameState || "").toUpperCase();
    const gameDate = landing?.startTimeUTC || landing?.gameDate || "";
    const periodNumber = Number(landing?.periodDescriptor?.number || 0);
    const remaining = landing?.clock?.timeRemaining || "";

    let statusMain = "FT";
    let statusSub = "Final";
    let isPre = false;

    if (state === "FUT" || state === "PRE") {
      const dt = new Date(gameDate || Date.now());
      statusMain = dt.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      statusSub = dt.toLocaleDateString([], { month: "short", day: "numeric" });
      isPre = true;
    } else if (state === "LIVE" || state === "CRIT") {
      statusMain = remaining || "0:00";
      statusSub = `${toOrdinal(periodNumber) || "1st"} Period`;
    } else if (state === "OFF" || state === "FINAL" || state === "OVER") {
      const { time, ampm } = formatLocalTime(gameDate);
      statusMain = "FT";
      statusSub = `${time} ${ampm}`.trim();
    }

    return {
      venue: landing?.venue || "",
      leagueName: "NHL",
      startTimeUtc: gameDate,
      statusMain,
      statusSub,
      isPre,
      rawState: state,
      periodNumber,
      clockSecondsRemaining: Number(
        landing?.clock?.secondsRemaining ?? parseClockSecs(remaining),
      ),
      clockRunning: landing?.clock?.running === true,
      away: {
        id: String(away?.id || ""),
        abbreviation: away?.abbrev || "",
        name: away?.commonName || away?.placeName || away?.abbrev || "Away",
        score: Number(away?.score || 0),
        logo: isDarkMode
          ? away?.darkLogo || away?.logo
          : away?.logo || away?.darkLogo,
      },
      home: {
        id: String(home?.id || ""),
        abbreviation: home?.abbrev || "",
        name: home?.commonName || home?.placeName || home?.abbrev || "Home",
        score: Number(home?.score || 0),
        logo: isDarkMode
          ? home?.darkLogo || home?.logo
          : home?.logo || home?.darkLogo,
      },
      summaryScoring: landing?.summary?.scoring || [],
      summaryPenalties: landing?.summary?.penalties || [],
      lineScoreByPeriod: details?.data?.rightRail?.linescore?.byPeriod || [],
      plays: details?.data?.plays?.plays || [],
    };
  }

  const competition =
    details?.header?.competitions?.[0] || details?.competitions?.[0] || null;
  const competitors = competition?.competitors || [];
  const awayComp =
    competitors.find((c) => c.homeAway === "away") || competitors[0] || {};
  const homeComp =
    competitors.find((c) => c.homeAway === "home") || competitors[1] || {};
  const statusType = competition?.status?.type || {};
  const gameDate = competition?.date || "";

  let statusMain = "FT";
  let statusSub = "Final";
  let isPre = false;

  if (statusType?.state === "pre") {
    const dt = new Date(gameDate || Date.now());
    statusMain = dt.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    statusSub = dt.toLocaleDateString([], { month: "short", day: "numeric" });
    isPre = true;
  } else if (statusType?.state === "in") {
    const period = Number(competition?.status?.period || 1);
    statusMain = competition?.status?.displayClock || "0:00";
    statusSub = `${toOrdinal(period)} Period`;
  } else if (statusType?.state === "post") {
    const { time, ampm } = formatLocalTime(gameDate);
    statusMain = "FT";
    statusSub = `${time} ${ampm}`.trim();
  }

  return {
    venue: competition?.venue?.fullName || "",
    leagueName: "NHL",
    startTimeUtc: gameDate,
    statusMain,
    statusSub,
    isPre,
    rawState: String(statusType?.state || "").toUpperCase(),
    periodNumber: Number(competition?.status?.period || 0),
    clockSecondsRemaining: parseClockSecs(
      competition?.status?.displayClock || "",
    ),
    clockRunning: String(statusType?.state || "") === "in",
    away: {
      id: String(awayComp?.team?.id || awayComp?.id || ""),
      abbreviation: awayComp?.team?.abbreviation || "",
      name:
        awayComp?.team?.shortDisplayName ||
        awayComp?.team?.displayName ||
        awayComp?.team?.name ||
        "Away",
      score: Number(awayComp?.score || 0),
      logo: awayComp?.team?.logo || null,
    },
    home: {
      id: String(homeComp?.team?.id || homeComp?.id || ""),
      abbreviation: homeComp?.team?.abbreviation || "",
      name:
        homeComp?.team?.shortDisplayName ||
        homeComp?.team?.displayName ||
        homeComp?.team?.name ||
        "Home",
      score: Number(homeComp?.score || 0),
      logo: homeComp?.team?.logo || null,
    },
    summaryScoring: details?.summary?.scoring || [],
    summaryPenalties: details?.summary?.penalties || [],
    lineScoreByPeriod: [],
    plays: details?.plays || [],
  };
};

const buildScorers = ({ summaryScoring, plays, awayAbbr, homeAbbr }) => {
  const awayGoals = [];
  const homeGoals = [];

  const addGoal = (bucket, name, timeInPeriod, periodNumber) => {
    if (!name || !timeInPeriod || !periodNumber) return;
    bucket.push({
      name,
      timeInPeriod,
      periodNumber,
      secs: parseClockSecs(timeInPeriod),
    });
  };

  if (Array.isArray(summaryScoring) && summaryScoring.length > 0) {
    summaryScoring.forEach((periodBlock) => {
      const periodNumber = Number(periodBlock?.periodDescriptor?.number || 0);
      if (!periodNumber || periodNumber >= 5) return;

      const goals = Array.isArray(periodBlock?.goals) ? periodBlock.goals : [];
      goals.forEach((goal) => {
        const scorerName =
          goal?.name ||
          `${String(goal?.firstName || "").charAt(0)}. ${goal?.lastName || ""}`.trim();
        const teamAbbr = String(goal?.teamAbbrev || "").toUpperCase();
        const timeInPeriod = goal?.timeInPeriod || goal?.timeRemaining;

        if (teamAbbr && teamAbbr === awayAbbr) {
          addGoal(awayGoals, scorerName, timeInPeriod, periodNumber);
        } else if (teamAbbr && teamAbbr === homeAbbr) {
          addGoal(homeGoals, scorerName, timeInPeriod, periodNumber);
        }
      });
    });
  }

  if (awayGoals.length === 0 && homeGoals.length === 0) {
    (plays || []).forEach((play) => {
      const isGoal =
        Number(play?.typeCode) === 505 ||
        String(play?.typeDescKey || "").toLowerCase() === "goal" ||
        !!play?.scoringPlay;
      if (!isGoal) return;

      const periodNumber = Number(play?.periodDescriptor?.number || 0);
      if (!periodNumber || periodNumber >= 5) return;

      const name =
        play?.details?.scoringPlayerName ||
        play?.details?.playerName ||
        play?.scorer ||
        null;
      const timeInPeriod = play?.timeInPeriod || play?.timeRemaining || null;
      const teamAbbr = String(
        play?.details?.eventOwnerTeamAbbrev || "",
      ).toUpperCase();

      if (teamAbbr === awayAbbr)
        addGoal(awayGoals, name, timeInPeriod, periodNumber);
      if (teamAbbr === homeAbbr)
        addGoal(homeGoals, name, timeInPeriod, periodNumber);
    });
  }

  const byEarliest = (a, b) => {
    if (a.periodNumber !== b.periodNumber)
      return a.periodNumber - b.periodNumber;
    return b.secs - a.secs;
  };

  const format = (g) =>
    `${g.name} ${g.timeInPeriod} (${getScorerPeriodLabel(g.periodNumber)})`;

  return {
    away: awayGoals.sort(byEarliest).map(format),
    home: homeGoals.sort(byEarliest).map(format),
  };
};

const toDisplayName = (player) => {
  if (!player) return "";
  const first = String(player?.firstName || "").trim();
  const last = String(player?.lastName || "").trim();
  return `${first} ${last}`.trim() || String(player?.name || "").trim();
};

const toAssistName = (player) => {
  const first = String(player?.firstName || "").trim();
  const last = String(player?.lastName || "").trim();
  if (first && last) return `${first.charAt(0)}.${last}`;
  return toDisplayName(player);
};

const startCaseFromHyphen = (value) =>
  String(value || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const formatPenaltyLine = (penalty) => {
  const rawType = String(
    penalty?.type || penalty?.typeDescKey || penalty?.typeKey || "Penalty",
  ).trim();
  const type = /^[A-Z0-9]+$/.test(rawType)
    ? rawType
    : startCaseFromHyphen(rawType);
  const desc = startCaseFromHyphen(penalty?.descKey || penalty?.desc || "");
  return desc ? `${type} - ${desc}` : type;
};

const EventsSection = ({ game, theme, colors }) => {
  const awayAbbr = String(game?.away?.abbreviation || "").toUpperCase();
  const homeAbbr = String(game?.home?.abbreviation || "").toUpperCase();
  const live = isNhlGameLive(game);

  const { periods, cumulativeByPeriod, periodOnlyScore } = useMemo(() => {
    const byPeriod = Array.isArray(game?.lineScoreByPeriod)
      ? game.lineScoreByPeriod
      : [];
    const periodMap = new Map();

    const pushEvent = (periodNumber, event) => {
      const p = Number(periodNumber || 0);
      if (!p) return;
      if (!periodMap.has(p)) periodMap.set(p, []);
      periodMap.get(p).push(event);
    };

    const cumulativeMap = new Map();
    const periodOnlyMap = new Map();
    let awayTotal = 0;
    let homeTotal = 0;
    byPeriod.forEach((row, idx) => {
      const period = idx + 1;
      const away = Number(row?.away || 0);
      const home = Number(row?.home || 0);
      awayTotal += away;
      homeTotal += home;
      cumulativeMap.set(period, { away: awayTotal, home: homeTotal });
      periodOnlyMap.set(period, { away, home });
    });

    (game?.summaryScoring || []).forEach((periodBlock) => {
      const periodNumber = Number(periodBlock?.periodDescriptor?.number || 0);
      const goals = Array.isArray(periodBlock?.goals) ? periodBlock.goals : [];
      goals.forEach((goal) => {
        const time = goal?.timeInPeriod || goal?.timeRemaining || "";
        const assists = Array.isArray(goal?.assists) ? goal.assists : [];
        const homeScoreAfter = Number(goal?.homeScore ?? goal?.scoreHome);
        const awayScoreAfter = Number(goal?.awayScore ?? goal?.scoreAway);
        pushEvent(periodNumber, {
          type: "goal",
          teamAbbr: String(goal?.teamAbbrev || "").toUpperCase(),
          timeInPeriod: time,
          sortSecs: parseClockSecs(time),
          mainText: toDisplayName(goal),
          homeScoreAfter: Number.isFinite(homeScoreAfter)
            ? homeScoreAfter
            : null,
          awayScoreAfter: Number.isFinite(awayScoreAfter)
            ? awayScoreAfter
            : null,
          subText:
            assists.length > 0
              ? `Assisted By ${assists.map(toAssistName).filter(Boolean).join(" and ")}`
              : "",
        });
      });
    });

    (game?.summaryPenalties || []).forEach((penaltyOrBlock) => {
      const blockPeriod = Number(
        penaltyOrBlock?.periodDescriptor?.number ||
          penaltyOrBlock?.period ||
          penaltyOrBlock?.periodNumber ||
          0,
      );
      const penalties = Array.isArray(penaltyOrBlock?.penalties)
        ? penaltyOrBlock.penalties
        : [penaltyOrBlock];

      penalties.forEach((penalty) => {
        if (!penalty || typeof penalty !== "object") return;
        const periodNumber = Number(
          penalty?.periodDescriptor?.number ||
            penalty?.period ||
            penalty?.periodNumber ||
            blockPeriod ||
            byPeriod.length ||
            game?.periodNumber ||
            1,
        );
        const time = penalty?.timeInPeriod || penalty?.timeRemaining || "";
        const committedBy =
          penalty?.committedByPlayer || penalty?.commitedByPlayer || {};
        pushEvent(periodNumber, {
          type: "penalty",
          teamAbbr: String(
            penalty?.teamAbbrev ||
              penalty?.teamAbbr ||
              penalty?.committedByTeamAbbrev ||
              penalty?.commitedByTeamAbbrev ||
              "",
          ).toUpperCase(),
          timeInPeriod: time,
          sortSecs: parseClockSecs(time),
          mainText: toDisplayName(committedBy),
          subText: formatPenaltyLine(penalty),
        });
      });
    });

    const maxPeriodFromState = Number(game?.periodNumber || 0);
    const maxPeriodFromLines = byPeriod.length;
    const maxPeriodFromEvents = Math.max(0, ...Array.from(periodMap.keys()));
    const maxPeriod = Math.max(
      maxPeriodFromState,
      maxPeriodFromLines,
      maxPeriodFromEvents,
    );
    const allPeriods = Array.from(
      { length: Math.max(0, maxPeriod) },
      (_, i) => i + 1,
    );
    const orderedPeriods = live ? [...allPeriods].reverse() : allPeriods;

    const builtPeriods = orderedPeriods.map((period) => {
      const rows = periodMap.get(period) || [];
      rows.sort((a, b) =>
        live ? b.sortSecs - a.sortSecs : a.sortSecs - b.sortSecs,
      );
      return { period, rows };
    });

    return {
      periods: builtPeriods,
      cumulativeByPeriod: cumulativeMap,
      periodOnlyScore: periodOnlyMap,
    };
  }, [game, live]);

  if (periods.length === 0) return null;

  return (
    <View
      style={[
        styles.eventsCard,
        { backgroundColor: theme.surface, borderColor: theme.surface },
      ]}
    >
      <View
        style={[styles.eventsHeaderRow, { borderBottomColor: theme.border }]}
      >
        <Text style={[styles.eventsHeaderTitle, { color: theme.text }]}>
          Events
        </Text>
      </View>

      <View style={styles.eventsBody}>
        {periods.map(({ period, rows }) => {
          const total = cumulativeByPeriod.get(period) || {
            away: game?.away?.score ?? 0,
            home: game?.home?.score ?? 0,
          };
          const periodScore = periodOnlyScore.get(period) || {
            away: 0,
            home: 0,
          };
          const divider = (
            <View style={styles.periodDividerRow}>
              <View
                style={[
                  styles.periodDividerLine,
                  { backgroundColor: theme.border },
                ]}
              />
              <View
                style={[
                  styles.periodDividerBadge,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.surfaceSecondary,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.periodDividerLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  {getPeriodHeaderLabel(period)}
                </Text>
                <View style={styles.periodDividerFtScores}>
                  <Text
                    style={[styles.periodDividerScore, { color: theme.text }]}
                  >
                    <Text
                      style={
                        periodScore.away > periodScore.home
                          ? { color: colors.primary, fontWeight: "800" }
                          : { color: theme.text, fontWeight: "400" }
                      }
                    >
                      {periodScore.away}
                    </Text>
                    {" - "}
                    <Text
                      style={
                        periodScore.home > periodScore.away
                          ? { color: colors.primary, fontWeight: "800" }
                          : { color: theme.text, fontWeight: "400" }
                      }
                    >
                      {periodScore.home}
                    </Text>
                  </Text>
                  <Text
                    style={[
                      styles.periodDividerBracket,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {" ("}
                    <Text
                      style={
                        total.away > total.home
                          ? { color: colors.primary, fontWeight: "800" }
                          : { color: theme.text, fontWeight: "400" }
                      }
                    >
                      {total.away}
                    </Text>
                    {" - "}
                    <Text
                      style={
                        total.home > total.away
                          ? { color: colors.primary, fontWeight: "800" }
                          : { color: theme.text, fontWeight: "400" }
                      }
                    >
                      {total.home}
                    </Text>
                    {")"}
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.periodDividerLine,
                  { backgroundColor: theme.border },
                ]}
              />
            </View>
          );

          return (
            <View key={`period-${period}`}>
              {live && divider}

              {rows.length === 0 ? (
                <View style={styles.noEventsRow}>
                  <Text style={[styles.noEventsText, { color: theme.textSecondary }]}>
                    NO EVENTS
                  </Text>
                </View>
              ) : (
                rows.map((event, idx) => {
                  const isAway = event.teamAbbr === awayAbbr;
                  const isHome = event.teamAbbr === homeAbbr;

                  return (
                    <View
                      key={`period-${period}-event-${idx}`}
                      style={[
                        styles.eventLane,
                        isAway ? styles.eventLaneAway : styles.eventLaneHome,
                      ]}
                    >
                      <View
                        style={
                          isAway ? styles.inlineRowAway : styles.inlineRowHome
                        }
                      >
                        {isAway && (
                          <Text
                            style={[
                              styles.minuteText,
                              { color: theme.text },
                            ]}
                          >
                            {event.timeInPeriod}
                          </Text>
                        )}

                        {isAway &&
                          (event.type === "goal" ? (
                            <FontAwesome6
                              name="hockey-puck"
                              size={15}
                              color={theme.text}
                            />
                          ) : (
                            <MaterialIcons
                              name="person-off"
                              size={20}
                              color={theme.error || "#e03131"}
                            />
                          ))}

                        <View
                          style={[
                            styles.textBlock,
                            !isAway && styles.textBlockAway,
                          ]}
                        >
                          <Text
                            style={[
                              styles.eventText,
                              { color: theme.text },
                              !isAway && styles.eventTextAway,
                            ]}
                            numberOfLines={2}
                          >
                            {event.mainText}
                            {event.type === "goal" &&
                            event.homeScoreAfter != null &&
                            event.awayScoreAfter != null ? (
                              <>
                                {" ("}
                                <Text
                                  style={
                                    isAway
                                      ? {
                                          color: colors.primary,
                                          fontWeight: "800",
                                        }
                                      : { color: theme.text, fontWeight: "400" }
                                  }
                                >
                                  {event.awayScoreAfter}
                                </Text>
                                {" - "}
                                <Text
                                  style={
                                    isHome
                                      ? {
                                          color: colors.primary,
                                          fontWeight: "800",
                                        }
                                      : { color: theme.text, fontWeight: "400" }
                                  }
                                >
                                  {event.homeScoreAfter}
                                </Text>
                                {")"}
                              </>
                            ) : null}
                          </Text>
                          {!!event.subText && (
                            <Text
                              style={[
                                styles.goalDetailText,
                                { color: theme.textSecondary },
                                !isAway && styles.goalDetailTextAway,
                              ]}
                              numberOfLines={2}
                            >
                              {event.subText}
                            </Text>
                          )}
                        </View>

                        {!isAway &&
                          (event.type === "goal" ? (
                            <FontAwesome6
                              name="hockey-puck"
                              size={15}
                              color={theme.text}
                            />
                          ) : (
                            <MaterialIcons
                              name="person-off"
                              size={20}
                              color={theme.error || "#e03131"}
                            />
                          ))}

                        {!isAway && (
                          <Text
                            style={[
                              styles.minuteText,
                              { color: theme.text },
                            ]}
                          >
                            {event.timeInPeriod}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })
              )}

              {!live && divider}
            </View>
          );
        })}
      </View>
    </View>
  );
};

const NHLGameDetailsScreen = ({ route }) => {
  const { gameId } = route.params || {};
  const navigation = useNavigation();
  const { theme, colors, getTeamLogoUrl, isDarkMode } = useTheme();

  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState(null);
  const [headerH, setHeaderH] = useState(190);
  const [activeTab, setActiveTab] = useState("Main");
  const [nowMs, setNowMs] = useState(Date.now());
  const [clockGame, setClockGame] = useState(null);
  const scrollY = useMemo(() => new Animated.Value(0), []);

  const loadDetails = async (mountedRef = { current: true }) => {
    try {
      let data = await NHLService.getGameDetails(gameId);

      const hasGoodTeams = (d) => {
        const normalized = normalizeGameData(d, isDarkMode);
        if (!normalized) return false;
        const hasAway = !!(
          normalized.away?.id || normalized.away?.abbreviation
        );
        const hasHome = !!(
          normalized.home?.id || normalized.home?.abbreviation
        );
        return hasAway && hasHome;
      };

      if (!hasGoodTeams(data)) {
        try {
          const res = await fetch(
            `${NHLService.BACKEND_URL}/nhl/game/${String(gameId)}`,
            { headers: NHLService.getBrowserHeaders?.() || undefined },
          );
          if (res.ok) {
            const backendData = await res.json();
            if (hasGoodTeams(backendData)) {
              data = backendData;
            }
          }
        } catch (fallbackErr) {
          console.warn("NHL backend fallback failed", fallbackErr);
        }
      }

      if (mountedRef.current) setDetails(data);
    } catch (error) {
      console.error("Failed to load NHL game details", error);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const mountedRef = { current: true };
    loadDetails(mountedRef);
    return () => {
      mountedRef.current = false;
    };
  }, [gameId, isDarkMode]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const game = useMemo(
    () => normalizeGameData(details, isDarkMode),
    [details, isDarkMode],
  );
  const scorers = useMemo(
    () =>
      buildScorers({
        summaryScoring: game?.summaryScoring,
        plays: game?.plays,
        awayAbbr: String(game?.away?.abbreviation || "").toUpperCase(),
        homeAbbr: String(game?.home?.abbreviation || "").toUpperCase(),
      }),
    [game],
  );

  useEffect(() => {
    setClockGame((prev) => normalizeGameWithClockState(game, prev, Date.now()));
  }, [game]);

  useEffect(() => {
    const source = clockGame || game;
    if (!source) return;

    const isLive = isNhlGameLive(source);
    const isScheduled = !isLive && !isNhlGameFinished(source);
    const startTs = new Date(source.startTimeUtc || "").getTime();
    const soon =
      isScheduled &&
      !Number.isNaN(startTs) &&
      startTs - Date.now() <= SOON_THRESHOLD &&
      startTs - Date.now() >= 0;
    const intervalMs = isLive || soon ? INTERVAL_FAST : INTERVAL_SLOW;

    const id = setInterval(() => {
      loadDetails({ current: true });
    }, intervalMs);

    return () => clearInterval(id);
  }, [clockGame, gameId, isDarkMode]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!game) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary }}>No details available</Text>
      </View>
    );
  }

  const liveGame = clockGame || game;
  const statusLines = getStatusLines(liveGame, nowMs);

  const awayColor = NHLService.getTeamColor(
    game?.away.abbreviation,
    colors.primary,
  );
  const homeColor = NHLService.getTeamColor(
    game?.home.abbreviation,
    colors.secondary,
  );

  const awayLogo =
    game?.away?.logo || getTeamLogoUrl("nhl", game?.away?.abbreviation);
  const homeLogo =
    game?.home?.logo || getTeamLogoUrl("nhl", game?.home?.abbreviation);

  const homeWins = (game?.home?.score || 0) > (game?.away?.score || 0);
  const awayWins = (game?.away?.score || 0) > (game?.home?.score || 0);
  const stickyThreshold = headerH > 0 ? headerH - 40 : 120;
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

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        scrollEventThrottle={16}
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View
          style={[styles.header, { backgroundColor: theme.surfaceSecondary }]}
          onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
        >
          <HeaderGradient
            awayColor={awayColor}
            homeColor={homeColor}
            theme={theme}
            height={headerH}
          />

          <View style={styles.leagueRow}>
            <Text
              style={[styles.leagueName, { color: theme.textTertiary }]}
              numberOfLines={1}
            >
              {[game.venue, game.leagueName].filter(Boolean).join(" - ")}
            </Text>
          </View>

          <View style={styles.teamsRow}>
            <TeamSide
              team={game.away}
              logo={awayLogo}
              score={game.away.score}
              side="away"
              isPre={game.isPre}
              isWinner={awayWins}
              isLoser={homeWins}
              theme={theme}
              onPress={() =>
                navigation.navigate("TeamPage", {
                  teamId: game.away.id,
                  sport: "nhl",
                })
              }
            />

            <View style={styles.statusCenter}>
              <StatusBadge
                game={{
                  ...liveGame,
                  statusMain: statusLines.line1,
                  statusSub: statusLines.line2,
                }}
                theme={theme}
                colors={colors}
              />
            </View>

            <TeamSide
              team={game.home}
              logo={homeLogo}
              score={game.home.score}
              side="home"
              isPre={game.isPre}
              isWinner={homeWins}
              isLoser={awayWins}
              theme={theme}
              onPress={() =>
                navigation.navigate("TeamPage", {
                  teamId: game.home.id,
                  sport: "nhl",
                })
              }
            />
          </View>

          {(scorers.home.length > 0 || scorers.away.length > 0) && (
            <View style={styles.scorersSection}>
              <View style={styles.scorersSideLeft}>
                {scorers.away.map((line, idx) => (
                  <Text
                    key={`away-scorer-${idx}`}
                    style={[
                      styles.scorerText,
                      { color: theme.textSecondary, textAlign: "right" },
                    ]}
                    numberOfLines={2}
                  >
                    {line}
                  </Text>
                ))}
              </View>

              <View style={styles.scorersPuckCol}>
                <FontAwesome6
                  name="hockey-puck"
                  size={12}
                  color={theme.textSecondary}
                />
              </View>

              <View style={styles.scorersSideRight}>
                {scorers.home.map((line, idx) => (
                  <Text
                    key={`home-scorer-${idx}`}
                    style={[styles.scorerText, { color: theme.textSecondary }]}
                    numberOfLines={2}
                  >
                    {line}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </View>

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
            <View style={styles.miniSide}>
              <Image
                source={{ uri: awayLogo }}
                style={styles.miniLogo}
                contentFit="contain"
              />
              <Text
                style={[styles.miniAbbr, { color: theme.text }]}
                numberOfLines={1}
              >
                {game?.away?.abbreviation || "AWY"}
              </Text>
              {!game?.isPre && (
                <Text
                  style={[
                    styles.miniScore,
                    { color: awayWins ? theme.text : theme.textSecondary },
                  ]}
                >
                  {game?.away?.score ?? 0}
                </Text>
              )}
            </View>

            <View style={styles.miniStatusBlock}>
              <Text
                style={[styles.miniStatusLine, { color: theme.text }]}
                numberOfLines={1}
              >
                {statusLines.line1}
              </Text>
              {!!statusLines.line2 && (
                <Text
                  style={[styles.miniStatusSub, { color: theme.textTertiary }]}
                  numberOfLines={1}
                >
                  {statusLines.line2}
                </Text>
              )}
            </View>

            <View style={[styles.miniSide, { justifyContent: "flex-end" }]}>
              {!game?.isPre && (
                <Text
                  style={[
                    styles.miniScore,
                    { color: homeWins ? theme.text : theme.textSecondary },
                  ]}
                >
                  {game?.home?.score ?? 0}
                </Text>
              )}
              <Text
                style={[styles.miniAbbr, { color: theme.text }]}
                numberOfLines={1}
              >
                {game?.home?.abbreviation || "HME"}
              </Text>
              <Image
                source={{ uri: homeLogo }}
                style={styles.miniLogo}
                contentFit="contain"
              />
            </View>
          </Animated.View>

          <View style={styles.tabBarWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabBarContent}
            >
              {TABS.map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[
                    styles.tabBarButton,
                    activeTab === tab && { borderBottomColor: colors.primary },
                  ]}
                  onPress={() => setActiveTab(tab)}
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
                    {tab}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>

        <View style={styles.tabContent}>
          {activeTab === "Main" && (
            <>
              <View style={{ height: 12 }} />
              <EventsSection game={liveGame} theme={theme} colors={colors} />
            </>
          )}
          {activeTab !== "Main" && (
            <View style={styles.comingSoon}>
              <Text
                style={[styles.comingSoonText, { color: theme.textSecondary }]}
              >
                No data yet
              </Text>
            </View>
          )}
        </View>
      </Animated.ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingBottom: 20 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  header: {
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 16,
    overflow: "hidden",
    position: "relative",
  },
  leagueRow: {
    marginTop: -6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  leagueName: {
    fontSize: 12,
    fontWeight: "500",
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
  logoScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  teamLogo: {
    width: 85,
    height: 60,
  },
  teamScore: {
    fontSize: 42,
    lineHeight: 48,
    fontWeight: "800",
    minWidth: 24,
    textAlign: "center",
  },
  teamNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    maxWidth: 130,
  },
  teamName: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 17,
    maxWidth: 130,
    textAlign: "center",
  },

  statusCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  statusBadge: {
    paddingHorizontal: 8,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
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
  scorersPuckCol: {
    width: 28,
    alignItems: "center",
    paddingTop: 2,
  },
  scorerText: {
    fontSize: 11,
    lineHeight: 16,
  },
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
  miniAbbr: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  miniLogo: {
    width: 34,
    height: 30,
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
  comingSoon: {
    alignItems: "center",
    paddingTop: 48,
    minHeight: 180,
  },
  comingSoonText: {
    fontSize: 14,
  },
  eventsCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  eventsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  eventsHeaderAccent: {
    width: 4,
    height: 16,
    borderRadius: 2,
  },
  eventsHeaderTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  eventsBody: {
    paddingHorizontal: 14,
    paddingVertical: 10,
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
  eventLane: {
    width: "100%",
    paddingVertical: 10,
  },
  eventLaneHome: {
    alignItems: "flex-end",
  },
  eventLaneAway: {
    alignItems: "flex-start",
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
  textBlock: {
    flexShrink: 1,
    minWidth: 0,
  },
  textBlockAway: {
    alignItems: "flex-end",
  },
  eventText: {
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 1,
  },
  eventTextAway: {
    textAlign: "right",
  },
  goalDetailText: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  goalDetailTextAway: {
    textAlign: "right",
  },
  noEventsRow: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  noEventsText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
});

export default NHLGameDetailsScreen;

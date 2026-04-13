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
  Modal,
} from "react-native";
import { Image } from "expo-image";
import { FontAwesome6, MaterialIcons, Ionicons } from "@expo/vector-icons";
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

const buildPlayerMetaById = (boxscore) => {
  const map = {};
  const byGameStats = boxscore?.playerByGameStats;
  const buckets = [
    byGameStats?.awayTeam?.forwards,
    byGameStats?.awayTeam?.defense,
    byGameStats?.awayTeam?.goalies,
    byGameStats?.homeTeam?.forwards,
    byGameStats?.homeTeam?.defense,
    byGameStats?.homeTeam?.goalies,
  ];

  buckets.forEach((bucket) => {
    (Array.isArray(bucket) ? bucket : []).forEach((player) => {
      const id = Number(player?.playerId);
      const name = String(player?.name || "").trim();
      if (Number.isFinite(id) && name) {
        map[id] = {
          name,
          position: String(player?.position || "").trim() || null,
          sweaterNumber:
            player?.sweaterNumber != null ? Number(player.sweaterNumber) : null,
        };
      }
    });
  });

  return map;
};

const buildPlayRosterSpots = (playPayload) => {
  const spots = Array.isArray(playPayload?.rosterSpots)
    ? playPayload.rosterSpots
    : [];
  return spots
    .map((spot) => {
      const playerId = Number(spot?.playerId);
      if (!Number.isFinite(playerId)) return null;
      return {
        teamId: Number(spot?.teamId),
        playerId,
        firstName: String(spot?.firstName?.default || "").trim(),
        lastName: String(spot?.lastName?.default || "").trim(),
        sweaterNumber:
          spot?.sweaterNumber != null ? Number(spot.sweaterNumber) : null,
        headshot: String(spot?.headshot || "").trim() || null,
      };
    })
    .filter(Boolean);
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
    const periodType = landing?.periodDescriptor?.periodType || "";

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
      statusMain =
        "FT" + (periodType && periodType !== "REG" ? ` (${periodType})` : "");
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
      threeStars: landing?.summary?.threeStars || [],
      referees: (details?.data?.rightRail?.gameInfo?.referees || [])
        .map((entry) => String(entry?.default || entry?.name || "").trim())
        .filter(Boolean),
      linesmen: (details?.data?.rightRail?.gameInfo?.linesmen || [])
        .map((entry) => String(entry?.default || entry?.name || "").trim())
        .filter(Boolean),
      lineScoreByPeriod: details?.data?.rightRail?.linescore?.byPeriod || [],
      teamGameStats: details?.data?.rightRail?.teamGameStats || [],
      shifts: details?.data?.shifts || {},
      plays: details?.data?.plays?.plays || [],
      playerMetaById: buildPlayerMetaById(details?.data?.boxscore),
      playRosterSpots: buildPlayRosterSpots(details?.data?.plays),
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
  const periodType = landing?.periodDescriptor?.periodType || "";

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
    statusMain =
      "FT" + (periodType && periodType !== "REG" ? ` (${periodType})` : "");
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
    threeStars: details?.summary?.threeStars || [],
    referees: (details?.gameInfo?.referees || [])
      .map((entry) => String(entry?.default || entry?.name || "").trim())
      .filter(Boolean),
    linesmen: (details?.gameInfo?.linesmen || [])
      .map((entry) => String(entry?.default || entry?.name || "").trim())
      .filter(Boolean),
    lineScoreByPeriod: [],
    teamGameStats: details?.teamGameStats || [],
    shifts: details?.shifts || {},
    plays: details?.plays || [],
    playerMetaById: buildPlayerMetaById(details?.boxscore),
    playRosterSpots: buildPlayRosterSpots(details?.plays),
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

const toCapitalizedWords = (value) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const toSafeStatValue = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const withAlpha30 = (color) => {
  const raw = String(color || "").trim();
  const fullHex = raw.match(/^#([0-9a-fA-F]{6})$/);
  if (fullHex) return `${raw}30`;

  const shortHex = raw.match(/^#([0-9a-fA-F]{3})$/);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split("");
    return `#${r}${r}${g}${g}${b}${b}30`;
  }

  const hexWithAlpha = raw.match(/^#([0-9a-fA-F]{8})$/);
  if (hexWithAlpha) return `#${hexWithAlpha[1].slice(0, 6)}30`;

  return "rgba(255,255,255,0.18)";
};

const splitOfficialName = (value) => {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
};

const LinescoreTable = ({ game, theme, colors }) => {
  const byPeriod = Array.isArray(game?.lineScoreByPeriod)
    ? game.lineScoreByPeriod
    : [];
  if (byPeriod.length === 0) return null;

  const awayTotal = Number(game?.away?.score ?? 0);
  const homeTotal = Number(game?.home?.score ?? 0);
  const awayAbbr = game?.away?.abbreviation || "AWY";
  const homeAbbr = game?.home?.abbreviation || "HME";
  const awayTeamColor = NHLService.getTeamColor(awayAbbr, colors.primary);
  const homeTeamColor = NHLService.getTeamColor(homeAbbr, colors.secondary);

  const teamStats = Array.isArray(game?.teamGameStats)
    ? game.teamGameStats
    : [];
  const sogStat = teamStats.find(
    (row) => String(row?.category || "").toLowerCase() === "sog",
  );
  const awaySog = Number.isFinite(Number(sogStat?.awayValue))
    ? Number(sogStat.awayValue)
    : 0;
  const homeSog = Number.isFinite(Number(sogStat?.homeValue))
    ? Number(sogStat.homeValue)
    : 0;

  const CELL_W = 32;
  const ROW_H = 34;
  const LABEL_W = 48;
  const TOTAL_W = 38;

  const [availableW, setAvailableW] = useState(0);
  const cellW =
    availableW > 0 && byPeriod.length > 0
      ? Math.max(CELL_W, availableW / byPeriod.length)
      : CELL_W;

  const headerBg = theme.surfaceSecondary ?? "rgba(128,128,128,0.08)";
  const borderCol = theme.border ?? "rgba(128,128,128,0.2)";

  return (
    <View style={[styles.linescoreCard, { backgroundColor: theme.surface }]}>
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: LABEL_W }}>
          <View
            style={[
              styles.linescoreCell,
              {
                height: ROW_H,
                borderBottomColor: borderCol,
                backgroundColor: headerBg,
              },
            ]}
          />
          <View
            style={[
              styles.linescoreCell,
              {
                height: ROW_H,
                borderBottomColor: awayTeamColor,
                borderBottomWidth: 2,
              },
            ]}
          >
            <Text style={[styles.linescoreTeamAbbr, { color: theme.text }]}>
              {awayAbbr}
            </Text>
          </View>
          <View
            style={[
              styles.linescoreCell,
              {
                height: ROW_H,
                borderBottomColor: homeTeamColor,
                borderBottomWidth: 2,
              },
            ]}
          >
            <Text style={[styles.linescoreTeamAbbr, { color: theme.text }]}>
              {homeAbbr}
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          style={{ flex: 1 }}
          contentContainerStyle={{ flexDirection: "column" }}
          onLayout={(e) => setAvailableW(e.nativeEvent.layout.width)}
        >
          <View style={{ flexDirection: "row" }}>
            {byPeriod.map((row, idx) => {
              const pNum = Number(row?.periodDescriptor?.number || idx + 1);
              const label = pNum <= 3 ? String(pNum) : `OT${pNum - 3}`;
              return (
                <View
                  key={`p-h-${idx}`}
                  style={[
                    styles.linescoreCell,
                    {
                      width: cellW,
                      height: ROW_H,
                      backgroundColor: headerBg,
                      borderBottomColor: borderCol,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.linescorePeriodNum,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={{ flexDirection: "row" }}>
            {byPeriod.map((row, idx) => (
              <View
                key={`p-a-${idx}`}
                style={[
                  styles.linescoreCell,
                  {
                    width: cellW,
                    height: ROW_H,
                    borderBottomColor: awayTeamColor,
                    borderBottomWidth: 2,
                  },
                ]}
              >
                <Text style={[styles.linescoreRunsText, { color: theme.text }]}>
                  {Number(row?.away ?? 0)}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: "row" }}>
            {byPeriod.map((row, idx) => (
              <View
                key={`p-hm-${idx}`}
                style={[
                  styles.linescoreCell,
                  {
                    width: cellW,
                    height: ROW_H,
                    borderBottomColor: homeTeamColor,
                    borderBottomWidth: 2,
                  },
                ]}
              >
                <Text style={[styles.linescoreRunsText, { color: theme.text }]}>
                  {Number(row?.home ?? 0)}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <View
          style={[
            styles.linescoreTotalsSection,
            { borderLeftColor: borderCol },
          ]}
        >
          <View
            style={[
              styles.linescoreTotalsRow,
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
                  styles.linescoreTotalHeader,
                  { color: theme.textSecondary },
                ]}
              >
                T
              </Text>
            </View>
            <View style={{ width: TOTAL_W, alignItems: "center" }}>
              <Text
                style={[
                  styles.linescoreTotalHeader,
                  { color: theme.textSecondary },
                ]}
              >
                SOG
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.linescoreTotalsRow,
              {
                height: ROW_H,
                borderBottomColor: awayTeamColor,
                borderBottomWidth: 2,
              },
            ]}
          >
            <View style={{ width: TOTAL_W, alignItems: "center" }}>
              <Text style={[styles.linescoreTotalVal, { color: theme.text }]}>
                {awayTotal}
              </Text>
            </View>
            <View style={{ width: TOTAL_W, alignItems: "center" }}>
              <Text style={[styles.linescoreTotalVal, { color: theme.text }]}>
                {awaySog}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.linescoreTotalsRow,
              {
                height: ROW_H,
                borderBottomColor: homeTeamColor,
                borderBottomWidth: 2,
              },
            ]}
          >
            <View style={{ width: TOTAL_W, alignItems: "center" }}>
              <Text style={[styles.linescoreTotalVal, { color: theme.text }]}>
                {homeTotal}
              </Text>
            </View>
            <View style={{ width: TOTAL_W, alignItems: "center" }}>
              <Text style={[styles.linescoreTotalVal, { color: theme.text }]}>
                {homeSog}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

const EventsSection = ({ game, theme, colors }) => {
  const awayAbbr = String(game?.away?.abbreviation || "").toUpperCase();
  const homeAbbr = String(game?.home?.abbreviation || "").toUpperCase();
  const awayName = toCapitalizedWords(
    game?.away?.name || game?.away?.abbreviation || "Away",
  );
  const homeName = toCapitalizedWords(
    game?.home?.name || game?.home?.abbreviation || "Home",
  );
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
          const currentLivePeriod = Number(game?.periodNumber || 0);
          const showLiveDivider = !live || period !== currentLivePeriod;
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
              {live && showLiveDivider && divider}

              {rows.length === 0 ? (
                <View style={styles.noEventsRow}>
                  <Text
                    style={[
                      styles.noEventsText,
                      { color: theme.textSecondary },
                    ]}
                  >
                    NO EVENTS
                  </Text>
                </View>
              ) : (
                rows.map((event, idx) => {
                  const isAway = event.teamAbbr === awayAbbr;
                  const isHome = event.teamAbbr === homeAbbr;
                  const fallbackTeamName = isAway
                    ? awayName.toUpperCase()
                    : isHome
                      ? homeName.toUpperCase()
                      : "Team";
                  const displayName =
                    String(event.mainText || "").trim() || fallbackTeamName;

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
                            style={[styles.minuteText, { color: theme.text }]}
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
                            {displayName}
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
                            style={[styles.minuteText, { color: theme.text }]}
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

const ThreeStarRowGradient = ({ gradId, teamColor, theme }) => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    <Svg width={width} height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={teamColor} stopOpacity="0.24" />
          <Stop
            offset="55%"
            stopColor={theme.surfaceSecondary || teamColor}
            stopOpacity="0"
          />
          <Stop
            offset="100%"
            stopColor={theme.surfaceSecondary || teamColor}
            stopOpacity="0"
          />
        </LinearGradient>
      </Defs>
      <Rect width={width} height="100%" fill={`url(#${gradId})`} />
    </Svg>
  </View>
);

const ThreeStarsSection = ({ game, theme, colors, getTeamLogoUrl }) => {
  const stars = useMemo(() => {
    const list = Array.isArray(game?.threeStars) ? game.threeStars : [];
    return list
      .filter((entry) => entry && typeof entry === "object")
      .sort((a, b) => Number(b?.star || 0) - Number(a?.star || 0));
  }, [game?.threeStars]);

  if (stars.length === 0) return null;

  const awayAbbr = String(game?.away?.abbreviation || "").toUpperCase();
  const homeAbbr = String(game?.home?.abbreviation || "").toUpperCase();
  const awayLogo =
    game?.away?.logo || getTeamLogoUrl("nhl", game?.away?.abbreviation);
  const homeLogo =
    game?.home?.logo || getTeamLogoUrl("nhl", game?.home?.abbreviation);

  const logoForTeam = (abbr) => {
    const teamAbbr = String(abbr || "").toUpperCase();
    if (teamAbbr && teamAbbr === awayAbbr) return awayLogo;
    if (teamAbbr && teamAbbr === homeAbbr) return homeLogo;
    return getTeamLogoUrl("nhl", teamAbbr);
  };

  const colorForTeam = (abbr) => {
    const teamAbbr = String(abbr || "").toUpperCase();
    return NHLService.getTeamColor(teamAbbr, colors.primary);
  };

  return (
    <View
      style={[
        styles.threeStarsCard,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
      ]}
    >
      <View
        style={[
          styles.threeStarsHeaderRow,
          { borderBottomColor: theme.border },
        ]}
      >
        <Text style={[styles.threeStarsHeaderTitle, { color: theme.text }]}>
          Three Stars
        </Text>
      </View>

      {stars.map((entry, idx) => {
        const teamAbbr = String(entry?.teamAbbrev || "").toUpperCase();
        const teamColor = colorForTeam(teamAbbr);
        const logo = logoForTeam(teamAbbr);

        return (
          <View
            key={`three-star-${idx}-${entry?.playerId || "x"}`}
            style={[
              styles.threeStarRow,
              idx < stars.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: theme.border,
              },
            ]}
          >
            <ThreeStarRowGradient
              gradId={`nhlThreeStarGrad-${idx}`}
              teamColor={teamColor}
              theme={theme}
            />

            <View style={styles.threeStarLeftCol}>
              <View
                style={[
                  styles.threeStarHeadshotWrap,
                  { borderColor: teamColor },
                ]}
              >
                <View style={styles.threeStarHeadshotClip}>
                  <Image
                    source={{ uri: entry?.headshot || "" }}
                    style={styles.threeStarHeadshot}
                    contentFit="cover"
                  />
                </View>

                <View
                  style={[
                    styles.threeStarCountBadge,
                    { backgroundColor: theme.surface, borderColor: teamColor },
                  ]}
                >
                  <Ionicons name="star" size={12} color="#f7b500" />
                </View>

                <View
                  style={[
                    styles.threeStarTeamBadge,
                    {
                      borderColor: teamColor,
                      backgroundColor: withAlpha30(teamColor),
                    },
                  ]}
                >
                  <Image
                    source={{ uri: logo }}
                    style={styles.threeStarTeamLogo}
                    contentFit="contain"
                  />
                </View>

                <View
                  style={[
                    styles.threeStarPosBadge,
                    { backgroundColor: theme.surface, borderColor: teamColor },
                  ]}
                >
                  <Text
                    style={[styles.threeStarPosText, { color: theme.text }]}
                  >
                    {String(entry?.position || "-").toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.threeStarMidCol}>
              <Text
                style={[styles.threeStarPlayerName, { color: theme.text }]}
                numberOfLines={1}
              >
                {String(entry?.name || "Unknown")}
              </Text>
              <Text
                style={[
                  styles.threeStarTeamAbbr,
                  { color: theme.textSecondary },
                ]}
                numberOfLines={1}
              >
                {entry?.sweaterNo ? `#${entry.sweaterNo} · ` : ""}
                {teamAbbr || "---"}
              </Text>
            </View>

            {entry?.position === "G" ? (
              <View style={styles.threeStarStatsCol}>
                <View style={styles.threeStarStatItem}>
                  <Text
                    style={[styles.threeStarStatVal, { color: theme.text }]}
                  >
                    {toSafeStatValue(entry?.goalsAgainstAverage)}
                  </Text>
                  <Text
                    style={[
                      styles.threeStarStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    GAA
                  </Text>
                </View>
                <View style={styles.threeStarStatItem}>
                  <Text
                    style={[styles.threeStarStatVal, { color: theme.text }]}
                  >
                    {toSafeStatValue(entry?.savePctg) * 100}%
                  </Text>
                  <Text
                    style={[
                      styles.threeStarStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    SV%
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.threeStarStatsCol}>
                <View style={styles.threeStarStatItem}>
                  <Text
                    style={[styles.threeStarStatVal, { color: theme.text }]}
                  >
                    {toSafeStatValue(entry?.goals)}
                  </Text>
                  <Text
                    style={[
                      styles.threeStarStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    GLS
                  </Text>
                </View>
                <View style={styles.threeStarStatItem}>
                  <Text
                    style={[styles.threeStarStatVal, { color: theme.text }]}
                  >
                    {toSafeStatValue(entry?.assists)}
                  </Text>
                  <Text
                    style={[
                      styles.threeStarStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    AST
                  </Text>
                </View>
                <View style={styles.threeStarStatItem}>
                  <Text
                    style={[styles.threeStarStatVal, { color: theme.text }]}
                  >
                    {toSafeStatValue(entry?.points)}
                  </Text>
                  <Text
                    style={[
                      styles.threeStarStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    PTS
                  </Text>
                </View>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
};

const OfficialsSection = ({ game, theme }) => {
  const referees = Array.isArray(game?.referees) ? game.referees : [];
  const linesmen = Array.isArray(game?.linesmen) ? game.linesmen : [];

  if (referees.length === 0 && linesmen.length === 0) return null;

  const renderOfficial = (name, key) => {
    const split = splitOfficialName(name);
    return (
      <View key={key} style={styles.officialItem}>
        <Text
          style={[styles.officialFirstName, { color: theme.text }]}
          numberOfLines={1}
        >
          {split.first}
        </Text>
        {!!split.last && (
          <Text
            style={[styles.officialLastName, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {split.last}
          </Text>
        )}
      </View>
    );
  };

  return (
    <View
      style={[
        styles.officialsCard,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
      ]}
    >
      <View
        style={[styles.officialsHeaderRow, { borderBottomColor: theme.border }]}
      >
        <Text style={[styles.officialsHeaderTitle, { color: theme.text }]}>
          Officials
        </Text>
      </View>

      <View style={styles.officialsBody}>
        <View style={styles.officialsColumn}>
          <Text
            style={[styles.officialsRoleLabel, { color: theme.textSecondary }]}
          >
            Referees
          </Text>
          <View style={styles.officialsNamesWrap}>
            {referees.map((name, idx) =>
              renderOfficial(name, `ref-${idx}-${String(name)}`),
            )}
          </View>
        </View>

        <View
          style={[
            styles.officialsDivider,
            { backgroundColor: theme.border || "rgba(128,128,128,0.2)" },
          ]}
        />

        <View style={styles.officialsColumn}>
          <Text
            style={[styles.officialsRoleLabel, { color: theme.textSecondary }]}
          >
            Linesmen
          </Text>
          <View style={styles.officialsNamesWrap}>
            {linesmen.map((name, idx) =>
              renderOfficial(name, `line-${idx}-${String(name)}`),
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

const PlaysTabSection = ({ game, theme, colors }) => {
  const [activeType, setActiveType] = useState("ALL");
  const [periodIndex, setPeriodIndex] = useState(0);

  const plays = Array.isArray(game?.plays) ? game.plays : [];
  const playerMetaById =
    game?.playerMetaById && typeof game.playerMetaById === "object"
      ? game.playerMetaById
      : {};
  const playRosterSpots = Array.isArray(game?.playRosterSpots)
    ? game.playRosterSpots
    : [];

  const awayTeam = {
    id: Number(game?.away?.id),
    abbr: String(game?.away?.abbreviation || "AWY").toUpperCase(),
  };
  const homeTeam = {
    id: Number(game?.home?.id),
    abbr: String(game?.home?.abbreviation || "HME").toUpperCase(),
  };

  const teamById = useMemo(
    () => ({
      [awayTeam.id]: awayTeam,
      [homeTeam.id]: homeTeam,
    }),
    [awayTeam.abbr, awayTeam.id, homeTeam.abbr, homeTeam.id],
  );

  const toTypeLabel = (raw) =>
    String(raw || "update")
      .split("-")
      .filter(Boolean)
      .join(" ")
      .toUpperCase();

  const cleanKeyWords = (value) =>
    String(value || "")
      .split("-")
      .filter(Boolean)
      .join(" ");

  const toPeriodChip = (periodNumber) => {
    const p = Number(periodNumber || 0);
    if (!Number.isFinite(p) || p <= 0) return "P?";
    if (p <= 3) return `P${p}`;
    return `OT${p - 3}`;
  };

  const rosterSpotById = useMemo(() => {
    const map = {};
    playRosterSpots.forEach((spot) => {
      const id = Number(spot?.playerId);
      if (Number.isFinite(id)) map[id] = spot;
    });
    return map;
  }, [playRosterSpots]);

  const playerProfile = (playerId, fallback = "") => {
    const id = Number(playerId);
    if (!Number.isFinite(id)) {
      return {
        name: String(fallback || "").trim(),
        firstName: "",
        lastName: "",
        sweaterNumber: null,
        headshot: null,
        position: null,
        teamId: null,
      };
    }

    const roster = rosterSpotById[id] || {};
    const meta = playerMetaById[id] || {};

    const firstName = String(roster?.firstName || "").trim();
    const lastName = String(roster?.lastName || "").trim();
    const fullFromNames = [firstName, lastName].filter(Boolean).join(" ").trim();

    return {
      name: fullFromNames || String(meta?.name || fallback || "").trim(),
      firstName,
      lastName,
      sweaterNumber:
        roster?.sweaterNumber != null
          ? Number(roster.sweaterNumber)
          : meta?.sweaterNumber != null
            ? Number(meta.sweaterNumber)
            : null,
      headshot: roster?.headshot || null,
      position: String(meta?.position || "").trim() || null,
      teamId: Number(roster?.teamId),
    };
  };

  const displayName = (profile, fallback = "") => {
    const first = String(profile?.firstName || "").trim();
    const last = String(profile?.lastName || "").trim();
    if (first && last) return `${first} ${last}`;
    return String(profile?.name || fallback || "").trim();
  };

  const sweaterTag = (profile) =>
    Number.isFinite(Number(profile?.sweaterNumber))
      ? ` (#${Number(profile.sweaterNumber)})`
      : "";

  const ordinalSafe = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return toOrdinal(n);
  };

  const playDetailsText = (play, eventTeam) => {
    const details = play?.details || {};
    const typeKey = String(play?.typeDescKey || "").toLowerCase();
    const teamLabel = eventTeam?.abbr || "GAME";

    if (typeKey === "goal") {
      const scorerProfile = playerProfile(details?.scoringPlayerId, "Scorer");
      const scorer = displayName(scorerProfile, "Scorer");
      const shotType = String(details?.shotType || "").toLowerCase();
      const teamName =
        Number(eventTeam?.id) === awayTeam.id
          ? game?.away?.name || awayTeam.abbr
          : Number(eventTeam?.id) === homeTeam.id
            ? game?.home?.name || homeTeam.abbr
            : teamLabel;
      const seasonTotal = ordinalSafe(details?.scoringPlayerTotal);

      const assistLines = [];
      [1, 2].forEach((idx) => {
        const idKey = idx === 1 ? "assist1PlayerId" : "assist2PlayerId";
        const totalKey = idx === 1 ? "assist1PlayerTotal" : "assist2PlayerTotal";
        const assistProfile = playerProfile(details?.[idKey], "");
        const assistName = displayName(assistProfile, "");
        if (!assistName) return;
        const total = Number(details?.[totalKey]);
        const totalText = Number.isFinite(total) ? ` (${total})` : "";
        assistLines.push(`${assistName}${sweaterTag(assistProfile)}${totalText}`);
      });

      return {
        main: `${scorer}${sweaterTag(scorerProfile)} scores for ${teamName}${shotType ? ` with a ${shotType} shot` : ""}.${seasonTotal ? ` His ${seasonTotal} of the season.` : ""}`,
        sub: assistLines.length > 0 ? `Assists: ${assistLines.join(", ")}` : null,
      };
    }

    if (typeKey === "penalty") {
      const committedByProfile = playerProfile(details?.committedByPlayerId, "Player");
      const committedBy = displayName(committedByProfile, "Player");
      const drawnByProfile = playerProfile(details?.drawnByPlayerId, "");
      const drawnBy = displayName(drawnByProfile, "");
      const desc = cleanKeyWords(details?.descKey || "penalty");
      const duration = Number(details?.duration);
      return {
        main: `${committedBy}${sweaterTag(committedByProfile)} ${Number.isFinite(duration) ? `${duration} minutes` : ""} for ${desc}`.trim(),
        sub: drawnBy ? `Drawn by ${drawnBy}${sweaterTag(drawnByProfile)}` : null,
      };
    }

    if (typeKey === "faceoff") {
      const winnerProfile = playerProfile(details?.winningPlayerId, "Winner");
      const loserProfile = playerProfile(details?.losingPlayerId, "Loser");
      const winner = displayName(winnerProfile, "Winner");
      const loser = displayName(loserProfile, "Loser");
      return {
        main: `${winner}${sweaterTag(winnerProfile)} faceoff won against ${loser}${sweaterTag(loserProfile)}`,
        sub: null,
      };
    }

    if (typeKey === "hit") {
      const hitterProfile = playerProfile(details?.hittingPlayerId, "Player");
      const hitteeProfile = playerProfile(details?.hitteePlayerId, "");
      const hitter = displayName(hitterProfile, "Player");
      const hittee = displayName(hitteeProfile, "");
      return {
        main: `${hitter}${sweaterTag(hitterProfile)} hit ${hittee}${sweaterTag(hitteeProfile)}`,
        sub: null,
      };
    }

    if (typeKey === "shot-on-goal") {
      const shooterProfile = playerProfile(details?.shootingPlayerId, "Player");
      const goalieProfile = playerProfile(details?.goalieInNetId, "Goalie");
      const shooter = displayName(shooterProfile, "Player");
      const goalie = displayName(goalieProfile, "Goalie");
      const shotType = String(details?.shotType || "").toLowerCase();
      return {
        main: `${shooter}${sweaterTag(shooterProfile)} ${shotType ? `${shotType} ` : ""}shot saved by ${goalie}${sweaterTag(goalieProfile)}`,
        sub: null,
      };
    }

    if (typeKey === "missed-shot") {
      const shooterProfile = playerProfile(details?.shootingPlayerId, "Player");
      const shooter = displayName(shooterProfile, "Player");
      const shotType = String(details?.shotType || "").toLowerCase();
      const reason = cleanKeyWords(details?.reason || "");
      return {
        main: `${shooter}${sweaterTag(shooterProfile)} ${shotType ? `${shotType} ` : ""}shot${reason ? ` ${reason}` : ""}`,
        sub: null,
      };
    }

    if (typeKey === "blocked-shot") {
      const shooterProfile = playerProfile(details?.shootingPlayerId, "Shooter");
      const shooter = displayName(shooterProfile, "Shooter");
      const reason = cleanKeyWords(details?.reason || "");
      return {
        main: `${shooter}${sweaterTag(shooterProfile)}${reason ? ` ${reason}` : ""}`,
        sub: null,
      };
    }

    if (typeKey === "takeaway") {
      const pProfile = playerProfile(details?.playerId, "Player");
      const p = displayName(pProfile, "Player");
      return {
        main: `Takeaway by ${p}${sweaterTag(pProfile)}`,
        sub: null,
      };
    }

    if (typeKey === "giveaway") {
      const pProfile = playerProfile(details?.playerId, "Player");
      const p = displayName(pProfile, "Player");
      return {
        main: `Giveaway by ${p}${sweaterTag(pProfile)}`,
        sub: null,
      };
    }

    if (typeKey === "stoppage") {
      const reason = String(details?.reason || "stoppage")
        .replace(/-/g, " ")
        .toUpperCase();
      const secondary = String(details?.secondaryReason || "")
        .replace(/-/g, " ")
        .toUpperCase();
      return { main: reason, sub: secondary || null };
    }

    return {
      main: `${teamLabel} - ${toTypeLabel(typeKey)}`,
      sub: null,
    };
  };

  const preparedPlays = useMemo(() => {
    const rows = plays
      .map((play, idx) => {
        const period = Number(play?.periodDescriptor?.number || 0);
        const periodType = String(
          play?.periodDescriptor?.periodType || "",
        ).toUpperCase();
        const remainingSecs = parseClockSecs(play?.timeRemaining);
        const periodLengthSecs = periodType === "OT" ? 5 * 60 : 20 * 60;
        const elapsedSecs = Number.isFinite(remainingSecs)
          ? Math.max(0, periodLengthSecs - remainingSecs)
          : 0;
        return {
          play,
          idx,
          period,
          elapsedSecs,
          sortKey: period * 100000 + elapsedSecs * 10 + idx,
        };
      })
      .sort((a, b) => a.sortKey - b.sortKey);

    let awayScore = 0;
    let homeScore = 0;
    const preparedGoalCounts = {};

    const annotated = rows.map((row) => {
      const play = row.play;
      const details = play?.details || {};
      const typeKey = String(play?.typeDescKey || "").toLowerCase();
      const eventOwnerTeamId = Number(details?.eventOwnerTeamId);
      const eventTeam = teamById[eventOwnerTeamId] || null;

      const directAway = Number(details?.awayScore);
      const directHome = Number(details?.homeScore);
      const hasDirectScore =
        Number.isFinite(directAway) && Number.isFinite(directHome);
      const scoreBefore = { away: awayScore, home: homeScore };

      if (hasDirectScore) {
        awayScore = directAway;
        homeScore = directHome;
      } else if (typeKey === "goal") {
        if (eventOwnerTeamId === awayTeam.id) awayScore += 1;
        else if (eventOwnerTeamId === homeTeam.id) homeScore += 1;
      }

      const teamColor = eventTeam
        ? NHLService.getTeamColor(eventTeam.abbr, colors.primary)
        : colors.primary;
      const borderColor = eventTeam
        ? NHLService.getTeamColor(eventTeam.abbr, theme.border)
        : theme.border;

      const detailText = playDetailsText(play, eventTeam);

      let scoringSide = null;
      if (typeKey === "goal") {
        if (awayScore > scoreBefore.away) scoringSide = "away";
        else if (homeScore > scoreBefore.home) scoringSide = "home";
        else if (eventOwnerTeamId === awayTeam.id) scoringSide = "away";
        else if (eventOwnerTeamId === homeTeam.id) scoringSide = "home";
      }

      const scoringPlayerId = Number(details?.scoringPlayerId);
      const scoringPlayerProfile = playerProfile(scoringPlayerId, "Scorer");
      const scoringPlayerName = displayName(scoringPlayerProfile, "Scorer");

      if (Number.isFinite(scoringPlayerId) && !preparedGoalCounts[scoringPlayerId]) {
        preparedGoalCounts[scoringPlayerId] = 0;
      }
      if (typeKey === "goal" && Number.isFinite(scoringPlayerId)) {
        preparedGoalCounts[scoringPlayerId] += 1;
      }

      return {
        key: `${row.idx}-${typeKey}-${row.period}`,
        typeKey,
        typeLabel: toTypeLabel(typeKey),
        period: row.period,
        periodLabel: toPeriodChip(row.period),
        timeRemaining: String(play?.timeRemaining || "--:--"),
        scoreBefore,
        scoreAt: { away: awayScore, home: homeScore },
        scoringSide,
        isGoal: typeKey === "goal",
        teamColor,
        borderColor,
        detailMain: detailText.main,
        detailSub: detailText.sub,
        scorerProfile: scoringPlayerProfile,
        scorerName: scoringPlayerName,
        scorerGoalsInGame:
          typeKey === "goal" && Number.isFinite(scoringPlayerId)
            ? preparedGoalCounts[scoringPlayerId]
            : 0,
        teamLogo:
          Number(eventTeam?.id) === awayTeam.id
            ? game?.away?.logo || null
            : Number(eventTeam?.id) === homeTeam.id
              ? game?.home?.logo || null
              : null,
      };
    });

    return annotated.reverse();
  }, [awayTeam.id, colors.primary, game?.away?.logo, game?.away?.name, game?.home?.logo, game?.home?.name, homeTeam.id, playerMetaById, plays, rosterSpotById, teamById, theme.border]);

  const filterTypes = useMemo(() => {
    const unique = new Set(preparedPlays.map((row) => row.typeLabel));
    const ordered = ["ALL"];
    const preferred = [
      "GOAL",
      "PENALTY",
      "SHOT ON GOAL",
      "MISSED SHOT",
      "BLOCKED SHOT",
      "HIT",
      "FACEOFF",
      "STOPPAGE",
      "TAKEAWAY",
      "GIVEAWAY",
    ];

    preferred.forEach((type) => {
      if (unique.has(type)) ordered.push(type);
    });
    unique.forEach((type) => {
      if (!ordered.includes(type)) ordered.push(type);
    });

    return ordered;
  }, [preparedPlays]);

  useEffect(() => {
    if (!filterTypes.includes(activeType)) {
      setActiveType("ALL");
    }
  }, [activeType, filterTypes]);

  const periodOptions = useMemo(() => {
    const unique = [
      ...new Set(
        preparedPlays
          .map((row) => Number(row.period))
          .filter((p) => Number.isFinite(p) && p > 0),
      ),
    ];
    return unique.sort((a, b) => b - a);
  }, [preparedPlays]);

  useEffect(() => {
    if (periodOptions.length === 0) {
      setPeriodIndex(0);
      return;
    }
    setPeriodIndex((prev) => {
      if (prev < 0 || prev >= periodOptions.length) {
        return 0;
      }
      return prev;
    });
  }, [periodOptions]);

  const selectedPeriod = periodOptions[periodIndex] || null;

  const visibleRows = useMemo(() => {
    const byType =
      activeType === "ALL"
        ? preparedPlays
        : preparedPlays.filter((row) => row.typeLabel === activeType);
    if (!selectedPeriod) return byType;
    return byType.filter((row) => row.period === selectedPeriod);
  }, [activeType, preparedPlays, selectedPeriod]);

  const renderScore = (row, textColor) => (
    <Text style={[styles.playsScoreText, { color: textColor }]}>
      <Text
        style={
          row.isGoal && row.scoringSide === "away"
            ? styles.playsScoreNumBold
            : styles.playsScoreNum
        }
      >
        {row.scoreAt.away}
      </Text>
      {" - "}
      <Text
        style={
          row.isGoal && row.scoringSide === "home"
            ? styles.playsScoreNumBold
            : styles.playsScoreNum
        }
      >
        {row.scoreAt.home}
      </Text>
    </Text>
  );

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

      <View style={styles.playsCardsWrap}>
        {visibleRows.map((row) => {
          const headerColor = row.isGoal ? "#FFFFFF" : theme.text;
          const bodyColor = row.isGoal ? "#FFFFFF" : theme.textSecondary;

          return (
            <View key={row.key} style={styles.playsRowWrap}>
              <View style={styles.playsTimeCol}>
                <Text style={[styles.playsMinuteText, { color: theme.text }]}>
                  {row.timeRemaining}
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

              <View
                style={[
                  styles.playsCard,
                  {
                    borderColor: row.borderColor,
                    backgroundColor: row.isGoal
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

                {!!row.detailMain && (
                  <Text
                    style={[styles.playsCardMainText, { color: bodyColor }]}
                  >
                    {row.detailMain}
                  </Text>
                )}

                {!!row.detailSub && (
                  <Text
                    style={[styles.playsCardSubText, { color: bodyColor }]}
                    numberOfLines={2}
                  >
                    {row.detailSub}
                  </Text>
                )}

                {row.isGoal && (
                  <View style={styles.playsGoalPlayerRow}>
                    <View style={styles.playsGoalAvatarWrap}>
                      {row.scorerProfile?.headshot ? (
                        <Image
                          source={{ uri: row.scorerProfile.headshot }}
                          style={styles.playsGoalAvatar}
                          contentFit="cover"
                        />
                      ) : (
                        <View
                          style={[
                            styles.playsGoalAvatar,
                            styles.playsGoalAvatarFallback,
                          ]}
                        >
                          <Text style={styles.playsGoalAvatarFallbackText}>
                            {String(row.scorerName || "P")
                              .split(" ")
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((part) => part[0])
                              .join("")
                              .toUpperCase()}
                          </Text>
                        </View>
                      )}

                      {!!row.teamLogo && (
                        <View style={styles.playsGoalTeamBadge}>
                          <Image
                            source={{ uri: row.teamLogo }}
                            style={styles.playsGoalTeamLogo}
                            contentFit="contain"
                          />
                        </View>
                      )}

                      {!!row.scorerProfile?.position && (
                        <View style={styles.playsGoalPosBadge}>
                          <Text style={styles.playsGoalPosText}>
                            {row.scorerProfile.position}
                          </Text>
                        </View>
                      )}

                      <View style={styles.playsGoalCountBadge}>
                        <FontAwesome6 name="hockey-puck" size={9} color="#FFFFFF" />
                        <Text style={styles.playsGoalCountText}>
                          {row.scorerGoalsInGame}
                        </Text>
                      </View>
                    </View>

                    <Text
                      style={[styles.playsGoalScorerName, { color: bodyColor }]}
                      numberOfLines={1}
                    >
                      {row.scorerName}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.playsPagerRow}>
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

        <Text style={[styles.playsPagerLabel, { color: theme.textSecondary }]}>
          {selectedPeriod ? toPeriodChip(selectedPeriod) : "P?"}
        </Text>

        <TouchableOpacity
          activeOpacity={0.8}
          disabled={periodIndex >= periodOptions.length - 1}
          onPress={() =>
            setPeriodIndex((idx) => Math.min(periodOptions.length - 1, idx + 1))
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
      </View>
    </View>
  );
};

const ShiftsTabSection = ({ game, theme, colors, getTeamLogoUrl }) => {
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [selectedPlayerKey, setSelectedPlayerKey] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [openPicker, setOpenPicker] = useState(null);

  const shiftsByTeam =
    game?.shifts && typeof game.shifts === "object" ? game.shifts : {};

  const PX_PER_MIN = 18;
  const NAME_COL_W = 128;

  const getPeriodStartMin = (periodNumber) => {
    const p = Number(periodNumber || 0);
    if (!Number.isFinite(p) || p <= 0) return 0;
    if (p <= 3) return (p - 1) * 20;
    return 60 + (p - 4) * 5;
  };

  const getPeriodLengthMin = (periodNumber) => {
    const p = Number(periodNumber || 0);
    if (!Number.isFinite(p) || p <= 0) return 20;
    return p <= 3 ? 20 : 5;
  };

  const parseShiftClockToMinutes = (clock) => {
    const secs = parseClockSecs(clock);
    if (!Number.isFinite(secs) || secs < 0) return null;
    return secs / 60;
  };

  const formatAxisLabel = (minuteValue) => {
    const totalSecs = Math.max(0, Math.round((Number(minuteValue) || 0) * 60));
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const teamOptions = useMemo(() => {
    const ids = Object.keys(shiftsByTeam);
    return ids
      .map((id) => {
        const isAway = String(game?.away?.id || "") === String(id);
        const isHome = String(game?.home?.id || "") === String(id);
        const abbr = isAway
          ? game?.away?.abbreviation || "AWY"
          : isHome
            ? game?.home?.abbreviation || "HME"
            : `T${id}`;
        const name = isAway
          ? game?.away?.name || abbr
          : isHome
            ? game?.home?.name || abbr
            : abbr;
        return {
          id: String(id),
          abbr,
          name,
          logo:
            (isAway ? game?.away?.logo : isHome ? game?.home?.logo : null) ||
            getTeamLogoUrl("nhl", abbr),
          color: NHLService.getTeamColor(abbr, colors.primary),
        };
      })
      .sort((a, b) => {
        if (String(a.id) === String(game?.away?.id || "")) return -1;
        if (String(b.id) === String(game?.away?.id || "")) return 1;
        if (String(a.id) === String(game?.home?.id || "")) return -1;
        if (String(b.id) === String(game?.home?.id || "")) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [colors.primary, game, getTeamLogoUrl, shiftsByTeam]);

  const playerSections = useMemo(() => {
    const teamList = selectedTeamId
      ? teamOptions.filter((team) => team.id === String(selectedTeamId))
      : teamOptions;

    return teamList.map((team) => {
      const playersObj = shiftsByTeam?.[team.id] || {};
      const names = Object.keys(playersObj || {})
        .map((n) => String(n || "").trim())
        .filter(Boolean);

      const seen = new Set();
      const deduped = [];
      names.forEach((name) => {
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        deduped.push(name);
      });

      deduped.sort((a, b) => {
        const aFirst = a.split(/\s+/)[0] || a;
        const bFirst = b.split(/\s+/)[0] || b;
        const cmpFirst = aFirst.localeCompare(bFirst);
        if (cmpFirst !== 0) return cmpFirst;
        return a.localeCompare(b);
      });

      return {
        team,
        players: deduped.map((name) => ({
          key: `${team.id}::${name}`,
          name,
          team,
        })),
      };
    });
  }, [selectedTeamId, shiftsByTeam, teamOptions]);

  const periodOptions = useMemo(() => {
    const periods = new Set();
    Object.values(shiftsByTeam).forEach((teamObj) => {
      Object.values(teamObj || {}).forEach((playerShifts) => {
        (Array.isArray(playerShifts) ? playerShifts : []).forEach((shift) => {
          const p = Number(shift?.period ?? shift?.periodNumber ?? 0);
          if (Number.isFinite(p) && p > 0) periods.add(p);
        });
      });
    });
    return Array.from(periods).sort((a, b) => a - b);
  }, [shiftsByTeam]);

  const selectedTeam =
    teamOptions.find((team) => team.id === String(selectedTeamId)) || null;
  const selectedPlayer = useMemo(() => {
    if (!selectedPlayerKey) return null;
    for (const section of playerSections) {
      const found = section.players.find(
        (player) => player.key === selectedPlayerKey,
      );
      if (found) return found;
    }
    return null;
  }, [playerSections, selectedPlayerKey]);

  const closePicker = () => setOpenPicker(null);

  const periodWindow = useMemo(() => {
    if (!selectedPeriod) return null;
    const startMin = getPeriodStartMin(selectedPeriod);
    const endMin = startMin + getPeriodLengthMin(selectedPeriod);
    return { startMin, endMin };
  }, [selectedPeriod]);

  const chartSections = useMemo(() => {
    const sections = [];
    playerSections.forEach((section) => {
      const rows = section.players
        .filter(
          (player) => !selectedPlayerKey || player.key === selectedPlayerKey,
        )
        .map((player) => {
          const rawShifts = Array.isArray(
            shiftsByTeam?.[section.team.id]?.[player.name],
          )
            ? shiftsByTeam[section.team.id][player.name]
            : [];

          const seenShift = new Set();
          const bars = [];

          rawShifts.forEach((shift) => {
            const period = Number(shift?.period ?? shift?.periodNumber ?? 0);
            if (!period || (selectedPeriod && period !== selectedPeriod))
              return;

            const startClock = String(shift?.startTime || shift?.start || "");
            const endClock = String(shift?.endTime || shift?.end || "");
            const dedupeKey = `${period}|${startClock}|${endClock}`;
            if (seenShift.has(dedupeKey)) return;
            seenShift.add(dedupeKey);

            const startInPeriod = parseShiftClockToMinutes(startClock);
            const endInPeriod = parseShiftClockToMinutes(endClock);
            if (startInPeriod === null || endInPeriod === null) return;

            const baseMin = getPeriodStartMin(period);
            let startMin = baseMin + startInPeriod;
            let endMin = baseMin + endInPeriod;
            if (endMin < startMin) {
              const tmp = startMin;
              startMin = endMin;
              endMin = tmp;
            }

            if (periodWindow) {
              if (
                endMin < periodWindow.startMin ||
                startMin > periodWindow.endMin
              ) {
                return;
              }
            }

            bars.push({
              period,
              startMin,
              endMin,
            });
          });

          bars.sort((a, b) => a.startMin - b.startMin);
          return {
            type: "player",
            team: section.team,
            player,
            bars,
          };
        })
        .filter((row) => row.bars.length > 0);

      rows.sort((a, b) => {
        const aFirst = a.bars[0];
        const bFirst = b.bars[0];
        const startDiff = aFirst.startMin - bFirst.startMin;
        if (startDiff !== 0) return startDiff;

        const aDuration = aFirst.endMin - aFirst.startMin;
        const bDuration = bFirst.endMin - bFirst.startMin;
        const durationDiff = bDuration - aDuration;
        if (durationDiff !== 0) return durationDiff;

        return a.player.name.localeCompare(b.player.name);
      });

      if (rows.length > 0) {
        sections.push({
          type: "team",
          team: section.team,
          rows,
        });
      }
    });

    return sections;
  }, [
    periodWindow,
    playerSections,
    selectedPeriod,
    selectedPlayerKey,
    shiftsByTeam,
  ]);

  const chartRows = useMemo(() => {
    const rows = [];
    chartSections.forEach((section) => {
      rows.push({ type: "team", team: section.team });
      section.rows.forEach((playerRow) => rows.push(playerRow));
    });
    return rows;
  }, [chartSections]);

  const timelineBounds = useMemo(() => {
    let minStart = periodWindow ? periodWindow.startMin : 0;
    let maxEnd = periodWindow ? periodWindow.endMin : 65;

    chartRows.forEach((row) => {
      if (row.type !== "player") return;
      row.bars.forEach((bar) => {
        minStart = Math.min(minStart, bar.startMin);
        maxEnd = Math.max(maxEnd, bar.endMin);
      });
    });

    if (!periodWindow) {
      maxEnd = Math.max(65, Math.ceil(maxEnd / 5) * 5);
      minStart = 0;
    }

    return { minStart, maxEnd };
  }, [chartRows, periodWindow]);

  const axisTicks = useMemo(() => {
    const ticks = [];
    const { minStart, maxEnd } = timelineBounds;
    const first = Math.floor(minStart / 5) * 5;
    const last = Math.ceil(maxEnd / 5) * 5;
    for (let t = first; t <= last; t += 5) {
      ticks.push(t);
    }
    return ticks;
  }, [timelineBounds]);

  const timelineWidth = Math.max(
    420,
    (timelineBounds.maxEnd - timelineBounds.minStart) * PX_PER_MIN,
  );

  return (
    <View style={styles.shiftsSectionWrap}>
      <View style={styles.shiftsFiltersRow}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setOpenPicker("team")}
          style={[
            styles.shiftsFilterBtn,
            {
              borderColor: selectedTeam?.color || theme.border,
              backgroundColor: theme.surface,
            },
          ]}
        >
          {selectedTeam?.logo ? (
            <Image
              source={{ uri: selectedTeam.logo }}
              style={styles.shiftsFilterLogo}
              contentFit="contain"
            />
          ) : null}
          <Text
            style={[styles.shiftsFilterBtnText, { color: theme.text }]}
            numberOfLines={1}
          >
            {selectedTeam ? selectedTeam.abbr : "Team"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setOpenPicker("player")}
          style={[
            styles.shiftsFilterBtn,
            styles.shiftsFilterBtnPlayer,
            {
              borderColor: selectedPlayer?.team?.color || theme.border,
              backgroundColor: theme.surface,
            },
          ]}
        >
          <Text
            style={[styles.shiftsFilterBtnText, { color: theme.text }]}
            numberOfLines={1}
          >
            {selectedPlayer ? selectedPlayer.name : "Player"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setOpenPicker("period")}
          style={[
            styles.shiftsFilterBtn,
            {
              borderColor: theme.border,
              backgroundColor: theme.surface,
            },
          ]}
        >
          <Text
            style={[styles.shiftsFilterBtnText, { color: theme.text }]}
            numberOfLines={1}
          >
            {selectedPeriod
              ? selectedPeriod > 3
                ? `OT${selectedPeriod - 3}`
                : `P${selectedPeriod}`
              : "Period"}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal
        transparent
        visible={openPicker === "team"}
        animationType="fade"
        onRequestClose={closePicker}
      >
        <TouchableOpacity
          style={styles.shiftsPickerOverlay}
          activeOpacity={1}
          onPress={closePicker}
        >
          <View
            style={[
              styles.shiftsPickerCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={styles.shiftsPickerItem}
                onPress={() => {
                  setSelectedTeamId(null);
                  setSelectedPlayerKey(null);
                  closePicker();
                }}
              >
                <Text
                  style={[styles.shiftsPickerItemText, { color: theme.text }]}
                >
                  None
                </Text>
              </TouchableOpacity>

              {teamOptions.map((team) => (
                <TouchableOpacity
                  key={`team-${team.id}`}
                  style={styles.shiftsPickerItem}
                  onPress={() => {
                    setSelectedTeamId(team.id);
                    setSelectedPlayerKey(null);
                    closePicker();
                  }}
                >
                  <Image
                    source={{ uri: team.logo }}
                    style={styles.shiftsPickerLogo}
                    contentFit="contain"
                  />
                  <Text
                    style={[styles.shiftsPickerItemText, { color: theme.text }]}
                  >
                    {team.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        transparent
        visible={openPicker === "player"}
        animationType="fade"
        onRequestClose={closePicker}
      >
        <TouchableOpacity
          style={styles.shiftsPickerOverlay}
          activeOpacity={1}
          onPress={closePicker}
        >
          <View
            style={[
              styles.shiftsPickerCardLarge,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={styles.shiftsPickerItem}
                onPress={() => {
                  setSelectedPlayerKey(null);
                  closePicker();
                }}
              >
                <Text
                  style={[styles.shiftsPickerItemText, { color: theme.text }]}
                >
                  None
                </Text>
              </TouchableOpacity>

              {playerSections.map((section) => (
                <View
                  key={`players-${section.team.id}`}
                  style={styles.shiftsPickerGroup}
                >
                  <View style={styles.shiftsPickerGroupHeader}>
                    <Image
                      source={{ uri: section.team.logo }}
                      style={styles.shiftsPickerLogo}
                      contentFit="contain"
                    />
                    <Text
                      style={[
                        styles.shiftsPickerGroupTitle,
                        { color: section.team.color },
                      ]}
                    >
                      {section.team.name}
                    </Text>
                  </View>

                  {section.players.map((player) => (
                    <TouchableOpacity
                      key={player.key}
                      style={styles.shiftsPickerItem}
                      onPress={() => {
                        setSelectedTeamId(player.team.id);
                        setSelectedPlayerKey(player.key);
                        closePicker();
                      }}
                    >
                      <Text
                        style={[
                          styles.shiftsPickerItemText,
                          { color: theme.text },
                        ]}
                      >
                        {player.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        transparent
        visible={openPicker === "period"}
        animationType="fade"
        onRequestClose={closePicker}
      >
        <TouchableOpacity
          style={styles.shiftsPickerOverlay}
          activeOpacity={1}
          onPress={closePicker}
        >
          <View
            style={[
              styles.shiftsPickerCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={styles.shiftsPickerItem}
                onPress={() => {
                  setSelectedPeriod(null);
                  closePicker();
                }}
              >
                <Text
                  style={[styles.shiftsPickerItemText, { color: theme.text }]}
                >
                  None
                </Text>
              </TouchableOpacity>

              {periodOptions.map((period) => (
                <TouchableOpacity
                  key={`period-${period}`}
                  style={styles.shiftsPickerItem}
                  onPress={() => {
                    setSelectedPeriod(period);
                    closePicker();
                  }}
                >
                  <Text
                    style={[styles.shiftsPickerItemText, { color: theme.text }]}
                  >
                    {period > 3 ? `Overtime ${period - 3}` : `Period ${period}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <View
        style={[
          styles.shiftsChartCard,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {chartRows.length === 0 ? (
          <View style={styles.shiftsEmptyWrap}>
            <Text
              style={[styles.shiftsEmptyText, { color: theme.textSecondary }]}
            >
              No shifts found for the selected filters.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.shiftsChartVerticalScroll}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            <View style={styles.shiftsChartBodyRow}>
              <View
                style={[
                  styles.shiftsNamesColumn,
                  { width: NAME_COL_W, borderRightColor: theme.border },
                ]}
              >
                <View
                  style={[
                    styles.shiftsAxisTopPad,
                    { borderBottomColor: theme.border },
                  ]}
                />

                {chartRows.map((row, idx) =>
                  row.type === "team" ? (
                    <View
                      key={`name-team-${idx}`}
                      style={styles.shiftsTeamRowName}
                    >
                      <Text
                        style={[
                          styles.shiftsTeamLabel,
                          { color: row.team.color },
                        ]}
                        numberOfLines={1}
                      >
                        {row.team.name}
                      </Text>
                    </View>
                  ) : (
                    <View
                      key={`name-player-${row.player.key}`}
                      style={[
                        styles.shiftsPlayerNameRow,
                        { borderBottomColor: theme.border },
                      ]}
                    >
                      <Text
                        style={[
                          styles.shiftsPlayerNameText,
                          { color: theme.text },
                        ]}
                        numberOfLines={1}
                      >
                        {row.player.name}
                      </Text>
                    </View>
                  ),
                )}
              </View>

              <ScrollView
                horizontal
                bounces={false}
                showsHorizontalScrollIndicator
                contentContainerStyle={{ width: timelineWidth }}
              >
                <View style={{ width: timelineWidth }}>
                  <View
                    style={[
                      styles.shiftsAxisTopPad,
                      { borderBottomColor: theme.border },
                    ]}
                  >
                    {axisTicks.map((tick) => {
                      const left =
                        (tick - timelineBounds.minStart) * PX_PER_MIN;
                      return (
                        <Text
                          key={`top-tick-${tick}`}
                          style={[
                            styles.shiftsAxisTopLabel,
                            {
                              color: theme.textTertiary,
                              left,
                            },
                          ]}
                        >
                          {formatAxisLabel(tick)}
                        </Text>
                      );
                    })}
                  </View>

                  {chartRows.map((row, idx) =>
                    row.type === "team" ? (
                      <View
                        key={`time-team-${idx}`}
                        style={styles.shiftsTeamRowTimeline}
                      >
                        <View
                          style={[
                            styles.shiftsTeamDivider,
                            { backgroundColor: row.team.color },
                          ]}
                        />
                      </View>
                    ) : (
                      <View
                        key={`time-player-${row.player.key}`}
                        style={[
                          styles.shiftsPlayerTimelineRow,
                          { borderBottomColor: theme.border },
                        ]}
                      >
                        {axisTicks.map((tick) => {
                          const left =
                            (tick - timelineBounds.minStart) * PX_PER_MIN;
                          return (
                            <View
                              key={`grid-${row.player.key}-${tick}`}
                              style={[
                                styles.shiftsGridLine,
                                {
                                  left,
                                  backgroundColor: theme.border,
                                },
                              ]}
                            />
                          );
                        })}

                        {row.bars.map((bar, barIdx) => {
                          const left =
                            (bar.startMin - timelineBounds.minStart) *
                            PX_PER_MIN;
                          const width = Math.max(
                            2,
                            (bar.endMin - bar.startMin) * PX_PER_MIN,
                          );
                          return (
                            <View
                              key={`bar-${row.player.key}-${barIdx}`}
                              style={[
                                styles.shiftsBar,
                                {
                                  left,
                                  width,
                                  backgroundColor: row.team.color,
                                },
                              ]}
                            />
                          );
                        })}
                      </View>
                    ),
                  )}

                  <View style={styles.shiftsAxisBottomPad}>
                    {axisTicks.map((tick) => {
                      const left =
                        (tick - timelineBounds.minStart) * PX_PER_MIN;
                      return (
                        <Text
                          key={`bottom-tick-${tick}`}
                          style={[
                            styles.shiftsAxisBottomLabel,
                            {
                              color: theme.textTertiary,
                              left,
                            },
                          ]}
                        >
                          {formatAxisLabel(tick)}
                        </Text>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>
            </View>
          </ScrollView>
        )}
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
              <LinescoreTable game={liveGame} theme={theme} colors={colors} />
              <EventsSection game={liveGame} theme={theme} colors={colors} />
              <ThreeStarsSection
                game={liveGame}
                theme={theme}
                colors={colors}
                getTeamLogoUrl={getTeamLogoUrl}
              />
              <OfficialsSection game={liveGame} theme={theme} />
            </>
          )}
          {activeTab === "Shifts" && (
            <ShiftsTabSection
              game={liveGame}
              theme={theme}
              colors={colors}
              getTeamLogoUrl={getTeamLogoUrl}
            />
          )}
          {activeTab === "Plays" && (
            <PlaysTabSection game={liveGame} theme={theme} colors={colors} />
          )}
          {activeTab !== "Main" &&
            (activeTab !== "Shifts" && activeTab !== "Plays" ? (
              <View style={styles.comingSoon}>
                <Text
                  style={[
                    styles.comingSoonText,
                    { color: theme.textSecondary },
                  ]}
                >
                  No data yet
                </Text>
              </View>
            ) : null)}
        </View>
      </Animated.ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingBottom: 52 },
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
  linescoreCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    overflow: "hidden",
  },
  linescoreHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  linescoreHeaderTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
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
  linescorePeriodNum: {
    fontSize: 11,
    fontWeight: "600",
  },
  linescoreRunsText: {
    fontSize: 13,
    fontWeight: "700",
  },
  linescoreTotalsSection: {
    borderLeftWidth: 1,
    flexDirection: "column",
  },
  linescoreTotalsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
  },
  linescoreTotalHeader: {
    fontSize: 11,
    fontWeight: "700",
  },
  linescoreTotalVal: {
    fontSize: 13,
    fontWeight: "700",
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
    marginBottom: -18,
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
  threeStarsCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  threeStarsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  threeStarsHeaderTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  threeStarRow: {
    minHeight: 92,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  threeStarLeftCol: {
    width: 70,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  threeStarHeadshotWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    overflow: "visible",
    borderWidth: 1.5,
    backgroundColor: "transparent",
    position: "relative",
  },
  threeStarHeadshotClip: {
    width: "100%",
    height: "100%",
    borderRadius: 31,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  threeStarHeadshot: {
    width: "100%",
    height: "100%",
  },
  threeStarCountBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  threeStarTeamBadge: {
    position: "absolute",
    left: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.94)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  threeStarTeamLogo: {
    width: 25,
    height: 25,
  },
  threeStarPosBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.16)",
  },
  threeStarPosText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  threeStarMidCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  threeStarPlayerName: {
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 24,
  },
  threeStarTeamAbbr: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  threeStarStatsCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  threeStarStatItem: {
    alignItems: "center",
    minWidth: 30,
  },
  threeStarStatVal: {
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 20,
  },
  threeStarStatLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.35,
  },
  officialsCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  officialsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  officialsHeaderTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  officialsBody: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  officialsColumn: {
    flex: 1,
  },
  officialsDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
  },
  officialsRoleLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  officialsNamesWrap: {
    gap: 10,
  },
  officialItem: {
    alignItems: "flex-start",
  },
  officialFirstName: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  officialLastName: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 17,
  },
  playsSectionWrap: {
    paddingTop: 12,
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
  playsPagerRow: {
    marginTop: 8,
    marginHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  playsCardSubText: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "500",
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
    right: -3,
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
    width: 15,
    height: 15,
  },
  playsGoalPosBadge: {
    position: "absolute",
    left: -2,
    bottom: -3,
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  playsGoalPosText: {
    color: "#FFFFFF",
    fontSize: 8,
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
  playsGoalScorerName: {
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
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
  shiftsSectionWrap: {
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  shiftsFiltersRow: {
    flexDirection: "row",
    gap: 8,
  },
  shiftsFilterBtn: {
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flex: 1,
  },
  shiftsFilterBtnPlayer: {
    flex: 1.5,
  },
  shiftsFilterBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  shiftsFilterLogo: {
    width: 26,
    height: 18,
  },
  shiftsPickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.32)",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  shiftsPickerCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: "58%",
    overflow: "hidden",
  },
  shiftsPickerCardLarge: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: "76%",
    overflow: "hidden",
  },
  shiftsPickerGroup: {
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.2)",
  },
  shiftsPickerGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  shiftsPickerGroupTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  shiftsPickerItem: {
    minHeight: 40,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  shiftsPickerItemText: {
    fontSize: 14,
    fontWeight: "600",
  },
  shiftsPickerLogo: {
    width: 26,
    height: 18,
  },
  shiftsChartCard: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  shiftsChartVerticalScroll: {
    maxHeight: 520,
  },
  shiftsChartBodyRow: {
    flexDirection: "row",
  },
  shiftsNamesColumn: {
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  shiftsAxisTopPad: {
    height: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    position: "relative",
  },
  shiftsAxisTopLabel: {
    position: "absolute",
    top: 4,
    marginLeft: -16,
    fontSize: 10,
    fontWeight: "600",
  },
  shiftsTeamRowName: {
    height: 16,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  shiftsTeamLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  shiftsPlayerNameRow: {
    height: 22,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  shiftsPlayerNameText: {
    fontSize: 11,
    fontWeight: "500",
  },
  shiftsTeamRowTimeline: {
    height: 16,
    justifyContent: "center",
  },
  shiftsTeamDivider: {
    height: 1.5,
    width: "100%",
  },
  shiftsPlayerTimelineRow: {
    height: 22,
    borderBottomWidth: StyleSheet.hairlineWidth,
    position: "relative",
  },
  shiftsGridLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    opacity: 0.75,
  },
  shiftsBar: {
    position: "absolute",
    height: 10,
    top: 6,
    borderRadius: 1,
  },
  shiftsAxisBottomPad: {
    height: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    position: "relative",
  },
  shiftsAxisBottomLabel: {
    position: "absolute",
    top: 5,
    marginLeft: -16,
    fontSize: 10,
    fontWeight: "600",
  },
  shiftsEmptyWrap: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  shiftsEmptyText: {
    fontSize: 13,
    textAlign: "center",
    fontWeight: "500",
  },
});

export default NHLGameDetailsScreen;

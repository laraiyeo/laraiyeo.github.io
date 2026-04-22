import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Dimensions,
  Animated,
  Modal,
  PanResponder,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import * as Sharing from "expo-sharing";
import ViewShot from "react-native-view-shot";
import { WebView } from "react-native-webview";
import {
  FontAwesome6,
  MaterialIcons,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  G,
  Rect,
  Circle,
  Line,
} from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import ChatComponent from "../../components/ChatComponent";
import { useGamePresence } from "../../hooks/useGamePresence";
import useIsLoggedIn from "../../hooks/useIsLoggedIn";
import { useTheme } from "../../context/ThemeContext";
import { NHLService } from "../../services/NHLService";
import { useStreamingAccess } from "../../utils/streamingUtils";

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
  record,
  theme,
  onPress,
  showPowerPlay = false,
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
      <View style={styles.teamNameBlock}>
        <View style={styles.teamNamePowerPlayRow}>
          <Text
            style={[
              styles.teamName,
              { color: isLoser ? theme.textSecondary : theme.text },
            ]}
            numberOfLines={2}
          >
            {team?.name || team?.abbreviation || ""}
          </Text>

          {showPowerPlay ? (
            <Text
              style={[
                styles.teamPowerPlayText,
                { color: theme.error || "#D32F2F" },
              ]}
            >
              (PP)
            </Text>
          ) : null}
        </View>

        {!!String(record || "").trim() && (
          <Text style={[styles.teamRecord, { color: theme.textTertiary }]}>
            {String(record || "").trim()}
          </Text>
        )}
      </View>
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

const TABS = ["Main", "Away", "Home", "Stats", "Plays", "Shifts", "Series"];
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

const getNhlGamePollingPlan = (game, nowMs = Date.now()) => {
  if (!game) {
    return {
      intervalMs: INTERVAL_PRE_FAR,
      useGameEndpoint: false,
    };
  }

  if (isNhlGameLive(game)) {
    return {
      intervalMs: INTERVAL_LIVE,
      useGameEndpoint: true,
    };
  }

  if (isNhlGameFinished(game)) {
    return {
      intervalMs: INTERVAL_PRE_FAR,
      useGameEndpoint: false,
    };
  }

  const startMs = Date.parse(String(game?.startTimeUtc || ""));
  if (!Number.isFinite(startMs)) {
    return {
      intervalMs: INTERVAL_PRE_FAR,
      useGameEndpoint: false,
    };
  }

  const msUntilStart = startMs - nowMs;
  const intervalMs = getPregamePollingInterval(msUntilStart);
  return {
    intervalMs,
    // Before start, avoid polling game endpoint; use scoreboard checks instead.
    useGameEndpoint: msUntilStart <= 0,
  };
};

const getNhlSeasonSpan = (now = new Date()) => {
  const year = now.getFullYear();
  const month = now.getMonth();
  return month >= 8 ? `${year}${year + 1}` : `${year - 1}${year}`;
};

const getNhlMugHeadshotUrl = ({ seasonCode, teamAbbrev, playerId }) => {
  const season = String(seasonCode || "").trim();
  const team = String(teamAbbrev || "")
    .trim()
    .toUpperCase();
  const id = Number(playerId);
  if (!season || !team || !Number.isFinite(id)) return "";
  return `https://assets.nhle.com/mugs/nhl/${season}/${team}/${id}.png`;
};

const STREAM_API_BASE = "https://streamed.pk/api";

const convertToHttps = (url) => {
  if (url && url.startsWith("http://")) {
    return url.replace("http://", "https://");
  }
  return url;
};

const fetchLiveMatches = async () => {
  const sportsToTry = ["ice-hockey", "hockey"];
  for (const sportKey of sportsToTry) {
    try {
      const resp = await fetch(
        convertToHttps(`${STREAM_API_BASE}/matches/${sportKey}`),
      );
      if (!resp.ok) continue;
      const data = await resp.json();
      if (Array.isArray(data) && data.length > 0) return data;
    } catch (e) {
      console.error("fetchLiveMatches error:", e);
    }
  }
  return [];
};

const fetchStreamsForSource = async (source, sourceId) => {
  try {
    const response = await fetch(
      convertToHttps(`${STREAM_API_BASE}/stream/${source}/${sourceId}`),
    );
    if (!response.ok) {
      throw new Error(`Stream API request failed: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching streams for ${source}/${sourceId}:`, error);
    return [];
  }
};

const normalizeTeamName = (teamName) =>
  String(teamName || "")
    .toLowerCase()
    .replace(
      /[áéíóúüñçßëïöäåø]/g,
      (c) =>
        ({
          á: "a",
          é: "e",
          í: "i",
          ó: "o",
          ú: "u",
          ü: "u",
          ñ: "n",
          ç: "c",
          ß: "ss",
          ë: "e",
          ï: "i",
          ö: "o",
          ä: "a",
          å: "a",
          ø: "o",
        })[c] || c,
    )
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

const findMatchStreams = async (homeTeamName, awayTeamName) => {
  try {
    const liveMatches = await fetchLiveMatches();
    if (!liveMatches || !Array.isArray(liveMatches) || liveMatches.length === 0)
      return {};

    const homeNormalized = normalizeTeamName(homeTeamName).toLowerCase();
    const awayNormalized = normalizeTeamName(awayTeamName).toLowerCase();
    const homeFirstWord = homeNormalized.split("-")[0];
    const awayFirstWord = awayNormalized.split("-")[0];
    const hasSameCity = homeFirstWord === awayFirstWord;

    let bestMatch = null;
    let bestScore = 0;

    const quickMatches = liveMatches
      .slice(0, Math.min(liveMatches.length, 100))
      .filter((match) => {
        const title = String(match.title || "").toLowerCase();
        if (hasSameCity) {
          return (
            title.includes(homeNormalized) && title.includes(awayNormalized)
          );
        }
        const homeHasMatch =
          title.includes(homeNormalized.split("-")[0]) ||
          title.includes(homeNormalized.split("-")[1] || "") ||
          (match.teams?.home?.name || "")
            .toLowerCase()
            .includes(homeNormalized.split("-")[0]);
        const awayHasMatch =
          title.includes(awayNormalized.split("-")[0]) ||
          title.includes(awayNormalized.split("-")[1] || "") ||
          (match.teams?.away?.name || "")
            .toLowerCase()
            .includes(awayNormalized.split("-")[0]);
        return homeHasMatch && awayHasMatch;
      });

    const matchesToProcess =
      quickMatches.length > 0 ? quickMatches : liveMatches.slice(0, 100);

    for (const match of matchesToProcess) {
      if (!match.sources || match.sources.length === 0) continue;
      const matchTitle = String(match.title || "").toLowerCase();
      let totalScore = 0;
      const titleWords = matchTitle.split(/[\s\-]+/);
      const homeParts = homeNormalized.split("-").filter((w) => w.length > 2);
      const awayParts = awayNormalized.split("-").filter((w) => w.length > 2);

      homeParts.forEach((part) => {
        if (titleWords.some((w) => w.includes(part) || part.includes(w))) {
          totalScore += 0.4;
        }
      });
      awayParts.forEach((part) => {
        if (titleWords.some((w) => w.includes(part) || part.includes(w))) {
          totalScore += 0.4;
        }
      });

      if (match.teams) {
        const homeApiName = (match.teams.home?.name || "").toLowerCase();
        const awayApiName = (match.teams.away?.name || "").toLowerCase();
        homeParts.forEach((part) => {
          if (homeApiName.includes(part)) totalScore += 0.6;
        });
        awayParts.forEach((part) => {
          if (awayApiName.includes(part)) totalScore += 0.6;
        });
      }

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestMatch = match;
        if (bestScore >= 1.0) break;
      }
    }

    if (!bestMatch || bestScore < 0.3) return {};

    const allStreams = {};
    for (const source of bestMatch.sources) {
      try {
        const sourceStreams = await fetchStreamsForSource(
          source.source,
          source.id,
        );
        if (sourceStreams && sourceStreams.length > 0) {
          const firstStream = sourceStreams[0];
          allStreams[source.source] = {
            url: firstStream.embedUrl || firstStream.url,
            embedUrl: firstStream.embedUrl || firstStream.url,
            source: source.source,
            title: `${source.source.charAt(0).toUpperCase() + source.source.slice(1)} Stream`,
          };
        }
      } catch (error) {
        console.error(`Error fetching streams for ${source.source}:`, error);
      }
    }

    return allStreams;
  } catch (error) {
    console.error("Error in findMatchStreams:", error);
    return {};
  }
};

const generateStreamUrl = (
  awayTeamName,
  homeTeamName,
  streamType = "alpha1",
) => {
  const normalizedAway = normalizeTeamName(awayTeamName);
  const normalizedHome = normalizeTeamName(homeTeamName);
  const streamUrls = {
    alpha1: `https://weakstreams.com/nhl-live-streams/${normalizedAway}-vs-${normalizedHome}-live-stream`,
    alpha2: `https://weakstreams.com/nhl-live-streams/${normalizedHome}-vs-${normalizedAway}-live-stream`,
    bravo: `https://sportsurge.club/hockey/${normalizedAway}-vs-${normalizedHome}`,
    charlie: `https://sportshd.me/hockey/${normalizedAway}-${normalizedHome}`,
  };
  return streamUrls[streamType] || streamUrls.alpha1;
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
    return { time: "--:--", ampm: "" };
  }
};

const isNhlPlayoffGameType = (gameType) => Number(gameType) === 3;

const getNhlExtraPeriodLabel = ({ number, gameType, longForm = false }) => {
  const n = Number(number || 0);
  if (!Number.isFinite(n) || n <= 3) return "";

  // In playoff games, periods after regulation are all overtime periods.
  if (isNhlPlayoffGameType(gameType)) {
    return `${longForm ? "Overtime" : "OT"} ${Math.max(1, n - 3)}`;
  }

  if (n === 4) return longForm ? "Overtime" : "OT";
  if (n === 5) return longForm ? "Shootout" : "SO";
  return longForm ? `${toOrdinal(n)} Period` : `P${n}`;
};

const getPeriodLabel = (number, gameType) => {
  const n = Number(number || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return getNhlExtraPeriodLabel({ number: n, gameType, longForm: false });
};

const getPeriodHeaderLabel = (number, gameType) => {
  const n = Number(number || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n <= 3) return `${toOrdinal(n)} Period`;
  return getNhlExtraPeriodLabel({ number: n, gameType, longForm: true });
};

const getScorerPeriodLabel = (number, gameType) => {
  const n = Number(number || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n <= 3) return toOrdinal(n);
  return getNhlExtraPeriodLabel({ number: n, gameType, longForm: false });
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
    const period = getPeriodLabel(game?.periodNumber, game?.gameType) || "1st";
    const intermission = game?.intermission === true;
    return {
      line1:
        formatRemainingClock(getLiveRemainingFromAnchor(game, nowMs)) +
        (intermission ? " - INT" : ""),
      line2: period,
    };
  }
  if (isNhlGameFinished(game)) {
    const { time, ampm } = formatLocalTime(game.startTimeUtc);
    return { line1: game.statusMain || "FT", line2: `${time} ${ampm}`.trim() };
  }
  return { line1: game.statusMain || "--", line2: game.statusSub || "" };
};

const deriveNhlGoalSituation = (scoreAfter, scoringSide) => {
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
    const gameState = String(landing?.gameState || "").toUpperCase();
    const periodNumber = Number(landing?.periodDescriptor?.number || 0);
    const intermission = landing?.clock?.inIntermission === true;
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

    const awayRecord =
      landing?.matchup?.goalieComparison?.awayTeam?.teamTotals?.record ||
      away?.record ||
      "";
    const homeRecord =
      landing?.matchup?.goalieComparison?.homeTeam?.teamTotals?.record ||
      home?.record ||
      "";

    return {
      venue: landing?.venue || "",
      leagueName: "NHL",
      startTimeUtc: gameDate,
      gameState,
      statusMain,
      statusSub,
      isPre,
      rawState: state,
      gameType: Number(landing?.gameType || 0),
      periodNumber,
      intermission,
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
        record: String(awayRecord || "").trim(),
      },
      home: {
        id: String(home?.id || ""),
        abbreviation: home?.abbrev || "",
        name: home?.commonName || home?.placeName || home?.abbrev || "Home",
        score: Number(home?.score || 0),
        logo: isDarkMode
          ? home?.darkLogo || home?.logo
          : home?.logo || home?.darkLogo,
        record: String(homeRecord || "").trim(),
      },
      matchup: landing?.matchup || {},
      summaryScoring: landing?.summary?.scoring || [],
      summaryPenalties: landing?.summary?.penalties || [],
      summaryShootout: landing?.summary?.shootout || null,
      threeStars: landing?.summary?.threeStars || [],
      referees: (details?.data?.rightRail?.gameInfo?.referees || [])
        .map((entry) => String(entry?.default || entry?.name || "").trim())
        .filter(Boolean),
      linesmen: (details?.data?.rightRail?.gameInfo?.linesmen || [])
        .map((entry) => String(entry?.default || entry?.name || "").trim())
        .filter(Boolean),
      lineScoreByPeriod: details?.data?.rightRail?.linescore?.byPeriod || [],
      teamGameStats: details?.data?.rightRail?.teamGameStats || [],
      teamSeasonStats: details?.data?.rightRail?.teamSeasonStats || {},
      seasonSeries: details?.data?.rightRail?.seasonSeries || [],
      shifts: details?.data?.shifts || {},
      plays: details?.data?.plays?.plays || [],
      playerMetaById: buildPlayerMetaById(details?.data?.boxscore),
      playRosterSpots: buildPlayRosterSpots(details?.data?.plays),
      boxscorePlayerByGameStats:
        details?.data?.boxscore?.playerByGameStats || {},
      iceSurface: landing?.summary?.iceSurface || {},
      injuriesByTeam: {
        away: details?.data?.rightRail?.gameInfo?.awayTeam?.scratches || [],
        home: details?.data?.rightRail?.gameInfo?.homeTeam?.scratches || [],
      },
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
    gameType: Number(landing?.gameType || details?.gameType || 0),
    periodNumber: Number(competition?.status?.period || 0),
    clockSecondsRemaining: parseClockSecs(
      competition?.status?.displayClock || "",
    ),
    clockRunning: String(statusType?.state || "") === "in",
    intermission: Boolean(landing?.clock?.inIntermission),
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
      record: String(
        details?.matchup?.goalieComparison?.awayTeam?.teamTotals?.record || "",
      ).trim(),
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
      record: String(
        details?.matchup?.goalieComparison?.homeTeam?.teamTotals?.record || "",
      ).trim(),
    },
    matchup: details?.matchup || {},
    summaryScoring: details?.summary?.scoring || [],
    summaryPenalties: details?.summary?.penalties || [],
    summaryShootout: details?.summary?.shootout || null,
    threeStars: details?.summary?.threeStars || [],
    referees: (details?.gameInfo?.referees || [])
      .map((entry) => String(entry?.default || entry?.name || "").trim())
      .filter(Boolean),
    linesmen: (details?.gameInfo?.linesmen || [])
      .map((entry) => String(entry?.default || entry?.name || "").trim())
      .filter(Boolean),
    lineScoreByPeriod: [],
    teamGameStats: details?.teamGameStats || [],
    teamSeasonStats: details?.teamSeasonStats || {},
    seasonSeries: details?.rightRail?.seasonSeries || [],
    shifts: details?.shifts || {},
    plays: details?.plays || [],
    playerMetaById: buildPlayerMetaById(details?.boxscore),
    playRosterSpots: buildPlayRosterSpots(details?.plays),
    boxscorePlayerByGameStats: details?.boxscore?.playerByGameStats || {},
    iceSurface: details?.summary?.iceSurface || {},
    injuriesByTeam: {
      away: details?.gameInfo?.awayTeam?.scratches || [],
      home: details?.gameInfo?.homeTeam?.scratches || [],
    },
  };
};

const buildScorers = ({
  summaryScoring,
  plays,
  awayAbbr,
  homeAbbr,
  gameType,
}) => {
  const awayGoals = [];
  const homeGoals = [];
  const playoffGame = isNhlPlayoffGameType(gameType);

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
      if (!periodNumber || (!playoffGame && periodNumber >= 5)) return;

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
      if (!periodNumber || (!playoffGame && periodNumber >= 5)) return;

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
    return a.secs - b.secs;
  };

  const formatGoalMoment = (g) =>
    `${g.timeInPeriod} (${getScorerPeriodLabel(g.periodNumber, gameType)})`;

  const formatGroupedByPlayer = (goals) => {
    const grouped = new Map();

    goals
      .slice()
      .sort(byEarliest)
      .forEach((goal) => {
        const name = String(goal?.name || "").trim();
        if (!name) return;

        const key = name.toLowerCase();
        if (!grouped.has(key)) {
          grouped.set(key, { name, moments: [] });
        }

        grouped.get(key).moments.push(formatGoalMoment(goal));
      });

    return Array.from(grouped.values()).map(
      (entry) => `${entry.name} ${entry.moments.join(", ")}`,
    );
  };

  return {
    away: formatGroupedByPlayer(awayGoals),
    home: formatGroupedByPlayer(homeGoals),
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

const getNhlDisplayName = (player, game) => {
  const id = Number(player?.id ?? player?.playerId);
  if (Number.isFinite(id)) {
    const spots = Array.isArray(game?.playRosterSpots)
      ? game.playRosterSpots
      : [];
    const spot = spots.find((entry) => Number(entry?.playerId) === id) || null;
    const spotName = [spot?.firstName, spot?.lastName]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    if (spotName) return spotName;

    const meta = game?.playerMetaById?.[id] || null;
    const metaName = [meta?.firstName, meta?.lastName]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    if (metaName) return metaName;
  }

  const directName = [player?.firstName, player?.lastName]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  if (directName) return directName;

  return String(player?.name || "").trim() || "Unknown Player";
};

const normalizeUtcIso = (s) => {
  const v = String(s || "").trim();
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T00:00:00Z`;
  if (/^\d{4}-\d{2}-\d{2}T/.test(v) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(v)) {
    return `${v}Z`;
  }
  return v;
};

const NHL_SKATER_COMPARE_ORDER = [
  ["goals", "GLS"],
  ["assists", "AST"],
  ["points", "PTS"],
  ["plusMinus", "+/-"],
  ["gamesPlayed", "GP"],
  ["avgTimeOnIce", "AVG TOI"],
  ["toi", "TOI"],
];

const NHL_GOALIE_COMPARE_ORDER = [
  ["wins", "W"],
  ["losses", "L"],
  ["otLosses", "OTL"],
  ["savePctg", "SV%"],
  ["goalsAgainstAvg", "GAA"],
  ["gaa", "GAA"],
  ["shutouts", "SO"],
  ["shotsAgainst", "SA"],
  ["saves", "SV"],
];

const NHL_SHARE_SKATER_STATS = [
  { key: "goals", label: "GLS" },
  { key: "assists", label: "AST" },
  { key: "points", label: "PTS" },
  { key: "sog", label: "SOG" },
  { key: "shots", label: "SHT", pct: "shootingPctg" },
  { key: "hits", label: "HIT" },
  { key: "blockedShots", label: "BLK" },
  { key: "plusMinus", label: "+/-" },
  { key: "pim", label: "PIM" },
  { key: "toi", label: "TOI" },
  { key: "avgTimeOnIce", label: "AVG TOI" },
];

const NHL_SHARE_GOALIE_STATS = [
  { key: "wins", label: "W" },
  { key: "losses", label: "L" },
  { key: "otLosses", label: "OTL" },
  { key: "savePctg", label: "SV%" },
  { key: "saves", label: "SV" },
  { key: "goalsAgainst", label: "GA" },
  { key: "shotsAgainst", label: "SA" },
  { key: "powerPlayGoalsAgainst", label: "PP GA" },
  { key: "shutouts", label: "SO" },
  { key: "toi", label: "TOI" },
];

const NHL_SHARE_TOP_PRIORITY = {
  skater: ["GLS", "AST", "SOG", "SHT", "HIT", "TOI", "AVG TOI"],
  goalie: ["W", "SO", "SV%", "GAA", "SV", "SA"],
};

const NHL_COMPARE_LABEL_OVERRIDES = {
  goals: "GLS",
  assists: "AST",
  points: "PTS",
  plusMinus: "+/-",
  gamesPlayed: "GP",
  avgTimeOnIce: "AVG TOI",
  toi: "TOI",
  wins: "W",
  losses: "L",
  otLosses: "OTL",
  savePctg: "SV%",
  goalsAgainstAvg: "GAA",
  gaa: "GAA",
  shutouts: "SO",
  shotsAgainst: "SA",
  saves: "SV",
};

const NHL_PLAYER_META_KEYS = new Set([
  "playerId",
  "id",
  "personId",
  "sweaterNumber",
  "name",
  "position",
  "firstName",
  "lastName",
  "headshot",
  "teamId",
  "teamAbbrev",
  "teamName",
  "teamSide",
  "decision",
]);

const extractNhlStatsFromEntry = (entry) => {
  if (!entry || typeof entry !== "object") return {};
  const stats = {};
  Object.entries(entry).forEach(([key, value]) => {
    if (NHL_PLAYER_META_KEYS.has(key)) return;
    if (key === "starter") return;
    if (value == null) return;
    if (typeof value === "number") {
      if (Number.isFinite(value)) stats[key] = value;
      return;
    }
    if (typeof value === "boolean") return;
    if (typeof value !== "string") return;
    const raw = value.trim();
    if (!raw) return;
    if (/^\d+(?::\d+){1,2}$/.test(raw) || raw.includes("/")) {
      stats[key] = raw;
      return;
    }
    const n = Number(raw);
    if (Number.isFinite(n)) {
      stats[key] = n;
      return;
    }
    stats[key] = raw;
  });
  return stats;
};

const parseToiSeconds = (value) => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parts = raw.split(":").map((part) => Number(part));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) {
    const [mm, ss] = parts;
    return mm * 60 + ss;
  }
  if (parts.length === 3) {
    const [hh, mm, ss] = parts;
    return hh * 3600 + mm * 60 + ss;
  }
  return null;
};

const getNhlPlayerMode = (player) => {
  const position = String(player?.position || "")
    .trim()
    .toUpperCase();
  if (position === "G") return "goalie";

  const stats = player?.stats || {};
  const hasFiniteField = (key) => {
    const raw = stats?.[key];
    if (raw == null || raw === "") return false;
    return Number.isFinite(Number(raw));
  };
  const goalieSignals = [
    "wins",
    "losses",
    "savePctg",
    "goalsAgainstAvg",
    "gaa",
    "shotsAgainst",
    "saves",
  ].some(hasFiniteField);
  if (goalieSignals) return "goalie";
  return "skater";
};

const formatNhlStatVal = (key, value) => {
  if (value == null || value === "") return "-";
  if (key === "plusMinus") {
    const n = Number(value);
    if (Number.isFinite(n)) return n > 0 ? `+${n}` : String(n);
    return String(value);
  }
  if (key === "savePctg") {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    const pct = n <= 1 ? n * 100 : n;
    return `${pct.toFixed(1)}%`;
  }
  if (/pctg$|pct$/i.test(String(key || ""))) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    const pct = n <= 1 ? n * 100 : n;
    return `${pct.toFixed(1)}%`;
  }
  if (key === "goalsAgainstAvg" || key === "gaa") {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    return n.toFixed(2);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "-";
    if (Number.isInteger(value)) return String(value);
    return String(value.toFixed(2)).replace(/\.00$/, "");
  }
  return String(value);
};

const buildNhlShareStatItems = (player, mode) => {
  const stats = player?.stats || {};
  const defs =
    mode === "goalie" ? NHL_SHARE_GOALIE_STATS : NHL_SHARE_SKATER_STATS;
  const toPctDisplay = (raw) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return `${(n * 100).toFixed(1)}%`;
  };
  return defs
    .filter(({ key }) => stats[key] != null && stats[key] !== "")
    .map(({ key, label, pct }) => ({
      key,
      label,
      value: formatNhlStatVal(key, stats[key]),
      pct: pct ? toPctDisplay(stats[pct]) : null,
      isPlusMinus: label === "+/-",
    }));
};

const buildNhlShareTopStats = (statItems, mode) => {
  const priority =
    NHL_SHARE_TOP_PRIORITY[mode] || NHL_SHARE_TOP_PRIORITY.skater;
  const itemMap = new Map(statItems.map((item) => [item.label, item]));
  const ordered = priority.map((label) => itemMap.get(label)).filter(Boolean);
  const hasMeaningfulValue = (item) => {
    const raw = String(item?.value ?? "").trim();
    if (!raw || raw === "-") return false;
    if (raw === "0" || raw === "0.0" || raw === "0%" || raw === "0.000")
      return false;
    return true;
  };
  const nonZero = ordered.filter(hasMeaningfulValue);
  const fallback = ordered.filter((item) => !nonZero.includes(item));
  return [...nonZero, ...fallback].slice(0, 3);
};

const NHL_GOAL_SHARE_FIXED_STATS = [
  ["goals", "GLS"],
  ["assists", "AST"],
  ["points", "PTS"],
  ["sog", "SOG"],
  ["plusMinus", "+/-"],
  ["toi", "TOI"],
];

const getNhlBoxscoreStatsByPlayerId = (game, playerId) => {
  const id = Number(playerId);
  if (!Number.isFinite(id)) return {};
  const byGame = game?.boxscorePlayerByGameStats || {};
  const groups = [
    byGame?.awayTeam?.forwards,
    byGame?.awayTeam?.defense,
    byGame?.awayTeam?.goalies,
    byGame?.homeTeam?.forwards,
    byGame?.homeTeam?.defense,
    byGame?.homeTeam?.goalies,
  ];
  for (const group of groups) {
    const list = Array.isArray(group) ? group : [];
    const entry =
      list.find(
        (p) =>
          Number(p?.playerId ?? p?.id ?? p?.personId ?? p?.player?.id) === id,
      ) || null;
    if (entry) return extractNhlStatsFromEntry(entry);
  }
  return {};
};

const getNhlGoalShareStatRawValue = (stats, key) => {
  if (!stats || typeof stats !== "object") return undefined;
  if (stats[key] != null && stats[key] !== "") return stats[key];
  if (key === "plusMinus") {
    if (stats.plusminus != null && stats.plusminus !== "")
      return stats.plusminus;
    if (stats.plus_minus != null && stats.plus_minus !== "")
      return stats.plus_minus;
    if (stats["plus-minus"] != null && stats["plus-minus"] !== "") {
      return stats["plus-minus"];
    }
  }
  return undefined;
};

const buildNhlGoalShareStats = (game, player) => {
  const playerId = Number(player?.playerId ?? player?.id ?? player?.personId);
  const boxscoreStats = getNhlBoxscoreStatsByPlayerId(game, playerId);
  const stats =
    boxscoreStats && Object.keys(boxscoreStats).length > 0
      ? boxscoreStats
      : player?.stats || {};
  return NHL_GOAL_SHARE_FIXED_STATS.map(([key, label]) => {
    const rawValue = getNhlGoalShareStatRawValue(stats, key);
    return {
      label,
      value:
        rawValue != null && rawValue !== ""
          ? formatNhlStatVal(key, rawValue)
          : key === "toi"
            ? "-"
            : "0",
    };
  });
};

const buildNhlGoalSharePayload = ({
  game,
  scorer,
  assistName,
  minuteLabel,
  periodLabel,
  scoreAfter,
  comment,
  teamAbbr,
  teamSide,
  homeTeamDefendingSide,
  xCoord,
  yCoord,
  goalSituation,
  getTeamLogoUrl,
  isPenalty = false,
  isOwnGoal = false,
  isScoring = true,
}) => {
  if (!game || !scorer) return null;
  const resolvedTeamAbbr = String(
    teamAbbr || scorer?.teamAbbrev || scorer?.teamAbbr || "",
  ).toUpperCase();
  const awayAbbr = String(game?.away?.abbreviation || "").toUpperCase();
  const homeAbbr = String(game?.home?.abbreviation || "").toUpperCase();
  const teamLogo =
    resolvedTeamAbbr === awayAbbr
      ? game?.away?.logo || getTeamLogoUrl?.("nhl", resolvedTeamAbbr)
      : resolvedTeamAbbr === homeAbbr
        ? game?.home?.logo || getTeamLogoUrl?.("nhl", resolvedTeamAbbr)
        : getTeamLogoUrl?.("nhl", resolvedTeamAbbr);

  const scorerName =
    getNhlDisplayName(scorer, game) ||
    scorer?.name ||
    `${scorer?.firstName || ""} ${scorer?.lastName || ""}`.trim() ||
    "Unknown Player";

  const resolvedTeamSide =
    String(teamSide || "")
      .trim()
      .toLowerCase() ||
    (resolvedTeamAbbr === awayAbbr
      ? "away"
      : resolvedTeamAbbr === homeAbbr
        ? "home"
        : null);

  return {
    scorerName,
    scorerInitials:
      scorerName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase() || "P",
    playerImageUri: scorer?.headshot || scorer?.fallbackHeadshot || null,
    teamAbbr: resolvedTeamAbbr,
    teamName:
      scorer?.teamName ||
      (resolvedTeamAbbr === awayAbbr
        ? game?.away?.name
        : resolvedTeamAbbr === homeAbbr
          ? game?.home?.name
          : "Team"),
    teamLogoUri: teamLogo || null,
    teamColor: NHLService.getTeamColor(resolvedTeamAbbr, "#2563eb"),
    homeLogo: game?.home?.logo || getTeamLogoUrl?.("nhl", homeAbbr),
    awayLogo: game?.away?.logo || getTeamLogoUrl?.("nhl", awayAbbr),
    minuteLabel: String(minuteLabel || ""),
    periodLabel: String(periodLabel || ""),
    comment: String(comment || "").trim(),
    goalSituation: String(goalSituation || "").trim(),
    isPenalty,
    isOwnGoal,
    isScoring: Boolean(isScoring),
    assistName: String(assistName || "").trim() || null,
    teamSide: resolvedTeamSide,
    homeTeamDefendingSide:
      String(homeTeamDefendingSide || "")
        .trim()
        .toLowerCase() || null,
    xCoord: Number.isFinite(Number(xCoord)) ? Number(xCoord) : null,
    yCoord: Number.isFinite(Number(yCoord)) ? Number(yCoord) : null,
    scoreAfter: {
      away: Number.isFinite(Number(scoreAfter?.away))
        ? Number(scoreAfter.away)
        : "-",
      home: Number.isFinite(Number(scoreAfter?.home))
        ? Number(scoreAfter.home)
        : "-",
    },
    statsItems: buildNhlGoalShareStats(game, scorer),
  };
};

const getNhlStatNumeric = (key, value) => {
  if (value == null || value === "") return null;
  const keyLc = String(key || "").toLowerCase();
  const isToiField = keyLc === "toi" || keyLc === "avgtimeonice";
  if (isToiField) {
    return parseToiSeconds(value);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    const parsed = parseStatPrimaryNumber(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (keyLc === "savepctg") return n <= 1 ? n * 100 : n;
  return n;
};

const buildNhlStatRows = (player, mode) => {
  const stats = player?.stats || {};
  const preferredOrder =
    mode === "goalie" ? NHL_GOALIE_COMPARE_ORDER : NHL_SKATER_COMPARE_ORDER;
  const labelForKey = (key) =>
    key === "plusMinus" ? "+/-" : formatStatLabel(key);

  const preferred = [];
  preferredOrder.forEach(([key]) => {
    const raw = stats?.[key];
    if (raw == null || raw === "") return;
    preferred.push({
      key,
      label: labelForKey(key),
      value: formatNhlStatVal(key, raw),
      numeric: getNhlStatNumeric(key, raw),
    });
  });

  const preferredKeys = new Set(preferred.map((row) => row.key));
  const extras = Object.entries(stats)
    .filter(
      ([key, raw]) => !preferredKeys.has(key) && raw != null && raw !== "",
    )
    .map(([key, raw]) => ({
      key,
      label: labelForKey(key),
      value: formatNhlStatVal(key, raw),
      numeric: getNhlStatNumeric(key, raw),
    }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));

  return [...preferred, ...extras];
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

const parseStatPrimaryNumber = (value) => {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  const ratio = raw.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (ratio) return Number(ratio[1]);
  const n = Number(raw.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const formatStatLabel = (category) =>
  String(category || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

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

const withAlpha66 = (color) => {
  const raw = String(color || "").trim();
  const fullHex = raw.match(/^#([0-9a-fA-F]{6})$/);
  if (fullHex) return `${raw}66`;

  const shortHex = raw.match(/^#([0-9a-fA-F]{3})$/);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split("");
    return `#${r}${r}${g}${g}${b}${b}66`;
  }

  const hexWithAlpha = raw.match(/^#([0-9a-fA-F]{8})$/);
  if (hexWithAlpha) return `#${hexWithAlpha[1].slice(0, 6)}66`;

  return "rgba(128,128,128,0.4)";
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
              const label =
                pNum <= 3
                  ? String(pNum)
                  : getNhlExtraPeriodLabel({
                      number: pNum,
                      gameType: game?.gameType,
                      longForm: false,
                    });
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

const NHLRosterPlayerCard = ({
  player,
  theme,
  teamColor,
  isScheduled = false,
  showStats = true,
  onPress,
}) => {
  const headshotCandidates = useMemo(() => {
    const preferred = String(player?.headshot || "").trim();
    const fallback = String(player?.fallbackHeadshot || "").trim();
    return [preferred, fallback].filter(Boolean);
  }, [player?.fallbackHeadshot, player?.headshot]);

  const [headshotIndex, setHeadshotIndex] = useState(0);

  useEffect(() => {
    setHeadshotIndex(0);
  }, [headshotCandidates.join("|")]);

  const activeHeadshot = headshotCandidates[headshotIndex] || "";

  const fullName = String(player?.name || "").trim() || "Unknown Player";
  const number =
    player?.number != null && Number.isFinite(Number(player.number))
      ? `#${Number(player.number)}`
      : "";
  const position = String(player?.position || "").trim();
  const meta = [number, position].filter(Boolean).join(" \u00B7 ");
  const hasHeadshot = !!activeHeadshot;
  const initials =
    fullName
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("") || "?";
  const isGoalie =
    String(player?.position || "")
      .trim()
      .toUpperCase() === "G";
  const decisionRaw = String(player?.decision || "")
    .trim()
    .toUpperCase();
  const decisionLabel =
    decisionRaw === "W" ? "WON" : decisionRaw === "L" ? "LOSS" : "";
  const decisionColor =
    decisionRaw === "W"
      ? theme.success
      : decisionRaw === "L"
        ? theme.error
        : theme.textSecondary;

  const plusMinusRaw = Number(player?.stats?.plusMinus);
  const plusMinusDisplay = Number.isFinite(plusMinusRaw)
    ? plusMinusRaw > 0
      ? `+${plusMinusRaw}`
      : String(plusMinusRaw)
    : "-";
  const plusMinusColor = Number.isFinite(plusMinusRaw)
    ? plusMinusRaw < 0
      ? theme.error
      : plusMinusRaw > 0
        ? theme.success
        : theme.text
    : theme.text;

  const formatSavePct = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    const pct = n <= 1 ? n * 100 : n;
    return `${pct.toFixed(1)}%`;
  };

  const hasSeasonSkaterStats =
    Number.isFinite(Number(player?.stats?.gamesPlayed)) &&
    String(player?.stats?.avgTimeOnIce || "").trim().length > 0;
  const hasSeasonGoalieRecord =
    Number.isFinite(Number(player?.stats?.wins)) &&
    Number.isFinite(Number(player?.stats?.losses));

  const goalieRecord = hasSeasonGoalieRecord
    ? `${Number(player?.stats?.wins)}-${Number(player?.stats?.losses)}-${Number(player?.stats?.otLosses ?? 0)}`
    : "-";

  const statItems = isGoalie
    ? isScheduled && hasSeasonGoalieRecord
      ? [
          {
            label: "GA",
            value: toSafeStatValue(
              player?.stats?.goalsAgainst ?? player?.stats?.goalsAgainstAvg,
            ),
          },
          {
            label: "SA",
            value: toSafeStatValue(player?.stats?.shotsAgainst),
          },
          { label: "SV", value: toSafeStatValue(player?.stats?.saves) },
          { label: "SV%", value: formatSavePct(player?.stats?.savePctg) },
          { label: "RCD", value: goalieRecord },
        ]
      : [
          { label: "GA", value: toSafeStatValue(player?.stats?.goalsAgainst) },
          { label: "SA", value: toSafeStatValue(player?.stats?.shotsAgainst) },
          { label: "SV", value: toSafeStatValue(player?.stats?.saves) },
          { label: "SV%", value: formatSavePct(player?.stats?.savePctg) },
          { label: "TOI", value: String(player?.stats?.toi || "-") },
        ]
    : hasSeasonSkaterStats
      ? [
          { label: "GLS", value: toSafeStatValue(player?.stats?.goals) },
          { label: "AST", value: toSafeStatValue(player?.stats?.assists) },
          { label: "PTS", value: toSafeStatValue(player?.stats?.points) },
          {
            label: "+/-",
            value: plusMinusDisplay,
            valueColor: plusMinusColor,
          },
          {
            label: "AVG TOI",
            value: String(player?.stats?.avgTimeOnIce || "-"),
          },
          {
            label: "GP",
            value: toSafeStatValue(player?.stats?.gamesPlayed),
          },
        ]
      : [
          { label: "GLS", value: toSafeStatValue(player?.stats?.goals) },
          { label: "AST", value: toSafeStatValue(player?.stats?.assists) },
          { label: "PTS", value: toSafeStatValue(player?.stats?.points) },
          {
            label: "+/-",
            value: plusMinusDisplay,
            valueColor: plusMinusColor,
          },
          { label: "TOI", value: String(player?.stats?.toi || "-") },
        ];

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.82 : 1}
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.nhlRosterPlayerCard,
        {
          backgroundColor: theme.surface,
          borderColor: teamColor ?? theme.border,
        },
      ]}
    >
      <View style={styles.nhlRosterPlayerTopRow}>
        <View
          style={[
            styles.nhlRosterPlayerHeadshotWrap,
            {
              backgroundColor: withAlpha66(teamColor),
              borderColor: teamColor ?? theme.border,
            },
          ]}
        >
          {hasHeadshot ? (
            <Image
              source={{ uri: activeHeadshot }}
              style={styles.nhlRosterPlayerHeadshot}
              contentFit="cover"
              cachePolicy="memory-disk"
              onError={() => {
                setHeadshotIndex((prev) => prev + 1);
              }}
            />
          ) : (
            <View style={styles.nhlRosterPlayerFallback}>
              <Text
                style={[
                  styles.nhlRosterPlayerFallbackText,
                  { color: theme.textSecondary },
                ]}
              >
                {initials}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.nhlRosterPlayerNameBlock}>
          <View style={styles.nhlRosterPlayerNameRow}>
            <Text
              style={[styles.nhlRosterPlayerName, { color: theme.text }]}
              numberOfLines={1}
            >
              {fullName}
            </Text>
            {!!decisionLabel && (
              <Text
                style={[
                  styles.nhlRosterDecisionLabel,
                  { color: decisionColor },
                ]}
              >
                {decisionLabel}
              </Text>
            )}
          </View>
          {!!meta && (
            <Text
              style={[
                styles.nhlRosterPlayerMeta,
                { color: theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {meta}
            </Text>
          )}
        </View>
      </View>

      {showStats ? (
        <View style={styles.nhlRosterStatsRow}>
          {statItems.map((item) => (
            <View key={item.label} style={styles.nhlRosterStatCell}>
              <Text
                style={[
                  styles.nhlRosterStatValue,
                  { color: item.valueColor || theme.text },
                ]}
                numberOfLines={1}
              >
                {item.value}
              </Text>
              <Text
                style={[
                  styles.nhlRosterStatLabel,
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

const NHLTeamRosterSection = ({
  game,
  theme,
  teamSide,
  teamColor,
  onPlayerPress,
}) => {
  const boxscoreKey = teamSide === "home" ? "homeTeam" : "awayTeam";
  const teamAbbrev = String(
    teamSide === "home" ? game?.home?.abbreviation : game?.away?.abbreviation,
  )
    .trim()
    .toUpperCase();
  const seasonCode = useMemo(() => getNhlSeasonSpan(), []);

  const rosterSpotById = useMemo(() => {
    const map = {};
    const spots = Array.isArray(game?.playRosterSpots)
      ? game.playRosterSpots
      : [];
    spots.forEach((spot) => {
      const id = Number(spot?.playerId);
      if (Number.isFinite(id)) map[id] = spot;
    });
    return map;
  }, [game?.playRosterSpots]);

  const toPlayerId = (entry) => {
    const candidates = [
      entry?.playerId,
      entry?.id,
      entry?.personId,
      entry?.player?.id,
    ];
    for (const value of candidates) {
      const id = Number(value);
      if (Number.isFinite(id)) return id;
    }
    return null;
  };

  const boxscoreEntryById = useMemo(() => {
    const side = game?.boxscorePlayerByGameStats?.[boxscoreKey] || {};
    const map = {};
    const buckets = [side?.forwards, side?.defense, side?.goalies];
    buckets.forEach((bucket) => {
      (Array.isArray(bucket) ? bucket : []).forEach((entry) => {
        const id = toPlayerId(entry);
        if (Number.isFinite(id)) map[id] = entry;
      });
    });
    return map;
  }, [boxscoreKey, game?.boxscorePlayerByGameStats]);

  const resolveName = (entry, roster) => {
    const first = String(roster?.firstName || "").trim();
    const last = String(roster?.lastName || "").trim();
    const fromRoster = [first, last].filter(Boolean).join(" ").trim();
    if (fromRoster) return fromRoster;

    const entryFirst = String(
      entry?.firstName?.default || entry?.firstName || "",
    ).trim();
    const entryLast = String(
      entry?.lastName?.default || entry?.lastName || "",
    ).trim();
    const fromEntryParts = [entryFirst, entryLast]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (fromEntryParts) return fromEntryParts;

    return String(entry?.name || "").trim();
  };

  const toCardPlayer = (entry, fallbackKey) => {
    const playerId = toPlayerId(entry);
    const boxscoreEntry =
      playerId != null && Number.isFinite(playerId)
        ? boxscoreEntryById[playerId] || null
        : null;
    const sourceEntry = {
      ...(boxscoreEntry || {}),
      ...(entry || {}),
    };
    const playerMeta =
      playerId != null && Number.isFinite(playerId)
        ? game?.playerMetaById?.[playerId] || null
        : null;
    const roster =
      playerId != null && Number.isFinite(playerId)
        ? rosterSpotById[playerId] || null
        : null;
    const number =
      sourceEntry?.sweaterNumber != null
        ? Number(sourceEntry.sweaterNumber)
        : roster?.sweaterNumber != null
          ? Number(roster.sweaterNumber)
          : playerMeta?.sweaterNumber != null
            ? Number(playerMeta.sweaterNumber)
            : null;

    const mugHeadshot = getNhlMugHeadshotUrl({
      seasonCode,
      teamAbbrev,
      playerId,
    });
    const fallbackHeadshot = String(
      roster?.headshot || sourceEntry?.headshot || "",
    ).trim();
    const extractedStats = extractNhlStatsFromEntry(sourceEntry);

    const resolvedName =
      resolveName(sourceEntry, roster) || String(playerMeta?.name || "").trim();
    const resolvedPosition =
      String(sourceEntry?.position || "").trim() ||
      String(playerMeta?.position || "").trim();

    return {
      key:
        playerId != null && Number.isFinite(playerId)
          ? `${fallbackKey}_${playerId}`
          : `${fallbackKey}_${String(resolvedName || "unknown")}`,
      id: playerId,
      name: resolvedName,
      number,
      position: resolvedPosition,
      teamSide,
      teamId: Number(teamSide === "home" ? game?.home?.id : game?.away?.id),
      teamName: String(
        teamSide === "home" ? game?.home?.name : game?.away?.name,
      ).trim(),
      teamAbbrev,
      headshot: mugHeadshot || fallbackHeadshot || null,
      fallbackHeadshot:
        mugHeadshot && fallbackHeadshot ? fallbackHeadshot : null,
      decision:
        String(sourceEntry?.decision || "")
          .trim()
          .toUpperCase() || null,
      stats: {
        ...extractedStats,
        toi:
          String(extractedStats?.toi ?? sourceEntry?.toi ?? "").trim() || "-",
        avgTimeOnIce: String(
          extractedStats?.avgTimeOnIce ?? sourceEntry?.avgTimeOnIce ?? "",
        ).trim(),
      },
    };
  };

  const dedupePlayers = (rows) => {
    const seen = new Set();
    return rows.filter((row, idx) => {
      const key =
        row?.id != null && Number.isFinite(Number(row.id))
          ? `id_${Number(row.id)}`
          : `name_${String(row?.name || "")}_${idx}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const skaters = useMemo(() => {
    const side = game?.boxscorePlayerByGameStats?.[boxscoreKey] || {};
    const forwards = Array.isArray(side?.forwards) ? side.forwards : [];
    const defense = Array.isArray(side?.defense) ? side.defense : [];
    return dedupePlayers(
      [...forwards, ...defense].map((entry) => toCardPlayer(entry, "skater")),
    );
  }, [
    boxscoreKey,
    game?.boxscorePlayerByGameStats,
    rosterSpotById,
    boxscoreEntryById,
    game?.playerMetaById,
  ]);

  const goalies = useMemo(() => {
    const side = game?.boxscorePlayerByGameStats?.[boxscoreKey] || {};
    const goalieRows = Array.isArray(side?.goalies) ? side.goalies : [];
    return dedupePlayers(
      goalieRows.map((entry) => toCardPlayer(entry, "goalie")),
    );
  }, [boxscoreKey, game?.boxscorePlayerByGameStats, rosterSpotById]);

  const injured = useMemo(() => {
    const rows = Array.isArray(game?.injuriesByTeam?.[teamSide])
      ? game.injuriesByTeam[teamSide]
      : [];
    return dedupePlayers(rows.map((entry) => toCardPlayer(entry, "injured")));
  }, [game?.injuriesByTeam, rosterSpotById, teamSide]);

  const seasonSkaters = useMemo(() => {
    const teamId = Number(
      teamSide === "home" ? game?.home?.id : game?.away?.id,
    );
    const rows = Array.isArray(game?.matchup?.skaterSeasonStats?.skaters)
      ? game.matchup.skaterSeasonStats.skaters
      : [];
    return dedupePlayers(
      rows
        .filter((entry) => Number(entry?.teamId) === teamId)
        .map((entry) =>
          toCardPlayer(
            {
              ...entry,
              toi: entry?.avgTimeOnIce,
            },
            "season_skater",
          ),
        ),
    );
  }, [
    game?.away?.id,
    game?.home?.id,
    game?.matchup?.skaterSeasonStats?.skaters,
    teamSide,
  ]);

  const seasonGoalies = useMemo(() => {
    const teamId = Number(
      teamSide === "home" ? game?.home?.id : game?.away?.id,
    );
    const rows = Array.isArray(game?.matchup?.goalieSeasonStats?.goalies)
      ? game.matchup.goalieSeasonStats.goalies
      : [];
    return dedupePlayers(
      rows
        .filter((entry) => Number(entry?.teamId) === teamId)
        .map((entry) =>
          toCardPlayer(
            {
              ...entry,
              position: "G",
            },
            "season_goalie",
          ),
        ),
    );
  }, [
    game?.away?.id,
    game?.home?.id,
    game?.matchup?.goalieSeasonStats?.goalies,
    teamSide,
  ]);

  const onIce = useMemo(() => {
    const side = game?.iceSurface?.[boxscoreKey] || {};
    const forwards = Array.isArray(side?.forwards) ? side.forwards : [];
    const defense = Array.isArray(side?.defensemen) ? side.defensemen : [];
    return dedupePlayers(
      [...forwards, ...defense].map((entry) => toCardPlayer(entry, "onice")),
    );
  }, [
    boxscoreKey,
    game?.iceSurface,
    rosterSpotById,
    boxscoreEntryById,
    game?.playerMetaById,
  ]);

  const onIceGoalies = useMemo(() => {
    const side = game?.iceSurface?.[boxscoreKey] || {};
    const goalieRows = Array.isArray(side?.goalies) ? side.goalies : [];
    return dedupePlayers(
      goalieRows.map((entry) =>
        toCardPlayer(
          {
            ...entry,
            position: String(entry?.position || "G").trim() || "G",
          },
          "onice_goalie",
        ),
      ),
    );
  }, [
    boxscoreKey,
    game?.iceSurface,
    rosterSpotById,
    boxscoreEntryById,
    game?.playerMetaById,
  ]);

  const onIcePenaltyBox = useMemo(() => {
    const side = game?.iceSurface?.[boxscoreKey] || {};
    const penaltyRows = Array.isArray(side?.penaltyBox) ? side.penaltyBox : [];
    return dedupePlayers(
      penaltyRows.map((entry) => toCardPlayer(entry, "penalty_box")),
    );
  }, [
    boxscoreKey,
    game?.iceSurface,
    rosterSpotById,
    boxscoreEntryById,
    game?.playerMetaById,
  ]);

  const benchIdentity = (player) => {
    const id = Number(player?.id);
    if (Number.isFinite(id)) return `id_${id}`;
    const name = String(player?.name || "")
      .trim()
      .toLowerCase();
    const num = Number.isFinite(Number(player?.number))
      ? String(Number(player.number))
      : "";
    return `name_${name}_${num}`;
  };

  const onIceIdentitySet = useMemo(() => {
    const set = new Set();
    [...onIce, ...onIceGoalies].forEach((player) => {
      set.add(benchIdentity(player));
    });
    return set;
  }, [onIce, onIceGoalies]);

  const useSeasonStatsFallback =
    skaters.length === 0 && goalies.length === 0 && injured.length === 0;

  const rosterSkaters = useSeasonStatsFallback ? seasonSkaters : skaters;
  const rosterGoalies = useSeasonStatsFallback ? seasonGoalies : goalies;

  const shiftNameKey = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const starterShiftNameSet = useMemo(() => {
    const teamId = String(
      teamSide === "home" ? game?.home?.id : game?.away?.id,
    );
    const teamShifts =
      (game?.shifts && typeof game.shifts === "object"
        ? game.shifts?.[teamId] || game.shifts?.[Number(teamId)]
        : null) || {};

    const starters = new Set();
    Object.entries(teamShifts).forEach(([playerName, playerShifts]) => {
      const shifts = Array.isArray(playerShifts) ? playerShifts : [];
      const hasOpeningShift = shifts.some((shift) => {
        const period = Number(shift?.period ?? shift?.periodNumber ?? 0);
        if (period !== 1) return false;
        const startClock = String(
          shift?.startTime || shift?.start || "",
        ).trim();
        return parseClockSecs(startClock) === 0;
      });
      if (!hasOpeningShift) return;
      const key = shiftNameKey(playerName);
      if (key) starters.add(key);
    });
    return starters;
  }, [game?.away?.id, game?.home?.id, game?.shifts, teamSide]);

  const isShiftStarter = useCallback(
    (player) => {
      const fullNameKey = shiftNameKey(player?.name);
      if (fullNameKey && starterShiftNameSet.has(fullNameKey)) return true;

      const partsNameKey = shiftNameKey(
        `${String(player?.firstName || "").trim()} ${String(player?.lastName || "").trim()}`,
      );
      if (partsNameKey && starterShiftNameSet.has(partsNameKey)) return true;

      return false;
    },
    [starterShiftNameSet],
  );

  const benchSkaters = useMemo(
    () =>
      rosterSkaters.filter(
        (player) => !onIceIdentitySet.has(benchIdentity(player)),
      ),
    [rosterSkaters, onIceIdentitySet],
  );
  const benchGoalies = useMemo(
    () =>
      rosterGoalies.filter(
        (player) => !onIceIdentitySet.has(benchIdentity(player)),
      ),
    [rosterGoalies, onIceIdentitySet],
  );

  const isFinished = isNhlGameFinished(game);
  const isLive = isNhlGameLive(game);

  const sections = useMemo(() => {
    const goalieLabel = rosterGoalies.length > 1 ? "Goalies" : "Goalie";

    if (isFinished) {
      return [
        {
          key: "skaters",
          label: "Skaters",
          players: rosterSkaters,
          splitByStarter: true,
        },
        {
          key: "goalies",
          label: goalieLabel,
          players: rosterGoalies,
          splitByStarter: true,
        },
        { key: "injured", label: "Injured", players: injured },
      ].filter((section) => section.players.length > 0);
    }

    if (isLive) {
      if (onIce.length === 0 && onIceGoalies.length === 0) {
        return [
          {
            key: "skaters",
            label: "Skaters",
            players: rosterSkaters,
            splitByStarter: true,
          },
          {
            key: "goalies",
            label: goalieLabel,
            players: rosterGoalies,
            splitByStarter: true,
          },
        ].filter((section) => section.players.length > 0);
      }
      const liveSections = [
        {
          key: "onice",
          label: "On Ice",
          players: onIce,
          penaltyBoxPlayers: onIcePenaltyBox,
        },
        { key: "goalies", label: goalieLabel, players: onIceGoalies },
      ].filter((section) => section.players.length > 0);

      if (benchSkaters.length > 0 || benchGoalies.length > 0) {
        liveSections.push({
          key: "bench",
          label: "Bench",
          players: [...benchSkaters, ...benchGoalies],
          benchSkaters,
          benchGoalies,
        });
      }

      return liveSections;
    }

    const scheduledSections = [];
    if (rosterSkaters.length > 0) {
      scheduledSections.push({
        key: "skaters",
        label: "Skaters",
        players: rosterSkaters,
        splitByStarter: true,
      });
    }
    if (rosterGoalies.length > 0) {
      scheduledSections.push({
        key: "goalies",
        label: goalieLabel,
        players: rosterGoalies,
        splitByStarter: true,
      });
    }
    if (injured.length > 0) {
      scheduledSections.push({
        key: "injured",
        label: "Injured",
        players: injured,
      });
    }
    return scheduledSections;
  }, [
    benchGoalies,
    benchSkaters,
    injured,
    isFinished,
    isLive,
    onIce,
    onIceGoalies,
    onIcePenaltyBox,
    rosterGoalies,
    rosterSkaters,
  ]);

  const [sectionKey, setSectionKey] = useState(
    () => sections[0]?.key || "skaters",
  );

  useEffect(() => {
    if (!sections.some((section) => section.key === sectionKey)) {
      setSectionKey(sections[0]?.key || "skaters");
    }
  }, [sectionKey, sections]);

  const activeSection =
    sections.find((section) => section.key === sectionKey) ||
    sections[0] ||
    null;
  const players = Array.isArray(activeSection?.players)
    ? activeSection.players
    : [];
  const isOnIceSection = activeSection?.key === "onice";
  const penaltyBoxPlayersToRender = Array.isArray(
    activeSection?.penaltyBoxPlayers,
  )
    ? activeSection.penaltyBoxPlayers
    : [];
  const isBenchSection = activeSection?.key === "bench";
  const benchSkatersToRender = Array.isArray(activeSection?.benchSkaters)
    ? activeSection.benchSkaters
    : [];
  const benchGoaliesToRender = Array.isArray(activeSection?.benchGoalies)
    ? activeSection.benchGoalies
    : [];
  const shouldSplitByStarter =
    isFinished && activeSection?.splitByStarter === true;
  const starterPlayersToRender = useMemo(() => {
    if (!shouldSplitByStarter) return [];
    return players.filter((player) => isShiftStarter(player));
  }, [isShiftStarter, players, shouldSplitByStarter]);
  const starterIdentitySet = useMemo(() => {
    const set = new Set();
    starterPlayersToRender.forEach((player) => {
      set.add(benchIdentity(player));
    });
    return set;
  }, [starterPlayersToRender]);
  const nonStarterPlayersToRender = useMemo(() => {
    if (!shouldSplitByStarter) return players;
    return players.filter(
      (player) => !starterIdentitySet.has(benchIdentity(player)),
    );
  }, [players, shouldSplitByStarter, starterIdentitySet]);
  const starterDividerLabel =
    activeSection?.key === "goalies" ? "STARTER" : "STARTERS";

  return (
    <View style={{ paddingBottom: 24 }}>
      {sections.length > 1 ? (
        <View style={styles.nhlRosterSectionToggle}>
          {sections.map((section) => (
            <TouchableOpacity
              key={section.key}
              style={[
                styles.nhlRosterSectionBtn,
                sectionKey === section.key && styles.nhlRosterSectionBtnActive,
              ]}
              onPress={() => setSectionKey(section.key)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.nhlRosterSectionLabel,
                  {
                    color:
                      sectionKey === section.key
                        ? theme.text
                        : theme.textSecondary,
                  },
                ]}
              >
                {section.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {useSeasonStatsFallback && players.length > 0 && (
        <Text style={[styles.nhlRosterSeasonStatsLabel, { color: theme.text }]}>
          SEASON STATS
        </Text>
      )}

      {isBenchSection ? (
        <>
          {benchSkatersToRender.map((player) => (
            <NHLRosterPlayerCard
              key={player.key}
              player={player}
              theme={theme}
              teamColor={teamColor}
              isScheduled={!!game?.isPre}
              showStats
              onPress={
                typeof onPlayerPress === "function"
                  ? () => onPlayerPress(player)
                  : undefined
              }
            />
          ))}

          {benchGoaliesToRender.length > 0 ? (
            <Text
              style={[styles.nhlRosterSeasonStatsLabel, { color: theme.text }]}
            >
              GOALIES
            </Text>
          ) : null}

          {benchGoaliesToRender.map((player) => (
            <NHLRosterPlayerCard
              key={player.key}
              player={player}
              theme={theme}
              teamColor={teamColor}
              isScheduled={!!game?.isPre}
              showStats
              onPress={
                typeof onPlayerPress === "function"
                  ? () => onPlayerPress(player)
                  : undefined
              }
            />
          ))}
        </>
      ) : isOnIceSection ? (
        <>
          {players.map((player) => (
            <NHLRosterPlayerCard
              key={player.key}
              player={player}
              theme={theme}
              teamColor={teamColor}
              isScheduled={!!game?.isPre}
              showStats
              onPress={
                typeof onPlayerPress === "function"
                  ? () => onPlayerPress(player)
                  : undefined
              }
            />
          ))}

          {penaltyBoxPlayersToRender.length > 0 ? (
            <Text
              style={[styles.nhlRosterSeasonStatsLabel, { color: theme.error }]}
            >
              PENALTY BOX
            </Text>
          ) : null}

          {penaltyBoxPlayersToRender.map((player) => (
            <NHLRosterPlayerCard
              key={player.key}
              player={player}
              theme={theme}
              teamColor={teamColor}
              isScheduled={!!game?.isPre}
              showStats
              onPress={
                typeof onPlayerPress === "function"
                  ? () => onPlayerPress(player)
                  : undefined
              }
            />
          ))}
        </>
      ) : shouldSplitByStarter ? (
        <>
          {starterPlayersToRender.length > 0 ? (
            <Text
              style={[styles.nhlRosterSeasonStatsLabel, { color: theme.text }]}
            >
              {starterDividerLabel}
            </Text>
          ) : null}

          {starterPlayersToRender.map((player) => (
            <NHLRosterPlayerCard
              key={player.key}
              player={player}
              theme={theme}
              teamColor={teamColor}
              isScheduled={!!game?.isPre}
              showStats
              onPress={
                typeof onPlayerPress === "function"
                  ? () => onPlayerPress(player)
                  : undefined
              }
            />
          ))}

          {nonStarterPlayersToRender.length > 0 ? (
            <Text
              style={[styles.nhlRosterSeasonStatsLabel, { color: theme.text }]}
            >
              BENCH
            </Text>
          ) : null}

          {nonStarterPlayersToRender.map((player) => (
            <NHLRosterPlayerCard
              key={player.key}
              player={player}
              theme={theme}
              teamColor={teamColor}
              isScheduled={!!game?.isPre}
              showStats
              onPress={
                typeof onPlayerPress === "function"
                  ? () => onPlayerPress(player)
                  : undefined
              }
            />
          ))}
        </>
      ) : (
        players.map((player) => (
          <NHLRosterPlayerCard
            key={player.key}
            player={player}
            theme={theme}
            teamColor={teamColor}
            isScheduled={!!game?.isPre}
            showStats={activeSection?.key !== "injured"}
            onPress={
              activeSection?.key !== "injured" &&
              typeof onPlayerPress === "function"
                ? () => onPlayerPress(player)
                : undefined
            }
          />
        ))
      )}

      {players.length === 0 ? (
        <Text style={[styles.nhlRosterEmpty, { color: theme.textSecondary }]}>
          No roster data available.
        </Text>
      ) : null}
    </View>
  );
};

const NHLStatsSection = ({ game, theme, homeColor, awayColor }) => {
  const isScheduled = !!game?.isPre;

  const scheduledRows = useMemo(() => {
    const away =
      game?.teamSeasonStats && typeof game.teamSeasonStats === "object"
        ? game.teamSeasonStats.awayTeam || {}
        : {};
    const home =
      game?.teamSeasonStats && typeof game.teamSeasonStats === "object"
        ? game.teamSeasonStats.homeTeam || {}
        : {};

    const keys = Array.from(
      new Set([...Object.keys(away || {}), ...Object.keys(home || {})]),
    )
      .filter((key) => !/Rank$/i.test(key))
      .filter((key) => {
        const a = Number(away?.[key]);
        const h = Number(home?.[key]);
        return Number.isFinite(a) || Number.isFinite(h);
      });

    const formatVal = (key, value, rank) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return "-";
      const isPct = /pctg|pct|percentage/i.test(key);
      const display = isPct
        ? `${(n <= 1 ? n * 100 : n).toFixed(1)}%`
        : `${Number.isInteger(n) ? n : n.toFixed(2).replace(/\.00$/, "")}`;
      const ord = toOrdinal(rank);
      return ord ? `${display} (${ord})` : display;
    };

    return keys.map((key, idx) => {
      const awayNum = Number(away?.[key]);
      const homeNum = Number(home?.[key]);
      return {
        key: `${key}_${idx}`,
        category: key,
        awayNum: Number.isFinite(awayNum) ? awayNum : 0,
        homeNum: Number.isFinite(homeNum) ? homeNum : 0,
        awayText: formatVal(key, away?.[key], Number(away?.[`${key}Rank`])),
        homeText: formatVal(key, home?.[key], Number(home?.[`${key}Rank`])),
      };
    });
  }, [game?.teamSeasonStats]);

  const { faceoffWins, faceoffPct, sog, others } = useMemo(() => {
    const rows = (Array.isArray(game?.teamGameStats) ? game.teamGameStats : [])
      .map((row, idx) => {
        const category = String(row?.category || `stat_${idx}`);
        const key = category.toLowerCase();
        const homeRaw = row?.homeValue;
        const awayRaw = row?.awayValue;
        return {
          key: `${category}_${idx}`,
          category,
          keyNorm: key,
          homeText: String(homeRaw ?? "0"),
          awayText: String(awayRaw ?? "0"),
          homeNum: parseStatPrimaryNumber(homeRaw),
          awayNum: parseStatPrimaryNumber(awayRaw),
        };
      })
      .filter((row) => row.category);

    const toPctBase = (key) =>
      String(key || "")
        .replace(/percentage$/i, "")
        .replace(/pctg$/i, "")
        .replace(/pct$/i, "");

    const percentByBase = new Map(
      rows
        .filter((row) => /percentage$|pctg$|pct$/i.test(row.keyNorm))
        .map((row) => [toPctBase(row.keyNorm), row]),
    );

    const faceoff = rows.find((row) => row.keyNorm === "faceoffwins") || null;
    const faceoffPct =
      rows.find((row) => row.keyNorm === "faceoffwinningpctg") || null;
    const sogRow = rows.find((row) => row.keyNorm === "sog") || null;
    const rest = rows
      .filter((row) => {
        if (row.keyNorm === "faceoffwins" || row.keyNorm === "sog")
          return false;
        if (row.keyNorm === "faceoffwinningpctg") return false;
        if (/percentage$|pctg$|pct$/i.test(row.keyNorm)) return false;
        return true;
      })
      .map((row) => {
        const pctRow = percentByBase.get(row.keyNorm);

        const formatPct = (v) => {
          const n = Number(v);
          if (!Number.isFinite(n)) return null;
          const pct = n <= 1 ? n * 100 : n;
          return `${pct.toFixed(1)}%`;
        };

        const awayPct = pctRow ? formatPct(pctRow.awayNum) : null;
        const homePct = pctRow ? formatPct(pctRow.homeNum) : null;

        return {
          ...row,
          awayText: awayPct ? `${row.awayText} (${awayPct})` : row.awayText,
          homeText: homePct ? `${row.homeText} (${homePct})` : row.homeText,
        };
      });

    return {
      faceoffWins: faceoff,
      faceoffPct,
      sog: sogRow,
      others: rest,
    };
  }, [game?.teamGameStats]);

  const renderBarStat = (row) => {
    const total = row.homeNum + row.awayNum;
    const homeShare = total > 0 ? row.homeNum / total : 0.5;
    const awayShare = total > 0 ? row.awayNum / total : 0.5;

    return (
      <View key={row.key} style={styles.nhlStatRowWrap}>
        <View style={styles.nhlStatValueRow}>
          <Text style={[styles.nhlStatValueText, { color: theme.text }]}>
            {row.awayText}
          </Text>
          <Text style={[styles.nhlStatValueText, { color: theme.text }]}>
            {row.homeText}
          </Text>
        </View>

        <View
          style={[
            styles.nhlStatBarTrack,
            { backgroundColor: theme.surfaceSecondary },
          ]}
        >
          <View
            style={[
              styles.nhlStatBarFillLeft,
              {
                width: `${Math.max(0, Math.min(100, awayShare * 100))}%`,
                backgroundColor: awayColor,
              },
            ]}
          />
          <View
            style={[
              styles.nhlStatBarFillRight,
              {
                width: `${Math.max(0, Math.min(100, homeShare * 100))}%`,
                backgroundColor: homeColor,
              },
            ]}
          />
        </View>

        <Text
          style={[styles.nhlStatCategoryLabel, { color: theme.textSecondary }]}
          numberOfLines={2}
        >
          {formatStatLabel(row.category).toUpperCase()}
        </Text>
      </View>
    );
  };

  const renderFaceoff = () => {
    if (!faceoffWins) return null;
    const total = faceoffWins.homeNum + faceoffWins.awayNum;
    const homeShareRaw = total > 0 ? faceoffWins.homeNum / total : 0.5;
    const awayShareRaw = total > 0 ? faceoffWins.awayNum / total : 0.5;
    const homeShare = Number.isFinite(Number(faceoffPct?.homeNum))
      ? Math.max(
          0,
          Math.min(
            1,
            Number(faceoffPct.homeNum) <= 1
              ? Number(faceoffPct.homeNum)
              : Number(faceoffPct.homeNum) / 100,
          ),
        )
      : homeShareRaw;
    const awayShare = Number.isFinite(Number(faceoffPct?.awayNum))
      ? Math.max(
          0,
          Math.min(
            1,
            Number(faceoffPct.awayNum) <= 1
              ? Number(faceoffPct.awayNum)
              : Number(faceoffPct.awayNum) / 100,
          ),
        )
      : awayShareRaw;

    const radius = 52;
    const stroke = 20;
    const size = radius * 2 + stroke * 2;
    const c = 2 * Math.PI * radius;
    const homeLen = c * Math.max(0, Math.min(1, homeShare));

    const awayPctText = `${(awayShare * 100).toFixed(1)}%`;
    const homePctText = `${(homeShare * 100).toFixed(1)}%`;

    return (
      <View style={[styles.nhlFeatureBlock, { marginBottom: -16 }]}>
        <Text style={[styles.nhlFeatureLabel, { color: theme.textSecondary }]}>
          Faceoff Wins
        </Text>

        <View style={styles.nhlFeatureValuesRow}>
          <Text style={[styles.nhlFeatureValueText, { color: theme.text }]}>
            {faceoffWins.awayText}
          </Text>

          <View style={styles.nhlFaceoffRingWrap}>
            <Svg
              width={size}
              height={size}
              style={{ transform: [{ rotate: "-90deg" }] }}
            >
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={awayColor}
                strokeWidth={stroke}
                fill="none"
              />
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={homeColor}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={`${homeLen} ${Math.max(0, c - homeLen)}`}
                strokeLinecap="butt"
              />
            </Svg>
            <View
              style={[
                styles.nhlFaceoffRingInner,
                { backgroundColor: theme.surface },
              ]}
            >
              <Text
                style={[
                  styles.nhlFaceoffPctText,
                  styles.nhlFaceoffPctLeft,
                  { color: theme.text },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {awayPctText}
              </Text>
              <View
                style={[
                  styles.nhlFaceoffSplitLine,
                  { backgroundColor: theme.border },
                ]}
              />
              <Text
                style={[
                  styles.nhlFaceoffPctText,
                  styles.nhlFaceoffPctRight,
                  { color: theme.text },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {homePctText}
              </Text>
            </View>
          </View>

          <Text style={[styles.nhlFeatureValueText, { color: theme.text }]}>
            {faceoffWins.homeText}
          </Text>
        </View>
      </View>
    );
  };

  const renderSog = () => {
    if (!sog) return null;
    const total = sog.homeNum + sog.awayNum;
    const homeShare = total > 0 ? sog.homeNum / total : 0.5;
    const awayShare = total > 0 ? sog.awayNum / total : 0.5;
    const awayWidth = `${Math.max(0, Math.min(100, awayShare * 100))}%`;
    const homeWidth = `${Math.max(0, Math.min(100, homeShare * 100))}%`;

    return (
      <View style={[styles.nhlFeatureBlock, styles.nhlSogBlockGap]}>
        <Text style={[styles.nhlFeatureLabel, { color: theme.textSecondary }]}>
          SHOTS ON GOAL
        </Text>

        <View
          style={[
            styles.nhlShotsSimpleOuter,
            {
              borderColor: theme.border,
              backgroundColor: theme.surface,
            },
          ]}
        >
          <View
            style={[
              styles.nhlShotsSimpleInner,
              {
                borderColor: "#ccc",
                backgroundColor: theme.surface,
              },
            ]}
          >
            <View style={styles.nhlShotsSimpleInnerValues}>
              <View
                style={[
                  styles.nhlShotsSimpleFillLeft,
                  {
                    width: awayWidth,
                    backgroundColor: awayColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.nhlShotsSimpleInnerValueText,
                    { color: "#fff" },
                  ]}
                >
                  {sog.awayText}
                </Text>
              </View>
              <View
                style={[
                  styles.nhlShotsSimpleFillRight,
                  {
                    width: homeWidth,
                    backgroundColor: homeColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.nhlShotsSimpleInnerValueText,
                    { color: "#fff" },
                  ]}
                >
                  {sog.homeText}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View
      style={[
        styles.nhlStatsCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View
        style={[styles.nhlStatsHeaderRow, { borderBottomColor: theme.border }]}
      >
        <Text style={[styles.nhlStatsHeaderTitle, { color: theme.text }]}>
          Stats
        </Text>
      </View>

      <View style={styles.nhlStatsBody}>
        {isScheduled
          ? scheduledRows.map(renderBarStat)
          : [renderFaceoff(), renderSog(), ...others.map(renderBarStat)]}

        {isScheduled && scheduledRows.length === 0 ? (
          <Text
            style={[styles.nhlStatsEmptyText, { color: theme.textTertiary }]}
          >
            No stats available
          </Text>
        ) : null}

        {!isScheduled && !faceoffWins && !sog && others.length === 0 ? (
          <Text
            style={[styles.nhlStatsEmptyText, { color: theme.textTertiary }]}
          >
            No stats available
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const LivePlaySection = ({ game, theme, colors, onPlayerPress }) => {
  if (!isNhlGameLive(game)) return null;

  const seasonCode = useMemo(() => getNhlSeasonSpan(), []);

  const awayTeamId = Number(game?.away?.id);
  const homeTeamId = Number(game?.home?.id);
  const awayAbbr = String(game?.away?.abbreviation || "AWY").toUpperCase();
  const homeAbbr = String(game?.home?.abbreviation || "HME").toUpperCase();
  const awayName = String(game?.away?.name || "Away Team").trim();
  const homeName = String(game?.home?.name || "Home Team").trim();
  const awayLogo = String(game?.away?.logo || "").trim();
  const homeLogo = String(game?.home?.logo || "").trim();
  const awayColor = NHLService.getTeamColor(awayAbbr, colors.primary);
  const homeColor = NHLService.getTeamColor(homeAbbr, colors.primary);

  const playerMetaById =
    game?.playerMetaById && typeof game.playerMetaById === "object"
      ? game.playerMetaById
      : {};

  const rosterSpotById = useMemo(() => {
    const map = {};
    const spots = Array.isArray(game?.playRosterSpots)
      ? game.playRosterSpots
      : [];
    spots.forEach((spot) => {
      const id = Number(spot?.playerId);
      if (!Number.isFinite(id)) return;
      map[id] = spot;
    });
    return map;
  }, [game?.playRosterSpots]);

  const boxscoreSideByPlayerId = useMemo(() => {
    const map = {};
    const mark = (entries, side) => {
      (Array.isArray(entries) ? entries : []).forEach((entry) => {
        const id = Number(
          entry?.playerId ?? entry?.id ?? entry?.personId ?? entry?.player?.id,
        );
        if (!Number.isFinite(id)) return;
        map[id] = side;
      });
    };
    const awayStats = game?.boxscorePlayerByGameStats?.awayTeam || {};
    const homeStats = game?.boxscorePlayerByGameStats?.homeTeam || {};
    [awayStats?.forwards, awayStats?.defense, awayStats?.goalies].forEach(
      (bucket) => mark(bucket, "away"),
    );
    [homeStats?.forwards, homeStats?.defense, homeStats?.goalies].forEach(
      (bucket) => mark(bucket, "home"),
    );
    return map;
  }, [game?.boxscorePlayerByGameStats]);

  const formatSavePct = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    const pct = n <= 1 ? n * 100 : n;
    return `${pct.toFixed(1)}%`;
  };

  const buildLivePlayStatItems = (player) => {
    const isGoalie =
      String(player?.position || "")
        .trim()
        .toUpperCase() === "G";

    if (isGoalie) {
      return [
        { label: "GA", value: toSafeStatValue(player?.stats?.goalsAgainst) },
        { label: "SA", value: toSafeStatValue(player?.stats?.shotsAgainst) },
        { label: "SV", value: toSafeStatValue(player?.stats?.saves) },
        { label: "SV%", value: formatSavePct(player?.stats?.savePctg) },
        { label: "TOI", value: String(player?.stats?.toi || "-") },
      ];
    }

    const plusMinusRaw = Number(player?.stats?.plusMinus);
    const plusMinusDisplay = Number.isFinite(plusMinusRaw)
      ? plusMinusRaw > 0
        ? `+${plusMinusRaw}`
        : String(plusMinusRaw)
      : "-";

    return [
      { label: "GLS", value: toSafeStatValue(player?.stats?.goals) },
      { label: "AST", value: toSafeStatValue(player?.stats?.assists) },
      { label: "PTS", value: toSafeStatValue(player?.stats?.points) },
      { label: "+/-", value: plusMinusDisplay },
      { label: "TOI", value: String(player?.stats?.toi || "-") },
    ];
  };

  const renderLivePlayPlayerRow = (
    player,
    side,
    teamColor,
    teamLogo,
    teamAbbr,
  ) => {
    const fullName = String(player?.name || "").trim() || "Unknown Player";
    const number =
      player?.number != null && Number.isFinite(Number(player.number))
        ? `#${Number(player.number)}`
        : "";
    const position = String(player?.position || "")
      .trim()
      .toUpperCase();
    const meta = [teamAbbr, number, position].filter(Boolean).join(" \u00B7 ");
    const statItems = buildLivePlayStatItems(player);

    const infoBlock = (
      <View
        style={
          side === "home"
            ? styles.livePlayPlayerInfoHome
            : styles.livePlayPlayerInfoAway
        }
      >
        <Text
          style={[styles.livePlayPlayerName, { color: theme.text }]}
          numberOfLines={1}
        >
          {fullName}
        </Text>
        {!!meta && (
          <Text
            style={[styles.livePlayPlayerMeta, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {meta}
          </Text>
        )}
        <View
          style={
            side === "home"
              ? styles.livePlayPlayerStatsRowHome
              : styles.livePlayPlayerStatsRowAway
          }
        >
          {statItems.map((item) => (
            <View
              key={`${player?.id || fullName}-${item.label}`}
              style={styles.livePlayPlayerStatCell}
            >
              <Text
                style={[styles.livePlayPlayerStatValue, { color: theme.text }]}
                numberOfLines={1}
              >
                {item.value}
              </Text>
              <Text
                style={[
                  styles.livePlayPlayerStatLabel,
                  { color: theme.textSecondary },
                ]}
              >
                {item.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );

    return (
      <View
        key={`${side}-${player?.id || fullName}`}
        style={[
          styles.livePlayPlayerRow,
          side === "home"
            ? styles.livePlayPlayerRowHome
            : styles.livePlayPlayerRowAway,
        ]}
      >
        {side === "home" ? infoBlock : null}
        <MatchupHeadshot
          playerId={player?.id}
          headshot={player?.headshot}
          seasonCode={seasonCode}
          teamAbbrev={teamAbbr}
          teamLogo={teamLogo}
          position={position || "-"}
          teamColor={teamColor}
          side={side}
          theme={theme}
          onPress={
            typeof onPlayerPress === "function"
              ? () => onPlayerPress(player)
              : undefined
          }
        />
        {side === "away" ? infoBlock : null}
      </View>
    );
  };

  const rows = useMemo(() => {
    const plays = Array.isArray(game?.plays) ? game.plays : [];
    const oppositeSide = (side) => (side === "home" ? "away" : "home");

    const resolvePlayPlayer = (playerId, sideHint) => {
      const id = Number(playerId);
      if (!Number.isFinite(id)) return null;

      const profile = playerMetaById[id] || {};
      const roster = rosterSpotById[id] || {};
      const boxscoreEntry = getNhlBoxscoreStatsByPlayerId(game, id) || {};
      const extractedStats = extractNhlStatsFromEntry(boxscoreEntry || {});

      const teamId = Number(profile?.teamId ?? roster?.teamId);
      let teamSide =
        teamId === awayTeamId
          ? "away"
          : teamId === homeTeamId
            ? "home"
            : boxscoreSideByPlayerId[id] || sideHint || null;
      if (teamSide !== "away" && teamSide !== "home") {
        teamSide = sideHint || null;
      }
      if (!teamSide) return null;

      const first = String(
        roster?.firstName || profile?.firstName || "",
      ).trim();
      const last = String(roster?.lastName || profile?.lastName || "").trim();
      const fullFromParts = [first, last].filter(Boolean).join(" ").trim();
      const fullName =
        getNhlDisplayName({ id, playerId: id }, game) ||
        fullFromParts ||
        String(profile?.name || boxscoreEntry?.name || "").trim() ||
        "Unknown Player";

      const number = Number(
        profile?.sweaterNumber ??
          roster?.sweaterNumber ??
          boxscoreEntry?.sweaterNumber,
      );
      const position = String(
        profile?.position ||
          roster?.positionCode ||
          boxscoreEntry?.position ||
          "",
      )
        .trim()
        .toUpperCase();

      const teamAbbrev = teamSide === "home" ? homeName : awayName;
      const stats = {
        ...(profile?.stats || {}),
        ...(extractedStats || {}),
      };
      const toi =
        String(
          stats?.toi ?? boxscoreEntry?.toi ?? profile?.stats?.toi ?? "",
        ).trim() || "-";

      return {
        id,
        playerId: id,
        name: fullName,
        firstName: first,
        lastName: last,
        number: Number.isFinite(number) ? number : null,
        position,
        teamId:
          teamSide === "home"
            ? homeTeamId
            : teamSide === "away"
              ? awayTeamId
              : null,
        teamAbbrev,
        teamName: teamSide === "home" ? game?.home?.name : game?.away?.name,
        teamSide,
        headshot:
          String(
            profile?.headshot ||
              roster?.headshot ||
              boxscoreEntry?.headshot ||
              "",
          ).trim() || null,
        stats: {
          ...stats,
          toi,
        },
      };
    };

    const playerSideHint = (key, ownerSide) => {
      const opposite = oppositeSide(ownerSide);
      const ownerKeys = new Set([
        "playerId",
        "scoringPlayerId",
        "shootingPlayerId",
        "hittingPlayerId",
        "committedByPlayerId",
        "winningPlayerId",
        "assist1PlayerId",
        "assist2PlayerId",
      ]);
      const opponentKeys = new Set([
        "hitteePlayerId",
        "blockingPlayerId",
        "drawnByPlayerId",
        "losingPlayerId",
        "goalieInNetId",
        "goalieId",
      ]);
      if (ownerKeys.has(key)) return ownerSide;
      if (opponentKeys.has(key)) return opposite;
      return null;
    };

    const playerIdKeys = [
      "playerId",
      "scoringPlayerId",
      "shootingPlayerId",
      "hittingPlayerId",
      "hitteePlayerId",
      "blockingPlayerId",
      "winningPlayerId",
      "losingPlayerId",
      "committedByPlayerId",
      "drawnByPlayerId",
      "goalieInNetId",
      "goalieId",
      "assist1PlayerId",
      "assist2PlayerId",
    ];

    return plays
      .map((play, idx) => {
        const details = play?.details || {};
        const xCoord = Number(details?.xCoord);
        const yCoord = Number(details?.yCoord);
        if (!Number.isFinite(xCoord) || !Number.isFinite(yCoord)) return null;

        const eventOwnerTeamId = Number(details?.eventOwnerTeamId);
        const eventTeamSide =
          eventOwnerTeamId === awayTeamId
            ? "away"
            : eventOwnerTeamId === homeTeamId
              ? "home"
              : null;
        if (!eventTeamSide) return null;

        const period = Number(play?.periodDescriptor?.number || 0);
        const periodType = String(
          play?.periodDescriptor?.periodType || "",
        ).toUpperCase();
        const remainingSecs = parseClockSecs(play?.timeRemaining);
        const playoffGame = isNhlPlayoffGameType(game?.gameType);
        const shootoutPeriod =
          periodType === "SO" || (!playoffGame && period >= 5);
        const overtimePeriod =
          !shootoutPeriod && (periodType === "OT" || period > 3);
        const periodLengthSecs = shootoutPeriod
          ? 0
          : overtimePeriod
            ? playoffGame
              ? 20 * 60
              : 5 * 60
            : 20 * 60;
        const elapsedSecs = Number.isFinite(remainingSecs)
          ? Math.max(0, periodLengthSecs - remainingSecs)
          : 0;

        const awayScore = Number(details?.awayScore);
        const homeScore = Number(details?.homeScore);

        const eventAbbr = eventTeamSide === "away" ? awayName : homeName;
        const teamColor = NHLService.getTeamColor(eventAbbr, colors.primary);
        const typeKey = String(play?.typeDescKey || "update").toLowerCase();

        const playersBySide = { away: [], home: [] };
        const seenPlayers = new Set();

        playerIdKeys.forEach((key) => {
          const sideHint = playerSideHint(key, eventTeamSide);
          const resolved = resolvePlayPlayer(details?.[key], sideHint);
          if (!resolved || !resolved?.teamSide) return;

          const dedupeKey = Number.isFinite(Number(resolved?.id))
            ? `id_${Number(resolved.id)}`
            : `${resolved.teamSide}_${String(resolved?.name || "")}`;
          if (seenPlayers.has(dedupeKey)) return;
          seenPlayers.add(dedupeKey);

          playersBySide[resolved.teamSide].push(resolved);
        });

        const topSide = eventTeamSide === "home" ? "home" : "away";
        const bottomSide = topSide === "home" ? "away" : "home";

        return {
          key: `${idx}-${typeKey}-${period}`,
          sortKey: period * 100000 + elapsedSecs * 10 + idx,
          typeKey,
          typeLabel: startCaseFromHyphen(typeKey).toUpperCase(),
          periodLabel: getScorerPeriodLabel(period, game?.gameType),
          timeRemaining: String(play?.timeRemaining || "--:--"),
          scoreText:
            Number.isFinite(awayScore) && Number.isFinite(homeScore)
              ? `${awayScore} - ${homeScore}`
              : `${Number(game?.away?.score || 0)} - ${Number(game?.home?.score || 0)}`,
          eventAbbr: eventAbbr.toUpperCase(),
          eventTeamSide,
          homeTeamDefendingSide: String(play?.homeTeamDefendingSide || "")
            .trim()
            .toLowerCase(),
          xCoord,
          yCoord,
          teamColor,
          topSide,
          bottomSide,
          awayPlayers: playersBySide.away,
          homePlayers: playersBySide.home,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.sortKey - a.sortKey);
  }, [
    awayAbbr,
    awayTeamId,
    colors.primary,
    game?.away?.score,
    game?.home?.score,
    game?.plays,
    game,
    homeAbbr,
    awayName,
    homeName,
    homeTeamId,
    playerMetaById,
    rosterSpotById,
    boxscoreSideByPlayerId,
  ]);

  const activeRow = rows.length > 0 ? rows[0] : null;

  return (
    <View
      style={[
        styles.livePlayCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View
        style={[
          styles.livePlayHeaderRow,
          { borderBottomColor: theme.border, backgroundColor: theme.surface },
        ]}
      >
        <View
          style={[
            styles.livePlayHeaderAccent,
            {
              backgroundColor: activeRow?.teamColor || colors.primary,
            },
          ]}
        />
        <Text style={[styles.livePlayHeaderTitle, { color: theme.text }]}>
          Live Play
        </Text>
        <Text
          style={[styles.livePlayHeaderCount, { color: theme.textSecondary }]}
        >
          LIVE
        </Text>
      </View>

      {!activeRow ? (
        <View style={styles.livePlayBody}>
          <Text
            style={[styles.livePlayEmptyText, { color: theme.textTertiary }]}
          >
            No live coordinate plays yet
          </Text>
        </View>
      ) : (
        <View style={styles.livePlayBody}>
          <View style={styles.livePlayMetaRow}>
            <Text style={[styles.livePlayTypeText, { color: theme.text }]}>
              {activeRow.typeLabel}
            </Text>
            <Text
              style={[styles.livePlayTimeText, { color: theme.textSecondary }]}
            >
              {activeRow.timeRemaining} {"\u2022"} {activeRow.periodLabel}
            </Text>
          </View>

          <View style={styles.livePlayMetaRow}>
            <Text
              style={[styles.livePlayTeamText, { color: activeRow.teamColor }]}
            >
              {activeRow.eventAbbr}
            </Text>
            <Text
              style={[styles.livePlayScoreText, { color: theme.textSecondary }]}
            >
              {activeRow.scoreText}
            </Text>
          </View>

          <View
            style={[
              styles.livePlayRinkWrap,
              {
                borderColor: activeRow.teamColor,
                backgroundColor: theme.surfaceSecondary,
                transform: [{ scaleY: -1 }],
              },
            ]}
          >
            <NHLRinkGraphic
              xCoord={activeRow.xCoord}
              yCoord={activeRow.yCoord}
              teamColor={activeRow.teamColor}
              teamSide={activeRow.eventTeamSide}
              homeTeamDefendingSide={activeRow.homeTeamDefendingSide}
              isScoring={activeRow.typeKey === "goal"}
              showTargetPath={
                activeRow.typeKey === "shot-on-goal" ||
                activeRow.typeKey === "goal"
              }
              orientation="horizontal"
            />
          </View>

          <View
            style={[
              styles.livePlayPlayersWrap,
              {
                borderColor: theme.border,
                backgroundColor: theme.surfaceSecondary,
              },
            ]}
          >
            {[activeRow.topSide, activeRow.bottomSide].map((side, idx) => {
              const teamColor = side === "home" ? homeColor : awayColor;
              const teamAbbr = side === "home" ? homeAbbr : awayAbbr;
              const teamName = side === "home" ? homeName : awayName;
              const teamLogo = side === "home" ? homeLogo : awayLogo;
              const sidePlayers =
                side === "home"
                  ? activeRow.homePlayers || []
                  : activeRow.awayPlayers || [];

              return (
                <View
                  key={`${activeRow.key}-${side}`}
                  style={[
                    styles.livePlayTeamPlayersBody,
                    idx === 0
                      ? {
                          borderBottomColor: theme.border,
                          borderBottomWidth: StyleSheet.hairlineWidth,
                        }
                      : null,
                  ]}
                >
                  <MatchupGoalieBodyGradient
                    gradId={`livePlayGrad-${side}-${activeRow.key}`}
                    color={teamColor}
                    reverse={side === "home"}
                  />

                  <View style={styles.livePlayTeamHeaderRow}>
                    <Text
                      style={[
                        styles.livePlayTeamHeaderAbbr,
                        { color: teamColor },
                      ]}
                    >
                      {teamName.toUpperCase()}
                    </Text>
                    <Text
                      style={[
                        styles.livePlayTeamHeaderHint,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {side === activeRow.eventTeamSide
                        ? "ON PLAY"
                        : "OPPONENT"}
                    </Text>
                  </View>

                  {sidePlayers.length > 0 ? (
                    sidePlayers.map((player) =>
                      renderLivePlayPlayerRow(
                        player,
                        side,
                        teamColor,
                        teamLogo,
                        teamAbbr,
                      ),
                    )
                  ) : (
                    <Text
                      style={[
                        styles.livePlayNoPlayersText,
                        {
                          color: theme.textSecondary,
                          textAlign: side === "home" ? "right" : "left",
                        },
                      ]}
                    >
                      No players tagged for this side
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
};

const EventsSection = ({
  game,
  theme,
  colors,
  onPlayerPress,
  onOpenGoalShare,
  getTeamLogoUrl,
}) => {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const awayAbbr = String(game?.away?.abbreviation || "").toUpperCase();
  const homeAbbr = String(game?.home?.abbreviation || "").toUpperCase();
  const awayName = toCapitalizedWords(
    game?.away?.name || game?.away?.abbreviation || "Away",
  );
  const homeName = toCapitalizedWords(
    game?.home?.name || game?.home?.abbreviation || "Home",
  );
  const live = isNhlGameLive(game);
  const playerMetaById =
    game?.playerMetaById && typeof game.playerMetaById === "object"
      ? game.playerMetaById
      : {};
  const playRosterSpots = Array.isArray(game?.playRosterSpots)
    ? game.playRosterSpots
    : [];

  const rosterSpotById = useMemo(() => {
    const map = {};
    playRosterSpots.forEach((spot) => {
      const id = Number(spot?.playerId);
      if (!Number.isFinite(id)) return;
      map[id] = spot;
    });
    return map;
  }, [playRosterSpots]);

  const makeNameKey = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const rosterPlayerIdByName = useMemo(() => {
    const map = {};
    playRosterSpots.forEach((spot) => {
      const id = Number(spot?.playerId);
      if (!Number.isFinite(id)) return;
      const fullName =
        `${String(spot?.firstName || "").trim()} ${String(spot?.lastName || "").trim()}`.trim();
      const key = makeNameKey(fullName);
      if (key) map[key] = id;
    });
    return map;
  }, [playRosterSpots]);

  const resolveEventPlayerMeta = (event) => {
    const id = Number(event?.playerId);
    if (!Number.isFinite(id)) return null;
    const profile = playerMetaById[id] || {};
    const rosterSpot = rosterSpotById[id] || {};
    const teamId = Number(profile?.teamId ?? rosterSpot?.teamId);
    const displayName =
      getNhlDisplayName({ id, playerId: id, name: event?.mainText }, game) ||
      String(event?.mainText || "").trim();
    let firstName = String(
      rosterSpot?.firstName || profile?.firstName || "",
    ).trim();
    let lastName = String(
      rosterSpot?.lastName || profile?.lastName || "",
    ).trim();
    if (!firstName && !lastName && displayName) {
      const parts = displayName.split(/\s+/).filter(Boolean);
      firstName = parts.slice(0, -1).join(" ");
      lastName = parts.slice(-1).join(" ");
    }
    const teamAbbrev =
      teamId === Number(game?.away?.id)
        ? game?.away?.abbreviation
        : teamId === Number(game?.home?.id)
          ? game?.home?.abbreviation
          : event?.teamAbbr || profile?.teamAbbrev;
    return {
      id,
      playerId: id,
      name: displayName || profile?.name || event?.mainText || "",
      firstName,
      lastName,
      headshot: profile?.headshot || rosterSpot?.headshot,
      teamId,
      teamAbbrev,
      teamSide:
        teamId === Number(game?.away?.id)
          ? "away"
          : teamId === Number(game?.home?.id)
            ? "home"
            : undefined,
      position: profile?.position,
      stats: profile?.stats || {},
      teamName:
        teamId === Number(game?.away?.id)
          ? game?.away?.name
          : teamId === Number(game?.home?.id)
            ? game?.home?.name
            : undefined,
    };
  };

  const resolveRelatedPlayerMetas = (event) => {
    const source = Array.isArray(event?.relatedPlayers)
      ? event.relatedPlayers
      : Array.isArray(event?.assistPlayers)
        ? event.assistPlayers
        : [];

    return source
      .map((related) => {
        const id = Number(related?.id ?? related?.playerId);
        if (!Number.isFinite(id)) {
          const looseName = String(related?.name || "").trim();
          if (!looseName) return null;
          return {
            id: null,
            playerId: null,
            name: looseName,
            firstName: "",
            lastName: "",
            headshot: null,
            teamAbbrev: event?.teamAbbr,
            teamName:
              event?.teamAbbr === awayAbbr
                ? game?.away?.name
                : event?.teamAbbr === homeAbbr
                  ? game?.home?.name
                  : undefined,
          };
        }

        const profile = playerMetaById[id] || {};
        const rosterSpot = rosterSpotById[id] || {};
        const name =
          getNhlDisplayName({ id, playerId: id, name: related?.name }, game) ||
          String(related?.name || "").trim();
        return {
          id,
          playerId: id,
          name,
          firstName:
            String(rosterSpot?.firstName || profile?.firstName || "").trim() ||
            "",
          lastName:
            String(rosterSpot?.lastName || profile?.lastName || "").trim() ||
            "",
          headshot: profile?.headshot || rosterSpot?.headshot || null,
          teamId: Number(profile?.teamId ?? rosterSpot?.teamId),
          teamAbbrev: profile?.teamAbbrev || event?.teamAbbr,
          teamName: profile?.teamName,
          position: profile?.position,
          stats: profile?.stats || {},
        };
      })
      .filter((meta) => !!meta?.name);
  };

  const openPlayerModalFromMeta = (meta) => {
    if (!meta?.playerId || !onPlayerPress) return;
    onPlayerPress(meta);
    setSelectedEvent(null);
  };

  const openGoalShareFromEvent = (event) => {
    if (!onOpenGoalShare || event?.type !== "goal") return;
    const scorerId = Number(event?.playerId);
    if (!Number.isFinite(scorerId)) return;

    const normalizeClockString = (clock) => {
      const raw = String(clock || "").trim();
      const secs = parseClockSecs(raw);
      if (Number.isFinite(secs)) return formatRemainingClock(secs);
      return raw;
    };

    const periodType = String(event?.periodType || "REG").toUpperCase();
    const timeInPeriodRaw = String(event?.timeInPeriod || "").trim();
    const parsedTimeInPeriod = parseClockSecs(timeInPeriodRaw);
    const periodLengthSecs = periodType === "REG" ? 20 * 60 : 5 * 60;
    const convertedTimeRemaining = Number.isFinite(parsedTimeInPeriod)
      ? formatRemainingClock(Math.max(0, periodLengthSecs - parsedTimeInPeriod))
      : timeInPeriodRaw;
    const normalizedConvertedTime = normalizeClockString(
      convertedTimeRemaining,
    );
    const normalizedRawTime = normalizeClockString(timeInPeriodRaw);
    const allPlays = Array.isArray(game?.plays) ? game.plays : [];
    const matchedGoalPlay =
      allPlays.find((play) => {
        const playIsGoal =
          Number(play?.typeCode) === 505 ||
          String(play?.typeDescKey || "").toLowerCase() === "goal";
        if (!playIsGoal) return false;
        const playPeriod = Number(play?.periodDescriptor?.number || 0);
        if (playPeriod !== Number(event?.period || 0)) return false;
        const playScorer = Number(play?.details?.scoringPlayerId);
        if (playScorer !== scorerId) return false;
        return (
          normalizeClockString(play?.timeRemaining) === normalizedConvertedTime
        );
      }) ||
      allPlays.find((play) => {
        const playIsGoal =
          Number(play?.typeCode) === 505 ||
          String(play?.typeDescKey || "").toLowerCase() === "goal";
        if (!playIsGoal) return false;
        const playPeriod = Number(play?.periodDescriptor?.number || 0);
        if (playPeriod !== Number(event?.period || 0)) return false;
        const playScorer = Number(play?.details?.scoringPlayerId);
        if (playScorer !== scorerId) return false;
        return normalizeClockString(play?.timeRemaining) === normalizedRawTime;
      }) ||
      null;

    const matchedDetails = matchedGoalPlay?.details || {};
    const matchedTeamId = Number(matchedDetails?.eventOwnerTeamId);
    const matchedTeamAbbr =
      matchedTeamId === Number(game?.away?.id)
        ? String(game?.away?.abbreviation || "").toUpperCase()
        : matchedTeamId === Number(game?.home?.id)
          ? String(game?.home?.abbreviation || "").toUpperCase()
          : String(event?.teamAbbr || "").toUpperCase();
    const matchedTeamSide =
      matchedTeamId === Number(game?.away?.id)
        ? "away"
        : matchedTeamId === Number(game?.home?.id)
          ? "home"
          : String(event?.teamAbbr || "").toUpperCase() ===
              String(game?.away?.abbreviation || "").toUpperCase()
            ? "away"
            : "home";

    const scorerProfile = playerMetaById[scorerId] || {};
    const rosterSpot = rosterSpotById[scorerId] || {};
    const scorerSeasonTotal = Number(matchedDetails?.scoringPlayerTotal);
    const shotType = String(matchedDetails?.shotType || "").toLowerCase();
    const scorer = {
      ...scorerProfile,
      id: scorerId,
      playerId: scorerId,
      firstName:
        String(
          rosterSpot?.firstName || scorerProfile?.firstName || "",
        ).trim() || undefined,
      lastName:
        String(rosterSpot?.lastName || scorerProfile?.lastName || "").trim() ||
        undefined,
      name:
        getNhlDisplayName({ id: scorerId, playerId: scorerId }, game) ||
        scorerProfile?.name ||
        String(event?.mainText || "").trim() ||
        "Unknown Player",
      headshot: scorerProfile?.headshot || rosterSpot?.headshot || null,
    };
    const assistEntries = [1, 2]
      .map((idx) => {
        const id = Number(
          matchedDetails?.[idx === 1 ? "assist1PlayerId" : "assist2PlayerId"],
        );
        if (!Number.isFinite(id)) return null;
        const profile = playerMetaById[id] || {};
        const spot = rosterSpotById[id] || {};
        const assistName =
          getNhlDisplayName({ id, playerId: id }, game) ||
          String(profile?.name || "").trim();
        if (!assistName) return null;
        const sweater = Number.isFinite(Number(spot?.sweaterNumber))
          ? ` (#${Number(spot.sweaterNumber)})`
          : "";
        const total = Number(
          matchedDetails?.[
            idx === 1 ? "assist1PlayerTotal" : "assist2PlayerTotal"
          ],
        );
        const totalText = Number.isFinite(total) ? ` (${total})` : "";
        return {
          name: assistName,
          detail: `${assistName}${sweater}${totalText}`,
        };
      })
      .filter(Boolean);
    const assistsText =
      assistEntries.length > 0
        ? assistEntries.map((entry) => entry.name).join(", ")
        : String(event?.assistNames || "").trim();
    const assistDetailText =
      assistEntries.length > 0
        ? assistEntries.map((entry) => entry.detail).join(", ")
        : String(event?.assistDetailText || event?.subText || "").trim();
    const normalizedAssistDetailText = assistDetailText.replace(
      /^Assists:\s*/i,
      "",
    );
    const teamName =
      matchedTeamSide === "away"
        ? game?.away?.name || game?.away?.abbreviation
        : game?.home?.name || game?.home?.abbreviation;
    const scorerSweater = Number.isFinite(Number(rosterSpot?.sweaterNumber))
      ? ` (#${Number(rosterSpot.sweaterNumber)})`
      : "";
    const seasonTotalLabel = Number.isFinite(scorerSeasonTotal)
      ? toOrdinal(scorerSeasonTotal)
      : null;
    const mainCommentFromPlay =
      `${scorer.name}${scorerSweater} scores for ${teamName}${shotType ? ` with a ${shotType} shot` : ""}.${seasonTotalLabel ? ` His ${seasonTotalLabel} goal of the season.` : ""}`.trim();
    const comment = [
      mainCommentFromPlay ||
        String(event?.mainComment || "").trim() ||
        String(event?.mainText || "").trim(),
      normalizedAssistDetailText
        ? `Assisted by: ${normalizedAssistDetailText}`
        : assistsText
          ? `Assisted by: ${assistsText}`
          : "",
    ]
      .filter(Boolean)
      .join(" ");
    const payload = buildNhlGoalSharePayload({
      game,
      scorer,
      assistName: assistsText,
      minuteLabel: event?.timeInPeriod,
      periodLabel: getPeriodHeaderLabel(event?.period || 0, game?.gameType),
      scoreAfter: {
        away: event?.awayScoreAfter,
        home: event?.homeScoreAfter,
      },
      goalSituation: deriveNhlGoalSituation(
        {
          away: event?.awayScoreAfter,
          home: event?.homeScoreAfter,
        },
        matchedTeamSide,
      ),
      comment,
      teamAbbr: matchedTeamAbbr || event?.teamAbbr,
      teamSide: matchedTeamSide,
      homeTeamDefendingSide:
        matchedGoalPlay?.homeTeamDefendingSide || event?.homeTeamDefendingSide,
      xCoord: matchedDetails?.xCoord,
      yCoord: matchedDetails?.yCoord,
      isScoring: true,
      getTeamLogoUrl,
    });
    if (payload) {
      setSelectedEvent(null);
      onOpenGoalShare(payload);
    }
  };

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
      const periodType = String(
        periodBlock?.periodDescriptor?.periodType || "REG",
      ).toUpperCase();
      const playoffGame = isNhlPlayoffGameType(game?.gameType);
      if (periodType === "SO" || (!playoffGame && periodNumber >= 5)) return;
      const goals = Array.isArray(periodBlock?.goals) ? periodBlock.goals : [];
      goals.forEach((goal) => {
        const time = goal?.timeInPeriod || goal?.timeRemaining || "";
        const assists = Array.isArray(goal?.assists) ? goal.assists : [];
        const scorerId = Number(
          goal?.scoringPlayerId ??
            goal?.playerId ??
            goal?.player?.id ??
            goal?.player?.playerId,
        );
        const homeScoreAfter = Number(goal?.homeScore ?? goal?.scoreHome);
        const awayScoreAfter = Number(goal?.awayScore ?? goal?.scoreAway);
        const scorerName = Number.isFinite(scorerId)
          ? getNhlDisplayName(
              {
                id: scorerId,
                playerId: scorerId,
                firstName: goal?.firstName,
                lastName: goal?.lastName,
                name: goal?.name,
              },
              game,
            )
          : toDisplayName(goal);
        const assistPlayers = assists
          .map((a) => {
            const assistId = Number(a?.playerId ?? a?.id);
            const assistName = Number.isFinite(assistId)
              ? getNhlDisplayName(
                  {
                    id: assistId,
                    playerId: assistId,
                    firstName: a?.firstName,
                    lastName: a?.lastName,
                    name: a?.name,
                  },
                  game,
                )
              : toDisplayName(a);
            return {
              id: Number.isFinite(assistId) ? assistId : null,
              name: assistName || toDisplayName(a),
            };
          })
          .filter((a) => String(a?.name || "").trim());
        const assistsLine = assistPlayers
          .map((a) => a.name)
          .filter(Boolean)
          .join(", ");
        const assistLineDetails = assistPlayers
          .map((a) => {
            const assistId = Number(a?.id);
            const assistProfile = Number.isFinite(assistId)
              ? playerMetaById[assistId] || {}
              : {};
            const assistSpot = Number.isFinite(assistId)
              ? rosterSpotById[assistId] || {}
              : {};
            const assistName = String(a?.name || "").trim();
            if (!assistName) return "";
            const sweater = Number.isFinite(Number(assistSpot?.sweaterNumber))
              ? ` (#${Number(assistSpot.sweaterNumber)})`
              : "";
            const totalRaw =
              a?.total ??
              assistProfile?.assists ??
              assistProfile?.assistTotal ??
              assistProfile?.assistsToDate;
            const total = Number(totalRaw);
            const totalText = Number.isFinite(total) ? ` (${total})` : "";
            return `${assistName}${sweater}${totalText}`;
          })
          .filter(Boolean)
          .join(", ");
        pushEvent(periodNumber, {
          type: "goal",
          teamAbbr: String(goal?.teamAbbrev || "").toUpperCase(),
          timeInPeriod: time,
          sortSecs: parseClockSecs(time),
          playerId: Number.isFinite(scorerId) ? scorerId : null,
          mainText: scorerName,
          mainComment: `${scorerName} scored.`,
          assistNames: assistsLine,
          assistDetailText: assistLineDetails,
          assistPlayers,
          relatedPlayers: assistPlayers,
          homeScoreAfter: Number.isFinite(homeScoreAfter)
            ? homeScoreAfter
            : null,
          awayScoreAfter: Number.isFinite(awayScoreAfter)
            ? awayScoreAfter
            : null,
          subText: assistsLine ? `Assists: ${assistsLine}` : "",
          period: periodNumber,
          periodType,
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
        const committedPlayerIdRaw =
          penalty?.committedByPlayerId ??
          penalty?.commitedByPlayerId ??
          penalty?.playerId ??
          penalty?.details?.committedByPlayerId ??
          penalty?.details?.commitedByPlayerId ??
          penalty?.details?.playerId ??
          committedBy?.playerId ??
          committedBy?.id;
        const committedByName =
          toDisplayName(committedBy) ||
          String(penalty?.committedBy || penalty?.commitedBy || "").trim();
        const parsedCommittedPlayerId = Number(committedPlayerIdRaw);
        const resolvedPenaltyPlayerId = Number.isFinite(parsedCommittedPlayerId)
          ? parsedCommittedPlayerId
          : (rosterPlayerIdByName[makeNameKey(committedByName)] ?? null);
        const resolvedPenaltyName = Number.isFinite(resolvedPenaltyPlayerId)
          ? getNhlDisplayName(
              {
                id: resolvedPenaltyPlayerId,
                playerId: resolvedPenaltyPlayerId,
              },
              game,
            )
          : committedByName;
        const drawnByRawId = Number(
          penalty?.details?.drawnByPlayerId ??
            penalty?.drawnByPlayerId ??
            penalty?.drawnBy?.playerId ??
            penalty?.drawnBy?.id,
        );
        const drawnById = Number.isFinite(drawnByRawId) ? drawnByRawId : null;
        const drawnByName = Number.isFinite(drawnById)
          ? getNhlDisplayName({ id: drawnById, playerId: drawnById }, game)
          : String(
              penalty?.drawnByPlayerName ||
                penalty?.drawnBy?.name ||
                penalty?.details?.drawnByPlayerName ||
                "",
            ).trim();
        const relatedPlayers = drawnByName
          ? [{ id: drawnById, name: drawnByName }]
          : [];
        const penaltyTeamAbbr = String(
          penalty?.teamAbbrev ||
            penalty?.teamAbbr ||
            penalty?.committedByTeamAbbrev ||
            penalty?.commitedByTeamAbbrev ||
            "",
        ).toUpperCase();
        const fallbackPenaltyName =
          penaltyTeamAbbr === awayAbbr
            ? awayName.toUpperCase()
            : penaltyTeamAbbr === homeAbbr
              ? homeName.toUpperCase()
              : "Unknown";
        pushEvent(periodNumber, {
          type: "penalty",
          teamAbbr: penaltyTeamAbbr,
          timeInPeriod: time,
          sortSecs: parseClockSecs(time),
          playerId: resolvedPenaltyPlayerId,
          mainText: resolvedPenaltyName || fallbackPenaltyName,
          relatedPlayers,
          subText: formatPenaltyLine(penalty),
          period: periodNumber,
        });
      });
    });

    const shouldUseShootout = !isNhlPlayoffGameType(game?.gameType);
    const shootoutLiveScore =
      shouldUseShootout &&
      game?.summaryShootout &&
      typeof game.summaryShootout === "object"
        ? game.summaryShootout.liveScore || {}
        : {};
    const shootoutEvents =
      shouldUseShootout && Array.isArray(game?.summaryShootout?.events)
        ? game.summaryShootout.events
        : [];
    shootoutEvents.forEach((attempt, index) => {
      const playerId = Number(attempt?.playerId);
      const firstName = String(
        attempt?.firstName?.default || attempt?.firstName || "",
      ).trim();
      const lastName = String(
        attempt?.lastName?.default || attempt?.lastName || "",
      ).trim();
      const fullName = `${firstName} ${lastName}`.trim();
      const teamAbbr = String(
        attempt?.teamAbbrev?.default || attempt?.teamAbbrev || "",
      )
        .trim()
        .toUpperCase();
      const shotType = startCaseFromHyphen(attempt?.shotType) + " Shot";
      const result = startCaseFromHyphen(attempt?.result);
      const detailLine = [shotType, result].filter(Boolean).join(" - ");
      const awayScore = Number(
        attempt?.awayScore ??
          attempt?.awayScoreAfter ??
          shootoutLiveScore?.away ??
          null,
      );
      const homeScore = Number(
        attempt?.homeScore ??
          attempt?.homeScoreAfter ??
          shootoutLiveScore?.home ??
          null,
      );

      pushEvent(5, {
        type: "shootout",
        teamAbbr,
        timeInPeriod: `SO ${index + 1}`,
        sortSecs: index + 1,
        playerId: Number.isFinite(playerId) ? playerId : null,
        mainText: fullName || "Shootout Attempt",
        subText: detailLine,
        shotResult: String(attempt?.result || "")
          .trim()
          .toLowerCase(),
        shotType: String(attempt?.shotType || "")
          .trim()
          .toLowerCase(),
        homeScoreAfter: Number.isFinite(homeScore) ? homeScore : null,
        awayScoreAfter: Number.isFinite(awayScore) ? awayScore : null,
        period: 5,
        periodType: "SO",
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
  }, [game, live, playerMetaById, rosterPlayerIdByName, rosterSpotById]);

  if (periods.length === 0) return null;

  return (
    <>
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
                    {getPeriodHeaderLabel(period, game?.gameType)}
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
                    const relatedList = Array.isArray(event?.relatedPlayers)
                      ? event.relatedPlayers
                      : Array.isArray(event?.assistPlayers)
                        ? event.assistPlayers
                        : [];
                    const hasEventPlayer =
                      Number.isFinite(Number(event?.playerId)) ||
                      relatedList.some(
                        (item) =>
                          Number.isFinite(Number(item?.id ?? item?.playerId)) ||
                          !!String(item?.name || "").trim(),
                      );
                    const isAway = event.teamAbbr === awayAbbr;
                    const isHome = event.teamAbbr === homeAbbr;
                    const fallbackTeamName = isAway
                      ? awayName.toUpperCase()
                      : isHome
                        ? homeName.toUpperCase()
                        : "Team";
                    const displayName =
                      String(event.mainText || "").trim() || fallbackTeamName;
                    const eventPeriodType = String(
                      event?.periodType || "",
                    ).toUpperCase();
                    const isShootoutEvent =
                      event.type === "shootout" || eventPeriodType === "SO";
                    const showEventScore =
                      (event.type === "goal" || isShootoutEvent) &&
                      event.homeScoreAfter != null &&
                      event.awayScoreAfter != null;
                    const shootoutResult = String(
                      event?.shotResult || event?.result || "",
                    )
                      .trim()
                      .toLowerCase();
                    const shootoutIconName =
                      shootoutResult === "goal"
                        ? "hockey-puck"
                        : shootoutResult === "save" || shootoutResult === "miss"
                          ? "close-circle"
                          : "";
                    const shootoutIconColor =
                      shootoutResult === "goal"
                        ? theme.success || colors.primary
                        : shootoutResult === "save" || shootoutResult === "miss"
                          ? theme.error || "#e03131"
                          : "transparent";
                    const awayScoreStyle =
                      event.type === "goal"
                        ? isAway
                          ? { color: colors.primary, fontWeight: "800" }
                          : { color: theme.text, fontWeight: "400" }
                        : isShootoutEvent && shootoutResult === "goal"
                          ? isAway
                            ? { color: colors.primary, fontWeight: "800" }
                            : { color: theme.text, fontWeight: "400" }
                          : { color: theme.text, fontWeight: "400" };
                    const homeScoreStyle =
                      event.type === "goal"
                        ? isHome
                          ? { color: colors.primary, fontWeight: "800" }
                          : { color: theme.text, fontWeight: "400" }
                        : isShootoutEvent && shootoutResult === "goal"
                          ? isHome
                            ? { color: colors.primary, fontWeight: "800" }
                            : { color: theme.text, fontWeight: "400" }
                          : { color: theme.text, fontWeight: "400" };

                    return (
                      <TouchableOpacity
                        key={`period-${period}-event-${idx}`}
                        activeOpacity={hasEventPlayer ? 0.75 : 1}
                        disabled={!hasEventPlayer}
                        onPress={() =>
                          hasEventPlayer && setSelectedEvent(event)
                        }
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
                            (isShootoutEvent ? (
                              shootoutIconName ? (
                                <MaterialCommunityIcons
                                  name={shootoutIconName}
                                  size={18}
                                  color={shootoutIconColor}
                                />
                              ) : (
                                <View style={{ width: 16 }} />
                              )
                            ) : event.type === "goal" ? (
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
                              numberOfLines={1}
                            >
                              {displayName}
                              {showEventScore ? (
                                <>
                                  {" ("}
                                  <Text style={awayScoreStyle}>
                                    {event.awayScoreAfter}
                                  </Text>
                                  {" - "}
                                  <Text style={homeScoreStyle}>
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
                                numberOfLines={1}
                              >
                                {event.subText}
                              </Text>
                            )}
                          </View>

                          {!isAway &&
                            (isShootoutEvent ? (
                              shootoutIconName ? (
                                <MaterialCommunityIcons
                                  name={shootoutIconName}
                                  size={18}
                                  color={shootoutIconColor}
                                />
                              ) : (
                                <View style={{ width: 16 }} />
                              )
                            ) : event.type === "goal" ? (
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
                      </TouchableOpacity>
                    );
                  })
                )}

                {!live && divider}
              </View>
            );
          })}
        </View>
      </View>

      <Modal
        visible={!!selectedEvent}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedEvent(null)}
      >
        <View style={styles.playerPopupOverlay}>
          <TouchableWithoutFeedback onPress={() => setSelectedEvent(null)}>
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
                Event Players
              </Text>
              <TouchableOpacity
                onPress={() => setSelectedEvent(null)}
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
              {(() => {
                const meta = resolveEventPlayerMeta(selectedEvent);
                if (!meta) return null;
                const eventTeamColor = NHLService.getTeamColor(
                  String(meta?.teamAbbrev || selectedEvent?.teamAbbr || ""),
                  colors.primary,
                );
                return (
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
                      Player
                    </Text>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => openPlayerModalFromMeta(meta)}
                      style={[
                        styles.playerPopupRow,
                        { backgroundColor: theme.surfaceSecondary },
                      ]}
                    >
                      {meta?.headshot ? (
                        <Image
                          source={{ uri: meta.headshot }}
                          style={[
                            styles.playerPopupAvatar,
                            {
                              borderColor: eventTeamColor,
                              backgroundColor: `${eventTeamColor}66`,
                            },
                          ]}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                        />
                      ) : (
                        <View
                          style={[
                            styles.playerPopupAvatar,
                            styles.playerPopupAvatarFallback,
                            {
                              borderColor: eventTeamColor,
                              backgroundColor: `${eventTeamColor}66`,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.playerPopupInitials,
                              { color: theme.text },
                            ]}
                          >
                            P
                          </Text>
                        </View>
                      )}
                      <View style={styles.playerPopupNameCol}>
                        <Text
                          style={[
                            styles.playerPopupFirstName,
                            { color: theme.textSecondary },
                          ]}
                          numberOfLines={1}
                        >
                          {meta?.firstName || " "}
                        </Text>
                        <Text
                          style={[
                            styles.playerPopupLastName,
                            { color: theme.text },
                          ]}
                          numberOfLines={1}
                        >
                          {meta?.lastName || meta?.name || "Unknown"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })()}

              {(() => {
                const relatedPlayers = resolveRelatedPlayerMetas(selectedEvent);
                if (!relatedPlayers.length) return null;
                return (
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
                      {relatedPlayers.length > 1
                        ? "Related Players"
                        : "Related Player"}
                    </Text>
                    {relatedPlayers.map((meta, idx) =>
                      (() => {
                        const relatedTeamColor = NHLService.getTeamColor(
                          String(
                            meta?.teamAbbrev || selectedEvent?.teamAbbr || "",
                          ),
                          colors.primary,
                        );
                        return (
                          <TouchableOpacity
                            key={`event-related-${meta?.playerId || meta?.name || idx}`}
                            activeOpacity={meta?.playerId ? 0.8 : 1}
                            disabled={!meta?.playerId || !onPlayerPress}
                            onPress={() => openPlayerModalFromMeta(meta)}
                            style={[
                              styles.playerPopupRow,
                              {
                                backgroundColor: theme.surfaceSecondary,
                                marginTop: idx === 0 ? 0 : 8,
                              },
                            ]}
                          >
                            {meta?.headshot ? (
                              <Image
                                source={{ uri: meta.headshot }}
                                style={[
                                  styles.playerPopupAvatar,
                                  {
                                    borderColor: relatedTeamColor,
                                    backgroundColor: `${relatedTeamColor}66`,
                                  },
                                ]}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                              />
                            ) : (
                              <View
                                style={[
                                  styles.playerPopupAvatar,
                                  styles.playerPopupAvatarFallback,
                                  {
                                    borderColor: relatedTeamColor,
                                    backgroundColor: `${relatedTeamColor}66`,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.playerPopupInitials,
                                    { color: theme.text },
                                  ]}
                                >
                                  R
                                </Text>
                              </View>
                            )}
                            <View style={styles.playerPopupNameCol}>
                              <Text
                                style={[
                                  styles.playerPopupFirstName,
                                  { color: theme.textSecondary },
                                ]}
                                numberOfLines={1}
                              >
                                {meta?.firstName || " "}
                              </Text>
                              <Text
                                style={[
                                  styles.playerPopupLastName,
                                  { color: theme.text },
                                ]}
                                numberOfLines={1}
                              >
                                {meta?.lastName || meta?.name || "Unknown"}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })(),
                    )}
                  </View>
                );
              })()}

              {selectedEvent?.type === "goal" ? (
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
                    Goal Share Card
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => openGoalShareFromEvent(selectedEvent)}
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
                      Open Goal Share Card
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </>
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
                    {(toSafeStatValue(entry?.savePctg) * 100).toFixed(1)}%
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

const MatchupHeadshot = ({
  playerId,
  headshot,
  seasonCode,
  teamAbbrev,
  teamLogo,
  position,
  teamColor,
  side,
  theme,
  onPress,
}) => {
  const mugUrl = getNhlMugHeadshotUrl({
    seasonCode,
    teamAbbrev,
    playerId,
  });
  const fallbackUrl = String(headshot || "").trim();
  const sources = useMemo(() => {
    const seen = new Set();
    return [mugUrl, fallbackUrl].filter((uri) => {
      const key = String(uri || "").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [fallbackUrl, mugUrl]);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [sources.join("|")]);

  const activeSource = sources[sourceIndex] || "";
  const hasSource = !!activeSource;
  const pos = String(position || "-").toUpperCase();

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.82 : 1}
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.matchupHeadshotWrap,
        {
          borderColor: teamColor,
          backgroundColor: withAlpha66(teamColor),
        },
      ]}
    >
      {hasSource ? (
        <Image
          source={{ uri: activeSource }}
          style={styles.matchupHeadshotImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          onError={() => setSourceIndex((prev) => prev + 1)}
        />
      ) : (
        <View style={styles.matchupHeadshotFallback}>
          <MaterialIcons name="person" size={20} color={theme.textSecondary} />
        </View>
      )}

      <View
        style={[
          styles.matchupHeadshotLogoBadge,
          side === "away"
            ? styles.matchupHeadshotLogoAway
            : styles.matchupHeadshotLogoHome,
          {
            borderColor: teamColor,
            backgroundColor: withAlpha66(teamColor),
          },
        ]}
      >
        <Image
          source={{ uri: String(teamLogo || "") }}
          style={styles.matchupHeadshotLogoImage}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      </View>

      <View
        style={[
          styles.matchupHeadshotPosBadge,
          side === "away"
            ? styles.matchupHeadshotPosAway
            : styles.matchupHeadshotPosHome,
          {
            borderColor: teamColor,
            backgroundColor: theme.surface,
          },
        ]}
      >
        <Text style={[styles.matchupHeadshotPosText, { color: theme.text }]}>
          {pos}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const NHLSkaterComparisonSection = ({
  game,
  theme,
  awayColor,
  homeColor,
  awayLogo,
  homeLogo,
  onPlayerPress,
}) => {
  const seasonCode = useMemo(() => getNhlSeasonSpan(), []);
  const awayAbbr = String(game?.away?.abbreviation || "").toUpperCase();
  const homeAbbr = String(game?.home?.abbreviation || "").toUpperCase();

  const leaders = Array.isArray(game?.matchup?.skaterComparison?.leaders)
    ? game.matchup.skaterComparison.leaders
    : [];

  const rows = leaders
    .map((entry, idx) => {
      const awayLeader = entry?.awayLeader || null;
      const homeLeader = entry?.homeLeader || null;
      if (!awayLeader && !homeLeader) return null;
      return {
        key: `skater-comp-${idx}-${String(entry?.category || "cat")}`,
        category: String(entry?.category || "Comparison").toUpperCase(),
        awayLeader,
        homeLeader,
      };
    })
    .filter(Boolean);

  if (rows.length === 0) return null;

  const getNameParts = (leader) => {
    const first = String(leader?.firstName || "").trim();
    const last = String(leader?.lastName || "").trim();
    if (first || last) return { first, last };
    const name = String(leader?.name || "").trim();
    if (!name) return { first: "", last: "" };
    const bits = name.split(/\s+/).filter(Boolean);
    if (bits.length === 1) return { first: bits[0], last: "" };
    return {
      first: bits.slice(0, -1).join(" "),
      last: bits[bits.length - 1],
    };
  };

  const toMatchupPlayer = (leader, side) => {
    const first = String(leader?.firstName || "").trim();
    const last = String(leader?.lastName || "").trim();
    const fullName = [first, last].filter(Boolean).join(" ").trim();
    const teamAbbrev = side === "away" ? awayAbbr : homeAbbr;
    const teamId = Number(side === "away" ? game?.away?.id : game?.home?.id);
    const valueNum = Number(leader?.value);
    const statKey = String(leader?.category || "").toLowerCase();

    return {
      id: Number(leader?.playerId),
      name: fullName || String(leader?.name || "").trim(),
      number: Number.isFinite(Number(leader?.sweaterNumber))
        ? Number(leader?.sweaterNumber)
        : null,
      position: String(leader?.positionCode || "").trim(),
      teamSide: side,
      teamId: Number.isFinite(teamId) ? teamId : null,
      teamAbbrev,
      teamName: String(
        side === "away" ? game?.away?.name : game?.home?.name,
      ).trim(),
      headshot: String(leader?.headshot || "").trim() || null,
      stats: Number.isFinite(valueNum)
        ? { [statKey || "value"]: valueNum }
        : {},
    };
  };

  return (
    <View style={styles.matchupSectionWrap}>
      {rows.map((row) => {
        const awayName = getNameParts(row.awayLeader);
        const homeName = getNameParts(row.homeLeader);
        const awayValue = row.awayLeader?.value ?? "-";
        const homeValue = row.homeLeader?.value ?? "-";
        const awayNum = Number(row.awayLeader?.value);
        const homeNum = Number(row.homeLeader?.value);
        const safeAway = Number.isFinite(awayNum) ? awayNum : 0;
        const safeHome = Number.isFinite(homeNum) ? homeNum : 0;
        const total = safeAway + safeHome;
        const awayFlex = total > 0 ? safeAway : 1;
        const homeFlex = total > 0 ? safeHome : 1;

        return (
          <View
            key={row.key}
            style={[
              styles.matchupCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <View
              style={[
                styles.matchupCardHeader,
                { borderBottomColor: theme.border },
              ]}
            >
              <Text
                style={[styles.matchupCardHeaderText, { color: theme.text }]}
              >
                {row.category} - LAST 5 GAMES
              </Text>
            </View>

            <View style={styles.matchupSkaterBody}>
              <View
                style={[styles.matchupSkaterSide, styles.matchupSkaterSideAway]}
              >
                {row.awayLeader ? (
                  <>
                    <MatchupHeadshot
                      playerId={row.awayLeader?.playerId}
                      headshot={row.awayLeader?.headshot}
                      seasonCode={seasonCode}
                      teamAbbrev={awayAbbr}
                      teamLogo={awayLogo}
                      position={row.awayLeader?.positionCode}
                      teamColor={awayColor}
                      side="away"
                      theme={theme}
                      onPress={
                        typeof onPlayerPress === "function"
                          ? () =>
                              onPlayerPress(
                                toMatchupPlayer(row.awayLeader, "away"),
                              )
                          : undefined
                      }
                    />
                    <View style={styles.matchupSkaterNameWrapAway}>
                      <Text
                        style={[
                          styles.matchupNameFirst,
                          { color: theme.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {awayName.first || "-"}
                      </Text>
                      <Text
                        style={[styles.matchupNameLast, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {awayName.last || "-"}
                      </Text>
                    </View>
                  </>
                ) : null}
              </View>

              <View style={styles.matchupSkaterVsWrap}>
                <Text
                  style={[
                    styles.matchupSkaterVs,
                    { color: theme.textTertiary },
                  ]}
                >
                  VS
                </Text>
              </View>

              <View
                style={[styles.matchupSkaterSide, styles.matchupSkaterSideHome]}
              >
                {row.homeLeader ? (
                  <>
                    <View style={styles.matchupSkaterNameWrapHome}>
                      <Text
                        style={[
                          styles.matchupNameFirst,
                          { color: theme.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {homeName.first || "-"}
                      </Text>
                      <Text
                        style={[styles.matchupNameLast, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {homeName.last || "-"}
                      </Text>
                    </View>
                    <MatchupHeadshot
                      playerId={row.homeLeader?.playerId}
                      headshot={row.homeLeader?.headshot}
                      seasonCode={seasonCode}
                      teamAbbrev={homeAbbr}
                      teamLogo={homeLogo}
                      position={row.homeLeader?.positionCode}
                      teamColor={homeColor}
                      side="home"
                      theme={theme}
                      onPress={
                        typeof onPlayerPress === "function"
                          ? () =>
                              onPlayerPress(
                                toMatchupPlayer(row.homeLeader, "home"),
                              )
                          : undefined
                      }
                    />
                  </>
                ) : null}
              </View>
            </View>

            <View style={styles.matchupSkaterFillRow}>
              <View
                style={[
                  styles.matchupSkaterFillHalf,
                  styles.matchupSkaterFillAway,
                  { backgroundColor: awayColor, flex: awayFlex },
                ]}
              >
                <Text style={styles.matchupSkaterFillValue}>{awayValue}</Text>
              </View>
              <View
                style={[
                  styles.matchupSkaterFillDivider,
                  { backgroundColor: theme.surface },
                ]}
              />
              <View
                style={[
                  styles.matchupSkaterFillHalf,
                  styles.matchupSkaterFillHome,
                  { backgroundColor: homeColor, flex: homeFlex },
                ]}
              >
                <Text style={styles.matchupSkaterFillValue}>{homeValue}</Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const MatchupGoalieBodyGradient = ({ gradId, color, reverse }) => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    <Svg width={width} height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient
          id={gradId}
          x1={reverse ? "100%" : "0%"}
          y1="0%"
          x2={reverse ? "0%" : "100%"}
          y2="0%"
        >
          <Stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <Stop offset="70%" stopColor={color} stopOpacity="0" />
          <Stop offset="100%" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect width={width} height="100%" fill={`url(#${gradId})`} />
    </Svg>
  </View>
);

const NHLGoalieComparisonSection = ({
  game,
  theme,
  awayColor,
  homeColor,
  awayLogo,
  homeLogo,
  onPlayerPress,
}) => {
  const seasonCode = useMemo(() => getNhlSeasonSpan(), []);
  const awayAbbr = String(game?.away?.abbreviation || "").toUpperCase();
  const homeAbbr = String(game?.home?.abbreviation || "").toUpperCase();

  const awayLeaders = Array.isArray(
    game?.matchup?.goalieComparison?.awayTeam?.leaders,
  )
    ? game.matchup.goalieComparison.awayTeam.leaders
    : [];
  const homeLeaders = Array.isArray(
    game?.matchup?.goalieComparison?.homeTeam?.leaders,
  )
    ? game.matchup.goalieComparison.homeTeam.leaders
    : [];

  if (awayLeaders.length === 0 && homeLeaders.length === 0) return null;

  const formatPct = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    const pct = n <= 1 ? n * 100 : n;
    return `${pct.toFixed(1)}%`;
  };

  const formatGaa = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    return n.toFixed(2);
  };

  const metricsFor = (leader) => [
    { label: "GP", value: Number(leader?.gamesPlayed ?? 0) },
    { label: "SP", value: Number(leader?.seasonPoints ?? 0) },
    { label: "RCD", value: String(leader?.record || "-") },
    { label: "GAA", value: formatGaa(leader?.gaa) },
    { label: "SV%", value: formatPct(leader?.savePcts ?? leader?.savePctg) },
    { label: "SO", value: Number(leader?.shutouts ?? 0) },
  ];

  const toMatchupGoalie = (leader, side) => {
    const first = String(leader?.firstName || "").trim();
    const last = String(leader?.lastName || "").trim();
    const fullName = [first, last].filter(Boolean).join(" ").trim();
    const teamAbbrev = side === "away" ? awayAbbr : homeAbbr;
    const teamId = Number(side === "away" ? game?.away?.id : game?.home?.id);
    return {
      id: Number(leader?.playerId),
      name: fullName || String(leader?.name || "").trim(),
      number: Number.isFinite(Number(leader?.sweaterNumber))
        ? Number(leader?.sweaterNumber)
        : null,
      position: String(leader?.positionCode || "G").trim(),
      teamSide: side,
      teamId: Number.isFinite(teamId) ? teamId : null,
      teamAbbrev,
      teamName: String(
        side === "away" ? game?.away?.name : game?.home?.name,
      ).trim(),
      headshot: String(leader?.headshot || "").trim() || null,
      stats: {
        gamesPlayed: Number(leader?.gamesPlayed),
        wins: Number(leader?.wins),
        losses: Number(leader?.losses),
        otLosses: Number(leader?.otLosses),
        savePctg: Number(leader?.savePcts ?? leader?.savePctg),
        gaa: Number(leader?.gaa),
        shutouts: Number(leader?.shutouts),
      },
    };
  };

  const renderGoalieRow = (leader, side, teamColor, teamLogo, teamAbbrev) => {
    const first = String(leader?.firstName || "").trim();
    const last = String(leader?.lastName || "").trim();
    const fullName = [first, last].filter(Boolean).join(" ").trim() || "-";

    return (
      <View
        key={`${side}-${leader?.playerId || fullName}`}
        style={[
          styles.matchupGoalieRow,
          side === "home"
            ? styles.matchupGoalieRowHome
            : styles.matchupGoalieRowAway,
        ]}
      >
        {side === "home" ? (
          <View style={styles.matchupGoalieInfoHome}>
            <Text
              style={[styles.matchupGoalieName, { color: theme.text }]}
              numberOfLines={1}
            >
              {fullName}
            </Text>
            <View style={styles.matchupGoalieStatsRowHome}>
              {metricsFor(leader).map((item) => (
                <View
                  key={`${side}-${fullName}-${item.label}`}
                  style={styles.matchupGoalieStatCell}
                >
                  <Text
                    style={[
                      styles.matchupGoalieStatValue,
                      { color: theme.text },
                    ]}
                  >
                    {item.value}
                  </Text>
                  <Text
                    style={[
                      styles.matchupGoalieStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <MatchupHeadshot
          playerId={leader?.playerId}
          headshot={leader?.headshot}
          seasonCode={seasonCode}
          teamAbbrev={teamAbbrev}
          teamLogo={teamLogo}
          position={leader?.positionCode || "G"}
          teamColor={teamColor}
          side={side}
          theme={theme}
          onPress={
            typeof onPlayerPress === "function"
              ? () => onPlayerPress(toMatchupGoalie(leader, side))
              : undefined
          }
        />

        {side === "away" ? (
          <View style={styles.matchupGoalieInfoAway}>
            <Text
              style={[styles.matchupGoalieName, { color: theme.text }]}
              numberOfLines={1}
            >
              {fullName}
            </Text>
            <View style={styles.matchupGoalieStatsRowAway}>
              {metricsFor(leader).map((item) => (
                <View
                  key={`${side}-${fullName}-${item.label}`}
                  style={styles.matchupGoalieStatCell}
                >
                  <Text
                    style={[
                      styles.matchupGoalieStatValue,
                      { color: theme.text },
                    ]}
                  >
                    {item.value}
                  </Text>
                  <Text
                    style={[
                      styles.matchupGoalieStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View
      style={[
        styles.matchupCard,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          marginTop: 14,
        },
      ]}
    >
      <View
        style={[styles.matchupCardHeader, { borderBottomColor: theme.border }]}
      >
        <Text style={[styles.matchupCardHeaderText, { color: theme.text }]}>
          GOALIE COMPARISON
        </Text>
      </View>

      {awayLeaders.length > 0 ? (
        <View
          style={[
            styles.matchupGoalieBody,
            {
              borderBottomColor: theme.border,
              borderBottomWidth: StyleSheet.hairlineWidth,
            },
          ]}
        >
          <MatchupGoalieBodyGradient
            gradId="nhlGoalieCompAway"
            color={awayColor}
            reverse={false}
          />
          {awayLeaders.map((leader) =>
            renderGoalieRow(leader, "away", awayColor, awayLogo, awayAbbr),
          )}
        </View>
      ) : null}

      {homeLeaders.length > 0 ? (
        <View style={styles.matchupGoalieBody}>
          <MatchupGoalieBodyGradient
            gradId="nhlGoalieCompHome"
            color={homeColor}
            reverse={true}
          />
          {homeLeaders.map((leader) =>
            renderGoalieRow(leader, "home", homeColor, homeLogo, homeAbbr),
          )}
        </View>
      ) : null}
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

const SeriesSummarySection = ({
  game,
  summary,
  theme,
  homeColor,
  awayColor,
  homeOnly,
  onToggleHomeOnly,
  getTeamLogoUrl,
}) => {
  if (!game?.home || !game?.away || !summary) return null;

  const homeLogoUri =
    game?.home?.logo || getTeamLogoUrl("nhl", game?.home?.abbreviation);
  const awayLogoUri =
    game?.away?.logo || getTeamLogoUrl("nhl", game?.away?.abbreviation);

  const homeWinsCount = Number(summary?.homeWins ?? 0);
  const awayWinsCount = Number(summary?.awayWins ?? 0);
  const total = homeWinsCount + awayWinsCount;

  const homeFlex = total > 0 ? homeWinsCount : 1;
  const awayFlex = total > 0 ? awayWinsCount : 1;

  return (
    <View style={[seriesStyles.card, { backgroundColor: theme.surface }]}>
      <View
        style={[seriesStyles.headerRow, { borderBottomColor: theme.border }]}
      >
        <Text style={[seriesStyles.headerTitle, { color: theme.text }]}>
          SEASON SERIES
        </Text>
        <TouchableOpacity
          style={[
            seriesStyles.homeFilterBtn,
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
              style={seriesStyles.homeFilterLogo}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          ) : (
            <View
              style={[
                seriesStyles.homeFilterLogoFallback,
                { backgroundColor: theme.surfaceSecondary },
              ]}
            >
              <Text
                style={[
                  seriesStyles.homeFilterLogoFallbackText,
                  { color: theme.textSecondary },
                ]}
              >
                {String(game?.home?.abbreviation || "H")
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>
          )}
          <Text
            style={[
              seriesStyles.homeFilterText,
              { color: homeOnly ? theme.text : theme.textSecondary },
            ]}
          >
            HOME
          </Text>
        </TouchableOpacity>
      </View>

      <View style={seriesStyles.bodyRow}>
        <View style={[seriesStyles.sideBlock, seriesStyles.sideBlockLeft]}>
          {awayLogoUri ? (
            <Image
              source={{ uri: awayLogoUri }}
              style={seriesStyles.logo}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          ) : (
            <View
              style={[
                seriesStyles.logoPlaceholder,
                { backgroundColor: theme.surfaceSecondary },
              ]}
            >
              <Text
                style={[
                  seriesStyles.logoInitial,
                  { color: theme.textSecondary },
                ]}
              >
                {String(game?.away?.abbreviation || "A")
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={[seriesStyles.winCount, { color: theme.text }]}>
            {awayWinsCount}
          </Text>
        </View>

        <View style={seriesStyles.centerBlock}>
          <Text style={[seriesStyles.vsText, { color: theme.textSecondary }]}>
            VS
          </Text>
        </View>

        <View style={[seriesStyles.sideBlock, seriesStyles.sideBlockRight]}>
          <Text style={[seriesStyles.winCount, { color: theme.text }]}>
            {homeWinsCount}
          </Text>
          {homeLogoUri ? (
            <Image
              source={{ uri: homeLogoUri }}
              style={seriesStyles.logo}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          ) : (
            <View
              style={[
                seriesStyles.logoPlaceholder,
                { backgroundColor: theme.surfaceSecondary },
              ]}
            >
              <Text
                style={[
                  seriesStyles.logoInitial,
                  { color: theme.textSecondary },
                ]}
              >
                {String(game?.home?.abbreviation || "H")
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View
        style={[
          seriesStyles.summaryFooter,
          {
            borderTopColor: theme.surface,
            backgroundColor: theme.surfaceSecondary,
          },
        ]}
      >
        <View
          style={[
            seriesStyles.summaryFooterFill,
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
            seriesStyles.summaryFooterFill,
            { flex: homeFlex, backgroundColor: homeColor },
          ]}
        />
      </View>
    </View>
  );
};

const SeriesMatchCard = ({
  match,
  game,
  theme,
  navigation,
  getTeamLogoUrl,
  homeColor,
  awayColor,
}) => {
  const matchHomeTeam = match?.homeTeam || null;
  const matchAwayTeam = match?.awayTeam || null;
  if (!matchHomeTeam || !matchAwayTeam) return null;

  const selectedHomeId = Number(game?.home?.id);
  const selectedAwayId = Number(game?.away?.id);
  const leftTeam = matchAwayTeam;
  const rightTeam = matchHomeTeam;

  const leftTeamId = Number(leftTeam?.id);
  const rightTeamId = Number(rightTeam?.id);

  const leftName =
    leftTeamId === selectedAwayId
      ? game?.away?.name
      : leftTeamId === selectedHomeId
        ? game?.home?.name
        : leftTeam?.commonName || leftTeam?.placeName;
  const rightName =
    rightTeamId === selectedHomeId
      ? game?.home?.name
      : rightTeamId === selectedAwayId
        ? game?.away?.name
        : rightTeam?.commonName || rightTeam?.placeName;

  const leftAbbr = String(
    leftTeam?.abbrev ||
      (leftTeamId === selectedAwayId
        ? game?.away?.abbreviation
        : game?.home?.abbreviation) ||
      "",
  ).toUpperCase();
  const rightAbbr = String(
    rightTeam?.abbrev ||
      (rightTeamId === selectedHomeId
        ? game?.home?.abbreviation
        : game?.away?.abbreviation) ||
      "",
  ).toUpperCase();

  const leftColor = NHLService.getTeamColor(leftAbbr, awayColor);
  const rightColor = NHLService.getTeamColor(rightAbbr, homeColor);

  const toNullableScore = (value) => {
    if (value == null || value === "") return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const leftScore = toNullableScore(leftTeam?.score);
  const rightScore = toNullableScore(rightTeam?.score);
  const hasScore = leftScore != null && rightScore != null;

  const leftWon = hasScore && leftScore > rightScore;
  const rightWon = hasScore && rightScore > leftScore;

  const startTime = match?.startTimeUTC || match?.gameDate || "";
  const gameState = match?.gameState || "";
  const live =
    gameState === "LIVE" || gameState === "CRIT" || gameState === "IN";
  const { time, ampm } = formatLocalTime(startTime);

  let topDate = "";
  try {
    const d = new Date(startTime);
    if (!Number.isNaN(d.getTime())) {
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
      topDate = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }
  } catch {
    topDate = "";
  }

  const gameTypeDesc =
    Number(match?.gameType) === 1
      ? "Preseason"
      : Number(match?.gameType) === 2
        ? "Regular Season"
        : Number(match?.gameType) === 3
          ? "Playoffs"
          : "NHL";
  const topLine = topDate ? `${topDate} \u00B7 ${gameTypeDesc}` : gameTypeDesc;
  const periodType = String(
    match?.periodDescriptor?.periodType || "REG",
  ).toUpperCase();
  const showSign = periodType && periodType !== "REG";
  const gradId = `series_grad_${String(match?.id ?? Math.random()).replace(/[^a-zA-Z0-9_]/g, "_")}`;

  const leftLogoUri =
    leftTeam?.logo ||
    (leftTeamId === selectedAwayId ? game?.away?.logo : game?.home?.logo) ||
    getTeamLogoUrl("nhl", leftAbbr);
  const rightLogoUri =
    rightTeam?.logo ||
    (rightTeamId === selectedHomeId ? game?.home?.logo : game?.away?.logo) ||
    getTeamLogoUrl("nhl", rightAbbr);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() =>
        navigation?.navigate("GameDetails", {
          gameId: String(match?.id),
          sport: "nhl",
        })
      }
      disabled={!navigation || !match?.id}
      style={[
        seriesStyles.matchCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={seriesStyles.matchCardTopRow}>
        <Text
          style={[
            seriesStyles.matchCardTopText,
            { color: theme.textSecondary },
          ]}
          numberOfLines={1}
        >
          {topLine}
        </Text>
      </View>

      <View
        style={[
          seriesStyles.matchCardBody,
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

        <View style={seriesStyles.matchCardInner}>
          <View style={seriesStyles.matchTeamSide}>
            {leftLogoUri ? (
              <Image
                source={{ uri: leftLogoUri }}
                style={seriesStyles.matchTeamLogo}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            ) : (
              <View
                style={[
                  seriesStyles.matchTeamLogo,
                  seriesStyles.logoFallback,
                  { backgroundColor: `${leftColor}40` },
                ]}
              >
                <Text
                  style={[seriesStyles.logoFallbackText, { color: theme.text }]}
                >
                  {String(leftAbbr || "H").charAt(0)}
                </Text>
              </View>
            )}
            <View style={seriesStyles.matchTeamTextCol}>
              <Text
                style={[
                  seriesStyles.matchTeamName,
                  {
                    color: leftWon ? theme.text : theme.textSecondary,
                    fontWeight: leftWon ? "700" : "500",
                  },
                ]}
                numberOfLines={2}
              >
                {leftName || leftAbbr || "Away"}
              </Text>
            </View>
          </View>

          <View style={seriesStyles.matchScoreBlock}>
            <View style={seriesStyles.matchStatusSlot}>
              {showSign ? (
                <Text
                  style={[
                    seriesStyles.matchStatusText,
                    {
                      color: live ? theme.error : theme.textSecondary,
                      marginTop: -6,
                    },
                  ]}
                >
                  {periodType}
                </Text>
              ) : live ? (
                <Text
                  style={[
                    seriesStyles.matchStatusText,
                    { color: theme.error, marginTop: -6, fontWeight: "700" },
                  ]}
                >
                  LIVE
                </Text>
              ) : null}
            </View>

            {hasScore ? (
              <View style={seriesStyles.matchScoreRow}>
                <Text
                  style={[
                    seriesStyles.matchScore,
                    {
                      color: live
                        ? theme.error
                        : leftWon
                          ? theme.text
                          : theme.textSecondary,
                      fontWeight: leftWon ? "800" : "500",
                    },
                  ]}
                >
                  {leftScore}
                </Text>
                <Text
                  style={[
                    seriesStyles.matchScoreDash,
                    { color: live ? theme.error : theme.textTertiary },
                  ]}
                >
                  -
                </Text>
                <Text
                  style={[
                    seriesStyles.matchScore,
                    {
                      color: live
                        ? theme.error
                        : rightWon
                          ? theme.text
                          : theme.textSecondary,
                      fontWeight: rightWon ? "800" : "500",
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
                    seriesStyles.matchScore,
                    { color: theme.text, fontWeight: "800" },
                  ]}
                >
                  {time}
                </Text>
                <Text
                  style={[
                    seriesStyles.matchTimeAmPm,
                    { color: theme.textSecondary },
                  ]}
                >
                  {ampm.toUpperCase()}
                </Text>
              </>
            )}
          </View>

          <View style={seriesStyles.matchTeamSideAway}>
            <View
              style={[
                seriesStyles.matchTeamTextCol,
                seriesStyles.matchTeamTextColAway,
              ]}
            >
              <Text
                style={[
                  seriesStyles.matchTeamName,
                  seriesStyles.matchTeamNameAway,
                  {
                    color: rightWon ? theme.text : theme.textSecondary,
                    fontWeight: rightWon ? "700" : "500",
                  },
                ]}
                numberOfLines={2}
              >
                {rightName || rightAbbr || "Home"}
              </Text>
            </View>
            {rightLogoUri ? (
              <Image
                source={{ uri: rightLogoUri }}
                style={seriesStyles.matchTeamLogo}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            ) : (
              <View
                style={[
                  seriesStyles.matchTeamLogo,
                  seriesStyles.logoFallback,
                  { backgroundColor: `${rightColor}40` },
                ]}
              >
                <Text
                  style={[seriesStyles.logoFallbackText, { color: theme.text }]}
                >
                  {String(rightAbbr || "A").charAt(0)}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const PlaysTabSection = ({
  game,
  theme,
  colors,
  onPlayerPress,
  onOpenGoalShare,
  getTeamLogoUrl,
}) => {
  const [activeType, setActiveType] = useState("ALL");
  const [periodIndex, setPeriodIndex] = useState(0);
  const [selectedGoalPlay, setSelectedGoalPlay] = useState(null);
  const [expandedPlayKey, setExpandedPlayKey] = useState(null);

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
    return (
      getNhlExtraPeriodLabel({
        number: p,
        gameType: game?.gameType,
        longForm: false,
      }) || `P${p}`
    );
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
    const fullFromNames = [firstName, lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    return {
      id,
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
      const assistNames = [];
      const assistProfiles = [];
      [1, 2].forEach((idx) => {
        const idKey = idx === 1 ? "assist1PlayerId" : "assist2PlayerId";
        const totalKey =
          idx === 1 ? "assist1PlayerTotal" : "assist2PlayerTotal";
        const assistProfile = playerProfile(details?.[idKey], "");
        const assistName = displayName(assistProfile, "");
        if (!assistName) return;
        assistNames.push(assistName);
        assistProfiles.push(assistProfile);
        const total = Number(details?.[totalKey]);
        const totalText = Number.isFinite(total) ? ` (${total})` : "";
        assistLines.push(
          `${assistName}${sweaterTag(assistProfile)}${totalText}`,
        );
      });

      return {
        main: `${scorer}${sweaterTag(scorerProfile)} scores for ${teamName}${shotType ? ` with a ${shotType} shot` : ""}.${seasonTotal ? ` His ${seasonTotal} goal of the season.` : ""}`,
        sub:
          assistLines.length > 0 ? `Assists: ${assistLines.join(", ")}` : null,
        assistNames,
        assistProfiles,
      };
    }

    if (typeKey === "penalty") {
      const committedByProfile = playerProfile(
        details?.committedByPlayerId,
        "Player",
      );
      const committedBy = displayName(committedByProfile, "Player");
      const drawnByProfile = playerProfile(details?.drawnByPlayerId, "");
      const drawnBy = displayName(drawnByProfile, "");
      const desc = cleanKeyWords(details?.descKey || "penalty");
      const duration = Number(details?.duration);
      return {
        main: `${committedBy}${sweaterTag(committedByProfile)} ${Number.isFinite(duration) ? `${duration} minutes` : ""} for ${desc}`.trim(),
        sub: drawnBy
          ? `Drawn by ${drawnBy}${sweaterTag(drawnByProfile)}`
          : null,
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
      const shooterProfile = playerProfile(
        details?.shootingPlayerId,
        "Shooter",
      );
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
        const playoffGame = isNhlPlayoffGameType(game?.gameType);
        const shootoutPeriod =
          periodType === "SO" || (!playoffGame && period >= 5);
        const overtimePeriod =
          !shootoutPeriod && (periodType === "OT" || period > 3);
        const periodLengthSecs = shootoutPeriod
          ? 0
          : overtimePeriod
            ? playoffGame
              ? 20 * 60
              : 5 * 60
            : 20 * 60;
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
      const xCoord = Number(details?.xCoord);
      const yCoord = Number(details?.yCoord);
      const homeTeamDefendingSide = String(play?.homeTeamDefendingSide || "")
        .trim()
        .toLowerCase();
      const eventTeamSide =
        eventOwnerTeamId === awayTeam.id
          ? "away"
          : eventOwnerTeamId === homeTeam.id
            ? "home"
            : null;

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

      if (
        Number.isFinite(scoringPlayerId) &&
        !preparedGoalCounts[scoringPlayerId]
      ) {
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
        assistNames: detailText.assistNames || [],
        assistProfiles: detailText.assistProfiles || [],
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
        eventTeamAbbr: eventTeam?.abbr || null,
        eventTeamSide,
        homeTeamDefendingSide: homeTeamDefendingSide || null,
        xCoord: Number.isFinite(xCoord) ? xCoord : null,
        yCoord: Number.isFinite(yCoord) ? yCoord : null,
      };
    });

    return annotated.reverse();
  }, [
    awayTeam.id,
    colors.primary,
    game?.away?.logo,
    game?.away?.name,
    game?.home?.logo,
    game?.home?.name,
    homeTeam.id,
    playerMetaById,
    plays,
    rosterSpotById,
    teamById,
    theme.border,
    game?.gameType,
  ]);

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

  useEffect(() => {
    if (!expandedPlayKey) return;
    const stillVisible = visibleRows.some((row) => row.key === expandedPlayKey);
    if (!stillVisible) {
      setExpandedPlayKey(null);
    }
  }, [expandedPlayKey, visibleRows]);

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

  const openPlayerFromProfile = (profile) => {
    const id = Number(profile?.id);
    if (!onPlayerPress || !Number.isFinite(id)) return;
    onPlayerPress({
      id,
      playerId: id,
      name: profile?.name,
      firstName: profile?.firstName,
      lastName: profile?.lastName,
      headshot: profile?.headshot,
      position: profile?.position,
      teamId: profile?.teamId,
      teamAbbrev:
        Number(profile?.teamId) === Number(game?.away?.id)
          ? game?.away?.abbreviation
          : Number(profile?.teamId) === Number(game?.home?.id)
            ? game?.home?.abbreviation
            : undefined,
      stats: (playerMetaById?.[id] || {}).stats || {},
    });
    setSelectedGoalPlay(null);
  };

  const openGoalShareFromPlay = () => {
    if (!onOpenGoalShare || !selectedGoalPlay?.isGoal) return;
    const row = selectedGoalPlay;
    const scorer = {
      ...(playerMetaById?.[row?.scorerProfile?.id] || {}),
      ...row.scorerProfile,
    };
    const assistsText = (row?.assistNames || []).join(", ");
    const assistDetailText = String(row?.detailSub || "")
      .replace(/^Assists:\s*/i, "")
      .trim();
    const comment = [
      String(row?.detailMain || "").trim(),
      assistDetailText
        ? `Assisted by: ${assistDetailText}`
        : assistsText
          ? `Assisted by: ${assistsText}`
          : "",
    ]
      .filter(Boolean)
      .join(" ");
    const payload = buildNhlGoalSharePayload({
      game,
      scorer,
      assistName: assistsText,
      minuteLabel: row?.timeRemaining,
      periodLabel: row?.periodLabel,
      scoreAfter: row?.scoreAt,
      goalSituation: deriveNhlGoalSituation(row?.scoreAt, row?.scoringSide),
      comment,
      teamAbbr: row?.eventTeamAbbr,
      teamSide: row?.eventTeamSide,
      homeTeamDefendingSide: row?.homeTeamDefendingSide,
      xCoord: row?.xCoord,
      yCoord: row?.yCoord,
      isScoring: true,
      getTeamLogoUrl,
    });
    if (payload) {
      setSelectedGoalPlay(null);
      onOpenGoalShare(payload);
    }
  };

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
          const canExpandRink =
            !row.isGoal &&
            Number.isFinite(Number(row.xCoord)) &&
            Number.isFinite(Number(row.yCoord));
          const showExpandedRink = canExpandRink && expandedPlayKey === row.key;

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

              <TouchableOpacity
                activeOpacity={row.isGoal || canExpandRink ? 0.85 : 1}
                disabled={!row.isGoal && !canExpandRink}
                onPress={() => {
                  if (row.isGoal) {
                    setSelectedGoalPlay(row);
                    return;
                  }
                  if (!canExpandRink) return;
                  setExpandedPlayKey((prev) =>
                    prev === row.key ? null : row.key,
                  );
                }}
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

                {!!row.detailSub && !row.isGoal && (
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
                          style={[
                            styles.playsGoalAvatar,
                            { borderColor: row.teamColor },
                          ]}
                          contentFit="cover"
                        />
                      ) : (
                        <View
                          style={[
                            styles.playsGoalAvatar,
                            styles.playsGoalAvatarFallback,
                            { borderColor: row.teamColor },
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

                      {!!row.scorerProfile?.position && (
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
                            {row.scorerProfile.position}
                          </Text>
                        </View>
                      )}

                      <View
                        style={[
                          styles.playsGoalCountBadge,
                          { backgroundColor: theme.surface },
                        ]}
                      >
                        <FontAwesome6
                          name="hockey-puck"
                          size={9}
                          color={theme.text}
                        />
                        <Text
                          style={[
                            styles.playsGoalCountText,
                            { color: theme.text },
                          ]}
                        >
                          {row.scorerGoalsInGame}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.playsGoalTextCol}>
                      <Text
                        style={[
                          styles.playsGoalScorerName,
                          { color: bodyColor },
                        ]}
                        numberOfLines={1}
                      >
                        {row.scorerName}
                      </Text>
                      {!!row.detailSub && (
                        <Text
                          style={[
                            styles.playsGoalAssistText,
                            { color: bodyColor },
                          ]}
                          numberOfLines={2}
                        >
                          {row.detailSub}
                        </Text>
                      )}
                    </View>
                  </View>
                )}

                {showExpandedRink && (
                  <View
                    style={[
                      styles.playsInlineRinkWrap,
                      {
                        borderColor: row.borderColor,
                        backgroundColor: theme.surfaceSecondary,
                        transform: [{ scaleY: -1 }],
                      },
                    ]}
                  >
                    <NHLRinkGraphic
                      xCoord={row.xCoord}
                      yCoord={row.yCoord}
                      teamColor={row.teamColor}
                      teamSide={row.eventTeamSide}
                      homeTeamDefendingSide={row.homeTeamDefendingSide}
                      isScoring={false}
                      showTargetPath={row.typeKey === "shot-on-goal"}
                      orientation="horizontal"
                    />
                  </View>
                )}
              </TouchableOpacity>
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
                Event Players
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
              {!!selectedGoalPlay?.scorerProfile && (
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
                    Player
                  </Text>
                  <TouchableOpacity
                    activeOpacity={
                      selectedGoalPlay?.scorerProfile?.id ? 0.8 : 1
                    }
                    disabled={
                      !selectedGoalPlay?.scorerProfile?.id || !onPlayerPress
                    }
                    onPress={() =>
                      openPlayerFromProfile(selectedGoalPlay.scorerProfile)
                    }
                    style={[
                      styles.playerPopupRow,
                      { backgroundColor: theme.surfaceSecondary },
                    ]}
                  >
                    {selectedGoalPlay?.scorerProfile?.headshot ? (
                      <Image
                        source={{
                          uri: selectedGoalPlay.scorerProfile.headshot,
                        }}
                        style={[
                          styles.playerPopupAvatar,
                          {
                            borderColor:
                              selectedGoalPlay?.teamColor || theme.border,
                            backgroundColor: `${selectedGoalPlay?.teamColor || theme.border}66`,
                          },
                        ]}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <View
                        style={[
                          styles.playerPopupAvatar,
                          styles.playerPopupAvatarFallback,
                          {
                            backgroundColor: `${selectedGoalPlay?.teamColor || theme.border}66`,
                            borderColor:
                              selectedGoalPlay?.teamColor || theme.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.playerPopupInitials,
                            { color: theme.text },
                          ]}
                        >
                          P
                        </Text>
                      </View>
                    )}
                    <View style={styles.playerPopupNameCol}>
                      <Text
                        style={[
                          styles.playerPopupFirstName,
                          { color: theme.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {selectedGoalPlay?.scorerProfile?.firstName || " "}
                      </Text>
                      <Text
                        style={[
                          styles.playerPopupLastName,
                          { color: theme.text },
                        ]}
                        numberOfLines={1}
                      >
                        {selectedGoalPlay?.scorerProfile?.lastName ||
                          selectedGoalPlay?.scorerName ||
                          "Unknown"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}

              {Array.isArray(selectedGoalPlay?.assistProfiles) &&
              selectedGoalPlay.assistProfiles.length > 0 ? (
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
                    {selectedGoalPlay.assistProfiles.length > 1
                      ? "Related Players"
                      : "Related Player"}
                  </Text>
                  {selectedGoalPlay.assistProfiles.map((assistProfile, idx) => (
                    <TouchableOpacity
                      key={`play-related-${assistProfile?.id || assistProfile?.name || idx}`}
                      activeOpacity={assistProfile?.id ? 0.8 : 1}
                      disabled={!assistProfile?.id || !onPlayerPress}
                      onPress={() => openPlayerFromProfile(assistProfile)}
                      style={[
                        styles.playerPopupRow,
                        {
                          backgroundColor: theme.surfaceSecondary,
                          marginTop: idx === 0 ? 0 : 8,
                        },
                      ]}
                    >
                      {assistProfile?.headshot ? (
                        <Image
                          source={{ uri: assistProfile.headshot }}
                          style={[
                            styles.playerPopupAvatar,
                            {
                              borderColor:
                                selectedGoalPlay?.teamColor || theme.border,
                              backgroundColor: `${selectedGoalPlay?.teamColor || theme.border}66`,
                            },
                          ]}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                        />
                      ) : (
                        <View
                          style={[
                            styles.playerPopupAvatar,
                            styles.playerPopupAvatarFallback,
                            {
                              backgroundColor: `${selectedGoalPlay?.teamColor || theme.border}66`,
                              borderColor:
                                selectedGoalPlay?.teamColor || theme.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.playerPopupInitials,
                              { color: theme.text },
                            ]}
                          >
                            R
                          </Text>
                        </View>
                      )}
                      <View style={styles.playerPopupNameCol}>
                        <Text
                          style={[
                            styles.playerPopupFirstName,
                            { color: theme.textSecondary },
                          ]}
                          numberOfLines={1}
                        >
                          {assistProfile?.firstName || " "}
                        </Text>
                        <Text
                          style={[
                            styles.playerPopupLastName,
                            { color: theme.text },
                          ]}
                          numberOfLines={1}
                        >
                          {assistProfile?.lastName ||
                            assistProfile?.name ||
                            "Unknown"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

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
                  Goal Share Card
                </Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={openGoalShareFromPlay}
                  style={[
                    styles.goalShareActionBtn,
                    {
                      backgroundColor: theme.surfaceSecondary,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Ionicons name="share-outline" size={16} color={theme.text} />
                  <Text
                    style={[styles.goalShareActionText, { color: theme.text }]}
                  >
                    Open Goal Share Card
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
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

  const timelineRowsHeight = useMemo(
    () =>
      chartRows.reduce((sum, row) => sum + (row.type === "team" ? 16 : 22), 0),
    [chartRows],
  );

  const goalMarkers = useMemo(() => {
    const plays = Array.isArray(game?.plays) ? game.plays : [];
    const markers = [];

    plays.forEach((play, idx) => {
      const typeKey = String(play?.typeDescKey || "").toLowerCase();
      const isGoal =
        Number(play?.typeCode) === 505 ||
        typeKey === "goal" ||
        play?.scoringPlay === true;
      if (!isGoal) return;

      const period = Number(play?.periodDescriptor?.number || 0);
      if (!Number.isFinite(period) || period <= 0) return;
      if (selectedPeriod && period !== selectedPeriod) return;

      const baseMin = getPeriodStartMin(period);
      const periodLengthMin = getPeriodLengthMin(period);
      const periodLengthSecs = Math.round(periodLengthMin * 60);

      const remainingSecs = parseClockSecs(play?.timeRemaining);
      const elapsedSecsFromRemaining = Number.isFinite(remainingSecs)
        ? Math.max(0, periodLengthSecs - remainingSecs)
        : null;
      const elapsedSecsFromInPeriod = parseClockSecs(play?.timeInPeriod);

      const elapsedSecs = Number.isFinite(elapsedSecsFromRemaining)
        ? elapsedSecsFromRemaining
        : Number.isFinite(elapsedSecsFromInPeriod)
          ? elapsedSecsFromInPeriod
          : null;
      if (!Number.isFinite(elapsedSecs)) return;

      const minute = baseMin + elapsedSecs / 60;
      if (periodWindow) {
        if (minute < periodWindow.startMin || minute > periodWindow.endMin) {
          return;
        }
      }

      const ownerTeamId = Number(play?.details?.eventOwnerTeamId);
      const ownerAbbr = String(
        play?.details?.eventOwnerTeamAbbrev || "",
      ).toUpperCase();

      const isAway =
        Number.isFinite(ownerTeamId) &&
        String(ownerTeamId) === String(game?.away?.id);
      const isHome =
        Number.isFinite(ownerTeamId) &&
        String(ownerTeamId) === String(game?.home?.id);

      const teamAbbr = isAway
        ? String(game?.away?.abbreviation || ownerAbbr || "AWY").toUpperCase()
        : isHome
          ? String(game?.home?.abbreviation || ownerAbbr || "HME").toUpperCase()
          : ownerAbbr || "UNK";
      const teamLogo = isAway
        ? game?.away?.logo || getTeamLogoUrl("nhl", teamAbbr)
        : isHome
          ? game?.home?.logo || getTeamLogoUrl("nhl", teamAbbr)
          : getTeamLogoUrl("nhl", teamAbbr);
      const teamColor = NHLService.getTeamColor(teamAbbr, colors.primary);

      // Keep unique markers for same team/period/time bucket.
      const dedupeKey = `${teamAbbr}|${period}|${Math.round(minute * 10)}`;
      markers.push({
        key: `goal-marker-${idx}-${dedupeKey}`,
        dedupeKey,
        minute,
        period,
        teamAbbr,
        teamLogo,
        teamColor,
      });
    });

    const seen = new Set();
    return markers
      .filter((marker) => {
        if (seen.has(marker.dedupeKey)) return false;
        seen.add(marker.dedupeKey);
        return true;
      })
      .sort((a, b) => a.minute - b.minute);
  }, [
    colors.primary,
    game?.away?.abbreviation,
    game?.away?.id,
    game?.away?.logo,
    game?.gameType,
    game?.home?.abbreviation,
    game?.home?.id,
    game?.home?.logo,
    game?.plays,
    getTeamLogoUrl,
    periodWindow,
    selectedPeriod,
  ]);

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
              ? Number(selectedPeriod) <= 3
                ? `P${selectedPeriod}`
                : getNhlExtraPeriodLabel({
                    number: selectedPeriod,
                    gameType: game?.gameType,
                    longForm: false,
                  })
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
                    {period === 4
                      ? getNhlExtraPeriodLabel({
                          number: period,
                          gameType: game?.gameType,
                          longForm: true,
                        })
                      : period > 4
                        ? getNhlExtraPeriodLabel({
                            number: period,
                            gameType: game?.gameType,
                            longForm: true,
                          })
                        : `Period ${period}`}
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

                  <View
                    style={[
                      styles.shiftsGoalLinesOverlay,
                      { height: timelineRowsHeight },
                    ]}
                    pointerEvents="none"
                  >
                    {goalMarkers.map((marker) => {
                      const left =
                        (marker.minute - timelineBounds.minStart) * PX_PER_MIN;
                      return (
                        <View
                          key={marker.key}
                          style={[
                            styles.shiftsGoalLine,
                            {
                              left,
                              backgroundColor: marker.teamColor,
                            },
                          ]}
                        />
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

                    {goalMarkers.map((marker) => {
                      if (!marker?.teamLogo) return null;
                      const left =
                        (marker.minute - timelineBounds.minStart) * PX_PER_MIN;
                      return (
                        <Image
                          key={`${marker.key}-logo`}
                          source={{ uri: marker.teamLogo }}
                          style={[
                            styles.shiftsGoalLogo,
                            {
                              left,
                              borderColor: marker.teamColor,
                            },
                          ]}
                          contentFit="contain"
                        />
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

const getTextOnColor = (hex) => {
  const v = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(v)) return "#FFFFFF";
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return l > 0.55 ? "#111111" : "#FFFFFF";
};

const NHLRinkGraphic = ({
  xCoord,
  yCoord,
  teamColor,
  teamSide,
  homeTeamDefendingSide,
  isScoring,
  showTargetPath = false,
  orientation = "vertical",
}) => {
  const blue = "#0B71B8";
  const red = "#F0131E";
  const rinkFrame = { x: 10, y: 10, width: 300, height: 168 };
  const leftGoalRect = { x: 28, y: 82, width: 6, height: 24 };
  const rightGoalRect = { x: 286, y: 82, width: 6, height: 24 };
  const coordBounds = {
    xMin: -99,
    xMax: 99,
    yMin: -42,
    yMax: 42,
  };
  const toCoordX = (rinkPx) =>
    coordBounds.xMin +
    ((rinkPx - rinkFrame.x) / rinkFrame.width) *
      (coordBounds.xMax - coordBounds.xMin);
  const toCoordY = (rinkPy) =>
    coordBounds.yMin +
    ((rinkPy - rinkFrame.y) / rinkFrame.height) *
      (coordBounds.yMax - coordBounds.yMin);
  const goalSampleRects = {
    left: {
      x: toCoordX(leftGoalRect.x + leftGoalRect.width / 2),
      y: toCoordY(leftGoalRect.y + leftGoalRect.height / 2),
    },
    right: {
      x: toCoordX(rightGoalRect.x + rightGoalRect.width / 2),
      y: toCoordY(rightGoalRect.y + rightGoalRect.height / 2),
    },
  };

  const safeTeamColor = String(teamColor || "#2563eb");
  const safeTeamSide = String(teamSide || "")
    .trim()
    .toLowerCase();
  const safeDefendingSide = String(homeTeamDefendingSide || "")
    .trim()
    .toLowerCase();
  const shotXRaw =
    xCoord === null || xCoord === undefined || xCoord === ""
      ? null
      : Number(xCoord);
  const shotYRaw =
    yCoord === null || yCoord === undefined || yCoord === ""
      ? null
      : Number(yCoord);
  const hasShot = Number.isFinite(shotXRaw) && Number.isFinite(shotYRaw);
  const shotX = hasShot ? shotXRaw : null;
  const shotY = hasShot ? shotYRaw : null;

  let targetGoal = goalSampleRects.right;
  if (safeDefendingSide === "left") {
    targetGoal =
      safeTeamSide === "away" ? goalSampleRects.left : goalSampleRects.right;
  } else if (safeDefendingSide === "right") {
    targetGoal =
      safeTeamSide === "home" ? goalSampleRects.left : goalSampleRects.right;
  } else if (hasShot) {
    targetGoal = shotX < 0 ? goalSampleRects.left : goalSampleRects.right;
  }

  const shotBorderColor = isScoring ? "#FFFFFF" : safeTeamColor;
  const shotFillColor = isScoring ? safeTeamColor : "#FFFFFF";
  const goalFillColor = safeTeamColor;
  const shotRadius = 7.5;
  const goalRadius = 4;
  const isHorizontal = String(orientation || "").toLowerCase() === "horizontal";
  const shouldShowTargetPath = Boolean(showTargetPath);
  const rinkX = (x) =>
    rinkFrame.x +
    ((x - coordBounds.xMin) / (coordBounds.xMax - coordBounds.xMin)) *
      rinkFrame.width;
  const rinkY = (y) =>
    rinkFrame.y +
    ((y - coordBounds.yMin) / (coordBounds.yMax - coordBounds.yMin)) *
      rinkFrame.height;

  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={isHorizontal ? "0 0 320 188" : "0 0 188 320"}
    >
      <G transform={isHorizontal ? undefined : "translate(188 0) rotate(90)"}>
        <Rect
          x="10"
          y="10"
          width="300"
          height="168"
          rx="36"
          fill="#FFFFFF"
          stroke={blue}
          strokeWidth="3.5"
        />

        <Line
          x1="160"
          y1="10"
          x2="160"
          y2="178"
          stroke={red}
          strokeWidth="2.5"
        />
        <Line
          x1="108"
          y1="10"
          x2="108"
          y2="178"
          stroke={blue}
          strokeWidth="2"
        />
        <Line
          x1="212"
          y1="10"
          x2="212"
          y2="178"
          stroke={blue}
          strokeWidth="2"
        />
        <Line x1="34" y1="10" x2="34" y2="178" stroke={red} strokeWidth="1.8" />
        <Line
          x1="286"
          y1="10"
          x2="286"
          y2="178"
          stroke={red}
          strokeWidth="1.8"
        />

        <Circle
          cx="160"
          cy="94"
          r="22"
          fill="none"
          stroke={blue}
          strokeWidth="2"
        />
        <Circle cx="160" cy="94" r="2.3" fill={blue} />

        <Circle
          cx="70"
          cy="53"
          r="22"
          fill="none"
          stroke={red}
          strokeWidth="2"
        />
        <Circle
          cx="70"
          cy="135"
          r="22"
          fill="none"
          stroke={red}
          strokeWidth="2"
        />
        <Circle
          cx="250"
          cy="53"
          r="22"
          fill="none"
          stroke={red}
          strokeWidth="2"
        />
        <Circle
          cx="250"
          cy="135"
          r="22"
          fill="none"
          stroke={red}
          strokeWidth="2"
        />

        <Line x1="64" y1="53" x2="76" y2="53" stroke={red} strokeWidth="1.6" />
        <Line x1="70" y1="47" x2="70" y2="59" stroke={red} strokeWidth="1.6" />
        <Line
          x1="244"
          y1="53"
          x2="256"
          y2="53"
          stroke={red}
          strokeWidth="1.6"
        />
        <Line
          x1="250"
          y1="47"
          x2="250"
          y2="59"
          stroke={red}
          strokeWidth="1.6"
        />
        <Line
          x1="64"
          y1="135"
          x2="76"
          y2="135"
          stroke={red}
          strokeWidth="1.6"
        />
        <Line
          x1="70"
          y1="129"
          x2="70"
          y2="141"
          stroke={red}
          strokeWidth="1.6"
        />
        <Line
          x1="244"
          y1="135"
          x2="256"
          y2="135"
          stroke={red}
          strokeWidth="1.6"
        />
        <Line
          x1="250"
          y1="129"
          x2="250"
          y2="141"
          stroke={red}
          strokeWidth="1.6"
        />

        <Line x1="62" y1="30" x2="62" y2="38" stroke={red} strokeWidth="1.6" />
        <Line x1="78" y1="30" x2="78" y2="38" stroke={red} strokeWidth="1.6" />
        <Line
          x1="62"
          y1="150"
          x2="62"
          y2="158"
          stroke={red}
          strokeWidth="1.6"
        />
        <Line
          x1="78"
          y1="150"
          x2="78"
          y2="158"
          stroke={red}
          strokeWidth="1.6"
        />
        <Line
          x1="242"
          y1="30"
          x2="242"
          y2="38"
          stroke={red}
          strokeWidth="1.6"
        />
        <Line
          x1="258"
          y1="30"
          x2="258"
          y2="38"
          stroke={red}
          strokeWidth="1.6"
        />
        <Line
          x1="242"
          y1="150"
          x2="242"
          y2="158"
          stroke={red}
          strokeWidth="1.6"
        />
        <Line
          x1="258"
          y1="150"
          x2="258"
          y2="158"
          stroke={red}
          strokeWidth="1.6"
        />

        <Circle cx="128" cy="57" r="1.9" fill={red} />
        <Circle cx="192" cy="57" r="1.9" fill={red} />
        <Circle cx="128" cy="131" r="1.9" fill={red} />
        <Circle cx="192" cy="131" r="1.9" fill={red} />

        <Circle
          cx="34"
          cy="94"
          r="12"
          fill="none"
          stroke={blue}
          strokeWidth="2"
        />
        <Circle
          cx="286"
          cy="94"
          r="12"
          fill="none"
          stroke={blue}
          strokeWidth="2"
        />
        <Rect
          x={leftGoalRect.x}
          y={leftGoalRect.y}
          width={leftGoalRect.width}
          height={leftGoalRect.height}
          rx="3"
          fill="#FFFFFF"
          stroke={red}
          strokeWidth="1.6"
        />
        <Rect
          x={rightGoalRect.x}
          y={rightGoalRect.y}
          width={rightGoalRect.width}
          height={rightGoalRect.height}
          rx="3"
          fill="#FFFFFF"
          stroke={red}
          strokeWidth="1.6"
        />

        {hasShot && shouldShowTargetPath && (
          <Line
            x1={rinkX(shotX)}
            y1={rinkY(shotY)}
            x2={rinkX(targetGoal.x)}
            y2={rinkY(targetGoal.y)}
            stroke={safeTeamColor}
            strokeWidth="1.6"
            strokeOpacity="0.9"
          />
        )}

        {hasShot && (
          <Circle
            cx={rinkX(shotX)}
            cy={rinkY(shotY)}
            r={shotRadius + 2}
            fill="none"
            stroke={shotFillColor}
            strokeWidth="1.3"
          />
        )}

        {hasShot && (
          <Circle
            cx={rinkX(shotX)}
            cy={rinkY(shotY)}
            r={shotRadius}
            fill={shotFillColor}
            stroke={shotBorderColor}
            strokeWidth="2.6"
          />
        )}

        {shouldShowTargetPath && (
          <Circle
            cx={rinkX(targetGoal.x)}
            cy={rinkY(targetGoal.y)}
            r={goalRadius + 1.6}
            fill="none"
            stroke={goalFillColor}
            strokeWidth="1.1"
          />
        )}

        {shouldShowTargetPath && (
          <Circle
            cx={rinkX(targetGoal.x)}
            cy={rinkY(targetGoal.y)}
            r={goalRadius}
            fill={goalFillColor}
            stroke="#FFFFFF"
            strokeWidth="2"
          />
        )}
      </G>
    </Svg>
  );
};

const NHLGoalShareCardModal = ({
  visible,
  onClose,
  payload,
  theme,
  colors,
}) => {
  const cardRef = useRef(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!visible) setSharing(false);
  }, [visible]);

  if (!payload) return null;

  const handleShare = async () => {
    if (sharing || !cardRef.current) return;
    try {
      setSharing(true);
      await new Promise((res) => setTimeout(res, 260));
      const uri = await cardRef.current.capture();
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: "Share Goal",
      });
    } catch (e) {
      console.warn("Goal share failed", e);
    } finally {
      setSharing(false);
    }
  };

  const cardWidth = Math.min(width - 48, 540);
  const teamColor = payload?.teamColor || colors.primary;
  const textOnTeam = getTextOnColor(teamColor);
  const homeScore = payload?.scoreAfter?.home ?? "-";
  const awayScore = payload?.scoreAfter?.away ?? "-";
  const homeBold = Number(homeScore) > Number(awayScore);
  const awayBold = Number(awayScore) > Number(homeScore);
  const goalType = payload?.isOwnGoal
    ? "Own Goal"
    : payload?.isPenalty
      ? "Penalty Goal"
      : "Goal";
  const goalSituation = String(payload?.goalSituation || "").trim();
  const assistNames = String(payload?.assistName || "")
    .trim()
    .split(/\s*(?:,|;|\/|&| and )\s*/i)
    .map((name) => name.trim())
    .filter(Boolean);

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={nhlShareCommonStyles.overlay}>
        <ViewShot
          ref={cardRef}
          options={{ format: "png", quality: 1 }}
          style={{ overflow: "hidden" }}
        >
          <View
            style={[
              nhlShareCommonStyles.card,
              { width: cardWidth, backgroundColor: theme.surface },
            ]}
          >
            <View
              style={[
                nhlGoalShareStyles.header,
                {
                  backgroundColor: `${teamColor}33`,
                  borderBottomColor: teamColor,
                },
              ]}
            >
              <View style={nhlGoalShareStyles.headerTopRow}>
                <Text
                  style={[nhlGoalShareStyles.timeText, { color: theme.text }]}
                >
                  {payload?.minuteLabel || ""}
                  {payload?.periodLabel ? ` • ${payload.periodLabel}` : ""}
                </Text>

                <View style={nhlGoalShareStyles.scoreWrap}>
                  {!!payload?.awayLogo && (
                    <Image
                      source={{ uri: payload.awayLogo }}
                      style={nhlGoalShareStyles.scoreLogo}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                    />
                  )}
                  <Text
                    style={[
                      nhlGoalShareStyles.scoreText,
                      { color: theme.text },
                    ]}
                  >
                    <Text style={{ fontWeight: awayBold ? "800" : "400" }}>
                      {awayScore}
                    </Text>
                    {" - "}
                    <Text style={{ fontWeight: homeBold ? "800" : "400" }}>
                      {homeScore}
                    </Text>
                  </Text>
                  {!!payload?.homeLogo && (
                    <Image
                      source={{ uri: payload.homeLogo }}
                      style={nhlGoalShareStyles.scoreLogo}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                    />
                  )}
                </View>
              </View>

              <Text
                style={[nhlGoalShareStyles.goalTypeText, { color: theme.text }]}
              >
                <FontAwesome6 name="hockey-puck" size={14} color={theme.text} />{" "}
                {goalType}
                {goalSituation ? ` • ${goalSituation}` : ""}
              </Text>

              {!!payload?.comment && (
                <Text
                  style={[
                    nhlGoalShareStyles.commentText,
                    { color: theme.textSecondary },
                  ]}
                  numberOfLines={2}
                >
                  {payload.comment}
                </Text>
              )}
            </View>

            <View style={nhlGoalShareStyles.body}>
              <View style={nhlGoalShareStyles.contentRow}>
                <View
                  style={[
                    nhlGoalShareStyles.rinkCol,
                    { backgroundColor: theme.surface },
                  ]}
                >
                  <View
                    style={[
                      nhlGoalShareStyles.rinkWrap,
                      { transform: [{ scaleX: -1 }] },
                    ]}
                  >
                    <NHLRinkGraphic
                      xCoord={payload?.xCoord}
                      yCoord={payload?.yCoord}
                      teamColor={teamColor}
                      teamSide={payload?.teamSide}
                      homeTeamDefendingSide={payload?.homeTeamDefendingSide}
                      isScoring={payload?.isScoring}
                      showTargetPath
                    />
                  </View>
                </View>

                <View
                  pointerEvents="none"
                  style={[
                    nhlGoalShareStyles.rinkDivider,
                    { backgroundColor: theme.border },
                  ]}
                />

                <View style={nhlGoalShareStyles.playerCol}>
                  {!!payload?.playerImageUri ? (
                    <Image
                      source={{ uri: payload.playerImageUri }}
                      style={[
                        nhlGoalShareStyles.avatar,
                        {
                          borderColor: teamColor,
                          backgroundColor: `${teamColor}66`,
                        },
                      ]}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View
                      style={[
                        nhlGoalShareStyles.avatar,
                        nhlGoalShareStyles.avatarFallback,
                        {
                          borderColor: teamColor,
                          backgroundColor: `${teamColor}66`,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          nhlGoalShareStyles.avatarInitial,
                          { color: textOnTeam },
                        ]}
                      >
                        {payload?.scorerInitials || "P"}
                      </Text>
                    </View>
                  )}

                  <Text
                    style={[
                      nhlGoalShareStyles.playerName,
                      { color: theme.text },
                    ]}
                    numberOfLines={1}
                  >
                    {payload?.scorerName || "Unknown Player"}
                  </Text>

                  <View style={nhlGoalShareStyles.teamRow}>
                    {!!payload?.teamLogoUri && (
                      <Image
                        source={{ uri: payload.teamLogoUri }}
                        style={nhlGoalShareStyles.teamLogo}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                      />
                    )}
                    <Text
                      style={[
                        nhlGoalShareStyles.teamName,
                        { color: theme.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {payload?.teamName || payload?.teamAbbr || "Team"}
                    </Text>
                  </View>

                  {!!assistNames.length && (
                    <View style={nhlGoalShareStyles.assistWrap}>
                      <Text
                        style={[
                          nhlGoalShareStyles.assistLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        ASSISTED BY
                      </Text>
                      {assistNames.map((name, index) => (
                        <Text
                          key={`assist-${index}-${name}`}
                          style={[
                            nhlGoalShareStyles.assistName,
                            { color: theme.text },
                          ]}
                          numberOfLines={1}
                        >
                          {name}
                        </Text>
                      ))}
                    </View>
                  )}

                  <View style={nhlGoalShareStyles.statsRow}>
                    {(payload?.statsItems || []).slice(0, 6).map((item) => (
                      <View
                        key={`goal-share-${item.label}`}
                        style={nhlGoalShareStyles.statCell}
                      >
                        <Text
                          style={[
                            nhlGoalShareStyles.statVal,
                            {
                              color:
                                item?.label === "+/-"
                                  ? Number(item?.value) < 0
                                    ? theme.error
                                    : Number(item?.value) > 0
                                      ? theme.success
                                      : theme.text
                                  : theme.text,
                            },
                          ]}
                        >
                          {item.value}
                        </Text>
                        <Text
                          style={[
                            nhlGoalShareStyles.statLbl,
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
            </View>

            <View
              style={[
                nhlShareCommonStyles.cardFooter,
                { borderTopColor: theme.border },
              ]}
            >
              <Text
                style={[nhlShareCommonStyles.cardBrand, { color: theme.text }]}
              >
                SportsHeart{" "}
                <Ionicons name="heart" size={10} color={colors.primary} />
              </Text>
            </View>
          </View>
        </ViewShot>

        <View style={nhlShareCommonStyles.actions}>
          <TouchableOpacity
            style={[
              nhlShareCommonStyles.actionBtn,
              { backgroundColor: teamColor },
            ]}
            onPress={handleShare}
            disabled={sharing}
          >
            <View style={nhlShareCommonStyles.actionBtnRow}>
              <Ionicons name="share-outline" size={16} color="#fff" />
              <Text style={nhlShareCommonStyles.actionBtnTxt}>
                {sharing ? "Sharing..." : "Share"}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              nhlShareCommonStyles.actionBtn,
              {
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
              },
            ]}
            onPress={onClose}
          >
            <View style={nhlShareCommonStyles.actionBtnRow}>
              <Ionicons name="close" size={16} color={theme.text} />
              <Text
                style={[
                  nhlShareCommonStyles.actionBtnTxt,
                  { color: theme.text },
                ]}
              >
                Close
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const NHLPlayerShareCardModal = ({
  visible,
  onClose,
  player,
  game,
  theme,
  colors,
  isDarkMode,
  getTeamLogoUrl,
}) => {
  const cardRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  if (!player) return null;

  const mode = getNhlPlayerMode(player);
  const displayName = getNhlDisplayName(player, game);
  const shareStatItems = buildNhlShareStatItems(player, mode);
  const topStats = buildNhlShareTopStats(shareStatItems, mode);
  const seasonCode = getNhlSeasonSpan();
  const mugHeadshot = getNhlMugHeadshotUrl({
    seasonCode,
    teamAbbrev: player?.teamAbbrev,
    playerId: player?.id,
  });
  const headshot = mugHeadshot || player?.headshot || player?.fallbackHeadshot;
  const teamColor = NHLService.getTeamColor(player?.teamAbbrev, colors.primary);
  const teamLogo =
    (player?.teamSide === "away"
      ? game?.away?.logo
      : player?.teamSide === "home"
        ? game?.home?.logo
        : null) ||
    (player?.teamAbbrev ? getTeamLogoUrl?.("nhl", player.teamAbbrev) : null);
  const awayLogo =
    String(game?.away?.logo || "").trim() ||
    (game?.away?.abbreviation
      ? getTeamLogoUrl?.("nhl", game.away.abbreviation)
      : null);
  const homeLogo =
    String(game?.home?.logo || "").trim() ||
    (game?.home?.abbreviation
      ? getTeamLogoUrl?.("nhl", game.home.abbreviation)
      : null);
  const status = game?.gameState || "";
  const gameDate = game?.startTimeUtc
    ? new Date(normalizeUtcIso(game.startTimeUtc))
    : null;
  const gameDateMonthDay =
    gameDate && !Number.isNaN(gameDate.getTime())
      ? gameDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : "";
  const gameDateYear =
    gameDate && !Number.isNaN(gameDate.getTime())
      ? gameDate.toLocaleDateString("en-US", { year: "numeric" })
      : "";
  const CARD_SIZE = Math.min(width - 48, 540);

  const fullPos =
    player.position === "G"
      ? "Goalie"
      : player.position === "C"
        ? "Center"
        : player.position === "D"
          ? "Defenseman"
          : player.position === "L"
            ? "Left Wing"
            : player.position === "R"
              ? "Right Wing"
              : player.position || "Player";

  const handleShare = async () => {
    if (!cardRef.current || sharing) return;
    try {
      setSharing(true);
      await new Promise((res) => setTimeout(res, 300));
      const uri = await cardRef.current.capture();
      await Sharing.shareAsync(uri, { mimeType: "image/png" });
    } catch (e) {
      console.warn("Share failed", e);
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={nhlShareCommonStyles.overlay}>
        <ViewShot
          ref={cardRef}
          options={{ format: "png", quality: 1 }}
          style={{ overflow: "hidden" }}
        >
          <View
            style={[
              nhlShareCommonStyles.card,
              { width: CARD_SIZE, backgroundColor: theme.surface },
            ]}
          >
            <View
              style={[
                nhlShareStyles.cardHeader,
                {
                  backgroundColor: `${teamColor}22`,
                  borderBottomColor: teamColor,
                },
              ]}
            >
              <View style={nhlShareStyles.headerTopRow}>
                <View
                  style={[
                    nhlShareStyles.posBadge,
                    { backgroundColor: teamColor },
                  ]}
                >
                  <Text
                    style={[
                      nhlShareStyles.posBadgeText,
                      { color: getTextOnColor(teamColor) },
                    ]}
                  >
                    {String(player?.position || "-").toUpperCase()}
                    {" · "}
                    {fullPos}
                  </Text>
                </View>
                {status !== "FUT" && status !== "PRE" ? (
                  <View style={nhlShareStyles.scoreWrap}>
                    {!!awayLogo && (
                      <Image
                        source={{ uri: awayLogo }}
                        style={nhlShareStyles.scoreLogo}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                      />
                    )}
                    <Text
                      style={[
                        nhlShareCommonStyles.cardScore,
                        { color: theme.text },
                      ]}
                    >
                      <Text
                        style={{
                          fontWeight:
                            Number(game?.away?.score) >
                            Number(game?.home?.score)
                              ? "800"
                              : "400",
                          color: theme.text,
                        }}
                      >
                        {game?.away?.score ?? 0}
                      </Text>
                      <Text style={{ color: theme.text }}>{" - "}</Text>
                      <Text
                        style={{
                          fontWeight:
                            Number(game?.home?.score) >
                            Number(game?.away?.score)
                              ? "800"
                              : "400",
                          color: theme.text,
                        }}
                      >
                        {game?.home?.score ?? 0}
                      </Text>
                    </Text>
                    {!!homeLogo && (
                      <Image
                        source={{ uri: homeLogo }}
                        style={nhlShareStyles.scoreLogo}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                      />
                    )}
                  </View>
                ) : (
                  <Text
                    style={{
                      fontWeight: "800",
                      color: theme.text,
                      fontSize: 10,
                    }}
                  >
                    {"SEASON STATS"}
                  </Text>
                )}
              </View>

              <View style={nhlShareStyles.headshotRow}>
                <Image
                  source={{ uri: String(headshot || "") }}
                  style={[
                    nhlShareStyles.cardHeadshot,
                    { borderColor: teamColor },
                  ]}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                <View style={nhlShareStyles.nameBlock}>
                  {topStats.length > 0 ? (
                    <View style={nhlShareStyles.topStatsRow}>
                      {topStats.map((item) => (
                        <View
                          key={`top-${item.label}`}
                          style={nhlShareStyles.topStatCell}
                        >
                          <Text
                            style={[
                              nhlShareStyles.topStatVal,
                              { color: theme.text },
                            ]}
                            numberOfLines={1}
                          >
                            {item.value}
                          </Text>
                          <Text
                            style={[
                              nhlShareStyles.topStatLbl,
                              { color: theme.textSecondary },
                            ]}
                            numberOfLines={1}
                          >
                            {item.label}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text
                      style={[
                        nhlShareStyles.statSummary,
                        { color: theme.text },
                      ]}
                      numberOfLines={2}
                    >
                      {mode === "goalie"
                        ? "Goalie Performance"
                        : "Skater Performance"}
                    </Text>
                  )}
                  <View style={nhlShareStyles.nameDateRow}>
                    <View style={nhlShareStyles.nameTeamWrap}>
                      <Text
                        style={[nhlShareStyles.fullName, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {displayName || player?.name || "Unknown Player"}
                      </Text>
                      <View style={nhlShareStyles.teamNameRow}>
                        {!!teamLogo && (
                          <Image
                            source={{ uri: teamLogo }}
                            style={nhlShareStyles.teamNameLogo}
                            contentFit="contain"
                            cachePolicy="memory-disk"
                          />
                        )}
                        <Text
                          style={[
                            nhlShareStyles.teamNameLabel,
                            { color: theme.textSecondary },
                          ]}
                          numberOfLines={1}
                        >
                          {player?.teamName || player?.teamAbbrev || ""}
                        </Text>
                      </View>
                    </View>
                    {!!gameDateMonthDay && !!gameDateYear && (
                      <View style={nhlShareStyles.dateWrap}>
                        <Text
                          style={[
                            nhlShareStyles.gameDateLine,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {gameDateMonthDay}
                        </Text>
                        <Text
                          style={[
                            nhlShareStyles.gameDateLine,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {gameDateYear}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </View>

            <View style={nhlShareStyles.statGrid}>
              {shareStatItems.slice(0, 9).map((row, i) => {
                const pmNum = row.isPlusMinus
                  ? parseFloat(String(row.value).replace(/[^0-9.\-]/g, ""))
                  : null;
                const statColor =
                  row.isPlusMinus && Number.isFinite(pmNum)
                    ? pmNum > 0
                      ? theme.success
                      : pmNum < 0
                        ? theme.error
                        : theme.text
                    : theme.text;
                return (
                  <View
                    key={`share-stat-${row.key}-${i}`}
                    style={[
                      nhlShareStyles.statCell,
                      { borderColor: theme.border },
                      i % 3 !== 2 && {
                        borderRightWidth: StyleSheet.hairlineWidth,
                      },
                      i < 6 && { borderBottomWidth: StyleSheet.hairlineWidth },
                    ]}
                  >
                    {!!row.pct && (
                      <Text
                        style={[
                          nhlShareStyles.statPct,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {row.pct}
                      </Text>
                    )}
                    <Text
                      style={[nhlShareStyles.statVal, { color: statColor }]}
                    >
                      {row.value}
                    </Text>
                    <Text
                      style={[
                        nhlShareStyles.statLbl,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {row.label}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View
              style={[
                nhlShareCommonStyles.cardFooter,
                { borderTopColor: theme.border },
              ]}
            >
              <Text
                style={[nhlShareCommonStyles.cardBrand, { color: theme.text }]}
              >
                SportsHeart{" "}
                <Ionicons name="heart" size={10} color={colors.primary} />
              </Text>
            </View>
          </View>
        </ViewShot>

        <View style={nhlShareCommonStyles.actions}>
          <TouchableOpacity
            onPress={handleShare}
            disabled={sharing}
            style={[
              nhlShareCommonStyles.actionBtn,
              { backgroundColor: teamColor },
            ]}
          >
            <View style={nhlShareCommonStyles.actionBtnRow}>
              <Ionicons name="share-outline" size={16} color="#fff" />
              <Text style={nhlShareCommonStyles.actionBtnTxt}>
                {sharing ? "Sharing..." : "Share"}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onClose}
            style={[
              nhlShareCommonStyles.actionBtn,
              { backgroundColor: theme.border },
            ]}
          >
            <Text
              style={[nhlShareCommonStyles.actionBtnTxt, { color: theme.text }]}
            >
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const NHLPlayerDetailModal = ({
  visible,
  onClose,
  player,
  allPlayers,
  game,
  theme,
  colors,
  isDarkMode,
  getTeamLogoUrl,
}) => {
  const panY = useRef(new Animated.Value(0)).current;
  const [compareActive, setCompareActive] = useState(false);
  const [compareChooserVisible, setCompareChooserVisible] = useState(false);
  const [compareTargetId, setCompareTargetId] = useState(null);
  const [playerShareVisible, setPlayerShareVisible] = useState(false);
  const navigation = useNavigation();

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dy > 8 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) panY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 60) {
          if (typeof onClose === "function") onClose();
          panY.setValue(0);
        } else {
          Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  useEffect(() => {
    if (!visible) {
      setCompareActive(false);
      setCompareChooserVisible(false);
      setCompareTargetId(null);
      setPlayerShareVisible(false);
    }
  }, [visible]);

  if (!player) return null;

  const mode = getNhlPlayerMode(player);
  const playerDisplayName = getNhlDisplayName(player, game);
  const seasonCode = getNhlSeasonSpan();
  const teamColor = NHLService.getTeamColor(player?.teamAbbrev, colors.primary);
  const headshot =
    getNhlMugHeadshotUrl({
      seasonCode,
      teamAbbrev: player?.teamAbbrev,
      playerId: player?.id,
    }) ||
    player?.headshot ||
    player?.fallbackHeadshot;

  const compareTarget =
    compareTargetId != null
      ? (allPlayers || []).find(
          (p) => Number(p?.id) === Number(compareTargetId),
        ) || null
      : null;
  const compareMode = compareTarget ? getNhlPlayerMode(compareTarget) : mode;

  const statRows = buildNhlStatRows(player, mode);
  const compareRows = compareTarget
    ? buildNhlStatRows(compareTarget, compareMode)
    : [];
  const compareMap = new Map(compareRows.map((r) => [r.key, r]));
  const statRangeByKey = (() => {
    const map = new Map();
    const peerPool = (allPlayers || []).filter(
      (p) => getNhlPlayerMode(p) === mode,
    );
    const sourcePlayers = peerPool.length > 0 ? peerPool : [player];
    sourcePlayers.forEach((p) => {
      buildNhlStatRows(p, mode).forEach((row) => {
        const value = Number(row?.numeric);
        if (!Number.isFinite(value)) return;
        if (!map.has(row.key)) {
          map.set(row.key, { min: value, max: value });
          return;
        }
        const prev = map.get(row.key);
        map.set(row.key, {
          min: Math.min(prev.min, value),
          max: Math.max(prev.max, value),
        });
      });
    });
    return map;
  })();

  const closeModal = () => {
    setCompareActive(false);
    setCompareChooserVisible(false);
    setCompareTargetId(null);
    if (typeof onClose === "function") onClose();
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

  const compareCandidates = (allPlayers || [])
    .filter((p) => Number(p?.id) !== Number(player?.id))
    .filter((p) => getNhlPlayerMode(p) === mode)
    .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={closeModal}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={closeModal}>
        <View style={nhlModalStyles.backdrop} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          nhlModalStyles.sheet,
          {
            backgroundColor: theme.surface,
            borderTopColor: theme.surface,
            transform: [{ translateY: panY }],
          },
        ]}
      >
        <View
          {...panResponder.panHandlers}
          style={[
            nhlModalStyles.dragStrip,
            { borderBottomColor: !compareActive ? teamColor : theme.border },
          ]}
        >
          <View style={nhlModalStyles.handleRow}>
            <View style={{ width: 28, height: 28 }} />
            <View
              style={[
                nhlModalStyles.handle,
                { backgroundColor: theme.surface },
              ]}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => {
                  setCompareActive((s) => {
                    const next = !s;
                    if (!next) {
                      setCompareChooserVisible(false);
                      setCompareTargetId(null);
                    }
                    return next;
                  });
                }}
                style={[
                  nhlModalStyles.iconBtn,
                  { backgroundColor: theme.surfaceSecondary },
                ]}
              >
                <Ionicons name="people" size={16} color={theme.text} />
              </TouchableOpacity>
              {!compareActive && (
                <TouchableOpacity
                  onPress={() => setPlayerShareVisible(true)}
                  style={[
                    nhlModalStyles.iconBtn,
                    { backgroundColor: `${teamColor}33` },
                  ]}
                >
                  <Ionicons name="share-outline" size={16} color={teamColor} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={closeModal}
                style={[
                  nhlModalStyles.iconBtn,
                  { backgroundColor: theme.error },
                ]}
              >
                <Text
                  style={[nhlModalStyles.iconBtnText, { color: theme.text }]}
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
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => {
                  closeModal();
                  navigation.navigate("PlayerPage", {
                    playerId: Number(player?.id),
                    playerName: playerDisplayName,
                    teamId: player?.teamId,
                    sport: "nhl",
                  });
                }}
                style={{
                  width: "48%",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View style={nhlModalStyles.headshotWrap}>
                  <View style={{ position: "relative" }}>
                    <Image
                      source={{ uri: String(headshot || "") }}
                      style={[
                        nhlModalStyles.headshot,
                        { borderColor: teamColor },
                      ]}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                    <View
                      style={nhlModalStyles.headshotBadge}
                      pointerEvents="none"
                    >
                      <Text style={nhlModalStyles.headshotBadgeText}>
                        {String(player?.position || "-").toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text
                  style={[nhlModalStyles.playerName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {playerDisplayName}
                </Text>
                <Text
                  style={[
                    nhlModalStyles.jerseyNum,
                    { color: theme.textSecondary, marginBottom: -8 },
                  ]}
                >
                  {[player?.number ? `#${player.number}` : "", player?.teamName]
                    .filter(Boolean)
                    .join(" • ")}
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
                      <Image
                        source={{
                          uri:
                            getNhlMugHeadshotUrl({
                              seasonCode,
                              teamAbbrev: compareTarget?.teamAbbrev,
                              playerId: compareTarget?.id,
                            }) ||
                            compareTarget?.headshot ||
                            compareTarget?.fallbackHeadshot ||
                            "",
                        }}
                        style={[
                          nhlModalStyles.headshot,
                          {
                            borderColor: NHLService.getTeamColor(
                              compareTarget?.teamAbbrev,
                              colors.secondary,
                            ),
                          },
                        ]}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                      <View
                        style={nhlModalStyles.headshotBadge}
                        pointerEvents="none"
                      >
                        <Text style={nhlModalStyles.headshotBadgeText}>
                          {String(compareTarget?.position || "-").toUpperCase()}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setCompareTargetId(null)}
                        style={[
                          nhlModalStyles.compareChosenClose,
                          { backgroundColor: theme.error },
                        ]}
                      >
                        <Text style={{ color: theme.text, fontWeight: "800" }}>
                          X
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <Text
                      style={[
                        nhlModalStyles.playerName,
                        { color: theme.text, marginTop: 10 },
                      ]}
                    >
                      {getNhlDisplayName(compareTarget, game)}
                    </Text>
                    <Text
                      style={[
                        nhlModalStyles.jerseyNum,
                        { color: theme.textSecondary, marginBottom: -8 },
                      ]}
                    >
                      {[
                        compareTarget?.number ? `#${compareTarget.number}` : "",
                        compareTarget?.teamName,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
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
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => {
                closeModal();
                navigation.navigate("PlayerPage", {
                  playerId: Number(player?.id),
                  playerName: playerDisplayName,
                  teamId: player?.teamId,
                  sport: "nhl",
                });
              }}
              style={{ alignItems: "center" }}
            >
              <View style={nhlModalStyles.headshotWrap}>
                <View style={{ position: "relative" }}>
                  <Image
                    source={{ uri: String(headshot || "") }}
                    style={[
                      nhlModalStyles.headshot,
                      { borderColor: teamColor },
                    ]}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  <View
                    style={nhlModalStyles.headshotBadge}
                    pointerEvents="none"
                  >
                    <Text style={nhlModalStyles.headshotBadgeText}>
                      {String(player?.position || "-").toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>
              <Text
                style={[nhlModalStyles.playerName, { color: theme.text }]}
                numberOfLines={1}
              >
                {playerDisplayName}
              </Text>
              <Text
                style={[
                  nhlModalStyles.jerseyNum,
                  { color: theme.textSecondary },
                ]}
              >
                {[player?.number ? `#${player.number}` : "", player?.teamName]
                  .filter(Boolean)
                  .join(" • ")}
              </Text>
            </TouchableOpacity>
          )}
        </View>

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
                  const pColor = NHLService.getTeamColor(
                    p?.teamAbbrev,
                    colors.secondary,
                  );
                  const pHeadshot =
                    getNhlMugHeadshotUrl({
                      seasonCode,
                      teamAbbrev: p?.teamAbbrev,
                      playerId: p?.id,
                    }) ||
                    p?.headshot ||
                    p?.fallbackHeadshot;
                  const pLogo =
                    (p?.teamSide === "away"
                      ? game?.away?.logo
                      : p?.teamSide === "home"
                        ? game?.home?.logo
                        : null) ||
                    (p?.teamAbbrev
                      ? getTeamLogoUrl?.("nhl", p.teamAbbrev)
                      : null);
                  return (
                    <TouchableOpacity
                      key={`cmp-${p.id}`}
                      onPress={() => {
                        setCompareTargetId(p.id);
                        setCompareChooserVisible(false);
                      }}
                    >
                      <View
                        style={[
                          nhlModalStyles.compareBubble,
                          {
                            borderColor: pColor,
                            backgroundColor: theme.surface,
                            borderWidth: 1,
                          },
                        ]}
                      >
                        <View style={nhlModalStyles.compareRow}>
                          <View
                            style={[
                              nhlModalStyles.compareHeadshotWrap,
                              {
                                borderWidth: 1,
                                borderColor: pColor,
                                overflow: "visible",
                              },
                            ]}
                          >
                            <Image
                              source={{ uri: String(pHeadshot || "") }}
                              style={[
                                nhlModalStyles.compareHeadshotImage,
                                { borderColor: pColor },
                              ]}
                              contentFit="cover"
                              cachePolicy="memory-disk"
                            />
                            {!!pLogo && (
                              <Image
                                source={{ uri: pLogo }}
                                style={[
                                  nhlModalStyles.compareTeamLogo,
                                  {
                                    borderColor: pColor,
                                    backgroundColor: `${pColor}33`,
                                  },
                                ]}
                                contentFit="contain"
                                cachePolicy="memory-disk"
                              />
                            )}
                          </View>
                          <View style={nhlModalStyles.compareInfo}>
                            <Text
                              style={[
                                nhlModalStyles.compareName,
                                { color: theme.text },
                              ]}
                              numberOfLines={1}
                            >
                              {p?.name || "Unknown Player"}
                            </Text>
                            <Text
                              style={[
                                nhlModalStyles.compareSub,
                                { color: theme.textSecondary },
                              ]}
                              numberOfLines={1}
                            >
                              {(p?.number ? `#${p.number}` : "") +
                                (p?.teamName ? ` • ${p.teamName}` : "")}
                            </Text>
                          </View>
                          <Text
                            style={[
                              nhlModalStyles.comparePos,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {String(p?.position || "").toUpperCase()}
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
            statRows.map((row, idx) => {
              const cmp = compareMap.get(row.key) || null;
              const rightColor = cmp
                ? NHLService.getTeamColor(
                    compareTarget?.teamAbbrev,
                    colors.secondary,
                  )
                : null;
              return (
                <React.Fragment key={`nhl-stat-${row.key}`}>
                  <View style={nhlModalStyles.statRow}>
                    <Text
                      style={[
                        nhlModalStyles.statRowValueLeft,
                        { color: theme.text },
                      ]}
                    >
                      {row.value}
                    </Text>
                    <View style={nhlModalStyles.statBarWrap}>
                      <View
                        style={[
                          nhlModalStyles.statBarTrack,
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
                                    nhlModalStyles.statBarFill,
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
                          nhlModalStyles.statRowLabelBelow,
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
                      <View style={nhlModalStyles.statRowRight}>
                        <Text
                          style={[
                            nhlModalStyles.statRowValueRight,
                            { color: theme.text },
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
                        nhlModalStyles.statDivider,
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

      <NHLPlayerShareCardModal
        visible={playerShareVisible}
        onClose={() => setPlayerShareVisible(false)}
        player={player}
        game={game}
        theme={theme}
        colors={colors}
        isDarkMode={isDarkMode}
        getTeamLogoUrl={getTeamLogoUrl}
      />
    </Modal>
  );
};

const NHLGameDetailsScreen = ({ route }) => {
  const { gameId } = route.params || {};
  const navigation = useNavigation();
  const { theme, colors, getTeamLogoUrl, isDarkMode } = useTheme();
  const isLoggedIn = useIsLoggedIn();

  const { viewerData, isJoined } = useGamePresence(gameId);

  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState(null);
  const [headerH, setHeaderH] = useState(190);
  const [activeTab, setActiveTab] = useState("Main");
  const [seriesHomeOnly, setSeriesHomeOnly] = useState(false);
  const [seriesVisibleCount, setSeriesVisibleCount] = useState(5);
  const [nowMs, setNowMs] = useState(Date.now());
  const [clockGame, setClockGame] = useState(null);
  const [selectedModalPlayer, setSelectedModalPlayer] = useState(null);
  const [goalSharePayload, setGoalSharePayload] = useState(null);
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [availableStreams, setAvailableStreams] = useState({});
  const [currentStreamType, setCurrentStreamType] = useState("alpha1");
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [showStreamModal, setShowStreamModal] = useState(false);
  const { isUnlocked: isStreamingUnlocked } = useStreamingAccess();
  const scrollY = useMemo(() => new Animated.Value(0), []);
  const streamModalVisibleRef = useRef(false);

  useEffect(() => {
    streamModalVisibleRef.current = showStreamModal;
  }, [showStreamModal]);

  const loadDetails = async (mountedRef = { current: true }) => {
    try {
      if (streamModalVisibleRef.current) {
        return;
      }
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
        gameType: game?.gameType,
      }),
    [game],
  );
  const liveGame = clockGame || game;
  const chatGameData = useMemo(() => {
    if (!liveGame) return null;
    const startUtc = String(liveGame?.startTimeUtc || "").trim();
    const officialDate = startUtc ? startUtc.slice(0, 10) : "";
    return {
      gameDate: startUtc,
      date: startUtc,
      startTime: startUtc,
      datetime: {
        dateTime: startUtc,
        officialDate,
      },
      awayTeam: {
        abbreviation: liveGame?.away?.abbreviation,
        name: liveGame?.away?.name,
      },
      homeTeam: {
        abbreviation: liveGame?.home?.abbreviation,
        name: liveGame?.home?.name,
      },
    };
  }, [liveGame]);

  const visibleTabs = useMemo(() => {
    if (liveGame?.isPre) {
      return TABS.filter((tab) => tab !== "Plays" && tab !== "Shifts");
    }
    return TABS;
  }, [liveGame?.isPre]);

  useEffect(() => {
    setClockGame((prev) => normalizeGameWithClockState(game, prev, Date.now()));
  }, [game]);

  useEffect(() => {
    const source = clockGame || game;
    if (!source) return;

    const scoreboardDate = String(source?.startTimeUtc || "")
      .slice(0, 10)
      .replace(/-/g, "");

    let timerId = null;
    let cancelled = false;

    const pollOnce = async () => {
      const plan = getNhlGamePollingPlan(source, Date.now());
      if (plan.useGameEndpoint) {
        loadDetails({ current: true });
        return;
      }

      if (!scoreboardDate) return;
      try {
        const scoreboard = await NHLService.getScoreboard(scoreboardDate);
        const games = Array.isArray(scoreboard?.games) ? scoreboard.games : [];
        const matched =
          games.find((g) => String(g?.id || "") === String(gameId || "")) ||
          null;
        if (!matched) return;

        const startMs = Date.parse(String(matched?.startTimeUTC || ""));
        const shouldSwitchToGamePolling =
          isNhlGameLive(matched) ||
          (Number.isFinite(startMs) && startMs <= Date.now());
        if (shouldSwitchToGamePolling) {
          loadDetails({ current: true });
        }
      } catch (err) {
        console.warn("NHL pregame scoreboard polling failed", err);
      }
    };

    const scheduleNext = () => {
      if (cancelled) return;
      const plan = getNhlGamePollingPlan(source, Date.now());
      timerId = setTimeout(async () => {
        await pollOnce();
        scheduleNext();
      }, plan.intervalMs);
    };

    scheduleNext();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [clockGame, game, gameId, isDarkMode]);

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

  const awayPenaltyBoxCount = useMemo(() => {
    const box = liveGame?.iceSurface?.awayTeam?.penaltyBox;
    return Array.isArray(box) ? box.length : 0;
  }, [liveGame?.iceSurface?.awayTeam?.penaltyBox]);

  const homePenaltyBoxCount = useMemo(() => {
    const box = liveGame?.iceSurface?.homeTeam?.penaltyBox;
    return Array.isArray(box) ? box.length : 0;
  }, [liveGame?.iceSurface?.homeTeam?.penaltyBox]);

  const awayHasPowerPlay =
    homePenaltyBoxCount > 0 && homePenaltyBoxCount > awayPenaltyBoxCount;
  const homeHasPowerPlay =
    awayPenaltyBoxCount > 0 && awayPenaltyBoxCount > homePenaltyBoxCount;

  const seriesMatches = useMemo(() => {
    const matches = Array.isArray(liveGame?.seasonSeries)
      ? liveGame.seasonSeries
      : [];
    const currentHomeId = Number(liveGame?.home?.id);
    const currentAwayId = Number(liveGame?.away?.id);
    if (
      !matches.length ||
      !Number.isFinite(currentHomeId) ||
      !Number.isFinite(currentAwayId)
    ) {
      return [];
    }

    return matches
      .filter((match) => {
        if (!match) return false;

        const matchHomeId = Number(match?.homeTeam?.id);
        const matchAwayId = Number(match?.awayTeam?.id);
        const ids = [matchHomeId, matchAwayId];

        if (!ids.includes(currentHomeId) || !ids.includes(currentAwayId)) {
          return false;
        }

        if (seriesHomeOnly && matchHomeId !== currentHomeId) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const aTs = new Date(a?.startTimeUTC || a?.gameDate || 0).getTime();
        const bTs = new Date(b?.startTimeUTC || b?.gameDate || 0).getTime();
        const safeA = Number.isNaN(aTs) ? 0 : aTs;
        const safeB = Number.isNaN(bTs) ? 0 : bTs;
        return safeB - safeA;
      });
  }, [
    liveGame?.away?.id,
    liveGame?.home?.id,
    liveGame?.seasonSeries,
    seriesHomeOnly,
  ]);

  const seriesSummary = useMemo(() => {
    const currentHomeId = Number(liveGame?.home?.id);
    const currentAwayId = Number(liveGame?.away?.id);

    if (
      !seriesMatches.length ||
      !Number.isFinite(currentHomeId) ||
      !Number.isFinite(currentAwayId)
    ) {
      return { homeWins: 0, awayWins: 0 };
    }

    let homeWinsCount = 0;
    let awayWinsCount = 0;

    seriesMatches.forEach((match) => {
      const homeScore = Number(match?.homeTeam?.score);
      const awayScore = Number(match?.awayTeam?.score);
      const matchHomeId = Number(match?.homeTeam?.id);
      const matchAwayId = Number(match?.awayTeam?.id);

      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return;
      if (homeScore === awayScore) return;

      const winnerId = homeScore > awayScore ? matchHomeId : matchAwayId;
      if (winnerId === currentHomeId) homeWinsCount += 1;
      else if (winnerId === currentAwayId) awayWinsCount += 1;
    });

    return {
      homeWins: homeWinsCount,
      awayWins: awayWinsCount,
    };
  }, [liveGame?.away?.id, liveGame?.home?.id, seriesMatches]);

  const allModalPlayers = useMemo(() => {
    const map = new Map();
    const asNumberOrNull = (v) => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const register = (raw, teamSideHint = null) => {
      const id = Number(raw?.id ?? raw?.playerId);
      if (!Number.isFinite(id)) return;

      const side =
        teamSideHint ||
        (Number(raw?.teamId) === Number(liveGame?.home?.id)
          ? "home"
          : Number(raw?.teamId) === Number(liveGame?.away?.id)
            ? "away"
            : null);
      const teamAbbrev = String(
        raw?.teamAbbrev ||
          (side === "home" ? liveGame?.home?.abbreviation : "") ||
          (side === "away" ? liveGame?.away?.abbreviation : "") ||
          "",
      )
        .trim()
        .toUpperCase();
      const teamId = Number(
        raw?.teamId ||
          (side === "home" ? liveGame?.home?.id : null) ||
          (side === "away" ? liveGame?.away?.id : null),
      );
      const next = {
        id,
        name: String(raw?.name || "").trim() || `Player ${id}`,
        number:
          raw?.number != null && Number.isFinite(Number(raw.number))
            ? Number(raw.number)
            : null,
        position: String(raw?.position || "").trim(),
        teamSide: side,
        teamId: Number.isFinite(teamId) ? teamId : null,
        teamAbbrev,
        teamName: String(
          raw?.teamName ||
            (side === "home" ? liveGame?.home?.name : "") ||
            (side === "away" ? liveGame?.away?.name : "") ||
            teamAbbrev,
        ).trim(),
        headshot: String(raw?.headshot || "").trim() || null,
        fallbackHeadshot: String(raw?.fallbackHeadshot || "").trim() || null,
        stats: raw?.stats && typeof raw.stats === "object" ? raw.stats : {},
      };

      const prev = map.get(id);
      map.set(id, {
        ...prev,
        ...next,
        stats: {
          ...(prev?.stats || {}),
          ...(next?.stats || {}),
        },
      });
    };

    const buckets = [
      liveGame?.boxscorePlayerByGameStats?.awayTeam?.forwards,
      liveGame?.boxscorePlayerByGameStats?.awayTeam?.defense,
      liveGame?.boxscorePlayerByGameStats?.awayTeam?.goalies,
      liveGame?.boxscorePlayerByGameStats?.homeTeam?.forwards,
      liveGame?.boxscorePlayerByGameStats?.homeTeam?.defense,
      liveGame?.boxscorePlayerByGameStats?.homeTeam?.goalies,
    ];

    buckets.forEach((bucket, idx) => {
      const side = idx < 3 ? "away" : "home";
      (Array.isArray(bucket) ? bucket : []).forEach((p) => {
        const extractedStats = extractNhlStatsFromEntry(p);
        register(
          {
            id: Number(p?.playerId),
            name: String(p?.name || "").trim(),
            number: p?.sweaterNumber,
            position: String(p?.position || "").trim(),
            teamSide: side,
            teamId: Number(
              side === "home" ? liveGame?.home?.id : liveGame?.away?.id,
            ),
            teamAbbrev:
              side === "home"
                ? liveGame?.home?.abbreviation
                : liveGame?.away?.abbreviation,
            teamName:
              side === "home" ? liveGame?.home?.name : liveGame?.away?.name,
            stats: {
              ...extractedStats,
              toi: String(extractedStats?.toi ?? p?.toi ?? "").trim(),
              avgTimeOnIce: String(
                extractedStats?.avgTimeOnIce ?? p?.avgTimeOnIce ?? "",
              ).trim(),
            },
          },
          side,
        );
      });
    });

    const skaterLeaders = Array.isArray(
      liveGame?.matchup?.skaterComparison?.leaders,
    )
      ? liveGame.matchup.skaterComparison.leaders
      : [];
    skaterLeaders.forEach((entry) => {
      const category = String(entry?.category || "")
        .trim()
        .toLowerCase();
      const away = entry?.awayLeader || null;
      const home = entry?.homeLeader || null;
      if (away) {
        register(
          {
            id: away?.playerId,
            name:
              `${String(away?.firstName || "").trim()} ${String(away?.lastName || "").trim()}`.trim() ||
              String(away?.name || "").trim(),
            number: away?.sweaterNumber,
            position: away?.positionCode,
            teamAbbrev: liveGame?.away?.abbreviation,
            teamId: liveGame?.away?.id,
            teamName: liveGame?.away?.name,
            headshot: away?.headshot,
            stats: { [category || "value"]: asNumberOrNull(away?.value) },
          },
          "away",
        );
      }
      if (home) {
        register(
          {
            id: home?.playerId,
            name:
              `${String(home?.firstName || "").trim()} ${String(home?.lastName || "").trim()}`.trim() ||
              String(home?.name || "").trim(),
            number: home?.sweaterNumber,
            position: home?.positionCode,
            teamAbbrev: liveGame?.home?.abbreviation,
            teamId: liveGame?.home?.id,
            teamName: liveGame?.home?.name,
            headshot: home?.headshot,
            stats: { [category || "value"]: asNumberOrNull(home?.value) },
          },
          "home",
        );
      }
    });

    const awayGoalieLeaders = Array.isArray(
      liveGame?.matchup?.goalieComparison?.awayTeam?.leaders,
    )
      ? liveGame.matchup.goalieComparison.awayTeam.leaders
      : [];
    const homeGoalieLeaders = Array.isArray(
      liveGame?.matchup?.goalieComparison?.homeTeam?.leaders,
    )
      ? liveGame.matchup.goalieComparison.homeTeam.leaders
      : [];

    awayGoalieLeaders.forEach((g) => {
      register(
        {
          id: g?.playerId,
          name:
            `${String(g?.firstName || "").trim()} ${String(g?.lastName || "").trim()}`.trim() ||
            String(g?.name || "").trim(),
          number: g?.sweaterNumber,
          position: g?.positionCode || "G",
          teamAbbrev: liveGame?.away?.abbreviation,
          teamId: liveGame?.away?.id,
          teamName: liveGame?.away?.name,
          headshot: g?.headshot,
          stats: {
            gamesPlayed: asNumberOrNull(g?.gamesPlayed),
            wins: asNumberOrNull(g?.wins),
            losses: asNumberOrNull(g?.losses),
            otLosses: asNumberOrNull(g?.otLosses),
            gaa: asNumberOrNull(g?.gaa),
            savePctg: asNumberOrNull(g?.savePcts ?? g?.savePctg),
            shutouts: asNumberOrNull(g?.shutouts),
          },
        },
        "away",
      );
    });
    homeGoalieLeaders.forEach((g) => {
      register(
        {
          id: g?.playerId,
          name:
            `${String(g?.firstName || "").trim()} ${String(g?.lastName || "").trim()}`.trim() ||
            String(g?.name || "").trim(),
          number: g?.sweaterNumber,
          position: g?.positionCode || "G",
          teamAbbrev: liveGame?.home?.abbreviation,
          teamId: liveGame?.home?.id,
          teamName: liveGame?.home?.name,
          headshot: g?.headshot,
          stats: {
            gamesPlayed: asNumberOrNull(g?.gamesPlayed),
            wins: asNumberOrNull(g?.wins),
            losses: asNumberOrNull(g?.losses),
            otLosses: asNumberOrNull(g?.otLosses),
            gaa: asNumberOrNull(g?.gaa),
            savePctg: asNumberOrNull(g?.savePcts ?? g?.savePctg),
            shutouts: asNumberOrNull(g?.shutouts),
          },
        },
        "home",
      );
    });

    return Array.from(map.values()).filter((p) =>
      Number.isFinite(Number(p?.id)),
    );
  }, [
    liveGame?.away?.abbreviation,
    liveGame?.away?.id,
    liveGame?.away?.name,
    liveGame?.boxscorePlayerByGameStats,
    liveGame?.home?.abbreviation,
    liveGame?.home?.id,
    liveGame?.home?.name,
    liveGame?.matchup?.goalieComparison,
    liveGame?.matchup?.skaterComparison?.leaders,
  ]);

  const openPlayerModal = (rawPlayer) => {
    const id = Number(rawPlayer?.id ?? rawPlayer?.playerId);
    if (!Number.isFinite(id)) return;
    const fromPool = allModalPlayers.find((p) => Number(p?.id) === id) || null;
    setSelectedModalPlayer(
      fromPool
        ? {
            ...fromPool,
            stats: { ...(fromPool.stats || {}), ...(rawPlayer?.stats || {}) },
          }
        : rawPlayer,
    );
  };

  const openGoalShareModal = (payload) => {
    if (!payload) return;
    setGoalSharePayload(payload);
  };

  const loadStreams = useCallback(async () => {
    if (!liveGame) return;
    setStreamLoading(true);
    setStreamError(false);
    try {
      const homeTeamName = String(
        liveGame?.home?.name || liveGame?.home?.abbreviation || "",
      ).trim();
      const awayTeamName = String(
        liveGame?.away?.name || liveGame?.away?.abbreviation || "",
      ).trim();
      const streams = await findMatchStreams(homeTeamName, awayTeamName);
      const converted = {};
      Object.keys(streams).forEach((s) => {
        if (streams[s] && (streams[s].embedUrl || streams[s].url)) {
          converted[s] = streams[s].embedUrl || streams[s].url;
        }
      });
      setAvailableStreams(converted);
      const keys = Object.keys(converted);
      if (keys.length > 0) setCurrentStreamType(keys[0]);
    } catch (e) {
      console.error("loadStreams error:", e);
      setStreamError(true);
    } finally {
      setStreamLoading(false);
    }
  }, [liveGame]);

  const openStreamModal = useCallback(async () => {
    const unlock = isStreamingUnlocked ? true : true;
    if (!unlock) {
      Alert.alert(
        "Streaming Locked",
        "Please enter the streaming code in Settings to access live streams.",
        [{ text: "OK" }],
      );
      return;
    }
    setShowStreamModal(true);
    setStreamLoading(true);
    await loadStreams();
    setStreamLoading(false);
  }, [isStreamingUnlocked, loadStreams]);

  const switchStream = (streamType) => {
    setCurrentStreamType(streamType);
    setStreamLoading(true);
    let newUrl = "";
    if (availableStreams[streamType]) newUrl = availableStreams[streamType];
    else {
      newUrl = generateStreamUrl(
        String(liveGame?.away?.name || ""),
        String(liveGame?.home?.name || ""),
        streamType,
      );
    }
    if (newUrl) {
      setAvailableStreams((prev) => ({
        ...prev,
        [streamType]: newUrl,
      }));
    }
    setTimeout(() => setStreamLoading(false), 800);
  };

  const closeStreamModal = () => {
    setShowStreamModal(false);
    setCurrentStreamType("alpha1");
    setAvailableStreams({});
    setStreamError(false);
  };

  useEffect(() => {
    if (activeTab !== "Series") {
      setSeriesVisibleCount(5);
      setSeriesHomeOnly(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab("Main");
    }
  }, [activeTab, visibleTabs]);

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
              record={game?.away?.record}
              theme={theme}
              showPowerPlay={awayHasPowerPlay}
              onPress={() =>
                navigation.navigate("TeamPage", {
                  teamId: game.away.id,
                  team: {
                    id: game.away.id,
                    abbreviation: game.away.abbreviation,
                    displayName: game.away.name,
                  },
                  sport: "nhl",
                })
              }
            />

            <View
              style={[
                styles.statusCenter,
                {
                  marginTop:
                    !liveGame?.isPre &&
                    !isNhlGameFinished(liveGame) &&
                    isStreamingUnlocked
                      ? 25
                      : 0,
                },
              ]}
            >
              <StatusBadge
                game={{
                  ...liveGame,
                  statusMain: statusLines.line1,
                  statusSub: statusLines.line2,
                }}
                theme={theme}
                colors={colors}
              />

              {!liveGame?.isPre &&
                !isNhlGameFinished(liveGame) &&
                isStreamingUnlocked && (
                  <TouchableOpacity
                    style={[styles.streamBtn, { borderColor: colors.primary }]}
                    onPress={openStreamModal}
                    activeOpacity={0.8}
                  >
                    <View style={styles.streamBtnInner}>
                      <View
                        style={[
                          styles.streamBtnDot,
                          { backgroundColor: colors.primary },
                        ]}
                      />
                      <Text
                        style={[
                          styles.streamBtnText,
                          { color: colors.primary },
                        ]}
                      >
                        Stream
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
            </View>

            <TeamSide
              team={game.home}
              logo={homeLogo}
              score={game.home.score}
              side="home"
              isPre={game.isPre}
              isWinner={homeWins}
              isLoser={awayWins}
              record={game?.home?.record}
              theme={theme}
              showPowerPlay={homeHasPowerPlay}
              onPress={() =>
                navigation.navigate("TeamPage", {
                  teamId: game.home.id,
                  team: {
                    id: game.home.id,
                    abbreviation: game.home.abbreviation,
                    displayName: game.home.name,
                  },
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
              {visibleTabs.map((tab) => (
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
              <NHLSkaterComparisonSection
                game={liveGame}
                theme={theme}
                awayColor={awayColor}
                homeColor={homeColor}
                awayLogo={awayLogo}
                homeLogo={homeLogo}
                onPlayerPress={openPlayerModal}
              />
              <NHLGoalieComparisonSection
                game={liveGame}
                theme={theme}
                awayColor={awayColor}
                homeColor={homeColor}
                awayLogo={awayLogo}
                homeLogo={homeLogo}
                onPlayerPress={openPlayerModal}
              />
              <LinescoreTable game={liveGame} theme={theme} colors={colors} />
              {isNhlGameLive(liveGame) ? (
                <LivePlaySection
                  game={liveGame}
                  theme={theme}
                  colors={colors}
                  onPlayerPress={openPlayerModal}
                />
              ) : null}
              <EventsSection
                game={liveGame}
                theme={theme}
                colors={colors}
                onPlayerPress={openPlayerModal}
                onOpenGoalShare={openGoalShareModal}
                getTeamLogoUrl={getTeamLogoUrl}
              />
              <ThreeStarsSection
                game={liveGame}
                theme={theme}
                colors={colors}
                getTeamLogoUrl={getTeamLogoUrl}
              />
              <OfficialsSection game={liveGame} theme={theme} />
            </>
          )}
          {activeTab === "Home" && (
            <NHLTeamRosterSection
              game={liveGame}
              theme={theme}
              teamSide="home"
              teamColor={homeColor}
              onPlayerPress={openPlayerModal}
            />
          )}
          {activeTab === "Away" && (
            <NHLTeamRosterSection
              game={liveGame}
              theme={theme}
              teamSide="away"
              teamColor={awayColor}
              onPlayerPress={openPlayerModal}
            />
          )}
          {activeTab === "Stats" && (
            <NHLStatsSection
              game={liveGame}
              theme={theme}
              homeColor={homeColor}
              awayColor={awayColor}
            />
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
            <PlaysTabSection
              game={liveGame}
              theme={theme}
              colors={colors}
              onPlayerPress={openPlayerModal}
              onOpenGoalShare={openGoalShareModal}
              getTeamLogoUrl={getTeamLogoUrl}
            />
          )}
          {activeTab === "Series" && (
            <View style={{ paddingTop: 6 }}>
              <SeriesSummarySection
                game={liveGame}
                summary={seriesSummary}
                theme={theme}
                homeColor={homeColor}
                awayColor={awayColor}
                homeOnly={seriesHomeOnly}
                onToggleHomeOnly={() => {
                  setSeriesHomeOnly((prev) => !prev);
                  setSeriesVisibleCount(5);
                }}
                getTeamLogoUrl={getTeamLogoUrl}
              />

              <View style={seriesStyles.matchesWrap}>
                {seriesMatches.slice(0, seriesVisibleCount).map((match) => (
                  <SeriesMatchCard
                    key={String(match?.id)}
                    match={match}
                    game={liveGame}
                    theme={theme}
                    navigation={navigation}
                    getTeamLogoUrl={getTeamLogoUrl}
                    homeColor={homeColor}
                    awayColor={awayColor}
                  />
                ))}

                {seriesMatches.length === 0 ? (
                  <Text
                    style={[
                      seriesStyles.emptyText,
                      { color: theme.textTertiary, borderColor: theme.border },
                    ]}
                  >
                    No series matches available for this filter.
                  </Text>
                ) : null}

                {seriesVisibleCount < seriesMatches.length ? (
                  <TouchableOpacity
                    style={[
                      seriesStyles.showMoreBtn,
                      {
                        borderColor: theme.border,
                        backgroundColor: theme.surface,
                      },
                    ]}
                    onPress={() =>
                      setSeriesVisibleCount((prev) =>
                        Math.min(prev + 5, seriesMatches.length),
                      )
                    }
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        seriesStyles.showMoreText,
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
          {activeTab !== "Main" &&
            (activeTab !== "Shifts" &&
            activeTab !== "Home" &&
            activeTab !== "Away" &&
            activeTab !== "Stats" &&
            activeTab !== "Plays" &&
            activeTab !== "Series" ? (
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

      <NHLPlayerDetailModal
        visible={!!selectedModalPlayer}
        onClose={() => setSelectedModalPlayer(null)}
        player={selectedModalPlayer}
        allPlayers={allModalPlayers}
        game={liveGame}
        theme={theme}
        colors={colors}
        isDarkMode={isDarkMode}
        getTeamLogoUrl={getTeamLogoUrl}
      />

      <NHLGoalShareCardModal
        visible={!!goalSharePayload}
        onClose={() => setGoalSharePayload(null)}
        payload={goalSharePayload}
        theme={theme}
        colors={colors}
      />

      <>
        {isLoggedIn && (
          <TouchableOpacity
            style={[
              styles.floatingChatButton,
              { backgroundColor: colors.primary },
            ]}
            onPress={() => setChatModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={30}
              color="#fff"
            />
          </TouchableOpacity>
        )}

        <Modal
          animationType="slide"
          transparent
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
                  {`🏒 ${liveGame?.away?.abbreviation ?? "Away"} vs ${liveGame?.home?.abbreviation ?? "Home"}`}
                </Text>
                <TouchableOpacity
                  style={styles.chatModalCloseButton}
                  onPress={() => setChatModalVisible(false)}
                >
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.chatModalBody}>
                {!!liveGame && isLoggedIn && (
                  <ChatComponent
                    gameId={gameId}
                    gameData={chatGameData}
                    hideHeader={true}
                  />
                )}

                {!!liveGame && !isLoggedIn && (
                  <View style={styles.chatLoginPromptWrap}>
                    <Text
                      style={[
                        styles.chatLoginPromptText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Sign in to use game chat.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </Modal>
      </>

      {isStreamingUnlocked && (
        <Modal
          animationType="fade"
          transparent
          visible={showStreamModal}
          onRequestClose={closeStreamModal}
        >
          <View style={styles.streamModalOverlay}>
            <View
              style={[
                styles.streamModalContainer,
                { backgroundColor: theme.surface },
              ]}
            >
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
                  style={[styles.streamModalTitle, { color: colors.primary }]}
                >
                  Live Stream
                </Text>
                <TouchableOpacity
                  style={[
                    styles.streamCloseButton,
                    { backgroundColor: theme.error, borderColor: theme.text },
                  ]}
                  onPress={closeStreamModal}
                >
                  <Text style={[styles.streamCloseText, { color: theme.text }]}>
                    ×
                  </Text>
                </TouchableOpacity>
              </View>

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
                          borderColor: theme.border,
                        },
                      ]}
                      onPress={() => switchStream(source)}
                    >
                      <Text
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

              <View style={styles.webViewContainer}>
                {streamLoading && (
                  <View style={styles.streamLoadingOverlay}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.streamLoadingText, { color: "#fff" }]}>
                      Loading stream...
                    </Text>
                  </View>
                )}

                {currentStreamType && availableStreams[currentStreamType] && (
                  <WebView
                    source={{ uri: availableStreams[currentStreamType] }}
                    style={styles.streamWebView}
                    javaScriptEnabled
                    domStorageEnabled
                    allowsInlineMediaPlayback
                    mediaPlaybackRequiresUserAction={false}
                    onLoadStart={() => setStreamLoading(true)}
                    onLoadEnd={() => setStreamLoading(false)}
                    onError={() => setStreamLoading(false)}
                    userAgent={
                      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                    }
                    injectedJavaScript={`(function(){
                      function post(obj){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(obj)); }catch(e){} }
                      post({type:'instrumentation', event:'init'});
                      window.addEventListener('load', function(){ post({type:'lifecycle', event:'load', href:location.href}); });
                      document.addEventListener('DOMContentLoaded', function(){ post({type:'lifecycle', event:'domcontent', href:location.href}); });
                      try{ const origOpen = window.open; window.open = function(url,target,features){ post({type:'nav', method:'window.open', url:url, target:target}); return origOpen.call(this,url,target,features); }; }catch(e){}
                      try{ const observer = new MutationObserver(function(muts){ muts.forEach(m=>{ m.addedNodes && m.addedNodes.forEach(n=>{ if(n.nodeType===1){ const tag=n.tagName.toLowerCase(); if(tag==='video'||tag==='iframe'||(n.querySelector&&(n.querySelector('video')||n.querySelector('iframe')))){ post({type:'dom', action:'added', tag:tag, html:n.outerHTML?(n.outerHTML.substring(0,200)):null, href:location.href}); } } }); m.removedNodes && m.removedNodes.forEach(n=>{ if(n.nodeType===1){ const tag=n.tagName.toLowerCase(); if(tag==='video'||tag==='iframe'||(n.querySelector&&(n.querySelector('video')||n.querySelector('iframe')))){ post({type:'dom', action:'removed', tag:tag, href:location.href}); } } }); }); }); observer.observe(document.documentElement||document.body,{ childList:true, subtree:true }); post({type:'instrumentation', event:'observer_started'}); }catch(e){ post({type:'instrumentation', event:'observer_error', error:String(e)}); }
                      function instrumentExistingVideos(){ const videos=document.querySelectorAll('video'); videos.forEach(v=>{ if(!v.__instrumented){ v.__instrumented=true; v.addEventListener('play',()=>post({type:'video', event:'play', src:v.currentSrc||v.src, href:location.href})); v.addEventListener('pause',()=>post({type:'video', event:'pause', src:v.currentSrc||v.src, href:location.href})); v.addEventListener('ended',()=>post({type:'video', event:'ended', src:v.currentSrc||v.src, href:location.href})); } }); }
                      setInterval(instrumentExistingVideos,1000);
                      true; })();`}
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
                        "Top5 WebView navigation request:",
                        request.url,
                      );

                      if (request.url === availableStreams[currentStreamType]) {
                        return true;
                      }

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

                      const currentDomain = new URL(
                        availableStreams[currentStreamType],
                      ).hostname;
                      let requestDomain = "";
                      try {
                        requestDomain = new URL(request.url).hostname;
                      } catch (e) {
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

                      const allowPatterns = [
                        "/embed/",
                        "/embed-noads/",
                        "/player/",
                        ".html",
                        ".m3u8",
                        ".mpd",
                        "about:blank",
                        "data:",
                      ];
                      const allowIfEmbed = allowPatterns.some((p) =>
                        urlLower.includes(p),
                      );

                      if (hasPopupKeywords && !allowIfEmbed) {
                        console.log(
                          "Blocked Top5 popup/cross-domain navigation:",
                          request.url,
                        );
                        return false;
                      }

                      if (sameRootDomain || allowIfEmbed) {
                        return true;
                      }

                      console.log(
                        "Blocked Top5 popup/cross-domain navigation:",
                        request.url,
                      );
                      return false;
                    }}
                    onOpenWindow={(syntheticEvent) => {
                      const { nativeEvent } = syntheticEvent;
                      console.log(
                        "Blocked Top5 popup window:",
                        nativeEvent.targetUrl,
                      );
                      return false;
                    }}
                  />
                )}

                {!currentStreamType &&
                  !Object.keys(availableStreams).length && (
                    <View style={{ padding: 12 }}>
                      <Text style={{ color: theme.textSecondary }}>
                        {streamError
                          ? "Unable to load stream sources."
                          : "No streams available."}
                      </Text>
                    </View>
                  )}
              </View>
            </View>
          </View>
        </Modal>
      )}
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
  streamBtn: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
    borderWidth: 1,
    marginHorizontal: 5,
    marginTop: 6,
  },
  streamBtnInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  streamBtnDot: { width: 8, height: 8, borderRadius: 4 },
  streamBtnText: { fontWeight: "700", fontSize: 12 },
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
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  streamModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  streamModalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    flex: 1,
    textAlign: "center",
  },
  streamCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  streamCloseText: { fontSize: 20, fontWeight: "bold", marginTop: -3 },
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
  webViewContainer: { flex: 1, position: "relative" },
  streamWebView: { flex: 1 },
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
  streamLoadingText: { marginTop: 10, fontSize: 16, fontWeight: "600" },
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
    zIndex: 90,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
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
  chatLoginPromptWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  chatLoginPromptText: {
    fontSize: 14,
    textAlign: "center",
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
  teamNameBlock: {
    alignItems: "center",
    justifyContent: "center",
    maxWidth: 130,
  },
  teamNamePowerPlayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    flexWrap: "wrap",
  },
  teamName: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 17,
    maxWidth: 130,
    textAlign: "center",
  },
  teamPowerPlayText: {
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
  },
  teamRecord: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14,
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
  livePlayCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  livePlayHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  livePlayHeaderAccent: {
    width: 4,
    height: 16,
    borderRadius: 2,
  },
  livePlayHeaderTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  livePlayHeaderCount: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  livePlayBody: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  livePlayMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  livePlayTypeText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  livePlayTimeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  livePlayTeamText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  livePlayScoreText: {
    fontSize: 12,
    fontWeight: "700",
  },
  livePlayRinkWrap: {
    marginTop: 2,
    width: "100%",
    aspectRatio: 320 / 188,
    borderRadius: 10,
    borderWidth: 1,
    padding: 6,
    overflow: "hidden",
  },
  livePlayEmptyText: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
    paddingVertical: 8,
  },
  livePlayPlayersWrap: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  livePlayTeamPlayersBody: {
    position: "relative",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 7,
  },
  livePlayTeamHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  livePlayTeamHeaderAbbr: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  livePlayTeamHeaderHint: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.35,
  },
  livePlayNoPlayersText: {
    fontSize: 11,
    fontWeight: "600",
    paddingVertical: 2,
  },
  livePlayPlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  livePlayPlayerRowAway: {
    justifyContent: "flex-start",
  },
  livePlayPlayerRowHome: {
    justifyContent: "flex-end",
  },
  livePlayPlayerInfoAway: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
  },
  livePlayPlayerInfoHome: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },
  livePlayPlayerName: {
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15,
  },
  livePlayPlayerMeta: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 13,
  },
  livePlayPlayerStatsRowAway: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 6,
    flexWrap: "wrap",
  },
  livePlayPlayerStatsRowHome: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    flexWrap: "wrap",
  },
  livePlayPlayerStatCell: {
    minWidth: 30,
    alignItems: "center",
  },
  livePlayPlayerStatValue: {
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 13,
  },
  livePlayPlayerStatLabel: {
    marginTop: 1,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.18,
  },
  nhlStatsCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  nhlStatsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  nhlStatsHeaderTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  nhlStatsBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 14,
  },
  nhlFeatureBlock: {
    gap: 8,
  },
  nhlFeatureValuesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  nhlFeatureValueText: {
    minWidth: 52,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "800",
  },
  nhlFeatureLabel: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  nhlFaceoffRingWrap: {
    width: 156,
    height: 156,
    alignItems: "center",
    justifyContent: "center",
  },
  nhlFaceoffRingInner: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  nhlFaceoffPctText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.25,
    textAlign: "center",
  },
  nhlFaceoffPctLeft: {
    position: "absolute",
    left: 4,
    width: "40%",
    top: "50%",
    marginTop: -8,
  },
  nhlFaceoffPctRight: {
    position: "absolute",
    right: 4,
    width: "40%",
    top: "50%",
    marginTop: -8,
  },
  nhlFaceoffSplitLine: {
    width: 2,
    height: "80%",
    opacity: 0.9,
  },
  nhlSogBlockGap: {
    marginTop: 10,
    marginBottom: 14,
  },
  nhlShotsSimpleOuter: {
    height: 130,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "hidden",
    position: "relative",
  },
  nhlShotsSimpleOuterValuesRow: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 2,
  },
  nhlShotsSimpleOuterValueText: {
    fontSize: 25,
    fontWeight: "900",
    minWidth: 36,
  },
  nhlShotsSimpleOuterValueLeft: {
    textAlign: "left",
  },
  nhlShotsSimpleOuterValueRight: {
    textAlign: "right",
  },
  nhlShotsSimpleInner: {
    width: "82%",
    height: "82.5%",
    borderBottomWidth: 0,
    borderWidth: 10,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    justifyContent: "center",
  },
  nhlShotsSimpleInnerValues: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  nhlShotsSimpleFillLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  nhlShotsSimpleFillRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  nhlShotsSimpleInnerValueText: {
    fontSize: 22,
    fontWeight: "900",
  },
  nhlStatRowWrap: {
    gap: 6,
  },
  nhlStatValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  nhlStatValueText: {
    fontSize: 14,
    fontWeight: "700",
  },
  nhlStatBarTrack: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    flexDirection: "row",
  },
  nhlStatBarFillLeft: {
    height: "100%",
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
  },
  nhlStatBarFillRight: {
    height: "100%",
    marginLeft: "auto",
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  nhlStatCategoryLabel: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "none",
  },
  nhlStatsEmptyText: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "500",
  },
  matchupSectionWrap: {
    gap: 10,
  },
  matchupCard: {
    marginHorizontal: 12,
    marginTop: 4,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  matchupCardHeader: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  matchupCardHeaderText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.45,
  },
  matchupSkaterBody: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  matchupSkaterSide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    gap: 8,
  },
  matchupSkaterSideAway: {
    justifyContent: "flex-start",
  },
  matchupSkaterSideHome: {
    justifyContent: "flex-end",
  },
  matchupSkaterVsWrap: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  matchupSkaterVs: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  matchupSkaterNameWrapAway: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
  },
  matchupSkaterNameWrapHome: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },
  matchupNameFirst: {
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14,
  },
  matchupNameLast: {
    marginTop: 1,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 17,
  },
  matchupSkaterFillRow: {
    flexDirection: "row",
    height: 30,
  },
  matchupSkaterFillHalf: {
    alignItems: "center",
    justifyContent: "center",
  },
  matchupSkaterFillAway: {},
  matchupSkaterFillHome: {},
  matchupSkaterFillDivider: {
    width: 2,
    height: "100%",
  },
  matchupSkaterFillValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  matchupHeadshotWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    overflow: "visible",
    position: "relative",
  },
  matchupHeadshotImage: {
    width: "100%",
    height: "100%",
    borderRadius: 29,
  },
  matchupHeadshotFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 29,
  },
  matchupHeadshotLogoBadge: {
    position: "absolute",
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  matchupHeadshotLogoAway: {
    left: -2,
  },
  matchupHeadshotLogoHome: {
    right: -2,
  },
  matchupHeadshotLogoImage: {
    width: 20,
    height: 20,
  },
  matchupHeadshotPosBadge: {
    position: "absolute",
    bottom: -3,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  matchupHeadshotPosAway: {
    right: -2,
  },
  matchupHeadshotPosHome: {
    left: -2,
  },
  matchupHeadshotPosText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  matchupGoalieBody: {
    position: "relative",
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  matchupGoalieRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  matchupGoalieRowAway: {
    justifyContent: "flex-start",
  },
  matchupGoalieRowHome: {
    justifyContent: "flex-end",
  },
  matchupGoalieInfoAway: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
  },
  matchupGoalieInfoHome: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },
  matchupGoalieName: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 16,
  },
  matchupGoalieStatsRowAway: {
    marginTop: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    flexWrap: "wrap",
  },
  matchupGoalieStatsRowHome: {
    marginTop: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexWrap: "wrap",
  },
  matchupGoalieStatCell: {
    minWidth: 36,
    alignItems: "center",
  },
  matchupGoalieStatValue: {
    fontSize: 12,
    fontWeight: "800",
  },
  matchupGoalieStatLabel: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  nhlRosterSectionToggle: {
    flexDirection: "row",
    marginHorizontal: 12,
    marginTop: 14,
    marginBottom: 4,
    borderRadius: 10,
    backgroundColor: "rgba(128,128,128,0.1)",
    padding: 3,
  },
  nhlRosterSectionBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 8,
  },
  nhlRosterSectionBtnActive: {
    backgroundColor: "rgba(128,128,128,0.25)",
  },
  nhlRosterSectionLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  nhlRosterSeasonStatsLabel: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 2,
  },
  nhlRosterPlayerCard: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  nhlRosterPlayerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  nhlRosterPlayerHeadshotWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: 2,
  },
  nhlRosterPlayerHeadshot: {
    width: "100%",
    height: "100%",
  },
  nhlRosterPlayerFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  nhlRosterPlayerFallbackText: {
    fontSize: 14,
    fontWeight: "700",
  },
  nhlRosterPlayerNameBlock: {
    flex: 1,
    marginLeft: 10,
  },
  nhlRosterPlayerName: {
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  nhlRosterPlayerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  nhlRosterDecisionLabel: {
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 8,
  },
  nhlRosterPlayerMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  nhlRosterStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  nhlRosterStatCell: {
    flex: 1,
    alignItems: "center",
  },
  nhlRosterStatValue: {
    fontSize: 15,
    fontWeight: "700",
  },
  nhlRosterStatLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  nhlRosterEmpty: {
    textAlign: "center",
    marginTop: 32,
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
  eventGoalShareBtn: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  eventGoalShareBtnText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.25,
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
    height: 34,
    borderTopWidth: StyleSheet.hairlineWidth,
    position: "relative",
  },
  shiftsAxisBottomLabel: {
    position: "absolute",
    top: 2,
    marginLeft: -16,
    fontSize: 10,
    fontWeight: "600",
  },
  shiftsGoalLinesOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 24,
    zIndex: 2,
  },
  shiftsGoalLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    opacity: 0.9,
  },
  shiftsGoalLogo: {
    position: "absolute",
    bottom: 2,
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.92)",
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

const seriesStyles = StyleSheet.create({
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
    width: 80,
    height: 40,
  },
  logoPlaceholder: {
    width: 80,
    height: 40,
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
  vsText: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  winsNamesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  winsNameText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
  },
  winsNameTextRight: {
    textAlign: "right",
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
    width: 20,
    height: 14,
  },
  homeFilterLogoFallback: {
    width: 20,
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
  matchTeamLogo: { width: 50, height: 36, marginHorizontal: -5 },
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
  matchTimeAmPm: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
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

const nhlModalStyles = StyleSheet.create({
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
    overflow: "hidden",
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  compareHeadshotImage: {
    width: 48,
    height: 48,
    borderWidth: 1,
    borderRadius: 24,
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
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  statDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: -4,
    marginVertical: 8,
    width: "100%",
  },
});

const nhlShareStyles = StyleSheet.create({
  cardHeader: {
    padding: 14,
    borderBottomWidth: 2,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  posBadge: {
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  posBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  scoreWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scoreLogo: {
    width: 26,
    height: 18,
    marginHorizontal: -4,
  },
  headshotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardHeadshot: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2.5,
    backgroundColor: "rgba(128,128,128,0.1)",
  },
  nameBlock: {
    flex: 1,
    gap: 2,
  },
  statSummary: {
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  topStatsRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 4,
  },
  topStatCell: {
    alignItems: "center",
  },
  topStatVal: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 20,
  },
  topStatLbl: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 1,
  },
  fullName: {
    fontSize: 13,
    fontWeight: "600",
  },
  nameDateRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  nameTeamWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  teamNameLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  teamNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  teamNameLogo: {
    width: 26,
    height: 16,
    marginHorizontal: -5,
  },
  gameDateLine: {
    fontSize: 10,
    fontWeight: "500",
    textAlign: "right",
    lineHeight: 12,
  },
  dateWrap: {
    alignItems: "flex-end",
    marginLeft: 6,
    flexShrink: 0,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  statCell: {
    width: "33.333%",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    position: "relative",
  },
  statPct: {
    position: "absolute",
    top: 5,
    right: 7,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  statVal: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  statLbl: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 3,
    textAlign: "center",
  },
});

const nhlGoalShareStyles = StyleSheet.create({
  header: {
    padding: 14,
    borderBottomWidth: 2,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  timeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  scoreWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scoreLogo: {
    width: 26,
    height: 18,
    marginHorizontal: -4,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: "700",
  },
  goalTypeText: {
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2,
  },
  commentText: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 16,
  },
  body: {
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  contentRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    position: "relative",
  },
  rinkCol: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  rinkWrap: {
    width: "88%",
    maxWidth: 180,
    aspectRatio: 188 / 320,
    marginLeft: -4,
  },
  rinkDivider: {
    position: "absolute",
    left: "50%",
    marginLeft: -0.5,
    top: 8,
    width: 1,
    bottom: 8,
  },
  playerCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 24,
    fontWeight: "800",
  },
  playerName: {
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  teamLogo: {
    width: 24,
    height: 16,
  },
  teamName: {
    fontSize: 12,
    fontWeight: "600",
  },
  assistWrap: {
    marginTop: 4,
    alignItems: "center",
    width: "100%",
  },
  assistLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  assistName: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  statsRow: {
    marginTop: 6,
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
  },
  statCell: {
    alignItems: "center",
    width: "33.333%",
    paddingVertical: 8,
  },
  statVal: {
    fontSize: 15,
    fontWeight: "800",
  },
  statLbl: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
});

const nhlShareCommonStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    padding: 24,
  },
  card: {
    overflow: "hidden",
  },
  cardScore: {
    fontSize: 12,
    fontWeight: "700",
  },
  cardFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: "flex-end",
  },
  cardBrand: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  actionBtn: {
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 28,
    minWidth: 120,
    alignItems: "center",
  },
  actionBtnTxt: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  actionBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});

export default NHLGameDetailsScreen;

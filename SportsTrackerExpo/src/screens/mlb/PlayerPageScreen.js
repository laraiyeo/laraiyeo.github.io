import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  Pressable,
} from "react-native";
import { Image } from "expo-image";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
} from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";
import { MLBService } from "../../services/MLBService";

const { width } = Dimensions.get("window");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getTextOnColor = (hex) => {
  if (!hex) return "#FFFFFF";
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? "#000000" : "#FFFFFF";
};

const TABS = ["Player", "Game Log", "Career", "Splits", "Awards"];

const GAME_TYPE_LABELS = {
  R: "Regular Season",
  F: "Wild Card",
  D: "Division Series",
  P: "Playoffs",
  W: "World Series",
  A: "All-Star Game",
  C: "Championship",
  L: "League Championship Series",
  S: "Spring Training",
};

const DAY_LABELS = {
  1: "Sun",
  2: "Mon",
  3: "Tue",
  4: "Wed",
  5: "Thu",
  6: "Fri",
  7: "Sat",
};

const MONTH_LABELS = {
  1: "Jan",
  2: "Feb",
  3: "Mar",
  4: "Apr",
  5: "May",
  6: "Jun",
  7: "Jul",
  8: "Aug",
  9: "Sep",
  10: "Oct",
  11: "Nov",
  12: "Dec",
};

// All 30 MLB teams sorted alphabetically for VS Team selector
const TEAM_ID_BY_NAME = Object.fromEntries(
  Object.entries(MLBService.teamIdMap).map(([id, name]) => [name, Number(id)]),
);
const ALL_MLB_TEAMS = Object.entries(MLBService.teamAbbrMap)
  .map(([name, abbr]) => ({
    name,
    abbr: abbr.toUpperCase(),
    id: TEAM_ID_BY_NAME[name] ?? null,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

// Stat definitions for player bubbles
const HITTING_STAT_DEFS = [
  { key: "avg", label: "AVG" },
  { key: "obp", label: "OBP" },
  { key: "slg", label: "SLG" },
  { key: "ops", label: "OPS" },
  { key: "gamesPlayed", label: "G" },
  { key: "atBats", label: "AB" },
  { key: "hits", label: "H" },
  { key: "homeRuns", label: "HR" },
  { key: "rbi", label: "RBI" },
  { key: "runs", label: "R" },
  { key: "doubles", label: "2B" },
  { key: "triples", label: "3B" },
  { key: "stolenBases", label: "SB" },
  { key: "strikeOuts", label: "SO" },
  { key: "baseOnBalls", label: "BB" },
  { key: "plateAppearances", label: "PA" },
  { key: "totalBases", label: "TB" },
  { key: "babip", label: "BABIP" },
];

const PITCHING_STAT_DEFS = [
  { key: "era", label: "ERA" },
  { key: "inningsPitched", label: "IP" },
  { key: "wins", label: "W" },
  { key: "losses", label: "L" },
  { key: "saves", label: "SV" },
  { key: "holds", label: "HLD" },
  { key: "whip", label: "WHIP" },
  { key: "battersFaced", label: "BF" },
  { key: "strikePercentage", label: "K%" },
  { key: "baseOnBalls", label: "BB" },
  { key: "strikeOuts", label: "SO" },
  { key: "hits", label: "H" },
  { key: "avg", label: "AVG" },
  { key: "strikes", label: "STR" },
  { key: "homeRuns", label: "HR" },
  { key: "earnedRuns", label: "ER" },
];

// ─── Main Screen ──────────────────────────────────────────────────────────────

const PlayerPageScreen = ({ route, navigation }) => {
  const {
    playerId,
    playerName: routePlayerName,
    teamName: routeTeamName,
  } = route.params ?? {};

  const { theme, colors, isDarkMode } = useTheme();

  const [player, setPlayer] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [awards, setAwards] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Player");
  const [headerHeight, setHeaderHeight] = useState(160);
  const [headshotError, setHeadshotError] = useState(false);
  const [careerExpandedYears, setCareerExpandedYears] = useState({});
  const [careerModal, setCareerModal] = useState(null);
  const [careerModalGroup, setCareerModalGroup] = useState("hitting");
  const [gameLogPage, setGameLogPage] = useState(0);
  const [splitsModal, setSplitsModal] = useState(null);
  const [vsTeamModal, setVsTeamModal] = useState(null);
  const [vsTeamLoading, setVsTeamLoading] = useState(false);

  const scrollY = useRef(new Animated.Value(0)).current;

  // ── Data fetch ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const fetchAll = async () => {
      setLoading(true);
      try {
        // 1. Player info
        const peopleUrl =
          `https://statsapi.mlb.com/api/v1/people/${playerId}` +
          `?fields=people,id,fullName,firstName,lastName,primaryNumber,birthDate,` +
          `currentAge,birthStateProvince,birthCountry,height,weight,primaryPosition,` +
          `name,abbreviation,nickName,draftYear,mlbDebutDate,batSide,code,pitchHand,code`;

        const peopleResp = await fetch(peopleUrl);
        const peopleData = await peopleResp.json();
        const p = peopleData?.people?.[0] ?? null;
        if (mounted) setPlayer(p);

        if (!p) return;

        const currentYear = new Date().getFullYear();
        const isTwoWay = p?.primaryPosition?.code === "Y";
        const isPitcher = p?.primaryPosition?.code === "1";
        const isBatter = !isPitcher && !isTwoWay;

        // 2. Stats fields
        const baseFields =
          "stats,type,displayName,splits,season,stat,summary,gamesPlayed,team,id,name," +
          "dayOfWeek,month,opponent,date,gameType,isHome,isWin,positionsPlayed," +
          "abbreviation,game,gamePk";

        const pitchExtra = isPitcher
          ? ",era,inningsPitched,wins,losses,saves,holds,whip,battersFaced,strikePercentage,baseOnBalls,strikeOuts,hits,avg,strikes,homeRuns,earnedRuns"
          : isBatter
            ? ",avg,atBats,obp,slg,ops,hits,rbi,runs,stolenBases,plateAppearances,totalBases,leftOnBase,babip,homeRuns,strikeOuts,baseOnBalls"
            : isTwoWay
              ? ",era,inningsPitched,wins,losses,saves,holds,whip,battersFaced,strikePercentage,baseOnBalls,strikeOuts,hits,avg,strikes,homeRuns,earnedRuns,atBats,obp,slg,ops,rbi,runs,stolenBases,plateAppearances,totalBases,leftOnBase,babip,group,displayName"
              : "";

        const groupParam = isPitcher
          ? "&group=pitching"
          : isBatter
            ? "&group=hitting"
            : isTwoWay
              ? "&group=hitting,pitching"
              : "";

        const statsUrl =
          `https://statsapi.mlb.com/api/v1/people/${playerId}/stats` +
          `?stats=projected,byDayOfWeek,byMonth,yearByYear,career,homeAndAway,winLoss,rankingsByYear,gameLog` +
          `&season=${currentYear}` +
          `&gameType=R,F,D,W,P,C,A,S` +
          `&fields=${baseFields}${pitchExtra}` +
          groupParam;

        // 3. Awards
        const awardsUrl =
          `https://statsapi.mlb.com/api/v1/people/${playerId}/awards` +
          `?fields=awards,name,date,team,id,teamName`;

        const [statsResp, awardsResp] = await Promise.all([
          fetch(statsUrl),
          fetch(awardsUrl),
        ]);
        const [statsData, awardsData] = await Promise.all([
          statsResp.json(),
          awardsResp.json(),
        ]);

        if (mounted) {
          setPlayerStats(statsData);
          setAwards(awardsData?.awards ?? []);
        }
      } catch (e) {
        console.warn("PlayerPageScreen fetch error:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (playerId) fetchAll();
    return () => {
      mounted = false;
    };
  }, [playerId]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const displayName = player?.fullName ?? routePlayerName ?? "Player";
  const positionName = player?.primaryPosition?.name ?? "";
  const positionAbbr = player?.primaryPosition?.abbreviation ?? "";
  const jersey = player?.primaryNumber ? `#${player.primaryNumber}` : "";

  // Current team: most recent game log entry → most recent yearByYear R split
  const rawGameLogSplits =
    playerStats?.stats?.find((s) => s.type?.displayName === "gameLog")
      ?.splits ?? [];
  const gameLogTeamName =
    rawGameLogSplits.length > 0
      ? (rawGameLogSplits[rawGameLogSplits.length - 1]?.team?.name ?? null)
      : null;

  const ybyRawSplits =
    playerStats?.stats?.find((s) => s.type?.displayName === "yearByYear")
      ?.splits ?? [];
  const recentYBYTeamName =
    [...ybyRawSplits]
      .filter((s) => s.gameType === "R" && s.team?.name)
      .sort((a, b) => Number(b.season) - Number(a.season))[0]?.team?.name ??
    null;

  const teamName = routeTeamName || gameLogTeamName || recentYBYTeamName || "";
  const teamColor = teamName
    ? MLBService.getTeamColor(teamName)
    : colors.primary;

  // Text on a solid teamColor background
  const headerTextColor = getTextOnColor(teamColor);
  const isTwoWayPlayer = player?.primaryPosition?.code === "Y";
  // Primary position code "1" = Pitcher (SP/RP); two-way players handled separately
  const isPitcher =
    !isTwoWayPlayer &&
    (player?.primaryPosition?.code === "1" ||
      player?.primaryPosition?.abbreviation === "P");

  const teamLogoUrl = teamName
    ? MLBService.getLogoUrl(teamName, null, isDarkMode ? "dark" : "light")
    : null;

  const headshotUrl = playerId
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${playerId}/headshot/67/current`
    : null;

  // ── Scroll-driven sticky animations ───────────────────────────────────────

  const threshold = Math.max(headerHeight - 40, 80);

  const stickyOpacity = scrollY.interpolate({
    inputRange: [threshold, threshold + 40],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const stickyMiniHeight = scrollY.interpolate({
    inputRange: [threshold, threshold + 40],
    outputRange: [0, 60],
    extrapolate: "clamp",
  });

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={{ marginTop: 120 }}
        />
      </View>
    );
  }

  // ── Player tab renderer ───────────────────────────────────────────────────

  const renderPlayerTab = () => {
    if (!playerStats) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="small" color={teamColor} />
        </View>
      );
    }

    const currentYear = String(new Date().getFullYear());
    const rankOnColor = getTextOnColor(teamColor);

    // Helper: find a stats entry by type + optional group
    const findGroup = (typeName, groupName) =>
      playerStats.stats?.find(
        (s) =>
          s.type?.displayName === typeName &&
          (groupName == null || s.group?.displayName === groupName),
      );

    // Helper: resolve the current-season R split from a splits array
    const resolveSeasonSplit = (splits) =>
      splits.find((s) => s.season === currentYear && s.gameType === "R") ??
      splits.find((s) => s.season === "2025" && s.gameType === "R") ??
      null;

    // ── Fetch hitting splits (two-way uses group filter, others use first match)
    const hitYBY = isTwoWayPlayer
      ? (findGroup("yearByYear", "hitting")?.splits ?? [])
      : (findGroup("yearByYear", null)?.splits ?? []);
    const pitchYBY = isTwoWayPlayer
      ? (findGroup("yearByYear", "pitching")?.splits ?? [])
      : [];

    const hitSeasonSplit = resolveSeasonSplit(hitYBY);
    const pitchSeasonSplit = isTwoWayPlayer
      ? resolveSeasonSplit(pitchYBY)
      : null;

    // Season label is driven by whichever split we found (hitting preferred)
    const refSplit = hitSeasonSplit ?? pitchSeasonSplit;
    const seasonLabel = refSplit?.season
      ? `${refSplit.season} Season`
      : "Season";
    const isYearFallback =
      refSplit?.season === "2025" && currentYear !== "2025";
    const projectedLabel = isYearFallback
      ? `${currentYear} Projected`
      : "Projected";

    // ── Projected stats (group-aware for two-way)
    const hitProjectedStat = isTwoWayPlayer
      ? (findGroup("projected", "hitting")?.splits[0]?.stat ?? null)
      : (findGroup("projected", null)?.splits[0]?.stat ?? null);
    const pitchProjectedStat = isTwoWayPlayer
      ? (findGroup("projected", "pitching")?.splits[0]?.stat ?? null)
      : null;

    // ── Rankings (group-aware for two-way)
    const resolveRankings = (groupName) => {
      const splits = findGroup("rankingsByYear", groupName)?.splits ?? [];
      return (
        splits.find((s) => s.season === currentYear && s.gameType === "R")
          ?.stat ??
        splits.find((s) => s.season === "2025" && s.gameType === "R")?.stat ??
        {}
      );
    };
    const hitRankings = resolveRankings(isTwoWayPlayer ? "hitting" : null);
    const pitchRankings = isTwoWayPlayer ? resolveRankings("pitching") : {};

    // ── Low-level chip grid (defs + rankings parameterised)
    const renderChips = (statObj, defs, showRankings, rankingsObj) => {
      if (!statObj) return null;
      const entries = defs.filter((d) => statObj[d.key] != null);
      if (entries.length === 0) return null;
      return (
        <View style={pStyles.chipsGrid}>
          {entries.map((d) => {
            const rank = showRankings ? (rankingsObj ?? {})[d.key] : null;
            return (
              <View
                key={d.key}
                style={[pStyles.chip, { backgroundColor: theme.background }]}
              >
                {rank != null && (
                  <View
                    style={[pStyles.rankBadge, { backgroundColor: teamColor }]}
                  >
                    <Text
                      allowFontScaling={false}
                      style={[pStyles.rankText, { color: rankOnColor }]}
                    >
                      #{rank}
                    </Text>
                  </View>
                )}
                <Text
                  allowFontScaling={false}
                  style={[pStyles.chipValue, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {typeof statObj[d.key] === "number"
                    ? Number.isInteger(statObj[d.key])
                      ? statObj[d.key]
                      : Number(statObj[d.key].toFixed(3))
                    : statObj[d.key]}
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[pStyles.chipLabel, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {d.label}
                </Text>
              </View>
            );
          })}
        </View>
      );
    };

    // ── Stat bubble — single role player
    const renderStatGrid = (statObj, title, showRankings = false) => {
      const defs = isPitcher ? PITCHING_STAT_DEFS : HITTING_STAT_DEFS;
      if (!statObj) return null;
      const entries = defs.filter((d) => statObj[d.key] != null);
      if (entries.length === 0) return null;
      return (
        <View style={[pStyles.bubble, { backgroundColor: theme.surface }]}>
          <Text
            allowFontScaling={false}
            style={[pStyles.bubbleTitle, { color: theme.textSecondary }]}
          >
            {title}
          </Text>
          {renderChips(statObj, defs, showRankings, hitRankings)}
        </View>
      );
    };

    // ── Stat bubble — two-way player (hitting + pitching sections)
    const renderTwoWayStatBubble = (
      hitStat,
      pitchStat,
      title,
      showRankings = false,
    ) => {
      const hasHit =
        hitStat && HITTING_STAT_DEFS.some((d) => hitStat[d.key] != null);
      const hasPitch =
        pitchStat && PITCHING_STAT_DEFS.some((d) => pitchStat[d.key] != null);
      if (!hasHit && !hasPitch) return null;
      return (
        <View style={[pStyles.bubble, { backgroundColor: theme.surface }]}>
          <Text
            allowFontScaling={false}
            style={[pStyles.bubbleTitle, { color: theme.textSecondary }]}
          >
            {title}
          </Text>
          {hasHit && (
            <>
              <View
                style={[pStyles.groupHeader, { borderLeftColor: teamColor }]}
              >
                <Text
                  allowFontScaling={false}
                  style={[pStyles.groupLabel, { color: teamColor }]}
                >
                  Hitting
                </Text>
              </View>
              {renderChips(
                hitStat,
                HITTING_STAT_DEFS,
                showRankings,
                hitRankings,
              )}
            </>
          )}
          {hasHit && hasPitch && (
            <View
              style={[pStyles.groupDivider, { backgroundColor: theme.border }]}
            />
          )}
          {hasPitch && (
            <>
              <View
                style={[pStyles.groupHeader, { borderLeftColor: teamColor }]}
              >
                <Text
                  allowFontScaling={false}
                  style={[pStyles.groupLabel, { color: teamColor }]}
                >
                  Pitching
                </Text>
              </View>
              {renderChips(
                pitchStat,
                PITCHING_STAT_DEFS,
                showRankings,
                pitchRankings,
              )}
            </>
          )}
        </View>
      );
    };

    // ── Player bio
    const formatBirthDate = (d) => {
      if (!d) return null;
      try {
        const [y, m, day] = d.split("-");
        return new Date(
          Number(y),
          Number(m) - 1,
          Number(day),
        ).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      } catch {
        return d;
      }
    };

    const bioRows = [
      { label: "Birth Date", value: formatBirthDate(player?.birthDate) },
      {
        label: "Age",
        value: player?.currentAge != null ? String(player.currentAge) : null,
      },
      {
        label: "Birthplace",
        value:
          [player?.birthStateProvince, player?.birthCountry]
            .filter(Boolean)
            .join(", ") || null,
      },
      { label: "Height", value: player?.height ?? null },
      {
        label: "Weight",
        value: player?.weight != null ? `${player.weight} lbs` : null,
      },
      { label: "Nickname", value: player?.nickName ?? null },
      {
        label: "Draft Year",
        value: player?.draftYear != null ? String(player.draftYear) : null,
      },
      { label: "MLB Debut", value: formatBirthDate(player?.mlbDebutDate) },
      { label: "Bats", value: player?.batSide?.code ?? null },
      { label: "Throws", value: player?.pitchHand?.code ?? null },
    ].filter((r) => r.value);

    const renderBioCard = () => {
      if (!player || bioRows.length === 0) return null;
      return (
        <View style={[pStyles.bubble, { backgroundColor: theme.surface }]}>
          <Text
            allowFontScaling={false}
            style={[pStyles.bubbleTitle, { color: theme.textSecondary }]}
          >
            Player Info
          </Text>
          {bioRows.map((row, i) => (
            <View
              key={row.label}
              style={[
                pStyles.bioRow,
                i < bioRows.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: theme.border,
                },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[pStyles.bioLabel, { color: theme.textSecondary }]}
              >
                {row.label}
              </Text>
              <Text
                allowFontScaling={false}
                style={[pStyles.bioValue, { color: theme.text }]}
              >
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      );
    };

    const hasAny =
      hitSeasonSplit ||
      pitchSeasonSplit ||
      hitProjectedStat ||
      pitchProjectedStat;
    if (!hasAny) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No stats available
          </Text>
        </View>
      );
    }

    if (isTwoWayPlayer) {
      return (
        <View style={pStyles.container}>
          {renderTwoWayStatBubble(
            hitSeasonSplit?.stat ?? null,
            pitchSeasonSplit?.stat ?? null,
            seasonLabel,
            true,
          )}
          {renderTwoWayStatBubble(
            hitProjectedStat,
            pitchProjectedStat,
            projectedLabel,
            false,
          )}
          {renderBioCard()}
        </View>
      );
    }

    return (
      <View style={pStyles.container}>
        {renderStatGrid(hitSeasonSplit?.stat ?? null, seasonLabel, true)}
        {renderStatGrid(hitProjectedStat, projectedLabel, false)}
        {renderBioCard()}
      </View>
    );
  };

  // ── Game Log tab renderer ─────────────────────────────────────────────────

  const renderGameLogTab = () => {
    if (!playerStats) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="small" color={teamColor} />
        </View>
      );
    }

    // Build a unified list of game entries.
    // For two-way players, hitting and pitching game logs are merged by gamePk.
    // Each entry: { base, hitSplit, pitchSplit }
    const logSplits = (() => {
      if (isTwoWayPlayer) {
        const allEntries = playerStats.stats ?? [];
        const getGroupLog = (groupName) =>
          allEntries
            .filter(
              (s) =>
                s.type?.displayName === "gameLog" &&
                s.group?.displayName === groupName,
            )
            .flatMap((s) => (s.splits ?? []).filter((sp) => sp.stat));

        const hitLog = getGroupLog("hitting").slice().reverse();
        const pitchLog = getGroupLog("pitching").slice().reverse();

        const gameMap = new Map();
        hitLog.forEach((split) => {
          const pk = split.game?.gamePk ?? split.gamePk;
          if (pk == null) return;
          gameMap.set(pk, { base: split, hitSplit: split, pitchSplit: null });
        });
        pitchLog.forEach((split) => {
          const pk = split.game?.gamePk ?? split.gamePk;
          if (pk == null) return;
          if (gameMap.has(pk)) {
            gameMap.get(pk).pitchSplit = split;
          } else {
            gameMap.set(pk, { base: split, hitSplit: null, pitchSplit: split });
          }
        });

        // Sort by date descending (most recent first)
        return [...gameMap.values()].sort(
          (a, b) =>
            new Date(b.base.date ?? 0).getTime() -
            new Date(a.base.date ?? 0).getTime(),
        );
      }

      // Non-two-way: wrap in unified shape
      const seen = new Set();
      const raw = (
        playerStats.stats?.find((s) => s.type?.displayName === "gameLog")
          ?.splits ?? []
      )
        .filter((s) => s.stat)
        .slice()
        .reverse()
        .filter((s) => {
          const pk = s.game?.gamePk ?? s.gamePk;
          if (pk == null) return true;
          if (seen.has(pk)) return false;
          seen.add(pk);
          return true;
        });

      return raw.map((s) => ({
        base: s,
        hitSplit: isPitcher ? null : s,
        pitchSplit: isPitcher ? s : null,
      }));
    })();

    if (logSplits.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No games found
          </Text>
        </View>
      );
    }

    const formatGameDate = (d) => {
      if (!d) return "";
      try {
        return new Date(d).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
      } catch {
        return d;
      }
    };

    const buildStatSummary = (stat) => {
      if (!stat) return null;
      if (stat.summary) {
        return stat.summary.replace(/,/g, " ·");
      }
    };

    const playerTeamLogoUrl = teamName
      ? MLBService.getLogoUrl(teamName, null, isDarkMode ? "dark" : "light")
      : null;

    const PAGE_SIZE = 30;
    const totalPages = Math.ceil(logSplits.length / PAGE_SIZE);
    const pageSplits = logSplits.slice(
      gameLogPage * PAGE_SIZE,
      (gameLogPage + 1) * PAGE_SIZE,
    );

    return (
      <View style={{ paddingTop: 6, paddingBottom: 40 }}>
        {pageSplits.map((entry, idx) => {
          const { base, hitSplit, pitchSplit } = entry;
          const { date, gameType, isHome, isWin, opponent, game } = base;
          const gamePk = game?.gamePk ?? base.gamePk;
          const oppName = opponent?.name ?? "";
          const oppColor = oppName
            ? MLBService.getTeamColor(oppName) || "#888888"
            : "#888888";
          const oppLogoUrl = oppName
            ? MLBService.getLogoUrl(
                oppName,
                null,
                isDarkMode ? "dark" : "light",
              )
            : null;
          const gradId = `gl_${idx}`;
          const isNotRegular = gameType && gameType !== "R";
          const gameTypeLabel = isNotRegular
            ? (GAME_TYPE_LABELS[gameType] ?? gameType)
            : null;

          // Position string: prefer hitting split's positionsPlayed, fallback to pitching
          const positionsPlayed =
            hitSplit?.positionsPlayed ?? pitchSplit?.positionsPlayed;
          let posStr = "";
          if (Array.isArray(positionsPlayed) && positionsPlayed.length > 0) {
            posStr = positionsPlayed
              .map((p) => p.name ?? p.abbreviation ?? p)
              .filter(Boolean)
              .join(" • ");
          } else if (typeof positionsPlayed === "string" && positionsPlayed) {
            posStr = positionsPlayed;
          } else {
            posStr = positionName;
          }

          const hitSummary = buildStatSummary(hitSplit?.stat);
          const pitchSummary = buildStatSummary(pitchSplit?.stat);
          const prefix = isHome ? "@" : "vs";

          return (
            <View key={idx} style={glStyles.cardWrap}>
              <TouchableOpacity
                style={[glStyles.card, { backgroundColor: theme.surface }]}
                activeOpacity={0.75}
                onPress={() =>
                  gamePk != null &&
                  navigation.navigate("GameDetails", {
                    sport: "mlb",
                    gamePk,
                  })
                }
              >
                {/* Gradient backdrop */}
                <Svg
                  style={StyleSheet.absoluteFill}
                  width="100%"
                  height="100%"
                  pointerEvents="none"
                >
                  <Defs>
                    <SvgLinearGradient
                      id={gradId}
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="0%"
                    >
                      <Stop
                        offset="0%"
                        stopColor={teamColor}
                        stopOpacity="0.15"
                      />
                      <Stop
                        offset="40%"
                        stopColor={theme.surface}
                        stopOpacity="0"
                      />
                      <Stop
                        offset="60%"
                        stopColor={theme.surface}
                        stopOpacity="0"
                      />
                      <Stop
                        offset="100%"
                        stopColor={oppColor}
                        stopOpacity="0.15"
                      />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill={`url(#${gradId})`} />
                </Svg>

                {/* Main row */}
                <View style={glStyles.cardInner}>
                  {/* Left: date + team logo */}
                  <View style={glStyles.leftCol}>
                    <Text
                      allowFontScaling={false}
                      style={[
                        glStyles.dateText,
                        { color: theme.textSecondary },
                      ]}
                      numberOfLines={2}
                    >
                      {formatGameDate(date)}
                    </Text>
                    {playerTeamLogoUrl ? (
                      <Image cachePolicy="memory-disk"
                        source={{ uri: playerTeamLogoUrl }}
                        style={glStyles.leftLogo}
                        resizeMode="contain"
                      />
                    ) : (
                      <View
                        style={[
                          glStyles.leftLogoFallback,
                          { backgroundColor: teamColor + "33" },
                        ]}
                      >
                        <Text
                          style={[
                            glStyles.leftLogoFallbackText,
                            { color: teamColor },
                          ]}
                        >
                          {(teamName[0] ?? "").toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Middle: positions + stat summary (stacked for two-way) */}
                  <View style={glStyles.middle}>
                    {posStr ? (
                      <Text
                        allowFontScaling={false}
                        style={[glStyles.positions, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {posStr}
                      </Text>
                    ) : null}
                    {isTwoWayPlayer ? (
                      <>
                        {hitSummary ? (
                          <Text
                            allowFontScaling={false}
                            style={[
                              glStyles.statSummary,
                              { color: theme.textSecondary },
                            ]}
                            numberOfLines={1}
                          >
                            <Text
                              style={{ color: teamColor, fontWeight: "700" }}
                            >
                              H:{" "}
                            </Text>
                            {hitSummary}
                          </Text>
                        ) : null}
                        {pitchSummary ? (
                          <Text
                            allowFontScaling={false}
                            style={[
                              glStyles.statSummary,
                              { color: theme.textSecondary },
                            ]}
                            numberOfLines={1}
                          >
                            <Text
                              style={{ color: teamColor, fontWeight: "700" }}
                            >
                              P:{" "}
                            </Text>
                            {pitchSummary}
                          </Text>
                        ) : null}
                        {!hitSummary && !pitchSummary ? (
                          <Text
                            allowFontScaling={false}
                            style={[
                              glStyles.statSummary,
                              { color: theme.textSecondary },
                            ]}
                          >
                            —
                          </Text>
                        ) : null}
                      </>
                    ) : (
                      <Text
                        allowFontScaling={false}
                        style={[
                          glStyles.statSummary,
                          { color: theme.textSecondary },
                        ]}
                        numberOfLines={2}
                      >
                        {hitSummary ?? pitchSummary ?? "—"}
                      </Text>
                    )}
                  </View>

                  {/* Right: W/L bubble */}
                  {isWin != null && (
                    <View
                      style={[
                        glStyles.wlBubble,
                        {
                          backgroundColor: isWin
                            ? (theme.success ?? "#22C55E")
                            : (theme.error ?? "#EF4444"),
                        },
                      ]}
                    >
                      <Text style={glStyles.wlText}>{isWin ? "W" : "L"}</Text>
                    </View>
                  )}
                </View>

                {/* Bottom: opponent row */}
                <View
                  style={[glStyles.oppRow, { borderTopColor: theme.border }]}
                >
                  <Text
                    allowFontScaling={false}
                    style={[glStyles.oppPrefix, { color: theme.textSecondary }]}
                  >
                    {prefix}
                  </Text>
                  {oppLogoUrl ? (
                    <Image cachePolicy="memory-disk"
                      source={{ uri: oppLogoUrl }}
                      style={glStyles.oppLogo}
                      resizeMode="contain"
                    />
                  ) : (
                    <View
                      style={[
                        glStyles.oppLogoFallback,
                        { backgroundColor: oppColor + "33" },
                      ]}
                    >
                      <Text
                        style={[
                          glStyles.oppLogoFallbackText,
                          { color: oppColor },
                        ]}
                      >
                        {(oppName[0] ?? "?").toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text
                    allowFontScaling={false}
                    style={[glStyles.oppName, { color: theme.textSecondary }]}
                    numberOfLines={1}
                  >
                    {oppName || "Opponent"}
                  </Text>
                  <Text
                    style={[
                      glStyles.oppChevron,
                      { color: theme.textSecondary },
                    ]}
                  >
                    ›
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Game type overlay badge — sits outside the overflow:hidden card */}
              {gameTypeLabel && (
                <View
                  style={[
                    glStyles.gameTypeBadge,
                    { backgroundColor: teamColor },
                  ]}
                >
                  <Text
                    allowFontScaling={false}
                    style={[
                      glStyles.gameTypeBadgeText,
                      { color: getTextOnColor(teamColor) },
                    ]}
                  >
                    {gameTypeLabel}
                  </Text>
                </View>
              )}
            </View>
          );
        })}

        {/* Pagination controls */}
        {totalPages > 1 && (
          <View style={glStyles.pagination}>
            <TouchableOpacity
              style={[
                glStyles.pageBtn,
                {
                  backgroundColor: theme.surface,
                  opacity: gameLogPage === 0 ? 0.35 : 1,
                },
              ]}
              disabled={gameLogPage === 0}
              onPress={() => setGameLogPage((p) => p - 1)}
              activeOpacity={0.75}
            >
              <Text style={[glStyles.pageBtnText, { color: teamColor }]}>
                ‹ Prev
              </Text>
            </TouchableOpacity>
            <Text style={[glStyles.pageLabel, { color: theme.textSecondary }]}>
              {gameLogPage + 1} / {totalPages}
            </Text>
            <TouchableOpacity
              style={[
                glStyles.pageBtn,
                {
                  backgroundColor: theme.surface,
                  opacity: gameLogPage === totalPages - 1 ? 0.35 : 1,
                },
              ]}
              disabled={gameLogPage === totalPages - 1}
              onPress={() => setGameLogPage((p) => p + 1)}
              activeOpacity={0.75}
            >
              <Text style={[glStyles.pageBtnText, { color: teamColor }]}>
                Next ›
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // ── Career tab renderer ───────────────────────────────────────────────────

  const renderCareerTab = () => {
    if (!playerStats) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="small" color={teamColor} />
        </View>
      );
    }

    // For two-way players there are separate hitting & pitching yearByYear groups
    const getYBYGroup = (groupName) =>
      playerStats.stats
        ?.filter(
          (s) =>
            s.type?.displayName === "yearByYear" &&
            (groupName == null || s.group?.displayName === groupName),
        )
        .flatMap((s) => s.splits ?? []) ?? [];

    const hitYBY = isTwoWayPlayer ? getYBYGroup("hitting") : getYBYGroup(null);
    const pitchYBY = isTwoWayPlayer ? getYBYGroup("pitching") : [];
    const ybyySplits = [...hitYBY, ...pitchYBY];

    if (ybyySplits.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No career stats available
          </Text>
        </View>
      );
    }

    // Group by season — track hitting and pitching splits separately for two-way players
    const seasonMap = {};
    const addToSeasonMap = (
      split,
      group /* "hitting" | "pitching" | null */,
    ) => {
      const yr = split.season ?? "?";
      if (!seasonMap[yr])
        seasonMap[yr] = { hitSplits: [], pitchSplits: [], teams: [] };
      if (group === "pitching") {
        seasonMap[yr].pitchSplits.push(split);
      } else {
        seasonMap[yr].hitSplits.push(split);
      }
      // Team accounting — never count All-Star game
      if (split.gameType === "A") return;
      if (
        split.team?.name &&
        !seasonMap[yr].teams.some((t) => t.name === split.team.name)
      ) {
        if (split.gameType === "R") {
          seasonMap[yr].teams.push(split.team);
        } else {
          seasonMap[yr].teams.unshift(split.team);
        }
      }
    };
    hitYBY.forEach((s) => addToSeasonMap(s, isTwoWayPlayer ? "hitting" : null));
    pitchYBY.forEach((s) => addToSeasonMap(s, "pitching"));
    const seasons = Object.keys(seasonMap).sort(
      (a, b) => Number(b) - Number(a),
    );

    // Sum counting stats; recalculate rate stats from totals
    const ADDITIVE_KEYS = [
      "gamesPlayed",
      "atBats",
      "hits",
      "homeRuns",
      "runs",
      "rbi",
      "doubles",
      "triples",
      "stolenBases",
      "strikeOuts",
      "baseOnBalls",
      "plateAppearances",
      "totalBases",
      "leftOnBase",
      "wins",
      "losses",
      "saves",
      "holds",
      "battersFaced",
      "earnedRuns",
      "strikes",
    ];
    const aggregateStats = (splits) => {
      const tot = {};
      let totalOuts = 0;
      let hasIP = false;
      splits.forEach(({ stat }) => {
        if (!stat) return;
        ADDITIVE_KEYS.forEach((k) => {
          if (stat[k] != null) tot[k] = (tot[k] ?? 0) + Number(stat[k]);
        });
        // Accumulate inningsPitched as outs (e.g. "5.2" = 5 full + 2 extra outs = 17 outs)
        if (stat.inningsPitched != null) {
          hasIP = true;
          const [full = "0", frac = "0"] = String(stat.inningsPitched).split(
            ".",
          );
          totalOuts += Number(full) * 3 + Number(frac);
        }
      });
      // Reconstruct IP from outs
      if (hasIP) {
        const fullInnings = Math.floor(totalOuts / 3);
        const remainOuts = totalOuts % 3;
        tot.inningsPitched =
          remainOuts === 0
            ? String(fullInnings)
            : `${fullInnings}.${remainOuts}`;
        // ERA = (earnedRuns × 9) / IP
        if (tot.earnedRuns != null && totalOuts > 0) {
          tot.era = ((tot.earnedRuns * 9) / (totalOuts / 3)).toFixed(2);
        }
        // WHIP = (BB + H) / IP
        if (tot.baseOnBalls != null && tot.hits != null && totalOuts > 0) {
          tot.whip = ((tot.baseOnBalls + tot.hits) / (totalOuts / 3)).toFixed(
            2,
          );
        }
      }
      // Hitting rate stats
      if (tot.hits != null && tot.atBats > 0) {
        const v = tot.hits / tot.atBats;
        tot.avg = v >= 1 ? v.toFixed(3) : v.toFixed(3).slice(1);
      }
      if (tot.totalBases != null && tot.atBats > 0) {
        const v = tot.totalBases / tot.atBats;
        tot.slg = v >= 1 ? v.toFixed(3) : v.toFixed(3).slice(1);
      }
      return tot;
    };

    // Rankings (only applies to gameType R) — group-aware for two-way players
    const hitRankSplits =
      playerStats.stats?.find(
        (s) =>
          s.type?.displayName === "rankingsByYear" &&
          (!isTwoWayPlayer || s.group?.displayName === "hitting"),
      )?.splits ?? [];
    const pitchRankSplits = isTwoWayPlayer
      ? (playerStats.stats?.find(
          (s) =>
            s.type?.displayName === "rankingsByYear" &&
            s.group?.displayName === "pitching",
        )?.splits ?? [])
      : [];
    // alias for non-two-way usage below
    const rankSplits = hitRankSplits;

    // Career totals — for two-way players gather both hitting and pitching career entries
    const getCareerGroup = (groupName) =>
      playerStats.stats
        ?.filter(
          (s) =>
            s.type?.displayName === "career" &&
            (groupName == null || s.group?.displayName === groupName),
        )
        .flatMap((s) => s.splits ?? []) ?? [];

    const hitCareerSplits = isTwoWayPlayer
      ? getCareerGroup("hitting")
      : getCareerGroup(null);
    const pitchCareerSplits = isTwoWayPlayer ? getCareerGroup("pitching") : [];
    const careerTypeSplits = [...hitCareerSplits, ...pitchCareerSplits];
    const careerHitAgg = aggregateStats(hitCareerSplits);
    const careerPitchAgg = aggregateStats(pitchCareerSplits);
    const careerTotalAgg = isTwoWayPlayer
      ? careerHitAgg
      : aggregateStats(careerTypeSplits);
    const isTotalExpanded = !!careerExpandedYears["__total__"];

    const HIT_CAREER_COLS = [
      { key: "gamesPlayed", label: "G" },
      { key: "avg", label: "AVG" },
      { key: "hits", label: "H" },
      { key: "homeRuns", label: "HR" },
    ];
    const PITCH_CAREER_COLS = [
      { key: "inningsPitched", label: "IP" },
      { key: "era", label: "ERA" },
      { key: "wins", label: "W" },
      { key: "losses", label: "L" },
    ];
    const CAREER_COLS = isPitcher ? PITCH_CAREER_COLS : HIT_CAREER_COLS;
    const fmt = (val) => (val != null ? String(val) : "—");

    return (
      <View style={cStyles.container}>
        {/* ── Total Career bubble ── */}
        {careerTypeSplits.length > 0 && (
          <View style={[cStyles.bubble, { backgroundColor: theme.surface }]}>
            <View
              style={{
                borderBottomWidth: 2,
                borderBottomColor: teamColor,
                backgroundColor: teamColor + "33",
              }}
            >
              <Text
                allowFontScaling={false}
                style={[cStyles.bubbleTitle, { color: theme.textSecondary }]}
              >
                Career Totals
              </Text>
            </View>

            {/* Summary row */}
            <TouchableOpacity
              onPress={() =>
                setCareerExpandedYears((prev) => ({
                  ...prev,
                  __total__: !prev.__total__,
                }))
              }
              style={cStyles.yearRow}
              activeOpacity={0.75}
            >
              <View style={cStyles.rowInfo}>
                <Text
                  allowFontScaling={false}
                  style={[cStyles.rowTeam, { color: theme.text }]}
                >
                  All Game Types
                </Text>
              </View>

              {/* Two-way: stacked hitting + pitching stat mini-rows (only when both present) */}
              {(() => {
                const hitPresent = isTwoWayPlayer && hitCareerSplits.length > 0;
                const pitchPresent =
                  isTwoWayPlayer && pitchCareerSplits.length > 0;
                if (hitPresent && pitchPresent) {
                  return (
                    <View style={cStyles.twoWayStatStack}>
                      <View style={cStyles.rowStats}>
                        {HIT_CAREER_COLS.map((d) => (
                          <View key={d.key} style={cStyles.rowStatCell}>
                            <Text
                              allowFontScaling={false}
                              style={[
                                cStyles.rowStatVal,
                                { color: theme.text },
                              ]}
                              numberOfLines={1}
                            >
                              {fmt(careerHitAgg[d.key])}
                            </Text>
                            <Text
                              allowFontScaling={false}
                              style={[
                                cStyles.rowStatLabel,
                                { color: theme.textSecondary },
                              ]}
                            >
                              {d.label}
                            </Text>
                          </View>
                        ))}
                      </View>
                      <View style={[cStyles.rowStats, { marginTop: 4 }]}>
                        {PITCH_CAREER_COLS.map((d) => (
                          <View key={d.key} style={cStyles.rowStatCell}>
                            <Text
                              allowFontScaling={false}
                              style={[
                                cStyles.rowStatVal,
                                { color: theme.text },
                              ]}
                              numberOfLines={1}
                            >
                              {fmt(careerPitchAgg[d.key])}
                            </Text>
                            <Text
                              allowFontScaling={false}
                              style={[
                                cStyles.rowStatLabel,
                                { color: theme.textSecondary },
                              ]}
                            >
                              {d.label}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                }
                // For a regular (non-two-way) pitcher pitchPresent is false but CAREER_COLS
                // already resolves to PITCH_CAREER_COLS via the isPitcher check above.
                const cols = pitchPresent ? PITCH_CAREER_COLS : CAREER_COLS;
                const agg = pitchPresent ? careerPitchAgg : careerTotalAgg;
                const valColor = pitchPresent ? teamColor : theme.text;
                return (
                  <View style={cStyles.rowStats}>
                    {cols.map((d) => (
                      <View key={d.key} style={cStyles.rowStatCell}>
                        <Text
                          allowFontScaling={false}
                          style={[cStyles.rowStatVal, { color: valColor }]}
                          numberOfLines={1}
                        >
                          {fmt(agg[d.key])}
                        </Text>
                        <Text
                          allowFontScaling={false}
                          style={[
                            cStyles.rowStatLabel,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {d.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })()}

              <Text
                style={[
                  cStyles.chevron,
                  { color: theme.textSecondary },
                  {
                    transform: [{ rotate: isTotalExpanded ? "90deg" : "0deg" }],
                  },
                ]}
              >
                ›
              </Text>
            </TouchableOpacity>

            {/* Expanded game-type rows */}
            {isTotalExpanded && (
              <View
                style={[
                  cStyles.gtContainer,
                  {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: theme.border,
                    borderLeftWidth: 3,
                    borderLeftColor: teamColor,
                  },
                ]}
              >
                {(() => {
                  if (isTwoWayPlayer) {
                    // Merge hitting + pitching career splits by gameType into stacked rows
                    const mergeMap = {};
                    hitCareerSplits.forEach((s) => {
                      const k = s.gameType ?? "";
                      if (!mergeMap[k])
                        mergeMap[k] = { hit: null, pitch: null };
                      mergeMap[k].hit = s;
                    });
                    pitchCareerSplits.forEach((s) => {
                      const k = s.gameType ?? "";
                      if (!mergeMap[k])
                        mergeMap[k] = { hit: null, pitch: null };
                      mergeMap[k].pitch = s;
                    });
                    const mergedRows = Object.entries(mergeMap).sort(
                      ([, a], [, b]) => {
                        const ag = Math.max(
                          Number(a.hit?.stat?.gamesPlayed ?? 0),
                          Number(a.pitch?.stat?.gamesPlayed ?? 0),
                        );
                        const bg = Math.max(
                          Number(b.hit?.stat?.gamesPlayed ?? 0),
                          Number(b.pitch?.stat?.gamesPlayed ?? 0),
                        );
                        return bg - ag;
                      },
                    );
                    return mergedRows.map(
                      ([gameType, { hit, pitch }], gIdx) => {
                        const bothPresent = !!hit && !!pitch;
                        const cols = !hit ? PITCH_CAREER_COLS : HIT_CAREER_COLS;
                        const singleColor = !hit ? teamColor : theme.text;
                        const singleSplit = hit ?? pitch;
                        return (
                          <TouchableOpacity
                            key={gameType || String(gIdx)}
                            style={[
                              cStyles.gtRow,
                              gIdx < mergedRows.length - 1 && {
                                borderBottomWidth: StyleSheet.hairlineWidth,
                                borderBottomColor: theme.border,
                              },
                            ]}
                            onPress={() => {
                              setCareerModal({
                                stat: (hit ?? pitch)?.stat ?? {},
                                hitStat: hit?.stat ?? null,
                                pitchStat: pitch?.stat ?? null,
                                gameType: gameType ?? "",
                                season: "Career",
                                teamName: "",
                                rankings: {},
                                hasBoth: bothPresent,
                              });
                              setCareerModalGroup("hitting");
                            }}
                            activeOpacity={0.75}
                          >
                            <View style={cStyles.gtBadge}>
                              <Text
                                allowFontScaling={false}
                                style={[
                                  cStyles.gtBadgeText,
                                  { color: theme.text },
                                ]}
                                numberOfLines={1}
                              >
                                {GAME_TYPE_LABELS[gameType] ?? gameType ?? ""}
                              </Text>
                            </View>
                            {bothPresent ? (
                              <View style={cStyles.twoWayStatStack}>
                                <View style={cStyles.rowStats}>
                                  {HIT_CAREER_COLS.map((d) => (
                                    <View
                                      key={d.key}
                                      style={cStyles.rowStatCell}
                                    >
                                      <Text
                                        allowFontScaling={false}
                                        style={[
                                          cStyles.rowStatVal,
                                          { color: theme.text },
                                        ]}
                                        numberOfLines={1}
                                      >
                                        {fmt(hit.stat?.[d.key])}
                                      </Text>
                                      <Text
                                        allowFontScaling={false}
                                        style={[
                                          cStyles.rowStatLabel,
                                          { color: theme.textSecondary },
                                        ]}
                                      >
                                        {d.label}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                                <View
                                  style={[cStyles.rowStats, { marginTop: 4 }]}
                                >
                                  {PITCH_CAREER_COLS.map((d) => (
                                    <View
                                      key={d.key}
                                      style={cStyles.rowStatCell}
                                    >
                                      <Text
                                        allowFontScaling={false}
                                        style={[
                                          cStyles.rowStatVal,
                                          { color: theme.text },
                                        ]}
                                        numberOfLines={1}
                                      >
                                        {fmt(pitch.stat?.[d.key])}
                                      </Text>
                                      <Text
                                        allowFontScaling={false}
                                        style={[
                                          cStyles.rowStatLabel,
                                          { color: theme.textSecondary },
                                        ]}
                                      >
                                        {d.label}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                              </View>
                            ) : (
                              <View style={cStyles.rowStats}>
                                {cols.map((d) => (
                                  <View key={d.key} style={cStyles.rowStatCell}>
                                    <Text
                                      allowFontScaling={false}
                                      style={[
                                        cStyles.rowStatVal,
                                        { color: singleColor },
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {fmt(singleSplit?.stat?.[d.key])}
                                    </Text>
                                    <Text
                                      allowFontScaling={false}
                                      style={[
                                        cStyles.rowStatLabel,
                                        { color: theme.textSecondary },
                                      ]}
                                    >
                                      {d.label}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            )}
                            <Text
                              style={[
                                cStyles.chevron,
                                { color: theme.textSecondary },
                              ]}
                            >
                              ›
                            </Text>
                          </TouchableOpacity>
                        );
                      },
                    );
                  }

                  const rows = careerTypeSplits;
                  return [...rows]
                    .sort(
                      (a, b) =>
                        (Number(b.stat?.gamesPlayed) || 0) -
                        (Number(a.stat?.gamesPlayed) || 0),
                    )
                    .map((split, gIdx) => (
                      <TouchableOpacity
                        key={split.gameType ?? String(gIdx)}
                        style={[
                          cStyles.gtRow,
                          gIdx < rows.length - 1 && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: theme.border,
                          },
                        ]}
                        onPress={() =>
                          setCareerModal({
                            stat: split.stat ?? {},
                            gameType: split.gameType,
                            season: "Career",
                            teamName: "",
                            rankings: {},
                          })
                        }
                        activeOpacity={0.75}
                      >
                        <View style={cStyles.gtBadge}>
                          <Text
                            allowFontScaling={false}
                            style={[cStyles.gtBadgeText, { color: theme.text }]}
                            numberOfLines={1}
                          >
                            {GAME_TYPE_LABELS[split.gameType] ??
                              split.gameType ??
                              ""}
                          </Text>
                        </View>
                        <View style={cStyles.rowStats}>
                          {CAREER_COLS.map((d) => (
                            <View key={d.key} style={cStyles.rowStatCell}>
                              <Text
                                allowFontScaling={false}
                                style={[
                                  cStyles.rowStatVal,
                                  { color: theme.text },
                                ]}
                                numberOfLines={1}
                              >
                                {fmt(split.stat?.[d.key])}
                              </Text>
                            </View>
                          ))}
                        </View>
                        <Text
                          style={[
                            cStyles.chevron,
                            { color: theme.textSecondary },
                          ]}
                        >
                          ›
                        </Text>
                      </TouchableOpacity>
                    ));
                })()}
              </View>
            )}
          </View>
        )}

        {/* ── Year-by-year bubble ── */}
        <View style={[cStyles.bubble, { backgroundColor: theme.surface }]}>
          <View
            style={{
              borderBottomWidth: 2,
              borderBottomColor: teamColor,
              backgroundColor: teamColor + "33",
            }}
          >
            <Text
              allowFontScaling={false}
              style={[cStyles.bubbleTitle, { color: theme.textSecondary }]}
            >
              Career
            </Text>
          </View>

          {seasons.map((yr, sIdx) => {
            const { hitSplits, pitchSplits, teams } = seasonMap[yr];
            // Only aggregate splits that have a real team attached (exclude teamless
            // aggregator rows and All-Star game splits)
            const filtered = (arr) =>
              arr.filter((s) => s.team?.name && s.gameType !== "A");
            const filteredHit = filtered(hitSplits);
            const filteredPitch = filtered(pitchSplits);
            const hitAgg = aggregateStats(filteredHit);
            const pitchAgg = isTwoWayPlayer
              ? aggregateStats(filteredPitch)
              : null;
            const yearBothPresent =
              isTwoWayPlayer &&
              filteredHit.length > 0 &&
              filteredPitch.length > 0;
            const isExpanded = !!careerExpandedYears[yr];
            // Primary team for row color = first R-type team, or first in list
            const primaryTeam = teams[0] ?? null;
            const rowTeamColor = primaryTeam?.name
              ? MLBService.getTeamColor(primaryTeam.name) || teamColor
              : teamColor;
            const isMultiTeam = teams.length > 1;
            const isLast = sIdx === seasons.length - 1;

            return (
              <View
                key={yr}
                style={
                  !isLast
                    ? {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: theme.border,
                      }
                    : undefined
                }
              >
                {/* Year summary row */}
                <TouchableOpacity
                  onPress={() =>
                    setCareerExpandedYears((prev) => ({
                      ...prev,
                      [yr]: !prev[yr],
                    }))
                  }
                  style={cStyles.yearRow}
                  activeOpacity={0.75}
                >
                  {isMultiTeam ? (
                    // Side-by-side logos (max 1 logo + overflow badge for 3+ teams)
                    <View style={cStyles.multiLogoWrap}>
                      {(() => {
                        const showOverflow = teams.length > 2;
                        const visibleTeams = showOverflow
                          ? teams.slice(0, 1)
                          : teams;
                        return (
                          <>
                            {visibleTeams.map((t) => {
                              const tUrl = MLBService.getLogoUrl(
                                t.name,
                                null,
                                isDarkMode ? "dark" : "light",
                              );
                              const tColor =
                                MLBService.getTeamColor(t.name) || teamColor;
                              return tUrl ? (
                                <Image cachePolicy="memory-disk"
                                  key={t.name}
                                  source={{ uri: tUrl }}
                                  style={cStyles.multiLogoImg}
                                  resizeMode="contain"
                                />
                              ) : (
                                <View
                                  key={t.name}
                                  style={[
                                    cStyles.multiLogoFallback,
                                    { backgroundColor: tColor + "33" },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      cStyles.multiLogoFallbackText,
                                      { color: tColor },
                                    ]}
                                  >
                                    {(t.name[0] ?? "?").toUpperCase()}
                                  </Text>
                                </View>
                              );
                            })}
                            {showOverflow &&
                              (() => {
                                const lastColor =
                                  MLBService.getTeamColor(
                                    teams[teams.length - 1].name,
                                  ) || teamColor;
                                const textColor = getTextOnColor(lastColor);
                                return (
                                  <View
                                    style={[
                                      cStyles.multiLogoFallback,
                                      { backgroundColor: lastColor },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        cStyles.multiLogoFallbackText,
                                        { color: textColor },
                                      ]}
                                    >
                                      +{teams.length - 1}
                                    </Text>
                                  </View>
                                );
                              })()}
                          </>
                        );
                      })()}
                    </View>
                  ) : (
                    (() => {
                      const logoUrl = primaryTeam?.name
                        ? MLBService.getLogoUrl(
                            primaryTeam.name,
                            null,
                            isDarkMode ? "dark" : "light",
                          )
                        : null;
                      return logoUrl ? (
                        <Image cachePolicy="memory-disk"
                          source={{ uri: logoUrl }}
                          style={cStyles.rowLogo}
                          resizeMode="contain"
                        />
                      ) : (
                        <View
                          style={[
                            cStyles.rowLogoFallback,
                            { backgroundColor: rowTeamColor + "33" },
                          ]}
                        >
                          <Text
                            style={[
                              cStyles.rowLogoFallbackText,
                              { color: rowTeamColor },
                            ]}
                          >
                            {(primaryTeam?.name?.[0] ?? "?").toUpperCase()}
                          </Text>
                        </View>
                      );
                    })()
                  )}

                  <View style={cStyles.rowInfo}>
                    <Text
                      allowFontScaling={false}
                      style={[cStyles.rowTeam, { color: theme.text }]}
                      numberOfLines={1}
                    >
                      {(() => {
                        const realTeams = teams.filter(
                          (t) => MLBService.teamAbbrMap[t.name],
                        );
                        if (realTeams.length > 1) {
                          return realTeams
                            .map((t) =>
                              MLBService.teamAbbrMap[t.name].toUpperCase(),
                            )
                            .join(" / ");
                        }
                        return teams.map((t) => t.name).join(" / ") || "";
                      })()}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={[cStyles.rowYear, { color: theme.textSecondary }]}
                    >
                      {yr}
                    </Text>
                  </View>

                  {/* Stats columns — stacked only when both groups present */}
                  {yearBothPresent ? (
                    <View style={cStyles.twoWayStatStack}>
                      <View style={cStyles.rowStats}>
                        {HIT_CAREER_COLS.map((d) => (
                          <View key={d.key} style={cStyles.rowStatCell}>
                            <Text
                              allowFontScaling={false}
                              style={[
                                cStyles.rowStatVal,
                                { color: theme.text },
                              ]}
                              numberOfLines={1}
                            >
                              {fmt(hitAgg[d.key])}
                            </Text>
                            <Text
                              allowFontScaling={false}
                              style={[
                                cStyles.rowStatLabel,
                                { color: theme.textSecondary },
                              ]}
                            >
                              {d.label}
                            </Text>
                          </View>
                        ))}
                      </View>
                      <View style={[cStyles.rowStats, { marginTop: 4 }]}>
                        {PITCH_CAREER_COLS.map((d) => (
                          <View key={d.key} style={cStyles.rowStatCell}>
                            <Text
                              allowFontScaling={false}
                              style={[
                                cStyles.rowStatVal,
                                { color: theme.text },
                              ]}
                              numberOfLines={1}
                            >
                              {fmt(pitchAgg?.[d.key])}
                            </Text>
                            <Text
                              allowFontScaling={false}
                              style={[
                                cStyles.rowStatLabel,
                                { color: theme.textSecondary },
                              ]}
                            >
                              {d.label}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : (
                    (() => {
                      const cols =
                        isTwoWayPlayer && filteredPitch.length > 0
                          ? PITCH_CAREER_COLS
                          : CAREER_COLS;
                      const agg =
                        isTwoWayPlayer && filteredPitch.length > 0
                          ? pitchAgg
                          : hitAgg;
                      const valColor =
                        isTwoWayPlayer && filteredPitch.length > 0
                          ? teamColor
                          : theme.text;
                      return (
                        <View style={cStyles.rowStats}>
                          {cols.map((d) => (
                            <View key={d.key} style={cStyles.rowStatCell}>
                              <Text
                                allowFontScaling={false}
                                style={[
                                  cStyles.rowStatVal,
                                  { color: valColor },
                                ]}
                                numberOfLines={1}
                              >
                                {fmt(agg?.[d.key])}
                              </Text>
                              <Text
                                allowFontScaling={false}
                                style={[
                                  cStyles.rowStatLabel,
                                  { color: theme.textSecondary },
                                ]}
                              >
                                {d.label}
                              </Text>
                            </View>
                          ))}
                        </View>
                      );
                    })()
                  )}

                  <Text
                    style={[
                      cStyles.chevron,
                      { color: theme.textSecondary },
                      {
                        transform: [{ rotate: isExpanded ? "90deg" : "0deg" }],
                      },
                    ]}
                  >
                    ›
                  </Text>
                </TouchableOpacity>

                {isExpanded && (
                  <View
                    style={[
                      cStyles.gtContainer,
                      {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: theme.border,
                      },
                    ]}
                  >
                    {(() => {
                      if (isTwoWayPlayer) {
                        // Merge hitting + pitching by gameType+teamId into stacked rows
                        const mergeMap = {};
                        const addToMerge = (splits, role) => {
                          splits
                            .filter((s) => s.team?.name && s.gameType !== "A")
                            .forEach((s) => {
                              const k = `${s.gameType ?? ""}_${s.team?.id ?? s.team?.name ?? ""}`;
                              if (!mergeMap[k])
                                mergeMap[k] = {
                                  hit: null,
                                  pitch: null,
                                  team: s.team,
                                  gameType: s.gameType,
                                };
                              mergeMap[k][role] = s;
                            });
                        };
                        addToMerge(hitSplits, "hit");
                        addToMerge(pitchSplits, "pitch");

                        const mergedRows = Object.entries(mergeMap).sort(
                          ([, a], [, b]) => {
                            const ag = Math.max(
                              Number(a.hit?.stat?.gamesPlayed ?? 0),
                              Number(a.pitch?.stat?.gamesPlayed ?? 0),
                            );
                            const bg = Math.max(
                              Number(b.hit?.stat?.gamesPlayed ?? 0),
                              Number(b.pitch?.stat?.gamesPlayed ?? 0),
                            );
                            return bg - ag;
                          },
                        );

                        return mergedRows.map(
                          ([key, { hit, pitch, team, gameType }], gIdx) => {
                            const splitTeamColor =
                              MLBService.getTeamColor(team?.name ?? "") ||
                              rowTeamColor;
                            const bothPresent = !!hit && !!pitch;
                            const cols = !hit
                              ? PITCH_CAREER_COLS
                              : HIT_CAREER_COLS;
                            const singleColor = !hit ? teamColor : theme.text;
                            const singleSplit = hit ?? pitch;
                            return (
                              <TouchableOpacity
                                key={key}
                                style={[
                                  cStyles.gtRow,
                                  gIdx < mergedRows.length - 1 && {
                                    borderBottomWidth: StyleSheet.hairlineWidth,
                                    borderBottomColor: theme.border,
                                  },
                                ]}
                                onPress={() => {
                                  setCareerModal({
                                    stat: (hit ?? pitch)?.stat ?? {},
                                    hitStat: hit?.stat ?? null,
                                    pitchStat: pitch?.stat ?? null,
                                    gameType: gameType ?? "",
                                    season: yr,
                                    teamName: team?.name ?? "",
                                    hitRankings:
                                      hitRankSplits.find(
                                        (r) =>
                                          r.season === yr && r.gameType === "R",
                                      )?.stat ?? {},
                                    pitchRankings:
                                      pitchRankSplits.find(
                                        (r) =>
                                          r.season === yr && r.gameType === "R",
                                      )?.stat ?? {},
                                    hasBoth: bothPresent,
                                  });
                                  setCareerModalGroup("hitting");
                                }}
                                activeOpacity={0.75}
                              >
                                <View
                                  style={[
                                    cStyles.gtBadge,
                                    { borderLeftColor: splitTeamColor },
                                  ]}
                                >
                                  <Text
                                    allowFontScaling={false}
                                    style={[
                                      cStyles.gtBadgeText,
                                      { color: theme.text },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {GAME_TYPE_LABELS[gameType] ??
                                      gameType ??
                                      ""}
                                  </Text>
                                  <Text
                                    allowFontScaling={false}
                                    style={[
                                      cStyles.gtTeamName,
                                      { color: splitTeamColor },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {team?.name ?? ""}
                                  </Text>
                                </View>
                                {bothPresent ? (
                                  <View style={cStyles.twoWayStatStack}>
                                    <View style={cStyles.rowStats}>
                                      {HIT_CAREER_COLS.map((d) => (
                                        <View
                                          key={d.key}
                                          style={cStyles.rowStatCell}
                                        >
                                          <Text
                                            allowFontScaling={false}
                                            style={[
                                              cStyles.rowStatVal,
                                              { color: theme.text },
                                            ]}
                                            numberOfLines={1}
                                          >
                                            {fmt(hit.stat?.[d.key])}
                                          </Text>
                                          <Text
                                            allowFontScaling={false}
                                            style={[
                                              cStyles.rowStatLabel,
                                              { color: theme.textSecondary },
                                            ]}
                                          >
                                            {d.label}
                                          </Text>
                                        </View>
                                      ))}
                                    </View>
                                    <View
                                      style={[
                                        cStyles.rowStats,
                                        { marginTop: 4 },
                                      ]}
                                    >
                                      {PITCH_CAREER_COLS.map((d) => (
                                        <View
                                          key={d.key}
                                          style={cStyles.rowStatCell}
                                        >
                                          <Text
                                            allowFontScaling={false}
                                            style={[
                                              cStyles.rowStatVal,
                                              { color: theme.text },
                                            ]}
                                            numberOfLines={1}
                                          >
                                            {fmt(pitch.stat?.[d.key])}
                                          </Text>
                                          <Text
                                            allowFontScaling={false}
                                            style={[
                                              cStyles.rowStatLabel,
                                              { color: theme.textSecondary },
                                            ]}
                                          >
                                            {d.label}
                                          </Text>
                                        </View>
                                      ))}
                                    </View>
                                  </View>
                                ) : (
                                  <View style={cStyles.rowStats}>
                                    {cols.map((d) => (
                                      <View
                                        key={d.key}
                                        style={cStyles.rowStatCell}
                                      >
                                        <Text
                                          allowFontScaling={false}
                                          style={[
                                            cStyles.rowStatVal,
                                            { color: singleColor },
                                          ]}
                                          numberOfLines={1}
                                        >
                                          {fmt(singleSplit?.stat?.[d.key])}
                                        </Text>
                                        <Text
                                          allowFontScaling={false}
                                          style={[
                                            cStyles.rowStatLabel,
                                            { color: theme.textSecondary },
                                          ]}
                                        >
                                          {d.label}
                                        </Text>
                                      </View>
                                    ))}
                                  </View>
                                )}
                                <Text
                                  style={[
                                    cStyles.chevron,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  ›
                                </Text>
                              </TouchableOpacity>
                            );
                          },
                        );
                      }

                      const rows = hitSplits
                        .filter((s) => s.team?.name && s.gameType !== "A")
                        .sort(
                          (a, b) =>
                            (Number(b.stat?.gamesPlayed) || 0) -
                            (Number(a.stat?.gamesPlayed) || 0),
                        );
                      return rows.map((split, gIdx) => {
                        const splitTeamColor =
                          MLBService.getTeamColor(split.team.name) ||
                          rowTeamColor;
                        return (
                          <TouchableOpacity
                            key={`${split.gameType ?? ""}_${split.team?.id ?? gIdx}`}
                            style={[
                              cStyles.gtRow,
                              gIdx < rows.length - 1 && {
                                borderBottomWidth: StyleSheet.hairlineWidth,
                                borderBottomColor: theme.border,
                              },
                            ]}
                            onPress={() =>
                              setCareerModal({
                                stat: split.stat ?? {},
                                gameType: split.gameType,
                                season: yr,
                                teamName: split.team?.name ?? "",
                                rankings:
                                  rankSplits.find(
                                    (r) =>
                                      r.season === yr && r.gameType === "R",
                                  )?.stat ?? {},
                              })
                            }
                            activeOpacity={0.75}
                          >
                            <View
                              style={[
                                cStyles.gtBadge,
                                { borderLeftColor: splitTeamColor },
                              ]}
                            >
                              <Text
                                allowFontScaling={false}
                                style={[
                                  cStyles.gtBadgeText,
                                  { color: theme.text },
                                ]}
                                numberOfLines={1}
                              >
                                {GAME_TYPE_LABELS[split.gameType] ??
                                  split.gameType ??
                                  ""}
                              </Text>
                              <Text
                                allowFontScaling={false}
                                style={[
                                  cStyles.gtTeamName,
                                  { color: splitTeamColor },
                                ]}
                                numberOfLines={1}
                              >
                                {split.team?.name ?? ""}
                              </Text>
                            </View>
                            <View style={cStyles.rowStats}>
                              {CAREER_COLS.map((d) => (
                                <View key={d.key} style={cStyles.rowStatCell}>
                                  <Text
                                    allowFontScaling={false}
                                    style={[
                                      cStyles.rowStatVal,
                                      { color: theme.text },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {fmt(split.stat?.[d.key])}
                                  </Text>
                                </View>
                              ))}
                            </View>
                            <Text
                              style={[
                                cStyles.chevron,
                                { color: theme.textSecondary },
                              ]}
                            >
                              ›
                            </Text>
                          </TouchableOpacity>
                        );
                      });
                    })()}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  // ── Splits tab renderer ─────────────────────────────────────────────────

  const renderSplitsTab = () => {
    if (!playerStats) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="small" color={teamColor} />
        </View>
      );
    }

    // Keep only the first occurrence of each unique split key
    const dedupe = (arr, keyFn) => {
      const seen = new Set();
      return arr.filter((s) => {
        const k = keyFn(s);
        if (k == null || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };

    // Helper: get splits from one stat type, optionally filtered by group
    const getSplitsOfType = (typeName, groupName = null) =>
      playerStats.stats
        ?.filter(
          (s) =>
            s.type?.displayName === typeName &&
            (groupName == null || s.group?.displayName === groupName),
        )
        .flatMap((s) => s.splits ?? []) ?? [];

    // For two-way: build { label, stat, pitchStat } by merging hitting + pitching arrays on key
    const mergeGroups = (hitArr, pitchArr, keyFn, labelFn) => {
      const map = new Map();
      hitArr.forEach((s) => {
        const k = keyFn(s);
        if (k == null) return;
        map.set(k, {
          key: k,
          label: labelFn(s),
          stat: s.stat ?? {},
          pitchStat: null,
        });
      });
      pitchArr.forEach((s) => {
        const k = keyFn(s);
        if (k == null) return;
        if (map.has(k)) {
          map.get(k).pitchStat = s.stat ?? {};
        } else {
          map.set(k, {
            key: k,
            label: labelFn(s),
            stat: null,
            pitchStat: s.stat ?? {},
          });
        }
      });
      return [...map.values()];
    };

    // buildSplits: sortDir = 1 for ascending, -1 for descending by key
    const buildSplits = (typeName, keyFn, labelFn, sortDir = 1) => {
      if (isTwoWayPlayer) {
        const hit = dedupe(getSplitsOfType(typeName, "hitting"), keyFn);
        const pitch = dedupe(getSplitsOfType(typeName, "pitching"), keyFn);
        return mergeGroups(hit, pitch, keyFn, labelFn).sort(
          (a, b) => sortDir * (a.key - b.key),
        );
      }
      return dedupe(getSplitsOfType(typeName), keyFn)
        .sort((a, b) => sortDir * (keyFn(a) - keyFn(b)))
        .map((s) => ({
          label: labelFn(s),
          stat: s.stat ?? {},
          pitchStat: null,
        }));
    };

    const dayOfWeekSplits = buildSplits(
      "byDayOfWeek",
      (s) => s.dayOfWeek,
      (s) => DAY_LABELS[s.dayOfWeek] ?? String(s.dayOfWeek),
      1,
    );

    const monthSplits = buildSplits(
      "byMonth",
      (s) => s.month,
      (s) => MONTH_LABELS[s.month] ?? String(s.month),
      1,
    );

    const homeAwaySplits = buildSplits(
      "homeAndAway",
      (s) => (s.isHome ? 1 : 0),
      (s) => (s.isHome ? "Home" : "Away"),
      -1, // Home first
    );

    const winLossSplits = buildSplits(
      "winLoss",
      (s) => (s.isWin ? 1 : 0),
      (s) => (s.isWin ? "Win" : "Loss"),
      -1, // Win first
    );

    const SPLITS_SECTIONS = [
      { title: "Day of Week", splits: dayOfWeekSplits },
      { title: "By Month", splits: monthSplits },
      { title: "Home & Away", splits: homeAwaySplits },
      { title: "Win / Loss", splits: winLossSplits },
    ];

    const otherTeams = ALL_MLB_TEAMS.filter((t) => t.name !== teamName);

    return (
      <View style={spStyles.container}>
        {/* ── VS Team bubble ── */}
        <TouchableOpacity
          style={[spStyles.bubble, { backgroundColor: theme.surface }]}
          activeOpacity={0.75}
          onPress={async () => {
            setVsTeamModal({
              teams: otherTeams,
              selectedTeamIdx: 0,
              statsCache: {},
            });
            const firstTeam = otherTeams[0];
            if (!firstTeam?.id) return;
            setVsTeamLoading(true);
            try {
              const year = new Date().getFullYear();
              const url = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=vsTeamTotal&opposingTeamId=${firstTeam.id}&season=${year}&fields=stats,type,displayName,splits,season,stat,summary,gamesPlayed,runs,doubles,triples,homeRuns,strikeOuts,baseOnBalls,hits,avg,atBats,obp,slg,ops,stolenBases,plateAppearances,totalBases,rbi,leftOnBase,babip,team,id,name,opponent,id,name,gameType`;
              const resp = await fetch(url);
              const data = await resp.json();
              const stat = data?.stats?.[0]?.splits?.[0]?.stat ?? null;
              setVsTeamModal((prev) =>
                prev
                  ? {
                      ...prev,
                      statsCache: {
                        ...prev.statsCache,
                        [firstTeam.name]: stat,
                      },
                    }
                  : null,
              );
            } catch {
              setVsTeamModal((prev) =>
                prev
                  ? {
                      ...prev,
                      statsCache: {
                        ...prev.statsCache,
                        [firstTeam.name]: null,
                      },
                    }
                  : null,
              );
            } finally {
              setVsTeamLoading(false);
            }
          }}
        >
          <View style={spStyles.bubbleRow}>
            <Text
              allowFontScaling={false}
              style={[spStyles.bubbleTitle, { color: theme.textSecondary }]}
            >
              VS Team
            </Text>
            <Text
              style={[spStyles.bubbleChevron, { color: theme.textSecondary }]}
            >
              ›
            </Text>
          </View>
          <View style={spStyles.vsTeamGrid}>
            {otherTeams.slice(0, 4).map((t) => {
              const tColor = MLBService.getTeamColor(t.name);
              const tLogo = MLBService.getLogoUrl(
                t.name,
                null,
                isDarkMode ? "dark" : "light",
              );
              return (
                <View
                  key={t.name}
                  style={[
                    spStyles.vsTeamChip,
                    {
                      backgroundColor: tColor + "18",
                      borderColor: tColor + "55",
                    },
                  ]}
                >
                  {tLogo ? (
                    <Image cachePolicy="memory-disk"
                      source={{ uri: tLogo }}
                      style={spStyles.vsTeamLogo}
                      resizeMode="contain"
                    />
                  ) : (
                    <View
                      style={[
                        spStyles.vsTeamLogoFallback,
                        { backgroundColor: tColor },
                      ]}
                    >
                      <Text
                        style={[
                          spStyles.vsTeamLogoFallbackText,
                          { color: getTextOnColor(tColor) },
                        ]}
                      >
                        {t.abbr[0]}
                      </Text>
                    </View>
                  )}
                  <Text
                    allowFontScaling={false}
                    style={[spStyles.vsTeamAbbr, { color: tColor }]}
                    numberOfLines={1}
                  >
                    {t.abbr}
                  </Text>
                </View>
              );
            })}
            {otherTeams.length > 4 && (
              <View
                style={[
                  spStyles.vsTeamChip,
                  {
                    backgroundColor: teamColor + "18",
                    borderColor: teamColor + "55",
                  },
                ]}
              >
                <Text
                  style={[spStyles.vsTeamAbbr, { color: theme.textTertiary }]}
                >
                  +{otherTeams.length - 4}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* ── Other splits bubbles ── */}
        {SPLITS_SECTIONS.map(({ title, splits }) => (
          <TouchableOpacity
            key={title}
            style={[spStyles.bubble, { backgroundColor: theme.surface }]}
            activeOpacity={splits && splits.length > 0 ? 0.75 : 1}
            onPress={() => {
              if (!splits || splits.length === 0) return;
              setSplitsModal({
                title,
                splits,
                selectedIdx: 0,
                selectedGroup: "hitting",
              });
            }}
          >
            <View style={spStyles.bubbleRow}>
              <Text
                allowFontScaling={false}
                style={[spStyles.bubbleTitle, { color: theme.textSecondary }]}
              >
                {title}
              </Text>
              {splits && splits.length > 0 ? (
                <Text
                  style={[
                    spStyles.bubbleChevron,
                    { color: theme.textSecondary },
                  ]}
                >
                  ›
                </Text>
              ) : null}
            </View>

            {splits && splits.length > 0 && (
              <View style={spStyles.pillsRow}>
                {splits.slice(0, 7).map((s) => (
                  <View
                    key={s.label}
                    style={[
                      spStyles.pill,
                      { backgroundColor: teamColor + "33" },
                    ]}
                  >
                    <Text
                      style={[spStyles.pillText, { color: theme.textTertiary }]}
                    >
                      {s.label}
                    </Text>
                  </View>
                ))}
                {splits.length > 7 && (
                  <View
                    style={[
                      spStyles.pill,
                      { backgroundColor: teamColor + "33" },
                    ]}
                  >
                    <Text
                      style={[spStyles.pillText, { color: theme.textTertiary }]}
                    >
                      +{splits.length - 7}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  // ── Awards renderer ────────────────────────────────────────────────────────

  const renderAwards = () => {
    if (!awards) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="small" color={teamColor} />
        </View>
      );
    }
    if (awards.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No awards found
          </Text>
        </View>
      );
    }

    // Group by year for a cleaner presentation
    const grouped = {};
    awards.forEach((a) => {
      const yr = a.date ? String(new Date(a.date).getFullYear()) : "—";
      if (!grouped[yr]) grouped[yr] = [];
      grouped[yr].push(a);
    });
    const years = Object.keys(grouped).sort((a, b) => b - a);

    return (
      <View style={{ paddingBottom: 24 }}>
        {years.map((yr) => (
          <View key={yr}>
            {/* Year header */}
            <View
              style={[
                styles.awardsYearHeader,
                { backgroundColor: teamColor + "18" },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.awardsYearText, { color: teamColor }]}
              >
                {yr}
              </Text>
            </View>
            {grouped[yr].map((a, idx) => {
              // Award team: API returns a.team.teamName (short) + a.team.id
              // Use the ID to resolve full name → reliable color lookup
              const awardTeamId = a.team?.id;
              const awardFullName = awardTeamId
                ? MLBService.getTeamNameById(awardTeamId)
                : null;
              const awardTeamName =
                awardFullName ?? a.team?.teamName ?? a.team?.name ?? "";
              const awardColor = awardFullName
                ? MLBService.getTeamColorById(awardTeamId) || teamColor
                : teamColor;
              return (
                <View
                  key={idx}
                  style={[
                    styles.awardRow,
                    {
                      backgroundColor: theme.surface,
                      borderBottomColor: theme.border,
                      borderBottomWidth:
                        idx < grouped[yr].length - 1
                          ? StyleSheet.hairlineWidth
                          : 0,
                    },
                  ]}
                >
                  <View
                    style={[styles.awardDot, { backgroundColor: awardColor }]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      allowFontScaling={false}
                      style={[styles.awardName, { color: theme.text }]}
                      numberOfLines={2}
                    >
                      {a.name ?? ""}
                    </Text>
                    {awardTeamName ? (
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.awardTeam,
                          { color: theme.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {awardTeamName}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        stickyHeaderIndices={[1]}
      >
        {/* ── [0] HERO HEADER ──────────────────────────────────────────── */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: teamColor + "22",
              borderBottomColor: teamColor,
            },
          ]}
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.headerMain}>
            {/* Player headshot */}
            {headshotUrl && !headshotError ? (
              <Image cachePolicy="memory-disk"
                source={{ uri: headshotUrl }}
                style={styles.headerLogo}
                resizeMode="cover"
                onError={() => setHeadshotError(true)}
              />
            ) : (
              <View
                style={[
                  styles.headerLogoFallback,
                  { backgroundColor: teamColor },
                ]}
              >
                <Text
                  style={[styles.headerLogoFallbackText, { color: "#fff" }]}
                >
                  {(displayName[0] ?? "P").toUpperCase()}
                </Text>
              </View>
            )}

            {/* Name / team / position */}
            <View style={styles.headerTextBlock}>
              <Text
                allowFontScaling={false}
                style={[styles.headerName, { color: "#fff" }]}
                numberOfLines={1}
              >
                {displayName}
              </Text>

              {teamName ? (
                <Text
                  allowFontScaling={false}
                  style={[styles.headerLeague, { color: "#fff", opacity: 0.8 }]}
                  numberOfLines={1}
                >
                  {teamName}
                </Text>
              ) : null}

              {positionName || jersey || positionAbbr ? (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.headerDivision,
                    { color: "#fff", opacity: 0.6 },
                  ]}
                  numberOfLines={1}
                >
                  {[positionName, positionAbbr, jersey]
                    .filter(Boolean)
                    .join("  ·  ")}
                </Text>
              ) : null}
            </View>

            {/* Team logo badge */}
            {teamLogoUrl ? (
              <Image cachePolicy="memory-disk"
                source={{ uri: teamLogoUrl }}
                style={styles.headerTeamBadge}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </View>

        {/* ── [1] STICKY UNIT (tab bar + mini banner) ──────────────────── */}
        <View style={{ backgroundColor: theme.surface }}>
          {/* Mini banner — fades + grows in as hero scrolls away */}
          <Animated.View
            style={{
              height: stickyMiniHeight,
              opacity: stickyOpacity,
              overflow: "hidden",
            }}
          >
            {/* Gradient background */}
            <Svg
              style={StyleSheet.absoluteFill}
              width="100%"
              height={60}
              pointerEvents="none"
            >
              <Defs>
                <SvgLinearGradient id="pGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <Stop
                    offset="0%"
                    stopColor={theme.surfaceSecondary ?? theme.surface}
                    stopOpacity="1"
                  />
                  <Stop
                    offset="55%"
                    stopColor={theme.surfaceSecondary ?? theme.surface}
                    stopOpacity="1"
                  />
                  <Stop
                    offset="100%"
                    stopColor={teamColor}
                    stopOpacity="0.65"
                  />
                </SvgLinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#pGrad)" />
            </Svg>

            {/* Mini headshot + name */}
            <View style={styles.stickyMiniContent}>
              {headshotUrl && !headshotError ? (
                <Image cachePolicy="memory-disk"
                  source={{ uri: headshotUrl }}
                  style={styles.stickyMiniLogo}
                  resizeMode="cover"
                />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text
                  allowFontScaling={false}
                  style={[styles.stickyMiniName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {displayName}
                </Text>
                {teamName ? (
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.stickyMiniLeague,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {teamName}
                  </Text>
                ) : null}
              </View>
            </View>
          </Animated.View>

          {/* Scrollable tab bar */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabBarContent}
            style={[styles.tabBar, { borderBottomColor: theme.border }]}
          >
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => {
                  if (tab === "Game Log") setGameLogPage(0);
                  setActiveTab(tab);
                }}
                style={styles.tabBarBtn}
                activeOpacity={0.75}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.tabBarText,
                    activeTab === tab
                      ? { color: theme.text, fontWeight: "700" }
                      : { color: theme.textSecondary },
                  ]}
                >
                  {tab}
                </Text>
                {activeTab === tab && (
                  <View
                    style={[
                      styles.tabBarIndicator,
                      { backgroundColor: teamColor },
                    ]}
                  />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── CONTENT ──────────────────────────────────────────────────── */}
        <View style={styles.content}>
          {activeTab === "Player" && renderPlayerTab()}

          {activeTab === "Game Log" && renderGameLogTab()}

          {activeTab === "Career" && renderCareerTab()}

          {activeTab === "Splits" && renderSplitsTab()}

          {activeTab === "Awards" && renderAwards()}
        </View>
      </Animated.ScrollView>

      {/* ── Career detail modal ─────────────────────────────────────────── */}
      {careerModal && (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setCareerModal(null)}
        >
          <Pressable
            style={cStyles.modalOverlay}
            onPress={() => setCareerModal(null)}
          >
            <Pressable
              style={[cStyles.modalSheet, { backgroundColor: theme.surface }]}
              onPress={() => {}}
            >
              {/* Header */}
              <View
                style={[
                  cStyles.modalHeader,
                  { borderBottomColor: theme.border },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    allowFontScaling={false}
                    style={[cStyles.modalTitle, { color: theme.text }]}
                  >
                    {careerModal.season} · 
                    {GAME_TYPE_LABELS[careerModal.gameType] ??
                      careerModal.gameType}
                  </Text>
                  {careerModal.teamName ? (
                    <Text
                      allowFontScaling={false}
                      style={[cStyles.modalSub, { color: theme.textSecondary }]}
                    >
                      {careerModal.teamName}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => setCareerModal(null)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text
                    style={[cStyles.modalClose, { color: theme.textSecondary }]}
                  >
                    ✕
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Hitting / Pitching toggle — only for two-way career entries */}
              {careerModal.hasBoth ? (
                <View
                  style={[
                    spStyles.groupToggleRow,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  {["hitting", "pitching"].map((g) => {
                    const isSelected = careerModalGroup === g;
                    return (
                      <TouchableOpacity
                        key={g}
                        onPress={() => setCareerModalGroup(g)}
                        style={[
                          spStyles.groupToggleBtn,
                          isSelected
                            ? { backgroundColor: teamColor }
                            : { backgroundColor: theme.background },
                        ]}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[
                            spStyles.groupToggleText,
                            {
                              color: isSelected
                                ? getTextOnColor(teamColor)
                                : theme.text,
                            },
                          ]}
                        >
                          {g.charAt(0).toUpperCase() + g.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}

              {/* Stats grid */}
              <ScrollView
                contentContainerStyle={cStyles.modalContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={cStyles.modalChipsGrid}>
                  {(() => {
                    const activeStat = careerModal.hasBoth
                      ? careerModalGroup === "pitching"
                        ? (careerModal.pitchStat ?? {})
                        : (careerModal.hitStat ?? {})
                      : (careerModal.stat ?? {});
                    return Object.entries(activeStat).map(([key, val]) => {
                      if (val == null || val === "") return null;
                      const lbl =
                        [...HITTING_STAT_DEFS, ...PITCHING_STAT_DEFS].find(
                          (d) => d.key === key,
                        )?.label ??
                        key
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, (s) => s.toUpperCase());
                      const activeRankings = careerModal.hasBoth
                        ? careerModalGroup === "pitching"
                          ? careerModal.pitchRankings
                          : careerModal.hitRankings
                        : (careerModal.rankings ?? {});
                      const rank =
                        careerModal.gameType === "R"
                          ? activeRankings?.[key]
                          : null;
                      const rankOnColor = getTextOnColor(teamColor);
                      return (
                        <View
                          key={key}
                          style={[
                            cStyles.modalChip,
                            { backgroundColor: theme.background },
                          ]}
                        >
                          {rank != null && (
                            <View
                              style={[
                                cStyles.rankBadge,
                                { backgroundColor: teamColor },
                              ]}
                            >
                              <Text
                                allowFontScaling={false}
                                style={[
                                  cStyles.rankText,
                                  { color: rankOnColor },
                                ]}
                              >
                                #{rank}
                              </Text>
                            </View>
                          )}
                          <Text
                            allowFontScaling={false}
                            style={[cStyles.chipValue, { color: theme.text }]}
                            numberOfLines={1}
                          >
                            {String(val)}
                          </Text>
                          <Text
                            allowFontScaling={false}
                            style={[
                              cStyles.chipLabel,
                              { color: theme.textSecondary },
                            ]}
                            numberOfLines={1}
                          >
                            {lbl}
                          </Text>
                        </View>
                      );
                    });
                  })()}
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}
      {/* ── Splits detail modal ──────────────────────────────────────────── */}
      {splitsModal && (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setSplitsModal(null)}
        >
          <Pressable
            style={cStyles.modalOverlay}
            onPress={() => setSplitsModal(null)}
          >
            <Pressable
              style={[cStyles.modalSheet, { backgroundColor: theme.surface }]}
              onPress={() => {}}
            >
              {/* Header */}
              <View
                style={[
                  cStyles.modalHeader,
                  { borderBottomColor: theme.border },
                ]}
              >
                <Text
                  allowFontScaling={false}
                  style={[cStyles.modalTitle, { color: theme.text }]}
                >
                  {splitsModal.title}
                </Text>
                <TouchableOpacity
                  onPress={() => setSplitsModal(null)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text
                    style={[cStyles.modalClose, { color: theme.textSecondary }]}
                  >
                    ✕
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Scrollable split selector */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={spStyles.splitBtnRow}
                style={[
                  spStyles.splitBtnScroll,
                  { borderBottomColor: theme.border },
                ]}
              >
                {splitsModal.splits.map((s, idx) => {
                  const isSelected = idx === splitsModal.selectedIdx;
                  return (
                    <TouchableOpacity
                      key={s.label}
                      onPress={() =>
                        setSplitsModal((prev) => ({
                          ...prev,
                          selectedIdx: idx,
                          selectedGroup: "hitting",
                        }))
                      }
                      style={[
                        spStyles.splitBtn,
                        isSelected
                          ? { backgroundColor: teamColor }
                          : { backgroundColor: theme.background },
                      ]}
                      activeOpacity={0.75}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[
                          spStyles.splitBtnText,
                          {
                            color: isSelected
                              ? getTextOnColor(teamColor)
                              : theme.text,
                          },
                        ]}
                      >
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Hitting / Pitching toggle — only for two-way entries */}
              {(() => {
                const selEntry = splitsModal.splits[splitsModal.selectedIdx];
                const hasBoth =
                  selEntry?.pitchStat != null &&
                  Object.keys(selEntry?.stat ?? {}).length > 0;
                if (!hasBoth) return null;
                return (
                  <View
                    style={[
                      spStyles.groupToggleRow,
                      { borderBottomColor: theme.border },
                    ]}
                  >
                    {["hitting", "pitching"].map((g) => {
                      const isActive = splitsModal.selectedGroup === g;
                      return (
                        <TouchableOpacity
                          key={g}
                          onPress={() =>
                            setSplitsModal((prev) => ({
                              ...prev,
                              selectedGroup: g,
                            }))
                          }
                          style={[
                            spStyles.groupToggleBtn,
                            isActive
                              ? { backgroundColor: teamColor }
                              : { backgroundColor: theme.background },
                          ]}
                          activeOpacity={0.75}
                        >
                          <Text
                            allowFontScaling={false}
                            style={[
                              spStyles.groupToggleText,
                              {
                                color: isActive
                                  ? getTextOnColor(teamColor)
                                  : theme.text,
                              },
                            ]}
                          >
                            {g === "hitting" ? "Hitting" : "Pitching"}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })()}

              {/* Stats grid */}
              <ScrollView
                contentContainerStyle={cStyles.modalContent}
                showsVerticalScrollIndicator={false}
              >
                {(() => {
                  const selEntry = splitsModal.splits[splitsModal.selectedIdx];
                  const hitStat = selEntry?.stat ?? {};
                  const pitchStat = selEntry?.pitchStat ?? null;
                  const showPitch =
                    pitchStat != null &&
                    splitsModal.selectedGroup === "pitching";
                  const activeStat = showPitch ? pitchStat : hitStat;

                  const renderChipEntry = (key, val) => {
                    if (val == null || val === "") return null;
                    const lbl =
                      [...HITTING_STAT_DEFS, ...PITCHING_STAT_DEFS].find(
                        (d) => d.key === key,
                      )?.label ??
                      key
                        .replace(/([A-Z])/g, " $1")
                        .replace(/^./, (s) => s.toUpperCase());
                    return (
                      <View
                        key={key}
                        style={[
                          cStyles.modalChip,
                          { backgroundColor: theme.background },
                        ]}
                      >
                        <Text
                          allowFontScaling={false}
                          style={[cStyles.chipValue, { color: theme.text }]}
                          numberOfLines={1}
                        >
                          {String(val)}
                        </Text>
                        <Text
                          allowFontScaling={false}
                          style={[
                            cStyles.chipLabel,
                            { color: theme.textSecondary },
                          ]}
                          numberOfLines={1}
                        >
                          {lbl}
                        </Text>
                      </View>
                    );
                  };

                  return (
                    <View style={cStyles.modalChipsGrid}>
                      {Object.entries(activeStat).map(([k, v]) =>
                        renderChipEntry(k, v),
                      )}
                    </View>
                  );
                })()}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* ── VS Team modal ─────────────────────────────────────────────────── */}
      {vsTeamModal && (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setVsTeamModal(null)}
        >
          <Pressable
            style={cStyles.modalOverlay}
            onPress={() => setVsTeamModal(null)}
          >
            <Pressable
              style={[cStyles.modalSheet, { backgroundColor: theme.surface }]}
              onPress={() => {}}
            >
              {/* Header */}
              <View
                style={[
                  cStyles.modalHeader,
                  { borderBottomColor: theme.border },
                ]}
              >
                <Text
                  allowFontScaling={false}
                  style={[cStyles.modalTitle, { color: theme.text }]}
                >
                  VS Team
                </Text>
                <TouchableOpacity
                  onPress={() => setVsTeamModal(null)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text
                    style={[cStyles.modalClose, { color: theme.textSecondary }]}
                  >
                    ✕
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Team selector */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={spStyles.splitBtnRow}
                style={[
                  spStyles.splitBtnScroll,
                  { borderBottomColor: theme.border },
                ]}
              >
                {vsTeamModal.teams.map((t, idx) => {
                  const isSelected = idx === vsTeamModal.selectedTeamIdx;
                  const tColor = MLBService.getTeamColor(t.name);
                  const tLogo = MLBService.getLogoUrl(
                    t.name,
                    null,
                    isDarkMode ? "dark" : "light",
                  );
                  return (
                    <TouchableOpacity
                      key={t.name}
                      onPress={async () => {
                        setVsTeamModal((prev) =>
                          prev ? { ...prev, selectedTeamIdx: idx } : null,
                        );
                        if (
                          vsTeamModal.statsCache[t.name] !== undefined ||
                          !t.id
                        )
                          return;
                        setVsTeamLoading(true);
                        try {
                          const year = new Date().getFullYear();
                          const url =
                            `https://statsapi.mlb.com/api/v1/people/${playerId}/stats` +
                            `?stats=vsTeamTotal&opposingTeamId=${t.id}&season=${year}` +
                            `&fields=stats,type,displayName,splits,season,stat,summary,gamesPlayed,` +
                            `runs,doubles,triples,homeRuns,strikeOuts,baseOnBalls,hits,avg,atBats,` +
                            `obp,slg,ops,stolenBases,plateAppearances,totalBases,rbi,leftOnBase,` +
                            `babip,team,id,name,opponent,id,name,gameType`;
                          const resp = await fetch(url);
                          const data = await resp.json();
                          const stat =
                            data?.stats?.[0]?.splits?.[0]?.stat ?? null;
                          setVsTeamModal((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  statsCache: {
                                    ...prev.statsCache,
                                    [t.name]: stat,
                                  },
                                }
                              : null,
                          );
                        } catch {
                          setVsTeamModal((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  statsCache: {
                                    ...prev.statsCache,
                                    [t.name]: null,
                                  },
                                }
                              : null,
                          );
                        } finally {
                          setVsTeamLoading(false);
                        }
                      }}
                      style={[
                        spStyles.vsModalBtn,
                        {
                          backgroundColor: isSelected
                            ? tColor
                            : theme.background,
                          borderColor: isSelected ? tColor : tColor + "55",
                        },
                      ]}
                      activeOpacity={0.75}
                    >
                      {tLogo ? (
                        <Image cachePolicy="memory-disk"
                          source={{ uri: tLogo }}
                          style={spStyles.vsModalBtnLogo}
                          resizeMode="contain"
                        />
                      ) : null}
                      <Text
                        allowFontScaling={false}
                        style={[
                          spStyles.vsModalBtnText,
                          {
                            color: isSelected ? getTextOnColor(tColor) : tColor,
                          },
                        ]}
                      >
                        {t.abbr}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Stats area */}
              {(() => {
                const selTeam = vsTeamModal.teams[vsTeamModal.selectedTeamIdx];
                const cached = selTeam
                  ? vsTeamModal.statsCache[selTeam.name]
                  : undefined;
                const selColor = MLBService.getTeamColor(selTeam?.name);

                if (vsTeamLoading) {
                  return (
                    <View
                      style={{
                        flex: 1,
                        justifyContent: "center",
                        alignItems: "center",
                        padding: 48,
                      }}
                    >
                      <ActivityIndicator size="small" color={selColor} />
                    </View>
                  );
                }
                if (cached === null) {
                  return (
                    <View
                      style={{
                        flex: 1,
                        justifyContent: "center",
                        alignItems: "center",
                        padding: 48,
                      }}
                    >
                      <Text
                        style={{ color: theme.textSecondary, fontSize: 14 }}
                      >
                        No data for this season
                      </Text>
                    </View>
                  );
                }
                if (!cached) {
                  return (
                    <View
                      style={{
                        flex: 1,
                        justifyContent: "center",
                        alignItems: "center",
                        padding: 48,
                      }}
                    >
                      <Text
                        style={{ color: theme.textSecondary, fontSize: 14 }}
                      >
                        Tap a team to view stats
                      </Text>
                    </View>
                  );
                }
                return (
                  <ScrollView
                    contentContainerStyle={cStyles.modalContent}
                    showsVerticalScrollIndicator={false}
                  >
                    <View style={cStyles.modalChipsGrid}>
                      {Object.entries(cached).map(([key, val]) => {
                        if (val == null || val === "") return null;
                        const lbl =
                          [...HITTING_STAT_DEFS, ...PITCHING_STAT_DEFS].find(
                            (d) => d.key === key,
                          )?.label ??
                          key
                            .replace(/([A-Z])/g, " $1")
                            .replace(/^./, (s) => s.toUpperCase());
                        return (
                          <View
                            key={key}
                            style={[
                              cStyles.modalChip,
                              { backgroundColor: theme.background },
                            ]}
                          >
                            <Text
                              allowFontScaling={false}
                              style={[cStyles.chipValue, { color: theme.text }]}
                              numberOfLines={1}
                            >
                              {String(val)}
                            </Text>
                            <Text
                              allowFontScaling={false}
                              style={[
                                cStyles.chipLabel,
                                { color: theme.textSecondary },
                              ]}
                              numberOfLines={1}
                            >
                              {lbl}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                );
              })()}
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  // ── Hero header
  header: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 2,
  },
  headerMain: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  headerLogo: {
    width: 68,
    height: 68,
    borderRadius: 34,
    marginRight: 14,
  },
  headerLogoFallback: {
    width: 68,
    height: 68,
    borderRadius: 34,
    marginRight: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  headerLogoFallbackText: { fontSize: 28, fontWeight: "800" },
  headerTextBlock: { flex: 1 },
  headerName: { fontSize: 22, fontWeight: "800", marginBottom: 3 },
  headerLeague: { fontSize: 13, fontWeight: "600", marginBottom: 2 },
  headerDivision: { fontSize: 12 },
  headerTeamBadge: {
    width: 44,
    height: 44,
    marginLeft: 10,
    opacity: 0.85,
  },

  // ── Sticky mini banner
  stickyMiniContent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  stickyMiniLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 4,
  },
  stickyMiniName: { fontSize: 15, fontWeight: "700" },
  stickyMiniLeague: { fontSize: 11, fontWeight: "500", marginTop: 1 },

  // ── Tab bar
  tabBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBarContent: {
    flexGrow: 1,
    justifyContent: "space-evenly",
  },
  tabBarBtn: {
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 12,
    position: "relative",
  },
  tabBarText: { fontSize: 15 },
  tabBarIndicator: {
    position: "absolute",
    bottom: 0,
    left: 8,
    right: 8,
    height: 2.5,
    borderRadius: 2,
  },

  // ── Content
  content: { paddingBottom: 40, paddingTop: 6 },
  emptyContainer: { alignItems: "center", paddingVertical: 56 },
  emptyText: { fontSize: 15 },

  // ── Awards
  awardsYearHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 12,
  },
  awardsYearText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  awardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  awardDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  awardName: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  awardTeam: { fontSize: 12 },
});

// ─── Player tab styles ────────────────────────────────────────────────────────

const CHIP_GAP = 8;
const CHIP_COLS = 4;
// container paddingH=12, bubble padding=14, 3 gaps of 8
const CHIP_W =
  (width - 2 * 12 - 2 * 14 - CHIP_GAP * (CHIP_COLS - 1)) / CHIP_COLS;

const pStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 10,
  },
  bubble: {
    borderRadius: 16,
    padding: 14,
  },
  bubbleTitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
    marginBottom: 14,
    textTransform: "uppercase",
  },
  chipsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: CHIP_GAP,
  },
  chip: {
    width: CHIP_W,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    position: "relative",
    overflow: "visible",
  },
  rankBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  rankText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  chipValue: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 4,
    textAlign: "center",
  },
  chipLabel: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  // ── Two-way group headers
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    borderLeftWidth: 3,
    paddingLeft: 8,
    marginBottom: 10,
    marginTop: 14,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  groupDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 14,
  },
  // ── Bio
  bioRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  bioLabel: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  bioValue: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
    flex: 2,
  },
});

// ─── Game Log styles ─────────────────────────────────────────────────────────

const glStyles = StyleSheet.create({
  cardWrap: {
    marginHorizontal: 12,
    marginTop: 10,
    position: "relative",
    overflow: "visible",
  },
  card: {
    borderRadius: 14,
    overflow: "hidden",
  },
  cardInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  leftCol: {
    width: 52,
    alignItems: "center",
    gap: 6,
  },
  dateText: {
    fontSize: 11,
    textAlign: "center",
    fontWeight: "500",
    lineHeight: 15,
  },
  leftLogo: { width: 32, height: 32 },
  leftLogoFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  leftLogoFallbackText: { fontSize: 14, fontWeight: "800" },
  middle: { flex: 1, gap: 3 },
  positions: { fontSize: 13, fontWeight: "700" },
  statSummary: { fontSize: 12, fontWeight: "500", lineHeight: 18 },
  wlBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
  },
  wlText: { fontSize: 13, fontWeight: "800", color: "#FFFFFF" },
  oppRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  oppPrefix: { fontSize: 11, fontWeight: "600", width: 18 },
  oppLogo: { width: 20, height: 20 },
  oppLogoFallback: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  oppLogoFallbackText: { fontSize: 9, fontWeight: "800" },
  oppName: { fontSize: 12, fontWeight: "500", flex: 1 },
  oppChevron: { fontSize: 20, lineHeight: 24, paddingLeft: 2 },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 12,
    marginTop: 16,
    marginBottom: 4,
  },
  pageBtn: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  pageBtnText: { fontSize: 14, fontWeight: "700" },
  pageLabel: { fontSize: 13, fontWeight: "600" },
  gameTypeBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    zIndex: 1,
  },
  gameTypeBadgeText: { fontSize: 10, fontWeight: "700" },
});

// ─── Career tab styles ──────────────────────────────────────────────────────────────

const MODAL_CHIP_COLS = 3;
const MODAL_CHIP_GAP = 8;
const MODAL_CHIP_W =
  (width - 32 - MODAL_CHIP_GAP * (MODAL_CHIP_COLS - 1)) / MODAL_CHIP_COLS;

const cStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 10,
  },
  bubble: {
    borderRadius: 16,
    overflow: "hidden",
  },
  bubbleTitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  // ── Year row
  yearRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  rowLogo: { width: 32, height: 32 },
  rowLogoFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  rowLogoFallbackText: { fontSize: 13, fontWeight: "800" },
  rowInfo: { flex: 1 },
  rowTeam: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  rowYear: { fontSize: 11, fontWeight: "500" },
  rowStats: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  rowStatCell: { alignItems: "center", minWidth: 32 },
  rowStatVal: { fontSize: 13, fontWeight: "700" },
  rowStatLabel: { fontSize: 10, fontWeight: "500", marginTop: 1 },
  chevron: { fontSize: 22, lineHeight: 26, paddingLeft: 2 },
  // ── Game-type rows
  gtContainer: { marginLeft: 14 },
  gtRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingRight: 14,
    gap: 10,
  },
  gtBadge: {
    flex: 1,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 3,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
  },
  gtBadgeText: { fontSize: 12, fontWeight: "600" },
  gtTeamName: { fontSize: 11, fontWeight: "500", marginTop: 1 },
  // ── Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: "800" },
  modalSub: { fontSize: 12, fontWeight: "500", marginTop: 2 },
  modalClose: { fontSize: 18, lineHeight: 22 },
  modalContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
  },
  modalChipsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: MODAL_CHIP_GAP,
  },
  modalChip: {
    width: MODAL_CHIP_W,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    position: "relative",
    overflow: "visible",
  },
  // Shared rank badge (reused from pStyles pattern)
  rankBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  rankText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.2 },
  chipValue: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4,
    textAlign: "center",
  },
  chipLabel: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  // Multi-team logo
  multiLogoWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    width: 42,
  },
  multiLogoImg: { width: 18, height: 18 },
  multiLogoFallback: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  multiLogoFallbackText: { fontSize: 9, fontWeight: "800" },
  // Two-way stacked stat rows in career
  twoWayStatStack: {
    alignItems: "flex-end",
  },
});

// ─── Splits tab styles ──────────────────────────────────────────────────────

const spStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 10,
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  bubbleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bubbleTitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  bubbleChevron: {
    fontSize: 22,
    lineHeight: 26,
  },
  bubbleSoon: {
    fontSize: 12,
    fontStyle: "italic",
  },
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  pill: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  // Modal split selector
  splitBtnScroll: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexGrow: 0,
  },
  splitBtnRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  splitBtn: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  splitBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  // VS Team chip grid
  vsTeamGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  vsTeamChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  vsTeamLogo: {
    width: 20,
    height: 20,
  },
  vsTeamLogoFallback: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  vsTeamLogoFallbackText: {
    fontSize: 9,
    fontWeight: "800",
  },
  vsTeamAbbr: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  // VS Team modal team buttons
  vsModalBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  vsModalBtnLogo: { width: 20, height: 20 },
  vsModalBtnText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  // Two-way group toggle
  groupToggleRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupToggleBtn: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 8,
    alignItems: "center",
  },
  groupToggleText: {
    fontSize: 13,
    fontWeight: "700",
  },
});

export default PlayerPageScreen;

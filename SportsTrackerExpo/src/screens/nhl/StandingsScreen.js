import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import * as Sharing from "expo-sharing";
import ViewShot from "react-native-view-shot";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { useFavorites } from "../../context/FavoritesContext";
import { useBetSlip } from "../../context/BetSlipContext";
import { BannerAdWrapper } from "../../services/ads";
import { NHLService } from "../../services/NHLService";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";

const { width } = Dimensions.get("window");

const DIVISION_ORDER = ["Atlantic", "Metropolitan", "Central", "Pacific"];
const CONFERENCE_ORDER = ["E", "W"];

const SORT_OPTIONS = [
  { label: "Home Record", key: "home" },
  { label: "Road Record", key: "road" },
  { label: "Last Ten", key: "lastTen" },
];

const toNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const getNhlTeamKey = (team, idx = null) => {
  if (team?.id) return `id:${team.id}`;
  if (team?.abbreviation) return `abbr:${team.abbreviation}`;
  return idx == null ? "unknown" : `idx:${idx}`;
};

const normalizeTeam = (row) => {
  const pick = (v) => {
    if (v == null) return undefined;
    if (typeof v === "object" && "default" in v) return v.default;
    return v;
  };

  const abbr =
    pick(row.teamAbbrev) || pick(row.abbreviation) || pick(row.tricode) || "";
  const displayName =
    pick(row.teamCommonName) ||
    pick(row.teamName) ||
    pick(row.teamPlaceNameWithPreposition) ||
    abbr ||
    "Team";

  return {
    id:
      row.teamId?.toString?.() ||
      row.id?.toString?.() ||
      (abbr ? `abbr:${abbr}` : null),
    abbreviation: abbr,
    displayName,
    logo: row.teamLogo || null,
    conferenceName: pick(row.conferenceName) || "NHL",
    conferenceAbbrev: (pick(row.conferenceAbbrev) || "").toUpperCase(),
    divisionName: pick(row.divisionName) || "NHL",
    divisionRank: toNum(row.divisionSequence ?? row.divisionPlace, 99),
    leagueRank: toNum(row.leagueSequence ?? row.leaguePlace, 99),
    conferenceRank: toNum(row.conferenceSequence ?? row.conferencePlace, 99),
    wildcardSequence: toNum(row.wildcardSequence, 99),
    wins: toNum(row.wins, 0),
    losses: toNum(row.losses, 0),
    otl: toNum(row.otLosses, 0),
    points: toNum(row.points, 0),
    gf: toNum(row.goalFor ?? row.goalsFor, 0),
    ga: toNum(row.goalAgainst ?? row.goalsAgainst, 0),
    homeWins: toNum(row.homeWins, 0),
    homeLosses: toNum(row.homeLosses, 0),
    homeOtl: toNum(row.homeOtLosses, 0),
    roadWins: toNum(row.roadWins, 0),
    roadLosses: toNum(row.roadLosses, 0),
    roadOtl: toNum(row.roadOtLosses, 0),
    l10Wins: toNum(row.l10Wins, 0),
    l10Losses: toNum(row.l10Losses, 0),
    l10Otl: toNum(row.l10OtLosses, 0),
    clinch: String(row.clinchIndicator || "").toLowerCase(),
    streakCode: row.streakCode || "",
    streakCount: toNum(row.streakCount, 0),
  };
};

const getDivisionSortKey = (name) => {
  const idx = DIVISION_ORDER.findIndex(
    (d) => d.toLowerCase() === String(name || "").toLowerCase(),
  );
  return idx === -1 ? 99 : idx;
};

const getSortRecord = (team, sortBy) => {
  if (!sortBy) return null;
  if (sortBy.key === "home") {
    return `${team.homeWins}-${team.homeLosses}-${team.homeOtl}`;
  }
  if (sortBy.key === "road") {
    return `${team.roadWins}-${team.roadLosses}-${team.roadOtl}`;
  }
  return `${team.l10Wins}-${team.l10Losses}-${team.l10Otl}`;
};

const getSortPoints = (team, sortBy) => {
  if (!sortBy) return -1;
  if (sortBy.key === "home") {
    return team.homeWins * 2 + team.homeOtl;
  }
  if (sortBy.key === "road") {
    return team.roadWins * 2 + team.roadOtl;
  }
  return team.l10Wins * 2 + team.l10Otl;
};

const getStandingsLogo = (teamLogo, isDarkMode) => {
  if (!teamLogo) return null;
  const normalized = String(teamLogo).replace("http://", "https://");
  if (!isDarkMode) return normalized;
  return normalized
    .replace("_light.svg", "_dark.svg")
    .replace("_light.svg?", "_dark.svg?")
    .replace("_secondary_light.svg", "_secondary_dark.svg")
    .replace("_secondary_light.svg?", "_secondary_dark.svg?");
};

const toOrdinal = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return "--";
  const mod100 = num % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${num}th`;
  const mod10 = num % 10;
  if (mod10 === 1) return `${num}st`;
  if (mod10 === 2) return `${num}nd`;
  if (mod10 === 3) return `${num}rd`;
  return `${num}th`;
};

const getTextOnColor = (hex) => {
  const clean = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return "#fff";
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#111" : "#fff";
};

const getCurrentDateLines = () => {
  const now = new Date();
  return {
    monthDay: now.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    year: now.toLocaleDateString("en-US", { year: "numeric" }),
  };
};

const rankNhlTeams = (teams, getter, lowerBetter = false) => {
  const rows = teams.map((team, idx) => {
    const raw = getter(team);
    const value = Number.isFinite(raw) ? raw : lowerBetter ? 999999 : -999999;
    return { id: getNhlTeamKey(team, idx), value };
  });
  rows.sort((a, b) => (lowerBetter ? a.value - b.value : b.value - a.value));

  const rankMap = {};
  let lastValue = null;
  let currentRank = 0;
  rows.forEach((row, i) => {
    if (lastValue === null || row.value !== lastValue) {
      currentRank = i + 1;
      lastValue = row.value;
    }
    rankMap[row.id] = currentRank;
  });
  return rankMap;
};

const getNhlPointsPct = (team) => {
  const gp = (team?.wins ?? 0) + (team?.losses ?? 0) + (team?.otl ?? 0);
  return (team?.points ?? 0) / Math.max(1, gp * 2);
};

const getNhlRecordPct = (wins, losses, otl = 0) => {
  const gp = (wins ?? 0) + (losses ?? 0) + (otl ?? 0);
  const pts = (wins ?? 0) * 2 + (otl ?? 0);
  return pts / Math.max(1, gp * 2);
};

const getNhlShareStatRows = (team, teams) => {
  const teamId = getNhlTeamKey(team);
  const rankMaps = {
    pts: rankNhlTeams(teams, (t) => t?.points ?? 0, false),
    ptspct: rankNhlTeams(teams, (t) => getNhlPointsPct(t), false),
    wins: rankNhlTeams(teams, (t) => t?.wins ?? 0, false),
    losses: rankNhlTeams(teams, (t) => t?.losses ?? 0, true),
    otl: rankNhlTeams(teams, (t) => t?.otl ?? 0, true),
    gf: rankNhlTeams(teams, (t) => t?.gf ?? 0, false),
    ga: rankNhlTeams(teams, (t) => t?.ga ?? 0, true),
    diff: rankNhlTeams(teams, (t) => (t?.gf ?? 0) - (t?.ga ?? 0), false),
    home: rankNhlTeams(
      teams,
      (t) => getNhlRecordPct(t?.homeWins, t?.homeLosses, t?.homeOtl),
      false,
    ),
    road: rankNhlTeams(
      teams,
      (t) => getNhlRecordPct(t?.roadWins, t?.roadLosses, t?.roadOtl),
      false,
    ),
    l10: rankNhlTeams(
      teams,
      (t) => getNhlRecordPct(t?.l10Wins, t?.l10Losses, t?.l10Otl),
      false,
    ),
    lgRank: rankNhlTeams(teams, (t) => t?.leagueRank ?? 99, true),
  };

  return [
    {
      key: "pts",
      label: "PTS",
      value: `${team?.points ?? 0}`,
      rank: rankMaps.pts[teamId],
    },
    {
      key: "ptspct",
      label: "PTS%",
      value: getNhlPointsPct(team).toFixed(3).replace(/^0/, ""),
      rank: rankMaps.ptspct[teamId],
    },
    {
      key: "wins",
      label: "W",
      value: `${team?.wins ?? 0}`,
      rank: rankMaps.wins[teamId],
    },
    {
      key: "losses",
      label: "L",
      value: `${team?.losses ?? 0}`,
      rank: rankMaps.losses[teamId],
    },
    {
      key: "otl",
      label: "OTL",
      value: `${team?.otl ?? 0}`,
      rank: rankMaps.otl[teamId],
    },
    {
      key: "gf",
      label: "GF",
      value: `${team?.gf ?? 0}`,
      rank: rankMaps.gf[teamId],
    },
    {
      key: "ga",
      label: "GA",
      value: `${team?.ga ?? 0}`,
      rank: rankMaps.ga[teamId],
    },
    {
      key: "diff",
      label: "DIFF",
      value: `${(team?.gf ?? 0) - (team?.ga ?? 0)}`,
      rank: rankMaps.diff[teamId],
    },
    {
      key: "home",
      label: "HOME",
      value: `${team?.homeWins ?? 0}-${team?.homeLosses ?? 0}-${team?.homeOtl ?? 0}`,
      rank: rankMaps.home[teamId],
    },
    {
      key: "road",
      label: "ROAD",
      value: `${team?.roadWins ?? 0}-${team?.roadLosses ?? 0}-${team?.roadOtl ?? 0}`,
      rank: rankMaps.road[teamId],
    },
    {
      key: "l10",
      label: "L10",
      value: `${team?.l10Wins ?? 0}-${team?.l10Losses ?? 0}-${team?.l10Otl ?? 0}`,
      rank: rankMaps.l10[teamId],
    },
    {
      key: "lgrk",
      label: "RANK",
      value: `${team?.leagueRank ?? "--"}`,
      rank: rankMaps.lgRank[teamId],
    },
  ];
};

const NHLStandingsShareModal = ({
  visible,
  onClose,
  team,
  teams,
  theme,
  colors,
  getTeamLogoUrl,
  isDarkMode,
}) => {
  const cardRef = React.useRef(null);
  const [sharing, setSharing] = useState(false);

  const shareData = useMemo(() => {
    if (!team) return null;
    const standingsLogoUri = getStandingsLogo(team.logo, isDarkMode);
    const cachedLogoUri =
      getTeamLogoUrl && team.abbreviation
        ? getTeamLogoUrl("nhl", team.abbreviation)
        : null;
    const logoUri = standingsLogoUri || cachedLogoUri;
    const teamColor = NHLService.getTeamColor(team, colors.primary);
    const streakValue =
      team?.streakCode && team?.streakCount > 0
        ? `${team.streakCode}${team.streakCount}`
        : team?.streakCode || "--";

    return {
      logoUri,
      teamColor,
      conference: team?.conferenceName || team?.conferenceAbbrev || "NHL",
      topStats: [
        {
          label: "RCRD",
          value: `${team?.wins ?? 0}-${team?.losses ?? 0}-${team?.otl ?? 0}`,
        },
        {
          label: "L10",
          value: `${team?.l10Wins ?? 0}-${team?.l10Losses ?? 0}-${team?.l10Otl ?? 0}`,
        },
        { label: "STRK", value: streakValue },
      ],
      name: `${team?.displayName || "Team"}${team?.clinch ? ` - ${String(team.clinch).toUpperCase()}` : ""}`,
      division: team?.divisionName || "Division",
      statRows: getNhlShareStatRows(team, teams),
    };
  }, [team, teams, colors.primary, getTeamLogoUrl, isDarkMode]);

  if (!team || !shareData) return null;

  const { monthDay, year } = getCurrentDateLines();
  const textOnTeam = getTextOnColor(shareData.teamColor);
  const CARD_SIZE = Math.min(width - 48, 540);
  const streakValue = String(shareData.topStats[2]?.value || "").toUpperCase();

  const handleShare = async () => {
    if (!cardRef.current || sharing) return;
    try {
      setSharing(true);
      await new Promise((res) => setTimeout(res, 280));
      const uri = await cardRef.current.capture();
      await Sharing.shareAsync(uri, { mimeType: "image/png" });
    } catch (e) {
      console.warn("NHL standings share failed", e);
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
                  backgroundColor: `${shareData.teamColor}22`,
                  borderBottomColor: shareData.teamColor,
                },
              ]}
            >
              <View style={nhlShareStyles.headerTopRow}>
                <View
                  style={[
                    nhlShareStyles.posBadge,
                    { backgroundColor: shareData.teamColor },
                  ]}
                >
                  <Text
                    style={[nhlShareStyles.posBadgeText, { color: textOnTeam }]}
                  >
                    {shareData.conference} Conference
                  </Text>
                </View>
                <Text
                  style={{
                    fontWeight: "800",
                    color: theme.text,
                    fontSize: 10,
                  }}
                >
                  STANDINGS SNAPSHOT
                </Text>
              </View>

              <View style={nhlShareStyles.headshotRow}>
                {shareData.logoUri ? (
                  <Image
                    source={{ uri: shareData.logoUri }}
                    style={[
                      nhlShareStyles.cardHeadshot,
                      { borderColor: shareData.teamColor },
                    ]}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <View
                    style={[
                      nhlShareStyles.cardHeadshot,
                      {
                        borderColor: shareData.teamColor,
                        backgroundColor: theme.border,
                        alignItems: "center",
                        justifyContent: "center",
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: theme.textSecondary,
                        fontSize: 11,
                        fontWeight: "800",
                      }}
                    >
                      {String(team?.abbreviation || "NHL")
                        .slice(0, 3)
                        .toUpperCase()}
                    </Text>
                  </View>
                )}

                <View style={nhlShareStyles.nameBlock}>
                  <View style={nhlShareStyles.topStatsRow}>
                    {shareData.topStats.map((item) => {
                      const isStreak = item.label === "STRK";
                      const streakColor =
                        isStreak && streakValue.startsWith("W")
                          ? theme.success
                          : isStreak &&
                              (streakValue.startsWith("L") ||
                                streakValue.startsWith("OT"))
                            ? theme.error
                            : theme.text;
                      return (
                        <View
                          key={`top-${item.label}`}
                          style={nhlShareStyles.topStatCell}
                        >
                          <Text
                            style={[
                              nhlShareStyles.topStatVal,
                              { color: streakColor },
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
                      );
                    })}
                  </View>

                  <View style={nhlShareStyles.nameDateRow}>
                    <View style={nhlShareStyles.nameTeamWrap}>
                      <Text
                        style={[nhlShareStyles.fullName, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {shareData.name}
                      </Text>
                      <Text
                        style={[
                          nhlShareStyles.teamNameLabel,
                          { color: theme.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {shareData.division} Division
                      </Text>
                    </View>
                    <View style={nhlShareStyles.dateWrap}>
                      <Text
                        style={[
                          nhlShareStyles.gameDateLine,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {monthDay}
                      </Text>
                      <Text
                        style={[
                          nhlShareStyles.gameDateLine,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {year}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            <View style={nhlShareStyles.statGrid}>
              {shareData.statRows.slice(0, 12).map((row, i) => (
                <View
                  key={`share-stat-${row.key}-${i}`}
                  style={[
                    nhlShareStyles.statCell,
                    { borderColor: theme.border },
                    i % 3 !== 2 && {
                      borderRightWidth: StyleSheet.hairlineWidth,
                    },
                    i < 9 && { borderBottomWidth: StyleSheet.hairlineWidth },
                  ]}
                >
                  <Text
                    style={[
                      nhlShareStyles.statPct,
                      {
                        color:
                          row.rank <= 3
                            ? theme.success
                            : row.rank >= 28
                              ? theme.error
                              : theme.textSecondary,
                      },
                    ]}
                  >
                    {toOrdinal(row.rank)}
                  </Text>
                  <Text style={[nhlShareStyles.statVal, { color: theme.text }]}>
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
              ))}
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
              { backgroundColor: shareData.teamColor },
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

const TeamRow = ({
  team,
  theme,
  colors,
  isFav,
  onPress,
  onLongPress,
  getTeamLogoUrl,
  isDarkMode,
  rank,
  sortBy,
}) => {
  const runDiff = (team.gf ?? 0) - (team.ga ?? 0);

  const clinchColor =
    team.clinch === "p"
      ? "#7c3aed"
      : team.clinch === "z"
        ? theme.success
        : team.clinch === "y"
          ? theme.warning
          : team.clinch === "x"
            ? theme.info
            : team.clinch === "e"
              ? theme.error
              : null;

  const standingsLogoUri = getStandingsLogo(team.logo, isDarkMode);
  const cachedLogoUri =
    getTeamLogoUrl && team.abbreviation
      ? getTeamLogoUrl("nhl", team.abbreviation)
      : null;
  const logoUri = standingsLogoUri || cachedLogoUri;
  const teamColor = NHLService.getTeamColor(team, colors.primary);
  const sortRecord = getSortRecord(team, sortBy);

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={220}
      activeOpacity={0.7}
      style={[
        styles.teamRow,
        { backgroundColor: theme.surface },
        clinchColor
          ? { borderLeftColor: clinchColor, borderLeftWidth: 3 }
          : null,
      ]}
    >
      <View style={styles.rightGradientOverlay} pointerEvents="none">
        <Svg width="100%" height="100%" pointerEvents="none">
          <Defs>
            <LinearGradient
              id={`nhlStandingsGrad-${team.id || team.abbreviation || "x"}`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <Stop offset="0%" stopColor={teamColor} stopOpacity="0" />
              <Stop offset="100%" stopColor={teamColor} stopOpacity="0.72" />
            </LinearGradient>
          </Defs>
          <Rect
            width="100%"
            height="100%"
            fill={`url(#nhlStandingsGrad-${team.id || team.abbreviation || "x"})`}
          />
        </Svg>
      </View>

      <View style={styles.rankCol}>
        <Text style={[styles.rankText, { color: theme.textSecondary }]}>
          {rank}
        </Text>
      </View>

      {logoUri ? (
        <Image
          cachePolicy="memory-disk"
          source={{ uri: logoUri }}
          style={styles.teamLogo}
          contentFit="contain"
        />
      ) : (
        <View
          style={[
            styles.teamLogoPlaceholder,
            { backgroundColor: theme.border },
          ]}
        >
          <Text
            style={{
              color: theme.textSecondary,
              fontSize: 9,
              fontWeight: "700",
            }}
          >
            {(team.abbreviation || "NHL").slice(0, 3).toUpperCase()}
          </Text>
        </View>
      )}

      <View style={styles.teamInfo}>
        <Text
          style={[
            styles.teamName,
            { color: isFav ? colors.primary : theme.text },
          ]}
          numberOfLines={1}
        >
          {isFav ? "★ " : ""}
          {team.clinch ? `${team.clinch} - ` : ""}
          {team.displayName}
        </Text>

        {sortBy ? (
          <Text
            style={[
              styles.recordText,
              { color: theme.textSecondary, marginTop: 2 },
            ]}
          >
            {sortRecord}
          </Text>
        ) : (
          <>
            <View style={styles.recordRow}>
              <Text style={[styles.recordText, { color: theme.textSecondary }]}>
                {team.wins}-{team.losses}-{team.otl}
              </Text>
              {!!team.streakCode && (
                <Text
                  style={[
                    styles.streakText,
                    {
                      color: team.streakCode.startsWith("W")
                        ? theme.success
                        : team.streakCode.startsWith("L") ||
                            team.streakCode.startsWith("OT")
                          ? theme.error
                          : theme.textSecondary,
                    },
                  ]}
                >
                  {team.streakCode}
                  {team.streakCount > 0 ? team.streakCount : ""}
                </Text>
              )}
            </View>

            <View style={{ flexDirection: "row" }}>
              <Text style={[styles.xrText, { color: theme.textSecondary }]}>
                GF: {team.gf} | GA: {team.ga} |{" "}
              </Text>
              <Text
                style={[
                  styles.xrText,
                  {
                    color:
                      runDiff > 0
                        ? theme.success
                        : runDiff < 0
                          ? theme.error
                          : theme.textSecondary,
                  },
                ]}
              >
                {runDiff > 0 ? `+${runDiff}` : runDiff}
              </Text>
            </View>
          </>
        )}
      </View>

      {!sortBy && (
        <View style={styles.rightCol}>
          <Text style={styles.gbValue}>{team.points}</Text>
          <Text style={styles.gbLabel}>PTS</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const NHLStandingsScreen = () => {
  const navigation = useNavigation();
  const { theme, colors, getTeamLogoUrl, isDarkMode } = useTheme();
  const { isFavorite } = useFavorites();
  const { isPro } = useBetSlip();
  const AD_SPACE = 80;

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [teams, setTeams] = useState([]);
  const [sortBy, setSortBy] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showMode, setShowMode] = useState("division");
  const [shareTeam, setShareTeam] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await NHLService.getStandings();
      const rows = Array.isArray(res?.standings)
        ? res.standings
        : Array.isArray(res)
          ? res
          : Array.isArray(res?.records)
            ? res.records.flatMap((r) => r.teamRecords || [])
            : [];

      if (!rows.length) {
        setMessage("No standings available");
        setTeams([]);
        return;
      }

      setTeams(rows.map(normalizeTeam));
    } catch (e) {
      console.error("NHL Standings error:", e);
      setMessage("Failed to load standings. Please try again.");
      setTeams([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const groupedDivisions = useMemo(() => {
    const map = {};
    teams.forEach((team) => {
      const key = team.divisionName || "NHL";
      if (!map[key]) map[key] = [];
      map[key].push(team);
    });

    const groups = Object.entries(map).map(([name, list]) => {
      const sorted = [...list].sort((a, b) => {
        if (a.divisionRank !== b.divisionRank) {
          return a.divisionRank - b.divisionRank;
        }
        if (b.points !== a.points) return b.points - a.points;
        return b.wins - a.wins;
      });
      return { name, teams: sorted };
    });

    return groups.sort((a, b) => {
      const ka = getDivisionSortKey(a.name);
      const kb = getDivisionSortKey(b.name);
      if (ka !== kb) return ka - kb;
      return a.name.localeCompare(b.name);
    });
  }, [teams]);

  const sortedTeams = useMemo(() => {
    if (!sortBy) return [];
    return [...teams].sort((a, b) => {
      const ap = getSortPoints(a, sortBy);
      const bp = getSortPoints(b, sortBy);
      if (bp !== ap) return bp - ap;
      if (b.points !== a.points) return b.points - a.points;
      return a.leagueRank - b.leagueRank;
    });
  }, [teams, sortBy]);

  const teamsByNhl = useMemo(() => {
    return [...teams].sort((a, b) => {
      if (a.leagueRank !== b.leagueRank) return a.leagueRank - b.leagueRank;
      if (b.points !== a.points) return b.points - a.points;
      return b.wins - a.wins;
    });
  }, [teams]);

  const wildcardByConference = useMemo(() => {
    const conferenceMap = { E: [], W: [] };
    teams.forEach((team) => {
      const key = CONFERENCE_ORDER.includes(team.conferenceAbbrev)
        ? team.conferenceAbbrev
        : "E";
      conferenceMap[key].push(team);
    });

    return CONFERENCE_ORDER.map((confKey) => {
      const confTeams = conferenceMap[confKey] || [];
      const divisionTeams = confTeams.filter(
        (team) => team.wildcardSequence === 0,
      );
      const wildCardTeamsOnly = confTeams.filter(
        (team) => team.wildcardSequence !== 0,
      );

      const divisionMap = {};
      divisionTeams.forEach((team) => {
        const d = team.divisionName || "NHL";
        if (!divisionMap[d]) divisionMap[d] = [];
        divisionMap[d].push(team);
      });

      const divisionGroups = Object.entries(divisionMap)
        .map(([name, list]) => ({
          name,
          teams: [...list].sort((a, b) => {
            if (a.divisionRank !== b.divisionRank) {
              return a.divisionRank - b.divisionRank;
            }
            if (b.points !== a.points) return b.points - a.points;
            return b.wins - a.wins;
          }),
        }))
        .sort((a, b) => {
          const ka = getDivisionSortKey(a.name);
          const kb = getDivisionSortKey(b.name);
          if (ka !== kb) return ka - kb;
          return a.name.localeCompare(b.name);
        });

      const wildcardTeams = [...wildCardTeamsOnly].sort((a, b) => {
        const aWild = a.wildcardSequence;
        const bWild = b.wildcardSequence;

        if (aWild !== bWild) return aWild - bWild;
        if (b.points !== a.points) return b.points - a.points;
        return b.wins - a.wins;
      });

      return {
        conferenceAbbrev: confKey,
        conferenceName: confKey === "E" ? "Eastern" : "Western",
        divisions: divisionGroups,
        wildcardTeams,
      };
    });
  }, [teams]);

  const hasData = !loading && !message && teams.length > 0;

  const renderTeamRow = (team, rankKey, rank, activeSort = sortBy) => {
    const favId = team.id || team.abbreviation;
    return (
      <TeamRow
        key={rankKey}
        team={team}
        theme={theme}
        colors={colors}
        rank={rank}
        sortBy={activeSort}
        isDarkMode={isDarkMode}
        isFav={isFavorite(favId, "nhl")}
        getTeamLogoUrl={getTeamLogoUrl}
        onLongPress={() => setShareTeam(team)}
        onPress={() =>
          navigation.navigate("TeamPage", {
            teamId: team.id || team.abbreviation,
            team: {
              id: team.id || null,
              abbreviation: team.abbreviation || null,
              displayName: team.displayName || null,
            },
            sport: "nhl",
          })
        }
      />
    );
  };

  const renderSortView = () => {
    if (!sortBy) return null;
    return (
      <View style={styles.divisionContainer}>
        <View
          style={[styles.divisionHeader, { backgroundColor: colors.primary }]}
        >
          <Text allowFontScaling={false} style={styles.divisionTitle}>
            {sortBy.label}
          </Text>
        </View>
        {sortedTeams.map((team, i) =>
          renderTeamRow(
            team,
            `sorted-${team.id || team.abbreviation || i}`,
            i + 1,
            sortBy,
          ),
        )}
      </View>
    );
  };

  const renderDivisionView = () => {
    return groupedDivisions.map((group) => (
      <View key={`div-${group.name}`} style={styles.divisionContainer}>
        <View
          style={[styles.divisionHeader, { backgroundColor: colors.primary }]}
        >
          <Text allowFontScaling={false} style={styles.divisionTitle}>
            {group.name} Division
          </Text>
        </View>
        {group.teams.map((team, i) =>
          renderTeamRow(
            team,
            `${group.name}-${team.id || team.abbreviation || i}`,
            i + 1,
            null,
          ),
        )}
      </View>
    ));
  };

  const renderByNhlView = () => {
    return (
      <View style={styles.divisionContainer}>
        <View
          style={[styles.divisionHeader, { backgroundColor: colors.primary }]}
        >
          <Text allowFontScaling={false} style={styles.divisionTitle}>
            NHL
          </Text>
        </View>
        {teamsByNhl.map((team, i) =>
          renderTeamRow(
            team,
            `nhl-${team.id || team.abbreviation || i}`,
            i + 1,
            null,
          ),
        )}
      </View>
    );
  };

  const renderCutoffMarker = (key) => (
    <View key={key} style={styles.cutoffRow}>
      <View style={[styles.cutoffLine, { backgroundColor: theme.error }]} />
      <Text style={[styles.cutoffText, { color: theme.error }]}>CUTOFF</Text>
      <View style={[styles.cutoffLine, { backgroundColor: theme.error }]} />
    </View>
  );

  const renderByWildcardView = () => {
    return wildcardByConference.map((conference) => (
      <View
        key={`wc-${conference.conferenceAbbrev}`}
        style={styles.conferenceContainer}
      >
        <View
          style={[styles.divisionHeader, { backgroundColor: colors.primary }]}
        >
          <Text allowFontScaling={false} style={styles.divisionTitle}>
            {conference.conferenceName} Conference
          </Text>
        </View>

        {conference.divisions.map((division) => (
          <View key={`wc-div-${conference.conferenceAbbrev}-${division.name}`}>
            <View
              style={[
                styles.subHeader,
                { borderColor: theme.border, backgroundColor: theme.surface },
              ]}
            >
              <Text style={[styles.subHeaderText, { color: theme.text }]}>
                {division.name} Division
              </Text>
            </View>
            {division.teams.map((team, idx) =>
              renderTeamRow(
                team,
                `wc-div-row-${conference.conferenceAbbrev}-${division.name}-${team.id || team.abbreviation || idx}`,
                idx + 1,
                null,
              ),
            )}
          </View>
        ))}

        <View
          style={[
            styles.subHeader,
            { borderColor: theme.border, backgroundColor: theme.surface },
          ]}
        >
          <Text style={[styles.subHeaderText, { color: theme.text }]}>
            Wild Card
          </Text>
        </View>

        {conference.wildcardTeams.flatMap((team, idx, arr) => {
          const row = renderTeamRow(
            team,
            `wc-row-${conference.conferenceAbbrev}-${team.id || team.abbreviation || idx}`,
            team.wildcardSequence > 0 ? team.wildcardSequence : idx + 1,
            null,
          );

          const next = arr[idx + 1];
          const thisSeq = team.wildcardSequence;
          const nextSeq = next ? next.wildcardSequence : null;
          const shouldCutoff = thisSeq === 2 && next && nextSeq > 2;

          return shouldCutoff
            ? [
                row,
                renderCutoffMarker(
                  `cutoff-${conference.conferenceAbbrev}-${idx}`,
                ),
              ]
            : [row];
        })}
      </View>
    ));
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.sortByBar,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <Text style={[styles.sortByLabel, { color: theme.text }]}>Sort By</Text>
        <TouchableOpacity
          onPress={() => setDropdownOpen((v) => !v)}
          style={[
            styles.sortByButton,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        >
          <Text
            style={[
              styles.sortByButtonText,
              { color: sortBy ? colors.primary : theme.textSecondary },
            ]}
          >
            {sortBy ? sortBy.label : "Default"}
          </Text>
          <Text
            style={{ color: theme.textSecondary, marginLeft: 4, fontSize: 11 }}
          >
            {dropdownOpen ? "▲" : "▼"}
          </Text>
        </TouchableOpacity>
        {!!sortBy && (
          <TouchableOpacity
            onPress={() => setSortBy(null)}
            style={styles.clearSortBtn}
          >
            <Text
              style={{
                color: theme.error ?? "#e55",
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              ✕ CLEAR
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {dropdownOpen && (
        <View
          style={[
            styles.dropdown,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.dropdownItem,
                sortBy?.key === opt.key && {
                  backgroundColor: colors.primary + "22",
                },
              ]}
              onPress={() => {
                setSortBy(opt);
                setDropdownOpen(false);
              }}
            >
              <Text
                style={[
                  styles.dropdownItemText,
                  {
                    color:
                      sortBy?.key === opt.key ? colors.primary : theme.text,
                  },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {!loading && !!message && (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {message}
          </Text>
          <TouchableOpacity onPress={load} style={{ marginTop: 12 }}>
            <Text style={{ color: colors.primary, fontWeight: "600" }}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {hasData && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 16 }]}
          onScrollBeginDrag={() => dropdownOpen && setDropdownOpen(false)}
        >
          {sortBy
            ? renderSortView()
            : showMode === "wildcard"
              ? renderByWildcardView()
              : showMode === "nhl"
                ? renderByNhlView()
                : renderDivisionView()}

          <View
            style={[styles.legendContainer, { backgroundColor: theme.surface }]}
          >
            <Text
              allowFontScaling={false}
              style={[styles.legendTitle, { color: colors.primary }]}
            >
              Legend
            </Text>
            <View style={styles.legendItems}>
              {[
                {
                  color: "#7c3aed",
                  label: "p - Presidents' Trophy",
                },
                { color: theme.success, label: "z - Conference seed clinched" },
                { color: theme.warning, label: "y - Division clinched" },
                { color: theme.info, label: "x - Playoff berth clinched" },
                { color: theme.error, label: "e - Eliminated" },
              ].map(({ color, label }) => (
                <View key={label} style={styles.legendItem}>
                  <View
                    style={[styles.legendSwatch, { backgroundColor: color }]}
                  />
                  <Text
                    allowFontScaling={false}
                    style={[styles.legendLabel, { color: theme.text }]}
                  >
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {hasData && (
        <View
          style={[
            styles.showBar,
            {
              backgroundColor: theme.surface,
              borderTopColor: theme.border,
              marginBottom: isPro ? 0 : AD_SPACE - 13,
            },
          ]}
        >
          <Text style={[styles.showLabel, { color: theme.textSecondary }]}>
            Show
          </Text>
          {[
            { key: "division", label: "By Division" },
            { key: "wildcard", label: "By Wild Card" },
            { key: "nhl", label: "By NHL" },
          ].map(({ key, label }) => {
            const isActive = showMode === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => {
                  setShowMode(key);
                  setSortBy(null);
                }}
                style={[
                  styles.showButton,
                  isActive
                    ? { backgroundColor: colors.primary }
                    : {
                        backgroundColor: "transparent",
                        borderColor: theme.border,
                        borderWidth: 1,
                      },
                ]}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.showButtonText,
                    { color: isActive ? "#fff" : theme.text },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

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

      <NHLStandingsShareModal
        visible={!!shareTeam}
        onClose={() => setShareTeam(null)}
        team={shareTeam}
        teams={teams}
        theme={theme}
        colors={colors}
        getTeamLogoUrl={getTeamLogoUrl}
        isDarkMode={isDarkMode}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { fontSize: 16, textAlign: "center" },

  sortByBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  sortByLabel: { fontSize: 14, fontWeight: "600" },
  sortByButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  sortByButtonText: { fontSize: 13, fontWeight: "500" },
  clearSortBtn: {
    marginLeft: "auto",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  dropdown: {
    marginHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    zIndex: 10,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  dropdownItemText: { fontSize: 14 },

  scrollContent: { paddingVertical: 8, paddingBottom: 16 },
  divisionContainer: { marginBottom: 16 },
  conferenceContainer: { marginBottom: 16 },
  divisionHeader: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 6,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  divisionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
  },
  subHeader: {
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 8,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  subHeaderText: {
    fontSize: 13,
    fontWeight: "700",
  },

  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingRight: 12,
    paddingLeft: 10,
    marginHorizontal: 12,
    marginBottom: 2,
    borderRadius: 8,
    overflow: "hidden",
  },
  rightGradientOverlay: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "44%",
  },
  rankCol: { width: 22, marginRight: 8, alignItems: "center" },
  rankText: { fontSize: 13, fontWeight: "600" },
  teamLogo: { width: 60, height: 60, marginRight: 10 },
  teamLogoPlaceholder: {
    width: 60,
    height: 60,
    marginRight: 10,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  teamInfo: { flex: 1 },
  teamName: { fontSize: 15, fontWeight: "600" },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  recordText: { fontSize: 12 },
  streakText: { fontSize: 12, fontWeight: "600" },
  xrText: { fontSize: 11, marginTop: 2 },
  rightCol: { alignItems: "flex-end", minWidth: 44 },
  gbValue: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
    color: "#fff",
  },
  gbLabel: {
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 1,
    color: "#fff",
  },

  cutoffRow: {
    marginHorizontal: 12,
    marginVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  cutoffLine: {
    flex: 1,
    height: 2,
  },
  cutoffText: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 1,
    marginHorizontal: 12,
  },

  legendContainer: {
    marginHorizontal: 12,
    marginTop: 12,
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  legendTitle: { fontSize: 14, fontWeight: "700", marginBottom: 8 },
  legendItems: { flexDirection: "column" },
  legendItem: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  legendSwatch: { width: 16, height: 16, borderRadius: 4, marginRight: 8 },
  legendLabel: { fontSize: 12 },

  showBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 6,
  },
  showLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginRight: 2,
  },
  showButton: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 20,
    alignItems: "center",
  },
  showButtonText: {
    fontSize: 11,
    fontWeight: "600",
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

export default NHLStandingsScreen;

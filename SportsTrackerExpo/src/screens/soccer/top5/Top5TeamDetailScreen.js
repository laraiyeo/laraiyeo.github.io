"use strict";
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  RefreshControl,
  Dimensions,
  Modal,
  Pressable,
} from "react-native";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
  Line as SvgLine,
  Circle as SvgCircle,
  Path as SvgPath,
  Text as SvgText,
} from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../../../context/ThemeContext";

const FOOTBALL_BASE = "https://laraiyeogithubio-production-08da.up.railway.app";
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const { width } = Dimensions.get("window");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ordinal(n) {
  if (n == null) return null;
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function getTextOnColor(hex) {
  if (!hex) return "#FFFFFF";
  const c = hex.replace("#", "");
  if (c.length < 6) return "#FFFFFF";
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? "#000000" : "#FFFFFF";
}

function parseHexColor(hex) {
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
}

function areColorsSimilar(colorA, colorB) {
  const a = parseHexColor(colorA);
  const b = parseHexColor(colorB);
  if (!a || !b) return false;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  const distance = Math.sqrt(dr * dr + dg * dg + db * db);
  return distance <= 70;
}

function resolveMatchColors({
  homePrimary,
  homeSecondary,
  awayPrimary,
  awaySecondary,
  homeFallback,
  awayFallback,
}) {
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
}

function parseUtcDate(dateStr) {
  if (!dateStr) return null;
  // "2025-10-19 11:00:00" → treat as UTC
  return new Date(dateStr.replace(" ", "T") + "Z");
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getMatchDateStr(startingAt) {
  const d = parseUtcDate(startingAt);
  if (!d || isNaN(d)) return null;
  return d.toISOString().slice(0, 10);
}

function formatMatchDate(startingAt) {
  const d = parseUtcDate(startingAt);
  if (!d || isNaN(d)) return "--";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatMatchTime(startingAt) {
  const d = parseUtcDate(startingAt);
  if (!d || isNaN(d)) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

function getShortCode(name, shortCode) {
  if (shortCode) return shortCode.toUpperCase();
  const compact = (name ?? "").replace(/\s+/g, "").trim();
  return compact.slice(0, 3).toUpperCase();
}

function capitalizeFirst(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isPlaceholder(uri) {
  return !uri || uri.includes("placeholder");
}

function formatTransferDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatLongDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getAgeFromDob(dateStr) {
  if (!dateStr) return null;
  const dob = new Date(dateStr + "T12:00:00");
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

function extractStatNumber(value) {
  if (typeof value === "number") return value;
  if (!value || typeof value !== "object") return 0;
  if (typeof value.total === "number") return value.total;
  if (typeof value.count === "number") return value.count;
  if (typeof value.all?.count === "number") return value.all.count;
  return 0;
}

function getStatEntry(stats, matcher) {
  return (stats ?? []).find((entry) =>
    matcher((entry.type?.name ?? "").toLowerCase()),
  );
}

function isGoalkeeperProfile(detailedPos, pos) {
  const dp = (detailedPos ?? "").toLowerCase();
  const p = (pos ?? "").toLowerCase();
  return dp.includes("goalkeeper") || p.includes("goalkeeper");
}

function getRosterBucket(detailedPos, pos) {
  const dp = (detailedPos ?? "").toLowerCase();
  const p = (pos ?? "").toLowerCase();
  if (dp.includes("goalkeeper") || p.includes("goalkeeper"))
    return "Goalkeepers";
  if (
    dp.includes("attack") ||
    dp.includes("forward") ||
    dp.includes("wing") ||
    dp.includes("striker") ||
    p.includes("attack")
  )
    return "Attackers";
  if (dp.includes("mid") || p.includes("mid")) return "Midfielders";
  if (
    dp.includes("def") ||
    dp.includes("back") ||
    dp.includes("sweeper") ||
    dp.includes("wingback") ||
    p.includes("def")
  )
    return "Defenders";
  return "Midfielders";
}

function formatAmountGBP(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const n = Number(value);
  const abs = Math.abs(n);
  if (abs >= 1000000) {
    const m = abs / 1000000;
    const shown = Number.isInteger(m) ? `${m}` : m.toFixed(1);
    return `£${shown}M`;
  }
  if (abs >= 1000) {
    const k = abs / 1000;
    const shown = Number.isInteger(k) ? `${k}` : k.toFixed(1);
    return `£${shown}K`;
  }
  return `£${abs.toLocaleString()}`;
}

const DETAILED_POS_MAP = {
  Goalkeeper: "GK",
  "Centre Back": "CB",
  "Left Back": "LB",
  "Right Back": "RB",
  "Left Wing": "LW",
  "Right Wing": "RW",
  Sweeper: "SW",
  "Defensive Midfielder": "DM",
  "Central Midfield": "CM",
  "Central Midfielder": "CM",
  "Left Midfielder": "LM",
  "Right Midfielder": "RM",
  "Attacking Midfielder": "AM",
  "Left Winger": "LW",
  "Right Winger": "RW",
  "Second Striker": "SS",
  "Centre Forward": "CF",
  "Left Wing Forward": "LW",
  "Right Wing Forward": "RW",
  Striker: "ST",
  Defender: "DF",
  Midfielder: "MF",
  Attacker: "FW",
};

function getPosAbbr(name) {
  if (!name) return "--";
  if (DETAILED_POS_MAP[name]) return DETAILED_POS_MAP[name];
  if (name.includes(" ")) {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("");
  }
  return name.slice(0, 2).toUpperCase();
}

const TABS = ["Team", "Matches", "Stats", "Roster", "Transfers", "Info"];

// ─── Match Card ───────────────────────────────────────────────────────────────

const MatchCard = ({ match, idx, leagueName, theme, colors, teamColor }) => {
  const navigation = useNavigation();
  const participants = match.participants ?? [];
  const home =
    participants.find((p) => p.meta?.location === "home") ?? participants[0];
  const away =
    participants.find((p) => p.meta?.location === "away") ?? participants[1];

  const homeScore = (match.scores ?? []).find(
    (s) => s.score?.participant === "home",
  )?.score?.goals;
  const awayScore = (match.scores ?? []).find(
    (s) => s.score?.participant === "away",
  )?.score?.goals;

  const hasScores = homeScore != null && awayScore != null;
  const todayStr = getTodayStr();
  const matchDateStr = getMatchDateStr(match.starting_at) ?? "";
  const isPast = matchDateStr < todayStr;
  const isToday = matchDateStr === todayStr;

  const homeWinner = hasScores && home?.meta?.winner === true;
  const awayWinner = hasScores && away?.meta?.winner === true;
  const { homeColor, awayColor } = resolveMatchColors({
    homePrimary: home?.colorPrimary,
    homeSecondary: home?.colorSecondary,
    awayPrimary: away?.colorPrimary,
    awaySecondary: away?.colorSecondary,
    homeFallback: colors.primary,
    awayFallback: colors.secondary ?? colors.primary,
  });

  const homePos = home?.meta?.position;
  const awayPos = away?.meta?.position;

  const homeShort = home.short_code ?? home.name.slice(0, 3).toUpperCase();
  const awayShort = away.short_code ?? away.name.slice(0, 3).toUpperCase();

  const statusLabel =
    isPast && hasScores
      ? "Final"
      : isPast
        ? "Past"
        : formatMatchTime(match.starting_at);
  const dateLabel = isToday ? "Today" : formatMatchDate(match.starting_at);

  const gradId = `tmg_${idx}`;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.matchCardWrap}
      onPress={() => {
        const fId = match.id;
        const hId = home?.id;
        const aId = away?.id;
        if (!fId || !hId || !aId) return;
        navigation.navigate("Top5GameDetail", {
          fixtureId: fId,
          homeTeamId: hId,
          awayTeamId: aId,
          matchTitle: `${homeShort} vs ${awayShort}`,
        });
      }}
    >
      {leagueName ? (
        <View
          style={[
            styles.matchLeagueBadge,
            {
              backgroundColor: teamColor + "50",
              borderColor: teamColor + "75",
            },
          ]}
        >
          <Text
            style={[styles.matchLeagueText, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {leagueName}
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.matchCard,
          { backgroundColor: theme.surface, marginTop: leagueName ? 10 : 0 },
        ]}
      >
        {/* Gradient backdrop */}
        <Svg
          style={StyleSheet.absoluteFill}
          width="100%"
          height="100%"
          pointerEvents="none"
        >
          <Defs>
            <SvgLinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor={homeColor} stopOpacity="0.08" />
              <Stop offset="40%" stopColor={theme.surface} stopOpacity="0" />
              <Stop offset="60%" stopColor={theme.surface} stopOpacity="0" />
              <Stop offset="100%" stopColor={awayColor} stopOpacity="0.08" />
            </SvgLinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${gradId})`} />
        </Svg>

        <View style={styles.matchCardInner}>
          {/* Date / status column */}
          <View style={styles.matchStatusCol}>
            <Text
              allowFontScaling={false}
              style={[styles.matchDateText, { color: theme.textSecondary }]}
              numberOfLines={2}
            >
              {dateLabel}
            </Text>
            <Text
              allowFontScaling={false}
              style={[
                styles.matchStatusText,
                isToday && !isPast
                  ? { color: colors.primary, fontWeight: "700" }
                  : { color: theme.textTertiary ?? theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {statusLabel}
            </Text>
          </View>

          {/* Teams column */}
          <View style={styles.matchTeamsList}>
            {/* Home */}
            <View style={styles.matchTeamRow}>
              <View style={styles.matchLogoWrap}>
                {home?.image_path ? (
                  <Image
                    source={{ uri: home.image_path }}
                    style={styles.matchTeamLogo}
                    resizeMode="contain"
                  />
                ) : (
                  <View
                    style={[
                      styles.matchTeamLogoFallback,
                      { backgroundColor: homeColor },
                    ]}
                  >
                    <Text style={styles.matchLogoFallbackText}>
                      {(home?.name ?? "H")[0]}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                allowFontScaling={false}
                style={[
                  styles.matchTeamName,
                  {
                    color: homeWinner ? theme.text : theme.textSecondary,
                    fontWeight: homeWinner ? "800" : "400",
                  },
                ]}
                numberOfLines={1}
              >
                {home?.name ?? "Home"}
              </Text>
              {homePos != null && (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.matchRecord,
                    { color: theme.textTertiary ?? theme.textSecondary },
                  ]}
                >
                  {ordinal(homePos)} POS
                </Text>
              )}
              {homeScore != null && (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.matchScoreText,
                    {
                      color: homeWinner ? theme.text : theme.textSecondary,
                      fontWeight: homeWinner ? "800" : "400",
                    },
                  ]}
                >
                  {homeScore}
                </Text>
              )}
            </View>

            {/* Divider */}
            <View
              style={[
                styles.matchTeamDivider,
                { backgroundColor: theme.border },
              ]}
            />

            {/* Away */}
            <View style={styles.matchTeamRow}>
              <View style={styles.matchLogoWrap}>
                {away?.image_path ? (
                  <Image
                    source={{ uri: away.image_path }}
                    style={styles.matchTeamLogo}
                    resizeMode="contain"
                  />
                ) : (
                  <View
                    style={[
                      styles.matchTeamLogoFallback,
                      { backgroundColor: awayColor },
                    ]}
                  >
                    <Text style={styles.matchLogoFallbackText}>
                      {(away?.name ?? "A")[0]}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                allowFontScaling={false}
                style={[
                  styles.matchTeamName,
                  {
                    color: awayWinner ? theme.text : theme.textSecondary,
                    fontWeight: awayWinner ? "800" : "400",
                  },
                ]}
                numberOfLines={1}
              >
                {away?.name ?? "Away"}
              </Text>
              {awayPos != null && (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.matchRecord,
                    { color: theme.textTertiary ?? theme.textSecondary },
                  ]}
                >
                  {ordinal(awayPos)} POS
                </Text>
              )}
              {awayScore != null && (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.matchScoreText,
                    {
                      color: awayWinner ? theme.text : theme.textSecondary,
                      fontWeight: awayWinner ? "800" : "400",
                    },
                  ]}
                >
                  {awayScore}
                </Text>
              )}
            </View>
          </View>

          {/* Chevron */}
          <Text
            style={[
              styles.matchChevron,
              { color: theme.textTertiary ?? theme.textSecondary },
            ]}
          >
            ›
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ─── Matches Section (collapsible) ───────────────────────────────────────────

const MatchesSection = ({
  title,
  matches,
  collapsible,
  defaultExpanded = false,
  leagueNameMap,
  theme,
  colors,
  teamColor,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (matches.length === 0) return null;
  const visibleMatches =
    collapsible && !expanded ? matches.slice(0, 1) : matches;

  return (
    <View style={{ marginBottom: 6 }}>
      <TouchableOpacity
        style={[msStyles.sectionHeader, { backgroundColor: theme.surface }]}
        onPress={collapsible ? () => setExpanded((v) => !v) : undefined}
        activeOpacity={collapsible ? 0.7 : 1}
        disabled={!collapsible}
      >
        <Text
          allowFontScaling={false}
          style={[msStyles.sectionTitle, { color: theme.text }]}
        >
          {title}
        </Text>
        {collapsible && !expanded && matches.length > 1 && (
          <View
            style={[msStyles.countBadge, { backgroundColor: teamColor + "22" }]}
          >
            <Text
              allowFontScaling={false}
              style={[msStyles.countText, { color: theme.textTertiary }]}
            >
              +{matches.length - 1}
            </Text>
          </View>
        )}
        {collapsible && (
          <View
            style={{
              transform: [{ rotate: expanded ? "90deg" : "0deg" }],
              marginLeft: 4,
            }}
          >
            <Text
              style={[msStyles.sectionChevron, { color: theme.textSecondary }]}
            >
              ›
            </Text>
          </View>
        )}
      </TouchableOpacity>
      {visibleMatches.map((match, idx) => (
        <MatchCard
          key={match.id ?? idx}
          match={match}
          idx={idx}
          leagueName={leagueNameMap?.[match.league_id]?.name ?? null}
          theme={theme}
          colors={colors}
          teamColor={teamColor}
        />
      ))}
    </View>
  );
};

const msStyles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginTop: 14,
    marginBottom: 2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  countBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  countText: { fontSize: 11, fontWeight: "700" },
  sectionChevron: { fontSize: 22, lineHeight: 26 },
});

// ─── Best Match ──────────────────────────────────────────────────────────────

function BestMatch({
  pastMatches,
  teamId,
  theme,
  colors,
  isDarkMode,
  teamColor,
  leagueNameMap,
  navigation,
}) {
  const best = useMemo(() => {
    const played = (pastMatches ?? []).filter((m) => {
      const hs = m.scores?.find((s) => s.score?.participant === "home")?.score
        ?.goals;
      const as = m.scores?.find((s) => s.score?.participant === "away")?.score
        ?.goals;
      return hs != null && as != null;
    });

    // Priority 1: highest goal-difference win
    const wins = played.filter((m) => {
      const p = m.participants?.find((p) => p.id === teamId);
      return p?.meta?.winner === true;
    });
    if (wins.length > 0) {
      return wins.reduce((acc, m) => {
        const gd = (loc, match) => {
          const hs =
            match.scores?.find((s) => s.score?.participant === "home")?.score
              ?.goals ?? 0;
          const as =
            match.scores?.find((s) => s.score?.participant === "away")?.score
              ?.goals ?? 0;
          return loc === "home" ? hs - as : as - hs;
        };
        const mLoc = m.participants?.find((p) => p.id === teamId)?.meta
          ?.location;
        const aLoc = acc.participants?.find((p) => p.id === teamId)?.meta
          ?.location;
        return gd(mLoc, m) > gd(aLoc, acc) ? m : acc;
      });
    }

    // Priority 2: highest-scoring game
    if (played.length > 0) {
      return played.reduce((acc, m) => {
        const total = (match) =>
          (match.scores?.find((s) => s.score?.participant === "home")?.score
            ?.goals ?? 0) +
          (match.scores?.find((s) => s.score?.participant === "away")?.score
            ?.goals ?? 0);
        return total(m) > total(acc) ? m : acc;
      });
    }
    return null;
  }, [pastMatches, teamId]);

  if (!best) return null;

  const home = best.participants?.find((p) => p.meta?.location === "home");
  const away = best.participants?.find((p) => p.meta?.location === "away");
  if (!home || !away) return null;

  const homeScore = best.scores?.find((s) => s.score?.participant === "home")
    ?.score?.goals;
  const awayScore = best.scores?.find((s) => s.score?.participant === "away")
    ?.score?.goals;
  const homeWon = home.meta?.winner === true;
  const awayWon = away.meta?.winner === true;
  const { homeColor, awayColor } = resolveMatchColors({
    homePrimary: home.colorPrimary,
    homeSecondary: home.colorSecondary,
    awayPrimary: away.colorPrimary,
    awaySecondary: away.colorSecondary,
    homeFallback: colors.primary,
    awayFallback: colors.secondary ?? colors.primary,
  });
  const leagueEntry = leagueNameMap?.[best.league_id] ?? null;
  const leagueName = leagueEntry?.name ?? null;
  const leagueLogoUri = leagueEntry?.image_path ?? null;

  const homeShort = home.short_code ?? home.name.slice(0, 3).toUpperCase();
  const awayShort = away.short_code ?? away.name.slice(0, 3).toUpperCase();

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() =>
        navigation.navigate("Top5GameDetail", {
          fixtureId: best.id,
          homeTeamId: home.id,
          awayTeamId: away.id,
          matchTitle: `${homeShort} vs ${awayShort}`,
        })
      }
      style={[
        bmStyles.bubble,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      {/* Title row */}
      <View style={bmStyles.titleRow}>
        <Text
          allowFontScaling={false}
          style={[bmStyles.title, { color: theme.text }]}
        >
          Best Match
        </Text>
        {leagueName ? (
          <View style={bmStyles.leagueTagRow}>
            {leagueLogoUri ? (
              <Image
                source={{ uri: leagueLogoUri }}
                style={[
                  bmStyles.leagueLogo,
                  {
                    tintColor:
                      (best.league_id === 8 || best.league_id === 2) && isDarkMode
                        ? theme.text
                        : undefined,
                  },
                ]}
                resizeMode="contain"
              />
            ) : null}
            <Text
              allowFontScaling={false}
              style={[
                bmStyles.leagueTag,
                { color: theme.textTertiary ?? theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {leagueName}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Card — no outer margin/padding so it fills the bubble edge-to-edge */}
      <View
        style={[
          bmStyles.card,
          { backgroundColor: theme.surfaceSecondary ?? theme.background },
        ]}
      >
        {/* Gradient */}
        <Svg
          style={StyleSheet.absoluteFill}
          width="100%"
          height="100%"
          pointerEvents="none"
        >
          <Defs>
            <SvgLinearGradient id="bm_grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor={homeColor} stopOpacity="0.35" />
              <Stop offset="35%" stopColor={homeColor} stopOpacity="0" />
              <Stop offset="65%" stopColor={awayColor} stopOpacity="0" />
              <Stop offset="100%" stopColor={awayColor} stopOpacity="0.35" />
            </SvgLinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#bm_grad)" />
        </Svg>

        <View style={bmStyles.cardInner}>
          {/* Home side */}
          <View style={bmStyles.teamSide}>
            {home.image_path ? (
              <Image
                source={{ uri: home.image_path }}
                style={bmStyles.teamLogo}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  bmStyles.teamLogo,
                  bmStyles.logoFallback,
                  { backgroundColor: homeColor + "40" },
                ]}
              >
                <Text style={{ fontSize: 13, color: theme.text }}>
                  {(home.name ?? "?")[0]}
                </Text>
              </View>
            )}
            <Text
              allowFontScaling={false}
              style={[
                bmStyles.teamName,
                {
                  color: homeWon ? theme.text : theme.textSecondary,
                  fontWeight: homeWon ? "700" : "500",
                },
              ]}
              numberOfLines={2}
            >
              {home.name}
            </Text>
          </View>

          {/* Score block */}
          <View style={bmStyles.scoreBlock}>
            <Text
              allowFontScaling={false}
              style={[
                bmStyles.dateText,
                { color: theme.textTertiary ?? theme.textSecondary },
              ]}
            >
              {formatMatchDate(best.starting_at)}
            </Text>
            <View style={bmStyles.scoreRow}>
              <Text
                allowFontScaling={false}
                style={[
                  bmStyles.score,
                  {
                    color: homeWon ? theme.text : theme.textSecondary,
                    fontWeight: homeWon ? "800" : "500",
                  },
                ]}
              >
                {homeScore}
              </Text>
              <Text
                allowFontScaling={false}
                style={[
                  bmStyles.scoreDash,
                  { color: theme.textTertiary ?? theme.textSecondary },
                ]}
              >
                -
              </Text>
              <Text
                allowFontScaling={false}
                style={[
                  bmStyles.score,
                  {
                    color: awayWon ? theme.text : theme.textSecondary,
                    fontWeight: awayWon ? "800" : "500",
                  },
                ]}
              >
                {awayScore}
              </Text>
            </View>
            <Text
              allowFontScaling={false}
              style={[
                bmStyles.finalLabel,
                { color: theme.textTertiary ?? theme.textSecondary },
              ]}
            >
              Final
            </Text>
          </View>

          {/* Away side */}
          <View style={bmStyles.teamSideAway}>
            <Text
              allowFontScaling={false}
              style={[
                bmStyles.teamName,
                bmStyles.teamNameAway,
                {
                  color: awayWon ? theme.text : theme.textSecondary,
                  fontWeight: awayWon ? "700" : "500",
                },
              ]}
              numberOfLines={2}
            >
              {away.name}
            </Text>
            {away.image_path ? (
              <Image
                source={{ uri: away.image_path }}
                style={bmStyles.teamLogo}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  bmStyles.teamLogo,
                  bmStyles.logoFallback,
                  { backgroundColor: awayColor + "40" },
                ]}
              >
                <Text style={{ fontSize: 13, color: theme.text }}>
                  {(away.name ?? "?")[0]}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const bmStyles = StyleSheet.create({
  bubble: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  leagueTagRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  leagueLogo: { width: 16, height: 16 },
  leagueTag: { fontSize: 11, fontWeight: "600" },
  card: { overflow: "hidden" },
  cardInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  teamSide: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  teamSideAway: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  teamLogo: { width: 36, height: 36 },
  logoFallback: {
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  teamName: { flex: 1, fontSize: 13, fontWeight: "500", flexWrap: "wrap" },
  teamNameAway: { textAlign: "right" },
  scoreBlock: { alignItems: "center", paddingHorizontal: 8, minWidth: 80 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  score: { fontSize: 22, minWidth: 24, textAlign: "center" },
  scoreDash: { fontSize: 18 },
  dateText: { fontSize: 10, marginBottom: 4 },
  finalLabel: { fontSize: 10, marginTop: 4 },
});

// ─── Standings Tracker ────────────────────────────────────────────────────────

const ST_CHART_H = 180;
const ST_PAD = { top: 28, bottom: 30, left: 28, right: 10 };

function StandingsTracker({
  teamData,
  teamId,
  theme,
  colors,
  teamColor,
  leagueNameMap,
}) {
  const roundPoints = useMemo(() => {
    const points = [];
    const today = new Date();
    for (const sched of teamData?.schedule ?? []) {
      for (const round of sched.rounds ?? []) {
        const played = (round.fixtures ?? []).filter((f) => {
          const d = parseUtcDate(f.starting_at);
          return (
            d &&
            d <= today &&
            f.participants?.some(
              (p) => p.id === teamId && p.meta?.position != null,
            )
          );
        });
        if (played.length === 0) continue;
        let position = null;
        const fixtures = [];
        for (const f of played) {
          const p = f.participants?.find((p) => p.id === teamId);
          if (p?.meta?.position != null) {
            if (position === null) position = p.meta.position;
            fixtures.push({ ...f, league_id: sched.league_id });
          }
        }
        if (position === null) continue;
        const dates = fixtures
          .map((f) => parseUtcDate(f.starting_at))
          .filter(Boolean)
          .sort((a, b) => a - b);
        points.push({
          roundName: round.name,
          position,
          fixtures,
          firstDate: dates[0] ?? null,
          lastDate: dates[dates.length - 1] ?? null,
        });
      }
    }
    points.sort((a, b) => (a.firstDate ?? 0) - (b.firstDate ?? 0));
    return points;
  }, [teamData, teamId]);

  const n = roundPoints.length;
  const [selectedIdx, setSelectedIdx] = useState(0);
  useEffect(() => {
    if (n > 0) setSelectedIdx(n - 1);
  }, [n]);

  const selected = roundPoints[selectedIdx] ?? null;
  const [chartW, setChartW] = useState(300);
  const innerW = Math.max(chartW - ST_PAD.left - ST_PAD.right, 1);
  const innerH = ST_CHART_H - ST_PAD.top - ST_PAD.bottom;
  const maxPos =
    n > 0 ? Math.max(...roundPoints.map((p) => p.position), 5) : 10;

  const xFor = (i) =>
    ST_PAD.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2);
  const yFor = (pos) =>
    ST_PAD.top + ((pos - 1) / Math.max(maxPos - 1, 1)) * innerH;

  const gridPositions = useMemo(() => {
    const step = maxPos <= 6 ? 1 : maxPos <= 12 ? 2 : maxPos <= 20 ? 5 : 10;
    const arr = [];
    for (let p = 1; p <= maxPos; p += step) arr.push(p);
    // Only add maxPos if it's not too close to the previous label
    const last = arr[arr.length - 1];
    if (last !== maxPos && maxPos - last > step * 0.5) arr.push(maxPos);
    return arr;
  }, [maxPos]);

  const xLabelStep = n <= 10 ? 1 : n <= 20 ? 2 : n <= 30 ? 3 : 5;

  const linePath =
    n > 0
      ? roundPoints
          .map(
            (pt, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(pt.position)}`,
          )
          .join(" ")
      : "";
  const fillPath =
    n > 1
      ? `${linePath} L${xFor(n - 1)},${ST_CHART_H - ST_PAD.bottom} L${xFor(0)},${ST_CHART_H - ST_PAD.bottom}Z`
      : null;

  const dateText = selected?.firstDate
    ? selected.firstDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "2-digit",
        timeZone: "UTC",
      }) +
      (selected.lastDate &&
      selected.lastDate.toDateString() !== selected.firstDate.toDateString()
        ? " – " +
          selected.lastDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "2-digit",
            timeZone: "UTC",
          })
        : "")
    : "";

  const gradFillId = `stFill_${teamId}`;
  const selCy = selected ? yFor(selected.position) : 0;
  const badgeCy = Math.max(selCy - 15, 14);

  if (n === 0) return null;

  return (
    <View
      style={[
        sdStyles.container,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      {/* Title */}
      <View style={sdStyles.titleRow}>
        <Text
          allowFontScaling={false}
          style={[sdStyles.title, { color: theme.text }]}
          numberOfLines={1}
        >
          {"Standings Tracker" +
            (Object.values(leagueNameMap)[0]
              ? " · " + Object.values(leagueNameMap)[0].name.toUpperCase()
              : "")}
        </Text>
      </View>

      {/* Chart */}
      <View
        onLayout={(e) => setChartW(e.nativeEvent.layout.width)}
        style={{ height: ST_CHART_H, marginHorizontal: 4 }}
      >
        {chartW > 0 && n > 0 && (
          <Svg width={chartW} height={ST_CHART_H}>
            <Defs>
              <SvgLinearGradient id={gradFillId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={teamColor} stopOpacity="0.25" />
                <Stop offset="100%" stopColor={teamColor} stopOpacity="0.02" />
              </SvgLinearGradient>
            </Defs>

            {/* Axis lines */}
            <SvgLine
              x1={ST_PAD.left}
              y1={ST_PAD.top - 4}
              x2={ST_PAD.left}
              y2={ST_CHART_H - ST_PAD.bottom}
              stroke={theme.border}
              strokeWidth={1}
            />
            <SvgLine
              x1={ST_PAD.left}
              y1={ST_CHART_H - ST_PAD.bottom}
              x2={chartW - ST_PAD.right}
              y2={ST_CHART_H - ST_PAD.bottom}
              stroke={theme.border}
              strokeWidth={1}
            />

            {/* Horizontal grid lines + y labels */}
            {gridPositions.map((pos) => (
              <React.Fragment key={`yg${pos}`}>
                <SvgLine
                  x1={ST_PAD.left}
                  y1={yFor(pos)}
                  x2={chartW - ST_PAD.right}
                  y2={yFor(pos)}
                  stroke={theme.border}
                  strokeWidth={0.7}
                  strokeDasharray="3,4"
                />
                <SvgText
                  x={ST_PAD.left - 4}
                  y={yFor(pos) + 4}
                  textAnchor="end"
                  fontSize={9}
                  fill={theme.textTertiary ?? theme.textSecondary}
                >
                  {pos}
                </SvgText>
              </React.Fragment>
            ))}

            {/* Fill under line */}
            {fillPath && <SvgPath d={fillPath} fill={`url(#${gradFillId})`} />}

            {/* Main line */}
            {linePath ? (
              <SvgPath
                d={linePath}
                fill="none"
                stroke={teamColor}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}

            {/* Selected vertical indicator */}
            {selected && (
              <SvgLine
                x1={xFor(selectedIdx)}
                y1={ST_PAD.top - 4}
                x2={xFor(selectedIdx)}
                y2={ST_CHART_H - ST_PAD.bottom}
                stroke={teamColor}
                strokeWidth={1.5}
                strokeOpacity={0.55}
              />
            )}

            {/* Data point circles */}
            {roundPoints.map((pt, i) => {
              const isSel = i === selectedIdx;
              return (
                <SvgCircle
                  key={i}
                  cx={xFor(i)}
                  cy={yFor(pt.position)}
                  r={isSel ? 9 : 6}
                  fill={isSel ? teamColor : theme.surface}
                  stroke={teamColor}
                  strokeWidth={isSel ? 0 : 1.5}
                  onPress={() => setSelectedIdx(i)}
                />
              );
            })}

            {/* Position badge above selected point */}
            {selected && (
              <React.Fragment>
                <SvgCircle
                  cx={xFor(selectedIdx)}
                  cy={badgeCy}
                  r={10}
                  fill={teamColor}
                />
                <SvgText
                  x={xFor(selectedIdx)}
                  y={badgeCy + 4}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight="700"
                  fill={getTextOnColor(teamColor)}
                >
                  {selected.position}
                </SvgText>
              </React.Fragment>
            )}

            {/* X-axis labels */}
            {roundPoints.map((pt, i) => {
              const isFirst = i === 0;
              const isLast = i === n - 1;
              const isStep = i % xLabelStep === 0;
              // Skip a step-aligned label if it would crowd the last label
              const tooCloseToEnd = !isLast && n - 1 - i < xLabelStep;
              const showLabel = isFirst || isLast || (isStep && !tooCloseToEnd);
              if (!showLabel) return null;
              return (
                <SvgText
                  key={`xl${i}`}
                  x={xFor(i)}
                  y={ST_CHART_H - ST_PAD.bottom + 14}
                  textAnchor={
                    i === 0 ? "start" : i === n - 1 ? "end" : "middle"
                  }
                  fontSize={9}
                  fill={
                    i === selectedIdx
                      ? teamColor
                      : (theme.textTertiary ?? theme.textSecondary)
                  }
                  fontWeight={i === selectedIdx ? "700" : "400"}
                >
                  {pt.roundName}
                </SvgText>
              );
            })}
          </Svg>
        )}
      </View>

      {/* Navigation row */}
      <View style={[sdStyles.navRow, { borderTopColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => setSelectedIdx((v) => Math.max(0, v - 1))}
          disabled={selectedIdx === 0}
          style={sdStyles.navArrowBtn}
          activeOpacity={0.6}
        >
          <Text
            style={[
              sdStyles.navArrowText,
              { color: selectedIdx === 0 ? theme.border : theme.text },
            ]}
          >
            ‹
          </Text>
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: "center" }}>
          <View
            style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}
          >
            <Text
              allowFontScaling={false}
              style={[sdStyles.navRoundNum, { color: theme.text }]}
            >
              {selected?.roundName ?? "--"}
            </Text>
            <Text
              allowFontScaling={false}
              style={[sdStyles.navRoundLabel, { color: theme.textSecondary }]}
            >
              Round
            </Text>
          </View>
          {dateText ? (
            <Text
              allowFontScaling={false}
              style={[
                sdStyles.navDateText,
                { color: theme.textTertiary ?? theme.textSecondary },
              ]}
            >
              ({dateText})
            </Text>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={() => setSelectedIdx((v) => Math.min(n - 1, v + 1))}
          disabled={selectedIdx === n - 1}
          style={sdStyles.navArrowBtn}
          activeOpacity={0.6}
        >
          <Text
            style={[
              sdStyles.navArrowText,
              { color: selectedIdx === n - 1 ? theme.border : theme.text },
            ]}
          >
            ›
          </Text>
        </TouchableOpacity>
      </View>

      {/* Selected round match cards */}
      {selected?.fixtures.map((match, idx) => (
        <MatchCard
          key={match.id ?? idx}
          match={match}
          idx={idx}
          leagueName={leagueNameMap?.[match.league_id]?.name ?? null}
          theme={theme}
          colors={colors}
          teamColor={teamColor}
        />
      ))}
      <View style={{ height: 14 }} />
    </View>
  );
}

const sdStyles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  titleRow: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  navArrowBtn: {
    width: 64,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  navArrowText: { fontSize: 40, lineHeight: 48 },
  navRoundNum: { fontSize: 24, fontWeight: "800" },
  navRoundLabel: { fontSize: 13, fontWeight: "500" },
  navDateText: { fontSize: 11, marginTop: 2 },
});

// ─── UEFA Ranking ─────────────────────────────────────────────────────────────

const UEFA_LOGO = require("../../../../assets/UEFA_full_logo (1).png");

function UEFARanking({ teamInfo, theme, colors }) {
  const uefaRanking = teamInfo?.rankings?.find((r) => r.type === "UEFA");
  if (!uefaRanking) return null;

  return (
    <View
      style={[
        urStyles.bubble,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={urStyles.row}>
        <Image source={UEFA_LOGO} style={urStyles.logo} resizeMode="contain" />
        <View style={urStyles.labelBlock}>
          <Text style={[urStyles.labelLine, { color: theme.text }]}>UEFA</Text>
          <Text style={[urStyles.labelLine, { color: theme.text }]}>
            Ranking
          </Text>
        </View>
        <View style={urStyles.statsRow}>
          <View style={urStyles.statBlock}>
            <Text style={[urStyles.statValue, { color: theme.text }]}>
              {uefaRanking.position}
            </Text>
            <Text
              style={[
                urStyles.statLabel,
                { color: theme.textTertiary ?? theme.textSecondary },
              ]}
            >
              POS
            </Text>
          </View>
          <View style={urStyles.statBlock}>
            <Text style={[urStyles.statValue, { color: theme.text }]}>
              {uefaRanking.points.toLocaleString()}
            </Text>
            <Text
              style={[
                urStyles.statLabel,
                { color: theme.textTertiary ?? theme.textSecondary },
              ]}
            >
              PTS
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const urStyles = StyleSheet.create({
  bubble: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    width: 64,
    height: 42,
  },
  labelBlock: {
    flex: 1,
    marginLeft: 14,
  },
  labelLine: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  statsRow: {
    flexDirection: "row",
    gap: 20,
  },
  statBlock: {
    alignItems: "center",
    minWidth: 48,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginTop: 2,
  },
});

function RivalsSection({ teamInfo, theme, navigation }) {
  const rivals = teamInfo?.rivals ?? [];
  if (rivals.length === 0) return null;

  return (
    <View
      style={[
        infoStyles.bubble,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <Text style={[infoStyles.title, { color: theme.text }]}>Rivals</Text>
      {rivals.map((rival, idx) => (
        <TouchableOpacity
          key={`${rival.id ?? rival.name}_${idx}`}
          style={[
            infoStyles.row,
            idx > 0 && {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.border,
            },
          ]}
          onPress={() =>
            rival.id != null && navigation
              ? navigation.navigate("Top5TeamDetail", {
                  teamId: rival.id,
                  teamName: rival.name,
                })
              : undefined
          }
          activeOpacity={rival.id != null && navigation ? 0.7 : 1}
        >
          {rival.image_path ? (
            <Image
              source={{ uri: rival.image_path }}
              style={infoStyles.logo}
              resizeMode="contain"
            />
          ) : (
            <View
              style={[
                infoStyles.logo,
                infoStyles.logoFallback,
                { backgroundColor: theme.surfaceSecondary ?? theme.background },
              ]}
            >
              <Text style={[infoStyles.fallbackInitial, { color: theme.text }]}>
                {(rival.name ?? "?")[0]}
              </Text>
            </View>
          )}
          <View style={infoStyles.textBlock}>
            <Text
              style={[infoStyles.mainText, { color: theme.text }]}
              numberOfLines={1}
            >
              {rival.name ?? "Unknown"}
            </Text>
            <Text
              style={[
                infoStyles.subText,
                { color: theme.textTertiary ?? theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {getShortCode(rival.name, rival.short_code)}
            </Text>
          </View>
          <View style={infoStyles.colorDots}>
            {rival.colorPrimary ? (
              <View
                style={[
                  infoStyles.colorDot,
                  {
                    backgroundColor: rival.colorPrimary,
                    borderColor: theme.border,
                  },
                ]}
              />
            ) : null}
            {rival.colorSecondary ? (
              <View
                style={[
                  infoStyles.colorDot,
                  {
                    backgroundColor: rival.colorSecondary,
                    borderColor: theme.border,
                  },
                ]}
              />
            ) : null}
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function CurrentSeasonsSection({ teamInfo, theme, isDarkMode, navigation }) {
  const activeSeasons = teamInfo?.activeseasons ?? [];
  if (activeSeasons.length === 0) return null;

  const seasonText =
    activeSeasons.length === 1 ? "Current Season" : "Current Seasons";

  return (
    <View
      style={[
        infoStyles.bubble,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <Text style={[infoStyles.title, { color: theme.text }]}>
        {seasonText}
      </Text>
      {activeSeasons.map((season, idx) => (
        <TouchableOpacity
          key={`${season.id ?? season.name}_${idx}`}
          style={[
            infoStyles.row,
            idx > 0 && {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.border,
            },
          ]}
          onPress={() =>
            season.league_id != null && navigation
              ? navigation.navigate("Top5LeagueDetail", {
                  leagueId: season.league_id,
                  leagueName: season.league?.name ?? "League",
                })
              : undefined
          }
          activeOpacity={season.league_id != null && navigation ? 0.7 : 1}
        >
          {season.league?.image_path ? (
            <Image
              source={{ uri: season.league.image_path }}
              style={[
                infoStyles.logo,
                {
                  tintColor:
                    (season.league_id === 8 || season.league_id === 2) && isDarkMode
                      ? theme.text
                      : undefined,
                },
              ]}
              resizeMode="contain"
            />
          ) : (
            <View
              style={[
                infoStyles.logo,
                infoStyles.logoFallback,
                { backgroundColor: theme.surfaceSecondary ?? theme.background },
              ]}
            >
              <Text style={[infoStyles.fallbackInitial, { color: theme.text }]}>
                L
              </Text>
            </View>
          )}
          <View style={infoStyles.textBlock}>
            <Text
              style={[infoStyles.mainText, { color: theme.text }]}
              numberOfLines={1}
            >
              {season.league?.name ?? "League"}
            </Text>
            <Text
              style={[
                infoStyles.subText,
                { color: theme.textTertiary ?? theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {season.name ?? "-"}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function VenueSection({ teamInfo, theme }) {
  const venue = teamInfo?.venue;
  if (!venue) return null;

  return (
    <View
      style={[
        infoStyles.bubble,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <Text style={[infoStyles.title, { color: theme.text }]}>Venue</Text>
      <View style={infoStyles.venueRow}>
        {venue.image_path ? (
          <Image
            source={{ uri: venue.image_path }}
            style={infoStyles.venueImage}
            resizeMode="cover"
          />
        ) : (
          <View
            style={[
              infoStyles.venueImage,
              infoStyles.logoFallback,
              { backgroundColor: theme.surfaceSecondary ?? theme.background },
            ]}
          >
            <Text style={[infoStyles.fallbackInitial, { color: theme.text }]}>
              V
            </Text>
          </View>
        )}

        <View style={infoStyles.venueTextBlock}>
          <Text
            style={[infoStyles.mainText, { color: theme.text }]}
            numberOfLines={2}
          >
            {venue.name ?? "Unknown Venue"}
          </Text>
          <Text
            style={[
              infoStyles.subText,
              { color: theme.textTertiary ?? theme.textSecondary },
            ]}
            numberOfLines={3}
          >
            {venue.address ?? "Address not available"}
          </Text>
          <Text
            style={[
              infoStyles.subText,
              { color: theme.textTertiary ?? theme.textSecondary },
            ]}
            numberOfLines={1}
          >
            {`Capacity: ${venue.capacity != null ? venue.capacity.toLocaleString() : "-"}`}
          </Text>
          <Text
            style={[
              infoStyles.subText,
              { color: theme.textTertiary ?? theme.textSecondary },
            ]}
            numberOfLines={1}
          >
            {`Surface: ${capitalizeFirst(venue.surface) || "-"}`}
          </Text>
        </View>
      </View>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  bubble: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 10,
  },
  logo: {
    width: 36,
    height: 36,
  },
  logoFallback: {
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackInitial: {
    fontSize: 14,
    fontWeight: "700",
  },
  textBlock: {
    flex: 1,
  },
  mainText: {
    fontSize: 14,
    fontWeight: "700",
  },
  subText: {
    fontSize: 12,
    marginTop: 2,
  },
  venueRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
  },
  venueImage: {
    width: 120,
    height: 86,
    borderRadius: 10,
  },
  venueTextBlock: {
    flex: 1,
  },
  colorDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 8,
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 0.5,
  },
});

function TransferTeamBubble({ team, label, theme, navigation, onClose }) {
  const color = team?.colorPrimary ?? theme.border;
  const logoUri = team?.image_path;
  const showLogo = logoUri && !isPlaceholder(logoUri);
  const teamName = team?.name ?? "Unknown Team";
  const canNavigate = team?.id != null;

  const inner = (
    <View
      style={[
        trStyles.modalTeamBubble,
        {
          backgroundColor: theme.card ?? theme.surface,
          borderColor: theme.border,
        },
      ]}
    >
      <Text style={[trStyles.modalTeamLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
      <View style={trStyles.modalTeamRow}>
        <View
          style={[trStyles.modalTeamLogo, { backgroundColor: color + "22" }]}
        >
          {showLogo ? (
            <Image
              source={{ uri: logoUri }}
              style={{ width: 36, height: 36 }}
              resizeMode="contain"
            />
          ) : (
            <Text style={[trStyles.modalTeamLogoInitial, { color: color }]}>
              {teamName[0]}
            </Text>
          )}
        </View>
        <Text
          style={[trStyles.modalTeamName, { color: theme.text }]}
          numberOfLines={2}
        >
          {teamName}
        </Text>
        {canNavigate && (
          <Text
            style={[trStyles.modalTeamArrow, { color: theme.textSecondary }]}
          >
            ›
          </Text>
        )}
      </View>
    </View>
  );

  if (!canNavigate) return inner;
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => {
        onClose();
        navigation.navigate("Top5TeamDetail", {
          teamId: team.id,
          teamName: team.name,
        });
      }}
    >
      {inner}
    </TouchableOpacity>
  );
}

function TransferDetailModal({
  transfer,
  theme,
  teamColor,
  navigation,
  onClose,
}) {
  const playerName = transfer.player?.name ?? "Unknown Player";
  const playerUri = transfer.player?.image_path;
  const showPlayerImage = playerUri && !isPlaceholder(playerUri);
  const initials = playerName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  const posName = transfer.detailedposition?.name ?? null;
  const posAbbr = getPosAbbr(posName);
  const accentColor =
    transfer.fromteam?.colorPrimary ?? teamColor ?? theme.border;
  const amountText = formatAmountGBP(transfer.amount);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={trStyles.modalOverlay} onPress={onClose}>
        <Pressable
          style={[
            trStyles.modalSheet,
            { backgroundColor: theme.background ?? theme.surface },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <View
            style={[trStyles.modalHandle, { backgroundColor: theme.border }]}
          />

          {/* Type + date */}
          <View style={trStyles.modalMeta}>
            <Text style={[trStyles.modalType, { color: theme.textSecondary }]}>
              {transfer.type?.name ?? "Transfer"}
            </Text>
            <Text style={[trStyles.modalDate, { color: theme.textSecondary }]}>
              {formatTransferDate(transfer.date)}
            </Text>
          </View>

          {/* Player section */}
          <Text
            style={[trStyles.modalSectionLabel, { color: theme.textSecondary }]}
          >
            PLAYER
          </Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              const pid = transfer.player?.id ?? transfer.player_id;
              if (pid != null) {
                onClose?.();
                navigation?.navigate("Top5PlayerDetail", {
                  playerId: pid,
                  playerName,
                });
              }
            }}
          >
            <View
              style={[
                trStyles.modalPlayerCard,
                {
                  backgroundColor: theme.card ?? theme.surface,
                  borderColor: theme.border,
                },
              ]}
            >
              <View
                style={[
                  trStyles.modalHeadshotWrap,
                  { backgroundColor: accentColor + "25" },
                ]}
              >
                {showPlayerImage ? (
                  <Image
                    source={{ uri: playerUri }}
                    style={trStyles.modalHeadshot}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={[trStyles.modalInitials, { color: theme.text }]}>
                    {initials || "?"}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[trStyles.modalPlayerName, { color: theme.text }]}
                  numberOfLines={2}
                >
                  {playerName}
                </Text>
                {posName ? (
                  <Text
                    style={[
                      trStyles.modalPlayerPos,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {posName}
                  </Text>
                ) : null}
              </View>
              {posAbbr !== "--" ? (
                <View
                  style={[
                    trStyles.modalPosBadge,
                    { backgroundColor: accentColor },
                  ]}
                >
                  <Text
                    style={[
                      trStyles.modalPosBadgeText,
                      { color: getTextOnColor(accentColor) },
                    ]}
                  >
                    {posAbbr}
                  </Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>

          {/* Teams section */}
          <Text
            style={[trStyles.modalSectionLabel, { color: theme.textSecondary }]}
          >
            CLUBS
          </Text>
          <TransferTeamBubble
            team={transfer.fromteam}
            label="From"
            theme={theme}
            navigation={navigation}
            onClose={onClose}
          />
          <TransferTeamBubble
            team={transfer.toteam}
            label="To"
            theme={theme}
            navigation={navigation}
            onClose={onClose}
          />

          {amountText ? (
            <Text
              style={[trStyles.modalAmount, { color: theme.textSecondary }]}
            >
              Fee: {amountText}
            </Text>
          ) : null}

          {/* Close button */}
          <TouchableOpacity
            style={[trStyles.modalCloseBtn, { backgroundColor: theme.border }]}
            onPress={onClose}
            activeOpacity={0.75}
          >
            <Text style={[trStyles.modalCloseBtnText, { color: theme.text }]}>
              Close
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TransferCard({ transfer, mode, theme, teamColor, navigation }) {
  const [modalOpen, setModalOpen] = useState(false);
  const isIn = mode === "in";
  const sideLabel = isIn ? "From" : "To";
  const sideTeam = isIn ? transfer.fromteam : transfer.toteam;
  const sideColor = sideTeam?.colorPrimary ?? theme.border;
  const playerName = transfer.player?.name ?? "Unknown Player";
  const playerUri = transfer.player?.image_path;
  const showPlayerImage = !isPlaceholder(playerUri);
  const initials = (playerName ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  const posAbbr = getPosAbbr(transfer.detailedposition?.name);
  const amountText = formatAmountGBP(transfer.amount);

  return (
    <>
      <TouchableOpacity activeOpacity={0.8} onPress={() => setModalOpen(true)}>
        <View
          style={[
            trStyles.card,
            {
              backgroundColor: theme.surface,
              borderColor: sideColor,
            },
          ]}
        >
          <View style={trStyles.metaRow}>
            <Text
              style={[trStyles.typeText, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {transfer.type?.name ?? "Transfer"}
            </Text>
            <Text
              style={[
                trStyles.dateText,
                { color: theme.textTertiary ?? theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {formatTransferDate(transfer.date)}
            </Text>
          </View>

          <View style={trStyles.playerBlock}>
            <View
              style={[
                trStyles.headshotWrap,
                { backgroundColor: (teamColor ?? "#888") + "25" },
              ]}
            >
              {showPlayerImage ? (
                <Image
                  source={{ uri: playerUri }}
                  style={trStyles.headshot}
                  resizeMode="cover"
                />
              ) : (
                <View style={trStyles.headshotFallback}>
                  <Text style={[trStyles.initials, { color: theme.text }]}>
                    {initials || "?"}
                  </Text>
                </View>
              )}
              {posAbbr !== "--" ? (
                <View
                  style={[trStyles.posBadge, { backgroundColor: sideColor }]}
                >
                  <Text
                    style={[
                      trStyles.posBadgeText,
                      { color: getTextOnColor(sideColor) },
                    ]}
                  >
                    {posAbbr}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              style={[trStyles.playerName, { color: theme.text }]}
              numberOfLines={2}
            >
              {playerName}
            </Text>
          </View>

          <View style={trStyles.teamRow}>
            <Text style={[trStyles.teamLabel, { color: theme.textSecondary }]}>
              {sideLabel}
            </Text>
            {sideTeam?.image_path ? (
              <Image
                source={{ uri: sideTeam.image_path }}
                style={trStyles.teamLogo}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  trStyles.teamLogo,
                  trStyles.teamLogoFallback,
                  { backgroundColor: (sideColor ?? "#888") + "30" },
                ]}
              >
                <Text
                  style={[
                    trStyles.teamFallbackText,
                    { color: sideColor ?? theme.text },
                  ]}
                >
                  {(sideTeam?.name ?? "?")[0]}
                </Text>
              </View>
            )}
            <Text
              style={[trStyles.teamName, { color: theme.text }]}
              numberOfLines={1}
            >
              {sideTeam?.name ?? "Unknown Team"}
            </Text>
          </View>

          {amountText ? (
            <Text style={[trStyles.amountText, { color: theme.textSecondary }]}>
              {`Amount (${amountText})`}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>

      {modalOpen && (
        <TransferDetailModal
          transfer={transfer}
          theme={theme}
          teamColor={teamColor}
          navigation={navigation}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

function TransfersSection({ transfers, teamId, theme, teamColor, navigation }) {
  const [mode, setMode] = useState("in");

  const filtered = useMemo(() => {
    const source = transfers ?? [];
    const list = source.filter((t) =>
      mode === "in" ? t.toteam?.id === teamId : t.fromteam?.id === teamId,
    );
    return list.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") * -1);
  }, [transfers, teamId, mode]);

  return (
    <View style={{ paddingBottom: 8 }}>
      <View style={[trStyles.toggleWrap, { backgroundColor: theme.surface }]}>
        <TouchableOpacity
          style={[
            trStyles.toggleBtn,
            mode === "in" && { backgroundColor: teamColor + "20" },
          ]}
          onPress={() => setMode("in")}
          activeOpacity={0.75}
        >
          <Text
            style={[
              trStyles.toggleText,
              { color: mode === "in" ? theme.text : theme.textSecondary },
            ]}
          >
            Players In
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            trStyles.toggleBtn,
            mode === "out" && { backgroundColor: teamColor + "20" },
          ]}
          onPress={() => setMode("out")}
          activeOpacity={0.75}
        >
          <Text
            style={[
              trStyles.toggleText,
              { color: mode === "out" ? theme.text : theme.textSecondary },
            ]}
          >
            Players Out
          </Text>
        </TouchableOpacity>
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No transfers available
          </Text>
        </View>
      ) : (
        filtered.map((transfer, idx) => (
          <TransferCard
            key={`${transfer.player_id ?? idx}_${transfer.date ?? idx}`}
            transfer={transfer}
            mode={mode}
            theme={theme}
            teamColor={teamColor}
            navigation={navigation}
          />
        ))
      )}
    </View>
  );
}

const trStyles = StyleSheet.create({
  toggleWrap: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 10,
    padding: 4,
    flexDirection: "row",
    gap: 6,
  },
  toggleBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 8,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: "700",
  },
  card: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 10,
  },
  typeText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    flexShrink: 1,
  },
  dateText: {
    fontSize: 11,
    fontWeight: "600",
  },
  playerBlock: {
    alignItems: "center",
  },
  headshotWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    overflow: "visible",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  headshot: {
    width: 92,
    height: 92,
    borderRadius: 46,
  },
  headshotFallback: {
    width: 92,
    height: 92,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontSize: 22,
    fontWeight: "800",
  },
  posBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  posBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  playerName: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  teamRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    alignSelf: "center",
  },
  teamLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  teamLogo: {
    width: 22,
    height: 22,
  },
  teamLogoFallback: {
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  teamFallbackText: {
    fontSize: 10,
    fontWeight: "800",
  },
  teamName: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  amountText: {
    marginTop: 5,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },

  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 10,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 14,
  },
  modalMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalType: { fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  modalDate: { fontSize: 12, fontWeight: "500" },
  modalSectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: 4,
  },
  modalPlayerCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 12,
    marginBottom: 14,
  },
  modalHeadshotWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  modalHeadshot: { width: 52, height: 52, borderRadius: 26 },
  modalInitials: { fontSize: 18, fontWeight: "800" },
  modalPlayerName: { fontSize: 15, fontWeight: "700" },
  modalPlayerPos: { fontSize: 12, marginTop: 2 },
  modalPosBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  modalPosBadgeText: { fontSize: 11, fontWeight: "800" },
  modalTeamBubble: {
    flexDirection: "column",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 10,
  },
  modalTeamLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  modalTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modalTeamLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  modalTeamLogoInitial: { fontSize: 18, fontWeight: "800" },
  modalTeamName: { fontSize: 15, fontWeight: "700", flex: 1 },
  modalTeamArrow: { fontSize: 22, fontWeight: "300", paddingLeft: 4 },
  modalAmount: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 8,
  },
  modalCloseBtn: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalCloseBtnText: { fontSize: 14, fontWeight: "700" },
});

function RosterPlayerCard({ entry, theme, teamColor, navigation }) {
  const player = entry.player ?? {};
  const isGoalkeeper = isGoalkeeperProfile(
    player.detailedposition,
    player.position,
  );
  const imageUri = player.image_path;
  const showImage = !isPlaceholder(imageUri);
  const playerName = player.name ?? player.display_name ?? "Unknown Player";
  const initials = playerName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
  const posAbbr = getPosAbbr(player.detailedposition);

  const dob = formatLongDate(player.date_of_birth);
  const age = getAgeFromDob(player.date_of_birth);
  const dobText = dob ? `${dob}${age != null ? ` (${age})` : ""}` : "-";

  const sidMeta = entry._sidelinedMeta ?? null;
  const termStart = sidMeta
    ? formatLongDate(sidMeta.start_date)
    : formatLongDate(entry.start);
  const termEnd = sidMeta
    ? formatLongDate(sidMeta.end_date)
    : formatLongDate(entry.end);

  const stats = player.statistics ?? [];
  const app = extractStatNumber(
    getStatEntry(stats, (n) => n === "appearances")?.value,
  );
  const goalsEntry = getStatEntry(stats, (n) => n === "goals");
  const goals = extractStatNumber(goalsEntry?.value);
  const penalties =
    goalsEntry && typeof goalsEntry.value?.penalties === "number"
      ? goalsEntry.value.penalties
      : 0;
  const assists = extractStatNumber(
    getStatEntry(stats, (n) => n === "assists")?.value,
  );
  const minutes = extractStatNumber(
    getStatEntry(stats, (n) => n === "minutes played")?.value,
  );
  const goalsConceded = extractStatNumber(
    getStatEntry(stats, (n) => n === "goals conceded")?.value,
  );
  const cleanSheets = extractStatNumber(
    getStatEntry(stats, (n) => n === "cleansheets" || n === "clean sheets")
      ?.value,
  );

  const playerId = player.id ?? entry.player_id;
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() =>
        playerId != null &&
        navigation?.navigate("Top5PlayerDetail", {
          playerId,
          playerName,
        })
      }
    >
      <View
        style={[
          roStyles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={roStyles.topRow}>
          <View style={roStyles.headshotCol}>
            <View
              style={[
                roStyles.headshotWrap,
                { backgroundColor: (teamColor ?? "#888") + "30" },
              ]}
            >
              {showImage ? (
                <Image
                  source={{ uri: imageUri }}
                  style={roStyles.headshot}
                  resizeMode="cover"
                />
              ) : (
                <View style={roStyles.headshotFallback}>
                  <Text style={[roStyles.initials, { color: theme.text }]}>
                    {initials || "?"}
                  </Text>
                </View>
              )}

              {entry.jersey_number != null ? (
                <View
                  style={[
                    roStyles.jerseyBadge,
                    {
                      backgroundColor: theme.surface,
                      borderColor: teamColor ?? theme.border,
                    },
                  ]}
                >
                  <Text style={[roStyles.jerseyText, { color: theme.text }]}>
                    #{entry.jersey_number}
                  </Text>
                </View>
              ) : null}

              {player.country?.image_path ? (
                <Image
                  source={{ uri: player.country.image_path }}
                  style={roStyles.countryFlag}
                  resizeMode="cover"
                />
              ) : null}

              {posAbbr !== "--" ? (
                <View
                  style={[
                    roStyles.posBadge,
                    { backgroundColor: teamColor ?? theme.border },
                  ]}
                >
                  <Text
                    style={[
                      roStyles.posBadgeText,
                      { color: getTextOnColor(teamColor ?? theme.border) },
                    ]}
                  >
                    {posAbbr}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={roStyles.infoCol}>
            {(termStart || termEnd) && (
              <View style={roStyles.termRow}>
                <Text
                  style={[
                    roStyles.termText,
                    { color: theme.textTertiary ?? theme.textSecondary },
                  ]}
                >
                  {termStart ? `Start: ${termStart}` : ""}
                </Text>
                <Text
                  style={[
                    roStyles.termText,
                    {
                      color: theme.textTertiary ?? theme.textSecondary,
                      flex: 1,
                      textAlign: "right",
                    },
                  ]}
                >
                  {termEnd ? `End: ${termEnd}` : ""}
                </Text>
              </View>
            )}

            <Text
              style={[roStyles.playerName, { color: theme.text }]}
              numberOfLines={2}
            >
              {playerName}
            </Text>
            <Text
              style={[roStyles.dobText, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {dobText}
            </Text>
            {sidMeta?.games_missed != null && (
              <Text style={[roStyles.dobText, { color: theme.textSecondary }]}>
                Games Missed: {sidMeta.games_missed}
              </Text>
            )}
          </View>
        </View>

        {sidMeta ? (
          <View
            style={[
              roStyles.sidelinedTypeRow,
              { borderTopColor: theme.border },
            ]}
          >
            <Text style={[roStyles.sidelinedTypeText, { color: theme.text }]}>
              {sidMeta.type?.name ?? "Sidelined"}
            </Text>
          </View>
        ) : (
          <View style={[roStyles.statsRow, { borderTopColor: theme.border }]}>
            <View style={roStyles.statItem}>
              <Text style={[roStyles.statValue, { color: theme.text }]}>
                {app}
              </Text>
              <Text
                style={[roStyles.statLabel, { color: theme.textSecondary }]}
              >
                APP
              </Text>
            </View>
            <View style={roStyles.statItem}>
              <Text style={[roStyles.statValue, { color: theme.text }]}>
                {isGoalkeeper
                  ? goalsConceded
                  : penalties > 0
                    ? `${goals} (${penalties})`
                    : goals}
              </Text>
              <Text
                style={[roStyles.statLabel, { color: theme.textSecondary }]}
              >
                {isGoalkeeper ? "GC" : "GLS"}
              </Text>
            </View>
            <View style={roStyles.statItem}>
              <Text style={[roStyles.statValue, { color: theme.text }]}>
                {isGoalkeeper ? cleanSheets : assists}
              </Text>
              <Text
                style={[roStyles.statLabel, { color: theme.textSecondary }]}
              >
                {isGoalkeeper ? "CS" : "AST"}
              </Text>
            </View>
            <View style={roStyles.statItem}>
              <Text style={[roStyles.statValue, { color: theme.text }]}>
                {minutes}
              </Text>
              <Text
                style={[roStyles.statLabel, { color: theme.textSecondary }]}
              >
                MP
              </Text>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function RosterGroup({
  title,
  players,
  theme,
  teamColor,
  navigation,
  defaultExpanded = true,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (!players.length) return null;

  return (
    <View style={{ marginBottom: 4 }}>
      <TouchableOpacity
        style={[roStyles.groupHeader, { backgroundColor: theme.surface }]}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.75}
      >
        <Text style={[roStyles.groupTitle, { color: theme.text }]}>
          {title}
        </Text>
        <View
          style={[roStyles.groupCount, { backgroundColor: teamColor + "1a" }]}
        >
          <Text
            style={[roStyles.groupCountText, { color: theme.textSecondary }]}
          >
            {players.length}
          </Text>
        </View>
        <Text
          style={[
            roStyles.groupChevron,
            { color: theme.textSecondary, marginTop: expanded ? -12.5 : 0 },
          ]}
        >
          {expanded ? "⌄" : "›"}
        </Text>
      </TouchableOpacity>

      {expanded &&
        players.map((entry, idx) => (
          <RosterPlayerCard
            key={`${entry.player?.id ?? entry.player_id ?? idx}_${entry.start ?? "s"}_${entry.end ?? "e"}`}
            entry={entry}
            theme={theme}
            teamColor={teamColor}
            navigation={navigation}
          />
        ))}
    </View>
  );
}

function RosterSection({ squad, sidelined, theme, teamColor, navigation }) {
  const sidelinedMap = useMemo(() => {
    const map = new Map();
    for (const s of sidelined ?? []) {
      if (s.player_id != null) map.set(s.player_id, s);
    }
    return map;
  }, [sidelined]);

  const grouped = useMemo(() => {
    const sections = {
      Attackers: [],
      Midfielders: [],
      Defenders: [],
      Goalkeepers: [],
      Sidelined: [],
    };

    for (const entry of squad ?? []) {
      const player = entry.player ?? {};
      if (sidelinedMap.has(entry.player_id)) {
        sections.Sidelined.push({
          ...entry,
          _sidelinedMeta: sidelinedMap.get(entry.player_id),
        });
        continue;
      }
      const bucket = getRosterBucket(player.detailedposition, player.position);
      sections[bucket].push(entry);
    }

    // Include sidelined records not present in current squad.
    const squadIds = new Set((squad ?? []).map((s) => s.player_id));
    for (const s of sidelined ?? []) {
      if (!squadIds.has(s.player_id)) {
        sections.Sidelined.push({
          player_id: s.player_id,
          start: null,
          end: null,
          jersey_number: null,
          _sidelinedMeta: s,
          player: {
            id: s.player_id,
            name:
              s.player?.display_name ??
              (`${s.player?.firstname ?? ""} ${s.player?.lastname ?? ""}`.trim() ||
                "Unknown Player"),
            image_path: s.player?.image_path ?? null,
            date_of_birth: null,
            detailedposition: null,
            position: null,
            country: null,
            statistics: [],
          },
        });
      }
    }

    return sections;
  }, [squad, sidelined, sidelinedMap]);

  const hasAny =
    grouped.Attackers.length +
      grouped.Midfielders.length +
      grouped.Defenders.length +
      grouped.Goalkeepers.length +
      grouped.Sidelined.length >
    0;

  if (!hasAny) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          No roster available
        </Text>
      </View>
    );
  }

  return (
    <View style={{ paddingBottom: 8 }}>
      <RosterGroup
        title="Attackers"
        players={grouped.Attackers}
        theme={theme}
        teamColor={teamColor}
        navigation={navigation}
        defaultExpanded={true}
      />
      <RosterGroup
        title="Midfielders"
        players={grouped.Midfielders}
        theme={theme}
        teamColor={teamColor}
        navigation={navigation}
        defaultExpanded={false}
      />
      <RosterGroup
        title="Defenders"
        players={grouped.Defenders}
        theme={theme}
        teamColor={teamColor}
        navigation={navigation}
        defaultExpanded={false}
      />
      <RosterGroup
        title="Goalkeepers"
        players={grouped.Goalkeepers}
        theme={theme}
        teamColor={teamColor}
        navigation={navigation}
        defaultExpanded={false}
      />
      <RosterGroup
        title="Sidelined"
        players={grouped.Sidelined}
        theme={theme}
        teamColor={teamColor}
        navigation={navigation}
        defaultExpanded={false}
      />
    </View>
  );
}

const roStyles = StyleSheet.create({
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  groupTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  groupCount: {
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  groupCountText: {
    fontSize: 11,
    fontWeight: "700",
  },
  groupChevron: {
    fontSize: 20,
    lineHeight: 22,
  },
  card: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  headshotCol: {
    width: 88,
    alignItems: "center",
  },
  headshotWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
  headshot: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  headshotFallback: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontSize: 18,
    fontWeight: "800",
  },
  jerseyBadge: {
    position: "absolute",
    top: -2,
    left: -8,
    minWidth: 24,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#00000022",
  },
  jerseyText: {
    fontSize: 10,
    fontWeight: "800",
  },
  countryFlag: {
    position: "absolute",
    top: -2,
    right: -4,
    width: 20,
    height: 14,
    borderRadius: 2,
  },
  posBadge: {
    position: "absolute",
    right: -6,
    bottom: -3,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  posBadgeText: {
    fontSize: 9,
    fontWeight: "800",
  },
  infoCol: {
    flex: 1,
  },
  termRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  termText: {
    fontSize: 10,
    fontWeight: "500",
    flex: 1,
  },
  playerName: {
    fontSize: 14,
    fontWeight: "700",
  },
  dobText: {
    fontSize: 12,
    marginTop: 2,
  },
  statsRow: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statItem: {
    minWidth: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  statLabel: {
    fontSize: 10,
    marginTop: 1,
    fontWeight: "600",
  },
  sidelinedTypeRow: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  sidelinedTypeText: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.3,
  },
});

// ─── Stats Tab ───────────────────────────────────────────────────────────────

const TIME_BUCKETS = ["0-15", "15-30", "30-45", "45-60", "60-75", "75-90"];

function StatSectionHeader({ label, theme }) {
  return (
    <Text style={[stStyles.sectionTitle, { color: theme.text }]}>{label}</Text>
  );
}

function StatRow({ label, value, sub, last, theme }) {
  return (
    <View
      style={[
        stStyles.statRow,
        { borderBottomColor: last ? "transparent" : theme.border },
      ]}
    >
      <Text style={[stStyles.statLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[stStyles.statValue, { color: theme.text }]}>
          {value ?? "—"}
        </Text>
        {sub ? (
          <Text style={[stStyles.statSub, { color: theme.textSecondary }]}>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function StatRowHAW({ label, all, home, away, showPct, last, theme }) {
  const fmt = (v) => (v == null ? "—" : String(v));
  const fmtPct = (v) => (v == null ? "—" : `${Math.round(v)}%`);
  return (
    <View
      style={[
        stStyles.statRow,
        { borderBottomColor: last ? "transparent" : theme.border },
      ]}
    >
      <Text style={[stStyles.statLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
      <View style={stStyles.hawGroup}>
        {[
          { key: "All", obj: all },
          { key: "Home", obj: home },
          { key: "Away", obj: away },
        ].map(({ key, obj }) => (
          <View key={key} style={stStyles.hawCell}>
            <Text style={[stStyles.hawTop, { color: theme.text }]}>
              {showPct ? fmtPct(obj?.percentage) : fmt(obj?.count)}
            </Text>
            <Text
              style={[
                stStyles.hawSub,
                { color: theme.textTertiary ?? theme.textSecondary },
              ]}
            >
              {key}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function GoalsRow({ label, value, last, theme }) {
  if (!value) return null;
  const all = value.all ?? {};
  const home = value.home ?? {};
  const away = value.away ?? {};
  const fmt = (v) => (v == null ? "—" : String(v));
  return (
    <View
      style={[
        stStyles.statRow,
        { borderBottomColor: last ? "transparent" : theme.border },
      ]}
    >
      <Text style={[stStyles.statLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
      <View style={stStyles.hawGroup}>
        {[
          { key: "Total", val: all.count },
          { key: "Home", val: home.count },
          { key: "Away", val: away.count },
        ].map(({ key, val }) => (
          <View key={key} style={stStyles.hawCell}>
            <Text style={[stStyles.hawTop, { color: theme.text }]}>
              {fmt(val)}
            </Text>
            <Text
              style={[
                stStyles.hawSub,
                { color: theme.textTertiary ?? theme.textSecondary },
              ]}
            >
              {key}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ResultsOverview({
  gamesPlayed,
  teamWins,
  teamDraws,
  teamLost,
  theme,
}) {
  const played = gamesPlayed?.total ?? "—";
  const wins = teamWins?.all?.count ?? "—";
  const draws = teamDraws?.all?.count ?? "—";
  const losses = teamLost?.all?.count ?? "—";
  return (
    <View
      style={[
        stStyles.resultsCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={stStyles.resultsRow}>
        {[
          { label: "Played", value: played, color: theme.text },
          { label: "Won", value: wins, color: "#22c55e" },
          { label: "Drawn", value: draws, color: "#f59e0b" },
          { label: "Lost", value: losses, color: "#ef4444" },
        ].map(({ label, value, color }) => (
          <View key={label} style={stStyles.resultCell}>
            <Text style={[stStyles.resultValue, { color }]}>{value}</Text>
            <Text
              style={[stStyles.resultLabel, { color: theme.textSecondary }]}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
      <View style={[stStyles.hawBreakdown, { borderTopColor: theme.border }]}>
        {[
          {
            label: "Home",
            w: teamWins?.home?.count,
            d: teamDraws?.home?.count,
            l: teamLost?.home?.count,
          },
          {
            label: "Away",
            w: teamWins?.away?.count,
            d: teamDraws?.away?.count,
            l: teamLost?.away?.count,
          },
        ].map(({ label, w, d, l }) => (
          <View key={label} style={stStyles.hawBreakdownRow}>
            <Text
              style={[
                stStyles.hawBreakdownLabel,
                { color: theme.textSecondary },
              ]}
            >
              {label}
            </Text>
            <Text style={[stStyles.hawBreakdownStat, { color: "#22c55e" }]}>
              {w ?? "—"}W
            </Text>
            <Text style={[stStyles.hawBreakdownStat, { color: "#f59e0b" }]}>
              {d ?? "—"}D
            </Text>
            <Text style={[stStyles.hawBreakdownStat, { color: "#ef4444" }]}>
              {l ?? "—"}L
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ScoringMinutesChart({ data, theme, teamColor }) {
  if (!data) return null;
  const counts = TIME_BUCKETS.map((b) => data[b]?.count ?? 0);
  const maxCount = Math.max(...counts, 1);
  const barColor = teamColor ?? "#6366f1";
  return (
    <View
      style={[
        stStyles.chartCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={stStyles.chartBars}>
        {TIME_BUCKETS.map((bucket, i) => {
          const count = counts[i];
          const barH = Math.max(2, Math.round((count / maxCount) * 80));
          return (
            <View key={bucket} style={stStyles.chartBarCol}>
              <Text
                style={[
                  stStyles.chartCountLabel,
                  { color: theme.textSecondary },
                ]}
              >
                {count > 0 ? count : ""}
              </Text>
              <View style={stStyles.chartBarArea}>
                <View
                  style={{
                    height: barH,
                    width: "100%",
                    backgroundColor: barColor,
                    borderRadius: 4,
                  }}
                />
              </View>
              <Text
                style={[
                  stStyles.chartBucketLabel,
                  { color: theme.textSecondary },
                ]}
                numberOfLines={1}
              >
                {bucket}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function CardPlayer({ label, value, playerMap, theme, cardColor }) {
  if (!value) return null;
  const count = value.count;
  const avg =
    typeof value.average === "number" ? value.average.toFixed(2) : null;
  const playerId = value.player_id;
  const playerName = value.player_name;
  const player = playerId != null ? playerMap.get(playerId) : null;
  const imageUri = player?.image_path;
  const showImage = imageUri && !isPlaceholder(imageUri);
  const initials = (playerName ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
  return (
    <View style={[stStyles.cardPlayerRow, { borderBottomColor: theme.border }]}>
      <View style={[stStyles.cardBadge, { backgroundColor: cardColor + "22" }]}>
        <Text style={[stStyles.cardBadgeText, { color: cardColor }]}>
          {count ?? "—"}
        </Text>
      </View>
      {showImage || playerName ? (
        <>
          <View
            style={[stStyles.playerThumb, { backgroundColor: theme.border }]}
          >
            {showImage ? (
              <Image
                source={{ uri: imageUri }}
                style={{ width: 36, height: 36 }}
                resizeMode="cover"
              />
            ) : (
              <Text
                style={[
                  stStyles.playerThumbInitials,
                  { color: theme.textSecondary },
                ]}
              >
                {initials}
              </Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[stStyles.cardPlayerName, { color: theme.text }]}>
              {playerName ?? "—"}
            </Text>
            {avg ? (
              <Text
                style={[stStyles.cardPlayerSub, { color: theme.textSecondary }]}
              >
                Avg: {avg}/game
              </Text>
            ) : null}
          </View>
        </>
      ) : null}
      <Text style={[stStyles.cardKey, { color: theme.textSecondary }]}>
        {label}
      </Text>
    </View>
  );
}

function OverUnderSection({ value, theme }) {
  if (!value) return null;
  const keys = Object.keys(value).sort((a, b) => {
    const av = parseFloat(a.replace("over_", "").replace("_", "."));
    const bv = parseFloat(b.replace("over_", "").replace("_", "."));
    return av - bv;
  });
  if (!keys.length) return null;
  const fmtLabel = (k) => "Over " + k.replace("over_", "").replace("_", ".");
  return (
    <View style={stStyles.section}>
      <StatSectionHeader label="Goals Probability" theme={theme} />
      <View
        style={[
          stStyles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View
          style={[stStyles.ouHeaderRow, { borderBottomColor: theme.border }]}
        >
          <Text style={[stStyles.ouKeyLabel, { color: theme.textSecondary }]}>
            Line
          </Text>
          <Text style={[stStyles.ouColHeader, { color: theme.textSecondary }]}>
            Matches
          </Text>
          <Text style={[stStyles.ouColHeader, { color: theme.textSecondary }]}>
            Team
          </Text>
        </View>
        {keys.map((k, i) => {
          const d = value[k];
          const matchCount = d?.matches?.count;
          const matchPct = d?.matches?.percentage;
          const teamCount = d?.team?.count;
          const teamPct = d?.team?.percentage;
          const last = i === keys.length - 1;
          return (
            <View
              key={k}
              style={[
                stStyles.ouRow,
                {
                  borderBottomColor: last ? "transparent" : theme.border,
                },
              ]}
            >
              <Text style={[stStyles.ouKeyLabel, { color: theme.text }]}>
                {fmtLabel(k)}
              </Text>
              <Text style={[stStyles.ouValue, { color: theme.text }]}>
                {matchCount != null ? matchCount : "—"}
                {matchPct != null ? ` (${Math.round(matchPct)}%)` : ""}
              </Text>
              <Text style={[stStyles.ouValue, { color: theme.text }]}>
                {teamCount != null ? teamCount : "—"}
                {teamPct != null ? ` (${Math.round(teamPct)}%)` : ""}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function HeightsSection({ value, theme }) {
  if (!value) return null;
  const rows = [
    { label: "Total Average", val: value.avg_total_height },
    { label: "Goalkeepers", val: value.avg_goalkeeper_height },
    { label: "Defenders", val: value.avg_defender_height },
    { label: "Midfielders", val: value.avg_midfielder_height },
    { label: "Attackers", val: value.avg_attacker_height },
  ].filter((r) => r.val != null);
  if (!rows.length) return null;
  return (
    <View style={stStyles.section}>
      <StatSectionHeader label="Average Height" theme={theme} />
      <View
        style={[
          stStyles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {rows.map((r, i) => (
          <StatRow
            key={r.label}
            label={r.label}
            value={`${r.val} cm`}
            last={i === rows.length - 1}
            theme={theme}
          />
        ))}
      </View>
    </View>
  );
}

function NationalTeamSection({ value, playerMap, theme, teamColor }) {
  if (!value?.national_team_players?.length) return null;
  const teamGroups = new Map();
  for (const entry of value.national_team_players) {
    const ntName = entry.team ?? "Unknown";
    if (!teamGroups.has(ntName)) teamGroups.set(ntName, []);
    teamGroups.get(ntName).push(entry.player);
  }
  return (
    <View style={stStyles.section}>
      <StatSectionHeader label="National Team Players" theme={theme} />
      <View
        style={[
          stStyles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {[...teamGroups.entries()].map(([ntName, playerIds], gi) => {
          const last = gi === teamGroups.size - 1;
          return (
            <View
              key={ntName}
              style={[
                stStyles.ntRow,
                {
                  borderBottomColor: last ? "transparent" : theme.border,
                },
              ]}
            >
              <Text style={[stStyles.ntName, { color: theme.textSecondary }]}>
                {ntName}
              </Text>
              <View style={stStyles.ntAvatarRow}>
                {playerIds.map((pid) => {
                  const p = playerMap.get(pid);
                  const imgUri = p?.image_path;
                  const showImg = imgUri && !isPlaceholder(imgUri);
                  const nm = p?.display_name ?? p?.name ?? String(pid);
                  const initials = nm
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase();
                  return (
                    <View key={pid} style={stStyles.ntAvatar}>
                      <View
                        style={[
                          stStyles.ntAvatarImg,
                          {
                            backgroundColor: (teamColor ?? "#888") + "30",
                          },
                        ]}
                      >
                        {showImg ? (
                          <Image
                            source={{ uri: imgUri }}
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 18,
                            }}
                            resizeMode="cover"
                          />
                        ) : (
                          <Text
                            style={[
                              stStyles.ntInitials,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {initials}
                          </Text>
                        )}
                      </View>
                      <Text
                        style={[
                          stStyles.ntPlayerName,
                          { color: theme.textSecondary },
                        ]}
                        numberOfLines={2}
                      >
                        {nm}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function TeamStatsSection({ teamInfo, squad, theme, teamColor }) {
  const details = teamInfo?.statistics?.[0]?.details ?? [];

  const playerMap = useMemo(() => {
    const m = new Map();
    for (const s of squad ?? []) {
      if (s.player_id != null && s.player) m.set(s.player_id, s.player);
    }
    return m;
  }, [squad]);

  const get = useCallback(
    (name) => getStatEntry(details, (n) => n === name.toLowerCase())?.value,
    [details],
  );

  const gamesPlayed = get("Games Played");
  const teamWins = get("Team Wins");
  const teamDraws = get("Team Draws");
  const teamLost = get("Team Lost");
  const goals = get("Goals");
  const goalsConceded = get("Goals Conceded");
  const cleansheets = get("Cleansheets");
  const failedToScore = get("Failed To Score");
  const btts = get("Both Teams To Score");
  const injuryGoals = get("Injury Time Goals");
  const yellowcards = get("Yellowcards");
  const redcards = get("Redcards");
  const possession = get("Ball Possession %");
  const corners = get("Corners");
  const halfResults = get("Half Results");
  const mostScoredHalf = get("Most Scored Half");
  const totalMinutes = get("Total Minutes Played");
  const avgHeight = get("Average Player Height");
  const scoringMins = get("Scoring Minutes");
  const concededMins = get("Conceded Scoring Minutes");
  const nationalPlayers = get("National Team Players");
  const numberOfGoals = get("Number Of Goals");

  if (!details.length) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          No statistics available
        </Text>
      </View>
    );
  }

  const fmt = (v) => (v == null ? "—" : String(v));
  const fmtDec = (v, d = 2) => (v == null ? "—" : parseFloat(v).toFixed(d));

  return (
    <View style={{ paddingBottom: 24 }}>
      {/* Results */}
      {(teamWins || teamDraws || teamLost || gamesPlayed) && (
        <View style={stStyles.section}>
          <StatSectionHeader label="Results" theme={theme} />
          <ResultsOverview
            gamesPlayed={gamesPlayed}
            teamWins={teamWins}
            teamDraws={teamDraws}
            teamLost={teamLost}
            theme={theme}
          />
        </View>
      )}

      {/* Goals */}
      {(goals || goalsConceded || cleansheets) && (
        <View style={stStyles.section}>
          <StatSectionHeader label="Goals" theme={theme} />
          <View
            style={[
              stStyles.card,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            {goals && <GoalsRow label="Scored" value={goals} theme={theme} />}
            {goalsConceded && (
              <GoalsRow label="Conceded" value={goalsConceded} theme={theme} />
            )}
            {goals?.all?.average != null && (
              <StatRow
                label="Goals/Game (avg)"
                value={fmtDec(goals.all.average)}
                theme={theme}
              />
            )}
            {goalsConceded?.all?.average != null && (
              <StatRow
                label="Conceded/Game (avg)"
                value={fmtDec(goalsConceded.all.average)}
                theme={theme}
              />
            )}
            {cleansheets && (
              <StatRowHAW
                label="Cleansheets"
                all={cleansheets.all}
                home={cleansheets.home}
                away={cleansheets.away}
                theme={theme}
              />
            )}
            {injuryGoals?.total != null && (
              <StatRow
                label="Injury-Time Goals"
                value={fmt(injuryGoals.total)}
                sub={
                  injuryGoals.average != null
                    ? `avg ${fmtDec(injuryGoals.average)}/game`
                    : null
                }
                last
                theme={theme}
              />
            )}
          </View>
        </View>
      )}

      {/* Scoring Minutes chart */}
      {scoringMins && (
        <View style={stStyles.section}>
          <StatSectionHeader label="Scoring Minutes" theme={theme} />
          <ScoringMinutesChart
            data={scoringMins}
            theme={theme}
            teamColor={teamColor}
          />
        </View>
      )}

      {/* Conceded by Minute chart */}
      {concededMins && (
        <View style={stStyles.section}>
          <StatSectionHeader label="Conceded by Minute" theme={theme} />
          <ScoringMinutesChart
            data={concededMins}
            theme={theme}
            teamColor="#ef4444"
          />
        </View>
      )}

      {/* Match patterns */}
      {(failedToScore || btts || halfResults || mostScoredHalf) && (
        <View style={stStyles.section}>
          <StatSectionHeader label="Match Patterns" theme={theme} />
          <View
            style={[
              stStyles.card,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            {btts && (
              <StatRowHAW
                label="Both Teams Score"
                all={btts.all}
                home={btts.home}
                away={btts.away}
                showPct
                theme={theme}
              />
            )}
            {failedToScore && (
              <StatRowHAW
                label="Failed to Score"
                all={failedToScore.all}
                home={failedToScore.home}
                away={failedToScore.away}
                showPct
                theme={theme}
              />
            )}
            {halfResults?.won_both_halves != null && (
              <StatRow
                label="Won Both Halves"
                value={fmt(halfResults.won_both_halves)}
                theme={theme}
              />
            )}
            {halfResults?.scored_both_halves != null && (
              <StatRow
                label="Scored Both Halves"
                value={fmt(halfResults.scored_both_halves)}
                theme={theme}
              />
            )}
            {halfResults?.comebacks != null && (
              <StatRow
                label="Comebacks"
                value={fmt(halfResults.comebacks)}
                theme={theme}
              />
            )}
            {mostScoredHalf?.most_scored_half && (
              <StatRow
                label="Best Scoring Half"
                value={mostScoredHalf.most_scored_half}
                sub={
                  mostScoredHalf.most_scored_half_goals != null
                    ? `${mostScoredHalf.most_scored_half_goals} goals`
                    : null
                }
                last
                theme={theme}
              />
            )}
          </View>
        </View>
      )}

      {/* Discipline & Style */}
      {(yellowcards || redcards || corners != null || possession) && (
        <View style={stStyles.section}>
          <StatSectionHeader label="Discipline & Style" theme={theme} />
          <View
            style={[
              stStyles.card,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            {yellowcards && (
              <CardPlayer
                label="Yellow Cards"
                value={yellowcards}
                playerMap={playerMap}
                theme={theme}
                cardColor="#f59e0b"
              />
            )}
            {redcards && (
              <CardPlayer
                label="Red Cards"
                value={redcards}
                playerMap={playerMap}
                theme={theme}
                cardColor="#ef4444"
              />
            )}
            {corners?.count != null && (
              <StatRow
                label="Corners"
                value={fmt(corners.count)}
                sub={
                  corners.average != null
                    ? `avg ${fmtDec(corners.average)}/game`
                    : null
                }
                theme={theme}
              />
            )}
            {possession?.average != null && (
              <StatRow
                label="Possession"
                value={`${fmtDec(possession.average, 1)}%`}
                theme={theme}
              />
            )}
            {totalMinutes?.total_minutes_played != null && (
              <StatRow
                label="Total Minutes Played"
                value={fmt(totalMinutes.total_minutes_played)}
                last
                theme={theme}
              />
            )}
          </View>
        </View>
      )}

      {/* Over/Under goals */}
      {numberOfGoals && (
        <OverUnderSection value={numberOfGoals} theme={theme} />
      )}

      {/* Average heights */}
      <HeightsSection value={avgHeight} theme={theme} />

      {/* National Team Players */}
      <NationalTeamSection
        value={nationalPlayers}
        playerMap={playerMap}
        theme={theme}
        teamColor={teamColor}
      />
    </View>
  );
}

const stStyles = StyleSheet.create({
  section: { paddingBottom: 4 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginHorizontal: 12,
    marginTop: 14,
    marginBottom: 4,
  },
  card: {
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statLabel: { fontSize: 13, fontWeight: "500", flex: 1, paddingRight: 8 },
  statValue: { fontSize: 14, fontWeight: "700", textAlign: "right" },
  statSub: { fontSize: 11, textAlign: "right", marginTop: 1 },
  hawGroup: { flexDirection: "row", gap: 8 },
  hawCell: { width: 52, alignItems: "center" },
  hawTop: { fontSize: 14, fontWeight: "700" },
  hawSub: { fontSize: 10, marginTop: 1 },
  resultsCard: {
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  resultsRow: {
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  resultCell: { flex: 1, alignItems: "center" },
  resultValue: { fontSize: 26, fontWeight: "800" },
  resultLabel: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  hawBreakdown: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
  },
  hawBreakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  hawBreakdownLabel: { width: 44, fontSize: 12, fontWeight: "600" },
  hawBreakdownStat: { fontSize: 13, fontWeight: "700", minWidth: 28 },
  chartCard: {
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 12,
  },
  chartBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  chartBarCol: { flex: 1, alignItems: "center" },
  chartCountLabel: { fontSize: 10, minHeight: 14, textAlign: "center" },
  chartBarArea: {
    height: 80,
    width: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  chartBucketLabel: {
    fontSize: 9,
    marginTop: 4,
    textAlign: "center",
  },
  cardPlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardBadgeText: { fontSize: 18, fontWeight: "800" },
  playerThumb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  playerThumbInitials: { fontSize: 13, fontWeight: "700" },
  cardKey: { fontSize: 12, fontWeight: "600" },
  cardPlayerName: { fontSize: 13, fontWeight: "700" },
  cardPlayerSub: { fontSize: 11, marginTop: 1 },
  ntRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ntName: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  ntAvatarRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  ntAvatar: { alignItems: "center", width: 52 },
  ntAvatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  ntInitials: { fontSize: 11, fontWeight: "700" },
  ntPlayerName: { fontSize: 9, textAlign: "center", lineHeight: 13 },
  ouHeaderRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ouRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },
  ouKeyLabel: { flex: 1, fontSize: 13, fontWeight: "600" },
  ouColHeader: {
    width: 110,
    textAlign: "right",
    fontSize: 11,
    fontWeight: "700",
  },
  ouValue: { width: 110, textAlign: "right", fontSize: 13, fontWeight: "600" },
});

// ─── Info Tab ────────────────────────────────────────────────────────────────

const TODAY_STR = new Date().toISOString().slice(0, 10);

function mergeCoaches(rawCoaches) {
  const map = new Map();
  for (const c of rawCoaches ?? []) {
    const id = c.coach_id;
    if (!map.has(id)) {
      map.set(id, { ...c, start: c.start, end: c.end, active: c.active });
    } else {
      const ex = map.get(id);
      // Earliest non-null start
      if (c.start && (!ex.start || c.start < ex.start)) ex.start = c.start;
      // Latest end (null = no end)
      if (c.end === null) {
        ex.end = null;
      } else if (ex.end !== null) {
        if (!ex.end || c.end > ex.end) ex.end = c.end;
      }
      if (c.active) ex.active = true;
    }
  }
  return [...map.values()].sort((a, b) => {
    const ae = a.end ?? "9999-12-31";
    const be = b.end ?? "9999-12-31";
    if (ae !== be) return be.localeCompare(ae);
    const as2 = a.start ?? "0000-01-01";
    const bs2 = b.start ?? "0000-01-01";
    return bs2.localeCompare(as2);
  });
}

function CoachCard({ entry, theme, teamColor, navigation }) {
  const coach = entry.coach ?? {};
  const imageUri = coach.image_path;
  const showImage = !isPlaceholder(imageUri);
  const coachName =
    coach.name ??
    (`${coach.firstname ?? ""} ${coach.lastname ?? ""}`.trim() || "Unknown");
  const initials = coachName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const dob = formatLongDate(coach.date_of_birth);
  const age = getAgeFromDob(coach.date_of_birth);
  const dobText = dob ? `${dob}${age != null ? ` (${age})` : ""}` : null;

  const termStart = formatLongDate(entry.start);
  const termEnd = entry.end ? formatLongDate(entry.end) : null;
  const isCurrent =
    entry.active ||
    (entry.end != null && entry.end >= TODAY_STR) ||
    entry.end === null;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() =>
        entry.coach_id &&
        navigation?.navigate("Top5CoachDetail", {
          coachId: entry.coach_id,
          coachName: coachName,
        })
      }
    >
      <View
        style={[
          roStyles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={roStyles.topRow}>
          <View style={roStyles.headshotCol}>
            <View
              style={[
                roStyles.headshotWrap,
                { backgroundColor: (teamColor ?? "#888") + "30" },
              ]}
            >
              {showImage ? (
                <Image
                  source={{ uri: imageUri }}
                  style={roStyles.headshot}
                  resizeMode="cover"
                />
              ) : (
                <View style={roStyles.headshotFallback}>
                  <Text style={[roStyles.initials, { color: theme.text }]}>
                    {initials || "?"}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={roStyles.infoCol}>
            {(termStart || termEnd || isCurrent) && (
              <View style={roStyles.termRow}>
                <Text
                  style={[
                    roStyles.termText,
                    { color: theme.textTertiary ?? theme.textSecondary },
                  ]}
                >
                  {termStart ? `Start: ${termStart}` : ""}
                </Text>
                <Text
                  style={[
                    roStyles.termText,
                    {
                      color: isCurrent
                        ? (theme.text ?? theme.textSecondary)
                        : (theme.textTertiary ?? theme.textSecondary),
                      flex: 1,
                      textAlign: "right",
                      fontWeight: isCurrent ? "800" : "500",
                    },
                  ]}
                >
                  {isCurrent
                    ? "Current Manager"
                    : termEnd
                      ? `End: ${termEnd}`
                      : ""}
                </Text>
              </View>
            )}
            <Text
              style={[roStyles.playerName, { color: theme.text }]}
              numberOfLines={2}
            >
              {coachName}
            </Text>
            {dobText ? (
              <Text
                style={[roStyles.dobText, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {dobText}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function ManagersSection({ teamInfo, theme, teamColor, navigation }) {
  const coaches = mergeCoaches(teamInfo?.coaches);
  if (!coaches.length) return null;
  return (
    <View style={inStyles.section}>
      <Text style={[inStyles.sectionTitle, { color: theme.text }]}>
        Managers
      </Text>
      {coaches.map((c, i) => (
        <CoachCard
          key={`${c.coach_id}_${i}`}
          entry={c}
          theme={theme}
          teamColor={teamColor}
          navigation={navigation}
        />
      ))}
    </View>
  );
}

function TrophiesSection({ teamInfo, theme, teamColor, isDarkMode }) {
  const trophies = teamInfo?.trophies ?? [];
  if (!trophies.length) return null;

  // Group by league id
  const leagueMap = new Map();
  for (const t of trophies) {
    const lid = t.league?.id ?? "unknown";
    if (!leagueMap.has(lid)) {
      leagueMap.set(lid, { league: t.league, entries: [] });
    }
    leagueMap.get(lid).entries.push(t);
  }

  return (
    <View style={inStyles.section}>
      <Text style={[inStyles.sectionTitle, { color: theme.text }]}>
        Trophies
      </Text>
      {[...leagueMap.values()].map((lg) => {
        // sub-group by trophy name, Winner first
        const subMap = new Map();
        for (const t of lg.entries) {
          const tname = t.trophy?.name ?? "Other";
          if (!subMap.has(tname)) subMap.set(tname, []);
          subMap.get(tname).push(t);
        }
        const ORDER = ["Winner", "Runner Up"];
        const subKeys = [...subMap.keys()].sort((a, b) => {
          const ai = ORDER.indexOf(a);
          const bi = ORDER.indexOf(b);
          if (ai !== -1 && bi !== -1) return ai - bi;
          if (ai !== -1) return -1;
          if (bi !== -1) return 1;
          return a.localeCompare(b);
        });
        const capWords = (s) =>
            s
              ? s
                  .split('_')
                  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ')
              : s;

          const leagueSubType = lg.league?.sub_type
            ? capWords(lg.league.sub_type)
            : null;

        return (
          <View
            key={lg.league?.id ?? "uk"}
            style={[
              inStyles.leagueCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            {/* League header */}
            <View style={inStyles.leagueHeader}>
              {lg.league?.image_path && !isPlaceholder(lg.league.image_path) ? (
                <Image
                  source={{ uri: lg.league.image_path }}
                  style={[inStyles.leagueLogo, { tintColor: (lg.league.name === "Premier League" || lg.league.name === "Champions League") && isDarkMode ? theme.text : undefined }]}
                  resizeMode="contain"
                />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text
                  style={[inStyles.leagueName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {lg.league?.name ?? "Unknown League"}
                </Text>
                {leagueSubType ? (
                  <Text
                    style={[
                      inStyles.leagueSubType,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {leagueSubType}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Trophy sub-groups */}
            {subKeys.map((tname) => {
              const group = subMap.get(tname);
              // Sort seasons by start year desc
              const sorted = [...group].sort((a, b) => {
                const ay = parseInt((a.season?.name ?? "0").split("/")[0], 10);
                const by = parseInt((b.season?.name ?? "0").split("/")[0], 10);
                return by - ay;
              });
              const seasons = sorted
                .map((t) => t.season?.name)
                .filter(Boolean)
                .join(" · ");
              return (
                <View
                  key={tname}
                  style={[inStyles.trophyRow, { borderTopColor: theme.border }]}
                >
                  <View
                    style={[
                      inStyles.trophyCount,
                      { backgroundColor: (teamColor ?? "#888") + "22" },
                    ]}
                  >
                    <Text
                      style={[inStyles.trophyCountText, { color: theme.text }]}
                    >
                      {group.length}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[inStyles.trophyName, { color: theme.text }]}>
                      {tname}
                    </Text>
                    <Text
                      style={[
                        inStyles.trophySeasons,
                        { color: theme.textSecondary },
                      ]}
                      numberOfLines={3}
                    >
                      {seasons}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const inStyles = StyleSheet.create({
  section: { paddingBottom: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginHorizontal: 12,
    marginTop: 14,
    marginBottom: 4,
  },
  leagueCard: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  leagueHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  leagueLogo: { width: 32, height: 32 },
  leagueName: { fontSize: 14, fontWeight: "700" },
  leagueSubType: { fontSize: 11, marginTop: 1 },
  trophyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  trophyCount: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  trophyCountText: { fontSize: 18, fontWeight: "800" },
  trophyName: { fontSize: 13, fontWeight: "700" },
  trophySeasons: { fontSize: 11, marginTop: 2, lineHeight: 16 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function Top5TeamDetailScreen({ route, navigation }) {
  const { teamId, teamName } = route.params ?? {};
  const { theme, colors, isDarkMode } = useTheme();

  const [teamData, setTeamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("Team");
  const [headerHeight, setHeaderHeight] = useState(180);

  const scrollY = useRef(new Animated.Value(0)).current;

  const cacheKey = `top5:team:${teamId}:v3`;

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        if (!isRefresh) {
          const raw = await AsyncStorage.getItem(cacheKey);
          if (raw) {
            const { data: cached, fetchedAt } = JSON.parse(raw);
            if (Date.now() - fetchedAt < CACHE_TTL) {
              setTeamData(cached);
              setLoading(false);
              return;
            }
          }
        }
        const res = await fetch(`${FOOTBALL_BASE}/football/team/${teamId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const d = json.data ?? json;
        await AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({ data: d, fetchedAt: Date.now() }),
        );
        setTeamData(d);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [teamId, cacheKey],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    scrollY.setValue(0);
    setActiveTab("Team");
  }, [teamId]);

  const teamInfo = teamData?.teamInfo ?? null;

  // League name map: league_id → league name
  const leagueNameMap = useMemo(() => {
    const map = {};
    for (const s of teamInfo?.activeseasons ?? []) {
      if (s.league_id && s.league?.name) {
        map[s.league_id] = {
          name: s.league.name,
          image_path: s.league.image_path ?? null,
        };
      }
    }
    // Fallback: use schedule entry's own name
    for (const sched of teamData?.schedule ?? []) {
      if (sched.league_id && !map[sched.league_id] && sched.name) {
        map[sched.league_id] = { name: sched.name, image_path: null };
      }
    }
    return map;
  }, [teamInfo, teamData]);

  // Flatten all matches, preserving league_id
  const allMatches = useMemo(() => {
    const matches = [];
    for (const sched of teamData?.schedule ?? []) {
      for (const round of sched.rounds ?? []) {
        for (const fixture of round.fixtures ?? []) {
          matches.push({ ...fixture, league_id: sched.league_id });
        }
      }
    }
    matches.sort(
      (a, b) =>
        (parseUtcDate(a.starting_at) ?? 0) - (parseUtcDate(b.starting_at) ?? 0),
    );
    return matches;
  }, [teamData]);

  // Team color from first match participant matching teamId
  const teamColor = useMemo(() => {
    for (const match of allMatches) {
      for (const p of match.participants ?? []) {
        if (p.id === teamId && p.colorPrimary) {
          return p.colorPrimary;
        }
      }
    }
    return null;
  }, [allMatches, teamId]);

  const resolvedColor = teamColor ?? colors.primary;

  // Split matches by date
  const todayStr = getTodayStr();
  const todayMatches = allMatches.filter(
    (m) => getMatchDateStr(m.starting_at) === todayStr,
  );
  const pastMatches = [...allMatches]
    .filter((m) => (getMatchDateStr(m.starting_at) ?? "") < todayStr)
    .sort(
      (a, b) =>
        (parseUtcDate(b.starting_at) ?? 0) - (parseUtcDate(a.starting_at) ?? 0),
    ); // most recent first
  const upcomingMatches = allMatches.filter(
    (m) => (getMatchDateStr(m.starting_at) ?? "") > todayStr,
  );
  const hasAnyMatches =
    todayMatches.length + pastMatches.length + upcomingMatches.length > 0;
  const transfers = teamData?.transfers ?? [];
  const squad = teamData?.squad ?? [];
  const sidelined = teamInfo?.sidelined ?? [];

  // Sticky header animations
  const threshold = Math.max(headerHeight - 40, 80);
  const stickyOpacity = scrollY.interpolate({
    inputRange: [threshold, threshold + 40],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const stickyMiniHeight = scrollY.interpolate({
    inputRange: [threshold, threshold + 40],
    outputRange: [0, 64],
    extrapolate: "clamp",
  });

  const displayName = teamInfo?.name ?? teamName ?? "Team";
  const leagueName = Object.values(leagueNameMap)[0]?.name ?? null;

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={resolvedColor} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.text }]}>
          Error: {error}
        </Text>
        <TouchableOpacity
          onPress={() => {
            setLoading(true);
            load(true);
          }}
          style={[styles.retryBtn, { backgroundColor: resolvedColor }]}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={resolvedColor}
          />
        }
      >
        {/* ── [0] HERO HEADER ─────────────────────────────────────────────── */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: resolvedColor + "22",
              borderBottomColor: resolvedColor,
            },
          ]}
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.headerMain}>
            {teamInfo?.image_path ? (
              <Image
                source={{ uri: teamInfo.image_path }}
                style={styles.headerLogo}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  styles.headerLogoFallback,
                  { backgroundColor: resolvedColor },
                ]}
              >
                <Text
                  style={[
                    styles.headerLogoFallbackText,
                    { color: getTextOnColor(resolvedColor) },
                  ]}
                >
                  {(displayName ?? "?")[0]}
                </Text>
              </View>
            )}
            <View style={styles.headerTextBlock}>
              <Text
                allowFontScaling={false}
                style={[styles.headerName, { color: theme.text }]}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              {leagueName ? (
                <Text
                  allowFontScaling={false}
                  style={[styles.headerLeague, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {leagueName}
                </Text>
              ) : null}
              <View style={styles.headerMeta}>
                {teamInfo?.country?.image_path ? (
                  <Image
                    source={{ uri: teamInfo.country.image_path }}
                    style={styles.headerFlag}
                    resizeMode="contain"
                  />
                ) : null}
                {teamInfo?.country?.name ? (
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.headerCountry,
                      { color: theme.textTertiary },
                    ]}
                    numberOfLines={1}
                  >
                    {teamInfo.country.name}
                    {teamInfo.founded ? ` · Est. ${teamInfo.founded}` : ""}
                  </Text>
                ) : teamInfo?.founded ? (
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.headerCountry,
                      { color: theme.textTertiary },
                    ]}
                  >
                    Est. {teamInfo.founded}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        {/* ── [1] STICKY UNIT ─────────────────────────────────────────────── */}
        <View style={{ backgroundColor: theme.surface }}>
          {/* Mini banner — slides in on scroll */}
          <Animated.View
            style={{
              height: stickyMiniHeight,
              opacity: stickyOpacity,
              overflow: "hidden",
            }}
          >
            <Svg
              style={StyleSheet.absoluteFill}
              width="100%"
              height={64}
              pointerEvents="none"
            >
              <Defs>
                <SvgLinearGradient id="sGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <Stop
                    offset="0%"
                    stopColor={theme.surfaceSecondary}
                    stopOpacity="1"
                  />
                  <Stop
                    offset="55%"
                    stopColor={theme.surfaceSecondary}
                    stopOpacity="1"
                  />
                  <Stop
                    offset="100%"
                    stopColor={resolvedColor}
                    stopOpacity="0.65"
                  />
                </SvgLinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#sGrad)" />
            </Svg>

            <View style={styles.stickyMiniContent}>
              {teamInfo?.image_path ? (
                <Image
                  source={{ uri: teamInfo.image_path }}
                  style={styles.stickyMiniLogo}
                  resizeMode="contain"
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
                {leagueName ? (
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.stickyMiniLeague,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {leagueName}
                  </Text>
                ) : null}
              </View>
            </View>
          </Animated.View>

          {/* Tab underline bar */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.tabBar, { borderBottomColor: theme.border }]}
            contentContainerStyle={styles.tabBarContent}
          >
            {TABS.map((tab) => {
              const isActive = tab === activeTab;
              const isEnabled =
                tab === "Matches" ||
                tab === "Team" ||
                tab === "Stats" ||
                tab === "Transfers" ||
                tab === "Roster" ||
                tab === "Info";
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => isEnabled && setActiveTab(tab)}
                  style={styles.tabBarBtn}
                  disabled={!isEnabled}
                  activeOpacity={isEnabled ? 0.7 : 1}
                >
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.tabBarText,
                      isActive
                        ? { color: theme.text, fontWeight: "700" }
                        : isEnabled
                          ? { color: theme.textSecondary }
                          : {
                              color: theme.textTertiary ?? theme.textSecondary,
                            },
                    ]}
                  >
                    {tab}
                  </Text>
                  {isActive && (
                    <View
                      style={[
                        styles.tabBarIndicator,
                        { backgroundColor: resolvedColor },
                      ]}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── CONTENT ─────────────────────────────────────────────────────── */}
        <View style={styles.content}>
          {activeTab === "Team" && (
            <View style={{ paddingBottom: 8 }}>
              <BestMatch
                pastMatches={pastMatches}
                teamId={teamId}
                theme={theme}
                colors={colors}
                isDarkMode={isDarkMode}
                teamColor={resolvedColor}
                leagueNameMap={leagueNameMap}
                navigation={navigation}
              />
              <StandingsTracker
                teamData={teamData}
                teamId={teamId}
                theme={theme}
                colors={colors}
                teamColor={resolvedColor}
                leagueNameMap={leagueNameMap}
              />
              <UEFARanking teamInfo={teamInfo} theme={theme} colors={colors} />
              <RivalsSection
                teamInfo={teamInfo}
                theme={theme}
                navigation={navigation}
              />
              <CurrentSeasonsSection
                teamInfo={teamInfo}
                theme={theme}
                isDarkMode={isDarkMode}
                navigation={navigation}
              />
              <VenueSection teamInfo={teamInfo} theme={theme} />
            </View>
          )}
          {activeTab === "Matches" &&
            (!hasAnyMatches ? (
              <View style={styles.emptyContainer}>
                <Text
                  style={[styles.emptyText, { color: theme.textSecondary }]}
                >
                  No matches available
                </Text>
              </View>
            ) : (
              <View style={{ paddingBottom: 8 }}>
                <MatchesSection
                  title="Today"
                  matches={todayMatches}
                  collapsible={false}
                  leagueNameMap={leagueNameMap}
                  theme={theme}
                  colors={colors}
                  teamColor={resolvedColor}
                />
                <MatchesSection
                  title="Last Matches"
                  matches={pastMatches}
                  collapsible={true}
                  defaultExpanded={false}
                  leagueNameMap={leagueNameMap}
                  theme={theme}
                  colors={colors}
                  teamColor={resolvedColor}
                />
                <MatchesSection
                  title="Upcoming"
                  matches={upcomingMatches}
                  collapsible={true}
                  defaultExpanded={false}
                  leagueNameMap={leagueNameMap}
                  theme={theme}
                  colors={colors}
                  teamColor={resolvedColor}
                />
              </View>
            ))}
          {activeTab === "Stats" && (
            <TeamStatsSection
              teamInfo={teamInfo}
              squad={squad}
              theme={theme}
              teamColor={resolvedColor}
            />
          )}
          {activeTab === "Transfers" && (
            <TransfersSection
              transfers={transfers}
              teamId={teamId}
              theme={theme}
              teamColor={resolvedColor}
              navigation={navigation}
            />
          )}
          {activeTab === "Roster" && (
            <RosterSection
              squad={squad}
              sidelined={sidelined}
              theme={theme}
              teamColor={resolvedColor}
              navigation={navigation}
            />
          )}
          {activeTab === "Info" && (
            <View style={{ paddingBottom: 16 }}>
              <ManagersSection
                teamInfo={teamInfo}
                theme={theme}
                teamColor={resolvedColor}
                navigation={navigation}
              />
              <TrophiesSection
                teamInfo={teamInfo}
                theme={theme}
                teamColor={resolvedColor}
                isDarkMode={isDarkMode}
              />
            </View>
          )}
        </View>
      </Animated.ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Hero header
  header: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 2,
  },
  headerMain: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  headerLogo: { width: 68, height: 68, marginRight: 14 },
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
  headerLeague: { fontSize: 13, fontWeight: "600", marginBottom: 4 },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
    flexWrap: "wrap",
  },
  headerFlag: { width: 20, height: 13, borderRadius: 2 },
  headerCountry: { fontSize: 12 },
  headerVenue: { fontSize: 11, marginTop: 2 },

  // Sticky mini header
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
  stickyMiniLogo: { width: 32, height: 32, marginRight: 10 },
  stickyMiniName: { fontSize: 15, fontWeight: "700" },
  stickyMiniLeague: { fontSize: 11, fontWeight: "500", marginTop: 1 },

  // Tab underline bar (sticky)
  tabBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBarContent: {
    flexDirection: "row",
  },
  tabBarBtn: {
    width: width / 4,
    alignItems: "center",
    paddingVertical: 11,
    position: "relative",
  },
  tabBarText: { fontSize: 13 },
  tabBarIndicator: {
    position: "absolute",
    bottom: 0,
    left: 12,
    right: 12,
    height: 2.5,
    borderRadius: 2,
  },

  // Content
  content: { paddingBottom: 40, paddingTop: 6 },
  emptyContainer: { alignItems: "center", paddingVertical: 56 },
  emptyText: { fontSize: 15 },

  // Match cards
  matchCardWrap: {
    marginHorizontal: 12,
    marginTop: 10,
    position: "relative",
    overflow: "visible",
  },
  matchLeagueBadge: {
    position: "absolute",
    top: 0,
    right: 8,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    zIndex: 2,
  },
  matchLeagueText: { fontSize: 10, fontWeight: "600" },
  matchCard: {
    borderRadius: 12,
    overflow: "hidden",
  },
  matchCardInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  matchStatusCol: { width: 72, alignItems: "center" },
  matchDateText: {
    fontSize: 11,
    textAlign: "center",
    marginBottom: 4,
    lineHeight: 15,
  },
  matchStatusText: { fontSize: 12, textAlign: "center" },
  matchTeamsList: { flex: 1 },
  matchTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  matchTeamDivider: { height: StyleSheet.hairlineWidth, marginLeft: 32 },
  matchLogoWrap: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  matchTeamLogo: { width: 24, height: 24 },
  matchTeamLogoFallback: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  matchLogoFallbackText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  matchTeamName: { flex: 1, fontSize: 14 },
  matchRecord: { fontSize: 11, marginRight: 2 },
  matchScoreText: { fontSize: 16, minWidth: 26, textAlign: "right" },
  matchChevron: { fontSize: 24, lineHeight: 28, paddingLeft: 4 },

  // Error
  errorText: { marginBottom: 16, fontSize: 15 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: "#fff", fontWeight: "600" },
});

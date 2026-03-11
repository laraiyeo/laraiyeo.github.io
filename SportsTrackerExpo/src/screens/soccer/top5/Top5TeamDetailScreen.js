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
  return (stats ?? []).find((entry) => matcher((entry.type?.name ?? "").toLowerCase()));
}

function isGoalkeeperProfile(detailedPos, pos) {
  const dp = (detailedPos ?? "").toLowerCase();
  const p = (pos ?? "").toLowerCase();
  return dp.includes("goalkeeper") || p.includes("goalkeeper");
}

function getRosterBucket(detailedPos, pos) {
  const dp = (detailedPos ?? "").toLowerCase();
  const p = (pos ?? "").toLowerCase();
  if (dp.includes("goalkeeper") || p.includes("goalkeeper")) return "Goalkeepers";
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

const TABS = ["Team", "Matches", "Stats", "Roster", "Transfers"];

// ─── Match Card ───────────────────────────────────────────────────────────────

const MatchCard = ({ match, idx, leagueName, theme, colors, teamColor }) => {
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
  const homeColor = home?.colorPrimary ?? colors.primary;
  const awayColor = away?.colorPrimary ?? colors.secondary ?? colors.primary;

  const homePos = home?.meta?.position;
  const awayPos = away?.meta?.position;

  const statusLabel =
    isPast && hasScores
      ? "Final"
      : isPast
        ? "Past"
        : formatMatchTime(match.starting_at);
  const dateLabel = isToday ? "Today" : formatMatchDate(match.starting_at);

  const gradId = `tmg_${idx}`;

  return (
    <View style={styles.matchCardWrap}>
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
    </View>
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
  teamColor,
  leagueNameMap,
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
  const homeColor = home.colorPrimary ?? colors.primary;
  const awayColor = away.colorPrimary ?? colors.secondary ?? colors.primary;
  const leagueEntry = leagueNameMap?.[best.league_id] ?? null;
  const leagueName = leagueEntry?.name ?? null;
  const leagueLogoUri = leagueEntry?.image_path ?? null;

  return (
    <View
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
                style={bmStyles.leagueLogo}
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
    </View>
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
        stStyles.container,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      {/* Title */}
      <View style={stStyles.titleRow}>
        <Text
          allowFontScaling={false}
          style={[stStyles.title, { color: theme.text }]}
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
      <View style={[stStyles.navRow, { borderTopColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => setSelectedIdx((v) => Math.max(0, v - 1))}
          disabled={selectedIdx === 0}
          style={stStyles.navArrowBtn}
          activeOpacity={0.6}
        >
          <Text
            style={[
              stStyles.navArrowText,
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
              style={[stStyles.navRoundNum, { color: theme.text }]}
            >
              {selected?.roundName ?? "--"}
            </Text>
            <Text
              allowFontScaling={false}
              style={[stStyles.navRoundLabel, { color: theme.textSecondary }]}
            >
              Round
            </Text>
          </View>
          {dateText ? (
            <Text
              allowFontScaling={false}
              style={[
                stStyles.navDateText,
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
          style={stStyles.navArrowBtn}
          activeOpacity={0.6}
        >
          <Text
            style={[
              stStyles.navArrowText,
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

const stStyles = StyleSheet.create({
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

function RivalsSection({ teamInfo, theme }) {
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
        <View
          key={`${rival.id ?? rival.name}_${idx}`}
          style={[
            infoStyles.row,
            idx > 0 && {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.border,
            },
          ]}
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
        </View>
      ))}
    </View>
  );
}

function CurrentSeasonsSection({ teamInfo, theme }) {
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
        <View
          key={`${season.id ?? season.name}_${idx}`}
          style={[
            infoStyles.row,
            idx > 0 && {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.border,
            },
          ]}
        >
          {season.league?.image_path ? (
            <Image
              source={{ uri: season.league.image_path }}
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
        </View>
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

function TransferCard({ transfer, mode, theme, teamColor }) {
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
            <View style={[trStyles.posBadge, { backgroundColor: sideColor }]}>
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
  );
}

function TransfersSection({ transfers, teamId, theme, teamColor }) {
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
              { color: mode === "in" ? teamColor : theme.textSecondary },
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
              { color: mode === "out" ? teamColor : theme.textSecondary },
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
});

function RosterPlayerCard({ entry, theme, teamColor }) {
  const player = entry.player ?? {};
  const isGoalkeeper = isGoalkeeperProfile(player.detailedposition, player.position);
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

  const termStart = formatLongDate(entry.start);
  const termEnd = formatLongDate(entry.end);

  const stats = player.statistics ?? [];
  const app = extractStatNumber(getStatEntry(stats, (n) => n === "appearances")?.value);
  const goalsEntry = getStatEntry(stats, (n) => n === "goals");
  const goals = extractStatNumber(goalsEntry?.value);
  const penalties =
    goalsEntry && typeof goalsEntry.value?.penalties === "number"
      ? goalsEntry.value.penalties
      : 0;
  const assists = extractStatNumber(getStatEntry(stats, (n) => n === "assists")?.value);
  const minutes = extractStatNumber(getStatEntry(stats, (n) => n === "minutes played")?.value);
  const goalsConceded = extractStatNumber(
    getStatEntry(stats, (n) => n === "goals conceded")?.value,
  );
  const cleanSheets = extractStatNumber(
    getStatEntry(stats, (n) => n === "cleansheets" || n === "clean sheets")?.value,
  );

  return (
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
              <Image source={{ uri: imageUri }} style={roStyles.headshot} resizeMode="cover" />
            ) : (
              <View style={roStyles.headshotFallback}>
                <Text style={[roStyles.initials, { color: theme.text }]}>{initials || "?"}</Text>
              </View>
            )}

            {entry.jersey_number != null ? (
              <View style={[roStyles.jerseyBadge, { backgroundColor: theme.surface }]}> 
                <Text style={[roStyles.jerseyText, { color: theme.text }]}>{entry.jersey_number}</Text>
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
              <View style={[roStyles.posBadge, { backgroundColor: teamColor ?? theme.border }]}>
                <Text style={[roStyles.posBadgeText, { color: getTextOnColor(teamColor ?? theme.border) }]}>
                  {posAbbr}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={roStyles.infoCol}>
          {(termStart || termEnd) && (
            <View style={roStyles.termRow}>
              <Text style={[roStyles.termText, { color: theme.textTertiary ?? theme.textSecondary }]}>
                {termStart ? `Term Start: ${termStart}` : ""}
              </Text>
              <Text style={[roStyles.termText, { color: theme.textTertiary ?? theme.textSecondary }]}>
                {termEnd ? `Term End: ${termEnd}` : ""}
              </Text>
            </View>
          )}

          <Text style={[roStyles.playerName, { color: theme.text }]} numberOfLines={2}>
            {playerName}
          </Text>
          <Text style={[roStyles.dobText, { color: theme.textSecondary }]} numberOfLines={1}>
            {dobText}
          </Text>
        </View>
      </View>

      <View style={[roStyles.statsRow, { borderTopColor: theme.border }]}> 
        <View style={roStyles.statItem}>
          <Text style={[roStyles.statValue, { color: theme.text }]}>{app}</Text>
          <Text style={[roStyles.statLabel, { color: theme.textSecondary }]}>APP</Text>
        </View>
        <View style={roStyles.statItem}>
          <Text style={[roStyles.statValue, { color: theme.text }]}>
            {isGoalkeeper
              ? goalsConceded
              : penalties > 0
                ? `${goals} (${penalties})`
                : goals}
          </Text>
          <Text style={[roStyles.statLabel, { color: theme.textSecondary }]}>
            {isGoalkeeper ? "GC" : "GLS"}
          </Text>
        </View>
        <View style={roStyles.statItem}>
          <Text style={[roStyles.statValue, { color: theme.text }]}>
            {isGoalkeeper ? cleanSheets : assists}
          </Text>
          <Text style={[roStyles.statLabel, { color: theme.textSecondary }]}>
            {isGoalkeeper ? "CS" : "AST"}
          </Text>
        </View>
        <View style={roStyles.statItem}>
          <Text style={[roStyles.statValue, { color: theme.text }]}>{minutes}</Text>
          <Text style={[roStyles.statLabel, { color: theme.textSecondary }]}>MP</Text>
        </View>
      </View>
    </View>
  );
}

function RosterGroup({ title, players, theme, teamColor, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (!players.length) return null;

  return (
    <View style={{ marginBottom: 4 }}>
      <TouchableOpacity
        style={[roStyles.groupHeader, { backgroundColor: theme.surface }]}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.75}
      >
        <Text style={[roStyles.groupTitle, { color: theme.text }]}>{title}</Text>
        <View style={[roStyles.groupCount, { backgroundColor: teamColor + "1a" }]}>
          <Text style={[roStyles.groupCountText, { color: theme.textSecondary }]}>{players.length}</Text>
        </View>
        <Text style={[roStyles.groupChevron, { color: theme.textSecondary }]}>{expanded ? "⌄" : "›"}</Text>
      </TouchableOpacity>

      {expanded &&
        players.map((entry, idx) => (
          <RosterPlayerCard
            key={`${entry.player?.id ?? entry.player_id ?? idx}_${entry.start ?? "s"}_${entry.end ?? "e"}`}
            entry={entry}
            theme={theme}
            teamColor={teamColor}
          />
        ))}
    </View>
  );
}

function RosterSection({ squad, sidelined, theme, teamColor }) {
  const sidelinedIds = useMemo(() => {
    const set = new Set();
    for (const s of sidelined ?? []) {
      if (s.player_id != null) set.add(s.player_id);
    }
    return set;
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
      if (sidelinedIds.has(entry.player_id)) {
        sections.Sidelined.push(entry);
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
          start: s.start_date,
          end: s.end_date,
          jersey_number: null,
          player: {
            id: s.player_id,
            name: s.player?.display_name ?? s.player?.name ?? "Unknown Player",
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
  }, [squad, sidelined, sidelinedIds]);

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
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No roster available</Text>
      </View>
    );
  }

  return (
    <View style={{ paddingBottom: 8 }}>
      <RosterGroup title="Attackers" players={grouped.Attackers} theme={theme} teamColor={teamColor} />
      <RosterGroup title="Midfielders" players={grouped.Midfielders} theme={theme} teamColor={teamColor} />
      <RosterGroup title="Defenders" players={grouped.Defenders} theme={theme} teamColor={teamColor} />
      <RosterGroup title="Goalkeepers" players={grouped.Goalkeepers} theme={theme} teamColor={teamColor} />
      <RosterGroup title="Sidelined" players={grouped.Sidelined} theme={theme} teamColor={teamColor} />
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
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
  headshot: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  headshotFallback: {
    width: 80,
    height: 80,
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
    left: -2,
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
    right: -2,
    width: 18,
    height: 12,
    borderRadius: 2,
  },
  posBadge: {
    position: "absolute",
    right: -3,
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
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function Top5TeamDetailScreen({ route, navigation }) {
  const { teamId, teamName } = route.params ?? {};
  const { theme, colors } = useTheme();

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
                tab === "Transfers" ||
                tab === "Roster";
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
                teamColor={resolvedColor}
                leagueNameMap={leagueNameMap}
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
              <RivalsSection teamInfo={teamInfo} theme={theme} />
              <CurrentSeasonsSection teamInfo={teamInfo} theme={theme} />
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
          {activeTab === "Transfers" && (
            <TransfersSection
              transfers={transfers}
              teamId={teamId}
              theme={theme}
              teamColor={resolvedColor}
            />
          )}
          {activeTab === "Roster" && (
            <RosterSection
              squad={squad}
              sidelined={sidelined}
              theme={theme}
              teamColor={resolvedColor}
            />
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

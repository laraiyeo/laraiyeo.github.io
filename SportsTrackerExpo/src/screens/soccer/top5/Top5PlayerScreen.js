"use strict";
import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
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
  Path as SvgPath,
  Line as SvgLine,
  Circle as SvgCircle,
  Text as SvgText,
} from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../../../context/ThemeContext";

const FOOTBALL_BASE = "https://laraiyeogithubio-production-08da.up.railway.app";
const CACHE_TTL = 60 * 60 * 1000;

const { width } = Dimensions.get("window");

const TABS = ["Info", "Matches", "Stats", "Seasons"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPlaceholder(uri) {
  return !uri || uri.includes("placeholder");
}

function getTextOnColor(hex) {
  if (!hex) return "#fff";
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#000" : "#fff";
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

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00Z");
  if (isNaN(d)) return null;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
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

function getAge(dateStr) {
  if (!dateStr) return null;
  const dob = new Date(dateStr + "T00:00:00Z");
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatTenure(start, end) {
  const fmt = (d) => {
    if (!d) return null;
    const parts = d.split("-");
    return parts[0]; // just year
  };
  const s = fmt(start);
  const e = fmt(end);
  if (!s && !e) return null;
  if (!e) return `${s} – Present`;
  return `${s} – ${e}`;
}

const DETAILED_POS_MAP = {
  // Goalkeeper
  Goalkeeper: "GK",
  // Centre-backs / Defenders
  "Centre Back": "CB",
  "Left Back": "LB",
  "Right Back": "RB",
  "Left Wing": "LW",
  "Right Wing": "RW",
  Sweeper: "SW",
  // Defensive Mid
  "Defensive Midfielder": "DM",
  "Central Midfielder": "CM",
  "Left Midfielder": "LM",
  "Right Midfielder": "RM",
  "Attacking Midfielder": "AM",
  // Wingers / Forwards
  "Left Winger": "LW",
  "Right Winger": "RW",
  "Second Striker": "SS",
  "Centre Forward": "CF",
  "Left Wing Forward": "LW",
  "Right Wing Forward": "RW",
  Striker: "ST",
  // Fallback buckets
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
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

const STAT_ABBR_MAP = {
  appearances: "APP",
  goals: "GLS",
  assists: "AST",
  "minutes played": "MP",
  yellowcards: "YC",
  "yellow cards": "YC",
  redcards: "RC",
  "red cards": "RC",
  "clean sheets": "CS",
  cleansheets: "CS",
  "goals conceded": "GC",
  rating: "RTG",
  "shots total": "SHT",
  "shots on target": "SOT",
  passes: "PAS",
  "key passes": "KP",
  dribbles: "DRB",
  tackles: "TKL",
  interceptions: "INT",
  "fouls committed": "FC",
  offsides: "OFF",
  "team wins": "TW",
};

const STAT_PRIORITY = [
  "appearances",
  "goals",
  "assists",
  "minutes played",
  "yellowcards",
  "redcards",
  "clean sheets",
  "cleansheets",
  "goals conceded",
  "rating",
  "shots total",
  "passes",
  "teamwins",
];

function getStatAbbr(typeName) {
  if (!typeName) return "?";
  return (
    STAT_ABBR_MAP[typeName.toLowerCase()] ?? typeName.slice(0, 3).toUpperCase()
  );
}

// ─── Ratings Tracker constants ───────────────────────────────────────────────

const RT_CHART_H = 180;
const RT_PAD = { top: 28, bottom: 30, left: 28, right: 10 };
const RT_RATING_MIN = 4.0;
const RT_RATING_MAX = 10.0;

function getRatingColor(r) {
  if (r <= 6.0) return "#dc3545";
  if (r <= 7.0) return "#ffbf00";
  if (r <= 8.0) return "#28a745";
  return "#8b5cf6";
}

// ─── Info Tab Components ───────────────────────────────────────────────────────

function InfoCard({ title, children, theme }) {
  return (
    <View
      style={[
        iStyles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      {title ? (
        <Text style={[iStyles.cardTitle, { color: theme.textSecondary }]}>
          {title.toUpperCase()}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

function InfoRow({ label, value, theme, last }) {
  if (!value) return null;
  return (
    <View
      style={[
        iStyles.row,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
        },
      ]}
    >
      <Text style={[iStyles.rowLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
      <Text style={[iStyles.rowValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

function PlayerSectionBubble({ title, theme, accentColor, children }) {
  return (
    <View
      style={[
        iStyles.sbBubble,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View
        style={[iStyles.sbBubbleTitle, { borderBottomColor: theme.border }]}
      >
        <View
          style={[iStyles.sbBubbleAccent, { backgroundColor: accentColor }]}
        />
        <Text style={[iStyles.sbBubbleTitleText, { color: theme.text }]}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function PlayerTeamRow({ stint, last, theme, navigation }) {
  const team = stint.team ?? {};
  const logoUri = team.image_path;
  const showLogo = logoUri && !isPlaceholder(logoUri);
  const accentColor = team.colorPrimary ?? "#888";
  const teamBorderColor = team.colorPrimary ?? null;
  const startText = stint.start ? formatLongDate(stint.start) : null;
  const endText = stint.end ? formatLongDate(stint.end) : null;
  const isCurrent =
    stint.end === null || stint.end === undefined || stint.end >= getTodayStr();

  const inner = (
    <View
      style={[
        iStyles.pTeamRow,
        { borderBottomColor: last ? "transparent" : theme.border },
        teamBorderColor
          ? { borderLeftWidth: 3, borderLeftColor: teamBorderColor }
          : null,
      ]}
    >
      <View
        style={[iStyles.pTeamLogo, { backgroundColor: accentColor + "22" }]}
      >
        {showLogo ? (
          <Image
            source={{ uri: logoUri }}
            style={{ width: 36, height: 36 }}
            resizeMode="contain"
          />
        ) : (
          <Text style={[iStyles.pTeamLogoInitial, { color: accentColor }]}>
            {(team.name ?? "?")[0]}
          </Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[iStyles.pTeamName, { color: theme.text }]}
          numberOfLines={1}
        >
          {team.name ?? "Unknown Team"}
        </Text>
        <Text
          style={[iStyles.pTeamTenure, { color: theme.textSecondary }]}
          numberOfLines={1}
        >
          {startText ?? "—"}
          {" → "}
          {isCurrent ? (
            <Text style={{ color: "#22c55e", fontWeight: "700" }}>Present</Text>
          ) : (
            (endText ?? "—")
          )}
        </Text>
      </View>
      {navigation && team.id != null && (
        <Text style={[iStyles.pTeamArrow, { color: theme.textSecondary }]}>
          ›
        </Text>
      )}
    </View>
  );

  if (navigation && team.id != null) {
    return (
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() =>
          navigation.navigate("Top5TeamDetail", {
            teamId: team.id,
            teamName: team.name,
          })
        }
      >
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

function CurrentSeasonCard({ stat, theme, isDarkMode, accentColor }) {
  const league = stat.season?.league ?? {};
  const team = stat.team ?? {};
  const teamColor = team.colorPrimary ?? accentColor;
  const leagueLogo = !isPlaceholder(league.image_path)
    ? league.image_path
    : null;
  const teamLogo = !isPlaceholder(team.image_path) ? team.image_path : null;

  const details = (stat.details ?? [])
    .filter((d) => d.value?.total != null)
    .sort((a, b) => {
      const ai = STAT_PRIORITY.indexOf((a.type?.name ?? "").toLowerCase());
      const bi = STAT_PRIORITY.indexOf((b.type?.name ?? "").toLowerCase());
      if (ai < 0 && bi < 0) return 0;
      if (ai < 0) return 1;
      if (bi < 0) return -1;
      return ai - bi;
    })
    .slice(0, 8);

  if (!details.length) return null;

  return (
    <View
      style={[
        iStyles.csCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={iStyles.csTitleRow}>
        <Text style={[iStyles.csTitleLabel, { color: theme.textSecondary }]}>
          CURRENT SEASON
        </Text>
        <View style={iStyles.csLeagueRow}>
          {leagueLogo ? (
            <Image
              source={{ uri: leagueLogo }}
              style={[
                iStyles.csLeagueLogo,
                {
                  tintColor:
                    (league.id === 8 || league.id === 2) && isDarkMode ? theme.text : undefined,
                },
              ]}
              resizeMode="contain"
            />
          ) : null}
          {league.name ? (
            <Text
              style={[iStyles.csLeagueName, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {league.name}
            </Text>
          ) : null}
        </View>
      </View>

      {stat.season?.name ? (
        <Text style={[iStyles.csSeasonName, { color: theme.text }]}>
          {stat.season.name}
        </Text>
      ) : null}

      <View style={iStyles.csStatsGrid}>
        {details.map((d, i) => (
          <View key={i} style={iStyles.csStatItem}>
            <Text style={[iStyles.csStatValue, { color: theme.text }]}>
              {d.value.total}
            </Text>
            <Text style={[iStyles.csStatLabel, { color: theme.textSecondary }]}>
              {getStatAbbr(d.type?.name)}
            </Text>
          </View>
        ))}
      </View>

      <View style={[iStyles.csTeamFooter, { borderTopColor: teamColor }]}>
        {teamLogo ? (
          <Image
            source={{ uri: teamLogo }}
            style={iStyles.csTeamFooterLogo}
            resizeMode="contain"
          />
        ) : (
          <View
            style={[
              iStyles.csTeamFooterLogoPlaceholder,
              { backgroundColor: teamColor + "30" },
            ]}
          >
            <Text style={[iStyles.csTeamFooterInitial, { color: teamColor }]}>
              {(team.name ?? "?")[0]}
            </Text>
          </View>
        )}
        <Text
          style={[iStyles.csTeamFooterName, { color: theme.textSecondary }]}
          numberOfLines={1}
        >
          {team.name ?? ""}
        </Text>
      </View>
    </View>
  );
}

function TrophiesSection({ trophies, theme, accentColor, isDarkMode }) {
  if (!trophies?.length) return null;

  const leagueMap = new Map();
  for (const t of trophies) {
    const lid = t.league?.id ?? "unknown";
    if (!leagueMap.has(lid)) {
      leagueMap.set(lid, { league: t.league, entries: [] });
    }
    leagueMap.get(lid).entries.push(t);
  }

  return (
    <InfoCard title="Trophies" theme={theme}>
      {[...leagueMap.values()].map((lg) => {
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
        return (
          <View
            key={lg.league?.id ?? "unknown"}
            style={[
              iStyles.trLeagueCard,
              { backgroundColor: theme.background, borderColor: theme.border },
            ]}
          >
            <View style={iStyles.trLeagueHeader}>
              {lg.league?.image_path && !isPlaceholder(lg.league.image_path) ? (
                <Image
                  source={{ uri: lg.league.image_path }}
                  style={[iStyles.trLeagueLogo, { tintColor: (lg.league.name === "Premier League" || lg.league.name === "Champions League" ) && isDarkMode ? theme.text : undefined }]}
                  resizeMode="contain"
                />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text
                  style={[iStyles.trLeagueName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {lg.league?.name ?? "Unknown League"}
                </Text>
              </View>
            </View>
            {subKeys.map((tname) => {
              const group = subMap.get(tname);
              const sortedGroup = [...group].sort((a, b) => {
                const ay = parseInt((a.season?.name ?? "0").split("/")[0], 10);
                const by = parseInt((b.season?.name ?? "0").split("/")[0], 10);
                return by - ay;
              });
              const seasons = sortedGroup
                .map((t) => t.season?.name)
                .filter(Boolean)
                .join(" · ");
              return (
                <View
                  key={tname}
                  style={[
                    iStyles.trTrophyRow,
                    { borderTopColor: theme.border },
                  ]}
                >
                  <View
                    style={[
                      iStyles.trTrophyCount,
                      { backgroundColor: (accentColor ?? "#888") + "22" },
                    ]}
                  >
                    <Text
                      style={[iStyles.trTrophyCountText, { color: theme.text }]}
                    >
                      {group.length}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[iStyles.trTrophyName, { color: theme.text }]}>
                      {tname}
                    </Text>
                    <Text
                      style={[
                        iStyles.trTrophySeasons,
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
      <View style={{ height: 8 }} />
    </InfoCard>
  );
}

function PlayerTeamsBubble({ teams, theme, accentColor, navigation }) {
  if (!teams?.length) return null;

  const sorted = [...teams].sort((a, b) =>
    (b.start ?? "").localeCompare(a.start ?? ""),
  );

  return (
    <PlayerSectionBubble title="Teams" theme={theme} accentColor={accentColor}>
      {sorted.map((stint, i) => (
        <PlayerTeamRow
          key={stint.id ?? i}
          stint={stint}
          last={i === sorted.length - 1}
          theme={theme}
          navigation={navigation}
        />
      ))}
    </PlayerSectionBubble>
  );
}

// ─── Seasons Tab Components ──────────────────────────────────────────────────

const SE_COL_W = 42;

function getSeasonStat(details, ...names) {
  for (const name of names) {
    const d = details.find(
      (d) => (d.type?.name ?? "").toLowerCase() === name.toLowerCase(),
    );
    if (d?.value != null) {
      if (d.value.total != null) return d.value.total;
      if (d.value.average != null) return d.value.average;
      if (typeof d.value === "number") return d.value;
    }
  }
  return null;
}

function PlayerCareerStatsBubble({ statistics, isGK, theme, accentColor }) {
  const totals = useMemo(() => {
    let apps = 0,
      goals = 0,
      penGoals = 0,
      assists = 0,
      mp = 0,
      gc = 0,
      cs = 0;
    let ratingSum = 0,
      ratingCount = 0;
    for (const s of statistics) {
      const d = s.details ?? [];
      const get = (...ns) => getSeasonStat(d, ...ns);
      const rating = get("Rating", "rating");
      if (rating != null) {
        ratingSum += Number(rating);
        ratingCount++;
      }
      const a = get("Appearances", "appearances", "Season Appearances");
      if (a != null) apps += a;
      const g = get("Goals", "goals");
      if (g != null) goals += g;
      const gDetail = d.find(
        (x) => (x.type?.name ?? "").toLowerCase() === "goals",
      );
      if (gDetail?.value?.penalties != null)
        penGoals += gDetail.value.penalties;
      const ast = get("Assists", "assists");
      if (ast != null) assists += ast;
      const m = get("Minutes Played", "minutes played");
      if (m != null) mp += m;
      const gcv = get("Goals Conceded", "goals conceded", "Goalsconceded");
      if (gcv != null) gc += gcv;
      const csv = get("Clean Sheets", "clean sheets", "Cleansheets");
      if (csv != null) cs += csv;
    }
    return {
      apps,
      goals,
      penGoals,
      assists,
      mp,
      gc,
      cs,
      avgRating: ratingCount > 0 ? ratingSum / ratingCount : null,
    };
  }, [statistics]);

  const rtgStr = totals.avgRating != null ? totals.avgRating.toFixed(1) : "—";
  const rtgColor =
    totals.avgRating != null ? getRatingColor(totals.avgRating) : null;
  const glsStr =
    totals.penGoals > 0
      ? `${totals.goals} (${totals.penGoals})`
      : String(totals.goals);

  const cells = isGK
    ? [
        { label: "RTG", value: rtgStr, color: rtgColor },
        { label: "GC", value: String(totals.gc) },
        { label: "CS", value: String(totals.cs) },
        { label: "APP", value: String(totals.apps) },
        { label: "MP", value: String(totals.mp) },
      ]
    : [
        { label: "RTG", value: rtgStr, color: rtgColor },
        { label: "GLS", value: glsStr },
        { label: "AST", value: String(totals.assists) },
        { label: "APP", value: String(totals.apps) },
        { label: "MP", value: String(totals.mp) },
      ];

  return (
    <PlayerSectionBubble
      title="Career Stats"
      theme={theme}
      accentColor={accentColor}
    >
      <View style={seStyles.careerRow}>
        {cells.map(({ label, value, color }) => (
          <View key={label} style={seStyles.careerCell}>
            <Text
              allowFontScaling={false}
              style={[seStyles.careerValue, { color: color ?? theme.text }]}
            >
              {value}
            </Text>
            <Text
              allowFontScaling={false}
              style={[seStyles.careerLabel, { color: theme.textSecondary }]}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
    </PlayerSectionBubble>
  );
}

function SeasonStatRow({ stat, isGK, last, theme }) {
  const team = stat.team ?? {};
  const teamColor = team.colorPrimary ?? null;
  const logoUri = team.image_path;
  const showLogo = logoUri && !isPlaceholder(logoUri);
  const d = stat.details ?? [];
  const get = (...ns) => getSeasonStat(d, ...ns);

  const rating = get("Rating", "rating");
  const app = get("Appearances", "appearances", "Season Appearances");
  const mp = get("Minutes Played", "minutes played");
  const goals = get("Goals", "goals");
  const gDetail = d.find((x) => (x.type?.name ?? "").toLowerCase() === "goals");
  const penGoals = gDetail?.value?.penalties ?? null;
  const assists = get("Assists", "assists");
  const gc = get("Goals Conceded", "goals conceded", "Goalsconceded");
  const cs = get("Clean Sheets", "clean sheets", "Cleansheets");

  const fmt = (v) => (v != null ? String(v) : "—");
  const fmtRtg = (v) => (v != null ? Number(v).toFixed(1) : "—");
  const glsStr =
    goals != null && penGoals ? `${goals} (${penGoals})` : fmt(goals);
  const col1 = isGK ? fmt(gc) : glsStr;
  const col2 = isGK ? fmt(cs) : fmt(assists);

  const jersey = stat.jersey_number != null ? `#${stat.jersey_number}` : null;
  const teamLabel = [team.name, jersey].filter(Boolean).join(" · ");

  return (
    <View
      style={[
        seStyles.row,
        { borderBottomColor: last ? "transparent" : theme.border },
        teamColor ? { borderLeftWidth: 3, borderLeftColor: teamColor } : null,
      ]}
    >
      <View style={seStyles.rowLeft}>
        <View
          style={[
            seStyles.rowLogo,
            { backgroundColor: (teamColor ?? "#888") + "22" },
          ]}
        >
          {showLogo ? (
            <Image
              source={{ uri: logoUri }}
              style={seStyles.rowLogoImg}
              resizeMode="contain"
            />
          ) : (
            <Text
              style={[seStyles.rowLogoInitial, { color: teamColor ?? "#888" }]}
            >
              {(team.name ?? "?")[0]}
            </Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text
            allowFontScaling={false}
            style={[seStyles.rowSeasonName, { color: theme.text }]}
            numberOfLines={1}
          >
            {stat.season?.name ?? "—"}
          </Text>
          <Text
            allowFontScaling={false}
            style={[seStyles.rowTeamName, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {teamLabel}
          </Text>
        </View>
      </View>
      <View style={seStyles.rowStats}>
        {[
          {
            v: fmtRtg(rating),
            color:
              rating != null ? getRatingColor(rating) : theme.textSecondary,
          },
          { v: col1 },
          { v: col2 },
          { v: fmt(app) },
          { v: fmt(mp) },
        ].map(({ v, color }, i) => (
          <Text
            key={i}
            allowFontScaling={false}
            style={[
              seStyles.rowStat,
              { color: color ?? theme.text, width: SE_COL_W },
            ]}
          >
            {v}
          </Text>
        ))}
      </View>
    </View>
  );
}

function PlayerSeasonsBubble({ statistics, isGK, theme, accentColor }) {
  if (!statistics?.length) return null;
  const sorted = [...statistics].sort((a, b) =>
    (b.season?.name ?? "").localeCompare(a.season?.name ?? ""),
  );
  const headers = isGK
    ? ["RTG", "GC", "CS", "APP", "MP"]
    : ["RTG", "GLS", "AST", "APP", "MP"];
  return (
    <PlayerSectionBubble
      title="Season Stats"
      theme={theme}
      accentColor={accentColor}
    >
      <View style={[seStyles.headerRow, { borderBottomColor: theme.border }]}>
        <Text style={[seStyles.headerLeft, { color: theme.textSecondary }]}>
          Season
        </Text>
        {headers.map((h) => (
          <Text
            key={h}
            allowFontScaling={false}
            style={[
              seStyles.headerStat,
              { color: theme.textSecondary, width: SE_COL_W },
            ]}
          >
            {h}
          </Text>
        ))}
      </View>
      {sorted.map((s, i) => (
        <SeasonStatRow
          key={s.season_id ?? i}
          stat={s}
          isGK={isGK}
          last={i === sorted.length - 1}
          theme={theme}
        />
      ))}
    </PlayerSectionBubble>
  );
}

// ─── Match Card (shared by Matches tab + Stats tab best-game cards) ────────────

function MatchCard({
  fixture,
  playerTeamId,
  playerTeamName,
  isGK,
  theme,
  accentColor,
  topStat,
  embedded,
}) {
  const navigation = useNavigation();
  const [cardSz, setCardSz] = useState({ w: 0, h: 0 });
  const participants = fixture.participants ?? [];
  const details = fixture.details ?? [];

  const getStat = (names) => {
    const targets = Array.isArray(names) ? names : [names];
    for (const n of targets) {
      const d = details.find(
        (d) => (d.type?.name ?? "").toLowerCase() === n.toLowerCase(),
      );
      const v = d?.data?.value;
      if (v != null && typeof v === "number") return v;
    }
    return null;
  };

  const playerP =
    participants.find(
      (p) =>
        (playerTeamId != null && p.id === playerTeamId) ||
        (playerTeamName && p.name === playerTeamName),
    ) ??
    participants[0] ??
    {};
  const oppP = participants.find((p) => p !== playerP) ?? participants[1] ?? {};

  const { homeColor: playerColor, awayColor: oppColor } = resolveMatchColors({
    homePrimary: playerP.colorPrimary,
    homeSecondary: playerP.colorSecondary,
    awayPrimary: oppP.colorPrimary,
    awaySecondary: oppP.colorSecondary,
    homeFallback: accentColor ?? "#888",
    awayFallback: "#888",
  });
  const isHome = playerP.meta?.location === "home";
  const playerWon = playerP.meta?.winner === true;
  const oppWon = oppP.meta?.winner === true;

  const playerLogo =
    playerP.image_path && !isPlaceholder(playerP.image_path)
      ? playerP.image_path
      : null;
  const oppLogo =
    oppP.image_path && !isPlaceholder(oppP.image_path) ? oppP.image_path : null;

  const dateStr = fixture.starting_at;
  const date = dateStr
    ? new Date(dateStr.replace(" ", "T").replace(/Z?$/, "Z"))
    : null;
  const dateLine1 = date
    ? date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : "--";
  const dateLine2 = date ? String(date.getUTCFullYear()) : "";

  const rating = getStat("rating");

  const buildStats = () => {
    const MAX = 4;
    const shownLabels = new Set();
    const slots = [];

    const push = (entry) => {
      if (slots.length >= MAX) return;
      shownLabels.add(entry.label);
      slots.push(entry);
    };

    // topStat always goes first (from StatBubble)
    if (topStat) push(topStat);

    const topLabel = topStat?.label;

    const goalLabel = isGK ? "GC" : "GLS";
    const goalValue = isGK
      ? getStat(["goals conceded", "goalsconceded", "Goals Conceded"])
      : getStat(["goals", "goal", "Goals"]);
    const assistLabel = isGK ? "CS" : "AST";
    const assistValue = isGK
      ? getStat(["clean sheet", "cleansheet", "cleansheets", "Clean Sheet"])
      : getStat(["assists", "assist", "Assists"]);
    const minValue = getStat([
      "minutes played",
      "minutesplayed",
      "Minutes Played",
    ]);

    const primaries = [];
    if (topLabel !== "RTG")
      primaries.push({
        label: "RTG",
        value: rating,
        format: (v) => v.toFixed(1),
        color: rating != null ? getRatingColor(rating) : null,
      });
    if (topLabel !== goalLabel)
      primaries.push({ label: goalLabel, value: goalValue });
    if (topLabel !== assistLabel)
      primaries.push({ label: assistLabel, value: assistValue });
    if (topLabel !== "MIN") primaries.push({ label: "MIN", value: minValue });

    // Push primaries that exist in the fixture
    for (const p of primaries) {
      if (p.value != null) push(p);
    }

    // Fill remaining slots with secondary stats (positive, not already shown)
    if (slots.length < MAX) {
      for (const d of details) {
        if (slots.length >= MAX) break;
        const n = d.type?.name;
        if (!n) continue;
        const v = d.data?.value;
        if (v == null || typeof v !== "number" || v <= 0) continue;
        if (n.toLowerCase() === "rating") continue;
        const abbr = getStatAbbr(n);
        if (shownLabels.has(abbr)) continue;
        const isPct = n.toLowerCase().includes("percent");
        push({
          label: abbr,
          value: v,
          format: isPct ? (val) => val.toFixed(0) + "%" : undefined,
        });
      }
    }

    return slots;
  };

  const stats = buildStats();

  let resultChar = "D";
  let resultBg = "#f59e0b";
  if (playerWon) {
    resultChar = "W";
    resultBg = "#22c55e";
  } else if (oppWon) {
    resultChar = "L";
    resultBg = "#dc3545";
  }

  const gradId =
    "mc_" +
    (fixture.starting_at ?? "x").replace(/[^0-9]/g, "") +
    (topStat?.label ?? "").replace(/[^a-zA-Z0-9]/g, "");

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={embedded ? null : mcStyles.cardWrap}
      onPress={() => {
        const homeP =
          participants.find((p) => p.meta?.location === "home") ??
          participants[0];
        const awayP =
          participants.find((p) => p.meta?.location === "away") ??
          participants[1];
        const homeShort = homeP.short_code ?? homeP.name.slice(0, 3).toUpperCase();
        const awayShort = awayP.short_code ?? awayP.name.slice(0, 3).toUpperCase();
        const fId = fixture.id;
        const hId = homeP?.id;
        const aId = awayP?.id;
        if (!fId || !hId || !aId) return;
        navigation.navigate("Top5GameDetail", {
          fixtureId: fId,
          homeTeamId: hId,
          awayTeamId: aId,
          matchTitle: `${homeShort} vs ${awayShort}`,
        });
      }}
    >
      <View
        onLayout={(e) =>
          setCardSz({
            w: e.nativeEvent.layout.width,
            h: e.nativeEvent.layout.height,
          })
        }
        style={[
          mcStyles.card,
          {
            backgroundColor: embedded ? "transparent" : theme.surface,
            borderRadius: embedded ? 0 : 12,
          },
        ]}
      >
        {/* Gradient */}
        {cardSz.w > 0 && (
          <Svg
            style={StyleSheet.absoluteFill}
            width={cardSz.w}
            height={cardSz.h}
            pointerEvents="none"
          >
            <Defs>
              <SvgLinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor={playerColor} stopOpacity="0.15" />
                <Stop offset="40%" stopColor={playerColor} stopOpacity="0" />
                <Stop offset="60%" stopColor={oppColor} stopOpacity="0" />
                <Stop offset="100%" stopColor={oppColor} stopOpacity="0.15" />
              </SvgLinearGradient>
            </Defs>
            <Rect width={cardSz.w} height={cardSz.h} fill={`url(#${gradId})`} />
          </Svg>
        )}

        {/* Main row */}
        <View style={mcStyles.cardInner}>
          {/* Left: date + player team logo */}
          <View style={mcStyles.leftCol}>
            <Text
              allowFontScaling={false}
              style={[mcStyles.dateText, { color: theme.textSecondary }]}
              numberOfLines={3}
            >
              {dateLine1}
              {"\n"}
              {dateLine2}
            </Text>
            {playerLogo ? (
              <Image
                source={{ uri: playerLogo }}
                style={mcStyles.leftLogo}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  mcStyles.leftLogoFallback,
                  { backgroundColor: playerColor + "33" },
                ]}
              >
                <Text
                  style={[
                    mcStyles.leftLogoFallbackText,
                    { color: playerColor },
                  ]}
                >
                  {(playerP.name ?? "?")[0]}
                </Text>
              </View>
            )}
          </View>

          {/* Middle: stat chips */}
          <View style={mcStyles.middle}>
            <View style={mcStyles.statsRow}>
            {stats?.length ? (
                stats.map((s, i) => (
                <View key={i} style={mcStyles.statChip}>
                    <Text
                    allowFontScaling={false}
                    style={[
                        mcStyles.chipValue,
                        { color: s.color ?? theme.text },
                    ]}
                    >
                    {s.value != null
                        ? s.format
                        ? s.format(s.value)
                        : String(s.value)
                        : "--"}
                    </Text>
                    <Text
                    allowFontScaling={false}
                    style={[
                        mcStyles.chipLabel,
                        { color: s.color ?? theme.textSecondary },
                    ]}
                    >
                    {s.label}
                    </Text>
                </View>
                ))
            ) : (
                <Text
                allowFontScaling={false}
                style={{ color: theme.text, fontWeight: "700", fontSize: 25 }}
                >
                On Bench
                </Text>
            )}
            </View>
          </View>

          {/* Right: W/L/D bubble */}
          <View style={[mcStyles.wldBubble, { backgroundColor: resultBg }]}>
            <Text style={mcStyles.wldText}>{resultChar}</Text>
          </View>
        </View>

        {/* Bottom: opponent row */}
        <View style={[mcStyles.oppRow, { borderTopColor: theme.border }]}>
          <Text
            allowFontScaling={false}
            style={[mcStyles.oppPrefix, { color: theme.textSecondary }]}
          >
            {isHome ? "vs" : "@"}
          </Text>
          {oppLogo ? (
            <Image
              source={{ uri: oppLogo }}
              style={mcStyles.oppLogo}
              resizeMode="contain"
            />
          ) : (
            <View
              style={[
                mcStyles.oppLogoFallback,
                { backgroundColor: oppColor + "33" },
              ]}
            >
              <Text style={[mcStyles.oppLogoFallbackText, { color: oppColor }]}>
                {(oppP.name ?? "?")[0]}
              </Text>
            </View>
          )}
          <Text
            allowFontScaling={false}
            style={[mcStyles.oppName, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {oppP.name ?? "Opponent"}
          </Text>
          {fixture.league?.name ? (
            <Text
              allowFontScaling={false}
              style={[
                mcStyles.oppLeague,
                { color: theme.textTertiary ?? theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {fixture.league.name}
            </Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function StatBubble({
  stat,
  theme,
  accentColor,
  playerTeamId,
  playerTeamName,
  isGK,
}) {
  const { name, total, perGame, mostInGame, bestFixture } = stat;
  const isInt = Number.isInteger(total);
  const totalStr = isInt ? String(total) : total.toFixed(1);
  const perGameStr = perGame < 1 ? perGame.toFixed(2) : perGame.toFixed(1);
  const mostStr = Number.isInteger(mostInGame)
    ? String(mostInGame)
    : mostInGame.toFixed(1);

  const isPct = name.toLowerCase().includes("percent");
  const topStat = {
    label: getStatAbbr(name),
    value: mostInGame,
    format: isPct
      ? (v) => v.toFixed(0) + "%"
      : Number.isInteger(mostInGame)
        ? undefined
        : (v) => v.toFixed(1),
  };

  return (
    <View
      style={[
        stStyles.bubble,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View
        style={[stStyles.bubbleTitleRow, { borderBottomColor: theme.border }]}
      >
        <View
          style={[stStyles.bubbleAccent, { backgroundColor: accentColor }]}
        />
        <Text style={[stStyles.bubbleTitle, { color: theme.text }]}>
          {name}
        </Text>
      </View>
      <View style={[stStyles.statRow, { borderBottomColor: theme.border }]}>
        <Text style={[stStyles.statLabel, { color: theme.textSecondary }]}>
          Total
        </Text>
        <Text style={[stStyles.statVal, { color: theme.text }]}>
          {totalStr}
        </Text>
      </View>
      <View style={[stStyles.statRow, { borderBottomColor: theme.border }]}>
        <Text style={[stStyles.statLabel, { color: theme.textSecondary }]}>
          Per Game
        </Text>
        <Text style={[stStyles.statVal, { color: theme.text }]}>
          {perGameStr}
        </Text>
      </View>
      <View style={stStyles.statRowLast}>
        <Text style={[stStyles.statLabel, { color: theme.textSecondary }]}>
          Most in a Game
        </Text>
        <Text style={[stStyles.statVal, { color: theme.text }]}>{mostStr}</Text>
      </View>
      {bestFixture ? (
        <View style={stStyles.gameCardWrap}>
          <MatchCard
            fixture={bestFixture}
            playerTeamId={playerTeamId}
            playerTeamName={playerTeamName}
            isGK={isGK}
            theme={theme}
            accentColor={accentColor}
            topStat={topStat}
          />
        </View>
      ) : null}
    </View>
  );
}

function RatingsTracker({
  ratingPoints,
  theme,
  accentColor,
  playerTeamId,
  playerTeamName,
  isGK,
}) {
  const n = ratingPoints.length;
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [chartW, setChartW] = useState(300);

  useEffect(() => {
    if (n > 0) setSelectedIdx(n - 1);
  }, [n]);

  const selected = ratingPoints[selectedIdx] ?? null;
  const innerW = Math.max(chartW - RT_PAD.left - RT_PAD.right, 1);
  const innerH = RT_CHART_H - RT_PAD.top - RT_PAD.bottom;

  const xFor = (i) =>
    RT_PAD.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2);
  const yFor = (r) =>
    RT_PAD.top +
    ((RT_RATING_MAX - r) / (RT_RATING_MAX - RT_RATING_MIN)) * innerH;

  const gridRatings = [5, 6, 7, 8, 9, 10];
  const xLabelStep = n <= 10 ? 1 : n <= 20 ? 2 : n <= 30 ? 3 : 5;

  const linePath =
    n > 0
      ? ratingPoints
          .map(
            (pt, i) =>
              `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(pt.rating).toFixed(1)}`,
          )
          .join(" ")
      : "";

  const selColor = selected ? getRatingColor(selected.rating) : accentColor;
  const selCy = selected ? yFor(selected.rating) : 0;
  const badgeCy = Math.max(selCy - 15, 14);

  const formatNavDate = (date) => {
    if (!date) return "--";
    const year = date.getUTCFullYear();
    const month = date.toLocaleDateString("en-US", {
      month: "short",
      timeZone: "UTC",
    });
    const day = date.getUTCDate();
    return `${year} ${month} ${day}`;
  };

  const avgRating =
    n > 0 ? ratingPoints.reduce((s, p) => s + p.rating, 0) / n : null;
  const avgColor = avgRating ? getRatingColor(avgRating) : accentColor;

  if (n === 0) return null;

  return (
    <View
      style={[
        rtStyles.container,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      {/* Title */}
      <View
        style={[
          rtStyles.titleRow,
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          },
        ]}
      >
        <Text
          allowFontScaling={false}
          style={[rtStyles.title, { color: theme.text }]}
        >
          RATINGS TRACKER
        </Text>
        {avgRating != null && (
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <Text
              allowFontScaling={false}
              style={{ color: avgColor, fontSize: 13, fontWeight: "800" }}
            >
              {avgRating.toFixed(1)}
            </Text>
            <Text
              allowFontScaling={false}
              style={{
                color: theme.text,
                fontSize: 11,
                fontWeight: "600",
                marginLeft: 3,
              }}
            >
              AVG
            </Text>
          </View>
        )}
      </View>

      {/* Chart */}
      <View
        onLayout={(e) => setChartW(e.nativeEvent.layout.width)}
        style={{ height: RT_CHART_H, marginHorizontal: 4 }}
      >
        {chartW > 0 && n > 0 && (
          <Svg width={chartW} height={RT_CHART_H}>
            <Defs>
              {n > 1 &&
                ratingPoints.slice(0, -1).map((pt, i) => (
                  <React.Fragment key={`rtGrads${i}`}>
                    <SvgLinearGradient
                      id={`rtSeg${i}`}
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="0%"
                    >
                      <Stop
                        offset="0%"
                        stopColor={getRatingColor(pt.rating)}
                        stopOpacity="0.28"
                      />
                      <Stop
                        offset="100%"
                        stopColor={getRatingColor(ratingPoints[i + 1].rating)}
                        stopOpacity="0.28"
                      />
                    </SvgLinearGradient>
                    <SvgLinearGradient
                      id={`rtLine${i}`}
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="0%"
                    >
                      <Stop
                        offset="0%"
                        stopColor={getRatingColor(pt.rating)}
                        stopOpacity="1"
                      />
                      <Stop
                        offset="100%"
                        stopColor={getRatingColor(ratingPoints[i + 1].rating)}
                        stopOpacity="1"
                      />
                    </SvgLinearGradient>
                  </React.Fragment>
                ))}
            </Defs>

            {/* Axes */}
            <SvgLine
              x1={RT_PAD.left}
              y1={RT_PAD.top - 4}
              x2={RT_PAD.left}
              y2={RT_CHART_H - RT_PAD.bottom}
              stroke={theme.border}
              strokeWidth={1}
            />
            <SvgLine
              x1={RT_PAD.left}
              y1={RT_CHART_H - RT_PAD.bottom}
              x2={chartW - RT_PAD.right}
              y2={RT_CHART_H - RT_PAD.bottom}
              stroke={theme.border}
              strokeWidth={1}
            />

            {/* Horizontal grid lines + Y labels */}
            {gridRatings.map((r) => (
              <React.Fragment key={`ryg${r}`}>
                <SvgLine
                  x1={RT_PAD.left}
                  y1={yFor(r)}
                  x2={chartW - RT_PAD.right}
                  y2={yFor(r)}
                  stroke={theme.border}
                  strokeWidth={0.7}
                  strokeDasharray="3,4"
                />
                <SvgText
                  x={RT_PAD.left - 4}
                  y={yFor(r) + 4}
                  textAnchor="end"
                  fontSize={9}
                  fill={theme.textTertiary ?? theme.textSecondary}
                >
                  {r}
                </SvgText>
              </React.Fragment>
            ))}

            {/* Area fill — per-segment trapezoids */}
            {n > 1 &&
              ratingPoints.slice(0, -1).map((pt, i) => {
                const next = ratingPoints[i + 1];
                const x0 = xFor(i);
                const y0 = yFor(pt.rating);
                const x1 = xFor(i + 1);
                const y1 = yFor(next.rating);
                const base = RT_CHART_H - RT_PAD.bottom;
                const d = `M${x0.toFixed(1)},${y0.toFixed(1)} L${x1.toFixed(1)},${y1.toFixed(1)} L${x1.toFixed(1)},${base.toFixed(1)} L${x0.toFixed(1)},${base.toFixed(1)}Z`;
                return <SvgPath key={i} d={d} fill={`url(#rtSeg${i})`} />;
              })}

            {/* Line — per-segment gradient */}
            {n > 1 &&
              ratingPoints.slice(0, -1).map((pt, i) => {
                const next = ratingPoints[i + 1];
                const d = `M${xFor(i).toFixed(1)},${yFor(pt.rating).toFixed(1)} L${xFor(i + 1).toFixed(1)},${yFor(next.rating).toFixed(1)}`;
                return (
                  <SvgPath
                    key={i}
                    d={d}
                    fill="none"
                    stroke={`url(#rtLine${i})`}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                );
              })}

            {/* Selected vertical indicator */}
            {selected && (
              <SvgLine
                x1={xFor(selectedIdx)}
                y1={RT_PAD.top - 4}
                x2={xFor(selectedIdx)}
                y2={RT_CHART_H - RT_PAD.bottom}
                stroke={selColor}
                strokeWidth={1.5}
                strokeOpacity={0.6}
              />
            )}

            {/* Data point circles — colored by rating bracket */}
            {ratingPoints.map((pt, i) => {
              const ptColor = getRatingColor(pt.rating);
              const isSel = i === selectedIdx;
              return (
                <SvgCircle
                  key={i}
                  cx={xFor(i)}
                  cy={yFor(pt.rating)}
                  r={isSel ? 9 : 5}
                  fill={isSel ? ptColor : theme.surface}
                  stroke={ptColor}
                  strokeWidth={isSel ? 0 : 1.5}
                  onPress={() => setSelectedIdx(i)}
                />
              );
            })}

            {/* Rating badge above selected point */}
            {selected && (
              <React.Fragment>
                <SvgCircle
                  cx={xFor(selectedIdx)}
                  cy={badgeCy}
                  r={11}
                  fill={selColor}
                />
                <SvgText
                  x={xFor(selectedIdx)}
                  y={badgeCy + 4}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight="700"
                  fill={getTextOnColor(selColor)}
                >
                  {selected.rating.toFixed(1)}
                </SvgText>
              </React.Fragment>
            )}

            {/* X-axis date labels */}
            {ratingPoints.map((pt, i) => {
              const isFirst = i === 0;
              const isLast = i === n - 1;
              const isStep = i % xLabelStep === 0;
              const tooCloseToEnd = !isLast && n - 1 - i < xLabelStep;
              const showLabel = isFirst || isLast || (isStep && !tooCloseToEnd);
              if (!showLabel) return null;
              const label = pt.date
                ? pt.date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })
                : "";
              return (
                <SvgText
                  key={`rxl${i}`}
                  x={xFor(i)}
                  y={RT_CHART_H - RT_PAD.bottom + 14}
                  textAnchor={
                    i === 0 ? "start" : i === n - 1 ? "end" : "middle"
                  }
                  fontSize={9}
                  fill={
                    i === selectedIdx
                      ? getRatingColor(pt.rating)
                      : (theme.textTertiary ?? theme.textSecondary)
                  }
                  fontWeight={i === selectedIdx ? "700" : "400"}
                >
                  {label}
                </SvgText>
              );
            })}
          </Svg>
        )}
      </View>

      {/* Navigation row */}
      <View style={[rtStyles.navRow, { borderTopColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => setSelectedIdx((v) => Math.max(0, v - 1))}
          disabled={selectedIdx === 0}
          style={rtStyles.navArrowBtn}
          activeOpacity={0.6}
        >
          <Text
            style={[
              rtStyles.navArrowText,
              { color: selectedIdx === 0 ? theme.border : theme.text },
            ]}
          >
            ‹
          </Text>
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: "center" }}>
          <Text
            allowFontScaling={false}
            style={[rtStyles.navDate, { color: theme.text }]}
          >
            {selected?.date ? formatNavDate(selected.date) : "--"}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => setSelectedIdx((v) => Math.min(n - 1, v + 1))}
          disabled={selectedIdx === n - 1}
          style={rtStyles.navArrowBtn}
          activeOpacity={0.6}
        >
          <Text
            style={[
              rtStyles.navArrowText,
              { color: selectedIdx === n - 1 ? theme.border : theme.text },
            ]}
          >
            ›
          </Text>
        </TouchableOpacity>
      </View>

      {/* Selected fixture match card */}
      {selected?.fixture && (
        <MatchCard
          fixture={selected.fixture}
          playerTeamId={playerTeamId}
          playerTeamName={playerTeamName}
          isGK={isGK}
          theme={theme}
          accentColor={accentColor}
        />
      )}
      <View style={{ height: 14 }} />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function Top5PlayerScreen({ route, navigation }) {
  const { playerId, playerName: routeName } = route.params ?? {};
  const { theme, colors, isDarkMode } = useTheme();

  const [playerData, setPlayerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("Info");
  const [headerHeight, setHeaderHeight] = useState(160);
  const [matchPage, setMatchPage] = useState(0);
  const [statsPage, setStatsPage] = useState(0);

  const scrollY = useRef(new Animated.Value(0)).current;
  const cacheKey = `top5:player:${playerId}:v1`;

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
              setPlayerData(cached);
              setLoading(false);
              return;
            }
          }
        }
        const res = await fetch(`${FOOTBALL_BASE}/football/player/${playerId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const d = json.data ?? json;
        await AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({ data: d, fetchedAt: Date.now() }),
        );
        setPlayerData(d);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [playerId, cacheKey],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    scrollY.setValue(0);
    setActiveTab("Info");
  }, [playerId]);

  const player = playerData ?? {};
  const teams = player.teams ?? [];
  const today = getTodayStr();

  // Current domestic team (end is null/future)
  const currentTeam =
    teams.find(
      (s) => s.team?.type === "domestic" && (!s.end || s.end >= today),
    ) ??
    teams.find((s) => !s.end || s.end >= today) ??
    null;

  const accentColor = currentTeam?.team?.colorPrimary || colors.primary;

  const displayName =
    player.name ||
    `${player.firstname || ""} ${player.lastname || ""}`.trim() ||
    routeName ||
    "Player";

  const posName =
    player.detailedposition?.name ?? player.position?.name ?? null;
  const posAbbr = getPosAbbr(posName);

  const dob = player.date_of_birth;
  const dobFormatted = formatDate(dob);
  const age = getAge(dob);

  const preferredFoot =
    player.metadata?.find((m) => m.type?.name === "Preferred Foot")?.values ??
    null;

  const currentYearStr = new Date().getFullYear().toString();
  const currentSeason =
    (player.statistics ?? []).find((s) =>
      (s.season?.name ?? "").includes(currentYearStr),
    ) ?? null;

  const ratingPoints = useMemo(() => {
    const pts = [];
    for (const entry of player.latest ?? []) {
      const f = entry.fixture;
      if (!f) continue;
      const ratingDetail = (f.details ?? []).find(
        (d) => (d.type?.name ?? "").toLowerCase() === "rating",
      );
      const rawRating = ratingDetail?.data?.value;
      if (rawRating == null) continue;
      const rating = Math.round(rawRating * 10) / 10;
      const dateStr = f.starting_at;
      const date = dateStr
        ? new Date(dateStr.replace(" ", "T").replace(/Z?$/, "Z"))
        : null;
      pts.push({ rating, date, fixture: f });
    }
    pts.sort((a, b) => (a.date ?? 0) - (b.date ?? 0));
    return pts;
  }, [player.latest]);

  const bestRatedPt = useMemo(() => {
    if (!ratingPoints.length) return null;
    return ratingPoints.reduce(
      (best, pt) => (pt.rating > best.rating ? pt : best),
      ratingPoints[0],
    );
  }, [ratingPoints]);

  const fixtureStats = useMemo(() => {
    const latest = player.latest ?? [];
    const nFixtures = latest.length;
    const map = new Map();
    for (const entry of latest) {
      const f = entry.fixture;
      if (!f) continue;
      for (const d of f.details ?? []) {
        const name = d.type?.name;
        if (!name) continue;
        if (name.toLowerCase() === "rating") continue;
        const val = d.data?.value;
        if (val == null || typeof val !== "number") continue;
        if (!map.has(name)) map.set(name, { name, entries: [] });
        map.get(name).entries.push({ value: val, fixture: f });
      }
    }
    return [...map.values()]
      .map(({ name, entries }) => {
        const positive = entries.filter((e) => e.value > 0);
        if (!positive.length) return null;
        const total = positive.reduce((s, e) => s + e.value, 0);
        const best = positive.reduce(
          (b, e) => (e.value > b.value ? e : b),
          positive[0],
        );
        const perGame = nFixtures > 0 ? total / nFixtures : 0;
        return {
          name,
          total,
          perGame,
          mostInGame: best.value,
          bestFixture: best.fixture,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [player.latest]);

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

  const imgUri = player.image_path;
  const showImg = !isPlaceholder(imgUri);
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={accentColor} />
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
          onPress={() => load(true)}
          style={[styles.retryBtn, { backgroundColor: accentColor }]}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Info Tab ────────────────────────────────────────────────────────────────

  function renderSeasons() {
    const isGK = posName === "Goalkeeper";
    const statistics = player.statistics ?? [];
    return (
      <View style={{ paddingBottom: 8 }}>
        {statistics.length ? (
          <PlayerCareerStatsBubble
            statistics={statistics}
            isGK={isGK}
            theme={theme}
            accentColor={accentColor}
          />
        ) : null}
        {statistics.length ? (
          <PlayerSeasonsBubble
            statistics={statistics}
            isGK={isGK}
            theme={theme}
            accentColor={accentColor}
          />
        ) : null}
        {teams.length ? (
          <PlayerTeamsBubble
            teams={teams}
            theme={theme}
            navigation={navigation}
            accentColor={accentColor}
          />
        ) : null}
      </View>
    );
  }

  function renderMatches() {
    const latest = player.latest ?? [];
    const isGK = posName === "Goalkeeper";
    const ptId = currentTeam?.team?.id ?? null;
    const ptName = currentTeam?.team?.name ?? null;
    if (!latest.length) {
      return (
        <View style={styles.centered}>
          <Text
            style={[styles.placeholderText, { color: theme.textSecondary }]}
          >
            No matches available
          </Text>
        </View>
      );
    }
    const MATCH_PAGE_SIZE = 10;
    const totalPages = Math.ceil(latest.length / MATCH_PAGE_SIZE);
    const pageEntries = latest.slice(
      matchPage * MATCH_PAGE_SIZE,
      (matchPage + 1) * MATCH_PAGE_SIZE,
    );
    return (
      <View style={{ paddingTop: 4, paddingBottom: 40 }}>
        {pageEntries.map((entry, idx) => (
          <MatchCard
            key={entry.fixture_id ?? idx}
            fixture={entry.fixture ?? {}}
            playerTeamId={ptId}
            playerTeamName={ptName}
            isGK={isGK}
            theme={theme}
            accentColor={accentColor}
          />
        ))}
        {totalPages > 1 && (
          <View style={mcStyles.pagination}>
            <TouchableOpacity
              style={[
                mcStyles.pageBtn,
                {
                  backgroundColor: theme.surface,
                  opacity: matchPage === 0 ? 0.35 : 1,
                },
              ]}
              disabled={matchPage === 0}
              onPress={() => setMatchPage((p) => p - 1)}
              activeOpacity={0.75}
            >
              <Text style={[mcStyles.pageBtnText, { color: accentColor }]}>
                ‹ Prev
              </Text>
            </TouchableOpacity>
            <Text style={[mcStyles.pageLabel, { color: theme.textSecondary }]}>
              {matchPage + 1} / {totalPages}
            </Text>
            <TouchableOpacity
              style={[
                mcStyles.pageBtn,
                {
                  backgroundColor: theme.surface,
                  opacity: matchPage === totalPages - 1 ? 0.35 : 1,
                },
              ]}
              disabled={matchPage === totalPages - 1}
              onPress={() => setMatchPage((p) => p + 1)}
              activeOpacity={0.75}
            >
              <Text style={[mcStyles.pageBtnText, { color: accentColor }]}>
                Next ›
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  function renderStats() {
    const isGK = posName === "Goalkeeper";
    const ptId = currentTeam?.team?.id ?? null;
    const ptName = currentTeam?.team?.name ?? null;
    if (!fixtureStats.length) {
      return (
        <View style={styles.centered}>
          <Text
            style={[styles.placeholderText, { color: theme.textSecondary }]}
          >
            No stats available
          </Text>
        </View>
      );
    }
    const STATS_PAGE_SIZE = 5;
    const totalStatsPages = Math.ceil(fixtureStats.length / STATS_PAGE_SIZE);
    const pageStats = fixtureStats.slice(
      statsPage * STATS_PAGE_SIZE,
      (statsPage + 1) * STATS_PAGE_SIZE,
    );
    return (
      <View style={{ paddingBottom: 8 }}>
        {pageStats.map((stat) => (
          <StatBubble
            key={stat.name}
            stat={stat}
            theme={theme}
            accentColor={accentColor}
            playerTeamId={ptId}
            playerTeamName={ptName}
            isGK={isGK}
          />
        ))}
        {totalStatsPages > 1 && (
          <View style={mcStyles.pagination}>
            <TouchableOpacity
              style={[
                mcStyles.pageBtn,
                {
                  backgroundColor: theme.surface,
                  opacity: statsPage === 0 ? 0.35 : 1,
                },
              ]}
              disabled={statsPage === 0}
              onPress={() => setStatsPage((p) => p - 1)}
              activeOpacity={0.75}
            >
              <Text style={[mcStyles.pageBtnText, { color: accentColor }]}>
                ‹ Prev
              </Text>
            </TouchableOpacity>
            <Text style={[mcStyles.pageLabel, { color: theme.textSecondary }]}>
              {statsPage + 1} / {totalStatsPages}
            </Text>
            <TouchableOpacity
              style={[
                mcStyles.pageBtn,
                {
                  backgroundColor: theme.surface,
                  opacity: statsPage === totalStatsPages - 1 ? 0.35 : 1,
                },
              ]}
              disabled={statsPage === totalStatsPages - 1}
              onPress={() => setStatsPage((p) => p + 1)}
              activeOpacity={0.75}
            >
              <Text style={[mcStyles.pageBtnText, { color: accentColor }]}>
                Next ›
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  function renderInfo() {
    const isGK = posName === "Goalkeeper";
    const ptId = currentTeam?.team?.id ?? null;
    const ptName = currentTeam?.team?.name ?? null;
    return (
      <View style={{ paddingBottom: 8 }}>
        {/* Current Season */}
        {currentSeason ? (
          <CurrentSeasonCard
            stat={currentSeason}
            theme={theme}
            isDarkMode={isDarkMode}
            accentColor={accentColor}
          />
        ) : null}

        {/* Best Rated Match */}
        {bestRatedPt ? (
          <View
            style={[
              bpStyles.bubble,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            {/* Title row */}
            <View style={bpStyles.titleRow}>
              <Text
                allowFontScaling={false}
                style={[bpStyles.title, { color: theme.text }]}
              >
                Best Performance
              </Text>
              <Text
                allowFontScaling={false}
                style={[
                  bpStyles.title,
                  { color: getRatingColor(bestRatedPt.rating) },
                ]}
              >
                {bestRatedPt.rating.toFixed(1)}
              </Text>
            </View>
            {/* Card fills the bottom of the bubble edge-to-edge */}
            <View
              style={[
                bpStyles.card,
                {
                  backgroundColor: theme.surfaceSecondary ?? theme.background,
                },
              ]}
            >
              <MatchCard
                fixture={bestRatedPt.fixture}
                playerTeamId={ptId}
                playerTeamName={ptName}
                isGK={isGK}
                theme={theme}
                accentColor={accentColor}
                embedded
              />
            </View>
          </View>
        ) : null}

        {/* Ratings Tracker */}
        <RatingsTracker
          ratingPoints={ratingPoints}
          theme={theme}
          accentColor={accentColor}
          playerTeamId={ptId}
          playerTeamName={ptName}
          isGK={isGK}
        />

        {/* Physical card */}
        {(() => {
          const hVal = player.height ? String(player.height).trim() : null;
          const wVal = player.weight ? String(player.weight).trim() : null;
          const fVal = preferredFoot ? String(preferredFoot).trim() : null;
          if (!hVal && !wVal && !fVal) return null;
          const physItems = [
            hVal ? { key: "h", value: `${hVal}cm`, label: "Height" } : null,
            wVal ? { key: "w", value: `${wVal}kg`, label: "Weight" } : null,
            fVal
              ? {
                  key: "f",
                  value: fVal.charAt(0).toUpperCase() + fVal.slice(1),
                  label: "Foot",
                }
              : null,
          ].filter(Boolean);
          return (
            <InfoCard title="Physical" theme={theme}>
              <View style={iStyles.physRow}>
                {physItems.map((item, idx) => (
                  <React.Fragment key={item.key}>
                    {idx > 0 && (
                      <View
                        style={[
                          iStyles.physDivider,
                          { backgroundColor: theme.border },
                        ]}
                      />
                    )}
                    <View style={iStyles.physItem}>
                      <Text style={[iStyles.physValue, { color: theme.text }]}>
                        {item.value}
                      </Text>
                      <Text
                        style={[
                          iStyles.physSubLabel,
                          { color: theme.textTertiary ?? theme.textSecondary },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            </InfoCard>
          );
        })()}

        {/* Trophies */}
        {player.trophies?.length ? (
          <TrophiesSection
            trophies={player.trophies}
            theme={theme}
            accentColor={accentColor}
            isDarkMode={isDarkMode}
          />
        ) : null}
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
            tintColor={accentColor}
          />
        }
      >
        {/* ── [0] HERO HEADER ──────────────────────────────────────────────── */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: accentColor + "22",
              borderBottomColor: accentColor,
            },
          ]}
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.headerMain}>
            <View
              style={[
                styles.headerHeadshotWrap,
                { backgroundColor: accentColor + "30" },
              ]}
            >
              {showImg ? (
                <Image
                  source={{ uri: imgUri }}
                  style={styles.headerHeadshot}
                  resizeMode="cover"
                />
              ) : (
                <Text
                  style={[
                    styles.headerInitials,
                    { color: getTextOnColor(accentColor) },
                  ]}
                >
                  {initials || "?"}
                </Text>
              )}
            </View>
            <View style={styles.headerTextBlock}>
              <Text
                allowFontScaling={false}
                style={[styles.headerName, { color: theme.text }]}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              {posName ? (
                <Text
                  allowFontScaling={false}
                  style={[styles.headerPos, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {posName}
                </Text>
              ) : null}
              <View style={styles.headerMeta}>
                {player.country?.image_path ? (
                  <Image
                    source={{ uri: player.country.image_path }}
                    style={styles.headerFlag}
                    resizeMode="contain"
                  />
                ) : null}
                {player.country?.name ? (
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.headerCountry,
                      { color: theme.textTertiary },
                    ]}
                    numberOfLines={1}
                  >
                    {player.country.name}
                    {age != null ? `  ·  Age ${age}` : ""}
                  </Text>
                ) : age != null ? (
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.headerCountry,
                      { color: theme.textTertiary },
                    ]}
                  >
                    Age {age}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        {/* ── [1] STICKY UNIT ──────────────────────────────────────────────── */}
        <View style={{ backgroundColor: theme.surface }}>
          {/* Mini banner */}
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
                <SvgLinearGradient id="pGrad" x1="0%" y1="0%" x2="100%" y2="0%">
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
                    stopColor={accentColor}
                    stopOpacity="0.65"
                  />
                </SvgLinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#pGrad)" />
            </Svg>
            <View style={styles.stickyMiniContent}>
              <View
                style={[
                  styles.stickyMiniHeadshotWrap,
                  { backgroundColor: accentColor + "30" },
                ]}
              >
                {showImg ? (
                  <Image
                    source={{ uri: imgUri }}
                    style={styles.stickyMiniHeadshot}
                    resizeMode="cover"
                  />
                ) : (
                  <Text
                    style={[
                      styles.stickyMiniInitials,
                      { color: getTextOnColor(accentColor) },
                    ]}
                  >
                    {initials || "?"}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  allowFontScaling={false}
                  style={[styles.stickyMiniName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {displayName}
                </Text>
                {posName ? (
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.stickyMiniPos,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {posName}
                  </Text>
                ) : null}
              </View>
            </View>
          </Animated.View>

          {/* Tab bar */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.tabBar, { borderBottomColor: theme.border }]}
            contentContainerStyle={styles.tabBarContent}
          >
            {TABS.map((tab) => {
              const isActive = tab === activeTab;
              const isEnabled =
                tab === "Info" ||
                tab === "Stats" ||
                tab === "Matches" ||
                tab === "Seasons";
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
                        { backgroundColor: accentColor },
                      ]}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── CONTENT ──────────────────────────────────────────────────────── */}
        <View style={styles.content}>
          {activeTab === "Info" && renderInfo()}
          {activeTab === "Stats" && renderStats()}
          {activeTab === "Matches" && renderMatches()}
          {activeTab === "Seasons" && renderSeasons()}
        </View>
      </Animated.ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },

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
  },
  headerHeadshotWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginRight: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  headerHeadshot: { width: 72, height: 72, borderRadius: 36 },
  headerInitials: { fontSize: 26, fontWeight: "800" },
  headerTextBlock: { flex: 1 },
  headerName: { fontSize: 22, fontWeight: "800", marginBottom: 3 },
  headerPos: { fontSize: 13, fontWeight: "600", marginBottom: 4 },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  headerFlag: { width: 20, height: 13, borderRadius: 2 },
  headerCountry: { fontSize: 12 },

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
  stickyMiniHeadshotWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  stickyMiniHeadshot: { width: 36, height: 36, borderRadius: 18 },
  stickyMiniInitials: { fontSize: 13, fontWeight: "800" },
  stickyMiniName: { fontSize: 15, fontWeight: "700" },
  stickyMiniPos: { fontSize: 11, fontWeight: "500", marginTop: 1 },

  // Tab bar
  tabBar: { borderBottomWidth: StyleSheet.hairlineWidth },
  tabBarContent: { flexDirection: "row" },
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

  // Error
  errorText: { marginBottom: 16, fontSize: 15 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: "#fff", fontWeight: "600" },

  // Placeholder
  placeholderText: { fontSize: 15, marginTop: 40 },
});

const iStyles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginBottom: 10,
  },

  // Bio row
  bioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 12,
  },
  bioHeadshotWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  bioHeadshot: { width: 72, height: 72, borderRadius: 36 },
  bioInitials: { fontSize: 24, fontWeight: "800" },
  bioName: { fontSize: 17, fontWeight: "700", marginBottom: 5 },
  posBadge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 5,
  },
  posBadgeText: { fontSize: 12, fontWeight: "700" },
  bioCurrentTeam: { fontSize: 12, fontWeight: "500" },

  // Info rows
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    gap: 12,
  },
  rowLabel: { fontSize: 13, fontWeight: "600" },
  rowValue: { fontSize: 13, fontWeight: "500", textAlign: "right", flex: 1 },

  // Physical
  physRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 12,
    marginBottom: 8,
  },
  physItem: { alignItems: "center" },
  physValue: { fontSize: 20, fontWeight: "800" },
  physLabel: { fontSize: 13, fontWeight: "600", marginTop: -2 },
  physSubLabel: { fontSize: 11, marginTop: 3 },
  physDivider: { width: StyleSheet.hairlineWidth, height: 48 },

  // Team rows
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    paddingLeft: 11,
    marginLeft: -14,
    paddingRight: 0,
    marginRight: -14,
    paddingHorizontal: 14,
  },
  teamLogoBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  teamLogo: { width: 34, height: 34 },
  teamLogoInitial: { fontSize: 16, fontWeight: "800" },
  teamNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  teamName: { fontSize: 14, fontWeight: "700" },
  currentBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  currentBadgeText: { fontSize: 10, fontWeight: "700" },
  teamTenure: { fontSize: 12, marginTop: 2 },
  teamJersey: { fontSize: 11, marginTop: 1 },
  teamArrow: { fontSize: 20, paddingLeft: 8 },

  // Current Season card
  csCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 12,
    overflow: "hidden",
  },
  csTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  csTitleLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  csLeagueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 1,
  },
  csLeagueLogo: { width: 18, height: 18 },
  csLeagueName: { fontSize: 11, fontWeight: "600", flexShrink: 1 },
  csSeasonName: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  csStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: 4,
  },
  csStatItem: {
    width: "25%",
    alignItems: "center",
    paddingVertical: 8,
  },
  csStatValue: { fontSize: 18, fontWeight: "800" },
  csStatLabel: { fontSize: 10, fontWeight: "600", marginTop: 2 },
  csTeamFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderTopWidth: 1.5,
    paddingVertical: 10,
    marginHorizontal: -14,
    paddingHorizontal: 14,
  },
  csTeamFooterLogo: { width: 24, height: 24 },
  csTeamFooterLogoPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  csTeamFooterInitial: { fontSize: 11, fontWeight: "800" },
  csTeamFooterName: { fontSize: 12, fontWeight: "600" },

  // Section Bubble (for Teams)
  sbBubble: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  sbBubbleTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sbBubbleAccent: { width: 4, height: 16, borderRadius: 2 },
  sbBubbleTitleText: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  // Player Team rows (coach-screen style)
  pTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pTeamLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  pTeamLogoInitial: { fontSize: 18, fontWeight: "800" },
  pTeamName: { fontSize: 14, fontWeight: "700" },
  pTeamTenure: { fontSize: 12, marginTop: 2 },
  pTeamArrow: { fontSize: 22, fontWeight: "300" },

  // Trophy rows (TeamDetail style, inside InfoCard)
  trLeagueCard: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  trLeagueHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  trLeagueLogo: { width: 32, height: 32 },
  trLeagueName: { fontSize: 14, fontWeight: "700" },
  trTrophyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  trTrophyCount: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  trTrophyCountText: { fontSize: 18, fontWeight: "800" },
  trTrophyName: { fontSize: 13, fontWeight: "700" },
  trTrophySeasons: { fontSize: 11, marginTop: 2, lineHeight: 16 },
});

const seStyles = StyleSheet.create({
  careerRow: {
    flexDirection: "row",
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  careerCell: { flex: 1, alignItems: "center" },
  careerValue: { fontSize: 20, fontWeight: "800" },
  careerLabel: { fontSize: 11, fontWeight: "600", marginTop: 3 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  headerStat: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingRight: 4,
  },
  rowLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowLogoImg: { width: 32, height: 32 },
  rowLogoInitial: { fontSize: 13, fontWeight: "800" },
  rowSeasonName: { fontSize: 13, fontWeight: "700" },
  rowTeamName: { fontSize: 11, marginTop: 1 },
  rowStats: { flexDirection: "row", alignItems: "center" },
  rowStat: { textAlign: "center", fontSize: 12, fontWeight: "700" },
});

const stStyles = StyleSheet.create({
  bubble: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  bubbleTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bubbleAccent: { width: 4, height: 16, borderRadius: 2 },
  bubbleTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statRowLast: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  statLabel: { fontSize: 13, fontWeight: "500" },
  statVal: { fontSize: 13, fontWeight: "700" },
  gameCardWrap: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 4 },
});

const mcStyles = StyleSheet.create({
  cardWrap: {
    marginHorizontal: 12,
    marginTop: 10,
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
  middle: { flex: 1 },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statChip: {
    alignItems: "center",
    minWidth: 40,
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginTop: 2,
  },
  chipValue: {
    fontSize: 20,
    fontWeight: "800",
  },
  wldBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
  },
  wldText: { fontSize: 13, fontWeight: "800", color: "#FFFFFF" },
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
  oppLeague: { fontSize: 10, fontWeight: "500" },
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
});

const bpStyles = StyleSheet.create({
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
  card: {
    overflow: "hidden",
  },
});

const rtStyles = StyleSheet.create({
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
  navDate: { fontSize: 22, fontWeight: "800" },
});

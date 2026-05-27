"use strict";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../../context/ThemeContext";

const FOOTBALL_BASE = "https://sportsheart-football.up.railway.app";
const CACHE_TTL = 60 * 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPlaceholder(uri) {
  return !uri || uri.includes("placeholder");
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

const TODAY_STR = new Date().toISOString().slice(0, 10);

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionBubble({ title, theme, colors, accentColor, children }) {
  return (
    <View
      style={[
        cStyles.bubble,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={[cStyles.bubbleTitle, { borderBottomColor: theme.border }]}>
        <View
          style={[cStyles.bubbleAccent, { backgroundColor: accentColor }]}
        />
        <Text style={[cStyles.bubbleTitleText, { color: theme.text }]}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function StatCell({ label, value, color, theme }) {
  return (
    <View style={cStyles.statCell}>
      <Text style={[cStyles.statValue, { color: color ?? theme.text }]}>
        {value ?? "—"}
      </Text>
      <Text style={[cStyles.statLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
    </View>
  );
}

function CareerStatsBubble({ statistics, theme, colors, accentColor }) {
  const totals = useMemo(() => {
    let played = 0,
      wins = 0,
      draws = 0,
      losses = 0;
    for (const s of statistics ?? []) {
      const details = s.season?.details ?? [];
      const get = (name) =>
        details.find(
          (d) => (d.type?.name ?? "").toLowerCase() === name.toLowerCase(),
        )?.value?.count ?? 0;
      played += get("Season Matches");
      wins += get("Team Wins");
      draws += get("Team Draws");
      losses += get("Team Lost");
    }
    return { played, wins, draws, losses };
  }, [statistics]);

  const winPct =
    totals.played > 0 ? Math.round((totals.wins / totals.played) * 100) : null;

  return (
    <SectionBubble
      title="Career Stats"
      theme={theme}
      colors={colors}
      accentColor={accentColor}
    >
      <View style={cStyles.statsRow}>
        <StatCell label="Played" value={totals.played} theme={theme} />
        <StatCell
          label="Won"
          value={totals.wins}
          color="#22c55e"
          theme={theme}
        />
        <StatCell
          label="Drawn"
          value={totals.draws}
          color="#f59e0b"
          theme={theme}
        />
        <StatCell
          label="Lost"
          value={totals.losses}
          color="#ef4444"
          theme={theme}
        />
        {winPct != null && (
          <StatCell
            label="Win %"
            value={`${winPct}%`}
            color={colors.primary}
            theme={theme}
          />
        )}
      </View>
    </SectionBubble>
  );
}

function SeasonRow({
  stat,
  last,
  theme,
  isDarkMode,
  accentColor,
  teamColor,
  navigation,
}) {
  const details = stat.season?.details ?? [];
  const league = stat.season?.league;

  const get = (name) =>
    details.find(
      (d) => (d.type?.name ?? "").toLowerCase() === name.toLowerCase(),
    )?.value?.count ?? null;

  const played = get("Season Matches");
  const wins = get("Team Wins");
  const draws = get("Team Draws");
  const losses = get("Team Lost");

  const logoUri = league?.image_path;
  const showLogo = logoUri && !isPlaceholder(logoUri);

  const inner = (
    <View
      style={[
        cStyles.seasonRow,
        { borderBottomColor: last ? "transparent" : theme.border },
        teamColor ? { borderLeftWidth: 3, borderLeftColor: teamColor } : null,
      ]}
    >
      {/* League logo + season name */}
      <View style={cStyles.seasonLeft}>
        {showLogo ? (
          <Image
            source={{ uri: logoUri }}
            style={[
              cStyles.seasonLogo,
              {
                tintColor:
                  league?.id === 8 && isDarkMode ? theme.text : undefined,
              },
            ]}
            resizeMode="contain"
          />
        ) : (
          <View
            style={[
              cStyles.seasonLogoFallback,
              { backgroundColor: (accentColor ?? "#888") + "30" },
            ]}
          >
            <Text style={[cStyles.seasonLogoInitial, { color: accentColor }]}>
              {(league?.name ?? "?")[0]}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text
            style={[cStyles.seasonName, { color: theme.text }]}
            numberOfLines={1}
          >
            {stat.season?.name ?? "—"}
          </Text>
          {league?.name ? (
            <Text
              style={[cStyles.leagueName, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {league.name}
            </Text>
          ) : null}
        </View>
      </View>
      {/* W/D/L */}
      <View style={cStyles.seasonStats}>
        {[
          { v: played, c: theme.text },
          { v: wins, c: "#22c55e" },
          { v: draws, c: "#f59e0b" },
          { v: losses, c: "#ef4444" },
        ].map(({ v, c }, i) => (
          <Text key={i} style={[cStyles.seasonStat, { color: c }]}>
            {v ?? "—"}
          </Text>
        ))}
      </View>
    </View>
  );

  if (league?.id && navigation) {
    return (
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() =>
          navigation.navigate("Top5LeagueDetail", {
            leagueId: league.id,
            leagueName: league.name,
          })
        }
      >
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

function SeasonStatsBubble({
  statistics,
  teams,
  theme,
  isDarkMode,
  accentColor,
  navigation,
}) {
  if (!statistics?.length) return null;

  // Build team_id → colorPrimary lookup
  const teamColorMap = useMemo(() => {
    const map = {};
    for (const t of teams ?? []) {
      if (t.team_id != null && t.team?.colorPrimary) {
        map[t.team_id] = t.team.colorPrimary;
      }
    }
    return map;
  }, [teams]);

  // Sort most recent first by season name
  const sorted = [...statistics].sort((a, b) =>
    (b.season?.name ?? "").localeCompare(a.season?.name ?? ""),
  );

  return (
    <SectionBubble title="Season Stats" theme={theme} accentColor={accentColor}>
      {/* Header row */}
      <View
        style={[cStyles.seasonHeaderRow, { borderBottomColor: theme.border }]}
      >
        <Text
          style={[cStyles.seasonHeaderLeft, { color: theme.textSecondary }]}
        >
          Season
        </Text>
        {["P", "W", "D", "L"].map((h) => (
          <Text
            key={h}
            style={[cStyles.seasonHeaderStat, { color: theme.textSecondary }]}
          >
            {h}
          </Text>
        ))}
      </View>
      {sorted.map((s, i) => (
        <SeasonRow
          key={`${s.season_id ?? i}`}
          stat={s}
          last={i === sorted.length - 1}
          theme={theme}
          isDarkMode={isDarkMode}
          accentColor={accentColor}
          teamColor={
            s.team_id != null ? (teamColorMap[s.team_id] ?? null) : null
          }
          navigation={navigation}
        />
      ))}
    </SectionBubble>
  );
}

function TeamRow({ entry, last, theme, isDarkMode, navigation }) {
  const team = entry.team ?? {};
  const logoUri = team.image_path;
  const showLogo = logoUri && !isPlaceholder(logoUri);
  const accentColor = team.colorPrimary ?? "#888";
  const teamBorderColor = team.colorPrimary ?? null;
  const startText = entry.start ? formatLongDate(entry.start) : null;
  const endText = entry.end ? formatLongDate(entry.end) : null;
  const isCurrent =
    entry.end === null || entry.end === undefined || entry.end >= TODAY_STR;

  const inner = (
    <View
      style={[
        cStyles.teamRow,
        { borderBottomColor: last ? "transparent" : theme.border },
        teamBorderColor
          ? { borderLeftWidth: 3, borderLeftColor: teamBorderColor }
          : null,
      ]}
    >
      <View style={[cStyles.teamLogo, { backgroundColor: accentColor + "22" }]}>
        {showLogo ? (
          <Image
            source={{ uri: logoUri }}
            style={{ width: 36, height: 36 }}
            resizeMode="contain"
          />
        ) : (
          <Text style={[cStyles.teamLogoInitial, { color: accentColor }]}>
            {(team.name ?? "?")[0]}
          </Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[cStyles.teamName, { color: theme.text }]}
          numberOfLines={1}
        >
          {team.name ?? "Unknown Team"}
        </Text>
        <Text
          style={[cStyles.teamTenure, { color: theme.textSecondary }]}
          numberOfLines={1}
        >
          {startText ? `${startText}  →  ` : ""}
          {isCurrent ? (
            <Text style={{ color: "#22c55e", fontWeight: "700" }}>Present</Text>
          ) : (
            (endText ?? "—")
          )}
        </Text>
      </View>
      {navigation && entry.team_id != null && (
        <Text style={[cStyles.teamArrow, { color: theme.textSecondary }]}>
          ›
        </Text>
      )}
    </View>
  );

  if (navigation && entry.team_id != null) {
    return (
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() =>
          navigation.navigate("Top5TeamDetail", {
            teamId: entry.team_id,
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

function TeamsBubble({ teams, theme, accentColor, navigation }) {
  if (!teams?.length) return null;

  const sorted = [...teams].sort((a, b) =>
    (b.start ?? "").localeCompare(a.start ?? ""),
  );

  return (
    <SectionBubble title="Teams" theme={theme} accentColor={accentColor}>
      {sorted.map((entry, i) => (
        <TeamRow
          key={`${entry.team_id ?? i}`}
          entry={entry}
          last={i === sorted.length - 1}
          theme={theme}
          navigation={navigation}
        />
      ))}
    </SectionBubble>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function Top5CoachScreen({ route, navigation }) {
  const { coachId, coachName } = route.params ?? {};
  const { theme, colors, isDarkMode } = useTheme();

  const [coachData, setCoachData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const cacheKey = `top5:coach:${coachId}:v1`;

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
              setCoachData(cached);
              setLoading(false);
              return;
            }
          }
        }
        const res = await fetch(`${FOOTBALL_BASE}/football/coach/${coachId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const d = json.data ?? json;
        await AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({ data: d, fetchedAt: Date.now() }),
        );
        setCoachData(d);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [coachId, cacheKey],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  // Derive display values
  const name =
    coachData?.name ||
    `${coachData?.firstname ?? ""} ${coachData?.lastname ?? ""}`.trim() ||
    coachName ||
    "Coach";
  const imageUri = coachData?.image_path;
  const showImage = imageUri && !isPlaceholder(imageUri);
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const dob = formatLongDate(coachData?.date_of_birth);
  const age = getAgeFromDob(coachData?.date_of_birth);
  const dobStr = dob ? `${dob}${age != null ? ` (age ${age})` : ""}` : null;

  const countryName = coachData?.country?.name ?? null;
  const countryFlag = coachData?.country?.image_path ?? null;
  const showFlag = countryFlag && !isPlaceholder(countryFlag);

  // Accent color: use current team's colorPrimary, else colors.primary
  const accentColor = useMemo(() => {
    const teams = coachData?.teams ?? [];
    if (!teams.length) return colors.primary;
    const current = teams
      .filter(
        (t) => t.end === null || t.end === undefined || t.end >= TODAY_STR,
      )
      .sort((a, b) => (b.start ?? "").localeCompare(a.start ?? ""));
    return current[0]?.team?.colorPrimary ?? colors.primary;
  }, [coachData, colors.primary]);

  if (loading) {
    return (
      <View style={[cStyles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[cStyles.centered, { backgroundColor: theme.background }]}>
        <Text style={[cStyles.errorText, { color: theme.text }]}>
          Error: {error}
        </Text>
        <TouchableOpacity
          onPress={() => load(true)}
          style={[cStyles.retryBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={cStyles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[cStyles.screen, { backgroundColor: theme.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={accentColor}
          />
        }
      >
        {/* ── Hero Header ───────────────────────────────────────────────── */}
        <View
          style={[
            cStyles.header,
            {
              backgroundColor: accentColor + "22",
              borderBottomColor: accentColor,
            },
          ]}
        >
          {/* Headshot */}
          <View
            style={[
              cStyles.headshotWrap,
              { backgroundColor: accentColor + "30" },
            ]}
          >
            {showImage ? (
              <Image
                source={{ uri: imageUri }}
                style={cStyles.headshot}
                resizeMode="cover"
              />
            ) : (
              <Text style={[cStyles.initials, { color: theme.text }]}>
                {initials || "?"}
              </Text>
            )}
          </View>

          {/* Text block */}
          <View style={cStyles.headerTextBlock}>
            <Text
              allowFontScaling={false}
              style={[cStyles.headerName, { color: theme.text }]}
              numberOfLines={2}
            >
              {name}
            </Text>
            {dobStr ? (
              <Text
                allowFontScaling={false}
                style={[cStyles.headerSub, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {dobStr}
              </Text>
            ) : null}
            {countryName ? (
              <View style={cStyles.headerCountryRow}>
                {showFlag ? (
                  <Image
                    source={{ uri: countryFlag }}
                    style={cStyles.flag}
                    resizeMode="contain"
                  />
                ) : null}
                <Text
                  allowFontScaling={false}
                  style={[
                    cStyles.headerCountry,
                    { color: theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {countryName}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Content ───────────────────────────────────────────────────── */}
        <View style={cStyles.content}>
          <CareerStatsBubble
            statistics={coachData?.statistics}
            theme={theme}
            colors={colors}
            accentColor={accentColor}
          />
          <SeasonStatsBubble
            statistics={coachData?.statistics}
            teams={coachData?.teams}
            theme={theme}
            isDarkMode={isDarkMode}
            accentColor={accentColor}
            navigation={navigation}
          />
          <TeamsBubble
            teams={coachData?.teams}
            theme={theme}
            isDarkMode={isDarkMode}
            accentColor={accentColor}
            navigation={navigation}
          />
          <View style={{ height: 32 }} />
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cStyles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { fontSize: 15, marginBottom: 16, textAlign: "center" },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomWidth: 2,
  },
  headshotWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headshot: { width: 80, height: 80, borderRadius: 40 },
  initials: { fontSize: 28, fontWeight: "800" },
  headerTextBlock: { flex: 1 },
  headerName: { fontSize: 20, fontWeight: "800", marginBottom: 4 },
  headerSub: { fontSize: 13, marginBottom: 3 },
  headerCountryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  flag: { width: 20, height: 14 },
  headerCountry: { fontSize: 13 },

  // Content
  content: { paddingTop: 4 },

  // Bubble wrapper
  bubble: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  bubbleTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bubbleAccent: { width: 4, height: 16, borderRadius: 2 },
  bubbleTitleText: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  // Career stats
  statsRow: {
    flexDirection: "row",
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  statCell: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 11, fontWeight: "600", marginTop: 3 },

  // Season stats
  seasonHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  seasonHeaderLeft: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  seasonHeaderStat: {
    width: 32,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  seasonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  seasonLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  seasonLogo: { width: 28, height: 28, flexShrink: 0 },
  seasonLogoFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  seasonLogoInitial: { fontSize: 12, fontWeight: "800" },
  seasonName: { fontSize: 13, fontWeight: "700" },
  leagueName: { fontSize: 11, marginTop: 1 },
  seasonStats: { flexDirection: "row" },
  seasonStat: {
    width: 32,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
  },

  // Teams
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  teamLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  teamLogoInitial: { fontSize: 18, fontWeight: "800" },
  teamName: { fontSize: 14, fontWeight: "700" },
  teamTenure: { fontSize: 12, marginTop: 2 },
  teamArrow: { fontSize: 22, fontWeight: "300" },
});

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

function isPlaceholder(uri) {
  return !uri || uri.includes("placeholder");
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
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

function getDetailCount(details, name) {
  const detail = (details ?? []).find(
    (d) => (d.type?.name ?? "").toLowerCase() === name.toLowerCase(),
  );
  if (!detail?.value) return 0;
  if (typeof detail.value.count === "number") return detail.value.count;
  if (typeof detail.value?.all?.count === "number")
    return detail.value.all.count;
  return 0;
}

function SectionBubble({ title, theme, accentColor, children }) {
  return (
    <View
      style={[
        rStyles.bubble,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={[rStyles.bubbleTitle, { borderBottomColor: theme.border }]}>
        <View
          style={[rStyles.bubbleAccent, { backgroundColor: accentColor }]}
        />
        <Text style={[rStyles.bubbleTitleText, { color: theme.text }]}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function StatCell({ label, value, color, theme }) {
  return (
    <View style={rStyles.statCell}>
      <Text style={[rStyles.statValue, { color: color ?? theme.text }]}>
        {value ?? "—"}
      </Text>
      <Text style={[rStyles.statLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
    </View>
  );
}

function CareerStatsBubble({ statistics, theme, colors, accentColor }) {
  const totals = useMemo(() => {
    let played = 0;
    let yellow = 0;
    let yellowRed = 0;
    let red = 0;
    let varMoments = 0;

    for (const stat of statistics ?? []) {
      const details = stat.details ?? [];
      played += getDetailCount(details, "Season Matches");
      yellow += getDetailCount(details, "Yellowcards");
      yellowRed += getDetailCount(details, "Yellowred Cards");
      red += getDetailCount(details, "Redcards");
      varMoments += getDetailCount(details, "VAR Moments");
    }

    return { played, yellow, yellowRed, red, varMoments };
  }, [statistics]);

  return (
    <SectionBubble title="Career Stats" theme={theme} accentColor={accentColor}>
      <View style={rStyles.statsRow}>
        <StatCell label="Played" value={totals.played} theme={theme} />
        <StatCell
          label="Yellow"
          value={totals.yellow}
          color="#f59e0b"
          theme={theme}
        />
        <StatCell
          label="2nd Yel"
          value={totals.yellowRed}
          color="#f97316"
          theme={theme}
        />
        <StatCell
          label="Red"
          value={totals.red}
          color="#ef4444"
          theme={theme}
        />
        <StatCell
          label="VAR"
          value={totals.varMoments}
          color={colors.primary}
          theme={theme}
        />
      </View>
    </SectionBubble>
  );
}

function SeasonRow({ stat, last, theme, isDarkMode, accentColor, navigation }) {
  const details = stat.details ?? [];
  const league = stat.season?.league;

  const played = getDetailCount(details, "Season Matches");
  const yellow = getDetailCount(details, "Yellowcards");
  const yellowRed = getDetailCount(details, "Yellowred Cards");
  const red = getDetailCount(details, "Redcards");
  const varMoments = getDetailCount(details, "VAR Moments");

  const logoUri = league?.image_path;
  const showLogo = logoUri && !isPlaceholder(logoUri);

  const inner = (
    <View
      style={[
        rStyles.seasonRow,
        { borderBottomColor: last ? "transparent" : theme.border },
      ]}
    >
      <View style={rStyles.seasonLeft}>
        {showLogo ? (
          <Image
            source={{ uri: logoUri }}
            style={[
              rStyles.seasonLogo,
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
              rStyles.seasonLogoFallback,
              { backgroundColor: (accentColor ?? "#888") + "30" },
            ]}
          >
            <Text style={[rStyles.seasonLogoInitial, { color: accentColor }]}>
              {(league?.name ?? "?")[0]}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text
            style={[rStyles.seasonName, { color: theme.text }]}
            numberOfLines={1}
          >
            {stat.season?.name ?? "—"}
          </Text>
          {league?.name ? (
            <Text
              style={[rStyles.leagueName, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {league.name}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={rStyles.seasonStats}>
        {[
          { v: played, c: theme.text },
          { v: yellow, c: "#f59e0b" },
          { v: yellowRed, c: "#f97316" },
          { v: red, c: "#ef4444" },
          { v: varMoments, c: accentColor },
        ].map(({ v, c }, i) => (
          <Text key={i} style={[rStyles.seasonStat, { color: c }]}>
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
  theme,
  isDarkMode,
  accentColor,
  navigation,
}) {
  if (!statistics?.length) return null;

  const sorted = [...statistics].sort((a, b) =>
    (b.season?.name ?? "").localeCompare(a.season?.name ?? ""),
  );

  return (
    <SectionBubble title="Season Stats" theme={theme} accentColor={accentColor}>
      <View
        style={[rStyles.seasonHeaderRow, { borderBottomColor: theme.border }]}
      >
        <Text
          style={[rStyles.seasonHeaderLeft, { color: theme.textSecondary }]}
        >
          Season
        </Text>
        {["P", "Y", "2Y", "R", "VAR"].map((header) => (
          <Text
            key={header}
            style={[rStyles.seasonHeaderStat, { color: theme.textSecondary }]}
          >
            {header}
          </Text>
        ))}
      </View>
      {sorted.map((stat, idx) => (
        <SeasonRow
          key={`${stat.season_id ?? idx}`}
          stat={stat}
          last={idx === sorted.length - 1}
          theme={theme}
          isDarkMode={isDarkMode}
          accentColor={accentColor}
          navigation={navigation}
        />
      ))}
    </SectionBubble>
  );
}

export default function Top5RefereeScreen({ route, navigation }) {
  const { refereeId, refereeName } = route.params ?? {};
  const { theme, colors, isDarkMode } = useTheme();

  const [refereeData, setRefereeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const cacheKey = `top5:referee:${refereeId}:v1`;

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
              setRefereeData(cached);
              setError(null);
              setLoading(false);
              return;
            }
          }
        }

        const res = await fetch(
          `${FOOTBALL_BASE}/football/referee/${refereeId}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const data = json.data ?? json;
        await AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({ data, fetchedAt: Date.now() }),
        );
        setRefereeData(data);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [refereeId, cacheKey],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const name =
    refereeData?.name ||
    `${refereeData?.firstname ?? ""} ${refereeData?.lastname ?? ""}`.trim() ||
    refereeName ||
    "Referee";

  const imageUri = refereeData?.image_path;
  const showImage = imageUri && !isPlaceholder(imageUri);
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const dob = formatLongDate(refereeData?.date_of_birth);
  const age = getAgeFromDob(refereeData?.date_of_birth);
  const dobStr = dob ? `${dob}${age != null ? ` (age ${age})` : ""}` : null;

  const countryName = refereeData?.country?.name ?? null;
  const countryFlag = refereeData?.country?.image_path ?? null;
  const showFlag = countryFlag && !isPlaceholder(countryFlag);
  const accentColor = colors.primary;

  if (loading) {
    return (
      <View style={[rStyles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[rStyles.centered, { backgroundColor: theme.background }]}>
        <Text style={[rStyles.errorText, { color: theme.text }]}>
          Error: {error}
        </Text>
        <TouchableOpacity
          onPress={() => load(true)}
          style={[rStyles.retryBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={rStyles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[rStyles.screen, { backgroundColor: theme.background }]}>
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
        <View
          style={[
            rStyles.header,
            {
              backgroundColor: accentColor + "22",
              borderBottomColor: accentColor,
            },
          ]}
        >
          <View
            style={[
              rStyles.headshotWrap,
              { backgroundColor: accentColor + "30" },
            ]}
          >
            {showImage ? (
              <Image
                source={{ uri: imageUri }}
                style={rStyles.headshot}
                resizeMode="cover"
              />
            ) : (
              <Text style={[rStyles.initials, { color: theme.text }]}>
                {initials || "?"}
              </Text>
            )}
          </View>

          <View style={rStyles.headerTextBlock}>
            <Text
              allowFontScaling={false}
              style={[rStyles.headerName, { color: theme.text }]}
              numberOfLines={2}
            >
              {name}
            </Text>
            {dobStr ? (
              <Text
                allowFontScaling={false}
                style={[rStyles.headerSub, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {dobStr}
              </Text>
            ) : null}
            {countryName ? (
              <View style={rStyles.headerCountryRow}>
                {showFlag ? (
                  <Image
                    source={{ uri: countryFlag }}
                    style={rStyles.flag}
                    resizeMode="contain"
                  />
                ) : null}
                <Text
                  allowFontScaling={false}
                  style={[
                    rStyles.headerCountry,
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

        <View style={rStyles.content}>
          <CareerStatsBubble
            statistics={refereeData?.statistics}
            theme={theme}
            colors={colors}
            accentColor={accentColor}
          />
          <SeasonStatsBubble
            statistics={refereeData?.statistics}
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

const rStyles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { fontSize: 15, marginBottom: 16, textAlign: "center" },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: "#fff", fontWeight: "700", fontSize: 14 },

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

  content: { paddingTop: 4 },

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

  statsRow: {
    flexDirection: "row",
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  statCell: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 11, fontWeight: "600", marginTop: 3 },

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
    width: 30,
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
    width: 30,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
  },
});

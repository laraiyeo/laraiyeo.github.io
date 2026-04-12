"use strict";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../../../context/ThemeContext";
import { useBetSlip } from "../../../context/BetSlipContext";
import { BannerAdWrapper } from "../../../services/ads";

const FOOTBALL_BASE = "https://laraiyeogithubio-production-08da.up.railway.app";
const CACHE_KEY = "top5:search:v2";
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

const H_PAD = 16;
const GAP = 10;
const TYPE_MAP = {
  leagues: "league",
  teams: "team",
  players: "player",
  matches: "match",
};

async function fetchSearchData() {
  const res = await fetch(`${FOOTBALL_BASE}/football/search`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const TABS = ["all", "leagues", "teams", "players", "matches"];
const TAB_LABELS = {
  all: "All",
  leagues: "Leagues",
  teams: "Teams",
  players: "Players",
  matches: "Matches",
};

function formatMatchDateTime(starting_at) {
  if (!starting_at) return { date: "TBD", time: "" };
  const raw = String(starting_at).trim();
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
  const parsed = new Date(hasZone ? iso : `${iso}Z`);
  const d = Number.isNaN(parsed.getTime())
    ? parsed
    : new Date(parsed.getTime() + 4 * 60 * 60 * 1000);
  if (isNaN(d.getTime())) return { date: "TBD", time: "" };

  return {
    date: d.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    time: d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
  };
}

function normalize(str) {
  if (!str) return "";
  return (
    str
      .toLowerCase()
      // Special-case characters NFD doesn't decompose
      .replace(/ø/g, "o")
      .replace(/æ/g, "ae")
      .replace(/å/g, "a")
      .replace(/œ/g, "oe")
      .replace(/ß/g, "ss")
      .replace(/ð/g, "d")
      .replace(/þ/g, "th")
      .replace(/ł/g, "l")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
  ); // strip combining diacritics
}

function matchesQuery(item, q) {
  if (!q) return true;
  const allText = normalize(
    [
      item.name ?? "",
      item.display_name ?? "",
      item.team_name ?? "",
      item.homeTeam?.name ?? "",
      item.awayTeam?.name ?? "",
    ].join(" "),
  );
  const tokens = normalize(q).trim().split(/\s+/).filter(Boolean);
  return tokens.every((t) => allText.includes(t));
}

function getTextOnColor(hex) {
  if (!hex) return "#FFFFFF";
  const c = hex.replace("#", "");
  if (c.length < 6) return "#000000";
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? "#000000" : "#FFFFFF";
}

// Choose the primary league for a team: prefer sub_type 'domestic', else first
function getPrimaryLeague(team) {
  if (!team?.activeseasons || !Array.isArray(team.activeseasons)) return null;
  for (const s of team.activeseasons) {
    const lg = s?.league;
    if (!lg) continue;
    if (String(lg.sub_type ?? "").toLowerCase() === "domestic") return lg;
  }
  return team.activeseasons[0]?.league ?? null;
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

function getInitials(item) {
  if (item.firstname && item.lastname) {
    return (item.firstname[0] + item.lastname[0]).toUpperCase();
  }
  const name = (item.display_name ?? item.name ?? "").trim();
  const parts = name.split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function PlayerAvatar({ item, theme }) {
  const [imgErr, setImgErr] = useState(false);
  const teamColor = item.team_colorPrimary ?? null;
  const bgColor = teamColor ? teamColor + "30" : theme.surfaceSecondary;
  const fallbackBg = teamColor ?? theme.surfaceSecondary;
  if (item.image_path && !item.image_path.includes("placeholder") && !imgErr) {
    return (
      <Image
        source={{ uri: item.image_path }}
        style={[styles.avatar, { backgroundColor: bgColor }]}
        resizeMode="cover"
        onError={() => setImgErr(true)}
      />
    );
  }
  const initials = getInitials(item);
  return (
    <View
      style={[
        styles.avatar,
        {
          backgroundColor: fallbackBg,
          alignItems: "center",
          justifyContent: "center",
        },
      ]}
    >
      <Text
        style={{
          color: getTextOnColor(teamColor),
          fontSize: 14,
          fontWeight: "700",
        }}
      >
        {initials}
      </Text>
    </View>
  );
}

export default function Top5SearchScreen() {
  const { theme, colors, isDarkMode } = useTheme();
  const { isPro } = useBetSlip();
  const AD_SPACE = 80;
  const [searchData, setSearchData] = useState({
    leagues: [],
    teams: [],
    players: [],
    matches: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const load = useCallback(async (force = false) => {
    try {
      if (!force) {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) {
          const { data, fetchedAt } = JSON.parse(raw);
          if (Date.now() - fetchedAt < CACHE_TTL) {
            setSearchData(data);
            setLoading(false);
            return;
          }
        }
      }
      const data = await fetchSearchData();
      await AsyncStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ data, fetchedAt: Date.now() }),
      );
      setSearchData(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const flatListData = useMemo(() => {
    const q = query.trim().toLowerCase();
    const MAX_ALL = 10;
    const MAX_TAB = 20;

    if (activeTab === "all") {
      // Collect league IDs for matched leagues so matches can be cross-referenced by league_id
      const matchedLeagueIds = new Set(
        searchData.leagues
          .filter((l) => matchesQuery(l, q))
          .map((l) => l.id)
          .filter(Boolean),
      );
      const tag = (arr, type, extra) =>
        arr
          .filter(
            (item) => matchesQuery(item, q) || (extra ? extra(item) : false),
          )
          .slice(0, MAX_ALL)
          .map((item, i) => ({
            ...item,
            _type: type,
            _key: `${type}:${item.id ?? item.player_id ?? i}`,
          }));
      return [
        ...tag(searchData.leagues, "league"),
        ...tag(searchData.teams, "team"),
        ...tag(searchData.players, "player"),
        ...tag(searchData.matches, "match", (m) =>
          matchedLeagueIds.has(m.league_id),
        ),
      ];
    }
    const type = TYPE_MAP[activeTab];
    return (searchData[activeTab] ?? [])
      .filter((item) => matchesQuery(item, q))
      .slice(0, MAX_TAB)
      .map((item, i) => ({
        ...item,
        _type: type,
        _key: `${activeTab}:${item.id ?? item.player_id ?? i}`,
      }));
  }, [activeTab, searchData, query]);

  const navigation = useNavigation();

  const renderItem = useCallback(
    ({ item }) => {
      // ── League bubble ─────────────────────────────────────────────────────
      if (item._type === "league") {
        return (
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() =>
              navigation.navigate("Top5LeagueDetail", {
                leagueId: item.id,
                leagueName: item.name,
              })
            }
            style={[
              styles.listCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            {item.image_path ? (
              <Image
                source={{ uri: item.image_path }}
                style={[
                  styles.logo,
                  {
                    tintColor:
                      item.id === 8 && isDarkMode ? theme.text : undefined,
                  },
                ]}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  styles.logo,
                  styles.logoPlaceholder,
                  { backgroundColor: theme.surfaceSecondary },
                ]}
              >
                <Text style={{ fontSize: 16 }}>⚽</Text>
              </View>
            )}
            <View style={styles.info}>
              <Text
                style={[styles.primaryText, { color: theme.text }]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              {item.currentseason?.name ? (
                <Text
                  style={[styles.secondaryText, { color: theme.textSecondary }]}
                >
                  {item.currentseason.name}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      }

      // ── Team bubble ───────────────────────────────────────────────────────
      if (item._type === "team") {
        return (
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() =>
              navigation.navigate("Top5TeamDetail", {
                teamId: item.id,
                teamName: item.name,
              })
            }
            style={[
              styles.listCard,
              {
                backgroundColor: theme.surface,
                borderColor: item.colorPrimary ?? theme.border,
              },
            ]}
          >
            {item.image_path ? (
              <Image
                source={{ uri: item.image_path }}
                style={styles.logo}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  styles.logo,
                  styles.logoPlaceholder,
                  {
                    backgroundColor:
                      item.colorPrimary ?? theme.surfaceSecondary,
                  },
                ]}
              >
                <Text style={styles.logoFallback}>{(item.name ?? "?")[0]}</Text>
              </View>
            )}
            <View style={styles.info}>
              <Text
                style={[styles.primaryText, { color: theme.text }]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              {getPrimaryLeague(item)?.name ? (
                <Text
                  style={[styles.secondaryText, { color: theme.textSecondary }]}
                >
                  {getPrimaryLeague(item).name}
                </Text>
              ) : null}
            </View>
            {item.short_code ? (
              <Text style={[styles.code, { color: theme.textTertiary }]}>
                {item.short_code}
              </Text>
            ) : null}
          </TouchableOpacity>
        );
      }

      // ── Player bubble ─────────────────────────────────────────────────────
      if (item._type === "player") {
        return (
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() =>
              navigation.navigate("Top5PlayerDetail", {
                playerId: item.player_id ?? item.id,
                playerName: item.display_name ?? item.name,
              })
            }
            style={[
              styles.listCard,
              {
                backgroundColor: theme.surface,
                borderColor: item.team_colorPrimary ?? theme.border,
              },
            ]}
          >
            <PlayerAvatar item={item} theme={theme} />
            <View style={styles.info}>
              <Text
                style={[styles.primaryText, { color: theme.text }]}
                numberOfLines={1}
              >
                {item.display_name ?? item.name}
              </Text>
              {item.team_name ? (
                <Text
                  style={[styles.secondaryText, { color: theme.textSecondary }]}
                >
                  {item.team_name}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      }

      // ── Match bubble (split border) ───────────────────────────────────────
      if (item._type === "match") {
        const { homeColor, awayColor } = resolveMatchColors({
          homePrimary: item.homeTeam?.colorPrimary,
          homeSecondary: item.homeTeam?.colorSecondary,
          awayPrimary: item.awayTeam?.colorPrimary,
          awaySecondary: item.awayTeam?.colorSecondary,
          homeFallback: theme.border,
          awayFallback: theme.border,
        });
        const { date, time } = formatMatchDateTime(item.starting_at);
        return (
          <TouchableOpacity
            activeOpacity={0.75}
            style={[styles.matchCardOuter, { backgroundColor: theme.surface }]}
            onPress={() =>
              navigation.navigate("Top5GameDetail", {
                fixtureId: item.fixture_id,
                homeTeamId: item.homeTeam?.id,
                awayTeamId: item.awayTeam?.id,
                matchTitle: `${item.awayTeam?.name.slice(0, 3).toUpperCase() ?? "Home"} vs ${item.homeTeam?.name.slice(0, 3).toUpperCase() ?? "Away"}`,
              })
            }
          >
            {/* Split colour border underlay */}
            <View style={styles.matchSplitBorder} pointerEvents="none">
              <View
                style={[
                  styles.matchBorderHalfLeft,
                  { backgroundColor: awayColor },
                ]}
              />
              <View
                style={[
                  styles.matchBorderHalfRight,
                  { backgroundColor: homeColor },
                ]}
              />
            </View>

            {/* Card content sits on top via margin:2 */}
            <View
              style={[
                styles.matchCardContent,
                { backgroundColor: theme.surface },
              ]}
            >
              {/* Away: logo → name */}
              <View style={styles.matchTeamLeft}>
                {item.awayTeam?.image_path ? (
                  <Image
                    source={{ uri: item.awayTeam.image_path }}
                    style={styles.matchLogo}
                    resizeMode="contain"
                  />
                ) : (
                  <View
                    style={[
                      styles.matchLogo,
                      styles.matchLogoFallback,
                      { backgroundColor: awayColor + "40" },
                    ]}
                  />
                )}
                <Text
                  style={[styles.matchTeamName, { color: theme.text }]}
                  numberOfLines={2}
                >
                  {item.awayTeam?.name ?? "—"}
                </Text>
              </View>

              {/* Middle: date + time */}
              <View style={styles.matchMiddle}>
                <Text
                  style={[styles.matchDate, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {date}
                </Text>
                {time ? (
                  <Text
                    style={[styles.matchTime, { color: theme.textSecondary }]}
                  >
                    {time}
                  </Text>
                ) : null}
              </View>

              {/* Home: name → logo */}
              <View style={styles.matchTeamRight}>
                <Text
                  style={[
                    styles.matchTeamName,
                    styles.matchTeamNameRight,
                    { color: theme.text },
                  ]}
                  numberOfLines={2}
                >
                  {item.homeTeam?.name ?? "—"}
                </Text>
                {item.homeTeam?.image_path ? (
                  <Image
                    source={{ uri: item.homeTeam.image_path }}
                    style={styles.matchLogo}
                    resizeMode="contain"
                  />
                ) : (
                  <View
                    style={[
                      styles.matchLogo,
                      styles.matchLogoFallback,
                      { backgroundColor: homeColor + "40" },
                    ]}
                  />
                )}
              </View>
            </View>
          </TouchableOpacity>
        );
      }

      return null;
    },
    [theme, colors, navigation],
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.text }]}>
          Error: {error}
        </Text>
        <TouchableOpacity
          onPress={() => {
            setLoading(true);
            load(true);
          }}
          style={[styles.retryBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Search bar */}
      <View
        style={[
          styles.searchBar,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <Ionicons
          name="search"
          size={18}
          color={theme.textTertiary}
          style={styles.searchIcon}
        />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search…"
          placeholderTextColor={theme.textTertiary}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
          autoCorrect={false}
        />
      </View>

      {/* Scrollable tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[
          styles.tabBarScroll,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
        contentContainerStyle={styles.tabBarContent}
      >
        {TABS.map((tab) => {
          const isActive = tab === activeTab;
          return (
            <TouchableOpacity
              key={tab}
              style={styles.tabItem}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isActive ? colors.primary : theme.textSecondary,
                    fontWeight: isActive ? "700" : "400",
                  },
                ]}
              >
                {TAB_LABELS[tab]}
              </Text>
              {tab !== "all" && (
                <Text style={[styles.tabCount, { color: theme.textTertiary }]}>
                  {(searchData[tab] ?? []).length}
                </Text>
              )}
              {isActive && (
                <View
                  style={[
                    styles.tabIndicator,
                    { backgroundColor: colors.primary },
                  ]}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FlatList
        data={flatListData}
        keyExtractor={(item) => item._key}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={[styles.center, { paddingTop: 60 }]}>
            <Text style={{ color: theme.textSecondary }}>
              {query ? "No results found" : "No data available"}
            </Text>
          </View>
        }
        contentContainerStyle={{
          paddingBottom: isPro ? 24 : 24 + AD_SPACE,
          paddingTop: 8,
        }}
      />

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
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Search bar
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 4 },

  // Scrollable tab bar
  tabBarScroll: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexGrow: 0,
    flexShrink: 0,
  },
  tabBarContent: { flexGrow: 1, paddingHorizontal: 4 },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    position: "relative",
  },
  tabLabel: { fontSize: 13 },
  tabCount: { fontSize: 11, marginTop: 1 },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: "10%",
    right: "10%",
    height: 2,
    borderRadius: 1,
  },

  // Shared bubble card (leagues / teams / players)
  listCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: H_PAD,
    marginBottom: GAP,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  logo: { width: 40, height: 40, marginRight: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  logoPlaceholder: { alignItems: "center", justifyContent: "center" },
  logoFallback: { color: "#fff", fontSize: 16, fontWeight: "700" },
  info: { flex: 1 },
  primaryText: { fontSize: 15, fontWeight: "600" },
  secondaryText: { fontSize: 12, marginTop: 2 },
  code: { fontSize: 12, fontWeight: "600", marginLeft: 8 },

  // Match card — split colour border
  matchCardOuter: {
    position: "relative",
    marginHorizontal: H_PAD,
    marginBottom: GAP,
    borderRadius: 14,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  matchSplitBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
  },
  matchBorderHalfLeft: {
    flex: 1,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  matchBorderHalfRight: {
    flex: 1,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
  },
  matchCardContent: {
    margin: 2,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  matchTeamLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  matchTeamRight: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  matchMiddle: {
    alignItems: "center",
    paddingHorizontal: 6,
    minWidth: 75,
  },
  matchLogo: { width: 40, height: 40 },
  matchLogoFallback: { borderRadius: 6 },
  matchTeamName: { flexShrink: 1, fontSize: 12, fontWeight: "600" },
  matchTeamNameRight: { textAlign: "right" },
  matchDate: { fontSize: 11, fontWeight: "600", textAlign: "center" },
  matchTime: { fontSize: 10, marginTop: 2, textAlign: "center" },

  // Error
  errorText: { marginBottom: 16, fontSize: 15 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: "#fff", fontWeight: "600" },
});

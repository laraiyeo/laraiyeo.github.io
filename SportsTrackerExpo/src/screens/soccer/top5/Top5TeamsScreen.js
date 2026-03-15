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
  RefreshControl,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../../context/ThemeContext";
import { useBetSlip } from "../../../context/BetSlipContext";
import { BannerAdWrapper } from "../../../services/ads";

const FOOTBALL_BASE = "https://laraiyeogithubio-production-08da.up.railway.app";
const CACHE_KEY = "top5:teams:v2";
const CACHE_TTL = 12 * 60 * 60 * 1000;
const RANK_CACHE_KEY = "top5:rank:v1";
const RANK_CACHE_TTL = 30 * 60 * 1000;

const { width } = Dimensions.get("window");
const H_PAD = 16;
const GAP = 10;
const CARD_WIDTH = (width - H_PAD * 2 - GAP) / 2;

async function fetchTeams() {
  const res = await fetch(`${FOOTBALL_BASE}/football/cache/teams`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data ?? [];
}

async function fetchRankings() {
  const res = await fetch(`${FOOTBALL_BASE}/football/rank`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data ?? [];
}

// Returns the best UEFA ranking entry, or rankings[0] as fallback, or null.
function getUefaRanking(team) {
  if (!Array.isArray(team.rankings) || team.rankings.length === 0) return null;
  const uefa = team.rankings.find((r) =>
    String(r.type?.name ?? r.type ?? "")
      .toLowerCase()
      .includes("uefa"),
  );
  return uefa ?? team.rankings[0] ?? null;
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

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export default function Top5TeamsScreen({ navigation }) {
  const { theme, colors, isDarkMode } = useTheme();
  const { isPro } = useBetSlip();
  const [teams, setTeams] = useState([]);
  const [ranks, setRanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [sortMode, setSortMode] = useState("UEFA"); // "UEFA" | "RANK" | "NAME" | "LEAGUE"
  const [viewMode, setViewMode] = useState("GRID"); // "GRID" | "LIST"
  const [collapsedLeagues, setCollapsedLeagues] = useState(new Set());

  const teamsById = useMemo(() => {
    const map = new Map();
    for (const t of teams) map.set(t?.id, t);
    return map;
  }, [teams]);

  const hasAnyRanking = useMemo(
    () =>
      teams.some((t) => Array.isArray(t?.rankings) && t.rankings.length > 0),
    [teams],
  );

  const sortModes = useMemo(
    () =>
      hasAnyRanking
        ? ["UEFA", "RANK", "NAME", "LEAGUE"]
        : ["RANK", "NAME", "LEAGUE"],
    [hasAnyRanking],
  );

  useEffect(() => {
    if (!hasAnyRanking && sortMode === "UEFA") {
      setSortMode("RANK");
    }
  }, [hasAnyRanking, sortMode]);

  const load = useCallback(async (force = false) => {
    try {
      if (!force) {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) {
          const { data, fetchedAt } = JSON.parse(raw);
          if (Date.now() - fetchedAt < CACHE_TTL) {
            setTeams(data);
            setLoading(false);
            return;
          }
        }
      }
      const data = await fetchTeams();
      await AsyncStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ data, fetchedAt: Date.now() }),
      );
      setTeams(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadRanks = useCallback(
    async (force = false) => {
      try {
        if (!force) {
          const raw = await AsyncStorage.getItem(RANK_CACHE_KEY);
          if (raw) {
            const { data, fetchedAt } = JSON.parse(raw);
            if (Date.now() - fetchedAt < RANK_CACHE_TTL) {
              setRanks(Array.isArray(data) ? data : []);
              return;
            }
          }
        }

        const data = await fetchRankings();
        await AsyncStorage.setItem(
          RANK_CACHE_KEY,
          JSON.stringify({ data, fetchedAt: Date.now() }),
        );
        setRanks(Array.isArray(data) ? data : []);
        setError(null);
      } catch (err) {
        if (sortMode === "RANK") setError(err.message);
      }
    },
    [sortMode],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (sortMode === "RANK") {
      loadRanks(false);
    }
  }, [sortMode, loadRanks]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([
      load(true),
      sortMode === "RANK" ? loadRanks(true) : Promise.resolve(),
    ]).finally(() => setRefreshing(false));
  }, [load, loadRanks, sortMode]);

  const toggleLeague = useCallback((name) => {
    setCollapsedLeagues((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  // Flat sorted team array for UEFA / NAME modes (includes _rank for UEFA).
  const sortedTeams = useMemo(() => {
    if (sortMode === "UEFA") {
      const ranked = [];
      const unranked = [];
      for (const t of teams) {
        const r = getUefaRanking(t);
        if (r?.position != null)
          ranked.push({ ...t, _rank: r, _rankPos: r.position });
        else unranked.push({ ...t, _rank: null, _rankPos: null });
      }
      // Lower position number = better rank; sort ascending
      ranked.sort((a, b) => a._rankPos - b._rankPos);
      unranked.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
      return [...ranked, ...unranked];
    }
    return [...teams].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? ""),
    );
  }, [teams, sortMode]);

  const rankTeams = useMemo(() => {
    const rows = Array.isArray(ranks) ? [...ranks] : [];
    rows.sort((a, b) => {
      const ra = Number.isFinite(Number(a?.current_rank))
        ? Number(a.current_rank)
        : Number.MAX_SAFE_INTEGER;
      const rb = Number.isFinite(Number(b?.current_rank))
        ? Number(b.current_rank)
        : Number.MAX_SAFE_INTEGER;
      return ra - rb;
    });

    return rows.map((row) => {
      const team = row?.team ?? {};
      const cachedTeam = teamsById.get(team?.id);
      const domesticLeague = (team?.activeseasons ?? [])
        .map((as) => as?.league)
        .find(
          (lg) =>
            String(lg?.type ?? "").toLowerCase() === "league" &&
            String(lg?.sub_type ?? "").toLowerCase() === "domestic",
        );

      return {
        id: team?.id ?? row?.team_id ?? null,
        name: team?.name ?? null,
        short_code: team?.short_code ?? null,
        image_path: team?.image_path ?? null,
        colorPrimary: cachedTeam?.colorPrimary ?? theme.border,
        _rankPos: row?.current_rank ?? null,
        _scaledScore: row?.scaled_score ?? null,
        _league: domesticLeague ?? null,
      };
    });
  }, [ranks, teamsById, theme.border]);

  // League groups for LEAGUE mode.
  const leagueGroups = useMemo(() => {
    if (sortMode !== "LEAGUE") return [];
    const map = new Map();
    for (const t of teams) {
      const key = t.activeseasons?.[0]?.league?.name ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === "Other") return 1;
        if (b === "Other") return -1;
        return a.localeCompare(b);
      })
      .map(([name, ts]) => ({
        name,
        teams: [...ts].sort((a, b) =>
          (a.name ?? "").localeCompare(b.name ?? ""),
        ),
      }));
  }, [teams, sortMode]);

  // Flat FlatList-ready data array.
  const flatListData = useMemo(() => {
    if (sortMode === "RANK") {
      if (viewMode === "GRID") {
        const rows = [];
        for (let i = 0; i < rankTeams.length; i += 2) {
          rows.push({
            type: "grid-row",
            key: `gr:rank:${i}`,
            teams: rankTeams.slice(i, i + 2),
          });
        }
        return rows;
      }
      return rankTeams.map((t) => ({
        type: "list-team",
        key: `lt:rank:${t.id}`,
        ...t,
      }));
    }

    if (sortMode === "LEAGUE") {
      const items = [];
      for (const g of leagueGroups) {
        const collapsed = collapsedLeagues.has(g.name);
        items.push({
          type: "league-header",
          key: `lh:${g.name}`,
          leagueName: g.name,
        });
        if (!collapsed) {
          if (viewMode === "GRID") {
            for (let i = 0; i < g.teams.length; i += 2) {
              items.push({
                type: "grid-row",
                key: `gr:${g.name}:${i}`,
                teams: g.teams.slice(i, i + 2),
              });
            }
          } else {
            for (const t of g.teams) {
              items.push({ type: "list-team", key: `lt:${t.id}`, ...t });
            }
          }
        }
      }
      return items;
    }
    if (viewMode === "GRID") {
      const rows = [];
      for (let i = 0; i < sortedTeams.length; i += 2) {
        rows.push({
          type: "grid-row",
          key: `gr:${i}`,
          teams: sortedTeams.slice(i, i + 2),
        });
      }
      return rows;
    }
    return sortedTeams.map((t) => ({
      type: "list-team",
      key: `lt:${t.id}`,
      ...t,
    }));
  }, [
    sortMode,
    leagueGroups,
    viewMode,
    sortedTeams,
    collapsedLeagues,
    rankTeams,
  ]);

  const renderItem = useCallback(
    ({ item }) => {
      // ── League section header ─────────────────────────────────────────────
      if (item.type === "league-header") {
        const collapsed = collapsedLeagues.has(item.leagueName);
        return (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => toggleLeague(item.leagueName)}
            style={[
              styles.leagueHeader,
              {
                backgroundColor: theme.surfaceSecondary,
                borderColor: theme.border,
              },
            ]}
          >
            <Text
              style={[styles.leagueHeaderText, { color: theme.text }]}
              numberOfLines={1}
            >
              {item.leagueName}
            </Text>
            <Ionicons
              name={collapsed ? "chevron-forward" : "chevron-down"}
              size={16}
              color={theme.textSecondary}
            />
          </TouchableOpacity>
        );
      }

      // ── Grid row (2 cards) ────────────────────────────────────────────────
      if (item.type === "grid-row") {
        return (
          <View style={styles.gridRow}>
            {item.teams.map((t) => {
              const rank = sortMode === "UEFA" ? (t._rank ?? null) : null;
              const borderColor = t.colorPrimary ?? theme.border;
              const isRankMode = sortMode === "RANK";
              const rankPos = t._rankPos;
              const scaledScore = t._scaledScore;
              const league = t._league;
              return (
                <TouchableOpacity
                  key={String(t.id)}
                  activeOpacity={0.75}
                  onPress={() =>
                    navigation.navigate("Top5TeamDetail", {
                      teamId: t.id,
                      teamName: t.name,
                    })
                  }
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.surface,
                      width: CARD_WIDTH,
                      borderColor,
                    },
                  ]}
                >
                  {rank != null && t._rankPos != null && (
                    <View
                      style={[
                        styles.rankBadge,
                        { backgroundColor: t.colorPrimary ?? theme.border },
                      ]}
                    >
                      <Text
                        style={[
                          styles.rankNum,
                          { color: getTextOnColor(t.colorPrimary) },
                        ]}
                      >
                        {ordinal(t._rankPos)}
                      </Text>
                    </View>
                  )}

                  {isRankMode && rankPos != null && (
                    <View
                      style={[
                        styles.rankBadgeLeft,
                        { backgroundColor: t.colorPrimary ?? theme.border },
                      ]}
                    >
                      <Text
                        style={[
                          styles.rankNum,
                          { color: getTextOnColor(t.colorPrimary) },
                        ]}
                      >
                        {ordinal(rankPos)}
                      </Text>
                    </View>
                  )}

                  {isRankMode && scaledScore != null && (
                    <View
                      style={[
                        styles.rankScoreBadge,
                        { backgroundColor: t.colorPrimary ?? theme.border },
                      ]}
                    >
                      <Text
                        style={[
                          styles.rankNum,
                          { color: getTextOnColor(t.colorPrimary) },
                        ]}
                      >
                        {scaledScore}
                      </Text>
                    </View>
                  )}

                  <View style={styles.cardLogoWrap}>
                    {t.image_path ? (
                      <Image
                        source={{ uri: t.image_path }}
                        style={styles.cardLogo}
                        resizeMode="contain"
                      />
                    ) : (
                      <View
                        style={[
                          styles.cardLogo,
                          styles.cardLogoFallback,
                          {
                            backgroundColor:
                              t.colorPrimary ?? theme.surfaceSecondary,
                          },
                        ]}
                      >
                        <Text style={styles.cardLogoLetter}>
                          {(t.name ?? "?")[0]}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[styles.cardName, { color: theme.text }]}
                    numberOfLines={2}
                  >
                    {t.name}
                  </Text>
                  {isRankMode ? (
                    league?.name ? (
                      <View style={styles.cardLeagueRow}>
                        {league?.image_path ? (
                          <Image
                            source={{ uri: league.image_path }}
                            style={[
                              styles.cardLeagueLogo,
                              {
                                tintColor:
                                  league.name === "Premier League" && isDarkMode
                                    ? theme.text
                                    : undefined,
                              },
                            ]}
                            resizeMode="contain"
                          />
                        ) : null}
                        <Text
                          style={[
                            styles.cardLeague,
                            { color: theme.textSecondary },
                          ]}
                          numberOfLines={1}
                        >
                          {league.name}
                        </Text>
                      </View>
                    ) : t.short_code ? (
                      <Text
                        style={[
                          styles.cardLeague,
                          { color: theme.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {t.short_code}
                      </Text>
                    ) : null
                  ) : t.activeseasons?.[0]?.league?.name ? (
                    <Text
                      style={[
                        styles.cardLeague,
                        { color: theme.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {t.activeseasons[0].league.name}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
            {item.teams.length === 1 && <View style={{ width: CARD_WIDTH }} />}
          </View>
        );
      }

      // ── List bubble ───────────────────────────────────────────────────────
      const rank = sortMode === "UEFA" ? (item._rank ?? null) : null;
      const activeLeague = item.activeseasons?.[0]?.league;
      const isRankMode = sortMode === "RANK";
      const borderColor = item.colorPrimary ?? theme.border;
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
            { backgroundColor: theme.surface, borderColor },
          ]}
        >
          {/* Position badge — top right */}
          {rank != null && item._rankPos != null && (
            <View
              style={[
                styles.rankBadgeList,
                { backgroundColor: item.colorPrimary ?? theme.border },
              ]}
            >
              <Text
                style={[
                  styles.rankNumList,
                  { color: getTextOnColor(item.colorPrimary) },
                ]}
              >
                {ordinal(item._rankPos)} Place
              </Text>
            </View>
          )}

          {/* Logo */}
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
                styles.logoFallback,
                {
                  backgroundColor: item.colorPrimary ?? theme.surfaceSecondary,
                },
              ]}
            >
              <Text style={styles.logoLetter}>{(item.name ?? "?")[0]}</Text>
            </View>
          )}

          {/* Name + league */}
          <View style={styles.rowInfo}>
            <Text
              style={[styles.rowName, { color: theme.text }]}
              numberOfLines={1}
            >
              {item.name}
            </Text>

            {isRankMode ? (
              item._league?.name ? (
                <View style={styles.rowLeagueWrap}>
                  {item._league?.image_path ? (
                    <Image
                      source={{ uri: item._league.image_path }}
                      style={[styles.rowLeagueLogo, { tintColor: item._league.name === "Premier League" && isDarkMode ? theme.text : undefined }]}
                      resizeMode="contain"
                    />
                  ) : null}
                  <Text
                    style={[styles.rowSub, { color: theme.textSecondary }]}
                    numberOfLines={1}
                  >
                    {item._league.name}
                  </Text>
                </View>
              ) : item.short_code ? (
                <Text
                  style={[styles.rowSub, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {item.short_code}
                </Text>
              ) : null
            ) : activeLeague?.name ? (
              <Text
                style={[styles.rowSub, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {activeLeague.name}
              </Text>
            ) : null}
          </View>

          {/* Points or abbreviation */}
          {isRankMode ? (
            <View style={styles.rankRightStack}>
              <Text style={[styles.rankRightScore, { color: theme.text }]}>
                {item._scaledScore ?? "-"}
              </Text>
              <Text
                style={[styles.rankRightRank, { color: theme.textSecondary }]}
              >
                {item._rankPos != null ? ordinal(item._rankPos) : "-"}
              </Text>
            </View>
          ) : rank?.points != null ? (
            <Text style={[styles.pts, { color: theme.textSecondary }]}>
              {rank.points.toLocaleString()} pts
            </Text>
          ) : item.short_code ? (
            <Text style={[styles.code, { color: theme.textTertiary }]}>
              {item.short_code}
            </Text>
          ) : null}
        </TouchableOpacity>
      );
    },
    [sortMode, theme, colors, collapsedLeagues, toggleLeague, navigation],
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

  const AD_SPACE = 80;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* ── Sort & view-mode banner ── */}
      <View
        style={[
          styles.banner,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <Text style={[styles.sortLabel, { color: theme.textSecondary }]}>
          Sort
        </Text>
        <View style={styles.sortBtns}>
          {sortModes.map((mode) => (
            <TouchableOpacity
              key={mode}
              onPress={() => setSortMode(mode)}
              style={[
                styles.sortBtn,
                {
                  backgroundColor:
                    sortMode === mode ? colors.primary : theme.surfaceSecondary,
                },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {mode === "RANK" ? (
                  <Ionicons
                    name="heart"
                    size={14}
                    color={theme.text}
                    style={{ marginRight: 6 }}
                  />
                ) : null}
                <Text
                  style={[
                    styles.sortBtnText,
                    { color: sortMode === mode ? "#fff" : theme.textSecondary },
                  ]}
                >
                  {mode}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          onPress={() => setViewMode((v) => (v === "GRID" ? "LIST" : "GRID"))}
          style={styles.viewToggle}
        >
          <Ionicons
            name={viewMode === "GRID" ? "list-outline" : "grid-outline"}
            size={22}
            color={theme.text}
          />
        </TouchableOpacity>
      </View>

      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ ...styles.listContent, paddingBottom: isPro ? 32 : 32 + AD_SPACE }}
        data={flatListData}
        keyExtractor={(item) => item.key}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        renderItem={renderItem}
      />

      {!isPro && (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" }}>
          <BannerAdWrapper />
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Banner
  banner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PAD,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sortLabel: { fontSize: 13, fontWeight: "600", marginRight: 10 },
  sortBtns: { flexDirection: "row", flex: 1 },
  sortBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    marginRight: 6,
  },
  sortBtnText: { fontSize: 12, fontWeight: "600" },
  viewToggle: { padding: 4 },

  // Shared list content padding
  listContent: { paddingBottom: 32, paddingTop: 8 },

  // Grid
  gridRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: GAP,
    paddingHorizontal: H_PAD,
  },
  card: {
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    borderWidth: 1.5,
  },
  rankBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  rankBadgeLeft: {
    position: "absolute",
    top: 6,
    left: 6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  rankScoreBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  rankNum: { fontSize: 10, fontWeight: "700" },
  rankBadgeList: {
    position: "absolute",
    top: 6,
    right: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rankNumList: { fontSize: 9, fontWeight: "700" },
  cardLogoWrap: { marginBottom: 8, marginTop: 10 },
  cardLogo: { width: 52, height: 52 },
  cardLogoFallback: {
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  cardLogoLetter: { color: "#fff", fontSize: 20, fontWeight: "700" },
  cardName: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  cardLeague: { fontSize: 11, marginTop: 3, textAlign: "center" },
  cardLeagueRow: {
    marginTop: 3,
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "95%",
    gap: 4,
  },
  cardLeagueLogo: {
    marginTop: 3,
    width: 12,
    height: 12,
  },

  // List bubble rows
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
  logoFallback: {
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  logoLetter: { color: "#fff", fontSize: 16, fontWeight: "700" },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: "600" },
  rowSub: { fontSize: 12, marginTop: 2 },
  rowLeagueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  rowLeagueLogo: {
    marginTop: 3,
    width: 13,
    height: 13,
  },
  rankRightStack: {
    alignItems: "flex-end",
    marginLeft: 8,
    minWidth: 46,
  },
  rankRightScore: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 20,
  },
  rankRightRank: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
  },
  pts: { fontSize: 12, fontWeight: "600", marginLeft: 8 },
  code: { fontSize: 12, fontWeight: "600", marginLeft: 8 },

  // League section header
  leagueHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: H_PAD,
    marginTop: 12,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  leagueHeaderText: { flex: 1, fontSize: 13, fontWeight: "700" },

  // Error
  errorText: { marginBottom: 16, fontSize: 15 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: "#fff", fontWeight: "600" },
});

"use strict";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../../context/ThemeContext";

const FOOTBALL_BASE = "https://laraiyeogithubio-production-08da.up.railway.app";
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function fetchLeague(leagueId) {
  const res = await fetch(`${FOOTBALL_BASE}/football/league/${leagueId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Pull a named stat value out of a details array
function getDetailVal(details, name) {
  if (!Array.isArray(details)) return null;
  const e = details.find(
    (d) => (d.type?.name ?? "").toLowerCase() === name.toLowerCase(),
  );
  return e?.value ?? null;
}

// Form dot colours
const FORM_COLORS = { W: "#22c55e", D: "#f59e0b", L: "#ef4444" };

function StandingsTab({ stages, theme, colors }) {
  const [filter, setFilter] = useState("ovr");
  const [mode, setMode] = useState("full");

  const sorted = useMemo(
    () =>
      [...stages].sort(
        (a, b) => (a.stage?.sort_order ?? 0) - (b.stage?.sort_order ?? 0),
      ),
    [stages],
  );

  if (!sorted.length) {
    return (
      <View style={stStyles.empty}>
        <Text style={{ color: theme.textSecondary }}>
          No standings available
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      {/* Filter bar */}
      <View
        style={[
          stStyles.filterBar,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <View style={stStyles.filterGroup}>
          {["ovr", "home", "away"].map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[
                stStyles.filterBtn,
                filter === f && { backgroundColor: colors.primary + "20" },
              ]}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  stStyles.filterBtnText,
                  {
                    color: filter === f ? colors.primary : theme.textSecondary,
                    fontWeight: filter === f ? "700" : "400",
                  },
                ]}
              >
                {f.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          onPress={() => setMode((m) => (m === "full" ? "short" : "full"))}
          style={[stStyles.modeBtn, { borderColor: colors.primary }]}
          activeOpacity={0.7}
        >
          <Text style={[stStyles.modeBtnText, { color: colors.primary }]}>
            {mode === "full" ? "FULL" : "SHORT"}
          </Text>
        </TouchableOpacity>
      </View>

      {sorted.map((section, si) => (
        <View key={si} style={stStyles.section}>
          {/* Stage header */}
          <View
            style={[
              stStyles.stageHeader,
              { backgroundColor: colors.primary + "18" },
            ]}
          >
            <Text style={[stStyles.stageName, { color: colors.primary }]}>
              {section.stage?.name ?? "Stage"}
            </Text>
          </View>

          {/* Entry rows */}
          {[...section.entries]
            .sort((a, b) => {
              const gp = (e) =>
                filter === "ovr"
                  ? (e.points ?? 0)
                  : filter === "home"
                    ? (getDetailVal(e.details, "Home Points") ?? 0)
                    : (getDetailVal(e.details, "Away Points") ?? 0);
              return gp(b) - gp(a);
            })
            .map((entry, idx) => {
              const p = entry.participant;
              const borderColor = p?.colorPrimary ?? theme.border;
              const recent = (entry.form ?? [])
                .slice(-5)
                .map((f) => f.form)
                .filter(Boolean);
              const result = (entry.result ?? "").toLowerCase();

              // Stats keyed by filter
              const gv = (name) => getDetailVal(entry.details, name) ?? 0;
              let w, d, l, gs, gc, mp, pts;
              if (filter === "ovr") {
                w = gv("Overall Won");
                d = gv("Overall Draw");
                l = gv("Overall Lost");
                gs = gv("Overal Goals Scored"); // API typo
                gc = gv("Overall Goals Conceded");
                mp = gv("Overall Matches Played");
                pts = entry.points ?? 0;
              } else if (filter === "home") {
                w = gv("Home Won");
                d = gv("Home Draw");
                l = gv("Home Lost");
                gs = gv("Home Goals Scored");
                gc = gv("Home Goals Conceded");
                mp = gv("Home Matched Played"); // API typo
                pts = gv("Home Points");
              } else {
                w = gv("Away Won");
                d = gv("Away Draw");
                l = gv("Away Lost");
                gs = gv("Away Goals Scored");
                gc = gv("Away Goals Conceded");
                mp = gv("Away Matched Played"); // API typo
                pts = gv("Away Points");
              }
              const fa = gs - gc;

              const shortName =
                p?.short_code ?? (p?.name ?? "???").slice(0, 3).toUpperCase();
              const displayName =
                mode === "full" ? shortName : (p?.name ?? "—");

              return (
                <View
                  key={entry.id ?? idx}
                  style={[
                    stStyles.row,
                    {
                      backgroundColor: theme.surface,
                      borderLeftColor: borderColor,
                    },
                  ]}
                >
                  {/* Rank with optional movement arrow */}
                  <View style={stStyles.rankCell}>
                    {result === "up" ? (
                      <Ionicons name="caret-up" size={9} color="#22c55e" />
                    ) : (
                      <View style={{ height: 9 }} />
                    )}
                    <Text
                      style={[stStyles.rank, { color: theme.textTertiary }]}
                    >
                      {idx + 1}
                    </Text>
                    {result === "down" ? (
                      <Ionicons name="caret-down" size={9} color="#ef4444" />
                    ) : (
                      <View style={{ height: 9 }} />
                    )}
                  </View>

                  {/* Logo + name */}
                  <View style={stStyles.teamCell}>
                    {p?.image_path ? (
                      <Image
                        source={{ uri: p.image_path }}
                        style={stStyles.logo}
                        resizeMode="contain"
                      />
                    ) : (
                      <View
                        style={[
                          stStyles.logo,
                          stStyles.logoFallback,
                          { backgroundColor: borderColor + "40" },
                        ]}
                      >
                        <Text style={{ fontSize: 10, color: theme.text }}>
                          {(p?.name ?? "?")[0]}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[stStyles.teamName, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {displayName}
                      </Text>
                      {mode === "full" && recent.length > 0 && (
                        <View style={stStyles.formRow}>
                          {recent.map((r, ri) => (
                            <View
                              key={ri}
                              style={[
                                stStyles.formDot,
                                {
                                  backgroundColor:
                                    FORM_COLORS[r] ?? theme.border,
                                },
                              ]}
                            />
                          ))}
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Stats — value on top, label below */}
                  {mode === "full" ? (
                    <>
                      <View style={stStyles.statCell}>
                        <Text style={[stStyles.statVal, { color: theme.text }]}>
                          {w}
                        </Text>
                        <Text
                          style={[
                            stStyles.statLbl,
                            { color: theme.textTertiary },
                          ]}
                        >
                          W
                        </Text>
                      </View>
                      <View style={stStyles.statCell}>
                        <Text style={[stStyles.statVal, { color: theme.text }]}>
                          {d}
                        </Text>
                        <Text
                          style={[
                            stStyles.statLbl,
                            { color: theme.textTertiary },
                          ]}
                        >
                          D
                        </Text>
                      </View>
                      <View style={stStyles.statCell}>
                        <Text style={[stStyles.statVal, { color: theme.text }]}>
                          {l}
                        </Text>
                        <Text
                          style={[
                            stStyles.statLbl,
                            { color: theme.textTertiary },
                          ]}
                        >
                          L
                        </Text>
                      </View>
                      <View style={[stStyles.statCell, { width: 55 }]}>
                        <Text style={[stStyles.statVal, { color: theme.text }]}>
                          {gs}-{gc}
                        </Text>
                        <Text
                          style={[
                            stStyles.statLbl,
                            { color: theme.textTertiary },
                          ]}
                        >
                          F-A
                        </Text>
                      </View>
                      <View style={stStyles.statCell}>
                        <Text
                          style={[stStyles.ptsVal, { color: colors.primary }]}
                        >
                          {pts}
                        </Text>
                        <Text
                          style={[
                            stStyles.statLbl,
                            { color: theme.textTertiary },
                          ]}
                        >
                          PTS
                        </Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={stStyles.statCell}>
                        <Text style={[stStyles.statVal, { color: theme.text }]}>
                          {mp}
                        </Text>
                        <Text
                          style={[
                            stStyles.statLbl,
                            { color: theme.textTertiary },
                          ]}
                        >
                          MP
                        </Text>
                      </View>
                      <View style={stStyles.statCell}>
                        <Text
                          style={[
                            stStyles.statVal,
                            {
                              color:
                                fa > 0
                                  ? theme.success
                                  : fa < 0
                                    ? theme.error
                                    : theme.text,
                            },
                          ]}
                        >
                          {fa > 0 ? `+${fa}` : fa}
                        </Text>
                        <Text
                          style={[
                            stStyles.statLbl,
                            { color: theme.textTertiary },
                          ]}
                        >
                          GD
                        </Text>
                      </View>
                      <View style={stStyles.statCell}>
                        <Text
                          style={[stStyles.ptsVal, { color: colors.primary }]}
                        >
                          {pts}
                        </Text>
                        <Text
                          style={[
                            stStyles.statLbl,
                            { color: theme.textTertiary },
                          ]}
                        >
                          PTS
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              );
            })}
        </View>
      ))}
    </ScrollView>
  );
}

const stStyles = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  section: { marginBottom: 20 },
  stageHeader: {
    marginHorizontal: 12,
    marginTop: 16,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  stageName: { fontSize: 13, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginBottom: 5,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderLeftWidth: 3,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterGroup: { flexDirection: "row", gap: 6 },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  filterBtnText: { fontSize: 12 },
  modeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  modeBtnText: { fontSize: 12, fontWeight: "700" },
  rankCell: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  rank: { fontSize: 12, textAlign: "center" },
  teamCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginRight: 4,
  },
  logo: { width: 28, height: 28 },
  logoFallback: {
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  teamName: { fontSize: 13, fontWeight: "600" },
  formRow: { flexDirection: "row", gap: 3, marginTop: 3 },
  formDot: { width: 6, height: 6, borderRadius: 3 },
  statCell: { width: 36, alignItems: "center" },
  statVal: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  statLbl: { fontSize: 9, textAlign: "center", marginTop: 1 },
  ptsVal: { fontSize: 14, fontWeight: "700", textAlign: "center" },
});

const TABS = [
  { key: "standings", label: "Standings", icon: "podium-outline" },
  { key: "teams", label: "Teams", icon: "people-outline" },
  { key: "matches", label: "Matches", icon: "football-outline" },
  { key: "stats", label: "Stats", icon: "stats-chart-outline" },
];

export default function Top5LeagueDetailScreen({ route, navigation }) {
  const { leagueId, leagueName } = route.params;
  const { theme, colors } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("standings");

  const cacheKey = `top5:league:${leagueId}`;

  const load = useCallback(
    async (force = false) => {
      try {
        if (!force) {
          const raw = await AsyncStorage.getItem(cacheKey);
          if (raw) {
            const { data: cached, fetchedAt } = JSON.parse(raw);
            if (Date.now() - fetchedAt < CACHE_TTL) {
              setData(cached);
              setLoading(false);
              return;
            }
          }
        }
        const json = await fetchLeague(leagueId);
        const d = json.data;
        await AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({ data: d, fetchedAt: Date.now() }),
        );
        setData(d);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [leagueId, cacheKey],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

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

  const info = data?.leagueInfo;
  const season = info?.currentseason;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* ── Header panel (info row + tab bar) ── */}
      <View
        style={[
          styles.headerPanel,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        {/* Info row */}
        <View style={styles.infoRow}>
          {info?.image_path ? (
            <Image
              source={{ uri: info.image_path }}
              style={styles.logo}
              resizeMode="contain"
            />
          ) : (
            <View
              style={[
                styles.logo,
                styles.logoFallback,
                { backgroundColor: theme.surfaceSecondary },
              ]}
            >
              <Text style={{ fontSize: 24 }}>⚽</Text>
            </View>
          )}
          <View style={styles.headerText}>
            <Text
              style={[styles.leagueName, { color: theme.text }]}
              numberOfLines={2}
            >
              {info?.name ?? leagueName}
            </Text>
            <View style={styles.metaRow}>
              {info?.country?.image_path ? (
                <Image
                  source={{ uri: info.country.image_path }}
                  style={styles.flag}
                  resizeMode="contain"
                />
              ) : null}
              {info?.country?.name ? (
                <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                  {info.country.name}
                </Text>
              ) : null}
              {info?.country?.name && season?.name ? (
                <Text style={[styles.dot, { color: theme.textTertiary }]}>
                  ·
                </Text>
              ) : null}
              {season?.name ? (
                <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                  {season.name}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Tab bar */}
        <View style={[styles.tabBar, { borderTopColor: theme.border }]}>
          {TABS.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.tabBtn}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={tab.icon}
                  size={20}
                  color={isActive ? colors.primary : theme.textTertiary}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color: isActive ? colors.primary : theme.textTertiary,
                      fontWeight: isActive ? "700" : "400",
                    },
                  ]}
                >
                  {tab.label}
                </Text>
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
        </View>
      </View>

      {/* ── Tab content ── */}
      {activeTab === "standings" ? (
        <StandingsTab
          stages={data?.standings ?? []}
          theme={theme}
          colors={colors}
        />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.content}
        >
          <View
            style={[styles.placeholder, { backgroundColor: theme.surface }]}
          >
            <Ionicons
              name={TABS.find((t) => t.key === activeTab)?.icon}
              size={40}
              color={theme.textTertiary}
            />
            <Text
              style={[styles.placeholderText, { color: theme.textSecondary }]}
            >
              {TABS.find((t) => t.key === activeTab)?.label} coming soon
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Header panel
  headerPanel: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  logo: { width: 56, height: 56, marginRight: 14 },
  logoFallback: {
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1 },
  leagueName: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  flag: { width: 20, height: 13, borderRadius: 2 },
  metaText: { fontSize: 13 },
  dot: { fontSize: 13, marginHorizontal: 2 },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 3,
    position: "relative",
  },
  tabLabel: { fontSize: 11 },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: "15%",
    right: "15%",
    height: 2.5,
    borderRadius: 2,
  },

  // Content
  content: { padding: 16, flexGrow: 1 },
  placeholder: {
    borderRadius: 16,
    paddingVertical: 48,
    alignItems: "center",
    gap: 12,
  },
  placeholderText: { fontSize: 15 },

  // Error
  errorText: { marginBottom: 16, fontSize: 15 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: "#fff", fontWeight: "600" },
});

"use strict";
import React, { useEffect, useState, useCallback } from "react";
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
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";

const FOOTBALL_BASE = "https://laraiyeogithubio-production-08da.up.railway.app";
const CACHE_KEY = "top5:search";
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

async function fetchSearchData() {
  const res = await fetch(`${FOOTBALL_BASE}/football/search`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const TABS = ["leagues", "teams", "players", "matches"];
const TAB_LABELS = { leagues: "Leagues", teams: "Teams", players: "Players", matches: "Matches" };

export default function Top5SearchScreen() {
  const { theme, colors } = useTheme();
  const [searchData, setSearchData] = useState({ leagues: [], teams: [], players: [], matches: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("leagues");

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
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data, fetchedAt: Date.now() }));
      setSearchData(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const filterItems = useCallback((items) => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((item) => {
      const name = (item.name ?? item.display_name ?? "").toLowerCase();
      const team = (item.team_name ?? "").toLowerCase();
      return name.includes(q) || team.includes(q);
    });
  }, [query]);

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
        <Text style={[styles.errorText, { color: theme.text }]}>Error: {error}</Text>
        <TouchableOpacity onPress={() => { setLoading(true); load(true); }} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const items = filterItems(searchData[activeTab] ?? []);

  const renderItem = ({ item }) => {
    switch (activeTab) {
      case "leagues":
        return (
          <View style={[styles.row, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            {item.image_path ? (
              <Image source={{ uri: item.image_path }} style={styles.logo} resizeMode="contain" />
            ) : (
              <View style={[styles.logo, styles.logoPlaceholder, { backgroundColor: theme.surfaceSecondary }]}>
                <Text style={{ fontSize: 16 }}>⚽</Text>
              </View>
            )}
            <View style={styles.info}>
              <Text style={[styles.primaryText, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
              {item.currentseason?.name ? (
                <Text style={[styles.secondaryText, { color: theme.textSecondary }]}>{item.currentseason.name}</Text>
              ) : null}
            </View>
          </View>
        );

      case "teams":
        return (
          <View style={[styles.row, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            {item.colorPrimary ? <View style={[styles.swatch, { backgroundColor: item.colorPrimary }]} /> : null}
            {item.image_path ? (
              <Image source={{ uri: item.image_path }} style={styles.logo} resizeMode="contain" />
            ) : (
              <View style={[styles.logo, styles.logoPlaceholder, { backgroundColor: item.colorPrimary ?? theme.surfaceSecondary }]}>
                <Text style={styles.logoFallback}>{(item.name ?? "?")[0]}</Text>
              </View>
            )}
            <View style={styles.info}>
              <Text style={[styles.primaryText, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
              {item.activeseasons?.[0]?.league?.name ? (
                <Text style={[styles.secondaryText, { color: theme.textSecondary }]}>{item.activeseasons[0].league.name}</Text>
              ) : null}
            </View>
            {item.short_code ? <Text style={[styles.code, { color: theme.textTertiary }]}>{item.short_code}</Text> : null}
          </View>
        );

      case "players":
        return (
          <View style={[styles.row, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            {item.team_colorPrimary ? <View style={[styles.swatch, { backgroundColor: item.team_colorPrimary }]} /> : null}
            {item.image_path ? (
              <Image source={{ uri: item.image_path }} style={styles.avatar} resizeMode="contain" />
            ) : (
              <View style={[styles.avatar, styles.logoPlaceholder, { backgroundColor: item.team_colorPrimary ?? theme.surfaceSecondary }]}>
                <Ionicons name="person" size={18} color="#fff" />
              </View>
            )}
            <View style={styles.info}>
              <Text style={[styles.primaryText, { color: theme.text }]} numberOfLines={1}>
                {item.display_name ?? item.name}
              </Text>
              {item.team_name ? (
                <Text style={[styles.secondaryText, { color: theme.textSecondary }]}>{item.team_name}</Text>
              ) : null}
            </View>
          </View>
        );

      case "matches":
        return (
          <View style={[styles.row, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <View style={styles.info}>
              <Text style={[styles.primaryText, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
              {item.starting_at ? (
                <Text style={[styles.secondaryText, { color: theme.textSecondary }]}>
                  {item.starting_at.slice(0, 10)}
                </Text>
              ) : null}
            </View>
            <View style={styles.matchTeams}>
              {item.homeTeam?.colorPrimary ? (
                <View style={[styles.dotSwatch, { backgroundColor: item.homeTeam.colorPrimary }]} />
              ) : null}
              {item.awayTeam?.colorPrimary ? (
                <View style={[styles.dotSwatch, { backgroundColor: item.awayTeam.colorPrimary, marginLeft: 4 }]} />
              ) : null}
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Ionicons name="search" size={18} color={theme.textTertiary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search…"
          placeholderTextColor={theme.textTertiary}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        {TABS.map((tab) => {
          const isActive = tab === activeTab;
          return (
            <TouchableOpacity
              key={tab}
              style={styles.tabItem}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabLabel, { color: isActive ? colors.primary : theme.textSecondary, fontWeight: isActive ? "700" : "400" }]}>
                {TAB_LABELS[tab]}
              </Text>
              <Text style={[styles.tabCount, { color: theme.textTertiary }]}>
                {(searchData[tab] ?? []).length}
              </Text>
              {isActive && <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={items}
        keyExtractor={(item, idx) => String(item.id ?? item.player_id ?? idx)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={[styles.center, { paddingTop: 60 }]}>
            <Text style={{ color: theme.textSecondary }}>
              {query ? "No results found" : "No data available"}
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 4 },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  swatch: { width: 4, height: 36, borderRadius: 2, marginRight: 8 },
  dotSwatch: { width: 10, height: 10, borderRadius: 5 },
  logo: { width: 36, height: 36, marginRight: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 12 },
  logoPlaceholder: { alignItems: "center", justifyContent: "center" },
  logoFallback: { color: "#fff", fontSize: 16, fontWeight: "700" },
  info: { flex: 1 },
  primaryText: { fontSize: 15, fontWeight: "600" },
  secondaryText: { fontSize: 12, marginTop: 2 },
  code: { fontSize: 12, fontWeight: "600", marginLeft: 8 },
  matchTeams: { flexDirection: "row", alignItems: "center" },
  errorText: { marginBottom: 16, fontSize: 15 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: "#fff", fontWeight: "600" },
});

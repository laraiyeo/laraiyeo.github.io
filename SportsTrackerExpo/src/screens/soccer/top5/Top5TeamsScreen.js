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
  RefreshControl,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../../context/ThemeContext";

const FOOTBALL_BASE = "https://laraiyeogithubio-production-08da.up.railway.app";
const CACHE_KEY = "top5:teams";
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

async function fetchTeams() {
  const res = await fetch(`${FOOTBALL_BASE}/football/cache/teams`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data ?? [];
}

export default function Top5TeamsScreen() {
  const { theme, colors } = useTheme();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

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

  const sorted = [...teams].sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? ""),
  );

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.list}
      data={sorted}
      keyExtractor={(item) => String(item.id)}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
      renderItem={({ item }) => {
        const activeLeague = item.activeseasons?.[0]?.league;
        return (
          <View
            style={[
              styles.row,
              {
                backgroundColor: theme.surface,
                borderBottomColor: theme.border,
              },
            ]}
          >
            {/* Color swatch */}
            {item.colorPrimary ? (
              <View
                style={[styles.swatch, { backgroundColor: item.colorPrimary }]}
              />
            ) : null}
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
                style={[styles.name, { color: theme.text }]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              {activeLeague?.name ? (
                <Text
                  style={[styles.sub, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {activeLeague.name}
                </Text>
              ) : null}
            </View>
            {item.short_code ? (
              <Text style={[styles.code, { color: theme.textTertiary }]}>
                {item.short_code}
              </Text>
            ) : null}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingBottom: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  swatch: { width: 4, height: 36, borderRadius: 2, marginRight: 8 },
  logo: { width: 36, height: 36, marginRight: 12 },
  logoPlaceholder: {
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  logoFallback: { color: "#fff", fontSize: 16, fontWeight: "700" },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: "600" },
  sub: { fontSize: 12, marginTop: 2 },
  code: { fontSize: 12, fontWeight: "600", marginLeft: 8 },
  errorText: { marginBottom: 16, fontSize: 15 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: "#fff", fontWeight: "600" },
});

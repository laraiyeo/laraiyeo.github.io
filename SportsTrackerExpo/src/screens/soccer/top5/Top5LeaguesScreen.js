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
  Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../../context/ThemeContext";
import { useBetSlip } from "../../../context/BetSlipContext";
import { BannerAdWrapper } from "../../../services/ads";

const FOOTBALL_BASE = "https://laraiyeogithubio-production-08da.up.railway.app";
const CACHE_KEY = "top5:leagues:v1";
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

const { width } = Dimensions.get("window");
const H_PAD = 16;
const GAP = 10;
const CARD_WIDTH = (width - H_PAD * 2 - GAP) / 2;

async function fetchLeagues() {
  const res = await fetch(`${FOOTBALL_BASE}/football/cache/leagues`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data ?? [];
}

function titleCaseHyphen(str) {
  if (!str) return "";
  return str
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}

export default function Top5LeaguesScreen({ navigation }) {
  const { theme, colors, isDarkMode } = useTheme();
  const { isPro } = useBetSlip();
  const [leagues, setLeagues] = useState([]);
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
            setLeagues(data);
            setLoading(false);
            return;
          }
        }
      }
      const data = await fetchLeagues();
      await AsyncStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ data, fetchedAt: Date.now() }),
      );
      setLeagues(data);
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

  // Pair leagues into rows of 2
  const rows = [];
  for (let i = 0; i < leagues.length; i += 2) {
    rows.push(leagues.slice(i, i + 2));
  }

  const AD_SPACE = 80;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={{
          ...styles.list,
          paddingBottom: isPro ? 32 : 32 + AD_SPACE,
        }}
        data={rows}
        keyExtractor={(_, idx) => String(idx)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item: row }) => (
          <View style={styles.rowWrap}>
            {row.map((item) => (
              <TouchableOpacity
                key={String(item.id)}
                activeOpacity={0.75}
                onPress={() =>
                  navigation.navigate("Top5LeagueDetail", {
                    leagueId: item.id,
                    leagueName: item.name,
                  })
                }
                style={[
                  styles.card,
                  { backgroundColor: theme.surface, width: CARD_WIDTH },
                ]}
              >
                {/* League logo */}
                <View style={styles.logoWrap}>
                  {item.image_path ? (
                    <Image
                      source={{ uri: item.image_path }}
                      style={[
                        styles.logo,
                        {
                          tintColor:
                            item.id === 8 && isDarkMode
                              ? theme.text
                              : undefined,
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
                      <Text style={{ fontSize: 22 }}>⚽</Text>
                    </View>
                  )}
                </View>

                {/* Name */}
                <Text
                  style={[styles.name, { color: theme.text }]}
                  numberOfLines={2}
                >
                  {item.name}
                </Text>

                {/* Season */}
                {item.currentseason?.name ? (
                  <Text
                    style={[styles.season, { color: theme.textSecondary }]}
                    numberOfLines={1}
                  >
                    {item.currentseason.name}
                  </Text>
                ) : null}

                {/* Sub-type badge */}
                {item.sub_type ? (
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: colors.primary + "22" },
                    ]}
                  >
                    <Text style={[styles.badgeText, { color: colors.primary }]}>
                      {titleCaseHyphen(item.sub_type)}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}
            {/* Fill empty slot in odd row */}
            {row.length === 1 && <View style={{ width: CARD_WIDTH }} />}
          </View>
        )}
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
  list: { padding: H_PAD, paddingBottom: 32 },
  rowWrap: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: GAP,
  },
  card: {
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  logoWrap: {
    width: 56,
    height: 56,
    marginBottom: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { width: 52, height: 52 },
  logoPlaceholder: {
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  season: { fontSize: 11, textAlign: "center", marginBottom: 6 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    marginTop: 2,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
  errorText: { marginBottom: 16, fontSize: 15 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: "#fff", fontWeight: "600" },
});

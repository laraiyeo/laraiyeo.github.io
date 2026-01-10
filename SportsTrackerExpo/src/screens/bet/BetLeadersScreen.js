import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Animated,
  Dimensions,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { supabase } from "../../config/supabase";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function getWeekStartMostRecentSunday(d = new Date()) {
  const day = d.getDay();
  const diff = (day + 7 - 0) % 7; // days since sunday
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - diff);
  sunday.setHours(0, 0, 0, 0);
  return sunday;
}

function formatDateShort(dt) {
  try {
    const d = new Date(dt);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch (e) {
    return "-";
  }
}

function initialsFor(name) {
  if (!name) return "?";
  const s = String(name).trim();
  return s.charAt(0).toUpperCase();
}

const rankColors = ["#FFD700", "#C0C0C0", "#CD7F32"]; // gold, silver, bronze

const BetLeadersScreen = () => {
  const { theme, colors } = useTheme();
  const flatRef = useRef(null);
  const [flashIndex, setFlashIndex] = useState(null);
  const flashAnim = useRef(new Animated.Value(0)).current;

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        // capture current user id first
        let uid = null;
        try {
          const { data: userData } = await supabase.auth.getUser();
          uid = userData?.user?.id || null;
          if (uid) setUserId(uid);
        } catch (e) {
          console.warn("leaderboard: could not get current user id", e);
        }

        const { data: rows, error } = await supabase
          .from("leaderboard")
          .select(
            "user_id,multiplier,total_bets,username,first_bet,credits_start,credits_current,updated_at"
          )
          .order("multiplier", { ascending: false })
          .limit(50);
        if (error) {
          console.error("leaderboard fetch error", error);
        }
        const list = (rows || []).map((r, i) => ({
          rank: i + 1,
          username: r.username || r.user_id,
          multiplier: Number(r.multiplier) || 0,
          total_bets: r.total_bets || 0,
          first_bet_date: r.first_bet || null,
          credits_start: r.credits_start || null,
          credits_current: r.credits_current || null,
          id: `leader-${r.user_id}`,
          user_id: r.user_id,
          isYou: !!(r.user_id && uid && r.user_id === uid),
        }));

        // find current user
        try {
          const { data: userData } = await supabase.auth.getUser();
          const uid = userData?.user?.id;
          if (uid) {
            setUserId(uid);
            const found = list.find((l) => l.user_id === uid);
            if (!found) {
              // fetch user's leaderboard row and compute rank
              const { data: myRow, error: myErr } = await supabase
                .from("leaderboard")
                .select(
                  "user_id,multiplier,total_bets,username,first_bet,credits_start,credits_current"
                )
                .eq("user_id", uid)
                .maybeSingle();
              if (myErr) console.error("leaderboard myRow err", myErr);
              if (myRow) {
                // compute rank by counting users with higher multiplier
                const { count } = await supabase
                  .from("leaderboard")
                  .select("user_id", { count: "exact", head: true })
                  .gt("multiplier", myRow.multiplier || 0);
                const myRank = (count || 0) + 1;
                list.push({ gap: true, id: `gap-${uid}` });
                list.push({
                  rank: myRank,
                  username: myRow.username || "You",
                  multiplier: Number(myRow.multiplier) || 0,
                  total_bets: myRow.total_bets || 0,
                  first_bet_date: myRow.first_bet || null,
                  credits_start: myRow.credits_start || null,
                  credits_current: myRow.credits_current || null,
                  id: `leader-${uid}`,
                  user_id: uid,
                  isYou: true,
                });
              }
            }
          }
        } catch (e) {
          console.warn("leaderboard: could not compute current user", e);
        }

        if (mounted) setData(list);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  function scrollToUserAndFlash() {
    // Locate index of the item with isYou:true
    const idx = data.findIndex((d) => d.isYou);

    if (idx === -1) {
      // User not found on leaderboard
      Alert.alert(
        "Not on Leaderboard",
        "You're not on the leaderboard yet. Place some bets to get started!",
        [{ text: "OK" }]
      );
      return;
    }

    // Scroll to user and flash
    flatRef.current?.scrollToIndex({ index: idx, viewPosition: 0.5 });
    setFlashIndex(idx);
    flashAnim.setValue(0);
    // two quick pulses using flashAnim
    Animated.sequence([
      Animated.timing(flashAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(flashAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(flashAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(flashAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(flashAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(flashAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start(() => {
      // clear flash shortly after animation completes
      setTimeout(() => setFlashIndex(null), 100);
    });
  }

  useEffect(() => {
    // If flashing, pulse background by interpolating flashAnim
  }, [flashAnim]);

  const renderItem = ({ item, index }) => {
    if (item.gap) {
      return <View style={{ height: 24 }} />;
    }
    const isTopThree = item.rank >= 1 && item.rank <= 3;
    const isYou = !!item.isYou;
    const showAvatar = isTopThree || isYou;
    const flashColor = (colors && colors.accent) || "#ffd54f";
    const background =
      flashIndex === index
        ? flashAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [theme.background, flashColor],
          })
        : theme.background;

    return (
      <Animated.View
        style={[
          styles.itemContainer,
          { backgroundColor: background, borderColor: theme.border || "#eee" },
        ]}
      >
        <View style={styles.rankBadgeContainer} pointerEvents="none">
          <View style={styles.rankBadge}>
            <Text style={styles.rankBadgeText}>
              <Text style={styles.superscript}>#</Text>
              {item.rank}
            </Text>
          </View>
        </View>

        <View style={styles.leftRow}>
          {showAvatar ? (
            <View
              style={[
                styles.avatarWrap,
                isTopThree
                  ? { borderColor: rankColors[item.rank - 1] || "transparent" }
                  : {},
              ]}
            >
              <View
                style={[
                  styles.avatar,
                  isTopThree
                    ? {
                        backgroundColor:
                          item.rank === 1
                            ? "#e6c200"
                            : item.rank === 2
                            ? "#9ea0a0"
                            : "#a8651f",
                      }
                    : { backgroundColor: colors.primary || "#666" },
                ]}
              >
                <Text style={styles.avatarText}>
                  {initialsFor(item.username)}
                </Text>
              </View>
              {isTopThree && (
                <View
                  style={[
                    styles.trophyWrap,
                    {
                      backgroundColor: theme.surfaceSecondary,
                      borderColor:
                        rankColors[item.rank - 1] || "#000" || "#eee",
                      borderWidth: 1,
                    },
                  ]}
                >
                  <Ionicons
                    name="trophy"
                    size={15}
                    color={rankColors[item.rank - 1] || "#000"}
                  />
                </View>
              )}
            </View>
          ) : (
            <View style={{ width: 0, height: 0 }} />
          )}
          <View style={styles.nameBlock}>
            <Text
              style={[
                styles.usernameText,
                isYou
                  ? { fontWeight: "800", color: theme.text }
                  : { fontWeight: "400", color: theme.text },
              ]}
            >
              {item.username}
            </Text>
            <Text style={[styles.subText, { color: theme.textSecondary }]}>
              First Bet: {formatDateShort(item.first_bet_date)}
            </Text>
          </View>
        </View>

        <View style={styles.rightRow}>
          <Text style={[styles.multiplierText, { color: theme.text }]}>
            {item.multiplier.toFixed
              ? item.multiplier.toFixed(2)
              : String(item.multiplier)}
          </Text>
          <Text style={[styles.smallText, { color: theme.textSecondary }]}>
            {item.total_bets} bets
          </Text>
        </View>
      </Animated.View>
    );
  };

  function getWeekStartPST() {
    // Compute most recent Sunday at 02:00 PST (UTC-8)
    const now = new Date();
    const pstOffsetMs = 8 * 60 * 60 * 1000; // PST is UTC-8
    const pstMs = now.getTime() - pstOffsetMs;
    const pstDate = new Date(pstMs);
    const day = pstDate.getUTCDay();
    const diff = day; // days since sunday
    const sundayPst = new Date(pstDate);
    sundayPst.setUTCDate(pstDate.getUTCDate() - diff);
    sundayPst.setUTCHours(2, 0, 0, 0);
    const weekStartUtcMs = sundayPst.getTime() + pstOffsetMs;
    return new Date(weekStartUtcMs);
  }

  function formatWeekStartLabel(weekStart) {
    const weekday = weekStart.toLocaleDateString(undefined, {
      weekday: "short",
    });
    const rest = weekStart.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    const nextWeek = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const now = new Date();
    let delta = nextWeek.getTime() - now.getTime();
    if (delta < 0) delta = 0;
    const days = Math.floor(delta / (24 * 60 * 60 * 1000));
    if (days >= 1) return `${weekday}, ${rest} (${days} d left)`;
    const hours = Math.max(0, Math.ceil(delta / (60 * 60 * 1000)));
    return `${weekday}, ${rest} (${hours} h left)`;
  }

  const weekStart = useMemo(() => getWeekStartPST(), []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.headerTitle, { color: theme.text }]}>
        Weekly Leaderboard
      </Text>
      <FlatList
        ref={flatRef}
        data={data}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 12, paddingBottom: 96 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />

      <View
        style={[
          styles.footer,
          {
            borderTopColor: theme.border,
            backgroundColor: theme.background || "#eee",
          },
        ]}
      >
        <Text style={[styles.footerText, { color: theme.textSecondary }]}>
          Week start: {formatWeekStartLabel(weekStart)}
        </Text>
        <TouchableOpacity
          style={[
            styles.showButton,
            { backgroundColor: theme.primary || "#c62828" },
          ]}
          onPress={scrollToUserAndFlash}
        >
          <Text style={styles.showButtonText}>Show Me</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: "700", padding: 12 },
  itemContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "visible",
    marginTop: 10,
  },
  leftRow: { flexDirection: "row", alignItems: "center", flex: 1 },
  avatarWrap: { marginRight: 12, position: "relative" },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 40 },
  trophyWrap: {
    position: "absolute",
    right: -6,
    bottom: -6,
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
  },
  nameBlock: { justifyContent: "center" },
  usernameText: { fontSize: 16, fontWeight: "700" },
  subText: { fontSize: 12, color: "#666" },
  rightRow: { alignItems: "flex-end", width: 110 },
  multiplierText: { fontSize: 20, fontWeight: "900" },
  smallText: { fontSize: 12, color: "#666" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    backgroundColor: "transparent",
  },
  footerText: { fontSize: 14 },
  showButton: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  showButtonText: { color: "#fff", fontWeight: "800" },
  rankBadgeContainer: {
    position: "absolute",
    right: -10,
    top: -20,
    zIndex: 10,
  },
  rankBadge: {
    backgroundColor: "#222",
    width: 34,
    height: 34,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rankBadgeText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  superscript: { fontSize: 10 },
});

export default BetLeadersScreen;

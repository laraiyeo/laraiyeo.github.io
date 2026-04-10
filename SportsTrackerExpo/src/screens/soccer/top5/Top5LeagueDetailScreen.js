"use strict";
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
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
  Modal,
  Pressable,
  useWindowDimensions,
} from "react-native";
import {
  Ionicons,
  MaterialCommunityIcons,
  FontAwesome5,
} from "@expo/vector-icons";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
} from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { useTheme } from "../../../context/ThemeContext";

const FOOTBALL_BASE = "https://laraiyeogithubio-production-08da.up.railway.app";
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

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

// Parse aggregate score from match.aggregate — returns home/away aggregate numbers
const parseAggregate = (match) => {
  const agg = match?.aggregate;
  if (!agg?.result || !agg?.name) return null;
  const res = String(agg.result || "").trim();
  const m = res.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!m) return null;
  const leftScore = parseInt(m[1], 10);
  const rightScore = parseInt(m[2], 10);
  const nameParts = String(agg.name || "").split(/\s+vs\.?\s+|\s+v\s+/i);
  if (!nameParts || nameParts.length < 2) return null;
  const leftName = nameParts[0].trim().toLowerCase();
  const rightName = nameParts[1].trim().toLowerCase();

  const participants = match?.participants ?? [];
  const findByName = (needle) =>
    participants.find((p) => {
      if (!p?.name) return false;
      const n = p.name.toLowerCase();
      return n === needle || n.includes(needle) || needle.includes(n);
    });

  const leftP = findByName(leftName);
  const rightP = findByName(rightName);

  let homeAgg = null;
  let awayAgg = null;
  if (leftP && leftP.meta?.location === "home") {
    homeAgg = leftScore;
    awayAgg = rightScore;
  } else if (leftP && leftP.meta?.location === "away") {
    awayAgg = leftScore;
    homeAgg = rightScore;
  } else if (rightP && rightP.meta?.location === "home") {
    homeAgg = rightScore;
    awayAgg = leftScore;
  } else if (rightP && rightP.meta?.location === "away") {
    awayAgg = rightScore;
    homeAgg = leftScore;
  } else {
    // Fallback: assume left => home, right => away
    homeAgg = leftScore;
    awayAgg = rightScore;
  }

  return { homeAgg, awayAgg };
};

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

// Rule type → left-border colour (case-insensitive lookup)
const RULE_COLORS_MAP = {
  // European competitions
  "uefa champions league": "#008000",
  "8th finals": "#008000",
  "uefa champions league qualifiers": "#81D6AC",
  "champions league qualifiers play_off": "#81D6AC",
  "champions league qualifiers play-off": "#81D6AC",
  "16th finals": "#81D6AC",
  "final tournament": "#81D6AC",
  "semi-finals": "#81D6AC",
  "uefa europa league": "#469dfa",
  "play-off": "#469dfa",
  "uefa europa league play-off": "#469dfa",
  "uefa europa league play_off": "#469dfa",
  "uefa europa league qualifiers": "#469dfa",
  "uefa europa league play-offs": "#469dfa",
  "uefa conference league qualifiers": "#ADD8E6",
  "uefa conference league qualifiers play-off": "#ADD8E6",
  "uefa conference league qualifiers play_off": "#ADD8E6",
  "uefa conference league play-offs": "#ADD8E6",
  // Split-season rounds
  champion: "#f59e0b",
  "championship round": "#8b5cf6",
  "championship round relegation round": "#8b5cf6",
  // Promotion
  promotion: "#10b981",
  "final series": "#10b981",
  "promotion group": "#6ee7b7",
  "promotion play-off": "#6ee7b7",
  "promotion play_off": "#6ee7b7",
  "possible promotion": "#6ee7b7",
  "possible promotion play-off": "#6ee7b7",
  // Middle / lower rounds
  "relegation round": "#fb923c",
  "final series play-offs": "#fb923c",
  "lower table round": "#fb923c",
  "middle play_off": "#fb923c",
  "middle play-off": "#fb923c",
  "ranking of third-placed teams": "#fb923c",
  // Relegation – severe
  relegation: "#FF7F84",
  "possible relegation": "#FF7F84",
  "relegation group": "#FF7F84",
  "relegation play_off": "#FFFF00",
  "relegation play-off": "#FFFF00",
  "possible relegation play_off": "#FFFF00",
  "possible relegation play-off": "#FFFF00",
};

function getRuleColor(type) {
  if (!type) return null;
  return RULE_COLORS_MAP[type.toLowerCase()] ?? null;
}

function StandingsTab({ stages, theme, colors, navigation }) {
  const [filter, setFilter] = useState("ovr");
  const [mode, setMode] = useState("full");

  const sorted = useMemo(
    () =>
      [...stages].sort(
        (a, b) => (a.stage?.sort_order ?? 0) - (b.stage?.sort_order ?? 0),
      ),
    [stages],
  );

  const legendEntries = useMemo(() => {
    const seen = new Map();
    for (const section of sorted) {
      for (const entry of section.entries) {
        const t = entry.rule?.type;
        if (t && !seen.has(t)) {
          const color = getRuleColor(t);
          if (color) seen.set(t, color);
        }
      }
    }
    return [...seen.entries()].map(([type, color]) => ({ type, color }));
  }, [sorted]);

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
          {(() => {
            const pointsFor = (e) =>
              filter === "ovr"
                ? (e.points ?? 0)
                : filter === "home"
                  ? (getDetailVal(e.details, "Home Points") ?? 0)
                  : (getDetailVal(e.details, "Away Points") ?? 0);

            const entriesSorted = [...section.entries].sort(
              (a, b) => pointsFor(b) - pointsFor(a),
            );

            const renderEntryRow = (entry, idx, keyPrefix = "all") => {
              const p = entry.participant;
              const ruleColor = getRuleColor(entry.rule?.type);
              const borderColor = ruleColor ?? theme.surface;
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
                <TouchableOpacity
                  key={`${keyPrefix}_${entry.id ?? idx}`}
                  activeOpacity={p?.id != null && navigation ? 0.7 : 1}
                  onPress={
                    p?.id != null && navigation
                      ? () =>
                          navigation?.navigate("Top5TeamDetail", {
                            teamId: p.id,
                            teamName: p.name,
                          })
                      : undefined
                  }
                  style={[
                    stStyles.row,
                    {
                      backgroundColor: theme.surface,
                      borderLeftColor: borderColor,
                    },
                  ]}
                >
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
                </TouchableOpacity>
              );
            };

            const isGroupStage = String(section.stage?.name ?? "")
              .toLowerCase()
              .includes("group stage");

            if (!isGroupStage) {
              return entriesSorted.map((entry, idx) =>
                renderEntryRow(entry, idx, `all_${si}`),
              );
            }

            const grouped = new Map();
            for (const entry of entriesSorted) {
              const groupName = String(entry.group ?? "Ungrouped").trim() || "Ungrouped";
              if (!grouped.has(groupName)) grouped.set(groupName, []);
              grouped.get(groupName).push(entry);
            }

            const orderedGroups = [...grouped.keys()].sort((a, b) =>
              a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
            );

            return orderedGroups.map((groupName) => {
              const groupEntries = grouped.get(groupName) ?? [];
              return (
                <View key={`${si}_${groupName}`}>
                  <View
                    style={[
                      stStyles.groupHeader,
                      { backgroundColor: colors.primary + "10", borderColor: colors.primary },
                    ]}
                  >
                    <Text style={[stStyles.groupName, { color: colors.primary }]}>
                      {groupName}
                    </Text>
                  </View>
                  {groupEntries.map((entry, idx) =>
                    renderEntryRow(entry, idx, `${si}_${groupName}`),
                  )}
                </View>
              );
            });
          })()}
        </View>
      ))}
      {legendEntries.length > 0 && (
        <View style={[stStyles.legend, { borderTopColor: theme.border }]}>
          {legendEntries.map(({ type, color }) => (
            <View key={type} style={stStyles.legendItem}>
              <View
                style={[stStyles.legendSwatch, { backgroundColor: color }]}
              />
              <Text
                style={[stStyles.legendLabel, { color: theme.textSecondary }]}
              >
                {type}
              </Text>
            </View>
          ))}
        </View>
      )}
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
  groupHeader: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  groupName: {
    fontSize: 12,
    fontWeight: "700",
  },
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
  legend: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  legendLabel: { fontSize: 11 },
});

// ─── Matches Tab ────────────────────────────────────────────────────────────

const TODAY = new Date();

// DEBUG: log current times and computed date keys to diagnose timezone issues
try {
  const utc = TODAY.toISOString();
  const local = TODAY.toString();
  let ny = null;
  try {
    ny = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  } catch (e) {
    ny = "(toLocaleString timeZone unsupported)";
  }
} catch (err) {
  console.log("[Top5 Debug] error logging dates:", err);
}
function dateKeyFromDate(d) {
  // Use local date components (YYYY-MM-DD) so "Today/Yesterday/Tomorrow"
  // reflect the device/local timezone rather than UTC. This avoids mixing
  // UTC (toISOString) with local-midnight computations which produced
  // inconsistent keys across boundaries.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const todayStr = dateKeyFromDate(TODAY);
const yesterdayStr = dateKeyFromDate(
  new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - 1),
);
const tomorrowStr = dateKeyFromDate(
  new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + 1),
);

function formatDateLabel(dateKey) {
  if (dateKey === todayStr) return "Today";
  if (dateKey === yesterdayStr) return "Yesterday";
  if (dateKey === tomorrowStr) return "Tomorrow";
  const d = new Date(dateKey + "T12:00:00");
  const sameYear = d.getFullYear() === TODAY.getFullYear();
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

// Format UTC timestamp using the device locale without forcing a timezone
// override so we respect the fetched JSON time semantics.
function formatTimeFromUtc(utcStr) {
  const d = new Date(String(utcStr).replace(" ", "T"));
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const FALLBACK_COLOR = "#888888";

function MatchGradient({ gradId, homeColor, awayColor }) {
  const left = homeColor || FALLBACK_COLOR;
  const right = awayColor || FALLBACK_COLOR;
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      pointerEvents="none"
    >
      <Defs>
        <SvgLinearGradient
          id={`mg_${gradId}`}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="0%"
        >
          <Stop offset="0%" stopColor={left} stopOpacity="0.35" />
          <Stop offset="35%" stopColor={left} stopOpacity="0" />
          <Stop offset="65%" stopColor={right} stopOpacity="0" />
          <Stop offset="100%" stopColor={right} stopOpacity="0.35" />
        </SvgLinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#mg_${gradId})`} />
    </Svg>
  );
}

function MatchCard({ match, idx, theme, colors, navigation }) {
  const home = match.participants?.find((p) => p.meta?.location === "home");
  const away = match.participants?.find((p) => p.meta?.location === "away");
  if (!home || !away) return null;

  const { homeColor, awayColor } = resolveMatchColors({
    homePrimary: home.colorPrimary,
    homeSecondary: home.colorSecondary,
    awayPrimary: away.colorPrimary,
    awaySecondary: away.colorSecondary,
    homeFallback: FALLBACK_COLOR,
    awayFallback: FALLBACK_COLOR,
  });

  const roundName = match.round?.name ?? "";

  const homeScore = match.scores?.find((s) => s.score?.participant === "home")
    ?.score?.goals;
  const awayScore = match.scores?.find((s) => s.score?.participant === "away")
    ?.score?.goals;
  const agg = parseAggregate(match);
  const hasScore = homeScore != null && awayScore != null;

  const homeWon = home.meta?.winner === true;
  const awayWon = away.meta?.winner === true;

  const homeShort = home.short_code ?? home.name.slice(0, 3).toUpperCase();
  const awayShort = away.short_code ?? away.name.slice(0, 3).toUpperCase();

  return (
    <TouchableOpacity
      style={[mStyles.card, { backgroundColor: theme.surface }]}
      activeOpacity={0.75}
      onPress={() =>
        navigation?.navigate("Top5GameDetail", {
          fixtureId: match.id,
          homeTeamId: home.id,
          awayTeamId: away.id,
          matchTitle: `${homeShort} vs ${awayShort}`,
        })
      }
    >
      <MatchGradient gradId={idx} homeColor={homeColor} awayColor={awayColor} />
      <View style={mStyles.cardInner}>
        {/* Home side */}
        <View style={mStyles.teamSide}>
          {home.image_path ? (
            <Image
              source={{ uri: home.image_path }}
              style={mStyles.teamLogo}
              resizeMode="contain"
            />
          ) : (
            <View
              style={[
                mStyles.teamLogo,
                mStyles.logoFallback,
                { backgroundColor: homeColor + "40" },
              ]}
            >
              <Text style={{ fontSize: 11, color: theme.text }}>
                {(home.name ?? "?")[0]}
              </Text>
            </View>
          )}
          <Text
            style={[
              mStyles.teamName,
              { color: theme.text },
              homeWon && mStyles.teamNameWin,
            ]}
            numberOfLines={2}
          >
            {home.name}
          </Text>
        </View>

        {/* Score / time */}
        <View style={mStyles.scoreBlock}>
          {hasScore ? (
            <>
              <Text
                style={[mStyles.finishedTime, { color: theme.textTertiary }]}
              >
                {formatTimeFromUtc(match.starting_at)}
                {roundName
                  ? ` ∙ Round ${roundName}`
                  : agg
                    ? ` ∙ AGG: ${agg.homeAgg} - ${agg.awayAgg}`
                    : ""}
              </Text>
              <View style={mStyles.scoreRow}>
                <Text
                  style={[
                    mStyles.score,
                    { color: homeWon ? colors.primary : theme.textSecondary },
                    homeWon && mStyles.scoreWin,
                  ]}
                >
                  {homeScore}
                </Text>
                <Text
                  style={[mStyles.scoreDash, { color: theme.textTertiary }]}
                >
                  -
                </Text>
                <Text
                  style={[
                    mStyles.score,
                    { color: awayWon ? colors.primary : theme.textSecondary },
                    awayWon && mStyles.scoreWin,
                  ]}
                >
                  {awayScore}
                </Text>
              </View>
            </>
          ) : (
            (() => {
              const t = formatTimeFromUtc(match.starting_at);
              const [timePart, period] = String(t).split(/\s+/);
              return (
                <View style={mStyles.timeBlock}>
                  {agg ? (
                    <Text
                      style={[
                        mStyles.finishedTime,
                        { color: theme.textTertiary, fontWeight: "700" },
                      ]}
                    >{`AGG: ${agg.homeAgg} - ${agg.awayAgg}`}</Text>
                  ) : null}
                  {roundName && (
                    <Text
                      style={[
                        mStyles.finishedTime,
                        { color: theme.textTertiary },
                      ]}
                    >
                      Round {roundName}
                    </Text>
                  )}
                  <Text style={[mStyles.timeText, { color: theme.text }]}>
                    {timePart}
                  </Text>
                  <Text style={[mStyles.timePeriod, { color: theme.text }]}>
                    {period}
                  </Text>
                </View>
              );
            })()
          )}
          {match.venue?.name ? (
            <Text
              style={[mStyles.venue, { color: theme.textTertiary }]}
              numberOfLines={1}
            >
              {match.venue.name}
            </Text>
          ) : null}
        </View>

        {/* Away side */}
        <View style={mStyles.teamSideAway}>
          <Text
            style={[
              mStyles.teamName,
              mStyles.teamNameAway,
              { color: theme.text },
              awayWon && mStyles.teamNameWin,
            ]}
            numberOfLines={2}
          >
            {away.name}
          </Text>
          {away.image_path ? (
            <Image
              source={{ uri: away.image_path }}
              style={mStyles.teamLogo}
              resizeMode="contain"
            />
          ) : (
            <View
              style={[
                mStyles.teamLogo,
                mStyles.logoFallback,
                { backgroundColor: awayColor + "40" },
              ]}
            >
              <Text style={{ fontSize: 11, color: theme.text }}>
                {(away.name ?? "?")[0]}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function MatchesTab({ leagueInfo, teamsInSeason, theme, colors, navigation }) {
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const listRef = useRef(null);

  // Combine latest (most-recent first) + upcoming (soonest first), sort chronologically
  const allMatches = useMemo(() => {
    const combined = [
      ...(leagueInfo?.latest ?? []),
      ...(leagueInfo?.upcoming ?? []),
    ];
    combined.sort(
      (a, b) =>
        new Date(a.starting_at.replace(" ", "T") + "Z") -
        new Date(b.starting_at.replace(" ", "T") + "Z"),
    );
    return combined;
  }, [leagueInfo]);

  // Group by date
  const groups = useMemo(() => {
    const map = new Map();
    for (const m of allMatches) {
      const dateKey = m.starting_at.slice(0, 10);
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey).push(m);
    }
    return [...map.entries()].map(([dateKey, matches]) => ({
      dateKey,
      matches,
    }));
  }, [allMatches]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    if (!selectedTeamId) return groups;
    return groups
      .map((g) => ({
        ...g,
        matches: g.matches.filter((m) =>
          m.participants?.some((p) => p.id === selectedTeamId),
        ),
      }))
      .filter((g) => g.matches.length > 0);
  }, [groups, selectedTeamId]);

  // Index of today's group (or first future group) for auto-scroll
  const todayGroupIdx = useMemo(() => {
    const idx = filteredGroups.findIndex((g) => g.dateKey >= todayStr);
    return idx >= 0 ? idx : filteredGroups.length - 1;
  }, [filteredGroups]);

  // Split into past and upcoming groups — upcoming renders at the top, no scroll needed
  const pastGroups = useMemo(
    () => filteredGroups.slice(0, todayGroupIdx),
    [filteredGroups, todayGroupIdx],
  );
  const upcomingGroups = useMemo(
    () => filteredGroups.slice(todayGroupIdx),
    [filteredGroups, todayGroupIdx],
  );

  const [showPast, setShowPast] = useState(false);

  const selectedTeam = teamsInSeason?.find((t) => t.id === selectedTeamId);

  const pickerData = useMemo(() => {
    const teams = Array.isArray(teamsInSeason)
      ? [...teamsInSeason].sort((a, b) =>
          (a?.name ?? "").localeCompare(b?.name ?? ""),
        )
      : [];
    return [{ id: null, name: "None", image_path: null }, ...teams];
  }, [teamsInSeason]);

  const renderGroup = useCallback(
    ({ item: group, index: gIdx }) => (
      <View>
        <View style={mStyles.dateHeader}>
          <Text
            style={[
              mStyles.dateLabel,
              {
                color:
                  group.dateKey === todayStr
                    ? colors.primary
                    : theme.textSecondary,
                fontWeight: group.dateKey === todayStr ? "700" : "600",
              },
            ]}
          >
            {formatDateLabel(group.dateKey)}
          </Text>
          {group.dateKey === todayStr && (
            <View
              style={[mStyles.todayDot, { backgroundColor: colors.primary }]}
            />
          )}
        </View>
        {group.matches.map((match, mIdx) => (
          <MatchCard
            key={match.id}
            match={match}
            idx={`${gIdx}_${mIdx}`}
            theme={theme}
            colors={colors}
            navigation={navigation}
          />
        ))}
      </View>
    ),
    [theme, colors, navigation],
  );

  if (!groups.length) {
    return (
      <View style={mStyles.empty}>
        <Text style={{ color: theme.textSecondary }}>No matches available</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Sticky filter bar */}
      <View
        style={[
          mStyles.filterBar,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <Text style={[mStyles.filterLabel, { color: theme.textSecondary }]}>
          Filter By Team
        </Text>
        <TouchableOpacity
          style={[
            mStyles.teamPickerBtn,
            { borderColor: selectedTeam?.colorPrimary ?? theme.border },
          ]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.7}
        >
          {selectedTeam ? (
            <View style={mStyles.teamPickerInner}>
              {selectedTeam.image_path ? (
                <Image
                  source={{ uri: selectedTeam.image_path }}
                  style={mStyles.teamPickerLogo}
                  resizeMode="contain"
                />
              ) : null}
              <Text
                style={[mStyles.teamPickerName, { color: theme.text }]}
                numberOfLines={1}
              >
                {selectedTeam.name}
              </Text>
            </View>
          ) : (
            <View style={mStyles.teamPickerInner}>
              <Text
                style={[
                  mStyles.teamPickerPlaceholder,
                  { color: theme.textTertiary },
                ]}
              >
                Select Team
              </Text>
              <Ionicons
                name="chevron-down"
                size={14}
                color={theme.textTertiary}
              />
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Match list */}
      <FlatList
        ref={listRef}
        data={upcomingGroups}
        keyExtractor={(g) => g.dateKey}
        renderItem={renderGroup}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          pastGroups.length > 0 ? (
            <View>
              <TouchableOpacity
                style={[mStyles.pastToggle, { borderColor: theme.border }]}
                onPress={() => setShowPast((v) => !v)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    mStyles.pastToggleText,
                    { color: theme.textSecondary },
                  ]}
                >
                  {showPast ? "Hide" : "Show"} {pastGroups.length} past match
                  day{pastGroups.length !== 1 ? "s" : ""}
                </Text>
                <Ionicons
                  name={showPast ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>
              {showPast &&
                pastGroups.map((group, gIdx) => (
                  <View key={group.dateKey}>
                    <View style={mStyles.dateHeader}>
                      <Text
                        style={[
                          mStyles.dateLabel,
                          { color: theme.textSecondary, fontWeight: "600" },
                        ]}
                      >
                        {formatDateLabel(group.dateKey)}
                      </Text>
                    </View>
                    {group.matches.map((match, mIdx) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        idx={`past_${gIdx}_${mIdx}`}
                        theme={theme}
                        colors={colors}
                        navigation={navigation}
                      />
                    ))}
                  </View>
                ))}
            </View>
          ) : null
        }
      />

      {/* Team picker modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={mStyles.modalOverlay}
          onPress={() => setModalVisible(false)}
        >
          <Pressable
            style={[mStyles.modalSheet, { backgroundColor: theme.surface }]}
            onPress={() => {}}
          >
            <Text style={[mStyles.modalTitle, { color: theme.text }]}>
              Select Team
            </Text>
            <FlatList
              data={pickerData}
              keyExtractor={(t) => String(t.id ?? "none")}
              renderItem={({ item: team }) => (
                <TouchableOpacity
                  style={[
                    mStyles.modalTeamRow,
                    selectedTeamId === team.id && {
                      backgroundColor: colors.primary + "18",
                    },
                  ]}
                  onPress={() => {
                    setSelectedTeamId(team.id);
                    setModalVisible(false);
                  }}
                  activeOpacity={0.7}
                >
                  {team.image_path ? (
                    <Image
                      source={{ uri: team.image_path }}
                      style={mStyles.modalTeamLogo}
                      resizeMode="contain"
                    />
                  ) : (
                    <View
                      style={[
                        mStyles.modalTeamLogo,
                        {
                          backgroundColor: theme.surfaceSecondary,
                          borderRadius: 16,
                        },
                      ]}
                    />
                  )}
                  <Text
                    style={[
                      mStyles.modalTeamName,
                      {
                        color:
                          selectedTeamId === team.id
                            ? colors.primary
                            : theme.text,
                      },
                      selectedTeamId === team.id && { fontWeight: "700" },
                    ]}
                  >
                    {team.name}
                  </Text>
                  {selectedTeamId === team.id && (
                    <Ionicons
                      name="checkmark"
                      size={16}
                      color={colors.primary}
                    />
                  )}
                  {navigation && team.id != null && (
                    <TouchableOpacity
                      onPress={() => {
                        setModalVisible(false);
                        navigation.navigate("Top5TeamDetail", {
                          teamId: team.id,
                          teamName: team.name,
                        });
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="arrow-forward-circle-outline"
                        size={20}
                        color={theme.textSecondary}
                        style={{ marginLeft: 8 }}
                      />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              )}
              style={{ maxHeight: 380 }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const mStyles = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterLabel: { fontSize: 13, fontWeight: "600" },
  teamPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 180,
  },
  teamPickerInner: { flexDirection: "row", alignItems: "center", gap: 6 },
  teamPickerLogo: { width: 20, height: 20 },
  teamPickerName: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  teamPickerPlaceholder: { fontSize: 12 },
  dateHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  dateLabel: { fontSize: 13 },
  todayDot: { width: 6, height: 6, borderRadius: 3 },
  card: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  cardInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  teamSide: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  teamSideAway: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  teamLogo: { width: 32, height: 32 },
  logoFallback: {
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  teamName: { flex: 1, fontSize: 12, fontWeight: "500", flexWrap: "wrap" },
  teamNameAway: { textAlign: "right" },
  teamNameWin: { fontWeight: "700" },
  scoreBlock: { alignItems: "center", paddingHorizontal: 8, minWidth: 80 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  score: { fontSize: 20, fontWeight: "500", minWidth: 22, textAlign: "center" },
  scoreWin: { fontWeight: "800" },
  scoreDash: { fontSize: 16 },
  timeBlock: { flexDirection: "column", alignItems: "center" },
  timeText: { fontSize: 15, fontWeight: "600" },
  timePeriod: { fontSize: 10, marginTop: 1, fontWeight: "700" },
  finishedTime: { fontSize: 9, marginBottom: 3 },
  venue: { fontSize: 9, marginTop: 4, textAlign: "center", width: 80 },
  pastToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pastToggleText: { fontSize: 12, fontWeight: "600" },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalSheet: { width: "85%", borderRadius: 16, padding: 16, elevation: 8 },
  modalTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  modalTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 10,
  },
  modalTeamLogo: { width: 30, height: 30 },
  modalTeamName: { flex: 1, fontSize: 14 },
});

// ─── Team Of The Week Tab ───────────────────────────────────────────────────

function parseFormationParts(formation) {
  const parts = String(formation || "")
    .split("-")
    .map((p) => parseInt(p.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return parts.length ? parts : [4, 3, 3];
}

function normalizeTotwPlayerName(player) {
  const full =
    player?.display_name ||
    player?.common_name ||
    player?.name ||
    `${player?.firstname ?? ""} ${player?.lastname ?? ""}`.trim();
  if (!full) return { firstName: "Unknown", lastName: "Player" };

  const chunks = String(full).split(" ").filter(Boolean);
  if (chunks.length === 1) return { firstName: chunks[0], lastName: "" };

  return {
    firstName: chunks.slice(0, -1).join(" "),
    lastName: chunks[chunks.length - 1],
  };
}

function motmGetRatingColor(r) {
  if (r <= 6.0) return "#dc3545";
  if (r <= 7.0) return "#ffbf00";
  if (r <= 8.0) return "#28a745";
  return "#8b5cf6";
}

function roundRatingTo1(rating) {
  const n = Number(rating);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function TeamOfTheWeekTab({
  teamOfTheWeek,
  leagueInfo,
  leagueShortCode,
  teamsInSeason,
  theme,
  colors,
  isDarkMode,
  navigation,
}) {
  const { width } = useWindowDimensions();
  const pitchWidth = Math.max(300, width - 24);
  const pitchHeight = Math.round((width - 40) * 1.2);
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [shareVisible, setShareVisible] = useState(false);
  const [sharing, setSharing] = useState(false);
  const shareCardRef = useRef(null);

  const entries = useMemo(() => {
    return (teamOfTheWeek ?? [])
      .map((item, idx) => {
        const formationPos = Number(item?.formation_position);
        if (!Number.isFinite(formationPos) || formationPos < 1) return null;

        const rawRating = Number(item?.rating);
        const roundedRating = roundRatingTo1(rawRating);
        const teamId = item?.team?.id;
        const mappedTeam =
          (teamsInSeason ?? []).find((t) => t.id === teamId) ||
          item?.team ||
          null;
        const teamColor =
          mappedTeam?.colorPrimary ||
          mappedTeam?.colorSecondary ||
          colors.primary;

        return {
          id: item?.player?.id ?? item?.id ?? idx,
          formationPos,
          formation: item?.formation,
          fixtureId: item?.fixture_id ?? null,
          rawRating: Number.isFinite(rawRating) ? rawRating : null,
          rating: roundedRating,
          roundName: item?.round?.name ?? null,
          player: item?.player ?? null,
          team: mappedTeam,
          teamColor,
          image: item?.player?.image_path || null,
          nameParts: normalizeTotwPlayerName(item?.player),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.formationPos - b.formationPos);
  }, [teamOfTheWeek, teamsInSeason, colors.primary]);

  const bestRatedEntryId = useMemo(() => {
    let best = null;
    for (const e of entries) {
      if (e.rawRating == null) continue;
      if (!best || e.rawRating > best.rawRating) {
        best = e;
      }
    }
    return best?.id ?? null;
  }, [entries]);

  const selectedEntry = useMemo(() => {
    if (!entries.length) return null;
    if (selectedEntryId == null) return entries[0];
    return entries.find((e) => e.id === selectedEntryId) ?? entries[0];
  }, [entries, selectedEntryId]);

  const selectedFixture = useMemo(() => {
    const fixtureId = selectedEntry?.fixtureId;
    if (fixtureId == null) return null;
    return (
      (leagueInfo?.latest ?? []).find((fx) => fx?.id === fixtureId) ?? null
    );
  }, [leagueInfo, selectedEntry]);

  const formationStr = entries[0]?.formation || "4-3-3";

  const rowColumnCounts = useMemo(() => {
    return [1, ...parseFormationParts(formationStr)];
  }, [formationStr]);

  const playersByRowCol = useMemo(() => {
    const map = new Map();

    const getRowColFromFormationPos = (formationPos) => {
      if (formationPos <= 1) return { row: 1, col: 1 };

      let offset = formationPos - 2;
      for (let row = 2; row <= rowColumnCounts.length; row += 1) {
        const count = rowColumnCounts[row - 1] ?? 1;
        if (offset < count) {
          const indexInRow = offset;
          // TOTW formation positions run right-to-left across each row.
          const col = count - indexInRow;
          return { row, col };
        }
        offset -= count;
      }

      const lastRow = rowColumnCounts.length;
      return { row: lastRow, col: 1 };
    };

    for (const entry of entries) {
      const { row, col } = getRowColFromFormationPos(entry.formationPos);
      map.set(`${row}:${col}`, entry);
    }
    return map;
  }, [entries, rowColumnCounts]);

  const visualRows = useMemo(() => {
    const total = rowColumnCounts.length;
    return Array.from({ length: total }, (_, i) => total - i);
  }, [rowColumnCounts]);

  const pitchGreen = isDarkMode ? "#1f5b2b" : "#67c06d";

  if (!entries.length) {
    return (
      <View style={totwStyles.empty}>
        <Text style={{ color: theme.textSecondary }}>
          No Team of the Week data available
        </Text>
      </View>
    );
  }

  const renderPlayerTile = (entry, pressable = true, hideSelection = false) => {
    const hasImage =
      entry?.image && !String(entry.image).includes("placeholder");
    const teamLogo = entry?.team?.image_path;
    const initials =
      `${entry?.nameParts?.firstName?.[0] ?? ""}${entry?.nameParts?.lastName?.[0] ?? ""}`
        .toUpperCase()
        .trim() || "?";
    const isBestRated = entry.id === bestRatedEntryId;
    const ratingLabel =
      entry.rating != null
        ? `${entry.rating.toFixed(1)}${isBestRated ? " ★" : ""}`
        : null;
    const ratingColor =
      entry.rating != null ? motmGetRatingColor(entry.rating) : colors.primary;
    const isSelected = !hideSelection && selectedEntry?.id === entry.id;

    return (
      <TouchableOpacity
        style={[
          totwStyles.playerWrap,
          isSelected && {
            borderColor: colors.primary,
            backgroundColor: colors.primary + "22",
          },
        ]}
        activeOpacity={pressable ? 0.75 : 1}
        onPress={pressable ? () => setSelectedEntryId(entry.id) : undefined}
        disabled={!pressable}
      >
        <View style={totwStyles.playerCard}>
          {hasImage ? (
            <Image
              source={{ uri: entry.image }}
              style={[
                totwStyles.playerAvatar,
                {
                  backgroundColor: `${entry.teamColor}30`,
                  borderColor: entry.teamColor,
                },
              ]}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                totwStyles.playerAvatar,
                {
                  backgroundColor: `${entry.teamColor}30`,
                  borderColor: entry.teamColor,
                  alignItems: "center",
                  justifyContent: "center",
                },
              ]}
            >
              <Text
                style={[
                  totwStyles.playerInitial,
                  { color: getTextOnColor(entry.teamColor) },
                ]}
              >
                {initials}
              </Text>
            </View>
          )}

          <View style={totwStyles.teamBadgeWrap}>
            {teamLogo && !isPlaceholder(teamLogo) ? (
              <Image
                source={{ uri: teamLogo }}
                style={totwStyles.teamBadgeImage}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  totwStyles.teamBadgeFallback,
                  { backgroundColor: `${entry.teamColor}35` },
                ]}
              >
                <Text style={totwStyles.teamBadgeFallbackText}>
                  {(entry?.team?.short_code || entry?.team?.name || "?")
                    .slice(0, 1)
                    .toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          {ratingLabel ? (
            <View
              style={[
                totwStyles.ratingBadge,
                {
                  backgroundColor: ratingColor,
                },
              ]}
            >
              <Text style={totwStyles.ratingBadgeText}>{ratingLabel}</Text>
            </View>
          ) : null}
        </View>

        <Text
          style={[totwStyles.playerLastName, { color: theme.text }]}
          numberOfLines={1}
        >
          {entry?.nameParts?.lastName || entry?.nameParts?.firstName || "-"}
        </Text>
      </TouchableOpacity>
    );
  };

  const selectedPlayerName =
    selectedEntry?.player?.name ||
    `${selectedEntry?.nameParts?.firstName ?? ""} ${selectedEntry?.nameParts?.lastName ?? ""}`.trim() ||
    "Unknown Player";
  const selectedPlayerImage = selectedEntry?.image;
  const selectedPlayerHasImage = !isPlaceholder(selectedPlayerImage);
  const selectedInitials =
    `${selectedEntry?.nameParts?.firstName?.[0] ?? ""}${selectedEntry?.nameParts?.lastName?.[0] ?? ""}`
      .toUpperCase()
      .trim() || "?";
  const selectedCountry = selectedEntry?.player?.country ?? null;
  const selectedCountryName = selectedCountry?.name ?? "Unknown Country";
  const selectedCountryImage = selectedCountry?.image_path;
  const selectedTeamName = selectedEntry?.team?.name ?? "Unknown Team";
  const selectedTeamLogo = selectedEntry?.team?.image_path;
  const selectedRatingColor =
    selectedEntry?.rating != null
      ? motmGetRatingColor(selectedEntry.rating)
      : colors.primary;
  const leagueLogoUri = leagueInfo?.image_path ?? null;
  const sharePitchSize = pitchWidth;

  const handleTotwShare = useCallback(async () => {
    if (sharing || !shareCardRef.current) return;
    try {
      setSharing(true);
      await new Promise((resolve) => setTimeout(resolve, 260));
      const uri = await shareCardRef.current.capture();
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: "Share Team of the Week",
      });
    } catch (error) {
      console.error("Error sharing TOTW card:", error);
    } finally {
      setSharing(false);
    }
  }, [sharing]);

  const roundLabel =
    `${leagueShortCode ? `${leagueShortCode} ∙ ` : ""}ROUND ${entries[0]?.roundName ?? "-"}`.trim();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      <View
        style={[
          totwStyles.headerCard,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={totwStyles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[totwStyles.headerTitle, { color: theme.text }]}>
              {roundLabel}
            </Text>
            <Text
              style={[totwStyles.roundText, { color: theme.textSecondary }]}
            >
              TEAM OF THE WEEK
            </Text>
          </View>

          <View style={{ alignItems: "flex-end" }}>
            <Text style={[totwStyles.headerMeta, { color: colors.primary }]}>
              {formationStr}
            </Text>
            <TouchableOpacity
              style={[
                totwStyles.shareBtn,
                { backgroundColor: colors.primary, marginTop: 6 },
              ]}
              activeOpacity={0.85}
              onPress={() => setShareVisible(true)}
            >
              <Ionicons name="share-outline" size={14} color="#fff" />
              <Text style={totwStyles.shareBtnText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View
        style={[
          totwStyles.pitch,
          {
            backgroundColor: pitchGreen,
            width: pitchWidth,
            height: pitchHeight,
          },
        ]}
      >
        <View style={totwStyles.pitchCenterCircle} />
        <View style={totwStyles.pitchPenaltyBox} />
        <View style={totwStyles.pitchGoalBox} />
        <View style={totwStyles.pitchPenaltyArc} />

        <View pointerEvents="box-none" style={totwStyles.playersOverlay}>
          {visualRows.map((row) => {
            const colCount = rowColumnCounts[row - 1] ?? 1;
            return (
              <View key={`totw-row-${row}`} style={totwStyles.gridRow}>
                {Array.from({ length: colCount }).map((_, colIdx) => {
                  const col = colIdx + 1;
                  const player = playersByRowCol.get(`${row}:${col}`);
                  return (
                    <View
                      key={`totw-cell-${row}-${col}`}
                      style={totwStyles.gridCell}
                    >
                      {player ? renderPlayerTile(player, true) : null}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </View>

      {selectedEntry ? (
        <View style={totwStyles.detailsSection}>
          {selectedFixture ? (
            <MatchCard
              match={selectedFixture}
              idx={`totw_selected_${selectedFixture.id}`}
              theme={theme}
              colors={colors}
              navigation={navigation}
            />
          ) : null}

          <TouchableOpacity
            activeOpacity={
              selectedEntry?.team?.id != null && navigation ? 0.85 : 1
            }
            onPress={
              selectedEntry?.team?.id != null && navigation
                ? () =>
                    navigation?.navigate("Top5TeamDetail", {
                      teamId: selectedEntry.team.id,
                      teamName: selectedTeamName,
                    })
                : undefined
            }
            style={[
              totwStyles.teamInfoCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            {selectedTeamLogo && !isPlaceholder(selectedTeamLogo) ? (
              <Image
                source={{ uri: selectedTeamLogo }}
                style={totwStyles.teamInfoLogo}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  totwStyles.teamInfoLogo,
                  totwStyles.teamInfoLogoFallback,
                  { backgroundColor: `${selectedEntry.teamColor}30` },
                ]}
              >
                <Text
                  style={[
                    totwStyles.teamInfoLogoFallbackText,
                    { color: selectedEntry.teamColor },
                  ]}
                >
                  {selectedTeamName.slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
            <Text
              style={[totwStyles.teamInfoName, { color: theme.text }]}
              numberOfLines={1}
            >
              {selectedTeamName}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={
              selectedEntry?.player?.id != null && navigation ? 0.85 : 1
            }
            onPress={
              selectedEntry?.player?.id != null && navigation
                ? () =>
                    navigation?.navigate("Top5PlayerDetail", {
                      playerId: selectedEntry.player.id,
                      playerName: selectedPlayerName,
                    })
                : undefined
            }
            style={[
              totwStyles.playerInfoCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View
              style={[
                totwStyles.playerInfoAvatarWrap,
                {
                  backgroundColor: "transparent",
                  borderColor: "transparent",
                },
              ]}
            >
              <View style={totwStyles.playerInfoAvatarCard}>
                {selectedPlayerHasImage ? (
                  <Image
                    source={{ uri: selectedPlayerImage }}
                    style={[
                      totwStyles.playerInfoAvatar,
                      {
                        backgroundColor: `${selectedEntry.teamColor}30`,
                        borderColor: selectedEntry.teamColor,
                      },
                    ]}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={[
                      totwStyles.playerInfoAvatar,
                      {
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: `${selectedEntry.teamColor}30`,
                        borderColor: selectedEntry.teamColor,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        totwStyles.playerInfoInitial,
                        { color: getTextOnColor(selectedEntry.teamColor) },
                      ]}
                    >
                      {selectedInitials}
                    </Text>
                  </View>
                )}

                {selectedCountryImage &&
                !isPlaceholder(selectedCountryImage) ? (
                  <View style={totwStyles.countryBadgeWrap}>
                    <Image
                      source={{ uri: selectedCountryImage }}
                      style={totwStyles.countryBadgeImage}
                      resizeMode="cover"
                    />
                  </View>
                ) : null}

                {selectedEntry?.rating != null ? (
                  <View
                    style={[
                      totwStyles.playerInfoRating,
                      { backgroundColor: selectedRatingColor },
                    ]}
                  >
                    <Text style={totwStyles.playerInfoRatingText}>
                      {selectedEntry.rating.toFixed(1)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={totwStyles.playerInfoTextWrap}>
              <Text
                style={[totwStyles.playerInfoName, { color: theme.text }]}
                numberOfLines={1}
              >
                {selectedPlayerName}
              </Text>
              <Text
                style={[
                  totwStyles.playerInfoCountry,
                  { color: theme.textSecondary },
                ]}
                numberOfLines={1}
              >
                {selectedCountryName}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal
        visible={shareVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setShareVisible(false)}
      >
        <View style={totwStyles.shareOverlay}>
          <Pressable
            style={totwStyles.shareBackdropTap}
            onPress={() => setShareVisible(false)}
          />

          <View style={totwStyles.shareCenterWrap}>
            <ViewShot
              ref={shareCardRef}
              options={{ format: "png", quality: 1 }}
              style={[
                totwStyles.shareCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: "#777",
                  width: sharePitchSize,
                },
              ]}
            >
              <View
                style={[
                  totwStyles.sharePitch,
                  {
                    backgroundColor: pitchGreen,
                    width: sharePitchSize,
                    height: sharePitchSize,
                  },
                ]}
              >
                <View style={totwStyles.pitchCenterCircle} />
                <View style={totwStyles.pitchPenaltyBox} />
                <View style={totwStyles.pitchGoalBox} />
                <View style={totwStyles.pitchPenaltyArc} />

                <View pointerEvents="none" style={totwStyles.playersOverlay}>
                  {visualRows.map((row) => {
                    const colCount = rowColumnCounts[row - 1] ?? 1;
                    return (
                      <View
                        key={`share-totw-row-${row}`}
                        style={totwStyles.gridRow}
                      >
                        {Array.from({ length: colCount }).map((_, colIdx) => {
                          const col = colIdx + 1;
                          const player = playersByRowCol.get(`${row}:${col}`);
                          return (
                            <View
                              key={`share-totw-cell-${row}-${col}`}
                              style={totwStyles.gridCell}
                            >
                              {player
                                ? renderPlayerTile(player, false, true)
                                : null}
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>

                <View
                  style={[
                    totwStyles.shareBrandBadge,
                    {
                      backgroundColor: isDarkMode ? "#000" : "#fff",
                      borderColor: isDarkMode ? "#222" : "#ddd",
                      height: entries[0]?.roundName ? 70 : 60,
                    },
                  ]}
                >
                  {leagueLogoUri && !isPlaceholder(leagueLogoUri) ? (
                    <Image
                      source={{ uri: leagueLogoUri }}
                      style={[
                        totwStyles.shareBrandLogo,
                        {
                          tintColor:
                            leagueInfo?.id === 8 && isDarkMode
                              ? "#fff"
                              : undefined,
                        },
                      ]}
                      resizeMode="contain"
                    />
                  ) : (
                    <Text
                      style={[
                        totwStyles.shareBrandFallback,
                        { color: isDarkMode ? "#fff" : "#111" },
                      ]}
                    >
                      ⚽
                    </Text>
                  )}
                  <View style={totwStyles.shareBrandRow}>
                    {entries[0]?.roundName && (
                      <Text
                        style={[
                          totwStyles.shareBrandText,
                          { color: isDarkMode ? "#ccc" : "#333" },
                        ]}
                      >
                        Round {entries[0]?.roundName}
                      </Text>
                    )}
                    <View style={{ flexDirection: "row" }}>
                      <Text
                        style={[
                          totwStyles.shareBrandText,
                          { color: isDarkMode ? "#fff" : "#111" },
                        ]}
                      >
                        SportsHeart
                      </Text>
                      <Ionicons name="heart" size={10} color={colors.primary} />
                    </View>
                  </View>
                </View>
              </View>
            </ViewShot>

            <View style={totwStyles.shareActionsRow}>
              <TouchableOpacity
                style={[
                  totwStyles.sharePrimaryBtn,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleTotwShare}
                activeOpacity={0.85}
              >
                <Ionicons name="share-outline" size={16} color="#fff" />
                <Text style={totwStyles.sharePrimaryBtnText}>
                  {sharing ? "Sharing..." : "Share"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  totwStyles.shareSecondaryBtn,
                  { borderColor: theme.border, backgroundColor: theme.surface },
                ]}
                onPress={() => setShareVisible(false)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    totwStyles.shareSecondaryBtnText,
                    { color: theme.text },
                  ]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const totwStyles = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  headerCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  headerMeta: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  roundText: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "500",
  },
  shareBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  shareBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  pitch: {
    alignSelf: "center",
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#777",
    overflow: "hidden",
    position: "relative",
  },
  pitchCenterCircle: {
    position: "absolute",
    top: "-0.5%",
    left: "29.5%",
    width: "41%",
    height: "20%",
    borderWidth: 2,
    borderColor: "#777",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 120,
    borderBottomRightRadius: 120,
    backgroundColor: "transparent",
  },
  pitchPenaltyBox: {
    position: "absolute",
    bottom: 0,
    left: "20%",
    width: "60%",
    height: "25%",
    borderWidth: 2,
    borderColor: "#777",
    borderBottomWidth: 0,
    backgroundColor: "transparent",
  },
  pitchGoalBox: {
    position: "absolute",
    bottom: 0,
    left: "32.5%",
    width: "35%",
    height: "12%",
    borderWidth: 2,
    borderColor: "#777",
    borderBottomWidth: 0,
    backgroundColor: "transparent",
  },
  pitchPenaltyArc: {
    position: "absolute",
    top: "63.5%",
    left: "37.7%",
    width: "24.6%",
    height: "12%",
    borderWidth: 2,
    borderColor: "#777",
    borderTopLeftRadius: 60,
    borderTopRightRadius: 60,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: "transparent",
  },
  playersOverlay: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ translateY: 5 }],
  },
  gridRow: {
    flex: 1,
    flexDirection: "row",
  },
  gridCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  playerWrap: {
    width: 86,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
    paddingVertical: 4,
  },
  playerCard: {
    width: 56,
    height: 56,
    position: "relative",
  },
  playerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
  },
  playerInitial: {
    fontSize: 20,
    fontWeight: "800",
  },
  teamBadgeWrap: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  teamBadgeImage: {
    width: 16,
    height: 16,
  },
  teamBadgeFallback: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  teamBadgeFallbackText: {
    fontSize: 8,
    fontWeight: "800",
    color: "#222",
  },
  ratingBadge: {
    position: "absolute",
    top: -4,
    right: -8,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    minWidth: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  ratingBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
  },
  playerLastName: {
    marginTop: 4,
    maxWidth: 84,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  detailsSection: {
    marginTop: 14,
    gap: 10,
  },
  teamInfoCard: {
    marginHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  teamInfoLogo: {
    width: 50,
    height: 50,
  },
  teamInfoLogoFallback: {
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  teamInfoLogoFallbackText: {
    fontSize: 13,
    fontWeight: "800",
  },
  teamInfoName: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
  },
  playerInfoCard: {
    marginHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  playerInfoAvatarWrap: {
    width: 56,
    height: 56,
    overflow: "visible",
    alignItems: "center",
    justifyContent: "center",
  },
  playerInfoAvatarCard: {
    width: 56,
    height: 56,
    position: "relative",
  },
  playerInfoAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
  },
  playerInfoInitial: {
    fontSize: 18,
    fontWeight: "800",
  },
  countryBadgeWrap: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#fff",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  countryBadgeImage: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  playerInfoRating: {
    position: "absolute",
    right: -8,
    top: -6,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 30,
    alignItems: "center",
  },
  playerInfoRatingText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
  },
  playerInfoTextWrap: {
    flex: 1,
  },
  playerInfoName: {
    fontSize: 14,
    fontWeight: "700",
  },
  playerInfoCountry: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
  },
  shareOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  shareBackdropTap: {
    ...StyleSheet.absoluteFillObject,
  },
  shareCenterWrap: {
    alignItems: "center",
  },
  shareCard: {
    borderRadius: 0,
    borderWidth: 2,
    overflow: "hidden",
  },
  sharePitch: {
    borderRadius: 0,
    overflow: "hidden",
    position: "relative",
  },
  shareBrandBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 95,
    height: 60,
    borderTopLeftRadius: 10,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingTop: -5,
  },
  shareBrandLogo: {
    width: 24,
    height: 24,
  },
  shareBrandFallback: {
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 14,
  },
  shareBrandRow: {
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
  },
  shareBrandText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  shareActionsRow: {
    marginTop: 14,
    width: "100%",
    maxWidth: 420,
    flexDirection: "row",
    gap: 12,
  },
  sharePrimaryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  sharePrimaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  shareSecondaryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  shareSecondaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },
});

// ─── Teams Tab ───────────────────────────────────────────────────────────────

// Sportmonks detailed position → 2-letter abbreviation
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

function isSuspension(typeName) {
  return typeName ? typeName.toLowerCase().includes("suspen") : false;
}

function getSuspCardColor(typeName) {
  const t = typeName?.toLowerCase() ?? "";
  if (t.includes("red")) return "#ef4444";
  return "#ffc107";
}

function formatSidelinedDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isPlaceholder(uri) {
  return !uri || uri.includes("placeholder");
}

// Group players into position sections
const POS_SECTIONS = [
  {
    label: "Attackers",
    test: (pos) =>
      pos?.toLowerCase().includes("attack") ||
      pos?.toLowerCase().includes("forward") ||
      pos?.toLowerCase().includes("winger") ||
      pos?.toLowerCase().includes("striker"),
  },
  { label: "Midfielders", test: (pos) => pos?.toLowerCase().includes("mid") },
  {
    label: "Defenders",
    test: (pos) =>
      pos?.toLowerCase().includes("defend") ||
      pos?.toLowerCase().includes("back") ||
      pos?.toLowerCase().includes("sweeper") ||
      pos?.toLowerCase().includes("wingback"),
  },
  {
    label: "Goalkeepers",
    test: (pos) => pos?.toLowerCase().includes("goalkeeper"),
  },
];

function classifyPlayer(pl) {
  const pos = pl.position?.name ?? pl.detailedposition?.name ?? "";
  for (const sec of POS_SECTIONS) {
    if (sec.test(pos)) return sec.label;
  }
  return "Other";
}

function PlayerCard({ pl, teamColor, sidelinedIds, theme, navigation }) {
  const name = pl.player?.lastname ?? pl.player?.name?.split(" ").pop() ?? "?";
  const imgUri = pl.player?.image_path;
  const showImg = !isPlaceholder(imgUri);
  const initials =
    (pl.player?.firstname && pl.player?.lastname
      ? pl.player.firstname[0] + pl.player.lastname[0]
      : (pl.player?.name ?? name)
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((p) => p[0])
          .join("")
    )
      .toUpperCase()
      .slice(0, 2) || "?";
  const posAbbr = getPosAbbr(pl.detailedposition?.name ?? pl.position?.name);
  const badgeBg = teamColor ?? "#888";
  const badgeText = getTextOnColor(badgeBg);
  const headBg = teamColor ? teamColor + "30" : "#88888822";
  const isSidelined = sidelinedIds.has(pl.player?.id ?? pl.id);

  const playerId = pl.player?.id ?? pl.id;
  const playerFullName =
    pl.player?.name ||
    `${pl.player?.firstname ?? ""} ${pl.player?.lastname ?? ""}`.trim() ||
    name;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() =>
        playerId != null &&
        navigation?.navigate("Top5PlayerDetail", {
          playerId,
          playerName: playerFullName,
        })
      }
    >
      <View style={tStyles.playerWrap}>
        <View style={tStyles.headshotWrap}>
          <View style={[tStyles.headshotBox, { backgroundColor: headBg }]}>
            {showImg ? (
              <Image
                source={{ uri: imgUri }}
                style={tStyles.headshot}
                resizeMode="cover"
              />
            ) : (
              <View
                style={[tStyles.headshotFallback, { backgroundColor: headBg }]}
              >
                <Text
                  style={{ fontSize: 16, fontWeight: "700", color: "#fff" }}
                >
                  {initials}
                </Text>
              </View>
            )}
          </View>
          {/* Position badge — bottom right */}
          <View style={[tStyles.posBadge, { backgroundColor: badgeBg }]}>
            <Text style={[tStyles.posBadgeText, { color: badgeText }]}>
              {posAbbr}
            </Text>
          </View>
          {/* Injury / suspension indicator — top right */}
          {isSidelined && (
            <View style={tStyles.injuryBadge}>
              <Text style={tStyles.injuryBadgeText}>✕</Text>
            </View>
          )}
        </View>
        <Text
          style={[tStyles.playerName, { color: theme.text }]}
          numberOfLines={1}
        >
          {name}
        </Text>
        {pl.jersey_number != null && (
          <Text style={[tStyles.jerseyNum, { color: theme.textTertiary }]}>
            #{pl.jersey_number}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function PlayerSection({
  label,
  players,
  teamColor,
  sidelinedIds,
  theme,
  navigation,
}) {
  if (!players.length) return null;
  return (
    <View style={tStyles.posSection}>
      <Text style={[tStyles.posSectionLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
      <FlatList
        horizontal
        data={players}
        keyExtractor={(pl, i) => String(pl.id ?? i)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={tStyles.playerRow}
        renderItem={({ item: pl }) => (
          <PlayerCard
            pl={pl}
            teamColor={teamColor}
            sidelinedIds={sidelinedIds}
            theme={theme}
            navigation={navigation}
          />
        )}
      />
    </View>
  );
}

function SidelinedCard({ sl, teamColor, theme }) {
  const name = sl.player?.name ?? "?";
  const imgUri = sl.player?.image_path;
  const showImg = !isPlaceholder(imgUri);
  const initials =
    (sl.player?.firstname && sl.player?.lastname
      ? sl.player.firstname[0] + sl.player.lastname[0]
      : (sl.player?.name ?? name)
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((p) => p[0])
          .join("")
    )
      .toUpperCase()
      .slice(0, 2) || "?";
  const headBg = teamColor ? teamColor + "30" : "#88888822";
  const typeName = sl.type?.name ?? "Unknown";
  const susp = isSuspension(typeName);
  const cardColor = susp ? getSuspCardColor(typeName) : "#ef4444";

  const startFmt = formatSidelinedDate(sl.start_date);
  const endFmt = formatSidelinedDate(sl.end_date);
  const durationStr = startFmt
    ? endFmt
      ? `${startFmt} - ${endFmt}`
      : startFmt
    : "Unknown";

  return (
    <View style={[tStyles.sidelinedRow, { borderColor: theme.border }]}>
      <View style={tStyles.headshotWrapSm}>
        <View style={[tStyles.headshotBoxSm, { backgroundColor: headBg }]}>
          {showImg ? (
            <Image
              source={{ uri: imgUri }}
              style={tStyles.headshotSm}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                width: 48,
                height: 48,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: headBg,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>
                {initials}
              </Text>
            </View>
          )}
        </View>
        {/* Injury / suspension indicator — top right */}
        <View style={[tStyles.injuryBadge, { borderColor: cardColor }]}>
          {susp ? (
            <MaterialCommunityIcons
              name="card"
              size={12}
              color={cardColor}
              style={{ transform: [{ rotate: "90deg" }] }}
            />
          ) : (
            <FontAwesome5 name="user-injured" size={11} color="#ef4444" />
          )}
        </View>
      </View>
      <View style={tStyles.sidelinedInfo}>
        <Text
          style={[tStyles.sidelinedName, { color: theme.text }]}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text style={[tStyles.sidelinedMeta, { color: theme.textSecondary }]}>
          Type: {typeName}
        </Text>
        <Text style={[tStyles.sidelinedMeta, { color: theme.textSecondary }]}>
          Duration: {durationStr}
        </Text>
        <Text style={[tStyles.sidelinedMeta, { color: theme.textSecondary }]}>
          Games Missed: {sl.games_missed ?? 0}
        </Text>
      </View>
    </View>
  );
}

function TeamBubble({ team, theme, colors, navigation }) {
  const [expanded, setExpanded] = useState(false);
  const primary = team.colorPrimary ?? null;
  const secondary = team.colorSecondary ?? null;
  const shortCode =
    team.short_code ?? team.name?.slice(0, 3).toUpperCase() ?? "???";
  const borderColor = primary ?? theme.border;

  // Build sidelined player id set — only entries with a known end_date
  const activeSidelined = useMemo(
    () => (team.sidelined ?? []).filter((sl) => sl.end_date),
    [team.sidelined],
  );

  const sidelinedIds = useMemo(() => {
    const s = new Set();
    for (const sl of activeSidelined) {
      if (sl.player?.id) s.add(sl.player.id);
    }
    return s;
  }, [activeSidelined]);

  // Group active players by position section
  const sectionMap = useMemo(() => {
    const map = {};
    for (const sec of POS_SECTIONS) map[sec.label] = [];
    map["Other"] = [];
    for (const pl of (team.players ?? []).filter(
      (p) => !sidelinedIds.has(p.player?.id ?? p.id),
    )) {
      const sec = classifyPlayer(pl);
      (map[sec] || map["Other"]).push(pl);
    }
    return map;
  }, [team.players, sidelinedIds]);

  return (
    <View
      style={[
        tStyles.teamBubble,
        { borderColor, backgroundColor: theme.surface },
      ]}
    >
      {/* Header row: arrow | logo | name+code | color dots | navigate */}
      <TouchableOpacity
        style={tStyles.teamHeader}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={theme.textSecondary}
          style={tStyles.expandArrow}
        />
        {team.image_path ? (
          <Image
            source={{ uri: team.image_path }}
            style={tStyles.teamLogo}
            resizeMode="contain"
          />
        ) : (
          <View
            style={[
              tStyles.teamLogo,
              tStyles.teamLogoFallback,
              { backgroundColor: primary + "30" ?? theme.surfaceSecondary },
            ]}
          >
            <Text style={{ fontSize: 14, color: primary ?? theme.text }}>
              {(team.name ?? "?")[0]}
            </Text>
          </View>
        )}
        <View style={tStyles.teamInfo}>
          <Text
            style={[tStyles.teamName, { color: theme.text }]}
            numberOfLines={1}
          >
            {team.name}
          </Text>
          <Text style={[tStyles.teamCode, { color: theme.textSecondary }]}>
            {shortCode}
          </Text>
        </View>
        <View style={tStyles.colorDots}>
          {primary ? (
            <View
              style={[
                tStyles.colorDot,
                { backgroundColor: primary, borderColor: theme.border },
              ]}
            />
          ) : null}
          {secondary ? (
            <View
              style={[
                tStyles.colorDot,
                { backgroundColor: secondary, borderColor: theme.border },
              ]}
            />
          ) : null}
        </View>
        {navigation && team.id != null ? (
          <TouchableOpacity
            onPress={() =>
              navigation.navigate("Top5TeamDetail", {
                teamId: team.id,
                teamName: team.name,
              })
            }
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="arrow-forward-circle-outline"
              size={22}
              color={primary ?? theme.textSecondary}
            />
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>

      {/* Expanded: position sections + sidelined */}
      {expanded && (
        <View style={tStyles.expandedBody}>
          {POS_SECTIONS.map((sec) =>
            sectionMap[sec.label]?.length > 0 ? (
              <PlayerSection
                key={sec.label}
                label={sec.label}
                players={sectionMap[sec.label]}
                teamColor={primary}
                sidelinedIds={sidelinedIds}
                theme={theme}
                navigation={navigation}
              />
            ) : null,
          )}
          {sectionMap["Other"]?.length > 0 && (
            <PlayerSection
              label="Other"
              players={sectionMap["Other"]}
              teamColor={primary}
              sidelinedIds={sidelinedIds}
              theme={theme}
              navigation={navigation}
            />
          )}
          {activeSidelined.length > 0 && (
            <View style={tStyles.sidelinedSection}>
              <Text
                style={[
                  tStyles.posSectionLabel,
                  { color: theme.error ?? "#ef4444", marginLeft: 0 },
                ]}
              >
                Sidelined / Suspended
              </Text>
              {activeSidelined.map((sl, i) => (
                <SidelinedCard
                  key={sl.player?.id ?? i}
                  sl={sl}
                  teamColor={primary}
                  theme={theme}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function TeamsTab({ teamsInSeason, theme, colors, navigation }) {
  const teams = useMemo(
    () =>
      [...(teamsInSeason ?? [])].sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? ""),
      ),
    [teamsInSeason],
  );
  if (!teams.length) {
    return (
      <View style={tStyles.empty}>
        <Text style={{ color: theme.textSecondary }}>
          No team data available
        </Text>
      </View>
    );
  }
  return (
    <FlatList
      data={teams}
      keyExtractor={(t) => String(t.id)}
      contentContainerStyle={{ paddingVertical: 12, paddingBottom: 32 }}
      renderItem={({ item }) => (
        <TeamBubble
          team={item}
          theme={theme}
          colors={colors}
          navigation={navigation}
        />
      )}
    />
  );
}

const tStyles = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  teamBubble: {
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: "hidden",
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  teamHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  expandArrow: { marginRight: 2 },
  teamLogo: { width: 38, height: 38 },
  teamLogoFallback: {
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  teamInfo: { flex: 1 },
  teamName: { fontSize: 14, fontWeight: "700" },
  teamCode: { fontSize: 11, fontWeight: "600", marginTop: 1 },
  colorDots: { flexDirection: "row", gap: 5, marginLeft: 4 },
  colorDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 0.5 },
  // Expanded
  expandedBody: { paddingBottom: 10 },
  posSection: { marginTop: 6 },
  posSectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginLeft: 14,
    marginBottom: 6,
  },
  playerRow: { paddingHorizontal: 12, gap: 10 },
  playerWrap: { alignItems: "center", width: 64 },
  headshotWrap: { width: 56, height: 56 },
  headshotBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  headshot: { width: 56, height: 56, borderRadius: 28 },
  headshotFallback: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  posBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  posBadgeText: { fontSize: 8, fontWeight: "800" },
  injuryBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  playerName: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 4,
    textAlign: "center",
  },
  jerseyNum: { fontSize: 9, textAlign: "center" },
  // Sidelined
  sidelinedSection: { marginTop: 12, paddingHorizontal: 12 },
  sidelinedRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    backgroundColor: "rgba(239,68,68,0.05)",
  },
  headshotWrapSm: { width: 48, height: 48, flexShrink: 0 },
  headshotBoxSm: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  headshotSm: { width: 48, height: 48, borderRadius: 24 },
  sidelinedInfo: { flex: 1, justifyContent: "center" },
  sidelinedName: { fontSize: 12, fontWeight: "700", marginBottom: 3 },
  sidelinedMeta: { fontSize: 11, marginBottom: 1 },
});

// ─── Team Stats Tab ──────────────────────────────────────────────────────────

function capitalizeFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function extractRankVal(value, typeName) {
  if (!value || typeof value !== "object") return null;
  const t = (typeName || "").toLowerCase();

  // Type-specific ranking overrides
  if (t === "penalties" && typeof value.scored === "number")
    return value.scored;
  if (t === "assist stats" && typeof value.total_assists === "number")
    return value.total_assists;
  if (
    t === "interception stats" &&
    typeof value.total_interceptions === "number"
  )
    return value.total_interceptions;
  if (t === "pass stats" && typeof value.total_passes === "number")
    return value.total_passes;
  if (t === "scoring frequency" && typeof value.scoring_frequency === "number")
    return -Number(value.scoring_frequency); // lower is better => invert

  // Generic fallbacks
  if (value.all?.count != null) return value.all.count;
  if (typeof value.total === "number") return value.total;
  if (typeof value.count === "number") return value.count;
  if (value.avg_total_height != null) return value.avg_total_height;
  if (typeof value.rating === "number") return value.rating;
  if (value.total_minutes_played != null) return value.total_minutes_played;
  if (value.value != null && !isNaN(Number(value.value)))
    return Number(value.value);
  return null;
}

function getStatChips(value) {
  if (!value || typeof value !== "object") return [];
  const chips = [];
  if (value.all?.count != null) {
    chips.push({ label: "Total", val: value.all.count });
    if (value.all.average != null)
      chips.push({ label: "Avg/G", val: Number(value.all.average).toFixed(2) });
    if (value.home?.count != null)
      chips.push({ label: "Home", val: value.home.count });
    if (value.away?.count != null)
      chips.push({ label: "Away", val: value.away.count });
    return chips.slice(0, 4);
  }
  if (typeof value.total === "number") {
    chips.push({ label: "Total", val: value.total });
    if (value.average != null)
      chips.push({ label: "Avg/G", val: Number(value.average).toFixed(2) });
    if (typeof value.home === "number")
      chips.push({ label: "Home", val: value.home });
    if (typeof value.away === "number")
      chips.push({ label: "Away", val: value.away });
    return chips.slice(0, 4);
  }
  if (typeof value.count === "number") {
    chips.push({ label: "Count", val: value.count });
    if (value.average != null)
      chips.push({ label: "Avg", val: Number(value.average).toFixed(2) });
    return chips.slice(0, 4);
  }
  if (value.avg_total_height != null) {
    chips.push({ label: "Overall", val: value.avg_total_height + "cm" });
    if (value.avg_goalkeeper_height != null)
      chips.push({ label: "GK", val: value.avg_goalkeeper_height + "cm" });
    if (value.avg_defender_height != null)
      chips.push({ label: "DEF", val: value.avg_defender_height + "cm" });
    if (value.avg_midfielder_height != null)
      chips.push({ label: "MF", val: value.avg_midfielder_height + "cm" });
    if (value.avg_attacker_height != null)
      chips.push({ label: "ATT", val: value.avg_attacker_height + "cm" });
    return chips;
  }
  // Assist stats: show minutes per assist rounded to 2 decimals when present
  if (value.minutes_per_assist != null) {
    const mpa = Number(value.minutes_per_assist);
    const apg = Number(value.assists_per_game);
    if (!isNaN(mpa)) {
      return [
        { label: "Min/Assist", val: mpa.toFixed(2) },
        { label: "Assists/G", val: apg?.toFixed(2) ?? "-" },
        { label: "Total", val: value.total_assists ?? "-" },
      ];
    }
  }
  if (value.won_both_halves != null || value.scored_both_halves != null) {
    if (value.won_both_halves != null)
      chips.push({ label: "Won Both", val: value.won_both_halves });
    if (value.scored_both_halves != null)
      chips.push({ label: "Scored Both", val: value.scored_both_halves });
    if (value.comebacks != null)
      chips.push({ label: "Comebacks", val: value.comebacks });
    return chips;
  }
  if (value.most_scored_half != null) {
    chips.push({ label: "Half", val: value.most_scored_half });
    if (value.most_scored_half_goals != null)
      chips.push({ label: "Goals", val: value.most_scored_half_goals });
    return chips;
  }
  // Time bucket (scoring / conceding minutes): keys like "0-15", "15-30", "90+"
  const keys = Object.keys(value);
  if (keys.length > 0 && keys.some((k) => /^\d+-\d+$|^\d+\+$/.test(k))) {
    return keys
      .filter((k) => /^\d+-\d+$|^\d+\+$/.test(k))
      .sort((a, b) => parseInt(a) - parseInt(b))
      .map((k) => ({ label: k, val: value[k]?.count ?? 0 }));
  }
  // Over / under (number of goals): keys like "over_0_5", "under_1_5"
  if (keys.length > 0 && keys.some((k) => /^(over|under)_/.test(k))) {
    return keys
      .filter((k) => /^(over|under)_/.test(k))
      .map((k) => {
        const parts = k.split("_");
        const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
        const label = first + " " + parts.slice(1).join(".");
        const raw = value[k];
        const val = raw?.team?.count ?? raw?.count ?? raw;
        return { label, val };
      });
  }
  // Simple single-value payloads: { value: "6.79" } or { rating: 7.2 }
  if (
    value.value != null &&
    (typeof value.value === "string" || typeof value.value === "number")
  ) {
    const v = value.value;
    return [{ label: "Value", val: String(v) }];
  }
  // Highest Rated Player / similar: { rating, player_id, player_name }
  if (
    value.player_name != null &&
    (value.rating != null || value.value != null)
  ) {
    const chipsOut = [];
    if (value.rating != null)
      chipsOut.push({ label: "Rating", val: String(value.rating) });
    // show player name but never player_id
    chipsOut.push({ label: "Player", val: String(value.player_name) });
    return chipsOut.slice(0, 4);
  }
  if (typeof value.rating === "number") {
    return [{ label: "Rating", val: String(value.rating) }];
  }
  // Penalties: { scored, missed, conversion_rate }
  if (
    value.scored != null ||
    value.missed != null ||
    value.conversion_rate != null
  ) {
    if (value.scored != null)
      chips.push({ label: "Scored", val: String(value.scored) });
    if (value.missed != null)
      chips.push({ label: "Missed", val: String(value.missed) });
    if (value.conversion_rate != null)
      chips.push({ label: "Conv %", val: String(value.conversion_rate) });
    return chips.slice(0, 4);
  }
  // Players Footing: { left, right, unknown }
  if (keys.some((k) => ["left", "right", "unknown"].includes(k))) {
    if (value.left != null)
      chips.push({ label: "Left", val: String(value.left) });
    if (value.right != null)
      chips.push({ label: "Right", val: String(value.right) });
    if (value.unknown != null)
      chips.push({ label: "Unknown", val: String(value.unknown) });
    return chips.slice(0, 4);
  }
  // Fouls per card style: { fouls_per_card, cards_per_foul }
  if (value.fouls_per_card != null || value.cards_per_foul != null) {
    if (value.fouls_per_card != null)
      chips.push({ label: "Fouls/Card", val: String(value.fouls_per_card) });
    if (value.cards_per_foul != null)
      chips.push({ label: "Cards/Foul", val: String(value.cards_per_foul) });
    return chips.slice(0, 4);
  }
  // Most frequent scoring minute: { most_frequent_scoring_minute, amount_of_goals }
  if (
    value.most_frequent_scoring_minute != null ||
    value.amount_of_goals != null
  ) {
    if (value.most_frequent_scoring_minute != null)
      chips.push({
        label: "Minute",
        val: String(value.most_frequent_scoring_minute),
      });
    if (value.amount_of_goals != null)
      chips.push({ label: "Goals", val: String(value.amount_of_goals) });
    return chips.slice(0, 4);
  }
  // Generic fallback: pick first up to 4 non-id/name keys
  for (const k of keys) {
    if (/id$|name$/.test(k)) continue;
    const v = value[k];
    if (v == null || typeof v === "object") continue;
    const label = k
      .split(/_|\s+/)
      .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(" ");
    chips.push({ label, val: String(v) });
    if (chips.length >= 4) break;
  }
  if (chips.length) return chips;
  return [];
}

function StatTeamEntry({ team, value, rank, showRank, isLast, theme }) {
  const chips = getStatChips(value);
  const abbr = team.short_code ?? (team.name ?? "").slice(0, 3).toUpperCase();
  const teamColor = team.colorPrimary;
  return (
    <View
      style={[
        ssStyles.teamEntry,
        !isLast && {
          borderBottomColor: teamColor ?? theme.border,
          borderBottomWidth: 2,
        },
      ]}
    >
      <View style={ssStyles.teamEntryRow}>
        {team.image_path && !isPlaceholder(team.image_path) ? (
          <Image
            source={{ uri: team.image_path }}
            style={ssStyles.entryLogo}
            resizeMode="contain"
          />
        ) : (
          <View
            style={[
              ssStyles.entryLogo,
              {
                backgroundColor: (teamColor ?? "#888") + "30",
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: teamColor ?? "#888",
              }}
            >
              {(team.name ?? "?")[0]}
            </Text>
          </View>
        )}
        <Text
          style={[ssStyles.entryName, { color: theme.text }]}
          numberOfLines={1}
        >
          {team.name}
          {abbr ? (
            <Text style={[ssStyles.entryAbbr, { color: theme.textSecondary }]}>
              {" \u00b7 " + abbr}
            </Text>
          ) : null}
        </Text>
        {showRank && rank != null && (
          <View
            style={[
              ssStyles.rankCircle,
              { backgroundColor: teamColor ?? "#888" },
            ]}
          >
            <Text
              style={[
                ssStyles.rankCircleText,
                { color: getTextOnColor(teamColor) },
              ]}
            >
              {rank}
            </Text>
          </View>
        )}
      </View>
      {chips.length > 0 ? (
        <View style={ssStyles.chipsRow}>
          {chips.map((c, i) => (
            <View key={i} style={ssStyles.chip}>
              <Text style={[ssStyles.chipVal, { color: theme.text }]}>
                {c.val}
              </Text>
              <Text
                style={[ssStyles.chipLabel, { color: theme.textSecondary }]}
              >
                {c.label}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[ssStyles.noData, { color: theme.textTertiary }]}>—</Text>
      )}
    </View>
  );
}

function StatTypeCard({ typeName, statInfo, onPress, theme, colors }) {
  const { sorted, isRankable } = useMemo(() => {
    const withRank = statInfo.entries.map((e) => ({
      ...e,
      rankVal: extractRankVal(e.value, typeName),
    }));
    const rankable =
      withRank.filter((e) => e.rankVal != null).length > withRank.length / 2;
    const s = [...withRank].sort((a, b) =>
      rankable
        ? (b.rankVal ?? -Infinity) - (a.rankVal ?? -Infinity)
        : (a.team.name ?? "").localeCompare(b.team.name ?? ""),
    );
    return { sorted: s, isRankable: rankable };
  }, [statInfo.entries]);

  const top3 = sorted.slice(0, 3);

  return (
    <TouchableOpacity
      style={[ssStyles.statCard, { backgroundColor: theme.surface }]}
      onPress={() => onPress({ typeName, sorted, isRankable })}
      activeOpacity={0.8}
    >
      <Text style={[ssStyles.statCardTitle, { color: colors.primary }]}>
        {typeName}
      </Text>
      {top3.map((e, i) => (
        <StatTeamEntry
          key={e.team.id}
          team={e.team}
          value={e.value}
          rank={i + 1}
          showRank={false}
          isLast={i === top3.length - 1}
          theme={theme}
        />
      ))}
    </TouchableOpacity>
  );
}

function TeamStatsTab({ teamsInSeason, theme, colors }) {
  const [activeGroup, setActiveGroup] = useState(null);
  const [groupPickerVisible, setGroupPickerVisible] = useState(false);
  const [modalData, setModalData] = useState(null);

  const { statMap, groupNames, groups } = useMemo(() => {
    const map = new Map();
    const SKIP_TEAM_STATS = new Set([
      "most injured players",
      "most substituted players",
      "appearing players",
      "goal results",
      "total minutes played",
    ]);

    for (const team of teamsInSeason ?? []) {
      const details = team.statistics?.[0]?.details ?? [];
      for (const stat of details) {
        const name = stat.type?.name;
        if (!name) continue;
        const lname = name.toLowerCase();
        if (lname === "national team players") continue;
        if (SKIP_TEAM_STATS.has(lname)) continue;
        if (!map.has(name)) map.set(name, { type: stat.type, entries: [] });
        map.get(name).entries.push({ team, value: stat.value });
      }
    }
    const g = new Map();
    for (const [typeName, { type }] of map) {
      const grp = type.stat_group ? capitalizeFirst(type.stat_group) : "Other";
      if (!g.has(grp)) g.set(grp, []);
      g.get(grp).push(typeName);
    }
    // Sort type names alphabetically within each group
    for (const typeList of g.values()) {
      typeList.sort((a, b) => a.localeCompare(b));
    }
    const GROUP_ORDER = ["Overall", "Offensive", "Defensive", "Other"];
    const names = [...g.keys()].sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a);
      const bi = GROUP_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
    return { statMap: map, groupNames: names, groups: g };
  }, [teamsInSeason]);

  const currentGroup = activeGroup ?? groupNames[0] ?? null;
  const visibleTypeNames = currentGroup ? (groups.get(currentGroup) ?? []) : [];

  if (!statMap.size) {
    return (
      <View style={ssStyles.empty}>
        <Text style={{ color: theme.textSecondary }}>
          No team stats available
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={visibleTypeNames}
        keyExtractor={(name) => name}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={
          <TouchableOpacity
            style={[
              ssStyles.groupBanner,
              { backgroundColor: colors.primary + "18" },
            ]}
            onPress={() => setGroupPickerVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={[ssStyles.groupBannerText, { color: colors.primary }]}>
              {currentGroup}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.primary} />
          </TouchableOpacity>
        }
        renderItem={({ item: typeName }) => (
          <StatTypeCard
            typeName={typeName}
            statInfo={statMap.get(typeName)}
            onPress={setModalData}
            theme={theme}
            colors={colors}
          />
        )}
      />

      {/* Group picker modal */}
      <Modal
        visible={groupPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGroupPickerVisible(false)}
      >
        <Pressable
          style={mStyles.modalOverlay}
          onPress={() => setGroupPickerVisible(false)}
        >
          <Pressable
            style={[mStyles.modalSheet, { backgroundColor: theme.surface }]}
            onPress={() => {}}
          >
            <Text style={[mStyles.modalTitle, { color: theme.text }]}>
              Select Group
            </Text>
            {groupNames.map((g) => (
              <TouchableOpacity
                key={g}
                style={[
                  mStyles.modalTeamRow,
                  currentGroup === g && {
                    backgroundColor: colors.primary + "18",
                  },
                ]}
                onPress={() => {
                  setActiveGroup(g);
                  setGroupPickerVisible(false);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    mStyles.modalTeamName,
                    {
                      color: currentGroup === g ? colors.primary : theme.text,
                      fontWeight: currentGroup === g ? "700" : "400",
                    },
                  ]}
                >
                  {g}
                </Text>
                {currentGroup === g && (
                  <Ionicons name="checkmark" size={16} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Stat detail modal */}
      <Modal
        visible={!!modalData}
        transparent
        animationType="slide"
        onRequestClose={() => setModalData(null)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setModalData(null)}
          />
          <View
            style={[ssStyles.detailSheet, { backgroundColor: theme.surface }]}
          >
            <View
              style={[
                ssStyles.detailHeader,
                { borderBottomColor: theme.border },
              ]}
            >
              <Text
                style={[ssStyles.detailTitle, { color: theme.text }]}
                numberOfLines={1}
              >
                {modalData?.typeName}
              </Text>
              <TouchableOpacity
                onPress={() => setModalData(null)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={modalData?.sorted ?? []}
              keyExtractor={(e) => String(e.team.id)}
              contentContainerStyle={{ paddingBottom: 24 }}
              renderItem={({ item: e, index }) => (
                <StatTeamEntry
                  team={e.team}
                  value={e.value}
                  rank={index + 1}
                  showRank={modalData?.isRankable ?? false}
                  isLast={index === (modalData?.sorted?.length ?? 0) - 1}
                  theme={theme}
                />
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const ssStyles = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  groupBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 12,
    marginTop: 14,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  groupBannerText: { fontSize: 13, fontWeight: "700" },
  statCard: {
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 12,
    overflow: "hidden",
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  statCardTitle: {
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  teamEntry: { paddingHorizontal: 12, paddingVertical: 8 },
  teamEntryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  entryLogo: { width: 24, height: 24 },
  entryName: { flex: 1, fontSize: 12, fontWeight: "600" },
  entryAbbr: { fontSize: 11, fontWeight: "400" },
  rankCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rankCircleText: { fontSize: 11, fontWeight: "800" },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    paddingBottom: 4,
    paddingHorizontal: 4,
    rowGap: 6,
  },
  chip: { alignItems: "center", minWidth: 44, paddingHorizontal: 4 },
  chipVal: { fontSize: 13, fontWeight: "700" },
  chipLabel: { fontSize: 9, marginTop: 1 },
  noData: { fontSize: 11, marginBottom: 2 },
  detailSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 },
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailTitle: { fontSize: 16, fontWeight: "700", flex: 1, marginRight: 12 },
  // Stage stats
  stageEntityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  stageStatCount: { fontSize: 15, fontWeight: "700", flexShrink: 0 },
  stagePairRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  stagePairLabel: { fontSize: 12, flex: 1 },
  stagePairVal: { fontSize: 14, fontWeight: "700" },
});

// ─── Stats Tab (stage-level stats) ───────────────────────────────────────────────

const STAT_PAIR_SKIP = new Set([
  "participant_id",
  "participant_name",
  "participant_count",
  "player_id",
  "player_name",
  "team_most_corners_id",
  "team_most_corners_name",
]);

function formatStatPairs(value) {
  if (!value || typeof value !== "object") return [];
  const pairs = [];
  for (const [k, v] of Object.entries(value)) {
    if (STAT_PAIR_SKIP.has(k)) continue;
    if (v == null) continue;
    // Time-bucket keys like "0-15", "15-30", "90+"
    if (typeof v === "object" && /^\d/.test(k)) {
      const count = v?.count;
      if (count != null) pairs.push({ label: k, val: String(count) });
      continue;
    }
    // Goal Line nested structure: { over: { "0_5": {count, percentage} }, under: { ... } }
    if (typeof v === "object" && (k === "over" || k === "under")) {
      for (const [subKey, subVal] of Object.entries(v)) {
        if (subVal?.count != null) {
          const numStr = subKey.replace("_", ".");
          const label = k.charAt(0).toUpperCase() + k.slice(1) + " " + numStr;
          pairs.push({ label, val: String(subVal.count) });
        }
      }
      continue;
    }
    if (typeof v === "object") continue;
    const label = k
      .split("_")
      .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(" ");
    let display;
    if (typeof v === "number") {
      display = Number.isInteger(v) ? String(v) : v.toFixed(2);
      if (k === "percentage" || k.includes("percentage")) display += "%";
    } else {
      display = String(v);
    }
    pairs.push({ label, val: display });
  }
  return pairs;
}

function StageStatCard({ stat, teamMap, playerMap, theme, colors }) {
  const value = stat.value ?? {};
  const typeName = stat.type?.name ?? "";

  const hasParticipant = value.participant_id != null;
  const hasCorners = value.team_most_corners_id != null;
  const hasPlayer =
    value.player_id != null ||
    (stat.relation_id != null && value.player_name != null);

  if (hasParticipant || hasCorners || hasPlayer) {
    let entityName,
      entityImage,
      teamColor,
      entityCount,
      allTeamsCount,
      entitySubtitle;

    if (hasParticipant) {
      const team = teamMap.get(value.participant_id);
      entityName = value.participant_name;
      entityImage = team?.image_path;
      teamColor = team?.colorPrimary;
      // participant_count = this team's individual count; count = all-teams total
      if (value.participant_count != null) {
        entityCount = value.participant_count;
        allTeamsCount = value.count ?? null;
      } else {
        entityCount = value.count ?? value.goals ?? value.assists ?? null;
        allTeamsCount = null;
      }
    } else if (hasCorners) {
      const team = teamMap.get(value.team_most_corners_id);
      entityName = value.team_most_corners_name;
      entityImage = team?.image_path;
      teamColor = team?.colorPrimary;
      entityCount = value.count ?? null;
      allTeamsCount = null;
    } else {
      const playerId = value.player_id ?? stat.relation_id;
      const found = playerMap.get(playerId);
      entityName = value.player_name;
      // Construct image URL directly from Sportmonks pattern: players/{id%32}/{id}.png
      entityImage = found?.player?.image_path;
      teamColor = found?.team?.colorPrimary;
      entityCount =
        value.count ?? value.goals ?? value.assists ?? value.rating ?? null;
      allTeamsCount = null;
      // Extra: pass team name for subtitle
      entitySubtitle = found?.team?.name ?? null;
    }

    const initials = (entityName ?? "?")[0]?.toUpperCase();
    const showAllTeams = allTeamsCount != null;

    return (
      <View
        style={[
          ssStyles.statCard,
          { backgroundColor: theme.surface },
          !showAllTeams && teamColor
            ? { borderWidth: 2, borderColor: teamColor }
            : {},
        ]}
      >
        <Text style={[ssStyles.statCardTitle, { color: colors.primary }]}>
          {typeName}
        </Text>
        <View
          style={[
            ssStyles.stageEntityRow,
            showAllTeams && {
              borderBottomColor: teamColor ?? theme.border,
              borderBottomWidth: 2,
            },
          ]}
        >
          <View
            style={[
              ssStyles.entryLogo,
              {
                backgroundColor: (teamColor ?? theme.border) + "30",
                borderRadius: 12,
                overflow: "hidden",
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            {entityImage && !isPlaceholder(entityImage) ? (
              <Image
                source={{ uri: entityImage }}
                style={ssStyles.entryLogo}
                resizeMode="cover"
              />
            ) : (
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: teamColor ?? theme.textSecondary,
                }}
              >
                {initials}
              </Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[ssStyles.entryName, { color: theme.text }]}
              numberOfLines={1}
            >
              {entityName}
            </Text>
            {entitySubtitle != null && (
              <Text
                style={{ fontSize: 10, color: theme.textSecondary }}
                numberOfLines={1}
              >
                {entitySubtitle}
              </Text>
            )}
          </View>
          {entityCount != null && (
            <Text style={[ssStyles.stageStatCount, { color: theme.text }]}>
              {entityCount}
            </Text>
          )}
        </View>
        {showAllTeams && (
          <View style={ssStyles.stageEntityRow}>
            <Text
              style={[ssStyles.stagePairLabel, { color: theme.textSecondary }]}
            >
              All Teams
            </Text>
            <Text style={[ssStyles.stageStatCount, { color: theme.text }]}>
              {allTeamsCount}
            </Text>
          </View>
        )}
      </View>
    );
  }

  const pairs = formatStatPairs(value);
  if (!pairs.length) return null;

  return (
    <View style={[ssStyles.statCard, { backgroundColor: theme.surface }]}>
      <Text style={[ssStyles.statCardTitle, { color: colors.primary }]}>
        {typeName}
      </Text>
      {pairs.map(({ label, val }, i) => (
        <View
          key={i}
          style={[
            ssStyles.stagePairRow,
            i < pairs.length - 1 && {
              borderBottomColor: theme.border,
              borderBottomWidth: StyleSheet.hairlineWidth,
            },
          ]}
        >
          <Text
            style={[ssStyles.stagePairLabel, { color: theme.textSecondary }]}
          >
            {label}
          </Text>
          <Text style={[ssStyles.stagePairVal, { color: theme.text }]}>
            {val}
          </Text>
        </View>
      ))}
    </View>
  );
}

function StatsTab({ stageStats, teamsInSeason, theme, colors }) {
  const teamMap = useMemo(
    () => new Map((teamsInSeason ?? []).map((t) => [t.id, t])),
    [teamsInSeason],
  );

  const playerMap = useMemo(() => {
    const map = new Map();
    for (const team of teamsInSeason ?? []) {
      for (const pl of team.players ?? []) {
        if (pl.id != null) map.set(pl.id, { player: pl.player, team });
      }
    }
    return map;
  }, [teamsInSeason]);

  const { groups, groupNames } = useMemo(() => {
    const g = new Map();
    for (const stat of stageStats ?? []) {
      if (!stat.type?.name) continue;
      const grp = stat.type.stat_group
        ? capitalizeFirst(stat.type.stat_group)
        : "Other";
      if (!g.has(grp)) g.set(grp, []);
      g.get(grp).push(stat);
    }
    for (const list of g.values()) {
      list.sort((a, b) =>
        (a.type?.name ?? "").localeCompare(b.type?.name ?? ""),
      );
    }
    const GROUP_ORDER = ["Overall", "Offensive", "Defensive", "Other"];
    const names = [...g.keys()].sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a);
      const bi = GROUP_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
    return { groups: g, groupNames: names };
  }, [stageStats]);

  if (!stageStats?.length) {
    return (
      <View style={ssStyles.empty}>
        <Text style={{ color: theme.textSecondary }}>No stats available</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      {groupNames.map((grp) => (
        <View key={grp}>
          <View
            style={[
              ssStyles.groupBanner,
              { backgroundColor: colors.primary + "18" },
            ]}
          >
            <Text style={[ssStyles.groupBannerText, { color: colors.primary }]}>
              {grp}
            </Text>
          </View>
          {(groups.get(grp) ?? []).map((stat, i) => (
            <StageStatCard
              key={`${grp}-${i}`}
              stat={stat}
              teamMap={teamMap}
              playerMap={playerMap}
              theme={theme}
              colors={colors}
            />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const TABS = [
  { key: "standings", label: "Standings", icon: "podium-outline" },
  { key: "teams", label: "Teams", icon: "people-outline" },
  { key: "matches", label: "Matches", icon: "football-outline" },
  { key: "totw", label: "TOTW", icon: "star-outline" },
  { key: "teamstats", label: "Team Stats", icon: "pie-chart-outline" },
  { key: "stats", label: "Stats", icon: "stats-chart-outline" },
];

export default function Top5LeagueDetailScreen({ route, navigation }) {
  const { leagueId, leagueName } = route.params;
  const { theme, colors, isDarkMode } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const tabWidth = screenWidth / 4;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("standings");

  const cacheKey = `top5:league:${leagueId}:v1`;

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
              style={[
                styles.logo,
                {
                  tintColor:
                    info.id === 8 && isDarkMode ? theme.text : undefined,
                },
              ]}
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.tabBar, { borderTopColor: theme.border }]}
          contentContainerStyle={styles.tabBarContent}
        >
          {TABS.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabBtn, { width: tabWidth }]}
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
        </ScrollView>
      </View>

      {/* ── Tab content ── */}
      {activeTab === "standings" ? (
        <StandingsTab
          stages={data?.standings ?? []}
          theme={theme}
          colors={colors}
          navigation={navigation}
        />
      ) : activeTab === "matches" ? (
        <MatchesTab
          leagueInfo={data?.leagueInfo}
          teamsInSeason={data?.teamsInSeason}
          theme={theme}
          colors={colors}
          navigation={navigation}
        />
      ) : activeTab === "totw" ? (
        <TeamOfTheWeekTab
          teamOfTheWeek={data?.teamOfTheWeek}
          leagueInfo={data?.leagueInfo}
          leagueShortCode={info?.short_code}
          teamsInSeason={data?.teamsInSeason}
          theme={theme}
          colors={colors}
          isDarkMode={isDarkMode}
          navigation={navigation}
        />
      ) : activeTab === "teams" ? (
        <TeamsTab
          teamsInSeason={data?.teamsInSeason}
          theme={theme}
          colors={colors}
          navigation={navigation}
        />
      ) : activeTab === "teamstats" ? (
        <TeamStatsTab
          teamsInSeason={data?.teamsInSeason}
          theme={theme}
          colors={colors}
        />
      ) : activeTab === "stats" ? (
        <StatsTab
          stageStats={data?.stageStats}
          teamsInSeason={data?.teamsInSeason}
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
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabBarContent: { flexDirection: "row" },
  tabBtn: {
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

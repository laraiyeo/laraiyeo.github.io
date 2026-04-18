import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  RefreshControl,
  Dimensions,
  PanResponder,
} from "react-native";
import { Image } from "expo-image";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
} from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";
import { NHLService } from "../../services/NHLService";

const { width } = Dimensions.get("window");
const STAT_CHIP_COLS = 3;
const STAT_CHIP_GAP = 8;
const STAT_CHIP_W =
  (width - 2 * 12 - 2 * 14 - STAT_CHIP_GAP * (STAT_CHIP_COLS - 1)) /
  STAT_CHIP_COLS;
const TOP3_CARD_COLS = 2;
const TOP3_CARD_GAP = 10;
const TOP3_CARD_W =
  (width - 2 * 12 - TOP3_CARD_GAP * (TOP3_CARD_COLS - 1)) / TOP3_CARD_COLS;
const FILTER_PANEL_H = 34;

const TABS = ["Team", "Matches", "Stats", "Roster"];

const TEAM_ID_TO_ABBR = {
  1: "BOS",
  2: "BUF",
  3: "CGY",
  4: "CHI",
  5: "DET",
  6: "EDM",
  7: "CAR",
  8: "LAK",
  9: "DAL",
  10: "MTL",
  11: "NJD",
  12: "NYI",
  13: "NYR",
  14: "OTT",
  15: "PHI",
  16: "PIT",
  17: "COL",
  18: "SJS",
  19: "STL",
  20: "TBL",
  21: "TOR",
  22: "VAN",
  23: "WSH",
  25: "ANA",
  26: "FLA",
  27: "NSH",
  28: "WPG",
  29: "CBJ",
  30: "MIN",
  37: "VGK",
  124292: "SEA",
  129764: "UTA",
};

const normalizeAbbr = (abbr) => {
  if (!abbr) return null;
  const v = String(abbr).toUpperCase();
  if (v === "LA") return "LAK";
  if (v === "SJ") return "SJS";
  if (v === "TB") return "TBL";
  return v;
};

const resolveTeamInput = (params) => {
  const raw = params?.teamId ?? params?.team ?? null;
  const teamObj =
    params?.team && typeof params.team === "object" ? params.team : null;

  let id = null;
  let abbreviation = null;
  let displayName = null;

  if (teamObj) {
    id = teamObj.id != null ? String(teamObj.id) : null;
    abbreviation = teamObj.abbreviation
      ? normalizeAbbr(teamObj.abbreviation)
      : null;
    displayName = teamObj.displayName || teamObj.name || null;
  }

  if (raw != null && typeof raw === "object") {
    id = id || (raw.id != null ? String(raw.id) : null);
    abbreviation =
      abbreviation ||
      (raw.abbreviation ? normalizeAbbr(raw.abbreviation) : null);
    displayName = displayName || raw.displayName || raw.name || null;
  } else if (raw != null) {
    const token = String(raw);
    if (/^\d+$/.test(token)) {
      id = id || token;
      abbreviation = abbreviation || TEAM_ID_TO_ABBR[token] || null;
    } else {
      abbreviation = abbreviation || normalizeAbbr(token);
    }
  }

  return {
    id,
    abbreviation,
    displayName,
    endpointId: abbreviation || id,
  };
};

const getTextOnColor = (hex) => {
  if (!hex) return "#FFFFFF";
  const c = String(hex).replace("#", "");
  if (c.length < 6) return "#FFFFFF";
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? "#000000" : "#FFFFFF";
};

const formatDate = (dateStr) => {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(dateStr);
  }
};

const formatTime = (dateStr) => {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
};

const getTodayDateStr = () => {
  try {
    const now = new Date();
    const localToday = now.toLocaleDateString("en-CA");
    if (now.getHours() < 2) {
      const prev = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return prev.toLocaleDateString("en-CA");
    }
    return localToday;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

const gameToLocalDateStr = (gameDate) => {
  if (!gameDate) return "";
  try {
    return new Date(gameDate).toLocaleDateString("en-CA");
  } catch {
    return String(gameDate).slice(0, 10);
  }
};

const getGameLabel = (game) => {
  const type = Number(game?.gameType || 2);
  if (type === 1) return "Preseason";
  if (type === 3) return "Playoffs";
  return null;
};

const toTitleWords = (value) =>
  String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const formatRosterStatValue = (rawKey, rawValue) => {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) return String(rawValue ?? "");

  if (rawKey === "plusMinus") {
    if (n > 0) return `+${Math.round(n)}`;
    if (n < 0) return String(Math.round(n));
    return "0";
  }

  const label = toTitleWords(rawKey);
  if (/\b(Pctg|Percentage)\b/i.test(label)) {
    return `${(n * 100).toFixed(1)}%`;
  }

  if (Number.isInteger(n)) return String(n);
  return (Math.round(n * 10) / 10).toFixed(1);
};

const formatTopRankName = (player) => {
  const first = String(player?.firstName || "").trim();
  const last = String(player?.lastName || "").trim();
  const full = String(player?.fullName || "").trim();
  if (last) {
    return `${first ? `${first.charAt(0).toUpperCase()}. ` : ""}${last}`;
  }
  if (!full) return "Unknown";
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0).toUpperCase()}. ${parts.slice(1).join(" ")}`;
  }
  return full;
};

const isReverseRankStat = (statKey) => {
  const key = String(statKey || "").toLowerCase();
  return key === "losses" || key === "overtimelosses" || key === "goalsagainst" || key === "goalsagainstaverage" || key === "penaltyminutes";
};

const getStatKeys = (players) => {
  const keys = new Set();
  for (const p of Array.isArray(players) ? players : []) {
    for (const [key, value] of Object.entries(p || {})) {
      if (key === "playerId" || key === "positionCode") continue;
      if (!Number.isFinite(Number(value))) continue;
      keys.add(key);
    }
  }
  return [...keys].sort((a, b) =>
    toTitleWords(a).localeCompare(toTitleWords(b)),
  );
};

const passesGamesFilter = (gamesPlayed, minGames, comparator) => {
  const gp = Number(gamesPlayed);
  const threshold = Number(minGames);
  if (!Number.isFinite(gp) || !Number.isFinite(threshold)) return false;
  return comparator === "<=" ? gp <= threshold : gp >= threshold;
};

const buildTopThreeCards = (players, rosterIndex, filters) => {
  const selectedPosition = String(filters?.position || "ALL").toUpperCase();
  const minGames = Number(filters?.minGames || 0);
  const comparator = filters?.gamesComparator === "<=" ? "<=" : ">=";
  const list = Array.isArray(players) ? players : [];
  return getStatKeys(list)
    .map((statKey) => {
      const reverse = isReverseRankStat(statKey);
      const ranked = list
        .filter((p) => Number.isFinite(Number(p?.[statKey])))
        .filter((p) => {
          const pid = String(p?.playerId || "");
          if (!pid || !rosterIndex[pid]) return false;
          const rosterMeta = rosterIndex[pid];
          const pos = String(
            p?.positionCode || rosterMeta?.positionCode || "",
          ).toUpperCase();
          if (selectedPosition !== "ALL" && pos !== selectedPosition) {
            return false;
          }
          return passesGamesFilter(p?.gamesPlayed, minGames, comparator);
        })
        .slice()
        .sort((a, b) => {
          const av = Number(a?.[statKey]);
          const bv = Number(b?.[statKey]);
          if (av === bv)
            return String(a?.playerId || "").localeCompare(
              String(b?.playerId || ""),
            );
          return reverse ? av - bv : bv - av;
        })
        .slice(0, 3)
        .map((p) => {
          const pid = String(p?.playerId || "");
          const person = rosterIndex[pid] || {};
          return {
            id: pid,
            firstName: person.firstName || "",
            lastName: person.lastName || "",
            fullName: person.fullName || "",
            headshot: person.headshot || null,
            positionCode: String(
              p?.positionCode || person.positionCode || "",
            ).toUpperCase(),
            rawValue: Number(p?.[statKey]),
            value: formatRosterStatValue(statKey, p?.[statKey]),
          };
        });

      if (!ranked.length) return null;

      return {
        key: statKey,
        label: toTitleWords(statKey),
        leaders: ranked,
      };
    })
    .filter(Boolean);
};

const toFinite = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const average = (arr, key) => {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  let total = 0;
  let count = 0;
  for (const row of arr) {
    const val = Number(row?.[key]);
    if (Number.isFinite(val)) {
      total += val;
      count += 1;
    }
  }
  return count > 0 ? total / count : 0;
};

const sum = (arr, key) => {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  return arr.reduce((acc, row) => {
    const val = Number(row?.[key]);
    return Number.isFinite(val) ? acc + val : acc;
  }, 0);
};

const buildMetricRows = (players, metrics) => {
  return metrics
    .map((m) => {
      const values = (players || [])
        .map((p) => Number(p?.[m.key]))
        .filter((v) => Number.isFinite(v));
      if (!values.length) return null;

      const minVal = Math.min(...values);
      const maxVal = Math.max(...values);
      const teamVal =
        m.type === "sum" ? sum(players, m.key) : average(players, m.key);

      let pct = 0;
      if (maxVal !== minVal) {
        pct = (teamVal - minVal) / (maxVal - minVal);
        pct = Math.max(0, Math.min(1, pct));
      }

      return {
        key: m.key,
        label: m.label,
        value: m.format ? m.format(teamVal) : String(Math.round(teamVal)),
        pct,
      };
    })
    .filter(Boolean);
};

const StatBubble = ({ title, rows, expanded, onToggle, teamColor, theme }) => {
  const visibleRows = expanded ? rows : rows.slice(0, 5);
  return (
    <TouchableOpacity
      style={[sbStyles.bubble, { backgroundColor: theme.surface }]}
      onPress={onToggle}
      activeOpacity={0.85}
    >
      <View style={sbStyles.bubbleHeader}>
        <Text
          allowFontScaling={false}
          style={[sbStyles.bubbleTitle, { color: theme.text }]}
        >
          {title}
        </Text>
        <View style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}>
          <Text style={[sbStyles.bubbleChevron, { color: theme.text }]}>›</Text>
        </View>
      </View>
      <View>
        {visibleRows.map(({ key, label, value, pct }) => (
          <View key={key} style={sbStyles.statRow}>
            <Text
              allowFontScaling={false}
              style={[sbStyles.statRowLabel, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {label}
            </Text>
            <View style={sbStyles.statRowRight}>
              <Text
                allowFontScaling={false}
                style={[sbStyles.statRowValue, { color: theme.text }]}
              >
                {value}
              </Text>
              <View
                style={[
                  sbStyles.statBarTrack,
                  { backgroundColor: theme.border },
                ]}
              >
                <View
                  style={[
                    sbStyles.statBarFill,
                    {
                      width: `${Math.round(pct * 100)}%`,
                      backgroundColor: teamColor,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        ))}
        {!expanded && rows.length > 5 && (
          <Text
            allowFontScaling={false}
            style={[sbStyles.showMore, { color: theme.textSecondary }]}
          >
            +{rows.length - 5} more ›
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const sbStyles = StyleSheet.create({
  bubble: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 0,
  },
  bubbleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  bubbleTitle: { fontSize: 14, fontWeight: "800", letterSpacing: 0.3 },
  bubbleChevron: { fontSize: 20, lineHeight: 22 },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  statRowLabel: { flex: 1, fontSize: 12, fontWeight: "500", paddingRight: 8 },
  statRowRight: { alignItems: "flex-end", gap: 4 },
  statRowValue: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
    minWidth: 40,
  },
  statBarTrack: { width: 64, height: 3, borderRadius: 2, overflow: "hidden" },
  statBarFill: { height: "100%", borderRadius: 2, minWidth: 2 },
  showMore: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "right",
    marginTop: 2,
  },
});

const RosterPlayerRow = ({ player, teamColor, theme, navigation, sport, teamId }) => {
  const [expanded, setExpanded] = useState(false);
  const [headshotError, setHeadshotError] = useState(false);
  const personId = player.person?.id;
  const headshotUrl =
    player.headshot ||
    (personId
      ? `https://assets.nhle.com/mugs/nhl/20252026/${personId}.png`
      : null);

  const statEntries = Object.entries(player.stats || {}).filter(
    ([, v]) => v?.value != null,
  );

  const rankTextColor = getTextOnColor(teamColor);
  const statusColor =
    player.status?.description === "Active" ? theme.success : theme.error;

  return (
    <View style={[rStyles.playerBubble, { backgroundColor: theme.surface }]}>
      <TouchableOpacity
        style={rStyles.playerRow}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.75}
      >
        {headshotUrl && !headshotError ? (
          <Image
            cachePolicy="memory-disk"
            source={{ uri: headshotUrl }}
            style={[
              rStyles.headshot,
              { backgroundColor: teamColor + "66", borderColor: teamColor },
            ]}
            onError={() => setHeadshotError(true)}
          />
        ) : (
          <View
            style={[
              rStyles.headshot,
              rStyles.headshotPlaceholder,
              { backgroundColor: teamColor + "33" },
            ]}
          />
        )}

        <View style={rStyles.nameBlock}>
          <Text
            allowFontScaling={false}
            style={[rStyles.playerName, { color: theme.text }]}
            numberOfLines={1}
          >
            {player.person?.fullName || ""}
          </Text>
          <Text
            allowFontScaling={false}
            style={[rStyles.playerMeta, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {player.position?.name || ""} • #{player.jerseyNumber || ""}
          </Text>
        </View>

        <Text
          allowFontScaling={false}
          style={[rStyles.statusText, { color: statusColor }]}
          numberOfLines={2}
        >
          {player.status?.description || ""}
        </Text>

        <View style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}>
          <Text style={[rStyles.chevron, { color: theme.textSecondary }]}>
            ›
          </Text>
        </View>
      </TouchableOpacity>

      {expanded &&
        (statEntries.length === 0 ? (
          <View style={rStyles.noStats}>
            <Text style={[rStyles.noStatsText, { color: theme.textSecondary }]}>
              No stats available
            </Text>
          </View>
        ) : (
          <View style={rStyles.statsDropdown}>
            <View style={rStyles.statsGrid}>
              {statEntries.map(([label, info]) => (
                <View
                  key={label}
                  style={[
                    rStyles.statChip,
                    { backgroundColor: theme.background },
                  ]}
                >
                  {info.rank != null && (
                    <View
                      style={[
                        rStyles.rankBadge,
                        { backgroundColor: teamColor },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[rStyles.rankText, { color: rankTextColor }]}
                      >
                        #{info.rank}
                      </Text>
                    </View>
                  )}
                  <Text
                    allowFontScaling={false}
                    style={[
                      rStyles.chipValue,
                      {
                        color:
                          info?.rawKey === "plusMinus"
                            ? Number(info?.numericValue) > 0
                              ? theme.success
                              : Number(info?.numericValue) < 0
                                ? theme.error
                                : theme.text
                            : theme.text,
                      },
                    ]}
                  >
                    {info.value}
                  </Text>
                  <Text
                    allowFontScaling={false}
                    style={[rStyles.chipLabel, { color: theme.textSecondary }]}
                    numberOfLines={2}
                  >
                    {info?.label || label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}

      {expanded && (
        <View style={[rStyles.playerFooter, { borderTopColor: theme.border }]}>
          <TouchableOpacity
            style={[
              rStyles.goToPlayerBtn,
              {
                backgroundColor: teamColor + "22",
                borderColor: teamColor + "66",
              },
            ]}
            onPress={() => {
              if (!personId) return;
              navigation.navigate("PlayerPage", {
                playerId: personId,
                playerName: player.person?.fullName,
                teamId,
                sport: sport || "nhl",
              });
            }}
            activeOpacity={0.8}
            disabled={!personId}
          >
            <Text
              allowFontScaling={false}
              style={[rStyles.goToPlayerBtnText, { color: teamColor }]}
            >
              Go To Player
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const rStyles = StyleSheet.create({
  playerBubble: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 14,
    overflow: "visible",
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  headshot: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(128,128,128,0.1)",
    borderWidth: 1,
  },
  headshotPlaceholder: { borderRadius: 23 },
  nameBlock: { flex: 1 },
  playerName: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  playerMeta: { fontSize: 12 },
  statusText: { fontSize: 12, textAlign: "right", maxWidth: 80 },
  chevron: { fontSize: 22, lineHeight: 26, paddingLeft: 4 },
  statsDropdown: {
    paddingHorizontal: 12,
    paddingBottom: 14,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.2)",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 6,
  },
  statChip: {
    width: STAT_CHIP_W,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    position: "relative",
    overflow: "visible",
    marginBottom: 8,
  },
  rankBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  rankText: { fontSize: 9, fontWeight: "700" },
  chipValue: { fontSize: 15, fontWeight: "800", marginBottom: 4 },
  chipLabel: { fontSize: 10, fontWeight: "500", textAlign: "center" },
  noStats: { paddingHorizontal: 16, paddingBottom: 14, paddingTop: 6 },
  noStatsText: { fontSize: 13 },
  posSection: {},
  posSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 12,
    marginTop: 14,
    marginBottom: 2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  posSectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  posSectionCount: {
    fontSize: 12,
    fontWeight: "800",
  },
  playerFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  goToPlayerBtn: {
    minWidth: 140,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  goToPlayerBtnText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
});

const MinGamesSlider = ({ value, min, max, onChange, theme, teamColor }) => {
  const [trackW, setTrackW] = useState(0);
  const ratio =
    max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  const knobLeft = ratio * trackW;

  const updateFromX = useCallback(
    (x) => {
      if (!trackW || max <= min) return;
      const clamped = Math.max(0, Math.min(trackW, x));
      const next = Math.round(min + (clamped / trackW) * (max - min));
      onChange(next);
    },
    [trackW, max, min, onChange],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => updateFromX(evt.nativeEvent.locationX),
        onPanResponderMove: (evt) => updateFromX(evt.nativeEvent.locationX),
      }),
    [updateFromX],
  );

  return (
    <View style={topStyles.sliderRow}>
      <View
        style={topStyles.sliderTrackWrap}
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <View
          style={[topStyles.sliderTrack, { backgroundColor: theme.border }]}
        />
        <View
          style={[
            topStyles.sliderFill,
            { width: knobLeft, backgroundColor: teamColor },
          ]}
        />
        <View
          style={[
            topStyles.sliderKnob,
            {
              left: knobLeft - 8,
              borderColor: teamColor,
              backgroundColor: theme.surface,
            },
          ]}
        />
      </View>
      <Text style={[topStyles.sliderValue, { color: theme.text }]}>
        {value}
      </Text>
    </View>
  );
};

const TopFilters = ({
  theme,
  teamColor,
  positionOptions,
  selectedPosition,
  onSelectPosition,
  showPositionPanel,
  setShowPositionPanel,
  minGames,
  onChangeMinGames,
  maxGames,
  gamesComparator,
  onChangeComparator,
  showGamesPanel,
  setShowGamesPanel,
}) => {
  return (
    <View style={topStyles.filtersWrap}>
      <View style={topStyles.filtersBtnRow}>
        <TouchableOpacity
          style={[
            topStyles.filterMainBtn,
            {
              borderColor: teamColor,
              backgroundColor: showPositionPanel
                ? teamColor + "22"
                : "transparent",
            },
          ]}
          onPress={() => setShowPositionPanel((v) => !v)}
        >
          <Text style={[topStyles.filterMainBtnText, { color: theme.text }]}>
            Position
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            topStyles.filterMainBtn,
            {
              borderColor: teamColor,
              backgroundColor: showGamesPanel
                ? teamColor + "22"
                : "transparent",
            },
          ]}
          onPress={() => setShowGamesPanel((v) => !v)}
        >
          <Text style={[topStyles.filterMainBtnText, { color: theme.text }]}>
            Min Games Played
          </Text>
        </TouchableOpacity>
      </View>

      {showPositionPanel && (
        <View style={topStyles.filterPanel}>
          <View style={topStyles.pillsWrap}>
            {positionOptions.map((pos) => {
              const active = selectedPosition === pos;
              return (
                <TouchableOpacity
                  key={pos}
                  onPress={() => onSelectPosition(pos)}
                  style={[
                    topStyles.pill,
                    {
                      borderColor: teamColor,
                      backgroundColor: active ? teamColor : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[
                      topStyles.pillText,
                      {
                        color: active ? getTextOnColor(teamColor) : theme.text,
                      },
                    ]}
                  >
                    {pos}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {showGamesPanel && (
        <View style={topStyles.filterPanel}>
          <View style={topStyles.compRow}>
            {[">=", "<="].map((op) => {
              const active = gamesComparator === op;
              return (
                <TouchableOpacity
                  key={op}
                  onPress={() => onChangeComparator(op)}
                  style={[
                    topStyles.compBtn,
                    {
                      borderColor: teamColor,
                      backgroundColor: active ? teamColor : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[
                      topStyles.compBtnText,
                      {
                        color: active ? getTextOnColor(teamColor) : theme.text,
                      },
                    ]}
                  >
                    {op}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <MinGamesSlider
            value={minGames}
            min={0}
            max={Math.max(0, maxGames)}
            onChange={onChangeMinGames}
            theme={theme}
            teamColor={teamColor}
          />
        </View>
      )}
    </View>
  );
};

const TopThreeCard = ({ card, theme, teamColor }) => {
  const [headshotError, setHeadshotError] = useState(false);
  const first = card?.leaders?.[0] || null;
  const firstLabelFirst = String(first?.firstName || "").trim() || "Unknown";
  const firstLabelLast =
    String(first?.lastName || "").trim() ||
    String(first?.fullName || "")
      .trim()
      .split(/\s+/)
      .slice(1)
      .join(" ") ||
    "Player";

  return (
    <View style={[topStyles.card, { backgroundColor: theme.surface }]}>
      <Text
        allowFontScaling={false}
        style={[topStyles.cardLabel, { color: theme.text }]}
        numberOfLines={1}
      >
        {card?.label || "Stat"}
      </Text>

      {first ? (
        <View style={topStyles.firstCol}>
          <View style={topStyles.firstHeadshotWrap}>
            {first.headshot && !headshotError ? (
              <Image
                cachePolicy="memory-disk"
                source={{ uri: first.headshot }}
                style={[
                  topStyles.firstHeadshot,
                  {
                    backgroundColor: teamColor + "33",
                    borderColor: teamColor,
                  },
                ]}
                onError={() => setHeadshotError(true)}
              />
            ) : (
              <View
                style={[
                  topStyles.firstHeadshot,
                  topStyles.firstHeadshotFallback,
                  { backgroundColor: teamColor + "22", borderColor: teamColor },
                ]}
              >
                <Text style={[topStyles.firstInitial, { color: teamColor }]}>
                  {firstLabelLast.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            {!!first.positionCode && (
              <View
                style={[
                  topStyles.positionBadge,
                  { backgroundColor: teamColor, borderColor: theme.surface },
                ]}
              >
                <Text
                  style={[
                    topStyles.positionBadgeText,
                    { color: getTextOnColor(teamColor) },
                  ]}
                >
                  {first.positionCode}
                </Text>
              </View>
            )}
          </View>

          <Text
            allowFontScaling={false}
            style={[topStyles.firstName, { color: theme.text }]}
            numberOfLines={1}
          >
            {firstLabelFirst}
          </Text>
          <Text
            allowFontScaling={false}
            style={[topStyles.lastName, { color: theme.text }]}
            numberOfLines={1}
          >
            {firstLabelLast}
          </Text>
          <Text
            allowFontScaling={false}
            style={[topStyles.firstValue, { color: teamColor }]}
            numberOfLines={1}
          >
            {first.value}
          </Text>
        </View>
      ) : null}

      {[1, 2].map((rankIdx) => {
        const p = card?.leaders?.[rankIdx];
        if (!p) return null;
        return (
          <View key={`${card.key}-${rankIdx}`}>
            <View
              style={[topStyles.divider, { backgroundColor: theme.border }]}
            />
            <View style={topStyles.rankRow}>
              <Text
                allowFontScaling={false}
                style={[topStyles.rankName, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {formatTopRankName(p)}
              </Text>
              <Text
                allowFontScaling={false}
                style={[topStyles.rankValue, { color: theme.text }]}
                numberOfLines={1}
              >
                {p.value}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const TopThreeSection = ({
  title,
  cards,
  theme,
  teamColor,
  expanded,
  onToggle,
}) => {
  if (!cards.length) return null;
  return (
    <View style={topStyles.sectionWrap}>
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={onToggle}
        style={topStyles.sectionHeaderBtn}
      >
        <View style={[topStyles.sectionLine, { backgroundColor: teamColor }]} />
        <Text
          allowFontScaling={false}
          style={[topStyles.sectionTitle, { color: teamColor }]}
        >
          {title}
        </Text>
        <View style={[topStyles.sectionLine, { backgroundColor: teamColor }]} />
        <Text style={[topStyles.sectionChevron, { color: theme.text }]}>
          {expanded ? "▲" : "▼"}
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View style={topStyles.grid}>
          {cards.map((card) => (
            <TopThreeCard
              key={card.key}
              card={card}
              theme={theme}
              teamColor={teamColor}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const topStyles = StyleSheet.create({
  filtersWrap: {
    marginBottom: 2,
    gap: 8,
  },
  filtersBtnRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterMainBtn: {
    flex: 1,
    height: FILTER_PANEL_H,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  filterMainBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  filterPanel: {
    borderRadius: 10,
    padding: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(128,128,128,0.3)",
  },
  pillsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  pillText: { fontSize: 11, fontWeight: "700" },
  compRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  compBtn: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  compBtnText: { fontSize: 11, fontWeight: "700" },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sliderTrackWrap: {
    flex: 1,
    height: 22,
    justifyContent: "center",
  },
  sliderTrack: {
    height: 4,
    borderRadius: 3,
  },
  sliderFill: {
    position: "absolute",
    left: 0,
    height: 4,
    borderRadius: 3,
  },
  sliderKnob: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  sliderValue: {
    width: 40,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "700",
  },
  sectionWrap: {
    gap: 10,
  },
  sectionHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  sectionLine: {
    flex: 1,
    height: 2,
    borderRadius: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    minWidth: 74,
    textAlign: "center",
  },
  sectionChevron: {
    fontSize: 14,
    fontWeight: "700",
    width: 14,
    textAlign: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: TOP3_CARD_GAP,
  },
  card: {
    width: TOP3_CARD_W,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 196,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
    marginBottom: 10,
    textAlign: "center",
  },
  firstCol: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  firstHeadshotWrap: { position: "relative", marginBottom: 8 },
  firstHeadshot: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
  },
  firstHeadshotFallback: {
    justifyContent: "center",
    alignItems: "center",
  },
  positionBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  positionBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    lineHeight: 10,
  },
  firstInitial: { fontSize: 16, fontWeight: "800" },
  firstName: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 14,
    textAlign: "center",
  },
  lastName: {
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 16,
    textAlign: "center",
  },
  firstValue: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 5,
    textAlign: "center",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 4,
    marginTop: 10,
  },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  rankName: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    paddingRight: 8,
  },
  rankValue: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
    minWidth: 28,
  },
});

const TeamTab = ({ teamData, teamColor, theme }) => {
  const standings =
    teamData?.standings && typeof teamData.standings === "object"
      ? teamData.standings
      : null;
  const standingsRecords = standings
    ? [
        {
          division: { name: standings?.divisionName || "Standings" },
          teamRecords: [
            {
              team: {
                id: standings?.teamAbbrev || teamData?.team?.id,
                name: standings?.teamCommonName || teamData?.team?.name || "",
              },
              wins: standings?.wins,
              losses: standings?.losses,
              otLosses: standings?.otLosses,
              divisionRank: standings?.divisionSequence,
              homeWins: standings?.homeWins,
              homeLosses: standings?.homeLosses,
              homeOtLosses: standings?.homeOtLosses,
              roadWins: standings?.roadWins,
              roadLosses: standings?.roadLosses,
              roadOtLosses: standings?.roadOtLosses,
              streakCode: standings?.streakCode,
              streakCount: standings?.streakCount,
              goalDifferential: standings?.goalDifferential,
              points: standings?.points,
            },
          ],
        },
      ]
    : [];

  const toPct = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  };

  const fmtPct = (v) => `${(toPct(v) * 100).toFixed(1)}%`;
  const fmtNum = (v, fallback = "-") => {
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : fallback;
  };

  const splitRates = [
    {
      key: "Home",
      value:
        Number(standings?.homePoints) /
        Math.max(1, Number(standings?.homeGamesPlayed) * 2),
      label: `${fmtNum(standings?.homeWins)}-${fmtNum(standings?.homeLosses)}-${fmtNum(standings?.homeOtLosses)}`,
    },
    {
      key: "Road",
      value:
        Number(standings?.roadPoints) /
        Math.max(1, Number(standings?.roadGamesPlayed) * 2),
      label: `${fmtNum(standings?.roadWins)}-${fmtNum(standings?.roadLosses)}-${fmtNum(standings?.roadOtLosses)}`,
    },
    {
      key: "L10",
      value:
        Number(standings?.l10Points) /
        Math.max(1, Number(standings?.l10GamesPlayed) * 2),
      label: `${fmtNum(standings?.l10Wins)}-${fmtNum(standings?.l10Losses)}-${fmtNum(standings?.l10OtLosses)}`,
    },
  ].map((row) => ({
    ...row,
    value: toPct(row.value),
  }));

  const comparisonRows = [
    {
      key: "PTS%",
      value: toPct(standings?.pointPctg),
      display: fmtPct(standings?.pointPctg),
    },
    {
      key: "Reg Win %",
      value: toPct(standings?.regulationWinPctg),
      display: fmtPct(standings?.regulationWinPctg),
    },
    {
      key: "Reg+OT Win %",
      value: toPct(standings?.regulationPlusOtWinPctg),
      display: fmtPct(standings?.regulationPlusOtWinPctg),
    },
    {
      key: "Goals / Game",
      value: Math.max(0, Math.min(1, Number(standings?.goalsForPctg || 0) / 5)),
      display: Number.isFinite(Number(standings?.goalsForPctg))
        ? Number(standings?.goalsForPctg).toFixed(2)
        : "-",
    },
  ];

  const streakCode = String(standings?.streakCode || "").toUpperCase();
  const streakCount = Number(standings?.streakCount);
  const streakValue =
    streakCode && Number.isFinite(streakCount)
      ? `${streakCode}${streakCount}`
      : streakCode || "-";
  const goalDiff = Number(standings?.goalDifferential);
  const goalDiffValue = Number.isFinite(goalDiff)
    ? goalDiff > 0
      ? `+${goalDiff}`
      : String(goalDiff)
    : "-";

  const snapshotItems = [
    { label: "Points", value: fmtNum(standings?.points) },
    {
      label: "Record",
      value: `${fmtNum(standings?.wins)}-${fmtNum(standings?.losses)}-${fmtNum(standings?.otLosses)}`,
    },
    { label: "PTS%", value: fmtPct(standings?.pointPctg) },
    { label: "Division Rank", value: fmtNum(standings?.divisionSequence) },
    {
      label: "Conference Rank",
      value: fmtNum(standings?.conferenceSequence),
    },
    { label: "League Rank", value: fmtNum(standings?.leagueSequence) },
    { label: "Goal Diff", value: goalDiffValue },
    { label: "Streak", value: streakValue },
  ];

  if (String(standings?.clinchIndicator || "").trim()) {
    snapshotItems.push({
      label: "Clinch",
      value: String(standings?.clinchIndicator || "").toUpperCase(),
    });
  }

  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 24,
        gap: 12,
      }}
    >
      {standingsRecords.map((record, rIdx) => {
        const rows = record.teamRecords ?? [];
        const divName = record.division?.name ?? "Standings";
        return (
          <View
            key={`standing-${rIdx}`}
            style={[ttStyles.bubble, { backgroundColor: theme.surface }]}
          >
            <Text
              allowFontScaling={false}
              style={[ttStyles.sectionTitle, { color: teamColor }]}
            >
              {divName} Division
            </Text>

            <View style={ttStyles.standingHeaderRow}>
              <Text
                style={[
                  ttStyles.colTeam,
                  ttStyles.colHeader,
                  { color: theme.textSecondary },
                ]}
              >
                Team
              </Text>
              <Text
                style={[
                  ttStyles.colStat,
                  ttStyles.colHeader,
                  { color: theme.textSecondary },
                ]}
              >
                W
              </Text>
              <Text
                style={[
                  ttStyles.colStat,
                  ttStyles.colHeader,
                  { color: theme.textSecondary },
                ]}
              >
                L
              </Text>
              <Text
                style={[
                  ttStyles.colStat,
                  ttStyles.colHeader,
                  { color: theme.textSecondary },
                ]}
              >
                OTL
              </Text>
              <Text
                style={[
                  ttStyles.colStat,
                  ttStyles.colHeader,
                  { color: theme.textSecondary },
                ]}
              >
                Rank
              </Text>
            </View>

            {rows.map((tr, i) => {
              const isThis = true;
              const homeStr = [tr.homeWins, tr.homeLosses, tr.homeOtLosses]
                .filter((v) => v != null)
                .join("-");
              const awayStr = [tr.roadWins, tr.roadLosses, tr.roadOtLosses]
                .filter((v) => v != null)
                .join("-");
              const streakCode = String(tr.streakCode || "").toUpperCase();
              const streakCount = Number(tr.streakCount);
              const streakValue =
                streakCode && Number.isFinite(streakCount)
                  ? `${streakCode}${streakCount}`
                  : streakCode || "-";
              const goalDiff = Number(tr.goalDifferential);
              const goalDiffStr = Number.isFinite(goalDiff)
                ? goalDiff > 0
                  ? `+${goalDiff}`
                  : String(goalDiff)
                : "-";
              const streakColor = streakCode.startsWith("W")
                ? theme.success || "#4CAF50"
                : streakCode.startsWith("L") || streakCode.startsWith("OT")
                  ? theme.error || "#E53935"
                  : theme.textSecondary;
              const diffColor = Number.isFinite(goalDiff)
                ? goalDiff > 0
                  ? theme.success || "#4CAF50"
                  : goalDiff < 0
                    ? theme.error || "#E53935"
                    : theme.textSecondary
                : theme.textSecondary;
              const rowColor = isThis ? teamColor : theme.text;
              const rowMeta = isThis ? teamColor : theme.textSecondary;

              return (
                <View
                  key={tr.team?.id || `tr-${i}`}
                  style={[
                    ttStyles.standingRow,
                    isThis && { backgroundColor: teamColor + "18" },
                    i < rows.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: theme.border,
                    },
                  ]}
                >
                  <View style={ttStyles.standingRowInner}>
                    <Text
                      allowFontScaling={false}
                      style={[
                        ttStyles.colTeam,
                        { color: rowColor, fontWeight: isThis ? "700" : "400" },
                      ]}
                      numberOfLines={1}
                    >
                      {tr.team?.name ?? ""}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={[
                        ttStyles.colStat,
                        { color: rowColor, fontWeight: isThis ? "700" : "400" },
                      ]}
                    >
                      {tr.wins ?? "-"}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={[
                        ttStyles.colStat,
                        { color: rowColor, fontWeight: isThis ? "700" : "400" },
                      ]}
                    >
                      {tr.losses ?? "-"}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={[
                        ttStyles.colStat,
                        { color: rowColor, fontWeight: isThis ? "700" : "400" },
                      ]}
                    >
                      {tr.otLosses ?? "-"}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={[ttStyles.colStat, { color: rowMeta }]}
                    >
                      {tr.divisionRank ?? "-"}
                    </Text>
                  </View>

                  <View style={ttStyles.secRow}>
                    {[
                      { label: "Home", value: homeStr || "-", color: rowMeta },
                      { label: "Away", value: awayStr || "-", color: rowMeta },
                      {
                        label: "Streak",
                        value: streakValue,
                        color: streakColor,
                      },
                      { label: "Diff", value: goalDiffStr, color: diffColor },
                      {
                        label: "PTS",
                        value:
                          tr.points != null &&
                          Number.isFinite(Number(tr.points))
                            ? String(tr.points)
                            : "-",
                        color: rowMeta,
                      },
                    ].map(({ label, value, color }) => (
                      <View key={label} style={ttStyles.secChip}>
                        <Text
                          allowFontScaling={false}
                          style={[ttStyles.secValue, { color }]}
                        >
                          {value}
                        </Text>
                        <Text
                          allowFontScaling={false}
                          style={[
                            ttStyles.secLabel,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}

      {!!standings && (
        <View style={[ttStyles.bubble, { backgroundColor: theme.surface }]}>
          <Text
            allowFontScaling={false}
            style={[ttStyles.sectionTitle, { color: teamColor }]}
          >
            Standings Snapshot
          </Text>
          <View style={ttStyles.snapshotGrid}>
            {snapshotItems.map((item) => (
              <View
                key={item.label}
                style={[
                  ttStyles.snapshotChip,
                  { backgroundColor: theme.background },
                ]}
              >
                <Text style={[ttStyles.snapshotValue, { color: theme.text }]}>
                  {item.value}
                </Text>
                <Text
                  style={[
                    ttStyles.snapshotLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  {item.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {!!standings && (
        <View style={[ttStyles.bubble, { backgroundColor: theme.surface }]}>
          <Text
            allowFontScaling={false}
            style={[ttStyles.sectionTitle, { color: teamColor }]}
          >
            Bar Comparisons
          </Text>

          {comparisonRows.map((row, idx) => (
            <View
              key={row.key}
              style={[
                ttStyles.compRow,
                idx < comparisonRows.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: theme.border,
                },
              ]}
            >
              <View style={ttStyles.compHeaderRow}>
                <Text
                  style={[ttStyles.compLabel, { color: theme.textSecondary }]}
                >
                  {row.key}
                </Text>
                <Text style={[ttStyles.compValue, { color: theme.text }]}>
                  {row.display}
                </Text>
              </View>
              <View
                style={[ttStyles.compTrack, { backgroundColor: theme.border }]}
              >
                <View
                  style={[
                    ttStyles.compFill,
                    {
                      width: `${Math.round(row.value * 100)}%`,
                      backgroundColor: teamColor,
                    },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      )}

      {!!standings && (
        <View style={[ttStyles.bubble, { backgroundColor: theme.surface }]}>
          <Text
            allowFontScaling={false}
            style={[ttStyles.sectionTitle, { color: teamColor }]}
          >
            Split Performance
          </Text>

          {splitRates.map((row, idx) => (
            <View
              key={row.key}
              style={[
                ttStyles.compRow,
                idx < splitRates.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: theme.border,
                },
              ]}
            >
              <View style={ttStyles.compHeaderRow}>
                <Text
                  style={[ttStyles.compLabel, { color: theme.textSecondary }]}
                >
                  {row.key}
                </Text>
                <Text style={[ttStyles.compValue, { color: theme.text }]}>
                  {fmtPct(row.value)}
                </Text>
              </View>
              <View
                style={[ttStyles.compTrack, { backgroundColor: theme.border }]}
              >
                <View
                  style={[
                    ttStyles.compFill,
                    {
                      width: `${Math.round(row.value * 100)}%`,
                      backgroundColor: teamColor,
                    },
                  ]}
                />
              </View>
              <Text
                style={[ttStyles.compSubText, { color: theme.textSecondary }]}
              >
                {row.label}
              </Text>
            </View>
          ))}
        </View>
      )}

      {standingsRecords.length === 0 && !standings && (
        <View style={{ alignItems: "center", paddingVertical: 56 }}>
          <Text style={{ fontSize: 15, color: theme.textSecondary }}>
            No team info available
          </Text>
        </View>
      )}
    </View>
  );
};

const ttStyles = StyleSheet.create({
  bubble: {
    borderRadius: 14,
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  standingHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.2)",
  },
  standingRow: {
    flexDirection: "column",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  standingRowInner: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  secRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  secChip: {
    alignItems: "center",
    minWidth: 44,
  },
  secValue: { fontSize: 12, fontWeight: "700" },
  secLabel: {
    fontSize: 10,
    fontWeight: "500",
    marginTop: 1,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  colHeader: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  colTeam: { flex: 1, fontSize: 13, paddingRight: 6 },
  colStat: { width: 42, textAlign: "center", fontSize: 13 },
  snapshotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  snapshotChip: {
    width: "31%",
    minWidth: 96,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  snapshotValue: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 3,
  },
  snapshotLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  compRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  compHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  compLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  compValue: {
    fontSize: 12,
    fontWeight: "700",
  },
  compTrack: {
    width: "100%",
    height: 8,
    borderRadius: 5,
    overflow: "hidden",
  },
  compFill: {
    height: "100%",
    borderRadius: 5,
    minWidth: 2,
  },
  compSubText: {
    fontSize: 11,
    marginTop: 6,
  },
  coachRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  coachName: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  coachJob: { fontSize: 12 },
  coachJersey: {
    fontSize: 15,
    fontWeight: "700",
    minWidth: 36,
    textAlign: "right",
  },
});

const MatchCard = ({
  game,
  idx,
  navigation,
  sport,
  isDarkMode,
  theme,
  colors,
  teamColor,
  getLogo,
}) => {
  const label = getGameLabel(game);
  const away = game.teams?.away?.team || {};
  const home = game.teams?.home?.team || {};
  const awayScore = game.teams?.away?.score;
  const homeScore = game.teams?.home?.score;

  const state = String(game.status?.codedGameState || "").toUpperCase();
  const isLive = ["I", "MA", "MC"].includes(state);
  const isScheduled = ["S", "P"].includes(state);
  const isFinished = !isLive && !isScheduled && !!state;

  const awayLogo = isDarkMode
    ? away.darkLogo || away.logo || getLogo(away.abbreviation || away.id, true)
    : away.logo ||
      away.darkLogo ||
      getLogo(away.abbreviation || away.id, false);
  const homeLogo = isDarkMode
    ? home.darkLogo || home.logo || getLogo(home.abbreviation || home.id, true)
    : home.logo ||
      home.darkLogo ||
      getLogo(home.abbreviation || home.id, false);
  const awayColor = NHLService.getTeamColor(away.abbreviation, colors.primary);
  const homeColor = NHLService.getTeamColor(
    home.abbreviation,
    colors.secondary,
  );
  const awayDisplayName = away.commonName
    ? `${away.abbreviation || ""} · ${away.commonName}`
    : away.name || away.abbreviation || "Away";
  const homeDisplayName = home.commonName
    ? `${home.abbreviation || ""} · ${home.commonName}`
    : home.name || home.abbreviation || "Home";

  const awayWinner =
    isFinished &&
    awayScore != null &&
    homeScore != null &&
    Number(awayScore) > Number(homeScore);
  const homeWinner =
    isFinished &&
    homeScore != null &&
    awayScore != null &&
    Number(homeScore) > Number(awayScore);

  const statusLabel = isScheduled
    ? formatTime(game.gameDate)
    : isLive
      ? "LIVE"
      : game.status?.detailedState?.includes("Final")
        ? "Final"
        : (game.status?.detailedState || "").slice(0, 8);

  const gradId = `nhl_match_${idx}_${game.gamePk || "x"}`;

  return (
    <View style={styles.matchCardWrap}>
      {label ? (
        <View
          style={[
            styles.matchGameBadge,
            {
              backgroundColor: teamColor + "80",
              borderColor: teamColor,
            },
          ]}
        >
          <Text
            allowFontScaling={false}
            style={[styles.matchGameBadgeText, { color: theme.textSecondary }]}
          >
            {label}
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.matchCard, { backgroundColor: theme.surface }]}
        onPress={() =>
          navigation.navigate("GameDetails", {
            sport: sport || "nhl",
            gameId: game.gamePk,
          })
        }
        activeOpacity={0.75}
      >
        <Svg
          style={StyleSheet.absoluteFill}
          width="100%"
          height="100%"
          pointerEvents="none"
        >
          <Defs>
            <SvgLinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor={awayColor} stopOpacity="0.08" />
              <Stop offset="40%" stopColor={theme.surface} stopOpacity="0" />
              <Stop offset="60%" stopColor={theme.surface} stopOpacity="0" />
              <Stop offset="100%" stopColor={homeColor} stopOpacity="0.08" />
            </SvgLinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${gradId})`} />
        </Svg>

        <View style={styles.matchCardInner}>
          <View style={styles.matchStatusCol}>
            <Text
              allowFontScaling={false}
              style={[styles.matchDateText, { color: theme.textSecondary }]}
              numberOfLines={2}
            >
              {formatDate(game.gameDate)}
            </Text>
            <Text
              allowFontScaling={false}
              style={[
                styles.matchStatusText,
                isLive
                  ? { color: "#E53935", fontWeight: "700" }
                  : { color: theme.textTertiary || theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {statusLabel}
            </Text>
          </View>

          <View style={styles.matchTeamsList}>
            <View style={styles.matchTeamRow}>
              <View style={styles.matchLogoWrap}>
                {awayLogo ? (
                  <Image
                    cachePolicy="memory-disk"
                    source={{ uri: awayLogo }}
                    style={styles.matchTeamLogo}
                    resizeMode="contain"
                  />
                ) : (
                  <View
                    style={[
                      styles.matchTeamLogoFallback,
                      { backgroundColor: awayColor },
                    ]}
                  >
                    <Text style={styles.matchLogoFallbackText}>
                      {(away.abbreviation || away.name || "A").charAt(0)}
                    </Text>
                  </View>
                )}
              </View>

              <Text
                allowFontScaling={false}
                style={[
                  styles.matchTeamName,
                  {
                    color: awayWinner ? theme.text : theme.textSecondary,
                    fontWeight: awayWinner ? "800" : "400",
                  },
                ]}
                numberOfLines={1}
              >
                {awayDisplayName}
              </Text>

              {awayScore != null && (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.matchScoreText,
                    {
                      color: awayWinner ? theme.text : theme.textSecondary,
                      fontWeight: awayWinner ? "800" : "400",
                    },
                  ]}
                >
                  {awayScore}
                </Text>
              )}
            </View>

            <View
              style={[
                styles.matchTeamDivider,
                { backgroundColor: theme.border },
              ]}
            />

            <View style={styles.matchTeamRow}>
              <View style={styles.matchLogoWrap}>
                {homeLogo ? (
                  <Image
                    cachePolicy="memory-disk"
                    source={{ uri: homeLogo }}
                    style={styles.matchTeamLogo}
                    resizeMode="contain"
                  />
                ) : (
                  <View
                    style={[
                      styles.matchTeamLogoFallback,
                      { backgroundColor: homeColor },
                    ]}
                  >
                    <Text style={styles.matchLogoFallbackText}>
                      {(home.abbreviation || home.name || "H").charAt(0)}
                    </Text>
                  </View>
                )}
              </View>

              <Text
                allowFontScaling={false}
                style={[
                  styles.matchTeamName,
                  {
                    color: homeWinner ? theme.text : theme.textSecondary,
                    fontWeight: homeWinner ? "800" : "400",
                  },
                ]}
                numberOfLines={1}
              >
                {homeDisplayName}
              </Text>

              {homeScore != null && (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.matchScoreText,
                    {
                      color: homeWinner ? theme.text : theme.textSecondary,
                      fontWeight: homeWinner ? "800" : "400",
                    },
                  ]}
                >
                  {homeScore}
                </Text>
              )}
            </View>
          </View>

          <Text
            style={[
              styles.matchChevron,
              { color: theme.textTertiary || theme.textSecondary },
            ]}
          >
            ›
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const MatchesSection = ({
  title,
  games,
  collapsible,
  navigation,
  sport,
  isDarkMode,
  theme,
  colors,
  teamColor,
  getLogo,
}) => {
  const [expanded, setExpanded] = useState(false);
  if (!games.length) return null;

  const visibleGames = collapsible && !expanded ? games.slice(0, 1) : games;

  return (
    <View style={{ marginBottom: 6 }}>
      <TouchableOpacity
        style={[mStyles.sectionHeader, { backgroundColor: theme.surface }]}
        onPress={collapsible ? () => setExpanded((v) => !v) : undefined}
        activeOpacity={collapsible ? 0.7 : 1}
        disabled={!collapsible}
      >
        <Text
          allowFontScaling={false}
          style={[mStyles.sectionTitle, { color: teamColor }]}
        >
          {title}
        </Text>

        {collapsible && !expanded && games.length > 1 && (
          <View
            style={[mStyles.countBadge, { backgroundColor: teamColor + "22" }]}
          >
            <Text
              allowFontScaling={false}
              style={[mStyles.countText, { color: theme.textTertiary }]}
            >
              +{games.length - 1}
            </Text>
          </View>
        )}

        {collapsible && (
          <View
            style={{
              transform: [{ rotate: expanded ? "90deg" : "0deg" }],
              marginLeft: 4,
            }}
          >
            <Text
              style={[mStyles.sectionChevron, { color: theme.textSecondary }]}
            >
              ›
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {visibleGames.map((game, idx) => (
        <MatchCard
          key={game.gamePk || idx}
          game={game}
          idx={idx}
          navigation={navigation}
          sport={sport}
          isDarkMode={isDarkMode}
          theme={theme}
          colors={colors}
          teamColor={teamColor}
          getLogo={getLogo}
        />
      ))}
    </View>
  );
};

const mStyles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginTop: 14,
    marginBottom: 2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  countBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  countText: { fontSize: 11, fontWeight: "700" },
  sectionChevron: { fontSize: 22, lineHeight: 26 },
});

const TeamPageScreen = ({ route, navigation }) => {
  const params = route.params || {};
  const { sport = "nhl" } = params;
  const { theme, colors, isDarkMode, getTeamLogoUrl } = useTheme();

  const teamInput = useMemo(() => resolveTeamInput(params), [params]);

  const [teamData, setTeamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("Team");
  const [headerHeight, setHeaderHeight] = useState(180);
  const [skatersExpanded, setSkatersExpanded] = useState(true);
  const [goaliesExpanded, setGoaliesExpanded] = useState(false);
  const [showPositionPanel, setShowPositionPanel] = useState(false);
  const [showGamesPanel, setShowGamesPanel] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState("ALL");
  const [gamesComparator, setGamesComparator] = useState(">=");
  const [minGamesPlayed, setMinGamesPlayed] = useState(0);

  const scrollY = useRef(new Animated.Value(0)).current;

  const getLogo = useCallback(
    (abbrOrId, dark) => {
      const abbr =
        normalizeAbbr(abbrOrId) || TEAM_ID_TO_ABBR[String(abbrOrId)] || null;
      if (!abbr) return null;
      return getTeamLogoUrl ? getTeamLogoUrl("nhl", abbr, dark) : null;
    },
    [getTeamLogoUrl],
  );

  const loadTeam = useCallback(
    async (isRefresh = false) => {
      if (!teamInput.endpointId) {
        setLoading(false);
        return;
      }

      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const url = `${NHLService.BACKEND_URL}/nhl/team/${encodeURIComponent(teamInput.endpointId)}`;
        const response = await fetch(url, {
          headers: NHLService.getBrowserHeaders?.() || undefined,
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch NHL team: ${response.status}`);
        }
        const json = await response.json();
        const payload = json?.data || json || null;

        const skaters = Array.isArray(payload?.stats?.skaters)
          ? payload.stats.skaters
          : [];
        const goalies = Array.isArray(payload?.stats?.goalies)
          ? payload.stats.goalies
          : [];
        const scheduleGames = Array.isArray(payload?.schedule?.games)
          ? payload.schedule.games
          : [];

        const wins = scheduleGames.filter((g) => {
          const homeScore = toFinite(g?.homeTeam?.score, NaN);
          const awayScore = toFinite(g?.awayTeam?.score, NaN);
          const isHome =
            normalizeAbbr(g?.homeTeam?.abbrev) ===
            normalizeAbbr(payload?.id || teamInput.abbreviation);
          if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore))
            return false;
          return isHome ? homeScore > awayScore : awayScore > homeScore;
        }).length;

        const losses = scheduleGames.filter((g) => {
          const homeScore = toFinite(g?.homeTeam?.score, NaN);
          const awayScore = toFinite(g?.awayTeam?.score, NaN);
          const isHome =
            normalizeAbbr(g?.homeTeam?.abbrev) ===
            normalizeAbbr(payload?.id || teamInput.abbreviation);
          if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore))
            return false;
          return isHome ? homeScore < awayScore : awayScore < homeScore;
        }).length;

        const gf = scheduleGames.reduce((acc, g) => {
          const isHome =
            normalizeAbbr(g?.homeTeam?.abbrev) ===
            normalizeAbbr(payload?.id || teamInput.abbreviation);
          return (
            acc + toFinite(isHome ? g?.homeTeam?.score : g?.awayTeam?.score, 0)
          );
        }, 0);

        const ga = scheduleGames.reduce((acc, g) => {
          const isHome =
            normalizeAbbr(g?.homeTeam?.abbrev) ===
            normalizeAbbr(payload?.id || teamInput.abbreviation);
          return (
            acc + toFinite(isHome ? g?.awayTeam?.score : g?.homeTeam?.score, 0)
          );
        }, 0);

        const leaderPoints = [...skaters]
          .sort((a, b) => toFinite(b?.points) - toFinite(a?.points))
          .slice(0, 3)
          .map((p) => ({
            label: "PTS",
            value: String(toFinite(p?.points)),
            player: `#${p?.playerId || ""}`,
          }));

        const rosterRaw = payload?.roster || {};
        const skaterMap = Object.fromEntries(
          skaters.map((p) => [String(p?.playerId), p]),
        );
        const goalieMap = Object.fromEntries(
          goalies.map((p) => [String(p?.playerId), p]),
        );

        const normalizeRosterGroup = (arr, positionName) =>
          (Array.isArray(arr) ? arr : []).map((p) => {
            const pid = String(p?.playerId || p?.id || "");
            const statSource = skaterMap[pid] || goalieMap[pid] || null;
            const firstName =
              String(p?.firstName?.default || p?.firstName || "").trim() || "";
            const lastName =
              String(p?.lastName?.default || p?.lastName || "").trim() || "";
            const fullName = `${firstName} ${lastName}`.trim();

            return {
              person: {
                id: pid,
                firstName,
                lastName,
                fullName: fullName || p?.name?.default || `#${pid}`,
              },
              position: {
                name: positionName,
                abbreviation: p?.positionCode || positionName,
              },
              jerseyNumber:
                p?.sweaterNumber != null ? String(p.sweaterNumber) : "",
              status: { description: "Active" },
              headshot: String(p?.headshot || "").trim() || null,
              stats: statSource
                ? Object.fromEntries(
                    Object.entries(statSource)
                      .filter(
                        ([k, v]) =>
                          k !== "playerId" &&
                          k !== "positionCode" &&
                          v != null &&
                          Number.isFinite(Number(v)),
                      )
                      .map(([k, v]) => [
                        k,
                        {
                          rawKey: k,
                          numericValue: Number(v),
                          label: toTitleWords(k),
                          value: formatRosterStatValue(k, v),
                        },
                      ]),
                  )
                : {},
            };
          });

        const roster = [
          ...normalizeRosterGroup(rosterRaw?.forwards, "Forward"),
          ...normalizeRosterGroup(rosterRaw?.defensemen, "Defenseman"),
          ...normalizeRosterGroup(rosterRaw?.goalies, "Goalie"),
        ];

        const normalizedGames = scheduleGames.map((g) => {
          const awayAbbr = normalizeAbbr(
            g?.awayTeam?.abbrev || g?.awayTeam?.abbreviation || "AWY",
          );
          const homeAbbr = normalizeAbbr(
            g?.homeTeam?.abbrev || g?.homeTeam?.abbreviation || "HME",
          );
          const state = String(g?.gameState || "").toUpperCase();
          const codedGameState =
            state === "LIVE" || state === "CRIT"
              ? "I"
              : state === "FUT" || state === "PRE"
                ? "S"
                : "F";

          return {
            gamePk: g?.id,
            gameType: g?.gameType,
            gameDate: g?.startTimeUTC || g?.gameDate,
            venue: g?.venue || "",
            status: {
              codedGameState,
              detailedState:
                state === "OFF" || state === "FINAL"
                  ? "Final"
                  : state === "LIVE"
                    ? "Live"
                    : "Scheduled",
            },
            teams: {
              away: {
                score: g?.awayTeam?.score,
                team: {
                  id: awayAbbr,
                  abbreviation: awayAbbr,
                  commonName:
                    g?.awayTeam?.commonName?.default ||
                    g?.awayTeam?.commonName ||
                    g?.awayTeam?.name?.default ||
                    awayAbbr,
                  name: g?.awayTeam?.name?.default || awayAbbr,
                  logo: g?.awayTeam?.logo || null,
                  darkLogo: g?.awayTeam?.darkLogo || null,
                },
              },
              home: {
                score: g?.homeTeam?.score,
                team: {
                  id: homeAbbr,
                  abbreviation: homeAbbr,
                  commonName:
                    g?.homeTeam?.commonName?.default ||
                    g?.homeTeam?.commonName ||
                    g?.homeTeam?.name?.default ||
                    homeAbbr,
                  name: g?.homeTeam?.name?.default || homeAbbr,
                  logo: g?.homeTeam?.logo || null,
                  darkLogo: g?.homeTeam?.darkLogo || null,
                },
              },
            },
          };
        });

        setTeamData({
          team: {
            id: teamInput.id || payload?.id || teamInput.endpointId,
            abbreviation: normalizeAbbr(
              payload?.standings?.teamAbbrev ||
                payload?.id ||
                teamInput.abbreviation ||
                teamInput.endpointId,
            ),
            name:
              payload?.standings?.teamCommonName ||
              teamInput.displayName ||
              route.params?.team?.displayName ||
              normalizeAbbr(payload?.id || teamInput.endpointId) ||
              "NHL Team",
            league: { name: "National Hockey League" },
            division: {
              name: payload?.standings?.divisionName || "",
            },
          },
          standings:
            payload?.standings && typeof payload.standings === "object"
              ? payload.standings
              : null,
          summary: {
            currentSeason: payload?.schedule?.currentSeason || "--",
            gamesPlayed: scheduleGames.length,
            record: `${wins}-${losses}`,
            goalsFor: gf,
            goalsAgainst: ga,
            goalDiff: gf - ga,
          },
          leaders: leaderPoints,
          stats: { skaters, goalies },
          schedule: { dates: [{ games: normalizedGames }] },
          roster,
        });
      } catch (error) {
        console.error("NHL TeamPage load error:", error);
        setTeamData(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [route.params, teamInput],
  );

  useEffect(() => {
    loadTeam(false);
  }, [loadTeam]);

  const team = teamData?.team || null;
  const standings =
    teamData?.standings && typeof teamData.standings === "object"
      ? teamData.standings
      : null;
  const resolvedAbbr = normalizeAbbr(
    team?.abbreviation || teamInput.abbreviation || teamInput.endpointId,
  );
  const teamColor = NHLService.getTeamColor(resolvedAbbr, colors.primary);
  const standingsLogo = (() => {
    const raw = String(standings?.teamLogo || "").trim();
    if (!raw) return null;
    if (isDarkMode) return raw.replace(/_light(\.svg)?$/i, "_dark$1");
    return raw;
  })();
  const teamLogo = standingsLogo || getLogo(resolvedAbbr, isDarkMode);
  const conferenceLabel =
    String(standings?.conferenceAbbrev || "").toUpperCase() === "E"
      ? "Eastern Conference"
      : String(standings?.conferenceAbbrev || "").toUpperCase() === "W"
        ? "Western Conference"
        : team?.league?.name || "National Hockey League";
  const divisionLabel = standings?.divisionName
    ? `${standings.divisionName} Division`
    : team?.division?.name
      ? `${team.division.name} Division`
      : "";
  const clinchIndicator = String(standings?.clinchIndicator || "")
    .trim()
    .toUpperCase();

  const skaters = teamData?.stats?.skaters || [];
  const goalies = teamData?.stats?.goalies || [];

  const rosterIndex = useMemo(() => {
    const index = {};
    for (const player of Array.isArray(teamData?.roster)
      ? teamData.roster
      : []) {
      const pid = String(player?.person?.id || "");
      if (!pid) continue;
      index[pid] = {
        firstName: String(player?.person?.firstName || "").trim(),
        lastName: String(player?.person?.lastName || "").trim(),
        fullName: String(player?.person?.fullName || "").trim(),
        headshot: player?.headshot || null,
        positionCode: String(
          player?.position?.abbreviation || "",
        ).toUpperCase(),
      };
    }
    return index;
  }, [teamData?.roster]);

  const allStatPlayers = useMemo(
    () => [...skaters, ...goalies],
    [skaters, goalies],
  );

  const positionOptions = useMemo(() => {
    const set = new Set(["ALL"]);
    for (const p of allStatPlayers) {
      const pid = String(p?.playerId || "");
      if (!pid || !rosterIndex[pid]) continue;
      const pos = String(
        p?.positionCode || rosterIndex[pid]?.positionCode || "",
      ).toUpperCase();
      if (pos) set.add(pos);
    }
    return [...set];
  }, [allStatPlayers, rosterIndex]);

  const maxGamesPlayed = useMemo(() => {
    let maxGp = 0;
    for (const p of allStatPlayers) {
      const pid = String(p?.playerId || "");
      if (!pid || !rosterIndex[pid]) continue;
      const gp = Number(p?.gamesPlayed);
      if (Number.isFinite(gp) && gp > maxGp) maxGp = gp;
    }
    return Math.max(0, Math.round(maxGp));
  }, [allStatPlayers, rosterIndex]);

  useEffect(() => {
    setMinGamesPlayed((v) => Math.min(v, maxGamesPlayed));
  }, [maxGamesPlayed]);

  const skaterTopCards = useMemo(
    () =>
      buildTopThreeCards(skaters, rosterIndex, {
        position: selectedPosition,
        minGames: minGamesPlayed,
        gamesComparator,
      }),
    [skaters, rosterIndex, selectedPosition, minGamesPlayed, gamesComparator],
  );

  const goalieTopCards = useMemo(
    () =>
      buildTopThreeCards(goalies, rosterIndex, {
        position: selectedPosition,
        minGames: minGamesPlayed,
        gamesComparator,
      }),
    [goalies, rosterIndex, selectedPosition, minGamesPlayed, gamesComparator],
  );

  const hasBaseStats = skaters.length > 0 || goalies.length > 0;

  const statsContent = !hasBaseStats ? (
    <View style={styles.emptyContainer}>
      <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
        No stats available
      </Text>
    </View>
  ) : (
    <View
      style={{
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 24,
        gap: 12,
      }}
    >
      <TopFilters
        theme={theme}
        teamColor={teamColor}
        positionOptions={positionOptions}
        selectedPosition={selectedPosition}
        onSelectPosition={setSelectedPosition}
        showPositionPanel={showPositionPanel}
        setShowPositionPanel={setShowPositionPanel}
        minGames={minGamesPlayed}
        onChangeMinGames={setMinGamesPlayed}
        maxGames={maxGamesPlayed}
        gamesComparator={gamesComparator}
        onChangeComparator={setGamesComparator}
        showGamesPanel={showGamesPanel}
        setShowGamesPanel={setShowGamesPanel}
      />

      {skaterTopCards.length > 0 && (
        <TopThreeSection
          title="Skaters"
          cards={skaterTopCards}
          theme={theme}
          teamColor={teamColor}
          expanded={skatersExpanded}
          onToggle={() => setSkatersExpanded((v) => !v)}
        />
      )}
      {goalieTopCards.length > 0 && (
        <TopThreeSection
          title="Goalies"
          cards={goalieTopCards}
          theme={theme}
          teamColor={teamColor}
          expanded={goaliesExpanded}
          onToggle={() => setGoaliesExpanded((v) => !v)}
        />
      )}

      {skaterTopCards.length === 0 && goalieTopCards.length === 0 && (
        <View style={{ alignItems: "center", paddingVertical: 28 }}>
          <Text style={{ fontSize: 14, color: theme.textSecondary }}>
            No players match current filters
          </Text>
        </View>
      )}
    </View>
  );

  const todayStr = getTodayDateStr();
  const allGamesList = (teamData?.schedule?.dates || []).flatMap(
    (d) => d.games || [],
  );
  const todayGames = allGamesList.filter(
    (g) => gameToLocalDateStr(g.gameDate) === todayStr,
  );
  const pastGames = allGamesList
    .filter((g) => gameToLocalDateStr(g.gameDate) < todayStr)
    .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));
  const upcomingGames = allGamesList
    .filter((g) => gameToLocalDateStr(g.gameDate) > todayStr)
    .sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
  const hasAnyGames =
    todayGames.length + pastGames.length + upcomingGames.length > 0;

  const threshold = Math.max(headerHeight - 40, 80);
  const stickyOpacity = scrollY.interpolate({
    inputRange: [threshold, threshold + 40],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const stickyMiniHeight = scrollY.interpolate({
    inputRange: [threshold, threshold + 40],
    outputRange: [0, 64],
    extrapolate: "clamp",
  });

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={teamColor} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        stickyHeaderIndices={[1]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadTeam(true)}
            tintColor={teamColor}
          />
        }
      >
        <View
          style={[
            styles.header,
            {
              backgroundColor: teamColor + "22",
              borderBottomColor: teamColor,
            },
          ]}
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.headerMain}>
            {teamLogo ? (
              <Image
                cachePolicy="memory-disk"
                source={{ uri: teamLogo }}
                style={styles.headerLogo}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  styles.headerLogoFallback,
                  { backgroundColor: teamColor },
                ]}
              >
                <Text
                  style={[
                    styles.headerLogoFallbackText,
                    { color: getTextOnColor(teamColor) },
                  ]}
                >
                  {(team?.abbreviation || "?").charAt(0)}
                </Text>
              </View>
            )}

            <View style={styles.headerTextBlock}>
              <View style={styles.headerNameRow}>
                <Text
                  allowFontScaling={false}
                  style={[styles.headerName, { color: teamColor }]}
                  numberOfLines={1}
                >
                  {team?.name || "NHL Team"}
                </Text>
                {!!clinchIndicator && (
                  <View
                    style={[
                      styles.clinchBadge,
                      {
                        backgroundColor: teamColor + "22",
                        borderColor: teamColor + "66",
                      },
                    ]}
                  >
                    <Text style={[styles.clinchText, { color: teamColor }]}>
                      {clinchIndicator}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                allowFontScaling={false}
                style={[styles.headerLeague, { color: teamColor + "BB" }]}
                numberOfLines={1}
              >
                {conferenceLabel}
              </Text>
              {!!divisionLabel && (
                <Text
                  allowFontScaling={false}
                  style={[styles.headerDivision, { color: teamColor + "99" }]}
                  numberOfLines={1}
                >
                  {divisionLabel}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={{ backgroundColor: theme.surface }}>
          <Animated.View
            style={{
              height: stickyMiniHeight,
              opacity: stickyOpacity,
              overflow: "hidden",
            }}
          >
            <Svg
              style={StyleSheet.absoluteFill}
              width="100%"
              height={64}
              pointerEvents="none"
            >
              <Defs>
                <SvgLinearGradient
                  id="nhlStickyGrad"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <Stop
                    offset="0%"
                    stopColor={theme.surfaceSecondary}
                    stopOpacity="1"
                  />
                  <Stop
                    offset="55%"
                    stopColor={theme.surfaceSecondary}
                    stopOpacity="1"
                  />
                  <Stop
                    offset="100%"
                    stopColor={teamColor}
                    stopOpacity="0.65"
                  />
                </SvgLinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#nhlStickyGrad)" />
            </Svg>

            <View style={styles.stickyMiniContent}>
              {teamLogo ? (
                <Image
                  cachePolicy="memory-disk"
                  source={{ uri: teamLogo }}
                  style={styles.stickyMiniLogo}
                  resizeMode="contain"
                />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text
                  allowFontScaling={false}
                  style={[styles.stickyMiniName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {team?.name || "NHL Team"}
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.stickyMiniLeague,
                    { color: theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {conferenceLabel}
                </Text>
              </View>
            </View>
          </Animated.View>

          <View style={[styles.tabBar, { borderBottomColor: theme.border }]}>
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={styles.tabBarBtn}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.tabBarText,
                    activeTab === tab
                      ? { color: teamColor, fontWeight: "700" }
                      : { color: theme.textSecondary },
                  ]}
                >
                  {tab}
                </Text>
                {activeTab === tab && (
                  <View
                    style={[
                      styles.tabBarIndicator,
                      { backgroundColor: teamColor },
                    ]}
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.content}>
          {activeTab === "Matches" &&
            (!hasAnyGames ? (
              <View style={styles.emptyContainer}>
                <Text
                  style={[styles.emptyText, { color: theme.textSecondary }]}
                >
                  No matches available
                </Text>
              </View>
            ) : (
              <View style={{ paddingBottom: 8 }}>
                <MatchesSection
                  title="Today"
                  games={todayGames}
                  collapsible={false}
                  navigation={navigation}
                  sport={sport}
                  isDarkMode={isDarkMode}
                  theme={theme}
                  colors={colors}
                  teamColor={teamColor}
                  getLogo={getLogo}
                />
                <MatchesSection
                  title="Last Matches"
                  games={pastGames}
                  collapsible={true}
                  navigation={navigation}
                  sport={sport}
                  isDarkMode={isDarkMode}
                  theme={theme}
                  colors={colors}
                  teamColor={teamColor}
                  getLogo={getLogo}
                />
                <MatchesSection
                  title="Upcoming"
                  games={upcomingGames}
                  collapsible={true}
                  navigation={navigation}
                  sport={sport}
                  isDarkMode={isDarkMode}
                  theme={theme}
                  colors={colors}
                  teamColor={teamColor}
                  getLogo={getLogo}
                />
              </View>
            ))}

          {activeTab === "Team" && (
            <TeamTab teamData={teamData} teamColor={teamColor} theme={theme} />
          )}

          {activeTab === "Stats" && statsContent}

          {activeTab === "Roster" &&
            (() => {
              const roster = teamData?.roster || [];
              if (!roster.length) {
                return (
                  <View style={styles.emptyContainer}>
                    <Text
                      style={[styles.emptyText, { color: theme.textSecondary }]}
                    >
                      No roster available
                    </Text>
                  </View>
                );
              }

              const getPosGroup = (abbr) => {
                const pos = String(abbr || "").toUpperCase();
                if (["C", "L", "LW", "R", "RW", "F"].includes(pos))
                  return "Forwards";
                if (["D", "LD", "RD"].includes(pos)) return "Defensemen";
                if (["G", "GK"].includes(pos)) return "Goalies";
                return "Other";
              };

              const groups = {};
              for (const player of roster) {
                const grp = getPosGroup(player.position?.abbreviation);
                if (!groups[grp]) groups[grp] = [];
                groups[grp].push(player);
              }

              const ordered = [
                "Forwards",
                "Defensemen",
                "Goalies",
                "Other",
              ].filter((k) => Array.isArray(groups[k]) && groups[k].length > 0);

              return (
                <View style={{ paddingBottom: 24 }}>
                  {ordered.map((posType) => (
                    <View key={posType} style={rStyles.posSection}>
                      <View
                        style={[
                          rStyles.posSectionHeader,
                          { backgroundColor: teamColor + "22" },
                        ]}
                      >
                        <Text
                          allowFontScaling={false}
                          style={[
                            rStyles.posSectionTitle,
                            { color: teamColor },
                          ]}
                        >
                          {posType}
                        </Text>
                        <Text
                          allowFontScaling={false}
                          style={[
                            rStyles.posSectionCount,
                            { color: teamColor },
                          ]}
                        >
                          {groups[posType].length}
                        </Text>
                      </View>

                      {groups[posType].map((player, idx) => (
                        <RosterPlayerRow
                          key={player.person?.id || idx}
                          player={player}
                          teamColor={teamColor}
                          theme={theme}
                          navigation={navigation}
                          sport={sport || "nhl"}
                          teamId={teamInput.id || team?.id || teamInput.endpointId}
                        />
                      ))}
                    </View>
                  ))}
                </View>
              );
            })()}
        </View>
      </Animated.ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 2,
  },
  headerMain: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  headerLogo: {
    width: 88,
    height: 68,
    marginRight: 14,
  },
  headerLogoFallback: {
    width: 68,
    height: 68,
    borderRadius: 34,
    marginRight: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  headerLogoFallbackText: { fontSize: 28, fontWeight: "800" },
  headerTextBlock: { flex: 1 },
  headerNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerName: { fontSize: 22, fontWeight: "800", marginBottom: 3 },
  clinchBadge: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 3,
  },
  clinchText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  headerLeague: { fontSize: 13, fontWeight: "600", marginBottom: 2 },
  headerDivision: { fontSize: 12 },
  stickyMiniContent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  stickyMiniLogo: { width: 50, height: 32, marginRight: 10 },
  stickyMiniName: { fontSize: 15, fontWeight: "700" },
  stickyMiniLeague: { fontSize: 11, fontWeight: "500", marginTop: 1 },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBarBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    position: "relative",
  },
  tabBarText: { fontSize: 13 },
  tabBarIndicator: {
    position: "absolute",
    bottom: 0,
    left: 12,
    right: 12,
    height: 2.5,
    borderRadius: 2,
  },
  content: { paddingBottom: 40, paddingTop: 6 },
  emptyContainer: { alignItems: "center", paddingVertical: 56 },
  emptyText: { fontSize: 15 },
  matchCardWrap: {
    marginHorizontal: 12,
    marginTop: 10,
    position: "relative",
    overflow: "visible",
  },
  matchCard: {
    borderRadius: 12,
    overflow: "hidden",
  },
  matchGameBadge: {
    position: "absolute",
    top: -8,
    right: 8,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    zIndex: 2,
  },
  matchGameBadgeText: { fontSize: 10, fontWeight: "700" },
  matchCardInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  matchStatusCol: {
    width: 72,
    alignItems: "center",
  },
  matchDateText: {
    fontSize: 11,
    textAlign: "center",
    marginBottom: 4,
    lineHeight: 15,
  },
  matchStatusText: { fontSize: 12, textAlign: "center" },
  matchTeamsList: { flex: 1 },
  matchTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  matchTeamDivider: { height: StyleSheet.hairlineWidth, marginLeft: 32 },
  matchLogoWrap: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  matchTeamLogo: { width: 40, height: 24 },
  matchTeamLogoFallback: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  matchLogoFallbackText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  matchTeamName: { flex: 1, fontSize: 14 },
  matchScoreText: { fontSize: 16, minWidth: 26, textAlign: "right" },
  matchChevron: { fontSize: 24, lineHeight: 28, paddingLeft: 4 },
});

export default TeamPageScreen;

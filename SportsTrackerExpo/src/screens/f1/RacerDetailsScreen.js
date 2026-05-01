import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Animated,
} from "react-native";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
  Line as SvgLine,
  Path as SvgPath,
  Circle as SvgCircle,
  Text as SvgText,
} from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../context/ThemeContext";
import { useNavigation } from "@react-navigation/native";

const DRIVER_BASE = "https://laraiyeogithubio-production-ed10.up.railway.app";
const CACHE_TTL = 60 * 60 * 1000;
const TABS = ["Main", "Season Stats"];
const MEETINGS_CACHE_KEY = "f1_meetings_cache:v2";

const ST_CHART_H = 180;
const ST_PAD = { top: 24, bottom: 28, left: 28, right: 10 };

const formatColor = (color) => {
  if (!color) return "#888888";
  return color.startsWith("#") ? color : `#${color}`;
};

const normalizeTeamName = (raw) => {
  if (!raw) return raw;
  const s = raw.toLowerCase();
  if (s.includes("red bull")) return "Red Bull";
  if (s.includes("haas")) return "Haas";
  if (s.includes("ferrari")) return "Ferrari";
  if (s.includes("mclaren")) return "McLaren";
  if (s.includes("mercedes")) return "Mercedes";
  if (s.includes("alpine")) return "Alpine";
  if (s.includes("racing bulls")) return "Racing Bulls";
  if (s.includes("audi")) return "Audi";
  if (s.includes("cadillac")) return "Cadillac";
  if (s.includes("williams")) return "Williams";
  if (s.includes("aston")) return "Aston Martin";
  return raw
    .replace(/ F1 Team$/i, "")
    .replace(/ Racing$/i, "")
    .trim();
};

const getConstructorLogo = (constructorName, isDarkMode) => {
  if (!constructorName) return "";
  const nameMap = {
    McLaren: "mclaren",
    Ferrari: "ferrari",
    "Red Bull": "redbullracing",
    Mercedes: "mercedes",
    "Aston Martin": "astonmartin",
    Alpine: "alpine",
    Williams: "williams",
    RB: "rb",
    Haas: "haas",
    Sauber: "kicksauber",
  };
  const blackLogoConstructors = ["Williams", "Alpine", "Mercedes", "Sauber"];
  const logoColor =
    isDarkMode || !blackLogoConstructors.includes(constructorName)
      ? "logowhite"
      : "logoblack";
  const logoName =
    nameMap[constructorName] ||
    constructorName.toLowerCase().replace(/\s+/g, "");
  const currentYear = new Date().getFullYear();
  return `https://media.formula1.com/image/upload/c_fit,h_1080/q_auto/v1740000000/common/f1/${currentYear}/${logoName}/${currentYear}${logoName}${logoColor}.webp`;
};

const getTextOnColor = (hex) => {
  if (!hex) return "#fff";
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#000" : "#fff";
};

const countryColorMap = {
  bahrain: "#CE1126",
  australia: "#012169",
  china: "#DE2910",
  japan: "#FFFFFF",
  "saudi arabia": "#006C35",
  "united states": "#3C3B6E",
  canada: "#FF0000",
  monaco: "#CE1126",
  spain: "#AA151B",
  austria: "#ED2939",
  "united kingdom": "#012169",
  belgium: "#000000",
  hungary: "#CE2939",
  netherlands: "#FF7900",
  italy: "#009246",
  azerbaijan: "#00B5E2",
  singapore: "#EF3340",
  mexico: "#006847",
  brazil: "#009C3B",
  qatar: "#8A1538",
  "united arab emirates": "#00732F",
};

const getCountryColor = (countryName) => {
  if (!countryName) return null;
  const normalized = countryName
    .toString()
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (countryColorMap[normalized]) return countryColorMap[normalized];

  for (const k of Object.keys(countryColorMap)) {
    if (normalized.includes(k)) return countryColorMap[k];
  }

  if (
    normalized === "usa" ||
    normalized === "u.s.a" ||
    normalized.includes("united states")
  )
    return countryColorMap["united states"];
  if (normalized === "uae" || normalized.includes("united arab emirates"))
    return countryColorMap["united arab emirates"];

  return null;
};

const formatDuration = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  const totalSeconds = Number(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const ms = Math.round((totalSeconds - Math.floor(totalSeconds)) * 100);

  const mStr = String(minutes).padStart(2, "0");
  const sStr = String(seconds).padStart(2, "0");
  const msStr = String(ms).padStart(2, "0");

  if (hours > 0) {
    const hStr = String(hours).padStart(2, "0");
    return `${hStr}:${mStr}:${sStr}.${msStr}`;
  }

  // No hours -> show mm:ss.ms
  return `${mStr}:${sStr}.${msStr}`;
};

// Format an ISO date/time string to the user's local device date+time (short)
const formatDateTimeLocal = (iso) => {
  if (!iso) return "--";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "--";
    const datePart = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    const timePart = d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${datePart} ${timePart}`;
  } catch (e) {
    return "--";
  }
};

const StandingsTracker = ({
  championship,
  maps,
  theme,
  accentColor,
  onSelectedChange,
}) => {
  const points = useMemo(() => {
    const champs = (championship || []).map((c, idx) => ({
      pos: Number.isFinite(Number(c.position_current))
        ? Number(c.position_current)
        : null,
      pts: Number.isFinite(Number(c.points_current))
        ? Number(c.points_current)
        : null,
      meeting_key: c.meeting_key,
      session_key: c.session_key,
      // meeting/session names from maps (maps keys are strings but numeric access works too)
      meetingName: (() => {
        const m =
          maps?.meetings?.[c.meeting_key] ||
          maps?.meetings?.[String(c.meeting_key)];
        if (!m) return null;
        return typeof m === "string" ? m : m.name || m.meeting_name || null;
      })(),
      sessionName: (() => {
        const s =
          maps?.sessions?.[c.session_key] ||
          maps?.sessions?.[String(c.session_key)];
        if (!s) return null;
        return typeof s === "string" ? s : s.name || s.session_name || null;
      })(),
    }));

    // count occurrences of meeting_key
    const meetingCounts = champs.reduce((acc, it) => {
      const k = String(it.meeting_key ?? "");
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    return champs
      .map((c, idx) => {
        const k = String(c.meeting_key ?? "");
        const repeated = meetingCounts[k] > 1;
        return {
          pos: c.pos,
          pts: c.pts,
          meeting_key: c.meeting_key,
          session_key: c.session_key,
          meetingName: c.meetingName,
          sessionName: c.sessionName,
          // always keep the round label for the graph (R1, R2...)
          roundLabel: `R${idx + 1}`,
          // label used in the center/selected area (prefer meeting name)
          label: c.meetingName || `R${idx + 1}`,
          // only show meeting/session under R# when the meeting repeats
          showMeeting: repeated,
          sessionLabel: repeated ? c.sessionName || "" : "",
        };
      })
      .filter((p) => p.pos !== null);
  }, [championship, maps]);

  const n = points.length;
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [chartW, setChartW] = useState(300);

  useEffect(() => {
    if (n > 0) setSelectedIdx(n - 1);
  }, [n]);

  if (n === 0) return null;

  const positions = points.map((p) => p.pos);
  let minPos = Math.min(...positions);
  let maxPos = Math.max(...positions);
  if (minPos === maxPos) {
    minPos = Math.max(1, minPos - 1);
    maxPos = maxPos + 1;
  }

  const innerW = Math.max(chartW - ST_PAD.left - ST_PAD.right, 1);
  const innerH = ST_CHART_H - ST_PAD.top - ST_PAD.bottom;

  const xFor = (i) =>
    ST_PAD.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2);
  const yFor = (pos) =>
    ST_PAD.top + ((pos - minPos) / (maxPos - minPos)) * innerH;

  const linePath =
    n > 0
      ? points
          .map(
            (pt, i) =>
              `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(pt.pos).toFixed(1)}`,
          )
          .join(" ")
      : "";

  const selected = points[selectedIdx] ?? null;
  useEffect(() => {
    if (onSelectedChange) {
      onSelectedChange(selected, selectedIdx);
    }
  }, [onSelectedChange, selected, selectedIdx]);

  const badgeCy = selected ? Math.max(yFor(selected.pos) - 14, 12) : 0;

  const tickCount = Math.min(6, maxPos - minPos + 1);
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const v = minPos + ((maxPos - minPos) * i) / (tickCount - 1 || 1);
    return Math.round(v);
  });

  return (
    <View
      style={[
        styles.trackerCard,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={styles.trackerHeaderRow}>
        <Text
          allowFontScaling={false}
          style={[styles.trackerTitle, { color: theme.text }]}
        >
          STANDINGS TRACKER
        </Text>
        {selected && (
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <Text
              allowFontScaling={false}
              style={{ color: accentColor, fontSize: 13, fontWeight: "800" }}
            >
              {selected.pts}
            </Text>
            <Text
              allowFontScaling={false}
              style={{
                color: theme.text,
                fontSize: 11,
                fontWeight: "600",
                marginLeft: 4,
              }}
            >
              POINTS
            </Text>
          </View>
        )}
      </View>

      <View
        onLayout={(e) => setChartW(e.nativeEvent.layout.width)}
        style={{ height: ST_CHART_H, marginHorizontal: 4 }}
      >
        {chartW > 0 && n > 0 && (
          <Svg width={chartW} height={ST_CHART_H}>
            <Defs>
              <SvgLinearGradient
                id="standingsFill"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                <Stop offset="0%" stopColor={accentColor} stopOpacity="0.22" />
                <Stop
                  offset="100%"
                  stopColor={accentColor}
                  stopOpacity="0.22"
                />
              </SvgLinearGradient>
            </Defs>

            <SvgLine
              x1={ST_PAD.left}
              y1={ST_PAD.top - 4}
              x2={ST_PAD.left}
              y2={ST_CHART_H - ST_PAD.bottom}
              stroke={theme.border}
              strokeWidth={1}
            />
            <SvgLine
              x1={ST_PAD.left}
              y1={ST_CHART_H - ST_PAD.bottom}
              x2={chartW - ST_PAD.right}
              y2={ST_CHART_H - ST_PAD.bottom}
              stroke={theme.border}
              strokeWidth={1}
            />

            {ticks.map((v) => (
              <React.Fragment key={`posTick-${v}`}>
                <SvgLine
                  x1={ST_PAD.left}
                  y1={yFor(v)}
                  x2={chartW - ST_PAD.right}
                  y2={yFor(v)}
                  stroke={theme.border}
                  strokeWidth={0.7}
                  strokeDasharray="3,4"
                />
                <SvgText
                  x={ST_PAD.left - 4}
                  y={yFor(v) + 4}
                  textAnchor="end"
                  fontSize={9}
                  fill={theme.textTertiary ?? theme.textSecondary}
                >
                  {v}
                </SvgText>
              </React.Fragment>
            ))}

            <SvgPath
              d={linePath}
              fill="none"
              stroke={accentColor}
              strokeWidth={2}
            />

            {points.map((pt, i) => {
              const isSel = i === selectedIdx;
              return (
                <SvgCircle
                  key={`posPt-${i}`}
                  cx={xFor(i)}
                  cy={yFor(pt.pos)}
                  r={isSel ? 8 : 4.5}
                  fill={isSel ? accentColor : theme.surface}
                  stroke={accentColor}
                  strokeWidth={isSel ? 0 : 1.5}
                  onPress={() => setSelectedIdx(i)}
                />
              );
            })}

            {selected && (
              <React.Fragment>
                <SvgCircle
                  cx={xFor(selectedIdx)}
                  cy={badgeCy}
                  r={11}
                  fill={accentColor}
                />
                <SvgText
                  x={xFor(selectedIdx)}
                  y={badgeCy}
                  dx={-0.5}
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  dominantBaseline="central"
                  fontSize={9}
                  fontWeight="700"
                  fill={getTextOnColor(accentColor)}
                >
                  {`P${selected.pos}`}
                </SvgText>
              </React.Fragment>
            )}

            {points.map((pt, i) => {
              const isFirst = i === 0;
              const isLast = i === n - 1;
              if (!isFirst && !isLast) return null;

              const roundLabel = pt.roundLabel || pt.label;
              const meetingName = pt.showMeeting ? pt.meetingName : null;
              const sessionLabel = pt.sessionLabel;

              return (
                <React.Fragment key={`posLabel-${i}`}>
                  <SvgText
                    x={xFor(i)}
                    y={ST_CHART_H - ST_PAD.bottom + 10}
                    textAnchor={i === 0 ? "start" : "end"}
                    fontSize={9}
                    fontWeight="700"
                    fill={theme.textTertiary ?? theme.textSecondary}
                  >
                    {roundLabel}
                  </SvgText>
                  {meetingName ? (
                    <SvgText
                      x={xFor(i)}
                      y={ST_CHART_H - ST_PAD.bottom + 22}
                      textAnchor={i === 0 ? "start" : "end"}
                      fontSize={8}
                      fill={theme.textSecondary}
                    >
                      {meetingName}
                    </SvgText>
                  ) : null}
                  {sessionLabel ? (
                    <SvgText
                      x={xFor(i)}
                      y={ST_CHART_H - ST_PAD.bottom + 32}
                      textAnchor={i === 0 ? "start" : "end"}
                      fontSize={8}
                      fill={theme.textSecondary}
                    >
                      {sessionLabel}
                    </SvgText>
                  ) : null}
                </React.Fragment>
              );
            })}
          </Svg>
        )}
      </View>

      <View style={[styles.trackerNavRow, { borderTopColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => setSelectedIdx((v) => Math.max(0, v - 1))}
          disabled={selectedIdx === 0}
          style={styles.trackerNavBtn}
          activeOpacity={0.6}
        >
          <Text
            style={{
              color: selectedIdx === 0 ? theme.border : theme.text,
              fontSize: 34,
              lineHeight: 40,
            }}
          >
            ‹
          </Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <View style={{ alignItems: "center" }}>
            <Text
              allowFontScaling={false}
              style={[styles.trackerNavText, { color: theme.text }]}
            >
              {selected.meetingName}
            </Text>
            {selected && selected.sessionLabel ? (
              <Text
                allowFontScaling={false}
                style={{
                  color: theme.textSecondary,
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                {selected.sessionLabel}
              </Text>
            ) : null}
          </View>
        </View>
        <TouchableOpacity
          onPress={() => setSelectedIdx((v) => Math.min(n - 1, v + 1))}
          disabled={selectedIdx === n - 1}
          style={styles.trackerNavBtn}
          activeOpacity={0.6}
        >
          <Text
            style={{
              color: selectedIdx === n - 1 ? theme.border : theme.text,
              fontSize: 34,
              lineHeight: 40,
            }}
          >
            ›
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const RacerDetailsScreen = ({ route }) => {
  const { theme, colors, isDarkMode } = useTheme();
  const navigation = useNavigation();
  const driverNumber =
    route?.params?.racerId ?? route?.params?.driverNumber ?? null;
  const driverName =
    route?.params?.racerName ?? route?.params?.driverName ?? "";

  const [activeTab, setActiveTab] = useState("Main");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [driverData, setDriverData] = useState(null);
  const [headerHeight, setHeaderHeight] = useState(160);
  const [meetingsCache, setMeetingsCache] = useState([]);
  const [selectedPoint, setSelectedPoint] = useState(null);

  const scrollY = useRef(new Animated.Value(0)).current;

  const cacheKey = driverNumber ? `f1:driver:${driverNumber}` : null;

  const load = useCallback(
    async (isRefresh = false) => {
      if (!driverNumber) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        if (!isRefresh && cacheKey) {
          const raw = await AsyncStorage.getItem(cacheKey);
          if (raw) {
            const cached = JSON.parse(raw);
            if (cached?.ts && Date.now() - cached.ts < CACHE_TTL) {
              setDriverData(cached.data);
              setLoading(false);
              return;
            }
          }
        }

        const resp = await fetch(`${DRIVER_BASE}/driver/${driverNumber}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const payload = await resp.json();
        const data = payload?.data ?? payload;
        setDriverData(data);
        if (cacheKey) {
          await AsyncStorage.setItem(
            cacheKey,
            JSON.stringify({ ts: Date.now(), data }),
          );
        }
      } catch (err) {
        console.warn("[RacerDetailsScreen] Failed to load driver", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [cacheKey, driverNumber],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    const loadMeetingsCache = async () => {
      try {
        const cached = await AsyncStorage.getItem(MEETINGS_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          const data = Array.isArray(parsed?.data)
            ? parsed.data
            : Array.isArray(parsed)
              ? parsed
              : [];
          setMeetingsCache(data);
        }
      } catch (err) {
        console.warn("[RacerDetailsScreen] Failed to read meetings cache", err);
      }
    };

    loadMeetingsCache();
  }, []);

  const driver = driverData?.driver ?? null;
  const championship = driverData?.championship ?? [];
  const sessionResults = driverData?.session_result ?? [];
  const accentColor = formatColor(driver?.team_colour ?? colors.primary);
  const teamName = normalizeTeamName(driver?.team_name ?? "");
  const teamLogoUrl = teamName
    ? getConstructorLogo(teamName, isDarkMode)
    : null;

  const selectedMeeting = useMemo(() => {
    const key = selectedPoint?.meeting_key;
    if (!key) return null;
    return meetingsCache.find(
      (m) => String(m.meeting_key ?? m.meetingKey ?? m.id) === String(key),
    );
  }, [meetingsCache, selectedPoint]);

  const selectedCountryColor =
    getCountryColor(
      selectedMeeting?.country_name || selectedMeeting?.countryName,
    ) || accentColor;

  const selectedMeetingSessions = useMemo(() => {
    if (!selectedPoint?.meeting_key) return [];
    const key = String(selectedPoint.meeting_key);
    return sessionResults.filter(
      (s) => String(s.meeting_key ?? s.meetingKey) === key,
    );
  }, [selectedPoint, sessionResults]);

  const initials = useMemo(() => {
    const first = driver?.first_name?.[0] ?? "";
    const last = driver?.last_name?.[0] ?? "";
    return (
      (first + last).toUpperCase() ||
      driverName?.slice(0, 2).toUpperCase() ||
      "--"
    );
  }, [driver?.first_name, driver?.last_name, driverName]);

  // Season stats computations
  const seasonStats = useMemo(() => {
    const lastChamp =
      championship && championship.length
        ? championship[championship.length - 1]
        : null;
    const points = lastChamp
      ? (lastChamp.points_current ?? lastChamp.points ?? 0)
      : 0;
    const place = lastChamp
      ? (lastChamp.position_current ?? lastChamp.position ?? null)
      : null;

    const results = Array.isArray(sessionResults) ? sessionResults : [];
    const mapsSessions = driverData?.maps?.sessions || {};
    const sessionLabelFor = (skey) =>
      mapsSessions?.[skey] || mapsSessions?.[String(skey)] || "";
    const isRaceSession = (s) => {
      const lbl = (sessionLabelFor(s) || "").toString().toLowerCase();
      return lbl.includes("race");
    };

    let wins = 0;
    let podiums = 0;
    let dnCount = 0;
    const startVals = [];

    results.forEach((r) => {
      const pos = Number.isFinite(Number(r.position))
        ? Number(r.position)
        : null;
      if (pos === 1 && isRaceSession(r.session_key)) wins++;
      if (pos !== null && pos <= 3 && isRaceSession(r.session_key)) podiums++;

      // starting grid detection (try common fields)
      const gridCandidates = [
        r.starting_grid,
        r.grid,
        r.grid_position,
        r.starting_position,
        r.start_position,
      ];
      for (const g of gridCandidates) {
        if (
          g !== null &&
          g !== undefined &&
          g !== "" &&
          !Number.isNaN(Number(g))
        ) {
          startVals.push(Number(g));
          break;
        }
      }

      const status = (r.status || "").toString().toLowerCase();
      if (
        r.dnf ||
        r.dns ||
        r.dsq ||
        status.includes("dnf") ||
        status.includes("dns") ||
        status.includes("dsq")
      ) {
        dnCount++;
      }
    });

    // include starting_grid array if present (prefer explicit starting grid data)
    const sg = Array.isArray(driverData?.starting_grid)
      ? driverData.starting_grid
      : [];
    if (sg.length) {
      sg.forEach((g) => {
        const p = g.position ?? g.pos ?? g.position_current ?? null;
        if (p !== null && p !== undefined && !Number.isNaN(Number(p))) {
          startVals.push(Number(p));
        }
      });
    }

    const avgStart = startVals.length
      ? startVals.reduce((a, b) => a + b, 0) / startVals.length
      : null;

    return {
      points,
      place,
      wins,
      podiums,
      avgStart: avgStart ? Number(avgStart.toFixed(2)) : null,
      avgStartCount: startVals.length,
      dnCount,
    };
  }, [championship, sessionResults, driverData]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const threshold = Math.max(headerHeight - 40, 80);
  const stickyOpacity = scrollY.interpolate({
    inputRange: [threshold, threshold + 40],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const stickyMiniHeight = scrollY.interpolate({
    inputRange: [threshold, threshold + 40],
    outputRange: [0, 60],
    extrapolate: "clamp",
  });

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
            onRefresh={() => load(true)}
            tintColor={accentColor}
          />
        }
      >
        <View
          style={[
            styles.header,
            {
              backgroundColor: `${accentColor}22`,
              borderBottomColor: accentColor,
            },
          ]}
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.headerMain}>
            <View
              style={[
                styles.headerHeadshotWrap,
                { backgroundColor: `${accentColor}30` },
              ]}
            >
              {driver?.headshot_url ? (
                <Image
                  source={{ uri: driver.headshot_url }}
                  style={styles.headerHeadshot}
                />
              ) : (
                <Text
                  style={[
                    styles.headerInitials,
                    { color: getTextOnColor(accentColor) },
                  ]}
                >
                  {initials}
                </Text>
              )}
            </View>
            <View style={styles.headerTextBlock}>
              <Text
                style={[styles.headerName, { color: theme.text }]}
                numberOfLines={1}
              >
                {driver?.full_name ?? driverName ?? `#${driverNumber ?? ""}`}
              </Text>
              <Text
                style={[styles.headerTeam, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {driver?.team_name ?? "Team"}
              </Text>
            </View>
            {teamLogoUrl ? (
              <Image
                source={{ uri: teamLogoUrl }}
                style={styles.headerTeamBadge}
                resizeMode="contain"
              />
            ) : null}
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
              height={60}
              pointerEvents="none"
            >
              <Defs>
                <SvgLinearGradient
                  id="f1MiniGrad"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <Stop
                    offset="0%"
                    stopColor={theme.surfaceSecondary ?? theme.surface}
                    stopOpacity="1"
                  />
                  <Stop
                    offset="55%"
                    stopColor={theme.surfaceSecondary ?? theme.surface}
                    stopOpacity="1"
                  />
                  <Stop
                    offset="100%"
                    stopColor={accentColor}
                    stopOpacity="0.65"
                  />
                </SvgLinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#f1MiniGrad)" />
            </Svg>
            <View style={styles.stickyMiniContent}>
              <View
                style={[
                  styles.stickyMiniHeadshotWrap,
                  { backgroundColor: `${accentColor}30` },
                ]}
              >
                {driver?.headshot_url ? (
                  <Image
                    source={{ uri: driver.headshot_url }}
                    style={styles.stickyMiniHeadshot}
                  />
                ) : (
                  <Text
                    style={[
                      styles.stickyMiniInitials,
                      { color: getTextOnColor(accentColor) },
                    ]}
                  >
                    {initials}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.stickyMiniName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {driver?.full_name ?? driverName ?? `#${driverNumber ?? ""}`}
                </Text>
                <Text
                  style={[
                    styles.stickyMiniTeam,
                    { color: theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {driver?.team_name ?? "Team"}
                </Text>
              </View>
            </View>
          </Animated.View>

          <View style={[styles.tabBar, { borderBottomColor: theme.border }]}>
            <View style={styles.tabBarContent}>
              {TABS.map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    style={styles.tabBarBtn}
                    onPress={() => setActiveTab(tab)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.tabBarText,
                        { color: isActive ? accentColor : theme.textSecondary },
                      ]}
                    >
                      {tab}
                    </Text>
                    {isActive ? (
                      <View
                        style={[
                          styles.tabBarIndicator,
                          { backgroundColor: accentColor },
                        ]}
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        <View style={{ paddingBottom: 28 }}>
          <View style={{ display: activeTab === "Main" ? "flex" : "none" }}>
            <StandingsTracker
              championship={championship}
              maps={driverData?.maps}
              theme={theme}
              accentColor={accentColor}
              onSelectedChange={setSelectedPoint}
            />

            {selectedMeeting ? (
              <View
                style={[
                  styles.raceCard,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <Svg
                  style={StyleSheet.absoluteFill}
                  width="100%"
                  height="100%"
                  pointerEvents="none"
                >
                  <Defs>
                    <SvgLinearGradient
                      id="raceGrad"
                      x1="0%"
                      y1="0%"
                      x2="0%"
                      y2="100%"
                    >
                      <Stop
                        offset="0%"
                        stopColor={selectedCountryColor}
                        stopOpacity="0.35"
                      />
                      <Stop
                        offset="100%"
                        stopColor={selectedCountryColor}
                        stopOpacity="0"
                      />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill="url(#raceGrad)" />
                </Svg>

                <View style={styles.raceHeader}>
                  <Text
                    allowFontScaling={false}
                    style={[styles.raceTitle, { color: theme.text }]}
                    numberOfLines={2}
                  >
                    {selectedMeeting.meeting_official_name ||
                      selectedMeeting.meeting_name ||
                      selectedMeeting.meetingName ||
                      selectedMeeting.name ||
                      selectedPoint?.meetingName ||
                      "Race"}
                  </Text>
                  <View style={styles.raceMetaRow}>
                    {selectedMeeting.country_flag ? (
                      <Image
                        source={{ uri: selectedMeeting.country_flag }}
                        style={styles.raceFlag}
                      />
                    ) : null}
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.raceMetaText,
                        { color: theme.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {selectedMeeting.location ||
                        selectedMeeting.location_name ||
                        ""}
                      {selectedMeeting.country_code
                        ? `, ${selectedMeeting.country_code}`
                        : ""}
                    </Text>
                  </View>
                </View>

                <View
                  style={[styles.raceDivider, { borderTopColor: theme.border }]}
                />

                {selectedMeetingSessions.map((s, idx) => {
                  // maps.sessions entries may be either a string (name) or an object { name, date_start, date_end }
                  const sessEntry =
                    driverData?.maps?.sessions?.[s.session_key] ||
                    driverData?.maps?.sessions?.[String(s.session_key)] ||
                    null;
                  const sessionName =
                    typeof sessEntry === "string"
                      ? sessEntry
                      : sessEntry?.name ||
                        sessEntry?.session_name ||
                        s.session_name ||
                        "Session";
                  const sessionDateStart =
                    sessEntry && typeof sessEntry === "object"
                      ? sessEntry.date_start || sessEntry.dateStart || null
                      : s.date_start || s.dateStart || null;

                  const hasMultiDuration = Array.isArray(s.duration);
                  const statusText = s.dnf
                    ? "DNF"
                    : s.dns
                      ? "DNS"
                      : s.dsq
                        ? "DSQ"
                        : null;

                  return (
                    <React.Fragment key={`${s.session_key || idx}`}>
                      {idx !== 0 ? (
                        <View
                          style={[
                            styles.sectionDivider,
                            { borderTopColor: theme.border },
                          ]}
                        />
                      ) : null}
                      <TouchableOpacity
                        activeOpacity={0.75}
                        onPress={() =>
                          navigation.navigate("F1RaceDetails", {
                            meetingKey:
                              s.meeting_key ||
                              s.meetingKey ||
                              selectedPoint?.meeting_key,
                            sport: "f1",
                          })
                        }
                      >
                        <View style={styles.raceSessionRow}>
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <Text
                              allowFontScaling={false}
                              style={[
                                styles.raceSessionName,
                                { color: theme.text, flex: 1 },
                              ]}
                              numberOfLines={1}
                            >
                              {sessionName}
                            </Text>

                            <Text
                              allowFontScaling={false}
                              style={{
                                color: theme.textSecondary,
                                fontSize: 12,
                                marginLeft: 8,
                                marginTop: -8,
                              }}
                            >
                              {formatDateTimeLocal(sessionDateStart)}
                            </Text>
                          </View>

                          <View style={styles.raceMetrics}>
                            {hasMultiDuration ? (
                              <>
                                <View style={styles.raceMetricsRow}>
                                  {[0, 1, 2].map((i) => {
                                    const val = s.duration?.[i];
                                    const out =
                                      val === null || val === undefined;
                                    return (
                                      <View
                                        key={`qual-${i}`}
                                        style={styles.raceMetricCell}
                                      >
                                        <Text
                                          allowFontScaling={false}
                                          style={[
                                            styles.raceMetricLabel,
                                            { color: theme.textSecondary },
                                          ]}
                                        >
                                          {`QUAL ${i + 1}`}
                                        </Text>
                                        <Text
                                          allowFontScaling={false}
                                          style={[
                                            styles.raceMetricValue,
                                            {
                                              color: out
                                                ? theme.error
                                                : theme.text,
                                            },
                                          ]}
                                        >
                                          {out ? "OUT" : formatDuration(val)}
                                        </Text>
                                      </View>
                                    );
                                  })}
                                </View>
                                <View style={styles.raceMetricsRow}>
                                  <View
                                    style={[styles.raceMetricCell, { flex: 1 }]}
                                  >
                                    <Text
                                      allowFontScaling={false}
                                      style={[
                                        styles.raceMetricLabel,
                                        { color: theme.textSecondary },
                                      ]}
                                    >
                                      LAPS
                                    </Text>
                                    <Text
                                      allowFontScaling={false}
                                      style={[
                                        styles.raceMetricValue,
                                        { color: theme.text },
                                      ]}
                                    >
                                      {s.number_of_laps ?? "--"}
                                    </Text>
                                  </View>
                                  <View
                                    style={[styles.raceMetricCell, { flex: 1 }]}
                                  >
                                    <Text
                                      allowFontScaling={false}
                                      style={[
                                        styles.raceMetricLabel,
                                        { color: theme.textSecondary },
                                      ]}
                                    >
                                      PLACE
                                    </Text>
                                    <Text
                                      allowFontScaling={false}
                                      style={[
                                        styles.raceMetricValue,
                                        { color: theme.text },
                                      ]}
                                    >
                                      {s.position ?? "--"}
                                    </Text>
                                  </View>
                                </View>
                              </>
                            ) : (
                              <View style={styles.raceMetricsRow}>
                                <View
                                  style={[styles.raceMetricCell, { flex: 1 }]}
                                >
                                  <Text
                                    allowFontScaling={false}
                                    style={[
                                      styles.raceMetricLabel,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    LAPS
                                  </Text>
                                  <Text
                                    allowFontScaling={false}
                                    style={[
                                      styles.raceMetricValue,
                                      { color: theme.text },
                                    ]}
                                  >
                                    {s.number_of_laps ?? "--"}
                                  </Text>
                                </View>
                                <View
                                  style={[styles.raceMetricCell, { flex: 1 }]}
                                >
                                  <Text
                                    allowFontScaling={false}
                                    style={[
                                      styles.raceMetricLabel,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    TIME
                                  </Text>
                                  <Text
                                    allowFontScaling={false}
                                    style={[
                                      styles.raceMetricValue,
                                      {
                                        color: statusText
                                          ? theme.error
                                          : theme.text,
                                      },
                                    ]}
                                  >
                                    {statusText
                                      ? statusText
                                      : formatDuration(s.duration)}
                                  </Text>
                                </View>
                                <View
                                  style={[styles.raceMetricCell, { flex: 1 }]}
                                >
                                  <Text
                                    allowFontScaling={false}
                                    style={[
                                      styles.raceMetricLabel,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    PLACE
                                  </Text>
                                  <Text
                                    allowFontScaling={false}
                                    style={[
                                      styles.raceMetricValue,
                                      { color: theme.text },
                                    ]}
                                  >
                                    {s.position ?? "--"}
                                  </Text>
                                </View>
                              </View>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    </React.Fragment>
                  );
                })}
              </View>
            ) : null}
          </View>

          <View
            style={{ display: activeTab === "Season Stats" ? "flex" : "none" }}
          >
            <View style={{ paddingHorizontal: 12, paddingBottom: 28 }}>
              <View style={styles.seasonGridContainer}>
                <View
                  style={[
                    styles.seasonBubble,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.bubbleLabel, { color: theme.textSecondary }]}
                  >
                    POINTS
                  </Text>
                  <Text style={[styles.bubbleValue, { color: accentColor }]}>
                    {seasonStats.points}
                  </Text>
                </View>
                <View
                  style={[
                    styles.seasonBubble,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.bubbleLabel, { color: theme.textSecondary }]}
                  >
                    PLACE
                  </Text>
                  <Text style={[styles.bubbleValue, { color: theme.text }]}>
                    {seasonStats.place ?? "--"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.seasonBubble,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.bubbleLabel, { color: theme.textSecondary }]}
                  >
                    WINS
                  </Text>
                  <Text style={[styles.bubbleValue, { color: theme.text }]}>
                    {seasonStats.wins}
                  </Text>
                </View>
                <View
                  style={[
                    styles.seasonBubble,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.bubbleLabel, { color: theme.textSecondary }]}
                  >
                    PODIUM
                  </Text>
                  <Text style={[styles.bubbleValue, { color: theme.text }]}>
                    {seasonStats.podiums}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.seasonStatRow,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <Text
                  style={[
                    styles.seasonStatLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  Average Starting Grid
                </Text>
                <Text style={[styles.seasonStatValue, { color: theme.text }]}>
                  {seasonStats.avgStart !== null
                    ? `${seasonStats.avgStart} (${seasonStats.avgStartCount})`
                    : "--"}
                </Text>
              </View>

              <View
                style={[
                  styles.seasonStatRow,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <Text
                  style={[
                    styles.seasonStatLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  DNF / DNS / DSQ
                </Text>
                <Text style={[styles.seasonStatValue, { color: theme.error }]}>
                  {seasonStats.dnCount}
                </Text>
              </View>
            </View>
          </View>

          {!(activeTab === "Main" || activeTab === "Season Stats") ? (
            <View style={styles.placeholderWrap}>
              <Text
                style={[styles.placeholderText, { color: theme.textSecondary }]}
              >
                {activeTab} content coming soon.
              </Text>
            </View>
          ) : null}
        </View>
      </Animated.ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 2,
  },
  headerMain: { flexDirection: "row", alignItems: "center" },
  headerHeadshotWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginRight: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerHeadshot: { width: 72, height: 72, borderRadius: 36 },
  headerInitials: { fontSize: 26, fontWeight: "800" },
  headerTextBlock: { flex: 1 },
  headerName: { fontSize: 22, fontWeight: "800", marginBottom: 3 },
  headerTeam: { fontSize: 13, fontWeight: "600" },
  headerTeamBadge: {
    width: 44,
    height: 44,
    marginLeft: 10,
    opacity: 0.85,
  },
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
  stickyMiniHeadshotWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  stickyMiniHeadshot: { width: 50, height: 50, borderRadius: 25 },
  stickyMiniInitials: { fontSize: 13, fontWeight: "800" },
  stickyMiniName: { fontSize: 15, fontWeight: "700" },
  stickyMiniTeam: { fontSize: 11, fontWeight: "500", marginTop: 1 },
  tabBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBarContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 6,
  },
  tabBarBtn: {
    alignItems: "center",
    paddingVertical: 11,
    flex: 1,
    position: "relative",
  },
  tabBarText: { fontSize: 15, fontWeight: "600" },
  tabBarIndicator: {
    position: "absolute",
    bottom: 0,
    left: 12,
    right: 12,
    height: 2.5,
    borderRadius: 2,
  },
  trackerCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  trackerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  trackerTitle: { fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
  trackerNavRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  trackerNavBtn: {
    width: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  trackerNavText: { fontSize: 16, fontWeight: "700" },
  raceCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  raceHeader: {
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 10,
    alignItems: "center",
  },
  raceTitle: {
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  raceMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  raceFlag: {
    width: 25,
    height: 14,
    resizeMode: "contain",
    borderRadius: 2,
    backgroundColor: "#fff",
  },
  raceMetaText: {
    fontSize: 12,
    fontWeight: "600",
  },
  raceDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 12,
  },
  sectionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 22,
    marginTop: 6,
  },
  raceSessionRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  raceSessionName: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  raceMetrics: {
    gap: 8,
  },
  raceMetricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  raceMetricCell: {
    flex: 1,
    alignItems: "center",
  },
  raceMetricLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  raceMetricValue: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  placeholderWrap: {
    paddingVertical: 40,
    alignItems: "center",
  },
  placeholderText: { fontSize: 14, fontWeight: "600" },
  seasonGridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 12,
  },
  seasonBubble: {
    width: "48%",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 18,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  bubbleLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  bubbleValue: {
    fontSize: 22,
    fontWeight: "900",
  },
  seasonStatRow: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  seasonStatLabel: { fontSize: 13, fontWeight: "700" },
  seasonStatValue: { fontSize: 14, fontWeight: "800" },
});

export default RacerDetailsScreen;

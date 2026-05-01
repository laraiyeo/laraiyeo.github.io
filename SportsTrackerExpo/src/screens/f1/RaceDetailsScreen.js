import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Path,
  G,
} from "react-native-svg";
import { useRoute } from "@react-navigation/native";
import { useGamePresence } from "../../hooks/useGamePresence";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";

const SERVER_BASE = "https://laraiyeogithubio-production-ed10.up.railway.app";
const { width } = Dimensions.get("window");

const BASE_TABS = ["Main", "Drivers", "Events", "Stints", "Grid"];

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

// Team color map (used for headshot background/border)
const TEAM_COLORS = {
  Mercedes: "#00D7B6",
  "Red Bull": "#4781D7",
  Ferrari: "#ED1131",
  McLaren: "#F47600",
  Alpine: "#00A1E8",
  "Racing Bulls": "#6C98FF",
  "Aston Martin": "#229971",
  Williams: "#1878D8",
  Sauber: "#52E252",
  Haas: "#9C9FA2",
  Audi: "#F50537",
  Cadillac: "#909090",
};

// Drivers grouped by team (source canonical mapping)
const DRIVERS_BY_TEAM = {
  McLaren: { 1: "Lando NORRIS", 81: "Oscar PIASTRI" },
  "Red Bull Racing": { 3: "Max VERSTAPPEN", 6: "Isack HADJAR" },
  Audi: { 5: "Gabriel BORTOLETO", 27: "Nico HULKENBERG" },
  Alpine: { 10: "Pierre GASLY", 43: "Franco COLAPINTO" },
  Cadillac: { 11: "Sergio PEREZ", 77: "Valtteri BOTTAS" },
  Mercedes: { 12: "Kimi ANTONELLI", 63: "George RUSSELL" },
  "Aston Martin": {
    14: "Fernando ALONSO",
    18: "Lance STROLL",
    34: "Jak CRAWFORD",
  },
  Ferrari: { 16: "Charles LECLERC", 44: "Lewis HAMILTON" },
  Williams: { 23: "Alexander ALBON", 55: "Carlos SAINZ" },
  "Racing Bulls": { 30: "Liam LAWSON", 41: "Arvid LINDBLAD" },
  "Haas F1 Team": { 31: "Esteban OCON", 87: "Oliver BEARMAN" },
};

// Flatten driver number -> team name map for quick lookup
const DRIVER_TO_TEAM = {};
Object.keys(DRIVERS_BY_TEAM).forEach((team) => {
  const drivers = DRIVERS_BY_TEAM[team] || {};
  Object.keys(drivers).forEach((num) => {
    DRIVER_TO_TEAM[String(num)] = team;
  });
});

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
  if (normalized === "usa" || normalized.includes("united states")) {
    return countryColorMap["united states"];
  }
  if (normalized === "uae" || normalized.includes("united arab emirates")) {
    return countryColorMap["united arab emirates"];
  }
  return null;
};

// Per-circuit transform map. Keys are `circuit_key` from meeting data.
// Values may include `scale`, `rotate` (degrees), and optional `translateX`, `translateY` (pixels).
const circuitTransforms = {
  2: { scale: 1.5, rotate: -90 },
  4: { scale: 1.3, rotate: 40, translateX: -30, translateY: 2 },
  7: { scale: 1.5, rotate: 90 },
  10: { scale: 1.4, rotate: 43.5, translateX: -14, translateY: 2 },
  14: { scale: 1.5, rotate: -75 },
  15: { scale: 1.4, rotate: -57.5, translateX: 4, translateY: 2 },
  22: { scale: 1.4, rotate: -30, translateX: 0, translateY: 0 },
  23: { scale: 1.5, rotate: -127.5 },
  39: { scale: 1.35, rotate: 95 },
  46: { scale: 0.95, rotate: -130 },
  49: { scale: 1.3, rotate: -122.5, translateX: 20, translateY: 40 },
  63: { scale: 1.4, rotate: 92 },
  65: { scale: 1.1, rotate: 30, translateX: 0, translateY: -40 },
  70: { scale: 1.6, rotate: -90 },
  149: { scale: 1.7, rotate: -70 },
  150: { scale: 1.5, rotate: 60.5 },
  152: { scale: 1.5, rotate: -90 },
};

const buildCircuitTransform = (circuitKey, w, h) => {
  const cfg = circuitTransforms?.[Number(circuitKey)];
  if (!cfg) return null;
  const cx = (w || 0) / 2;
  const cy = (h || 0) / 2;
  const parts = [];
  // translate to center
  parts.push(`translate(${cx} ${cy})`);
  // apply rotation about center if specified
  if (typeof cfg.rotate === "number") {
    parts.push(`rotate(${cfg.rotate})`);
  }
  // apply scale if specified
  if (typeof cfg.scale === "number") {
    parts.push(`scale(${cfg.scale} ${cfg.scale})`);
  }
  // translate back
  parts.push(`translate(${-cx} ${-cy})`);
  // optional pixel translation
  if (
    typeof cfg.translateX === "number" ||
    typeof cfg.translateY === "number"
  ) {
    const tx = cfg.translateX || 0;
    const ty = cfg.translateY || 0;
    parts.push(`translate(${tx} ${ty})`);
  }
  return parts.join(" ");
};

const mapSessionNameToAbbrev = (name) => {
  if (!name) return "S";
  const n = name.toString().toLowerCase();
  const pMatch = n.match(/practice\s*(\d+)/i);
  if (pMatch) return `P${pMatch[1]}`;
  if (n.includes("sprint qualifying")) return "SQ";
  if (n.includes("sprint")) return "S";
  if (n.includes("qualifying")) return "Q";
  if (n.includes("race")) return "R";
  // fallback: initials of words
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 3);
};

const isSessionLive = (session) => {
  if (!session) return false;
  try {
    const start = new Date(session.date_start).getTime();
    const end = new Date(session.date_end).getTime();
    const now = Date.now();
    return start <= now && now <= end;
  } catch (e) {
    return false;
  }
};

const findDriverInMaps = (maps, driverNumber) => {
  if (!maps || driverNumber === null || driverNumber === undefined) return null;
  const key = String(driverNumber);

  // maps.drivers may be an object keyed by driver number
  if (
    maps.drivers &&
    typeof maps.drivers === "object" &&
    !Array.isArray(maps.drivers)
  ) {
    if (maps.drivers[key]) return maps.drivers[key];
    if (maps.drivers[Number(key)]) return maps.drivers[Number(key)];
    for (const k of Object.keys(maps.drivers)) {
      const v = maps.drivers[k];
      if (v?.driver_number == driverNumber || v?.number == driverNumber)
        return v;
    }
  }

  // arrays
  if (Array.isArray(maps.drivers)) {
    const d = maps.drivers.find(
      (x) =>
        x?.driver_number == driverNumber ||
        x?.number == driverNumber ||
        String(x?.driver_key) === key,
    );
    if (d) return d;
  }

  // common keyed maps
  if (
    maps.drivers_by_number &&
    (maps.drivers_by_number[key] || maps.drivers_by_number[Number(key)])
  ) {
    return maps.drivers_by_number[key] || maps.drivers_by_number[Number(key)];
  }
  if (
    maps.drivers_by_id &&
    (maps.drivers_by_id[key] || maps.drivers_by_id[Number(key)])
  ) {
    return maps.drivers_by_id[key] || maps.drivers_by_id[Number(key)];
  }
  if (
    maps.drivers_map &&
    (maps.drivers_map[key] || maps.drivers_map[Number(key)])
  ) {
    return maps.drivers_map[key] || maps.drivers_map[Number(key)];
  }

  // scan generic maps for a matching driver number
  for (const containerKey of Object.keys(maps)) {
    const container = maps[containerKey];
    if (!container) continue;
    if (Array.isArray(container)) {
      const found = container.find(
        (x) =>
          x?.driver_number == driverNumber ||
          x?.number == driverNumber ||
          String(x?.driver_key) === key,
      );
      if (found) return found;
    } else if (typeof container === "object") {
      if (container[key]) return container[key];
      for (const k of Object.keys(container)) {
        const v = container[k];
        if (
          v?.driver_number == driverNumber ||
          v?.number == driverNumber ||
          String(v?.driver_key) === key
        )
          return v;
      }
    }
  }

  // fallback: try maps.participants array
  if (Array.isArray(maps.participants)) {
    const p = maps.participants.find(
      (x) =>
        x?.number == driverNumber ||
        x?.driver_number == driverNumber ||
        String(x?.driver_key) === key,
    );
    if (p) return p;
  }

  return null;
};

function degToCompass(deg) {
  const directions = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  const index = Math.floor(deg / 22.5 + 0.5) % 16;
  return directions[index];
}

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

const formatLapTime = (t) => {
  if (t == null) return "";
  // t expected in seconds (may be float)
  const totalMs = Math.round(Number(t) * 1000);
  if (Number.isNaN(totalMs)) return String(t);
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const hundredths = Math.floor((totalMs % 1000) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
};

const tryFormatIsoToLocal = (val) => {
  if (!val && val !== 0) return null;

  let d = null;

  if (typeof val === "number") {
    if (val < 1e12) d = new Date(val * 1000);
    else d = new Date(val);
  } else if (typeof val === "string") {
    const maybe = Date.parse(val);
    if (!Number.isNaN(maybe)) d = new Date(maybe);
  }

  if (!d || Number.isNaN(d.getTime())) return null;

  // Human-readable format: "April 4, 2025"
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const buildPathFromXY = (xArr, yArr, w, h, pad = 12) => {
  if (!Array.isArray(xArr) || !Array.isArray(yArr)) return null;
  if (xArr.length === 0 || xArr.length !== yArr.length) return null;
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;

  for (let i = 0; i < xArr.length; i++) {
    const x = xArr[i];
    const y = yArr[i];

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const tx = pad - minX * scale + (innerW - spanX * scale) / 2;
  const ty = pad - minY * scale + (innerH - spanY * scale) / 2;
  const points = xArr.map((x, i) => {
    const xx = x * scale + tx;
    const yy = yArr[i] * scale + ty;
    return `${xx.toFixed(1)},${yy.toFixed(1)}`;
  });
  return `M${points.join(" L")}`;
};

const RaceDetailsScreen = () => {
  const route = useRoute();
  const { theme, colors } = useTheme();
  const [activeTab, setActiveTab] = useState("Main");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [renderMode, setRenderMode] = useState(false);
  const [meetingInfo, setMeetingInfo] = useState(null);
  const [sessionsList, setSessionsList] = useState([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState(
    sessionKey || null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const sessionKey =
    route?.params?.sessionKey ||
    route?.params?.session_key ||
    route?.params?.sessionId ||
    null;
  const meetingKey =
    route?.params?.meetingKey ||
    route?.params?.meeting_key ||
    route?.params?.meetingId ||
    null;

  const { viewerData, isJoined } = useGamePresence(sessionKey || meetingKey);

  const fetchSessionByKey = async (sKey) => {
    if (!sKey) return;
    setLoading(true);
    try {
      const resp = await fetch(`${SERVER_BASE}/session/${sKey}`);
      const json = await resp.json();
      setData(json?.data ?? json);
      setSelectedSessionKey(sKey);
    } catch (e) {
      console.warn("[RaceDetailsScreen] fetchSession failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (sessionKey) {
          await fetchSessionByKey(sessionKey);
        } else if (meetingKey) {
          // fetch meeting summary (contains sessions list)
          try {
            const resp = await fetch(`${SERVER_BASE}/meeting/${meetingKey}`);
            const json = await resp.json();
            const meetingObj = json?.meeting ?? json?.data?.meeting ?? json;
            setMeetingInfo(meetingObj);
            const sessionsArr = json?.sessions ?? meetingObj?.sessions ?? [];
            setSessionsList(sessionsArr);
            const defaultSessionKey =
              sessionKey || sessionsArr?.[0]?.session_key || null;
            if (defaultSessionKey) await fetchSessionByKey(defaultSessionKey);
          } catch (e) {
            console.warn("[RaceDetailsScreen] meeting fetch failed", e);
          }
        } else {
          setData(null);
          setMeetingInfo(null);
          setSessionsList([]);
        }
      } catch (e) {
        console.warn("[RaceDetailsScreen] load failed", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [sessionKey, meetingKey]);

  const payload = data || {};
  const meeting = payload.meeting || null;
  // prefer meetingInfo fetched separately when payload lacks meeting
  const effectiveMeeting = meeting || meetingInfo || null;
  const session = payload.session || null;
  const circuitInfo = payload.circuit_info || null;
  const startingGrid = Array.isArray(payload.starting_grid)
    ? payload.starting_grid
    : [];
  const sessionResults = Array.isArray(payload.session_result)
    ? payload.session_result
    : [];
  const raceControl = Array.isArray(payload.race_control)
    ? payload.race_control
    : [];
  const stints = Array.isArray(payload.stints) ? payload.stints : [];

  const countryColor =
    getCountryColor(meeting?.country_name || meeting?.country_name) ||
    colors.primary;

  const tabs = useMemo(() => {
    if (!startingGrid.length) return BASE_TABS.filter((t) => t !== "Grid");
    return BASE_TABS;
  }, [startingGrid.length]);

  const renderCircuit = () => {
    if (!circuitInfo) return null;
    const x = circuitInfo.x || [];
    const y = circuitInfo.y || [];
    const h = Math.round((width - 24) * 0.62);
    const path = buildPathFromXY(x, y, width - 24, h, 12);
    if (!path) return null;
    const w = width - 24;
    const transform = buildCircuitTransform(
      meeting?.circuit_key || meeting?.circuitKey,
      w,
      h,
    );
    return (
      <Svg width={w} height={h} style={{ transform: [{ scaleY: -1 }] }}>
        {transform ? (
          <G transform={transform}>
            <Path
              d={path}
              stroke={theme.text}
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </G>
        ) : (
          <Path
            d={path}
            stroke={theme.text}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </Svg>
    );
  };

  const formatDuration = (t) => {
    if (t == null || Number.isNaN(Number(t))) return "";
    const totalMs = Math.round(Number(t) * 1000);
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    const hh = String(hours).padStart(2, "0");
    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");
    const mss = String(ms).padStart(3, "0");
    if (hours > 0) return `${hh}:${mm}:${ss}.${mss}`;
    return `${mm}:${ss}.${mss}`;
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={width} height={90}>
          <Defs>
            <LinearGradient id="raceHdr" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor={countryColor} stopOpacity="0.28" />
              <Stop offset="65%" stopColor={countryColor} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={width} height={90} fill="url(#raceHdr)" />
        </Svg>
      </View>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View style={styles.headerRow}>
          {meeting?.country_flag ? (
            <Image source={{ uri: meeting.country_flag }} style={styles.flag} />
          ) : null}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text
              style={[styles.headerTitle, { color: theme.text }]}
              numberOfLines={2}
            >
              {meeting?.meeting_official_name ||
                meeting?.meeting_name ||
                meeting?.name ||
                "Race Details"}
            </Text>
            <Text style={[styles.headerMeta, { color: theme.textSecondary }]}>
              {meeting?.location || session?.location || ""},{" "}
              {meeting?.country_name || session?.country_name || ""}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.tabBar, { borderBottomColor: theme.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
        >
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabButton,
                activeTab === tab && {
                  borderBottomColor: colors.primary,
                  borderBottomWidth: 2,
                },
              ]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color:
                      activeTab === tab ? colors.primary : theme.textSecondary,
                    fontWeight: activeTab === tab ? "700" : "400",
                  },
                ]}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {activeTab === "Main" && (
          <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
            {/* New standalone container above circuit (winner / summary) */}
            {Array.isArray(sessionResults) && sessionResults.length > 0
              ? (() => {
                  const winnerRes =
                    sessionResults.find((r) => Number(r.position) === 1) ||
                    sessionResults[0];

                  if (!winnerRes) return null;

                  const driverNumber =
                    winnerRes.driver_number || winnerRes.driverNumber || null;

                  const driver =
                    findDriverInMaps(payload?.maps, driverNumber) || null;

                  const driverName = driver
                    ? driver.full_name ||
                      driver.name ||
                      driver.displayName ||
                      driver.longName ||
                      driver.shortName
                    : driverNumber
                      ? `#${driverNumber}`
                      : "Driver";

                  const headshot = driver
                    ? driver.headshot ||
                      driver.photo ||
                      driver.image ||
                      driver.headshot_url ||
                      driver.avatar ||
                      null
                    : null;

                  const teamName =
                    DRIVER_TO_TEAM[String(driverNumber)] ||
                    driver?.team ||
                    driver?.constructor ||
                    "";

                  const teamColorLocal =
                    (TEAM_COLORS && TEAM_COLORS[teamName]) || colors.primary;

                  const winnerTime = Array.isArray(winnerRes.duration) ? winnerRes.duration[2] : winnerRes.duration ? winnerRes.duration : null;

                  return (
                    <View style={{ marginTop: -8, paddingHorizontal: 0 }}>
                      <View
                        style={[
                          styles.sessionSection,
                          {
                            backgroundColor: theme.surface,
                            borderColor: theme.border,
                            marginBottom: 16,
                            overflow: "hidden",
                          },
                        ]}
                      >
                    <View style={styles.rightGradientOverlay} pointerEvents="none">
                      <Svg width="100%" height="100%" pointerEvents="none">
                        <Defs>
                          <LinearGradient
                            id={`sessionWinner-driver-${driverNumber || "x"}-${winnerRes.session_key || "y"}`}
                            x1="0%"
                            y1="0%"
                            x2="100%"
                            y2="0%"
                          >
                            <Stop
                              offset="0%"
                              stopColor={teamColorLocal || theme.surface}
                              stopOpacity="0"
                            />
                            <Stop
                              offset="100%"
                              stopColor={teamColorLocal || theme.surface}
                              stopOpacity="0.45"
                            />
                          </LinearGradient>
                        </Defs>
                        <Rect
                          width="100%"
                          height="100%"
                          fill={`url(#sessionWinner-driver-${driverNumber || "x"}-${winnerRes.session_key || "y"})`}
                        />
                      </Svg>
                    </View>
                        <View style={styles.sessionHeader}>
                          <Text
                            style={[styles.sessionTitle, { color: theme.text }]}
                          >
                            SESSION WINNER
                          </Text>
                        </View>

                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              flex: 1,
                            }}
                          >
                            <View
                              style={[
                                styles.winnerHeadshot,
                                {
                                  backgroundColor: teamColorLocal + "33",
                                  borderColor: teamColorLocal,
                                },
                              ]}
                            >
                              {headshot ? (
                                <Image
                                  source={{ uri: headshot }}
                                  style={styles.winnerHeadshotImage}
                                />
                              ) : (
                                <Text style={styles.winnerInitials}>
                                  {driverName
                                    ? driverName
                                        .split(" ")
                                        .map((w) => w[0])
                                        .join("")
                                        .slice(0, 2)
                                        .toUpperCase()
                                    : "--"}
                                </Text>
                              )}
                            </View>

                            <View style={{ marginLeft: 12, flexShrink: 1 }}>
                              <Text
                                style={[
                                  styles.winnerName,
                                  { color: theme.text },
                                ]}
                                numberOfLines={1}
                              >
                                {driverName}
                              </Text>

                              {teamName ? (
                                <Text
                                  style={[
                                    styles.winnerTeam,
                                    { color: theme.textSecondary },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {teamName}
                                </Text>
                              ) : null}
                            </View>
                          </View>

                          <View
                            style={{ alignItems: "flex-end", marginLeft: 12 }}
                          >
                            <Text
                              style={[
                                styles.winnerDuration,
                                { color: theme.text },
                              ]}
                            >
                              {formatDuration(winnerTime)}
                            </Text>
                            <Text
                              style={[
                                styles.winnerDurationLabel,
                                { color: theme.textSecondary },
                              ]}
                            >
                              TIME
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })()
              : null}

            <View
              style={[
                styles.circuitContainer,
                { backgroundColor: theme.surface },
              ]}
            >
              <View style={styles.circuitHeader}>
                <Text style={[styles.circuitTitle, { color: theme.text }]}>
                  {renderMode ? "LIVE CIRCUIT" : "CIRCUIT IMAGE"}
                </Text>
              </View>

              {/* winner removed from here; rendered above the circuit container */}

              <View style={styles.circuitBody}>
                {renderMode ? (
                  renderCircuit() || (
                    <Text style={{ color: theme.textSecondary }}>
                      No circuit geometry available.
                    </Text>
                  )
                ) : effectiveMeeting?.circuit_image ? (
                  <Image
                    source={{ uri: effectiveMeeting.circuit_image }}
                    style={styles.circuitImage}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={{ color: theme.textSecondary }}>
                    No circuit image.
                  </Text>
                )}
              </View>

              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.surface,
                    },
                  ]}
                  activeOpacity={0.8}
                  onPress={() => setRenderMode((v) => !v)}
                >
                  <Text style={{ color: theme.text }}>
                    {renderMode ? "Show Image" : "Render Circuit"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* SESSION card directly under circuit */}
            <View style={{ marginTop: -4 }}>
              <View
                style={[
                  styles.sessionSection,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                {/* header inside card */}
                <View style={styles.sessionHeader}>
                  <Text style={[styles.sessionTitle, { color: theme.text }]}>
                    SESSION
                  </Text>
                  <View
                    style={[
                      styles.sessionBadge,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text style={{ color: "white", fontWeight: "900" }}>
                      {mapSessionNameToAbbrev(
                        session?.session_name || session?.session_type,
                      )}
                    </Text>
                  </View>
                </View>

                {/* candidate lap (if available) */}
                {circuitInfo?.candidateLap
                  ? (() => {
                      const cand = circuitInfo.candidateLap;
                      const driverNumber =
                        cand?.driverNumber ||
                        cand?.driver_number ||
                        cand?.driver ||
                        cand?.driver_key;
                      const driver =
                        findDriverInMaps(payload?.maps, driverNumber) || null;
                      const name = driver
                        ? driver.full_name ||
                          driver.name ||
                          driver.displayName ||
                          driver.longName ||
                          driver.shortName
                        : "Driver";
                      const headshot = driver
                        ? driver.headshot ||
                          driver.photo ||
                          driver.image ||
                          driver.headshot_url ||
                          driver.avatar ||
                          driver.portrait ||
                          null
                        : null;
                      const timeSeconds =
                        cand?.lapTime ||
                        cand?.lap_time ||
                        cand?.time ||
                        cand?.lap_seconds ||
                        cand?.sessionStartTime ||
                        null;
                      const lapStartRaw =
                        cand?.lapStartDate ||
                        cand?.lap_start ||
                        cand?.start_time ||
                        cand?.timestamp ||
                        cand?.time_stamp ||
                        cand?.ts ||
                        null;
                      const lapStartFormatted =
                        tryFormatIsoToLocal(lapStartRaw);
                      const session = cand?.session || null;
                      // derive team from driver lookup map or driver payload
                      const teamName =
                        DRIVER_TO_TEAM[String(driverNumber)] ||
                        driver?.team ||
                        driver?.team_name ||
                        null;
                      const teamColorLocal = teamName
                        ? TEAM_COLORS[teamName] || null
                        : null;
                      return (
                        <View
                          style={[
                            styles.candidateRow,
                            { borderBottomColor: theme.border },
                          ]}
                          key={`cand-${driverNumber || "unknown"}`}
                        >
                          {headshot ? (
                            <Image
                              source={{ uri: headshot }}
                              style={[
                                styles.candHeadshot,
                                {
                                  borderWidth: StyleSheet.hairlineWidth,
                                  borderColor: teamColorLocal || theme.border,
                                  backgroundColor:
                                    (teamColorLocal || theme.surface) + "33",
                                },
                              ]}
                            />
                          ) : (
                            <View
                              style={[
                                styles.candHeadshot,
                                {
                                  backgroundColor:
                                    (teamColorLocal || theme.surface) + "33",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderWidth: StyleSheet.hairlineWidth,
                                  borderColor: teamColorLocal || theme.border,
                                },
                              ]}
                            >
                              <Text
                                style={{ color: theme.text, fontWeight: "900" }}
                              >
                                {String(name)
                                  .split(" ")
                                  .map((w) => w[0] || "")
                                  .join("")
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <View style={{ marginLeft: 10, flex: 1 }}>
                            <Text
                              style={[styles.candTitle, { color: theme.text }]}
                            >
                              Fastest Lap
                            </Text>
                            <Text
                              style={[styles.candName, { color: theme.text }]}
                            >
                              {name}
                              {teamName ? ` · ${teamName}` : ""}
                            </Text>
                            {timeSeconds ? (
                              <Text
                                style={{
                                  color: theme.textSecondary,
                                  fontSize: 12,
                                }}
                              >
                                {formatLapTime(timeSeconds)}
                                {lapStartFormatted
                                  ? ` · ${lapStartFormatted}`
                                  : ""}
                                {session ? ` · ${session}` : ""}
                              </Text>
                            ) : lapStartFormatted ? (
                              <Text
                                style={{
                                  color: theme.textSecondary,
                                  fontSize: 12,
                                }}
                              >
                                {lapStartFormatted}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      );
                    })()
                  : null}

                <View
                  style={[
                    styles.sessionRow,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.sessionLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Name
                  </Text>
                  <Text style={[styles.sessionValue, { color: theme.text }]}>
                    {session?.session_name || session?.session_type || "-"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.sessionRow,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.sessionLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Type
                  </Text>
                  <Text style={[styles.sessionValue, { color: theme.text }]}>
                    {session?.session_type || "-"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.sessionRow,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.sessionLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Start
                  </Text>
                  <Text style={[styles.sessionValue, { color: theme.text }]}>
                    {session?.date_start
                      ? formatDateTimeLocal(session.date_start)
                      : "-"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.sessionRow,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.sessionLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    End
                  </Text>
                  <Text style={[styles.sessionValue, { color: theme.text }]}>
                    {session?.date_end
                      ? formatDateTimeLocal(session.date_end)
                      : "-"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.sessionRow,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.sessionLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Location
                  </Text>
                  <Text style={[styles.sessionValue, { color: theme.text }]}>
                    {session?.location || effectiveMeeting?.location || "-"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.sessionRow,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.sessionLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Circuit
                  </Text>
                  <Text style={[styles.sessionValue, { color: theme.text }]}>
                    {effectiveMeeting?.circuit_short_name || "-"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.sessionRow,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.sessionLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Circuit Type
                  </Text>
                  <Text style={[styles.sessionValue, { color: theme.text }]}>
                    {effectiveMeeting?.circuit_type || "-"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.sessionRow,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.sessionLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Geometry
                  </Text>
                  <Text style={[styles.sessionValue, { color: theme.text }]}>
                    {circuitInfo?.x?.length
                      ? `${circuitInfo.x.length} pts`
                      : "-"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Weather section */}
            <View style={{ marginTop: 12 }}>
              <View
                style={[
                  styles.weatherSection,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <View style={styles.sessionHeader}>
                  <Text style={[styles.sessionTitle, { color: theme.text }]}>
                    WEATHER
                  </Text>
                </View>
                <View
                  style={[
                    styles.weatherRow,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.sessionLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Wind Speed
                  </Text>
                  <Text style={[styles.sessionValue, { color: theme.text }]}>
                    {payload?.weather?.wind_speed
                      ? `${payload.weather.wind_speed} m/s`
                      : "-"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.weatherRow,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.sessionLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Wind Direction
                  </Text>
                  <Text style={[styles.sessionValue, { color: theme.text }]}>
                    {payload?.weather?.wind_direction
                      ? `${payload.weather.wind_direction}° ${degToCompass(payload.weather.wind_direction)}`
                      : "-"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.weatherRow,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.sessionLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Track Temp
                  </Text>
                  <Text style={[styles.sessionValue, { color: theme.text }]}>
                    {payload?.weather?.track_temperature
                      ? `${payload.weather.track_temperature}° C`
                      : "-"}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {activeTab === "Drivers" && (
          <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
            {sessionResults.length ? (
              sessionResults.slice(0, 20).map((r, i) => (
                <View
                  key={`${r.driver_number || i}`}
                  style={[styles.row, { borderBottomColor: theme.border }]}
                >
                  <Text style={{ color: theme.text }}>
                    {r.position ?? i + 1}
                  </Text>
                  <Text style={{ color: theme.textSecondary }}>
                    {r.driver_name || r.full_name || r.name || "Driver"}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={{ color: theme.textSecondary }}>
                Drivers will appear here when results are available.
              </Text>
            )}
          </View>
        )}

        {activeTab === "Events" && (
          <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
            {raceControl.length ? (
              raceControl.slice(0, 30).map((c, i) => (
                <View
                  key={`rc-${i}`}
                  style={[
                    styles.commentRow,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    {c.date || c.timestamp
                      ? formatDateTimeLocal(c.date || c.timestamp)
                      : ""}
                  </Text>
                  <Text style={{ color: theme.text }}>
                    {c.message || c.text || ""}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={{ color: theme.textSecondary }}>
                Events will appear here when available.
              </Text>
            )}
          </View>
        )}

        {activeTab === "Stints" && (
          <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
            {stints.length ? (
              stints.slice(0, 30).map((s, i) => (
                <View
                  key={`st-${i}`}
                  style={[styles.row, { borderBottomColor: theme.border }]}
                >
                  <Text style={{ color: theme.text }}>
                    {s.driver_number || s.driver || i + 1}
                  </Text>
                  <Text style={{ color: theme.textSecondary }}>
                    {s.compound || s.tyre || "Stint"}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={{ color: theme.textSecondary }}>
                Stints data will appear here when available.
              </Text>
            )}
          </View>
        )}

        {activeTab === "Grid" && (
          <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
            {startingGrid.length ? (
              startingGrid.map((g, i) => (
                <View
                  key={`grid-${i}`}
                  style={[styles.row, { borderBottomColor: theme.border }]}
                >
                  <Text style={{ color: theme.text }}>
                    {g.position ?? i + 1}
                  </Text>
                  <Text style={{ color: theme.textSecondary }}>
                    {g.driver_name || g.full_name || g.name || "Driver"}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={{ color: theme.textSecondary }}>
                No starting grid data.
              </Text>
            )}
          </View>
        )}
      </ScrollView>
      {/* Session picker overlay + floating button */}
      {pickerOpen && (
        <View style={styles.sessionPickerOverlay} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={() => setPickerOpen(false)}>
            <View style={styles.sessionPickerBackdrop} />
          </TouchableWithoutFeedback>
          <View style={styles.sessionPickerContainer} pointerEvents="box-none">
            {sessionsList && sessionsList.length ? (
              sessionsList.map((s) => {
                const isLive = isSessionLive(s);
                const bg = isLive ? theme.error || "#b00020" : colors.primary;
                return (
                  <TouchableOpacity
                    key={`${s.session_key}`}
                    activeOpacity={0.85}
                    onPress={() => {
                      fetchSessionByKey(s.session_key);
                      setPickerOpen(false);
                    }}
                    style={[
                      styles.sessionButton,
                      { backgroundColor: bg, borderColor: theme.border },
                    ]}
                  >
                    {isLive && (
                      <Ionicons
                        name="radio"
                        size={45}
                        color={"#b00020"}
                        style={{ position: "absolute", opacity: 0.75 }}
                      />
                    )}
                    <Text
                      style={[styles.sessionButtonLabel, { color: "white" }]}
                    >
                      {mapSessionNameToAbbrev(s.session_name) || "S"}
                    </Text>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.sessionButtonEmpty}>
                <Text style={{ color: theme.textSecondary }}>
                  No sessions available
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      <View style={styles.floatingButtonWrap} pointerEvents="box-none">
        {(() => {
          const cur =
            sessionsList?.find((s) => s.session_key === selectedSessionKey) ||
            payload?.session ||
            null;
          const isLiveCur = isSessionLive(cur);
          const bg = isLiveCur ? theme.error || "#b00020" : colors.primary;
          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setPickerOpen((v) => !v)}
              style={[
                styles.floatingButton,
                { backgroundColor: bg, borderColor: theme.border },
              ]}
            >
              {isLiveCur && (
                <Ionicons
                  name="radio"
                  size={45}
                  color={"#b00020"}
                  style={{ position: "absolute", opacity: 0.75 }}
                />
              )}
              <Text style={{ color: "white", fontWeight: "900", fontSize: 18 }}>
                {mapSessionNameToAbbrev(
                  cur?.session_name || cur?.session_type || "",
                )}
              </Text>
            </TouchableOpacity>
          );
        })()}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingTop: 18,
    paddingHorizontal: 12,
    paddingBottom: 12,
    height: 90,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rightGradientOverlay: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "44%",
  },
  headerRow: { flexDirection: "row", alignItems: "center" },
  flag: { width: 44, height: 26, borderRadius: 4, backgroundColor: "#fff" },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  headerMeta: { fontSize: 12, marginTop: 2 },
  tabBar: { borderBottomWidth: StyleSheet.hairlineWidth },
  tabBarContent: { flexDirection: "row" },
  tabButton: {
    width: width / 4,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: 14 },
  circuitImage: { width: width - 60, height: (width - 60) * 0.75 },
  circuitContainer: { padding: 12, marginBottom: 16, borderRadius: 12 },
  circuitHeader: { marginBottom: 8 },
  circuitTitle: { fontSize: 14, fontWeight: "800" },
  circuitBody: { alignItems: "center" },
  toggleRow: { marginTop: 10, alignItems: "center" },
  toggleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  renderWrap: { marginTop: 12, alignItems: "center" },
  sectionTitle: { fontSize: 14, fontWeight: "800", marginBottom: 6 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commentRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  floatingButtonWrap: {
    position: "absolute",
    right: 25,
    bottom: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  floatingButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 6,
  },
  sessionPickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1200,
    elevation: 1200,
  },
  sessionPickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sessionPickerContainer: {
    position: "absolute",
    right: 16,
    bottom: 86,
    alignItems: "flex-end",
    paddingHorizontal: 6,
    marginBottom: 8,
  },
  sessionButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: 12,
    marginRight: 3,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  sessionButtonLabel: { fontSize: 18, fontWeight: "900" },
  sessionButtonEmpty: { padding: 12, alignItems: "center" },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sessionTitle: { fontSize: 13, fontWeight: "900" },
  sessionBadge: {
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
  },
  /* Session card layout */
  sessionSection: { borderRadius: 10, padding: 12, marginTop: 8 },
  winnerCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  winnerHeadshot: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    overflow: "hidden",
  },
  winnerHeadshotImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  winnerInitials: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 18,
  },
  winnerBadgeLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  winnerName: {
    fontSize: 16,
    fontWeight: "800",
  },
  winnerTeam: {
    fontSize: 12,
    marginTop: 2,
  },
  winnerDurationLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  winnerDuration: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2,
  },
  sessionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 2,
  },
  sessionLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sessionValue: { fontSize: 14, fontWeight: "800" },
  candidateRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  candHeadshot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  candTitle: { fontSize: 10, fontWeight: "500" },
  candName: { fontSize: 14, fontWeight: "800" },
  weatherSection: { borderRadius: 10, padding: 12, marginTop: 8 },
  weatherRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.04)",
  },
});

export default RaceDetailsScreen;

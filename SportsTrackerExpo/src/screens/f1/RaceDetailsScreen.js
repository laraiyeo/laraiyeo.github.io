import React, { useEffect, useMemo, useRef, useState } from "react";
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
  Modal,
  Platform,
  Share,
} from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Path,
  G,
  SvgUri,
} from "react-native-svg";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useGamePresence } from "../../hooks/useGamePresence";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import ViewShot from "react-native-view-shot";

const SERVER_BASE = "https://laraiyeogithubio-production-ed10.up.railway.app";
const { width } = Dimensions.get("window");

const BASE_TABS = ["Main", "Drivers", "Events", "Stints", "Starting Grid"];

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
  "Red Bull Racing": "#4781D7",
  Ferrari: "#ED1131",
  McLaren: "#F47600",
  Alpine: "#00A1E8",
  "Racing Bulls": "#6C98FF",
  "Aston Martin": "#229971",
  Williams: "#1878D8",
  Sauber: "#52E252",
  "Haas F1 Team": "#9C9FA2",
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
  if (n.includes("sprint")) return "SR";
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

const isSessionFinished = (session) => {
  if (!session) return false;
  try {
    const end = new Date(session.date_end).getTime();
    const now = Date.now();
    return now > end;
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
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const timePart = d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${datePart} · ${timePart}`;
  } catch (e) {
    return "--";
  }
};

const toOrdinal = (n) => {
  if (!n) return "";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const formatLapTime = (t) => {
  if (t == null) return "";
  // t expected in seconds (may be float)
  const totalMs = Math.round(Number(t) * 1000);
  if (Number.isNaN(totalMs)) return String(t);

  const hours = Math.floor(totalMs / 3600000); // Get hours
  const minutes = Math.floor((totalMs % 3600000) / 60000); // Get minutes
  const seconds = Math.floor((totalMs % 60000) / 1000); // Get seconds
  const hundredths = Math.floor((totalMs % 1000) / 10); // Get hundredths

  // If hours are zero, we don't need to show it
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
  }

  if (minutes > 0) {
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
  }

  // If no hours or minutes, just show seconds.hundredths
  return `${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
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

const formatRaceControlCategory = (category) => {

const F1_NAME_MAP = {
  McLaren: "mclaren",
  Ferrari: "ferrari",
  "Red Bull": "redbullracing",
  "Red Bull Racing": "redbullracing",
  Mercedes: "mercedes",
  "Aston Martin": "astonmartin",
  Alpine: "alpine",
  Williams: "williams",
  RB: "rb",
  "Racing Bulls": "racingbulls",
  Haas: "haas",
  "Haas F1 Team": "haas",
  Sauber: "kicksauber",
  Audi: "audi",
  Cadillac: "cadillac",
};

const getF1TextOnColor = (hex) => {
  if (!hex || !hex.startsWith("#")) return "#ffffff";
  const c = hex.replace("#", "");
  const r = parseInt(c.substr(0, 2), 16) / 255;
  const g = parseInt(c.substr(2, 2), 16) / 255;
  const b = parseInt(c.substr(4, 2), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? "#000000" : "#ffffff";
};

const formatRaceDate = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
};

function RaceDetailsDriverCopyCard({
  visible,
  onClose,
  driverData,
  session,
  meeting,
  colors,
  theme,
}) {
  const cardRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const cardWidth = Math.min(width - 48, 540);

  if (!visible || !driverData) return null;

  const teamDisplayName = driverData.teamName || "";
  const teamColor = driverData.teamColor || colors.primary;
  const textOnTeam = getF1TextOnColor(teamColor);
  const sessionLabel = mapSessionNameToAbbrev(
    session?.session_name || session?.session_type,
  );
  const raceName =
    meeting?.meeting_official_name || meeting?.meeting_name || meeting?.name || "F1";
  const flagUri = meeting?.country_flag || null;
  const sessionTime = formatRaceDate(session?.date_start || meeting?.date_start);
  const initials = (driverData.name || "")
    .split(" ")
    .map((part) => part[0] || "")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const positionDelta = driverData.positionDelta;
  const topRightColor =
    positionDelta > 0
      ? theme.success
      : positionDelta < 0
        ? theme.error
        : theme.textSecondary;

  const timeRight = driverData.timeRight || "";
  const ovrDiff =
    driverData.overtakes != null && driverData.overtakenCount != null
      ? driverData.overtakes - driverData.overtakenCount
      : null;
  const ovrDiffDisplay =
    ovrDiff != null ? (ovrDiff > 0 ? `+${ovrDiff}` : String(ovrDiff)) : "-";
  const ovrColor =
    ovrDiff != null
      ? ovrDiff > 0
        ? theme.success
        : ovrDiff < 0
          ? theme.error
          : theme.textSecondary
      : theme.textSecondary;

  const topStats = [
    { label: "POS", val: String(driverData.pos ?? "-") },
    { label: "TIME", val: String(driverData.timeToUse || driverData.result || "-") },
    { label: "LAPS", val: String(driverData.laps ?? "-") },
  ];

  const stats = [
    {
      label: "POS",
      val: String(driverData.pos ?? "-"),
      topRight:
        positionDelta > 0
          ? ` UP ${positionDelta} POS`
          : positionDelta < 0
            ? ` DOWN ${Math.abs(positionDelta)} POS`
            : null,
    },
    { label: "TIME", val: String(driverData.timeToUse || driverData.result || driverData.behindLabel || "-"), topRight: timeRight },
    { label: "LAPS", val: String(driverData.laps ?? "-") },
    {
      label: "SPD TRAP",
      val: driverData.topSpeedDisplay && driverData.topSpeedDisplay !== "-" ? `${driverData.topSpeedDisplay} km/h` : "-",
    },
    {
      label: "OVERTAKES",
      val: String(driverData.overtakes ?? 0),
      topRight: driverData.overtakes > 0 ? `${ovrDiffDisplay} DIFF` : null,
    },
    { label: "FAST LAP", val: driverData.fastestLapDisplay || "-" },
  ];

  const teamLookupName = teamDisplayName.replace(/ Racing$/i, "");
  const teamLogoName =
    F1_NAME_MAP[teamDisplayName] ||
    F1_NAME_MAP[teamLookupName] ||
    teamLookupName.toLowerCase().replace(/\s+/g, "");
  const currentYear = new Date().getFullYear();
  const teamLogoUrl = teamLookupName
    ? `https://media.formula1.com/image/upload/c_fit,h_1080/q_auto/v1740000000/common/f1/${currentYear}/${teamLogoName}/${currentYear}${teamLogoName}logowhite.webp`
    : null;
  const carUrl = teamLookupName
    ? `https://media.formula1.com/image/upload/c_lfill,w_3392/q_auto/v1740000000/common/f1/${currentYear}/${teamLogoName}/${currentYear}${teamLogoName}carright.webp`
    : null;

  const handleShare = async () => {
    if (!cardRef.current || sharing) return;
    try {
      setSharing(true);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const uri = await cardRef.current.capture();
      await Share.share({ url: uri, title: "Driver Stats" });
    } catch (error) {
      console.warn("[RaceDetailsScreen] driver share failed", error);
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={f1CardStyles.overlay}>
        <ViewShot ref={cardRef} options={{ format: "png", quality: 1 }}>
          <View
            style={[
              f1CardStyles.card,
              { backgroundColor: theme.surface, width: cardWidth },
            ]}
          >
            <View
              style={[
                f1CardStyles.cardHeader,
                {
                  backgroundColor: teamColor + "22",
                  borderBottomColor: teamColor,
                },
              ]}
            >
              <View style={f1CardStyles.headerTopRow}>
                <View
                  style={[
                    f1CardStyles.sessionBadge,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text
                    style={[
                      f1CardStyles.sessionBadgeText,
                      { color: getF1TextOnColor(colors.primary) },
                    ]}
                  >
                    {sessionLabel}
                  </Text>
                </View>
              </View>

              <Text
                style={[f1CardStyles.cardRaceName, { color: theme.text }]}
                numberOfLines={1}
              >
                {raceName}
              </Text>
              <Text
                style={[f1CardStyles.cardRaceTime, { color: theme.text }]}
                numberOfLines={1}
              >
                {sessionTime || "TBD"}
              </Text>

              {flagUri ? (
                <View style={f1CardStyles.venueRow}>
                  <Image source={{ uri: flagUri }} style={f1CardStyles.flagImg} resizeMode="contain" />
                  <Text
                    style={[f1CardStyles.venueText, { color: theme.textSecondary }]}
                    numberOfLines={1}
                  >
                    {meeting?.location || session?.location || ""}
                    {meeting?.country_name || session?.country_name ? `  •  ${meeting?.country_name || session?.country_name}` : ""}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={f1CardStyles.podiumRow}>
              <View style={f1CardStyles.headshotWrap}>
                {driverData.headshot ? (
                  <Image
                    source={{ uri: driverData.headshot }}
                    style={f1CardStyles.headshot}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={[
                      f1CardStyles.headshot,
                      {
                        backgroundColor: teamColor + "22",
                        alignItems: "center",
                        justifyContent: "center",
                      },
                    ]}
                  >
                    <Text style={{ color: teamColor, fontWeight: "900" }}>{initials || "D"}</Text>
                  </View>
                )}
                <View style={[f1CardStyles.posBadge, { backgroundColor: teamColor }]}>
                  <Text style={[f1CardStyles.posBadgeText, { color: textOnTeam }]}>
                    {driverData.pos ?? "-"}
                  </Text>
                </View>
              </View>

              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={f1CardStyles.summaryRow}>
                  {topStats.map((item) => (
                    <View key={item.label} style={f1CardStyles.summaryCell}>
                      <Text style={[f1CardStyles.summaryVal, { color: theme.text }]} numberOfLines={1}>
                        {item.val}
                      </Text>
                      <Text style={[f1CardStyles.summaryLbl, { color: theme.textSecondary }]}>
                        {item.label}
                      </Text>
                    </View>
                  ))}
                </View>

                <Text
                  style={[f1CardStyles.driverNameText, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {driverData.name}
                </Text>
                <View style={f1CardStyles.teamNameRow}>
                  {teamLogoUrl ? (
                    <Image
                      source={{ uri: teamLogoUrl }}
                      style={f1CardStyles.teamLogoImg}
                      resizeMode="contain"
                    />
                  ) : null}
                  <Text
                    style={[f1CardStyles.teamNameText, { color: theme.textSecondary }]}
                    numberOfLines={1}
                  >
                    {teamDisplayName || "Team"}
                  </Text>
                </View>
              </View>
            </View>

            <View style={f1RacerCardStyles.statGrid}>
              {stats.map((item, index) => (
                <View
                  key={`${item.label}-${index}`}
                  style={[
                    f1RacerCardStyles.statCell,
                    { borderColor: theme.border },
                    index % 3 !== 2 && { borderRightWidth: StyleSheet.hairlineWidth },
                    index < 3 && { borderBottomWidth: StyleSheet.hairlineWidth },
                  ]}
                >
                  {!!item.topRight && (
                    <Text
                      style={[
                        f1RacerCardStyles.statTopRight,
                        {
                          color:
                            item.label === "POS"
                              ? topRightColor
                              : item.label === "OVERTAKES"
                                ? ovrColor
                                : theme.textSecondary,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {item.topRight}
                    </Text>
                  )}
                  <Text style={[f1RacerCardStyles.statVal, { color: theme.text }]} numberOfLines={1}>
                    {item.val}
                  </Text>
                  <Text style={[f1RacerCardStyles.statLbl, { color: theme.textSecondary }]}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>

            {carUrl ? (
              <View style={f1RacerCardStyles.carRow}>
                <Image source={{ uri: carUrl }} style={f1RacerCardStyles.carImg} resizeMode="contain" />
              </View>
            ) : null}

            <View style={[f1RacerCardStyles.footer, { borderTopColor: theme.border }]}>
              <Text style={[f1RacerCardStyles.brand, { color: theme.text }]}>
                SportsHeart <Ionicons name="heart" size={10} color={colors.primary} />
              </Text>
            </View>
          </View>
        </ViewShot>

        <View style={f1CardStyles.actions}>
          <TouchableOpacity
            onPress={handleShare}
            disabled={sharing}
            style={[f1CardStyles.actionBtn, { backgroundColor: colors.primary }]}
          >
            <Text
              style={[
                f1CardStyles.actionBtnTxt,
                { color: getF1TextOnColor(colors.primary) },
              ]}
            >
              {sharing ? "Sharing…" : "Share"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onClose}
            style={[f1CardStyles.actionBtn, { backgroundColor: theme.border }]}
          >
            <Text style={[f1CardStyles.actionBtnTxt, { color: theme.text }]}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function RaceDetailsSessionCopyCard({
  visible,
  onClose,
  session,
  meeting,
  sessionResults,
  maps,
  colors,
  theme,
}) {
  const cardRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const cardWidth = Math.min(width - 48, 540);

  if (!visible) return null;

  const countryColor =
    getCountryColor(meeting?.country_name || session?.country_name) || colors.primary;
  const raceName =
    meeting?.meeting_official_name || meeting?.meeting_name || meeting?.name || "F1";
  const flagUri = meeting?.country_flag || null;
  const sessionLabelPre = session?.session_name || session?.session_type || "Session";
  const sessionLabel = mapSessionNameToAbbrev(sessionLabelPre);
  const sessionTime = formatRaceDate(session?.date_start);
  const venueLine = [meeting?.circuit_short_name || session?.circuit_short_name, meeting?.location || session?.location, meeting?.country_name || session?.country_name]
    .filter(Boolean)
    .join("  •  ");

  const podium = [...(sessionResults || [])]
    .filter((entry) => entry?.position != null)
    .sort((a, b) => Number(a.position) - Number(b.position))
    .slice(0, 3)
    .map((entry) => {
      const driverNumber = entry?.driver_number ?? entry?.driverNumber ?? null;
      const driver = findDriverInMaps(maps, driverNumber) || null;
      const name =
        driver?.full_name ||
        driver?.name ||
        driver?.displayName ||
        driver?.longName ||
        (driverNumber ? `#${driverNumber}` : "Driver");
      const headshot =
        driver?.headshot ||
        driver?.headshot_url ||
        driver?.headshotUrl ||
        null;
      const teamName =
        DRIVER_TO_TEAM[String(driverNumber)] ||
        driver?.team ||
        driver?.team_name ||
        "";
      const teamColor =
        TEAM_COLORS[teamName.replace(/ Racing$/i, "")] ||
        TEAM_COLORS[teamName] ||
        colors.primary;
      const duration = Array.isArray(entry?.duration)
        ? entry.duration[2] ?? entry.duration[1] ?? entry.duration[0] ?? null
        : entry?.duration ?? null;
      return {
        position: Number(entry.position),
        name,
        headshot,
        teamName,
        teamColor,
        duration: duration != null ? formatLapTime(duration) : "-",
      };
    });

    const f1CardStyles = StyleSheet.create({
      overlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.88)",
        justifyContent: "center",
        alignItems: "center",
        gap: 20,
        padding: 24,
      },
      card: {
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 10,
      },
      cardHeader: {
        padding: 14,
        borderBottomWidth: 2,
        gap: 4,
      },
      headerTopRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 6,
      },
      sessionBadge: {
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
      },
      sessionBadgeText: {
        fontSize: 10,
        fontWeight: "800",
        letterSpacing: 0.5,
        textTransform: "uppercase",
      },
      cardRaceName: {
        fontSize: 16,
        fontWeight: "700",
        marginBottom: 4,
      },
      cardRaceTime: {
        fontSize: 12,
        fontWeight: "500",
      },
      venueRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      },
      flagImg: {
        width: 25,
        height: 25,
        borderRadius: 2,
      },
      venueText: {
        fontSize: 11,
        fontWeight: "500",
        flex: 1,
      },
      podiumRow: {
        flexDirection: "row",
        paddingHorizontal: 8,
        paddingVertical: 18,
        justifyContent: "space-around",
      },
      driverCol: {
        flex: 1,
        alignItems: "center",
        gap: 3,
      },
      headshotWrap: {
        position: "relative",
        marginBottom: 6,
      },
      headshot: {
        width: 68,
        height: 68,
        borderRadius: 34,
        backgroundColor: "rgba(128,128,128,0.15)",
      },
      posBadge: {
        position: "absolute",
        top: -4,
        right: -4,
        width: 26,
        height: 26,
        borderRadius: 13,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1.5,
        borderColor: "rgba(0,0,0,0.15)",
      },
      posBadgeText: {
        fontSize: 13,
        fontWeight: "800",
        lineHeight: 14,
      },
      driverName: {
        fontSize: 13,
        fontWeight: "700",
        textAlign: "center",
      },
      driverTeam: {
        fontSize: 10,
        fontWeight: "600",
        textAlign: "center",
      },
      timeText: {
        fontSize: 11,
        fontWeight: "500",
        textAlign: "center",
      },
      summaryRow: {
        flexDirection: "row",
        gap: 14,
        marginBottom: 4,
      },
      summaryCell: {
        alignItems: "center",
      },
      summaryVal: {
        fontSize: 18,
        fontWeight: "800",
        lineHeight: 20,
      },
      summaryLbl: {
        fontSize: 9,
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: 0.4,
        marginTop: 1,
      },
      driverNameText: {
        fontSize: 13,
        fontWeight: "600",
      },
      teamNameRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      },
      teamLogoImg: {
        height: 16,
        width: 16,
        marginLeft: -2.5,
      },
      actions: {
        flexDirection: "row",
        gap: 12,
      },
      actionBtn: {
        paddingHorizontal: 28,
        paddingVertical: 13,
        borderRadius: 28,
        minWidth: 120,
        alignItems: "center",
      },
      actionBtnTxt: {
        fontSize: 15,
        fontWeight: "700",
      },
    });

    const f1RacerCardStyles = StyleSheet.create({
      statGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
      },
      statCell: {
        width: "33.333%",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 4,
        position: "relative",
      },
      statTopRight: {
        position: "absolute",
        top: 5,
        right: 5,
        fontSize: 8,
        fontWeight: "600",
        letterSpacing: 0.3,
      },
      statVal: {
        fontSize: 15,
        fontWeight: "800",
        textAlign: "center",
      },
      statLbl: {
        fontSize: 9,
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginTop: 3,
        textAlign: "center",
      },
      footer: {
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingVertical: 6,
        paddingHorizontal: 12,
        alignItems: "flex-end",
      },
      brand: {
        fontSize: 9,
        fontWeight: "800",
        letterSpacing: 0.5,
      },
      carRow: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        alignItems: "center",
      },
      carImg: {
        width: "100%",
        height: 84,
      },
    });

  const handleShare = async () => {
    if (!cardRef.current || sharing) return;
    try {
      setSharing(true);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const uri = await cardRef.current.capture();
      await Share.share({ url: uri, title: "Session Stats" });
    } catch (error) {
      console.warn("[RaceDetailsScreen] session share failed", error);
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={f1CardStyles.overlay}>
        <ViewShot ref={cardRef} options={{ format: "png", quality: 1 }}>
          <View
            style={[
              f1CardStyles.card,
              { backgroundColor: theme.surface, width: cardWidth },
            ]}
          >
            <View
              style={[
                f1CardStyles.cardHeader,
                {
                  backgroundColor: countryColor + "22",
                  borderBottomColor: countryColor,
                },
              ]}
            >
              <View style={f1CardStyles.headerTopRow}>
                <View
                  style={[
                    f1CardStyles.sessionBadge,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text
                    style={[
                      f1CardStyles.sessionBadgeText,
                      { color: getF1TextOnColor(colors.primary) },
                    ]}
                  >
                    {sessionLabel}
                  </Text>
                </View>
              </View>
              <Text style={[f1CardStyles.cardRaceName, { color: theme.text }]} numberOfLines={1}>
                {raceName}
              </Text>
              <Text style={[f1CardStyles.cardRaceTime, { color: theme.text }]} numberOfLines={1}>
                {sessionTime || "TBD"}
              </Text>
              {venueLine ? (
                <View style={f1CardStyles.venueRow}>
                  {flagUri ? (
                    <Image source={{ uri: flagUri }} style={f1CardStyles.flagImg} resizeMode="contain" />
                  ) : null}
                  <Text
                    style={[f1CardStyles.venueText, { color: theme.textSecondary }]}
                    numberOfLines={1}
                  >
                    {venueLine}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={f1CardStyles.podiumRow}>
              {podium.map((driver) => {
                const initials = (driver.name || "")
                  .split(" ")
                  .map((part) => part[0] || "")
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                return (
                  <View key={`${driver.position}-${driver.name}`} style={f1CardStyles.driverCol}>
                    <View style={f1CardStyles.headshotWrap}>
                      {driver.headshot ? (
                        <Image source={{ uri: driver.headshot }} style={f1CardStyles.headshot} resizeMode="cover" />
                      ) : (
                        <View
                          style={[
                            f1CardStyles.headshot,
                            {
                              backgroundColor: driver.teamColor + "22",
                              alignItems: "center",
                              justifyContent: "center",
                            },
                          ]}
                        >
                          <Text style={{ color: driver.teamColor, fontWeight: "900" }}>{initials || "D"}</Text>
                        </View>
                      )}
                      <View style={[f1CardStyles.posBadge, { backgroundColor: driver.teamColor }]}>
                        <Text style={[f1CardStyles.posBadgeText, { color: getF1TextOnColor(driver.teamColor) }]}>
                          {driver.position}
                        </Text>
                      </View>
                    </View>
                    <Text style={[f1CardStyles.driverName, { color: theme.text }]} numberOfLines={1}>
                      {driver.name}
                    </Text>
                    <Text style={[f1CardStyles.driverTeam, { color: driver.teamColor }]} numberOfLines={1}>
                      {driver.teamName || "Team"}
                    </Text>
                    <Text style={[f1CardStyles.timeText, { color: theme.textSecondary }]} numberOfLines={1}>
                      {driver.duration}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={[f1RacerCardStyles.footer, { borderTopColor: theme.border }]}>
              <Text style={[f1RacerCardStyles.brand, { color: theme.text }]}>SportsHeart <Ionicons name="heart" size={10} color={colors.primary} /></Text>
            </View>
          </View>
        </ViewShot>

        <View style={f1CardStyles.actions}>
          <TouchableOpacity
            onPress={handleShare}
            disabled={sharing}
            style={[f1CardStyles.actionBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={[f1CardStyles.actionBtnTxt, { color: getF1TextOnColor(colors.primary) }]}>
              {sharing ? "Sharing…" : "Share"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onClose}
            style={[f1CardStyles.actionBtn, { backgroundColor: theme.border }]}
          >
            <Text style={[f1CardStyles.actionBtnTxt, { color: theme.text }]}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
  const raw = String(category || "Race Control")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return raw
    ? raw
        .split(" ")
        .map(
          (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
        )
        .join(" ")
    : "Race Control";
};

const RaceDetailsScreen = () => {
  const route = useRoute();
  const { theme, colors } = useTheme();
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState("Main");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [renderMode, setRenderMode] = useState(true);
  const [meetingInfo, setMeetingInfo] = useState(null);
  const [sessionsList, setSessionsList] = useState([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sessionInitialized, setSessionInitialized] = useState(false);
  const [eventsPage, setEventsPage] = useState(0);
  const [activeEventType, setActiveEventType] = useState("ALL");
  const [driverCardVisible, setDriverCardVisible] = useState(false);
  const [sessionCardVisible, setSessionCardVisible] = useState(false);
  const [selectedDriverCard, setSelectedDriverCard] = useState(null);
  const floatingButtonLongPressRef = useRef(false);

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

  useEffect(() => {
    if (sessionKey) {
      setSelectedSessionKey(sessionKey);
    }
  }, [sessionKey]);

  const { viewerData, isJoined } = useGamePresence(sessionKey || meetingKey);

  const fetchSessionByKey = async (sKey, options = {}) => {
    const { silent = false } = options;
    if (!sKey) return;
    if (!silent) setLoading(true);
    try {
      const resp = await fetch(`${SERVER_BASE}/session/${sKey}`);
      const json = await resp.json();
      setData(json?.data ?? json);
      setSelectedSessionKey(sKey);
    } catch (e) {
      console.warn("[RaceDetailsScreen] fetchSession failed", e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (sessionKey) {
          // Fetch session data
          await fetchSessionByKey(sessionKey);
        } else if (meetingKey) {
          // Fetch meeting summary and session data
          try {
            const resp = await fetch(`${SERVER_BASE}/meeting/${meetingKey}`);
            const json = await resp.json();
            const meetingObj = json?.meeting ?? json?.data?.meeting ?? json;
            setMeetingInfo(meetingObj);
            const sessionsArr = json?.sessions ?? meetingObj?.sessions ?? [];
            setSessionsList(sessionsArr);

            // Fetch session details by meeting key
            await fetchSessionByKey(meetingKey);
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

  useEffect(() => {
    if (!selectedSessionKey || !session) return undefined;

    const intervalId = setInterval(() => {
      if (isSessionLive(session)) {
        fetchSessionByKey(selectedSessionKey, { silent: true });
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [selectedSessionKey, session?.date_start, session?.date_end]);

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
  const overtakes = Array.isArray(payload.overtakes) ? payload.overtakes : [];
  const pits = Array.isArray(payload.pits) ? payload.pits : [];
  const stints = Array.isArray(payload.stints) ? payload.stints : [];
  const EVENTS_PER_PAGE = 50;
  const STINT_NAME_COL_W = 152;
  const STINT_ROW_HEIGHT = 46;
  const STINT_PX_PER_LAP = 18;

  const TIRE_IMAGES = {
    SOFT: "https://upload.wikimedia.org/wikipedia/commons/d/df/F1_tire_Pirelli_PZero_Red.svg",
    MEDIUM:
      "https://upload.wikimedia.org/wikipedia/commons/4/4d/F1_tire_Pirelli_PZero_Yellow.svg",
    HARD: "https://upload.wikimedia.org/wikipedia/commons/d/d6/F1_tire_Pirelli_PZero_White.svg",
    INTERMEDIATE:
      "https://upload.wikimedia.org/wikipedia/commons/8/86/F1_tire_Pirelli_Cinturato_Green.svg",
    WET: "https://upload.wikimedia.org/wikipedia/commons/6/63/F1_tire_Pirelli_Cinturato_Blue.svg",
  };

  const STINT_COMPOUND_COLORS = {
    SOFT: "#ED1C24",
    MEDIUM: "#FFD200",
    HARD: "#F0F0F0",
    INTERMEDIATE: "#43B02A",
    WET: "#0067AD",
  };

  const STINT_COMPOUND_ORDER = [
    "SOFT",
    "MEDIUM",
    "HARD",
    "INTERMEDIATE",
    "WET",
  ];

  const normalizeCompound = (value) => {
    const text = String(value || "")
      .trim()
      .toUpperCase();
    if (!text) return null;
    if (text.includes("SOFT")) return "SOFT";
    if (text.includes("MEDIUM")) return "MEDIUM";
    if (text.includes("HARD")) return "HARD";
    if (text.includes("WET")) return "WET";
    if (text.includes("INTER")) return "INTERMEDIATE";
    return text;
  };

  const resolveDriverLabel = (driverNumber) => {
    const driverObj = findDriverInMaps(payload?.maps, driverNumber) || null;
    return (
      driverObj?.full_name ||
      driverObj?.name ||
      driverObj?.displayName ||
      driverObj?.longName ||
      `#${driverNumber}`
    );
  };

  const parseEventDate = (...values) => {
    for (const value of values) {
      if (!value) continue;
      const ts = new Date(value).getTime();
      if (Number.isFinite(ts)) return ts;
    }
    return null;
  };

  const formatEventClock = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const driverOrder = useMemo(() => {
    const positions = payload?.positions || {};
    const nums = new Set();

    (startingGrid || []).forEach((s) => {
      if (s?.driver_number) nums.add(String(s.driver_number));
    });

    Object.keys(positions || {}).forEach((k) => {
      nums.add(String(k));
    });

    (sessionResults || []).forEach((r) => {
      if (r?.driver_number) nums.add(String(r.driver_number));
    });

    const list = Array.from(nums).map((dn) => {
      const driverObj = findDriverInMaps(payload?.maps, dn) || null;
      const name =
        driverObj?.full_name ||
        driverObj?.name ||
        driverObj?.displayName ||
        `#${dn}`;
      const headshot =
        driverObj?.headshot ||
        driverObj?.headshot_url ||
        driverObj?.headshotUrl ||
        null;
      const teamName =
        DRIVER_TO_TEAM[String(dn)] ||
        driverObj?.team ||
        driverObj?.team_name ||
        "";
      const posObj = positions[String(dn)] || positions[Number(dn)] || null;

      const gridObj = (startingGrid || []).find(
        (s) => String(s.driver_number) === String(dn),
      );

      const pos =
        posObj?.position ?? gridObj?.position ?? gridObj?.grid_position ?? null;

      return {
        driverNumber: String(dn),
        name,
        headshot,
        teamName,
        pos: Number.isFinite(Number(pos)) ? Number(pos) : null,
      };
    });

    list.sort((a, b) => {
      if (a.pos == null && b.pos == null) return a.name.localeCompare(b.name);
      if (a.pos == null) return 1;
      if (b.pos == null) return -1;
      return a.pos - b.pos;
    });

    return list.map((item) => item.driverNumber);
  }, [payload?.maps, payload?.positions, sessionResults, startingGrid]);

  const stintChart = useMemo(() => {
    const parseNum = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const rowsByDriver = new Map();
    let minLap = Infinity;
    let maxLap = -Infinity;

    (stints || []).forEach((stint, index) => {
      const driverNumber = String(
        stint?.driver_number ??
          stint?.driverNumber ??
          stint?.driver ??
          stint?.driver_key ??
          stint?.number ??
          "",
      );
      if (!driverNumber) return;

      const driverObj = findDriverInMaps(payload?.maps, driverNumber) || null;
      const driverName =
        driverObj?.full_name ||
        driverObj?.name ||
        driverObj?.displayName ||
        driverObj?.longName ||
        `#${driverNumber}`;
      const teamName =
        driverObj?.team_name ||
        driverObj?.teamName ||
        driverObj?.team ||
        DRIVER_TO_TEAM[String(driverNumber)] ||
        "";
      const teamColor = (teamName && TEAM_COLORS[teamName]) || colors.primary;
      const compound = normalizeCompound(
        stint?.compound ??
          stint?.tyre_compound ??
          stint?.tire_compound ??
          stint?.tyre ??
          stint?.tire ??
          stint?.compound_name,
      );
      const compoundColor =
        (compound && STINT_COMPOUND_COLORS[compound]) || teamColor;

      let barStart =
        parseNum(
          stint?.lap_start ??
            stint?.start_lap ??
            stint?.lap_number_start ??
            stint?.lapNumberStart ??
            stint?.startLap ??
            stint?.lap_number ??
            stint?.lap ??
            stint?.start,
        ) ?? index + 1;
      let barEnd = parseNum(
        stint?.lap_end ??
          stint?.end_lap ??
          stint?.lap_number_end ??
          stint?.lapNumberEnd ??
          stint?.endLap ??
          stint?.end,
      );
      const stintLaps = parseNum(
        stint?.laps ?? stint?.lap_count ?? stint?.stint_length ?? stint?.length,
      );
      if (barEnd == null && stintLaps != null) {
        barEnd = barStart + Math.max(0, stintLaps - 1);
      }
      if (barEnd == null) barEnd = barStart;
      if (barEnd < barStart) {
        const tmp = barStart;
        barStart = barEnd;
        barEnd = tmp;
      }

      minLap = Math.min(minLap, barStart);
      maxLap = Math.max(maxLap, barEnd);

      if (!rowsByDriver.has(driverNumber)) {
        rowsByDriver.set(driverNumber, {
          driverNumber,
          driverName,
          teamName,
          teamColor,
          bars: [],
        });
      }

      const row = rowsByDriver.get(driverNumber);
      row.bars.push({
        key: `${driverNumber}-${index}-${barStart}-${barEnd}`,
        startLap: barStart,
        endLap: barEnd,
        compound,
        compoundColor,
      });
    });

    const orderMap = new Map(
      driverOrder.map((dn, index) => [String(dn), index]),
    );

    const rows = Array.from(rowsByDriver.values())
      .map((row) => ({
        ...row,
        bars: row.bars.sort(
          (a, b) => a.startLap - b.startLap || a.endLap - b.endLap,
        ),
      }))
      .sort((a, b) => {
        const aOrder = orderMap.has(String(a.driverNumber))
          ? orderMap.get(String(a.driverNumber))
          : Infinity;
        const bOrder = orderMap.has(String(b.driverNumber))
          ? orderMap.get(String(b.driverNumber))
          : Infinity;
        if (aOrder !== bOrder) return aOrder - bOrder;
        const aFirst = a.bars[0]?.startLap ?? Infinity;
        const bFirst = b.bars[0]?.startLap ?? Infinity;
        if (aFirst !== bFirst) return aFirst - bFirst;
        return a.driverName.localeCompare(b.driverName);
      });

    if (!rows.length) {
      return {
        rows: [],
        minLap: 1,
        maxLap: 1,
        timelineWidth: 420,
        ticks: [1],
      };
    }

    const safeMinLap = Number.isFinite(minLap) ? minLap : 1;
    const safeMaxLap = Number.isFinite(maxLap) ? maxLap : safeMinLap;
    const lapSpan = Math.max(1, safeMaxLap - safeMinLap + 1);
    const timelineWidth = Math.max(420, lapSpan * STINT_PX_PER_LAP);
    const ticks = [];
    for (let lap = safeMinLap; lap <= safeMaxLap; lap += 5) {
      ticks.push(lap);
    }
    if (ticks[ticks.length - 1] !== safeMaxLap) ticks.push(safeMaxLap);

    return {
      rows,
      minLap: safeMinLap,
      maxLap: safeMaxLap,
      timelineWidth,
      ticks,
    };
  }, [colors.primary, driverOrder, payload?.maps, stints]);

  const eventsFeed = useMemo(() => {
    const stintLookup = new Map();
    (stints || []).forEach((stint) => {
      const driverNumber = String(
        stint?.driver_number ??
          stint?.driverNumber ??
          stint?.driver ??
          stint?.driver_key ??
          stint?.number ??
          "",
      );
      const lapStart = Number(
        stint?.lap_start ??
          stint?.start_lap ??
          stint?.lap_number_start ??
          stint?.lapNumberStart ??
          stint?.startLap ??
          stint?.lap_number ??
          stint?.lap ??
          stint?.start,
      );
      if (!driverNumber || !Number.isFinite(lapStart)) return;
      stintLookup.set(`${driverNumber}:${lapStart}`, stint);
    });

    const getTeamColor = (driverNumber) => {
      const driverObj = findDriverInMaps(payload?.maps, driverNumber) || null;
      const teamName =
        DRIVER_TO_TEAM[String(driverNumber)] ||
        driverObj?.team ||
        driverObj?.team_name ||
        "";
      const teamKey = String(teamName || "").replace(/ Racing$/i, "");
      return TEAM_COLORS[teamKey] || TEAM_COLORS[teamName] || colors.primary;
    };

    const getDriverDisplayName = (driverNumber) => {
      const driverObj = findDriverInMaps(payload?.maps, driverNumber) || null;
      return (
        driverObj?.full_name ||
        driverObj?.name ||
        driverObj?.displayName ||
        driverObj?.longName ||
        `#${driverNumber}`
      );
    };

    const formatRaceControlTitle = (entry) => {
      const rawFlag = String(entry?.flag || "")
        .trim()
        .toUpperCase();
      const rawMessage = String(entry?.message || entry?.text || "").trim();
      if (rawFlag === "GREEN" || rawMessage.includes("GREEN LIGHT"))
        return "Green Light";
      if (
        rawFlag.includes("CHEQUERED") ||
        rawMessage.includes("CHEQUERED FLAG")
      )
        return "Chequered Flag";
      if (rawFlag.includes("DOUBLE YELLOW")) return "Double Yellow";
      if (rawFlag === "YELLOW") return "Yellow";
      if (rawFlag === "RED" || rawFlag.includes("RED")) return "Red Flag";
      if (rawMessage.includes("SESSION STARTED")) return "Session Start";
      if (rawMessage.includes("SESSION FINISHED")) return "Session Finish";
      if (rawMessage.includes("RISK OF RAIN")) return "Risk of Rain";
      return rawFlag ? rawFlag.replace(/_/g, " ") : "Race Control";
    };

    const getRaceControlBorderColor = (entry) => {
      const rawFlag = String(entry?.flag || "")
        .trim()
        .toUpperCase();
      const rawMessage = String(entry?.message || entry?.text || "")
        .trim()
        .toUpperCase();
      if (
        rawFlag === "GREEN" ||
        rawMessage.includes("GREEN LIGHT") ||
        rawMessage.includes("SESSION STARTED")
      ) {
        return theme.success || "#4CAF50";
      }
      if (
        rawFlag.includes("CHEQUERED") ||
        rawMessage.includes("SESSION FINISHED")
      ) {
        return theme.success || "#4CAF50";
      }
      if (
        rawFlag.includes("DOUBLE YELLOW") ||
        rawFlag === "YELLOW" ||
        rawMessage.includes("YELLOW")
      ) {
        return theme.warning || "#FF9800";
      }
      if (rawFlag.includes("RED") || rawMessage.includes("RED FLAG")) {
        return theme.error || "#F44336";
      }
      if (rawFlag.includes("BLUE") || rawMessage.includes("BLUE FLAG")) {
        return theme.info || "#2196F3";
      }
      if (
        rawMessage.includes("INCIDENT") ||
        rawMessage.includes("INVESTIGATED")
      ) {
        return theme.error || "#F44336";
      }
      return theme.textSecondary;
    };

    const getQualChip = (entry, carriedPhase) => {
      const qual = entry?.qualifying_phase;
      if (qual === null || qual === undefined || qual === "") {
        return carriedPhase != null ? `QUAL ${carriedPhase}` : null;
      }
      const num = Number(qual);
      return Number.isFinite(num) ? `QUAL ${num}` : null;
    };

    const items = [];

    const raceControlTimeline = (raceControl || [])
      .map((entry) => ({
        date: entry?.date || entry?.timestamp || null,
        lapNumber:
          entry?.lap_number !== null &&
          entry?.lap_number !== undefined &&
          entry?.lap_number !== ""
            ? Number(entry.lap_number)
            : null,
      }))
      .filter((entry) => parseEventDate(entry.date) != null)
      .sort((a, b) => parseEventDate(a.date) - parseEventDate(b.date));

    const getRaceControlLapForDate = (date) => {
      const ts = parseEventDate(date);
      if (ts == null) return null;

      let lapNumber = null;
      for (const entry of raceControlTimeline) {
        const entryTs = parseEventDate(entry.date);
        if (entryTs == null || entryTs > ts) break;
        if (Number.isFinite(entry.lapNumber)) {
          lapNumber = entry.lapNumber;
        }
      }

      return lapNumber;
    };

    const pushEvent = (event) => {
      const sortTime = parseEventDate(
        event.date,
        event.timestamp,
        event.time,
        event.created_at,
      );
      items.push({ ...event, sortTime: sortTime ?? -Infinity });
    };

    (raceControl || []).forEach((entry, index) => {
      const date = entry?.date || entry?.timestamp || null;
      const category = formatRaceControlCategory(entry?.category);
      const lapNumber =
        entry?.lap_number !== null &&
        entry?.lap_number !== undefined &&
        entry?.lap_number !== ""
          ? Number(entry.lap_number)
          : null;
      pushEvent({
        id: `rc-${index}-${date || "event"}`,
        type: "race_control",
        filterType: category,
        date,
        lapNumber: Number.isFinite(lapNumber) ? lapNumber : null,
        title: formatRaceControlTitle(entry),
        message: entry?.message || entry?.text || "",
        detail: [
          entry?.flag,
          entry?.scope,
          entry?.sector != null ? `Sector ${entry.sector}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        borderColor: getRaceControlBorderColor(entry),
        backgroundColor: theme.surface,
        icon: "flag-outline",
        qualPhaseRaw: entry?.qualifying_phase ?? null,
        raw: entry,
      });
    });

    (overtakes || []).forEach((entry, index) => {
      const overtakingDriver = String(
        entry?.overtaking_driver_number ??
          entry?.driver_number ??
          entry?.driverNumber ??
          entry?.driver ??
          "",
      );
      const overtakenDriver = String(
        entry?.overtaken_driver_number ??
          entry?.target_driver_number ??
          entry?.other_driver_number ??
          entry?.overtakenDriverNumber ??
          "",
      );
      const date = entry?.date || entry?.timestamp || null;
      const leaderLabel = overtakingDriver
        ? getDriverDisplayName(overtakingDriver)
        : "Driver";
      const targetLabel = overtakenDriver
        ? getDriverDisplayName(overtakenDriver)
        : null;
      const teamColor = overtakingDriver
        ? getTeamColor(overtakingDriver)
        : colors.primary;
      const lapNumber = getRaceControlLapForDate(date);

      pushEvent({
        id: `ov-${index}-${date || "event"}`,
        type: "overtake",
        filterType: "Overtake",
        date,
        lapNumber,
        title: "Overtake",
        message: targetLabel
          ? `${leaderLabel} OVERTAKES ${targetLabel}`
          : `${leaderLabel} OVERTAKE`,
        detail:
          entry?.position != null
            ? `For ${toOrdinal(entry.position)} Position`
            : null,
        borderColor: teamColor,
        backgroundColor: `${teamColor}33`,
        icon: "swap-horizontal-outline",
        driverColor: teamColor,
        raw: entry,
      });
    });

    (pits || []).forEach((entry, index) => {
      const driverNumber = String(
        entry?.driver_number ?? entry?.driverNumber ?? entry?.driver ?? "",
      );
      const lapNumber = Number(
        entry?.lap_number ?? entry?.lapNumber ?? entry?.lap ?? entry?.lap_no,
      );
      const date = entry?.date || entry?.timestamp || null;
      const driverLabel = driverNumber
        ? getDriverDisplayName(driverNumber)
        : "Driver";
      const pitDuration =
        entry?.pit_duration ??
        entry?.lane_duration ??
        entry?.stop_duration ??
        null;
      const stintMatch =
        driverNumber && Number.isFinite(lapNumber)
          ? stintLookup.get(`${driverNumber}:${lapNumber + 1}`) || null
          : null;
      const compound = normalizeCompound(
        stintMatch?.compound ??
          stintMatch?.tyre_compound ??
          stintMatch?.tire_compound ??
          stintMatch?.tyre ??
          stintMatch?.tire ??
          stintMatch?.compound_name,
      );
      const tyreAge =
        stintMatch?.tyre_age_at_start ?? stintMatch?.tyreAgeAtStart ?? null;
      const teamColor = driverNumber
        ? getTeamColor(driverNumber)
        : colors.primary;
      const tyreText = tyreAge === 0 ? "NEW" : tyreAge != null ? "USED" : null;

      pushEvent({
        id: `pit-${index}-${date || driverNumber || "event"}`,
        type: "pit",
        filterType: "Pit",
        date,
        lapNumber: Number.isFinite(lapNumber) ? lapNumber : null,
        title: "Pit",
        message: driverNumber
          ? `${driverLabel}: ${pitDuration != null ? `${Number(pitDuration).toFixed(1)}S ` : ""}PIT FOR ${tyreText || "USED"} ${compound ? `${String(compound).toUpperCase()} ` : ""}TIRES`
          : "Pit stop",
        detail: tyreAge != null ? `Tyre age at start ${tyreAge}` : null,
        borderColor: teamColor,
        backgroundColor: `${teamColor}33`,
        icon: "construct-outline",
        driverColor: teamColor,
        raw: entry,
      });
    });

    items.sort((a, b) => {
      if (b.sortTime !== a.sortTime) return b.sortTime - a.sortTime;
      return String(a.type).localeCompare(String(b.type));
    });

    const qualifyingMarkers = (raceControl || [])
      .map((entry) => {
        const phase = Number(entry?.qualifying_phase);
        return Number.isInteger(phase) && phase >= 1 && phase <= 3
          ? { phase, date: entry?.date || entry?.timestamp || null }
          : null;
      })
      .filter(Boolean)
      .map((entry) => ({
        phase: entry.phase,
        ts: parseEventDate(entry.date),
      }))
      .filter((marker) => marker.ts != null)
      .sort((a, b) => a.ts - b.ts);

    const sessionFinishedTs =
      (raceControl || [])
        .filter((entry) => {
          const message = String(
            entry?.message || entry?.text || "",
          ).toLowerCase();
          return (
            entry?.category === "SessionStatus" &&
            message.includes("session finished")
          );
        })
        .map((entry) => parseEventDate(entry?.date || entry?.timestamp || null))
        .filter((ts) => ts != null)
        .sort((a, b) => a - b)
        .at(-1) ?? null;

    const getQualPhaseForDate = (date) => {
      const ts = parseEventDate(date);
      if (ts == null || !qualifyingMarkers.length) return null;
      if (ts < qualifyingMarkers[0].ts) return null;
      if (sessionFinishedTs != null && ts > sessionFinishedTs) return null;

      let phase = null;
      for (const marker of qualifyingMarkers) {
        if (ts >= marker.ts) phase = marker.phase;
        else break;
      }
      return phase;
    };

    return items.map((item) => ({
      ...item,
      qualChip: (() => {
        const phase = getQualPhaseForDate(item.date);
        return phase != null ? `QUAL ${phase}` : null;
      })(),
    }));
  }, [
    colors.primary,
    overtakes,
    pits,
    raceControl,
    stints,
    payload?.maps,
    theme.error,
    theme.surface,
    theme.success,
    theme.textSecondary,
    theme.warning,
  ]);

  const eventFilterTypes = useMemo(() => {
    const unique = Array.from(
      new Set(
        (raceControl || [])
          .map((entry) => formatRaceControlCategory(entry?.category))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));

    return ["ALL", ...unique, "Pit", "Overtake"].filter(
      (type, index, array) => array.indexOf(type) === index,
    );
  }, [raceControl]);

  useEffect(() => {
    if (!eventFilterTypes.includes(activeEventType)) {
      setActiveEventType("ALL");
    }
  }, [activeEventType, eventFilterTypes]);

  const filteredEvents = useMemo(() => {
    if (activeEventType === "ALL") return eventsFeed;
    return eventsFeed.filter((item) => item.filterType === activeEventType);
  }, [activeEventType, eventsFeed]);

  const totalEventsPages = Math.max(
    1,
    Math.ceil(filteredEvents.length / EVENTS_PER_PAGE),
  );
  const visibleEvents = filteredEvents.slice(
    eventsPage * EVENTS_PER_PAGE,
    (eventsPage + 1) * EVENTS_PER_PAGE,
  );

  useEffect(() => {
    setEventsPage(0);
  }, [selectedSessionKey, activeEventType]);

  const openDriverCopyCard = (driver) => {
    setSelectedDriverCard(driver);
    setDriverCardVisible(true);
    setSessionCardVisible(false);
    setPickerOpen(false);
  };

  const openSessionCopyCard = () => {
    floatingButtonLongPressRef.current = true;
    setSessionCardVisible(true);
    setDriverCardVisible(false);
    setPickerOpen(false);
  };

  const handleFloatingButtonPress = () => {
    if (floatingButtonLongPressRef.current) {
      floatingButtonLongPressRef.current = false;
      return;
    }
    setPickerOpen((v) => !v);
  };

  const gridEntries = useMemo(() => {
    const entries = (startingGrid || []).map((entry, index) => {
      const driverNumber = String(
        entry?.driver_number ?? entry?.driverNumber ?? entry?.driver ?? "",
      );
      const driverObj = findDriverInMaps(payload?.maps, driverNumber) || null;
      const driverName =
        driverObj?.full_name ||
        driverObj?.name ||
        driverObj?.displayName ||
        driverObj?.short_name ||
        (driverNumber ? `#${driverNumber}` : `Driver ${index + 1}`);
      const teamName =
        DRIVER_TO_TEAM[String(driverNumber)] ||
        driverObj?.team ||
        driverObj?.team_name ||
        "";
      const teamKey = String(teamName || "").replace(/ Racing$/i, "");
      const teamColor =
        TEAM_COLORS[teamKey] || TEAM_COLORS[teamName] || colors.primary;
      const headshot =
        driverObj?.headshot ||
        driverObj?.headshot_url ||
        driverObj?.headshotUrl ||
        null;
      const position = Number(
        entry?.position ?? entry?.grid_position ?? entry?.order ?? index + 1,
      );
      const lapTime =
        entry?.lap_duration ?? entry?.time ?? entry?.best_lap ?? null;

      return {
        key: driverNumber || String(index),
        driverNumber,
        driverName,
        teamName,
        teamColor,
        headshot,
        position: Number.isFinite(position) ? position : index + 1,
        lapTime,
      };
    });

    entries.sort(
      (a, b) =>
        a.position - b.position || a.driverName.localeCompare(b.driverName),
    );
    return entries;
  }, [colors.primary, payload?.maps, startingGrid]);

  const gridRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < gridEntries.length; i += 2) {
      rows.push({ left: gridEntries[i], right: gridEntries[i + 1] || null });
    }
    return rows;
  }, [gridEntries]);

  const countryColor =
    getCountryColor(meeting?.country_name || meeting?.country_name) ||
    colors.primary;

  const tabs = useMemo(() => {
    if (!startingGrid.length)
      return BASE_TABS.filter((t) => t !== "Starting Grid");
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

  const renderGridDriverSlot = (driver, themeObj) => {
    const initials = (driver.driverName || "")
      .split(" ")
      .map((part) => part[0] || "")
      .slice(0, 2)
      .join("")
      .toUpperCase();

    return (
      <View style={styles.gridDriverCard}>
        <View style={styles.gridDriverTopRow}>
          <Text style={[styles.gridSlotNumber, { color: themeObj.text }]}>
            {driver.position}
          </Text>

          <View style={styles.gridHeadshotWrap}>
            {driver.headshot ? (
              <Image
                source={{ uri: driver.headshot }}
                style={[
                  styles.gridHeadshot,
                  {
                    borderColor: driver.teamColor,
                    backgroundColor: driver.teamColor + "33",
                  },
                ]}
                resizeMode="cover"
              />
            ) : (
              <View
                style={[
                  styles.gridHeadshot,
                  styles.gridHeadshotFallback,
                  {
                    borderColor: driver.teamColor,
                    backgroundColor: `${driver.teamColor}33`,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.gridHeadshotInitials,
                    { color: driver.teamColor },
                  ]}
                >
                  {initials || "D"}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.gridDriverNameBlock}>
          <Text
            style={[styles.gridDriverName, { color: themeObj.text }]}
            numberOfLines={1}
          >
            {driver.driverName}
          </Text>
          <Text
            style={[styles.gridDriverMeta, { color: driver.teamColor }]}
            numberOfLines={1}
          >
            {driver.teamName || "Team"}
          </Text>
        </View>

        <View style={styles.gridStatsRow}>
          <View
            style={[styles.gridStatCell, { borderTopColor: driver.teamColor }]}
          >
            <Text
              style={[styles.gridStatValue, { color: themeObj.text }]}
              numberOfLines={1}
            >
              {driver.lapTime != null ? formatLapTime(driver.lapTime) : "-"}
            </Text>
            <Text
              style={[
                styles.gridStatLabel,
                { color: themeObj.textSecondary, marginBottom: -10 },
              ]}
            >
              Time
            </Text>
          </View>
        </View>
      </View>
    );
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
        <Svg
          width={width}
          height={90}
          style={{ backgroundColor: theme.surface }}
        >
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

      <View
        style={[
          styles.tabBar,
          { borderBottomColor: theme.border, backgroundColor: theme.surface },
        ]}
      >
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

                  const winnerTime = Array.isArray(winnerRes.duration)
                    ? winnerRes.duration[2]
                    : winnerRes.duration
                      ? winnerRes.duration
                      : null;

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
                        <View
                          style={styles.rightGradientOverlay}
                          pointerEvents="none"
                        >
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
                                  borderWidth: 2,
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
                                  borderWidth: 2,
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
            {(() => {
              const maps = payload?.maps || {};
              const driversMap = maps.drivers || {};
              const positions = payload?.positions || {};
              const lapsByDriver = payload?.laps?.byDriver || {};
              const overtakes = Array.isArray(payload?.overtakes)
                ? payload.overtakes
                : [];
              const pits = Array.isArray(payload?.pits) ? payload.pits : [];

              // Only include drivers that appear in the positions map (preferred).
              // If positions is empty, fall back to session_results entries.
              const nums = new Set();

              // 1. Always include starting grid (baseline — ALL drivers)
              (startingGrid || []).forEach((s) => {
                if (s?.driver_number) nums.add(String(s.driver_number));
              });

              // 2. Merge in any drivers from positions (in case of edge cases)
              Object.keys(positions || {}).forEach((k) => {
                nums.add(String(k));
              });

              // 3. Optional: include session results as safety fallback
              (sessionResults || []).forEach((r) => {
                if (r?.driver_number) nums.add(String(r.driver_number));
              });

              const list = Array.from(nums).map((dn) => {
                const driverObj = findDriverInMaps(payload?.maps, dn) || null;
                const name =
                  driverObj?.full_name ||
                  driverObj?.name ||
                  driverObj?.displayName ||
                  `#${dn}`;
                const headshot =
                  driverObj?.headshot ||
                  driverObj?.headshot_url ||
                  driverObj?.headshotUrl ||
                  null;
                const teamName =
                  DRIVER_TO_TEAM[String(dn)] ||
                  driverObj?.team ||
                  driverObj?.team_name ||
                  "";
                const posObj =
                  positions[String(dn)] || positions[Number(dn)] || null;

                const gridObj = (startingGrid || []).find(
                  (s) => String(s.driver_number) === String(dn),
                );

                const pos =
                  posObj?.position ??
                  gridObj?.position ??
                  gridObj?.grid_position ?? // depending on your schema
                  null;

                const gridPos =
                  gridObj?.position ?? gridObj?.grid_position ?? null;

                const positionDelta =
                  gridPos != null && pos != null ? gridPos - pos : null;

                const lastLap = lapsByDriver[String(dn)]?.lastLap || null;
                const sectorTimes =
                  lastLap?.duration_sector_1 +
                  lastLap?.duration_sector_2 +
                  lastLap?.duration_sector_3;
                const time =
                  lastLap?.lap_duration ??
                  lastLap?.duration ??
                  sectorTimes ??
                  null;
                const lapNumber =
                  lastLap?.lap_number ?? lastLap?.lapNumber ?? null;
                const overCount = overtakes.filter(
                  (o) => String(o.driver_number) === String(dn),
                ).length;
                const pitCount = pits.filter(
                  (p) => String(p.driver_number) === String(dn),
                ).length;
                const sessionResult =
                  (sessionResults || []).find(
                    (r) => String(r.driver_number) === String(dn),
                  ) || null;
                const duration = Array.isArray(sessionResult?.duration)
                  ? (sessionResult.duration[2] ??
                    sessionResult.duration[1] ??
                    sessionResult.duration[0] ??
                    null)
                  : sessionResult?.duration || null;

                const outQual = Array.isArray(sessionResult?.duration)
                  ? !sessionResult?.duration[1]
                    ? "Q2"
                    : !sessionResult?.duration[2]
                      ? "Q3"
                      : null
                  : null;

                const driverTime =
                  lapsByDriver[String(dn)]?.driver_time ?? null;
                const driverDuration = driverTime?.time ?? null;
                const driverBehind = driverTime?.behind ?? null;

                const behindLabel =
                  driverBehind && driverBehind !== "0.000"
                    ? driverBehind.includes("Lap")
                      ? `+${driverBehind}`
                      : `+${formatLapTime(driverBehind)}`
                    : "";

                const dnfDnsDsq = (status) => {
                  const { dnf, dns, dsq } = status;
                  if (dnf) {
                    return "DNF";
                  } else if (dns) {
                    return "DNS";
                  } else if (dsq) {
                    return "DSQ";
                  } else {
                    return null;
                  }
                };

                const result = sessionResult ? dnfDnsDsq(sessionResult) : null;

                const durationTime = duration ? formatLapTime(duration) : null;

                const timeToUse = formatLapTime(driverDuration || time);
                const timeRight =
                  driverBehind && !driverBehind.includes("Laps")
                    ? driverBehind
                    : "";
                const fastestLapDisplay = formatLapTime(
                  lapsByDriver[String(dn)]?.fastest_lap?.lap_duration ?? null,
                );
                const topSpeedDisplay =
                  lapsByDriver[String(dn)]?.fastest_st_speed?.st_speed != null
                    ? String(
                        Math.round(
                          Number(
                            lapsByDriver[String(dn)]?.fastest_st_speed?.st_speed,
                          ),
                        ),
                      )
                    : "-";

                const timeLabel =
                  duration || behindLabel || driverDuration
                    ? "TIME"
                    : "LAP TIME";

                const getSegmentColor = (segment) => {
                  if (!segment) return null;

                  const validSegments = segment.filter((s) => s != null); // remove null/undefined

                  if (validSegments.length === 0) return null; // all values were null

                  if (validSegments.includes(2051)) return "#6d28d9";
                  if (validSegments.includes(2049)) return "#16a34a";
                  if (validSegments.every((s) => s === 2048)) return "#ffcf40";

                  return null;
                };

                const segment1Color = getSegmentColor(
                  lastLap?.segments_sector_1,
                );
                const segment2Color = getSegmentColor(
                  lastLap?.segments_sector_2,
                );
                const segment3Color = getSegmentColor(
                  lastLap?.segments_sector_3,
                );

                const getTextColor = (segment, color) => {
                  if (!segment) return theme.surfaceSecondary; // 👈 check raw data
                  return color === "#ffcf40" ? "#000" : "#fff";
                };

                const segment1TextColor = getTextColor(
                  lastLap?.segments_sector_1,
                  segment1Color,
                );

                const segment2TextColor = getTextColor(
                  lastLap?.segments_sector_2,
                  segment2Color,
                );

                const segment3TextColor = getTextColor(
                  lastLap?.segments_sector_3,
                  segment3Color,
                );

                return {
                  driverNumber: dn,
                  name,
                  headshot,
                  teamName,
                  pos: Number.isFinite(Number(pos)) ? Number(pos) : null,
                  gridPos,
                  positionDelta,
                  timeToUse,
                  durationTime,
                  behindLabel,
                  timeRight,
                  timeLabel,
                  outQual,
                  result,
                  laps: lapNumber,
                  overtakes: overCount,
                  overtakenCount: (overtakes || []).filter(
                    (o) => String(o.overtaken_driver_number) === String(dn),
                  ).length,
                  pits: pitCount,
                  fastestLapDisplay,
                  topSpeedDisplay,
                  segment1Color,
                  segment2Color,
                  segment3Color,
                  segment1TextColor,
                  segment2TextColor,
                  segment3TextColor,
                  getTextColor,
                };
              });

              list.sort((a, b) => {
                if (a.pos == null && b.pos == null)
                  return a.name.localeCompare(b.name);
                if (a.pos == null) return 1;
                if (b.pos == null) return -1;
                return a.pos - b.pos;
              });

              if (!list.length)
                return (
                  <Text
                    style={{
                      color: theme.textSecondary,
                      textAlign: "center",
                      fontSize: 16,
                    }}
                  >
                    Drivers will appear here when available.
                  </Text>
                );

              return list.map((d) => {
                const teamColorLocal =
                  (TEAM_COLORS && TEAM_COLORS[d.teamName]) || colors.primary;
                return (
                  <TouchableOpacity
                    key={`driver-${d.driverNumber}`}
                    style={[
                      styles.driverCard,
                      {
                        backgroundColor: theme.surface,
                        borderColor: teamColorLocal,
                      },
                    ]}
                    activeOpacity={0.85}
                    onPress={() => openDriverCopyCard(d)}
                  >
                    <View style={{ paddingHorizontal: 8, paddingVertical: 10 }}>
                      <View style={styles.driverTopRow}>
                        {d.headshot ? (
                          <Image
                            source={{ uri: d.headshot }}
                            style={[
                              styles.driverHeadshot,
                              {
                                borderColor: teamColorLocal,
                                backgroundColor: teamColorLocal + "22",
                              },
                            ]}
                          />
                        ) : (
                          <View
                            style={[
                              styles.driverHeadshot,
                              {
                                borderColor: teamColorLocal,
                                backgroundColor: teamColorLocal + "22",
                                alignItems: "center",
                                justifyContent: "center",
                              },
                            ]}
                          >
                            <Text
                              style={[styles.driverInitials, { color: "#fff" }]}
                            >
                              {String(d.name)
                                .split(" ")
                                .map((w) => w[0] || "")
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </Text>
                          </View>
                        )}

                        <View style={styles.driverNameBlock}>
                          <View style={styles.nameTopRow}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                }}
                              >
                                {d.positionDelta !== null &&
                                  d.positionDelta !== 0 &&
                                  payload?.session?.session_type === "Race" && (
                                    <Text
                                      style={{
                                        fontSize: 13,
                                        fontWeight: "800",
                                        color:
                                          d.positionDelta > 0
                                            ? theme.success
                                            : theme.error,
                                      }}
                                    >
                                      {d.positionDelta > 0
                                        ? `▲ ${d.positionDelta} · `
                                        : `▼ ${Math.abs(d.positionDelta)} · `}
                                    </Text>
                                  )}
                                <Text
                                  style={[
                                    styles.driverName,
                                    { color: theme.text },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {d.name}
                                </Text>
                              </View>
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                }}
                              >
                                <Text
                                  style={[
                                    styles.driverMeta,
                                    { color: theme.textSecondary },
                                  ]}
                                  numberOfLines={1}
                                >{`#${d.driverNumber} · ${d.teamName || ""}`}</Text>
                                {d.outQual !== null ? (
                                  <Text
                                    style={[
                                      styles.driverMeta,
                                      { color: theme.error },
                                    ]}
                                    numberOfLines={1}
                                  >{` · OUT ${d.outQual}`}</Text>
                                ) : null}
                              </View>
                            </View>
                            {d.pos !== 0 && (
                              <View style={styles.posBadgeWrap}>
                                <View
                                  style={[
                                    styles.posBadge,
                                    { backgroundColor: teamColorLocal },
                                  ]}
                                >
                                  <Text style={styles.posBadgeText}>
                                    {d.pos != null ? d.pos : "-"}
                                  </Text>
                                </View>
                                <Text
                                  style={[
                                    styles.posLabel,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  POS
                                </Text>
                              </View>
                            )}
                          </View>

                          <View style={styles.statsRow}>
                            <View style={styles.statCell}>
                              <Text
                                style={[
                                  styles.statValue,
                                  {
                                    color: d.result ? theme.error : theme.text,
                                  },
                                ]}
                              >
                                {d.result
                                  ? d.result
                                  : d.durationTime
                                    ? d.durationTime
                                    : d.behindLabel
                                      ? d.behindLabel
                                      : d.timeToUse
                                        ? d.timeToUse
                                        : "-"}
                              </Text>
                              <Text
                                style={[
                                  styles.statLabel,
                                  { color: theme.textSecondary },
                                ]}
                              >
                                {d.timeLabel}
                              </Text>
                            </View>
                            <View style={styles.statCell}>
                              <Text
                                style={[
                                  styles.statValue,
                                  { color: theme.text },
                                ]}
                              >
                                {d.laps ?? "-"}
                              </Text>
                              <Text
                                style={[
                                  styles.statLabel,
                                  { color: theme.textSecondary },
                                ]}
                              >
                                LAPS
                              </Text>
                            </View>
                            <View style={styles.statCell}>
                              <Text
                                style={[
                                  styles.statValue,
                                  { color: theme.text },
                                ]}
                              >
                                {d.pits}
                              </Text>
                              <Text
                                style={[
                                  styles.statLabel,
                                  { color: theme.textSecondary },
                                ]}
                              >
                                PITS
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>
                    {(d.segment1Color || d.segment2Color || d.segment3Color) &&
                    !isSessionFinished(session) ? (
                      <View
                        style={[
                          styles.summaryFooter,
                          {
                            borderTopColor: theme.surface,
                            backgroundColor: theme.surfaceSecondary,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.summaryFooterFill,
                            {
                              flex: 1,
                              backgroundColor:
                                d.segment1Color || theme.surfaceSecondary,
                              borderRightColor: theme.surface,
                              borderRightWidth: 2.5,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: d.segment1TextColor,
                              fontSize: 10,
                              textAlign: "center",
                              fontWeight: "600",
                            }}
                          >
                            SECTOR 1
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.summaryFooterFill,
                            {
                              flex: 1,
                              backgroundColor:
                                d.segment2Color || theme.surfaceSecondary,
                              borderRightColor: theme.surface,
                              borderRightWidth: 2.5,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: d.segment2TextColor,
                              fontSize: 10,
                              textAlign: "center",
                              fontWeight: "600",
                            }}
                          >
                            SECTOR 2
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.summaryFooterFill,
                            {
                              flex: 1,
                              backgroundColor:
                                d.segment3Color || theme.surfaceSecondary,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: d.segment3TextColor,
                              fontSize: 10,
                              textAlign: "center",
                              fontWeight: "600",
                            }}
                          >
                            SECTOR 3
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              });
            })()}
          </View>
        )}

        {activeTab === "Events" && (
          <View
            style={{ paddingHorizontal: 0, paddingTop: 12, paddingBottom: 80 }}
          >
            {eventsFeed.length ? (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.eventsFilterRow}
                >
                  {eventFilterTypes.map((type) => {
                    const active = activeEventType === type;
                    const label = type === "Race Control" ? "RC" : type;
                    return (
                      <TouchableOpacity
                        key={type}
                        activeOpacity={0.8}
                        onPress={() => setActiveEventType(type)}
                        style={[
                          styles.eventsFilterChip,
                          {
                            borderColor: active ? theme.text : theme.border,
                            backgroundColor: active
                              ? theme.surfaceSecondary
                              : theme.surface,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.eventsFilterChipText,
                            {
                              color: active ? theme.text : theme.textSecondary,
                            },
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <View style={styles.eventsCardsWrap}>
                  {visibleEvents.map((event) => {
                    const rowTextColor = theme.text;
                    const isDriverEvent =
                      event.type === "pit" || event.type === "overtake";

                    return (
                      <View key={event.id} style={styles.eventsRowWrap}>
                        <View style={styles.eventsTimeCol}>
                          <Text
                            style={[
                              styles.eventsLapText,
                              { color: theme.text },
                            ]}
                            numberOfLines={1}
                          >
                            {event.lapNumber != null
                              ? `Lap ${event.lapNumber}`
                              : "Race"}
                          </Text>
                          <Text
                            style={[
                              styles.eventsClockText,
                              { color: theme.textSecondary },
                            ]}
                            numberOfLines={1}
                          >
                            {formatEventClock(event.date)}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.eventsCard,
                            {
                              borderColor: event.borderColor || theme.border,
                              backgroundColor:
                                event.backgroundColor || theme.surface,
                            },
                          ]}
                        >
                          <View style={styles.eventsCardHeaderRow}>
                            <View style={styles.eventsTitleRow}>
                              <View
                                style={[
                                  styles.eventsIconBubble,
                                  {
                                    backgroundColor:
                                      event.borderColor || colors.primary,
                                  },
                                ]}
                              >
                                <Ionicons
                                  name={event.icon || "flag-outline"}
                                  size={12}
                                  color="#fff"
                                />
                              </View>
                              <Text
                                style={[
                                  styles.eventsCardTitle,
                                  {
                                    color: rowTextColor,
                                    fontWeight: isDriverEvent ? "900" : "800",
                                  },
                                ]}
                                numberOfLines={1}
                              >
                                {event.title?.toUpperCase()}
                              </Text>
                            </View>

                            {event.qualChip ? (
                              <View
                                style={[
                                  styles.eventsQualBadge,
                                  { backgroundColor: "transparent" },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.eventsQualBadgeText,
                                    { color: theme.text },
                                  ]}
                                >
                                  {event.qualChip}
                                </Text>
                              </View>
                            ) : null}
                          </View>

                          <Text
                            style={[
                              styles.eventsCardMainText,
                              { color: rowTextColor },
                            ]}
                            numberOfLines={2}
                          >
                            {event.message}
                          </Text>

                          {event.detail ? (
                            <Text
                              style={[
                                styles.eventsCardSubText,
                                { color: rowTextColor },
                              ]}
                              numberOfLines={2}
                            >
                              {event.detail}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.eventsPagerRow}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={eventsPage <= 0}
                    onPress={() => setEventsPage((idx) => Math.max(0, idx - 1))}
                    style={[
                      styles.eventsPagerBtn,
                      {
                        borderColor: theme.border,
                        backgroundColor: theme.surface,
                        opacity: eventsPage <= 0 ? 0.45 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.eventsPagerBtnText, { color: theme.text }]}
                    >
                      Previous
                    </Text>
                  </TouchableOpacity>

                  <Text
                    style={[
                      styles.eventsPagerLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Page {eventsPage + 1} of {totalEventsPages}
                  </Text>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={eventsPage >= totalEventsPages - 1}
                    onPress={() =>
                      setEventsPage((idx) =>
                        Math.min(totalEventsPages - 1, idx + 1),
                      )
                    }
                    style={[
                      styles.eventsPagerBtn,
                      {
                        borderColor: theme.border,
                        backgroundColor: theme.surface,
                        opacity: eventsPage >= totalEventsPages - 1 ? 0.45 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.eventsPagerBtnText, { color: theme.text }]}
                    >
                      Next
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <Text
                style={{
                  color: theme.textSecondary,
                  textAlign: "center",
                  fontSize: 16,
                }}
              >
                Events will appear here when available.
              </Text>
            )}
          </View>
        )}

        {activeTab === "Stints" && (
          <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
            {stintChart.rows.length ? (
              <>
                <View
                  style={[
                    styles.stintsChartCard,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <ScrollView
                    horizontal
                    bounces={false}
                    showsHorizontalScrollIndicator
                    contentContainerStyle={{
                      width: STINT_NAME_COL_W + stintChart.timelineWidth,
                    }}
                  >
                    <View
                      style={{
                        width: STINT_NAME_COL_W + stintChart.timelineWidth,
                      }}
                    >
                      <View style={styles.stintsChartBodyRow}>
                        <View
                          style={[
                            styles.stintsNamesColumn,
                            {
                              width: STINT_NAME_COL_W,
                              borderRightColor: theme.border,
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.stintsAxisTopPad,
                              { borderBottomColor: theme.border },
                            ]}
                          />

                          {stintChart.rows.map((row) => (
                            <View
                              key={`stint-name-${row.driverNumber}`}
                              style={[
                                styles.stintsDriverRow,
                                {
                                  height: STINT_ROW_HEIGHT,
                                  borderBottomColor: theme.border,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.stintsDriverName,
                                  { color: theme.text },
                                ]}
                                numberOfLines={1}
                              >
                                {row.driverName}
                              </Text>
                              <Text
                                style={[
                                  styles.stintsDriverTeam,
                                  { color: row.teamColor },
                                ]}
                                numberOfLines={1}
                              >
                                {row.teamName || "Team"}
                              </Text>
                            </View>
                          ))}
                        </View>

                        <ScrollView
                          horizontal
                          bounces={false}
                          showsHorizontalScrollIndicator
                          contentContainerStyle={{
                            width: stintChart.timelineWidth,
                          }}
                        >
                          <View style={{ width: stintChart.timelineWidth }}>
                            <View
                              style={[
                                styles.stintsAxisTopPad,
                                { borderBottomColor: theme.border },
                              ]}
                            >
                              {stintChart.ticks.map((tick) => {
                                const left =
                                  (tick - stintChart.minLap) * STINT_PX_PER_LAP;
                                return (
                                  <Text
                                    key={`stint-top-tick-${tick}`}
                                    style={[
                                      styles.stintsAxisTopLabel,
                                      {
                                        color: theme.textTertiary,
                                        left,
                                      },
                                    ]}
                                  >
                                    L{tick}
                                  </Text>
                                );
                              })}
                            </View>

                            {stintChart.rows.map((row) => (
                              <View
                                key={`stint-row-${row.driverNumber}`}
                                style={[
                                  styles.stintsRowTimeline,
                                  {
                                    height: STINT_ROW_HEIGHT,
                                    borderBottomColor: theme.border,
                                  },
                                ]}
                              >
                                {stintChart.ticks.map((tick) => {
                                  const left =
                                    (tick - stintChart.minLap) *
                                    STINT_PX_PER_LAP;
                                  return (
                                    <View
                                      key={`stint-grid-${row.driverNumber}-${tick}`}
                                      style={[
                                        styles.stintsGridLine,
                                        {
                                          left,
                                          backgroundColor: theme.border,
                                        },
                                      ]}
                                    />
                                  );
                                })}

                                {row.bars.map((bar) => {
                                  const left =
                                    (bar.startLap - stintChart.minLap) *
                                    STINT_PX_PER_LAP;
                                  const width = Math.max(
                                    4,
                                    (bar.endLap - bar.startLap + 1) *
                                      STINT_PX_PER_LAP,
                                  );
                                  return (
                                    <View
                                      key={bar.key}
                                      style={[
                                        styles.stintsBar,
                                        {
                                          left,
                                          width,
                                          backgroundColor:
                                            bar.compoundColor || row.teamColor,
                                        },
                                      ]}
                                    />
                                  );
                                })}
                              </View>
                            ))}
                          </View>
                        </ScrollView>
                      </View>
                    </View>
                  </ScrollView>
                </View>

                <View
                  style={[
                    styles.stintsLegendCard,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.surface,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.stintsLegendTitle,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Tire compounds
                  </Text>
                  <View style={styles.stintsLegendRow}>
                    {STINT_COMPOUND_ORDER.map((compound) => {
                      const label =
                        compound === "INTERMEDIATE"
                          ? "Intermediate"
                          : compound.charAt(0) +
                            compound.slice(1).toLowerCase();
                      return (
                        <View key={compound} style={styles.stintsLegendItem}>
                          <SvgUri
                            uri={TIRE_IMAGES[compound]}
                            width={28}
                            height={16}
                          />
                          <View
                            style={[
                              styles.stintsLegendSwatch,
                              {
                                backgroundColor:
                                  STINT_COMPOUND_COLORS[compound],
                              },
                            ]}
                          />
                          <Text
                            style={[
                              styles.stintsLegendLabel,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </>
            ) : (
              <Text
                style={{
                  color: theme.textSecondary,
                  textAlign: "center",
                  fontSize: 16,
                }}
              >
                Stints data will appear here when available.
              </Text>
            )}
          </View>
        )}

        {activeTab === "Starting Grid" && (
          <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
            {gridEntries.length ? (
              <>
                <View
                  style={[
                    styles.gridContainer,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <View style={styles.checkeredHeaderContainer}>
                    <View style={styles.checkeredBar}>
                      {Array.from({ length: 14 }, (_, i) => (
                        <View
                          key={`grid-checker-top-${i}`}
                          style={[
                            styles.checkeredSquare,
                            {
                              backgroundColor:
                                i % 2 === 0 ? "#FFFFFF" : "#000000",
                            },
                          ]}
                        />
                      ))}
                    </View>
                    <View style={styles.checkeredBar}>
                      {Array.from({ length: 14 }, (_, i) => (
                        <View
                          key={`grid-checker-bottom-${i}`}
                          style={[
                            styles.checkeredSquare,
                            {
                              backgroundColor:
                                i % 2 === 0 ? "#000000" : "#FFFFFF",
                            },
                          ]}
                        />
                      ))}
                    </View>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false}>
                    {gridRows.map((row, rowIndex) => (
                      <View
                        key={`grid-row-${rowIndex}`}
                        style={styles.gridRowContainer}
                      >
                        <View
                          style={[
                            styles.gridPositionSlot,
                            styles.gridPositionLeft,
                            {
                              borderColor: row.left?.teamColor ?? theme.border,
                              marginBottom: 40,
                            },
                          ]}
                        >
                          {row.left
                            ? renderGridDriverSlot(row.left, theme)
                            : null}
                        </View>

                        <View
                          style={[
                            styles.gridPositionSlot,
                            styles.gridPositionRight,
                            {
                              borderColor: row.right?.teamColor ?? theme.border,
                              marginTop: 40,
                            },
                          ]}
                        >
                          {row.right
                            ? renderGridDriverSlot(row.right, theme)
                            : null}
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </>
            ) : (
              <Text
                style={{
                  color: theme.textSecondary,
                  textAlign: "center",
                  fontSize: 16,
                }}
              >
                No starting grid data.
              </Text>
            )}
          </View>
        )}
      </ScrollView>
      <RaceDetailsDriverCopyCard
        visible={driverCardVisible}
        onClose={() => setDriverCardVisible(false)}
        driverData={selectedDriverCard}
        session={session}
        meeting={effectiveMeeting}
        colors={colors}
        theme={theme}
      />

      <RaceDetailsSessionCopyCard
        visible={sessionCardVisible}
        onClose={() => setSessionCardVisible(false)}
        session={session}
        meeting={effectiveMeeting}
        sessionResults={sessionResults}
        maps={payload?.maps}
        colors={colors}
        theme={theme}
      />

      {/* Session picker overlay + floating button */}
      {pickerOpen &&
        selectedSessionKey !== null &&
        (console.log(
          "Rendering session picker overlay with sessionsList:",
          sessionsList,
          "and selectedSessionKey:",
          selectedSessionKey,
        ),
        (
          <View style={styles.sessionPickerOverlay} pointerEvents="box-none">
            <TouchableWithoutFeedback onPress={() => setPickerOpen(false)}>
              <View style={styles.sessionPickerBackdrop} />
            </TouchableWithoutFeedback>
            <View
              style={styles.sessionPickerContainer}
              pointerEvents="box-none"
            >
              {sessionsList && sessionsList.length ? (
                // Filter out the session that matches selectedSessionKey
                sessionsList
                  .filter(
                    (s) =>
                      s.session_key !== selectedSessionKey &&
                      s.session_key !== payload?.session?.session_key,
                  ) // Exclude the current session
                  .map((s) => {
                    const isLive = isSessionLive(s);
                    const bg = isLive
                      ? theme.error || "#b00020"
                      : colors.primary;
                    return (
                      <TouchableOpacity
                        key={`${s.session_key}`}
                        activeOpacity={0.85}
                        onPress={() => {
                          fetchSessionByKey(s.session_key); // Fetch the session details when selected
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
                          style={[
                            styles.sessionButtonLabel,
                            { color: "white" },
                          ]}
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
        ))}

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
              delayLongPress={500}
              onLongPress={openSessionCopyCard}
              onPress={handleFloatingButtonPress}
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
  eventsSectionWrap: {
    paddingTop: 12,
    paddingBottom: 96,
  },
  eventsFilterRow: {
    gap: 8,
    paddingHorizontal: 12,
  },
  eventsFilterChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  eventsFilterChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  eventsCardsWrap: {
    marginTop: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  eventsRowWrap: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  eventsTimeCol: {
    width: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
  },
  eventsLapText: {
    fontSize: 13,
    fontWeight: "800",
  },
  eventsClockText: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "700",
  },
  eventsCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  eventsCardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  eventsTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  eventsIconBubble: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  eventsCardTitle: {
    fontSize: 12,
    letterSpacing: 0.2,
    flex: 1,
  },
  eventsCardMainText: {
    marginTop: 7,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 17,
  },
  eventsCardSubText: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
  eventsQualBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  eventsQualBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  eventsPagerRow: {
    marginTop: 8,
    marginHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eventsPagerBtn: {
    minWidth: 92,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  eventsPagerBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  eventsPagerLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  eventsSummaryCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  eventsSummaryTitle: {
    fontSize: 14,
    fontWeight: "900",
  },
  eventsSummaryMeta: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "700",
  },
  eventCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  eventTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  eventBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  eventBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  eventDate: {
    fontSize: 11,
    fontWeight: "700",
    flexShrink: 1,
    textAlign: "right",
  },
  eventMessage: {
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
  },
  eventDetail: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  eventsPager: {
    marginTop: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  eventsPagerBtn: {
    minWidth: 72,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    alignItems: "center",
  },
  eventsPagerBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  eventsPagerText: {
    fontSize: 12,
    fontWeight: "800",
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
    borderWidth: 2,
  },
  candTitle: { fontSize: 10, fontWeight: "500" },
  candName: { fontSize: 14, fontWeight: "800" },
  /* Drivers / Player-like card styles (inspired by BoxScorePanel) */
  driverCard: {
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    overflow: "hidden",
  },
  driverTopRow: { flexDirection: "row", alignItems: "center" },
  driverHeadshot: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    overflow: "hidden",
  },
  driverInitials: { fontSize: 16, fontWeight: "800" },
  driverNameBlock: { flex: 1, marginLeft: 10 },
  nameTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  driverName: { fontSize: 14, fontWeight: "800" },
  driverMeta: { fontSize: 12, marginTop: 2 },
  posBadgeWrap: { alignItems: "center", justifyContent: "center" },
  posBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  posBadgeText: { color: "white", fontSize: 14, fontWeight: "800" },
  posLabel: { fontSize: 10, marginTop: 4, fontWeight: "700" },
  statsRow: {
    flexDirection: "row",
    marginTop: 8,
    justifyContent: "space-between",
  },
  statCell: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 15, fontWeight: "800" },
  statLabel: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  summaryFooter: {
    height: 12.5,
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    width: "100%",
  },
  summaryFooterFill: {
    height: "100%",
  },
  stintsChartCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  stintsChartBodyRow: {
    flexDirection: "row",
  },
  stintsNamesColumn: {
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  stintsAxisTopPad: {
    height: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    position: "relative",
  },
  stintsAxisTopLabel: {
    position: "absolute",
    top: 4,
    width: 28,
    marginLeft: -14,
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  stintsDriverRow: {
    paddingHorizontal: 10,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stintsDriverName: {
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 17,
  },
  stintsDriverTeam: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14,
  },
  stintsRowTimeline: {
    position: "relative",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stintsGridLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    opacity: 0.7,
  },
  stintsBar: {
    position: "absolute",
    top: 12,
    height: 22,
    borderRadius: 8,
    opacity: 0.95,
  },
  stintsEmptyWrap: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  stintsEmptyText: {
    fontSize: 13,
    textAlign: "center",
    fontWeight: "500",
  },
  gridContainer: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  checkeredHeaderContainer: {
    paddingHorizontal: 0,
    paddingTop: 0,
    gap: 0,
    marginBottom: 12,
  },
  checkeredBar: {
    flexDirection: "row",
    height: 15,
    overflow: "hidden",
  },
  checkeredSquare: {
    flex: 1,
    height: "100%",
  },
  gridRowContainer: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 10,
  },
  gridPositionSlot: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  gridPositionLeft: {},
  gridPositionRight: {},
  gridDriverCard: {
    minHeight: 150,
  },
  gridDriverTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  gridSlotNumber: {
    fontSize: 18,
    fontWeight: "900",
  },
  gridHeadshotWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  gridHeadshot: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  gridHeadshotFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  gridHeadshotInitials: {
    fontSize: 16,
    fontWeight: "900",
  },
  gridDriverNameBlock: {
    marginBottom: 10,
  },
  gridDriverName: {
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 18,
  },
  gridDriverMeta: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
  },
  gridStatsRow: {
    flexDirection: "row",
  },
  gridStatCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  gridStatValue: {
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 18,
  },
  gridStatLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  stintsLegendCard: {
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  stintsLegendTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  stintsLegendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  stintsLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 104,
  },
  stintsLegendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  stintsLegendLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
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

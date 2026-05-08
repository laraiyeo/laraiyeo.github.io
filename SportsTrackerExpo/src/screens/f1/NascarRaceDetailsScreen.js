import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Rect,
  Path,
  Stop,
} from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { useGamePresence } from "../../hooks/useGamePresence";

const { width } = Dimensions.get("window");

const NASCAR_RACE_API =
  "https://laraiyeogithubio-production-ed10.up.railway.app/nascar/race";
const NASCAR_CACHE_PREFIX = "nascar_race_details:";
const TAB_KEYS = [
  "Main",
  "Drivers",
  "Events",
  "Stints",
  "Flow",
  "Starting Grid",
];

const NASCAR_MANUFACTURER_COLORS = {
  chevrolet: "#FFD700",
  ford: "#003399",
  toyota: "#E60012",
};

const STINT_COMPOUND_COLORS = {
  SOFT: "#ED1C24",
  MEDIUM: "#FFD200",
  HARD: "#F0F0F0",
  INTERMEDIATE: "#43B02A",
  WET: "#0067AD",
};

const STINT_COMPOUND_ORDER = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"];

const getInitials = (name = "") => {
  const parts = String(name).split(/\s+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0] || "")
      .join("")
      .toUpperCase() || "--"
  );
};

const toDateLabel = (value) => {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDuration = (seconds) => {
  if (seconds === null || seconds === undefined || seconds === -1) return "--";
  const total = Number(seconds);
  if (Number.isNaN(total)) return "--";
  const mins = Math.floor(total / 60);
  const secs = (total % 60).toFixed(1).padStart(4, "0");
  return mins > 0 ? `${mins}:${secs}` : `${secs}s`;
};

const getManufacturerName = (raw) => {
  const value = String(raw || "").toLowerCase();
  if (value.includes("chv")) return "Chevrolet";
  if (value.includes("frd")) return "Ford";
  if (value.includes("tyt")) return "Toyota";
  if (value.includes("chev")) return "Chevrolet";
  if (value.includes("ford")) return "Ford";
  if (value.includes("toyota")) return "Toyota";
  return raw || "Unknown";
};

const getManufacturerColor = (raw) => {
  const value = String(raw || "").toLowerCase();
  if (value.includes("chv") || value.includes("chev"))
    return NASCAR_MANUFACTURER_COLORS.chevrolet;
  if (value.includes("frd") || value.includes("ford"))
    return NASCAR_MANUFACTURER_COLORS.ford;
  if (value.includes("tyt") || value.includes("toyota"))
    return NASCAR_MANUFACTURER_COLORS.toyota;
  return "#909090";
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

const flowStyles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardBody: {
    paddingBottom: 12,
  },
  filterBar: {
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 8,
    alignItems: "center",
    gap: 8,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 18,
    borderWidth: 1.5,
    marginRight: 8,
    backgroundColor: "transparent",
  },
  chipAll: {
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "transparent",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ddd",
  },
  chartWrap: {
    paddingHorizontal: 0,
    paddingTop: 4,
  },
  flowHeaderRow: {
    height: 28,
    position: "relative",
  },
  flowHeaderLabel: {
    position: "absolute",
    top: 4,
    width: 34,
    marginLeft: -17,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  flowScrollInner: {
    position: "relative",
  },
  flowChartSvg: {
    marginTop: 2,
  },
});

const computeNascarStatus = (raceDate) => {
  const startMs = raceDate ? Date.parse(raceDate) : null;
  if (!startMs || Number.isNaN(startMs)) return "off";
  const nowMs = Date.now();
  return nowMs >= startMs && nowMs <= startMs + 3 * 60 * 60 * 1000
    ? "live"
    : "off";
};

const CardGradient = ({ gradId, accentColor }) => (
  <Svg
    style={StyleSheet.absoluteFillObject}
    width="100%"
    height="100%"
    pointerEvents="none"
  >
    <Defs>
      <SvgLinearGradient
        id={`nascarGrad_${gradId}`}
        x1="0%"
        y1="0%"
        x2="100%"
        y2="0%"
      >
        <Stop offset="0%" stopColor={accentColor} stopOpacity="0.28" />
        <Stop offset="55%" stopColor={accentColor} stopOpacity="0" />
      </SvgLinearGradient>
    </Defs>
    <Rect width="100%" height="100%" fill={`url(#nascarGrad_${gradId})`} />
  </Svg>
);

const HeaderGradient = ({ theme }) => (
  <Svg
    width={width}
    height={90}
    style={{ backgroundColor: theme.surface }}
    pointerEvents="none"
  >
    <Defs>
      <SvgLinearGradient
        id="nascarHeaderGrad"
        x1="0%"
        y1="0%"
        x2="100%"
        y2="0%"
      >
        <Stop offset="0%" stopColor="#3C3B6E" stopOpacity="0.28" />
        <Stop offset="65%" stopColor="#3C3B6E" stopOpacity="0" />
      </SvgLinearGradient>
    </Defs>
    <Rect width="100%" height="100%" fill="url(#nascarHeaderGrad)" />
  </Svg>
);

const TabButton = ({ active, label, onPress, colors, theme }) => (
  <TouchableOpacity
    onPress={onPress}
    style={[
      styles.tabButton,
      {
        borderBottomColor: active ? colors.primary : "transparent",
      },
    ]}
  >
    <Text
      allowFontScaling={false}
      style={{
        color: active ? colors.primary : theme.textSecondary,
        fontSize: 14,
        fontWeight: active ? "700" : "500",
      }}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

const SectionCard = ({ title, children, theme, colors, accentColor }) => (
  <View
    style={[
      styles.sectionCard,
      {
        backgroundColor: theme.surface,
        borderWidth: title === "Flag Legend" ? 1 : 0,
        borderColor: theme.border,
      },
    ]}
  >
    <View style={styles.sectionHeader}>
      <Text
        allowFontScaling={false}
        style={[styles.sectionTitle, { color: theme.text }]}
      >
        {title}
      </Text>
    </View>
    {children}
  </View>
);

const NascarRaceDetailsScreen = ({ route }) => {
  const { theme, colors } = useTheme();
  const params = route?.params || {};
  const raceId = String(params.raceId || params.race_id || "");
  const initialRaceName =
    params.raceName || params.race_name || "NASCAR Race Details";
  const initialRaceDate = params.raceDate || params.race_date || null;
  const initialStatus = params.status || computeNascarStatus(initialRaceDate);

  const [selectedTab, setSelectedTab] = useState("Main");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [racePayload, setRacePayload] = useState(null);
  const [resolvedStatus, setResolvedStatus] = useState(initialStatus);
  const [eventsPage, setEventsPage] = useState(1);
  const EVENTS_PAGE_SIZE = 20;

  const { viewerData, isJoined } = useGamePresence(
    raceId + "-" + params.runType,
  );

  const cacheKey = useMemo(
    () => `${NASCAR_CACHE_PREFIX}${raceId}:${resolvedStatus}`,
    [raceId, resolvedStatus],
  );

  const loadRace = useCallback(async () => {
    if (!raceId) {
      setError("Missing race id");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const computed = params.status || computeNascarStatus(initialRaceDate);
    setResolvedStatus(computed);

    try {
      const raw = await AsyncStorage.getItem(
        `${NASCAR_CACHE_PREFIX}${raceId}:${computed}`,
      );
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached?.ts && Date.now() - cached.ts < 1000 * 60 * 10) {
          setRacePayload(cached.data);
          setLoading(false);
          return;
        }
      }

      console.log(`[NascarRaceDetailsScreen] page load status: ${computed}`);
      const resp = await fetch(`${NASCAR_RACE_API}/${raceId}/${computed}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const actual = json?.data ?? json;
      setRacePayload(actual);

      try {
        await AsyncStorage.setItem(
          `${NASCAR_CACHE_PREFIX}${raceId}:${computed}`,
          JSON.stringify({ ts: Date.now(), data: actual }),
        );
      } catch (cacheError) {
        console.warn(
          "[NascarRaceDetailsScreen] cache write failed",
          cacheError,
        );
      }
    } catch (fetchError) {
      setError(fetchError?.message || "Failed to load NASCAR race details");
    } finally {
      setLoading(false);
    }
  }, [raceId, initialRaceDate, params.status]);

  useEffect(() => {
    loadRace();
  }, [loadRace]);

  const race =
    racePayload?.weekend?.weekend_race?.[0] ||
    racePayload?.weekend_race?.[0] ||
    {};
  const track = racePayload?.track || {};
  const drivers = racePayload?.lap_times?.laps || [];
  const flags = racePayload?.lap_times?.flags || [];
  const livePit = racePayload?.live_pit || {};
  const lapNotes = racePayload?.lap_notes?.laps || {};
  const weekendRuns = racePayload?.weekend?.weekend_runs || [];

  // Flow chart state & refs (copied/adapted from RaceDetails)
  const [flowSelectedDrivers, setFlowSelectedDrivers] = useState(new Set());
  const flowFilterScrollRef = useRef(null);
  const flowFilterScrollXRef = useRef(0);
  const flowChartScrollRef = useRef(null);
  const flowChartScrollXRef = useRef(0);

  // Stints state (single driver, expandable pits)
  const [stintsSelectedDriver, setStintsSelectedDriver] = useState(null);
  const [stintsExpandedPitIndex, setStintsExpandedPitIndex] = useState(0);

  const driverOrder = useMemo(() => {
    return (drivers || []).map(
      (d) => d?.Number ?? d?.NASCARDriverID ?? d?.NASCARDriverID,
    );
  }, [drivers]);

  const toggleFlowDriver = useCallback((dn) => {
    setFlowSelectedDrivers((prev) => {
      const s = new Set(prev);
      if (s.has(String(dn))) {
        s.delete(String(dn));
      } else if (s.size < 3) {
        s.add(String(dn));
      }
      return s;
    });
  }, []);

  // Auto-select top 3 drivers on component mount
  useEffect(() => {
    const top3 = sortedDrivers
      .slice(0, 3)
      .map((d) => String(d?.Number ?? d?.NASCARDriverID));
    setFlowSelectedDrivers(new Set(top3));
  }, []);

  // Auto-select first driver for Stints tab
  useEffect(() => {
    if (sortedDrivers.length > 0 && !stintsSelectedDriver) {
      // Select the driver in first position (RunningPos = 1)
      const firstPositionDriver =
        sortedDrivers.find((d) => d?.RunningPos === 1) || sortedDrivers[0];
      setStintsSelectedDriver(
        String(
          firstPositionDriver?.Number ?? firstPositionDriver?.NASCARDriverID,
        ),
      );
    }
  }, [sortedDrivers, stintsSelectedDriver]);

  const handleFlowFilterScroll = useCallback((e) => {
    flowFilterScrollXRef.current = e.nativeEvent.contentOffset.x;
  }, []);

  const handleFlowChartScroll = useCallback((e) => {
    flowChartScrollXRef.current = e.nativeEvent.contentOffset.x;
  }, []);

  const DriverFilterBar = ({
    driverNumbers,
    selectedSet,
    onToggle,
    filterScrollRef,
    onFilterScroll,
  }) => {
    return (
      <ScrollView
        ref={filterScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={flowStyles.filterBar}
        scrollEventThrottle={16}
        bounces={false}
        onScroll={onFilterScroll}
      >
        {(driverNumbers || []).map((dn) => {
          const d =
            (drivers || []).find(
              (x) =>
                String(x?.Number ?? x?.NASCARDriverID ?? x?.NASCARDriverID) ===
                String(dn),
            ) || {};
          const name = d?.FullName || d?.Fullname || d?.Full || `#${dn}`;
          const last = (name || "").split(" ").slice(-1)[0] || name;
          const label = `#${dn} · ${String(last).toUpperCase()}`;
          const color = getManufacturerColor(d?.Manufacturer) || colors.primary;
          const selected = !!selectedSet.has(String(dn));
          return (
            <TouchableOpacity
              key={dn}
              onPress={() => onToggle(String(dn))}
              style={[
                flowStyles.chip,
                selected && { backgroundColor: color, borderColor: color },
                !selected && { borderColor: color },
              ]}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  flowStyles.chipText,
                  selected && { color: getF1TextOnColor(color) },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  };

  const raceTitle = race.race_name || initialRaceName;
  const raceDate = race.race_date || race.date_scheduled || initialRaceDate;
  const trackName = track.track_name || race.track_name || "Track";
  const trackImage = track.track_image || track.track_image_thumbnail || null;
  const trackLogo = track.track_logo || null;
  const raceComment =
    racePayload?.race_list_basic?.race_comments || race.race_comments || "";
  const scheduleItems =
    racePayload?.race_list_basic?.schedule || race.schedule || [];
  const accentColor = getManufacturerColor(drivers[0]?.Manufacturer);

  const scheduledLaps =
    racePayload?.race_list_basic?.scheduled_laps ??
    race?.scheduled_laps ??
    race?.sch_laps ??
    null;

  const trackLengthMi =
    track?.length_mi ??
    track?.lengthMiles ??
    track?.length_miles ??
    track?.track_length_mi ??
    track?.length ??
    null;

  const trackCapacity = track?.capacity ?? null;

  const flagLabel = (state) => {
    switch (state) {
      case 0:
        return "None";
      case 1:
        return "Green Flag";
      case 2:
        return "Yellow Flag";
      case 3:
        return "Red Flag";
      case 4:
        return "White Flag";
      case 5:
        return "Checkered Flag";
      case 6:
        return "Who Knows 1";
      case 7:
        return "Who Knows 2";
      case 8:
        return "Hot Track";
      case 9:
        return "Cold Track";
      default:
        return "Unaccounted For Flag";
    }
  };

  const flagColor = (state) => {
    switch (state) {
      case 0:
        return "#909090";
      case 1:
        return "#2E8B57"; // green
      case 2:
        return "#E1C700"; // yellow
      case 3:
        return "#D22B2B"; // red
      case 4:
        return "#FFFFFF"; // white
      case 5:
        return "#000000"; // checkered (black)
      case 6:
        return "#9C27B0";
      case 7:
        return "#FF5722";
      case 8:
        return "#FF8C00";
      case 9:
        return "#1E90FF";
      default:
        return "#666666";
    }
  };

  const buildDriverLookup = () => {
    const map = {};
    const pushFrom = (arr) => {
      if (!Array.isArray(arr)) return;
      arr.forEach((r) => {
        const num =
          r?.car_number ??
          r?.carNumber ??
          r?.number ??
          r?.Number ??
          r?.vehicle_number ??
          r?.car ??
          null;
        const name =
          r?.driver_name ??
          r?.DriverName ??
          r?.FullName ??
          r?.name ??
          `${r?.first_name || ""} ${r?.last_name || ""}`.trim();
        if (num != null && name) {
          map[String(num)] = name;
        }
      });
    };

    pushFrom(racePayload?.weekend?.weekend_race?.[0]?.results || []);
    pushFrom(racePayload?.weekend?.weekend_runs || []);
    pushFrom(racePayload?.loopstats?.[0]?.drivers || []);
    // also inspect nested run results
    (racePayload?.weekend?.weekend_runs || []).forEach((run) => {
      if (Array.isArray(run?.results)) pushFrom(run.results);
    });

    return map;
  };

  const driverLookup = useMemo(() => buildDriverLookup(), [racePayload]);

  const resolveDriverName = (num) => {
    if (num == null) return null;
    return driverLookup[String(num)] || null;
  };

  const replaceDriverRefs = (text = "") => {
    if (!text) return text;
    // Replace patterns like #12 or #{12}
    return String(text).replace(/#\{?(\d{1,3})\}?/g, (m, p1) => {
      const name = resolveDriverName(p1);
      return name || m;
    });
  };

  const extractNoteText = (note) => {
    if (note == null) return "";
    if (typeof note === "string") return note;
    if (typeof note === "number") return String(note);
    if (Array.isArray(note))
      return note.map(extractNoteText).filter(Boolean).join(" ");
    if (typeof note === "object") {
      const keys = [
        "notes",
        "note",
        "text",
        "message",
        "description",
        "report",
        "note_text",
        "body",
      ];
      for (const k of keys) {
        const v = note[k];
        if (v) return extractNoteText(v);
      }
      // Prefer string fields; ignore numeric ids and flag fields
      const parts = Object.entries(note)
        .filter(([k, v]) => {
          const key = String(k).toLowerCase();
          if (
            key.includes("id") ||
            key.includes("flag") ||
            key.includes("state")
          )
            return false;
          return typeof v === "string" && v.trim();
        })
        .map(([, v]) => String(v).trim());
      if (parts.length) return parts.join(" - ");
      // Fallback: look for any nested string values
      const nested = Object.values(note)
        .filter((v) => typeof v === "object" || Array.isArray(v))
        .map(extractNoteText)
        .filter(Boolean);
      if (nested.length) return nested.join(" ");
      return "";
    }
    return String(note);
  };

  const sortedDrivers = useMemo(() => {
    return [...drivers].sort(
      (a, b) => (a.RunningPos || 999) - (b.RunningPos || 999),
    );
  }, [drivers]);

  const topThree = sortedDrivers.slice(0, 3);
  const pitStops = useMemo(() => {
    const rows = Object.values(livePit).flat();
    return [...rows].sort(
      (a, b) => (a.pit_in_race_time || 0) - (b.pit_in_race_time || 0),
    );
  }, [livePit]);

  const flowRows = useMemo(() => {
    return flags.map((flag, idx) => ({
      lap: flag.LapsCompleted,
      state: flag.FlagState,
      key: `${flag.LapsCompleted}-${idx}`,
    }));
  }, [flags]);

  const renderDriverBadge = (driver, idx) => {
    const manufacturer = getManufacturerName(driver.Manufacturer);
    const color = getManufacturerColor(driver.Manufacturer);
    return (
      <View
        key={`${driver.Number}-${idx}`}
        style={[
          styles.driverCard,
          { borderColor: theme.border, backgroundColor: theme.surface },
        ]}
      >
        <CardGradient
          gradId={`driver-${driver.Number}-${idx}`}
          accentColor={color}
        />
        <View style={styles.driverCardInner}>
          <View style={styles.driverLeftCol}>
            <View style={[styles.driverAvatar, { backgroundColor: color }]}>
              <Text allowFontScaling={false} style={styles.driverAvatarText}>
                {getInitials(driver.FullName)}
              </Text>
            </View>
            <Text
              allowFontScaling={false}
              style={[styles.driverPos, { color: theme.textSecondary }]}
            >
              #{driver.RunningPos || "--"}
            </Text>
          </View>
          <View style={styles.driverMidCol}>
            <Text
              allowFontScaling={false}
              style={[styles.driverName, { color: theme.text }]}
              numberOfLines={1}
            >
              {driver.FullName || "Driver"}
            </Text>
            <Text
              allowFontScaling={false}
              style={[styles.driverMeta, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {manufacturer} · Car #{driver.Number || "--"}
            </Text>
          </View>
          <View style={styles.driverRightCol}>
            <Text
              allowFontScaling={false}
              style={[styles.driverMetric, { color: theme.text }]}
            >
              {driver.RunningPos || "--"}
            </Text>
            <Text
              allowFontScaling={false}
              style={[styles.driverMetricLabel, { color: theme.textSecondary }]}
            >
              POS
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderMain = () => (
    <View style={styles.tabContent}>
      {raceComment.trim() ? (
        <SectionCard
          title="Race Comment"
          theme={theme}
          colors={colors}
          accentColor={accentColor}
        >
          <Text
            allowFontScaling={false}
            style={[styles.commentText, { color: theme.text }]}
          >
            {raceComment}
          </Text>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Track Details"
        theme={theme}
        colors={colors}
        accentColor={accentColor}
      >
        <View style={styles.trackRow}>
          <View style={styles.trackImageWrap}>
            {trackImage ? (
              <Image
                source={{ uri: trackImage }}
                style={[styles.trackMainImage, { tintColor: theme.text }]}
                resizeMode="contain"
              />
            ) : trackLogo ? (
              <Image
                source={{ uri: trackLogo }}
                style={styles.trackMainImage}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  styles.trackImageFallback,
                  { borderColor: theme.border },
                ]}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.trackImageFallbackText,
                    { color: theme.textSecondary },
                  ]}
                >
                  {getInitials(trackName)}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.trackInfoWrap}>
            <Text
              allowFontScaling={false}
              style={[styles.trackNameText, { color: theme.text }]}
              numberOfLines={1}
            >
              {trackName}
            </Text>
            <Text
              allowFontScaling={false}
              style={[
                styles.trackDescriptionText,
                { color: theme.textSecondary },
              ]}
              numberOfLines={3}
            >
              {track.track_description || "No track description available."}
            </Text>

            <View style={styles.statGrid}>
              <View style={styles.statCell}>
                <Text
                  allowFontScaling={false}
                  style={[styles.statValue, { color: theme.text }]}
                >
                  {scheduledLaps ?? "--"}
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[styles.statLabel, { color: theme.textSecondary }]}
                >
                  Laps
                </Text>
              </View>
              <View style={styles.statCell}>
                <Text
                  allowFontScaling={false}
                  style={[styles.statValue, { color: theme.text }]}
                >
                  {trackLengthMi ? `${trackLengthMi} mi` : "--"}
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[styles.statLabel, { color: theme.textSecondary }]}
                >
                  Length
                </Text>
              </View>
              <View style={styles.statCell}>
                <Text
                  allowFontScaling={false}
                  style={[styles.statValue, { color: theme.text }]}
                >
                  {trackCapacity ?? "--"}
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[styles.statLabel, { color: theme.textSecondary }]}
                >
                  Capacity
                </Text>
              </View>
            </View>
          </View>
        </View>
      </SectionCard>

      <SectionCard
        title="Schedule"
        theme={theme}
        colors={colors}
        accentColor={accentColor}
      >
        {scheduleItems.length > 0 ? (
          scheduleItems.map((item, idx) => (
            <View
              key={`${item.event_name || idx}-${idx}`}
              style={[styles.scheduleRow, { borderBottomColor: theme.border }]}
            >
              <View style={styles.scheduleLeftCol}>
                <Text
                  allowFontScaling={false}
                  style={[styles.scheduleTitle, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {item.event_name || `Event ${idx + 1}`}
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[styles.scheduleNotes, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {item.notes || ""}
                </Text>
              </View>
              <Text
                allowFontScaling={false}
                style={[styles.scheduleTime, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {toDateLabel(item.start_time_utc)}
              </Text>
            </View>
          ))
        ) : (
          <Text
            allowFontScaling={false}
            style={[styles.emptyText, { color: theme.textSecondary }]}
          >
            No schedule available.
          </Text>
        )}
      </SectionCard>
    </View>
  );

  const renderDrivers = () => (
    <View style={styles.tabContent}>
      {sortedDrivers.map(renderDriverBadge)}
    </View>
  );

  const renderEvents = () => {
    const entries = [];
    const lapMap = lapNotes || {};
    Object.keys(lapMap).forEach((lap) => {
      const notes = lapMap[lap] || [];
      notes.forEach((note) => entries.push({ lap: Number(lap), note }));
    });

    const sorted = entries.sort((a, b) => (b.lap || 0) - (a.lap || 0));
    const total = sorted.length;
    const startIdx = (eventsPage - 1) * EVENTS_PAGE_SIZE;
    const endIdx = eventsPage * EVENTS_PAGE_SIZE;
    const pageItems = sorted.slice(startIdx, endIdx);

    return (
      <View>
        <View style={styles.eventsCardsWrap}>
          {pageItems.length > 0 ? (
            pageItems.map((row, idx) => {
              const flagState =
                row.note?.FlagState ??
                row.note?.flag_state ??
                row.note?.flag ??
                0;
              const flagText = flagLabel(Number(flagState));
              const flagTextColor = [
                "White Flag",
                "Yellow Flag",
                "Red Flag",
              ].includes(flagText)
                ? "#000"
                : "#fff";
              const border = flagColor(Number(flagState));
              const rawNote = extractNoteText(row.note);
              const rendered = replaceDriverRefs(rawNote);

              return (
                <View
                  key={`evt-${row.lap}-${idx}`}
                  style={styles.eventsRowWrap}
                >
                  <View style={styles.eventsTimeCol}>
                    <Text
                      style={[styles.eventsLapText, { color: theme.text }]}
                      numberOfLines={1}
                    >
                      {row.lap != null ? `Lap ${row.lap}` : "Race"}
                    </Text>
                    <Text
                      style={[
                        styles.eventsClockText,
                        { color: theme.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {/* no clock for lap notes, leave blank or show dash */}
                      {""}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.eventsCard,
                      { borderColor: border, backgroundColor: theme.surface },
                    ]}
                  >
                    <View style={styles.eventsCardHeaderRow}>
                      <View style={styles.eventsTitleRow}>
                        <View
                          style={[
                            styles.eventsIconBubble,
                            { backgroundColor: border },
                          ]}
                        >
                          <Ionicons
                            name="flag-outline"
                            size={12}
                            color={flagTextColor}
                          />
                        </View>
                        <Text
                          style={[
                            styles.eventsCardTitle,
                            { color: theme.text, fontWeight: "800" },
                          ]}
                          numberOfLines={1}
                        >
                          {flagText.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <Text
                      style={[styles.eventsCardMainText, { color: theme.text }]}
                      numberOfLines={4}
                    >
                      {rendered}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No events available.
            </Text>
          )}
        </View>

        <View style={styles.eventsPagerRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={eventsPage <= 1}
            onPress={() => setEventsPage((p) => Math.max(1, p - 1))}
            style={[
              styles.eventsPagerBtn,
              {
                borderColor: theme.border,
                backgroundColor: theme.surface,
                opacity: eventsPage <= 1 ? 0.45 : 1,
              },
            ]}
          >
            <Text style={[styles.eventsPagerBtnText, { color: theme.text }]}>
              Previous
            </Text>
          </TouchableOpacity>

          <Text
            style={[styles.eventsPagerLabel, { color: theme.textSecondary }]}
          >
            Page {eventsPage} of{" "}
            {Math.max(1, Math.ceil(total / EVENTS_PAGE_SIZE))}
          </Text>

          <TouchableOpacity
            activeOpacity={0.8}
            disabled={endIdx >= total}
            onPress={() => setEventsPage((p) => p + 1)}
            style={[
              styles.eventsPagerBtn,
              {
                borderColor: theme.border,
                backgroundColor: theme.surface,
                opacity: endIdx >= total ? 0.45 : 1,
              },
            ]}
          >
            <Text style={[styles.eventsPagerBtnText, { color: theme.text }]}>
              Next
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderStints = () => {
    const driverOrder = (drivers || []).map(
      (d) => d?.Number ?? d?.NASCARDriverID ?? d?.NASCARDriverID,
    );

    // Get pit stops for selected driver
    const selectedDriverPits = stintsSelectedDriver
      ? livePit[String(stintsSelectedDriver)] || []
      : [];

    // Reverse order (last pit first)
    const reversedPits = [...selectedDriverPits].reverse();
    const axleSvgWidth = Math.min(width - 72, 340);
    const axleSvgHeight = (axleSvgWidth * 160) / 340;

    const getPitFlagColor = (flagState) => {
      switch (flagState) {
        case 0:
          return "#909090";
        case 1:
          return "#2E8B57"; // green
        case 2:
          return "#E1C700"; // yellow
        case 3:
          return "#D22B2B"; // red
        case 4:
          return "#FFFFFF"; // white
        case 5:
          return "#000000"; // checkered
        default:
          return theme.border;
      }
    };

    const formatPitType = (typeStr) => {
      if (!typeStr) return "Pit Stop";
      return String(typeStr).replace(/_/g, " ");
    };

    return (
      <View style={styles.tabContent}>
        <View
          style={[
            flowStyles.card,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View
            style={{
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: theme.border,
            }}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={flowStyles.filterBar}
              bounces={false}
            >
              {(driverOrder || []).map((dn) => {
                const d =
                  (drivers || []).find(
                    (x) =>
                      String(
                        x?.Number ?? x?.NASCARDriverID ?? x?.NASCARDriverID,
                      ) === String(dn),
                  ) || {};
                const name = d?.FullName || d?.Fullname || d?.Full || `#${dn}`;
                const last = (name || "").split(" ").slice(-1)[0] || name;
                const label = `#${dn} · ${String(last).toUpperCase()}`;
                const color =
                  getManufacturerColor(d?.Manufacturer) || colors.primary;
                const selected = stintsSelectedDriver === String(dn);
                return (
                  <TouchableOpacity
                    key={dn}
                    onPress={() => {
                      setStintsSelectedDriver(String(dn));
                      setStintsExpandedPitIndex(0);
                    }}
                    style={[
                      flowStyles.chip,
                      selected && {
                        backgroundColor: color,
                        borderColor: color,
                      },
                      !selected && { borderColor: color },
                    ]}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        flowStyles.chipText,
                        selected && { color: getF1TextOnColor(color) },
                      ]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={{ paddingVertical: 12, paddingHorizontal: 12, gap: 8 }}>
            {reversedPits.length > 0 ? (
              reversedPits.map((pit, idx) => {
                const isExpanded = stintsExpandedPitIndex === idx;
                const flagState = pit?.pit_in_flag_status ?? 0;
                const borderColor = getPitFlagColor(flagState);
                const pitType = formatPitType(pit?.pit_stop_type);
                const posChange =
                  pit?.positions_gained_lost ??
                  pit?.position_change ??
                  pit?.position_gained ??
                  pit?.position_diff ??
                  pit?.pos_change ??
                  null;
                const inRank =
                  pit?.pit_in_rank ??
                  pit?.in_rank ??
                  pit?.in_ranking ??
                  pit?.in_position ??
                  null;
                const inTravel =
                  pit?.in_travel_duration ??
                  pit?.pit_in_travel_duration ??
                  pit?.pit_in_travel ??
                  pit?.in_travel_time ??
                  null;
                const outTravel =
                  pit?.out_travel_duration ??
                  pit?.pit_out_travel_duration ??
                  pit?.pit_out_travel ??
                  pit?.out_travel_time ??
                  null;
                const totalDur = pit?.total_duration ?? pit?.duration ?? null;
                const pitStopDur =
                  pit?.pit_stop_duration ?? pit?.pit_stop_time ?? totalDur;
                const pitStopType = String(
                  pit?.pit_stop_type || "",
                ).toUpperCase();
                const isFourWheelChange = pitStopType === "FOUR_WHEEL_CHANGE";
                const isTwoWheelChangeRight =
                  pitStopType === "TWO_WHEEL_CHANGE_RIGHT";
                const isTwoWheelChangeLeft =
                  pitStopType === "TWO_WHEEL_CHANGE_LEFT";
                const topRowActive = isFourWheelChange || isTwoWheelChangeLeft;
                const bottomRowActive =
                  isFourWheelChange || isTwoWheelChangeRight;
                const shouldDimInactiveTires = [
                  "FOUR_WHEEL_CHANGE",
                  "TWO_WHEEL_CHANGE_RIGHT",
                  "TWO_WHEEL_CHANGE_LEFT",
                ].includes(pitStopType);
                const activeTireFill = colors.primary;
                const inactiveTireFill = theme.border;
                const tireOverlayFill = "rgba(0,0,0,0.28)";

                return (
                  <TouchableOpacity
                    key={`${pit.driver_name || idx}-${idx}`}
                    activeOpacity={0.8}
                    onPress={() =>
                      setStintsExpandedPitIndex(isExpanded ? -1 : idx)
                    }
                  >
                    <View
                      style={[
                        {
                          borderWidth: 1.5,
                          borderColor: borderColor,
                          borderRadius: 12,
                          backgroundColor: theme.surface,
                          overflow: "hidden",
                        },
                      ]}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.eventMain,
                              { color: theme.text, fontSize: 13 },
                            ]}
                            numberOfLines={1}
                          >
                            {pitType}
                          </Text>
                          <Text
                            style={[
                              styles.eventSub,
                              { color: theme.textSecondary, marginTop: 2 },
                            ]}
                            numberOfLines={1}
                          >
                            Total:{" "}
                            {formatDuration(
                              pit?.total_duration || pit?.duration,
                            )}
                          </Text>
                        </View>
                        <Ionicons
                          name={isExpanded ? "chevron-up" : "chevron-down"}
                          size={20}
                          color={theme.textSecondary}
                          style={{ marginLeft: 12 }}
                        />
                      </View>

                      {isExpanded && (
                        <View>
                          <View
                            style={{
                              alignItems: "center",
                              paddingTop: 8,
                              paddingBottom: 10,
                              gap: 6,
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                marginTop: -12,
                              }}
                            >
                              <Text
                                style={{
                                  color: theme.textSecondary,
                                  fontWeight: "800",
                                  fontSize: 11,
                                  letterSpacing: 0.5,
                                }}
                              >
                                FRONT ▶
                              </Text>
                            </View>

                            <Svg
                              width={axleSvgWidth}
                              height={axleSvgHeight}
                              viewBox="0 0 340 130"
                            >
                              <Rect
                                x="74"
                                y="61"
                                width="192"
                                height="8"
                                rx="0"
                                fill={theme.textTertiary}
                              />
                              <Rect
                                x="66"
                                y="28"
                                width="8"
                                height="80"
                                rx="0"
                                fill={theme.textTertiary}
                              />
                              <Rect
                                x="266"
                                y="28"
                                width="8"
                                height="80"
                                rx="0"
                                fill={theme.textTertiary}
                              />

                              <Rect
                                x="55"
                                y="5"
                                width="30"
                                height="24"
                                rx="8"
                                fill={theme.text}
                              />
                              <Rect
                                x="255"
                                y="5"
                                width="30"
                                height="24"
                                rx="8"
                                fill={theme.text}
                              />
                              <Rect
                                x="55"
                                y="103"
                                width="30"
                                height="24"
                                rx="8"
                                fill={theme.text}
                              />
                              <Rect
                                x="255"
                                y="103"
                                width="30"
                                height="24"
                                rx="8"
                                fill={theme.text}
                              />
                              <Rect
                                x="55"
                                y="50"
                                width="32"
                                height="30"
                                rx="10"
                                fill={theme.text}
                              />
                              <Rect
                                x="254"
                                y="50"
                                width="32"
                                height="30"
                                rx="10"
                                fill={theme.text}
                              />
                              <Rect
                                x="145"
                                y="46"
                                width="58"
                                height="38"
                                rx="12"
                                fill={theme.text}
                              />
                              <Rect
                                x="46"
                                y="-12.5"
                                width="48"
                                height="30"
                                rx="8"
                                fill={
                                  topRowActive
                                    ? activeTireFill
                                    : inactiveTireFill
                                }
                              />
                              <Rect
                                x="246"
                                y="-12.5"
                                width="48"
                                height="30"
                                rx="8"
                                fill={
                                  topRowActive
                                    ? activeTireFill
                                    : inactiveTireFill
                                }
                              />
                              <Rect
                                x="46"
                                y="114"
                                width="48"
                                height="30"
                                rx="8"
                                fill={
                                  bottomRowActive
                                    ? activeTireFill
                                    : inactiveTireFill
                                }
                              />
                              <Rect
                                x="246"
                                y="114"
                                width="48"
                                height="30"
                                rx="8"
                                fill={
                                  bottomRowActive
                                    ? activeTireFill
                                    : inactiveTireFill
                                }
                              />
                              {shouldDimInactiveTires && !isFourWheelChange && (
                                <>
                                  {!topRowActive && (
                                    <Rect
                                      x="46"
                                      y="-12.5"
                                      width="48"
                                      height="30"
                                      rx="8"
                                      fill={tireOverlayFill}
                                    />
                                  )}
                                  {!topRowActive && (
                                    <Rect
                                      x="246"
                                      y="-12.5"
                                      width="48"
                                      height="30"
                                      rx="8"
                                      fill={tireOverlayFill}
                                    />
                                  )}
                                  {!bottomRowActive && (
                                    <Rect
                                      x="46"
                                      y="114"
                                      width="48"
                                      height="30"
                                      rx="8"
                                      fill={tireOverlayFill}
                                    />
                                  )}
                                  {!bottomRowActive && (
                                    <Rect
                                      x="246"
                                      y="114"
                                      width="48"
                                      height="30"
                                      rx="8"
                                      fill={tireOverlayFill}
                                    />
                                  )}
                                </>
                              )}
                            </Svg>
                          </View>

                          <View
                            style={{
                              borderTopWidth: StyleSheet.hairlineWidth,
                              borderTopColor: theme.border,
                              paddingHorizontal: 14,
                              paddingVertical: 12,
                              gap: 12,
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                justifyContent: "space-between",
                                gap: 12,
                              }}
                            >
                              <View style={{ alignItems: "center", flex: 1 }}>
                                <Text
                                  style={[
                                    { fontSize: 16, fontWeight: "800" },
                                    { color: theme.text },
                                  ]}
                                >
                                  {pit?.lap_count ?? "--"}
                                </Text>
                                <Text
                                  style={[
                                    {
                                      fontSize: 10,
                                      fontWeight: "700",
                                      marginTop: 2,
                                      textTransform: "uppercase",
                                    },
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  Lap
                                </Text>
                              </View>

                              <View style={{ alignItems: "center", flex: 1 }}>
                                <Text
                                  style={[
                                    { fontSize: 16, fontWeight: "800" },
                                    { color: theme.text },
                                  ]}
                                >
                                  {formatDuration(pitStopDur)}
                                </Text>
                                <Text
                                  style={[
                                    {
                                      fontSize: 10,
                                      fontWeight: "700",
                                      marginTop: 2,
                                      textTransform: "uppercase",
                                    },
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  Pit Time
                                </Text>
                              </View>

                              <View style={{ alignItems: "center", flex: 1 }}>
                                <Text
                                  style={[
                                    { fontSize: 16, fontWeight: "800" },
                                    {
                                      color:
                                        posChange > 0
                                          ? theme.success || "#26a69a"
                                          : posChange < 0
                                            ? theme.error || "#d32f2f"
                                            : theme.text,
                                    },
                                  ]}
                                >
                                  {posChange != null
                                    ? posChange > 0
                                      ? `+${posChange}`
                                      : `${posChange}`
                                    : "--"}
                                </Text>
                                <Text
                                  style={[
                                    {
                                      fontSize: 10,
                                      fontWeight: "700",
                                      marginTop: 2,
                                      textTransform: "uppercase",
                                    },
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  Gain/Loss
                                </Text>
                              </View>
                            </View>

                            <View
                              style={{
                                flexDirection: "row",
                                justifyContent: "space-between",
                                gap: 12,
                                marginTop: 8,
                              }}
                            >
                              <View style={{ alignItems: "center", flex: 1 }}>
                                <Text
                                  style={[
                                    { fontSize: 16, fontWeight: "800" },
                                    { color: theme.text },
                                  ]}
                                >
                                  {inTravel != null && inTravel > -1
                                    ? formatDuration(inTravel)
                                    : "--"}
                                </Text>
                                <Text
                                  style={[
                                    {
                                      fontSize: 10,
                                      fontWeight: "700",
                                      marginTop: 2,
                                      textTransform: "uppercase",
                                    },
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  In Travel
                                </Text>
                              </View>

                              <View style={{ alignItems: "center", flex: 1 }}>
                                <Text
                                  style={[
                                    { fontSize: 16, fontWeight: "800" },
                                    { color: theme.text },
                                  ]}
                                >
                                  {outTravel != null && outTravel > -1
                                    ? formatDuration(outTravel)
                                    : "--"}
                                </Text>
                                <Text
                                  style={[
                                    {
                                      fontSize: 10,
                                      fontWeight: "700",
                                      marginTop: 2,
                                      textTransform: "uppercase",
                                    },
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  Out Travel
                                </Text>
                              </View>

                              <View style={{ alignItems: "center", flex: 1 }}>
                                <Text
                                  style={[
                                    { fontSize: 16, fontWeight: "800" },
                                    { color: theme.text },
                                  ]}
                                >
                                  {inRank ?? "--"}
                                </Text>
                                <Text
                                  style={[
                                    {
                                      fontSize: 10,
                                      fontWeight: "700",
                                      marginTop: 2,
                                      textTransform: "uppercase",
                                    },
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  In Rank
                                </Text>
                              </View>
                            </View>
                          </View>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <Text
                allowFontScaling={false}
                style={[styles.emptyText, { color: theme.textSecondary }]}
              >
                No pit stops available for this driver.
              </Text>
            )}
          </View>
        </View>
        <SectionCard
          title="Flag Legend"
          theme={theme}
          colors={colors}
          accentColor={accentColor}
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {[1, 2, 3, 4, 5, 8, 9, 0].map((s) => {
              const c = flagColor(s);
              return (
                <View
                  key={`flag-${s}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginRight: 12,
                  }}
                >
                  <View
                    style={{
                      width: 12,
                      height: 12,
                      backgroundColor: c,
                      borderRadius: 6,
                      marginRight: 8,
                      borderWidth: c === "#FFFFFF" ? 1 : 0,
                      borderColor: theme.border,
                    }}
                  />
                  <Text style={{ color: theme.textSecondary }}>
                    {flagLabel(s)}
                  </Text>
                </View>
              );
            })}
          </View>
        </SectionCard>
      </View>
    );
  };

  const renderFlow = () => (
    <View style={styles.tabContent}>
      <View
        style={[
          flowStyles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View
          style={{
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: theme.border,
          }}
        >
          <DriverFilterBar
            driverNumbers={driverOrder}
            selectedSet={flowSelectedDrivers}
            onToggle={toggleFlowDriver}
            filterScrollRef={flowFilterScrollRef}
            onFilterScroll={handleFlowFilterScroll}
          />
        </View>

        <View style={flowStyles.cardBody}>{renderFlowChart()}</View>
      </View>
    </View>
  );

  const renderFlowChart = () => {
    const lapSet = new Set();
    const driverLapMap = new Map();

    // Build mapping from lap_times.laps structure
    (racePayload?.lap_times?.laps || []).forEach((drv) => {
      const dn =
        drv?.Number ??
        drv?.NASCARDriverID ??
        drv?.NASCARDriverID ??
        drv?.FullName ??
        null;
      const lapsArr = drv?.Laps || drv?.laps || [];
      const map = new Map();
      lapsArr.forEach((lp) => {
        const lapNum = Number(lp?.Lap ?? lp?.lap ?? lp?.Number ?? null);
        const pos = Number(lp?.RunningPos ?? lp?.runningPos ?? lp?.pos ?? null);
        if (Number.isFinite(lapNum) && Number.isFinite(pos)) {
          map.set(lapNum, pos);
          lapSet.add(lapNum);
        }
      });
      if (dn != null) driverLapMap.set(String(dn), map);
    });

    const laps = Array.from(lapSet).sort((a, b) => a - b);
    if (!laps.length) {
      return (
        <View style={{ padding: 12 }}>
          <Text style={{ color: theme.textSecondary }}>
            No flow data available.
          </Text>
        </View>
      );
    }

    const FLOW_ROW_HEIGHT = 35;
    const FLOW_LAP_PX = 26;
    const FLOW_HEADER_HEIGHT = 28;
    const FLOW_LEFT_PAD = 12;
    const FLOW_RIGHT_PAD = 84;

    const driverOrder = (racePayload?.lap_times?.laps || []).map(
      (d) => d?.Number ?? d?.NASCARDriverID ?? d?.NASCARDriverID,
    );

    // Determine max position
    let maxPos = 1;
    driverOrder.forEach((dn) => {
      const map = driverLapMap.get(String(dn)) || new Map();
      map.forEach((p) => {
        if (p != null) maxPos = Math.max(maxPos, p);
      });
    });

    // Show all laps
    const allLaps = laps;

    const svgWidth = Math.max(420, allLaps.length * FLOW_LAP_PX);
    const svgHeight = Math.max(
      260,
      FLOW_HEADER_HEIGHT + maxPos * FLOW_ROW_HEIGHT + 28,
    );

    // Show only selected drivers (max 3)
    const visibleDrivers = driverOrder.filter((dn) =>
      flowSelectedDrivers.has(String(dn)),
    );

    const buildPathForDriver = (dn) => {
      const map = driverLapMap.get(String(dn)) || new Map();
      let path = "";
      let started = false;
      allLaps.forEach((lap, i) => {
        const p = map.get(lap);
        if (p == null) {
          started = false;
          return;
        }
        const x = i * FLOW_LAP_PX + FLOW_LEFT_PAD;
        const y =
          FLOW_HEADER_HEIGHT + (p - 1) * FLOW_ROW_HEIGHT + FLOW_ROW_HEIGHT / 2;
        if (!started) {
          path += `M ${x} ${y}`;
          started = true;
        } else {
          path += ` L ${x} ${y}`;
        }
      });
      return path || null;
    };

    return (
      <View style={flowStyles.chartWrap}>
        <ScrollView
          horizontal
          bounces={false}
          showsHorizontalScrollIndicator={false}
        >
          <View style={flowStyles.flowScrollInner}>
            <View
              style={[
                flowStyles.flowHeaderRow,
                { width: svgWidth + FLOW_RIGHT_PAD, marginBottom: -28 },
              ]}
            >
              {allLaps.map((lap, i) => {
                const left = i * FLOW_LAP_PX + FLOW_LEFT_PAD;
                return (
                  <Text
                    key={`lap-${lap}`}
                    style={[
                      flowStyles.flowHeaderLabel,
                      { color: theme.textSecondary, left },
                    ]}
                  >
                    {lap}
                  </Text>
                );
              })}
            </View>

            <Svg
              width={svgWidth + FLOW_RIGHT_PAD}
              height={svgHeight}
              style={flowStyles.flowChartSvg}
            >
              {Array.from({ length: maxPos }).map((_, idx) => {
                const y = FLOW_HEADER_HEIGHT + idx * FLOW_ROW_HEIGHT + 0.5;
                return (
                  <Path
                    key={`g-${idx}`}
                    d={`M0 ${y} L ${svgWidth} ${y}`}
                    stroke={theme.border}
                    strokeWidth={0.5}
                    opacity={0.6}
                  />
                );
              })}

              {allLaps.map((lap, i) => {
                const x = i * FLOW_LAP_PX + FLOW_LEFT_PAD;
                return (
                  <Path
                    key={`t-${lap}`}
                    d={`M ${x} ${FLOW_HEADER_HEIGHT} L ${x} ${svgHeight}`}
                    stroke={theme.border}
                    strokeWidth={0.3}
                    opacity={0.25}
                  />
                );
              })}

              {visibleDrivers.map((dn) => {
                const drv = (racePayload?.lap_times?.laps || []).find(
                  (d) =>
                    String(
                      d?.Number ?? d?.NASCARDriverID ?? d?.NASCARDriverID,
                    ) === String(dn),
                );
                if (!drv) return null;
                const path = buildPathForDriver(dn);
                if (!path) return null;
                const color =
                  getManufacturerColor(drv?.Manufacturer) || colors.primary;
                return (
                  <Path
                    key={`p-${dn}`}
                    d={path}
                    stroke={color}
                    strokeWidth={3}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.9}
                  />
                );
              })}
            </Svg>

            <View
              style={{
                position: "absolute",
                left: svgWidth + 16,
                top: FLOW_HEADER_HEIGHT,
              }}
            >
              {visibleDrivers.map((dn) => {
                const drv = (racePayload?.lap_times?.laps || []).find(
                  (d) =>
                    String(
                      d?.Number ?? d?.NASCARDriverID ?? d?.NASCARDriverID,
                    ) === String(dn),
                );
                if (!drv) return null;
                const map = driverLapMap.get(String(dn)) || new Map();
                const lastLap = allLaps[allLaps.length - 1];
                const pos = map.get(lastLap) || null;
                const y =
                  pos != null
                    ? FLOW_HEADER_HEIGHT +
                      (pos - 1) * FLOW_ROW_HEIGHT +
                      FLOW_ROW_HEIGHT / 2
                    : FLOW_HEADER_HEIGHT;
                const color =
                  getManufacturerColor(drv?.Manufacturer) || colors.primary;
                return (
                  <View
                    key={`hs-${dn}`}
                    style={{
                      position: "absolute",
                      top: y,
                      left: 0,
                      width: 56,
                      height: 28,
                      alignItems: "center",
                      justifyContent: "center",
                      transform: [{ translateY: -40 }],
                      opacity: 1,
                    }}
                  >
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: color + "33",
                        borderWidth: 2,
                        borderColor: color,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: theme.text,
                          fontSize: 11,
                          fontWeight: "700",
                        }}
                      >
                        {drv?.Number ?? String(dn)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderGrid = () => (
    <View style={styles.tabContent}>
      <SectionCard
        title="Starting Grid"
        theme={theme}
        colors={colors}
        accentColor={accentColor}
      >
        {sortedDrivers.map((driver, idx) => (
          <View key={`${driver.Number}-grid-${idx}`} style={styles.gridRow}>
            <Text
              allowFontScaling={false}
              style={[styles.gridPos, { color: theme.textSecondary }]}
            >
              {driver.RunningPos || idx + 1}
            </Text>
            <View style={styles.gridTextWrap}>
              <Text
                allowFontScaling={false}
                style={[styles.gridName, { color: theme.text }]}
                numberOfLines={1}
              >
                {driver.FullName || "Driver"}
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.gridMeta, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                Car #{driver.Number || "--"} ·{" "}
                {getManufacturerName(driver.Manufacturer)}
              </Text>
            </View>
          </View>
        ))}
      </SectionCard>
    </View>
  );

  const renderTabBody = () => {
    switch (selectedTab) {
      case "Drivers":
        return renderDrivers();
      case "Events":
        return renderEvents();
      case "Stints":
        return renderStints();
      case "Flow":
        return renderFlow();
      case "Starting Grid":
        return renderGrid();
      default:
        return renderMain();
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text
          allowFontScaling={false}
          style={[styles.loadingText, { color: theme.textSecondary }]}
        >
          Loading NASCAR race details...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: theme.background }]}>
        <Text
          allowFontScaling={false}
          style={[styles.errorText, { color: theme.text }]}
        >
          Failed to load race details.
        </Text>
        <TouchableOpacity
          onPress={loadRace}
          style={[styles.retryBtn, { backgroundColor: colors.primary }]}
        >
          <Text allowFontScaling={false} style={styles.retryBtnText}>
            Retry
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <HeaderGradient theme={theme} />
        </View>
        <View style={styles.headerContent}>
          <View style={styles.headerRow}>
            <View style={styles.headerLogoContainer}>
              {trackLogo ? (
                <Image
                  source={{ uri: trackLogo }}
                  style={styles.headerLogoImage}
                  resizeMode="contain"
                />
              ) : (
                <View
                  style={[
                    styles.headerLogoFallback,
                    { borderColor: "rgba(255,255,255,0.18)" },
                  ]}
                >
                  <Text
                    allowFontScaling={false}
                    style={styles.headerLogoFallbackText}
                  >
                    {getInitials(trackName)}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.headerInfo}>
              <Text
                allowFontScaling={false}
                style={styles.headerTitle}
                numberOfLines={1}
              >
                {raceTitle}
              </Text>
              <Text
                allowFontScaling={false}
                style={styles.headerMeta}
                numberOfLines={1}
              >
                {trackName}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.tabBarWrap,
          { borderBottomColor: theme.border, backgroundColor: theme.surface },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
        >
          {TAB_KEYS.map((tab) => (
            <TabButton
              key={tab}
              label={tab}
              active={selectedTab === tab}
              onPress={() => setSelectedTab(tab)}
              colors={colors}
              theme={theme}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {renderTabBody()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    textAlign: "center",
  },
  errorText: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 12,
  },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
  header: {
    position: "relative",
    paddingTop: 18,
    paddingHorizontal: 12,
    paddingBottom: 12,
    height: 90,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  headerContent: {
    position: "relative",
    zIndex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerLogoContainer: {
    width: 100,
    height: 40,
    borderRadius: 4,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  headerLogoImage: {
    width: 100,
    height: 40,
  },
  headerLogoFallback: {
    width: 100,
    height: 40,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    alignItems: "center",
  },
  headerLogoFallbackText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 2,
    color: "#fff",
  },
  headerMeta: {
    fontSize: 12,
    marginTop: 2,
    color: "rgba(255,255,255,0.78)",
  },
  headerInfo: {
    flex: 1,
  },
  tabBarWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBarContent: {
    flexDirection: "row",
  },
  tabButton: {
    width: width / 4,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 28,
  },
  tabContent: {
    gap: 12,
  },
  eventsCardsWrap: {
    marginTop: 10,
    paddingHorizontal: 0,
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
  sectionCard: {
    borderRadius: 14,
    overflow: "hidden",
    padding: 12,
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  overviewRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  commentText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  trackRow: {
    flexDirection: "column",
    gap: 12,
  },
  trackImageWrap: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  trackMainImage: {
    width: "100%",
    height: 150,
  },
  trackImageFallback: {
    width: "100%",
    height: 150,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  trackImageFallbackText: {
    fontSize: 18,
    fontWeight: "800",
  },
  trackInfoWrap: {
    gap: 8,
  },
  trackNameText: {
    fontSize: 16,
    fontWeight: "800",
  },
  trackDescriptionText: {
    fontSize: 12,
    lineHeight: 16,
  },
  overviewTextBlock: {
    flex: 1,
    gap: 3,
  },
  overviewTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  overviewSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  overviewImageWrap: {
    width: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  trackLogo: {
    width: 92,
    height: 36,
    marginBottom: 6,
  },
  trackImage: {
    width: 110,
    height: 78,
  },
  podiumRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  podiumCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  podiumAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  podiumAvatarText: {
    color: "#fff",
    fontWeight: "900",
  },
  podiumName: {
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  podiumMeta: {
    fontSize: 11,
    textAlign: "center",
  },
  statGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statCell: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "900",
  },
  statLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scheduleLeftCol: {
    flex: 1,
    minWidth: 0,
  },
  scheduleTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  scheduleNotes: {
    fontSize: 11,
    marginTop: 2,
  },
  scheduleTime: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right",
  },
  driverCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    overflow: "hidden",
  },
  driverCardInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
  },
  driverLeftCol: {
    alignItems: "center",
    width: 54,
  },
  driverAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  driverAvatarText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
  },
  driverPos: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: "700",
  },
  driverMidCol: {
    flex: 1,
  },
  driverName: {
    fontSize: 15,
    fontWeight: "800",
  },
  driverMeta: {
    marginTop: 2,
    fontSize: 12,
  },
  driverRightCol: {
    alignItems: "center",
    width: 50,
  },
  driverMetric: {
    fontSize: 18,
    fontWeight: "900",
  },
  driverMetricLabel: {
    fontSize: 10,
    fontWeight: "700",
  },
  eventRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  eventMain: {
    fontSize: 13,
    fontWeight: "800",
  },
  eventSub: {
    marginTop: 2,
    fontSize: 12,
  },
  emptyText: {
    fontSize: 13,
    paddingVertical: 6,
  },
  flowStrip: {
    gap: 8,
  },
  flowChip: {
    minWidth: 88,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  flowChipTop: {
    fontSize: 12,
    fontWeight: "800",
  },
  flowChipBottom: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "600",
  },
  gridRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    gap: 10,
  },
  gridPos: {
    width: 28,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  gridTextWrap: {
    flex: 1,
  },
  gridName: {
    fontSize: 14,
    fontWeight: "800",
  },
  gridMeta: {
    marginTop: 2,
    fontSize: 11,
  },
});

export default NascarRaceDetailsScreen;

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
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Share,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ViewShot from "react-native-view-shot";
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
  "https://sportsheart-motorsports.up.railway.app/nascar/race";
const NASCAR_CACHE_PREFIX = "nascar_race_details:";
const TAB_KEYS = [
  "Main",
  "Drivers",
  "Events",
  "Pit Stops",
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

const parseNascarUtcDate = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(text);
  const parsed = new Date(hasTimezone ? text : `${text}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getNascarRunTypeLabel = (runType) => {
  const type = Number(runType);
  if (type === 1) return "PRACTICE";
  if (type === 2) return "QUAL";
  return "RACE";
};

const toDateLabel = (value) => {
  if (!value) return "TBD";
  const date = parseNascarUtcDate(value);
  if (!date) return "TBD";
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const toFullDateLabel = (value) => {
  if (!value) return "TBD";
  const date = parseNascarUtcDate(value);
  if (!date) return String(value);
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

const formatDuration = (seconds) => {
  if (seconds === null || seconds === undefined || seconds === -1) return "--";
  const total = Number(seconds);
  if (Number.isNaN(total)) return "--";
  const mins = Math.floor(total / 60);
  const secs = (total % 60).toFixed(2).padStart(4, "0");
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
  <Svg width="100%" height="100%" pointerEvents="none">
    <Defs>
      <SvgLinearGradient
        id={`nascarGrad_${gradId}`}
        x1="0%"
        y1="0%"
        x2="100%"
        y2="0%"
      >
        <Stop offset="0%" stopColor={accentColor} stopOpacity="0" />
        <Stop offset="100%" stopColor={accentColor} stopOpacity="45" />
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

const formatSessionCopyTime = (value) => {
  if (value == null || value === "") return "-";
  const text = String(value).trim();
  if (!text) return "-";
  if (text.includes(":")) return text;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? formatDuration(parsed) : text;
};

const formatElapsedClock = (secs) => {
  if (secs == null || secs === "") return "-";
  const s = String(secs).trim();
  if (!s) return "-";
  if (s.includes(":")) return s;
  const total = Number(s);
  if (!Number.isFinite(total)) return s;
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const sec = Math.floor(total % 60)
    .toString()
    .padStart(2, "0");
  return hrs > 0 ? `${hrs}:${mins}:${sec}` : `${mins}:${sec}`;
};

const formatDeltaLeader = (value) => {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text === "0" || text === "0.0" || Number(text) === 0) return "Leader";
  if (text === "-") return "+";
  if (text.startsWith("+")) return text;
  if (text.startsWith("-")) return `+${text.slice(1)}`;
  return `+${text}`;
};

const getLiveLapsLedCount = (lapsLed) => {
  if (!Array.isArray(lapsLed)) {
    const parsed = Number(lapsLed);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return lapsLed.reduce((total, entry) => {
    const start = Number(entry?.start_lap);
    const end = Number(entry?.end_lap);

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return total;
    }

    return total + (end - start + 1);
  }, 0);
};

const getLiveAveragePitTime = (pitStops) => {
  if (!Array.isArray(pitStops) || !pitStops.length) return null;

  const durations = pitStops
    .map((pitStop) => {
      const pitIn = Number(pitStop?.pit_in_elapsed_time);
      const pitOut = Number(pitStop?.pit_out_elapsed_time);
      if (!Number.isFinite(pitIn) || !Number.isFinite(pitOut)) return null;
      const duration = pitOut - pitIn;
      return Number.isFinite(duration) && duration > 0 ? duration : null;
    })
    .filter((value) => value != null);

  if (!durations.length) return null;

  return durations.reduce((sum, value) => sum + value, 0) / durations.length;
};

const getLiveDriverPositionDeltaText = (
  runningPos,
  startingPos,
  liveRunType,
) => {
  const currentPosition = Number(runningPos);
  if (!Number.isFinite(currentPosition)) return null;
  if (liveRunType !== 3) return null;

  const startPosition = Number(startingPos);
  if (!Number.isFinite(startPosition)) return null;

  const delta = startPosition - currentPosition;
  if (delta === 0) return null;
  return delta > 0 ? `▲ ${delta} POS` : `▼ ${Math.abs(delta)} POS`;
};

const pickFirstValue = (obj, keys) => {
  for (const key of keys) {
    if (obj?.[key] != null) {
      return obj[key];
    }
  }
  return null;
};

const buildNascarStageFooterSegments = (runData, currentLap) => {
  const source = runData || {};

  const toFiniteNumber = (value) => {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const totalLaps =
    toFiniteNumber(pickFirstValue(source, ["lapsInRace", "LapsInRace"])) ?? 0;

  const stage1End = toFiniteNumber(
    pickFirstValue(source, ["stage1End", "Stage1End"]),
  );

  const stage2End = toFiniteNumber(
    pickFirstValue(source, ["stage2End", "Stage2End"]),
  );

  const stage3End = toFiniteNumber(
    pickFirstValue(source, ["stage3End", "Stage3End"]),
  );

  const stage1Length = toFiniteNumber(
    pickFirstValue(source, ["stage1Laps", "Stage1Laps"]),
  );

  const stage2Length = toFiniteNumber(
    pickFirstValue(source, ["stage2Laps", "Stage2Laps"]),
  );

  const stage3Length = toFiniteNumber(
    pickFirstValue(source, ["stage3Laps", "Stage3Laps"]),
  );

  const stage1EndValue =
    stage1End !== null
      ? stage1End
      : Number.isFinite(stage1Length)
        ? stage1Length
        : 1;

  const stage2EndValue =
    stage2End !== null
      ? stage2End
      : stage1EndValue + (Number.isFinite(stage2Length) ? stage2Length : 0);

  const stage3EndValue = stage3End !== null ? stage3End : totalLaps;

  const segments = [
    {
      label: "STAGE 1",
      start: 0,
      end: stage1EndValue,
      stageLaps: stage1Length,
    },
    {
      label: "STAGE 2",
      start: stage1EndValue,
      end: stage2EndValue,
      stageLaps: stage2Length,
    },
    {
      label: "STAGE 3",
      start: stage2EndValue,
      end: stage3EndValue,
      stageLaps: stage3Length,
    },
  ];

  return segments.map((segment) => {
    const start = Number(segment.start) || 0;
    const end = Number(segment.end) || 0;

    const length = Math.max(1, end - start);

    const lap = Math.max(0, Number(currentLap) || 0);

    const progressed = Math.min(length, Math.max(0, lap - start));

    const flex = Number.isFinite(segment.stageLaps)
      ? Math.max(1, segment.stageLaps)
      : length;

    return {
      ...segment,
      flex,
      fillPct: Math.max(0, Math.min(100, (progressed / length) * 100)),
    };
  });
};

const NascarSessionCopyCard = ({
  visible,
  onClose,
  sourceLabel,
  raceName,
  sessionDate,
  trackName,
  trackState,
  trackLogo,
  podiumEntries,
  accentColor,
  colors,
  theme,
}) => {
  const cardRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const cardWidth = Math.min(width - 48, 540);

  if (!visible) return null;

  const handleShare = async () => {
    if (!cardRef.current || sharing) return;
    try {
      setSharing(true);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const uri = await cardRef.current.capture();
      await Share.share({ url: uri, title: `${sourceLabel} Stats` });
    } catch (error) {
      console.warn("[NascarRaceDetailsScreen] session share failed", error);
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
      <View style={styles.sessionCopyOverlay}>
        <ViewShot ref={cardRef} options={{ format: "png", quality: 1 }}>
          <View
            style={[
              styles.sessionCopyCard,
              { backgroundColor: theme.surface, width: cardWidth },
            ]}
          >
            <View
              style={[
                styles.sessionCopyHeader,
                {
                  backgroundColor: "#3C3B6E" + "33",
                  borderBottomColor: "#3C3B6E",
                },
              ]}
            >
              <View style={styles.sessionCopyHeaderTopRow}>
                <View
                  style={[
                    styles.sessionCopyBadge,
                    { backgroundColor: "#3C3B6E" },
                  ]}
                >
                  <Text
                    style={[
                      styles.sessionCopyBadgeText,
                      { color: getF1TextOnColor("#3C3B6E") },
                    ]}
                  >
                    {sourceLabel}
                  </Text>
                </View>
              </View>

              <Text
                style={[styles.sessionCopyRaceName, { color: "#fff" }]}
                numberOfLines={1}
              >
                {raceName}
              </Text>
              <Text
                style={[
                  styles.sessionCopyRaceTime,
                  { color: theme.text, marginBottom: 8 },
                ]}
                numberOfLines={1}
              >
                {sessionDate || "TBD"}
              </Text>

              <View style={styles.sessionCopyVenueRow}>
                {trackLogo ? (
                  <Image
                    source={{ uri: trackLogo }}
                    style={styles.sessionCopyTrackLogo}
                    resizeMode="contain"
                  />
                ) : (
                  <View
                    style={[
                      styles.sessionCopyTrackFallback,
                      { borderColor: theme.border },
                    ]}
                  >
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.sessionCopyTrackFallbackText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {getInitials(trackName)}
                    </Text>
                  </View>
                )}

                <Text
                  style={[
                    styles.sessionCopyVenueText,
                    { color: theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {trackName} · {trackState}
                </Text>
              </View>
            </View>

            <View style={styles.sessionCopyPodiumRow}>
              {podiumEntries.map((driver) => {
                const initials = getInitials(driver.name);
                const showDelta = driver.showDeltaLeader;
                return (
                  <View
                    key={`${driver.position}-${driver.name}`}
                    style={styles.sessionCopyDriverCol}
                  >
                    <View style={styles.sessionCopyHeadshotWrap}>
                      {driver.headshot ? (
                        <View
                          style={[
                            styles.driverHeadshotCard,
                            {
                              borderColor: driver.teamColor,
                              backgroundColor: `${driver.teamColor}22`,
                            },
                          ]}
                        >
                          <Image
                            source={{ uri: driver.headshot }}
                            style={{
                              width: "100%",
                              height: "150%",
                              transform: [
                                { translateY: 1.5 },
                                { translateX: -2 },
                              ],
                            }}
                            resizeMode="cover"
                          />
                        </View>
                      ) : (
                        <View
                          style={[
                            styles.driverHeadshotCard,
                            {
                              backgroundColor: `${driver.teamColor}22`,
                              alignItems: "center",
                              justifyContent: "center",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.driverInitials,
                              { color: driver.teamColor },
                            ]}
                          >
                            {initials || "D"}
                          </Text>
                        </View>
                      )}

                      <View
                        style={[
                          styles.sessionCopyPosBadge,
                          { backgroundColor: driver.teamColor },
                        ]}
                      >
                        <Text
                          style={[
                            styles.sessionCopyPosBadgeText,
                            { color: getF1TextOnColor(driver.teamColor) },
                          ]}
                        >
                          {driver.position}
                        </Text>
                      </View>
                    </View>

                    <Text
                      style={[
                        styles.sessionCopyDriverName,
                        { color: theme.text },
                      ]}
                      numberOfLines={1}
                    >
                      {driver.lastName.toUpperCase()}
                    </Text>
                    <Text
                      style={[
                        styles.sessionCopyDriverTeam,
                        { color: driver.teamColor },
                      ]}
                      numberOfLines={1}
                    >
                      {driver.teamName || "Team"}
                    </Text>
                    <Text
                      style={[
                        styles.sessionCopyDriverTime,
                        { color: theme.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {driver.timeText}
                    </Text>
                    {showDelta ? (
                      <Text
                        style={[
                          styles.sessionCopyDriverDelta,
                          { color: theme.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {driver.deltaLeaderText || ""}
                      </Text>
                    ) : null}
                    <Text
                      style={[
                        styles.sessionCopyDriverLaps,
                        { color: theme.textTertiary },
                      ]}
                      numberOfLines={1}
                    >
                      {driver.laps != null ? String(driver.laps) : "-"} Laps
                    </Text>
                  </View>
                );
              })}
            </View>

            <View
              style={[
                styles.sessionCopyFooter,
                { borderTopColor: theme.border },
              ]}
            >
              <Text
                style={[styles.sessionCopyFooterText, { color: theme.text }]}
              >
                SportsHeart{" "}
                <Ionicons name="heart" size={10} color={colors.primary} />
              </Text>
            </View>
          </View>
        </ViewShot>

        <View style={styles.sessionCopyActions}>
          <TouchableOpacity
            onPress={handleShare}
            disabled={sharing}
            style={[
              styles.sessionCopyActionBtn,
              { backgroundColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.sessionCopyActionBtnText,
                { color: getF1TextOnColor(colors.primary) },
              ]}
            >
              {sharing ? "Sharing…" : "Share"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onClose}
            style={[
              styles.sessionCopyActionBtn,
              { backgroundColor: theme.border },
            ]}
          >
            <Text
              style={[styles.sessionCopyActionBtnText, { color: theme.text }]}
            >
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const NascarDriverStatsCard = ({
  visible,
  onClose,
  driver,
  sourceType,
  colors,
  theme,
  trackLogo,
  trackName,
  raceName,
}) => {
  const cardRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const cardWidth = Math.min(width - 48, 540);

  const handleShare = async () => {
    if (!cardRef.current || sharing) return;
    try {
      setSharing(true);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const uri = await cardRef.current.capture();
      await Share.share({ url: uri, title: `${driver.name} Stats` });
    } catch (error) {
      console.warn("[NascarDriverStatsCard] share failed", error);
    } finally {
      setSharing(false);
    }
  };

  const isLive = sourceType === "LIVE";
  const isQualPractice = sourceType === "QUAL" || sourceType === "PRACTICE";
  const displayTime =
    driver.comment && isQualPractice
      ? driver.comment.toUpperCase()
      : isLive
        ? driver.totalTimeText || driver.timeText || "-"
        : driver.timeText || "-";
  const displayTimeColor =
    driver.comment && isQualPractice ? theme.error : theme.text;
  const sponsorName = driver.sponsorName || driver.teamName || "Team";
  const liveBestLapText = driver.bestLapTime || "-";
  const liveLapsLedText = driver.lapsLed != null ? String(driver.lapsLed) : "-";
  const livePitsText = driver.pitStopsCount || "-";
  const livePassesText = driver.passes != null ? String(driver.passes) : "-";
  const liveAvgRestartText =
    driver.avgRestartSpeed != null ? String(driver.avgRestartSpeed) : "-";
  const liveAvgPosText =
    driver.avgRunningPosition != null ? String(driver.avgRunningPosition) : "-";
  const liveAvgSpeedText =
    driver.avgSpeed != null ? String(driver.avgSpeed) : "-";
  const passingDiffColor =
    (driver.passingDiff != 0 || driver.passingDiff != null) &&
    driver.passingDiff > 0
      ? theme.success
      : driver.passingDiff < 0
        ? theme.error
        : theme.textSecondary;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.sessionCopyOverlay}>
        <ViewShot ref={cardRef} options={{ format: "png", quality: 1 }}>
          <View
            style={[
              styles.driverStatsCard,
              { backgroundColor: theme.surface, width: cardWidth },
            ]}
          >
            {/* Header */}
            <View
              style={[
                styles.driverStatsHeader,
                {
                  backgroundColor: `${driver.teamColor}33`,
                  borderBottomColor: driver.teamColor,
                },
              ]}
            >
              {/* Top row with badge and track info */}
              <View style={styles.driverStatsHeaderTop}>
                <View
                  style={[
                    styles.driverStatsBadge,
                    { backgroundColor: driver.teamColor },
                  ]}
                >
                  <Text
                    style={[
                      styles.driverStatsBadgeText,
                      { color: getF1TextOnColor(driver.teamColor) },
                    ]}
                  >
                    {(() => {
                      // Prefer explicit run label for live drivers
                      if (isLive) {
                        return driver.runLabel || "LIVE";
                      }
                      // Non-live: normalize common source types
                      const s = String(sourceType || "").toUpperCase();
                      if (s === "QUAL" || s === "PRACTICE" || s === "RACE") {
                        return s;
                      }
                      return s || sourceType || "RACE";
                    })()}
                  </Text>
                </View>

                <View style={styles.driverStatsRaceInfoRight}>
                  <Text
                    style={[styles.driverStatsRaceName, { color: theme.text }]}
                    numberOfLines={2}
                  >
                    {isLive ? raceName || trackName : trackName}
                  </Text>
                  {trackLogo ? (
                    <Image
                      source={{ uri: trackLogo }}
                      style={styles.driverStatsTrackLogo}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={styles.driverStatsTrackFallback}>
                      <Text
                        style={[
                          styles.driverStatsTrackFallbackText,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {getInitials(trackName)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Headshot and info row */}
              <View style={styles.driverStatsHeadshotRow}>
                {/* Headshot with View wrapper */}
                <View style={styles.driverStatsHeadshotContainer}>
                  {driver.headshot ? (
                    <View
                      style={[
                        styles.driverStatsHeadshotCircle,
                        {
                          borderColor: driver.teamColor,
                          backgroundColor: `${driver.teamColor}22`,
                        },
                      ]}
                    >
                      <Image
                        source={{ uri: driver.headshot }}
                        style={{
                          width: "100%",
                          height: "150%",
                          transform: [{ translateY: 1.5 }, { translateX: -2 }],
                        }}
                        resizeMode="cover"
                      />
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.driverStatsHeadshotCircle,
                        {
                          backgroundColor: `${driver.teamColor}22`,
                          alignItems: "center",
                          justifyContent: "center",
                        },
                      ]}
                    >
                      <Text
                        style={[styles.driverStatsInitials, { color: "#fff" }]}
                      >
                        {getInitials(driver.name)}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Name, team, and top 3 stats */}
                <View style={styles.driverStatsNameAndStatsBlock}>
                  {/* Top 3 stats summary row */}
                  <View style={styles.driverStatsSummaryRow}>
                    <View style={styles.driverStatsSummaryCell}>
                      <Text
                        style={[
                          styles.driverStatsSummaryVal,
                          { color: theme.text },
                        ]}
                      >
                        {driver.pos ?? "-"}
                      </Text>
                      <Text
                        style={[
                          styles.driverStatsSummaryLbl,
                          { color: theme.textSecondary },
                        ]}
                      >
                        POS
                      </Text>
                    </View>
                    <View style={styles.driverStatsSummaryCell}>
                      <Text
                        style={[
                          styles.driverStatsSummaryVal,
                          { color: displayTimeColor },
                        ]}
                      >
                        {displayTime}
                      </Text>
                      <Text
                        style={[
                          styles.driverStatsSummaryLbl,
                          { color: theme.textSecondary },
                        ]}
                      >
                        TIME
                      </Text>
                    </View>
                    <View style={styles.driverStatsSummaryCell}>
                      <Text
                        style={[
                          styles.driverStatsSummaryVal,
                          { color: theme.text },
                        ]}
                      >
                        {driver.lapsCompleted != null
                          ? String(driver.lapsCompleted)
                          : driver.bestLapNumber || "-"}
                      </Text>
                      <Text
                        style={[
                          styles.driverStatsSummaryLbl,
                          { color: theme.textSecondary },
                        ]}
                      >
                        LAPS
                      </Text>
                    </View>
                  </View>

                  {/* Driver name */}
                  <Text
                    style={[styles.driverStatsName, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {driver.name
                      .replace(/#\S*/g, "")
                      .replace(/\(i\)/g, "")
                      .replace(/\*/g, "")
                      .trim()}
                  </Text>

                  {/* Team name */}
                  <Text
                    style={[
                      styles.driverStatsTeam,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {sponsorName}
                  </Text>
                </View>
              </View>
            </View>

            {isLive ? (
              <View style={styles.driverStatsGrid}>
                <View
                  style={[
                    styles.driverStatCell,
                    {
                      borderRightWidth: StyleSheet.hairlineWidth,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  {driver.copyPositionDeltaText ? (
                    <Text
                      style={[
                        styles.driverStatTopRight,
                        {
                          color:
                            driver.positionDeltaColor || theme.textSecondary,
                        },
                      ]}
                    >
                      {driver.copyPositionDeltaText}
                    </Text>
                  ) : null}
                  <Text
                    style={[styles.driverStatValue, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {driver.pos ?? "-"}
                  </Text>
                  <Text
                    style={[
                      styles.driverStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    POS
                  </Text>
                </View>

                <View
                  style={[
                    styles.driverStatCell,
                    {
                      borderRightWidth: StyleSheet.hairlineWidth,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  {driver.formattedDelta ? (
                    <Text
                      style={[
                        styles.driverStatTopRight,
                        {
                          color: theme.textSecondary,
                        },
                      ]}
                    >
                      {driver.formattedDelta}
                    </Text>
                  ) : null}
                  <Text
                    style={[
                      styles.driverStatValue,
                      { color: displayTimeColor },
                    ]}
                    numberOfLines={1}
                  >
                    {displayTime}
                  </Text>
                  <Text
                    style={[
                      styles.driverStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    TOTAL TIME
                  </Text>
                </View>

                <View
                  style={[
                    styles.driverStatCell,
                    {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.driverStatValue, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {driver.lapsCompleted ?? "-"}
                  </Text>
                  <Text
                    style={[
                      styles.driverStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    LAPS
                  </Text>
                </View>

                <View
                  style={[
                    styles.driverStatCell,
                    {
                      borderRightWidth: StyleSheet.hairlineWidth,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.driverStatValue, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {liveLapsLedText}
                  </Text>
                  <Text
                    style={[
                      styles.driverStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    LAPS LED
                  </Text>
                </View>

                <View
                  style={[
                    styles.driverStatCell,
                    {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  {driver.pits ? (
                    <Text
                      style={[
                        styles.driverStatTopRight,
                        {
                          color: theme.textSecondary,
                        },
                      ]}
                    >
                      {driver.pits} AVG
                    </Text>
                  ) : null}
                  <Text
                    style={[styles.driverStatValue, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {livePitsText}
                  </Text>
                  <Text
                    style={[
                      styles.driverStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    PITS
                  </Text>
                </View>

                <View
                  style={[
                    styles.driverStatCell,
                    {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderLeftWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  {driver.passingDiff ? (
                    <Text
                      style={[
                        styles.driverStatTopRight,
                        {
                          color: passingDiffColor,
                        },
                      ]}
                    >
                      {String(driver.passingDiff).includes("-")
                        ? driver.passingDiff
                        : `+${driver.passingDiff}`}{" "}
                      DIFF
                    </Text>
                  ) : null}
                  <Text
                    style={[styles.driverStatValue, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {livePassesText}
                  </Text>
                  <Text
                    style={[
                      styles.driverStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    PASSES
                  </Text>
                </View>

                <View
                  style={[
                    styles.driverStatCell,
                    {
                      borderRightWidth: StyleSheet.hairlineWidth,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.driverStatValue, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {liveAvgRestartText} mph
                  </Text>
                  <Text
                    style={[
                      styles.driverStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    AVG RESTART
                  </Text>
                </View>

                <View
                  style={[
                    styles.driverStatCell,
                    {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.driverStatValue, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {liveAvgPosText}
                  </Text>
                  <Text
                    style={[
                      styles.driverStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    AVG POS
                  </Text>
                </View>

                <View
                  style={[
                    styles.driverStatCell,
                    {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderLeftWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.driverStatValue, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {liveAvgSpeedText} mph
                  </Text>
                  <Text
                    style={[
                      styles.driverStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    AVG SPEED
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.driverStatsGrid}>
                {/* POS */}
                <View
                  style={[
                    styles.driverStatCell,
                    {
                      borderRightWidth: StyleSheet.hairlineWidth,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.driverStatValue, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {driver.pos ?? "-"}
                  </Text>
                  <Text
                    style={[
                      styles.driverStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    POS
                  </Text>
                </View>

                {/* TIME - with delta_leader in top right if applicable */}
                <View
                  style={[
                    styles.driverStatCell,
                    {
                      borderRightWidth: StyleSheet.hairlineWidth,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  {driver.deltaLeaderText &&
                    driver.deltaLeaderText !== "0" &&
                    !driver.comment && (
                      <Text
                        style={[
                          styles.driverStatTopRight,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {driver.deltaLeaderText}
                      </Text>
                    )}
                  <Text
                    style={[
                      styles.driverStatValue,
                      { color: displayTimeColor },
                    ]}
                    numberOfLines={1}
                  >
                    {displayTime}
                  </Text>
                  <Text
                    style={[
                      styles.driverStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    TIME
                  </Text>
                </View>

                {/* BEST LAP SPEED */}
                <View
                  style={[
                    styles.driverStatCell,
                    {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.driverStatValue, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {driver.bestLapSpeed || "-"}
                  </Text>
                  <Text
                    style={[
                      styles.driverStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    TOP SPEED
                  </Text>
                </View>

                {/* BEST LAP NUMBER */}
                <View
                  style={[
                    styles.driverStatCell,
                    {
                      borderRightWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.driverStatValue, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {driver.bestLapNumber || "-"}
                  </Text>
                  <Text
                    style={[
                      styles.driverStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    BEST LAP
                  </Text>
                </View>

                {/* LAPS COMPLETED */}
                <View
                  style={[
                    styles.driverStatCell,
                    {
                      borderRightWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.driverStatValue, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {driver.lapsCompleted || "-"}
                  </Text>
                  <Text
                    style={[
                      styles.driverStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    LAPS
                  </Text>
                </View>

                {/* VEHICLE NUMBER */}
                <View style={styles.driverStatCell}>
                  <Text
                    style={[styles.driverStatValue, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {driver.vehicleNumber || "-"}
                  </Text>
                  <Text
                    style={[
                      styles.driverStatLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    CAR #
                  </Text>
                </View>
              </View>
            )}

            {/* Footer */}
            <View
              style={[
                styles.driverStatsFooter,
                { borderTopColor: theme.border },
              ]}
            >
              <Text
                style={[styles.driverStatsFooterText, { color: theme.text }]}
              >
                SportsHeart{" "}
                <Ionicons name="heart" size={10} color={colors.primary} />
              </Text>
            </View>
          </View>
        </ViewShot>

        {/* Share and Close buttons */}
        <View style={styles.sessionCopyActions}>
          <TouchableOpacity
            onPress={handleShare}
            disabled={sharing}
            style={[
              styles.sessionCopyActionBtn,
              { backgroundColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.sessionCopyActionBtnText,
                { color: getF1TextOnColor(colors.primary) },
              ]}
            >
              {sharing ? "Sharing…" : "Share"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onClose}
            disabled={sharing}
            style={[
              styles.sessionCopyActionBtn,
              { backgroundColor: theme.surfaceSecondary },
            ]}
          >
            <Text
              style={[
                styles.sessionCopyActionBtnText,
                { color: getF1TextOnColor(theme.surfaceSecondary) },
              ]}
            >
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const NascarRaceCopyCard = ({
  visible,
  onClose,
  driver,
  colors,
  theme,
  trackLogo,
  trackName,
  livePit,
  racePayload,
}) => {
  const cardRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const cardWidth = Math.min(width - 48, 540);

  if (!visible || !driver) return null;

  const handleShare = async () => {
    if (!cardRef.current || sharing) return;
    try {
      setSharing(true);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const uri = await cardRef.current.capture();
      await Share.share({ url: uri, title: "Driver Stats" });
    } catch (error) {
      console.warn("[NascarRaceCopyCard] share failed", error);
    } finally {
      setSharing(false);
    }
  };

  // Extract race-specific data
  const finishingPos = Number(driver.finishing_position ?? "-");
  const startingPos = Number(driver.starting_position ?? "-");
  const posDelta =
    Number.isFinite(finishingPos) && Number.isFinite(startingPos)
      ? startingPos - finishingPos
      : 0;
  const posDeltaText =
    posDelta > 0
      ? `UP ${Math.abs(posDelta)} POS`
      : posDelta < 0
        ? `DOWN ${Math.abs(posDelta)} POS`
        : "";
  const posDeltaColor =
    posDelta > 0 ? theme.success : posDelta < 0 ? theme.error : theme.text;

  // Time logic from race
  const diffTimeRaw = driver.diff_time ?? null;
  const diffLapsRaw = driver.diff_laps ?? 0;
  const finishingStatus = driver.finishing_status ?? "";
  const totalRaceTime = racePayload?.race_list_basic?.total_race_time || "-";

  const formatRaceGapTime = (rawDiffTime) => {
    if (rawDiffTime == null || rawDiffTime === "") return "-";
    const text = String(rawDiffTime).trim();
    if (!text) return "-";
    if (!/^\d+$/.test(text)) return text;
    if (text.length === 1) return `0.00${text}`;
    if (text.length === 2) return `0.0${text}`;
    if (text.length === 3) return `0.${text}`;
    return `${text.slice(0, -3)}.${text.slice(-3)}`;
  };

  const hasNonRunningStatus =
    !!finishingStatus && finishingStatus.toLowerCase() !== "running";
  const diffTime = Number(diffTimeRaw);
  const diffLaps = Number(diffLapsRaw);

  let displayTime = "-";
  if (hasNonRunningStatus) {
    displayTime = finishingStatus;
  } else if (
    finishingPos === 1 &&
    (!Number.isFinite(diffTime) || diffTime === 0) &&
    (!Number.isFinite(diffLaps) || diffLaps === 0) &&
    totalRaceTime !== "-"
  ) {
    displayTime = String(totalRaceTime);
  } else if (Number.isFinite(diffLaps) && diffLaps > 0) {
    displayTime = `+${diffLaps} ${diffLaps === 1 ? "Lap" : "Laps"}`;
  } else if (diffTimeRaw != null) {
    displayTime = `+${formatRaceGapTime(diffTimeRaw)}s`;
  }

  // Laps with laps_led
  const lapsCompleted = driver.laps_completed ?? driver.laps ?? 0;
  const lapsLed = driver.laps_led ?? 0;

  // Pit stops
  const pitStopsArr = Array.isArray(
    livePit[String(driver.car_number ?? driver.NASCARDriverID)],
  )
    ? livePit[String(driver.car_number ?? driver.NASCARDriverID)]
    : [];
  const pitCount = pitStopsArr.length;
  const avgPitDuration =
    pitCount > 0
      ? (
          pitStopsArr.reduce((sum, pit) => {
            const duration = Number(pit.pit_stop_duration ?? pit.duration ?? 0);
            return sum + duration;
          }, 0) / pitCount
        ).toFixed(2)
      : 0;

  // Extract from loopstats drivers array
  const rating = driver.rating ?? driver.RTG ?? "-";
  const passes = driver.passes_gf ?? driver.passes ?? 0;
  const passingDiff = driver.passing_diff ?? 0;
  const passingDiffColor =
    passingDiff > 0
      ? theme.success
      : passingDiff < 0
        ? theme.error
        : theme.text;
  const top15Laps = driver.top15_laps ?? driver.top_15_laps ?? 0;
  const fastLaps = driver.fast_laps ?? 0;
  const avgPos = driver.avg_ps ?? driver.avg_position ?? "-";
  const fastestLapSpeed =
    driver.bestLapSpeed ?? driver.fastest_lap_speed ?? "-";
  const fastestLapLapNum =
    driver.bestLapLapNum ?? driver.fastest_lap_lap_num ?? "-";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.sessionCopyOverlay}>
        <ViewShot ref={cardRef} options={{ format: "png", quality: 1 }}>
          <View
            style={[
              styles.driverStatsCard,
              { backgroundColor: theme.surface, width: cardWidth },
            ]}
          >
            {/* Header */}
            <View
              style={[
                styles.driverStatsHeader,
                {
                  backgroundColor: `${driver.teamColor}33`,
                  borderBottomColor: driver.teamColor,
                },
              ]}
            >
              {/* Top row with badge and track info */}
              <View style={styles.driverStatsHeaderTop}>
                <View
                  style={[
                    styles.driverStatsBadge,
                    { backgroundColor: driver.teamColor },
                  ]}
                >
                  <Text
                    style={[
                      styles.driverStatsBadgeText,
                      { color: getF1TextOnColor(driver.teamColor) },
                    ]}
                  >
                    RACE
                  </Text>
                </View>

                <View style={styles.driverStatsRaceInfoRight}>
                  <Text
                    style={[styles.driverStatsRaceName, { color: theme.text }]}
                    numberOfLines={2}
                  >
                    {trackName}
                  </Text>
                  {trackLogo ? (
                    <Image
                      source={{ uri: trackLogo }}
                      style={styles.driverStatsTrackLogo}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={styles.driverStatsTrackFallback}>
                      <Text
                        style={[
                          styles.driverStatsTrackFallbackText,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {getInitials(trackName)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Headshot and info row */}
              <View style={styles.driverStatsHeadshotRow}>
                {/* Headshot with View wrapper */}
                <View style={styles.driverStatsHeadshotContainer}>
                  {driver.headshot ? (
                    <View
                      style={[
                        styles.driverStatsHeadshotCircle,
                        {
                          borderColor: driver.teamColor,
                          backgroundColor: `${driver.teamColor}22`,
                        },
                      ]}
                    >
                      <Image
                        source={{ uri: driver.headshot }}
                        style={{
                          width: "100%",
                          height: "150%",
                          transform: [{ translateY: 1.5 }, { translateX: -2 }],
                        }}
                        resizeMode="cover"
                      />
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.driverStatsHeadshotCircle,
                        {
                          backgroundColor: `${driver.teamColor}22`,
                          alignItems: "center",
                          justifyContent: "center",
                        },
                      ]}
                    >
                      <Text
                        style={[styles.driverStatsInitials, { color: "#fff" }]}
                      >
                        {getInitials(driver.name)}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Name, team, and top 3 stats */}
                <View style={styles.driverStatsNameAndStatsBlock}>
                  {/* Top 3 stats summary row */}
                  <View style={styles.driverStatsSummaryRow}>
                    <View style={styles.driverStatsSummaryCell}>
                      <Text
                        style={[
                          styles.driverStatsSummaryVal,
                          { color: theme.text },
                        ]}
                      >
                        {finishingPos}
                      </Text>
                      <Text
                        style={[
                          styles.driverStatsSummaryLbl,
                          { color: theme.textSecondary },
                        ]}
                      >
                        POS
                      </Text>
                    </View>
                    <View style={styles.driverStatsSummaryCell}>
                      <Text
                        style={[
                          styles.driverStatsSummaryVal,
                          { color: theme.text },
                        ]}
                      >
                        {displayTime}
                      </Text>
                      <Text
                        style={[
                          styles.driverStatsSummaryLbl,
                          { color: theme.textSecondary },
                        ]}
                      >
                        TIME
                      </Text>
                    </View>
                    <View style={styles.driverStatsSummaryCell}>
                      <Text
                        style={[
                          styles.driverStatsSummaryVal,
                          { color: theme.text },
                        ]}
                      >
                        {lapsCompleted}
                      </Text>
                      <Text
                        style={[
                          styles.driverStatsSummaryLbl,
                          { color: theme.textSecondary },
                        ]}
                      >
                        LAPS
                      </Text>
                    </View>
                  </View>

                  {/* Driver name */}
                  <Text
                    style={[styles.driverStatsName, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {driver.name}
                  </Text>

                  {/* Team name */}
                  <Text
                    style={[
                      styles.driverStatsTeam,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {driver.teamName || "Team"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Stats Grid - 9 stats for RACE */}
            <View style={styles.driverStatsGrid}>
              {/* POS */}
              <View
                style={[
                  styles.driverStatCell,
                  {
                    borderRightWidth: 1,
                    borderBottomWidth: 1,
                    borderColor: theme.border,
                  },
                ]}
              >
                {posDeltaText && (
                  <Text
                    style={[
                      styles.driverStatTopRight,
                      { color: posDeltaColor },
                    ]}
                  >
                    {posDeltaText}
                  </Text>
                )}
                <Text
                  style={[styles.driverStatValue, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {finishingPos}
                </Text>
                <Text
                  style={[
                    styles.driverStatLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  POS
                </Text>
              </View>

              {/* TIME */}
              <View
                style={[
                  styles.driverStatCell,
                  {
                    borderRightWidth: 1,
                    borderBottomWidth: 1,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Text
                  style={[styles.driverStatValue, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {displayTime}
                </Text>
                <Text
                  style={[
                    styles.driverStatLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  TIME
                </Text>
              </View>

              {/* LAPS */}
              <View
                style={[
                  styles.driverStatCell,
                  {
                    borderBottomWidth: 1,
                    borderColor: theme.border,
                  },
                ]}
              >
                {lapsLed > 0 && (
                  <Text
                    style={[
                      styles.driverStatTopRight,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {lapsLed} LED
                  </Text>
                )}
                <Text
                  style={[styles.driverStatValue, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {lapsCompleted}
                </Text>
                <Text
                  style={[
                    styles.driverStatLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  LAPS
                </Text>
              </View>

              {/* PIT STOPS */}
              <View
                style={[
                  styles.driverStatCell,
                  {
                    borderRightWidth: 1,
                    borderBottomWidth: 1,
                    borderColor: theme.border,
                  },
                ]}
              >
                {avgPitDuration > 0 && (
                  <Text
                    style={[
                      styles.driverStatTopRight,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {avgPitDuration}s AVG
                  </Text>
                )}
                <Text
                  style={[styles.driverStatValue, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {pitCount}
                </Text>
                <Text
                  style={[
                    styles.driverStatLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  PITS
                </Text>
              </View>

              {/* RATING */}
              <View
                style={[
                  styles.driverStatCell,
                  {
                    borderRightWidth: 1,
                    borderBottomWidth: 1,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Text
                  style={[styles.driverStatValue, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {rating ?? "-"}
                </Text>
                <Text
                  style={[
                    styles.driverStatLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  RTG
                </Text>
              </View>

              {/* PASSES */}
              <View
                style={[
                  styles.driverStatCell,
                  {
                    borderBottomWidth: 1,
                    borderColor: theme.border,
                  },
                ]}
              >
                {passingDiff !== 0 && (
                  <Text
                    style={[
                      styles.driverStatTopRight,
                      { color: passingDiffColor },
                    ]}
                  >
                    {passingDiff > 0 ? "+" : ""}
                    {passingDiff} DIFF
                  </Text>
                )}
                <Text
                  style={[styles.driverStatValue, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {passes ?? "-"}
                </Text>
                <Text
                  style={[
                    styles.driverStatLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  PASSES
                </Text>
              </View>

              {/* TOP 15 LAPS */}
              <View
                style={[
                  styles.driverStatCell,
                  {
                    borderRightWidth: 1,
                    borderColor: theme.border,
                  },
                ]}
              >
                {fastLaps > 0 && (
                  <Text
                    style={[
                      styles.driverStatTopRight,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {fastLaps} FAST
                  </Text>
                )}
                <Text
                  style={[styles.driverStatValue, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {top15Laps ?? "-"}
                </Text>
                <Text
                  style={[
                    styles.driverStatLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  TOP 15 LAPS
                </Text>
              </View>

              {/* AVG POSITION */}
              <View
                style={[
                  styles.driverStatCell,
                  {
                    borderRightWidth: 1,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Text
                  style={[styles.driverStatValue, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {avgPos ?? "-"}
                </Text>
                <Text
                  style={[
                    styles.driverStatLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  AVG POS
                </Text>
              </View>

              {/* FASTEST LAP SPEED */}
              <View style={styles.driverStatCell}>
                {fastestLapLapNum !== "-" && (
                  <Text
                    style={[
                      styles.driverStatTopRight,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Lap {fastestLapLapNum}
                  </Text>
                )}
                <Text
                  style={[styles.driverStatValue, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {fastestLapSpeed}
                </Text>
                <Text
                  style={[
                    styles.driverStatLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  BEST SPEED
                </Text>
              </View>
            </View>

            {/* Footer */}
            <View
              style={[
                styles.driverStatsFooter,
                { borderTopColor: theme.border },
              ]}
            >
              <Text
                style={[styles.driverStatsFooterText, { color: theme.text }]}
              >
                SportsHeart{" "}
                <Ionicons name="heart" size={10} color={colors.primary} />
              </Text>
            </View>
          </View>
        </ViewShot>

        {/* Share and Close buttons */}
        <View style={styles.sessionCopyActions}>
          <TouchableOpacity
            onPress={handleShare}
            disabled={sharing}
            style={[
              styles.sessionCopyActionBtn,
              { backgroundColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.sessionCopyActionBtnText,
                { color: getF1TextOnColor(colors.primary) },
              ]}
            >
              {sharing ? "Sharing…" : "Share"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onClose}
            disabled={sharing}
            style={[
              styles.sessionCopyActionBtn,
              { backgroundColor: theme.surfaceSecondary },
            ]}
          >
            <Text
              style={[
                styles.sessionCopyActionBtnText,
                { color: getF1TextOnColor(theme.surfaceSecondary) },
              ]}
            >
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

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
  const [driversSource, setDriversSource] = useState("RACE");
  const [stagesSource, setStagesSource] = useState("2");
  const [sessionCardVisible, setSessionCardVisible] = useState(false);
  const [sessionCardSource, setSessionCardSource] = useState("RACE");
  const [driverStatsCardVisible, setDriverStatsCardVisible] = useState(false);
  const [selectedDriverForStats, setSelectedDriverForStats] = useState(null);
  const [selectedDriverStatsSource, setSelectedDriverStatsSource] =
    useState(driversSource);
  const [raceCopyCardVisible, setRaceCopyCardVisible] = useState(false);
  const [selectedDriverForRace, setSelectedDriverForRace] = useState(null);

  const { viewerData, isJoined } = useGamePresence(
    raceId + "-" + params.runType,
  );

  const cacheKey = useMemo(
    () => `${NASCAR_CACHE_PREFIX}${raceId}:${resolvedStatus}`,
    [raceId, resolvedStatus],
  );

  const loadRace = useCallback(
    async (options = {}) => {
      const { silent = false, bypassCache = false } = options;

      if (!raceId) {
        setError("Missing race id");
        setLoading(false);
        return;
      }

      if (!silent) {
        setLoading(true);
      }
      setError(null);

      const computed = params.status || computeNascarStatus(initialRaceDate);
      setResolvedStatus(computed);
      const computedStatus = String(computed || "").toLowerCase();

      try {
        if (computedStatus !== "live" && !bypassCache) {
          const raw = await AsyncStorage.getItem(
            `${NASCAR_CACHE_PREFIX}${raceId}:${computed}`,
          );
          if (raw) {
            const cached = JSON.parse(raw);
            if (cached?.ts && Date.now() - cached.ts < 1000 * 60 * 10) {
              setRacePayload(cached.data);
              if (!silent) {
                setLoading(false);
              }
              return;
            }
          }
        }

        const resp = await fetch(`${NASCAR_RACE_API}/${raceId}/${computed}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        const responseStatus = String(json?.status || computed).toLowerCase();
        const actual = json?.data ?? json;
        setResolvedStatus(responseStatus);
        setRacePayload(actual);

        if (responseStatus !== "live") {
          try {
            await AsyncStorage.setItem(
              `${NASCAR_CACHE_PREFIX}${raceId}:${responseStatus}`,
              JSON.stringify({ ts: Date.now(), data: actual }),
            );
          } catch (cacheError) {
            console.warn(
              "[NascarRaceDetailsScreen] cache write failed",
              cacheError,
            );
          }
        }
      } catch (fetchError) {
        if (!silent) {
          setError(fetchError?.message || "Failed to load NASCAR race details");
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [raceId, initialRaceDate, params.status],
  );

  useEffect(() => {
    loadRace();
  }, [loadRace]);

  useEffect(() => {
    if (String(resolvedStatus || "").toLowerCase() !== "live") return undefined;

    const intervalId = setInterval(() => {
      loadRace({ silent: true, bypassCache: true });
    }, 5000);

    return () => clearInterval(intervalId);
  }, [loadRace, resolvedStatus]);

  const race =
    racePayload?.weekend?.weekend_race?.[0] ||
    racePayload?.weekend_race?.[0] ||
    {};
  const isLiveStatus = String(resolvedStatus || "").toLowerCase() === "live";
  const mapsDrivers = racePayload?.maps?.drivers || {};
  const track = racePayload?.track || {};
  const drivers = racePayload?.lap_times?.laps || [];
  const flags = racePayload?.lap_times?.flags || [];
  const liveFlagRows = useMemo(
    () =>
      Array.isArray(racePayload?.live_flag_data)
        ? racePayload.live_flag_data
        : [],
    [racePayload?.live_flag_data],
  );
  const liveStagePoints = useMemo(
    () =>
      Array.isArray(racePayload?.live_stage_points)
        ? racePayload.live_stage_points
        : [],
    [racePayload?.live_stage_points],
  );
  const liveStageRunData = useMemo(
    () =>
      Array.isArray(racePayload?.live_stage_points?.runData) &&
      racePayload.live_stage_points.runData.length &&
      racePayload.live_stage_points.runData?.[0]?.stage2Laps != 0
        ? racePayload.live_stage_points.runData[0]
        : null,
    [racePayload?.live_stage_points],
  );
  const tabKeys = useMemo(
    () =>
      isLiveStatus
        ? ["Main", "Drivers", "Stages", "Pit Stops", "Flag"]
        : TAB_KEYS,
    [isLiveStatus],
  );
  const livePitRows = useMemo(
    () =>
      Array.isArray(racePayload?.live_pit_data)
        ? racePayload.live_pit_data
        : [],
    [racePayload?.live_pit_data],
  );
  const livePit = useMemo(() => {
    const groupedPit = racePayload?.live_pit;
    if (
      groupedPit &&
      typeof groupedPit === "object" &&
      !Array.isArray(groupedPit) &&
      Object.keys(groupedPit).length > 0
    ) {
      return groupedPit;
    }

    if (!livePitRows.length) return {};

    return livePitRows.reduce((acc, pit) => {
      const key =
        pit?.vehicle_number ??
        pit?.car_number ??
        pit?.Number ??
        pit?.number ??
        pit?.NASCARDriverID ??
        null;
      if (key == null) return acc;
      const normalizedKey = String(key);
      if (!acc[normalizedKey]) {
        acc[normalizedKey] = [];
      }
      acc[normalizedKey].push(pit);
      return acc;
    }, {});
  }, [livePitRows, racePayload?.live_pit]);
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

  useEffect(() => {
    if (!tabKeys.includes(selectedTab)) {
      setSelectedTab("Main");
    }
  }, [selectedTab, tabKeys]);

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
          const cleanedName = String(name)
            .replace(/[#*]/g, "") // remove # and *
            .replace(/\(i\)/gi, "") // remove (i)
            .trim();

          const parts = cleanedName.split(/\s+/).filter(Boolean);

          const last =
            parts.length >= 2
              ? parts[1] + (parts[2] ? " " + parts[2] : "")
              : cleanedName;
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
  const trackCity = track.city || "City";
  const trackState = track.state || "State";
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

  const winnerResult = useMemo(() => {
    const raceResults = Array.isArray(
      racePayload?.weekend?.weekend_race?.[0]?.results,
    )
      ? racePayload.weekend.weekend_race[0].results
      : [];
    if (!raceResults.length) return null;

    return (
      raceResults.find(
        (row) =>
          Number(
            row?.finishing_position ?? row?.finishingPosition ?? row?.position,
          ) === 1,
      ) || null
    );
  }, [racePayload]);

  const winnerDriverId =
    winnerResult?.NASCARDriverID ??
    winnerResult?.Nascar_Driver_ID ??
    winnerResult?.driver_id ??
    winnerResult?.driverId ??
    racePayload?.race_list_basic?.winner_driver_id ??
    race?.winner_driver_id ??
    null;

  const winnerMapEntry =
    winnerDriverId != null ? mapsDrivers[String(winnerDriverId)] || null : null;

  const winnerName =
    winnerResult?.driver_name ||
    winnerResult?.FullName ||
    winnerResult?.full_name ||
    winnerMapEntry?.name ||
    "TBD";

  const winnerTeam =
    winnerMapEntry?.team ||
    winnerResult?.team ||
    getManufacturerName(
      winnerResult?.vehicle_manufacturer ||
        winnerResult?.manufacturer ||
        winnerMapEntry?.manufacturer ||
        null,
    ) ||
    "";

  const winnerHeadshot =
    winnerMapEntry?.image ||
    winnerMapEntry?.headshot ||
    winnerResult?.driver_image ||
    winnerResult?.headshot ||
    null;

  const winnerTime =
    racePayload?.race_list_basic?.total_race_time ||
    race?.total_race_time ||
    "--";

  const winnerTeamColor = getManufacturerColor(
    winnerResult?.vehicle_manufacturer ||
      winnerResult?.manufacturer ||
      winnerMapEntry?.manufacturer ||
      null,
  );

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
    const rows =
      String(resolvedStatus || "").toLowerCase() === "live"
        ? livePitRows
        : Object.values(livePit).flat();
    return [...rows].sort(
      (a, b) => (a.pit_in_race_time || 0) - (b.pit_in_race_time || 0),
    );
  }, [livePit, livePitRows, resolvedStatus]);

  const flowRows = useMemo(() => {
    return flags.map((flag, idx) => ({
      lap: flag.LapsCompleted,
      state: flag.FlagState,
      key: `${flag.LapsCompleted}-${idx}`,
    }));
  }, [flags]);

  const formatBestLapTime = useCallback((value) => {
    if (value == null || value === "") return "-";
    if (typeof value === "string") {
      if (value.includes(":")) return value;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? formatDuration(parsed) : value;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? formatDuration(parsed) : String(value);
  }, []);

  const availableDriverSources = useMemo(() => {
    const items = [];
    const raceRows = Array.isArray(
      racePayload?.weekend?.weekend_race?.[0]?.results,
    )
      ? racePayload.weekend.weekend_race[0].results
      : [];
    const qualRun = (weekendRuns || []).find(
      (run) => Number(run?.run_type) === 2,
    );
    const qualRows = Array.isArray(qualRun?.results) ? qualRun.results : [];
    const practiceRun = (weekendRuns || []).find(
      (run) => Number(run?.run_type) === 1,
    );
    const practiceRows = Array.isArray(practiceRun?.results)
      ? practiceRun.results
      : [];

    if (raceRows.length)
      items.push({ key: "RACE", label: "RACE", rows: raceRows });
    if (qualRows.length)
      items.push({ key: "QUAL", label: "QUALIFYING", rows: qualRows });
    if (practiceRows.length)
      items.push({ key: "PRACTICE", label: "PRACTICE", rows: practiceRows });

    return items;
  }, [racePayload, weekendRuns]);

  const sessionCardData = useMemo(() => {
    if (sessionCardSource === "LIVE") {
      const liveFeed = racePayload?.live_feed;
      if (!liveFeed) return null;
      const vehicles = Array.isArray(liveFeed?.vehicles)
        ? liveFeed.vehicles
        : [];
      if (!vehicles.length) return null;

      const liveRunType = Number(liveFeed?.run_type ?? 0);
      const sourceLabel = getNascarRunTypeLabel(liveRunType);
      const sorted = [...vehicles].sort(
        (a, b) =>
          Number(a?.running_position ?? 999) -
          Number(b?.running_position ?? 999),
      );
      const podiumRows = sorted.filter((row) => {
        const position = Number(row?.running_position ?? row?.position ?? 0);
        return Number.isFinite(position) && position > 0;
      });
      const podiumEntries = podiumRows.slice(0, 3).map((row, index) => {
        const driverInfo = row?.driver || {};
        const driverId =
          driverInfo?.driver_id ?? row?.driver_id ?? row?.driverId ?? null;
        const driverKey = driverId != null ? String(driverId) : null;
        const mapEntry = driverKey ? mapsDrivers[driverKey] || null : null;
        const manufacturer =
          row?.vehicle_manufacturer ||
          row?.Manufacturer ||
          row?.manufacturer ||
          mapEntry?.manufacturer ||
          null;
        const teamColor = getManufacturerColor(manufacturer) || colors.primary;
        const driverName =
          driverInfo?.full_name ||
          row?.driver_name ||
          row?.DriverName ||
          row?.FullName ||
          row?.full_name ||
          mapEntry?.name ||
          `Driver ${index + 1}`;

        const cleanedName = String(driverName)
          .replace(/[#*]/g, "") // remove # and *
          .replace(/\(i\)/gi, "") // remove (i)
          .trim();

        const parts = cleanedName.split(/\s+/).filter(Boolean);

        const lastName =
          parts.length >= 2
            ? parts[1] + (parts[2] ? " " + parts[2] : "") // always use the 2nd word
            : cleanedName;

        const position = Number(row?.running_position ?? index + 1);
        const deltaRaw = row?.delta ?? 0;
        const elapsedTime = row?.vehicle_elapsed_time;
        const bestLapTime =
          row?.best_lap_time ??
          row?.bestLapTime ??
          row?.fastest_lap_time ??
          row?.fastestLapTime ??
          null;
        const timeText =
          liveRunType != 3
            ? formatSessionCopyTime(bestLapTime)
            : formatElapsedClock(elapsedTime);
        const deltaLeaderText =
          position === 1 && Number(deltaRaw) === 0
            ? "Leader"
            : formatDeltaLeader(deltaRaw);
        const lapsCompleted = row?.laps_completed ?? null;
        const pitsArray = Array.isArray(row?.pit_stops) ? row.pit_stops : [];
        const pitsCount = pitsArray.length;

        return {
          position,
          name: driverName,
          lastName,
          teamName: mapEntry?.team || getManufacturerName(manufacturer),
          teamColor,
          headshot:
            mapEntry?.image || row?.driver_image || row?.headshot || null,
          timeText,
          deltaLeaderText,
          showDeltaLeader: deltaLeaderText != null,
          laps: Number.isFinite(Number(lapsCompleted))
            ? Number(lapsCompleted)
            : lapsCompleted,
          pits: pitsCount,
        };
      });

      return {
        sourceLabel,
        raceName: liveFeed?.run_name || raceTitle,
        sessionDate: liveFeed?.time_of_day_os
          ? toFullDateLabel(liveFeed.time_of_day_os)
          : raceDate
            ? toFullDateLabel(raceDate)
            : null,
        trackName,
        trackState,
        trackLogo,
        podiumEntries,
        accentColor,
      };
    }

    const source = availableDriverSources.find(
      (item) => item.key === sessionCardSource,
    );
    const rows = Array.isArray(source?.rows) ? source.rows : [];
    if (!rows.length) return null;

    const preferredRunTypes =
      sessionCardSource === "QUAL"
        ? [2, 3, 1]
        : sessionCardSource === "PRACTICE"
          ? [1, 2, 3]
          : [3, 2, 1];
    const sessionSchedule =
      preferredRunTypes
        .map((runType) =>
          scheduleItems.find((item) => Number(item?.run_type) === runType),
        )
        .find(Boolean) || null;

    const sourceLabel =
      source?.label ||
      (sessionCardSource === "QUAL"
        ? "QUALIFYING"
        : sessionCardSource === "PRACTICE"
          ? "PRACTICE"
          : "RACE");

    const formatRaceGapTime = (rawDiffTime) => {
      if (rawDiffTime == null || rawDiffTime === "") return "-";
      const text = String(rawDiffTime).trim();
      if (!text) return "-";
      if (!/^\d+$/.test(text)) return text;
      if (text.length === 1) return `0.00${text}`;
      if (text.length === 2) return `0.0${text}`;
      if (text.length === 3) return `0.${text}`;
      return `${text.slice(0, -3)}.${text.slice(-3)}`;
    };

    const sorted = [...rows].sort((a, b) => {
      const aPos = Number(
        a?.finishing_position ?? a?.finishingPosition ?? a?.position ?? 999,
      );
      const bPos = Number(
        b?.finishing_position ?? b?.finishingPosition ?? b?.position ?? 999,
      );
      return aPos - bPos;
    });

    const podiumRows = sorted.filter((row) => {
      const position = Number(
        row?.finishing_position ?? row?.finishingPosition ?? row?.position ?? 0,
      );
      return Number.isFinite(position) && position > 0;
    });

    const podiumEntries = podiumRows.slice(0, 3).map((row, index) => {
      const driverId =
        row?.NASCARDriverID ??
        row?.Nascar_Driver_ID ??
        row?.driver_id ??
        row?.driverId ??
        null;
      const driverKey = driverId != null ? String(driverId) : null;
      const mapEntry = driverKey ? mapsDrivers[driverKey] || null : null;
      const manufacturer =
        row?.vehicle_manufacturer ||
        row?.Manufacturer ||
        row?.manufacturer ||
        mapEntry?.manufacturer ||
        null;
      const teamColor = getManufacturerColor(manufacturer) || colors.primary;
      const driverName =
        row?.driver_name ||
        row?.DriverName ||
        row?.FullName ||
        row?.full_name ||
        mapEntry?.name ||
        `Driver ${index + 1}`;

      const cleanedName = String(driverName)
        .replace(/[#*]/g, "") // remove # and *
        .replace(/\(i\)/gi, "") // remove (i)
        .trim();

      const parts = cleanedName.split(/\s+/).filter(Boolean);

      const lastName =
        parts.length >= 2
          ? parts[1] + (parts[2] ? " " + parts[2] : "") // always use the 2nd and 3rd words
          : cleanedName;

      const finishingPos = Number(
        row?.finishing_position ?? row?.finishingPosition ?? row?.position,
      );
      const diffTimeRaw = row?.diff_time ?? row?.diffTime ?? null;
      const diffLapsRaw = row?.diff_laps ?? row?.diffLaps ?? null;
      const finishingStatusRaw =
        row?.finishing_status ?? row?.finishingStatus ?? row?.status ?? null;
      const finishingStatus = String(finishingStatusRaw || "").trim();
      const hasNonRunningStatus =
        !!finishingStatus && finishingStatus.toLowerCase() !== "running";
      const raceTotalTime =
        racePayload?.race_list_basic?.total_race_time ||
        race?.total_race_time ||
        null;

      const deltaLeaderRaw =
        row?.delta_leader ??
        row?.deltaLeader ??
        row?.gap_to_leader ??
        row?.gapToLeader ??
        null;
      const lapsRaw =
        row?.laps_completed ??
        row?.laps ??
        row?.lap_count ??
        row?.lapCount ??
        null;

      let timeText = "-";
      if (sessionCardSource === "RACE") {
        const diffTime = Number(diffTimeRaw);
        const diffLaps = Number(diffLapsRaw);

        if (hasNonRunningStatus) {
          timeText = finishingStatus;
        } else if (
          finishingPos === 1 &&
          Number.isFinite(diffTime) &&
          diffTime === 0 &&
          Number.isFinite(diffLaps) &&
          diffLaps === 0 &&
          raceTotalTime
        ) {
          timeText = String(raceTotalTime);
        } else if (Number.isFinite(diffLaps) && diffLaps > 0) {
          timeText = `+${diffLaps} ${diffLaps === 1 ? "Lap" : "Laps"}`;
        } else {
          timeText = `+${formatRaceGapTime(diffTimeRaw)}s`;
        }
      } else {
        const timeRaw =
          row?.time ||
          row?.total_time ||
          row?.duration ||
          row?.best_lap_time ||
          row?.bestLapTime ||
          row?.fastest_lap_time ||
          row?.fastestLapTime ||
          null;
        timeText = formatSessionCopyTime(timeRaw);
      }

      return {
        position: Number(
          row?.finishing_position ??
            row?.finishingPosition ??
            row?.position ??
            index + 1,
        ),
        name: driverName,
        lastName,
        teamName: mapEntry?.team || getManufacturerName(manufacturer),
        teamColor,
        headshot: mapEntry?.image || row?.driver_image || row?.headshot || null,
        timeText,
        deltaLeaderText: formatDeltaLeader(deltaLeaderRaw),
        showDeltaLeader:
          sessionCardSource !== "RACE" &&
          formatDeltaLeader(deltaLeaderRaw) != null,
        laps: Number.isFinite(Number(lapsRaw)) ? Number(lapsRaw) : lapsRaw,
      };
    });

    return {
      sourceLabel,
      raceName: raceTitle,
      sessionDate: sessionSchedule?.start_time_utc
        ? toFullDateLabel(sessionSchedule.start_time_utc)
        : sessionSchedule?.date_start
          ? toFullDateLabel(sessionSchedule.date_start)
          : raceDate
            ? toFullDateLabel(raceDate)
            : null,
      trackName,
      trackState,
      trackLogo,
      podiumEntries,
      accentColor,
    };
  }, [
    accentColor,
    availableDriverSources,
    colors.primary,
    mapsDrivers,
    racePayload,
    raceDate,
    raceTitle,
    scheduleItems,
    sessionCardSource,
    trackLogo,
    trackName,
    trackState,
  ]);

  const openSessionCopyCard = useCallback(
    (sourceKey) => {
      if (!availableDriverSources.some((item) => item.key === sourceKey))
        return;
      setSessionCardSource(sourceKey);
      setSessionCardVisible(true);
    },
    [availableDriverSources],
  );

  const closeSessionCopyCard = useCallback(() => {
    setSessionCardVisible(false);
  }, []);

  const openDriverCopyCard = useCallback(
    (driverData, sourceType) => {
      setSelectedDriverForStats(driverData);
      setSelectedDriverStatsSource(sourceType || driversSource);
      setDriverStatsCardVisible(true);
    },
    [driversSource],
  );

  const closeDriverCopyCard = useCallback(() => {
    setDriverStatsCardVisible(false);
  }, []);

  const openRaceCopyCard = useCallback((driverData) => {
    setSelectedDriverForRace(driverData);
    setRaceCopyCardVisible(true);
  }, []);

  const closeRaceCopyCard = useCallback(() => {
    setRaceCopyCardVisible(false);
  }, []);

  useEffect(() => {
    if (!availableDriverSources.length) return;
    if (!availableDriverSources.some((s) => s.key === driversSource)) {
      setDriversSource(availableDriverSources[0].key);
    }
  }, [availableDriverSources, driversSource]);

  useEffect(() => {
    if (stagesSource !== "2" && stagesSource !== "1") {
      setStagesSource("2");
    }
  }, [stagesSource]);

  const selectedDriverRows = useMemo(() => {
    const source = availableDriverSources.find((s) => s.key === driversSource);
    return source?.rows || [];
  }, [availableDriverSources, driversSource]);

  const driverCards = useMemo(() => {
    const isRaceSource = driversSource === "RACE";
    const isQualSource = driversSource === "QUAL";
    const raceTotalTime =
      racePayload?.race_list_basic?.total_race_time ||
      race?.total_race_time ||
      null;
    const loopstatsDrivers = Array.isArray(racePayload?.loopstats)
      ? racePayload.loopstats.flatMap((entry) =>
          Array.isArray(entry?.drivers) ? entry.drivers : [],
        )
      : [];
    const lapTimeDrivers = Array.isArray(racePayload?.lap_times?.laps)
      ? racePayload.lap_times.laps
      : [];

    const formatRaceGapTime = (rawDiffTime) => {
      if (rawDiffTime == null || rawDiffTime === "") return "-";
      const text = String(rawDiffTime).trim();
      if (!text) return "-";
      if (!/^\d+$/.test(text)) return text;
      if (text.length === 1) return `0.00${text}`;
      if (text.length === 2) return `0.0${text}`;
      if (text.length === 3) return `0.${text}`;
      return `${text.slice(0, -3)}.${text.slice(-3)}`;
    };

    const rows = Array.isArray(selectedDriverRows) ? selectedDriverRows : [];
    const normalized = rows.map((row, index) => {
      const driverId =
        row?.NASCARDriverID ??
        row?.Nascar_Driver_ID ??
        row?.driver_id ??
        row?.driverId ??
        null;
      const driverNo =
        row?.car_number ??
        row?.Number ??
        row?.number ??
        row?.vehicle_number ??
        row?.car ??
        null;
      const mapEntry =
        (driverId != null && mapsDrivers[String(driverId)]) ||
        (row?.driver_id != null && mapsDrivers[String(row.driver_id)]) ||
        null;
      const loopstatsEntry =
        driverId != null
          ? loopstatsDrivers.find(
              (entry) => String(entry?.driver_id) === String(driverId),
            ) || null
          : null;
      const lapTimeEntry =
        driverId != null
          ? lapTimeDrivers.find(
              (entry) => String(entry?.NASCARDriverID) === String(driverId),
            ) || null
          : null;

      const manufacturer =
        row?.vehicle_manufacturer ||
        row?.Manufacturer ||
        row?.manufacturer ||
        mapEntry?.manufacturer ||
        null;
      const teamColor = getManufacturerColor(manufacturer) || colors.primary;

      const posRaw =
        row?.finishing_position ??
        row?.finishingPosition ??
        row?.position ??
        row?.rank ??
        row?.RunningPos ??
        row?.starting_position ??
        row?.startingPosition ??
        index + 1;

      const lapsRaw =
        row?.laps_completed ??
        row?.laps ??
        row?.lap_count ??
        row?.lapCount ??
        null;
      const bestLapNumberRaw =
        row?.best_lap_number ??
        row?.bestLapNumber ??
        row?.best_lap_num ??
        row?.bestLapNum ??
        null;
      const bestLapSpeedRaw =
        row?.best_lap_speed ??
        row?.bestLapSpeed ??
        row?.lap_speed ??
        row?.speed ??
        null;

      const timeRaw =
        row?.best_lap_time ??
        row?.bestLapTime ??
        row?.best_lap ??
        row?.fastest_lap_time ??
        row?.fastestLapTime ??
        row?.time ??
        row?.total_time ??
        null;

      const startingPos = Number(
        row?.starting_position ??
          row?.startingPosition ??
          row?.pos_start ??
          null,
      );

      const finishingPos = Number(
        row?.finishing_position ?? row?.finishingPosition ?? row?.position,
      );
      const diffTimeRaw = row?.diff_time ?? row?.diffTime ?? null;
      const diffLapsRaw = row?.diff_laps ?? row?.diffLaps ?? null;
      const finishingStatusRaw =
        row?.finishing_status ?? row?.finishingStatus ?? row?.status ?? null;
      const diffTime = Number(diffTimeRaw);
      const diffLaps = Number(diffLapsRaw);
      const finishingStatus = String(finishingStatusRaw || "").trim();
      const hasNonRunningStatus =
        !!finishingStatus && finishingStatus.toLowerCase() !== "running";
      const qualPracticeCommentRaw =
        row?.comment ??
        row?.comments ??
        row?.notes ??
        row?.note ??
        row?.message ??
        null;
      const qualPracticeComment = String(qualPracticeCommentRaw || "").trim();

      let raceTimeText = "-";
      let timeIsStatus = false;
      let speedText = null;

      if (hasNonRunningStatus) {
        raceTimeText = finishingStatus;
        timeIsStatus = true;
      } else if (
        finishingPos === 1 &&
        Number.isFinite(diffTime) &&
        diffTime === 0 &&
        Number.isFinite(diffLaps) &&
        diffLaps === 0 &&
        raceTotalTime
      ) {
        raceTimeText = String(raceTotalTime);
      } else if (Number.isFinite(diffLaps) && diffLaps > 0) {
        raceTimeText = `+${diffLaps} ${diffLaps === 1 ? "Lap" : "Laps"}`;
      } else {
        raceTimeText = `+${formatRaceGapTime(diffTimeRaw)}s`;
      }

      const pitsCount = Array.isArray(livePit[String(driverNo)])
        ? livePit[String(driverNo)].length
        : Array.isArray(livePit[String(driverId)])
          ? livePit[String(driverId)].length
          : 0;

      const parsedSpeed = Number(bestLapSpeedRaw);
      if (isQualSource && Number.isFinite(parsedSpeed)) {
        speedText = `${parsedSpeed.toFixed(1)} mph`;
      }

      const bestLapCandidate = Array.isArray(lapTimeEntry?.Laps)
        ? lapTimeEntry.Laps.reduce((best, lap) => {
            const lapSpeed = Number(lap?.LapSpeed);
            if (!Number.isFinite(lapSpeed)) return best;
            if (!best || lapSpeed > best.speed) {
              return {
                speed: lapSpeed,
                lap: Number(lap?.Lap),
              };
            }
            return best;
          }, null)
        : null;
      const bestLapSpeed = Number.isFinite(bestLapCandidate?.speed)
        ? `${bestLapCandidate.speed.toFixed(1)} mph`
        : null;
      const bestLapLapNum = Number.isFinite(bestLapCandidate?.lap)
        ? bestLapCandidate.lap
        : null;

      const bestLapNumber = Number.isFinite(Number(bestLapNumberRaw))
        ? Number(bestLapNumberRaw)
        : null;

      const finalTimeText =
        !isRaceSource && qualPracticeComment
          ? qualPracticeComment
          : isRaceSource
            ? raceTimeText
            : formatBestLapTime(timeRaw);

      const positionDeltaText =
        startingPos != null && finishingPos != null
          ? startingPos - finishingPos > 0
            ? `▲ ${Math.abs(startingPos - finishingPos)}`
            : startingPos - finishingPos < 0
              ? `▼ ${Math.abs(startingPos - finishingPos)}`
              : ""
          : "";

      const positionDeltaColor = positionDeltaText.includes("▲")
        ? theme.success
        : positionDeltaText.includes("▼")
          ? theme.error
          : null;

      const showPositionDelta = startingPos !== finishingPos && isRaceSource;

      const finalTimeIsStatus =
        !isRaceSource && qualPracticeComment ? true : timeIsStatus;

      const deltaLeaderText =
        !isRaceSource && !qualPracticeComment
          ? formatDeltaLeader(row?.delta_leader ?? row?.deltaLeader ?? null)
          : null;

      return {
        key: `${driverId ?? driverNo ?? index}`,
        driverNumber: driverNo != null ? String(driverNo) : "--",
        name:
          row?.driver_name ||
          row?.DriverName ||
          row?.FullName ||
          row?.full_name ||
          mapEntry?.name ||
          `Driver ${index + 1}`,
        teamName: mapEntry?.team || getManufacturerName(manufacturer),
        teamColor,
        headshot: mapEntry?.image || row?.driver_image || row?.headshot || null,
        pos: Number.isFinite(Number(posRaw)) ? Number(posRaw) : null,
        laps: isRaceSource
          ? Number.isFinite(Number(lapsRaw))
            ? Number(lapsRaw)
            : null
          : bestLapNumber,
        lapsLabel: isRaceSource ? "LAPS" : "BEST LAP",
        timeText: finalTimeText,
        positionDeltaText,
        positionDeltaColor,
        showPositionDelta,
        timeIsStatus: finalTimeIsStatus,
        speedText,
        pits: pitsCount,
        isRaceSource,
        isQualSource,
        // New fields for driver stats card
        comment: qualPracticeComment || null,
        bestLapTime: formatBestLapTime(timeRaw),
        bestLapSpeed: bestLapSpeed || speedText || null,
        bestLapNumber: bestLapNumber,
        bestLapLapNum,
        lapsCompleted: Number.isFinite(Number(lapsRaw))
          ? Number(lapsRaw)
          : null,
        vehicleNumber: driverNo != null ? String(driverNo) : null,
        deltaLeaderText,
        rating: loopstatsEntry?.rating ?? null,
        passes_gf: loopstatsEntry?.passes_gf ?? null,
        passing_diff: loopstatsEntry?.passing_diff ?? null,
        top15_laps: loopstatsEntry?.top15_laps ?? null,
        fast_laps: loopstatsEntry?.fast_laps ?? null,
        avg_ps: loopstatsEntry?.avg_ps ?? null,
        // Race copy card fields
        finishing_position: finishingPos,
        starting_position: Number(
          row?.starting_position ?? row?.startingPosition ?? "-",
        ),
        diff_time: diffTimeRaw,
        diff_laps: diffLapsRaw,
        finishing_status: finishingStatusRaw,
        laps_led: Number(row?.laps_led ?? row?.lapsLed ?? 0),
        car_number: driverNo,
        NASCARDriverID: driverId,
      };
    });

    // Filter out drivers with position 0 (invalid/incomplete data)
    const filtered = normalized.filter((d) => d.pos !== 0 && d.pos != null);

    filtered.sort((a, b) => {
      if (a.pos == null && b.pos == null) return a.name.localeCompare(b.name);
      if (a.pos == null) return 1;
      if (b.pos == null) return -1;
      return a.pos - b.pos;
    });

    return filtered;
  }, [
    colors.primary,
    driversSource,
    formatBestLapTime,
    livePit,
    mapsDrivers,
    race?.total_race_time,
    racePayload?.race_list_basic?.total_race_time,
    racePayload?.loopstats,
    racePayload?.lap_times?.laps,
    selectedDriverRows,
  ]);

  const startingGridEntries = useMemo(() => {
    const gridRun = (weekendRuns || []).find(
      (run) => Number(run?.run_type) === 2,
    );
    const results = Array.isArray(gridRun?.results) ? gridRun.results : [];

    const entries = results.map((result, index) => {
      const driverId =
        result?.NASCARDriverID ??
        result?.Nascar_Driver_ID ??
        result?.driver_id ??
        result?.driverId ??
        result?.Number ??
        result?.number ??
        null;
      const driverKey = driverId != null ? String(driverId) : null;
      const mapEntry = driverKey ? mapsDrivers[driverKey] || null : null;
      const manufacturerRaw =
        result?.vehicle_manufacturer ||
        result?.manufacturer ||
        mapEntry?.manufacturer ||
        null;
      const teamName =
        mapEntry?.team || result?.team || getManufacturerName(manufacturerRaw);
      const teamColor = getManufacturerColor(manufacturerRaw) || colors.primary;
      const positionRaw =
        result?.finishing_position ??
        result?.finishingPosition ??
        result?.position ??
        result?.rank ??
        result?.RunningPos ??
        index + 1;
      const bestLapTimeRaw =
        result?.best_lap_time ??
        result?.bestLapTime ??
        result?.best_lap ??
        result?.fastest_lap_time ??
        result?.fastestLapTime ??
        result?.bestTime ??
        null;

      return {
        key: driverKey || `${positionRaw}-${index}`,
        position: Number.isFinite(Number(positionRaw))
          ? Number(positionRaw)
          : index + 1,
        driverName:
          result?.driver_name ||
          result?.FullName ||
          result?.full_name ||
          mapEntry?.name ||
          `Driver ${index + 1}`,
        teamName: teamName || "Team",
        teamColor,
        headshot:
          mapEntry?.image ||
          mapEntry?.headshot ||
          result?.driver_image ||
          result?.headshot ||
          null,
        bestLapTime: formatBestLapTime(bestLapTimeRaw),
      };
    });

    entries.sort(
      (a, b) =>
        a.position - b.position || a.driverName.localeCompare(b.driverName),
    );
    return entries;
  }, [colors.primary, formatBestLapTime, mapsDrivers, weekendRuns]);

  const startingGridRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < startingGridEntries.length; i += 2) {
      rows.push({
        left: startingGridEntries[i],
        right: startingGridEntries[i + 1] || null,
      });
    }
    return rows;
  }, [startingGridEntries]);

  const renderMain = () => (
    <View style={styles.tabContent}>
      {winnerResult ? (
        <View
          style={[
            styles.winnerCard,
            { borderColor: theme.border, backgroundColor: theme.surface },
          ]}
        >
          <View style={styles.rightGradientOverlay} pointerEvents="none">
            <CardGradient
              gradId={`winner-${winnerDriverId || "na"}`}
              accentColor={`${winnerTeamColor}33`}
            />
          </View>

          <View style={styles.winnerTopRow}>
            <Text
              allowFontScaling={false}
              style={[styles.winnerBadgeLabel, { color: theme.text }]}
            >
              RACE WINNER
            </Text>
          </View>

          <View style={styles.winnerBodyRow}>
            <View
              style={[
                styles.winnerHeadshot,
                {
                  backgroundColor: `${winnerTeamColor}33`,
                  borderColor: winnerTeamColor,
                },
              ]}
            >
              {winnerHeadshot ? (
                <Image
                  source={{ uri: winnerHeadshot }}
                  style={styles.winnerHeadshotImage}
                  resizeMode="cover"
                />
              ) : (
                <Text allowFontScaling={false} style={styles.winnerInitials}>
                  {getInitials(winnerName)}
                </Text>
              )}
            </View>

            <View style={styles.winnerInfoBlock}>
              <Text
                allowFontScaling={false}
                style={[styles.winnerName, { color: theme.text }]}
                numberOfLines={1}
              >
                {winnerName}
              </Text>
              {winnerTeam ? (
                <Text
                  allowFontScaling={false}
                  style={[styles.winnerTeam, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {winnerTeam}
                </Text>
              ) : null}
            </View>

            <View style={styles.winnerRightCol}>
              <Text
                allowFontScaling={false}
                style={[styles.winnerDuration, { color: theme.text }]}
                numberOfLines={1}
              >
                {winnerTime}
              </Text>
              <Text
                allowFontScaling={false}
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
      ) : null}

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
              {trackName} · {trackCity}, {trackState}
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

  const renderDrivers = () => {
    if (isLiveStatus) {
      const liveFeed = racePayload?.live_feed || {};
      const flagStateTop = Number(liveFeed?.flag_state ?? 0);
      const flagTextTop = flagLabel(flagStateTop);
      const flagBorderTop = flagColor(flagStateTop);
      const runName = liveFeed?.run_name ?? "";
      const liveRunType = Number(liveFeed?.run_type ?? 0);
      const elapsedTop =
        liveFeed?.elapsed_time ?? liveFeed?.time_of_day ?? null;
      const lapNumberTop = liveFeed?.lap_number ?? null;
      const lapsToGoTop = liveFeed?.laps_to_go ?? null;
      const vehicles = Array.isArray(liveFeed?.vehicles)
        ? liveFeed.vehicles
        : [];

      const leaderRow =
        vehicles.find((v) => Number(v?.running_position) === 1) || vehicles[0];
      const leaderTimeText = leaderRow
        ? Number(leaderRow?.running_position) === 1 &&
          Number(leaderRow?.delta ?? 0) === 0 &&
          (liveRunType === 1 || liveRunType === 2)
          ? formatSessionCopyTime(
              leaderRow?.best_lap_time ??
                leaderRow?.bestLapTime ??
                leaderRow?.fastest_lap_time ??
                leaderRow?.fastestLapTime ??
                null,
            )
          : formatElapsedClock(leaderRow?.vehicle_elapsed_time)
        : "-";
      const leaderDeltaValue = leaderRow?.delta ?? 0;
      const leaderIsLeader =
        Number(leaderRow?.running_position) === 1 &&
        Number(leaderDeltaValue) === 0;
      const leaderDeltaText = leaderIsLeader
        ? "Leader"
        : formatDeltaLeader(leaderDeltaValue) || "-";

      return (
        <View style={styles.tabContent}>
          <View style={[styles.eventsCardsWrap, { marginBottom: 12 }]}>
            <Pressable
              onPress={() => {
                setSessionCardSource("LIVE");
                setSessionCardVisible(true);
              }}
            >
              <View
                style={[
                  styles.eventsCard,
                  {
                    borderColor: flagBorderTop,
                    backgroundColor: theme.surface,
                    paddingHorizontal: 0,
                    paddingVertical: 0,
                  },
                ]}
              >
                <View style={{ padding: 12 }}>
                  <View style={styles.eventsCardHeaderRow}>
                    <View style={styles.eventsTitleRow}>
                      <View
                        style={[
                          styles.eventsIconBubble,
                          { backgroundColor: flagBorderTop },
                        ]}
                      >
                        <Ionicons name="flag-outline" size={12} color="#fff" />
                      </View>
                      <Text
                        style={[
                          styles.eventsCardTitle,
                          { color: theme.text, fontWeight: "800" },
                        ]}
                      >
                        {String(flagTextTop).toUpperCase()}
                      </Text>
                    </View>

                    <View style={{ alignItems: "flex-end" }}>
                      <Text
                        style={{
                          color: theme.textSecondary,
                          fontSize: 11,
                          fontWeight: "700",
                        }}
                      >
                        Time Passed: {formatElapsedClock(elapsedTop)}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={{
                      marginTop: 8,
                      flexDirection: "row",
                      paddingHorizontal: 4,
                    }}
                  >
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text
                        style={{
                          color: theme.text,
                          fontSize: 14,
                          fontWeight: "800",
                          textAlign: "center",
                        }}
                      >
                        {lapNumberTop != null ? `${lapNumberTop}` : ""}
                      </Text>
                      <Text
                        style={{
                          color: theme.textSecondary,
                          fontSize: 12,
                          fontWeight: "700",
                          textAlign: "center",
                        }}
                      >
                        CURRENT LAP
                      </Text>
                    </View>

                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text
                        style={{
                          color: theme.text,
                          fontSize: 14,
                          fontWeight: "800",
                          textAlign: "center",
                        }}
                      >
                        {lapsToGoTop != null ? `${lapsToGoTop}` : ""}
                      </Text>
                      <Text
                        style={{
                          color: theme.textSecondary,
                          fontSize: 12,
                          fontWeight: "700",
                          textAlign: "center",
                        }}
                      >
                        LAPS TO GO
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.eventsCardHeaderRow,
                      { justifyContent: "center", marginTop: 12 },
                    ]}
                  >
                    <View style={{ textAlign: "center" }}>
                      <Text
                        style={{
                          color: theme.text,
                          fontSize: 12,
                          fontWeight: "800",
                        }}
                      >
                        {liveFeed?.run_name || runName}
                      </Text>
                    </View>
                  </View>
                </View>

                {liveStageRunData ? (
                  <View
                    style={[
                      styles.nascarStageFooter,
                      {
                        borderTopColor: theme.border,
                        backgroundColor: theme.surface,
                        borderBottomRightRadius: 11,
                        borderBottomLeftRadius: 11,
                      },
                    ]}
                  >
                    {buildNascarStageFooterSegments(
                      liveStageRunData,
                      Number(liveStageRunData?.lapsInRace ?? 0) -
                        Number(liveStageRunData?.lapsToGo ?? 0),
                    ).map((segment, index, array) => (
                      <View
                        key={segment.label}
                        style={[
                          styles.nascarStageFooterSegment,
                          {
                            flex: segment.flex,
                            borderRightColor: theme.border,
                            borderRightWidth: index < array.length - 1 ? 3 : 0,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.nascarStageFooterFill,
                            {
                              width: `${segment.fillPct}%`,
                              backgroundColor: colors.primary,
                            },
                          ]}
                        />
                        <Text
                          style={[
                            styles.nascarStageFooterLabel,
                            { color: theme.text },
                          ]}
                        >
                          {segment.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </Pressable>
          </View>

          {vehicles.length ? (
            vehicles.map((row, idx) => {
              const vehicleNumber =
                row?.vehicle_number ?? row?.car_number ?? row?.number ?? "-";
              const driverInfo = row?.driver || {};
              const driverId =
                driverInfo?.driver_id ??
                row?.driver_id ??
                row?.NASCARDriverID ??
                row?.driverId ??
                null;
              const mapEntry =
                driverId != null ? mapsDrivers[String(driverId)] || null : null;
              const manufacturer =
                row?.vehicle_manufacturer ||
                row?.manufacturer ||
                mapEntry?.manufacturer ||
                null;
              const teamColor =
                getManufacturerColor(manufacturer) || colors.primary;
              const driverName =
                driverInfo?.full_name ||
                row?.full_name ||
                row?.driver_name ||
                mapEntry?.name ||
                `#${vehicleNumber}`;
              // Try to get sponsor from live_stage_points results first, then fallback
              const stageResultEntry = (
                racePayload?.live_stage_points?.results || []
              ).find(
                (r) =>
                  String(r?.NASCARDriverID || r?.number) ===
                  String(driverId || vehicleNumber),
              );
              const sponsor =
                stageResultEntry?.TeamOwner ||
                row?.sponsor_name ||
                row?.sponsor ||
                "";
              const runningPos =
                row?.running_position ??
                row?.RunningPos ??
                row?.position ??
                null;
              const startingPos =
                row?.starting_position ??
                row?.startingPosition ??
                row?.pos_start ??
                null;
              const positionDelta =
                liveRunType === 3 &&
                (startingPos != null || startingPos === 0) &&
                (runningPos != null || runningPos === 0) &&
                startingPos !== runningPos
                  ? startingPos - runningPos
                  : null;
              const positionDeltaText =
                positionDelta != null
                  ? positionDelta > 0
                    ? `▲ ${Math.abs(positionDelta)} · `
                    : `▼ ${Math.abs(positionDelta)} · `
                  : null;
              const copyPositionDeltaText =
                positionDelta != null && positionDelta !== 0
                  ? positionDelta > 0
                    ? `UP ${positionDelta} POS`
                    : `DOWN ${Math.abs(positionDelta)} POS`
                  : null;
              const positionDeltaColor =
                positionDelta != null
                  ? positionDelta > 0
                    ? theme.success
                    : theme.error
                  : theme.text;

              const lapsCompleted =
                row?.laps_completed ??
                row?.laps ??
                row?.lap_count ??
                row?.lapCount ??
                null;

              const deltaRaw =
                row?.delta ?? row?.time_delta ?? row?.delta_time ?? 0;
              const vehicleElapsed =
                row?.vehicle_elapsed_time ??
                row?.vehicle_elapsed ??
                row?.elapsed_time ??
                null;
              const bestLapTime =
                row?.best_lap_time ??
                row?.bestLapTime ??
                row?.fastest_lap_time ??
                row?.fastestLapTime ??
                null;
              const bestLapNumber =
                row?.best_lap ?? row?.bestLap ?? row?.best_lap_number ?? null;
              const lapsLedCount = getLiveLapsLedCount(
                row?.laps_led ?? row?.lapsLed ?? [],
              );
              const pitStops = Array.isArray(row?.pit_stops)
                ? row.pit_stops
                : [];
              const pitStopsCount = pitStops.length;
              const avgPitTime = getLiveAveragePitTime(pitStops);
              const avgPitTimeText =
                avgPitTime != null ? formatSessionCopyTime(avgPitTime) : "-";
              const bestLapTimeText = formatBestLapTime(bestLapTime);
              // For practice (1) or qualifying (2) runs prefer best lap time or delta gap
              let totalTimeText;
              if (liveRunType === 1 || liveRunType === 2) {
                if (bestLapTime != null) {
                  totalTimeText = bestLapTimeText;
                } else if (deltaRaw != null && String(deltaRaw).trim() !== "") {
                  totalTimeText = formatSessionCopyTime(deltaRaw);
                } else {
                  totalTimeText = formatElapsedClock(vehicleElapsed);
                }
              } else {
                totalTimeText = formatElapsedClock(vehicleElapsed);
              }
              const passesMade = Number(
                row?.passes_made ?? row?.passesMade ?? 0,
              );
              const passingDiff =
                row?.passing_differential ?? row?.passingDiff ?? 0;

              const avgRestartSpeed = row?.average_restart_speed ?? null;
              const avgRunningPosition = row?.average_running_position ?? null;
              const avgSpeed = row?.average_speed ?? null;
              const formattedDelta =
                deltaRaw != 0
                  ? !String(deltaRaw).includes(".")
                    ? `${String(deltaRaw).replace("-", "+")} Lap${deltaRaw === -1 || deltaRaw === 1 ? "" : "s"}`
                    : deltaRaw < 0
                      ? String(deltaRaw).replace("-", "+")
                      : `+${deltaRaw}s`
                  : null;

              const pitCount =
                livePit && livePit[String(vehicleNumber)]
                  ? (livePit[String(vehicleNumber)] || []).length
                  : Array.isArray(livePitRows)
                    ? livePitRows.filter(
                        (p) =>
                          String(p?.vehicle_number) === String(vehicleNumber),
                      ).length
                    : 0;

              const driverData = {
                key: `live-vehicle-${String(vehicleNumber)}-${idx}`,
                pos: Number.isFinite(Number(runningPos))
                  ? Number(runningPos)
                  : null,
                positionDeltaText,
                copyPositionDeltaText,
                lapsCompleted,
                positionDeltaColor,
                showPositionDelta: positionDelta != null || positionDelta != 0,
                timeText: totalTimeText,
                totalTimeText,
                bestLapTime: bestLapTimeText,
                bestLapNumber: Number.isFinite(Number(bestLapNumber))
                  ? Number(bestLapNumber)
                  : bestLapNumber,
                lapsLed: lapsLedCount,
                pits: avgPitTimeText,
                pitStopsCount,
                formattedDelta,
                passes: passesMade,
                passingDiff,
                avgRestartSpeed,
                avgRunningPosition,
                avgSpeed,
                sponsorName: sponsor || getManufacturerName(manufacturer),
                teamName: sponsor || getManufacturerName(manufacturer),
                teamColor,
                headshot: mapEntry?.image || row?.driver_image || null,
                name:
                  driverInfo?.full_name ||
                  row?.full_name ||
                  row?.driver_name ||
                  mapEntry?.name ||
                  `#${vehicleNumber}`,
                vehicleNumber: String(vehicleNumber),
                sourceType: "LIVE",
                runType: liveRunType,
                runLabel: getNascarRunTypeLabel(liveRunType),
              };

              const cardStyle = [
                styles.driverCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: teamColor,
                },
              ];

              return (
                <Pressable
                  key={`live-vehicle-${String(vehicleNumber)}-${idx}`}
                  onPress={() => openDriverCopyCard(driverData, "LIVE")}
                  style={({ pressed }) => [
                    cardStyle,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={{ paddingHorizontal: 0, paddingVertical: 0 }}>
                    <View
                      style={[
                        styles.driverTopRow,
                        { paddingHorizontal: 8, paddingVertical: 10 },
                      ]}
                    >
                      {mapEntry?.image || row?.driver_image ? (
                        <View
                          style={[
                            styles.driverHeadshot,
                            {
                              borderColor: teamColor,
                              backgroundColor: `${teamColor}22`,
                            },
                          ]}
                        >
                          <Image
                            source={{
                              uri: mapEntry?.image || row?.driver_image,
                            }}
                            style={{
                              width: "100%",
                              height: "150%",
                              transform: [
                                { translateY: 1.5 },
                                { translateX: -2 },
                              ],
                            }}
                            resizeMode="cover"
                          />
                        </View>
                      ) : (
                        <View
                          style={[
                            styles.driverHeadshot,
                            {
                              borderColor: teamColor,
                              backgroundColor: `${teamColor}22`,
                              alignItems: "center",
                              justifyContent: "center",
                            },
                          ]}
                        >
                          <Text
                            style={[styles.driverInitials, { color: "#fff" }]}
                          >
                            {getInitials(driverName)}
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
                              {positionDelta ? (
                                <Text
                                  style={[
                                    styles.driverName,
                                    { color: positionDeltaColor, fontSize: 13 },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {positionDeltaText}
                                </Text>
                              ) : null}
                              <Text
                                style={[
                                  styles.driverName,
                                  { color: theme.text },
                                ]}
                                numberOfLines={1}
                              >
                                {driverName
                                  .replace(/#\S*/g, "")
                                  .replace(/\(i\)/g, "")
                                  .replace(/\*/g, "")
                                  .trim()}
                              </Text>
                            </View>
                            <Text
                              allowFontScaling={false}
                              style={[
                                styles.driverMeta,
                                { color: theme.textSecondary },
                              ]}
                              numberOfLines={1}
                            >{`#${vehicleNumber} · ${sponsor}`}</Text>
                          </View>

                          {runningPos != null && (
                            <View style={styles.posBadgeWrap}>
                              <View
                                style={[
                                  styles.posBadge,
                                  { backgroundColor: teamColor },
                                ]}
                              >
                                <Text style={styles.posBadgeText}>
                                  {runningPos}
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
                              allowFontScaling={false}
                              style={[styles.statValue, { color: theme.text }]}
                            >
                              {totalTimeText != "00:00" ? totalTimeText : "-"}
                            </Text>
                            <Text
                              allowFontScaling={false}
                              style={[
                                styles.statLabel,
                                { color: theme.textSecondary },
                              ]}
                            >
                              TOTAL TIME
                            </Text>
                          </View>

                          <View style={styles.statCell}>
                            <Text
                              allowFontScaling={false}
                              style={[styles.statValue, { color: theme.text }]}
                            >
                              {lapsCompleted != 0 ? String(lapsCompleted) : "-"}
                            </Text>
                            <Text
                              allowFontScaling={false}
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
                              allowFontScaling={false}
                              style={[styles.statValue, { color: theme.text }]}
                            >
                              {pitStopsCount ?? "-"}
                            </Text>
                            <Text
                              allowFontScaling={false}
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
                    {row?.is_on_track && (
                      <View
                        style={[
                          styles.summaryFooter,
                          {
                            borderTopColor: theme.surface,
                            backgroundColor: colors.primary,
                            alignItems: "center",
                            justifyContent: "center",
                          },
                        ]}
                      >
                        <Text
                          style={{
                            textAlign: "center",
                            color: theme.text,
                            fontWeight: "800",
                            fontSize: 12,
                          }}
                        >
                          {"ON TRACK"}
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })
          ) : (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No driver data available.
            </Text>
          )}
        </View>
      );
    }

    // non-live (existing) drivers UI
    return (
      <View style={styles.tabContent}>
        <View style={styles.driverFilterBar}>
          {availableDriverSources.map((source) => {
            const active = driversSource === source.key;
            return (
              <TouchableOpacity
                key={`driver-source-${source.key}`}
                onPress={() => setDriversSource(source.key)}
                onLongPress={() => openSessionCopyCard(source.key)}
                delayLongPress={250}
                activeOpacity={0.85}
                style={[
                  styles.driverFilterChip,
                  {
                    borderColor: active ? colors.primary : theme.border,
                    backgroundColor: active ? colors.primary : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.driverFilterChipText,
                    {
                      color: active
                        ? getF1TextOnColor(colors.primary)
                        : theme.textSecondary,
                    },
                  ]}
                >
                  {source.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {driverCards.length ? (
          driverCards.map((d) => {
            const isQualPractice =
              driversSource === "QUAL" || driversSource === "PRACTICE";

            const driverCardStyle = [
              styles.driverCard,
              {
                backgroundColor: theme.surface,
                borderColor: d.teamColor,
              },
            ];

            const cardContent = (
              <View style={{ paddingHorizontal: 8, paddingVertical: 10 }}>
                <View style={styles.driverTopRow}>
                  {d.headshot ? (
                    <View
                      style={[
                        styles.driverHeadshot,
                        {
                          borderColor: d.teamColor,
                          backgroundColor: `${d.teamColor}22`,
                        },
                      ]}
                    >
                      <Image
                        source={{ uri: d.headshot }}
                        style={{
                          width: "100%",
                          height: "150%",
                          transform: [{ translateY: 1.5 }, { translateX: -2 }],
                        }}
                        resizeMode="cover"
                      />
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.driverHeadshot,
                        {
                          borderColor: d.teamColor,
                          backgroundColor: `${d.teamColor}22`,
                          alignItems: "center",
                          justifyContent: "center",
                        },
                      ]}
                    >
                      <Text style={[styles.driverInitials, { color: "#fff" }]}>
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
                          style={{ flexDirection: "row", alignItems: "center" }}
                        >
                          {d.showPositionDelta && (
                            <Text
                              style={[
                                styles.driverPosChange,
                                { color: d.positionDeltaColor || theme.text },
                              ]}
                              numberOfLines={1}
                            >
                              {d.positionDeltaText} · {""}
                            </Text>
                          )}
                          <Text
                            style={[styles.driverName, { color: theme.text }]}
                            numberOfLines={1}
                          >
                            {d.name}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.driverMeta,
                            { color: theme.textSecondary },
                          ]}
                          numberOfLines={1}
                        >{`#${d.driverNumber} · ${d.teamName || ""}`}</Text>
                      </View>
                      {d.pos != null && (
                        <View style={styles.posBadgeWrap}>
                          <View
                            style={[
                              styles.posBadge,
                              { backgroundColor: d.teamColor },
                            ]}
                          >
                            <Text style={styles.posBadgeText}>{d.pos}</Text>
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
                              color: d.timeIsStatus ? theme.error : theme.text,
                            },
                          ]}
                        >
                          {d.timeText || "-"}
                        </Text>
                        <Text
                          style={[
                            styles.statLabel,
                            { color: theme.textSecondary },
                          ]}
                        >
                          TIME
                        </Text>
                      </View>
                      <View style={styles.statCell}>
                        <Text style={[styles.statValue, { color: theme.text }]}>
                          {d.laps ?? "-"}
                        </Text>
                        <Text
                          style={[
                            styles.statLabel,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {d.lapsLabel || "LAPS"}
                        </Text>
                      </View>
                      {d.isRaceSource && (
                        <View style={styles.statCell}>
                          <Text
                            style={[styles.statValue, { color: theme.text }]}
                          >
                            {d.pits ?? 0}
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
                      )}
                      {d.isQualSource && (
                        <View style={styles.statCell}>
                          <Text
                            style={[styles.statValue, { color: theme.text }]}
                          >
                            {d.speedText || "-"}
                          </Text>
                          <Text
                            style={[
                              styles.statLabel,
                              { color: theme.textSecondary },
                            ]}
                          >
                            TOP SPD
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            );

            if (isQualPractice) {
              return (
                <Pressable
                  key={`driver-${d.key}`}
                  onPress={() => {
                    openDriverCopyCard(d);
                  }}
                  style={({ pressed }) => [
                    driverCardStyle,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  {cardContent}
                </Pressable>
              );
            } else {
              return (
                <Pressable
                  key={`driver-${d.key}`}
                  onPress={() => {
                    openRaceCopyCard(d);
                  }}
                  style={({ pressed }) => [
                    driverCardStyle,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  {cardContent}
                </Pressable>
              );
            }
          })
        ) : (
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No driver data available.
          </Text>
        )}
      </View>
    );
  };

  const renderStages = () => {
    const runData = liveStageRunData;
    const allResults = racePayload?.live_stage_points?.results || [];

    // Determine which stages have laps
    const stagesWithLaps = [];
    if (runData) {
      if (
        Number.isFinite(Number(runData.stage1Laps)) &&
        Number(runData.stage1Laps) > 0
      ) {
        stagesWithLaps.push({
          stageNum: 1,
          finishField: "S1Fin",
          laps: runData.stage1Laps,
        });
      }
      if (
        Number.isFinite(Number(runData.stage2Laps)) &&
        Number(runData.stage2Laps) > 0
      ) {
        stagesWithLaps.push({
          stageNum: 2,
          finishField: "S2Fin",
          laps: runData.stage2Laps,
        });
      }
      if (
        Number.isFinite(Number(runData.stage3Laps)) &&
        Number(runData.stage3Laps) > 0
      ) {
        stagesWithLaps.push({
          stageNum: 3,
          finishField: "S3Fin",
          laps: runData.stage3Laps,
        });
      }
      if (
        Number.isFinite(Number(runData.stage4Laps)) &&
        Number(runData.stage4Laps) > 0
      ) {
        stagesWithLaps.push({
          stageNum: 4,
          finishField: "S4Fin",
          laps: runData.stage4Laps,
        });
      }
    }

    // Find first stage with driver data
    let firstStageWithData = null;
    for (const stageInfo of stagesWithLaps) {
      if (allResults.some((entry) => entry?.[stageInfo.finishField] != null)) {
        firstStageWithData = stageInfo.stageNum;
        break;
      }
    }

    // Auto-select: first stage with data, or first stage with laps, or stage 1
    const shouldAutoSelect = stagesSource == null;
    if (shouldAutoSelect) {
      const defaultStage =
        firstStageWithData ||
        (stagesWithLaps.length > 0 ? stagesWithLaps[0].stageNum : 1);
      setStagesSource(String(defaultStage));
    }

    // Get current selected stage
    const selectedStageInfo = stagesWithLaps.find(
      (s) => String(s.stageNum) === stagesSource,
    );
    const finishField = selectedStageInfo?.finishField || "S1Fin";
    const selectedStageNumber = selectedStageInfo?.stageNum || 1;

    // Filter to top 10 and add calculated points
    const rows = allResults
      .filter((entry) => entry?.[finishField] != null)
      .map((entry) => ({
        ...entry,
        stageFinish: Number(entry[finishField]),
      }))
      .sort((a, b) => a.stageFinish - b.stageFinish)
      .slice(0, 10)
      .map((entry, idx) => ({
        ...entry,
        position: idx + 1,
        stagePoints: 11 - (idx + 1), // Reverse points: 1st = 10, 2nd = 9, ..., 10th = 1
      }));

    return (
      <View style={styles.tabContent}>
        <View style={styles.driverFilterBar}>
          {stagesWithLaps
            .slice(0, stagesWithLaps.length - 1)
            .reverse()
            .map((stageInfo) => {
              const active =
                String(stagesSource) === String(stageInfo.stageNum);
              return (
                <TouchableOpacity
                  key={`stages-source-${stageInfo.stageNum}`}
                  onPress={() => setStagesSource(String(stageInfo.stageNum))}
                  activeOpacity={0.85}
                  style={[
                    styles.driverFilterChip,
                    {
                      borderColor: active ? colors.primary : theme.border,
                      backgroundColor: active ? colors.primary : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.driverFilterChipText,
                      {
                        color: active
                          ? getF1TextOnColor(colors.primary)
                          : theme.textSecondary,
                      },
                    ]}
                  >
                    {`STAGE ${stageInfo.stageNum}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
        </View>

        {rows.length ? (
          rows.map((row, idx) => {
            const vehicleNumber = row?.number ?? row?.Number ?? "-";
            const driverId = row?.NASCARDriverID ?? null;
            const mapEntry =
              driverId != null ? mapsDrivers[String(driverId)] || null : null;
            const driverName =
              row?.DriverNameTag ||
              mapEntry?.name ||
              `#${String(vehicleNumber)}`;
            const manufacturer =
              row?.manufacturer || mapEntry?.manufacturer || null;
            const teamColor = getManufacturerColor(manufacturer);
            const headshot = mapEntry?.image || null;
            const stagePoints = row.stagePoints;
            const position = row.position;
            const teamOwner = row?.team_owner || row?.TeamOwner || null;

            return (
              <View
                key={`stage-row-${selectedStageNumber}-${String(vehicleNumber)}-${idx}`}
                style={[
                  styles.stageStandingCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                <View style={styles.stageStandingPositionCol}>
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.stageStandingPosition,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {Number.isFinite(position) ? position : "-"}
                  </Text>
                </View>

                <View style={styles.stageStandingBody}>
                  {headshot ? (
                    <View
                      style={[
                        styles.stageStandingHeadshot,
                        {
                          borderColor: teamColor,
                          backgroundColor: `${teamColor}22`,
                        },
                      ]}
                    >
                      <Image
                        source={{ uri: headshot }}
                        style={{
                          width: "100%",
                          height: "150%",
                          transform: [{ translateY: 1.5 }, { translateX: -2 }],
                        }}
                        resizeMode="cover"
                      />
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.stageStandingHeadshot,
                        styles.stageStandingHeadshotFallback,
                        {
                          borderColor: teamColor,
                          backgroundColor: `${teamColor}22`,
                        },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={styles.stageStandingHeadshotText}
                      >
                        {getInitials(driverName)}
                      </Text>
                    </View>
                  )}

                  <View style={styles.stageStandingTextWrap}>
                    <Text
                      allowFontScaling={false}
                      numberOfLines={1}
                      style={[styles.stageStandingName, { color: theme.text }]}
                    >
                      {driverName}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      numberOfLines={1}
                      style={[
                        styles.stageStandingMeta,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {teamOwner || "Team"}
                    </Text>
                  </View>
                </View>

                <View style={styles.stageStandingPointsCol}>
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.stageStandingPointsVal,
                      { color: theme.text },
                    ]}
                  >
                    {stagePoints}
                  </Text>
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.stageStandingPointsLbl,
                      { color: theme.textSecondary },
                    ]}
                  >
                    PTS
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {`No Stage ${selectedStageNumber} data available.`}
          </Text>
        )}
      </View>
    );
  };

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

  const renderFlags = () => {
    const rows = [...liveFlagRows].sort((a, b) => {
      const lapDiff = Number(b?.lap_number || 0) - Number(a?.lap_number || 0);
      if (lapDiff !== 0) return lapDiff;
      const tA = parseNascarUtcDate(a?.time_of_day_os)?.getTime() || 0;
      const tB = parseNascarUtcDate(b?.time_of_day_os)?.getTime() || 0;
      return tB - tA;
    });

    const formatFlagTime = (value) => {
      if (!value) return "";
      const parsed = parseNascarUtcDate(value);
      if (!parsed) return String(value);
      const weekday = parsed.toLocaleDateString("en-GB", {
        weekday: "short",
      });
      const day = parsed.toLocaleDateString("en-GB", {
        day: "numeric",
      });
      const month = parsed.toLocaleDateString("en-GB", {
        month: "short",
      });
      const time = parsed
        .toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
        .toLowerCase();
      return `${weekday} ${day} ${month} · ${time}`;
    };

    return (
      <View>
        <View style={[styles.eventsCardsWrap, { marginBottom: 12 }]}>
          {rows.length > 0 ? (
            rows.map((row, idx) => {
              const state = Number(row?.flag_state ?? 0);
              const label = flagLabel(state);
              const border = flagColor(state);
              const flagTextColor =
                label === "White Flag" ||
                label === "Yellow Flag" ||
                label === "Red Flag"
                  ? "#000"
                  : "#fff";
              const comment = String(row?.comment || "").trim();
              const timeText = formatFlagTime(row?.time_of_day_os);

              return (
                <View key={`live-flag-${idx}`} style={styles.eventsRowWrap}>
                  <View style={styles.eventsTimeCol}>
                    <Text
                      style={[styles.eventsLapText, { color: theme.text }]}
                      numberOfLines={1}
                    >
                      {`Lap ${row?.lap_number ?? "-"}`}
                    </Text>
                    <Text
                      style={[
                        styles.eventsClockText,
                        { color: theme.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
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
                          {label.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    {comment ? (
                      <Text
                        style={[
                          styles.eventsCardMainText,
                          { color: theme.text },
                        ]}
                        numberOfLines={4}
                      >
                        {comment}
                      </Text>
                    ) : null}

                    <View
                      style={{
                        marginTop: comment ? 8 : 2,
                        alignItems: "flex-end",
                      }}
                    >
                      <Text
                        style={{
                          color: theme.textSecondary,
                          fontSize: 11,
                          fontWeight: "700",
                        }}
                        numberOfLines={1}
                      >
                        {timeText}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No flag data available.
            </Text>
          )}
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

  const renderStints = () => {
    const isLiveStatus = String(resolvedStatus || "").toLowerCase() === "live";

    // Build pit map depending on status:
    // - Off status: use `live_pit` (already normalized earlier as `livePit`) which is an object keyed by driver number
    // - Live status: group `live_pit_data` rows by vehicle_number into the same object shape
    let pitMap = livePit || {};
    if (isLiveStatus) {
      // Prefer explicit live_pit if provided, otherwise build from live_pit_data
      if (
        racePayload?.live_pit &&
        typeof racePayload.live_pit === "object" &&
        !Array.isArray(racePayload.live_pit) &&
        Object.keys(racePayload.live_pit).length > 0
      ) {
        pitMap = racePayload.live_pit;
      } else {
        const rows = Array.isArray(racePayload?.live_pit_data)
          ? racePayload.live_pit_data
          : livePitRows || [];
        pitMap = rows.reduce((acc, pit) => {
          const key =
            pit?.vehicle_number ??
            pit?.car_number ??
            pit?.Number ??
            pit?.number ??
            pit?.NASCARDriverID ??
            null;
          if (key == null) return acc;
          const k = String(key);
          if (!acc[k]) acc[k] = [];
          acc[k].push(pit);
          return acc;
        }, {});
      }
    }

    let driverOrder = (drivers || []).map(
      (d) => d?.Number ?? d?.NASCARDriverID ?? d?.NASCARDriverID,
    );
    if (!driverOrder || driverOrder.length === 0) {
      try {
        driverOrder = Object.keys(pitMap || {}).sort((a, b) => {
          const na = Number(a);
          const nb = Number(b);
          if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
          return String(a).localeCompare(String(b));
        });
      } catch (e) {
        /* ignore */
      }
    }

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
                  ) || null;
                const pitSample =
                  (pitMap && pitMap[String(dn)] && pitMap[String(dn)][0]) ||
                  null;
                // Resolve name: prefer driver record, then driverLookup, then fallback
                const resolvedName =
                  d?.FullName ||
                  d?.Fullname ||
                  d?.Full ||
                  pitSample?.driver_name ||
                  pitSample?.driver ||
                  resolveDriverName(dn) ||
                  `#${dn}`;
                const cleanedName = String(resolvedName)
                  .replace(/[#*]/g, "") // remove # and *
                  .replace(/\(i\)/gi, "") // remove (i)
                  .trim();

                const parts = cleanedName.split(/\s+/).filter(Boolean);

                const last =
                  parts.length >= 2
                    ? parts[1] + (parts[2] ? " " + parts[2] : "") // always use the 2nd and 3rd words
                    : cleanedName;
                const label = `#${dn} · ${String(last).toUpperCase()}`;

                // Resolve manufacturer for chip color: prefer driver record, then mapsDrivers, then pitMap sample
                const manufacturerFromDriver =
                  d?.vehicle_manufacturer ||
                  d?.Manufacturer ||
                  d?.manufacturer ||
                  null;
                const mapEntry =
                  mapsDrivers &&
                  mapsDrivers[String(d?.NASCARDriverID || d?.driver_id || dn)];
                const manufacturerFromMap = mapEntry?.manufacturer || null;
                const manufacturerFromPit =
                  pitSample?.vehicle_manufacturer ||
                  pitSample?.manufacturer ||
                  null;
                const manufacturer =
                  manufacturerFromDriver ||
                  manufacturerFromMap ||
                  manufacturerFromPit ||
                  null;
                const color =
                  getManufacturerColor(manufacturer) || colors.primary;
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

  const renderStartingGridCard = (entry) => {
    const initials = (entry.driverName || "")
      .split(" ")
      .map((part) => part[0] || "")
      .slice(0, 2)
      .join("")
      .toUpperCase();

    return (
      <View
        key={entry.key}
        style={[
          styles.gridCard,
          {
            borderColor: entry.teamColor,
            backgroundColor: theme.surface,
          },
        ]}
      >
        <View style={styles.gridCardTopRow}>
          <Text style={[styles.gridSlotNumber, { color: theme.text }]}>
            {entry.position}
          </Text>
          <View style={styles.gridHeadshotWrap}>
            {entry.headshot ? (
              <View
                style={[
                  styles.gridHeadshot,
                  {
                    backgroundColor: `${entry.teamColor}33`,
                    borderColor: entry.teamColor,
                    overflow: "hidden",
                  },
                ]}
              >
                <Image
                  source={{ uri: entry.headshot }}
                  style={[
                    {
                      width: "100%",
                      height: "150%",
                      transform: [{ translateY: 1.5 }, { translateX: -2 }],
                    },
                  ]}
                  resizeMode="cover"
                  onError={() => {}}
                />
              </View>
            ) : (
              <View
                style={[
                  styles.gridHeadshot,
                  styles.gridHeadshotFallback,
                  {
                    borderColor: entry.teamColor,
                    backgroundColor: `${entry.teamColor}33`,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.gridHeadshotInitials,
                    { color: entry.teamColor },
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
            style={[styles.gridDriverName, { color: theme.text }]}
            numberOfLines={1}
          >
            {entry.driverName}
          </Text>
          <Text
            style={[styles.gridDriverMeta, { color: entry.teamColor }]}
            numberOfLines={1}
          >
            {entry.teamName || "Team"}
          </Text>
        </View>

        <View style={styles.gridStatsRow}>
          <View
            style={[styles.gridStatCell, { borderTopColor: entry.teamColor }]}
          >
            <Text
              style={[styles.gridStatValue, { color: theme.text }]}
              numberOfLines={1}
            >
              {entry.bestLapTime || "-"}
            </Text>
            <Text
              style={[
                styles.gridStatLabel,
                { color: theme.textSecondary, marginBottom: -10 },
              ]}
            >
              Best Lap
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderGrid = () => (
    <View style={styles.tabContent}>
      <View
        style={[
          styles.gridSectionCard,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={styles.finishLineBar}>
          {Array.from({ length: 14 }).map((_, idx) => (
            <View
              key={`finish-${idx}`}
              style={[
                styles.finishLineSquare,
                { backgroundColor: idx % 2 === 0 ? "#000" : "#fff" },
              ]}
            />
          ))}
        </View>
        <View style={[styles.finishLineBar, { marginBottom: 14 }]}>
          {Array.from({ length: 14 }).map((_, idx) => (
            <View
              key={`finish-${idx}`}
              style={[
                styles.finishLineSquare,
                { backgroundColor: idx % 2 === 0 ? "#fff" : "#000" },
              ]}
            />
          ))}
        </View>

        <View style={styles.gridContainer}>
          {startingGridRows.length > 0 ? (
            startingGridRows.map((row, idx) => (
              <View key={`grid-row-${idx}`} style={styles.gridRowContainer}>
                <View
                  style={[
                    styles.gridPositionSlot,
                    {
                      borderColor: row.left?.teamColor || theme.border,
                      marginBottom: 40,
                    },
                  ]}
                >
                  {renderStartingGridCard(row.left)}
                </View>
                {row.right ? (
                  <View
                    style={[
                      styles.gridPositionSlot,
                      {
                        borderColor: row.right.teamColor || theme.border,
                        marginTop: 40,
                      },
                    ]}
                  >
                    {renderStartingGridCard(row.right)}
                  </View>
                ) : (
                  <View
                    style={[
                      styles.gridPositionSlot,
                      { borderColor: "transparent" },
                    ]}
                  />
                )}
              </View>
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <Text
                allowFontScaling={false}
                style={[styles.emptyText, { color: theme.textSecondary }]}
              >
                No starting grid data available
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );

  const renderTabBody = () => {
    switch (selectedTab) {
      case "Drivers":
        return renderDrivers();
      case "Stages":
        return renderStages();
      case "Events":
        return renderEvents();
      case "Pit Stops":
        return renderStints();
      case "Flag":
        return renderFlags();
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
                {trackName}, {trackState}
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
          {tabKeys.map((tab) => (
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

      {sessionCardVisible && sessionCardData ? (
        <NascarSessionCopyCard
          visible={sessionCardVisible}
          onClose={closeSessionCopyCard}
          sourceLabel={sessionCardData.sourceLabel}
          raceName={sessionCardData.raceName}
          sessionDate={sessionCardData.sessionDate}
          trackName={sessionCardData.trackName}
          trackState={sessionCardData.trackState}
          trackLogo={sessionCardData.trackLogo}
          podiumEntries={sessionCardData.podiumEntries}
          accentColor={sessionCardData.accentColor}
          colors={colors}
          theme={theme}
        />
      ) : null}

      {driverStatsCardVisible && selectedDriverForStats ? (
        <NascarDriverStatsCard
          visible={driverStatsCardVisible}
          onClose={closeDriverCopyCard}
          driver={selectedDriverForStats}
          sourceType={selectedDriverStatsSource}
          colors={colors}
          theme={theme}
          trackLogo={track?.image || trackLogo}
          trackName={trackName}
        />
      ) : null}

      {raceCopyCardVisible && selectedDriverForRace ? (
        <NascarRaceCopyCard
          visible={raceCopyCardVisible}
          onClose={closeRaceCopyCard}
          driver={selectedDriverForRace}
          colors={colors}
          theme={theme}
          trackLogo={track?.image || trackLogo}
          trackName={trackName}
          livePit={livePit}
          racePayload={racePayload}
        />
      ) : null}
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
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  statLabel: {
    marginTop: 2,
    fontSize: 11,
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
  winnerCard: {
    position: "relative",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    overflow: "hidden",
  },
  winnerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  winnerBodyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  winnerHeadshot: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    overflow: "hidden",
  },
  winnerHeadshotImage: {
    width: "100%",
    height: "150%",
    transform: [{ translateY: 14 }, { translateX: -2 }],
  },
  winnerInitials: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
  winnerBadgeLabel: {
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  winnerInfoBlock: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  winnerName: {
    fontSize: 16,
    fontWeight: "800",
  },
  winnerTeam: {
    fontSize: 12,
    marginTop: 2,
  },
  winnerRightCol: {
    alignItems: "flex-end",
    minWidth: 72,
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
  sessionCopyOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    padding: 24,
  },
  sessionCopyCard: {
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  sessionCopyHeader: {
    padding: 14,
    borderBottomWidth: 2,
    gap: 4,
  },
  sessionCopyHeaderTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  sessionCopyBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sessionCopyBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  sessionCopyRaceName: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
    color: "#fff",
  },
  sessionCopyRaceTime: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.92)",
  },
  sessionCopyVenueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sessionCopyTrackLogo: {
    width: 48,
    height: 12,
  },
  sessionCopyTrackFallback: {
    width: 48,
    height: 12,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    alignItems: "center",
  },
  sessionCopyTrackFallbackText: {
    fontSize: 9,
    fontWeight: "800",
  },
  sessionCopyVenueText: {
    fontSize: 11,
    fontWeight: "500",
    flex: 1,
  },
  sessionCopyPodiumRow: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 18,
    justifyContent: "space-around",
  },
  sessionCopyDriverCol: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  sessionCopyHeadshotWrap: {
    position: "relative",
    marginBottom: 6,
  },
  sessionCopyPosBadge: {
    position: "absolute",
    top: -4,
    left: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.15)",
  },
  sessionCopyPosBadgeText: {
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 14,
  },
  sessionCopyDriverName: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  sessionCopyDriverTeam: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  sessionCopyDriverTime: {
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
  },
  sessionCopyDriverDelta: {
    fontSize: 9,
    fontWeight: "500",
    textAlign: "center",
    opacity: 0.75,
  },
  sessionCopyDriverLaps: {
    fontSize: 10,
    textAlign: "center",
  },
  sessionCopyActions: {
    flexDirection: "row",
    gap: 12,
  },
  sessionCopyFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: "flex-end",
  },
  sessionCopyFooterText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  sessionCopyActionBtn: {
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 28,
    minWidth: 120,
    alignItems: "center",
  },
  sessionCopyActionBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },
  stageStandingCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    overflow: "hidden",
  },
  stageStandingPositionCol: {
    width: 30,
    alignItems: "center",
    marginRight: 8,
  },
  stageStandingPosition: {
    fontSize: 13,
    fontWeight: "700",
  },
  stageStandingBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  stageStandingHeadshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  stageStandingHeadshotFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  stageStandingHeadshotText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  stageStandingTextWrap: {
    flex: 1,
    marginLeft: 10,
    minWidth: 0,
  },
  stageStandingName: {
    fontSize: 15,
    fontWeight: "800",
  },
  stageStandingMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
  },
  stageStandingPointsCol: {
    alignItems: "center",
    marginLeft: 12,
    minWidth: 36,
  },
  stageStandingPointsVal: {
    fontSize: 16,
    fontWeight: "800",
  },
  stageStandingPointsLbl: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "700",
  },
  driverFilterBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  driverFilterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  driverFilterChipText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  driverCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: -6,
  },
  driverTopRow: { flexDirection: "row", alignItems: "center" },
  driverHeadshot: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    overflow: "hidden",
  },
  driverHeadshotCard: {
    width: 68,
    height: 68,
    borderRadius: 34,
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
  posBadgeWrap: { alignItems: "center", justifyContent: "center" },
  posBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  posBadgeText: { color: "white", fontSize: 14, fontWeight: "800" },
  posLabel: { fontSize: 10, marginTop: 4, fontWeight: "700" },
  statsRow: {
    flexDirection: "row",
    marginTop: 8,
    justifyContent: "space-between",
  },
  driverCardInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
  },
  rightGradientOverlay: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "44%",
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
  driverPosChange: {
    fontSize: 14,
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
  summaryFooter: {
    height: 17.5,
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    width: "100%",
  },
  nascarStageFooter: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    width: "100%",
    minHeight: 22,
    overflow: "hidden",
  },
  nascarStageFooterSegment: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 22,
    overflow: "hidden",
  },
  nascarStageFooterFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  nascarStageFooterLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
    textAlign: "center",
    zIndex: 1,
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
  gridSectionCard: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  finishLineBar: {
    flexDirection: "row",
    height: 14,
    overflow: "hidden",
  },
  finishLineSquare: {
    flex: 1,
    height: "100%",
  },
  emptyContainer: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  gridContainer: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  gridRowContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  gridPositionSlot: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    overflow: "hidden",
  },
  gridCard: {
    minHeight: 150,
    padding: 12,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  gridCardTopRow: {
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
  driverStatsCard: {
    overflow: "hidden",
  },
  driverStatsHeader: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  driverStatsHeaderTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  driverStatsBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  driverStatsBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  driverStatsPosition: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  driverStatsHeadshotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  driverStatsHeadshotContainer: {
    position: "relative",
  },
  driverStatsHeadshot: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    overflow: "hidden",
  },
  driverStatsNameBlock: {
    flex: 1,
  },
  driverStatsName: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: -8,
  },
  driverStatsTeam: {
    fontSize: 11,
    fontWeight: "500",
  },
  driverStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  driverStatCell: {
    width: "33.333%",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    position: "relative",
  },
  driverStatTopRight: {
    position: "absolute",
    top: 5,
    right: 5,
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  driverStatValue: {
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  driverStatLabel: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 3,
    textAlign: "center",
  },
  driverStatDelta: {
    fontSize: 8,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 2,
    opacity: 0.75,
  },
  driverStatsFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "flex-end",
  },
  driverStatsFooterText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  driverStatsRaceInfoRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    justifyContent: "flex-end",
    paddingLeft: 20,
  },
  driverStatsTrackLogo: {
    height: 36,
    width: 40,
    borderRadius: 2,
  },
  driverStatsTrackFallback: {
    height: 36,
    width: 40,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    alignItems: "center",
  },
  driverStatsTrackFallbackText: {
    fontSize: 9,
    fontWeight: "800",
  },
  driverStatsRaceName: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right",
    flex: 1,
  },
  driverStatsHeadshotCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2.5,
    backgroundColor: "rgba(128,128,128,0.1)",
    overflow: "hidden",
  },
  driverStatsInitials: {
    fontSize: 20,
    fontWeight: "800",
  },
  driverStatsNameAndStatsBlock: {
    flex: 1,
    gap: 8,
  },
  driverStatsSummaryRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: -2,
  },
  driverStatsSummaryCell: {
    alignItems: "center",
  },
  driverStatsSummaryVal: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 20,
  },
  driverStatsSummaryLbl: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 1,
  },
  driverStatsHeaderStatsGrid: {
    flexDirection: "row",
    marginTop: 10,
  },
  driverStatsHeaderStatCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  driverStatsHeaderStatValue: {
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  driverStatsHeaderStatLabel: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 3,
    textAlign: "center",
  },
});

export default NascarRaceDetailsScreen;

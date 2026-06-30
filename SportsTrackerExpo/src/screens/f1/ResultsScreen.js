import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "react-native-vector-icons/Ionicons";
import FontAwesome5 from "react-native-vector-icons/FontAwesome5";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Rect,
  Stop,
} from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../context/ThemeContext";
import { LiveViewerBadge } from "../../components/ViewerCounter";

const { width } = Dimensions.get("window");

const DATE_API_BASE =
  "https://sportsheart-motorsports.up.railway.app/racing/date";
const DATE_CACHE_KEY = "racing_date_list:v1";
const DATE_CACHE_TTL = 4 * 60 * 60 * 1000; // 3 hours

const DATE_ITEM_W = 90;
const DATE_FADE_W = 50;
const DATE_BAR_H = 52;

const toDateStr = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
};

const getDateFromDateStr = (dateStr) => {
  const safe = String(dateStr || "");
  const y = Number(safe.slice(0, 4));
  const m = Number(safe.slice(4, 6));
  const d = Number(safe.slice(6, 8));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d))
    return null;
  return new Date(y, m - 1, d);
};

const getDateLabel = (date) => {
  const ds = toDateStr(date);
  const today = new Date();
  const todayStr = toDateStr(today);
  if (ds === todayStr) return "Today";
  const base = new Date(today);
  base.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d - base) / 86400000);
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTH_NAMES = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
};

const buildMonthMatrix = (year, month) => {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const matrix = [];
  let week = new Array(7).fill(null);
  let day = 1;

  for (let i = 0; i < startDay; i++) week[i] = null;
  for (let i = startDay; i < 7; i++) {
    week[i] = new Date(year, month, day++);
  }
  matrix.push(week);

  while (day <= daysInMonth) {
    week = new Array(7).fill(null);
    for (let i = 0; i < 7 && day <= daysInMonth; i++) {
      week[i] = new Date(year, month, day++);
    }
    matrix.push(week);
  }

  while (matrix.length < 6) {
    matrix.push(new Array(7).fill(null));
  }

  return matrix;
};

const formatTimeParts = (dateString) => {
  if (!dateString) return { time: "TBD", ampm: "" };
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return { time: "TBD", ampm: "" };
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === "hour")?.value || "00";
  const minute = parts.find((p) => p.type === "minute")?.value || "00";
  const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value || "";
  return { time: `${hour}:${minute}`, ampm: dayPeriod.toUpperCase() };
};

const parseNascarUtcDate = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(text);
  const parsed = new Date(hasTimezone ? text : `${text}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatNascarTimeParts = (dateString) => {
  const d = parseNascarUtcDate(dateString);
  if (!d) return { time: "TBD", ampm: "" };
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === "hour")?.value || "00";
  const minute = parts.find((p) => p.type === "minute")?.value || "00";
  const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value || "";
  return { time: `${hour}:${minute}`, ampm: dayPeriod.toUpperCase() };
};

const sanitizeF1MeetingName = (name) => {
  if (!name) return "";
  return name
    .replace(/formula\s*1/gi, "")
    .replace(/\b20\d{2}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const buildCircuitImage = (circuitShortName) => {
  const slug = (circuitShortName || "").toLowerCase().replace(/[\s-]/g, "");
  if (!slug) return null;
  return `https://media.formula1.com/image/upload/c_fit,h_704/q_auto/v1740000001/common/f1/2026/track/2026track${slug}detailed.webp`;
};

const getTeamColor = (constructorName) => {
  if (!constructorName) return null;
  const colorMap = {
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
  return colorMap[constructorName] || null;
};

const NASCAR_MANUFACTURER_COLORS = {
  chevrolet: "#FFD700",
  ford: "#003399",
  toyota: "#E60012",
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
  if (normalized === "usa" || normalized.includes("united states"))
    return countryColorMap["united states"];
  if (normalized === "uae" || normalized.includes("united arab emirates"))
    return countryColorMap["united arab emirates"];
  return null;
};

const isNascarEvent = (event) =>
  event?.source === "nascar_schedule" || !!event?.race_id || !!event?.track_id;

const resolveNascarLinkStatus = (dateStart, dateEnd, hasWinner = false) => {
  const startMs = parseNascarUtcDate(dateStart)?.getTime() ?? null;
  const endMs = parseNascarUtcDate(dateEnd)?.getTime() ?? null;
  if (!startMs || Number.isNaN(startMs)) return "off";
  if (hasWinner) return "off";
  const nowMs = Date.now();
  const liveUntilMs = endMs || startMs + 4 * 60 * 60 * 1000;
  return nowMs >= startMs && nowMs <= liveUntilMs ? "live" : "off";
};

const CardGradient = ({ gradId, accentColor, cardHeight }) => {
  const safeHeight = Math.max(cardHeight || 1, 1);
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height={safeHeight}
      viewBox={`0 0 100 ${safeHeight}`}
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      <Defs>
        <SvgLinearGradient
          id={`cardGrad_${gradId}`}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="0%"
        >
          <Stop offset="0%" stopColor={accentColor} stopOpacity="0.25" />
          <Stop offset="55%" stopColor={accentColor} stopOpacity="0" />
        </SvgLinearGradient>
      </Defs>
      <Rect
        width="100%"
        height={safeHeight}
        fill={`url(#cardGrad_${gradId})`}
      />
    </Svg>
  );
};

const GameFooterRight = ({
  gameId,
  isNascar,
  hasWinner,
  winnerText,
  carTint,
  viewerStatus,
  scale = 0.7,
}) => {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  useEffect(() => {
    console.log("[ResultsScreen] gameFooterRight mounted", { gameId });
    return () => {
      console.log("[ResultsScreen] gameFooterRight unmounted", { gameId });
    };
  }, [gameId]);

  console.log("[ResultsScreen] gameFooterRight render", {
    gameId,
    renderCount: renderCountRef.current,
    isNascar,
    hasWinner,
    winnerText,
    viewerStatus,
  });

  return (
    <View
      style={[
        styles.gameFooterRight,
        { flexDirection: "row", alignItems: "center" },
      ]}
    >
      {hasWinner ? (
        <View style={{ marginBottom: 0 }}>
          {isNascar ? (
            <Image
              source={require("../../../assets/nascar-car.png")}
              style={[
                styles.winnerCarNas,
                { tintColor: carTint, transform: [{ scaleX: -1 }] },
              ]}
              resizeMode="contain"
            />
          ) : (
            <Image
              source={require("../../../assets/f1-car-svgrepo-com.png")}
              style={[styles.winnerCar, { tintColor: carTint }]}
              resizeMode="contain"
            />
          )}
        </View>
      ) : null}
      <LiveViewerBadge
        gameId={gameId}
        status={viewerStatus}
        scale={scale}
        style={{ marginTop: 2, marginLeft: isNascar ? 8 : 0 }}
      />
    </View>
  );
};

const F1EventRowCard = React.memo(
  ({ event, idx, groupKey, theme, navigation }) => {
    const [cardHeight, setCardHeight] = useState(0);
    const isNascar = isNascarEvent(event);
    const isCancelled = !!(event?.is_cancelled || event?.isCancelled);
    const meeting = event.meeting || {};
    const start =
      event.date_start ||
      event.dateStart ||
      event.schedule?.start_time_utc ||
      "";
    const end = event.date_end || event.dateEnd || meeting.date_end || "";
    const nowMs = Date.now();
    const startMs = isNascar
      ? (parseNascarUtcDate(start)?.getTime() ?? null)
      : start
        ? Date.parse(start)
        : null;
    const endMs = isNascar
      ? (parseNascarUtcDate(end)?.getTime() ?? null)
      : end
        ? Date.parse(end)
        : null;
    const winnerName =
      event.winner || event.winner_name || meeting.winner || "";
    const winnerTeam =
      event.winner_team || event.winnerTeam || meeting.winner_team || "";
    const winnerManufacturer =
      event.winner_manufacturer || event.winnerManufacturer || "";
    const winnerParts = [
      winnerName,
      winnerTeam,
      isNascar ? winnerManufacturer : null,
    ].filter(Boolean);
    const hasWinner = winnerParts.length > 0;
    const nascarLinkStatus = isNascar
      ? resolveNascarLinkStatus(start, end, hasWinner)
      : "off";
    const isLive = isNascar
      ? nascarLinkStatus === "live"
      : startMs && endMs && nowMs >= startMs && nowMs <= endMs;

    const raceName = isNascar
      ? event.race_name
      : sanitizeF1MeetingName(
          meeting.meeting_official_name ||
            meeting.meeting_name ||
            event.meeting_name ||
            event.meeting_official_name ||
            "",
        );
    const sessionName = isNascar
      ? event.event_name || event.schedule?.event_name || ""
      : event.session_name || event.session_type || event.sessionName || "";
    const circuitName = isNascar
      ? event.track_name
      : meeting.circuit_short_name ||
        event.circuit_short_name ||
        event.circuitShortName ||
        meeting.location ||
        event.location ||
        "";
    const subLine = [sessionName, circuitName].filter(Boolean).join(" · ");

    const leftLogo = isNascar
      ? event.track_logo
      : meeting.country_flag || event.country_flag || "";
    const rightImage = isNascar
      ? event.track_image
      : buildCircuitImage(
          meeting.circuit_short_name || event.circuit_short_name,
        );

    let accentColor = null;
    if (isNascar) {
      const m = String(winnerManufacturer || "").toLowerCase();
      accentColor =
        NASCAR_MANUFACTURER_COLORS[m] || countryColorMap["united states"];
    } else {
      accentColor =
        getTeamColor(winnerTeam) ||
        getCountryColor(meeting.country_name || event.country_name) ||
        theme.surfaceSecondary;
    }

    const carTint = isNascar
      ? accentColor
      : getTeamColor(winnerTeam) || accentColor || theme.textSecondary;

    const viewerStatus = isNascar
      ? {
          status:
            hasWinner || (startMs && nowMs > startMs + 4 * 60 * 60 * 1000)
              ? "finished"
              : startMs && nowMs >= startMs
                ? "live"
                : "scheduled",
          isCompleted: !!(
            hasWinner ||
            (startMs && nowMs > startMs + 4 * 60 * 60 * 1000)
          ),
          reason: hasWinner
            ? "Winner present"
            : "Finished 3 hours after date start",
        }
      : {
          status:
            hasWinner || (endMs && nowMs > endMs)
              ? "finished"
              : startMs && nowMs >= startMs
                ? "live"
                : "scheduled",
          isCompleted: !!(hasWinner || (endMs && nowMs > endMs)),
          reason: hasWinner ? "Winner present" : "Finished on date end",
        };

    const showFooter =
      winnerParts.length > 0 || viewerStatus.status !== "scheduled";
    const { time, ampm } = isNascar
      ? formatNascarTimeParts(start)
      : formatTimeParts(start);

    return (
      <TouchableOpacity
        style={[styles.gameRow, { backgroundColor: theme.surface }]}
        onLayout={(e) => {
          const nextHeight = Math.round(e.nativeEvent.layout.height || 0);
          setCardHeight((prev) => (prev !== nextHeight ? nextHeight : prev));
        }}
        activeOpacity={0.7}
        disabled={isCancelled}
        onPress={() => {
          if (isCancelled) return;
          if (isNascar) {
            const raceId = event.race_id || event.raceId || event.id;
            if (!raceId) return;
            navigation.navigate("NascarRaceDetails", {
              raceId: String(raceId),
              runType: event.schedule?.run_type || event.run_type || "",
              raceName,
              raceDate: start,
              status: nascarLinkStatus,
              sport: "nascar",
            });
            return;
          }
          const meetingKey =
            event.meeting_key || event.meetingKey || meeting.meeting_key;
          const sessionKey =
            event.session_key || event.sessionKey || meeting.session_key;
          if (!meetingKey) return;
          navigation.navigate("F1RaceDetails", {
            sessionKey,
            raceName,
            raceDate: start,
            sport: "f1",
          });
        }}
      >
        <CardGradient
          gradId={`${groupKey}_${idx}`}
          accentColor={accentColor}
          cardHeight={cardHeight}
        />

        <View style={styles.matchRow}>
          <View style={styles.statusContainer}>
            {isLive ? (
              <Text
                allowFontScaling={false}
                style={[styles.liveLabel, { color: theme.error }]}
              >
                LIVE
              </Text>
            ) : null}
            <Text
              allowFontScaling={false}
              style={[styles.statusLine1, { color: theme.text }]}
            >
              {time}
            </Text>
            <Text
              allowFontScaling={false}
              style={[styles.statusLine2, { color: theme.textSecondary }]}
            >
              {ampm}
            </Text>
          </View>

          <View style={styles.eventBody}>
            {leftLogo ? (
              <Image
                source={{ uri: leftLogo }}
                style={styles.leftLogo}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[styles.leftLogo, { backgroundColor: theme.border }]}
              />
            )}
            <View style={styles.eventTextStack}>
              <Text
                allowFontScaling={false}
                style={[styles.eventTitle, { color: theme.text }]}
                numberOfLines={1}
              >
                {raceName || "Event"}
              </Text>
              {subLine ? (
                <Text
                  allowFontScaling={false}
                  style={[styles.eventSubtitle, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {subLine}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.rightImageWrap}>
            {rightImage ? (
              <Image
                source={{ uri: rightImage }}
                style={[
                  styles.trackImage,
                  { tintColor: isNascar ? theme.text : null },
                ]}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </View>

        {showFooter ? (
          <View style={[styles.gameFooter, { borderTopColor: theme.border }]}>
            <View
              style={[
                styles.gameFooterLeft,
                {
                  marginTop: 0,
                  marginBottom: 0,
                },
              ]}
            >
              {winnerParts.length > 0 ? (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.winnerFooterText,
                    { color: theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {winnerParts.join(" · ")}
                </Text>
              ) : null}
            </View>
            <GameFooterRight
              gameId={
                event.session_key ||
                event.race_id + "-" + event.schedule.run_type
              }
              isNascar={isNascar}
              hasWinner={winnerParts.length > 0}
              winnerText={winnerParts.join(" · ")}
              carTint={carTint}
              viewerStatus={viewerStatus}
              scale={0.7}
            />
          </View>
        ) : (
          <View style={[styles.gameFooter, { borderTopColor: theme.border }]}>
            <View style={styles.gameFooterLeft} />
            <GameFooterRight
              gameId={
                event.session_key ||
                event.race_id + "-" + event.schedule.run_type
              }
              isNascar={isNascar}
              hasWinner={false}
              winnerText=""
              carTint={carTint}
              viewerStatus={viewerStatus}
              scale={0.7}
            />
          </View>
        )}

        {isCancelled ? (
          <>
            <View style={styles.cancelledOverlay} pointerEvents="none" />
            <View style={styles.cancelledBadge} pointerEvents="none">
              <FontAwesome5 name="ban" size={35} color={theme.error} />
              <Text
                allowFontScaling={false}
                style={[styles.cancelledText, { color: theme.error }]}
              >
                CANCELLED
              </Text>
            </View>
          </>
        ) : null}
      </TouchableOpacity>
    );
  },
);

const DatePickerBar = ({
  dates,
  selectedDateStr,
  onSelect,
  onOpenCalendar,
  theme,
  colors,
}) => {
  const scrollRef = useRef(null);
  const [scrollW, setScrollW] = useState(0);
  const selectedIdx = dates.findIndex((d) => toDateStr(d) === selectedDateStr);

  const scrollToIdx = useCallback(
    (idx, animated = true) => {
      if (idx < 0 || !scrollRef.current) return;
      const x = Math.max(0, idx * DATE_ITEM_W - scrollW / 2 + DATE_ITEM_W / 2);
      scrollRef.current.scrollTo({ x, animated });
    },
    [scrollW],
  );

  useEffect(() => {
    if (scrollW > 0) scrollToIdx(selectedIdx, false);
  }, [scrollW, scrollToIdx, selectedIdx, selectedDateStr]);

  return (
    <View
      style={[
        dateBarStyles.outerWrapper,
        { backgroundColor: theme.background },
      ]}
    >
      <View style={dateBarStyles.wrapper}>
        <View
          style={dateBarStyles.scrollArea}
          onLayout={(e) => setScrollW(e.nativeEvent.layout.width)}
        >
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
          >
            {dates.map((date) => {
              const ds = toDateStr(date);
              const isSelected = ds === selectedDateStr;
              return (
                <TouchableOpacity
                  key={ds}
                  style={dateBarStyles.item}
                  onPress={() => onSelect(ds)}
                >
                  <Text
                    allowFontScaling={false}
                    style={[
                      dateBarStyles.itemText,
                      {
                        color: isSelected ? colors.primary : theme.text,
                        fontWeight: isSelected ? "700" : "400",
                      },
                    ]}
                  >
                    {getDateLabel(date)}
                  </Text>
                  <View
                    style={[
                      dateBarStyles.itemIndicator,
                      {
                        backgroundColor: isSelected
                          ? colors.primary
                          : "transparent",
                      },
                    ]}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Svg
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: DATE_FADE_W,
              height: DATE_BAR_H,
            }}
            width={DATE_FADE_W}
            height={DATE_BAR_H}
            pointerEvents="none"
          >
            <Defs>
              <SvgLinearGradient id="dfL_f1" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop
                  offset="0%"
                  stopColor={theme.background}
                  stopOpacity="1"
                />
                <Stop
                  offset="100%"
                  stopColor={theme.background}
                  stopOpacity="0"
                />
              </SvgLinearGradient>
            </Defs>
            <Rect
              x={0}
              y={0}
              width={DATE_FADE_W}
              height={DATE_BAR_H}
              fill="url(#dfL_f1)"
            />
          </Svg>

          <Svg
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: DATE_FADE_W,
              height: DATE_BAR_H,
            }}
            width={DATE_FADE_W}
            height={DATE_BAR_H}
            pointerEvents="none"
          >
            <Defs>
              <SvgLinearGradient id="dfR_f1" x1="100%" y1="0%" x2="0%" y2="0%">
                <Stop
                  offset="0%"
                  stopColor={theme.background}
                  stopOpacity="1"
                />
                <Stop
                  offset="100%"
                  stopColor={theme.background}
                  stopOpacity="0"
                />
              </SvgLinearGradient>
            </Defs>
            <Rect
              x={0}
              y={0}
              width={DATE_FADE_W}
              height={DATE_BAR_H}
              fill="url(#dfR_f1)"
            />
          </Svg>
        </View>

        <TouchableOpacity
          onPress={onOpenCalendar}
          style={dateBarStyles.toggleBtn}
        >
          <Ionicons name="calendar-outline" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>
      <View
        style={[dateBarStyles.separator, { backgroundColor: theme.border }]}
      />
    </View>
  );
};

const ResultsScreen = () => {
  const { theme, colors } = useTheme();
  const navigation = useNavigation();

  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDateStr, setSelectedDateStr] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(new Date());

  const pollingIntervalRef = useRef(null);

  const checkLiveEvents = useCallback((eventsList) => {
    if (!Array.isArray(eventsList) || eventsList.length === 0) return false;

    const nowMs = Date.now();
    return eventsList.some((event) => {
      const isNascar = isNascarEvent(event);
      const start =
        event.date_start ||
        event.dateStart ||
        event.schedule?.start_time_utc ||
        "";
      const end =
        event.date_end || event.dateEnd || event.meeting?.date_end || "";

      if (isNascar) {
        const status = resolveNascarLinkStatus(start, end);
        return status === "live";
      }

      const startMs = start ? Date.parse(start) : null;
      const endMs = end ? Date.parse(end) : null;
      return startMs && endMs && nowMs >= startMs && nowMs <= endMs;
    });
  }, []);

  const availableDateSet = useMemo(
    () => new Set(availableDates),
    [availableDates],
  );

  const visibleDates = useMemo(() => {
    if (availableDates.length === 0) return [];
    const idx = selectedDateStr ? availableDates.indexOf(selectedDateStr) : 0;
    const safeIdx = idx >= 0 ? idx : 0;
    const start = Math.min(
      Math.max(safeIdx - 3, 0),
      Math.max(availableDates.length - 7, 0),
    );
    return availableDates
      .slice(start, start + 7)
      .map((ds) => getDateFromDateStr(ds))
      .filter(Boolean);
  }, [availableDates, selectedDateStr]);

  const loadAvailableDates = useCallback(async (force = false) => {
    try {
      if (!force) {
        const cached = await AsyncStorage.getItem(DATE_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (
            parsed &&
            parsed.fetchedAt &&
            Date.now() - parsed.fetchedAt < DATE_CACHE_TTL &&
            Array.isArray(parsed.data)
          ) {
            setAvailableDates(parsed.data);
            return parsed.data;
          }
        }
      }
    } catch (e) {
      // ignore cache read errors
    }

    const resp = await fetch(DATE_API_BASE);
    const json = await resp.json();
    const rows = Array.isArray(json?.data) ? json.data : [];
    const dateStrs = Array.from(
      new Set(
        rows
          .map((r) => String(r?.date_start || "").slice(0, 10))
          .filter(Boolean)
          .map((s) => s.replace(/-/g, "")),
      ),
    ).sort();

    setAvailableDates(dateStrs);
    try {
      await AsyncStorage.setItem(
        DATE_CACHE_KEY,
        JSON.stringify({ fetchedAt: Date.now(), data: dateStrs }),
      );
    } catch (e) {
      // ignore cache write errors
    }
    return dateStrs;
  }, []);

  const loadDateEvents = useCallback(async (dateStr) => {
    const resp = await fetch(`${DATE_API_BASE}/${dateStr}`);
    const json = await resp.json();
    const rows = Array.isArray(json?.data) ? json.data : [];
    const sorted = rows.sort((a, b) => {
      const ad = Date.parse(a?.date_start || a?.dateStart || "");
      const bd = Date.parse(b?.date_start || b?.dateStart || "");
      return ad - bd;
    });
    setEvents(sorted);
    return sorted;
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const dateStrs = await loadAvailableDates(false);
        if (dateStrs && dateStrs.length > 0) {
          const todayStr = toDateStr(new Date());
          const next =
            dateStrs.find((d) => d >= todayStr) || dateStrs.slice(-1)[0];
          setSelectedDateStr(next);
          const view = getDateFromDateStr(next);
          if (view) setViewMonth(view);
        }
      } catch (e) {
        // ignore
      }
      setLoading(false);
    })();
  }, [loadAvailableDates]);

  useEffect(() => {
    if (!selectedDateStr) return;
    (async () => {
      setLoading(true);
      try {
        await loadDateEvents(selectedDateStr);
      } catch (e) {
        setEvents([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    })();
  }, [selectedDateStr, loadDateEvents]);

  // Polling for live events: update every 5 seconds if there are active sessions
  useEffect(() => {
    const hasLive = checkLiveEvents(events);

    if (!hasLive) {
      // No live events, clear any existing polling
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    // Set up polling for live events
    if (!pollingIntervalRef.current) {
      pollingIntervalRef.current = setInterval(() => {
        if (selectedDateStr) {
          loadDateEvents(selectedDateStr).catch(() => {
            // ignore fetch errors during polling
          });
        }
      }, 5000); // Poll every 5 seconds
    }

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [events, checkLiveEvents, selectedDateStr, loadDateEvents]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const dateStrs = await loadAvailableDates(true);
    if (dateStrs && dateStrs.length > 0) {
      const todayStr = toDateStr(new Date());
      const next = dateStrs.find((d) => d >= todayStr) || dateStrs.slice(-1)[0];
      setSelectedDateStr(next);
    }
    setRefreshing(false);
  }, [loadAvailableDates]);

  const getEventIdentityKey = useCallback((event, groupKey) => {
    const parts = [
      groupKey,
      event?.session_key || event?.sessionKey || null,
      event?.race_id || event?.raceId || null,
      event?.schedule?.run_type || event?.run_type || null,
      event?.schedule?.event_name ||
        event?.event_name ||
        event?.race_name ||
        null,
      event?.date_start || event?.dateStart || null,
      event?.date_end || event?.dateEnd || null,
    ].filter((part) => part !== null && part !== undefined && part !== "");
    return parts.join(":");
  }, []);

  const groups = useMemo(() => {
    const f1Events = events.filter((e) => !isNascarEvent(e));
    const nascarEvents = events.filter((e) => isNascarEvent(e));
    const dedupeGroupEvents = (groupEvents, groupKey) => {
      const seen = new Set();
      const deduped = [];
      for (const ev of groupEvents) {
        const identity = getEventIdentityKey(ev, groupKey);
        if (seen.has(identity)) continue;
        seen.add(identity);
        deduped.push(ev);
      }
      return deduped;
    };
    return [
      {
        key: "f1",
        label: "Formula 1",
        image: require("../../../assets/f1.png"),
        events: dedupeGroupEvents(f1Events, "f1"),
      },
      {
        key: "nascar",
        label: "NASCAR",
        image: require("../../../assets/nascar.png"),
        events: dedupeGroupEvents(nascarEvents, "nascar"),
      },
    ].filter((g) => g.events.length > 0);
  }, [events, getEventIdentityKey]);

  const minDate = availableDates.length
    ? getDateFromDateStr(availableDates[0])
    : null;
  const maxDate = availableDates.length
    ? getDateFromDateStr(availableDates[availableDates.length - 1])
    : null;

  const monthMatrix = useMemo(
    () => buildMonthMatrix(viewMonth.getFullYear(), viewMonth.getMonth()),
    [viewMonth],
  );

  const handlePrevMonth = () => {
    const prev = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
    if (
      minDate &&
      prev < new Date(minDate.getFullYear(), minDate.getMonth(), 1)
    )
      return;
    setViewMonth(prev);
  };

  const handleNextMonth = () => {
    const next = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
    if (
      maxDate &&
      next > new Date(maxDate.getFullYear(), maxDate.getMonth(), 1)
    )
      return;
    setViewMonth(next);
  };

  if (loading && events.length === 0) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text
          allowFontScaling={false}
          style={[styles.loadingText, { color: theme.textSecondary }]}
        >
          Loading results...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
      >
        <DatePickerBar
          dates={visibleDates}
          selectedDateStr={selectedDateStr}
          onSelect={(ds) => setSelectedDateStr(ds)}
          onOpenCalendar={() => setCalendarOpen(true)}
          theme={theme}
          colors={colors}
        />

        <View style={{ opacity: loading ? 0.6 : 1 }}>
          {groups.length > 0 ? (
            <View style={styles.listContainer}>
              {groups.map((group) => (
                <View key={group.key} style={styles.eventContainer}>
                  <View
                    style={[
                      styles.eventHeaderContainer,
                      { backgroundColor: theme.surfaceSecondary },
                    ]}
                  >
                    <View style={styles.eventLogoContainer}>
                      <Image
                        source={group.image}
                        style={styles.eventLogoImage}
                        resizeMode="contain"
                      />
                    </View>
                    <View style={styles.eventInfo}>
                      <Text
                        allowFontScaling={false}
                        style={[styles.eventName, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {group.label}
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.eventSubLabel,
                          { color: theme.textTertiary },
                        ]}
                      >
                        {group.events.length} session
                        {group.events.length !== 1 ? "s" : ""}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.matchesList}>
                    {group.events.map((ev, idx) => (
                      <F1EventRowCard
                        key={`${getEventIdentityKey(ev, group.key)}:${idx}`}
                        event={ev}
                        idx={idx}
                        groupKey={group.key}
                        theme={theme}
                        navigation={navigation}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text
                allowFontScaling={false}
                style={[styles.emptyStateText, { color: theme.textSecondary }]}
              >
                No sessions found for this date.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal transparent visible={calendarOpen} animationType="fade">
        <View style={styles.calendarOverlay}>
          <View
            style={[styles.calendarCard, { backgroundColor: theme.surface }]}
          >
            <View style={styles.calendarHeader}>
              <TouchableOpacity
                onPress={handlePrevMonth}
                style={styles.calendarNavBtn}
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={colors.primary}
                />
              </TouchableOpacity>
              <Text
                allowFontScaling={false}
                style={[styles.calendarTitle, { color: theme.text }]}
              >
                {viewMonth.toLocaleString("en-US", { month: "long" })}{" "}
                {viewMonth.getFullYear()}
              </Text>
              <TouchableOpacity
                onPress={handleNextMonth}
                style={styles.calendarNavBtn}
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.primary}
                />
              </TouchableOpacity>
            </View>
            <View style={styles.weekRow}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
                <Text
                  key={w}
                  allowFontScaling={false}
                  style={[styles.weekDay, { color: theme.textSecondary }]}
                >
                  {w}
                </Text>
              ))}
            </View>
            {monthMatrix.map((row, ri) => (
              <View key={`wk_${ri}`} style={styles.weekRow}>
                {row.map((d, ci) => {
                  if (!d)
                    return (
                      <View
                        key={`cell_${ri}_${ci}`}
                        style={styles.calendarCell}
                      />
                    );
                  const ds = toDateStr(d);
                  const enabled = availableDateSet.has(ds);
                  const isSelected = ds === selectedDateStr;
                  return (
                    <TouchableOpacity
                      key={`cell_${ri}_${ci}`}
                      style={[
                        styles.calendarCell,
                        isSelected && { backgroundColor: colors.primary },
                      ]}
                      onPress={() => {
                        if (!enabled) return;
                        setSelectedDateStr(ds);
                        setCalendarOpen(false);
                      }}
                      activeOpacity={enabled ? 0.7 : 1}
                    >
                      <Text
                        allowFontScaling={false}
                        style={{
                          color: !enabled
                            ? theme.textTertiary
                            : isSelected
                              ? "#fff"
                              : theme.text,
                          fontWeight: enabled ? "600" : "400",
                        }}
                      >
                        {d.getDate()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            <View style={styles.calendarActions}>
              <TouchableOpacity
                onPress={() => setCalendarOpen(false)}
                style={[styles.calendarCloseBtn, { borderColor: theme.border }]}
              >
                <Text allowFontScaling={false} style={{ color: theme.text }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: "center",
  },
  listContainer: {
    paddingHorizontal: 16,
  },
  eventContainer: {
    borderRadius: 12,
    marginBottom: 16,
    overflow: "hidden",
  },
  eventHeaderContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    marginBottom: 5,
    borderRadius: 12,
  },
  eventLogoContainer: {
    marginRight: 12,
  },
  eventLogoImage: {
    width: 50,
    height: 32,
  },
  eventInfo: { flex: 1 },
  eventName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  eventSubLabel: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
  },
  matchesList: { gap: 8 },
  gameRow: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 12,
  },
  cancelledOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    zIndex: 5,
  },
  cancelledBadge: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelledText: {
    marginLeft: 8,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  statusContainer: {
    width: 60,
    marginRight: -4,
    alignItems: "center",
  },
  liveLabel: {
    marginTop: -5,
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 2,
  },
  statusLine1: {
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  statusLine2: {
    fontSize: 11,
    opacity: 0.7,
    textAlign: "center",
  },
  eventBody: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  leftLogo: {
    width: 36,
    height: 24,
    marginRight: 10,
    borderRadius: 3,
  },
  eventTextStack: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  eventSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  rightImageWrap: {
    width: 67.5,
    alignItems: "flex-end",
  },
  trackImage: {
    width: 60,
    height: 44,
  },
  gameFooter: {
    marginTop: -8,
    borderTopWidth: 1,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  gameFooterLeft: { flex: 1 },
  gameFooterRight: { alignItems: "flex-end" },
  winnerFooterText: {
    fontSize: 12,
  },
  winnerCar: {
    width: 50,
    height: 35,
  },
  winnerCarNas: {
    width: 30,
    height: 25,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyStateText: {
    marginTop: 12,
    fontSize: 16,
    textAlign: "center",
  },
  calendarOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  calendarCard: {
    width: Math.min(width - 40, 360),
    borderRadius: 12,
    padding: 16,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  calendarNavBtn: {
    padding: 6,
  },
  calendarTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  weekDay: {
    width: 38,
    textAlign: "center",
    fontSize: 11,
  },
  calendarCell: {
    width: 38,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarActions: {
    marginTop: 8,
    alignItems: "flex-end",
  },
  calendarCloseBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
});

const dateBarStyles = StyleSheet.create({
  outerWrapper: {
    marginBottom: 15,
  },
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: DATE_BAR_H,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  scrollArea: {
    flex: 1,
    height: DATE_BAR_H,
    overflow: "hidden",
  },
  item: {
    width: DATE_ITEM_W,
    height: DATE_BAR_H,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  itemText: {
    fontSize: 13,
    textAlign: "center",
  },
  itemIndicator: {
    height: 2,
    width: 24,
    borderRadius: 1,
    marginTop: 4,
  },
  toggleBtn: {
    height: DATE_BAR_H,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default ResultsScreen;

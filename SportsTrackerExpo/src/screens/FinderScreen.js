import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Image,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useFavorites } from "../context/FavoritesContext";
import { NBAService } from "../services/NBAService";
import { NFLService } from "../services/NFLService";
import { WNBAService } from "../services/WNBAService";
import { NHLService } from "../services/NHLService";
import { MLBService } from "../services/MLBService";
// Soccer enhanced services
import { EnglandServiceEnhanced } from "../services/soccer/EnglandServiceEnhanced";
import { SpainServiceEnhanced } from "../services/soccer/SpainServiceEnhanced";
import { ItalyServiceEnhanced } from "../services/soccer/ItalyServiceEnhanced";
import { FranceServiceEnhanced } from "../services/soccer/FranceServiceEnhanced";
import { GermanyServiceEnhanced } from "../services/soccer/GermanyServiceEnhanced";
import { ChampionsLeagueServiceEnhanced } from "../services/soccer/ChampionsLeagueServiceEnhanced";
import { EuropaLeagueServiceEnhanced } from "../services/soccer/EuropaLeagueServiceEnhanced";
import { EuropaConferenceLeagueServiceEnhanced } from "../services/soccer/EuropaConferenceLeagueServiceEnhanced";
import { FIFAWorldServiceEnhanced } from "../services/soccer/FIFAWorldServiceEnhanced";
import { Ionicons, FontAwesome6 } from "@expo/vector-icons";

const MIN_DATE = new Date(2004, 0, 11); // 2004-01-11

const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
const formatApiDate = (d) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

// helper: get MLB team abbreviation mapping (copied/adapted from TransactionsScreen)
const getMLBTeamAbbreviation = (team) => {
  const teamMapping = {
    108: "LAA",
    117: "HOU",
    133: "OAK",
    141: "TOR",
    144: "ATL",
    158: "MIL",
    138: "STL",
    112: "CHC",
    109: "ARI",
    119: "LAD",
    137: "SF",
    114: "CLE",
    136: "SEA",
    146: "MIA",
    121: "NYM",
    120: "WSH",
    110: "BAL",
    135: "SD",
    143: "PHI",
    134: "PIT",
    140: "TEX",
    139: "TB",
    111: "BOS",
    113: "CIN",
    115: "COL",
    118: "KC",
    116: "DET",
    142: "MIN",
    145: "CWS",
    147: "NYY",
    11: "OAK",
  };
  if (!team) return "MLB";
  if (team.abbreviation) return team.abbreviation;
  const id = Number(team.id || team.teamId || team.team?.id);
  return (
    teamMapping[id] ||
    (team.name ? String(team.name).substring(0, 3).toUpperCase() : "MLB")
  );
};

const buildMonthMatrix = (year, month) => {
  // month: 0-based
  const first = new Date(year, month, 1);
  const startDay = first.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const rows = [];
  let cells = [];
  // pad empty cells before first day
  for (let i = 0; i < startDay; i++) cells.push(null);

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d));
  }

  // pad remaining cells to complete weeks
  while (cells.length % 7 !== 0) cells.push(null);

  for (let r = 0; r < cells.length; r += 7) {
    rows.push(cells.slice(r, r + 7));
  }

  return rows;
};

const FinderScreen = ({ navigation, route, hideHeader = false }) => {
  const { theme, colors } = useTheme();
  const { isFavorite } = useFavorites();

  // sport can be passed via route.params.sport; default to nba
  const sport =
    route && route.params && route.params.sport
      ? String(route.params.sport).toLowerCase()
      : "nba";

  const serviceMap = {
    nba: NBAService,
    nfl: NFLService,
    wnba: WNBAService,
    nhl: NHLService,
    mlb: MLBService,
    // soccer leagues/services
    england: EnglandServiceEnhanced,
    "eng.1": EnglandServiceEnhanced,
    "eng.fa": EnglandServiceEnhanced,
    "eng.league_cup": EnglandServiceEnhanced,
    spain: SpainServiceEnhanced,
    "esp.1": SpainServiceEnhanced,
    "esp.copa_del_rey": SpainServiceEnhanced,
    "esp.super_cup": SpainServiceEnhanced,
    italy: ItalyServiceEnhanced,
    "ita.1": ItalyServiceEnhanced,
    france: FranceServiceEnhanced,
    "fra.1": FranceServiceEnhanced,
    germany: GermanyServiceEnhanced,
    "ger.1": GermanyServiceEnhanced,
    "champions-league": ChampionsLeagueServiceEnhanced,
    "uefa.champions": ChampionsLeagueServiceEnhanced,
    "uefa.europa": EuropaLeagueServiceEnhanced,
    "europa-league": EuropaLeagueServiceEnhanced,
    "uefa.europa.conf": EuropaConferenceLeagueServiceEnhanced,
    "europa-conference": EuropaConferenceLeagueServiceEnhanced,
    "fifa.world": FIFAWorldServiceEnhanced,
  };

  const SelectedService = serviceMap[sport] || NBAService;
  // Diagnostic: show which service we resolved for this sport param
  try {
    console.log("[Finder] resolved SelectedService", {
      sportParam: sport,
      isFallbackToNBA: SelectedService === NBAService,
      selectedServiceKeys: SelectedService
        ? Object.keys(SelectedService)
        : null,
    });
  } catch (e) {}

  const today = useMemo(() => new Date(), []);

  const [viewMonth, setViewMonth] = useState(new Date());
  const [pickerLevel, setPickerLevel] = useState("calendar"); // 'calendar' | 'months' | 'years'
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [games, setGames] = useState([]);
  const [error, setError] = useState(null);

  const monthMatrix = useMemo(
    () => buildMonthMatrix(viewMonth.getFullYear(), viewMonth.getMonth()),
    [viewMonth],
  );

  const canSelect = (d) => {
    if (!d) return false;
    if (d < MIN_DATE) return false;
    // disallow future dates
    const normalizedToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    if (d > normalizedToday) return false;

    // business rule: a given date `d` should only become selectable after
    // 02:00 of the following day. E.g. yesterday is selectable at 02:00 today.
    const now = new Date();
    const availability = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate() + 1,
      2,
      0,
      0,
    );
    return now >= availability;
  };

  const prevAction = () => {
    if (pickerLevel === "months") {
      setViewMonth(
        new Date(viewMonth.getFullYear() - 1, viewMonth.getMonth(), 1),
      );
      return;
    }
    if (pickerLevel === "years") {
      setViewMonth(
        new Date(viewMonth.getFullYear() - 10, viewMonth.getMonth(), 1),
      );
      return;
    }
    setViewMonth(
      new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1),
    );
  };

  const nextAction = () => {
    if (pickerLevel === "months") {
      setViewMonth(
        new Date(viewMonth.getFullYear() + 1, viewMonth.getMonth(), 1),
      );
      return;
    }
    if (pickerLevel === "years") {
      setViewMonth(
        new Date(viewMonth.getFullYear() + 10, viewMonth.getMonth(), 1),
      );
      return;
    }
    setViewMonth(
      new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1),
    );
  };

  const searchBySelectedDate = async () => {
    if (!selectedDate) return;
    setLoading(true);
    setError(null);
    setGames([]);
    const dateStr =
      SelectedService && SelectedService.formatDateForAPI
        ? SelectedService.formatDateForAPI(selectedDate)
        : formatApiDate(selectedDate);
    // Extensive logging to trace which service and endpoint are used
    try {
      try {
        const leagueInfo = SelectedService.getLeagueInfo
          ? SelectedService.getLeagueInfo()
          : null;
        const competitionInfo = SelectedService.getCompetitionInfo
          ? SelectedService.getCompetitionInfo()
          : null;
        console.log("[Finder] searchBySelectedDate start", {
          sportParam: sport,
          dateStr,
          SelectedServiceHasScoreboard: !!SelectedService.getScoreboard,
          leagueInfo,
          competitionInfo,
        });
      } catch (inner) {
        console.log(
          "[Finder] searchBySelectedDate - could not read service meta",
          inner,
        );
      }

      const data = await SelectedService.getScoreboard(dateStr);
      console.log("[Finder] getScoreboard returned", {
        eventsCount: data?.events?.length,
      });
      const events = data?.events || [];
      let formatted = [];
      if (SelectedService.formatGameForMobile) {
        formatted = events
          .map((g) => SelectedService.formatGameForMobile(g))
          .filter(Boolean);
      } else {
        // MLBService returns processed events compatible with scoreboard UI
        formatted = events;
      }
      setGames(formatted);
    } catch (err) {
      console.error("Finder fetch error", err);
      setError("Failed to load games");
    } finally {
      setLoading(false);
      // collapse calendar after search
      setCalendarOpen(false);
    }
  };

  const canSelectMonth = (year, month) => {
    // determine if any day in that month is selectable using canSelect
    const last = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const dt = new Date(year, month, d);
      if (canSelect(dt)) return true;
    }
    return false;
  };

  const canSelectYear = (year) => {
    // year selectable if any month in the year is selectable
    for (let m = 0; m < 12; m++) {
      if (canSelectMonth(year, m)) return true;
    }
    return false;
  };

  const renderDay = (d) => {
    if (!d) return <View style={styles.dayCell} />;
    const disabled = !canSelect(d);
    const isSelected =
      selectedDate && d.toDateString() === selectedDate.toDateString();

    return (
      <TouchableOpacity
        key={d.toDateString()}
        style={[
          styles.dayCell,
          isSelected && { backgroundColor: colors.primary, borderRadius: 6 },
        ]}
        onPress={() => !disabled && setSelectedDate(d)}
        disabled={disabled}
      >
        <Text
          allowFontScaling={false}
          style={{
            color: disabled
              ? theme.textTertiary
              : isSelected
                ? "#fff"
                : theme.text,
          }}
        >
          {d.getDate()}
        </Text>
      </TouchableOpacity>
    );
  };

  const TeamLogo = ({ teamAbbreviation, team, size = 36, style }) => {
    const { colors, getTeamLogoUrl } = useTheme();
    const [err, setErr] = useState(false);
    // prefer explicit abbreviation, otherwise for MLB try to derive from team object/id
    let abbr = teamAbbreviation;
    if ((!abbr || abbr === "") && sport === "mlb" && team) {
      abbr = getMLBTeamAbbreviation(team);
    }
    // For soccer services prefer the team numeric id (ESPN combiner expects id)
    const soccerKeys = new Set([
      "england",
      "eng.1",
      "eng.fa",
      "eng.league_cup",
      "spain",
      "esp.1",
      "esp.copa_del_rey",
      "esp.super_cup",
      "italy",
      "ita.1",
      "france",
      "fra.1",
      "germany",
      "ger.1",
      "champions-league",
      "uefa.champions",
      "europa-league",
      "europa-conference",
      "fifa.world",
      "uefa.europa",
      "uefa.europa.conf",
    ]);
    const isSoccer = soccerKeys.has(sport);
    const logoId =
      isSoccer && team && (team.id || team.teamId)
        ? team.id || team.teamId
        : abbr;
    // For soccer always request via generic 'soccer' to ensure ThemeContext builds soccer path
    const logoSport = isSoccer ? "soccer" : sport;
    const uri = getTeamLogoUrl(logoSport, logoId);

    const iconName = isSoccer
      ? "soccer-ball"
      : sport === "nba" || sport === "wnba"
        ? "basketball"
        : sport === "nfl"
          ? "football"
          : sport === "nhl"
            ? "ice-hockey"
            : sport === "mlb"
              ? "baseball"
              : "basketball";

    if (!uri || err)
      return (
        <FontAwesome6
          name={iconName}
          size={size}
          color={colors.primary}
          style={style}
        />
      );
    return (
      <Image
        source={{ uri }}
        style={[{ width: size, height: size }, style]}
        onError={() => setErr(true)}
      />
    );
  };

  const isLiveGame = (item) => {
    if (!item) return false;
    if (item.gameStatus !== "live" && item.gameStatus !== "in") return false;
    const statusText = (item.status || "").toString();
    const isHalftime = /halftime/i.test(statusText);
    const isEndOf = /end of/i.test(statusText);
    const hasClock = !!(
      item.displayClock && /\d/.test(String(item.displayClock))
    );
    return (
      !item.isCompleted &&
      !item.status.type?.completed &&
      (isHalftime || isEndOf || hasClock)
    );
  };

  const getStatusText = (item) => {
    if (!item) return "";
    if (item?.isCompleted || item?.status?.type?.completed) return "Final";
    const live = isLiveGame(item);
    if (live) {
      const clockRaw = item.displayClock;
      const clock =
        typeof clockRaw === "object" && clockRaw !== null
          ? clockRaw.displayValue || clockRaw.summary || ""
          : String(clockRaw || "");
      const period = item.period || 1;
      let periodText;
      if (period === 1) periodText = "1st";
      else if (period === 2) periodText = "2nd";
      else if (period === 3) periodText = "3rd";
      else if (period === 4) periodText = "4th";
      else if (period === 5) periodText = "OT";
      else periodText = `${period - 4}OT`;
      if (item.status && /halftime/i.test(item.status)) return "Halftime";
      if (clock) return `${clock === "0.0" ? "End" : clock} - ${periodText}`;
      return `Q${period}`;
    }
    if (item.date) {
      try {
        const d = new Date(item.date);
        return d.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
      } catch (e) {
        return "";
      }
    }
    return "";
  };

  const getStatusColor = (item) => {
    if (!item) return theme.textSecondary;
    if (item?.isCompleted || item?.status?.type?.completed) return theme.success;
    if (isLiveGame(item)) return colors.primary;
    return theme.textSecondary;
  };

  const renderGame = ({ item }) => {
    if (!item) return null;
    console.log(item);

    // Safely resolve away/home team objects — some services return competitors
    // under `competitions[0].competitors` instead of `awayTeam`/`homeTeam`.
    const resolveTeam = (it, side) => {
      if (!it)
        return {
          id: null,
          abbreviation: "",
          displayName: "",
          score: "-",
          record: "",
        };
      if (side === "away" && it.awayTeam) return it.awayTeam;
      if (side === "home" && it.homeTeam) return it.homeTeam;
      const comps =
        it.competitions && it.competitions[0] ? it.competitions[0] : null;
      const competitors = comps && comps.competitors ? comps.competitors : [];
      const found = competitors.find((c) =>
        side === "away" ? c.homeAway === "away" : c.homeAway === "home",
      );
      if (found) {
        return {
          id:
            (found.team && (found.team.id || found.team.teamId)) ||
            found.id ||
            null,
          abbreviation:
            (found.team && found.team.abbreviation) || found.abbreviation || "",
          displayName:
            (found.team &&
              (found.team.displayName || found.team.shortDisplayName)) ||
            found.displayName ||
            "",
          score: found.score || found.homeScore || found.awayScore || "-",
          record:
            found.record ||
            (found.records && found.records[0]
              ? found.records[0].summary
              : "") ||
            "",
        };
      }
      return {
        id: null,
        abbreviation: "",
        displayName: "",
        score: "-",
        record: "",
      };
    };

    const awayTeam = resolveTeam(item, "away");
    const homeTeam = resolveTeam(item, "home");

    // Helper to pick the correct GameDetails route for soccer competitions
    const getDetailsRouteFor = (it, sportParam) => {
      const code =
        (it && (it.competitionCode || it.competitionName)) || sportParam || "";
      const c = String(code).toLowerCase();
      if (c.includes("eng")) return "EnglandGameDetails";
      if (c.includes("esp") || c.includes("spain")) return "SpainGameDetails";
      if (c.includes("ita") || c.includes("italy")) return "ItalyGameDetails";
      if (c.includes("fra") || c.includes("france")) return "FranceGameDetails";
      if (c.includes("ger") || c.includes("germany"))
        return "GermanyGameDetails";
      if (c.includes("champions") || c.includes("ucl")) return "UCLGameDetails";
      if (c.includes("europa-conference") || c.includes("uecl"))
        return "UECLGameDetails";
      if (c.includes("europa") || c.includes("uel")) return "UELGameDetails";
      if (c.includes("fifa")) return "FIFAWorldGameDetails";
      // If nothing matches, fall back to generic GameDetails
      return "GameDetails";
    };

    return (
      <TouchableOpacity
        style={[
          styles.gameCard,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
        onPress={() => {
          const routeName = getDetailsRouteFor(item, sport);
          navigation.navigate(routeName, {
            ...(sport === "mlb" ? { gamePk: item.id } : { gameId: item.id }),
            competitionCode: item.competitionCode || null,
            sport,
          });
        }}
        activeOpacity={0.8}
      >
        <View style={styles.gameHeader}>
          <View style={styles.gameStatus}>
            <Text
              allowFontScaling={false}
              style={[
                styles.statusText,
                { color: getStatusColor(item) },
                isLiveGame(item) && styles.liveStatusText,
              ]}
            >
              {getStatusText(item)}
              {(() => {
                const compName =
                  item && item.competitionName
                    ? typeof item.competitionName === "string"
                      ? item.competitionName
                      : item.competitionName.displayName ||
                        item.competitionName.name ||
                        ""
                    : "";

                return compName ? (
                  <Text
                    style={[
                      styles.competitionNameText,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {" - "}
                    {compName}
                  </Text>
                ) : null;
              })()}
            </Text>

            {isLiveGame(item) && (
              <View
                style={[styles.liveDot, { backgroundColor: colors.primary }]}
              />
            )}
          </View>
        </View>

        <View style={styles.gameContent}>
          <View style={styles.teamRow}>
            <View style={styles.teamInfo}>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate("TeamPage", {
                    teamId: awayTeam.id,
                    sport,
                  })
                }
                activeOpacity={0.8}
              >
                <TeamLogo
                  team={awayTeam}
                  teamAbbreviation={awayTeam.abbreviation}
                  size={36}
                  style={{
                    marginRight: 12,
                    opacity:
                      !item?.isCompleted && !item?.status?.type?.completed
                        ? 1
                        : parseInt(awayTeam.score) > parseInt(homeTeam.score)
                          ? 1
                          : 0.5,
                  }}
                />
              </TouchableOpacity>
              <View style={styles.teamDetails}>
                <View style={styles.teamNameContainer}>
                  {isFavorite(awayTeam.id, sport) && (
                    <Ionicons
                      name="star"
                      size={14}
                      color={colors.primary}
                      style={styles.favoriteIcon}
                    />
                  )}
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.teamName,
                      {
                        color:
                          !item?.isCompleted && !item?.status?.type?.completed
                            ? isFavorite(awayTeam.id, sport)
                              ? colors.primary
                              : theme.text
                            : parseInt(awayTeam.score) >
                                parseInt(homeTeam.score)
                              ? isFavorite(awayTeam.id, sport)
                                ? colors.primary
                                : theme.text
                              : theme.textSecondary,
                      },
                    ]}
                  >
                    {String(awayTeam.displayName || "")}
                  </Text>
                </View>
                {awayTeam.record ? (
                <Text
                  allowFontScaling={false}
                  style={[styles.teamRecord, { color: theme.textSecondary }]}
                >
                  {String(awayTeam.record || "")}
                </Text>
                ) : null}
              </View>
            </View>
            <Text
              allowFontScaling={false}
              style={[
                styles.teamScore,
                {
                  color:
                    !item?.isCompleted && !item?.status?.type?.completed
                      ? theme.text
                      : parseInt(awayTeam.score) > parseInt(homeTeam.score)
                        ? colors.primary
                        : theme.textSecondary,
                },
              ]}
            >
              {item.status === "Scheduled" ? "" : String(awayTeam.score || "-")}
            </Text>
          </View>

          <View style={[styles.teamRow, { marginTop: 12 }]}>
            <View style={styles.teamInfo}>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate("TeamPage", {
                    teamId: homeTeam.id,
                    sport,
                  })
                }
                activeOpacity={0.8}
              >
                <TeamLogo
                  team={homeTeam}
                  teamAbbreviation={homeTeam.abbreviation}
                  size={36}
                  style={{
                    marginRight: 12,
                    opacity:
                      !item?.isCompleted && !item?.status?.type?.completed
                        ? 1
                        : parseInt(homeTeam.score) > parseInt(awayTeam.score)
                          ? 1
                          : 0.5,
                  }}
                />
              </TouchableOpacity>
              <View style={styles.teamDetails}>
                <View style={styles.teamNameContainer}>
                  {isFavorite(homeTeam.id, sport) && (
                    <Ionicons
                      name="star"
                      size={14}
                      color={colors.primary}
                      style={styles.favoriteIcon}
                    />
                  )}
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.teamName,
                      {
                        color:
                          !item?.isCompleted && !item?.status?.type?.completed
                            ? isFavorite(homeTeam.id, sport)
                              ? colors.primary
                              : theme.text
                            : parseInt(homeTeam.score) >
                                parseInt(awayTeam.score)
                              ? isFavorite(homeTeam.id, sport)
                                ? colors.primary
                                : theme.text
                              : theme.textSecondary,
                      },
                    ]}
                  >
                    {String(homeTeam.displayName || "")}
                  </Text>
                </View>
                {homeTeam.record ? (
                <Text
                  allowFontScaling={false}
                  style={[styles.teamRecord, { color: theme.textSecondary }]}
                >
                  {String(homeTeam.record || "")}
                </Text>
                ) : null}
              </View>
            </View>
            <Text
              allowFontScaling={false}
              style={[
                styles.teamScore,
                {
                  color:
                    !item?.isCompleted && !item?.status?.type?.completed
                      ? theme.text
                      : parseInt(homeTeam.score) > parseInt(awayTeam.score)
                        ? colors.primary
                        : theme.textSecondary,
                },
              ]}
            >
              {item.status === "Scheduled" ? "" : String(homeTeam.score || "-")}
            </Text>
          </View>
        </View>

        <View style={styles.gameFooter}>
          <View style={styles.gameFooterLeft}>
            {item.venue && (
              <Text
                allowFontScaling={false}
                style={[styles.venueText, { color: theme.textSecondary }]}
              >
                {typeof item.venue === "string"
                  ? item.venue
                  : String(
                      item.venue?.displayName ||
                        item.venue?.name ||
                        item.venue ||
                        "",
                    )}
              </Text>
            )}
            {(item?.broadcast?.length >= 1 || item?.broadcasts?.length >= 1) && (!item?.isDomesticCup && !item?.leaguesData?.name?.includes("UEFA") && item?.season?.type !== 3 && item?.season?.type !== 4 && item?.season?.type !== 5) && (
              <Text
                allowFontScaling={false}
                style={[styles.broadcastText, { color: theme.textSecondary }]}
              >
                {Array.isArray(item.broadcast || item.broadcasts)
                  ? (item.broadcast || item.broadcasts).join(", ")
                  : typeof (item.broadcast || item.broadcasts) === "string"
                  ? (item.broadcast || item.broadcasts)
                  : String(
                      item.broadcast?.displayName ||
                        item.broadcast?.name ||
                        ""
                    )}
              </Text>
            )}
            {item.season?.slug && (item?.isDomesticCup || item?.leaguesData?.name?.includes("UEFA") || item?.season?.type === 3 || item?.season?.type === 4 || item?.season?.type === 5) && (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons
                name="trophy"
                size={14}
                color={colors.primary}
                style={{ marginRight: 5, marginTop: 2 }}
              />
            
              <Text
                allowFontScaling={false}
                style={[styles.venueText, { color: theme.textSecondary }]}
              >
                {(item.season.type === 3 || item.season.type === 4 || item.season.type === 5) ? item.notes : 
                item.season.slug.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")}{item?.competitions?.[0]?.leg?.displayValue ? ` - ${item.competitions[0].leg.displayValue}` : ''
                }
              </Text>
            </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {!hideHeader && (
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <Text allowFontScaling={false} style={styles.headerTitle}>
            Finder
          </Text>
        </View>
      )}

      <View style={styles.calendarWrap}>
        {!calendarOpen ? (
          <TouchableOpacity
            style={[styles.openCalendarBtn, { borderColor: colors.accent }]}
            onPress={() => setCalendarOpen(true)}
          >
            <Text allowFontScaling={false} style={{ color: theme.text }}>
              {selectedDate ? selectedDate.toDateString() : "Select date"}
            </Text>
          </TouchableOpacity>
        ) : (
          <>
            <View style={styles.monthRow}>
              <TouchableOpacity onPress={prevAction} style={styles.monthBtn}>
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={colors.primary}
                />
              </TouchableOpacity>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {pickerLevel === "years" ? (
                  <Text
                    allowFontScaling={false}
                    style={[styles.monthTitle, { color: theme.text }]}
                  >
                    Year
                  </Text>
                ) : pickerLevel === "months" ? (
                  <TouchableOpacity onPress={() => setPickerLevel("years")}>
                    <Text
                      allowFontScaling={false}
                      style={[styles.monthTitle, { color: theme.text }]}
                    >
                      {String(viewMonth.getFullYear())}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => setPickerLevel("months")}>
                    <Text
                      allowFontScaling={false}
                      style={[styles.monthTitle, { color: theme.text }]}
                    >
                      {viewMonth.toLocaleString(undefined, { month: "long" }) +
                        "  " +
                        viewMonth.getFullYear()}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity onPress={nextAction} style={styles.monthBtn}>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.primary}
                />
              </TouchableOpacity>
            </View>

            {pickerLevel === "calendar" && (
              <>
                <View style={styles.weekRow}>
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                    (w) => (
                      <Text
                        key={w}
                        allowFontScaling={false}
                        style={[styles.weekDay, { color: theme.textSecondary }]}
                      >
                        {w}
                      </Text>
                    ),
                  )}
                </View>

                {monthMatrix.map((row, ri) => (
                  <View key={ri} style={styles.weekRow}>
                    {row.map((d, ci) => renderDay(d))}
                  </View>
                ))}
              </>
            )}

            {pickerLevel === "months" && (
              <View style={styles.monthsGrid}>
                {Array.from({ length: 12 }).map((_, i) => {
                  const mName = new Date(
                    viewMonth.getFullYear(),
                    i,
                    1,
                  ).toLocaleString(undefined, { month: "short" });
                  const enabled = canSelectMonth(viewMonth.getFullYear(), i);
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.monthCell, !enabled && { opacity: 0.35 }]}
                      onPress={() => {
                        if (!enabled) return;
                        setViewMonth(new Date(viewMonth.getFullYear(), i, 1));
                        setPickerLevel("calendar");
                      }}
                    >
                      <Text
                        allowFontScaling={false}
                        style={{ color: theme.text }}
                      >
                        {mName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {pickerLevel === "years" && (
              <View style={styles.monthsGrid}>
                {(() => {
                  const center = viewMonth.getFullYear();
                  const years = [];
                  const start = center - 6;
                  for (let y = start; y < start + 12; y++) years.push(y);
                  return years.map((yr) => {
                    const enabled = canSelectYear(yr);
                    return (
                      <TouchableOpacity
                        key={yr}
                        style={[
                          styles.monthCell,
                          !enabled && { opacity: 0.35 },
                        ]}
                        onPress={() => {
                          if (!enabled) return;
                          setViewMonth(new Date(yr, 0, 1));
                          setPickerLevel("months");
                        }}
                      >
                        <Text
                          allowFontScaling={false}
                          style={{ color: theme.text }}
                        >
                          {String(yr)}
                        </Text>
                      </TouchableOpacity>
                    );
                  });
                })()}
              </View>
            )}
          </>
        )}
      </View>

      {calendarOpen && (
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={[styles.searchBtn, { backgroundColor: colors.primary }]}
            onPress={searchBySelectedDate}
            disabled={!selectedDate || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text allowFontScaling={false} style={{ color: "#fff" }}>
                Search
              </Text>
            )}
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <Text allowFontScaling={false} style={{ color: theme.textSecondary }}>
            {selectedDate ? selectedDate.toDateString() : "No date selected"}
          </Text>
        </View>
      )}

      <View style={styles.resultsWrap}>
        {error ? (
          <Text allowFontScaling={false} style={{ color: colors.primary }}>
            {error}
          </Text>
        ) : (
          <FlatList
            data={games}
            keyExtractor={(it) => it.id}
            renderItem={renderGame}
            ListEmptyComponent={() => (
              <View style={styles.emptyWrap}>
                <Text
                  allowFontScaling={false}
                  style={{ color: theme.textSecondary }}
                >
                  No games found for that date.
                </Text>
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { height: 52, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontWeight: "700" },
  calendarWrap: { padding: 12 },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  monthBtn: {
    padding: 10,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  monthTitle: { fontSize: 16, fontWeight: "700" },
  monthYear: { fontSize: 14, fontWeight: "600" },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  weekDay: { width: `${100 / 7}%`, textAlign: "center", fontSize: 12 },
  dayCell: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 8 },
  monthsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  monthCell: {
    width: "30%",
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 10,
    borderRadius: 8,
  },
  openCalendarBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
  },
  searchBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  resultsWrap: { flex: 1, paddingHorizontal: 12 },
  emptyWrap: { padding: 20, alignItems: "center" },
  gameRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  gameTeams: { flexDirection: "row", alignItems: "center" },
  gameCard: {
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  gameHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  gameStatus: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusText: {
    fontSize: 14,
    fontWeight: "700",
  },
  liveStatusText: {
    fontWeight: "bold",
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 6,
  },
  gameContent: {
    // spacing handled by margins between elements
  },
  teamRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  teamInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  teamLogo: {
    width: 36,
    height: 36,
    marginRight: 12,
  },
  teamDetails: {
    flex: 1,
  },
  teamNameContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  favoriteIcon: {
    marginRight: 6,
  },
  teamName: {
    fontSize: 16,
    fontWeight: "600",
  },
  teamRecord: {
    fontSize: 12,
    marginTop: 2,
  },
  teamScore: {
    fontSize: 20,
    fontWeight: "bold",
    minWidth: 30,
    textAlign: "right",
  },
  gameFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  gameFooterLeft: { flex: 1 },
  gameFooterRight: { alignItems: "flex-end" },
  venueText: { fontSize: 12 },
  broadcastText: { fontSize: 12 },
});

export default FinderScreen;

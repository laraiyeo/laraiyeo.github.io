import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons, FontAwesome6 } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../../context/ThemeContext";
import { useBetData } from "../../context/BetDataContext";
import { useSport } from "./BetTabNavigator";
import BetSlip from "../../components/BetSlip";
import {
  getDailyRewardState,
  claimDailyReward,
  dismissDailyReward,
  getUserProfile,
} from "../../services/betService";
import { useBetSlip } from "../../context/BetSlipContext";
import { BannerAdWrapper, DEV_BANNER_ID } from "../../services/ads";

// Global image cache - keeps image sources stable across re-renders
const imageCache = new Map();

// Static tournament/logo assets (stable identity prevents remounts)
const NBA_LOGO = require("../../../assets/nba.png");
const NFL_LOGO = require("../../../assets/nfl.png");
const NHL_LOGO = require("../../../assets/nhl.png");
const SOCCER_LOGO = require("../../../assets/uefa.png");

// Get sport-specific logo
const getSportLogo = (sport) => {
  switch (sport) {
    case "NBA":
      return NBA_LOGO;
    case "NFL":
      return NFL_LOGO;
    case "NHL":
      return NHL_LOGO;
    case "UEFA":
      return SOCCER_LOGO;
    default:
      return NBA_LOGO;
  }
};

// Get sport-specific icon for no games message
const getSportIcon = (sport) => {
  switch (sport) {
    case "NBA":
      return "basketball";
    case "NFL":
      return "football";
    case "NHL":
      return "hockey-puck";
    case "UEFA":
      return "soccer-ball";
    default:
      return "basketball";
  }
};

// Get sport path for ESPN logos
const getSportPath = (sport) => {
  switch (sport) {
    case "NBA":
      return "nba";
    case "NFL":
      return "nfl";
    case "NHL":
      return "nhl";
    case "UEFA":
      return "soccer";
    default:
      return "nba";
  }
};

const { width } = Dimensions.get("window");

// Merge new games with previous games, preserving object identity for unchanged items
const mergeGames = (prevGames, newGames) => {
  if (!Array.isArray(prevGames) || prevGames.length === 0) return newGames;
  if (!Array.isArray(newGames)) return newGames;

  // Build map of previous games by id
  const prevMap = new Map();
  prevGames.forEach((g) => {
    if (g && g.id) prevMap.set(String(g.id), g);
  });

  return newGames.map((g) => {
    if (!g || !g.id) return g;
    const id = String(g.id);
    const prev = prevMap.get(id);
    if (!prev) return g;

    // Quick shallow compare for key fields
    const fields = ["score1", "score2", "time", "period", "status"];
    let changed = false;
    for (const f of fields) {
      if (prev[f] !== g[f]) {
        changed = true;
        break;
      }
    }

    return changed ? g : prev;
  });
};

// Helper: group games by their tournament key (top-level so it's stable)
const groupGamesByTournament = (games) => {
  const grouped = {};
  games.forEach((game) => {
    const tournamentKey = game.tournament;
    if (!grouped[tournamentKey]) {
      grouped[tournamentKey] = {
        tournament: game.tournament,
        tournamentLabel: game.tournamentLabel,
        games: [],
      };
    }
    grouped[tournamentKey].games.push(game);
  });

  Object.values(grouped).forEach((group) => {
    group.games.sort((a, b) => {
      if (a.startTime && b.startTime) {
        const ta = new Date(a.startTime).getTime();
        const tb = new Date(b.startTime).getTime();
        return ta - tb;
      }
      if (a.time && b.time) return a.time.localeCompare(b.time);
      return 0;
    });
  });

  return Object.values(grouped);
};

// UpcomingGamesSection as a top-level memoized component to avoid remounts
const UpcomingGamesSection = React.memo(
  ({ games, navigation, theme, sport, fetchRosters }) => {
    const groupedTournaments = groupGamesByTournament(games);
    const sportLogo = getSportLogo(sport);

    return (
      <View style={styles.upcomingContainer}>
        {groupedTournaments.map((group) => (
          <View
            key={group.tournament}
            style={[
              styles.tournamentContainer,
              { backgroundColor: theme.surfaceSecondary },
            ]}
          >
            <View style={styles.tournamentHeader}>
              <View style={styles.tournamentIconContainer}>
                <Image
                  source={sportLogo}
                  style={[
                    styles.nbaLogoSmall,
                    sport === "UEFA" && { tintColor: theme.text },
                  ]}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              </View>
              <View style={styles.tournamentInfo}>
                <Text
                  style={[styles.tournamentName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {group.tournament}
                </Text>
                <Text
                  style={[
                    styles.tournamentLabel,
                    { color: theme.textTertiary },
                  ]}
                  numberOfLines={1}
                >
                  {group.tournamentLabel}
                </Text>
              </View>
            </View>

            <View style={styles.gamesList}>
              {group.games.map((game, index) => (
                <View key={game.id}>
                  <ScheduledGameRow
                    game={game}
                    navigation={navigation}
                    theme={theme}
                    fetchRosters={fetchRosters}
                  />

                  {index < group.games.length - 1 && (
                    <View
                      style={[
                        styles.gameSeparator,
                        { backgroundColor: theme.border },
                      ]}
                    />
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  },
  (prev, next) =>
    prev.games === next.games &&
    prev.theme === next.theme &&
    prev.sport === next.sport,
);

// Format time to EST (robust across platforms). Returns { time, period }
// Uses Intl.DateTimeFormat.formatToParts to reliably extract hour/minute and dayPeriod.
const formatTimeEST = (dateString) => {
  const date = new Date(dateString);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  // formatToParts gives structured pieces we can rely on rather than splitting strings
  const parts = fmt.formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour")?.value || "";
  const minutePart = parts.find((p) => p.type === "minute")?.value || "00";
  const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value || "";

  const time = `${hourPart}:${minutePart}`;
  const period = dayPeriod ? `${dayPeriod} EST` : "EST";
  return { time, period };
};

// Parse game data from API
const parseGameData = (events, isDarkMode = false, sport = "NBA") => {
  if (!events || !Array.isArray(events))
    return { live: [], scheduled: [], completed: [], hasLiveGames: false };

  const live = [];
  const scheduled = [];
  const completed = [];
  let hasLiveGames = false;

  const sportPath = getSportPath(sport);

  events.forEach((event) => {
    const competition = event.competitions?.[0];
    if (!competition) return;

    const status = event.status;
    const competitors = competition.competitors || [];
    const homeTeam = competitors.find((c) => c.homeAway === "home");
    const awayTeam = competitors.find((c) => c.homeAway === "away");

    if (!homeTeam || !awayTeam) return;

    const timeFormatted = formatTimeEST(event.date);

    const darkSuffix = isDarkMode ? "-dark" : "";
    const team1Abbr = (awayTeam.team?.abbreviation || "T1").toLowerCase();
    const team1Id = awayTeam.team?.id || null;
    const team2Abbr = (homeTeam.team?.abbreviation || "T2").toLowerCase();
    const team2Id = homeTeam.team?.id || null;

    const team1End = sportPath === "soccer" ? team1Id : team1Abbr;
    const team2End = sportPath === "soccer" ? team2Id : team2Abbr;

    const gameData = {
      id: event.id,
      sport: sport,
      tournament: event.league?.name || sport,
      tournamentLabel:
        event.season?.slug || event.season?.year?.toString() || "Season",
      shortName: event.shortName,
      team1: awayTeam.team?.displayName || "Team 1",
      team1Abbr: awayTeam.team?.abbreviation || "T1",
      team1Id: awayTeam.team?.id || null,
      team1Logo: `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500${darkSuffix}/${team1End}.png&h=200&w=200`,
      team1Record: awayTeam.record?.summary || null,
      team2: homeTeam.team?.displayName || "Team 2",
      team2Abbr: homeTeam.team?.abbreviation || "T2",
      team2Id: homeTeam.team?.id || null,
      team2Logo: `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500${darkSuffix}/${team2End}.png&h=200&w=200`,
      team2Record: homeTeam.record?.summary || null,
      score1: awayTeam.score || 0,
      score2: homeTeam.score || 0,
      shortDetail: status.type.detail || null,
      time:
        status.type?.state === "in" && status.displayClock
          ? status.displayClock
          : timeFormatted.time,
      period: status.period,
      // Keep original ISO start time for accurate sorting and comparisons
      startTime: event.date,
      timePeriod: timeFormatted.period,
      venue: competition.venue?.fullName,
    };

    // Categorize by game state
    if (status.type?.state === "in") {
      gameData.status = "live";
      live.push(gameData);
      hasLiveGames = true;
    } else if (status.type?.state === "pre") {
      gameData.status = "scheduled";
      scheduled.push(gameData);
    } else if (status.type?.completed) {
      gameData.status = "completed";
      completed.push(gameData);
    }
  });

  return { live, scheduled, completed, hasLiveGames };
};

// Live Game Card - Defined outside component to prevent recreation on re-renders
const LiveGameCard = React.memo(
  ({ game, navigation, theme, colors, fetchRosters }) => {
    // Get stable image sources from cache (cached outside update loop)
    const team1Source = imageCache.get(game.team1Logo) || {
      uri: game.team1Logo,
    };
    const team2Source = imageCache.get(game.team2Logo) || {
      uri: game.team2Logo,
    };
    const sportLogo = getSportLogo(game.sport);

    let halfText = "";
    if (game.period === 1) {
      halfText = "1st Half";
    } else if (game.period === 2) {
      halfText = "2nd Half";
    } else if (game.period > 2) {
      halfText = "Extra Time";
    } else {
      null;
    }

    return (
      <TouchableOpacity
        style={[
          styles.liveGameCard,
          { backgroundColor: theme.surfaceSecondary },
        ]}
        onPress={() => {
          console.log("[BET HOME NAV] LiveGameCard click", {
            gameId: game.id,
            gameSport: game.sport,
          });
          try {
            if (typeof fetchRosters === "function") {
              fetchRosters(game.sport).catch((e) => {
                console.warn("[BetHome] fetchRosters failed on click:", e);
              });
            }
          } catch (e) {}
          navigation.navigate("BetGameDetail", {
            gameId: game.id,
            game,
            sport: game.sport,
          });
        }}
      >
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>

        {/* Tournament Label */}
        <Text
          style={[styles.liveTournamentLabel, { color: theme.textTertiary }]}
          numberOfLines={1}
        >
          {game.tournamentLabel}
        </Text>

        {/* Tournament Name with NBA Logo */}
        <View style={[styles.liveTournamentRow, { marginLeft: -5 }]}>
          <Image
            source={sportLogo}
            style={[
              styles.nbaLogo,
              game.sport === "UEFA" && { tintColor: theme.text },
            ]}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
          <Text
            style={[styles.liveTournamentName, { color: theme.text }]}
            numberOfLines={1}
          >
            {game.tournament}
          </Text>
        </View>

        {/* Game Time/Period */}
        <Text style={[styles.liveGameTime, { color: theme.textSecondary }]}>
          {game.shortDetail && game.sport === "UEFA"
            ? `${game.shortDetail} • ${halfText}`
            : `${game.shortDetail}`}
        </Text>

        {/* Teams and Score */}
        <View style={styles.liveTeamsContainer}>
          <View style={styles.liveTeamRow}>
            <View style={styles.liveTeamInfo}>
              <Image
                source={team1Source}
                style={styles.teamLogo}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <View style={styles.teamNameContainer}>
                <Text
                  style={[styles.liveTeamName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {game.team1}
                </Text>
                {game.team1Record && (
                  <Text
                    style={[styles.teamRecord, { color: theme.textSecondary }]}
                    numberOfLines={1}
                  >
                    {game.team1Record}
                  </Text>
                )}
              </View>
            </View>
            <Text style={[styles.liveScore, { color: theme.text }]}>
              {game.score1}
            </Text>
          </View>

          <View style={styles.liveTeamRow}>
            <View style={styles.liveTeamInfo}>
              <Image
                source={team2Source}
                style={styles.teamLogo}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <View style={styles.teamNameContainer}>
                <Text
                  style={[styles.liveTeamName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {game.team2}
                </Text>
                {game.team2Record && (
                  <Text
                    style={[styles.teamRecord, { color: theme.textSecondary }]}
                    numberOfLines={1}
                  >
                    {game.team2Record}
                  </Text>
                )}
              </View>
            </View>
            <Text style={[styles.liveScore, { color: theme.text }]}>
              {game.score2}
            </Text>
          </View>
        </View>

        {/* Venue */}
        {game.venue && (
          <View style={styles.bettingInfo}>
            <Text
              style={[styles.bettingLine, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {game.venue}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  },
  (prevProps, nextProps) => {
    // Only re-render if game data actually changed
    return (
      prevProps.game.id === nextProps.game.id &&
      prevProps.game.score1 === nextProps.game.score1 &&
      prevProps.game.score2 === nextProps.game.score2 &&
      prevProps.game.time === nextProps.game.time &&
      prevProps.game.period === nextProps.game.period
    );
  },
);

// Scheduled Game Row - Defined outside component
const ScheduledGameRow = React.memo(
  ({ game, navigation, theme, fetchRosters }) => {
    const team1Source = imageCache.get(game.team1Logo) || {
      uri: game.team1Logo,
    };
    const team2Source = imageCache.get(game.team2Logo) || {
      uri: game.team2Logo,
    };

    return (
      <TouchableOpacity
        style={styles.upcomingGameRow}
        onPress={() => {
          console.log("[BET HOME NAV] ScheduledGameRow click", {
            gameId: game.id,
            gameSport: game.sport,
          });
          try {
            if (typeof fetchRosters === "function") {
              fetchRosters(game.sport).catch((e) => {
                console.warn("[BetHome] fetchRosters failed on click:", e);
              });
            }
          } catch (e) {}
          navigation.navigate("BetGameDetail", {
            gameId: game.id,
            game,
            sport: game.sport,
          });
        }}
      >
        {/* Time */}
        <View style={styles.gameTimeContainer}>
          <Text style={[styles.gameTime, { color: theme.textSecondary }]}>
            {game.time}
          </Text>
          <Text style={[styles.gameTimePeriod, { color: theme.textTertiary }]}>
            {game.timePeriod}
          </Text>
        </View>

        {/* Teams */}
        <View style={styles.stackedTeams}>
          <View style={styles.teamWithIcon}>
            <Image
              source={team1Source}
              style={styles.teamLogoSmall}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
            <View style={styles.teamNameRecordContainer}>
              <Text
                style={[styles.stackedTeamName, { color: theme.text }]}
                numberOfLines={1}
              >
                {game.team1}
              </Text>
              {game.team1Record && (
                <Text
                  style={[
                    styles.teamRecordSmall,
                    { color: theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {game.team1Record}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.teamWithIcon}>
            <Image
              source={team2Source}
              style={styles.teamLogoSmall}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
            <View style={styles.teamNameRecordContainer}>
              <Text
                style={[styles.stackedTeamName, { color: theme.text }]}
                numberOfLines={1}
              >
                {game.team2}
              </Text>
              {game.team2Record && (
                <Text
                  style={[
                    styles.teamRecordSmall,
                    { color: theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {game.team2Record}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Short Name and Venue */}
        <View style={styles.upcomingGameInfo}>
          <Text
            style={[styles.gameShortName, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {game.shortName}
          </Text>
          {game.venue && (
            <Text
              style={[styles.gameVenue, { color: theme.textTertiary }]}
              numberOfLines={1}
            >
              {game.venue}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  },
  (prevProps, nextProps) => {
    // Scheduled games don't change, so only re-render if ID changes
    return prevProps.game.id === nextProps.game.id;
  },
);

// Completed Game Card - Defined outside component
const CompletedGameCard = React.memo(
  ({ game, navigation, theme, colors, fetchRosters }) => {
    const team1Source = imageCache.get(game.team1Logo) || {
      uri: game.team1Logo,
    };
    const team2Source = imageCache.get(game.team2Logo) || {
      uri: game.team2Logo,
    };
    const estTime = new Date(game.startTime).toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const sportLogo = getSportLogo(game.sport);

    return (
      <TouchableOpacity
        style={[
          styles.completedGameCard,
          { backgroundColor: theme.surfaceSecondary },
        ]}
        onPress={() => {
          console.log("[BET HOME NAV] CompletedGameCard click", {
            gameId: game.id,
            gameSport: game.sport,
          });
          try {
            if (typeof fetchRosters === "function") {
              fetchRosters(game.sport).catch((e) => {
                console.warn("[BetHome] fetchRosters failed on click:", e);
              });
            }
          } catch (e) {}
          navigation.navigate("BetGameDetail", {
            gameId: game.id,
            game,
            sport: game.sport,
          });
        }}
      >
        <View style={styles.completedHeaderRow}>
          <Image
            source={sportLogo}
            style={[
              styles.nbaLogoTiny,
              { marginTop: -5 },
              game.sport === "UEFA" && { tintColor: theme.text },
            ]}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
          <Text
            style={[
              styles.completedTournamentLabel,
              { color: theme.textTertiary },
            ]}
            numberOfLines={1}
          >
            {game.tournament}
          </Text>
        </View>

        <Text style={[styles.completedStatus, { color: theme.textSecondary }]}>
          Final - {estTime} EST
        </Text>

        <View style={styles.completedTeamsContainer}>
          <View style={styles.completedTeamRow}>
            <View style={styles.completedTeamInfo}>
              <Image
                source={team1Source}
                style={styles.teamLogoTiny}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <View style={styles.completedTeamNameContainer}>
                <Text
                  style={[styles.completedTeamName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {game.team1}
                </Text>
                {game.team1Record && (
                  <Text
                    style={[
                      styles.completedTeamRecord,
                      { color: theme.textTertiary },
                    ]}
                    numberOfLines={1}
                  >
                    {game.team1Record}
                  </Text>
                )}
              </View>
            </View>
            <Text
              style={[
                styles.completedScore,
                {
                  color:
                    parseInt(game.score1) > parseInt(game.score2)
                      ? colors.primary
                      : theme.textSecondary,
                  fontWeight: parseInt(game.score1) > parseInt(game.score2) ? "bold" : "normal",
                },
              ]}
            >
              {game.score1}
            </Text>
          </View>

          <View style={styles.completedTeamRow}>
            <View style={styles.completedTeamInfo}>
              <Image
                source={team2Source}
                style={styles.teamLogoTiny}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <View style={styles.completedTeamNameContainer}>
                <Text
                  style={[styles.completedTeamName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {game.team2}
                </Text>
                {game.team2Record && (
                  <Text
                    style={[
                      styles.completedTeamRecord,
                      { color: theme.textTertiary },
                    ]}
                    numberOfLines={1}
                  >
                    {game.team2Record}
                  </Text>
                )}
              </View>
            </View>
            <Text
              style={[
                styles.completedScore,
                {
                  color:
                    parseInt(game.score2) > parseInt(game.score1)
                      ? colors.primary
                      : theme.textSecondary,
                  fontWeight: parseInt(game.score2) > parseInt(game.score1) ? "bold" : "normal",
                },
              ]}
            >
              {game.score2}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.game.id === nextProps.game.id;
  },
);

const BetHomeScreen = ({ navigation }) => {
  const { colors, theme, isDarkMode } = useTheme();
  const { sport } = useSport();
  const { scoreboardData, fetchScoreboard, fetchRosters, getRosters } =
    useBetData();
  const { isPro, setIsSlipOpen } = useBetSlip();

  // Get sport-specific data
  const currentScoreboardData = scoreboardData[sport];
  const focusPollRef = useRef(null);
  const [refreshing, setRefreshing] = useState(false);
  const [liveGames, setLiveGames] = useState([]);
  const [scheduledGames, setScheduledGames] = useState([]);
  const [completedGames, setCompletedGames] = useState([]);
  const [hasLiveGames, setHasLiveGames] = useState(false);
  const [dailyVisible, setDailyVisible] = useState(false);
  const [dailyState, setDailyState] = useState(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [profileIdForDaily, setProfileIdForDaily] = useState(null);
  const [dailyCountdownLabel, setDailyCountdownLabel] = useState("");

  // Update countdown label while daily modal is visible
  useEffect(() => {
    let timer = null;
    function computeLabel(state) {
      try {
        if (!state) return "No reward available yet";
        if (state.canClaim) return "Available";
        const next = state.nextAvailableAt
          ? new Date(state.nextAvailableAt)
          : null;
        if (next) {
          const diff = next.getTime() - Date.now();
          if (diff <= 0) return "Available";
          const days = Math.floor(diff / (24 * 60 * 60 * 1000));
          const hours = Math.floor(
            (diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000),
          );
          const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
          const secs = Math.floor((diff % (60 * 1000)) / 1000);
          return `Available in ${hours}H ${mins}M ${secs}S`;
        }
        return state.availableDay ? "" : "No reward available yet";
      } catch (e) {
        return state && state.availableDay ? "" : "No reward available yet";
      }
    }

    if (dailyVisible) {
      setDailyCountdownLabel(computeLabel(dailyState));
      timer = setInterval(() => {
        setDailyCountdownLabel(computeLabel(dailyState));
      }, 1000);
    } else {
      setDailyCountdownLabel("");
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [dailyVisible, dailyState]);

  // (removed automatic clearing here — handled by screens that open the betslip)

  // Pre-cache images when scoreboard data arrives - only cache new logos
  useEffect(() => {
    if (currentScoreboardData) {
      const darkSuffix = isDarkMode ? "-dark" : "";
      // Handle both array and object with events property
      const eventsArray = Array.isArray(currentScoreboardData)
        ? currentScoreboardData
        : currentScoreboardData?.events;

      if (eventsArray && Array.isArray(eventsArray)) {
        const sportPath = getSportPath(sport);
        eventsArray.forEach((event) => {
          const competition = event.competitions?.[0];
          if (!competition) return;

          const competitors = competition.competitors || [];
          competitors.forEach((competitor) => {
            const abbr = competitor.team?.abbreviation?.toLowerCase();
            if (abbr) {
              const logoUrl = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500${darkSuffix}/${abbr}.png&h=200&w=200`;
              if (!imageCache.has(logoUrl)) {
                imageCache.set(logoUrl, { uri: logoUrl });
              }
            }
          });
        });
      }
    }
  }, [currentScoreboardData, isDarkMode, sport]); // Run when data, theme, or sport changes

  // Clear games when sport changes
  useEffect(() => {
    console.log(`[BetHome] Sport changed to ${sport}, clearing games`);
    setLiveGames([]);
    setScheduledGames([]);
    setCompletedGames([]);
    setHasLiveGames(false);
  }, [sport]);

  // Update games when scoreboard data changes
  useEffect(() => {
    if (currentScoreboardData) {
      // Handle both array and object with events property
      const eventsArray = Array.isArray(currentScoreboardData)
        ? currentScoreboardData
        : currentScoreboardData?.events;

      if (eventsArray && Array.isArray(eventsArray)) {
        // Log raw game details from API
        eventsArray.forEach((event, idx) => {
          const detail = event.status?.type?.detail || "No detail";
          const teams = `${
            event.competitions?.[0]?.competitors?.[1]?.team?.abbreviation || "?"
          } @ ${
            event.competitions?.[0]?.competitors?.[0]?.team?.abbreviation || "?"
          }`;
        });

        const {
          live,
          scheduled,
          completed,
          hasLiveGames: hasLive,
        } = parseGameData(eventsArray, isDarkMode, sport);

        // Merge with previous games to maintain object identity
        setLiveGames((prev) => mergeGames(prev, live));
        setScheduledGames((prev) => mergeGames(prev, scheduled));
        setCompletedGames((prev) => mergeGames(prev, completed));
        setHasLiveGames(hasLive);
      }
    }
  }, [scoreboardData, sport, isDarkMode]);

  // Fetch data when sport changes
  useEffect(() => {
    // Only fetch if we don't have data for this sport
    if (!currentScoreboardData) {
      fetchScoreboard(sport).catch((e) => {
        console.error(`[BetHome] Failed to fetch ${sport} scoreboard:`, e);
      });
    }
  }, [sport]);

  // Fetch rosters when sport changes (only if not already fetched)
  useEffect(() => {
    const currentRosters = getRosters(sport);
    if (!currentRosters) {
      console.log(`[BetHome ${sport}] Fetching rosters for first time`);
      fetchRosters(sport).catch((e) => {
        console.error(`[BetHome] Failed to fetch ${sport} rosters:`, e);
      });
    } else {
      console.log(`[BetHome ${sport}] Rosters already available, not fetching`);
    }
  }, [sport]);

  // Focused-local polling: while the Home screen is focused we ensure
  // the scoreboard link updates at 2s when live games exist and 90s when
  // games are scheduled. This supplements the global BetDataProvider polling
  // and guarantees UI responsiveness while the user is on the Home screen.
  useFocusEffect(
    React.useCallback(() => {
      // Immediate fetch on focus
      let mounted = true;
      (async () => {
        try {
          await fetchScoreboard(sport);
        } catch (e) {
          /* ignore */
        }
      })();

      // Start interval according to current state
      const startFocusedPolling = () => {
        // clear any existing
        if (focusPollRef.current) {
          clearInterval(focusPollRef.current.id);
          focusPollRef.current = null;
        }

        const mode = hasLiveGames
          ? "fast"
          : scheduledGames.length
            ? "moderate"
            : "slow";
        const intervalMs =
          mode === "fast" ? 2000 : mode === "moderate" ? 90000 : 30 * 60 * 1000;

        const id = setInterval(() => {
          fetchScoreboard(sport).catch(() => {});
        }, intervalMs);
        focusPollRef.current = { id, intervalMs };
      };

      // start immediately
      startFocusedPolling();

      // Also watch for changes to live/scheduled state while focused
      const visibilityInterval = setInterval(() => {
        // if mode changed, restart focused polling
        const mode = hasLiveGames
          ? "fast"
          : scheduledGames.length
            ? "moderate"
            : "slow";
        const desiredInterval =
          mode === "fast" ? 2000 : mode === "moderate" ? 90000 : 30 * 60 * 1000;
        const currentInterval = focusPollRef.current?.intervalMs || null;
        if (!focusPollRef.current || currentInterval !== desiredInterval) {
          startFocusedPolling();
        }
      }, 2000);

      return () => {
        mounted = false;
        if (focusPollRef.current) {
          try {
            clearInterval(focusPollRef.current.id);
          } catch (e) {
            // fallback: if ref was a raw id for any reason
            try {
              clearInterval(focusPollRef.current);
            } catch (e2) {
              /* ignore */
            }
          }
          focusPollRef.current = null;
        }
        clearInterval(visibilityInterval);
      };
    }, [hasLiveGames, scheduledGames.length, sport]),
  );

  // Load daily reward state on focus and show modal if claimable or progress exists
  useFocusEffect(
    React.useCallback(() => {
      let mounted = true;
      (async () => {
        try {
          const profileRes = await getUserProfile();
          if (
            profileRes &&
            profileRes.success &&
            profileRes.profile &&
            profileRes.profile.id
          ) {
            const pid = profileRes.profile.id;
            setProfileIdForDaily(pid);
            const dr = await getDailyRewardState(pid);
            if (mounted && dr && dr.success) {
              const claimedArr = Array.isArray(dr.claimedDays)
                ? dr.claimedDays
                : [];
              const hasProgress = claimedArr.some(Boolean);
              const avail = dr.availableDay || null;
              const computedCan = avail && !claimedArr[avail - 1];
              // Prefer server `canClaim` but allow computed availability to override an inconsistent false
              const finalCanClaim =
                typeof dr.canClaim !== "undefined"
                  ? dr.canClaim || computedCan
                  : computedCan;

              // Only show modal if user can claim now, or if there is progress AND the nextAvailableAt has passed (so they can continue the cycle)
              const now = new Date();
              const nextAvailable = dr.nextAvailableAt
                ? new Date(dr.nextAvailableAt)
                : null;
              const showBecauseProgress =
                hasProgress && (!nextAvailable || now >= nextAvailable);

              if (finalCanClaim || showBecauseProgress) {
                setDailyState({ ...(dr || {}), canClaim: finalCanClaim });
                setDailyVisible(true);
              }
            }
          }
        } catch (e) {
          // ignore
        }
      })();

      return () => {
        mounted = false;
      };
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchScoreboard(sport);
    setRefreshing(false);
  };

  // Group games by tournament
  const groupGamesByTournament = (games) => {
    const grouped = {};
    games.forEach((game) => {
      const tournamentKey = game.tournament;
      if (!grouped[tournamentKey]) {
        grouped[tournamentKey] = {
          tournament: game.tournament,
          tournamentLabel: game.tournamentLabel,
          games: [],
        };
      }
      grouped[tournamentKey].games.push(game);
    });

    // Sort games within each tournament by time
    Object.values(grouped).forEach((group) => {
      group.games.sort((a, b) => {
        // Prefer comparing the original ISO start times when available
        if (a.startTime && b.startTime) {
          const ta = new Date(a.startTime).getTime();
          const tb = new Date(b.startTime).getTime();
          return ta - tb;
        }

        // Fallback to comparing the formatted time strings
        if (a.time && b.time) {
          return a.time.localeCompare(b.time);
        }
        return 0;
      });
    });

    return Object.values(grouped);
  };

  const UpcomingGamesSection = ({ games, fetchRosters }) => {
    const groupedTournaments = groupGamesByTournament(games);
    const sportLogo = getSportLogo(sport);

    return (
      <View style={styles.upcomingContainer}>
        {groupedTournaments.map((group) => (
          <View
            key={group.tournament}
            style={[
              styles.tournamentContainer,
              { backgroundColor: theme.surfaceSecondary },
            ]}
          >
            {/* Tournament Header */}
            <View style={styles.tournamentHeader}>
              <View style={styles.tournamentIconContainer}>
                <Image
                  source={sportLogo}
                  style={[
                    styles.nbaLogoSmall,
                    sport === "UEFA" && { tintColor: theme.text },
                  ]}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              </View>

              <View style={styles.tournamentInfo}>
                <Text
                  style={[styles.tournamentName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {group.tournament}
                </Text>
                <Text
                  style={[
                    styles.tournamentLabel,
                    { color: theme.textTertiary },
                  ]}
                  numberOfLines={1}
                >
                  {group.tournamentLabel}
                </Text>
              </View>
            </View>

            {/* Games in this tournament */}
            <View style={styles.gamesList}>
              {group.games.map((game, index) => (
                <View key={game.id}>
                  <ScheduledGameRow
                    game={game}
                    navigation={navigation}
                    theme={theme}
                    fetchRosters={fetchRosters}
                  />

                  {index < group.games.length - 1 && (
                    <View
                      style={[
                        styles.gameSeparator,
                        { backgroundColor: theme.border },
                      ]}
                    />
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Modal
        visible={dailyVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setDailyVisible(false)}
      >
        <View
          style={[
            styles.modalOverlay,
            { justifyContent: "center", alignItems: "center" },
          ]}
        >
          <View
            style={[
              styles.modalContent,
              {
                maxWidth: 640,
                backgroundColor: theme.background,
                borderColor: theme.border,
              },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 12,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
              }}
            >
              <Text style={{ color: theme.text, fontWeight: "700" }}>
                Daily Login Reward
              </Text>
              <TouchableOpacity
                onPress={async () => {
                  try {
                    if (profileIdForDaily)
                      await dismissDailyReward(profileIdForDaily);
                  } catch (e) {}
                  setDailyVisible(false);
                }}
              >
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ padding: 18, alignItems: "center" }}>
              <Text
                style={{ color: theme.text, fontSize: 16, marginBottom: 8 }}
              >
                Claim your daily credits
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "center",
                  marginVertical: 12,
                  flexWrap: "wrap",
                }}
              >
                {(dailyState && dailyState.claimedDays
                  ? dailyState.claimedDays
                  : new Array(7).fill(false)
                ).map((claimed, i) => (
                  <View
                    key={i}
                    style={{
                      width: 72,
                      height: 72,
                      margin: 8,
                      borderRadius: 12,
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.border,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: theme.text,
                        fontWeight: "700",
                        fontSize: 18,
                      }}
                    >
                      {i + 1}
                    </Text>
                    <Text
                      style={{
                        color: theme.textSecondary,
                        fontSize: 12,
                        marginTop: 6,
                      }}
                    >
                      {i < 6
                        ? isPro
                          ? "750.00 C"
                          : "250.00 C"
                        : isPro
                          ? "1,500.00 C"
                          : "1,000.00 C"}
                    </Text>
                    {claimed ? (
                      <View
                        style={{
                          position: "absolute",
                          right: -6,
                          top: -6,
                          backgroundColor: "#28a745",
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>

              <Text
                style={{
                  color: theme.textSecondary,
                  textAlign: "center",
                  marginBottom: 18,
                }}
              >
                {dailyCountdownLabel ||
                  (dailyState && dailyState.availableDay
                    ? ""
                    : "No reward available yet")}
              </Text>

              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TouchableOpacity
                  disabled={
                    !(dailyState && dailyState.canClaim) || dailyLoading
                  }
                  onPress={async () => {
                    console.log("BetHome: Claim button pressed", {
                      time: new Date().toISOString(),
                      profileIdForDaily,
                      dailyState,
                    });
                    if (!profileIdForDaily) return;
                    setDailyLoading(true);
                    console.log("BetHome: isPro from context", { isPro });
                    const res = await claimDailyReward(profileIdForDaily);
                    console.log("BetHome: claimDailyReward response", res);
                    setDailyLoading(false);
                    try {
                      const sup = res?.supabaseUpdate;
                      const supMsg = sup
                        ? `${
                            sup.success
                              ? "Supabase write: OK"
                              : "Supabase write: FAILED"
                          }${
                            sup.error
                              ? `\nError: ${
                                  sup.error.message || JSON.stringify(sup.error)
                                }`
                              : ""
                          }`
                        : "Supabase write: n/a";
                    } catch (e) {
                      console.warn("BetHome: failed to show claim alert", e);
                    }
                    if (res && res.success) {
                      const dr = await getDailyRewardState(profileIdForDaily);
                      console.log(
                        "BetHome: refreshed daily state after claim",
                        dr,
                      );
                      setDailyState(dr);
                      Alert.alert(
                        "Success",
                        `You've received ${res.reward} credits.`,
                      );
                      // Close modal after 3 seconds
                      setTimeout(() => {
                        setDailyVisible(false);
                      }, 1000);
                    } else {
                      console.log("BetHome: claim failed", res);
                      Alert.alert(
                        "Unable to claim",
                        res?.error || "Claim failed",
                      );
                    }
                  }}
                  style={[
                    styles.dailyPrimaryButton,
                    {
                      marginRight: 12,
                      opacity: dailyState && dailyState.canClaim ? 1 : 0.6,
                      backgroundColor: colors.primary,
                    },
                  ]}
                >
                  {dailyLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.dailyPrimaryText}>
                      {dailyState && dailyState.canClaim
                        ? "Claim"
                        : "Unavailable"}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={async () => {
                    try {
                      if (profileIdForDaily)
                        await dismissDailyReward(profileIdForDaily);
                    } catch (e) {}
                    setDailyVisible(false);
                  }}
                  style={styles.dailySecondaryButton}
                >
                  <Text
                    style={[
                      styles.dailySecondaryText,
                      { color: colors.primary },
                    ]}
                  >
                    Close
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Live Games */}
        {liveGames.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                ● Live Games
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalScroll}
              contentContainerStyle={{ paddingRight: 20 }}
            >
              {liveGames
                .slice()
                .reverse()
                .map((game) => (
                  <LiveGameCard
                    key={game.id}
                    game={game}
                    navigation={navigation}
                    theme={theme}
                    colors={colors}
                    fetchRosters={fetchRosters}
                  />
                ))}
            </ScrollView>
          </View>
        )}

        {/* Upcoming Games */}
        {scheduledGames.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Upcoming Games
              </Text>
            </View>

            <UpcomingGamesSection
              games={scheduledGames}
              sport={sport}
              navigation={navigation}
              theme={theme}
              fetchRosters={fetchRosters}
            />
          </View>
        )}

        {/* Completed Games */}
        {completedGames.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Completed Games
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalScroll}
              contentContainerStyle={{ paddingRight: 20 }}
            >
              {completedGames
                .slice()
                .reverse()
                .map((game) => (
                  <CompletedGameCard
                    key={game.id}
                    game={game}
                    navigation={navigation}
                    theme={theme}
                    colors={colors}
                    fetchRosters={fetchRosters}
                  />
                ))}
            </ScrollView>
          </View>
        )}

        {/* No Games Message */}
        {liveGames.length === 0 &&
          scheduledGames.length === 0 &&
          completedGames.length === 0 && (
            <View style={styles.noGamesContainer}>
              <FontAwesome6
                name={getSportIcon(sport)}
                size={64}
                color={colors.accent}
              />
              <Text
                style={[styles.noGamesText, { color: theme.textSecondary }]}
              >
                No games available
              </Text>
              <Text
                style={[styles.noGamesSubtext, { color: theme.textTertiary }]}
              >
                Pull to refresh
              </Text>
            </View>
          )}

        <View style={styles.bottomPadding} />
      </ScrollView>
      {!isPro && <BannerAdWrapper />}
      <BetSlip
        scoreboardGames={[...liveGames, ...scheduledGames, ...completedGames]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    marginBottom: 24,
    marginTop: 16,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  horizontalScroll: {
    paddingLeft: 16,
  },

  // Live Game Card Styles
  liveGameCard: {
    width: 280,
    padding: 16,
    borderRadius: 12,
    marginRight: 12,
    minHeight: 180,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ff4444",
    marginRight: 6,
  },
  liveText: {
    color: "#ff4444",
    fontSize: 12,
    fontWeight: "bold",
  },
  liveTournamentLabel: {
    fontSize: 10,
    fontWeight: "500",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  liveTournamentRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  nbaLogo: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  liveTournamentName: {
    fontSize: 14,
    fontWeight: "600",
  },
  liveGameTime: {
    fontSize: 12,
    marginBottom: 12,
  },
  liveTeamsContainer: {
    marginBottom: 12,
  },
  liveTeamRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  liveTeamInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  teamLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  teamNameContainer: {
    flex: 1,
  },
  liveTeamName: {
    fontSize: 14,
    fontWeight: "500",
  },
  teamRecord: {
    fontSize: 11,
    marginTop: 2,
  },
  trophyIcon: {
    marginRight: 8,
  },
  liveTeamName: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  liveScore: {
    fontSize: 20,
    fontWeight: "bold",
    marginLeft: 8,
  },
  bettingInfo: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  bettingLine: {
    fontSize: 12,
    fontWeight: "500",
  },

  // Upcoming Games Styles
  upcomingContainer: {
    paddingHorizontal: 16,
  },
  tournamentContainer: {
    borderRadius: 12,
    marginBottom: 16,
    overflow: "hidden",
  },
  tournamentHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  tournamentIconContainer: {
    marginRight: 12,
  },
  nbaLogoSmall: {
    width: 40,
    height: 40,
  },
  tournamentInfo: {
    flex: 1,
  },
  tournamentName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  tournamentLabel: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
  },
  gamesList: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  upcomingGameRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  gameTimeContainer: {
    width: 60,
    marginRight: 12,
  },
  gameTime: {
    fontSize: 12,
    fontWeight: "600",
  },
  gameTimePeriod: {
    fontSize: 10,
    marginTop: 2,
  },
  stackedTeams: {
    flex: 1,
  },
  teamWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  teamLogoSmall: {
    width: 30,
    height: 30,
    marginRight: 6,
  },
  teamNameRecordContainer: {
    flex: 1,
  },
  stackedTeamName: {
    fontSize: 14,
    fontWeight: "500",
  },
  teamRecordSmall: {
    fontSize: 10,
    marginTop: 2,
  },
  upcomingGameInfo: {
    alignItems: "flex-end",
    marginLeft: 8,
    maxWidth: 120,
  },
  gameShortName: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "right",
  },
  gameVenue: {
    fontSize: 9,
    marginTop: 2,
    textAlign: "right",
  },
  gameSeparator: {
    height: 1,
    marginHorizontal: 16,
    opacity: 0.3,
  },

  // Completed Games Styles
  completedGameCard: {
    width: 200,
    padding: 12,
    borderRadius: 8,
    marginRight: 12,
    minHeight: 130,
  },
  completedHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  nbaLogoTiny: {
    width: 16,
    height: 16,
    marginRight: 6,
  },
  completedTournamentLabel: {
    fontSize: 10,
    fontWeight: "500",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  completedStatus: {
    fontSize: 11,
    marginBottom: 8,
  },
  completedTeamsContainer: {
    marginTop: "auto",
  },
  completedTeamRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  completedTeamInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  teamLogoTiny: {
    width: 18,
    height: 18,
    marginRight: 6,
  },
  completedTeamNameContainer: {
    flex: 1,
  },
  completedTeamName: {
    fontSize: 12,
    fontWeight: "500",
  },
  completedTeamRecord: {
    fontSize: 9,
    marginTop: 2,
  },
  completedScore: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },

  // No Games
  noGamesContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  noGamesText: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
  },
  noGamesSubtext: {
    fontSize: 14,
    marginTop: 8,
  },

  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modalContent: {
    width: "100%",
    maxWidth: 720,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    paddingBottom: 16,
    backgroundColor: "#111",
  },
  dailyPrimaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: "#c62828",
    alignItems: "center",
    justifyContent: "center",
  },
  dailyPrimaryText: {
    color: "#fff",
    fontWeight: "700",
  },
  dailySecondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  dailySecondaryText: {
    color: "#c62828",
    fontWeight: "700",
  },

  bottomPadding: {
    height: 32,
  },
});

export default BetHomeScreen;

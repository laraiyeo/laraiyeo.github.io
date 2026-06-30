import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  FlatList,
  RefreshControl,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../../../context/ThemeContext";
import { useFocusEffect } from "@react-navigation/native";
import { useFavorites } from "../../../context/FavoritesContext";
import { LiveViewerBadge } from "../../../components/ViewerCounter";
import { FIFAWorldServiceEnhanced } from "../../../services/soccer/FIFAWorldServiceEnhanced";
import { FIFACompetitionState } from "../../../services/soccer/FIFACompetitionState";

const { width } = Dimensions.get("window");

// FIFA World Competitions data
const FIFA_COMPETITIONS = [
  { id: "fifa.world", name: "FIFA World Cup", logo: "4" },
  { id: "fifa.worldq.uefa", name: "UEFA Qualifiers", logo: "67" },
  { id: "fifa.worldq.afc", name: "AFC Qualifiers", logo: "62" },
  { id: "fifa.worldq.concacaf", name: "CONCACAF Qualifiers", logo: "64" },
  { id: "fifa.worldq.caf", name: "CAF Qualifiers", logo: "63" },
  { id: "fifa.worldq.conmebol", name: "CONMEBOL Qualifiers", logo: "65" },
  { id: "fifa.worldq.ofc", name: "OFC Qualifiers", logo: "66" },
];

// Logo cache to prevent re-fetching
const logoCache = new Map();

// Memoized Logo component with error handling and caching
const LogoWithFallback = React.memo(
  ({ logoId, name, style, isDarkMode, theme }) => {
    // Create a stable cache key
    const cacheKey = `${logoId}-${isDarkMode}`;

    // Initialize state with cached values if available
    const [imageError, setImageError] = useState(() => {
      const cached = logoCache.get(cacheKey);
      return cached?.imageError || false;
    });
    const [fallbackError, setFallbackError] = useState(() => {
      const cached = logoCache.get(cacheKey);
      return cached?.fallbackError || false;
    });

    // Memoize URLs to prevent recalculation
    const urls = React.useMemo(() => {
      const primaryUrl = `https://a.espncdn.com/combiner/i?img=/i/leaguelogos/soccer/${
        isDarkMode ? "500-dark" : "500"
      }/${logoId}.png&w=200&h=200`;
      const fallbackUrl = `https://a.espncdn.com/combiner/i?img=/i/leaguelogos/soccer/${
        isDarkMode ? "500" : "500-dark"
      }/${logoId}.png&w=200&h=200`;
      return { primaryUrl, fallbackUrl };
    }, [logoId, isDarkMode]);

    // Update cache when error states change
    React.useEffect(() => {
      logoCache.set(cacheKey, { imageError, fallbackError });
    }, [cacheKey, imageError, fallbackError]);

    if (imageError && fallbackError) {
      // Show text fallback
      return (
        <View
          style={[style, { alignItems: "center", justifyContent: "center" }]}
        >
          <Text
            allowFontScaling={false}
            style={{
              fontSize: 8,
              textAlign: "center",
              fontWeight: "500",
              color: theme.text,
              lineHeight: 10,
            }}
          >
            {name.split(" ").map((word, index) => (
              <Text allowFontScaling={false} key={index}>
                {word}
                {"\n"}
              </Text>
            ))}
          </Text>
        </View>
      );
    }

    return (
      <Image
        source={{ uri: imageError ? urls.fallbackUrl : urls.primaryUrl }}
        style={style}
        resizeMode="contain"
        onError={() => {
          if (!imageError) {
            setImageError(true);
          } else {
            setFallbackError(true);
          }
        }}
      />
    );
  },
);

// Memoized Competition Button Component
const CompetitionButton = React.memo(
  ({ competition, isSelected, onPress, colors, theme, isDarkMode }) => (
    <TouchableOpacity
      style={[
        styles.competitionButton,
        {
          backgroundColor: isSelected ? colors.primary : theme.surface,
          borderColor: isSelected ? colors.primary : theme.border,
        },
      ]}
      onPress={() => onPress(competition.id)}
    >
      <LogoWithFallback
        logoId={competition.logo}
        name={competition.name}
        style={styles.competitionLogo}
        isDarkMode={isDarkMode}
        theme={theme}
      />
      <Text
        allowFontScaling={false}
        style={[
          styles.competitionButtonText,
          {
            color: isSelected ? "#fff" : theme.text,
          },
        ]}
        numberOfLines={2}
      >
        {competition.name}
      </Text>
    </TouchableOpacity>
  ),
);

// Team Logo component with error handling
const TeamLogoImage = React.memo(({ teamId, style }) => {
  const { isDarkMode, theme } = useTheme();
  const [logoSource, setLogoSource] = useState(() => {
    if (teamId) {
      const logos = getTeamLogo(teamId, isDarkMode);
      return { uri: logos.primaryUrl };
    } else {
      return require("../../../../assets/soccer.png");
    }
  });
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const newLogos = teamId ? getTeamLogo(teamId, isDarkMode) : null;
    const newSource = teamId
      ? { uri: newLogos.primaryUrl }
      : require("../../../../assets/soccer.png");

    const currentUri = logoSource?.uri;
    const newUri = newSource?.uri;

    if (currentUri !== newUri) {
      setLogoSource(newSource);
      setRetryCount(0);
    }
  }, [teamId, isDarkMode]);

  const handleError = () => {
    if (retryCount === 0) {
      const logos = getTeamLogo(teamId, isDarkMode);
      setLogoSource({ uri: logos.fallbackUrl });
      setRetryCount(1);
    } else {
      setLogoSource(require("../../../../assets/soccer.png"));
    }
  };

  return (
    <Image
      style={style}
      source={logoSource}
      onError={handleError}
      resizeMode="contain"
    />
  );
});

// Enhanced logo function with dark mode support and fallbacks
const getTeamLogo = (teamId, isDarkMode) => {
  const primaryUrl = isDarkMode
    ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500-dark/${teamId}.png&w=200&h=200`
    : `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/${teamId}.png&w=200&h=200`;

  const fallbackUrl = isDarkMode
    ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/${teamId}.png&w=200&h=200`
    : `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500-dark/${teamId}.png&w=200&h=200`;

  return { primaryUrl, fallbackUrl };
};

const FIFAWorldScoreboardScreen = ({ navigation, route }) => {
  const { theme, colors, isDarkMode } = useTheme();
  const { isFavorite } = useFavorites();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDateFilter, setSelectedDateFilter] = useState("today");
  const [selectedCompetition, setSelectedCompetition] = useState("fifa.world");
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  const [updateInterval, setUpdateInterval] = useState(null);
  const [lastUpdateHash, setLastUpdateHash] = useState("");

  // Cache for each date filter per competition
  const [gameCache, setGameCache] = useState({});

  // Cache timestamps to know when to refresh
  const [cacheTimestamps, setCacheTimestamps] = useState({});

  // Track if preloading has been done to prevent multiple calls
  const hasPreloadedRef = useRef(false);

  // Cache key helper combining competition + filter
  const getCacheKey = (comp, filter) => `${comp}:${filter}`;

  // Cache duration: 5 seconds for today/tomorrow (live/upcoming), 50 seconds for others
  const getCacheDuration = (filter) => {
    return filter === "today" || filter === "tomorrow" ? 5000 : 50000;
  };

  const getNoGamesMessage = (dateFilter) => {
    switch (dateFilter) {
      case "yesterday":
        return "No matches played yesterday";
      case "today":
        return "No matches scheduled today";
      case "tomorrow":
        return "No matches scheduled tomorrow";
      default:
        return "No matches scheduled";
    }
  };

  // Initialize with current shared state on mount
  useEffect(() => {
    const currentCompetition = FIFACompetitionState.getCurrentCompetition();
    console.log(
      "FIFAWorldScoreboardScreen: Initializing with shared state:",
      currentCompetition,
    );
    setSelectedCompetition(currentCompetition);
  }, []);

  // Subscribe to competition changes from other screens
  useEffect(() => {
    const unsubscribe = FIFACompetitionState.subscribe((newCompetition) => {
      console.log(
        "FIFAWorldScoreboardScreen: Received competition change:",
        newCompetition,
      );
      setSelectedCompetition(newCompetition);
    });

    return unsubscribe;
  }, []);

  // Track screen focus to pause/resume updates
  useFocusEffect(
    React.useCallback(() => {
      console.log("FIFAWorldScoreboardScreen: Screen focused");
      setIsScreenFocused(true);

      return () => {
        console.log("FIFAWorldScoreboardScreen: Screen unfocused, clearing intervals");
        setIsScreenFocused(false);
        // Clear any existing interval when screen loses focus
        setUpdateInterval((prevInterval) => {
          if (prevInterval) clearInterval(prevInterval);
          return null;
        });
      };
    }, []),
  );

  useEffect(() => {
    console.log(
      "FIFAWorldScoreboardScreen: Main useEffect triggered for competition:",
      selectedCompetition,
      "filter:",
      selectedDateFilter,
      "focused:",
      isScreenFocused,
    );
    // Load the current filter first
    loadScoreboard();

    // Set up continuous fetching for 'today' and 'tomorrow' - only if screen is focused
    if (
      (selectedDateFilter === "today" || selectedDateFilter === "tomorrow") &&
      isScreenFocused
    ) {
      const interval = setInterval(() => {
        loadScoreboard(true, selectedDateFilter, selectedCompetition);
      }, 5000);

      setUpdateInterval(interval);

      return () => {
        clearInterval(interval);
      };
    } else {
      // Clear interval for non-live filters or when screen is not focused
      if (updateInterval) {
        clearInterval(updateInterval);
        setUpdateInterval(null);
      }
    }
  }, [selectedDateFilter, selectedCompetition, isScreenFocused]);

  // Separate effect for initial preloading - only runs once on mount
  useEffect(() => {
    console.log(
      "FIFAWorldScoreboardScreen: Preload useEffect triggered, hasPreloaded:",
      hasPreloadedRef.current,
    );
    if (hasPreloadedRef.current) {
      console.log("FIFAWorldScoreboardScreen: Skipping preload, already done");
      return;
    }

    hasPreloadedRef.current = true;
    console.log("FIFAWorldScoreboardScreen: Starting preload for other filters");

    // Preload the other filters in the background after initial load
    const preloadTimer = setTimeout(() => {
      if (selectedDateFilter !== "yesterday") {
        console.log("FIFAWorldScoreboardScreen: Preloading yesterday data");
        loadScoreboard(true, "yesterday", selectedCompetition);
      }
      if (selectedDateFilter !== "tomorrow") {
        console.log("FIFAWorldScoreboardScreen: Preloading tomorrow data");
        loadScoreboard(true, "tomorrow", selectedCompetition);
      }
    }, 1000);

    return () => clearTimeout(preloadTimer);
  }, []);

  const loadScoreboard = async (
    silentUpdate = false,
    dateFilter = selectedDateFilter,
    competition = selectedCompetition,
  ) => {
    console.log(
      "FIFAWorldScoreboardScreen: loadScoreboard called - silentUpdate:",
      silentUpdate,
      "dateFilter:",
      dateFilter,
      "competition:",
      competition,
    );
    const now = Date.now();
    const cacheKey = getCacheKey(competition, dateFilter);
    const cachedData = gameCache[cacheKey];
    const cacheTime = cacheTimestamps[cacheKey] || 0;
    const cacheDuration = getCacheDuration(dateFilter);
    const isCacheValid = cachedData && now - cacheTime < cacheDuration;

    // If we have valid cached data, show it immediately
    if (isCacheValid && !silentUpdate) {
      console.log("FIFAWorldScoreboardScreen: Using cached data for", cacheKey);
      setGames(cachedData);
      setLoading(false);
      return;
    }

    try {
      if (!silentUpdate) {
        setLoading(true);
      }

      console.log(
        "FIFAWorldScoreboardScreen: Fetching fresh data for",
        competition,
        dateFilter,
      );

      // Use the FIFA World Cup service
      const data = await FIFAWorldServiceEnhanced.getScoreboard(
        dateFilter,
        competition,
      );

      // Process games with enhanced data
      const processedGames = await Promise.all(
        (data.events || []).map(async (game) => {
          return {
            ...game,
            competitionCode: game.competitionCode || competition,
            competitionName: game.competitionName || "FIFA Competition",
          };
        }),
      );

      // Stable enhanced sorting: group by day, then by status priority (live/pre/post),
      // then by scheduled start time to keep order stable while live clocks update.
      const sortedGames = processedGames
        .map((g, idx) => ({ g, idx }))
        .sort((x, y) => {
          const a = x.g,
            b = y.g;

          // First sort by date (day)
          const aDate = new Date(a.date).toDateString();
          const bDate = new Date(b.date).toDateString();
          if (aDate !== bDate) {
            return new Date(aDate) - new Date(bDate);
          }

          // Then by game status priority: live > pre > post
          const aStatus = a.status?.type?.state || "unknown";
          const bStatus = b.status?.type?.state || "unknown";
          const statusPriority = { in: 0, pre: 1, post: 2, unknown: 3 };
          const aPriority = statusPriority[aStatus] ?? 3;
          const bPriority = statusPriority[bStatus] ?? 3;
          if (aPriority !== bPriority) {
            return aPriority - bPriority;
          }

          // Finally by scheduled start time, then by original index for stability
          const aTime = new Date(a.date).getTime();
          const bTime = new Date(b.date).getTime();
          return aTime !== bTime ? aTime - bTime : x.idx - y.idx;
        })
        .map((x) => x.g);

      // Create hash for change detection
      const currentHash = JSON.stringify(
        sortedGames.map((g) => ({
          id: g.id,
          status: g.status?.type?.state,
          awayScore: g.competitions[0]?.competitors[1]?.score,
          homeScore: g.competitions[0]?.competitors[0]?.score,
          clock: g.status?.displayClock,
        }))
      );

      // Update cache
      setGameCache((prev) => ({
        ...prev,
        [cacheKey]: sortedGames,
      }));
      setCacheTimestamps((prev) => ({
        ...prev,
        [cacheKey]: now,
      }));

      // Only update state if this is the currently selected filter + competition
      if (
        dateFilter === selectedDateFilter &&
        competition === selectedCompetition
      ) {
        setGames(sortedGames);

        // Check if there were actual changes
        if (currentHash !== lastUpdateHash) {
          setLastUpdateHash(currentHash);
          console.log(
            "FIFAWorldScoreboardScreen: Data updated for",
            cacheKey,
          );
        }
      }

      setLoading(false);
    } catch (error) {
      console.error(
        "FIFAWorldScoreboardScreen: Error loading scoreboard:",
        error,
      );
      if (!silentUpdate) {
        setLoading(false);
      }
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // Clear cache for current filter to force fresh data
    const cacheKey = getCacheKey(selectedCompetition, selectedDateFilter);
    setCacheTimestamps((prev) => ({
      ...prev,
      [cacheKey]: 0,
    }));
    await loadScoreboard(false, selectedDateFilter, selectedCompetition);
    setRefreshing(false);
  };

  const handleDateFilterChange = React.useCallback(
    (filter) => {
      if (filter === selectedDateFilter) return;
      console.log(
        "FIFAWorldScoreboardScreen: Changing date filter to:",
        filter,
      );
      setSelectedDateFilter(filter);

      // Check if we have cached data for this filter + competition
      const now = Date.now();
      const cacheKey = getCacheKey(selectedCompetition, filter);
      const cachedData = gameCache[cacheKey];
      const cacheTime = cacheTimestamps[cacheKey] || 0;
      const cacheDuration = getCacheDuration(filter);
      const isCacheValid = cachedData && now - cacheTime < cacheDuration;

      if (isCacheValid) {
        console.log(
          "FIFAWorldScoreboardScreen: Using cached data for filter change to:",
          filter,
        );
        setGames(cachedData);
        setLoading(false);
      } else {
        console.log(
          "FIFAWorldScoreboardScreen: No valid cache for filter:",
          filter,
          "- will fetch fresh data",
        );
      }
    },
    [selectedDateFilter, selectedCompetition, gameCache, cacheTimestamps],
  );

  const handleCompetitionChange = React.useCallback(
    (competitionId) => {
      if (competitionId === selectedCompetition) return;
      console.log(
        "FIFAWorldScoreboardScreen: Changing competition to:",
        competitionId,
      );

      // Update both local state and shared state
      setSelectedCompetition(competitionId);
      FIFACompetitionState.setCurrentCompetition(competitionId);
    },
    [selectedCompetition],
  );

  const getMatchStatus = (game) => {
    const status = game.status;
    const state = status?.type?.state;
      const date = new Date(game.date);
      const today = new Date();
      const isToday = date.toDateString() === today.toDateString();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const isYesterday = date.toDateString() === yesterday.toDateString();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const isTomorrow = date.toDateString() === tomorrow.toDateString();
      const timeText = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

    if (state === "pre") {

      let dateText = "";
      if (isToday) {
        dateText = "Today";
      } else if (isYesterday) {
        dateText = "Yesterday";
      } else if (isTomorrow) {
        dateText = "Tomorrow";
      } else {
        dateText = date.toLocaleDateString();
      }

      return {
        text: "Scheduled",
        time: timeText,
        detail: dateText,
        isLive: false,
        isPre: true,
        isPost: false,
      };
    } else if (state === "in") {
      const period = status?.period;
      const description = status?.type?.description;
      const clock = status?.type?.shortDetail || status?.displayClock || "";
      
      let timeText = "";     
      let halfText = "";
      if (period === 1) {
        halfText = "1st Half";
      } else if (period === 2) {
        halfText = "2nd Half";
      } else if (period > 2) {
        halfText = "Extra Time";
      } else {
        halfText = "Live";
      }

      if (clock) {
        timeText = clock;
      }

      return {
        text: halfText,
        time: timeText,
        detail: "",
        isLive: true,
        isPre: false,
        isPost: false,
      };
    } else {
      return {
        text: "Final",
        time: timeText || "",
        detail: "",
        isLive: false,
        isPre: false,
        isPost: true,
      };
    }
  };

  const handleGamePress = (game) => {
    console.log("FIFAWorldScoreboardScreen: Game pressed:", game.id);
    navigation.navigate("FIFAWorldGameDetails", {
      gameId: game.id,
      sport: "FIFA",
      competition: selectedCompetition,
      homeTeam: game.competitions[0]?.competitors[0]?.team,
      awayTeam: game.competitions[0]?.competitors[1]?.team,
    });
  };

  const renderCompetitionSelector = React.useCallback(() => {
    return (
      <View style={styles.competitionContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.competitionScrollContent}
          style={styles.competitionScroll}
        >
          {FIFA_COMPETITIONS.map((competition) => (
            <CompetitionButton
              key={competition.id}
              competition={competition}
              isSelected={selectedCompetition === competition.id}
              onPress={handleCompetitionChange}
              colors={colors}
              theme={theme}
              isDarkMode={isDarkMode}
            />
          ))}
        </ScrollView>
      </View>
    );
  }, [selectedCompetition, colors, theme, isDarkMode, handleCompetitionChange]);

  const renderDateFilter = () => {
    const filters = [
      { key: "yesterday", label: "Yesterday" },
      { key: "today", label: "Today" },
      { key: "tomorrow", label: "Tomorrow" },
    ];

    return (
      <View
        style={[styles.filterContainer, { backgroundColor: theme.surface }]}
      >
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={[
              styles.filterButton,
              selectedDateFilter === filter.key && {
                backgroundColor: colors.primary,
              },
            ]}
            onPress={() => handleDateFilterChange(filter.key)}
          >
            <Text
              allowFontScaling={false}
              style={[
                styles.filterText,
                {
                  color:
                    selectedDateFilter === filter.key ? "#fff" : theme.text,
                },
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderGameItem = ({ item: game }) => {
    const competition = game.competitions[0];
    const slug1 = game?.season?.slug || "World-Cup";
    const slug = slug1
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    const homeTeam = competition?.competitors[0];
    const awayTeam = competition?.competitors[1];
    const matchStatus = getMatchStatus(game);

    const awayWin = matchStatus.isPost && (awayTeam?.shootoutScore > homeTeam?.shootoutScore || awayTeam?.score > homeTeam?.score);
    const homeWin = matchStatus.isPost && (homeTeam?.shootoutScore > awayTeam?.shootoutScore || homeTeam?.score > awayTeam?.score);

    return (
      <TouchableOpacity
        style={[styles.gameCard, { backgroundColor: theme.surface }]}
        onPress={() => handleGamePress(game)}
        activeOpacity={0.7}
      >
        {/* League Header */}
        <View style={[styles.leagueHeader, { backgroundColor: theme.border }]}>
          <Text
            allowFontScaling={false}
            style={[styles.leagueText, { color: colors.primary }]}
          >
            {FIFA_COMPETITIONS.find((c) => c.id === selectedCompetition)
              ?.name || "FIFA"}{" "}
            - {slug}
          </Text>
        </View>

        {/* Match Content */}
        <View style={styles.matchContent}>
          {/* Home Team Section */}
          <View style={styles.teamSection}>
            <View style={styles.teamLogoRow}>
              <TeamLogoImage
                teamId={homeTeam?.team?.id}
                style={[
                  styles.teamLogo,
                  awayWin && styles.losingTeamLogo,
                ]}
              />
              {(matchStatus.isLive || matchStatus.isPost) && (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.teamScore,
                    { color: theme.text },
                    awayWin && styles.losingScore,
                  ]}
                >
                  {homeTeam?.score || "0"}
                </Text>
              )}
              {(matchStatus.isLive || matchStatus.isPost) && homeTeam?.shootoutScore && (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.teamShootoutScore,
                    { color: theme.text },
                    awayWin && styles.losingScore,
                  ]}
                >
                  ({homeTeam?.shootoutScore || "0"})
                </Text>
              )}
            </View>
            <Text
              allowFontScaling={false}
              style={[
                styles.teamAbbreviation,
                {
                  color: isFavorite(homeTeam?.team?.id, "fifa world cup")
                    ? colors.primary
                    : theme.text,
                },
                awayWin && styles.losingTeamName,
              ]}
            >
              {isFavorite(homeTeam?.team?.id, "fifa world cup") ? "★ " : ""}
              {homeTeam?.team?.abbreviation ||
                homeTeam?.team?.displayName ||
                "TBD"}
            </Text>
          </View>

          {/* Status Section */}
          <View style={styles.statusSection}>
            <Text
              allowFontScaling={false}
              style={[
                styles.gameStatus,
                { color: matchStatus.isLive ? theme.error : theme.text },
              ]}
            >
              {matchStatus.text}
            </Text>

            {matchStatus.time && (
              <Text
                allowFontScaling={false}
                style={[styles.gameDateTime, { color: theme.textSecondary }]}
              >
                {matchStatus.time}
              </Text>
            )}

            {matchStatus.detail && (
              <Text
                allowFontScaling={false}
                style={[styles.gameDateTime, { color: theme.textSecondary }]}
              >
                {matchStatus.detail}
              </Text>
            )}
          </View>

          {/* Away Team Section */}
          <View style={styles.teamSection}>
            <View style={styles.teamLogoRow}>
              {(matchStatus.isLive || matchStatus.isPost) && awayTeam?.shootoutScore && (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.teamShootoutScore,
                    { color: theme.text },
                    homeWin && styles.losingScore,
                  ]}
                >
                  ({awayTeam?.shootoutScore || "0"})
                </Text>
              )}
              {(matchStatus.isLive || matchStatus.isPost) && (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.teamScore,
                    { color: theme.text },
                    homeWin && styles.losingScore,
                  ]}
                >
                  {awayTeam?.score || "0"}
                </Text>
              )}
              <TeamLogoImage
                teamId={awayTeam?.team?.id}
                style={[
                  styles.teamLogo,
                  homeWin && styles.losingTeamLogo,
                ]}
              />
            </View>
            <Text
              allowFontScaling={false}
              style={[
                styles.teamAbbreviation,
                {
                  color: isFavorite(awayTeam?.team?.id, "fifa world cup")
                    ? colors.primary
                    : theme.text,
                },
                homeWin && styles.losingTeamName,
              ]}
            >
              {isFavorite(awayTeam?.team?.id, "fifa world cup") ? "★ " : ""}
              {awayTeam?.team?.abbreviation ||
                awayTeam?.team?.displayName ||
                "TBD"}
            </Text>
          </View>
        </View>

        {/* Venue Section */}
        {competition?.venue?.fullName && (
          <View style={[styles.venueSection, { borderTopColor: theme.border }]}>
            <Text
              allowFontScaling={false}
              style={[styles.venueText, { color: theme.textSecondary }]}
            >
              {competition.venue.fullName}
            </Text>
          </View>
        )}

        {/* Live Viewer Section */}
        <View
          style={[
            styles.viewerSection,
            {
              backgroundColor: theme.cardBackground,
              borderTopColor: theme.border,
            },
          ]}
        >
          <LiveViewerBadge gameId={competition.id} status={matchStatus.text} />
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && games.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {renderCompetitionSelector()}
        {renderDateFilter()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            allowFontScaling={false}
            style={[styles.loadingText, { color: theme.text }]}
          >
            Loading matches...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderCompetitionSelector()}
      {renderDateFilter()}

      {games.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text
            allowFontScaling={false}
            style={[styles.emptyText, { color: theme.textSecondary }]}
          >
            {getNoGamesMessage(selectedDateFilter)}
          </Text>
        </View>
      ) : (
        <FlatList
          data={games}
          renderItem={renderGameItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  competitionContainer: {
    paddingVertical: 12,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  competitionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    textAlign: "center",
  },
  competitionScroll: {
    maxHeight: 100,
  },
  competitionScrollContent: {
    paddingHorizontal: 4,
  },
  competitionButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 80,
    maxWidth: 90,
  },
  competitionLogo: {
    width: 32,
    height: 32,
    marginBottom: 4,
  },
  competitionButtonText: {
    fontSize: 10,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 12,
  },
  filterContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 4,
    borderRadius: 20,
    alignItems: "center",
  },
  filterText: {
    fontSize: 14,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 8,
  },
  listContainer: {
    padding: 16,
  },
  gameCard: {
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    overflow: "hidden",
  },
  leagueHeader: {
    backgroundColor: "#f8f9fa",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  leagueText: {
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
  },
  matchContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 12,
  },
  teamSection: {
    flex: 1,
    alignItems: "center",
  },
  teamLogoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  teamLogo: {
    width: 40,
    height: 40,
  },
  losingTeamLogo: {
    opacity: 0.5,
  },
  teamScore: {
    fontSize: 24,
    fontWeight: "bold",
    marginHorizontal: 8,
  },
  teamShootoutScore: {
    fontSize: 18,
    fontWeight: "bold",
    marginHorizontal: -2,
  },
  losingScore: {
    color: "#999",
  },
  teamAbbreviation: {
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  losingTeamName: {
    color: "#999",
  },
  statusSection: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 10,
  },
  gameStatus: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  gameDateTime: {
    fontSize: 11,
    marginBottom: 2,
  },
  venueSection: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: "#e9ecef",
  },
  venueText: {
    fontSize: 11,
    textAlign: "center",
    fontStyle: "italic",
  },
  viewerSection: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: "#e9ecef",
    alignItems: "center",
  },
});

export default FIFAWorldScoreboardScreen;

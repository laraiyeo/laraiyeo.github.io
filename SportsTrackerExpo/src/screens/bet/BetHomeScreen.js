import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons, FontAwesome6 } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../../context/ThemeContext";
import { useBetData } from "../../context/BetDataContext";
import BetSlip from "../../components/BetSlip";

// Global image cache - keeps image sources stable across re-renders
const imageCache = new Map();

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

// Format time to EST
const formatTimeEST = (dateString) => {
  const date = new Date(dateString);
  const options = {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  const timeStr = date.toLocaleString("en-US", options);
  const [time, period] = timeStr.split(" ");
  return { time, period: `${period} EST` };
};

// Parse game data from API
const parseGameData = (events, isDarkMode = false) => {
  if (!events || !Array.isArray(events))
    return { live: [], scheduled: [], completed: [], hasLiveGames: false };

  const live = [];
  const scheduled = [];
  const completed = [];
  let hasLiveGames = false;

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
    const team2Abbr = (homeTeam.team?.abbreviation || "T2").toLowerCase();

    const gameData = {
      id: event.id,
      sport: "NBA",
      tournament: "NBA",
      tournamentLabel: event.season?.slug || "2025-26 Season",
      shortName: event.shortName,
      team1: awayTeam.team?.displayName || "Team 1",
      team1Abbr: awayTeam.team?.abbreviation || "T1",
      team1Logo: `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500${darkSuffix}/${team1Abbr}.png&h=200&w=200`,
      team1Record: awayTeam.record || null,
      team2: homeTeam.team?.displayName || "Team 2",
      team2Abbr: homeTeam.team?.abbreviation || "T2",
      team2Logo: `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500${darkSuffix}/${team2Abbr}.png&h=200&w=200`,
      team2Record: homeTeam.record || null,
      score1: awayTeam.score || 0,
      score2: homeTeam.score || 0,
      period: status.period ? `Q${status.period}` : null,
      time:
        status.type?.state === "in" && status.displayClock
          ? status.displayClock
          : timeFormatted.time,
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
  ({ game, navigation, theme, colors }) => {
    // Get stable image sources from cache (cached outside update loop)
    const team1Source = imageCache.get(game.team1Logo) || {
      uri: game.team1Logo,
    };
    const team2Source = imageCache.get(game.team2Logo) || {
      uri: game.team2Logo,
    };

    return (
      <TouchableOpacity
        style={[
          styles.liveGameCard,
          { backgroundColor: theme.surfaceSecondary },
        ]}
        onPress={() =>
          navigation.navigate("BetGameDetail", { gameId: game.id, game })
        }
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
        <View style={styles.liveTournamentRow}>
          <Image
            source={require("../../../assets/nba.png")}
            style={styles.nbaLogo}
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
          {game.period && `${game.period} • `}
          {game.time}
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
  }
);

// Scheduled Game Row - Defined outside component
const ScheduledGameRow = React.memo(
  ({ game, navigation, theme }) => {
    const team1Source = imageCache.get(game.team1Logo) || {
      uri: game.team1Logo,
    };
    const team2Source = imageCache.get(game.team2Logo) || {
      uri: game.team2Logo,
    };

    return (
      <TouchableOpacity
        style={styles.upcomingGameRow}
        onPress={() =>
          navigation.navigate("BetGameDetail", {
            gameId: game.id,
            game,
          })
        }
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
  }
);

// Completed Game Card - Defined outside component
const CompletedGameCard = React.memo(
  ({ game, navigation, theme, colors }) => {
    const team1Source = imageCache.get(game.team1Logo) || {
      uri: game.team1Logo,
    };
    const team2Source = imageCache.get(game.team2Logo) || {
      uri: game.team2Logo,
    };

    return (
      <TouchableOpacity
        style={[
          styles.completedGameCard,
          { backgroundColor: theme.surfaceSecondary },
        ]}
        onPress={() =>
          navigation.navigate("BetGameDetail", { gameId: game.id, game })
        }
      >
        <View style={styles.completedHeaderRow}>
          <Image
            source={require("../../../assets/nba.png")}
            style={styles.nbaLogoTiny}
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
          Final
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
                    game.score1 > game.score2
                      ? colors.primary
                      : theme.textSecondary,
                  fontWeight: game.score1 > game.score2 ? "bold" : "normal",
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
                    game.score2 > game.score1
                      ? colors.primary
                      : theme.textSecondary,
                  fontWeight: game.score2 > game.score1 ? "bold" : "normal",
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
  }
);

const BetHomeScreen = ({ navigation }) => {
  const { colors, theme, isDarkMode } = useTheme();
  const { scoreboardData, fetchScoreboard } = useBetData();
  const [refreshing, setRefreshing] = useState(false);
  const [liveGames, setLiveGames] = useState([]);
  const [scheduledGames, setScheduledGames] = useState([]);
  const [completedGames, setCompletedGames] = useState([]);
  const [hasLiveGames, setHasLiveGames] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  const pollingIntervalRef = useRef(null);

  // Track screen focus
  useFocusEffect(
    React.useCallback(() => {
      setIsFocused(true);
      return () => {
        setIsFocused(false);
      };
    }, [])
  );

  // Pre-cache images when scoreboard data arrives - only cache new logos
  useEffect(() => {
    if (scoreboardData?.events) {
      const darkSuffix = isDarkMode ? "-dark" : "";
      scoreboardData.events.forEach((event) => {
        const competition = event.competitions?.[0];
        if (!competition) return;

        const competitors = competition.competitors || [];
        competitors.forEach((competitor) => {
          const abbr = competitor.team?.abbreviation?.toLowerCase();
          if (abbr) {
            const logoUrl = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500${darkSuffix}/${abbr}.png&h=200&w=200`;
            if (!imageCache.has(logoUrl)) {
              imageCache.set(logoUrl, { uri: logoUrl });
            }
          }
        });
      });
    }
  }, [scoreboardData?.events?.length, isDarkMode]); // Only run when number of events changes or theme changes

  // Update games when scoreboard data changes
  useEffect(() => {
    if (scoreboardData?.events) {
      const {
        live,
        scheduled,
        completed,
        hasLiveGames: hasLive,
      } = parseGameData(scoreboardData.events, isDarkMode);

      // Merge with previous games to maintain object identity
      setLiveGames((prev) => mergeGames(prev, live));
      setScheduledGames((prev) => mergeGames(prev, scheduled));
      setCompletedGames((prev) => mergeGames(prev, completed));
      setHasLiveGames(hasLive);
    }
  }, [scoreboardData, isDarkMode]);

  // Set up smart polling based on live game status and screen focus
  useEffect(() => {
    // Clear any existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Only poll when screen is focused
    if (!isFocused) {
      return;
    }

    // Poll every 2 seconds if there are live games, otherwise every 5 minutes
    const interval = hasLiveGames ? 2000 : 300000;

    pollingIntervalRef.current = setInterval(() => {
      fetchScoreboard();
    }, interval);

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [hasLiveGames, isFocused]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchScoreboard();
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
        if (a.time && b.time) {
          return a.time.localeCompare(b.time);
        }
        return 0;
      });
    });

    return Object.values(grouped);
  };

  const UpcomingGamesSection = ({ games }) => {
    const groupedTournaments = groupGamesByTournament(games);

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
                  source={require("../../../assets/nba.png")}
                  style={styles.nbaLogoSmall}
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
            >
              {liveGames.map((game) => (
                <LiveGameCard
                  key={game.id}
                  game={game}
                  navigation={navigation}
                  theme={theme}
                  colors={colors}
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

            <UpcomingGamesSection games={scheduledGames} />
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
            >
              {completedGames.map((game) => (
                <CompletedGameCard
                  key={game.id}
                  game={game}
                  navigation={navigation}
                  theme={theme}
                  colors={colors}
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
              <Ionicons
                name="basketball-outline"
                size={64}
                color={theme.textTertiary}
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
      <BetSlip scoreboardGames={[...liveGames, ...scheduledGames, ...completedGames]} />
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

  bottomPadding: {
    height: 32,
  },
});

export default BetHomeScreen;

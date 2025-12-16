import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from "react-native";
import { Ionicons, FontAwesome6 } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import BetSlip from "../../components/BetSlip";

const { width } = Dimensions.get("window");

// Get sport-specific icon
const getSportIcon = (sport) => {
  switch (sport) {
    case "NBA":
      return "basketball";
    case "NFL":
      return "football";
    case "SOCCER":
      return "futbol";
    default:
      return "basketball";
  }
};

// Get random game time based on sport
const getRandomGameTime = (sport) => {
  if (sport === "SOCCER") {
    const half = Math.random() > 0.5 ? 1 : 2;
    let minute;
    if (half === 1) {
      minute = Math.floor(Math.random() * 40) + 5; // 5-45
    } else {
      minute = Math.floor(Math.random() * 40) + 50; // 50-90
    }
    return {
      period: `${half === 1 ? "1st" : "2nd"} Half `,
      time: `${minute}'`
    };
  } else {
    // NBA/NFL
    const quarter = Math.floor(Math.random() * 4) + 1;
    const minutes = Math.floor(Math.random() * 8) + 4; // 4-12
    const seconds = Math.floor(Math.random() * 60);
    return {
      period: `Q${quarter}`,
      time: `${minutes}:${seconds.toString().padStart(2, '0')}`
    };
  }
};

// Get tournament/event info based on sport
const getTournamentInfo = (sport) => {
  const tournaments = {
    NBA: [{ name: "NBA", label: "2025-26 Season" }],
    NFL: [{ name: "NFL", label: "2025-26 Season" }],
    SOCCER: [
      { name: "Premier League", label: "Matchday 16" },
      { name: "La Liga", label: "Matchday 17" },
      { name: "Champions League", label: "Group Stage" },
    ],
  };
  
  return tournaments[sport] || tournaments.NBA;
};

// Placeholder data
const generatePlaceholderGames = (status, sport) => {
  const teams = {
    NBA: [
      { name: "Lakers", abbr: "LAL" },
      { name: "Warriors", abbr: "GSW" },
      { name: "Celtics", abbr: "BOS" },
      { name: "Heat", abbr: "MIA" },
      { name: "Nets", abbr: "BKN" },
      { name: "Bucks", abbr: "MIL" },
      { name: "76ers", abbr: "PHI" },
      { name: "Nuggets", abbr: "DEN" },
    ],
    NFL: [
      { name: "Chiefs", abbr: "KC" },
      { name: "49ers", abbr: "SF" },
      { name: "Eagles", abbr: "PHI" },
      { name: "Cowboys", abbr: "DAL" },
      { name: "Bills", abbr: "BUF" },
      { name: "Dolphins", abbr: "MIA" },
      { name: "Ravens", abbr: "BAL" },
      { name: "Bengals", abbr: "CIN" },
    ],
    SOCCER: [
      { name: "Real Madrid", abbr: "RMA" },
      { name: "Barcelona", abbr: "BAR" },
      { name: "Man City", abbr: "MCI" },
      { name: "Liverpool", abbr: "LIV" },
      { name: "Bayern", abbr: "BAY" },
      { name: "PSG", abbr: "PSG" },
      { name: "Arsenal", abbr: "ARS" },
      { name: "Chelsea", abbr: "CHE" },
    ],
  };

  const tournaments = getTournamentInfo(sport);
  const sportTeams = teams[sport] || teams.NBA;
  const games = [];

  const gamesPerTournament = sport === "SOCCER" ? 2 : 5;
  
  tournaments.forEach((tournament, tournamentIndex) => {
    for (let i = 0; i < gamesPerTournament; i++) {
      const team1 = sportTeams[Math.floor(Math.random() * sportTeams.length)];
      let team2 = sportTeams[Math.floor(Math.random() * sportTeams.length)];
      while (team2.abbr === team1.abbr) {
        team2 = sportTeams[Math.floor(Math.random() * sportTeams.length)];
      }

      const gameTime = status === "live" ? getRandomGameTime(sport) : null;

      games.push({
        id: `${sport}-${status}-${tournamentIndex}-${i}`,
        sport,
        tournament: tournament.name,
        tournamentLabel: tournament.label,
        team1: team1.name,
        team1Abbr: team1.abbr,
        team2: team2.name,
        team2Abbr: team2.abbr,
        score1:
          status === "live" || status === "completed"
            ? sport === "SOCCER" 
              ? Math.floor(Math.random() * 4)
              : sport === "NFL"
              ? Math.floor(Math.random() * 35) + 3 // 3-38 for NFL
              : Math.floor(Math.random() * 50) + 70 // 70-120 for NBA
            : null,
        score2:
          status === "live" || status === "completed"
            ? sport === "SOCCER"
              ? Math.floor(Math.random() * 4)
              : sport === "NFL"
              ? Math.floor(Math.random() * 35) + 3 // 3-38 for NFL
              : Math.floor(Math.random() * 50) + 70 // 70-120 for NBA
            : null,
        status,
        period: gameTime?.period || null,
        time: gameTime?.time || (status === "scheduled" ? `${Math.floor(Math.random() * 12) + 1}:00 PM` : "Final"),
        spread: `${team1.abbr} -${Math.floor(Math.random() * 10) + 1}.5`,
        total: `O/U ${Math.floor(Math.random() * 50) + 200}`,
      });
    }
  });

  return games;
};

const BetHomeScreen = ({ navigation, route, sport = "NBA" }) => {
  const { colors, theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [liveGames, setLiveGames] = useState([]);
  const [scheduledGames, setScheduledGames] = useState([]);
  const [completedGames, setCompletedGames] = useState([]);

  useEffect(() => {
    loadGames();
  }, [sport]);

  const loadGames = () => {
    setLiveGames(generatePlaceholderGames("live", sport));
    setScheduledGames(generatePlaceholderGames("scheduled", sport));
    setCompletedGames(generatePlaceholderGames("completed", sport));
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadGames();
    setTimeout(() => setRefreshing(false), 1000);
  };

  // Group games by tournament
  const groupGamesByTournament = (games) => {
    const grouped = {};
    games.forEach(game => {
      const tournamentKey = game.tournament;
      if (!grouped[tournamentKey]) {
        grouped[tournamentKey] = {
          tournament: game.tournament,
          tournamentLabel: game.tournamentLabel,
          games: []
        };
      }
      grouped[tournamentKey].games.push(game);
    });
    
    // Sort games within each tournament by time
    Object.values(grouped).forEach(group => {
      group.games.sort((a, b) => {
        if (a.time && b.time) {
          return a.time.localeCompare(b.time);
        }
        return 0;
      });
    });
    
    return Object.values(grouped);
  };

  // Live Game Card - Similar to VAL style
  const LiveGameCard = ({ game }) => (
    <TouchableOpacity
      style={[styles.liveGameCard, { backgroundColor: theme.surfaceSecondary }]}
      onPress={() =>
        navigation.navigate("BetGameDetail", { gameId: game.id, game })
      }
    >
      <View style={styles.liveIndicator}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE</Text>
      </View>

      {/* Tournament Label */}
      <Text style={[styles.liveTournamentLabel, { color: theme.textTertiary }]} numberOfLines={1}>
        {game.tournamentLabel}
      </Text>

      {/* Tournament Name */}
      <Text style={[styles.liveTournamentName, { color: theme.text }]} numberOfLines={1}>
        {game.tournament}
      </Text>

      {/* Game Time/Period */}
      <Text style={[styles.liveGameTime, { color: theme.textSecondary }]}>
        {game.period} • {game.time}
      </Text>

      {/* Teams and Score */}
      <View style={styles.liveTeamsContainer}>
        <View style={styles.liveTeamRow}>
          <View style={styles.liveTeamInfo}>
            <FontAwesome6 name={getSportIcon(sport)} size={14} color={colors.primary} style={styles.trophyIcon} />
            <Text style={[styles.liveTeamName, { color: theme.text }]} numberOfLines={1}>
              {game.team1}
            </Text>
          </View>
          <Text style={[styles.liveScore, { color: theme.text }]}>
            {game.score1}
          </Text>
        </View>

        <View style={styles.liveTeamRow}>
          <View style={styles.liveTeamInfo}>
            <FontAwesome6 name={getSportIcon(sport)} size={14} color={theme.textSecondary} style={styles.trophyIcon} />
            <Text style={[styles.liveTeamName, { color: theme.text }]} numberOfLines={1}>
              {game.team2}
            </Text>
          </View>
          <Text style={[styles.liveScore, { color: theme.text }]}>
            {game.score2}
          </Text>
        </View>
      </View>

      {/* Betting Lines */}
      <View style={styles.bettingInfo}>
        <Text style={[styles.bettingLine, { color: theme.textSecondary }]}>
          {game.spread}
        </Text>
        <Text style={[styles.bettingLine, { color: theme.textSecondary }]}>
          {game.total}
        </Text>
      </View>
    </TouchableOpacity>
  );

  // Upcoming Games Section - Grouped by Tournament
  const UpcomingGamesSection = ({ games }) => {
    const groupedTournaments = groupGamesByTournament(games);

    return (
      <View style={styles.upcomingContainer}>
        {groupedTournaments.map((group) => (
          <View key={group.tournament} style={[styles.tournamentContainer, { backgroundColor: theme.surfaceSecondary }]}>
            {/* Tournament Header */}
            <View style={styles.tournamentHeader}>
              <View style={styles.tournamentIconContainer}>
                <Ionicons name="trophy" size={20} color={colors.primary} />
              </View>

              <View style={styles.tournamentInfo}>
                <Text style={[styles.tournamentName, { color: theme.text }]} numberOfLines={1}>
                  {group.tournament}
                </Text>
                <Text style={[styles.tournamentLabel, { color: theme.textTertiary }]} numberOfLines={1}>
                  {group.tournamentLabel}
                </Text>
              </View>
            </View>

            {/* Games in this tournament */}
            <View style={styles.gamesList}>
              {group.games.map((game, index) => (
                <View key={game.id}>
                  <TouchableOpacity
                    style={styles.upcomingGameRow}
                    onPress={() =>
                      navigation.navigate("BetGameDetail", { gameId: game.id, game })
                    }
                  >
                    {/* Time */}
                    <View style={styles.gameTimeContainer}>
                      <Text style={[styles.gameTime, { color: theme.textSecondary }]}>
                        {game.time}
                      </Text>
                    </View>

                    {/* Teams */}
                    <View style={styles.stackedTeams}>
                      <View style={styles.teamWithIcon}>
                        <FontAwesome6 name={getSportIcon(sport)} size={12} color={theme.textSecondary} style={styles.teamTrophyIcon} />
                        <Text style={[styles.stackedTeamName, { color: theme.text }]} numberOfLines={1}>
                          {game.team1}
                        </Text>
                      </View>
                      <View style={styles.teamWithIcon}>
                        <FontAwesome6 name={getSportIcon(sport)} size={12} color={theme.textSecondary} style={styles.teamTrophyIcon} />
                        <Text style={[styles.stackedTeamName, { color: theme.text }]} numberOfLines={1}>
                          {game.team2}
                        </Text>
                      </View>
                    </View>

                    {/* Betting Lines */}
                    <View style={styles.upcomingBettingLines}>
                      <Text style={[styles.smallBettingLine, { color: theme.textSecondary }]}>
                        {game.spread}
                      </Text>
                      <Text style={[styles.smallBettingLine, { color: theme.textSecondary }]}>
                        {game.total}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {index < group.games.length - 1 && (
                    <View style={[styles.gameSeparator, { backgroundColor: theme.border }]} />
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  };

  // Completed Game Card
  const CompletedGameCard = ({ game }) => (
    <TouchableOpacity
      style={[styles.completedGameCard, { backgroundColor: theme.surfaceSecondary }]}
      onPress={() =>
        navigation.navigate("BetGameDetail", { gameId: game.id, game })
      }
    >
      <Text style={[styles.completedTournamentLabel, { color: theme.textTertiary }]} numberOfLines={1}>
        {game.tournament}
      </Text>

      <Text style={[styles.completedStatus, { color: theme.textSecondary }]}>
        Final
      </Text>

      <View style={styles.completedTeamsContainer}>
        <View style={styles.completedTeamRow}>
          <View style={styles.completedTeamInfo}>
            <FontAwesome6 name={getSportIcon(sport)} size={12} color={theme.textSecondary} style={styles.completedTrophyIcon} />
            <Text style={[styles.completedTeamName, { color: theme.text }]} numberOfLines={1}>
              {game.team1}
            </Text>
          </View>
          <Text style={[styles.completedScore, { 
            color: game.score1 > game.score2 ? colors.primary : theme.textSecondary,
            fontWeight: game.score1 > game.score2 ? 'bold' : 'normal'
          }]}>
            {game.score1}
          </Text>
        </View>

        <View style={styles.completedTeamRow}>
          <View style={styles.completedTeamInfo}>
            <FontAwesome6 name={getSportIcon(sport)} size={12} color={theme.textSecondary} style={styles.completedTrophyIcon} />
            <Text style={[styles.completedTeamName, { color: theme.text }]} numberOfLines={1}>
              {game.team2}
            </Text>
          </View>
          <Text style={[styles.completedScore, { 
            color: game.score2 > game.score1 ? colors.primary : theme.textSecondary,
            fontWeight: game.score2 > game.score1 ? 'bold' : 'normal'
          }]}>
            {game.score2}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

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
                <LiveGameCard key={game.id} game={game} />
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
                <CompletedGameCard key={game.id} game={game} />
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
      <BetSlip />
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
  liveTournamentName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
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
    fontWeight: "500",
  },
  stackedTeams: {
    flex: 1,
  },
  teamWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  teamTrophyIcon: {
    marginRight: 6,
  },
  stackedTeamName: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  upcomingBettingLines: {
    alignItems: "flex-end",
    marginLeft: 8,
  },
  smallBettingLine: {
    fontSize: 10,
    marginBottom: 4,
  },
  gameSeparator: {
    height: 1,
    marginHorizontal: 16,
    opacity: 0.3,
  },

  // Completed Games Styles
  completedGameCard: {
    width: 180,
    padding: 12,
    borderRadius: 8,
    marginRight: 12,
    minHeight: 120,
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
    marginBottom: 6,
  },
  completedTeamInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  completedTrophyIcon: {
    marginRight: 4,
  },
  completedTeamName: {
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
  },
  completedScore: {
    fontSize: 14,
    marginLeft: 8,
  },

  bottomPadding: {
    height: 32,
  },
});

export default BetHomeScreen;

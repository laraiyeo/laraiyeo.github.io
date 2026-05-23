import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Image,
  Dimensions,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FontAwesome6 } from "@expo/vector-icons";
import { Share, Alert } from "react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { useTheme } from "../../../context/ThemeContext";
import {
  getMatchDetails,
  formatSeriesData,
  getMapDisplayName,
  getCS2MapImageUrl,
} from "../../../services/cs2MatchService";

const { width: screenWidth } = Dimensions.get("window");

// Guard to prevent duplicate loadSeriesData network calls across mounts/re-renders
const ongoingLoadSeries = new Map();

// Small deferred helper so we can insert a pending promise into the map before starting work
const createDeferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const CS2ResultsScreen = ({ navigation, route }) => {
  const { matchId, matchData } = route.params;
  const { colors, theme } = useTheme();
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedGameIndex, setSelectedGameIndex] = useState(null);
  const [showRoundsModal, setShowRoundsModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySeriesData, setCopySeriesData] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const copyCardRef = useRef(null);
  const loadingRef = useRef(false);

  const handleInnerLayout = (event) => {
    const { height } = event.nativeEvent.layout;
    setContentHeight(height);
  };

  const Container = isCapturing ? View : ScrollView;

  const loadSeriesData = useCallback(
    async (forceRefresh = false) => {
      console.log("=== loadSeriesData called ===", {
        matchId,
        forceRefresh,
        alreadyLoading: loadingRef.current,
        timestamp: new Date().toISOString(),
      });

      // Prevent duplicate calls while already loading (unless it's a forced refresh)
      if (loadingRef.current && !forceRefresh) {
        console.log("Already loading, skipping duplicate call");
        return;
      }

      try {
        loadingRef.current = true;
        setLoading(true);

        if (matchId && matchData) {
          console.log("Loading series data for:", { matchId, matchData });
          console.log("Teams array structure:", matchData.teams);
          console.log("Team 0:", matchData.teams?.[0]);
          console.log("Team 1:", matchData.teams?.[1]);

          // Extract team info from matchData for API calls
          // Handle both tournament screen format and home screen format
          const team1Id =
            matchData.team1_id ||
            matchData.team1?.id ||
            matchData.teams?.[0]?.id;
          const team2Id =
            matchData.team2_id ||
            matchData.team2?.id ||
            matchData.teams?.[1]?.id;
          const team1Slug = matchData.team1?.slug || matchData.teams?.[0]?.slug;
          const team2Slug = matchData.team2?.slug || matchData.teams?.[1]?.slug;
          const matchStartDate =
            matchData.start_date || matchData.startDate || matchData.startTime;
          const matchSlug = matchData.slug;

          console.log("Extracted team data:", {
            team1Id,
            team2Id,
            team1Slug,
            team2Slug,
            matchStartDate,
            matchSlug,
          });

          // Only call API if we have valid team IDs
          if (team1Id && team2Id) {
            console.log("Making API call with valid team IDs...");

            // Use a module-level dedupe map to avoid duplicate network calls across
            // component remounts / StrictMode double-mounts.
            const loadKey = `${matchId}_${team1Id}_${team2Id}`;
            if (ongoingLoadSeries.has(loadKey)) {
              console.log("Waiting for ongoing loadSeriesData for", loadKey);
              try {
                const existing = await ongoingLoadSeries.get(loadKey);
                setSeries(existing);
                console.log(
                  "Series data set from ongoingLoadSeries:",
                  existing
                );
              } catch (err) {
                console.warn(
                  "Existing load promise failed, falling back to fresh fetch",
                  err
                );
              }
            } else {
              // Create a deferred and store its promise before starting the network work
              const deferred = createDeferred();
              ongoingLoadSeries.set(loadKey, deferred.promise);

              // Start the actual fetch in background and resolve/reject the deferred
              (async () => {
                try {
                  const detailedData = await getMatchDetails(
                    matchId,
                    team1Id,
                    team2Id,
                    team1Slug,
                    team2Slug,
                    matchStartDate,
                    matchSlug
                  );
                  deferred.resolve(detailedData);
                } catch (e) {
                  deferred.reject(e);
                }
              })();

              try {
                const detailedData = await deferred.promise;
                setSeries(detailedData);
                console.log("Series data set to:", detailedData);
                console.log("Team1 Map Pool:", detailedData.team1MapPool);
                console.log("Team2 Map Pool:", detailedData.team2MapPool);
              } catch (e) {
                console.error("Error fetching detailed match data:", e);
                // Fallback to passed match data if API fails
                const formattedData = formatSeriesData(matchData);
                setSeries(formattedData);
                console.log(
                  "Series data set to fallback formatted data due to error:",
                  formattedData
                );
              } finally {
                ongoingLoadSeries.delete(loadKey);
              }
            }
          } else {
            console.warn("Missing team IDs, using fallback data:", {
              team1Id,
              team2Id,
              matchData,
            });
            // Fallback to passed match data if team IDs are missing
            const formattedData = formatSeriesData(matchData);
            console.log("Formatted fallback data:", formattedData);
            setSeries(formattedData);
            console.log("Series data set to:", formattedData);
          }
        } else if (matchData) {
          // Fallback to passed match data
          const formattedData = formatSeriesData(matchData);
          setSeries(formattedData);
        }
      } catch (error) {
        console.error("Error loading series data:", error);

        // Fallback to passed match data if API fails
        if (matchData) {
          const formattedData = formatSeriesData(matchData);
          setSeries(formattedData);
        }
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [matchId, matchData]
  );

  useEffect(() => {
    loadSeriesData();
  }, [loadSeriesData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSeriesData(true); // Force refresh
    setRefreshing(false);
  };

  // Modal management functions
  const openRoundsModal = (gameIndex) => {
    setSelectedGameIndex(gameIndex);
    setShowRoundsModal(true);
  };

  const closeRoundsModal = () => {
    setShowRoundsModal(false);
    setSelectedGameIndex(null);
  };

  // Get formatted players data for a specific game from both teams
  const getPlayersForGame = (gameIndex) => {
    // If the requested gameIndex doesn't exist on series.maps (e.g. synthetic live map),
    // fall back to the last available map so we reuse the same roster as the previous game.
    if (!series || !series.maps) return [];

    let effectiveIndex = gameIndex;
    if (!series.maps[gameIndex]) {
      effectiveIndex = Math.max(0, series.maps.length - 1);
    }

    const game = series.maps[effectiveIndex];
    const team1Players = series.team1Players?.results || [];
    const team2Players = series.team2Players?.results || [];

    // Filter only active players (status === 1)
    const activeTeam1Players = team1Players.filter(
      (player) => player && player.status === 1
    );
    const activeTeam2Players = team2Players.filter(
      (player) => player && player.status === 1
    );

    // Format for team 1
    const formattedTeam1Players = activeTeam1Players.map((player) => ({
      teamNumber: 1,
      player: {
        ign: player.nickname || "Unknown",
        id: player.id,
      },
      image_url: player.image_url || "https://via.placeholder.com/32",
    }));

    // Format for team 2
    const formattedTeam2Players = activeTeam2Players.map((player) => ({
      teamNumber: 2,
      player: {
        ign: player.nickname || "Unknown",
        id: player.id,
      },
      image_url: player.image_url || "https://via.placeholder.com/32",
    }));

    return [...formattedTeam1Players, ...formattedTeam2Players];
  };

  // Calculate attack/defense stats for CS2 from game_side_results
  const calculateCS2AttackDefenseStats = (gameIndex) => {
    if (!series || !series.maps || !series.maps[gameIndex]) {
      return {
        team1: { attack: 0, defense: 0 },
        team2: { attack: 0, defense: 0 },
      };
    }

    const game = series.maps[gameIndex];
    const roundsByHalves = organizeCS2RoundsByHalves(gameIndex);

    // Calculate attack/defense stats based on rounds won
    let team1Attack = 0,
      team1Defense = 0;
    let team2Attack = 0,
      team2Defense = 0;

    // Count rounds won on attack/defense for each team
    [
      ...roundsByHalves.firstHalf,
      ...roundsByHalves.secondHalf,
      ...roundsByHalves.overtime,
    ].forEach((round) => {
      if (round.winningTeamNumber === 1) {
        if (round.attackingTeamNumber === 1) {
          team1Attack++;
        } else {
          team1Defense++;
        }
      } else if (round.winningTeamNumber === 2) {
        if (round.attackingTeamNumber === 2) {
          team2Attack++;
        } else {
          team2Defense++;
        }
      }
    });

    return {
      team1: { attack: team1Attack, defense: team1Defense },
      team2: { attack: team2Attack, defense: team2Defense },
    };
  };

  // Get CS2 end reason icon
  const getCS2EndReasonIcon = (endReason) => {
    const iconMap = {
      TargetBombed: "bomb",
      BombDefused: "wrench",
      CTWin: "skull",
      TerroristsWin: "skull",
      TargetSaved: "clock",
    };
    return iconMap[endReason] || "skull"; // Default to skull for unknown reasons
  };

  // Try to fetch short_players_stats for richer player stats if not already present
  const fetchCopySeriesData = async () => {
    try {
      if (copySeriesData) return copySeriesData;
      // Determine slug to use
      const slug =
        series?.matchDetails?.slug || matchData?.slug || series?.matchSlug;
      if (!slug) return null;
      const url = `https://api.bo3.gg/api/v1/matches/${slug}/short_players_stats`;
      console.log("Fetching CS2 short_players_stats for copy modal:", url);
      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn("short_players_stats fetch failed", resp.status);
        return null;
      }
      const data = await resp.json();
      // Data expected as array of player aggregates per match
      const found = data || null;
      setCopySeriesData(found);
      return found;
    } catch (e) {
      console.error("Error fetching short_players_stats for copy modal", e);
      return null;
    }
  };

  const handleHeaderLongPress = async () => {
    console.log("Header long-press detected for copy/share modal", {
      hasCopyData: !!copySeriesData,
      seriesId: series?.id,
      slug: series?.matchDetails?.slug,
    });
    try {
      // If we already have prepared copy data, just show modal
      if (copySeriesData) {
        setShowCopyModal(true);
        return;
      }

      // Prevent concurrent header fetches
      if (loadingRef.current) {
        console.log(
          "Header long-press fetch already in progress, opening modal if data exists"
        );
        setShowCopyModal(true);
        return;
      }

      const preferShortPlayers = !!series?.matchDetails?.slug;
      loadingRef.current = true;

      if (preferShortPlayers) {
        console.log(
          "Attempting to fetch short_players_stats because match slug is available"
        );
        const fetched = await fetchCopySeriesData();
        if (fetched) {
          setCopySeriesData(fetched);
          setShowCopyModal(true);
          console.log(
            "Header long press: prepared copy series data (short_players_stats)",
            fetched
          );
          loadingRef.current = false;
          return;
        }
        console.log(
          "short_players_stats fetch returned no data, falling back to series data"
        );
      }

      // If no short stats or fetch failed, reuse already-loaded series player data when available
      const hasPlayerStats =
        series &&
        ((Array.isArray(series.team1Players) &&
          series.team1Players.length > 0) ||
          (series.team1Players &&
            series.team1Players.results &&
            series.team1Players.results.length > 0) ||
          (Array.isArray(series.team2Players) &&
            series.team2Players.length > 0) ||
          (series.team2Players &&
            series.team2Players.results &&
            series.team2Players.results.length > 0));

      if (hasPlayerStats) {
        setCopySeriesData(series);
        setShowCopyModal(true);
        console.log(
          "Header long press: prepared copy series data from series.teamPlayers"
        );
        loadingRef.current = false;
        return;
      }

      // As a last resort, try fetching short players stats even if we didn't prefer it earlier
      console.log(
        "No team player stats present, attempting fallback fetch for short_players_stats"
      );
      const fetchedFallback = await fetchCopySeriesData();
      if (fetchedFallback) setCopySeriesData(fetchedFallback);
      setShowCopyModal(true);
      console.log(
        "Header long press: prepared copy series data (fallback)",
        fetchedFallback || series
      );
    } catch (e) {
      console.error("Error handling header long press", e);
      setCopySeriesData(series);
      setShowCopyModal(true);
    } finally {
      loadingRef.current = false;
    }
  };

  const shareCopyCard = async () => {
    try {
      if (!copyCardRef || !copyCardRef.current) {
        console.warn("shareCopyCard: copyCardRef not available");
        Alert.alert(
          "Unavailable",
          "The summary card is not ready to share yet."
        );
        return;
      }

      // Expand ScrollView to show all content
      setIsCapturing(true);

      // Wait for render
      await new Promise((resolve) => setTimeout(resolve, 100));

      const uri = await captureRef(copyCardRef.current, {
        format: "png",
        quality: 0.95,
      });

      // Reset ScrollView
      setIsCapturing(false);

      if (uri) {
        try {
          const sharingAvailable =
            typeof Sharing.isAvailableAsync === "function"
              ? await Sharing.isAvailableAsync()
              : false;
          if (sharingAvailable) {
            await Sharing.shareAsync(uri, {
              dialogTitle: "Share Match Summary",
            });
          } else {
            await Share.share({ message: "Match summary", url: uri });
          }
        } catch (shareErr) {
          console.warn(
            "Primary sharing failed, falling back to native Share",
            shareErr
          );
          await Share.share({ message: "Match summary", url: uri });
        }
      }
    } catch (e) {
      console.error("Error sharing copy card", e);
      setIsCapturing(false); // Reset on error
      Alert.alert("Error", "Failed to share match summary");
    }
  };

  // Aggregate short players stats into team arrays
  const getAggregatedPlayerStats = (source = null) => {
    const src = source || copySeriesData || series;
    if (!src) return { team1Players: [], team2Players: [] };

    // If copySeriesData is an array (short_players_stats), map directly
    const shortPlayers = Array.isArray(src)
      ? src
      : src.shortPlayers || src.teamPlayersShort || [];
    if (Array.isArray(shortPlayers) && shortPlayers.length > 0) {
      const team1Id = series?.team1?.id;
      const team2Id = series?.team2?.id;
      const team1Players = shortPlayers
        .filter((p) => p.team_id === team1Id)
        .map((p) => ({
          playerId: p.player_id || p.playerId,
          displayName:
            p.player?.nickname ||
            p.nickname ||
            p.player_name ||
            p.player?.slug ||
            String(p.player_id),
          image_url: p.player.image_url,
          kills: p.kills_sum || p.kills || 0,
          deaths: p.deaths_sum || p.deaths || 0,
          assists: p.assists_sum || p.assists || 0,
          adr: p.adr_sum,
        }));
      const team2Players = shortPlayers
        .filter((p) => p.team_id === team2Id)
        .map((p) => ({
          playerId: p.player_id || p.playerId,
          displayName:
            p.player?.nickname ||
            p.nickname ||
            p.player_name ||
            p.player?.slug ||
            String(p.player_id),
          image_url: p.player.image_url,
          kills: p.kills_sum || p.kills || 0,
          deaths: p.deaths_sum || p.deaths || 0,
          assists: p.assists_sum || p.assists || 0,
          adr: p.adr_sum,
        }));
      return { team1Players, team2Players };
    }

    // Fallback: if series contains team1Players.results as earlier format
    const t1 =
      (series && series.team1Players && series.team1Players.results) || [];
    const t2 =
      (series && series.team2Players && series.team2Players.results) || [];
    const mapPlayer = (p) => ({
      playerId: p.id || p.player_id,
      displayName:
        p.nickname ||
        p.player?.nickname ||
        p.player_name ||
        p.slug ||
        String(p.id),
      kills: p.kills_sum || p.kills || 0,
      deaths: p.deaths_sum || p.deaths || 0,
      assists: p.assists_sum || p.assists || 0,
      adr: p.adr_sum,
    });
    return { team1Players: t1.map(mapPlayer), team2Players: t2.map(mapPlayer) };
  };

  // Organize rounds by halves using real data from 5.txt game_rounds
  const organizeCS2RoundsByHalves = (gameIndex) => {
    if (!series || !series.maps || !series.maps[gameIndex]) {
      return { firstHalf: [], secondHalf: [], overtime: [] };
    }

    const game = series.maps[gameIndex];

    // Get the actual game rounds data from the API (this would be from the 5.txt game_rounds array)
    // This comes from series.gameDetails.results[gameIndex].game_rounds - same structure as game_side_results
    const gameRounds =
      series.gameDetails?.results?.[gameIndex]?.game_rounds || [];

    const rounds = [];

    if (gameRounds.length > 0) {
      // Use real round data from API
      gameRounds.forEach((roundData, index) => {
        const roundNumber = roundData.round_number || index + 1;

        // Determine which team won this round based on winner_clan_name
        let winningTeamNumber = 1; // Default to team 1

        // Compare winner_clan_name with both team names (try different variations)
        const winnerClanName = roundData.winner_clan_name;
        const team1Name = series.team1?.name;
        const team2Name = series.team2?.name;

        // Check if the winner matches team2
        if (
          winnerClanName === team2Name ||
          winnerClanName === series.team2?.shortName ||
          (winnerClanName && team2Name && winnerClanName.includes(team2Name)) ||
          (winnerClanName && team2Name && team2Name.includes(winnerClanName))
        ) {
          winningTeamNumber = 2;
        } else {
        }

        // Determine attacking team based on winner_clan_side and end_reason
        let attackingTeamNumber;
        if (roundData.winner_clan_side === "T") {
          // If winner was T-side, they were attacking
          attackingTeamNumber = winningTeamNumber;
        } else {
          // If winner was CT-side, they were defending, so other team was attacking
          attackingTeamNumber = winningTeamNumber === 1 ? 2 : 1;
        }

        rounds.push({
          id: roundData.id || roundNumber,
          number: roundNumber,
          winningTeamNumber,
          attackingTeamNumber,
          winCondition: roundData.end_reason || "Elimination",
          winnerSide: roundData.winner_clan_side,
          winnerClanName: winnerClanName, // Store for debugging
        });
      });
    } else {
      // Fallback: Generate mock data based on final scores
      const totalRounds = game.team1Score + game.team2Score;
      let team1Rounds = 0;
      let team2Rounds = 0;

      for (let i = 1; i <= totalRounds; i++) {
        let winningTeamNumber;
        const team1Remaining = game.team1Score - team1Rounds;
        const team2Remaining = game.team2Score - team2Rounds;

        if (
          team1Remaining > 0 &&
          (team2Remaining === 0 || Math.random() < 0.5)
        ) {
          winningTeamNumber = 1;
          team1Rounds++;
        } else {
          winningTeamNumber = 2;
          team2Rounds++;
        }

        // Determine attacking team based on CS2 side switching rules
        let attackingTeamNumber;
        if (i <= 15) {
          attackingTeamNumber = i % 2 === 1 ? 1 : 2;
        } else {
          attackingTeamNumber = i % 2 === 1 ? 2 : 1;
        }

        rounds.push({
          id: i,
          number: i,
          winningTeamNumber,
          attackingTeamNumber,
          winCondition: [
            "TargetBombed",
            "BombDefused",
            "CTWin",
            "TerroristsWin",
          ][Math.floor(Math.random() * 4)],
          winnerSide: attackingTeamNumber === winningTeamNumber ? "T" : "CT",
        });
      }
    }

    const firstHalf = rounds.filter((r) => r.number <= 12);
    const secondHalf = rounds.filter((r) => r.number > 12 && r.number <= 24);
    const overtime = rounds.filter((r) => r.number > 24);

    return { firstHalf, secondHalf, overtime };
  };

  // Calculate head-to-head record from API data
  const calculateHeadToHeadRecord = () => {
    if (!series.headToHeadData?.results) {
      return { team1Wins: 0, team2Wins: 0, totalMatches: 0 };
    }

    const h2hMatches = series.headToHeadData.results;
    let team1Wins = 0;
    let team2Wins = 0;

    h2hMatches.forEach((match) => {
      if (match.winner_team_id === series.team1?.id) {
        team1Wins++;
      } else if (match.winner_team_id === series.team2?.id) {
        team2Wins++;
      }
    });

    return { team1Wins, team2Wins, totalMatches: h2hMatches.length };
  };

  // Render head-to-head record card (VAL style)
  const renderHeadToHeadCard = () => {
    const h2hRecord = calculateHeadToHeadRecord();

    return (
      <View style={[styles.h2hCard, { backgroundColor: theme.surface }]}>
        {/* Team 1 Section */}
        <View style={styles.h2hTeamSection}>
          {series.team1?.logoUrl ? (
            <Image
              source={{ uri: series.team1.logoUrl }}
              style={styles.h2hTeamLogo}
              resizeMode="contain"
            />
          ) : (
            <View
              style={[
                styles.h2hTeamLogo,
                {
                  backgroundColor: colors.primary,
                  justifyContent: "center",
                  alignItems: "center",
                  borderRadius: 20,
                },
              ]}
            >
              <Text
                style={{ fontSize: 14, fontWeight: "bold", color: "white" }}
              >
                {(series.team1?.shortName || series.team1?.name || "T1")
                  .substring(0, 1)
                  .toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={[styles.h2hTeamName, { color: theme.text }]}>
            {series.team1?.shortName || "TBD"}
          </Text>
        </View>

        {/* Score Section */}
        <View style={styles.h2hScoreSection}>
          <View style={styles.h2hScoreRow}>
            <Text style={[styles.h2hScore, { color: theme.text }]}>
              {h2hRecord.team1Wins}
            </Text>
            <Text
              style={[styles.h2hScoreSeparator, { color: theme.textSecondary }]}
            >
              -
            </Text>
            <Text style={[styles.h2hScore, { color: theme.text }]}>
              {h2hRecord.team2Wins}
            </Text>
          </View>
          <Text style={[styles.h2hMatchCount, { color: theme.textSecondary }]}>
            Last {h2hRecord.totalMatches} matches
          </Text>
        </View>

        {/* Team 2 Section */}
        <View style={styles.h2hTeamSection}>
          {series.team2?.logoUrl ? (
            <Image
              source={{ uri: series.team2.logoUrl }}
              style={styles.h2hTeamLogo}
              resizeMode="contain"
            />
          ) : (
            <View
              style={[
                styles.h2hTeamLogo,
                {
                  backgroundColor: colors.secondary,
                  justifyContent: "center",
                  alignItems: "center",
                  borderRadius: 20,
                },
              ]}
            >
              <Text
                style={{ fontSize: 14, fontWeight: "bold", color: "white" }}
              >
                {(series.team2?.shortName || series.team2?.name || "T2")
                  .substring(0, 1)
                  .toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={[styles.h2hTeamName, { color: theme.text }]}>
            {series.team2?.shortName || "TBD"}
          </Text>
        </View>
      </View>
    );
  };

  // Render recent matches list (VAL style)
  const renderRecentMatches = () => {
    if (
      !series.headToHeadData?.results ||
      series.headToHeadData.results.length === 0
    ) {
      return (
        <View style={styles.noDataContainer}>
          <Text style={[styles.noDataText, { color: theme.textSecondary }]}>
            No recent head-to-head matches found
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.recentMatchesList}>
        {series.headToHeadData.results.map((match, index) => {
          const isTeam1Winner = match.team1_score > match.team2_score;
          const isTeam2Winner = match.team2_score > match.team1_score;

          return (
            <TouchableOpacity
              key={match.id}
              style={[
                styles.recentMatchCard,
                { backgroundColor: theme.surfaceSecondary },
              ]}
              onPress={() =>
                navigation.push("CS2Results", {
                  matchId: match.id,
                  matchData: match,
                })
              }
              activeOpacity={0.7}
            >
              {/* Tournament Name */}
              <Text
                style={[
                  styles.recentMatchTournament,
                  { color: theme.textSecondary },
                ]}
              >
                {match.tournament?.name || "Tournament"}
              </Text>

              {/* Match Info Row */}
              <View style={styles.recentMatchRow}>
                {/* Team 1 */}
                <View style={styles.recentMatchTeamLeft}>
                  {match.team1?.image_url ? (
                    <Image
                      source={{ uri: match.team1.image_url }}
                      style={[
                        styles.recentMatchTeamLogo,
                        { opacity: !isTeam1Winner ? 0.6 : 1 },
                      ]}
                      resizeMode="contain"
                    />
                  ) : (
                    <View
                      style={[
                        styles.recentMatchTeamLogo,
                        {
                          backgroundColor: colors.primary,
                          justifyContent: "center",
                          alignItems: "center",
                          borderRadius: 12,
                          opacity: !isTeam1Winner ? 0.6 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 8,
                          fontWeight: "bold",
                          color: "white",
                        }}
                      >
                        {(match.team1?.name || "T1")
                          .substring(0, 1)
                          .toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text
                    style={[
                      styles.recentMatchTeamName,
                      {
                        color: theme.text,
                        opacity: !isTeam1Winner ? 0.6 : 1,
                      },
                    ]}
                  >
                    {match.team1?.name || "TBD"}
                  </Text>
                </View>

                {/* Score */}
                <View style={styles.recentMatchScore}>
                  <Text
                    style={[styles.recentMatchScoreText, { color: theme.text }]}
                  >
                    {match.team1_score} - {match.team2_score}
                  </Text>
                </View>

                {/* Team 2 */}
                <View style={styles.recentMatchTeamRight}>
                  {match.team2?.image_url ? (
                    <Image
                      source={{ uri: match.team2.image_url }}
                      style={[
                        styles.recentMatchTeamLogoRight,
                        { opacity: !isTeam2Winner ? 0.6 : 1 },
                      ]}
                      resizeMode="contain"
                    />
                  ) : (
                    <View
                      style={[
                        styles.recentMatchTeamLogoRight,
                        {
                          backgroundColor: colors.secondary,
                          justifyContent: "center",
                          alignItems: "center",
                          borderRadius: 12,
                          opacity: !isTeam2Winner ? 0.6 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 8,
                          fontWeight: "bold",
                          color: "white",
                        }}
                      >
                        {(match.team2?.name || "T2")
                          .substring(0, 1)
                          .toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text
                    style={[
                      styles.recentMatchTeamName,
                      {
                        color: theme.text,
                        opacity: !isTeam2Winner ? 0.6 : 1,
                      },
                    ]}
                  >
                    {match.team2?.name || "TBD"}
                  </Text>
                </View>
              </View>

              {/* Date */}
              <Text
                style={[styles.recentMatchDate, { color: theme.textSecondary }]}
              >
                {new Date(match.start_date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // Render Map Performance section
  // Helper function to get team name for Map Performance (show second word if 2 words)
  const getMapPerformanceTeamName = (teamName) => {
    if (!teamName) return "";
    const words = teamName.trim().split(" ");
    return words.length === 2 ? words[1] : teamName;
  };

  // Helper function to create tournament abbreviation (first letter of each capitalized word)
  const createTournamentAbbreviation = (tournamentName) => {
    if (!tournamentName) return "";

    const words = tournamentName.split(" ");
    const result = [];
    let capitalizedLetters = "";

    for (const word of words) {
      // If word is all caps or a number, add it separately (after any accumulated letters)
      if (
        /^\d+$/.test(word) ||
        (word.length > 1 && word === word.toUpperCase())
      ) {
        if (capitalizedLetters) {
          result.push(capitalizedLetters);
          capitalizedLetters = "";
        }
        result.push(word);
      }
      // If word starts with capital letter, accumulate the first letter
      else if (word[0] === word[0].toUpperCase()) {
        capitalizedLetters += word[0];
      }
    }

    // Add any remaining accumulated letters
    if (capitalizedLetters) {
      result.push(capitalizedLetters);
    }

    return result.join(" ");
  };

  // Helper function to calculate match result for a team from games array
  const calculateMatchResult = (games, teamId) => {
    if (!games || !Array.isArray(games) || !teamId)
      return { won: false, teamScore: 0, opponentScore: 0 };

    let teamWins = 0;
    let opponentWins = 0;

    games.forEach((game) => {
      const winnerId = game.winner_team_clan?.team?.id;
      if (winnerId === teamId) {
        teamWins++;
      } else {
        opponentWins++;
      }
    });

    return {
      won: teamWins > opponentWins,
      teamScore: teamWins,
      opponentScore: opponentWins,
    };
  };

  const renderMapPerformance = () => {
    if (
      !series.team1MapPool ||
      !series.team2MapPool ||
      !Array.isArray(series.team1MapPool) ||
      !Array.isArray(series.team2MapPool)
    ) {
      return (
        <View style={[styles.noDataContainer]}>
          <Text style={[styles.noDataText, { color: theme.textSecondary }]}>
            Map performance data not available
          </Text>
        </View>
      );
    }

    // Get maps with map_count values and combine team data
    const team1Maps = series.team1MapPool.filter(
      (map) => map.maps_count && map.maps_count > 0
    );
    const team2Maps = series.team2MapPool.filter(
      (map) => map.maps_count && map.maps_count > 0
    );

    // Create a set of all unique maps played by both teams
    const allMaps = new Set();
    team1Maps.forEach((map) => allMaps.add(map.map));
    team2Maps.forEach((map) => allMaps.add(map.map));

    const mapPerformanceData = Array.from(allMaps)
      .map((mapName) => {
        const team1MapData = team1Maps.find((map) => map.map === mapName);
        const team2MapData = team2Maps.find((map) => map.map === mapName);

        return {
          mapName,
          team1: {
            played: team1MapData?.maps_count || 0,
            won: team1MapData?.win_maps_count || 0,
            winRate: team1MapData?.maps_count
              ? (
                  ((team1MapData.win_maps_count || 0) /
                    team1MapData.maps_count) *
                  100
                ).toFixed(0)
              : "0",
          },
          team2: {
            played: team2MapData?.maps_count || 0,
            won: team2MapData?.win_maps_count || 0,
            winRate: team2MapData?.maps_count
              ? (
                  ((team2MapData.win_maps_count || 0) /
                    team2MapData.maps_count) *
                  100
                ).toFixed(0)
              : "0",
          },
        };
      })
      .filter((map) => map.team1.played > 0 || map.team2.played > 0);

    if (mapPerformanceData.length === 0) {
      return (
        <View style={[styles.noDataContainer]}>
          <Text style={[styles.noDataText, { color: theme.textSecondary }]}>
            No map performance data available
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.mapStatsGrid}>
        {mapPerformanceData.map((mapData, index) => (
          <View key={mapData.mapName} style={styles.mapStatCard}>
            <Image
              source={{
                uri: getCS2MapImageUrl(
                  mapData.mapName?.replace("de_", "") ||
                    mapData.mapName?.toLowerCase()
                ),
              }}
              style={styles.mapStatBackground}
              resizeMode="cover"
            />
            <View style={styles.mapStatOverlay} />
            <View style={styles.mapStatContent}>
              <Text style={[styles.mapStatName, { color: "white" }]}>
                {getMapDisplayName(mapData.mapName)}
              </Text>

              <View style={styles.mapStatTeams}>
                <View style={styles.mapStatTeam}>
                  <Text style={[styles.mapStatTeamName, { color: "white" }]}>
                    {getMapPerformanceTeamName(series.team1?.shortName)}
                  </Text>
                  <Text style={[styles.mapStatWinRate, { color: "white" }]}>
                    {mapData.team1.winRate}%
                  </Text>
                  <Text
                    style={[
                      styles.mapStatRecord,
                      { color: "rgba(255,255,255,0.8)" },
                    ]}
                  >
                    {mapData.team1.won}W{" "}
                    {mapData.team1.played - mapData.team1.won}L
                  </Text>
                </View>

                <View style={styles.mapStatDivider} />

                <View style={styles.mapStatTeam}>
                  <Text style={[styles.mapStatTeamName, { color: "white" }]}>
                    {getMapPerformanceTeamName(series.team2?.shortName)}
                  </Text>
                  <Text style={[styles.mapStatWinRate, { color: "white" }]}>
                    {mapData.team2.winRate}%
                  </Text>
                  <Text
                    style={[
                      styles.mapStatRecord,
                      { color: "rgba(255,255,255,0.8)" },
                    ]}
                  >
                    {mapData.team2.won}W{" "}
                    {mapData.team2.played - mapData.team2.won}L
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ))}
      </View>
    );
  };

  // Prepare mapsToRender: include existing maps and any synthetic live map from live_updates
  const mapsToRender = (() => {
    if (!series) return [];

    console.log("=== SYNTHETIC MAP GENERATION DEBUG ===");
    console.log("Series exists:", !!series);
    console.log("Series.maps count:", series.maps?.length);
    console.log("Series.matchDetails exists:", !!series.matchDetails);
    console.log(
      "Series.matchDetails.live_updates:",
      series.matchDetails?.live_updates
    );
    console.log("MatchData.live_updates:", matchData?.live_updates);

    const baseMaps = Array.isArray(series.maps) ? series.maps.slice() : [];
    const normalized = baseMaps.map((m, i) => ({
      ...(m || {}),
      originalIndex: i,
    }));

    console.log("Base maps count:", baseMaps.length);
    console.log(
      "Base maps detailed:",
      baseMaps.map((m, i) => ({
        index: i,
        name: m?.name,
        id: m?.id,
        status: m?.status,
        completed: m?.completed,
        hasName: !!m?.name,
        full: m,
        winner: m.winner,
      }))
    );
    console.log(
      "Normalized maps:",
      normalized.map((m) => ({
        name: m.name,
        originalIndex: m.originalIndex,
        hasName: !!m.name,
      }))
    );

    // Check multiple possible sources for live_updates
    let liveUpdates = null;
    if (
      series.matchDetails?.live_updates &&
      typeof series.matchDetails.live_updates === "object"
    ) {
      liveUpdates = [series.matchDetails.live_updates]; // Single object, wrap in array
    } else if (Array.isArray(series.matchDetails?.live_updates)) {
      liveUpdates = series.matchDetails.live_updates;
    } else if (
      matchData?.live_updates &&
      typeof matchData.live_updates === "object"
    ) {
      liveUpdates = [matchData.live_updates]; // Single object, wrap in array
    } else if (Array.isArray(matchData?.live_updates)) {
      liveUpdates = matchData.live_updates;
    }

    console.log("Live updates found:", !!liveUpdates);
    console.log(
      "Live updates type:",
      Array.isArray(liveUpdates) ? "array" : typeof liveUpdates
    );
    console.log("Live updates content:", liveUpdates);

    if (liveUpdates && Array.isArray(liveUpdates) && liveUpdates.length > 0) {
      console.log("Processing", liveUpdates.length, "live update entries");

      liveUpdates.forEach((update, updateIndex) => {
        console.log(`Processing update ${updateIndex}:`, update);

        const gameNumber = update?.game_number
          ? parseInt(update.game_number, 10)
          : null;
        const mapName = update?.map_name || update?.map || null;

        console.log(
          `Update ${updateIndex}: gameNumber=${gameNumber}, mapName=${mapName}`
        );

        if (!gameNumber || !mapName) {
          console.log(
            `Skipping update ${updateIndex}: missing gameNumber or mapName`
          );
          return;
        }

        const desiredIndex = Math.max(0, gameNumber - 1);

        // Check if a complete map already exists at this index or with this name
        const existingMaps = normalized.filter(
          (m) => m.originalIndex === desiredIndex
        );
        const realMapExists = normalized.some((m) => {
          const sameIndexWithName = m.originalIndex === desiredIndex && m.name; // Must have a name to count as existing
          const sameName =
            m.name &&
            mapName &&
            m.name.toLowerCase().includes(mapName.toLowerCase());
          const isComplete =
            m.begin_at &&
            (m.winner_clan_score !== null || m.loser_clan_score !== null);
          const isFinished = m.completed === true; // Check if game is actually finished using completed field
          return (sameIndexWithName || sameName) && (isComplete || isFinished);
        });

        console.log(
          `Update ${updateIndex}: desiredIndex=${desiredIndex}, realMapExists=${realMapExists}`
        );
        console.log(
          `Existing maps at index ${desiredIndex}:`,
          existingMaps.map((m) => ({
            name: m.name,
            hasName: !!m.name,
            begin_at: m.begin_at,
            winner_clan_score: m.winner_clan_score,
            loser_clan_score: m.loser_clan_score,
            completed: m.completed,
            isComplete: !!(
              m.begin_at &&
              (m.winner_clan_score !== null || m.loser_clan_score !== null)
            ),
            isFinished: m.completed === true,
          }))
        );

        if (realMapExists) {
          console.log(
            `Skipping update ${updateIndex}: complete real map already exists`
          );
          return;
        }

        // If there's an incomplete map at this index, we'll replace it
        if (existingMaps.length > 0) {
          const incompleteMap = existingMaps[0];
          console.log(`Replacing incomplete map at index ${desiredIndex}:`, {
            name: incompleteMap.name,
            begin_at: incompleteMap.begin_at,
            winner_clan_score: incompleteMap.winner_clan_score,
            loser_clan_score: incompleteMap.loser_clan_score,
          });

          // Remove the incomplete map from normalized array
          const indexToRemove = normalized.findIndex(
            (m) => m.originalIndex === desiredIndex
          );
          if (indexToRemove !== -1) {
            normalized.splice(indexToRemove, 1);
          }
        }

        // Check if this game is actually finished based on live_updates or series maps data
        const gameEnded =
          update.game_ended === true || update.round_phase === "FINISHED";
        const correspondingMap = baseMaps.find(
          (m) =>
            m.number === gameNumber ||
            (m.name &&
              mapName &&
              m.name.toLowerCase().includes(mapName.toLowerCase()))
        );
        const mapActuallyFinished = correspondingMap?.completed === true;

        console.log(`Game ${gameNumber} status check:`, {
          gameEnded,
          mapActuallyFinished,
          correspondingMapCompleted: correspondingMap?.completed,
          correspondingMapId: correspondingMap?.id,
          shouldBeFinished: gameEnded || mapActuallyFinished,
        });

        // If the game is actually finished, don't create a synthetic live map
        if (gameEnded || mapActuallyFinished) {
          console.log(
            `Skipping synthetic map for game ${gameNumber}: game is finished`
          );
          return;
        }

        const synthetic = {
          id: `live-${gameNumber}`,
          name: mapName,
          team1Score:
            update.team_1?.game_score ??
            update.team1_score ??
            update.winner_clan_score ??
            0,
          team2Score:
            update.team_2?.game_score ??
            update.team2_score ??
            update.loser_clan_score ??
            0,
          completed: false,
          liveBadge: true,
          originalIndex: desiredIndex,
          hasRealRounds: false,
        };

        console.log(
          `Creating synthetic map for update ${updateIndex}:`,
          synthetic
        );

        // If there's a placeholder map at this index (no name), replace it
        const placeholderIndex = normalized.findIndex(
          (m) => m.originalIndex === desiredIndex && !m.name
        );
        if (placeholderIndex !== -1) {
          console.log(`Replacing placeholder at index ${placeholderIndex}`);
          normalized[placeholderIndex] = synthetic;
        } else {
          // Otherwise insert at the appropriate position
          const insertAt = Math.min(desiredIndex, normalized.length);
          normalized.splice(insertAt, 0, synthetic);
          console.log(`Inserted synthetic map at index ${insertAt}`);
        }
      });
    } else {
      console.log("No valid live updates found for synthetic map generation");
    }

    console.log(
      "Final normalized maps:",
      normalized.map((m) => ({
        id: m.id,
        name: m.name,
        originalIndex: m.originalIndex,
        liveBadge: m.liveBadge,
        team1Score: m.team1Score,
        team2Score: m.team2Score,
      }))
    );

    return normalized;
  })();

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading match details...
          </Text>
        </View>
      </View>
    );
  }

  if (!series) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={theme.textTertiary} />
          <Text style={[styles.errorTitle, { color: theme.text }]}>
            Match Not Found
          </Text>
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>
            Unable to load match details. Please try again.
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        {/* Series Header - EXACT VAL style with floating header */}
        <TouchableOpacity
          style={[
            styles.seriesHeader,
            { backgroundColor: theme.surfaceSecondary },
          ]}
          activeOpacity={1}
          onLongPress={handleHeaderLongPress}
          delayLongPress={250}
        >
          {/* Event Name */}
          <TouchableOpacity
            style={styles.eventHeaderContainer}
            onPress={() =>
              navigation.navigate("CS2Tournament", {
                tournamentId: series.tournamentId,
                tournamentSlug: series.tournamentSlug,
              })
            }
          >
            <Text style={[styles.eventName, { color: theme.text }]}>
              {series.eventName || "CS2 Match Details"}
            </Text>
          </TouchableOpacity>
          {/* Main Matchup Row */}
          <View style={styles.matchupRow}>
            {/* Team 1 Complete Section */}
            <View style={styles.teamCompleteSection}>
              {/* Logo and Score Row */}
              <View style={styles.logoScoreRow}>
                <TouchableOpacity
                  onPress={() => {
                    if (series.team1?.id) {
                      navigation.navigate("CS2TeamPage", {
                        teamId: series.team1.id,
                        teamName: series.team1.name,
                        teamSlug: series.team1.name
                          .toLowerCase()
                          .replace(/\s+/g, "-"),
                      });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  {series.team1?.logoUrl ? (
                    <Image
                      source={{ uri: series.team1.logoUrl }}
                      style={[
                        styles.teamLogoHead,
                        {
                          opacity:
                            series.completed &&
                            !series.live &&
                            series.team1Score < series.team2Score
                              ? 0.6
                              : 1,
                        },
                      ]}
                      resizeMode="contain"
                    />
                  ) : (
                    <View
                      style={[
                        styles.teamLogoHead,
                        {
                          backgroundColor: colors.primary,
                          justifyContent: "center",
                          alignItems: "center",
                          borderRadius: 32,
                          opacity:
                            series.completed &&
                            !series.live &&
                            series.team1Score < series.team2Score
                              ? 0.6
                              : 1,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 20,
                          fontWeight: "bold",
                          color: "white",
                        }}
                      >
                        {(series.team1?.shortName || series.team1?.name || "T1")
                          .substring(0, 2)
                          .toUpperCase()}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                {!series.completed && !series.live ? null : (
                <Text
                  style={[
                    styles.scoreText,
                    {
                      color: theme.text,
                      opacity:
                        series.completed &&
                        !series.live &&
                        series.team1Score < series.team2Score
                          ? 0.6
                          : 1,
                    },
                  ]}
                >
                  {series.team1Score || 0}
                </Text>
                )}
              </View>
              {/* Team Name Below */}
              <Text
                style={[
                  styles.teamName,
                  {
                    color: theme.text,
                    opacity:
                      series.completed &&
                      !series.live &&
                      series.team1Score < series.team2Score
                        ? 0.6
                        : 1,
                  },
                ]}
              >
                {series.team1?.shortName || "TBD"}
              </Text>
            </View>

            {/* Score Separator */}
            <Text
              style={[styles.scoreSeparator, { color: theme.textSecondary }]}
            >
              {!series.completed && !series.live ? "vs" : "-"}
            </Text>

            {/* Team 2 Complete Section */}
            <View style={styles.teamCompleteSection}>
              {/* Score and Logo Row */}
              <View style={styles.logoScoreRow}>
                {!series.completed && !series.live ? null : (
                <Text
                  style={[
                    styles.scoreText,
                    {
                      color: theme.text,
                      opacity:
                        series.completed &&
                        !series.live &&
                        series.team2Score < series.team1Score
                          ? 0.6
                          : 1,
                    },
                  ]}
                >
                  {series.team2Score || 0}
                </Text>
                )}
                <TouchableOpacity
                  onPress={() => {
                    if (series.team2?.id) {
                      navigation.navigate("CS2TeamPage", {
                        teamId: series.team2.id,
                        teamName: series.team2.name,
                        teamSlug: series.team2.name
                          .toLowerCase()
                          .replace(/\s+/g, "-"),
                      });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  {series.team2?.logoUrl ? (
                    <Image
                      source={{ uri: series.team2.logoUrl }}
                      style={[
                        styles.teamLogoHead,
                        {
                          opacity:
                            series.completed &&
                            !series.live &&
                            series.team2Score < series.team1Score
                              ? 0.6
                              : 1,
                        },
                      ]}
                      resizeMode="contain"
                    />
                  ) : (
                    <View
                      style={[
                        styles.teamLogoHead,
                        {
                          backgroundColor: colors.secondary,
                          justifyContent: "center",
                          alignItems: "center",
                          borderRadius: 32,
                          opacity:
                            series.completed &&
                            !series.live &&
                            series.team2Score < series.team1Score
                              ? 0.6
                              : 1,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 20,
                          fontWeight: "bold",
                          color: "white",
                        }}
                      >
                        {(series.team2?.shortName || series.team2?.name || "T2")
                          .substring(0, 2)
                          .toUpperCase()}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
              {/* Team Name Below */}
              <Text
                style={[
                  styles.teamName,
                  {
                    color: theme.text,
                    opacity:
                      series.completed &&
                      !series.live &&
                      series.team2Score < series.team1Score
                        ? 0.6
                        : 1,
                  },
                ]}
              >
                {series.team2?.shortName || "TBD"}
              </Text>
            </View>
          </View>

          {/* Status and Date */}
          <View style={styles.statusDateContainer}>
            {series.completed ? (
              <View
                style={[styles.statusBadge, { backgroundColor: theme.success }]}
              >
                <Text style={styles.statusText}>FINISHED</Text>
              </View>
            ) : series.live ? (
              <View
                style={[styles.statusBadge, { backgroundColor: theme.error }]}
              >
                <Text style={styles.statusText}>LIVE</Text>
              </View>
            ) : (
              <View
                style={[styles.statusBadge, { backgroundColor: theme.warning }]}
              >
                <Text style={styles.statusText}>SCHEDULED</Text>
              </View>
            )}

            {series.startDate && (
              <Text style={[styles.dateText, { color: theme.textSecondary }]}>
                {new Date(series.startDate).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}{" "}
                •{" "}
                {new Date(series.startDate).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "numeric",
                  hour12: true,
                })}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Tab Navigation - EXACT VAL style */}
        <View style={[styles.tabContainer, { backgroundColor: theme.surface }]}>
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === "overview" && {
                borderBottomColor: colors.primary,
                borderBottomWidth: 2,
              },
            ]}
            onPress={() => setActiveTab("overview")}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    activeTab === "overview"
                      ? colors.primary
                      : theme.textSecondary,
                },
              ]}
            >
              Overview
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === "stats" && {
                borderBottomColor: colors.primary,
                borderBottomWidth: 2,
              },
            ]}
            onPress={() => setActiveTab("stats")}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    activeTab === "stats"
                      ? colors.primary
                      : theme.textSecondary,
                },
              ]}
            >
              Stats
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <View style={styles.contentContainer}>
            {/* Game Details Section */}
            <View style={styles.gameDetailsSection}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Map results
              </Text>

              {series.maps && series.maps.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.gameScrollView}
                  contentContainerStyle={styles.gameScrollContent}
                >
                  {mapsToRender
                    .filter((map) => map.name) // Only render if map name exists
                    .map((map, index) => {
                      const mapDisplayName = getMapDisplayName(map.name);
                      const team1Won =
                        (map.team1Score || 0) > (map.team2Score || 0);
                      const team2Won =
                        (map.team2Score || 0) > (map.team1Score || 0);
                      console.log(map, "MAP DATA RENDERING DEBUG");
                      // Use originalIndex to fetch players; fallback logic in getPlayersForGame will reuse roster
                      const players = getPlayersForGame(
                        typeof map.originalIndex === "number"
                          ? map.originalIndex
                          : index
                      );
                      const hasRounds =
                        map.results &&
                        Array.isArray(map.results) &&
                        map.results.length > 0;

                      return (
                        <TouchableOpacity
                          key={index}
                          style={[
                            styles.gameCard,
                            { backgroundColor: theme.surface },
                          ]}
                          activeOpacity={0.8}
                          onPress={() => {
                            // Check if this is a live game
                            if (
                              map.liveBadge ||
                              (series.matchDetails?.live_updates &&
                                !map.completed)
                            ) {
                              // Navigate to live match details screen
                              navigation.navigate("CS2MatchDetails", {
                                matchId: series.matchDetails?.id || series.id,
                                matchData: series.matchDetails || matchData,
                              });
                            } else {
                              // Navigate to regular match screen for completed games
                              navigation.navigate("CS2Match", {
                                gameId: map.id,
                                seriesSlug:
                                  series.matchDetails?.slug ||
                                  `match-${series.id}`,
                                mapName:
                                  map.name || map.displayName?.toLowerCase(),
                              });
                            }
                          }}
                        >
                          {/* SECTION 1: Header */}
                          <View
                            style={[
                              styles.headerSection,
                              { backgroundColor: theme.surface },
                            ]}
                          >
                            <Text
                              style={[styles.gameTitle, { color: theme.text }]}
                            >
                              Game {index + 1}
                            </Text>
                            {map.liveBadge ? (
                              <View
                                style={[
                                  styles.gameStatus,
                                  { backgroundColor: theme.error },
                                ]}
                              >
                                <Text style={styles.gameStatusText}>LIVE</Text>
                              </View>
                            ) : map.completed ? (
                              <View
                                style={[
                                  styles.gameStatus,
                                  { backgroundColor: theme.success },
                                ]}
                              >
                                <Text style={styles.gameStatusText}>
                                  FINISHED
                                </Text>
                              </View>
                            ) : (
                              <View
                                style={[
                                  styles.gameStatus,
                                  { backgroundColor: theme.warning },
                                ]}
                              >
                                <Text style={styles.gameStatusText}>
                                  SCHEDULED
                                </Text>
                              </View>
                            )}
                          </View>

                          {/* SECTION 2: Map & Score */}
                          <View style={styles.mapScoreSection}>
                            {/* Map Background */}
                            <Image
                              source={{
                                uri: getCS2MapImageUrl(
                                  map.name?.replace("de_", "") ||
                                    map.displayName?.toLowerCase()
                                ),
                              }}
                              style={styles.mapBackground}
                              resizeMode="cover"
                            />

                            {/* Map Overlay */}
                            <View style={styles.mapOverlay} />

                            {/* Score Content */}
                            <View style={styles.scoreContent}>
                              <View style={styles.teamScoreContainer}>
                                {series.team1?.logoUrl ? (
                                  <Image
                                    source={{ uri: series.team1.logoUrl }}
                                    style={[
                                      styles.teamLogo,
                                      {
                                        opacity:
                                          map.completed && !team1Won ? 0.6 : 1,
                                      },
                                    ]}
                                    resizeMode="contain"
                                  />
                                ) : (
                                  <View
                                    style={[
                                      styles.teamLogo,
                                      {
                                        backgroundColor: colors.primary,
                                        justifyContent: "center",
                                        alignItems: "center",
                                        borderRadius: 16,
                                        opacity:
                                          map.completed && !team1Won ? 0.6 : 1,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 12,
                                        fontWeight: "bold",
                                        color: "white",
                                      }}
                                    >
                                      {(
                                        series.team1?.shortName ||
                                        series.team1?.name ||
                                        "T1"
                                      )
                                        .substring(0, 1)
                                        .toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                                <Text
                                  style={[
                                    styles.gameScoreText,
                                    {
                                      color: "white",
                                      opacity:
                                        map.completed && !team1Won ? 0.6 : 1,
                                    },
                                  ]}
                                >
                                  {map.team1Score || 0}
                                </Text>
                              </View>

                              <View style={styles.mapNameContainer}>
                                <Text
                                  style={[styles.mapName, { color: "white" }]}
                                >
                                  {mapDisplayName}
                                </Text>
                              </View>

                              <View style={styles.teamScoreContainer}>
                                {series.team2?.logoUrl ? (
                                  <Image
                                    source={{ uri: series.team2.logoUrl }}
                                    style={[
                                      styles.teamLogo,
                                      {
                                        opacity:
                                          map.completed && !team2Won ? 0.6 : 1,
                                      },
                                    ]}
                                    resizeMode="contain"
                                  />
                                ) : (
                                  <View
                                    style={[
                                      styles.teamLogo,
                                      {
                                        backgroundColor: colors.secondary,
                                        justifyContent: "center",
                                        alignItems: "center",
                                        borderRadius: 16,
                                        opacity:
                                          map.completed && !team2Won ? 0.6 : 1,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 12,
                                        fontWeight: "bold",
                                        color: "white",
                                      }}
                                    >
                                      {(
                                        series.team2?.shortName ||
                                        series.team2?.name ||
                                        "T2"
                                      )
                                        .substring(0, 1)
                                        .toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                                <Text
                                  style={[
                                    styles.gameScoreText,
                                    {
                                      color: "white",
                                      opacity:
                                        map.completed && !team2Won ? 0.6 : 1,
                                    },
                                  ]}
                                >
                                  {map.team2Score || 0}
                                </Text>
                              </View>
                            </View>
                          </View>

                          {/* SECTION 3: Players */}
                          <View
                            style={[
                              styles.playersSection,
                              { backgroundColor: theme.surface },
                            ]}
                          >
                            {players && players.length > 0 && (
                              <>
                                {/* Teams Side by Side */}
                                <View style={styles.teamsContainer}>
                                  {/* Team 1 - Left Side */}
                                  <View style={styles.leftTeamContainer}>
                                    <Text
                                      style={[
                                        styles.teamLabel,
                                        { color: theme.text },
                                      ]}
                                    >
                                      {series.team1?.shortName || "Team 1"}
                                    </Text>
                                    <View style={styles.leftPlayersColumn}>
                                      {players
                                        .filter(
                                          (player) => player.teamNumber === 1
                                        )
                                        .slice(0, 5)
                                        .map((player, pIndex) => {
                                          return (
                                            <View
                                              key={pIndex}
                                              style={styles.leftPlayerItem}
                                            >
                                              <Image
                                                source={{
                                                  uri:
                                                    player.image_url ||
                                                    "https://via.placeholder.com/32",
                                                }}
                                                style={styles.playerImage}
                                                resizeMode="cover"
                                              />
                                              <View style={styles.playerInfo}>
                                                <Text
                                                  style={[
                                                    styles.playerName,
                                                    { color: theme.text },
                                                  ]}
                                                >
                                                  {player.player?.ign}
                                                </Text>
                                              </View>
                                            </View>
                                          );
                                        })}
                                    </View>
                                  </View>

                                  {/* Team 2 - Right Side */}
                                  <View style={styles.rightTeamContainer}>
                                    <Text
                                      style={[
                                        styles.teamLabel,
                                        { color: theme.text },
                                      ]}
                                    >
                                      {series.team2?.shortName || "Team 2"}
                                    </Text>
                                    <View style={styles.rightPlayersColumn}>
                                      {players
                                        .filter(
                                          (player) => player.teamNumber === 2
                                        )
                                        .slice(0, 5)
                                        .map((player, pIndex) => {
                                          return (
                                            <View
                                              key={pIndex}
                                              style={styles.rightPlayerItem}
                                            >
                                              <View
                                                style={styles.playerInfoRight}
                                              >
                                                <Text
                                                  style={[
                                                    styles.playerName,
                                                    {
                                                      color: theme.text,
                                                      textAlign: "right",
                                                    },
                                                  ]}
                                                >
                                                  {player.player?.ign}
                                                </Text>
                                              </View>
                                              <Image
                                                source={{
                                                  uri:
                                                    player.image_url ||
                                                    "https://via.placeholder.com/32",
                                                }}
                                                style={styles.playerImage}
                                                resizeMode="cover"
                                              />
                                            </View>
                                          );
                                        })}
                                    </View>
                                  </View>
                                </View>

                                {/* Action Buttons - Only Rounds button for CS2 */}
                                {hasRounds && (
                                  <View style={styles.gameActions}>
                                    <TouchableOpacity
                                      style={[
                                        styles.actionButton,
                                        { backgroundColor: colors.primary },
                                      ]}
                                      onPress={() =>
                                        openRoundsModal(
                                          map.originalIndex ?? index
                                        )
                                      }
                                    >
                                      <Text style={styles.actionButtonText}>
                                        Rounds
                                      </Text>
                                    </TouchableOpacity>
                                  </View>
                                )}
                              </>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                </ScrollView>
              ) : (
                <View style={styles.noMapsContainer}>
                  <Text
                    style={[styles.noMapsText, { color: theme.textSecondary }]}
                  >
                    No map data available
                  </Text>
                </View>
              )}
            </View>

            {/* Maps Section */}
            {series.pickban && series.pickban.length > 0 && (
              <View style={styles.mapsSection}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Maps
                </Text>

                <View style={styles.mapsGrid}>
                  {series.pickban.map((pickban, index) => {
                    const mapName = pickban.mapName;
                    const isPick = pickban.type === "pick";
                    const isBan = pickban.type === "ban";
                    const isLeftover = pickban.isLeftover;

                    // Get team info - ensure type comparison works correctly
                    const team =
                      pickban.teamId == series.team1?.id
                        ? series.team1
                        : series.team2;
                    const teamName = team?.shortName || "Unknown";

                    // Determine display text
                    let displayText;
                    if (isLeftover) {
                      displayText = "Decider";
                    } else {
                      displayText = `${teamName} - ${isPick ? "PICK" : "BAN"}`;
                    }

                    return (
                      <View
                        key={index}
                        style={[
                          styles.mapCard,
                          { backgroundColor: theme.surface },
                          isBan && !isLeftover && { opacity: 0.6 },
                        ]}
                      >
                        <Image
                          source={{ uri: getCS2MapImageUrl(pickban.mapSlug) }}
                          style={styles.mapImage}
                          resizeMode="cover"
                        />

                        {/* Ban overlay - only on the image */}
                        {isBan && !isLeftover && (
                          <View style={styles.mapBanImageOverlay}>
                            <Ionicons
                              name="close"
                              size={40}
                              color="rgba(255, 255, 255, 0.9)"
                              style={styles.banIcon}
                            />
                          </View>
                        )}

                        <View style={styles.mapCardOverlay}>
                          <Text
                            style={[styles.mapCardName, { color: "white" }]}
                          >
                            {mapName}
                          </Text>

                          <View
                            style={[
                              styles.mapTypeBadge,
                              {
                                backgroundColor: isLeftover
                                  ? theme.warning
                                  : isPick
                                  ? theme.success
                                  : theme.error,
                              },
                            ]}
                          >
                            <Text
                              style={[styles.mapTypeText, { color: "white" }]}
                            >
                              {displayText}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}

        {activeTab === "stats" && (
          <View style={styles.contentContainer}>
            {/* Head-to-Head Record Section */}
            <View style={styles.headToHeadSection}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Head-to-Head Record
              </Text>

              {/* H2H Record Card */}
              {renderHeadToHeadCard()}

              {/* Recent Matches */}
              <Text style={[styles.recentMatchesTitle, { color: theme.text }]}>
                Recent Matches
              </Text>

              {renderRecentMatches()}

              {/* Map Performance Section */}
              <Text
                style={[
                  styles.sectionTitle,
                  { color: theme.text, marginTop: 24 },
                ]}
              >
                Map Performance
              </Text>

              {renderMapPerformance()}

              {/* Recent Form - Team 1 */}
              {series.team1RecentMatches?.results &&
                series.team1RecentMatches.results.length > 0 && (
                  <View style={[styles.statsSection, { marginBottom: 15 }]}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>
                      {getMapPerformanceTeamName(series.team1?.shortName)}{" "}
                      Recent Form
                    </Text>

                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.recentFormScroll}
                    >
                      {series.team1RecentMatches.results
                        .slice(0, 5)
                        .map((match, index) => {
                          const isTeam1 = match.team1?.id === series.team1?.id;
                          const opponent = isTeam1 ? match.team2 : match.team1;
                          const result = calculateMatchResult(
                            match.games,
                            series.team1?.id
                          );
                          const tournamentAbbr = createTournamentAbbreviation(
                            match.tournament?.name
                          );

                          return (
                            <TouchableOpacity
                              key={match.id}
                              style={[
                                styles.recentFormGameCard,
                                { backgroundColor: theme.surface },
                              ]}
                              onPress={() =>
                                navigation.push("CS2Results", {
                                  matchId: match.id,
                                  matchData: match,
                                })
                              }
                              activeOpacity={0.7}
                            >
                              <View
                                style={[
                                  styles.formResultBadge,
                                  {
                                    backgroundColor: result.won
                                      ? theme.success
                                      : theme.error,
                                  },
                                ]}
                              >
                                <Text style={styles.formResultText}>
                                  {result.won ? "W" : "L"}
                                </Text>
                              </View>

                              <View style={styles.formGameContent}>
                                <Text
                                  style={[
                                    styles.formEventName,
                                    { color: theme.textSecondary },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {tournamentAbbr}
                                </Text>

                                <View style={styles.formMatchup}>
                                  {series.team1?.logoUrl ? (
                                    <Image
                                      source={{ uri: series.team1.logoUrl }}
                                      style={styles.formTeamLogo}
                                      resizeMode="contain"
                                    />
                                  ) : (
                                    <View
                                      style={[
                                        styles.formTeamLogo,
                                        {
                                          backgroundColor: colors.primary,
                                          justifyContent: "center",
                                          alignItems: "center",
                                          borderRadius: 8,
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={{
                                          fontSize: 6,
                                          fontWeight: "bold",
                                          color: "white",
                                        }}
                                      >
                                        {(
                                          series.team1?.shortName ||
                                          series.team1?.name ||
                                          "T1"
                                        )
                                          .substring(0, 1)
                                          .toUpperCase()}
                                      </Text>
                                    </View>
                                  )}
                                  <View style={styles.formScoreContainer}>
                                    <Text
                                      style={[
                                        styles.formScore,
                                        { color: theme.text },
                                      ]}
                                    >
                                      {result.teamScore} -{" "}
                                      {result.opponentScore}
                                    </Text>
                                  </View>
                                  {opponent?.image_url ? (
                                    <Image
                                      source={{ uri: opponent.image_url }}
                                      style={styles.formTeamLogo}
                                      resizeMode="contain"
                                    />
                                  ) : (
                                    <View
                                      style={[
                                        styles.formTeamLogo,
                                        {
                                          backgroundColor: colors.secondary,
                                          justifyContent: "center",
                                          alignItems: "center",
                                          borderRadius: 8,
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={{
                                          fontSize: 6,
                                          fontWeight: "bold",
                                          color: "white",
                                        }}
                                      >
                                        {(
                                          opponent?.short_name ||
                                          opponent?.name ||
                                          "T2"
                                        )
                                          .substring(0, 1)
                                          .toUpperCase()}
                                      </Text>
                                    </View>
                                  )}
                                </View>

                                <Text
                                  style={[
                                    styles.formDate,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  {new Date(
                                    match.start_date
                                  ).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                    </ScrollView>
                  </View>
                )}

              {/* Recent Form - Team 2 */}
              {series.team2RecentMatches?.results &&
                series.team2RecentMatches.results.length > 0 && (
                  <View style={styles.statsSection}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>
                      {getMapPerformanceTeamName(series.team2?.shortName)}{" "}
                      Recent Form
                    </Text>

                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.recentFormScroll}
                    >
                      {series.team2RecentMatches.results
                        .slice(0, 5)
                        .map((match, index) => {
                          const isTeam1 = match.team1?.id === series.team2?.id;
                          const opponent = isTeam1 ? match.team2 : match.team1;
                          const result = calculateMatchResult(
                            match.games,
                            series.team2?.id
                          );
                          const tournamentAbbr = createTournamentAbbreviation(
                            match.tournament?.name
                          );

                          return (
                            <TouchableOpacity
                              key={match.id}
                              style={[
                                styles.recentFormGameCard,
                                { backgroundColor: theme.surface },
                              ]}
                              onPress={() =>
                                navigation.push("CS2Results", {
                                  matchId: match.id,
                                  matchData: match,
                                })
                              }
                              activeOpacity={0.7}
                            >
                              <View
                                style={[
                                  styles.formResultBadge,
                                  {
                                    backgroundColor: result.won
                                      ? theme.success
                                      : theme.error,
                                  },
                                ]}
                              >
                                <Text style={styles.formResultText}>
                                  {result.won ? "W" : "L"}
                                </Text>
                              </View>

                              <View style={styles.formGameContent}>
                                <Text
                                  style={[
                                    styles.formEventName,
                                    { color: theme.textSecondary },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {tournamentAbbr}
                                </Text>

                                <View style={styles.formMatchup}>
                                  {series.team2?.logoUrl ? (
                                    <Image
                                      source={{ uri: series.team2.logoUrl }}
                                      style={styles.formTeamLogo}
                                      resizeMode="contain"
                                    />
                                  ) : (
                                    <View
                                      style={[
                                        styles.formTeamLogo,
                                        {
                                          backgroundColor: colors.secondary,
                                          justifyContent: "center",
                                          alignItems: "center",
                                          borderRadius: 8,
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={{
                                          fontSize: 6,
                                          fontWeight: "bold",
                                          color: "white",
                                        }}
                                      >
                                        {(
                                          series.team2?.shortName ||
                                          series.team2?.name ||
                                          "T2"
                                        )
                                          .substring(0, 1)
                                          .toUpperCase()}
                                      </Text>
                                    </View>
                                  )}
                                  <View style={styles.formScoreContainer}>
                                    <Text
                                      style={[
                                        styles.formScore,
                                        { color: theme.text },
                                      ]}
                                    >
                                      {result.teamScore} -{" "}
                                      {result.opponentScore}
                                    </Text>
                                  </View>
                                  {opponent?.image_url ? (
                                    <Image
                                      source={{ uri: opponent.image_url }}
                                      style={styles.formTeamLogo}
                                      resizeMode="contain"
                                    />
                                  ) : (
                                    <View
                                      style={[
                                        styles.formTeamLogo,
                                        {
                                          backgroundColor: colors.primary,
                                          justifyContent: "center",
                                          alignItems: "center",
                                          borderRadius: 8,
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={{
                                          fontSize: 6,
                                          fontWeight: "bold",
                                          color: "white",
                                        }}
                                      >
                                        {(
                                          opponent?.short_name ||
                                          opponent?.name ||
                                          "OPP"
                                        )
                                          .substring(0, 1)
                                          .toUpperCase()}
                                      </Text>
                                    </View>
                                  )}
                                </View>

                                <Text
                                  style={[
                                    styles.formDate,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  {new Date(
                                    match.start_date
                                  ).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                    </ScrollView>
                  </View>
                )}
            </View>
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Rounds Modal - EXACT VAL Style */}
      <Modal
        visible={showRoundsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRoundsModal(false)}
      >
        <View style={styles.halfModalContainer}>
          <TouchableOpacity
            style={styles.modalBackgroundOverlay}
            activeOpacity={1}
            onPress={() => setShowRoundsModal(false)}
          />
          <View
            style={[styles.modalContent, { backgroundColor: theme.background }]}
          >
            {selectedGameIndex !== null &&
            series.maps &&
            series.maps[selectedGameIndex] ? (
              (() => {
                const game = series.maps[selectedGameIndex];
                const attackDefenseStats =
                  calculateCS2AttackDefenseStats(selectedGameIndex);
                const roundsByHalves =
                  organizeCS2RoundsByHalves(selectedGameIndex);
                const mapName = getMapDisplayName(game.name);

                return (
                  <View style={styles.roundsModalContainer}>
                    {/* Fixed Header with Map Background */}
                    <View style={styles.roundsFloatingHeader}>
                      <Image
                        source={{
                          uri: getCS2MapImageUrl(
                            game.name?.replace("de_", "") ||
                              game.displayName?.toLowerCase()
                          ),
                        }}
                        style={styles.roundsMapBackground}
                        resizeMode="cover"
                      />
                      <View style={styles.roundsMapOverlay} />

                      {/* Team Info and Stats */}
                      <View style={styles.roundsTeamStatsContainer}>
                        {/* Team 1 */}
                        <View style={styles.roundsTeamSection}>
                          {series.team1?.logoUrl ? (
                            <Image
                              source={{ uri: series.team1.logoUrl }}
                              style={styles.roundsTeamLogo}
                              resizeMode="contain"
                            />
                          ) : (
                            <View
                              style={[
                                styles.roundsTeamLogo,
                                {
                                  backgroundColor: colors.primary,
                                  justifyContent: "center",
                                  alignItems: "center",
                                  borderRadius: 10,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  fontSize: 8,
                                  fontWeight: "bold",
                                  color: "white",
                                }}
                              >
                                {(
                                  series.team1?.shortName ||
                                  series.team1?.name ||
                                  "T1"
                                )
                                  .substring(0, 1)
                                  .toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <Text style={styles.roundsTeamName}>
                            {series.team1?.shortName || series.team1?.name}
                          </Text>
                          <View style={styles.roundsAttackDefenseStats}>
                            <View style={styles.roundsStatItem}>
                              <FontAwesome6
                                name="gun"
                                size={12}
                                color="white"
                              />
                              <Text style={styles.roundsStatText}>
                                {attackDefenseStats.team1.attack}
                              </Text>
                            </View>
                            <View style={styles.roundsStatItem}>
                              <FontAwesome6
                                name="shield-halved"
                                size={12}
                                color="white"
                              />
                              <Text style={styles.roundsStatText}>
                                {attackDefenseStats.team1.defense}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {/* Map Name and Score */}
                        <View style={styles.roundsMapScoreSection}>
                          <Text style={styles.roundsMapName}>{mapName}</Text>
                          <Text style={styles.roundsFinalScore}>
                            {game.team1Score} - {game.team2Score}
                          </Text>
                        </View>

                        {/* Team 2 */}
                        <View style={styles.roundsTeamSection}>
                          {series.team2?.logoUrl ? (
                            <Image
                              source={{ uri: series.team2.logoUrl }}
                              style={styles.roundsTeamLogo}
                              resizeMode="contain"
                            />
                          ) : (
                            <View
                              style={[
                                styles.roundsTeamLogo,
                                {
                                  backgroundColor: colors.secondary,
                                  justifyContent: "center",
                                  alignItems: "center",
                                  borderRadius: 10,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  fontSize: 8,
                                  fontWeight: "bold",
                                  color: "white",
                                }}
                              >
                                {(
                                  series.team2?.shortName ||
                                  series.team2?.name ||
                                  "T2"
                                )
                                  .substring(0, 1)
                                  .toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <Text style={styles.roundsTeamName}>
                            {series.team2?.shortName || series.team2?.name}
                          </Text>
                          <View style={styles.roundsAttackDefenseStats}>
                            <View style={styles.roundsStatItem}>
                              <FontAwesome6
                                name="gun"
                                size={12}
                                color="white"
                              />
                              <Text style={styles.roundsStatText}>
                                {attackDefenseStats.team2.attack}
                              </Text>
                            </View>
                            <View style={styles.roundsStatItem}>
                              <FontAwesome6
                                name="shield-halved"
                                size={12}
                                color="white"
                              />
                              <Text style={styles.roundsStatText}>
                                {attackDefenseStats.team2.defense}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Scrollable Rounds Content */}
                    <ScrollView
                      style={styles.roundsScrollableContent}
                      showsVerticalScrollIndicator={false}
                    >
                      {/* First Half */}
                      {roundsByHalves.firstHalf.length > 0 && (
                        <View style={styles.roundsHalfSection}>
                          <Text
                            style={[
                              styles.roundsHalfTitle,
                              { color: theme.text },
                            ]}
                          >
                            1st Half
                          </Text>
                          <View style={styles.liquipediaRoundsContainer}>
                            {/* Team Logos - Properly Aligned */}
                            <View style={styles.fixedTeamLogosStack}>
                              <View style={styles.roundNumberSpace} />
                              <View style={styles.teamLogoAligned}>
                                {series.team1?.logoUrl ? (
                                  <Image
                                    source={{ uri: series.team1.logoUrl }}
                                    style={styles.roundsRowTeamLogo}
                                    resizeMode="contain"
                                  />
                                ) : (
                                  <View
                                    style={[
                                      styles.roundsRowTeamLogo,
                                      {
                                        backgroundColor: colors.primary,
                                        justifyContent: "center",
                                        alignItems: "center",
                                        borderRadius: 6,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 6,
                                        fontWeight: "bold",
                                        color: "white",
                                      }}
                                    >
                                      {(
                                        series.team1?.shortName ||
                                        series.team1?.name ||
                                        "T1"
                                      )
                                        .substring(0, 1)
                                        .toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                              </View>
                              <View style={styles.teamLogoAligned}>
                                {series.team2?.logoUrl ? (
                                  <Image
                                    source={{ uri: series.team2.logoUrl }}
                                    style={styles.roundsRowTeamLogo}
                                    resizeMode="contain"
                                  />
                                ) : (
                                  <View
                                    style={[
                                      styles.roundsRowTeamLogo,
                                      {
                                        backgroundColor: colors.secondary,
                                        justifyContent: "center",
                                        alignItems: "center",
                                        borderRadius: 6,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 6,
                                        fontWeight: "bold",
                                        color: "white",
                                      }}
                                    >
                                      {(
                                        series.team2?.shortName ||
                                        series.team2?.name ||
                                        "T2"
                                      )
                                        .substring(0, 1)
                                        .toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            </View>

                            {/* Scrollable Rounds Section */}
                            <ScrollView
                              horizontal
                              style={styles.roundsHorizontalScroll}
                              showsHorizontalScrollIndicator={false}
                              contentContainerStyle={
                                styles.roundsHorizontalContent
                              }
                            >
                              {roundsByHalves.firstHalf.map((round, index) => (
                                <View
                                  key={round.id}
                                  style={styles.liquipediaRoundColumn}
                                >
                                  <Text
                                    style={[
                                      styles.roundCardNumber,
                                      { color: theme.text },
                                    ]}
                                  >
                                    {round.number}
                                  </Text>

                                  {/* Team 1 Round (Top) */}
                                  <View
                                    style={[
                                      styles.liquipediaRoundIndicator,
                                      {
                                        backgroundColor:
                                          round.winningTeamNumber === 1
                                            ? round.attackingTeamNumber === 1
                                              ? theme.error
                                              : theme.success
                                            : theme.surfaceSecondary + "20",
                                      },
                                    ]}
                                  >
                                    {round.winningTeamNumber === 1 && (
                                      <View style={styles.roundWinIcons}>
                                        <FontAwesome6
                                          name={getCS2EndReasonIcon(
                                            round.winCondition
                                          )}
                                          size={13}
                                          color="white"
                                          style={{ marginLeft: 2 }}
                                        />
                                      </View>
                                    )}
                                  </View>

                                  {/* Team 2 Round (Bottom) */}
                                  <View
                                    style={[
                                      styles.liquipediaRoundIndicator,
                                      {
                                        backgroundColor:
                                          round.winningTeamNumber === 2
                                            ? round.attackingTeamNumber === 2
                                              ? theme.error
                                              : theme.success
                                            : theme.surfaceSecondary + "20",
                                      },
                                    ]}
                                  >
                                    {round.winningTeamNumber === 2 && (
                                      <View style={styles.roundWinIcons}>
                                        <FontAwesome6
                                          name={getCS2EndReasonIcon(
                                            round.winCondition
                                          )}
                                          size={13}
                                          color="white"
                                        />
                                      </View>
                                    )}
                                  </View>
                                </View>
                              ))}
                            </ScrollView>
                          </View>
                        </View>
                      )}

                      {/* Second Half */}
                      {roundsByHalves.secondHalf.length > 0 && (
                        <View style={styles.roundsHalfSection}>
                          <Text
                            style={[
                              styles.roundsHalfTitle,
                              { color: theme.text },
                            ]}
                          >
                            2nd Half
                          </Text>
                          <View style={styles.liquipediaRoundsContainer}>
                            {/* Team Logos - Properly Aligned */}
                            <View style={styles.fixedTeamLogosStack}>
                              <View style={styles.roundNumberSpace} />
                              <View style={styles.teamLogoAligned}>
                                {series.team1?.logoUrl ? (
                                  <Image
                                    source={{ uri: series.team1.logoUrl }}
                                    style={styles.roundsRowTeamLogo}
                                    resizeMode="contain"
                                  />
                                ) : (
                                  <View
                                    style={[
                                      styles.roundsRowTeamLogo,
                                      {
                                        backgroundColor: colors.primary,
                                        justifyContent: "center",
                                        alignItems: "center",
                                        borderRadius: 6,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 6,
                                        fontWeight: "bold",
                                        color: "white",
                                      }}
                                    >
                                      {(
                                        series.team1?.shortName ||
                                        series.team1?.name ||
                                        "T1"
                                      )
                                        .substring(0, 1)
                                        .toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                              </View>
                              <View style={styles.teamLogoAligned}>
                                {series.team2?.logoUrl ? (
                                  <Image
                                    source={{ uri: series.team2.logoUrl }}
                                    style={styles.roundsRowTeamLogo}
                                    resizeMode="contain"
                                  />
                                ) : (
                                  <View
                                    style={[
                                      styles.roundsRowTeamLogo,
                                      {
                                        backgroundColor: colors.secondary,
                                        justifyContent: "center",
                                        alignItems: "center",
                                        borderRadius: 6,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 6,
                                        fontWeight: "bold",
                                        color: "white",
                                      }}
                                    >
                                      {(
                                        series.team2?.shortName ||
                                        series.team2?.name ||
                                        "T2"
                                      )
                                        .substring(0, 1)
                                        .toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            </View>

                            {/* Scrollable Rounds Section */}
                            <ScrollView
                              horizontal
                              style={styles.roundsHorizontalScroll}
                              showsHorizontalScrollIndicator={false}
                              contentContainerStyle={
                                styles.roundsHorizontalContent
                              }
                            >
                              {roundsByHalves.secondHalf.map((round, index) => (
                                <View
                                  key={round.id}
                                  style={styles.liquipediaRoundColumn}
                                >
                                  <Text
                                    style={[
                                      styles.roundCardNumber,
                                      { color: theme.text },
                                    ]}
                                  >
                                    {round.number}
                                  </Text>

                                  {/* Team 1 Round (Top) */}
                                  <View
                                    style={[
                                      styles.liquipediaRoundIndicator,
                                      {
                                        backgroundColor:
                                          round.winningTeamNumber === 1
                                            ? round.attackingTeamNumber === 1
                                              ? theme.error
                                              : theme.success
                                            : theme.surfaceSecondary + "20",
                                      },
                                    ]}
                                  >
                                    {round.winningTeamNumber === 1 && (
                                      <View style={styles.roundWinIcons}>
                                        <FontAwesome6
                                          name={getCS2EndReasonIcon(
                                            round.winCondition
                                          )}
                                          size={13}
                                          color="white"
                                        />
                                      </View>
                                    )}
                                  </View>

                                  {/* Team 2 Round (Bottom) */}
                                  <View
                                    style={[
                                      styles.liquipediaRoundIndicator,
                                      {
                                        backgroundColor:
                                          round.winningTeamNumber === 2
                                            ? round.attackingTeamNumber === 2
                                              ? theme.error
                                              : theme.success
                                            : theme.surfaceSecondary + "20",
                                      },
                                    ]}
                                  >
                                    {round.winningTeamNumber === 2 && (
                                      <View style={styles.roundWinIcons}>
                                        <FontAwesome6
                                          name={getCS2EndReasonIcon(
                                            round.winCondition
                                          )}
                                          size={13}
                                          color="white"
                                        />
                                      </View>
                                    )}
                                  </View>
                                </View>
                              ))}
                            </ScrollView>
                          </View>
                        </View>
                      )}

                      {/* Overtime */}
                      {roundsByHalves.overtime.length > 0 && (
                        <View
                          style={[
                            styles.roundsHalfSection,
                            { marginBottom: 50 },
                          ]}
                        >
                          <Text
                            style={[
                              styles.roundsHalfTitle,
                              { color: theme.text },
                            ]}
                          >
                            Overtime
                          </Text>
                          <View style={styles.liquipediaRoundsContainer}>
                            {/* Team Logos - Properly Aligned */}
                            <View style={styles.fixedTeamLogosStack}>
                              <View style={styles.roundNumberSpace} />
                              <View style={styles.teamLogoAligned}>
                                {series.team1?.logoUrl ? (
                                  <Image
                                    source={{ uri: series.team1.logoUrl }}
                                    style={styles.roundsRowTeamLogo}
                                    resizeMode="contain"
                                  />
                                ) : (
                                  <View
                                    style={[
                                      styles.roundsRowTeamLogo,
                                      {
                                        backgroundColor: colors.primary,
                                        justifyContent: "center",
                                        alignItems: "center",
                                        borderRadius: 6,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 6,
                                        fontWeight: "bold",
                                        color: "white",
                                      }}
                                    >
                                      {(
                                        series.team1?.shortName ||
                                        series.team1?.name ||
                                        "T1"
                                      )
                                        .substring(0, 1)
                                        .toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                              </View>
                              <View style={styles.teamLogoAligned}>
                                {series.team2?.logoUrl ? (
                                  <Image
                                    source={{ uri: series.team2.logoUrl }}
                                    style={styles.roundsRowTeamLogo}
                                    resizeMode="contain"
                                  />
                                ) : (
                                  <View
                                    style={[
                                      styles.roundsRowTeamLogo,
                                      {
                                        backgroundColor: colors.secondary,
                                        justifyContent: "center",
                                        alignItems: "center",
                                        borderRadius: 6,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 6,
                                        fontWeight: "bold",
                                        color: "white",
                                      }}
                                    >
                                      {(
                                        series.team2?.shortName ||
                                        series.team2?.name ||
                                        "T2"
                                      )
                                        .substring(0, 1)
                                        .toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            </View>

                            {/* Scrollable Rounds Section */}
                            <ScrollView
                              horizontal
                              style={styles.roundsHorizontalScroll}
                              showsHorizontalScrollIndicator={false}
                              contentContainerStyle={
                                styles.roundsHorizontalContent
                              }
                            >
                              {roundsByHalves.overtime.map((round, index) => (
                                <View
                                  key={round.id}
                                  style={styles.liquipediaRoundColumn}
                                >
                                  <Text
                                    style={[
                                      styles.roundCardNumber,
                                      { color: theme.text },
                                    ]}
                                  >
                                    {round.number}
                                  </Text>

                                  {/* Team 1 Round (Top) */}
                                  <View
                                    style={[
                                      styles.liquipediaRoundIndicator,
                                      {
                                        backgroundColor:
                                          round.winningTeamNumber === 1
                                            ? round.attackingTeamNumber === 1
                                              ? theme.error
                                              : theme.success
                                            : theme.surfaceSecondary + "20",
                                      },
                                    ]}
                                  >
                                    {round.winningTeamNumber === 1 && (
                                      <View style={styles.roundWinIcons}>
                                        <FontAwesome6
                                          name={getCS2EndReasonIcon(
                                            round.winCondition
                                          )}
                                          size={13}
                                          color="white"
                                        />
                                      </View>
                                    )}
                                  </View>

                                  {/* Team 2 Round (Bottom) */}
                                  <View
                                    style={[
                                      styles.liquipediaRoundIndicator,
                                      {
                                        backgroundColor:
                                          round.winningTeamNumber === 2
                                            ? round.attackingTeamNumber === 2
                                              ? theme.error
                                              : theme.success
                                            : theme.surfaceSecondary + "20",
                                      },
                                    ]}
                                  >
                                    {round.winningTeamNumber === 2 && (
                                      <View style={styles.roundWinIcons}>
                                        <FontAwesome6
                                          name={getCS2EndReasonIcon(
                                            round.winCondition
                                          )}
                                          size={13}
                                          color="white"
                                        />
                                      </View>
                                    )}
                                  </View>
                                </View>
                              ))}
                            </ScrollView>
                          </View>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                );
              })()
            ) : (
              <View style={styles.comingSoonContainer}>
                <Ionicons
                  name="construct"
                  size={48}
                  color={theme.textTertiary}
                />
                <Text
                  style={[
                    styles.comingSoonText,
                    { color: theme.textSecondary },
                  ]}
                >
                  Loading round details...
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Copy Modal - centered share card like VAL play card */}
      <Modal
        visible={showCopyModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowCopyModal(false)}
      >
        <View
          style={[styles.modalOverlay, { backgroundColor: "rgba(0,0,0,0.85)" }]}
        >
          <View
            style={{ alignItems: "center", justifyContent: "center", flex: 1 }}
          >
            <View
              ref={copyCardRef}
              collapsable={false}
              style={[
                styles.valShareCard || styles.copyShareCard,
                { backgroundColor: theme.surface },
                isCapturing
                  ? { height: contentHeight + 20 } // auto-expanding
                  : { height: 400 }, // normal mode
              ]}
            >
              <Container
                style={[
                  styles.modalScrollContent,
                  { backgroundColor: theme.surface },
                ]}
                contentContainerStyle={
                  !isCapturing ? { paddingBottom: 16 } : undefined
                }
                showsVerticalScrollIndicator={!isCapturing}
                scrollEnabled={!isCapturing}
              >
                <View onLayout={handleInnerLayout}>
                  <View
                    style={[
                      styles.copyHeaderSection,
                      {
                        backgroundColor: theme.surfaceSecondary,
                        borderRadius: 12,
                        padding: 16,
                        marginBottom: 16,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.copyEventName,
                        {
                          color: theme.text,
                          fontSize: 14,
                          fontWeight: "600",
                          textAlign: "center",
                          marginBottom: 16,
                        },
                      ]}
                    >
                      {series.eventName || "Match Details"}
                    </Text>
                    <View
                      style={[
                        styles.copyMatchupRow,
                        {
                          flexDirection: "row",
                          alignItems: "center",
                          marginBottom: 16,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.copyTeamSection,
                          { alignItems: "flex-end", flex: 1 },
                        ]}
                      >
                        <View
                          style={[
                            styles.copyLogoScoreRow,
                            {
                              flexDirection: "row",
                              alignItems: "center",
                              marginBottom: 8,
                            },
                          ]}
                        >
                          <Image
                            source={{
                              uri:
                                series.team1?.logoUrl ||
                                "https://i.imgur.com/BIC4pnO.webp",
                            }}
                            style={[
                              styles.copyTeamLogo,
                              {
                                width: 56,
                                height: 56,
                                marginRight: 12,
                                opacity:
                                  series.completed &&
                                  !series.live &&
                                  series.team1Score < series.team2Score
                                    ? 0.6
                                    : 1,
                              },
                            ]}
                            resizeMode="contain"
                          />
                          <Text
                            style={[
                              styles.copyScoreText,
                              {
                                fontSize: 40,
                                fontWeight: "800",
                                color: theme.text,
                                opacity:
                                  series.completed &&
                                  !series.live &&
                                  series.team1Score < series.team2Score
                                    ? 0.6
                                    : 1,
                              },
                            ]}
                          >
                            {series.team1Score || 0}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.copyTeamName,
                            {
                              fontSize: 14,
                              fontWeight: "bold",
                              color: theme.text,
                              textAlign: "center",
                              transform: [{ translateX: -20 }],
                              opacity:
                                series.completed &&
                                !series.live &&
                                series.team1Score < series.team2Score
                                  ? 0.6
                                  : 1,
                            },
                          ]}
                        >
                          {series.team1?.shortName || "T1"}
                        </Text>
                      </View>

                      <View
                        style={{
                          width: 48,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={[
                            styles.copyScoreSeparator,
                            { fontSize: 22, color: theme.textSecondary },
                          ]}
                        >
                          -
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.copyTeamSection,
                          { alignItems: "flex-start", flex: 1 },
                        ]}
                      >
                        <View
                          style={[
                            styles.copyLogoScoreRow,
                            {
                              flexDirection: "row",
                              alignItems: "center",
                              marginBottom: 8,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.copyScoreText,
                              {
                                fontSize: 40,
                                fontWeight: "800",
                                color: theme.text,
                                opacity:
                                  series.completed &&
                                  !series.live &&
                                  series.team2Score < series.team1Score
                                    ? 0.6
                                    : 1,
                              },
                            ]}
                          >
                            {series.team2Score || 0}
                          </Text>
                          <Image
                            source={{
                              uri:
                                series.team2?.logoUrl ||
                                "https://i.imgur.com/BIC4pnO.webp",
                            }}
                            style={[
                              styles.copyTeamLogo,
                              {
                                width: 56,
                                height: 56,
                                marginLeft: 12,
                                opacity:
                                  series.completed &&
                                  !series.live &&
                                  series.team2Score < series.team1Score
                                    ? 0.6
                                    : 1,
                              },
                            ]}
                            resizeMode="contain"
                          />
                        </View>
                        <Text
                          style={[
                            styles.copyTeamName,
                            {
                              fontSize: 14,
                              fontWeight: "bold",
                              color: theme.text,
                              textAlign: "center",
                              transform: [{ translateX: 20 }],
                              opacity:
                                series.completed &&
                                !series.live &&
                                series.team2Score < series.team1Score
                                  ? 0.6
                                  : 1,
                            },
                          ]}
                        >
                          {series.team2?.shortName || "T2"}
                        </Text>
                      </View>
                    </View>

                    {series.startDate && (
                      <Text
                        style={[
                          styles.copyDateText,
                          {
                            color: theme.textSecondary,
                            fontSize: 12,
                            textAlign: "center",
                          },
                        ]}
                      >
                        {new Date(series.startDate).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          }
                        )}
                        {" • "}
                        {new Date(series.startDate).toLocaleTimeString(
                          "en-US",
                          {
                            hour: "numeric",
                            minute: "numeric",
                            hour12: true,
                          }
                        )}
                      </Text>
                    )}
                  </View>

                  {/* Maps */}
                  {series.maps && series.maps.length > 0 && (
                    <View
                      style={[styles.copyMapsSection, { marginBottom: 16 }]}
                    >
                      <View
                        style={[
                          styles.copyMapsList,
                          {
                            backgroundColor: theme.surfaceSecondary,
                            borderRadius: 8,
                            padding: 12,
                            flexDirection: "row",
                            flexWrap: "wrap",
                            justifyContent: "center",
                          },
                        ]}
                      >
                        {series.maps.map((m, idx) => {
                          if (!m) return null;
                          const mapName = getMapDisplayName(
                            m.name || m.displayName
                          );
                          const team1Score =
                            m.team1Score ||
                            m.team1Rounds ||
                            m.team1RoundsWon ||
                            0;
                          const team2Score =
                            m.team2Score ||
                            m.team2Rounds ||
                            m.team2RoundsWon ||
                            0;
                          const winnerTeam =
                            team1Score > team2Score
                              ? series.team1
                              : team2Score > team1Score
                              ? series.team2
                              : null;
                          return (
                            <View
                              key={idx}
                              style={[
                                styles.copyMapChip,
                                {
                                  backgroundColor: theme.surface,
                                  margin: 6,
                                  paddingHorizontal: 12,
                                  paddingVertical: 8,
                                  borderRadius: 8,
                                  alignItems: "center",
                                  flexDirection: "row",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.copyMapChipText,
                                  { color: theme.text, fontSize: 13 },
                                ]}
                                numberOfLines={1}
                              >
                                M{idx + 1}: {mapName} ({team1Score}-{team2Score}
                                )
                              </Text>
                              {winnerTeam && (
                                <Image
                                  source={{
                                    uri:
                                      winnerTeam?.logoUrl ||
                                      "https://i.imgur.com/BIC4pnO.webp",
                                  }}
                                  style={[
                                    styles.copyWinnerLogo,
                                    { width: 18, height: 18, marginLeft: 8 },
                                  ]}
                                  resizeMode="contain"
                                />
                              )}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Player Stats */}
                  {(() => {
                    const { team1Players, team2Players } =
                      getAggregatedPlayerStats(copySeriesData);
                    if (
                      (team1Players.length === 0 &&
                        team2Players.length === 0) ||
                      (!team1Players && !team2Players)
                    ) {
                      return (
                        <View
                          style={[
                            styles.copyPlayersSection,
                            { marginBottom: 16 },
                          ]}
                        >
                          <Text
                            style={[
                              styles.noDataText,
                              {
                                color: theme.textSecondary,
                                textAlign: "center",
                              },
                            ]}
                          >
                            No player data available
                          </Text>
                        </View>
                      );
                    }

                    return (
                      <View
                        style={[
                          styles.copyPlayersSection,
                          { marginBottom: 16 },
                        ]}
                      >
                        <View
                          style={[
                            styles.copyTeamPlayersSection,
                            {
                              backgroundColor: theme.surfaceSecondary,
                              borderRadius: 8,
                              padding: 12,
                              marginBottom: 12,
                            },
                          ]}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              marginBottom: 8,
                            }}
                          >
                            <Image
                              source={{ uri: series.team1.logoUrl }}
                              style={{
                                width: 18,
                                height: 18,
                                marginRight: 6,
                                borderRadius: 3,
                              }}
                              resizeMode="contain"
                            />
                            <Text
                              style={[
                                styles.copyTeamStatsTitle,
                                {
                                  color: theme.text,
                                  fontSize: 14,
                                  fontWeight: "bold",
                                },
                              ]}
                            >
                              {series.team1?.shortName || "Team 1"}
                            </Text>
                          </View>
                          {team1Players.sort((a, b) => (b.kills - b.deaths) - (a.kills - a.deaths)).map((player) => (
                            <View
                              key={player.playerId}
                              style={[
                                styles.copyPlayerRow,
                                {
                                  flexDirection: "row",
                                  alignItems: "center",
                                  marginBottom: 8,
                                  paddingVertical: 4,
                                },
                              ]}
                            >
                              <View
                                style={[
                                  styles.copyPlayerInfo,
                                  {
                                    flex: 1,
                                    flexDirection: "row",
                                    alignItems: "center",
                                  },
                                ]}
                              >
                                <Image
                                  source={{ uri: player.image_url }}
                                  style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: 12,
                                    marginRight: 8,
                                    aspectRatio: 1,
                                  }}
                                  resizeMode="contain"
                                />
                                <Text
                                  style={[
                                    styles.copyPlayerName,
                                    {
                                      color: theme.text,
                                      fontSize: 13,
                                      fontWeight: "600",
                                      marginRight: 8,
                                    },
                                  ]}
                                >
                                  {player.displayName}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.copyPlayerStats,
                                  {
                                    flexDirection: "row",
                                    alignItems: "center",
                                  },
                                ]}
                              >
                                <View
                                  style={[
                                    styles.copyStatItem,
                                    {
                                      alignItems: "center",
                                      marginHorizontal: 6,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.copyStatValue,
                                      {
                                        color: theme.text,
                                        fontSize: 12,
                                        fontWeight: "bold",
                                      },
                                    ]}
                                  >
                                    {player.kills}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.copyStatLabel,
                                      {
                                        color: theme.textSecondary,
                                        fontSize: 9,
                                      },
                                    ]}
                                  >
                                    K
                                  </Text>
                                </View>
                                <View
                                  style={[
                                    styles.copyStatItem,
                                    {
                                      alignItems: "center",
                                      marginHorizontal: 6,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.copyStatValue,
                                      {
                                        color: theme.text,
                                        fontSize: 12,
                                        fontWeight: "bold",
                                      },
                                    ]}
                                  >
                                    {player.deaths}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.copyStatLabel,
                                      {
                                        color: theme.textSecondary,
                                        fontSize: 9,
                                      },
                                    ]}
                                  >
                                    D
                                  </Text>
                                </View>
                                <View
                                  style={[
                                    styles.copyStatItem,
                                    {
                                      alignItems: "center",
                                      marginHorizontal: 6,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.copyStatValue,
                                      {
                                        color: theme.text,
                                        fontSize: 12,
                                        fontWeight: "bold",
                                      },
                                    ]}
                                  >
                                    {player.assists}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.copyStatLabel,
                                      {
                                        color: theme.textSecondary,
                                        fontSize: 9,
                                      },
                                    ]}
                                  >
                                    A
                                  </Text>
                                </View>
                                <View
                                  style={[
                                    styles.copyStatItem,
                                    {
                                      alignItems: "center",
                                      marginHorizontal: 6,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.copyStatValue,
                                      {
                                        color:
                                          player.kills - player.deaths === 0
                                            ? theme.text
                                            : player.kills - player.deaths > 0
                                            ? theme.success
                                            : theme.error,
                                        fontSize: 12,
                                        fontWeight: "bold",
                                      },
                                    ]}
                                  >
                                    {player.kills - player.deaths <= 0
                                      ? player.kills - player.deaths
                                      : `+${player.kills - player.deaths}`}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.copyStatLabel,
                                      {
                                        color: theme.textSecondary,
                                        fontSize: 9,
                                      },
                                    ]}
                                  >
                                    +/-
                                  </Text>
                                </View>
                                {player.adr !== null &&
                                  player.adr !== undefined && (
                                    <View
                                      style={[
                                        styles.copyStatItem,
                                        {
                                          alignItems: "center",
                                          marginHorizontal: 6,
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.copyStatValue,
                                          {
                                            color: theme.text,
                                            fontSize: 12,
                                            fontWeight: "bold",
                                          },
                                        ]}
                                      >
                                        {Math.round(player.adr)}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.copyStatLabel,
                                          {
                                            color: theme.textSecondary,
                                            fontSize: 9,
                                          },
                                        ]}
                                      >
                                        ADR
                                      </Text>
                                    </View>
                                  )}
                              </View>
                            </View>
                          ))}
                        </View>

                        <View
                          style={[
                            styles.copyTeamPlayersSection,
                            {
                              backgroundColor: theme.surfaceSecondary,
                              borderRadius: 8,
                              padding: 12,
                              marginBottom: 15,
                            },
                          ]}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              marginBottom: 8,
                            }}
                          >
                            <Image
                              source={{ uri: series.team2.logoUrl }}
                              style={{
                                width: 18,
                                height: 18,
                                marginRight: 6,
                                borderRadius: 3,
                              }}
                              resizeMode="contain"
                            />
                            <Text
                              style={[
                                styles.copyTeamStatsTitle,
                                {
                                  color: theme.text,
                                  fontSize: 14,
                                  fontWeight: "bold",
                                },
                              ]}
                            >
                              {series.team2?.shortName || "Team 2"}
                            </Text>
                          </View>
                          {team2Players.sort((a, b) => (b.kills - b.deaths) - (a.kills - a.deaths)).map((player) => (
                            <View
                              key={player.playerId}
                              style={[
                                styles.copyPlayerRow,
                                {
                                  flexDirection: "row",
                                  alignItems: "center",
                                  marginBottom: 8,
                                  paddingVertical: 4,
                                },
                              ]}
                            >
                              <View
                                style={[
                                  styles.copyPlayerInfo,
                                  {
                                    flex: 1,
                                    flexDirection: "row",
                                    alignItems: "center",
                                  },
                                ]}
                              >
                                <Image
                                  source={{ uri: player.image_url }}
                                  style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: 12,
                                    marginRight: 8,
                                    aspectRatio: 1,
                                  }}
                                  resizeMode="contain"
                                />
                                <Text
                                  style={[
                                    styles.copyPlayerName,
                                    {
                                      color: theme.text,
                                      fontSize: 13,
                                      fontWeight: "600",
                                      marginRight: 8,
                                    },
                                  ]}
                                >
                                  {player.displayName}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.copyPlayerStats,
                                  {
                                    flexDirection: "row",
                                    alignItems: "center",
                                  },
                                ]}
                              >
                                <View
                                  style={[
                                    styles.copyStatItem,
                                    {
                                      alignItems: "center",
                                      marginHorizontal: 6,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.copyStatValue,
                                      {
                                        color: theme.text,
                                        fontSize: 12,
                                        fontWeight: "bold",
                                      },
                                    ]}
                                  >
                                    {player.kills}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.copyStatLabel,
                                      {
                                        color: theme.textSecondary,
                                        fontSize: 9,
                                      },
                                    ]}
                                  >
                                    K
                                  </Text>
                                </View>
                                <View
                                  style={[
                                    styles.copyStatItem,
                                    {
                                      alignItems: "center",
                                      marginHorizontal: 6,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.copyStatValue,
                                      {
                                        color: theme.text,
                                        fontSize: 12,
                                        fontWeight: "bold",
                                      },
                                    ]}
                                  >
                                    {player.deaths}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.copyStatLabel,
                                      {
                                        color: theme.textSecondary,
                                        fontSize: 9,
                                      },
                                    ]}
                                  >
                                    D
                                  </Text>
                                </View>
                                <View
                                  style={[
                                    styles.copyStatItem,
                                    {
                                      alignItems: "center",
                                      marginHorizontal: 6,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.copyStatValue,
                                      {
                                        color: theme.text,
                                        fontSize: 12,
                                        fontWeight: "bold",
                                      },
                                    ]}
                                  >
                                    {player.assists}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.copyStatLabel,
                                      {
                                        color: theme.textSecondary,
                                        fontSize: 9,
                                      },
                                    ]}
                                  >
                                    A
                                  </Text>
                                </View>
                                <View
                                  style={[
                                    styles.copyStatItem,
                                    {
                                      alignItems: "center",
                                      marginHorizontal: 6,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.copyStatValue,
                                      {
                                        color:
                                          player.kills - player.deaths === 0
                                            ? theme.text
                                            : player.kills - player.deaths > 0
                                            ? theme.success
                                            : theme.error,
                                        fontSize: 12,
                                        fontWeight: "bold",
                                      },
                                    ]}
                                  >
                                    {player.kills - player.deaths <= 0
                                      ? player.kills - player.deaths
                                      : `+${player.kills - player.deaths}`}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.copyStatLabel,
                                      {
                                        color: theme.textSecondary,
                                        fontSize: 9,
                                      },
                                    ]}
                                  >
                                    +/-
                                  </Text>
                                </View>
                                {player.adr !== null &&
                                  player.adr !== undefined && (
                                    <View
                                      style={[
                                        styles.copyStatItem,
                                        {
                                          alignItems: "center",
                                          marginHorizontal: 6,
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.copyStatValue,
                                          {
                                            color: theme.text,
                                            fontSize: 12,
                                            fontWeight: "bold",
                                          },
                                        ]}
                                      >
                                        {Math.round(player.adr)}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.copyStatLabel,
                                          {
                                            color: theme.textSecondary,
                                            fontSize: 9,
                                          },
                                        ]}
                                      >
                                        ADR
                                      </Text>
                                    </View>
                                  )}
                              </View>
                            </View>
                          ))}
                        </View>
                      </View>
                    );
                  })()}
                  {/* Footer inside the card */}
                  <View style={styles.shareCardFooter}>
                    <Text
                      style={[
                        styles.shareCardFooterText,
                        {
                          color: theme.text,
                          textShadowColor: "rgba(0, 0, 0, 0.8)",
                          textShadowOffset: { width: 1, height: 1 },
                          textShadowRadius: 5,
                        },
                      ]}
                    >
                      SportsHeart{" "}
                      <Ionicons name="heart" size={18} color={colors.primary} />
                    </Text>
                  </View>
                </View>
              </Container>
            </View>
            <View style={styles.valShareCardActions}>
              <View style={styles.valShareCardTopButtons}>
                <TouchableOpacity
                  style={[
                    styles.valShareCardButton,
                    { backgroundColor: colors.secondary },
                  ]}
                  onPress={() => shareCopyCard()}
                >
                  <Ionicons name="share-outline" size={24} color="white" />
                  <Text
                    style={[styles.valShareCardButtonText, { color: "white" }]}
                  >
                    Share
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.valShareCardCancelButton,
                    { backgroundColor: theme.surfaceSecondary },
                  ]}
                  onPress={() => setShowCopyModal(false)}
                >
                  <Ionicons name="close" size={24} color={theme.text} />
                  <Text
                    style={[
                      styles.valShareCardButtonText,
                      { color: theme.text },
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  // Series Header Styles - EXACT VAL floating header style
  seriesHeader: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 15,
    marginBottom: 24,
    borderRadius: 12,
    alignItems: "center",
  },
  eventName: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 16,
  },
  matchupRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: -40,
  },
  teamCompleteSection: {
    alignItems: "center",
    flex: 1,
  },
  logoScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  teamLogoHead: {
    width: 64,
    height: 64,
    marginHorizontal: 18,
  },
  scoreText: {
    fontSize: 32,
    fontWeight: "bold",
    minWidth: 40,
    textAlign: "center",
  },
  teamName: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  scoreSeparator: {
    fontSize: 24,
    marginHorizontal: 16,
    alignSelf: "flex-start",
    marginTop: 16,
  },
  statusDateContainer: {
    alignItems: "center",
    marginTop: 50,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  statusText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  dateText: {
    fontSize: 14,
    textAlign: "center",
  },
  // Tab Navigation Styles - EXACT VAL style
  tabContainer: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    overflow: "hidden",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
  },
  tabText: {
    fontSize: 16,
    fontWeight: "600",
  },
  // Content Styles - EXACT VAL style
  contentContainer: {
    paddingHorizontal: 16,
  },
  gameDetailsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
  },
  gameScrollView: {
    marginHorizontal: -16,
  },
  gameScrollContent: {
    paddingHorizontal: 16,
  },
  // Game Card Styles - EXACT VAL style
  gameCard: {
    width: 340,
    borderRadius: 12,
    marginHorizontal: 4,
    overflow: "hidden",
  },
  headerSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  gameTitle: {
    fontSize: 16,
    fontWeight: "bold",
  },
  gameStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  gameStatusText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  mapScoreSection: {
    position: "relative",
    height: 120,
  },
  mapBackground: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  mapOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  scoreContent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  teamScoreContainer: {
    alignItems: "center",
    flex: 1,
  },
  teamLogo: {
    width: 32,
    height: 32,
    marginBottom: 8,
  },
  gameScoreText: {
    fontSize: 24,
    fontWeight: "bold",
  },
  mapNameContainer: {
    flex: 2,
    alignItems: "center",
  },
  mapName: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  playersSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  teamsContainer: {
    flexDirection: "row",
    marginBottom: 16,
  },
  leftTeamContainer: {
    flex: 1,
    paddingRight: 8,
  },
  rightTeamContainer: {
    flex: 1,
    paddingLeft: 8,
  },
  teamLabel: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  leftPlayersColumn: {
    alignItems: "flex-start",
  },
  rightPlayersColumn: {
    alignItems: "flex-end",
  },
  leftPlayerItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    width: "100%",
  },
  rightPlayerItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    width: "100%",
    justifyContent: "flex-end",
  },
  playerImage: {
    width: 30,
    height: 30,
    borderRadius: 12,
    marginHorizontal: 6,
  },
  playerInfo: {
    flex: 1,
  },
  playerInfoRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  playerName: {
    fontSize: 12,
    fontWeight: "500",
  },
  gameActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 80,
    alignItems: "center",
  },
  actionButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  noMapsContainer: {
    alignItems: "center",
    paddingVertical: 32,
  },
  noMapsText: {
    fontSize: 16,
    textAlign: "center",
  },
  comingSoonText: {
    fontSize: 16,
    textAlign: "center",
    marginTop: 32,
  },
  bottomPadding: {
    height: 32,
  },
  // Maps Section Styles - EXACT VAL style
  mapsSection: {
    marginBottom: 24,
  },
  mapsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  mapCard: {
    width: "48%",
    height: 120,
    borderRadius: 8,
    marginBottom: 12,
    overflow: "hidden",
    position: "relative",
  },
  mapImage: {
    width: "100%",
    height: "100%",
  },
  mapCardOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.76)",
    padding: 8,
  },
  mapCardName: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  mapTypeBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  mapTypeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },
  mapBanImageOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 60,
    backgroundColor: "rgba(255, 0, 0, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  banIcon: {
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  // Modal Styles - EXACT VAL style
  halfModalContainer: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0)",
  },
  modalBackgroundOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    height: "65%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  // Rounds Modal Styles
  roundsModalContainer: {
    flex: 1,
  },
  roundsFloatingHeader: {
    height: 120,
    position: "relative",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  roundsMapBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  roundsMapOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  roundsCloseButton: {
    position: "absolute",
    top: 16,
    right: 16,
    padding: 8,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    zIndex: 3,
  },
  roundsTeamStatsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    zIndex: 2,
  },
  roundsTeamSection: {
    alignItems: "center",
    flex: 1,
  },
  roundsTeamLogo: {
    width: 32,
    height: 32,
    marginBottom: 4,
  },
  roundsTeamName: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 4,
    textAlign: "center",
  },
  roundsAttackDefenseStats: {
    flexDirection: "row",
    gap: 8,
  },
  roundsStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  roundsStatText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  roundsMapScoreSection: {
    alignItems: "center",
    flex: 2,
  },
  roundsMapName: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
    textAlign: "center",
  },
  roundsFinalScore: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
  },
  roundsScrollableContent: {
    flex: 1,
    backgroundColor: "transparent",
  },
  roundsHalfSection: {
    marginBottom: 24,
  },
  roundsHalfTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    marginTop: 8,
    paddingHorizontal: 16,
    textAlign: "center",
  },
  liquipediaRoundsContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
  },
  fixedTeamLogosStack: {
    width: 40,
    marginRight: 8,
  },
  roundNumberSpace: {
    height: 24,
    marginBottom: 4,
  },
  teamLogoAligned: {
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  roundsRowTeamLogo: {
    width: 20,
    height: 20,
  },
  roundsHorizontalScroll: {
    flex: 1,
  },
  roundsHorizontalContent: {
    paddingRight: 16,
  },
  liquipediaRoundColumn: {
    alignItems: "center",
    marginRight: 4,
    width: 32,
  },
  roundCardNumber: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 4,
    textAlign: "center",
    height: 20,
  },
  liquipediaRoundIndicator: {
    width: 28,
    height: 28,
    borderRadius: 4,
    marginBottom: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  roundWinIcons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  comingSoonContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 48,
  },
  // Head-to-Head Styles - EXACT VAL style
  headToHeadSection: {
    marginBottom: 24,
  },
  h2hCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 24,
  },
  h2hTeamSection: {
    alignItems: "center",
    flex: 1,
  },
  h2hTeamLogo: {
    width: 48,
    height: 48,
    marginBottom: 8,
  },
  h2hTeamName: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  h2hScoreSection: {
    alignItems: "center",
    flex: 1,
  },
  h2hScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  h2hScore: {
    fontSize: 32,
    fontWeight: "bold",
    minWidth: 40,
    textAlign: "center",
  },
  h2hScoreSeparator: {
    fontSize: 24,
    marginHorizontal: 12,
  },
  h2hMatchCount: {
    fontSize: 14,
    textAlign: "center",
  },
  recentMatchesTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
  },
  recentMatchesList: {
    gap: 12,
  },
  recentMatchCard: {
    padding: 16,
    borderRadius: 12,
  },
  recentMatchTournament: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  recentMatchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 8,
  },
  recentMatchTeamLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  recentMatchTeamRight: {
    flexDirection: "row-reverse",
    alignItems: "center",
    flex: 1,
  },
  recentMatchTeamLogo: {
    width: 35,
    height: 35,
    marginRight: 8,
  },
  recentMatchTeamLogoRight: {
    width: 35,
    height: 35,
    marginLeft: 8,
  },
  recentMatchTeamName: {
    fontSize: 14,
    fontWeight: "600",
  },
  recentMatchScore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  recentMatchScoreText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  recentMatchDate: {
    fontSize: 12,
    textAlign: "center",
  },
  noDataContainer: {
    alignItems: "center",
    paddingVertical: 32,
  },
  noDataText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  // Map Performance Styles - EXACT VAL Style
  mapStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  mapStatCard: {
    width: "48%",
    borderRadius: 8,
    marginBottom: 12,
    overflow: "hidden",
    position: "relative",
  },
  mapStatBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  mapStatOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
  },
  mapStatContent: {
    padding: 16,
    position: "relative",
    zIndex: 1,
  },
  mapStatName: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
  },
  mapStatTeams: {
    flexDirection: "row",
  },
  mapStatTeam: {
    flex: 1,
    alignItems: "center",
  },
  mapStatDivider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginHorizontal: 12,
  },
  mapStatTeamName: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  mapStatWinRate: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 4,
  },
  mapStatRecord: {
    fontSize: 10,
  },
  // Recent Form Styles - EXACT VAL Style
  recentFormScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  recentFormGameCard: {
    width: 140,
    borderRadius: 8,
    padding: 12,
    marginRight: 12,
    position: "relative",
  },
  formResultBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  formResultText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  formGameContent: {
    alignItems: "center",
  },
  formEventName: {
    fontSize: 10,
    textAlign: "center",
    marginBottom: 15,
  },
  formMatchup: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 8,
  },
  formTeamLogo: {
    width: 24,
    height: 24,
  },
  formScoreContainer: {
    flex: 1,
    alignItems: "center",
  },
  formScore: {
    fontSize: 14,
    fontWeight: "bold",
  },
  formDate: {
    fontSize: 10,
    textAlign: "center",
  },
  /* Copy/share modal styles (VAL-like) */
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  valShareCard: {
    width: Math.min(screenWidth * 0.94, 720),
    overflow: "hidden",
    padding: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  modalScrollContent: {
    flex: 1,
    padding: 16,
  },
  valShareCardActions: {
    marginTop: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  shareCardFooter: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: -12,
    paddingBottom: 16,
  },
  shareCardFooterText: {
    fontSize: 15,
    fontWeight: "800",
  },
  valShareCardTopButtons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  valShareCardButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    marginHorizontal: 6,
  },
  valShareCardCancelButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    marginHorizontal: 6,
  },
  valShareCardButtonText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: "600",
  },
  copyMapChip: {
    minWidth: 120,
    maxWidth: 260,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    margin: 6,
  },
  copyMapChipText: {
    fontSize: 13,
  },
  copyWinnerLogo: {
    width: 18,
    height: 18,
    marginLeft: 8,
  },
  copyHeaderSection: {
    marginBottom: 12,
  },
  copyEventName: {
    fontSize: 14,
    fontWeight: "600",
  },
  copyMatchupRow: {},
  copyTeamSection: {},
  copyLogoScoreRow: {},
  copyTeamLogo: {
    width: 56,
    height: 56,
  },
  copyScoreText: {
    fontSize: 32,
    fontWeight: "bold",
  },
  copyScoreSeparator: {
    fontSize: 24,
    marginHorizontal: 16,
    transform: [{ translateY: -12 }],
  },
  copyTeamName: {
    fontSize: 14,
    fontWeight: "bold",
  },
  copyDateText: {
    fontSize: 12,
  },
  copyPlayersSection: {},
  copyTeamPlayersSection: {},
  copyTeamStatsTitle: {},
  copyPlayerRow: {},
  copyPlayerInfo: {},
  copyPlayerName: {},
  copyPlayerStats: {},
  copyStatItem: {},
  copyStatValue: {},
  copyStatLabel: {},
});

export default CS2ResultsScreen;

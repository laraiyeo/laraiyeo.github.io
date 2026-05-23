import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Modal,
  Dimensions,
  Linking,
} from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons, FontAwesome6 } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";
import { Share, Alert } from "react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import {
  getSeriesDetails,
  getTeamsHeadToHead,
  formatSeriesData,
  getAgentDisplayName,
  getMapNameById,
  getMapDisplayName,
  getAgentImageUrl,
  getMapImageUrl,
  getMapSampleUrl,
  formatMatchData,
  processRoundData,
  calculateAttackDefenseStats,
  organizeRoundsByHalves,
  getWinConditionIcon,
  getAttackDefenseIcon,
} from "../../../services/valorantSeriesService";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

const VALSeriesScreen = ({ navigation, route }) => {
  const { seriesId, seriesData } = route.params;
  const { colors, theme } = useTheme();
  const [series, setSeries] = useState(null);
  const [headToHeadData, setHeadToHeadData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedGameIndex, setSelectedGameIndex] = useState(0);
  const [showRoundsModal, setShowRoundsModal] = useState(false);
  const [showPlayersModal, setShowPlayersModal] = useState(false);
  const [selectedModalGame, setSelectedModalGame] = useState(null);
  const [showVODModal, setShowVODModal] = useState(false);
  const [selectedVODUrl, setSelectedVODUrl] = useState(null);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySeriesData, setCopySeriesData] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const copyCardRef = useRef(null);

  const handleInnerLayout = (event) => {
    const { height } = event.nativeEvent.layout;
    setContentHeight(height);
  };

  const Container = isCapturing ? View : ScrollView;

  // Functions now imported from valorantSeriesService

  // Create proper stream embed URL
  const createStreamEmbedUrl = (streamUrl) => {
    if (!streamUrl) return null;

    let channelName = null;

    // Check if it's a Twitch URL
    if (streamUrl.includes("twitch.tv/")) {
      const urlMatch = streamUrl.match(/twitch\.tv\/([^/?]+)/);
      if (urlMatch) {
        channelName = urlMatch[1];
      }
    }

    // Check if it's a YouTube URL
    if (streamUrl.includes("youtube.com/") || streamUrl.includes("youtu.be/")) {
      // For YouTube, we'll return the original URL as it can be embedded directly
      return streamUrl;
    }

    // If we found a Twitch channel name, create proper embed URL
    if (channelName) {
      // Determine the parent domain based on environment
      let parentDomain = "localhost";

      if (typeof window !== "undefined" && window.location) {
        parentDomain = window.location.hostname;
      }

      // Handle different development environments
      const parentDomains = [
        parentDomain,
        "localhost",
        "127.0.0.1",
        "exp.host", // Expo web
        "snack.expo.dev", // Expo Snack
      ]
        .filter(Boolean)
        .join("&parent=");

      return `https://player.twitch.tv/?channel=${encodeURIComponent(
        channelName
      )}&parent=${parentDomains}&muted=false&autoplay=true`;
    }

    // Return original URL as fallback
    return streamUrl;
  };

  useEffect(() => {
    loadSeriesData();
  }, [seriesId]);

  const loadSeriesData = async () => {
    try {
      setLoading(true);

      // Always try to fetch real series data from rib.gg API first
      if (seriesId) {
        const rawSeriesData = await getSeriesDetails(seriesId);
        const formattedData = formatSeriesData(rawSeriesData);
        setSeries(formattedData);

        // Fetch head-to-head data if we have team IDs
        if (formattedData.team1?.id && formattedData.team2?.id) {
          try {
            const headToHead = await getTeamsHeadToHead(
              formattedData.team1.id,
              formattedData.team2.id
            );
            setHeadToHeadData(headToHead);
          } catch (headToHeadError) {
            console.error("Error loading head-to-head data:", headToHeadError);
            setHeadToHeadData(null);
          }
        }
      } else {
        throw new Error("No series ID provided");
      }
    } catch (error) {
      console.error("Error loading series data:", error);

      // Fallback to passed series data if API fails
      if (seriesData) {
        console.log("Using fallback series data");
        setSeries(seriesData);
      } else {
        // If no fallback data, show error
        setSeries(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSeriesData();
    setRefreshing(false);
  };

  const openRoundsModal = (gameIndex) => {
    setSelectedModalGame(gameIndex);
    setShowRoundsModal(true);
  };

  const openPlayersModal = (gameIndex) => {
    setSelectedModalGame(gameIndex);
    setShowPlayersModal(true);
  };

  const openVOD = (vodUrl) => {
    if (!vodUrl) return;

    // Convert YouTube watch URL to embed URL for better in-app experience
    let embedUrl = vodUrl;
    if (vodUrl.includes("youtube.com/watch?v=")) {
      const videoId = vodUrl.split("v=")[1].split("&")[0];
      embedUrl = `https://www.youtube.com/embed/${videoId}`;
    } else if (vodUrl.includes("youtu.be/")) {
      const videoId = vodUrl.split("youtu.be/")[1].split("?")[0];
      embedUrl = `https://www.youtube.com/embed/${videoId}`;
    }

    setSelectedVODUrl(embedUrl);
    setShowVODModal(true);
  };

  // Function to aggregate player stats across all maps in the series
  const getAggregatedPlayerStats = (sourceSeries = null) => {
    const src = sourceSeries || series;
    if (!src?.matches) return { team1Players: [], team2Players: [] };

    const playerStats = {};

    // Helper to ensure a player entry exists
    const ensurePlayer = (pId, displayName, teamId) => {
      if (!playerStats[pId]) {
        playerStats[pId] = {
          playerId: pId,
          displayName: displayName || String(pId),
          teamId: teamId,
          agents: new Set(),
          kills: 0,
          deaths: 0,
          assists: 0,
          score: 0,
          roundsPlayed: 0,
        };
      }
      return playerStats[pId];
    };

    // Iterate through matches and support multiple shapes:
    // 1) match.teams[].players with player.stats on each player (existing)
    // 2) match.players[] + match.stats[] (rib.gg example in 1.txt)
    src.matches.forEach((match) => {
      // Case A: teams array with players
      if (match.teams && Array.isArray(match.teams) && match.teams.length > 0) {
        match.teams.forEach((team) => {
          if (!team.players) return;
          team.players.forEach((player) => {
            const pId = player.playerId || player.player?.id;
            const display =
              player.displayName ||
              player.player?.ign ||
              player.player?.fullName;
            const teamId = player.teamId || team.teamId || team.id;
            const entry = ensurePlayer(pId, display, teamId);
            if (player.characterId || player.agentId)
              entry.agents.add(player.characterId || player.agentId);
            if (player.stats) {
              entry.kills += player.stats.kills || 0;
              entry.deaths += player.stats.deaths || 0;
              entry.assists += player.stats.assists || 0;
              entry.score += player.stats.score || 0;
              entry.roundsPlayed += player.stats.roundsPlayed || 0;
            }
          });
        });
      }

      // Case B: match.players + match.stats arrays (rib.gg)
      if (
        match.players &&
        Array.isArray(match.players) &&
        match.players.length > 0
      ) {
        // Build a quick map from stats array if available
        const statsMap = {};
        if (match.stats && Array.isArray(match.stats)) {
          match.stats.forEach((s) => {
            statsMap[s.playerId] = s;
          });
        }

        match.players.forEach((p) => {
          const pId = p.playerId || p.player?.id;
          const display = p.player?.ign || p.player?.fullName || String(pId);
          // Map teamNumber to team id if possible
          let teamId = null;
          if (typeof p.teamNumber === "number") {
            // use redTeamNumber to map 1/2 to series.team1/team2
            const redNum = src.redTeamNumber || src.redTeam || null;
            if (redNum !== null && src.team1?.id && src.team2?.id) {
              teamId = p.teamNumber === redNum ? src.team1.id : src.team2.id;
            } else {
              // fallback: use teamNumber 1 -> team1 id, 2 -> team2 id
              teamId =
                p.teamNumber === 1
                  ? src.team1?.id || null
                  : p.teamNumber === 2
                  ? src.team2?.id || null
                  : null;
            }
          }

          const entry = ensurePlayer(pId, display, teamId);
          if (p.agentId || p.characterId)
            entry.agents.add(p.agentId || p.characterId);
          const pStats = statsMap[pId];
          if (pStats) {
            entry.kills += pStats.kills || 0;
            entry.deaths += pStats.deaths || 0;
            entry.assists += pStats.assists || 0;
            entry.score += pStats.score || 0;
            entry.roundsPlayed += pStats.roundsPlayed || 0;
          }
        });
      }
    });

    // Convert agent sets to arrays and separate by teams
    const allPlayers = Object.values(playerStats).map((player) => ({
      ...player,
      agents: Array.from(player.agents),
    }));

    const team1Id = src.team1?.id || series?.team1?.id;
    const team2Id = src.team2?.id || series?.team2?.id;

    const team1Players = allPlayers.filter(
      (p) =>
        p.teamId === team1Id ||
        p.teamId === (src.redTeamNumber === 1 ? team1Id : team1Id)
    );
    const team2Players = allPlayers.filter(
      (p) =>
        p.teamId === team2Id ||
        p.teamId === (src.redTeamNumber === 2 ? team2Id : team2Id)
    );

    return { team1Players, team2Players };
  };

  // Try to fetch series detailed data from rib.gg next/data JSON for richer player/map info
  const fetchCopySeriesData = async () => {
    try {
      // If we already have copySeriesData, return it
      if (copySeriesData) return copySeriesData;

      const id = series?.id || seriesId;
      if (!id) return null;

      // Use known rib.gg next build id (falls back to provided example). This may be brittle if build hash changes.
      const buildHash = "WQmnfxwcCBwiYufnwQNAB";
      const url = `https://corsproxy.io/?url=https://www.rib.gg/_next/data/${buildHash}/en/series/${id}.json?seriesId=${id}`;
      console.log("Fetching rib.gg series details for copy modal:", url);
      const resp = await fetch(url);
      if (!resp.ok) {
        console.log("rib.gg fetch failed with status", resp.status);
        return null;
      }

      const data = await resp.json();
      // Attempt to locate series payload in common places
      const found =
        data?.pageProps?.series ||
        data?.props?.pageProps?.series ||
        data?.series ||
        data;
      setCopySeriesData(found);
      return found;
    } catch (e) {
      console.error("Error fetching rib.gg series data for copy modal", e);
      return null;
    }
  };

  const handleHeaderLongPress = async () => {
    try {
      // If we already fetched a rich copySeriesData, just open the modal
      if (copySeriesData) {
        setShowCopyModal(true);
        return;
      }

      // If the loaded `series` already contains detailed matches/players/stats,
      // reuse it instead of refetching rib.gg next/data. This avoids redundant network calls.
      const hasDetailedMatches =
        series && Array.isArray(series.matches) && series.matches.length > 0;
      const hasPlayerStats =
        hasDetailedMatches &&
        series.matches.some(
          (m) =>
            (m.players && m.players.length > 0) ||
            (m.teams &&
              m.teams.some((t) => t.players && t.players.length > 0)) ||
            (m.stats && m.stats.length > 0)
        );

      if (hasPlayerStats) {
        // Use existing series as copySeriesData so downstream code can read players/scores uniformly
        setCopySeriesData(series);
        setShowCopyModal(true);
        return;
      }

      // Otherwise attempt to fetch the richer rib.gg next/data JSON
      const fetched = await fetchCopySeriesData();
      if (fetched) setCopySeriesData(fetched);
      setShowCopyModal(true);
    } catch (e) {
      console.error("Error handling header long press", e);
      // still open base modal even if fetch fails
      setCopySeriesData(series);
      setShowCopyModal(true);
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

      // captureRef expects the node handle/current ref
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
              dialogTitle: "Share Series Summary",
            });
          } else {
            await Share.share({ message: "Series summary", url: uri });
          }
        } catch (shareErr) {
          console.warn(
            "Primary sharing failed, falling back to native Share",
            shareErr
          );
          await Share.share({ message: "Series summary", url: uri });
        }
      }
    } catch (e) {
      console.error("Error sharing copy card", e);
      setIsCapturing(false); // Reset on error
      Alert.alert("Error", "Failed to share series summary");
    }
  };

  if (loading) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading series details...
        </Text>
      </View>
    );
  }

  if (!series) {
    return (
      <View
        style={[styles.errorContainer, { backgroundColor: theme.background }]}
      >
        <Ionicons
          name="alert-circle-outline"
          size={64}
          color={theme.textTertiary}
        />
        <Text style={[styles.errorTitle, { color: theme.text }]}>
          Series Not Found
        </Text>
        <Text style={[styles.errorText, { color: theme.textSecondary }]}>
          The requested series could not be loaded.
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={loadSeriesData}
        >
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    console.log(series),
    // compute opacities and sizes for header display
    ((() => {
      // side-effect free block to compute values used in JSX below
      const team1Opacity = series?.completed
        ? series.team1Score < series.team2Score
          ? 0.5
          : 1
        : 1;
      const team2Opacity = series?.completed
        ? series.team2Score < series.team1Score
          ? 0.5
          : 1
        : 1;
      // attach to series for use via closure in JSX (not ideal but keeps patch minimal)
      series._team1Opacity = team1Opacity;
      series._team2Opacity = team2Opacity;
    })(),
    (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}
        >
          {/* Series Header */}
          <TouchableOpacity
            style={[
              styles.seriesHeader,
              { backgroundColor: theme.surfaceSecondary },
            ]}
            activeOpacity={1}
            onLongPress={() => handleHeaderLongPress && handleHeaderLongPress()}
            delayLongPress={250}
          >
            {/* Event Name */}
            <TouchableOpacity
              style={styles.eventHeaderContainer}
              onPress={() =>
                navigation.navigate("VALEvent", {
                  eventId: series.parentEventId,
                })
              }
            >
              <Text style={[styles.eventName, { color: theme.text }]}>
                {series.eventName || "Match Details"}
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
                        navigation.navigate("VALTeamPage", {
                          teamId: series.team1.id,
                          teamName: series.team1.name,
                        });
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Image
                      source={{
                        uri:
                          series.team1?.logoUrl ||
                          "https://i.imgur.com/BIC4pnO.webp",
                      }}
                      style={[
                        styles.teamLogoHead,
                        {
                          opacity:
                            series.completed &&
                            series.team1Score < series.team2Score
                              ? 0.6
                              : 1,
                        },
                      ]}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                  {!series.completed && !series.live ? null : (
                  <Text
                    style={[
                      styles.scoreText,
                      {
                        color: theme.text,
                        opacity:
                          series.completed &&
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
                        navigation.navigate("VALTeamPage", {
                          teamId: series.team2.id,
                          teamName: series.team2.name,
                        });
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Image
                      source={{
                        uri:
                          series.team2?.logoUrl ||
                          "https://i.imgur.com/BIC4pnO.webp",
                      }}
                      style={[
                        styles.teamLogoHead,
                        {
                          opacity:
                            series.completed &&
                            series.team2Score < series.team1Score
                              ? 0.6
                              : 1,
                        },
                      ]}
                      resizeMode="contain"
                    />
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
                  style={[
                    styles.statusBadge,
                    { backgroundColor: theme.success },
                  ]}
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
                  style={[
                    styles.statusBadge,
                    { backgroundColor: theme.warning },
                  ]}
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

          {/* Tab Navigation */}
          <View
            style={[styles.tabContainer, { backgroundColor: theme.surface }]}
          >
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
              {/* Live Stream Section */}
              {series.eventLivestreamLink && !series.completed && (
                <View style={styles.gameDetailsSection}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    Live Stream
                  </Text>

                  <View style={styles.streamContainer}>
                    <WebView
                      source={{
                        uri: createStreamEmbedUrl(series.eventLivestreamLink),
                      }}
                      style={styles.streamPlayer}
                      allowsFullscreenVideo={true}
                      mediaPlaybackRequiresUserAction={false}
                      javaScriptEnabled={true}
                      domStorageEnabled={true}
                      startInLoadingState={true}
                      scalesPageToFit={false}
                      onError={(syntheticEvent) => {
                        const { nativeEvent } = syntheticEvent;
                        console.error("WebView error: ", nativeEvent);
                      }}
                      onHttpError={(syntheticEvent) => {
                        const { nativeEvent } = syntheticEvent;
                        console.error("WebView HTTP error: ", nativeEvent);
                      }}
                    />
                  </View>
                </View>
              )}

              {/* Game Details Section */}
              <View style={styles.gameDetailsSection}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Game details
                </Text>

                {series.matches && series.matches.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.gameScrollView}
                    contentContainerStyle={styles.gameScrollContent}
                  >
                    {series.matches
                      .filter((match) => match.map?.name) // Only render if map name exists
                      .map((match, index) => {
                        const mapName = getMapDisplayName(match.map?.name);
                        const team1Won = match.team1Score > match.team2Score;
                        const team2Won = match.team2Score > match.team1Score;

                        return (
                          <TouchableOpacity
                            key={index}
                            style={[
                              styles.gameCard,
                              { backgroundColor: theme.surface },
                            ]}
                            onPress={() => {
                              setSelectedGameIndex(index);
                              // Navigate to match details screen
                              navigation.navigate("VALMatch", {
                                matchId: match.matchId || match.id,
                                matchData: {
                                  mapName: match.map?.name,
                                  team1: series.team1,
                                  team2: series.team2,
                                  team1Score: match.team1Score,
                                  team2Score: match.team2Score,
                                  status: match.completed
                                    ? "COMPLETED"
                                    : match.live
                                    ? "LIVE"
                                    : "SCHEDULED",
                                  players: match.players,
                                },
                              });
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
                                style={[
                                  styles.gameTitle,
                                  { color: theme.text },
                                ]}
                              >
                                Game {index + 1}
                              </Text>
                              {match.completed ? (
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
                              ) : match.live ? (
                                <View
                                  style={[
                                    styles.gameStatus,
                                    { backgroundColor: theme.error },
                                  ]}
                                >
                                  <Text style={styles.gameStatusText}>
                                    LIVE
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
                                source={{ uri: getMapSampleUrl(mapName) }}
                                style={styles.mapBackground}
                                resizeMode="cover"
                              />

                              {/* Map Overlay */}
                              <View style={styles.mapOverlay} />

                              {/* Score Content */}
                              <View style={styles.scoreContent}>
                                <View style={styles.teamScoreContainer}>
                                  <Image
                                    source={{ uri: series.team1?.logoUrl }}
                                    style={[
                                      styles.teamLogo,
                                      {
                                        opacity:
                                          match.completed && !team1Won
                                            ? 0.6
                                            : 1,
                                      },
                                    ]}
                                    resizeMode="contain"
                                  />
                                  <Text
                                    style={[
                                      styles.gameScoreText,
                                      {
                                        color: "white",
                                        opacity:
                                          match.completed && !team1Won
                                            ? 0.6
                                            : 1,
                                      },
                                    ]}
                                  >
                                    {match.team1Score || 0}
                                  </Text>
                                </View>

                                <View style={styles.mapNameContainer}>
                                  <Text
                                    style={[styles.mapName, { color: "white" }]}
                                  >
                                    {mapName}
                                  </Text>
                                </View>

                                <View style={styles.teamScoreContainer}>
                                  <Text
                                    style={[
                                      styles.gameScoreText,
                                      {
                                        color: "white",
                                        opacity:
                                          match.completed && !team2Won
                                            ? 0.6
                                            : 1,
                                      },
                                    ]}
                                  >
                                    {match.team2Score || 0}
                                  </Text>
                                  <Image
                                    source={{ uri: series.team2?.logoUrl }}
                                    style={[
                                      styles.teamLogo,
                                      {
                                        opacity:
                                          match.completed && !team2Won
                                            ? 0.6
                                            : 1,
                                      },
                                    ]}
                                    resizeMode="contain"
                                  />
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
                              {match.players && (
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
                                        {match.players
                                          .filter(
                                            (player) => player.teamNumber === 1
                                          )
                                          .slice(0, 5)
                                          .map((player, pIndex) => {
                                            const agentName =
                                              getAgentDisplayName(
                                                player.agentId
                                              );
                                            return (
                                              <View
                                                key={pIndex}
                                                style={styles.leftPlayerItem}
                                              >
                                                <Image
                                                  source={{
                                                    uri: getAgentImageUrl(
                                                      agentName
                                                    ),
                                                  }}
                                                  style={styles.agentImage}
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
                                                  <Text
                                                    style={[
                                                      styles.agentName,
                                                      {
                                                        color:
                                                          theme.textSecondary,
                                                      },
                                                    ]}
                                                  >
                                                    {agentName}
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
                                        {match.players
                                          .filter(
                                            (player) => player.teamNumber === 2
                                          )
                                          .slice(0, 5)
                                          .map((player, pIndex) => {
                                            const agentName =
                                              getAgentDisplayName(
                                                player.agentId
                                              );
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
                                                  <Text
                                                    style={[
                                                      styles.agentName,
                                                      {
                                                        color:
                                                          theme.textSecondary,
                                                        textAlign: "right",
                                                      },
                                                    ]}
                                                  >
                                                    {agentName}
                                                  </Text>
                                                </View>
                                                <Image
                                                  source={{
                                                    uri: getAgentImageUrl(
                                                      agentName
                                                    ),
                                                  }}
                                                  style={styles.agentImage}
                                                  resizeMode="cover"
                                                />
                                              </View>
                                            );
                                          })}
                                      </View>
                                    </View>
                                  </View>

                                  {/* Action Buttons */}
                                  <View style={styles.gameActions}>
                                    <TouchableOpacity
                                      style={[
                                        styles.actionButton,
                                        { backgroundColor: colors.primary },
                                      ]}
                                      onPress={() => openRoundsModal(index)}
                                    >
                                      <Text style={styles.actionButtonText}>
                                        Rounds
                                      </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                      style={[
                                        styles.actionButton,
                                        { backgroundColor: colors.primary },
                                      ]}
                                      onPress={() => openPlayersModal(index)}
                                    >
                                      <Text style={styles.actionButtonText}>
                                        Players
                                      </Text>
                                    </TouchableOpacity>
                                  </View>
                                </>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                  </ScrollView>
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
                      const mapName = getMapNameById(pickban.mapId);
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
                        displayText = `${teamName} - ${
                          isPick ? "PICK" : "BAN"
                        }`;
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
                            source={{ uri: getMapSampleUrl(mapName) }}
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

              {/* VODs Section */}
              {series.matches &&
                series.matches.filter((match) => match.vodUrl).length > 0 && (
                  <View style={styles.vodsSection}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>
                      VODs
                    </Text>

                    <View style={styles.vodsContainer}>
                      {series.matches
                        .filter((match) => match.vodUrl)
                        .map((match, index) => {
                          const mapName = getMapDisplayName(match.map?.name);
                          return (
                            <TouchableOpacity
                              key={index}
                              style={[
                                styles.vodButton,
                                { backgroundColor: theme.surface },
                              ]}
                              onPress={() => openVOD(match.vodUrl)}
                              activeOpacity={0.7}
                            >
                              <Image
                                source={{
                                  uri: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/YouTube_play_button_icon_%282013%E2%80%932017%29.svg/2560px-YouTube_play_button_icon_%282013%E2%80%932017%29.svg.png",
                                }}
                                style={styles.youtubeIcon}
                                resizeMode="contain"
                              />
                              <Text
                                style={[
                                  styles.vodButtonText,
                                  { color: theme.text },
                                ]}
                              >
                                VOD - {mapName}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                    </View>
                  </View>
                )}
            </View>
          )}

          {activeTab === "stats" && (
            <View style={styles.contentContainer}>
              {headToHeadData ? (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {/* Head-to-Head Record */}
                  {headToHeadData.previousMatchupSeries &&
                    headToHeadData.previousMatchupSeries.length > 0 && (
                      <View style={styles.statsSection}>
                        <Text
                          style={[styles.sectionTitle, { color: theme.text }]}
                        >
                          Head-to-Head Record
                        </Text>

                        {/* Overall Record */}
                        <View
                          style={[
                            styles.recordCard,
                            { backgroundColor: theme.surface },
                          ]}
                        >
                          <View style={styles.recordStats}>
                            <View style={styles.teamRecord}>
                              <Text
                                style={[
                                  styles.teamRecordName,
                                  { color: theme.text },
                                ]}
                              >
                                {series.team1?.shortName}
                              </Text>
                              <View style={styles.teamRecordScoreRow}>
                                <Image
                                  source={{ uri: series.team1?.logoUrl }}
                                  style={styles.recordTeamLogo}
                                  resizeMode="contain"
                                />
                                <Text
                                  style={[
                                    styles.teamRecordScore,
                                    { color: theme.text },
                                  ]}
                                >
                                  {
                                    headToHeadData.previousMatchupSeries.filter(
                                      (s) =>
                                        (s.team1Id === series.team1?.id &&
                                          s.team1Score > s.team2Score) ||
                                        (s.team2Id === series.team1?.id &&
                                          s.team2Score > s.team1Score)
                                    ).length
                                  }
                                </Text>
                              </View>
                            </View>

                            <Text
                              style={[
                                styles.recordSeparator,
                                { color: theme.textSecondary },
                              ]}
                            >
                              -
                            </Text>

                            <View style={styles.teamRecord}>
                              <Text
                                style={[
                                  styles.teamRecordName,
                                  { color: theme.text },
                                ]}
                              >
                                {series.team2?.shortName}
                              </Text>
                              <View style={styles.teamRecordScoreRow}>
                                <Text
                                  style={[
                                    styles.teamRecordScore,
                                    { color: theme.text },
                                  ]}
                                >
                                  {
                                    headToHeadData.previousMatchupSeries.filter(
                                      (s) =>
                                        (s.team1Id === series.team2?.id &&
                                          s.team1Score > s.team2Score) ||
                                        (s.team2Id === series.team2?.id &&
                                          s.team2Score > s.team1Score)
                                    ).length
                                  }
                                </Text>
                                <Image
                                  source={{ uri: series.team2?.logoUrl }}
                                  style={styles.recordTeamLogo}
                                  resizeMode="contain"
                                />
                              </View>
                            </View>
                          </View>

                          <Text
                            style={[
                              styles.recordSubtext,
                              { color: theme.textSecondary },
                            ]}
                          >
                            Last {headToHeadData.previousMatchupSeries.length}{" "}
                            matches
                          </Text>
                        </View>

                        {/* Recent Matches */}
                        <View style={styles.recentMatches}>
                          <Text
                            style={[
                              styles.subsectionTitle,
                              { color: theme.text },
                            ]}
                          >
                            Recent Matches
                          </Text>
                          {headToHeadData.previousMatchupSeries
                            .slice(0, 5)
                            .map((match, index) => {
                              const team1Won =
                                (match.team1Id === series.team1?.id &&
                                  match.team1Score > match.team2Score) ||
                                (match.team2Id === series.team1?.id &&
                                  match.team2Score > match.team1Score);
                              const team2Won = !team1Won;

                              return (
                                <TouchableOpacity
                                  key={match.id}
                                  style={[
                                    styles.matchHistoryItem,
                                    { backgroundColor: theme.surfaceSecondary },
                                  ]}
                                  onPress={() =>
                                    navigation.push("VALSeries", {
                                      seriesId: match.id,
                                      seriesData: match,
                                    })
                                  }
                                  activeOpacity={0.7}
                                >
                                  <Text
                                    style={[
                                      styles.matchHistoryEvent,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    {match.eventName}
                                  </Text>
                                  <View style={styles.matchHistoryContent}>
                                    <View style={styles.matchHistoryTeams}>
                                      <View style={styles.matchHistoryTeamLeft}>
                                        <Image
                                          source={{
                                            uri: series.team1?.logoUrl,
                                          }}
                                          style={[
                                            styles.matchHistoryLogo,
                                            { opacity: team1Won ? 1 : 0.6 },
                                          ]}
                                          resizeMode="contain"
                                        />
                                        <Text
                                          style={[
                                            styles.matchHistoryTeamName,
                                            {
                                              color: theme.text,
                                              opacity: team1Won ? 1 : 0.6,
                                            },
                                          ]}
                                        >
                                          {series.team1?.shortName}
                                        </Text>
                                      </View>

                                      <View style={styles.matchHistoryScore}>
                                        <Text
                                          style={[
                                            styles.matchHistoryScoreText,
                                            {
                                              color: team1Won
                                                ? theme.text
                                                : theme.textSecondary,
                                            },
                                          ]}
                                        >
                                          {match.team1Id === series.team1?.id
                                            ? match.team1Score
                                            : match.team2Score}
                                        </Text>
                                        <Text
                                          style={[
                                            styles.matchHistoryScoreSep,
                                            { color: theme.textSecondary },
                                          ]}
                                        >
                                          -
                                        </Text>
                                        <Text
                                          style={[
                                            styles.matchHistoryScoreText,
                                            {
                                              color: team2Won
                                                ? theme.text
                                                : theme.textSecondary,
                                            },
                                          ]}
                                        >
                                          {match.team1Id === series.team1?.id
                                            ? match.team2Score
                                            : match.team1Score}
                                        </Text>
                                      </View>

                                      <View
                                        style={styles.matchHistoryTeamRight}
                                      >
                                        <Image
                                          source={{
                                            uri: series.team2?.logoUrl,
                                          }}
                                          style={[
                                            styles.matchHistoryLogoRight,
                                            { opacity: team2Won ? 1 : 0.6 },
                                          ]}
                                          resizeMode="contain"
                                        />
                                        <Text
                                          style={[
                                            styles.matchHistoryTeamName,
                                            {
                                              color: theme.text,
                                              opacity: team2Won ? 1 : 0.6,
                                            },
                                          ]}
                                        >
                                          {series.team2?.shortName}
                                        </Text>
                                      </View>
                                    </View>

                                    <Text
                                      style={[
                                        styles.matchHistoryDate,
                                        { color: theme.textSecondary },
                                      ]}
                                    >
                                      {new Date(
                                        match.startDate
                                      ).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                      })}
                                    </Text>
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                        </View>
                      </View>
                    )}

                  {/* Map Success Rates */}
                  {headToHeadData.mapSuccess &&
                    headToHeadData.mapSuccess.length > 0 && (
                      <View style={styles.statsSection}>
                        <Text
                          style={[styles.sectionTitle, { color: theme.text }]}
                        >
                          Map Performance
                        </Text>

                        <View style={styles.mapStatsGrid}>
                          {headToHeadData.mapSuccess.map((mapData, index) => {
                            const team1WinRate =
                              mapData.team1.matchesPlayed > 0
                                ? (
                                    (mapData.team1.matchesWon /
                                      mapData.team1.matchesPlayed) *
                                    100
                                  ).toFixed(0)
                                : 0;
                            const team2WinRate =
                              mapData.team2.matchesPlayed > 0
                                ? (
                                    (mapData.team2.matchesWon /
                                      mapData.team2.matchesPlayed) *
                                    100
                                  ).toFixed(0)
                                : 0;

                            return (
                              <View
                                key={mapData.mapId}
                                style={styles.mapStatCard}
                              >
                                <Image
                                  source={{
                                    uri: getMapSampleUrl(mapData.mapName),
                                  }}
                                  style={styles.mapStatBackground}
                                  resizeMode="cover"
                                />
                                <View style={styles.mapStatOverlay} />
                                <View style={styles.mapStatContent}>
                                  <Text
                                    style={[
                                      styles.mapStatName,
                                      { color: "white" },
                                    ]}
                                  >
                                    {mapData.mapName}
                                  </Text>

                                  <View style={styles.mapStatTeams}>
                                    <View style={styles.mapStatTeam}>
                                      <Text
                                        style={[
                                          styles.mapStatTeamName,
                                          { color: "white" },
                                        ]}
                                      >
                                        {series.team1?.shortName}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.mapStatWinRate,
                                          { color: "white" },
                                        ]}
                                      >
                                        {team1WinRate}%
                                      </Text>
                                      <Text
                                        style={[
                                          styles.mapStatRecord,
                                          { color: "rgba(255,255,255,0.8)" },
                                        ]}
                                      >
                                        {mapData.team1.matchesWon}W{" "}
                                        {mapData.team1.matchesPlayed -
                                          mapData.team1.matchesWon}
                                        L
                                      </Text>
                                    </View>

                                    <View style={styles.mapStatDivider} />

                                    <View style={styles.mapStatTeam}>
                                      <Text
                                        style={[
                                          styles.mapStatTeamName,
                                          { color: "white" },
                                        ]}
                                      >
                                        {series.team2?.shortName}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.mapStatWinRate,
                                          { color: "white" },
                                        ]}
                                      >
                                        {team2WinRate}%
                                      </Text>
                                      <Text
                                        style={[
                                          styles.mapStatRecord,
                                          { color: "rgba(255,255,255,0.8)" },
                                        ]}
                                      >
                                        {mapData.team2.matchesWon}W{" "}
                                        {mapData.team2.matchesPlayed -
                                          mapData.team2.matchesWon}
                                        L
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    )}

                  {/* Recent Form - Team 1 */}
                  {headToHeadData.team1Series &&
                    headToHeadData.team1Series.length > 0 && (
                      <View style={styles.statsSection}>
                        <Text
                          style={[styles.sectionTitle, { color: theme.text }]}
                        >
                          {series.team1?.shortName} Recent Form
                        </Text>

                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={styles.recentFormScroll}
                        >
                          {headToHeadData.team1Series
                            .slice(0, 5)
                            .map((match, index) => {
                              const isTeam1 =
                                match.team1Id === series.team1?.id;
                              const teamScore = isTeam1
                                ? match.team1Score
                                : match.team2Score;
                              const opponentScore = isTeam1
                                ? match.team2Score
                                : match.team1Score;
                              const won = teamScore > opponentScore;
                              const opponent = isTeam1
                                ? match.team2
                                : match.team1;

                              return (
                                <TouchableOpacity
                                  key={match.id}
                                  style={[
                                    styles.recentFormGameCard,
                                    { backgroundColor: theme.surface },
                                  ]}
                                  onPress={() =>
                                    navigation.push("VALSeries", {
                                      seriesId: match.id,
                                      seriesData: match,
                                    })
                                  }
                                  activeOpacity={0.7}
                                >
                                  <View
                                    style={[
                                      styles.formResultBadge,
                                      {
                                        backgroundColor: won
                                          ? theme.success
                                          : theme.error,
                                      },
                                    ]}
                                  >
                                    <Text style={styles.formResultText}>
                                      {won ? "W" : "L"}
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
                                      {match.eventChildLabel}
                                    </Text>

                                    <View style={styles.formMatchup}>
                                      <Image
                                        source={{ uri: series.team1?.logoUrl }}
                                        style={styles.formTeamLogo}
                                        resizeMode="contain"
                                      />
                                      <View style={styles.formScoreContainer}>
                                        <Text
                                          style={[
                                            styles.formScore,
                                            { color: theme.text },
                                          ]}
                                        >
                                          {teamScore} - {opponentScore}
                                        </Text>
                                      </View>
                                      <Image
                                        source={{
                                          uri:
                                            opponent?.logoUrl ||
                                            "https://i.imgur.com/BIC4pnO.webp",
                                        }}
                                        style={styles.formTeamLogo}
                                        resizeMode="contain"
                                      />
                                    </View>

                                    <Text
                                      style={[
                                        styles.formDate,
                                        { color: theme.textSecondary },
                                      ]}
                                    >
                                      {new Date(
                                        match.startDate
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
                  {headToHeadData.team2Series &&
                    headToHeadData.team2Series.length > 0 && (
                      <View style={styles.statsSection}>
                        <Text
                          style={[styles.sectionTitle, { color: theme.text }]}
                        >
                          {series.team2?.shortName} Recent Form
                        </Text>

                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={styles.recentFormScroll}
                        >
                          {headToHeadData.team2Series
                            .slice(0, 5)
                            .map((match, index) => {
                              const isTeam1 =
                                match.team1Id === series.team2?.id;
                              const teamScore = isTeam1
                                ? match.team1Score
                                : match.team2Score;
                              const opponentScore = isTeam1
                                ? match.team2Score
                                : match.team1Score;
                              const won = teamScore > opponentScore;
                              const opponent = isTeam1
                                ? match.team2
                                : match.team1;

                              return (
                                <TouchableOpacity
                                  key={match.id}
                                  style={[
                                    styles.recentFormGameCard,
                                    { backgroundColor: theme.surface },
                                  ]}
                                  onPress={() =>
                                    navigation.push("VALSeries", {
                                      seriesId: match.id,
                                      seriesData: match,
                                    })
                                  }
                                  activeOpacity={0.7}
                                >
                                  <View
                                    style={[
                                      styles.formResultBadge,
                                      {
                                        backgroundColor: won
                                          ? theme.success
                                          : theme.error,
                                      },
                                    ]}
                                  >
                                    <Text style={styles.formResultText}>
                                      {won ? "W" : "L"}
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
                                      {match.eventChildLabel}
                                    </Text>

                                    <View style={styles.formMatchup}>
                                      <Image
                                        source={{ uri: series.team2?.logoUrl }}
                                        style={styles.formTeamLogo}
                                        resizeMode="contain"
                                      />
                                      <View style={styles.formScoreContainer}>
                                        <Text
                                          style={[
                                            styles.formScore,
                                            { color: theme.text },
                                          ]}
                                        >
                                          {teamScore} - {opponentScore}
                                        </Text>
                                      </View>
                                      <Image
                                        source={{
                                          uri:
                                            opponent?.logoUrl ||
                                            "https://i.imgur.com/BIC4pnO.webp",
                                        }}
                                        style={styles.formTeamLogo}
                                        resizeMode="contain"
                                      />
                                    </View>

                                    <Text
                                      style={[
                                        styles.formDate,
                                        { color: theme.textSecondary },
                                      ]}
                                    >
                                      {new Date(
                                        match.startDate
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
                </ScrollView>
              ) : (
                <View style={styles.comingSoonContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text
                    style={[
                      styles.comingSoonText,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Loading team statistics...
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Rounds Modal */}
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
              style={[
                styles.modalContent,
                { backgroundColor: theme.background },
              ]}
            >
              {selectedModalGame !== null &&
              series.matches &&
              series.matches[selectedModalGame] ? (
                (() => {
                  const match = series.matches[selectedModalGame];
                  const matchId = match.id;
                  const attackDefenseStats = calculateAttackDefenseStats(
                    series.stats?.rounds || [],
                    matchId
                  );
                  const roundsByHalves = organizeRoundsByHalves(
                    series.stats?.rounds || [],
                    matchId
                  );
                  const mapName = getMapDisplayName(match.map.name);

                  return (
                    <View style={styles.roundsModalContainer}>
                      {/* Fixed Header with Map Background */}
                      <View style={styles.roundsFloatingHeader}>
                        <Image
                          source={{ uri: getMapSampleUrl(mapName) }}
                          style={styles.roundsMapBackground}
                          resizeMode="cover"
                        />
                        <View style={styles.roundsMapOverlay} />

                        {/* Team Info and Stats */}
                        <View style={styles.roundsTeamStatsContainer}>
                          {/* Team 1 */}
                          <View style={styles.roundsTeamSection}>
                            <Image
                              source={{ uri: series.team1?.logoUrl }}
                              style={styles.roundsTeamLogo}
                              resizeMode="contain"
                            />
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
                              {match.team1Score} - {match.team2Score}
                            </Text>
                          </View>

                          {/* Team 2 */}
                          <View style={styles.roundsTeamSection}>
                            <Image
                              source={{ uri: series.team2?.logoUrl }}
                              style={styles.roundsTeamLogo}
                              resizeMode="contain"
                            />
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
                                  <Image
                                    source={{ uri: series.team1?.logoUrl }}
                                    style={styles.roundsRowTeamLogo}
                                    resizeMode="contain"
                                  />
                                </View>
                                <View style={styles.teamLogoAligned}>
                                  <Image
                                    source={{ uri: series.team2?.logoUrl }}
                                    style={styles.roundsRowTeamLogo}
                                    resizeMode="contain"
                                  />
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
                                {roundsByHalves.firstHalf.map(
                                  (round, index) => (
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
                                                ? round.attackingTeamNumber ===
                                                  1
                                                  ? theme.error
                                                  : theme.success
                                                : theme.surfaceSecondary + "20",
                                          },
                                        ]}
                                      >
                                        {round.winningTeamNumber === 1 && (
                                          <FontAwesome6
                                            name={getWinConditionIcon(
                                              round.winCondition
                                            )}
                                            size={12}
                                            color="white"
                                          />
                                        )}
                                      </View>

                                      {/* Team 2 Round (Bottom) */}
                                      <View
                                        style={[
                                          styles.liquipediaRoundIndicator,
                                          {
                                            backgroundColor:
                                              round.winningTeamNumber === 2
                                                ? round.attackingTeamNumber ===
                                                  2
                                                  ? theme.error
                                                  : theme.success
                                                : theme.surfaceSecondary + "20",
                                          },
                                        ]}
                                      >
                                        {round.winningTeamNumber === 2 && (
                                          <FontAwesome6
                                            name={getWinConditionIcon(
                                              round.winCondition
                                            )}
                                            size={12}
                                            color="white"
                                          />
                                        )}
                                      </View>
                                    </View>
                                  )
                                )}
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
                                  <Image
                                    source={{ uri: series.team1?.logoUrl }}
                                    style={styles.roundsRowTeamLogo}
                                    resizeMode="contain"
                                  />
                                </View>
                                <View style={styles.teamLogoAligned}>
                                  <Image
                                    source={{ uri: series.team2?.logoUrl }}
                                    style={styles.roundsRowTeamLogo}
                                    resizeMode="contain"
                                  />
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
                                {roundsByHalves.secondHalf.map(
                                  (round, index) => (
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
                                                ? round.attackingTeamNumber ===
                                                  1
                                                  ? theme.error
                                                  : theme.success
                                                : theme.surfaceSecondary + "20",
                                          },
                                        ]}
                                      >
                                        {round.winningTeamNumber === 1 && (
                                          <FontAwesome6
                                            name={getWinConditionIcon(
                                              round.winCondition
                                            )}
                                            size={12}
                                            color="white"
                                          />
                                        )}
                                      </View>

                                      {/* Team 2 Round (Bottom) */}
                                      <View
                                        style={[
                                          styles.liquipediaRoundIndicator,
                                          {
                                            backgroundColor:
                                              round.winningTeamNumber === 2
                                                ? round.attackingTeamNumber ===
                                                  2
                                                  ? theme.error
                                                  : theme.success
                                                : theme.surfaceSecondary + "20",
                                          },
                                        ]}
                                      >
                                        {round.winningTeamNumber === 2 && (
                                          <FontAwesome6
                                            name={getWinConditionIcon(
                                              round.winCondition
                                            )}
                                            size={12}
                                            color="white"
                                          />
                                        )}
                                      </View>
                                    </View>
                                  )
                                )}
                              </ScrollView>
                            </View>
                          </View>
                        )}

                        {/* Overtime */}
                        {roundsByHalves.overtime.length > 0 && (
                          <View style={styles.roundsHalfSection}>
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
                                  <Image
                                    source={{ uri: series.team1?.logoUrl }}
                                    style={styles.roundsRowTeamLogo}
                                    resizeMode="contain"
                                  />
                                </View>
                                <View style={styles.teamLogoAligned}>
                                  <Image
                                    source={{ uri: series.team2?.logoUrl }}
                                    style={styles.roundsRowTeamLogo}
                                    resizeMode="contain"
                                  />
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
                                        <FontAwesome6
                                          name={getWinConditionIcon(
                                            round.winCondition
                                          )}
                                          size={12}
                                          color="white"
                                        />
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
                                        <FontAwesome6
                                          name={getWinConditionIcon(
                                            round.winCondition
                                          )}
                                          size={12}
                                          color="white"
                                        />
                                      )}
                                    </View>
                                  </View>
                                ))}
                              </ScrollView>
                            </View>
                          </View>
                        )}

                        {/* No Rounds Available */}
                        {roundsByHalves.firstHalf.length === 0 &&
                          roundsByHalves.secondHalf.length === 0 &&
                          roundsByHalves.overtime.length === 0 && (
                            <View style={styles.noRoundsContainer}>
                              <Text
                                style={[
                                  styles.noDataText,
                                  { color: theme.textSecondary },
                                ]}
                              >
                                Round details not available for this match
                              </Text>
                            </View>
                          )}

                        {/* Add bottom padding for scrolling */}
                        <View style={{ height: 20 }} />
                      </ScrollView>
                    </View>
                  );
                })()
              ) : (
                <View style={styles.noDataContainer}>
                  <TouchableOpacity
                    style={styles.roundsCloseButton}
                    onPress={() => setShowRoundsModal(false)}
                  >
                    <Ionicons name="close" size={24} color={theme.text} />
                  </TouchableOpacity>
                  <Text
                    style={[styles.noDataText, { color: theme.textSecondary }]}
                  >
                    No match selected
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Modal>

        {/* Players Modal */}
        <Modal
          visible={showPlayersModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowPlayersModal(false)}
        >
          <View style={styles.halfModalContainer}>
            <TouchableOpacity
              style={styles.modalBackgroundOverlay}
              activeOpacity={1}
              onPress={() => setShowPlayersModal(false)}
            />
            <View
              style={[
                styles.modalContent,
                { backgroundColor: theme.background },
              ]}
            >
              {selectedModalGame !== null &&
              series.matches &&
              series.matches[selectedModalGame] ? (
                (() => {
                  const match = series.matches[selectedModalGame];
                  const matchId = match.id;
                  const mapName = getMapDisplayName(match.map.name);

                  // Get players from match.players array (same as main view)
                  const team1Players =
                    match.players?.filter(
                      (player) => player.teamNumber === 1
                    ) || [];
                  const team2Players =
                    match.players?.filter(
                      (player) => player.teamNumber === 2
                    ) || [];

                  return (
                    <View style={styles.playersModalContainer}>
                      {/* Fixed Header with Map Background - Same as Rounds Modal */}
                      <View style={styles.roundsFloatingHeader}>
                        <Image
                          source={{ uri: getMapSampleUrl(mapName) }}
                          style={styles.roundsMapBackground}
                          resizeMode="cover"
                        />
                        <View style={styles.roundsMapOverlay} />

                        {/* Team Info and Stats */}
                        <View style={styles.roundsTeamStatsContainer}>
                          {/* Team 1 */}
                          <View style={styles.roundsTeamSection}>
                            <Image
                              source={{ uri: series.team1?.logoUrl }}
                              style={styles.roundsTeamLogo}
                              resizeMode="contain"
                            />
                            <Text style={styles.roundsTeamName}>
                              {series.team1?.shortName || series.team1?.name}
                            </Text>
                          </View>

                          {/* Map Name and Score */}
                          <View style={styles.roundsMapScoreSection}>
                            <Text style={styles.roundsMapName}>{mapName}</Text>
                            <Text style={styles.roundsFinalScore}>
                              {match.team1Score} - {match.team2Score}
                            </Text>
                          </View>

                          {/* Team 2 */}
                          <View style={styles.roundsTeamSection}>
                            <Image
                              source={{ uri: series.team2?.logoUrl }}
                              style={styles.roundsTeamLogo}
                              resizeMode="contain"
                            />
                            <Text style={styles.roundsTeamName}>
                              {series.team2?.shortName || series.team2?.name}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Scrollable Players Content */}
                      <ScrollView
                        style={styles.playersScrollableContent}
                        showsVerticalScrollIndicator={false}
                      >
                        <View style={styles.playersMainSection}>
                          <View style={styles.teamsContainer}>
                            {/* Left Team Container - Team 1 */}
                            <View style={styles.leftTeamContainer}>
                              <Text
                                style={[
                                  styles.teamLabel,
                                  { color: theme.text },
                                ]}
                              >
                                {series.team1?.shortName || series.team1?.name}
                              </Text>
                              <View style={styles.leftPlayersColumn}>
                                {team1Players
                                  .slice(0, 5)
                                  .map((player, index) => {
                                    // Aggregate player stats from all rounds for this match
                                    const playerRoundStats =
                                      series.playerStats?.filter(
                                        (stat) =>
                                          stat.matchId === matchId &&
                                          stat.playerId === player.playerId
                                      ) || [];

                                    const aggregatedStats =
                                      playerRoundStats.reduce(
                                        (acc, stat) => ({
                                          kills: acc.kills + (stat.kills || 0),
                                          deaths:
                                            acc.deaths + (stat.deaths || 0),
                                          assists:
                                            acc.assists + (stat.assists || 0),
                                          acs: acc.acs + (stat.acs || 0),
                                          damage:
                                            acc.damage + (stat.damage || 0),
                                        }),
                                        {
                                          kills: 0,
                                          deaths: 0,
                                          assists: 0,
                                          acs: 0,
                                          damage: 0,
                                        }
                                      );

                                    // Calculate rating (simplified ACS-based rating)
                                    const avgAcs =
                                      playerRoundStats.length > 0
                                        ? aggregatedStats.acs /
                                          playerRoundStats.length
                                        : 0;
                                    const rating = (avgAcs / 100).toFixed(2);
                                    const agentName = getAgentDisplayName(
                                      player.agentId
                                    );

                                    return (
                                      <View
                                        key={player.playerId}
                                        style={styles.leftPlayerItem}
                                      >
                                        <Image
                                          source={{
                                            uri: getAgentImageUrl(agentName),
                                          }}
                                          style={styles.agentImage}
                                          resizeMode="cover"
                                        />
                                        <View style={styles.playerInfo}>
                                          <Text
                                            style={[
                                              styles.playerName,
                                              { color: theme.text },
                                            ]}
                                          >
                                            {player.player?.ign || "Unknown"}
                                          </Text>
                                          <Text
                                            style={[
                                              styles.playerStats,
                                              { color: theme.textSecondary },
                                            ]}
                                          >
                                            {rating} | {aggregatedStats.kills}/
                                            {aggregatedStats.deaths}/
                                            {aggregatedStats.assists}
                                          </Text>
                                        </View>
                                      </View>
                                    );
                                  })}
                              </View>
                            </View>

                            {/* Right Team Container - Team 2 */}
                            <View style={styles.rightTeamContainer}>
                              <Text
                                style={[
                                  styles.teamLabel,
                                  { color: theme.text },
                                ]}
                              >
                                {series.team2?.shortName || series.team2?.name}
                              </Text>
                              <View style={styles.rightPlayersColumn}>
                                {team2Players
                                  .slice(0, 5)
                                  .map((player, index) => {
                                    // Aggregate player stats from all rounds for this match
                                    const playerRoundStats =
                                      series.playerStats?.filter(
                                        (stat) =>
                                          stat.matchId === matchId &&
                                          stat.playerId === player.playerId
                                      ) || [];

                                    const aggregatedStats =
                                      playerRoundStats.reduce(
                                        (acc, stat) => ({
                                          kills: acc.kills + (stat.kills || 0),
                                          deaths:
                                            acc.deaths + (stat.deaths || 0),
                                          assists:
                                            acc.assists + (stat.assists || 0),
                                          acs: acc.acs + (stat.acs || 0),
                                          damage:
                                            acc.damage + (stat.damage || 0),
                                        }),
                                        {
                                          kills: 0,
                                          deaths: 0,
                                          assists: 0,
                                          acs: 0,
                                          damage: 0,
                                        }
                                      );

                                    // Calculate rating (simplified ACS-based rating)
                                    const avgAcs =
                                      playerRoundStats.length > 0
                                        ? aggregatedStats.acs /
                                          playerRoundStats.length
                                        : 0;
                                    const rating = (avgAcs / 100).toFixed(2);
                                    const agentName = getAgentDisplayName(
                                      player.agentId
                                    );

                                    return (
                                      <View
                                        key={player.playerId}
                                        style={styles.rightPlayerItem}
                                      >
                                        <View style={styles.playerInfoRight}>
                                          <Text
                                            style={[
                                              styles.playerName,
                                              { color: theme.text },
                                            ]}
                                          >
                                            {player.player?.ign || "Unknown"}
                                          </Text>
                                          <Text
                                            style={[
                                              styles.playerStats,
                                              { color: theme.textSecondary },
                                            ]}
                                          >
                                            {rating} | {aggregatedStats.kills}/
                                            {aggregatedStats.deaths}/
                                            {aggregatedStats.assists}
                                          </Text>
                                        </View>
                                        <Image
                                          source={{
                                            uri: getAgentImageUrl(agentName),
                                          }}
                                          style={styles.agentImage}
                                          resizeMode="cover"
                                        />
                                      </View>
                                    );
                                  })}
                              </View>
                            </View>
                          </View>
                        </View>

                        {/* No Players Available */}
                        {team1Players.length === 0 &&
                          team2Players.length === 0 && (
                            <View style={styles.noRoundsContainer}>
                              <Text
                                style={[
                                  styles.noDataText,
                                  { color: theme.textSecondary },
                                ]}
                              >
                                Player stats not available for this match
                              </Text>
                            </View>
                          )}

                        {/* Add bottom padding for scrolling */}
                        <View style={{ height: 20 }} />
                      </ScrollView>
                    </View>
                  );
                })()
              ) : (
                <View style={styles.noDataContainer}>
                  <TouchableOpacity
                    style={styles.roundsCloseButton}
                    onPress={() => setShowPlayersModal(false)}
                  >
                    <Ionicons name="close" size={24} color={theme.text} />
                  </TouchableOpacity>
                  <Text
                    style={[styles.noDataText, { color: theme.textSecondary }]}
                  >
                    No match selected
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Modal>

        {/* VOD Modal */}
        <Modal
          visible={showVODModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowVODModal(false)}
        >
          <View style={styles.vodModalContainer}>
            <View style={styles.vodModalContent}>
              <View
                style={[
                  styles.vodModalHeader,
                  { backgroundColor: theme.surface },
                ]}
              >
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  VOD Player
                </Text>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setShowVODModal(false)}
                >
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
              </View>

              {selectedVODUrl && (
                <WebView
                  source={{ uri: selectedVODUrl }}
                  style={styles.vodWebView}
                  allowsFullscreenVideo={true}
                  mediaPlaybackRequiresUserAction={false}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  startInLoadingState={true}
                  renderLoading={() => (
                    <View style={styles.vodLoadingContainer}>
                      <ActivityIndicator size="large" color={colors.primary} />
                      <Text
                        style={[styles.vodLoadingText, { color: theme.text }]}
                      >
                        Loading VOD...
                      </Text>
                    </View>
                  )}
                />
              )}
            </View>
          </View>
        </Modal>

        {/* Copy Modal - centered share card like MLB play card */}
        <Modal
          visible={showCopyModal}
          animationType="fade"
          transparent
          onRequestClose={() => setShowCopyModal(false)}
        >
          <View
            style={[
              styles.modalOverlay,
              { backgroundColor: "rgba(0,0,0,0.85)" },
            ]}
          >
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
              }}
            >
              <View
                ref={copyCardRef}
                collapsable={false}
                style={[
                  styles.valShareCard,
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
                    {/* Reuse the same inner content as before (header/maps/players) */}
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
                                  opacity: series._team1Opacity ?? 1,
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
                                  opacity: series._team1Opacity ?? 1,
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
                                opacity: series._team1Opacity ?? 1,
                                transform: [{ translateX: -30 }],
                              },
                            ]}
                          >
                            {series.team1?.shortName || "TBD"}
                          </Text>
                        </View>

                        <View
                          style={{
                            width: 48,
                            alignItems: "center",
                            justifyContent: "center",
                            transform: [{ translateY: -10 }],
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
                                  opacity: series._team2Opacity ?? 1,
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
                                  opacity: series._team2Opacity ?? 1,
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
                                opacity: series._team2Opacity ?? 1,
                                transform: [{ translateX: 30 }],
                              },
                            ]}
                          >
                            {series.team2?.shortName || "TBD"}
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
                            { month: "short", day: "numeric", year: "numeric" }
                          )}
                          {" • "}
                          {new Date(series.startDate).toLocaleTimeString(
                            "en-US",
                            { hour: "numeric", minute: "numeric", hour12: true }
                          )}
                        </Text>
                      )}
                    </View>

                    {/* Maps */}
                    {((copySeriesData && copySeriesData.matches) ||
                      series.matches) &&
                      (
                        (copySeriesData && copySeriesData.matches) ||
                        series.matches
                      ).length > 0 && (
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
                            {(
                              (copySeriesData && copySeriesData.matches) ||
                              series.matches
                            ).map((match, index) => {
                              // skip null/empty maps
                              if (!match) return null;
                              const mapId =
                                match.mapId ||
                                (match.map && (match.map.id || match.map)) ||
                                null;
                              if (!mapId) return null;

                              const mapName = getMapDisplayName(
                                getMapNameById(mapId)
                              );

                              // derive per-match scores robustly from multiple possible payload shapes
                              let team1Score = null;
                              let team2Score = null;

                              if (
                                typeof match.team1Score === "number" ||
                                typeof match.team2Score === "number"
                              ) {
                                team1Score = match.team1Score || 0;
                                team2Score = match.team2Score || 0;
                              } else if (
                                match.teams &&
                                Array.isArray(match.teams) &&
                                match.teams.length > 0
                              ) {
                                const t1 =
                                  match.teams.find(
                                    (t) =>
                                      t.teamId === series.team1?.id ||
                                      t.id === series.team1?.id
                                  ) || match.teams[0];
                                const t2 =
                                  match.teams.find(
                                    (t) =>
                                      t.teamId === series.team2?.id ||
                                      t.id === series.team2?.id
                                  ) ||
                                  match.teams[1] ||
                                  match.teams[0];
                                team1Score =
                                  (t1 &&
                                    (t1.roundsWon ||
                                      t1.score ||
                                      t1.rounds ||
                                      0)) ||
                                  0;
                                team2Score =
                                  (t2 &&
                                    (t2.roundsWon ||
                                      t2.score ||
                                      t2.rounds ||
                                      0)) ||
                                  0;
                              } else if (
                                match.stats &&
                                Array.isArray(match.stats)
                              ) {
                                // rare fallback: check aggregated stats for team scores
                                team1Score = match.team1Score || 0;
                                team2Score = match.team2Score || 0;
                              } else {
                                team1Score = 0;
                                team2Score = 0;
                              }

                              const winnerTeam =
                                team1Score > team2Score
                                  ? series.team1
                                  : team2Score > team1Score
                                  ? series.team2
                                  : null;

                              return (
                                <View
                                  key={index}
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
                                    M{index + 1}: {mapName} ({team1Score}-
                                    {team2Score})
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
                                        {
                                          width: 18,
                                          height: 18,
                                          marginLeft: 8,
                                        },
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

                    {/* Player Stats - same rendering as before */}
                    {(() => {
                      const { team1Players, team2Players } =
                        getAggregatedPlayerStats(copySeriesData);
                      if (
                        team1Players.length === 0 &&
                        team2Players.length === 0
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
                                source={{
                                  uri:
                                    series.team1?.logoUrl ||
                                    "https://i.imgur.com/BIC4pnO.webp",
                                }}
                                style={{
                                  width: 18,
                                  height: 18,
                                  marginRight: 12,
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
                                {series.team1?.name || "Team 1"}
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
                                  <View
                                    style={[
                                      styles.copyAgentsContainer,
                                      {
                                        flexDirection: "row",
                                        alignItems: "center",
                                      },
                                    ]}
                                  >
                                    {player.agents
                                      .slice(0, 3)
                                      .map((agentId) => (
                                        <Image
                                          key={agentId}
                                          source={{
                                            uri: getAgentImageUrl(agentId),
                                          }}
                                          style={[
                                            styles.copyAgentIcon,
                                            {
                                              width: 16,
                                              height: 16,
                                              marginRight: 2,
                                            },
                                          ]}
                                          resizeMode="cover"
                                        />
                                      ))}
                                    {player.agents.length > 3 && (
                                      <Text
                                        style={[
                                          styles.copyMoreAgents,
                                          {
                                            color: theme.textSecondary,
                                            fontSize: 10,
                                            marginLeft: 2,
                                          },
                                        ]}
                                      >
                                        +{player.agents.length - 3}
                                      </Text>
                                    )}
                                  </View>
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
                                          color: player.kills - player.deaths >= 0 ? "green" : "red",
                                          fontSize: 12,
                                          fontWeight: "bold",
                                        },
                                      ]}
                                    >
                                      {player.kills - player.deaths > 0 ? "+" : null}{player.kills - player.deaths}
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
                                      {Math.round(
                                        player.score / player.roundsPlayed
                                      )}
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
                                      ACS
                                    </Text>
                                  </View>
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
                                source={{
                                  uri:
                                    series.team2?.logoUrl ||
                                    "https://i.imgur.com/BIC4pnO.webp",
                                }}
                                style={{
                                  width: 18,
                                  height: 18,
                                  marginRight: 12,
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
                                {series.team2?.name || "Team 2"}
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
                                  <View
                                    style={[
                                      styles.copyAgentsContainer,
                                      {
                                        flexDirection: "row",
                                        alignItems: "center",
                                      },
                                    ]}
                                  >
                                    {player.agents
                                      .slice(0, 3)
                                      .map((agentId) => (
                                        <Image
                                          key={agentId}
                                          source={{
                                            uri: getAgentImageUrl(agentId),
                                          }}
                                          style={[
                                            styles.copyAgentIcon,
                                            {
                                              width: 16,
                                              height: 16,
                                              marginRight: 2,
                                            },
                                          ]}
                                          resizeMode="cover"
                                        />
                                      ))}
                                    {player.agents.length > 3 && (
                                      <Text
                                        style={[
                                          styles.copyMoreAgents,
                                          {
                                            color: theme.textSecondary,
                                            fontSize: 10,
                                            marginLeft: 2,
                                          },
                                        ]}
                                      >
                                        +{player.agents.length - 3}
                                      </Text>
                                    )}
                                  </View>
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
                                          color: player.kills - player.deaths >= 0 ? "green" : "red",
                                          fontSize: 12,
                                          fontWeight: "bold",
                                        },
                                      ]}
                                    >
                                      {player.kills - player.deaths > 0 ? "+" : null}{player.kills - player.deaths}
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
                                      {Math.round(
                                        player.score / player.roundsPlayed
                                      )}
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
                                      ACS
                                    </Text>
                                  </View>
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
                        <Ionicons
                          name="heart"
                          size={18}
                          color={colors.primary}
                        />
                      </Text>
                    </View>
                  </View>
                </Container>
              </View>

              {/* Action Buttons */}
              <View style={styles.valShareCardActions}>
                <View style={styles.valShareCardTopButtons}>
                  <TouchableOpacity
                    style={[
                      styles.valShareCardButton,
                      { backgroundColor: colors.secondary },
                    ]}
                    onPress={async () => shareCopyCard()}
                  >
                    <Ionicons name="share-outline" size={24} color="#fff" />
                    <Text
                      style={[styles.valShareCardButtonText, { color: "#fff" }]}
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
                      Cancel
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    ))
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  refreshButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
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
  scoreSeparator: {
    fontSize: 24,
    marginHorizontal: 16,
    alignSelf: "flex-start",
    marginTop: 16,
  },
  teamName: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  statusDateContainer: {
    alignItems: "center",
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
  gameCard: {
    width: 340,
    minHeight: 400,
    borderRadius: 12,
    marginRight: 12,
    overflow: "hidden",
    flexDirection: "column",
  },
  // SECTION 1: Header
  headerSection: {
    height: 50,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  // SECTION 2: Map & Score
  mapScoreSection: {
    height: 100,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  mapBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  mapOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  scoreContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 20,
    zIndex: 1,
  },
  mapNameContainer: {
    flex: 1,
    alignItems: "center",
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
    fontSize: 10,
    fontWeight: "bold",
  },
  teamScoreContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  teamLogo: {
    width: 32,
    height: 32,
    marginHorizontal: 12,
  },
  gameScoreText: {
    fontSize: 26,
    fontWeight: "bold",
    color: "white",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  mapName: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    color: "white",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  gameActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 8,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    flex: 1,
    marginHorizontal: 4,
    alignItems: "center",
  },
  actionButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  // SECTION 3: Players
  playersSection: {
    flex: 1,
    padding: 12,
    paddingBottom: 0,
    minHeight: 200,
  },
  teamsContainer: {
    flexDirection: "row",
    flex: 1,
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
    marginBottom: 12,
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
    marginBottom: 12,
  },
  rightPlayerItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  playerInfo: {
    marginLeft: 12,
  },
  playerInfoRight: {
    marginRight: 12,
  },
  agentImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  playerName: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 2,
  },
  agentName: {
    fontSize: 12,
    fontWeight: "500",
  },
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
  comingSoonContainer: {
    alignItems: "center",
    paddingVertical: 48,
  },
  comingSoonText: {
    fontSize: 16,
    textAlign: "center",
    marginTop: 16,
  },
  vodsSection: {
    marginBottom: 24,
  },
  vodsContainer: {
    gap: 12,
  },
  vodButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  youtubeIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  vodButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  vodModalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  vodModalContent: {
    width: "95%",
    height: "80%",
    borderRadius: 12,
    overflow: "hidden",
  },
  vodModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  vodWebView: {
    flex: 1,
  },
  vodLoadingContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  vodLoadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  modalContainer: {
    flex: 1,
  },
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
    height: screenHeight * 0.65,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  modalCloseButton: {
    padding: 8,
  },
  modalScrollContent: {
    flex: 1,
    padding: 16,
  },

  /* Centered share card styles (MLB-like) */
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
  modalSubtitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
  },
  modalScore: {
    fontSize: 14,
    marginBottom: 16,
  },
  roundsContainer: {
    flex: 1,
  },
  roundsList: {
    marginTop: 16,
  },
  roundItem: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  roundHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  roundNumber: {
    fontSize: 14,
    fontWeight: "bold",
  },
  roundWinner: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  roundWinnerText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  roundWinType: {
    fontSize: 12,
  },
  playersContainer: {
    flex: 1,
  },
  playersList: {
    marginTop: 16,
  },
  teamSection: {
    marginBottom: 24,
  },
  teamName: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
  },
  playerItem: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  playerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  playerName: {
    fontSize: 14,
    fontWeight: "bold",
  },
  playerAgent: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  playerStats: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statText: {
    fontSize: 12,
  },
  noDataText: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 32,
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
    marginBottom: 8,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  roundsAttackDefenseStats: {
    flexDirection: "row",
    gap: 12,
  },
  roundsStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  roundsStatText: {
    color: "white",
    fontSize: 11,
    fontWeight: "bold",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  roundsMapScoreSection: {
    alignItems: "center",
    flex: 1,
    paddingHorizontal: 16,
  },
  roundsMapName: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  roundsFinalScore: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  roundsScrollableContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  roundsHalfSection: {
    marginTop: 20,
    marginBottom: 16,
  },
  roundsHalfTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  liquipediaRoundsContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    minHeight: 80,
  },
  fixedTeamLogosStack: {
    width: 32,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  roundNumberSpace: {
    height: 24,
    marginBottom: 6,
  },
  teamLogoAligned: {
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 3,
  },
  roundsRowTeamLogo: {
    width: 28,
    height: 28,
  },
  roundsHorizontalScroll: {
    flex: 1,
    marginHorizontal: 8,
  },
  roundsHorizontalContent: {
    paddingHorizontal: 4,
    minWidth: screenWidth - 100,
  },
  liquipediaRoundColumn: {
    alignItems: "center",
    marginHorizontal: 3,
    minWidth: 32,
  },
  roundCardNumber: {
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 6,
  },
  liquipediaRoundIndicator: {
    width: 28,
    height: 20,
    borderRadius: 5,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 3,
  },
  noRoundsContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  noDataContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  // Players Modal Styles
  playersModalContainer: {
    flex: 1,
  },
  playersScrollableContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  playersMainSection: {
    flex: 1,
    paddingTop: 20,
  },
  playerStats: {
    fontSize: 12,
    fontWeight: "500",
  },
  // Stats Tab Styles
  statsSection: {
    marginBottom: 32,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 16,
    marginTop: 8,
  },
  recordCard: {
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: "center",
  },
  recordStats: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  teamRecord: {
    alignItems: "center",
    minWidth: 80,
  },
  teamRecordName: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
  },
  teamRecordScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  recordTeamLogo: {
    width: 40,
    height: 40,
  },
  teamRecordScore: {
    fontSize: 32,
    fontWeight: "bold",
  },
  recordSeparator: {
    marginTop: 25,
    fontSize: 24,
    marginHorizontal: 20,
  },
  recordSubtext: {
    fontSize: 14,
    textAlign: "center",
  },
  recentMatches: {
    marginTop: 16,
  },
  matchHistoryItem: {
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
  },
  matchHistoryContent: {
    alignItems: "center",
  },
  matchHistoryTeams: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 8,
  },
  matchHistoryEvent: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  matchHistoryTeamLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  matchHistoryTeamRight: {
    flexDirection: "row-reverse",
    alignItems: "center",
    flex: 1,
  },
  matchHistoryLogo: {
    width: 35,
    height: 35,
    marginRight: 8,
  },
  matchHistoryLogoRight: {
    width: 35,
    height: 35,
    marginLeft: 8,
  },
  matchHistoryTeamName: {
    fontSize: 14,
    fontWeight: "600",
  },
  matchHistoryScore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  matchHistoryScoreText: {
    fontSize: 18,
    fontWeight: "bold",
  },
  matchHistoryScoreSep: {
    fontSize: 16,
    marginHorizontal: 8,
  },
  matchHistoryDate: {
    fontSize: 12,
    textAlign: "center",
  },
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
  streamContainer: {
    aspectRatio: 16 / 12,
    width: "100%",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 12,
  },
  streamPlayer: {
    flex: 1,
  },
});

export default VALSeriesScreen;

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useTheme } from "../../context/ThemeContext";
import { useSport } from "./BetTabNavigator";
import { useBetSlip } from "../../context/BetSlipContext";
import BetSlip from "../../components/BetSlip";
import { BannerAdWrapper, DEV_BANNER_ID } from "../../services/ads";
import { useBetData } from "../../context/BetDataContext";

const BetTopScreen = ({ navigation }) => {
  const { colors, theme } = useTheme();
  const { sport } = useSport();
  const { getRosters, fetchRosters } = useBetData();
  const [searchQuery, setSearchQuery] = useState("");

  const { isPro } = useBetSlip();

  const currentRostersData = getRosters(sport);

  useEffect(() => {
    // Only fetch rosters for this sport if we don't already have them
    try {
      const existing = getRosters(sport);
      if (!existing || !existing.teams || existing.teams.length === 0) {
        if (fetchRosters) fetchRosters(sport).catch(() => {});
      }
    } catch (e) {
      // defensive: if getRosters throws, attempt fetch
      if (fetchRosters) fetchRosters(sport).catch(() => {});
    }
  }, [sport, fetchRosters, getRosters]);

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

  const isLightColor = (hexColor) => {
    if (!hexColor) return false;
    const color = hexColor.replace("#", "");
    const r = parseInt(color.substr(0, 2), 16);
    const g = parseInt(color.substr(2, 2), 16);
    const b = parseInt(color.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 180;
  };

  const getInitials = (name) => {
    if (!name) return "?";
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    const first = parts[0].charAt(0).toUpperCase();
    const last = parts[parts.length - 1].charAt(0).toUpperCase();
    return `${first}${last}`;
  };

  const HeadshotOrInitials = ({ uri, name, containerStyle, imageStyle, initialsStyle, onError }) => {
    const [failed, setFailed] = useState(false);
    const bg = (containerStyle && containerStyle.backgroundColor) || "#999";
    const textColor = isLightColor(bg) ? "#000" : "#FFF";

    return (
      <View style={containerStyle}>
        {!failed && uri ? (
          <Image
            source={{ uri }}
            style={imageStyle}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={(e) => {
              setFailed(true);
              if (onError) onError(e);
            }}
          />
        ) : (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text style={[{ color: textColor, fontWeight: "700" }, initialsStyle]}>
              {getInitials(name)}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const searchResults = React.useMemo(() => {
    if (!searchQuery || searchQuery.length < 3) return [];

    const query = searchQuery.toLowerCase();
    const results = [];

    if (currentRostersData?.teams) {
      currentRostersData.teams.forEach((team) => {
        const athletes = team.athletes || [];
        athletes.forEach((athlete) => {
          if (athlete.name && athlete.name.toLowerCase().includes(query)) {
            results.push({
              ...athlete,
              teamId: team.id,
              teamAbbr: team.abbreviation,
              teamName: team.displayName,
              teamColor: team.color ? `#${team.color}` : "#666666",
            });
          }
        });
      });
    }

    return results;
  }, [searchQuery, currentRostersData]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.searchContainer,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <Ionicons
          name="search"
          size={20}
          color={theme.textTertiary}
          style={styles.searchIcon}
        />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search players (min 3 letters)..."
          placeholderTextColor={theme.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchQuery("")}
            style={styles.clearButton}
          >
            <Ionicons
              name="close-circle"
              size={20}
              color={theme.textTertiary}
            />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {searchQuery.length < 3 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="search"
              size={64}
              color={theme.textTertiary}
              style={{ opacity: 0.5 }}
            />
            <Text
              style={[styles.emptyStateText, { color: theme.textSecondary }]}
            >
              Enter at least 3 letters to search
            </Text>
            <Text
              style={[styles.emptyStateSubtext, { color: theme.textTertiary }]}
            >
              Search for {sport} players by name
            </Text>
          </View>
        ) : searchResults.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="sad-outline"
              size={64}
              color={theme.textTertiary}
              style={{ opacity: 0.5 }}
            />
            <Text
              style={[styles.emptyStateText, { color: theme.textSecondary }]}
            >
              No players found
            </Text>
            <Text
              style={[styles.emptyStateSubtext, { color: theme.textTertiary }]}
            >
              Try a different search term
            </Text>
          </View>
        ) : (
          <View style={styles.resultsContainer}>
            <Text style={[styles.resultsCount, { color: theme.textSecondary }]}>
              {searchResults.length} player
              {searchResults.length !== 1 ? "s" : ""} found
            </Text>
            {searchResults.map((player) => {
              const headshotUrl = `https://a.espncdn.com/combiner/i?img=/i/headshots/${getSportPath(
                sport
              )}/players/full/${player.id}.png&w=200`;
              const teamColorWithAlpha = `${player.teamColor}88`;
              const isLight = isLightColor(player.teamColor);

              return (
                <TouchableOpacity
                  key={player.id}
                  style={[
                    styles.playerCard,
                    {
                      backgroundColor: theme.surfaceSecondary,
                      borderColor: player.teamColor,
                    },
                  ]}
                  onPress={() =>
                    navigation.navigate("BetAthlete", {
                      athleteId: player.id,
                      sport: sport,
                    })
                  }
                >
                      <View
                        style={[
                          styles.headshotContainer,
                          { backgroundColor: teamColorWithAlpha },
                        ]}
                      >
                        <HeadshotOrInitials
                          uri={headshotUrl}
                          name={player.name}
                          containerStyle={{ width: "100%", height: "100%", borderRadius: 40, overflow: "hidden" }}
                          imageStyle={styles.headshot}
                          initialsStyle={{ fontSize: 35 }}
                        />
                        {player.jersey && (
                          <View
                            style={[
                              styles.jerseyBadge,
                              { backgroundColor: player.teamColor },
                            ]}
                          >
                            <Text
                              style={[
                                styles.jerseyText,
                                { color: isLight ? "#000" : "#FFF" },
                              ]}
                            >
                              {player.jersey}
                            </Text>
                          </View>
                        )}
                      </View>

                  <View style={styles.playerInfo}>
                    <Text
                      style={[styles.playerName, { color: theme.text }]}
                      numberOfLines={1}
                    >
                      {player.name}
                    </Text>
                    <Text
                      style={[
                        styles.playerTeam,
                        { color: theme.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {player.teamName}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {!isPro && <BannerAdWrapper />}
      <BetSlip/>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 8,
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
  scrollView: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 100,
    paddingHorizontal: 40,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
    textAlign: "center",
  },
  emptyStateSubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  resultsContainer: {
    padding: 16,
  },
  resultsCount: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  playerCard: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 12,
    padding: 12,
    alignItems: "center",
  },
  headshotContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    position: "relative",
    marginRight: 16,
  },
  headshot: {
    width: "100%",
    height: "100%",
    borderRadius: 40,
  },
  jerseyBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  jerseyText: {
    fontSize: 12,
    fontWeight: "700",
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  playerTeam: {
    fontSize: 14,
    fontWeight: "500",
  },
});

export default BetTopScreen;

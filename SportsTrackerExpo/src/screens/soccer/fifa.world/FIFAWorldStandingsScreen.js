import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";
import { useFavorites } from "../../../context/FavoritesContext";
import { FIFAWorldServiceEnhanced } from "../../../services/soccer/FIFAWorldServiceEnhanced";
import { FIFACompetitionState } from "../../../services/soccer/FIFACompetitionState";

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
  }
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
  )
);

// Helper to normalize API team info for FIFA standings
const normalizeTeam = (entry) => {
  const team = entry.team || {};
  const stats = entry.stats || {};

  // Parse stats that come as arrays with key-value pairs
  const statObj = {};
  if (Array.isArray(stats)) {
    stats.forEach((stat) => {
      if (stat.name && stat.displayValue !== undefined) {
        statObj[stat.name] = stat.displayValue;
      }
    });
  } else {
    // If stats is already an object, use it directly
    Object.assign(statObj, stats);
  }

  // Calculate soccer-specific stats
  const wins = parseInt(statObj.wins || statObj.W || "0");
  const draws = parseInt(statObj.draws || statObj.ties || statObj.D || "0");
  const losses = parseInt(statObj.losses || statObj.L || "0");
  const gamesPlayed = wins + draws + losses;
  const points = parseInt(statObj.points || statObj.Pts || statObj.P || "0");
  const goalsFor = parseInt(
    statObj.pointsFor || statObj.GF || statObj.F || "0"
  );
  const goalsAgainst = parseInt(
    statObj.pointsAgainst || statObj.GA || statObj.A || "0"
  );
  const goalDifference = goalsFor - goalsAgainst;

  // Calculate win percentage for soccer (points earned / total possible points)
  // In soccer: 3 points for win, 1 point for draw, 0 for loss
  const maxPossiblePoints = gamesPlayed * 3;
  const winPercentage =
    maxPossiblePoints > 0 ? (points / maxPossiblePoints).toFixed(3) : "0.000";

  return {
    id: team.id?.toString() || undefined,
    abbreviation:
      team.abbreviation || team.displayName?.substring(0, 3).toUpperCase(),
    displayName: team.displayName,
    logo: team.logo,
    position: statObj.rank || statObj.position || entry.position || team.rank,
    wins: wins.toString(),
    draws: draws.toString(),
    losses: losses.toString(),
    gamesPlayed: gamesPlayed.toString(),
    points: points.toString(),
    winPercentage: winPercentage,
    goalsFor: goalsFor.toString(),
    goalsAgainst: goalsAgainst.toString(),
    goalDifference:
      goalDifference > 0 ? `+${goalDifference}` : goalDifference.toString(),
    form: statObj.form || "",
    // Add note information for border colors and legend
    note: entry.note || null,
  };
};

const TeamLogo = ({ teamId, teamAbbreviation, size, style, iconStyle }) => {
  const { colors, isDarkMode } = useTheme();
  const [imageError, setImageError] = useState(false);

  // Use team ID for logo if available, otherwise fallback to abbreviation
  const logoId = teamId || teamAbbreviation;
  const logoUrl = logoId
    ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/${
        isDarkMode ? "500-dark" : "500"
      }/${logoId}.png&w=200&h=200`
    : null;

  if (!logoUrl || imageError) {
    return (
      <Ionicons
        name="football"
        size={size}
        color={colors.primary}
        style={iconStyle}
      />
    );
  }

  return (
    <Image
      source={{ uri: logoUrl }}
      style={style}
      onError={() => setImageError(true)}
    />
  );
};

const FIFAWorldStandingsScreen = ({ route }) => {
  const { theme, colors, isDarkMode } = useTheme();
  const { isFavorite } = useFavorites();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [standings, setStandings] = useState(null);
  const [selectedCompetition, setSelectedCompetition] = useState("fifa.world");

  // Get competition from route params if available
  const { leagueId, leagueName } = route?.params || {};

  // Initialize with correct competition on mount
  useEffect(() => {
    // Only use route leagueId if it's NOT the base fifa.world (which comes from navigation)
    // The base fifa.world is always passed by the navigation system, but we want to preserve
    // the user's actual competition selection (like uefa qualifiers)
    if (leagueId && leagueId !== "fifa.world") {
      console.log(
        "FIFAWorldStandingsScreen: Using specific route param leagueId:",
        leagueId
      );
      setSelectedCompetition(leagueId);
      FIFACompetitionState.setCurrentCompetition(leagueId);
    } else {
      // No specific route params or base fifa.world, use current shared state
      const currentCompetition = FIFACompetitionState.getCurrentCompetition();
      console.log(
        "FIFAWorldStandingsScreen: Using shared state (ignoring base route):",
        currentCompetition
      );
      setSelectedCompetition(currentCompetition);
    }
  }, [leagueId]);

  // Subscribe to competition changes from other screens
  useEffect(() => {
    const unsubscribe = FIFACompetitionState.subscribe((newCompetition) => {
      console.log(
        "FIFAWorldStandingsScreen: Received competition change:",
        newCompetition
      );
      setSelectedCompetition(newCompetition);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async (silent = false) => {
      try {
        if (!silent && mounted) {
          setLoading(true);
        }

        console.log("Loading FIFA standings for:", selectedCompetition);
        const data = await FIFAWorldServiceEnhanced.getStandings(
          selectedCompetition
        );
        if (!mounted) return;

        console.log("FIFA standings data received:", data);
        setStandings(data);
      } catch (e) {
        console.error("Failed to load FIFA standings:", e);
        if (mounted) {
          setStandings(null);
        }
      } finally {
        if (mounted && !silent) {
          setLoading(false);
        }
      }
    };

    // Initial load
    load();

    return () => {
      mounted = false;
    };
  }, [selectedCompetition]);

  const handleCompetitionChange = React.useCallback(
    (competitionId) => {
      if (competitionId === selectedCompetition) return;
      console.log(
        "FIFAWorldStandingsScreen: Changing competition to:",
        competitionId
      );

      // Update both local state and shared state
      setSelectedCompetition(competitionId);
      FIFACompetitionState.setCurrentCompetition(competitionId);
    },
    [selectedCompetition]
  );

  // Helper to collect unique legend items from standings data
  const collectLegendItems = React.useCallback(() => {
    if (!standings?.standings) return [];

    const legendMap = new Map();

    // Process groups format
    if (standings.standings.groups) {
      standings.standings.groups.forEach((group) => {
        if (group.standings?.entries) {
          group.standings.entries.forEach((entry) => {
            if (entry.note && entry.note.description && entry.note.color) {
              const key = entry.note.description;
              if (!legendMap.has(key)) {
                legendMap.set(key, {
                  description: entry.note.description,
                  color: entry.note.color,
                  rank: entry.note.rank || 999,
                });
              }
            }
          });
        }
      });
    }

    // Process single group format
    if (standings.standings.entries) {
      standings.standings.entries.forEach((entry) => {
        if (entry.note && entry.note.description && entry.note.color) {
          const key = entry.note.description;
          if (!legendMap.has(key)) {
            legendMap.set(key, {
              description: entry.note.description,
              color: entry.note.color,
              rank: entry.note.rank || 999,
            });
          }
        }
      });
    }

    // Sort by rank
    return Array.from(legendMap.values()).sort((a, b) => a.rank - b.rank);
  }, [standings]);

  // Helper to render the legend
  const renderLegend = React.useCallback(() => {
    const legendItems = collectLegendItems();

    if (legendItems.length === 0) return null;

    return (
      <View
        style={[styles.legendContainer, { backgroundColor: theme.surface }]}
      >
        <Text
          allowFontScaling={false}
          style={[styles.legendTitle, { color: theme.text }]}
        >
          Qualification Status
        </Text>
        <View style={styles.legendGrid}>
          {legendItems.map((item, index) => (
            <View key={index} style={styles.legendItem}>
              <View
                style={[
                  styles.legendIndicator,
                  { backgroundColor: item.color },
                ]}
              />
              <Text
                allowFontScaling={false}
                style={[styles.legendText, { color: theme.textSecondary }]}
              >
                {item.description}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }, [collectLegendItems, theme, colors]);

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

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {renderCompetitionSelector()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!standings) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {renderCompetitionSelector()}
        <Text style={{ color: theme.text, textAlign: "center", marginTop: 50 }}>
          No standings available for{" "}
          {FIFA_COMPETITIONS.find((c) => c.id === selectedCompetition)?.name ||
            "FIFA World Cup"}
        </Text>
      </View>
    );
  }

  // Team navigation function
  const navigateToTeam = (team) => {
    navigation.navigate("FIFAWorldTeamPage", {
      teamId: team.id || team.abbreviation,
      sport: "FIFA",
      competition: selectedCompetition,
    });
  };

  // Helper to get FIFA team ID for favorites
  const getFIFATeamId = (team) => {
    return team?.id || team?.abbreviation || null;
  };

  // Helper to render a single team row
  const renderTeamRow = (entry, index) => {
    const team = normalizeTeam(entry);
    const teamId = getFIFATeamId(team);
    const isFav = teamId && isFavorite(teamId, "fifa world cup");

    // Get border color from note if available
    const getBorderColor = () => {
      if (team.note && team.note.color) {
        return team.note.color;
      }
      return "transparent";
    };

    return (
      <TouchableOpacity
        key={`${team.id || team.abbreviation}-${index}`}
        style={[
          styles.teamRow,
          {
            backgroundColor: theme.surface,
            borderLeftWidth: team.note ? 4 : 0,
            borderLeftColor: getBorderColor(),
          },
        ]}
        onPress={() => navigateToTeam(team)}
        activeOpacity={0.7}
      >
        <View style={styles.teamRank}>
          <Text
            allowFontScaling={false}
            style={[styles.rankText, { color: theme.textSecondary }]}
          >
            {team.position || index + 1}
          </Text>
        </View>

        <TeamLogo
          teamId={team.id}
          teamAbbreviation={team.abbreviation}
          size={28}
          style={styles.teamLogo}
          iconStyle={{ marginHorizontal: 8 }}
        />

        <View style={styles.teamInfo}>
          <View style={styles.teamNameContainer}>
            {isFav && (
              <Ionicons
                name="star"
                size={16}
                color={colors.primary}
                style={styles.favoriteIcon}
              />
            )}
            <Text
              allowFontScaling={false}
              style={[
                styles.teamName,
                { color: isFav ? colors.primary : theme.text },
              ]}
              numberOfLines={1}
            >
              {team.displayName}
            </Text>
          </View>
          <View style={styles.recordContainer}>
            <Text
              allowFontScaling={false}
              style={[styles.teamRecord, { color: theme.textSecondary }]}
            >
              {team.wins}-{team.draws}-{team.losses} ({team.winPercentage}) |
              GP: {team.gamesPlayed}
            </Text>
          </View>
          <View style={styles.goalsContainer}>
            <Text
              allowFontScaling={false}
              style={[styles.goalsText, { color: theme.textSecondary }]}
            >
              F: {team.goalsFor} | A: {team.goalsAgainst} | GD:
            </Text>
            <Text
              allowFontScaling={false}
              style={[
                styles.diffText,
                {
                  color:
                    team.goalDifference.charAt(0) === "+"
                      ? theme.success
                      : team.goalDifference.charAt(0) === "-"
                      ? theme.error
                      : theme.textSecondary,
                },
              ]}
            >
              &nbsp;{team.goalDifference}
            </Text>
          </View>
        </View>

        <View style={styles.teamStats}>
          <Text
            allowFontScaling={false}
            style={[styles.statText, { color: theme.textSecondary }]}
          >
            Points: {team.points}
          </Text>
          {team.form && (
            <Text
              allowFontScaling={false}
              style={[styles.formText, { color: theme.textSecondary }]}
            >
              {team.form}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Helper to render a group section
  const renderGroup = (group, groupIndex) => {
    if (
      !group ||
      !group.standings ||
      !group.standings.entries ||
      group.standings.entries.length === 0
    ) {
      return null;
    }

    const groupName =
      group.name ||
      group.header ||
      `Group ${String.fromCharCode(65 + groupIndex)}`; // A, B, C, etc.
    const teams = group.standings.entries;

    return (
      <View key={groupIndex} style={styles.groupContainer}>
        <View style={[styles.groupHeader, { backgroundColor: colors.primary }]}>
          <Text allowFontScaling={false} style={styles.groupTitle}>
            {groupName}
          </Text>
        </View>
        {teams.map((teamEntry, teamIndex) =>
          renderTeamRow(teamEntry, teamIndex)
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderCompetitionSelector()}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {standings?.standings?.groups ? (
          // Multiple groups (World Cup format)
          standings.standings.groups.map((group, groupIndex) =>
            renderGroup(group, groupIndex)
          )
        ) : standings?.standings?.entries ? (
          // Single group format (fallback)
          <View style={styles.groupContainer}>
            <View
              style={[styles.groupHeader, { backgroundColor: colors.primary }]}
            >
              <Text allowFontScaling={false} style={styles.groupTitle}>
                {FIFA_COMPETITIONS.find((c) => c.id === selectedCompetition)
                  ?.name || "FIFA World Cup"}
              </Text>
            </View>
            {standings.standings.entries.map((teamEntry, teamIndex) =>
              renderTeamRow(teamEntry, teamIndex)
            )}
          </View>
        ) : (
          <View style={styles.container}>
            <Text
              style={{ color: theme.text, textAlign: "center", marginTop: 50 }}
            >
              No valid standings data found
            </Text>
          </View>
        )}
        {renderLegend()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  competitionContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    padding: 16,
  },
  groupContainer: {
    marginBottom: 24,
  },
  groupHeader: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 2,
    borderRadius: 8,
  },
  teamRank: {
    width: 30,
    marginRight: 12,
  },
  rankText: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  teamLogo: {
    width: 32,
    height: 32,
    marginRight: 12,
  },
  teamInfo: {
    flex: 1,
  },
  teamNameContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  teamName: {
    fontSize: 16,
    fontWeight: "600",
  },
  favoriteIcon: {
    marginRight: 6,
  },
  recordContainer: {
    marginTop: 2,
  },
  teamRecord: {
    fontSize: 12,
  },
  goalsContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  goalsText: {
    fontSize: 11,
  },
  diffText: {
    fontSize: 11,
    fontWeight: "600",
  },
  teamStats: {
    alignItems: "flex-end",
    minWidth: 60,
  },
  statText: {
    fontSize: 12,
  },
  formText: {
    fontSize: 10,
    marginTop: 2,
    fontFamily: "monospace",
  },
  legendContainer: {
    marginTop: 24,
    padding: 16,
    borderRadius: 8,
  },
  legendTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    textAlign: "center",
  },
  legendGrid: {
    flexDirection: "column",
    gap: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendIndicator: {
    width: 4,
    height: 16,
    marginRight: 12,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 13,
    flex: 1,
  },
});

export default FIFAWorldStandingsScreen;

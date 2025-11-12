import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  FlatList,
  Image,
} from "react-native";
import { useTheme } from "../../../context/ThemeContext";
import { useNavigation } from "@react-navigation/native";
import { FIFACompetitionState } from "../../../services/soccer/FIFACompetitionState";
import { BaseCacheService } from "../../../services/BaseCacheService";

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

// Global cache for athlete and team data to prevent duplicate API calls across categories
const globalDataCache = new Map();
const cacheExpiry = 5 * 60 * 1000; // 5 minutes

// Helper to check if cached data is still valid
const isCacheValid = (cacheEntry) => {
  return cacheEntry && Date.now() - cacheEntry.timestamp < cacheExpiry;
};

// Helper to get from cache or return null if expired
const getFromCache = (url) => {
  const cached = globalDataCache.get(url);
  if (isCacheValid(cached)) {
    return cached.data;
  } else if (cached) {
    // Remove expired cache entry
    globalDataCache.delete(url);
  }
  return null;
};

// Helper to set cache with timestamp
const setCache = (url, data) => {
  globalDataCache.set(url, {
    data,
    timestamp: Date.now(),
  });
};

// Memoized Logo component with error handling and caching
const LogoWithFallback = React.memo(
  ({ logoId, name, style, isDarkMode, theme }) => {
    const cacheKey = `${logoId}-${isDarkMode}`;

    const [imageError, setImageError] = useState(() => {
      const cached = logoCache.get(cacheKey);
      return cached?.imageError || false;
    });
    const [fallbackError, setFallbackError] = useState(() => {
      const cached = logoCache.get(cacheKey);
      return cached?.fallbackError || false;
    });

    const urls = React.useMemo(() => {
      const primaryUrl = `https://a.espncdn.com/combiner/i?img=/i/leaguelogos/soccer/${
        isDarkMode ? "500-dark" : "500"
      }/${logoId}.png&w=200&h=200`;
      const fallbackUrl = `https://a.espncdn.com/combiner/i?img=/i/leaguelogos/soccer/${
        isDarkMode ? "500" : "500-dark"
      }/${logoId}.png&w=200&h=200`;
      return { primaryUrl, fallbackUrl };
    }, [logoId, isDarkMode]);

    React.useEffect(() => {
      logoCache.set(cacheKey, { imageError, fallbackError });
    }, [cacheKey, imageError, fallbackError]);

    if (imageError && fallbackError) {
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

// Helper function to convert HTTP URLs to HTTPS
const convertToHttps = (url) => {
  if (url && url.startsWith("http://")) {
    return url.replace("http://", "https://");
  }
  return url;
};

// Helper function to get contrasting text color
const getContrastColor = (backgroundColor) => {
  if (!backgroundColor) return "#FFFFFF";

  // Remove # if present
  const color = backgroundColor.replace("#", "");

  // Convert to RGB
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return black or white based on luminance
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
};

// Helper function to get player initials
const getPlayerInitials = (athleteData) => {
  if (!athleteData) return "UK";

  if (athleteData.displayName) {
    const nameParts = athleteData.displayName.trim().split(" ");
    if (nameParts.length >= 2) {
      return `${nameParts[0][0]}${
        nameParts[nameParts.length - 1][0]
      }`.toUpperCase();
    } else if (nameParts.length === 1 && nameParts[0].length >= 2) {
      return nameParts[0].substring(0, 2).toUpperCase();
    }
  }

  if (athleteData.firstName && athleteData.lastName) {
    return `${athleteData.firstName[0]}${athleteData.lastName[0]}`.toUpperCase();
  }

  if (athleteData.fullName) {
    const nameParts = athleteData.fullName.trim().split(" ");
    if (nameParts.length >= 2) {
      return `${nameParts[0][0]}${
        nameParts[nameParts.length - 1][0]
      }`.toUpperCase();
    }
  }

  return "UK"; // Unknown
};

// Helper function to get team color for player avatar
const getTeamColorForAvatar = (teamData) => {
  if (!teamData) return "#6B7280"; // Default gray

  let teamColor = teamData.color || teamData.alternateColor;
  if (teamColor && !teamColor.startsWith("#")) {
    teamColor = `#${teamColor}`;
  }

  return teamColor || "#6B7280"; // Default gray
};

// Helper function to get team name with fallbacks
const getTeamName = (teamData) => {
  if (!teamData) return "Unknown Team";

  return (
    teamData.displayName ||
    teamData.name ||
    teamData.shortDisplayName ||
    teamData.abbreviation ||
    teamData.team?.displayName ||
    teamData.team?.name ||
    teamData.team?.shortDisplayName ||
    teamData.team?.abbreviation ||
    "Unknown Team"
  );
};

const FIFAWorldStatsScreen = ({ route }) => {
  const { theme, colors, isDarkMode } = useTheme();
  const navigation = useNavigation();

  const [selectedCompetition, setSelectedCompetition] = useState(() =>
    FIFACompetitionState.getCurrentCompetition()
  );
  const [playerStats, setPlayerStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalData, setModalData] = useState([]);
  const [modalTitle, setModalTitle] = useState("");
  const [currentYear, setCurrentYear] = useState(null);

  // Cache flag to avoid refetching
  const [statsLoaded, setStatsLoaded] = useState(false);

  // Subscribe to competition changes from other screens
  useEffect(() => {
    const unsubscribe = FIFACompetitionState.subscribe((newCompetition) => {
      console.log(
        "FIFAWorldStatsScreen: Received competition change:",
        newCompetition
      );
      setSelectedCompetition(newCompetition);
      setStatsLoaded(false); // Reset cache when competition changes
    });

    return unsubscribe;
  }, []);

  const handleCompetitionChange = React.useCallback(
    (competitionId) => {
      if (competitionId === selectedCompetition) return;
      console.log(
        "FIFAWorldStatsScreen: Changing competition to:",
        competitionId
      );

      // Clear global cache when competition changes
      globalDataCache.clear();
      console.log("Cleared global data cache for new competition");

      // Update both local state and shared state
      setSelectedCompetition(competitionId);
      FIFACompetitionState.setCurrentCompetition(competitionId);
      setStatsLoaded(false); // Reset cache when competition changes
    },
    [selectedCompetition]
  );

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

  // Get current year for the competition
  const getCurrentYear = async () => {
    try {
      console.log(
        "Fetching current year for competition:",
        selectedCompetition
      );
      const currentYear = new Date().getFullYear();
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${selectedCompetition}/scoreboard?dates=${currentYear}0101`;

      const response = await fetch(url, {
        headers: BaseCacheService.getBrowserHeaders(),
      });
      const data = await response.json();

      if (data?.leagues?.[0]?.season?.year) {
        const year = data.leagues[0].season.year;
        console.log("Found season year:", year);
        return year;
      }

      // Fallback to current year
      console.log("No season year found, using current year:", currentYear);
      return currentYear;
    } catch (error) {
      console.error("Error getting current year:", error);
      return new Date().getFullYear();
    }
  };

  // Fetch player stats
  const fetchPlayerStats = async () => {
    try {
      const year = await getCurrentYear();
      setCurrentYear(year);

      const headers = BaseCacheService.getBrowserHeaders();
      const url = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${selectedCompetition}/seasons/${year}/types/1/leaders?limit=10`;

      console.log("Fetching FIFA stats from:", url);
      const response = await fetch(url, { headers });
      const data = await response.json();

      if (data?.categories && data.categories.length > 0) {
        const filteredCategories = data.categories.filter((category) => {
          // Exclude goalsLeaders and assistsLeaders as requested
          return !["goalsLeaders", "assistsLeaders"].includes(category.name);
        });

        if (filteredCategories.length === 0) {
          console.log("No stats categories found after filtering");
          setPlayerStats({});
          setStatsLoaded(true);
          return;
        }

        // Collect ALL unique URLs across ALL categories first
        const globalUniqueAthleteRefs = new Set();
        const globalUniqueTeamRefs = new Set();
        const globalRefToLeaderIndicesMap = new Map();

        // First pass: collect all unique URLs across all categories
        filteredCategories.forEach((category, categoryIndex) => {
          if (category.leaders && category.leaders.length > 0) {
            category.leaders.slice(0, 10).forEach((leader, index) => {
              const globalIndex = `${categoryIndex}_${index}`; // Unique identifier across categories

              if (leader.athlete?.$ref) {
                const corsProxyUrl = convertToHttps(leader.athlete.$ref);
                if (corsProxyUrl) {
                  globalUniqueAthleteRefs.add(corsProxyUrl);

                  if (!globalRefToLeaderIndicesMap.has(corsProxyUrl)) {
                    globalRefToLeaderIndicesMap.set(corsProxyUrl, []);
                  }
                  globalRefToLeaderIndicesMap.get(corsProxyUrl).push({
                    leader,
                    index: globalIndex,
                    type: "athlete",
                    categoryName: category.name,
                  });
                }
              }

              if (leader.team?.$ref) {
                const corsProxyUrl = convertToHttps(leader.team.$ref);
                if (corsProxyUrl) {
                  globalUniqueTeamRefs.add(corsProxyUrl);

                  if (!globalRefToLeaderIndicesMap.has(corsProxyUrl)) {
                    globalRefToLeaderIndicesMap.set(corsProxyUrl, []);
                  }
                  globalRefToLeaderIndicesMap.get(corsProxyUrl).push({
                    leader,
                    index: globalIndex,
                    type: "team",
                    categoryName: category.name,
                  });
                }
              }
            });
          }
        });

        const athleteRefsArray = Array.from(globalUniqueAthleteRefs);
        const teamRefsArray = Array.from(globalUniqueTeamRefs);

        console.log(
          `Global deduplication: ${athleteRefsArray.length} unique athletes and ${teamRefsArray.length} unique teams across ALL categories`
        );

        // Check cache first and filter out already cached URLs
        const uncachedAthleteRefs = athleteRefsArray.filter(
          (url) => !getFromCache(url)
        );
        const uncachedTeamRefs = teamRefsArray.filter(
          (url) => !getFromCache(url)
        );

        console.log(
          `Cache hit: ${
            athleteRefsArray.length - uncachedAthleteRefs.length
          } athletes and ${
            teamRefsArray.length - uncachedTeamRefs.length
          } teams from cache`
        );
        console.log(
          `Need to fetch: ${uncachedAthleteRefs.length} athletes and ${uncachedTeamRefs.length} teams`
        );

        // Only fetch uncached data
        const allUncachedRefs = [...uncachedAthleteRefs, ...uncachedTeamRefs];

        if (allUncachedRefs.length > 0) {
          const fetchPromises = allUncachedRefs.map(async (refUrl) => {
            try {
              console.log("Fetching uncached:", refUrl);

              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 10000);

              const response = await fetch(refUrl, {
                headers,
                signal: controller.signal,
              });

              clearTimeout(timeoutId);

              if (!response.ok) {
                console.error(
                  `HTTP error! status: ${response.status} for URL: ${refUrl}`
                );
                return {
                  refUrl,
                  data: null,
                  success: false,
                  error: `HTTP ${response.status}`,
                };
              }

              const data = await response.json();

              // Cache the successful response
              setCache(refUrl, data);

              console.log(
                `Successfully fetched and cached: ${
                  refUrl.includes("athletes") ? "athlete" : "team"
                }`
              );
              return { refUrl, data, success: true };
            } catch (error) {
              console.error(
                "Error fetching ref:",
                refUrl,
                "Error:",
                error.message
              );
              return {
                refUrl,
                data: null,
                success: false,
                error: error.message,
              };
            }
          });

          await Promise.all(fetchPromises);
        }

        // Create global data maps using both cached and newly fetched data
        const globalAthleteDataMap = new Map();
        const globalTeamDataMap = new Map();

        // Populate maps with cached and newly fetched data
        [...athleteRefsArray, ...teamRefsArray].forEach((refUrl) => {
          const cachedData = getFromCache(refUrl);
          if (cachedData) {
            const mapInfoArray = globalRefToLeaderIndicesMap.get(refUrl);
            if (mapInfoArray) {
              mapInfoArray.forEach((mapInfo) => {
                if (mapInfo.type === "athlete") {
                  globalAthleteDataMap.set(mapInfo.index, cachedData);
                } else if (mapInfo.type === "team") {
                  globalTeamDataMap.set(mapInfo.index, cachedData);
                }
              });
            }
          }
        });

        const statsData = {};

        // Second pass: process each category with the fetched data
        filteredCategories.forEach((category, categoryIndex) => {
          if (category.leaders && category.leaders.length > 0) {
            // Debug logging for goals category
            if (category.name === "goals") {
              console.log("=== GOALS CATEGORY DEBUG ===");
              category.leaders.slice(0, 3).forEach((leader, index) => {
                console.log(`Leader ${index}:`, {
                  athleteName:
                    leader.athlete?.displayName ||
                    leader.athlete?.fullName ||
                    "No name",
                  athleteRef: leader.athlete?.$ref || "No athlete $ref",
                  teamName:
                    leader.team?.displayName ||
                    leader.team?.name ||
                    "No team name",
                  teamRef: leader.team?.$ref || "No team $ref",
                });
              });
              console.log("=== END GOALS DEBUG ===");
            }

            // Process leaders with globally fetched data
            const processedLeaders = category.leaders
              .slice(0, 10)
              .map((leader, index) => {
                const globalIndex = `${categoryIndex}_${index}`;
                const fetchedAthleteData =
                  globalAthleteDataMap.get(globalIndex);
                const fetchedTeamData = globalTeamDataMap.get(globalIndex);

                // Debug logging for goals category
                if (category.name === "goals") {
                  console.log(`=== PROCESSED LEADER ${index} ===`);
                  console.log(
                    "Fetched athlete:",
                    fetchedAthleteData?.displayName || "No fetched athlete"
                  );
                  console.log(
                    "Fetched team:",
                    fetchedTeamData?.displayName ||
                      fetchedTeamData?.name ||
                      "No fetched team"
                  );
                  console.log("Team fetch success:", !!fetchedTeamData);
                  console.log(
                    "Final team data will be:",
                    fetchedTeamData || "null (no fallback to $ref)"
                  );
                }

                return {
                  ...leader,
                  athleteData: fetchedAthleteData || null,
                  teamData: fetchedTeamData || null,
                  rank: index + 1,
                };
              });

            statsData[category.name] = {
              name: category.displayName,
              abbreviation: category.abbreviation,
              leaders: processedLeaders,
            };
          }
        });

        // Check if we have any valid stats
        if (Object.keys(statsData).length === 0) {
          console.log("No stats data found for any category");
          setPlayerStats({});
        } else {
          setPlayerStats(statsData);
        }
        setStatsLoaded(true);
      } else {
        console.log("No categories found in response, clearing stats");
        setPlayerStats({});
        setStatsLoaded(true);
      }
    } catch (error) {
      console.error("Error fetching FIFA player stats:", error);
      setPlayerStats({});
      setStatsLoaded(true);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [selectedCompetition]);

  const fetchStats = async () => {
    // Only show loading if we haven't cached the data yet
    if (!statsLoaded) {
      setLoading(true);
    }

    try {
      await fetchPlayerStats();
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      if (!statsLoaded) {
        setLoading(false);
      }
    }
  };

  const openModal = (leaders, categoryName) => {
    setModalData(leaders);
    setModalTitle(categoryName);
    setModalVisible(true);
  };

  const renderLeaderRow = (leader, index, isFirst = false) => {
    const athleteName =
      leader.athleteData?.displayName ||
      leader.athleteData?.fullName ||
      "Unknown Player";
    const teamName = getTeamName(leader.teamData);
    const teamAbbreviation = leader.teamData?.abbreviation || "UNK";
    const teamLogo = convertToHttps(leader.teamData?.logos?.[0]?.href);
    const statValue = leader.displayValue || leader.value?.toString() || "0";

    // Get player initials and team color for avatar
    const playerInitials = getPlayerInitials(leader.athleteData);
    const teamColor = getTeamColorForAvatar(leader.teamData);
    const textColor = getContrastColor(teamColor);

    // Navigation function for player page
    const navigateToPlayer = () => {
      if (leader.athleteData?.id) {
        navigation.navigate("FIFAWorldPlayerPage", {
          playerId: leader.athleteData.id,
          playerName: athleteName,
          teamId: leader.teamData?.id,
          competitionId: selectedCompetition,
          sport: "soccer",
        });
      }
    };

    if (isFirst) {
      return (
        <TouchableOpacity
          key={index}
          style={[styles.firstLeaderRow, { borderBottomColor: theme.border }]}
          onPress={navigateToPlayer}
          activeOpacity={0.7}
        >
          {/* Player Avatar with initials */}
          <View style={[styles.playerHeadshot, { backgroundColor: teamColor }]}>
            <Text
              allowFontScaling={false}
              style={[styles.playerInitials, { color: textColor }]}
            >
              {playerInitials}
            </Text>
          </View>
          <View style={styles.firstLeaderInfo}>
            <View style={styles.playerNameRow}>
              <Text
                allowFontScaling={false}
                style={[styles.playerName, { color: theme.text }]}
                numberOfLines={1}
              >
                {athleteName}
              </Text>
            </View>
            <View style={[styles.playerNameRow, { marginBottom: 0 }]}>
              {teamLogo && (
                <Image
                  source={{ uri: teamLogo }}
                  style={styles.teamLogoSmall}
                  onError={() =>
                    console.log("Failed to load team logo:", teamLogo)
                  }
                />
              )}
              <Text
                allowFontScaling={false}
                style={[styles.teamName, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {teamName}
              </Text>
            </View>
          </View>
          <Text
            allowFontScaling={false}
            style={[styles.statValue, { color: colors.primary }]}
          >
            {statValue}
          </Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        key={index}
        style={styles.leaderRow}
        onPress={navigateToPlayer}
        activeOpacity={0.7}
      >
        <Text
          allowFontScaling={false}
          style={[styles.rank, { color: theme.textSecondary }]}
        >
          {leader.rank || index + 1}
        </Text>
        {teamLogo && (
          <Image source={{ uri: teamLogo }} style={styles.teamLogoSmall} />
        )}
        <Text
          allowFontScaling={false}
          style={[styles.playerNameCompact, { color: theme.text }]}
          numberOfLines={1}
        >
          {athleteName}
        </Text>
        <Text
          allowFontScaling={false}
          style={[styles.statValueCompact, { color: theme.text }]}
        >
          {statValue}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderCategory = (category) => {
    if (!category.leaders || category.leaders.length === 0) return null;

    return (
      <TouchableOpacity
        onPress={() => openModal(category.leaders, category.name)}
      >
        <View
          key={category.name}
          style={[styles.categoryContainer, { backgroundColor: theme.surface }]}
        >
          <Text
            allowFontScaling={false}
            style={[styles.categoryTitle, { color: theme.text }]}
          >
            {category.name}
          </Text>

          {/* First leader (featured) */}
          {category.leaders[0] && renderLeaderRow(category.leaders[0], 0, true)}

          {/* Remaining leaders */}
          {category.leaders
            .slice(1, 5)
            .map((leader, index) => renderLeaderRow(leader, index + 1))}

          {category.leaders.length > 5 && (
            <Text
              allowFontScaling={false}
              style={[styles.viewMore, { color: colors.primary }]}
            >
              View All
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderModalItem = ({ item, index }) => {
    const athleteName =
      item.athleteData?.displayName ||
      item.athleteData?.fullName ||
      "Unknown Player";
    const teamName = getTeamName(item.teamData);
    const teamLogo = convertToHttps(item.teamData?.logos?.[0]?.href);
    const statValue = item.displayValue || item.value?.toString() || "0";

    // Get player initials and team color for avatar
    const playerInitials = getPlayerInitials(item.athleteData);
    const teamColor = getTeamColorForAvatar(item.teamData);
    const textColor = getContrastColor(teamColor);

    // Navigation function for player page
    const navigateToPlayer = () => {
      if (item.athleteData?.id) {
        setModalVisible(false); // Close modal first
        navigation.navigate("FIFAWorldPlayerPage", {
          playerId: item.athleteData.id,
          playerName: athleteName,
          teamId: item.teamData?.id,
          competitionId: selectedCompetition,
          sport: "soccer",
        });
      }
    };

    return (
      <TouchableOpacity
        style={[styles.modalItem, { backgroundColor: theme.surface }]}
        onPress={navigateToPlayer}
        activeOpacity={0.7}
      >
        <Text
          allowFontScaling={false}
          style={[styles.modalRank, { color: theme.textSecondary }]}
        >
          {item.rank || index + 1}
        </Text>

        {/* Player Avatar with initials */}
        <View style={[styles.modalHeadshot, { backgroundColor: teamColor }]}>
          <Text
            allowFontScaling={false}
            style={[styles.modalPlayerInitials, { color: textColor }]}
          >
            {playerInitials}
          </Text>
        </View>

        <View style={styles.modalPlayerInfo}>
          <View style={styles.modalNameRow}>
            <Text
              allowFontScaling={false}
              style={[styles.modalPlayerName, { color: theme.text }]}
              numberOfLines={1}
            >
              {athleteName}
            </Text>
          </View>
          <View style={[styles.modalNameRow, { marginBottom: 0 }]}>
            {teamLogo && (
              <Image source={{ uri: teamLogo }} style={styles.modalTeamLogo} />
            )}
            <Text
              allowFontScaling={false}
              style={[styles.modalTeamName, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {teamName}
            </Text>
          </View>
        </View>

        <Text
          allowFontScaling={false}
          style={[styles.modalStatValue, { color: theme.text }]}
        >
          {statValue}
        </Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {renderCompetitionSelector()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            allowFontScaling={false}
            style={[styles.loadingText, { color: theme.text }]}
          >
            Loading stats...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderCompetitionSelector()}

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }} // Add extra padding for bottom navigation
      >
        <Text
          allowFontScaling={false}
          style={[styles.sectionTitle, { color: theme.text }]}
        >
          Player Leaders
        </Text>

        {Object.keys(playerStats).length === 0 ? (
          <View style={styles.noStatsContainer}>
            <Text
              allowFontScaling={false}
              style={[styles.noStatsText, { color: theme.textSecondary }]}
            >
              No stats found for this competition
            </Text>
          </View>
        ) : (
          Object.values(playerStats).map((category) => renderCategory(category))
        )}
      </ScrollView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View
          style={[styles.modalContainer, { backgroundColor: theme.background }]}
        >
          <View
            style={[
              styles.modalHeader,
              {
                backgroundColor: theme.surface,
                borderBottomColor: theme.border,
              },
            ]}
          >
            <Text
              allowFontScaling={false}
              style={[styles.modalHeaderTitle, { color: theme.text }]}
            >
              {modalTitle} Leaders
            </Text>
            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              style={styles.modalCloseButton}
            >
              <Text
                allowFontScaling={false}
                style={[styles.modalCloseText, { color: colors.primary }]}
              >
                Close
              </Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={modalData}
            renderItem={renderModalItem}
            keyExtractor={(item, index) =>
              item.athleteData?.id?.toString() || index.toString()
            }
            style={styles.modalList}
          />
        </View>
      </Modal>
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
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  noStatsContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  noStatsText: {
    fontSize: 16,
    textAlign: "center",
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginTop: 20,
    marginBottom: 16,
    textAlign: "center",
  },
  categoryContainer: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  firstLeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    marginBottom: 8,
  },
  playerHeadshot: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  playerInitials: {
    fontSize: 16,
    fontWeight: "bold",
  },
  firstLeaderInfo: {
    flex: 1,
  },
  playerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  teamLogoSmall: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  teamName: {
    fontSize: 14,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "bold",
    minWidth: 60,
    textAlign: "right",
  },
  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  rank: {
    fontSize: 14,
    fontWeight: "600",
    width: 30,
    textAlign: "center",
  },
  playerNameCompact: {
    flex: 1,
    fontSize: 14,
    marginLeft: 8,
  },
  statValueCompact: {
    fontSize: 16,
    fontWeight: "bold",
    minWidth: 50,
    textAlign: "right",
  },
  viewMore: {
    textAlign: "center",
    fontSize: 14,
    fontStyle: "italic",
    paddingVertical: 8,
  },
  viewMoreContainer: {
    paddingVertical: 8,
    alignItems: "center",
  },
  bottomSpacer: {
    height: 80, // Space to prevent overlap with bottom navigation
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  modalCloseButton: {
    padding: 8,
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: "600",
  },
  modalList: {
    flex: 1,
    padding: 16,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  modalRank: {
    fontSize: 16,
    fontWeight: "bold",
    width: 30,
    textAlign: "center",
  },
  modalHeadshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  modalPlayerInitials: {
    fontSize: 12,
    fontWeight: "bold",
  },
  modalPlayerInfo: {
    flex: 1,
  },
  modalNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  modalTeamLogo: {
    width: 16,
    height: 16,
    marginRight: 6,
  },
  modalPlayerName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  modalTeamName: {
    fontSize: 12,
  },
  modalStatValue: {
    fontSize: 18,
    fontWeight: "bold",
    minWidth: 60,
    textAlign: "right",
  },
});

export default FIFAWorldStatsScreen;

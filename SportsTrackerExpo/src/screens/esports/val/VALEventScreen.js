import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";
import {
  getEventDetails,
  formatEventDateRange,
  formatPrizePool,
} from "../../../services/valorantService";
import {
  getTopAgentsByRole,
  getBasicStatsByAgent,
  getMapTopComps,
  getTopPlayers,
  getTopPlayersByMultikills,
  getTopPlayersByWeaponsKills,
  getAgentDisplayName,
  getAgentImageUrl,
  getMapSampleUrl,
} from "../../../services/valorantSeriesService";
import { child, get } from "firebase/database";

const VALEventScreen = ({ navigation, route }) => {
  const { eventId } = route.params;
  const { colors, theme } = useTheme();
  const { height: WINDOW_HEIGHT } = Dimensions.get("window");
  const [event, setEvent] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [expandedEvents, setExpandedEvents] = useState({});
  const [activeGroups, setActiveGroups] = useState({});
  const [showMatches, setShowMatches] = useState({});
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [expandedMaps, setExpandedMaps] = useState({});

  // Stats data cache - stores data for each event ID
  const [statsDataCache, setStatsDataCache] = useState({});
  const [statsLoading, setStatsLoading] = useState(false);

  // Helper function to get weapon images
  const getWeaponImage = (weaponName) => {
    // Map weapon names to their file names
    const weaponMapping = {
      Classic: "classic",
      Shorty: "shorty",
      Frenzy: "frenzy",
      Ghost: "ghost",
      Sheriff: "sheriff",
      Stinger: "stinger",
      Spectre: "spectre",
      Bucky: "bucky",
      Judge: "judge",
      Bulldog: "bulldog",
      Guardian: "guardian",
      Phantom: "phantom",
      Vandal: "vandal",
      Marshal: "marshal",
      Operator: "operator",
      Ares: "ares",
      Odin: "odin",
      Knife: "melee",
      Melee: "melee",
    };

    const mappedName =
      weaponMapping[weaponName] ||
      weaponName?.toLowerCase().replace(/\s+/g, "_");
    return mappedName
      ? `https://www.rib.gg/assets/weapons/${mappedName}.png`
      : null;
  };

  useEffect(() => {
    loadData();
  }, [eventId]);

  // Extract teams from child events
  const extractTeamsFromEvent = (eventData) => {
    const allTeams = [];
    const teamIds = new Set(); // To avoid duplicates

    // First, check if the main event has bracketJson with groups
    if (eventData.bracketJson && eventData.bracketJson.groups) {
      eventData.bracketJson.groups.forEach((group) => {
        if (group.teams && group.teams.length > 0) {
          group.teams.forEach((team) => {
            if (
              !teamIds.has(team.id) &&
              team.shortName &&
              team.shortName !== "TBD"
            ) {
              teamIds.add(team.id);
              allTeams.push({
                id: team.id,
                name: team.name,
                shortName: team.shortName,
                logoUrl: team.logoUrl,
                countryId: team.countryId,
                country: team.country,
              });
            }
          });
        }
      });
    }

    if (eventData.childEvents && eventData.childEvents.length > 0) {
      eventData.childEvents.forEach((childEvent) => {
        if (childEvent.bracketJson && childEvent.bracketJson.groups) {
          childEvent.bracketJson.groups.forEach((group) => {
            if (group.teams && group.teams.length > 0) {
              group.teams.forEach((team) => {
                if (
                  !teamIds.has(team.id) &&
                  team.shortName &&
                  team.shortName !== "TBD"
                ) {
                  teamIds.add(team.id);
                  allTeams.push({
                    id: team.id,
                    name: team.name,
                    shortName: team.shortName,
                    logoUrl: team.logoUrl,
                    countryId: team.countryId,
                    country: team.country,
                  });
                }
              });
            }
          });
        }

        if (
          (childEvent.bracketJson &&
            (childEvent.bracketJson.type === "double" ||
              childEvent.bracketJson.type === "triple")) ||
          (childEvent.bracketJson && childEvent.bracketJson.losers)
        ) {
          childEvent.bracketJson.losers.forEach((loserSeed) => {
            loserSeed.seeds.forEach((loser) => {
              if (loser.teams && loser.teams.length > 0) {
                loser.teams.forEach((loserTeam) => {
                  if (
                    !teamIds.has(loserTeam.id) &&
                    loserTeam.shortName &&
                    loserTeam.shortName !== "TBD"
                  ) {
                    teamIds.add(loserTeam.id);
                    allTeams.push({
                      id: loserTeam.id,
                      name: loserTeam.name,
                      shortName: loserTeam.shortName,
                      logoUrl: loserTeam.logoUrl,
                      countryId: loserTeam.countryId,
                      country: loserTeam.country,
                    });
                  }
                });
              }
            });
          });
        }

        if (
          (childEvent.bracketJson &&
            childEvent.bracketJson.type === "triple") ||
          (childEvent.bracketJson && childEvent.bracketJson.middle)
        ) {
          childEvent.bracketJson.middle.forEach((middleSeed) => {
            middleSeed.seeds.forEach((middle) => {
              if (middle.teams && middle.teams.length > 0) {
                middle.teams.forEach((middleTeam) => {
                  if (
                    !teamIds.has(middleTeam.id) &&
                    middleTeam.shortName &&
                    middleTeam.shortName !== "TBD"
                  ) {
                    teamIds.add(middleTeam.id);
                    allTeams.push({
                      id: middleTeam.id,
                      name: middleTeam.name,
                      shortName: middleTeam.shortName,
                      logoUrl: middleTeam.logoUrl,
                      countryId: middleTeam.countryId,
                      country: middleTeam.country,
                    });
                  }
                });
              }
            });
          });
        }

        if (
          childEvent.bracketJson &&
          (childEvent.bracketJson.type === "double" ||
            childEvent.bracketJson.type === "single" ||
            childEvent.bracketJson.type === "triple" ||
            childEvent.bracketJson.winners)
        ) {
          childEvent.bracketJson.winners.forEach((winnerSeed) => {
            winnerSeed.seeds.forEach((winner) => {
              if (winner.teams && winner.teams.length > 0) {
                winner.teams.forEach((winnerTeam) => {
                  if (
                    !teamIds.has(winnerTeam.id) &&
                    winnerTeam.shortName &&
                    winnerTeam.shortName !== "TBD"
                  ) {
                    teamIds.add(winnerTeam.id);
                    allTeams.push({
                      id: winnerTeam.id,
                      name: winnerTeam.name,
                      shortName: winnerTeam.shortName,
                      logoUrl: winnerTeam.logoUrl,
                      countryId: winnerTeam.countryId,
                      country: winnerTeam.country,
                    });
                  }
                });
              }
            });
          });
        }

        // Extract teams from weekly tournaments
        if (
          childEvent.bracketJson &&
          childEvent.bracketJson.type === "weekly" &&
          childEvent.bracketJson.weekly
        ) {
          if (childEvent.bracketJson.weekly.weeks) {
            childEvent.bracketJson.weekly.weeks.forEach((week) => {
              if (week.series) {
                week.series.forEach((series) => {
                  // Add team1
                  if (
                    series.team1 &&
                    !teamIds.has(series.team1.id) &&
                    series.team1.shortName &&
                    series.team1.shortName !== "TBD"
                  ) {
                    teamIds.add(series.team1.id);
                    allTeams.push({
                      id: series.team1.id,
                      name: series.team1.name,
                      shortName: series.team1.shortName,
                      logoUrl: series.team1.logoUrl,
                      countryId: series.team1.countryId,
                      country: series.team1.country,
                    });
                  }

                  // Add team2
                  if (
                    series.team2 &&
                    !teamIds.has(series.team2.id) &&
                    series.team2.shortName &&
                    series.team2.shortName !== "TBD"
                  ) {
                    teamIds.add(series.team2.id);
                    allTeams.push({
                      id: series.team2.id,
                      name: series.team2.name,
                      shortName: series.team2.shortName,
                      logoUrl: series.team2.logoUrl,
                      countryId: series.team2.countryId,
                      country: series.team2.country,
                    });
                  }
                });
              }
            });
          }
        }
      });
    }

    return allTeams;
  };

  // Calculate event status based on dates
  const getEventStatus = (startDate, endDate) => {
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (now < start) return "Scheduled";
    if (now > end) return "Completed";
    return "In Progress";
  };

  // Extract matches from group seeds array
  const extractSeriesFromGroup = (group) => {
    const series = [];

    if (group.seeds && group.seeds.length > 0) {
      group.seeds.forEach((seed) => {
        // Only add if there are actually teams (not empty seeds)
        if (seed.team1 && seed.team2) {
          series.push({
            id: seed.id || seed.seriesId, // Include series ID
            team1: seed.team1,
            team2: seed.team2,
            team1Score: seed.team1Score || 0,
            team2Score: seed.team2Score || 0,
            startDate:
              seed.matches && seed.matches.length > 0
                ? seed.matches[0].startDate
                : null,
            completed: seed.completed || false,
            matches: seed.matches || [],
          });
        }
      });
    }

    return series;
  };

  // Extract all matches from event for Results tab
  const extractAllMatches = (eventData) => {
    const allMatches = [];

    // First, check if the main event has bracketJson with groups
    if (eventData.bracketJson && eventData.bracketJson.groups) {
      eventData.bracketJson.groups.forEach((group) => {
        const groupSeries = extractSeriesFromGroup(group);
        groupSeries.forEach((series) => {
          allMatches.push({
            ...series,
            eventName: eventData.name || eventData.shortName,
            stageTitle:
              group.title ||
              `Group ${String.fromCharCode(
                65 + eventData.bracketJson.groups.indexOf(group),
              )}`,
            eventType: "group",
          });
        });
      });
    }

    if (!eventData.childEvents || eventData.childEvents.length === 0) {
      return allMatches;
    }

    eventData.childEvents.forEach((childEvent) => {
      const eventType = childEvent.bracketJson?.type || "unknown";

      if (eventType === "group" && childEvent.bracketJson.groups) {
        // Group stage matches
        childEvent.bracketJson.groups.forEach((group) => {
          const groupSeries = extractSeriesFromGroup(group);
          groupSeries.forEach((series) => {
            allMatches.push({
              ...series,
              eventName: childEvent.name || childEvent.shortName,
              stageTitle:
                group.title ||
                `Group ${String.fromCharCode(
                  65 + childEvent.bracketJson.groups.indexOf(group),
                )}`,
              eventType: "group",
            });
          });
        });
      } else if (
        (eventType === "double" || eventType === "triple") &&
        (childEvent.bracketJson.winners || childEvent.bracketJson.losers)
      ) {
        // Playoff matches

        // Upper bracket matches
        if (childEvent.bracketJson.winners) {
          childEvent.bracketJson.winners.forEach((round) => {
            if (round.seeds) {
              round.seeds.forEach((match) => {
                if (match.teams && match.teams.length >= 2) {
                  allMatches.push({
                    id: match.id || match.seriesId, // Include series ID
                    team1: match.teams[0],
                    team2: match.teams[1],
                    team1Score: match.teams[0].score || 0,
                    team2Score: match.teams[1].score || 0,
                    startDate: match.startDate,
                    completed: match.completed || false,
                    eventName: childEvent.name || childEvent.shortName,
                    stageTitle: round.title,
                    eventType: "playoff-upper",
                  });
                }
              });
            }
          });
        }

        if (childEvent.bracketJson.middle) {
          childEvent.bracketJson.middle.forEach((round) => {
            if (round.seeds) {
              round.seeds.forEach((match) => {
                if (match.teams && match.teams.length >= 2) {
                  allMatches.push({
                    id: match.id || match.seriesId, // Include series ID
                    team1: match.teams[0],
                    team2: match.teams[1],
                    team1Score: match.teams[0].score || 0,
                    team2Score: match.teams[1].score || 0,
                    startDate: match.startDate,
                    completed: match.completed || false,
                    eventName: childEvent.name || childEvent.shortName,
                    stageTitle: round.title,
                    eventType: "playoff-middle",
                  });
                }
              });
            }
          });
        }

        // Lower bracket matches
        if (childEvent.bracketJson.losers) {
          childEvent.bracketJson.losers.forEach((round) => {
            if (round.seeds) {
              round.seeds.forEach((match) => {
                if (match.teams && match.teams.length >= 2) {
                  allMatches.push({
                    id: match.id || match.seriesId, // Include series ID
                    team1: match.teams[0],
                    team2: match.teams[1],
                    team1Score: match.teams[0].score || 0,
                    team2Score: match.teams[1].score || 0,
                    startDate: match.startDate,
                    completed: match.completed || false,
                    eventName: childEvent.name || childEvent.shortName,
                    stageTitle: round.title,
                    eventType: "playoff-lower",
                  });
                }
              });
            }
          });
        }
      } else if (eventType === "weekly" && childEvent.bracketJson.weekly) {
        // Weekly tournament matches
        if (childEvent.bracketJson.weekly.weeks) {
          childEvent.bracketJson.weekly.weeks.forEach((week, weekIndex) => {
            if (week.series) {
              week.series.forEach((series) => {
                allMatches.push({
                  id: series.id || series.seriesId,
                  team1: series.team1,
                  team2: series.team2,
                  team1Score: series.team1Score || 0,
                  team2Score: series.team2Score || 0,
                  startDate: series.startDate,
                  completed: series.completed || false,
                  eventName: childEvent.name || childEvent.shortName,
                  stageTitle: week.title || `Week ${weekIndex + 1}`,
                  eventType: "weekly",
                });
              });
            }
          });
        }
      }
    });

    // Sort matches by date (most recent first)
    allMatches.sort((a, b) => {
      if (!a.startDate && !b.startDate) return 0;
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return new Date(b.startDate) - new Date(a.startDate);
    });

    return allMatches;
  };

  // Calculate group standings from bracket data and seeds
  const calculateGroupStandings = (group) => {
    const standings = [];

    if (!group.teams) return standings;

    // Extract series from this group's seeds
    const groupSeries = extractSeriesFromGroup(group);

    group.teams.forEach((team) => {
      let seriesWins = 0;
      let seriesLosses = 0;
      let roundsWon = 0;
      let roundsLost = 0;

      // Calculate stats from series (seeds)
      if (group.seeds) {
        group.seeds.forEach((seed) => {
          if (seed.team1Id === team.id || seed.team2Id === team.id) {
            const isTeam1 = seed.team1Id === team.id;

            // Use series scores for wins/losses
            if (seed.completed) {
              const teamSeriesScore = isTeam1
                ? seed.team1Score
                : seed.team2Score;
              const opponentSeriesScore = isTeam1
                ? seed.team2Score
                : seed.team1Score;

              if (teamSeriesScore > opponentSeriesScore) {
                seriesWins++;
              } else if (opponentSeriesScore > teamSeriesScore) {
                seriesLosses++;
              }

              // Use round wins/losses for round differential
              roundsWon += isTeam1
                ? seed.team1RoundWins || 0
                : seed.team2RoundWins || 0;
              roundsLost += isTeam1
                ? seed.team1RoundLosses || 0
                : seed.team2RoundLosses || 0;
            }
          }
        });
      }

      const totalSeries = seriesWins + seriesLosses;
      const winRate = totalSeries > 0 ? (seriesWins / totalSeries) * 100 : 0;
      const roundDifferential = roundsWon - roundsLost;

      standings.push({
        ...team,
        wins: seriesWins,
        losses: seriesLosses,
        winRate: winRate.toFixed(1),
        roundsWon,
        roundsLost,
        roundDifferential:
          roundDifferential >= 0
            ? `+${roundDifferential}`
            : `${roundDifferential}`,
        qualified: team.qualified || false,
        nonQualified: team.nonQualified || false,
      });
    });

    // Sort by losses (asc), then by wins (desc), then by round differential (desc)
    standings.sort((a, b) => {
      if (a.losses !== b.losses) return a.losses - b.losses;
      if (a.wins !== b.wins) return b.wins - a.wins;
      return b.roundsWon - b.roundsLost - (a.roundsWon - a.roundsLost);
    });

    return standings;
  };

  // Calculate cumulative weekly standings from Week 1 up to current week
  const calculateWeeklyStandings = (allWeeks, currentWeekIndex, allTeams) => {
    const standings = [];

    if (!allWeeks || !allTeams) return standings;

    // Create standings for each team
    allTeams.forEach((team) => {
      let seriesWins = 0;
      let seriesLosses = 0;
      let roundsWon = 0;
      let roundsLost = 0;

      // Calculate cumulative stats from Week 1 up to current week (inclusive)
      for (let weekIdx = 0; weekIdx <= currentWeekIndex; weekIdx++) {
        const week = allWeeks[weekIdx];
        if (!week.series) continue;

        week.series.forEach((series) => {
          if (series.team1?.id === team.id || series.team2?.id === team.id) {
            const isTeam1 = series.team1?.id === team.id;

            if (series.completed) {
              const teamSeriesScore = isTeam1
                ? series.team1Score
                : series.team2Score;
              const opponentSeriesScore = isTeam1
                ? series.team2Score
                : series.team1Score;

              if (teamSeriesScore > opponentSeriesScore) {
                seriesWins++;
              } else if (opponentSeriesScore > teamSeriesScore) {
                seriesLosses++;
              }

              // Use round wins/losses from team data if available
              if (isTeam1 && series.team1) {
                roundsWon += series.team1.team1TotalRoundsWon || 0;
                roundsLost += series.team1.team1TotalRoundsLost || 0;
              } else if (!isTeam1 && series.team2) {
                roundsWon += series.team2.team2TotalRoundsWon || 0;
                roundsLost += series.team2.team2TotalRoundsLost || 0;
              }
            }
          }
        });
      }

      const totalSeries = seriesWins + seriesLosses;
      const winRate = totalSeries > 0 ? (seriesWins / totalSeries) * 100 : 0;
      const roundDifferential = roundsWon - roundsLost;

      standings.push({
        ...team,
        wins: seriesWins,
        losses: seriesLosses,
        winRate: winRate.toFixed(1),
        roundsWon,
        roundsLost,
        roundDifferential:
          roundDifferential >= 0
            ? `+${roundDifferential}`
            : `${roundDifferential}`,
        qualified: team.qualified || false,
        nonQualified: team.nonQualified || false,
      });
    });

    // Sort by losses (asc), then by wins (desc), then by round differential (desc)
    standings.sort((a, b) => {
      if (a.losses !== b.losses) return a.losses - b.losses;
      if (a.wins !== b.wins) return b.wins - a.wins;
      return b.roundsWon - b.roundsLost - (a.roundsWon - a.roundsLost);
    });

    return standings;
  };

  // Calculate ranking changes between weeks
  const calculateRankingChanges = (
    currentWeekStandings,
    allWeeks,
    currentWeekIndex,
    allTeams,
  ) => {
    if (currentWeekIndex === 0) {
      // First week, no previous rankings to compare
      return currentWeekStandings.map((team) => ({
        ...team,
        rankingChange: null,
      }));
    }

    // Get previous week's cumulative standings
    const previousWeekStandings = calculateWeeklyStandings(
      allWeeks,
      currentWeekIndex - 1,
      allTeams,
    );

    // Create a map of team ID to previous ranking
    const previousRankings = {};
    previousWeekStandings.forEach((team, index) => {
      previousRankings[team.id] = index + 1; // 1-based ranking
    });

    // Calculate changes for current week
    return currentWeekStandings.map((team, currentIndex) => {
      const currentRank = currentIndex + 1;
      const previousRank = previousRankings[team.id];

      let rankingChange = null;
      if (previousRank !== undefined) {
        const positionChange = previousRank - currentRank; // Positive means moved up
        if (positionChange !== 0) {
          rankingChange = {
            direction: positionChange > 0 ? "up" : "down",
            positions: Math.abs(positionChange),
          };
        }
      }

      return { ...team, rankingChange };
    });
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const eventData = await getEventDetails(eventId);
      setEvent(eventData);

      // Initialize selectedEventId:
      if (!selectedEventId) {
        const childEvents = eventData.childEvents || [];

        if (childEvents.length === 1) {
          // If there's only 1 child, auto-select it
          setSelectedEventId(childEvents[0].id);
          loadStatsData(childEvents[0].id);
        } else {
          // Otherwise select main event ("All")
          setSelectedEventId(eventId);
          loadStatsData(eventId);
        }
      }

      // Extract teams
      const extractedTeams = extractTeamsFromEvent(eventData);
      setTeams(extractedTeams);
    } catch (error) {
      console.error("Error loading Valorant event:", error);
      setEvent(null);
      setTeams([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const loadStatsData = async (eventIdToLoad = null) => {
    const targetEventId = eventIdToLoad || selectedEventId || eventId;

    // Check if data is already cached for this event
    if (statsDataCache[targetEventId]) {
      return; // Data already loaded for this event
    }

    try {
      setStatsLoading(true);

      // Load all 6 API endpoints simultaneously
      const [
        topAgentsByRole,
        basicStatsByAgent,
        mapTopComps,
        topPlayers,
        topPlayersByMultikills,
        topPlayersByWeaponsKills,
      ] = await Promise.all([
        getTopAgentsByRole(targetEventId),
        getBasicStatsByAgent(targetEventId),
        getMapTopComps(targetEventId),
        getTopPlayers(targetEventId),
        getTopPlayersByMultikills(targetEventId),
        getTopPlayersByWeaponsKills(targetEventId),
      ]);

      // Cache the data for this specific event ID
      setStatsDataCache((prevCache) => ({
        ...prevCache,
        [targetEventId]: {
          topAgentsByRole,
          basicStatsByAgent,
          mapTopComps,
          topPlayers,
          topPlayersByMultikills,
          topPlayersByWeaponsKills,
        },
      }));
    } catch (error) {
      console.error("Error loading stats data:", error);
    } finally {
      setStatsLoading(false);
    }
  };

  // Helper function to get current stats data based on selected event
  const getCurrentStatsData = () => {
    const currentEventId = selectedEventId || eventId;
    return (
      statsDataCache[currentEventId] || {
        topAgentsByRole: null,
        basicStatsByAgent: null,
        mapTopComps: null,
        topPlayers: null,
        topPlayersByMultikills: null,
        topPlayersByWeaponsKills: null,
      }
    );
  };

  if (loading) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading event details...
        </Text>
      </View>
    );
  }

  if (!event) {
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
          Event Not Found
        </Text>
        <Text style={[styles.errorText, { color: theme.textSecondary }]}>
          The requested event could not be loaded.
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={loadData}
        >
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
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
        {/* Event Hero */}
        <View
          style={[
            styles.heroSection,
            { backgroundColor: theme.surfaceSecondary },
          ]}
        >
          {event.imageUrl || event.logoUrl ? (
            <Image
              source={{ uri: event.imageUrl || event.logoUrl }}
              style={styles.heroImage}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                styles.heroImagePlaceholder,
                { backgroundColor: colors.primary },
              ]}
            >
              <Ionicons name="trophy" size={48} color="white" />
            </View>
          )}

          <View style={styles.heroContent}>
            <Text style={[styles.eventTitle, { color: theme.text }]}>
              {event.shortName || event.name}
            </Text>

            {event.live && (
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            )}

            <Text
              style={[styles.eventDescription, { color: theme.textSecondary }]}
            >
              {event.description || "Valorant tournament"}
            </Text>

            {/* Event Info */}
            <View style={styles.eventInfoContainer}>
              <Text style={[styles.eventInfo, { color: theme.textSecondary }]}>
                {event.startDate && event.endDate
                  ? formatEventDateRange(event.startDate, event.endDate)
                  : event.startDate
                    ? new Date(event.startDate).toLocaleDateString()
                    : "TBD"}
                {event.prizePool && (
                  <Text>
                    {" "}
                    •{" "}
                    {formatPrizePool(event.prizePool, event.prizePoolCurrency)}
                  </Text>
                )}
                <Text>
                  {" "}
                  • {event.country?.niceName || event.region?.name || "Global"}
                </Text>
              </Text>
            </View>
          </View>
        </View>

        {/* Tab Navigation */}
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
              activeTab === "results" && {
                borderBottomColor: colors.primary,
                borderBottomWidth: 2,
              },
            ]}
            onPress={() => setActiveTab("results")}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    activeTab === "results"
                      ? colors.primary
                      : theme.textSecondary,
                },
              ]}
            >
              Results
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
            onPress={() => {
              setActiveTab("stats");
              loadStatsData();
            }}
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

        {/* Child Event Buttons (Only show for Stats tab) */}
        {activeTab === "stats" &&
          (() => {
            const childEvents = event?.childEvents ?? [];
            const count = childEvents.length;

            if (count === 0) return null; // nothing renders

            if (count === 1) {
              const onlyChild = childEvents[0];
              return (
                <View style={styles.childEventsSection}>
                  <TouchableOpacity
                    style={[
                      styles.childEventButton,
                      {
                        backgroundColor:
                          selectedEventId === onlyChild.id
                            ? colors.primary
                            : theme.surface,
                      },
                    ]}
                    onPress={() => {
                      setSelectedEventId(onlyChild.id);
                      loadStatsData(onlyChild.id);
                    }}
                  >
                    <Text
                      style={[
                        styles.childEventButtonText,
                        {
                          color:
                            selectedEventId === onlyChild.id
                              ? "white"
                              : theme.text,
                        },
                      ]}
                    >
                      {onlyChild.shortName || onlyChild.name}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            }

            // FALLBACK: more than one → original behavior
            return (
              <View style={styles.childEventsSection}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.childEventsScrollContent}
                >
                  {/* ALL button */}
                  <TouchableOpacity
                    style={[
                      styles.childEventButton,
                      {
                        backgroundColor:
                          selectedEventId === eventId
                            ? colors.primary
                            : theme.surface,
                      },
                    ]}
                    onPress={() => {
                      setSelectedEventId(eventId);
                      loadStatsData(eventId);
                    }}
                  >
                    <Text
                      style={[
                        styles.childEventButtonText,
                        {
                          color:
                            selectedEventId === eventId ? "white" : theme.text,
                        },
                      ]}
                    >
                      All
                    </Text>
                  </TouchableOpacity>

                  {/* Child event buttons */}
                  {childEvents.map((childEvent) => (
                    <TouchableOpacity
                      key={childEvent.id}
                      style={[
                        styles.childEventButton,
                        {
                          backgroundColor:
                            selectedEventId === childEvent.id
                              ? colors.primary
                              : theme.surface,
                        },
                      ]}
                      onPress={() => {
                        setSelectedEventId(childEvent.id);
                        loadStatsData(childEvent.id);
                      }}
                    >
                      <Text
                        style={[
                          styles.childEventButtonText,
                          {
                            color:
                              selectedEventId === childEvent.id
                                ? "white"
                                : theme.text,
                          },
                        ]}
                      >
                        {childEvent.shortName || childEvent.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            );
          })()}

        {/* Tab Content */}
        {activeTab === "overview" && (
          <>
            {/* Results Section for Main Event Groups */}
            {event.bracketJson &&
              event.bracketJson.groups &&
              !event.childEvents?.length && (
                <View style={styles.detailsSection}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    Results
                  </Text>

                  <View
                    style={[
                      styles.eventCard,
                      { backgroundColor: theme.surfaceSecondary },
                    ]}
                  >
                    {/* Event Header */}
                    <TouchableOpacity
                      style={styles.eventHeader}
                      onPress={() => {
                        const isCurrentlyExpanded = expandedEvents[event.id];
                        setExpandedEvents((prev) => ({
                          ...prev,
                          [event.id]: !prev[event.id],
                        }));

                        // Auto-select first group when expanding
                        if (!isCurrentlyExpanded && event.bracketJson.groups) {
                          setActiveGroups((prev) => ({
                            ...prev,
                            [`${event.id}-0`]: true,
                          }));
                        }
                      }}
                    >
                      <View style={styles.eventHeaderLeft}>
                        <Text style={[styles.eventName, { color: theme.text }]}>
                          {event.shortName || event.name}
                        </Text>
                        <View style={styles.eventMeta}>
                          <View
                            style={[
                              styles.statusBadge,
                              {
                                backgroundColor:
                                  getEventStatus(
                                    event.startDate,
                                    event.endDate,
                                  ) === "In Progress"
                                    ? theme.error
                                    : getEventStatus(
                                          event.startDate,
                                          event.endDate,
                                        ) === "Completed"
                                      ? theme.success
                                      : theme.warning,
                              },
                            ]}
                          >
                            <Text style={styles.statusText}>
                              {event.live
                                ? "LIVE"
                                : getEventStatus(
                                    event.startDate,
                                    event.endDate,
                                  )}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.eventDates,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {event.startDate && event.endDate
                              ? formatEventDateRange(
                                  event.startDate,
                                  event.endDate,
                                )
                              : "TBD"}
                          </Text>
                        </View>
                      </View>
                      <Ionicons
                        name={
                          expandedEvents[event.id]
                            ? "chevron-up"
                            : "chevron-down"
                        }
                        size={20}
                        color={theme.textSecondary}
                      />
                    </TouchableOpacity>

                    {/* Expanded Content */}
                    {expandedEvents[event.id] && (
                      <View style={styles.expandedContent}>
                        {/* Group Buttons */}
                        <View style={styles.groupButtonsContainer}>
                          {event.bracketJson.groups.map((group, groupIndex) => (
                            <TouchableOpacity
                              key={groupIndex}
                              style={[
                                styles.groupButton,
                                {
                                  backgroundColor: activeGroups[
                                    `${event.id}-${groupIndex}`
                                  ]
                                    ? colors.primary
                                    : theme.surface,
                                  borderColor: colors.primary,
                                },
                              ]}
                              onPress={() =>
                                setActiveGroups((prev) => {
                                  const newState = { ...prev };
                                  event.bracketJson.groups.forEach((_, idx) => {
                                    newState[`${event.id}-${idx}`] = false;
                                  });
                                  newState[`${event.id}-${groupIndex}`] = true;
                                  return newState;
                                })
                              }
                            >
                              <Text
                                style={[
                                  styles.groupButtonText,
                                  {
                                    color: activeGroups[
                                      `${event.id}-${groupIndex}`
                                    ]
                                      ? "white"
                                      : colors.primary,
                                  },
                                ]}
                              >
                                {group.title ||
                                  `Group ${String.fromCharCode(
                                    65 + groupIndex,
                                  )}`}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        {/* Group Standings */}
                        {event.bracketJson.groups.map((group, groupIndex) => {
                          const isGroupActive =
                            activeGroups[`${event.id}-${groupIndex}`];
                          if (!isGroupActive) return null;

                          const standings = calculateGroupStandings(group);
                          const showMatchesKey = `${event.id}-${groupIndex}`;

                          return (
                            <View
                              key={groupIndex}
                              style={styles.groupContainer}
                            >
                              <Text
                                style={[
                                  styles.groupTitle,
                                  { color: theme.text },
                                ]}
                              >
                                {group.title ||
                                  `Group ${String.fromCharCode(
                                    65 + groupIndex,
                                  )}`}{" "}
                                Standings
                              </Text>

                              {/* Standings Table */}
                              <View
                                style={[
                                  styles.standingsTable,
                                  { backgroundColor: theme.surface },
                                ]}
                              >
                                {/* Table Header */}
                                <View style={styles.tableHeader}>
                                  <Text
                                    style={[
                                      styles.headerText,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    #
                                  </Text>
                                  <Text
                                    style={[
                                      styles.headerTextTeam,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    Team
                                  </Text>
                                  <Text
                                    style={[
                                      styles.headerText,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    W
                                  </Text>
                                  <Text
                                    style={[
                                      styles.headerText,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    L
                                  </Text>
                                  <Text
                                    style={[
                                      styles.headerText,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    +/-
                                  </Text>
                                </View>

                                {/* Table Rows */}
                                {standings.map((team, teamIndex) => (
                                  <View
                                    key={team.id}
                                    style={[
                                      styles.tableRow,
                                      {
                                        borderLeftWidth: team.qualified
                                          ? 3
                                          : team.nonQualified
                                            ? 3
                                            : 0,
                                        borderLeftColor: team.qualified
                                          ? theme.success
                                          : team.nonQualified
                                            ? theme.error
                                            : theme.surface,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.cellText,
                                        { color: theme.textSecondary },
                                      ]}
                                    >
                                      {teamIndex + 1}
                                    </Text>
                                    <View style={styles.teamCell}>
                                      <Image
                                        source={{
                                          uri:
                                            team.logoUrl ||
                                            "https://i.imgur.com/BIC4pnO.webp",
                                        }}
                                        style={styles.teamLogoSmall}
                                        resizeMode="contain"
                                      />
                                      <Text
                                        style={[
                                          styles.teamNameText,
                                          { color: theme.text },
                                        ]}
                                      >
                                        {team.shortName || team.name}
                                      </Text>
                                    </View>
                                    <Text
                                      style={[
                                        styles.cellText,
                                        { color: theme.text },
                                      ]}
                                    >
                                      {team.wins}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.cellText,
                                        { color: theme.text },
                                      ]}
                                    >
                                      {team.losses}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.cellText,
                                        {
                                          color:
                                            team.roundsWon - team.roundsLost > 0
                                              ? theme.success
                                              : team.roundsWon -
                                                    team.roundsLost <
                                                  0
                                                ? theme.error
                                                : theme.text,
                                        },
                                      ]}
                                    >
                                      {team.roundsWon - team.roundsLost > 0
                                        ? "+"
                                        : ""}
                                      {team.roundsWon - team.roundsLost}
                                    </Text>
                                  </View>
                                ))}
                              </View>

                              {/* Show/Hide Matches Button */}
                              <TouchableOpacity
                                style={[
                                  styles.showMatchesButton,
                                  { backgroundColor: theme.surface },
                                ]}
                                onPress={() =>
                                  setShowMatches((prev) => ({
                                    ...prev,
                                    [showMatchesKey]: !prev[showMatchesKey],
                                  }))
                                }
                              >
                                <Text
                                  style={[
                                    styles.showMatchesText,
                                    { color: colors.primary },
                                  ]}
                                >
                                  {showMatches[showMatchesKey]
                                    ? "Hide Matches"
                                    : "Show Matches"}{" "}
                                  ({extractSeriesFromGroup(group).length})
                                </Text>
                              </TouchableOpacity>

                              {/* Series List */}
                              {showMatches[showMatchesKey] && (
                                <View style={styles.matchesList}>
                                  {extractSeriesFromGroup(group).map(
                                    (series, seriesIndex) => {
                                      const team1IsWinner =
                                        series.team1Score > series.team2Score;
                                      const team2IsWinner =
                                        series.team2Score > series.team1Score;
                                      const seriesCompleted =
                                        series.completed &&
                                        (series.team1Score > 0 ||
                                          series.team2Score > 0);

                                      return (
                                        <TouchableOpacity
                                          key={seriesIndex}
                                          style={[
                                            styles.matchCard,
                                            { backgroundColor: theme.surface },
                                          ]}
                                          onPress={() => {
                                            navigation.navigate("VALSeries", {
                                              seriesId: series.id,
                                            });
                                          }}
                                          activeOpacity={0.7}
                                        >
                                          <View style={styles.matchHeader}>
                                            <Text
                                              style={[
                                                styles.matchDate,
                                                { color: theme.textSecondary },
                                              ]}
                                            >
                                              {series.startDate
                                                ? new Date(series.startDate)
                                                    .toLocaleDateString(
                                                      "en-US",
                                                      {
                                                        month: "short",
                                                        day: "numeric",
                                                      },
                                                    )
                                                    .replace(",", "")
                                                : "TBD"}
                                            </Text>
                                            <Text
                                              style={[
                                                styles.matchTime,
                                                { color: theme.textSecondary },
                                              ]}
                                            >
                                              {series.startDate
                                                ? new Date(
                                                    series.startDate,
                                                  ).toLocaleTimeString([], {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                  })
                                                : ""}
                                            </Text>
                                          </View>
                                          <View style={styles.matchTeams}>
                                            <View style={styles.matchTeam}>
                                              <Image
                                                source={{
                                                  uri:
                                                    series.team1?.logoUrl ||
                                                    "https://i.imgur.com/BIC4pnO.webp",
                                                }}
                                                style={[
                                                  styles.matchTeamLogo,
                                                  {
                                                    opacity:
                                                      seriesCompleted &&
                                                      !team1IsWinner
                                                        ? 0.5
                                                        : 1,
                                                  },
                                                ]}
                                                resizeMode="contain"
                                              />
                                              <Text
                                                style={[
                                                  styles.matchTeamName,
                                                  {
                                                    color: theme.text,
                                                    opacity:
                                                      seriesCompleted &&
                                                      !team1IsWinner
                                                        ? 0.6
                                                        : 1,
                                                  },
                                                ]}
                                              >
                                                {series.team1?.shortName ||
                                                  "TBD"}
                                              </Text>
                                              <Text
                                                style={[
                                                  styles.matchScore,
                                                  {
                                                    color: theme.text,
                                                    opacity:
                                                      seriesCompleted &&
                                                      !team1IsWinner
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
                                                styles.matchVs,
                                                { color: theme.textSecondary },
                                              ]}
                                            >
                                              vs
                                            </Text>
                                            <View style={styles.matchTeam}>
                                              <Text
                                                style={[
                                                  styles.matchScore,
                                                  {
                                                    color: theme.text,
                                                    opacity:
                                                      seriesCompleted &&
                                                      !team2IsWinner
                                                        ? 0.6
                                                        : 1,
                                                  },
                                                ]}
                                              >
                                                {series.team2Score || 0}
                                              </Text>
                                              <Text
                                                style={[
                                                  styles.matchTeamName,
                                                  {
                                                    color: theme.text,
                                                    opacity:
                                                      seriesCompleted &&
                                                      !team2IsWinner
                                                        ? 0.6
                                                        : 1,
                                                  },
                                                ]}
                                              >
                                                {series.team2?.shortName ||
                                                  "TBD"}
                                              </Text>
                                              <Image
                                                source={{
                                                  uri:
                                                    series.team2?.logoUrl ||
                                                    "https://i.imgur.com/BIC4pnO.webp",
                                                }}
                                                style={[
                                                  styles.matchTeamLogo,
                                                  {
                                                    opacity:
                                                      seriesCompleted &&
                                                      !team2IsWinner
                                                        ? 0.5
                                                        : 1,
                                                  },
                                                ]}
                                                resizeMode="contain"
                                              />
                                            </View>
                                          </View>
                                        </TouchableOpacity>
                                      );
                                    },
                                  )}
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </View>
              )}

            {/* Results Section for Child Events */}
            {event.childEvents && event.childEvents.length > 0 && (
              <View style={styles.detailsSection}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Results
                </Text>

                {/* Child Events */}
                {event.childEvents.map((childEvent, index) => {
                  // Handle weekly tournaments as separate sections for each week
                  if (
                    childEvent.bracketJson &&
                    childEvent.bracketJson.type === "weekly" &&
                    childEvent.bracketJson.weekly &&
                    childEvent.bracketJson.weekly.weeks
                  ) {
                    return childEvent.bracketJson.weekly.weeks.map(
                      (week, weekIndex) => {
                        // Calculate week status based on match dates
                        const weekMatches = week.series || [];
                        const matchDates = weekMatches
                          .map((match) => match.startDate)
                          .filter(Boolean);

                        let weekStartDate = null;
                        let weekEndDate = null;
                        let weekStatus = "Scheduled";

                        if (matchDates.length > 0) {
                          const sortedDates = matchDates.sort(
                            (a, b) => new Date(a) - new Date(b),
                          );
                          weekStartDate = sortedDates[0];
                          weekEndDate = sortedDates[sortedDates.length - 1];
                          weekStatus = getEventStatus(
                            weekStartDate,
                            weekEndDate,
                          );
                        }

                        const weekKey = `${childEvent.id}-week-${weekIndex}`;
                        const isExpanded = expandedEvents[weekKey] || false;

                        return (
                          <View
                            key={weekKey}
                            style={[
                              styles.eventCard,
                              { backgroundColor: theme.surfaceSecondary },
                            ]}
                          >
                            {/* Week Header */}
                            <TouchableOpacity
                              style={styles.eventHeader}
                              onPress={() => {
                                setExpandedEvents((prev) => ({
                                  ...prev,
                                  [weekKey]: !prev[weekKey],
                                }));
                              }}
                            >
                              <View style={styles.eventHeaderLeft}>
                                <Text
                                  style={[
                                    styles.eventName,
                                    { color: theme.text },
                                  ]}
                                >
                                  {week.title || `Week ${weekIndex + 1}`}
                                </Text>
                                <View style={styles.eventMeta}>
                                  <View
                                    style={[
                                      styles.statusBadge,
                                      {
                                        backgroundColor:
                                          weekStatus === "Completed"
                                            ? theme.success
                                            : weekStatus === "In Progress"
                                              ? theme.error
                                              : theme.warning,
                                      },
                                    ]}
                                  >
                                    <Text style={styles.statusText}>
                                      {weekStatus}
                                    </Text>
                                  </View>
                                  <Text
                                    style={[
                                      styles.eventDates,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    {weekStartDate && weekEndDate
                                      ? formatEventDateRange(
                                          weekStartDate,
                                          weekEndDate,
                                        )
                                      : "TBD"}
                                  </Text>
                                </View>
                              </View>
                              <Ionicons
                                name={
                                  isExpanded ? "chevron-up" : "chevron-down"
                                }
                                size={20}
                                color={theme.textSecondary}
                              />
                            </TouchableOpacity>

                            {/* Week Content */}
                            {isExpanded && (
                              <View style={styles.expandedContent}>
                                {/* Week Standings */}
                                <View style={styles.groupContainer}>
                                  <Text
                                    style={[
                                      styles.groupTitle,
                                      { color: theme.text },
                                    ]}
                                  >
                                    {week.title || `Week ${weekIndex + 1}`}{" "}
                                    Results
                                  </Text>

                                  {(() => {
                                    // Get all teams from the week
                                    const weeklyTeams = [];
                                    const teamIds = new Set();

                                    if (week.series) {
                                      week.series.forEach((series) => {
                                        if (
                                          series.team1 &&
                                          !teamIds.has(series.team1.id)
                                        ) {
                                          teamIds.add(series.team1.id);
                                          weeklyTeams.push(series.team1);
                                        }
                                        if (
                                          series.team2 &&
                                          !teamIds.has(series.team2.id)
                                        ) {
                                          teamIds.add(series.team2.id);
                                          weeklyTeams.push(series.team2);
                                        }
                                      });
                                    }

                                    const baseStandings =
                                      calculateWeeklyStandings(
                                        childEvent.bracketJson.weekly.weeks,
                                        weekIndex,
                                        weeklyTeams,
                                      );
                                    const standings = calculateRankingChanges(
                                      baseStandings,
                                      childEvent.bracketJson.weekly.weeks,
                                      weekIndex,
                                      weeklyTeams,
                                    );
                                    const showMatchesKey = weekKey;

                                    return (
                                      <>
                                        {/* Standings Table */}
                                        <View
                                          style={[
                                            styles.standingsTable,
                                            { backgroundColor: theme.surface },
                                          ]}
                                        >
                                          {/* Table Header */}
                                          <View style={styles.tableHeader}>
                                            <Text
                                              style={[
                                                styles.headerText,
                                                { color: theme.textSecondary },
                                              ]}
                                            >
                                              #
                                            </Text>
                                            <Text
                                              style={[
                                                styles.headerTextTeam,
                                                { color: theme.textSecondary },
                                              ]}
                                            >
                                              Team
                                            </Text>
                                            <Text
                                              style={[
                                                styles.headerText,
                                                { color: theme.textSecondary },
                                              ]}
                                            >
                                              W
                                            </Text>
                                            <Text
                                              style={[
                                                styles.headerText,
                                                { color: theme.textSecondary },
                                              ]}
                                            >
                                              L
                                            </Text>
                                            <Text
                                              style={[
                                                styles.headerText,
                                                { color: theme.textSecondary },
                                              ]}
                                            >
                                              +/-
                                            </Text>
                                          </View>

                                          {/* Table Rows */}
                                          {standings.map((team, teamIndex) => (
                                            <View
                                              key={team.id}
                                              style={[
                                                styles.tableRow,
                                                {
                                                  borderLeftWidth:
                                                    team.qualified
                                                      ? 3
                                                      : team.nonQualified
                                                        ? 3
                                                        : 0,
                                                  borderLeftColor:
                                                    team.qualified
                                                      ? theme.success
                                                      : team.nonQualified
                                                        ? theme.error
                                                        : theme.surface,
                                                },
                                              ]}
                                            >
                                              <View style={styles.rankingCell}>
                                                {team.rankingChange && (
                                                  <View
                                                    style={
                                                      styles.rankingChangeIndicator
                                                    }
                                                  >
                                                    <Text
                                                      style={[
                                                        styles.rankingChangeTriangle,
                                                        {
                                                          color:
                                                            team.rankingChange
                                                              .direction ===
                                                            "up"
                                                              ? theme.success
                                                              : "",
                                                          fontSize: 8,
                                                        },
                                                      ]}
                                                    >
                                                      {team.rankingChange
                                                        .direction === "up"
                                                        ? "▲"
                                                        : ""}
                                                    </Text>
                                                    <Text
                                                      style={[
                                                        styles.rankingChangeNumber,
                                                        {
                                                          color:
                                                            team.rankingChange
                                                              .direction ===
                                                            "up"
                                                              ? theme.success
                                                              : theme.error,
                                                          fontSize: 10,
                                                        },
                                                      ]}
                                                    >
                                                      {
                                                        team.rankingChange
                                                          .positions
                                                      }
                                                    </Text>
                                                    <Text
                                                      style={[
                                                        styles.rankingChangeTriangle,
                                                        {
                                                          color:
                                                            team.rankingChange
                                                              .direction !==
                                                            "up"
                                                              ? theme.error
                                                              : "",
                                                          fontSize: 8,
                                                        },
                                                      ]}
                                                    >
                                                      {team.rankingChange
                                                        .direction !== "up"
                                                        ? "▼"
                                                        : ""}
                                                    </Text>
                                                  </View>
                                                )}
                                                <Text
                                                  style={[
                                                    styles.cellText,
                                                    {
                                                      color:
                                                        theme.textSecondary,
                                                    },
                                                  ]}
                                                >
                                                  {teamIndex + 1}
                                                </Text>
                                              </View>
                                              <View style={styles.teamCell}>
                                                <Image
                                                  source={{
                                                    uri:
                                                      team.logoUrl ||
                                                      "https://i.imgur.com/BIC4pnO.webp",
                                                  }}
                                                  style={styles.teamLogoSmall}
                                                  resizeMode="contain"
                                                />
                                                <Text
                                                  style={[
                                                    styles.teamNameText,
                                                    { color: theme.text },
                                                  ]}
                                                >
                                                  {team.shortName || team.name}
                                                </Text>
                                              </View>
                                              <Text
                                                style={[
                                                  styles.cellText,
                                                  { color: theme.text },
                                                ]}
                                              >
                                                {team.wins}
                                              </Text>
                                              <Text
                                                style={[
                                                  styles.cellText,
                                                  { color: theme.text },
                                                ]}
                                              >
                                                {team.losses}
                                              </Text>
                                              <Text
                                                style={[
                                                  styles.cellText,
                                                  {
                                                    color:
                                                      team.roundsWon -
                                                        team.roundsLost >
                                                      0
                                                        ? theme.success
                                                        : team.roundsWon -
                                                              team.roundsLost <
                                                            0
                                                          ? theme.error
                                                          : theme.text,
                                                  },
                                                ]}
                                              >
                                                {team.roundsWon -
                                                  team.roundsLost >
                                                0
                                                  ? "+"
                                                  : ""}
                                                {team.roundsWon -
                                                  team.roundsLost}
                                              </Text>
                                            </View>
                                          ))}
                                        </View>

                                        {/* Show/Hide Matches Button */}
                                        <TouchableOpacity
                                          style={[
                                            styles.showMatchesButton,
                                            { backgroundColor: theme.surface },
                                          ]}
                                          onPress={() =>
                                            setShowMatches((prev) => ({
                                              ...prev,
                                              [showMatchesKey]:
                                                !prev[showMatchesKey],
                                            }))
                                          }
                                        >
                                          <Text
                                            style={[
                                              styles.showMatchesText,
                                              { color: colors.primary },
                                            ]}
                                          >
                                            {showMatches[showMatchesKey]
                                              ? "Hide Matches"
                                              : "Show Matches"}{" "}
                                            (
                                            {week.series
                                              ? week.series.length
                                              : 0}
                                            )
                                          </Text>
                                        </TouchableOpacity>

                                        {/* Weekly Matches List */}
                                        {showMatches[showMatchesKey] &&
                                          week.series && (
                                            <View style={styles.matchesList}>
                                              {week.series.map(
                                                (series, seriesIndex) => {
                                                  const team1IsWinner =
                                                    series.team1Score >
                                                    series.team2Score;
                                                  const team2IsWinner =
                                                    series.team2Score >
                                                    series.team1Score;
                                                  const seriesCompleted =
                                                    series.completed &&
                                                    (series.team1Score > 0 ||
                                                      series.team2Score > 0);

                                                  return (
                                                    <TouchableOpacity
                                                      key={seriesIndex}
                                                      style={[
                                                        styles.matchCard,
                                                        {
                                                          backgroundColor:
                                                            theme.surface,
                                                        },
                                                      ]}
                                                      onPress={() => {
                                                        navigation.navigate(
                                                          "VALSeries",
                                                          {
                                                            seriesId:
                                                              series.id ||
                                                              series.seriesId,
                                                          },
                                                        );
                                                      }}
                                                      activeOpacity={0.7}
                                                    >
                                                      <View
                                                        style={
                                                          styles.matchHeader
                                                        }
                                                      >
                                                        <Text
                                                          style={[
                                                            styles.matchDate,
                                                            {
                                                              color:
                                                                theme.textSecondary,
                                                            },
                                                          ]}
                                                        >
                                                          {series.startDate
                                                            ? new Date(
                                                                series.startDate,
                                                              )
                                                                .toLocaleDateString(
                                                                  "en-US",
                                                                  {
                                                                    month:
                                                                      "short",
                                                                    day: "numeric",
                                                                  },
                                                                )
                                                                .replace(
                                                                  ",",
                                                                  "",
                                                                )
                                                            : "TBD"}
                                                        </Text>
                                                        <Text
                                                          style={[
                                                            styles.matchTime,
                                                            {
                                                              color:
                                                                theme.textSecondary,
                                                            },
                                                          ]}
                                                        >
                                                          {series.startDate
                                                            ? new Date(
                                                                series.startDate,
                                                              ).toLocaleTimeString(
                                                                [],
                                                                {
                                                                  hour: "2-digit",
                                                                  minute:
                                                                    "2-digit",
                                                                },
                                                              )
                                                            : ""}
                                                        </Text>
                                                      </View>
                                                      <View
                                                        style={
                                                          styles.matchTeams
                                                        }
                                                      >
                                                        <View
                                                          style={
                                                            styles.matchTeam
                                                          }
                                                        >
                                                          <Image
                                                            source={{
                                                              uri:
                                                                series.team1
                                                                  ?.logoUrl ||
                                                                "https://i.imgur.com/BIC4pnO.webp",
                                                            }}
                                                            style={[
                                                              styles.matchTeamLogo,
                                                              {
                                                                opacity:
                                                                  seriesCompleted &&
                                                                  !team1IsWinner
                                                                    ? 0.5
                                                                    : 1,
                                                              },
                                                            ]}
                                                            resizeMode="contain"
                                                          />
                                                          <Text
                                                            style={[
                                                              styles.matchTeamName,
                                                              {
                                                                color:
                                                                  theme.text,
                                                                opacity:
                                                                  seriesCompleted &&
                                                                  !team1IsWinner
                                                                    ? 0.6
                                                                    : 1,
                                                              },
                                                            ]}
                                                          >
                                                            {series.team1
                                                              ?.shortName ||
                                                              "TBD"}
                                                          </Text>
                                                          <Text
                                                            style={[
                                                              styles.matchScore,
                                                              {
                                                                color:
                                                                  theme.text,
                                                                opacity:
                                                                  seriesCompleted &&
                                                                  !team1IsWinner
                                                                    ? 0.6
                                                                    : 1,
                                                              },
                                                            ]}
                                                          >
                                                            {series.team1Score ||
                                                              0}
                                                          </Text>
                                                        </View>
                                                        <Text
                                                          style={[
                                                            styles.matchVs,
                                                            {
                                                              color:
                                                                theme.textSecondary,
                                                            },
                                                          ]}
                                                        >
                                                          vs
                                                        </Text>
                                                        <View
                                                          style={
                                                            styles.matchTeam
                                                          }
                                                        >
                                                          <Text
                                                            style={[
                                                              styles.matchScore,
                                                              {
                                                                color:
                                                                  theme.text,
                                                                opacity:
                                                                  seriesCompleted &&
                                                                  !team2IsWinner
                                                                    ? 0.6
                                                                    : 1,
                                                              },
                                                            ]}
                                                          >
                                                            {series.team2Score ||
                                                              0}
                                                          </Text>
                                                          <Text
                                                            style={[
                                                              styles.matchTeamName,
                                                              {
                                                                color:
                                                                  theme.text,
                                                                opacity:
                                                                  seriesCompleted &&
                                                                  !team2IsWinner
                                                                    ? 0.6
                                                                    : 1,
                                                              },
                                                            ]}
                                                          >
                                                            {series.team2
                                                              ?.shortName ||
                                                              "TBD"}
                                                          </Text>
                                                          <Image
                                                            source={{
                                                              uri:
                                                                series.team2
                                                                  ?.logoUrl ||
                                                                "https://i.imgur.com/BIC4pnO.webp",
                                                            }}
                                                            style={[
                                                              styles.matchTeamLogo,
                                                              {
                                                                opacity:
                                                                  seriesCompleted &&
                                                                  !team2IsWinner
                                                                    ? 0.5
                                                                    : 1,
                                                              },
                                                            ]}
                                                            resizeMode="contain"
                                                          />
                                                        </View>
                                                      </View>
                                                    </TouchableOpacity>
                                                  );
                                                },
                                              )}
                                            </View>
                                          )}
                                      </>
                                    );
                                  })()}
                                </View>
                              </View>
                            )}
                          </View>
                        );
                      },
                    );
                  }

                  // Handle non-weekly tournaments (existing logic)
                  const status = getEventStatus(
                    childEvent.startDate,
                    childEvent.endDate,
                  );
                  const isExpanded = expandedEvents[childEvent.id] || false;

                  return (
                    <View
                      key={childEvent.id}
                      style={[
                        styles.eventCard,
                        { backgroundColor: theme.surfaceSecondary },
                      ]}
                    >
                      {/* Event Header */}
                      <TouchableOpacity
                        style={styles.eventHeader}
                        onPress={() => {
                          const isCurrentlyExpanded =
                            expandedEvents[childEvent.id];
                          setExpandedEvents((prev) => ({
                            ...prev,
                            [childEvent.id]: !prev[childEvent.id],
                          }));

                          // Auto-select first group when expanding
                          if (
                            !isCurrentlyExpanded &&
                            childEvent.bracketJson &&
                            childEvent.bracketJson.groups
                          ) {
                            setActiveGroups((prev) => ({
                              ...prev,
                              [`${childEvent.id}-0`]: true,
                            }));
                          }
                        }}
                      >
                        <View style={styles.eventHeaderLeft}>
                          <Text
                            style={[styles.eventName, { color: theme.text }]}
                          >
                            {childEvent.shortName || childEvent.name}
                          </Text>
                          <View style={styles.eventMeta}>
                            <View
                              style={[
                                styles.statusBadge,
                                {
                                  backgroundColor:
                                    status === "Completed"
                                      ? theme.success
                                      : status === "In Progress"
                                        ? theme.error
                                        : theme.warning,
                                },
                              ]}
                            >
                              <Text style={styles.statusText}>{status}</Text>
                            </View>
                            <Text
                              style={[
                                styles.eventDates,
                                { color: theme.textSecondary },
                              ]}
                            >
                              {childEvent.startDate && childEvent.endDate
                                ? formatEventDateRange(
                                    childEvent.startDate,
                                    childEvent.endDate,
                                  )
                                : "TBD"}
                            </Text>
                          </View>
                        </View>
                        <Ionicons
                          name={isExpanded ? "chevron-up" : "chevron-down"}
                          size={20}
                          color={theme.textSecondary}
                        />
                      </TouchableOpacity>

                      {/* Expanded Content */}
                      {isExpanded && childEvent.bracketJson && (
                        <View style={styles.expandedContent}>
                          {/* Group Buttons - Only show for group type */}
                          {childEvent.bracketJson.type === "group" &&
                            childEvent.bracketJson.groups && (
                              <View style={styles.groupButtonsContainer}>
                                {childEvent.bracketJson.groups.map(
                                  (group, groupIndex) => (
                                    <TouchableOpacity
                                      key={groupIndex}
                                      style={[
                                        styles.groupButton,
                                        {
                                          backgroundColor: activeGroups[
                                            `${childEvent.id}-${groupIndex}`
                                          ]
                                            ? colors.primary
                                            : theme.surface,
                                          borderColor: colors.primary,
                                        },
                                      ]}
                                      onPress={() =>
                                        setActiveGroups((prev) => {
                                          const newState = { ...prev };
                                          // First, deactivate all groups for this event
                                          childEvent.bracketJson.groups.forEach(
                                            (_, idx) => {
                                              newState[
                                                `${childEvent.id}-${idx}`
                                              ] = false;
                                            },
                                          );
                                          // Then activate only the clicked group
                                          newState[
                                            `${childEvent.id}-${groupIndex}`
                                          ] = true;
                                          return newState;
                                        })
                                      }
                                    >
                                      <Text
                                        style={[
                                          styles.groupButtonText,
                                          {
                                            color: activeGroups[
                                              `${childEvent.id}-${groupIndex}`
                                            ]
                                              ? "white"
                                              : colors.primary,
                                          },
                                        ]}
                                      >
                                        {group.title ||
                                          `Group ${String.fromCharCode(
                                            65 + groupIndex,
                                          )}`}
                                      </Text>
                                    </TouchableOpacity>
                                  ),
                                )}
                              </View>
                            )}

                          {/* Group Standings - Only show for group type */}
                          {childEvent.bracketJson.type === "group" &&
                            childEvent.bracketJson.groups &&
                            childEvent.bracketJson.groups.map(
                              (group, groupIndex) => {
                                const isGroupActive =
                                  activeGroups[
                                    `${childEvent.id}-${groupIndex}`
                                  ];
                                if (!isGroupActive) return null;

                                const standings =
                                  calculateGroupStandings(group);
                                const showMatchesKey = `${childEvent.id}-${groupIndex}`;

                                return (
                                  <View
                                    key={groupIndex}
                                    style={styles.groupContainer}
                                  >
                                    <Text
                                      style={[
                                        styles.groupTitle,
                                        { color: theme.text },
                                      ]}
                                    >
                                      {group.title ||
                                        `Group ${String.fromCharCode(
                                          65 + groupIndex,
                                        )}`}{" "}
                                      Standings
                                    </Text>

                                    {/* Standings Table */}
                                    <View
                                      style={[
                                        styles.standingsTable,
                                        { backgroundColor: theme.surface },
                                      ]}
                                    >
                                      {/* Table Header */}
                                      <View style={styles.tableHeader}>
                                        <Text
                                          style={[
                                            styles.headerText,
                                            { color: theme.textSecondary },
                                          ]}
                                        >
                                          #
                                        </Text>
                                        <Text
                                          style={[
                                            styles.headerTextTeam,
                                            { color: theme.textSecondary },
                                          ]}
                                        >
                                          Team
                                        </Text>
                                        <Text
                                          style={[
                                            styles.headerText,
                                            { color: theme.textSecondary },
                                          ]}
                                        >
                                          W
                                        </Text>
                                        <Text
                                          style={[
                                            styles.headerText,
                                            { color: theme.textSecondary },
                                          ]}
                                        >
                                          L
                                        </Text>
                                        <Text
                                          style={[
                                            styles.headerText,
                                            { color: theme.textSecondary },
                                          ]}
                                        >
                                          +/-
                                        </Text>
                                      </View>

                                      {/* Table Rows */}
                                      {standings.map((team, teamIndex) => (
                                        <View
                                          key={team.id}
                                          style={[
                                            styles.tableRow,
                                            {
                                              borderLeftWidth: team.qualified
                                                ? 3
                                                : team.nonQualified
                                                  ? 3
                                                  : 0,
                                              borderLeftColor: team.qualified
                                                ? theme.success
                                                : team.nonQualified
                                                  ? theme.error
                                                  : theme.surface,
                                            },
                                          ]}
                                        >
                                          <Text
                                            style={[
                                              styles.cellText,
                                              { color: theme.textSecondary },
                                            ]}
                                          >
                                            {teamIndex + 1}
                                          </Text>
                                          <View style={styles.teamCell}>
                                            <Image
                                              source={{
                                                uri:
                                                  team.logoUrl ||
                                                  "https://i.imgur.com/BIC4pnO.webp",
                                              }}
                                              style={styles.teamLogoSmall}
                                              resizeMode="contain"
                                            />
                                            <Text
                                              style={[
                                                styles.teamNameText,
                                                { color: theme.text },
                                              ]}
                                            >
                                              {team.shortName || team.name}
                                            </Text>
                                          </View>
                                          <Text
                                            style={[
                                              styles.cellText,
                                              { color: theme.text },
                                            ]}
                                          >
                                            {team.wins}
                                          </Text>
                                          <Text
                                            style={[
                                              styles.cellText,
                                              { color: theme.text },
                                            ]}
                                          >
                                            {team.losses}
                                          </Text>
                                          <Text
                                            style={[
                                              styles.cellText,
                                              {
                                                color:
                                                  team.roundsWon -
                                                    team.roundsLost >
                                                  0
                                                    ? theme.success
                                                    : team.roundsWon -
                                                          team.roundsLost <
                                                        0
                                                      ? theme.error
                                                      : theme.text,
                                              },
                                            ]}
                                          >
                                            {team.roundsWon - team.roundsLost >
                                            0
                                              ? "+"
                                              : ""}
                                            {team.roundsWon - team.roundsLost}
                                          </Text>
                                        </View>
                                      ))}
                                    </View>

                                    {/* Show/Hide Matches Button */}
                                    <TouchableOpacity
                                      style={[
                                        styles.showMatchesButton,
                                        { backgroundColor: theme.surface },
                                      ]}
                                      onPress={() =>
                                        setShowMatches((prev) => ({
                                          ...prev,
                                          [showMatchesKey]:
                                            !prev[showMatchesKey],
                                        }))
                                      }
                                    >
                                      <Text
                                        style={[
                                          styles.showMatchesText,
                                          { color: colors.primary },
                                        ]}
                                      >
                                        {showMatches[showMatchesKey]
                                          ? "Hide Matches"
                                          : "Show Matches"}{" "}
                                        ({extractSeriesFromGroup(group).length})
                                      </Text>
                                    </TouchableOpacity>

                                    {/* Series List */}
                                    {showMatches[showMatchesKey] && (
                                      <View style={styles.matchesList}>
                                        {extractSeriesFromGroup(group).map(
                                          (series, seriesIndex) => {
                                            const team1IsWinner =
                                              series.team1Score >
                                              series.team2Score;
                                            const team2IsWinner =
                                              series.team2Score >
                                              series.team1Score;
                                            const seriesCompleted =
                                              series.completed &&
                                              (series.team1Score > 0 ||
                                                series.team2Score > 0);

                                            return (
                                              <TouchableOpacity
                                                key={seriesIndex}
                                                style={[
                                                  styles.matchCard,
                                                  {
                                                    backgroundColor:
                                                      theme.surface,
                                                  },
                                                ]}
                                                onPress={() => {
                                                  navigation.navigate(
                                                    "VALSeries",
                                                    {
                                                      seriesId: series.id,
                                                    },
                                                  );
                                                }}
                                                activeOpacity={0.7}
                                              >
                                                <View
                                                  style={styles.matchHeader}
                                                >
                                                  <Text
                                                    style={[
                                                      styles.matchDate,
                                                      {
                                                        color:
                                                          theme.textSecondary,
                                                      },
                                                    ]}
                                                  >
                                                    {series.startDate
                                                      ? new Date(
                                                          series.startDate,
                                                        )
                                                          .toLocaleDateString(
                                                            "en-US",
                                                            {
                                                              month: "short",
                                                              day: "numeric",
                                                            },
                                                          )
                                                          .replace(",", "")
                                                      : "TBD"}
                                                  </Text>
                                                  <Text
                                                    style={[
                                                      styles.matchTime,
                                                      {
                                                        color:
                                                          theme.textSecondary,
                                                      },
                                                    ]}
                                                  >
                                                    {series.startDate
                                                      ? new Date(
                                                          series.startDate,
                                                        ).toLocaleTimeString(
                                                          [],
                                                          {
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                          },
                                                        )
                                                      : ""}
                                                  </Text>
                                                </View>
                                                <View style={styles.matchTeams}>
                                                  <View
                                                    style={styles.matchTeam}
                                                  >
                                                    <Image
                                                      source={{
                                                        uri:
                                                          series.team1
                                                            ?.logoUrl ||
                                                          "https://i.imgur.com/BIC4pnO.webp",
                                                      }}
                                                      style={[
                                                        styles.matchTeamLogo,
                                                        {
                                                          opacity:
                                                            seriesCompleted &&
                                                            !team1IsWinner
                                                              ? 0.5
                                                              : 1,
                                                        },
                                                      ]}
                                                      resizeMode="contain"
                                                    />
                                                    <Text
                                                      style={[
                                                        styles.matchTeamName,
                                                        {
                                                          color: theme.text,
                                                          opacity:
                                                            seriesCompleted &&
                                                            !team1IsWinner
                                                              ? 0.6
                                                              : 1,
                                                        },
                                                      ]}
                                                    >
                                                      {series.team1
                                                        ?.shortName || "TBD"}
                                                    </Text>
                                                    <Text
                                                      style={[
                                                        styles.matchScore,
                                                        {
                                                          color: theme.text,
                                                          opacity:
                                                            seriesCompleted &&
                                                            !team1IsWinner
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
                                                      styles.matchVs,
                                                      {
                                                        color:
                                                          theme.textSecondary,
                                                      },
                                                    ]}
                                                  >
                                                    vs
                                                  </Text>
                                                  <View
                                                    style={styles.matchTeam}
                                                  >
                                                    <Text
                                                      style={[
                                                        styles.matchScore,
                                                        {
                                                          color: theme.text,
                                                          opacity:
                                                            seriesCompleted &&
                                                            !team2IsWinner
                                                              ? 0.6
                                                              : 1,
                                                        },
                                                      ]}
                                                    >
                                                      {series.team2Score || 0}
                                                    </Text>
                                                    <Text
                                                      style={[
                                                        styles.matchTeamName,
                                                        {
                                                          color: theme.text,
                                                          opacity:
                                                            seriesCompleted &&
                                                            !team2IsWinner
                                                              ? 0.6
                                                              : 1,
                                                        },
                                                      ]}
                                                    >
                                                      {series.team2
                                                        ?.shortName || "TBD"}
                                                    </Text>
                                                    <Image
                                                      source={{
                                                        uri:
                                                          series.team2
                                                            ?.logoUrl ||
                                                          "https://i.imgur.com/BIC4pnO.webp",
                                                      }}
                                                      style={[
                                                        styles.matchTeamLogo,
                                                        {
                                                          opacity:
                                                            seriesCompleted &&
                                                            !team2IsWinner
                                                              ? 0.5
                                                              : 1,
                                                        },
                                                      ]}
                                                      resizeMode="contain"
                                                    />
                                                  </View>
                                                </View>
                                              </TouchableOpacity>
                                            );
                                          },
                                        )}
                                      </View>
                                    )}
                                  </View>
                                );
                              },
                            )}

                          {/* Playoff Bracket Content */}
                          {(childEvent.bracketJson.type === "double" ||
                            childEvent.bracketJson.type === "single" ||
                            childEvent.bracketJson.type === "triple") && (
                            <View style={styles.playoffContainer}>
                              <View
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.bracketScrollView}
                                contentContainerStyle={styles.bracketContainer}
                              >
                                {(() => {
                                  const BOX_HEIGHT = 100;
                                  const BOX_MARGIN = 20;

                                  function computeBracketPositions(rounds) {
                                    if (!rounds?.length)
                                      return { positions: [], maxHeight: 200 };

                                    const positions = [];
                                    let maxHeight = 0;

                                    rounds.forEach((round, roundIndex) => {
                                      const currentMatchCount =
                                        round.seeds?.length || 0;

                                      if (currentMatchCount === 0) {
                                        positions.push([]);
                                        return;
                                      }

                                      let spacing, yOffset;

                                      // Use the same logic for both upper and lower brackets for consistency
                                      const prevMatchCount =
                                        roundIndex > 0
                                          ? rounds[roundIndex - 1]?.seeds
                                              ?.length || 0
                                          : 0;
                                      const sameAsPrevious =
                                        prevMatchCount === currentMatchCount &&
                                        roundIndex > 0;

                                      if (sameAsPrevious) {
                                        // Same number of matches as previous round - align horizontally
                                        spacing =
                                          positions[roundIndex - 1].length >= 2
                                            ? positions[roundIndex - 1][1].top -
                                              positions[roundIndex - 1][0].top
                                            : (BOX_HEIGHT + BOX_MARGIN) *
                                              Math.pow(2, roundIndex - 1);
                                        yOffset =
                                          positions[roundIndex - 1][0]?.top ||
                                          spacing / 2;
                                      } else if (
                                        roundIndex > 0 &&
                                        prevMatchCount > currentMatchCount &&
                                        positions[roundIndex - 1].length > 0
                                      ) {
                                        // Fewer matches than previous round - center between previous matches
                                        const prevPositions =
                                          positions[roundIndex - 1];
                                        if (prevPositions.length >= 2) {
                                          // Calculate spacing to center current matches between previous ones
                                          const prevSpacing =
                                            prevPositions[1].top -
                                            prevPositions[0].top;
                                          const matchesPerGroup =
                                            prevMatchCount / currentMatchCount;
                                          spacing =
                                            prevSpacing * matchesPerGroup;
                                          // Center the first match between appropriate previous matches
                                          yOffset =
                                            prevPositions[0].top +
                                            (prevSpacing *
                                              (matchesPerGroup - 1)) /
                                              2;
                                        } else {
                                          // Single previous match case
                                          spacing =
                                            (BOX_HEIGHT + BOX_MARGIN) *
                                            Math.pow(2, roundIndex);
                                          yOffset = prevPositions[0].top;
                                        }
                                      } else {
                                        // First round or more matches than previous - use standard spacing
                                        spacing =
                                          (BOX_HEIGHT + BOX_MARGIN) *
                                          Math.pow(2, roundIndex);
                                        yOffset = spacing / 2;
                                      }

                                      const roundPositions = round.seeds.map(
                                        (_, matchIndex) => ({
                                          top: yOffset + matchIndex * spacing,
                                          left: 15,
                                        }),
                                      );

                                      positions.push(roundPositions);

                                      // Calculate the maximum height needed for this round
                                      if (roundPositions.length > 0) {
                                        const lastMatchTop =
                                          roundPositions[
                                            roundPositions.length - 1
                                          ].top;
                                        const roundMaxHeight =
                                          lastMatchTop +
                                          BOX_HEIGHT +
                                          BOX_MARGIN;
                                        maxHeight = Math.max(
                                          maxHeight,
                                          roundMaxHeight,
                                        );
                                      }
                                    });

                                    return { positions, maxHeight };
                                  }

                                  const winnerBracket = computeBracketPositions(
                                    childEvent.bracketJson.winners || [],
                                  );
                                  const middleBracket = computeBracketPositions(
                                    childEvent.bracketJson.middle || [],
                                  );
                                  const loserBracket = computeBracketPositions(
                                    childEvent.bracketJson.losers || [],
                                  );

                                  const winnerPositions =
                                    winnerBracket.positions;
                                  const middlePositions =
                                    middleBracket.positions;
                                  const loserPositions = loserBracket.positions;

                                  return (
                                    <>
                                      {/* Upper Bracket */}
                                      {childEvent.bracketJson.winners && (
                                        <View style={styles.bracketSection}>
                                          <ScrollView
                                            horizontal={true}
                                            nestedScrollEnabled={true}
                                            showsHorizontalScrollIndicator={
                                              false
                                            }
                                            style={{
                                              position: "relative",
                                              height: Math.min(
                                                winnerBracket.maxHeight,
                                                WINDOW_HEIGHT * 0.7,
                                              ),
                                            }}
                                            contentContainerStyle={{
                                              flexDirection: "row",
                                              alignItems: "flex-start",
                                              paddingRight: 20,
                                            }}
                                          >
                                            {childEvent.bracketJson.winners.map(
                                              (round, roundIndex) => (
                                                <View
                                                  key={roundIndex}
                                                  style={styles.bracketRound}
                                                >
                                                  <Text
                                                    style={[
                                                      styles.roundTitle,
                                                      {
                                                        color:
                                                          theme.textSecondary,
                                                      },
                                                    ]}
                                                  >
                                                    {round.title}
                                                  </Text>

                                                  {round.seeds &&
                                                    round.seeds.map(
                                                      (match, matchIndex) => {
                                                        const pos =
                                                          winnerPositions[
                                                            roundIndex
                                                          ]?.[matchIndex] || {
                                                            top: 0,
                                                            left: 0,
                                                          };

                                                        return (
                                                          <TouchableOpacity
                                                            key={matchIndex}
                                                            style={[
                                                              styles.bracketMatch,
                                                              {
                                                                position:
                                                                  "absolute",
                                                                top: pos.top,
                                                                left: pos.left,
                                                                backgroundColor:
                                                                  theme.surface,
                                                              },
                                                            ]}
                                                            onPress={() => {
                                                              if (
                                                                match.teams &&
                                                                match.teams
                                                                  .length >= 2
                                                              ) {
                                                                navigation.navigate(
                                                                  "VALSeries",
                                                                  {
                                                                    seriesId:
                                                                      match.seriesId ||
                                                                      match.id,
                                                                  },
                                                                );
                                                              }
                                                            }}
                                                            activeOpacity={0.7}
                                                          >
                                                            <Text
                                                              style={[
                                                                styles.matchDate,
                                                                {
                                                                  color:
                                                                    theme.textSecondary,
                                                                },
                                                              ]}
                                                            >
                                                              {match.startDate
                                                                ? `${new Date(
                                                                    match.startDate,
                                                                  ).toLocaleDateString(
                                                                    "en-US",
                                                                    {
                                                                      month:
                                                                        "short",
                                                                      day: "numeric",
                                                                    },
                                                                  )} • ${new Date(
                                                                    match.startDate,
                                                                  ).toLocaleTimeString(
                                                                    "en-US",
                                                                    {
                                                                      hour: "numeric",
                                                                      minute:
                                                                        "2-digit",
                                                                      hour12: true,
                                                                    },
                                                                  )}`
                                                                : "TBD"}
                                                            </Text>

                                                            {match.teams &&
                                                              match.teams.map(
                                                                (
                                                                  team,
                                                                  teamIndex,
                                                                ) => {
                                                                  const isWinner =
                                                                    match.completed &&
                                                                    team.score >
                                                                      (match
                                                                        .teams[
                                                                        1 -
                                                                          teamIndex
                                                                      ]
                                                                        ?.score ||
                                                                        0);
                                                                  const isLoser =
                                                                    match.completed &&
                                                                    team.score <
                                                                      (match
                                                                        .teams[
                                                                        1 -
                                                                          teamIndex
                                                                      ]
                                                                        ?.score ||
                                                                        0);

                                                                  return (
                                                                    <View
                                                                      key={
                                                                        teamIndex
                                                                      }
                                                                      style={[
                                                                        styles.bracketTeam,
                                                                        isWinner &&
                                                                          styles.winnerTeam,
                                                                        isLoser &&
                                                                          styles.loserTeam,
                                                                      ]}
                                                                    >
                                                                      <Image
                                                                        source={{
                                                                          uri:
                                                                            team.logoUrl ||
                                                                            "https://i.imgur.com/BIC4pnO.webp",
                                                                        }}
                                                                        style={[
                                                                          styles.bracketTeamLogo,
                                                                          {
                                                                            opacity:
                                                                              isLoser
                                                                                ? 0.5
                                                                                : 1,
                                                                          },
                                                                        ]}
                                                                        resizeMode="contain"
                                                                      />
                                                                      <Text
                                                                        style={[
                                                                          styles.bracketTeamName,
                                                                          {
                                                                            color:
                                                                              theme.text,
                                                                            opacity:
                                                                              isLoser
                                                                                ? 0.6
                                                                                : 1,
                                                                          },
                                                                        ]}
                                                                        numberOfLines={
                                                                          1
                                                                        }
                                                                        ellipsizeMode="tail"
                                                                      >
                                                                        {team.shortName ||
                                                                          team.name ||
                                                                          "TBD"}
                                                                      </Text>
                                                                      <Text
                                                                        style={[
                                                                          styles.bracketTeamScore,
                                                                          {
                                                                            color:
                                                                              theme.text,
                                                                            opacity:
                                                                              isLoser
                                                                                ? 0.6
                                                                                : 1,
                                                                          },
                                                                        ]}
                                                                      >
                                                                        {team.score ||
                                                                          0}
                                                                      </Text>
                                                                    </View>
                                                                  );
                                                                },
                                                              )}
                                                          </TouchableOpacity>
                                                        );
                                                      },
                                                    )}
                                                </View>
                                              ),
                                            )}
                                          </ScrollView>
                                        </View>
                                      )}

                                      {/* Middle Bracket */}
                                      {childEvent.bracketJson.type ===
                                        "triple" &&
                                        childEvent.bracketJson.middle && (
                                          <View style={styles.bracketSection}>
                                            <ScrollView
                                              horizontal={true}
                                              nestedScrollEnabled={true}
                                              showsHorizontalScrollIndicator={
                                                false
                                              }
                                              style={{
                                                position: "relative",
                                                height: Math.min(
                                                  middleBracket.maxHeight,
                                                  WINDOW_HEIGHT * 0.7,
                                                ),
                                              }}
                                              contentContainerStyle={{
                                                flexDirection: "row",
                                                alignItems: "flex-start",
                                                paddingRight: 20,
                                              }}
                                            >
                                              {childEvent.bracketJson.middle.map(
                                                (round, roundIndex) => (
                                                  <View
                                                    key={roundIndex}
                                                    style={styles.bracketRound}
                                                  >
                                                    <Text
                                                      style={[
                                                        styles.roundTitle,
                                                        {
                                                          color:
                                                            theme.textSecondary,
                                                        },
                                                      ]}
                                                    >
                                                      {round.title}
                                                    </Text>

                                                    {round.seeds &&
                                                      round.seeds.map(
                                                        (match, matchIndex) => {
                                                          const pos =
                                                            middlePositions[
                                                              roundIndex
                                                            ]?.[matchIndex] || {
                                                              top: 0,
                                                              left: 0,
                                                            };

                                                          return (
                                                            <TouchableOpacity
                                                              key={matchIndex}
                                                              style={[
                                                                styles.bracketMatch,
                                                                {
                                                                  position:
                                                                    "absolute",
                                                                  top: pos.top,
                                                                  left: pos.left,
                                                                  backgroundColor:
                                                                    theme.surface,
                                                                },
                                                              ]}
                                                              onPress={() => {
                                                                if (
                                                                  match.teams &&
                                                                  match.teams
                                                                    .length >= 2
                                                                ) {
                                                                  navigation.navigate(
                                                                    "VALSeries",
                                                                    {
                                                                      seriesId:
                                                                        match.seriesId ||
                                                                        match.id,
                                                                    },
                                                                  );
                                                                }
                                                              }}
                                                              activeOpacity={
                                                                0.7
                                                              }
                                                            >
                                                              <Text
                                                                style={[
                                                                  styles.matchDate,
                                                                  {
                                                                    color:
                                                                      theme.textSecondary,
                                                                  },
                                                                ]}
                                                              >
                                                                {match.startDate
                                                                  ? `${new Date(
                                                                      match.startDate,
                                                                    ).toLocaleDateString(
                                                                      "en-US",
                                                                      {
                                                                        month:
                                                                          "short",
                                                                        day: "numeric",
                                                                      },
                                                                    )} • ${new Date(
                                                                      match.startDate,
                                                                    ).toLocaleTimeString(
                                                                      "en-US",
                                                                      {
                                                                        hour: "numeric",
                                                                        minute:
                                                                          "2-digit",
                                                                        hour12: true,
                                                                      },
                                                                    )}`
                                                                  : "TBD"}
                                                              </Text>

                                                              {match.teams &&
                                                                match.teams.map(
                                                                  (
                                                                    team,
                                                                    teamIndex,
                                                                  ) => {
                                                                    const isWinner =
                                                                      match.completed &&
                                                                      team.score >
                                                                        (match
                                                                          .teams[
                                                                          1 -
                                                                            teamIndex
                                                                        ]
                                                                          ?.score ||
                                                                          0);
                                                                    const isLoser =
                                                                      match.completed &&
                                                                      team.score <
                                                                        (match
                                                                          .teams[
                                                                          1 -
                                                                            teamIndex
                                                                        ]
                                                                          ?.score ||
                                                                          0);

                                                                    return (
                                                                      <View
                                                                        key={
                                                                          teamIndex
                                                                        }
                                                                        style={[
                                                                          styles.bracketTeam,
                                                                          isWinner &&
                                                                            styles.winnerTeam,
                                                                          isLoser &&
                                                                            styles.loserTeam,
                                                                        ]}
                                                                      >
                                                                        <Image
                                                                          source={{
                                                                            uri:
                                                                              team.logoUrl ||
                                                                              "https://i.imgur.com/BIC4pnO.webp",
                                                                          }}
                                                                          style={[
                                                                            styles.bracketTeamLogo,
                                                                            {
                                                                              opacity:
                                                                                isLoser
                                                                                  ? 0.5
                                                                                  : 1,
                                                                            },
                                                                          ]}
                                                                          resizeMode="contain"
                                                                        />
                                                                        <Text
                                                                          style={[
                                                                            styles.bracketTeamName,
                                                                            {
                                                                              color:
                                                                                theme.text,
                                                                              opacity:
                                                                                isLoser
                                                                                  ? 0.6
                                                                                  : 1,
                                                                            },
                                                                          ]}
                                                                          numberOfLines={
                                                                            1
                                                                          }
                                                                          ellipsizeMode="tail"
                                                                        >
                                                                          {team.shortName ||
                                                                            team.name ||
                                                                            "TBD"}
                                                                        </Text>
                                                                        <Text
                                                                          style={[
                                                                            styles.bracketTeamScore,
                                                                            {
                                                                              color:
                                                                                theme.text,
                                                                              opacity:
                                                                                isLoser
                                                                                  ? 0.6
                                                                                  : 1,
                                                                            },
                                                                          ]}
                                                                        >
                                                                          {team.score ||
                                                                            0}
                                                                        </Text>
                                                                      </View>
                                                                    );
                                                                  },
                                                                )}
                                                            </TouchableOpacity>
                                                          );
                                                        },
                                                      )}
                                                  </View>
                                                ),
                                              )}
                                            </ScrollView>
                                          </View>
                                        )}

                                      {/* Lower Bracket */}
                                      {(childEvent.bracketJson.type ===
                                        "double" ||
                                        childEvent.bracketJson.type ===
                                          "triple") &&
                                        childEvent.bracketJson.losers && (
                                          <View style={styles.bracketSection}>
                                            <ScrollView
                                              horizontal={true}
                                              nestedScrollEnabled={true}
                                              showsHorizontalScrollIndicator={
                                                false
                                              }
                                              style={{
                                                position: "relative",
                                                height: Math.min(
                                                  loserBracket.maxHeight,
                                                  WINDOW_HEIGHT * 0.7,
                                                ),
                                              }}
                                              contentContainerStyle={{
                                                flexDirection: "row",
                                                alignItems: "flex-start",
                                                paddingRight: 20,
                                              }}
                                            >
                                              {childEvent.bracketJson.losers.map(
                                                (round, roundIndex) => (
                                                  <View
                                                    key={roundIndex}
                                                    style={styles.bracketRound}
                                                  >
                                                    <Text
                                                      style={[
                                                        styles.roundTitle,
                                                        {
                                                          color:
                                                            theme.textSecondary,
                                                        },
                                                      ]}
                                                    >
                                                      {round.title}
                                                    </Text>

                                                    {round.seeds &&
                                                      round.seeds.map(
                                                        (match, matchIndex) => {
                                                          const pos =
                                                            loserPositions[
                                                              roundIndex
                                                            ]?.[matchIndex] || {
                                                              top: 0,
                                                              left: 0,
                                                            };

                                                          return (
                                                            <TouchableOpacity
                                                              key={matchIndex}
                                                              style={[
                                                                styles.bracketMatch,
                                                                {
                                                                  position:
                                                                    "absolute",
                                                                  top: pos.top,
                                                                  left: pos.left,
                                                                  backgroundColor:
                                                                    theme.surface,
                                                                },
                                                              ]}
                                                              onPress={() => {
                                                                if (
                                                                  match.teams &&
                                                                  match.teams
                                                                    .length >= 2
                                                                ) {
                                                                  navigation.navigate(
                                                                    "VALSeries",
                                                                    {
                                                                      seriesId:
                                                                        match.seriesId ||
                                                                        match.id,
                                                                    },
                                                                  );
                                                                }
                                                              }}
                                                              activeOpacity={
                                                                0.7
                                                              }
                                                            >
                                                              <Text
                                                                style={[
                                                                  styles.matchDate,
                                                                  {
                                                                    color:
                                                                      theme.textSecondary,
                                                                  },
                                                                ]}
                                                              >
                                                                {match.startDate
                                                                  ? `${new Date(
                                                                      match.startDate,
                                                                    ).toLocaleDateString(
                                                                      "en-US",
                                                                      {
                                                                        month:
                                                                          "short",
                                                                        day: "numeric",
                                                                      },
                                                                    )} • ${new Date(
                                                                      match.startDate,
                                                                    ).toLocaleTimeString(
                                                                      "en-US",
                                                                      {
                                                                        hour: "numeric",
                                                                        minute:
                                                                          "2-digit",
                                                                        hour12: true,
                                                                      },
                                                                    )}`
                                                                  : "TBD"}
                                                              </Text>

                                                              {match.teams &&
                                                                match.teams.map(
                                                                  (
                                                                    team,
                                                                    teamIndex,
                                                                  ) => {
                                                                    const isWinner =
                                                                      match.completed &&
                                                                      team.score >
                                                                        (match
                                                                          .teams[
                                                                          1 -
                                                                            teamIndex
                                                                        ]
                                                                          ?.score ||
                                                                          0);
                                                                    const isLoser =
                                                                      match.completed &&
                                                                      team.score <
                                                                        (match
                                                                          .teams[
                                                                          1 -
                                                                            teamIndex
                                                                        ]
                                                                          ?.score ||
                                                                          0);

                                                                    return (
                                                                      <View
                                                                        key={
                                                                          teamIndex
                                                                        }
                                                                        style={[
                                                                          styles.bracketTeam,
                                                                          isWinner &&
                                                                            styles.winnerTeam,
                                                                          isLoser &&
                                                                            styles.loserTeam,
                                                                        ]}
                                                                      >
                                                                        <Image
                                                                          source={{
                                                                            uri:
                                                                              team.logoUrl ||
                                                                              "https://i.imgur.com/BIC4pnO.webp",
                                                                          }}
                                                                          style={[
                                                                            styles.bracketTeamLogo,
                                                                            {
                                                                              opacity:
                                                                                isLoser
                                                                                  ? 0.5
                                                                                  : 1,
                                                                            },
                                                                          ]}
                                                                          resizeMode="contain"
                                                                        />
                                                                        <Text
                                                                          style={[
                                                                            styles.bracketTeamName,
                                                                            {
                                                                              color:
                                                                                theme.text,
                                                                              opacity:
                                                                                isLoser
                                                                                  ? 0.6
                                                                                  : 1,
                                                                            },
                                                                          ]}
                                                                          numberOfLines={
                                                                            1
                                                                          }
                                                                          ellipsizeMode="tail"
                                                                        >
                                                                          {team.shortName ||
                                                                            team.name ||
                                                                            "TBD"}
                                                                        </Text>
                                                                        <Text
                                                                          style={[
                                                                            styles.bracketTeamScore,
                                                                            {
                                                                              color:
                                                                                theme.text,
                                                                              opacity:
                                                                                isLoser
                                                                                  ? 0.6
                                                                                  : 1,
                                                                            },
                                                                          ]}
                                                                        >
                                                                          {team.score ||
                                                                            0}
                                                                        </Text>
                                                                      </View>
                                                                    );
                                                                  },
                                                                )}
                                                            </TouchableOpacity>
                                                          );
                                                        },
                                                      )}
                                                  </View>
                                                ),
                                              )}
                                            </ScrollView>
                                          </View>
                                        )}
                                    </>
                                  );
                                })()}
                              </View>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Teams Section */}
            {teams.length > 0 && (
              <View style={styles.detailsSection}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Participating Teams
                </Text>
                <View style={styles.teamsGrid}>
                  {teams.map((team, index) => (
                    <TouchableOpacity
                      key={team.id || index}
                      style={[
                        styles.teamCard,
                        { backgroundColor: theme.surfaceSecondary },
                      ]}
                      onPress={() => {
                        navigation.navigate("VALTeamPage", {
                          teamId: team.id,
                          teamName: team.name,
                        });
                      }}
                      activeOpacity={0.7}
                    >
                      {team.logoUrl ? (
                        <Image
                          source={{
                            uri: team.logoUrl,
                          }}
                          style={styles.teamLogo}
                          resizeMode="contain"
                        />
                      ) : (
                        <View
                          style={[
                            styles.teamLogo,
                            styles.teamLogoPlaceholder,
                            { backgroundColor: colors.primary + "20" },
                          ]}
                        >
                          <Ionicons
                            name="shield"
                            size={24}
                            color={colors.primary}
                          />
                        </View>
                      )}
                      <Text
                        style={[styles.teamName, { color: theme.text }]}
                        numberOfLines={2}
                      >
                        {team.shortName || team.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {activeTab === "results" && (
          <View style={styles.detailsSection}>
            {(() => {
              const allMatches = extractAllMatches(event);

              if (allMatches.length === 0) {
                return (
                  <View style={styles.comingSoonContainer}>
                    <Ionicons
                      name="trophy-outline"
                      size={48}
                      color={theme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.comingSoonText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      No results available yet
                    </Text>
                  </View>
                );
              }

              // Group matches by date for headers
              const matchesByDate = {};
              allMatches.forEach((match) => {
                if (match.startDate) {
                  const dateKey = new Date(match.startDate).toLocaleDateString(
                    "en-US",
                    {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    },
                  );
                  if (!matchesByDate[dateKey]) {
                    matchesByDate[dateKey] = [];
                  }
                  matchesByDate[dateKey].push(match);
                } else {
                  // Handle matches without dates
                  const tbdKey = "To Be Determined";
                  if (!matchesByDate[tbdKey]) {
                    matchesByDate[tbdKey] = [];
                  }
                  matchesByDate[tbdKey].push(match);
                }
              });

              return (
                <View>
                  {Object.entries(matchesByDate).map(([dateKey, matches]) => (
                    <View key={dateKey} style={styles.resultsDateSection}>
                      {/* Date Header */}
                      <Text
                        style={[
                          styles.resultsDateHeader,
                          { color: theme.text },
                        ]}
                      >
                        {dateKey}
                      </Text>

                      {/* Matches for this date */}
                      {matches.map((match, matchIndex) => {
                        const team1IsWinner =
                          match.completed &&
                          match.team1Score > match.team2Score;
                        const team2IsWinner =
                          match.completed &&
                          match.team2Score > match.team1Score;
                        const isDraw =
                          match.completed &&
                          match.team1Score === match.team2Score;

                        return (
                          <TouchableOpacity
                            key={`${dateKey}-${matchIndex}`}
                            style={[
                              styles.resultMatchCard,
                              { backgroundColor: theme.surface },
                            ]}
                            onPress={() => {
                              // Navigate to series screen with series ID
                              navigation.navigate("VALSeries", {
                                seriesId: match.id || match.seriesId,
                              });
                            }}
                            activeOpacity={0.7}
                          >
                            {/* Stage Header */}
                            <View
                              style={[
                                styles.resultStageHeader,
                                { backgroundColor: theme.surfaceSecondary },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.resultStageText,
                                  { color: theme.textSecondary },
                                ]}
                              >
                                {match.stageTitle}
                              </Text>
                            </View>

                            {/* Match Content */}
                            <View style={styles.resultMatchContent}>
                              {/* Team 1 */}
                              <View
                                style={[
                                  styles.resultTeam,
                                  team1IsWinner && styles.resultWinnerTeam,
                                ]}
                              >
                                <Image
                                  source={{
                                    uri:
                                      match.team1?.logoUrl ||
                                      "https://i.imgur.com/BIC4pnO.webp",
                                  }}
                                  style={[
                                    styles.resultTeamLogo,
                                    {
                                      opacity:
                                        match.completed &&
                                        !team1IsWinner &&
                                        !isDraw
                                          ? 0.5
                                          : 1,
                                    },
                                  ]}
                                  resizeMode="contain"
                                />
                                <Text
                                  style={[
                                    styles.resultTeamName,
                                    {
                                      color: theme.text,
                                      opacity:
                                        match.completed &&
                                        !team1IsWinner &&
                                        !isDraw
                                          ? 0.6
                                          : 1,
                                    },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {match.team1?.shortName ||
                                    match.team1?.name ||
                                    "TBD"}
                                </Text>
                              </View>

                              {/* Score and Status */}
                              <View style={styles.resultScoreSection}>
                                <View style={styles.resultScore}>
                                  <Text
                                    style={[
                                      styles.resultScoreText,
                                      {
                                        color: theme.text,
                                        opacity:
                                          match.completed &&
                                          !team1IsWinner &&
                                          !isDraw
                                            ? 0.6
                                            : 1,
                                      },
                                    ]}
                                  >
                                    {match.team1Score}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.resultScoreSeparator,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    -
                                  </Text>
                                  <Text
                                    style={[
                                      styles.resultScoreText,
                                      {
                                        color: theme.text,
                                        opacity:
                                          match.completed &&
                                          !team2IsWinner &&
                                          !isDraw
                                            ? 0.6
                                            : 1,
                                      },
                                    ]}
                                  >
                                    {match.team2Score}
                                  </Text>
                                </View>

                                {match.completed && (
                                  <View
                                    style={[
                                      styles.resultStatus,
                                      { backgroundColor: theme.success },
                                    ]}
                                  >
                                    <Text style={styles.resultStatusText}>
                                      FINISHED
                                    </Text>
                                  </View>
                                )}

                                {!match.completed && (
                                  <View
                                    style={[
                                      styles.resultStatus,
                                      { backgroundColor: theme.warning },
                                    ]}
                                  >
                                    <Text style={styles.resultStatusText}>
                                      UPCOMING
                                    </Text>
                                  </View>
                                )}

                                {match.startDate && (
                                  <Text
                                    style={[
                                      styles.resultTime,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    {new Date(
                                      match.startDate,
                                    ).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </Text>
                                )}
                              </View>

                              {/* Team 2 */}
                              <View
                                style={[
                                  styles.resultTeam,
                                  styles.resultTeam2,
                                  team2IsWinner && styles.resultWinnerTeam,
                                ]}
                              >
                                <Image
                                  source={{
                                    uri:
                                      match.team2?.logoUrl ||
                                      "https://i.imgur.com/BIC4pnO.webp",
                                  }}
                                  style={[
                                    styles.resultTeamLogo,
                                    {
                                      opacity:
                                        match.completed &&
                                        !team2IsWinner &&
                                        !isDraw
                                          ? 0.5
                                          : 1,
                                    },
                                  ]}
                                  resizeMode="contain"
                                />
                                <Text
                                  style={[
                                    styles.resultTeamName,
                                    styles.resultTeamName2,
                                    {
                                      color: theme.text,
                                      opacity:
                                        match.completed &&
                                        !team2IsWinner &&
                                        !isDraw
                                          ? 0.6
                                          : 1,
                                    },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {match.team2?.shortName ||
                                    match.team2?.name ||
                                    "TBD"}
                                </Text>
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>
              );
            })()}
          </View>
        )}

        {activeTab === "stats" && (
          <View style={styles.statsSection}>
            {statsLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text
                  style={[styles.loadingText, { color: theme.textSecondary }]}
                >
                  Loading stats...
                </Text>
              </View>
            ) : (
              <ScrollView>
                {/* Top Players */}
                {getCurrentStatsData().topPlayers && (
                  <View
                    style={[
                      styles.statsCard,
                      { backgroundColor: theme.surface },
                    ]}
                  >
                    <Text
                      style={[styles.statsCardTitle, { color: theme.text }]}
                    >
                      Top Players
                    </Text>
                    <View style={styles.topPlayersTable}>
                      <View style={styles.topPlayersHeader}>
                        <Text
                          style={[
                            styles.topPlayersHeaderText,
                            { color: theme.text },
                          ]}
                        >
                          ACS (rounds)
                        </Text>
                      </View>
                      {getCurrentStatsData()
                        .topPlayers.slice(0, 10)
                        .map((player, index) => (
                          <View
                            key={player.playerId}
                            style={styles.topPlayersRow}
                          >
                            <Text
                              style={[
                                styles.topPlayersRank,
                                { color: theme.textSecondary },
                              ]}
                            >
                              {index + 1}
                            </Text>
                            {player.teamLogoUrl ? (
                              <Image
                                source={{ uri: player.teamLogoUrl }}
                                style={styles.topPlayersTeamLogo}
                                resizeMode="contain"
                              />
                            ) : (
                              <View
                                style={[
                                  styles.topPlayersTeamLogo,
                                  styles.topPlayersTeamLogoPlaceholder,
                                  { backgroundColor: colors.primary + "20" },
                                ]}
                              >
                                <Ionicons
                                  name="shield"
                                  size={16}
                                  color={colors.primary}
                                />
                              </View>
                            )}
                            <Text
                              style={[
                                styles.topPlayersName,
                                { color: theme.text },
                              ]}
                            >
                              {player.playerName}
                            </Text>
                            <Text
                              style={[
                                styles.topPlayersAcs,
                                { color: colors.primary },
                              ]}
                            >
                              {Math.round(parseFloat(player.acs))}{" "}
                              <Text style={{ color: colors.secondary }}>
                                ({player.roundsPlayed})
                              </Text>
                            </Text>
                            <View style={styles.topPlayersAgents}>
                              {player.agents.map((agent) => (
                                <Image
                                  key={agent.agentId}
                                  source={{
                                    uri: getAgentImageUrl(agent.agentName),
                                  }}
                                  style={styles.topPlayersAgentImage}
                                  resizeMode="contain"
                                />
                              ))}
                              {player.agents.length > 4 && (
                                <Text
                                  style={[
                                    styles.topPlayersMoreAgents,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  +{player.agents.length - 4}
                                </Text>
                              )}
                            </View>
                          </View>
                        ))}
                    </View>
                  </View>
                )}

                {/* Multikills */}
                {getCurrentStatsData().topPlayersByMultikills && (
                  <View
                    style={[
                      styles.statsCard,
                      { backgroundColor: theme.surface },
                    ]}
                  >
                    <Text
                      style={[styles.statsCardTitle, { color: theme.text }]}
                    >
                      Multikills
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.multikillsScrollContent}
                    >
                      {getCurrentStatsData()
                        .topPlayersByMultikills.slice(0, 10)
                        .map((player, index) => (
                          <View
                            key={player.playerId}
                            style={[
                              styles.multikillsCard,
                              { backgroundColor: theme.background },
                            ]}
                          >
                            <Text
                              style={[
                                styles.multikillsRankCard,
                                { color: theme.textSecondary },
                              ]}
                            >
                              #{index + 1}
                            </Text>
                            {player.playerImageUrl ? (
                              <Image
                                source={{ uri: player.playerImageUrl }}
                                style={styles.multikillsPlayerImageCard}
                                resizeMode="contain"
                              />
                            ) : (
                              <View
                                style={[
                                  styles.multikillsPlayerImageCard,
                                  styles.multikillsPlayerImagePlaceholder,
                                  { backgroundColor: colors.primary + "20" },
                                ]}
                              >
                                <Ionicons
                                  name="person"
                                  size={20}
                                  color={colors.primary}
                                />
                              </View>
                            )}
                            <Text
                              style={[
                                styles.multikillsPlayerNameCard,
                                { color: theme.text },
                              ]}
                            >
                              {player.playerName}
                            </Text>
                            <Text
                              style={[
                                styles.multikillsTotalCard,
                                { color: colors.primary },
                              ]}
                            >
                              {player.multikills}
                            </Text>
                            <View style={styles.multikillsStatsCard}>
                              <View style={styles.multikillsStatItem}>
                                <Text
                                  style={[
                                    styles.multikillsStatValue,
                                    { color: theme.text },
                                  ]}
                                >
                                  {player.breakdown["2k"]}
                                </Text>
                                <Text
                                  style={[
                                    styles.multikillsStatLabel,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  2K
                                </Text>
                              </View>
                              <View style={styles.multikillsStatItem}>
                                <Text
                                  style={[
                                    styles.multikillsStatValue,
                                    { color: theme.text },
                                  ]}
                                >
                                  {player.breakdown["3k"]}
                                </Text>
                                <Text
                                  style={[
                                    styles.multikillsStatLabel,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  3K
                                </Text>
                              </View>
                              <View style={styles.multikillsStatItem}>
                                <Text
                                  style={[
                                    styles.multikillsStatValue,
                                    { color: theme.text },
                                  ]}
                                >
                                  {player.breakdown["4k"]}
                                </Text>
                                <Text
                                  style={[
                                    styles.multikillsStatLabel,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  4K
                                </Text>
                              </View>
                              <View style={styles.multikillsStatItem}>
                                <Text
                                  style={[
                                    styles.multikillsStatValue,
                                    { color: theme.text },
                                  ]}
                                >
                                  {player.breakdown["5k"]}
                                </Text>
                                <Text
                                  style={[
                                    styles.multikillsStatLabel,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  5K
                                </Text>
                              </View>
                              <View style={styles.multikillsStatItem}>
                                <Text
                                  style={[
                                    styles.multikillsStatValue,
                                    { color: theme.text },
                                  ]}
                                >
                                  {player.breakdown["6k"]}
                                </Text>
                                <Text
                                  style={[
                                    styles.multikillsStatLabel,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  6K
                                </Text>
                              </View>
                            </View>
                          </View>
                        ))}
                    </ScrollView>
                  </View>
                )}

                {/* Most Kills by Weapon */}
                {getCurrentStatsData().topPlayersByWeaponsKills && (
                  <View
                    style={[
                      styles.statsCard,
                      { backgroundColor: theme.surface },
                    ]}
                  >
                    <Text
                      style={[styles.statsCardTitle, { color: theme.text }]}
                    >
                      Most Kills By Weapon
                    </Text>
                    <View style={styles.weaponKillsColumn}>
                      {Object.entries(
                        getCurrentStatsData().topPlayersByWeaponsKills.reduce(
                          (acc, player) => {
                            if (!acc[player.weaponName]) {
                              acc[player.weaponName] = [];
                            }
                            acc[player.weaponName].push(player);
                            return acc;
                          },
                          {},
                        ),
                      )
                        .slice(0, 10)
                        .map(([weaponName, players]) => {
                          const topPlayer = players[0];
                          return (
                            <View
                              key={weaponName}
                              style={[
                                styles.weaponKillsRowItem,
                                { backgroundColor: theme.background },
                              ]}
                            >
                              <View style={styles.weaponKillsPlayerSection}>
                                {topPlayer.playerImageUrl ? (
                                  <Image
                                    source={{ uri: topPlayer.playerImageUrl }}
                                    style={styles.weaponKillsPlayerImageRow}
                                    resizeMode="contain"
                                  />
                                ) : (
                                  <View
                                    style={[
                                      styles.weaponKillsPlayerImageRow,
                                      styles.weaponKillsPlayerImagePlaceholder,
                                      {
                                        backgroundColor: colors.primary + "20",
                                      },
                                    ]}
                                  >
                                    <Ionicons
                                      name="person"
                                      size={20}
                                      color={colors.primary}
                                    />
                                  </View>
                                )}

                                {/* New vertical text wrapper */}
                                <View style={styles.playerInfoWrapper}>
                                  <Text
                                    style={[
                                      styles.weaponKillsPlayerNameRow,
                                      { color: theme.text },
                                    ]}
                                  >
                                    {topPlayer.playerName}
                                  </Text>

                                  {/* Team row */}
                                  <View style={styles.teamRow}>
                                    {topPlayer.teamLogoUrl ? (
                                      <Image
                                        source={{ uri: topPlayer.teamLogoUrl }}
                                        style={styles.teamLogo1}
                                        resizeMode="contain"
                                      />
                                    ) : (
                                      <View
                                        style={[
                                          styles.teamLogo1,
                                          styles.teamLogoPlaceholder1,
                                          {
                                            backgroundColor:
                                              colors.primary + "20",
                                          },
                                        ]}
                                      >
                                        <Ionicons
                                          name="shield"
                                          size={14}
                                          color={colors.primary}
                                        />
                                      </View>
                                    )}
                                    <Text
                                      style={[
                                        styles.teamName,
                                        { color: theme.text },
                                      ]}
                                    >
                                      {topPlayer.teamName}
                                    </Text>
                                  </View>
                                </View>
                              </View>

                              <View style={styles.weaponKillsWeaponSection}>
                                <Image
                                  source={{
                                    uri: getWeaponImage(weaponName),
                                  }}
                                  style={[
                                    styles.weaponKillsWeaponImage,
                                    { tintColor: theme.text },
                                  ]}
                                  resizeMode="contain"
                                />
                                <Text
                                  style={[
                                    styles.weaponKillsCountRow,
                                    { color: colors.primary },
                                  ]}
                                >
                                  {topPlayer.kills} Kills
                                </Text>
                              </View>
                            </View>
                          );
                        })}
                    </View>
                  </View>
                )}

                {/* Top Agents by Role */}
                {getCurrentStatsData().topAgentsByRole && (
                  <View
                    style={[
                      styles.statsCard,
                      { backgroundColor: theme.surface },
                    ]}
                  >
                    <Text
                      style={[styles.statsCardTitle, { color: theme.text }]}
                    >
                      Top Agent Picks and Win Rate
                    </Text>
                    <View style={styles.roleContainer}>
                      {getCurrentStatsData().topAgentsByRole.map(
                        (role, index) => (
                          <View key={role.roleId} style={styles.roleSection}>
                            <Text
                              style={[
                                styles.roleTitle,
                                { color: colors.primary },
                              ]}
                            >
                              {role.roleName}
                            </Text>
                            <View style={styles.agentColumnGrid}>
                              {role.agents
                                .slice(0, 4)
                                .map((agent, agentIndex) => {
                                  const winRate =
                                    agent.picks > 0
                                      ? Math.round(
                                          (agent.wins / agent.picks) * 100,
                                        )
                                      : 0;
                                  return (
                                    <View
                                      key={agent.agentId}
                                      style={[
                                        styles.agentColumnItem,
                                        { backgroundColor: theme.background },
                                      ]}
                                    >
                                      <Image
                                        source={{
                                          uri: getAgentImageUrl(
                                            agent.agentName,
                                          ),
                                        }}
                                        style={styles.agentColumnImage}
                                        resizeMode="contain"
                                      />
                                      <Text
                                        style={[
                                          styles.agentColumnWinRate,
                                          {
                                            color:
                                              winRate >= 50
                                                ? "#4CAF50"
                                                : "#FF5722",
                                          },
                                        ]}
                                      >
                                        {winRate}%
                                      </Text>
                                      <Text
                                        style={[
                                          styles.agentColumnPicks,
                                          { color: theme.textSecondary },
                                        ]}
                                      >
                                        {agent.picks} picks
                                      </Text>
                                    </View>
                                  );
                                })}
                            </View>
                          </View>
                        ),
                      )}
                    </View>
                  </View>
                )}

                {/* Agent Performance Stats */}
                {getCurrentStatsData().basicStatsByAgent && (
                  <View
                    style={[
                      styles.statsCard,
                      { backgroundColor: theme.surface },
                    ]}
                  >
                    <Text
                      style={[styles.statsCardTitle, { color: theme.text }]}
                    >
                      Agent Performance Stats
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={
                        styles.agentPerformanceScrollContent
                      }
                    >
                      {getCurrentStatsData().basicStatsByAgent.map((agent) => {
                        const acs = Math.round(agent.score / agent.rounds);
                        const kd =
                          agent.deaths > 0
                            ? (agent.kills / agent.deaths).toFixed(2)
                            : agent.kills.toFixed(2);
                        const dpr = (agent.damage / agent.rounds).toFixed(0);
                        const apr = (agent.assists / agent.rounds).toFixed(2);
                        const fkPercent =
                          agent.rounds > 0
                            ? Math.round(
                                (agent.firstKills / agent.rounds) * 100,
                              )
                            : 0;
                        const fdPercent =
                          agent.rounds > 0
                            ? Math.round(
                                (agent.firstDeaths / agent.rounds) * 100,
                              )
                            : 0;
                        const kastPercent =
                          agent.rounds > 0
                            ? Math.round(
                                (agent.kastRounds / agent.rounds) * 100,
                              )
                            : 0;

                        return (
                          <View
                            key={agent.agentId}
                            style={[
                              styles.agentPerformanceCard,
                              { backgroundColor: theme.background },
                            ]}
                          >
                            <Image
                              source={{
                                uri: getAgentImageUrl(agent.agentName),
                              }}
                              style={styles.agentPerformanceImage}
                              resizeMode="contain"
                            />
                            <Text
                              style={[
                                styles.agentPerformanceName,
                                { color: theme.text },
                              ]}
                            >
                              {agent.agentName}
                            </Text>
                            <View style={styles.agentPerformanceStats}>
                              <View style={styles.agentPerformanceStatItem}>
                                <Text
                                  style={[
                                    styles.agentPerformanceValue,
                                    { color: theme.text },
                                  ]}
                                >
                                  {acs}
                                </Text>
                                <Text
                                  style={[
                                    styles.agentPerformanceLabel,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  ACS
                                </Text>
                              </View>
                              <View style={styles.agentPerformanceStatItem}>
                                <Text
                                  style={[
                                    styles.agentPerformanceValue,
                                    { color: theme.text },
                                  ]}
                                >
                                  {kd}
                                </Text>
                                <Text
                                  style={[
                                    styles.agentPerformanceLabel,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  K/D
                                </Text>
                              </View>
                              <View style={styles.agentPerformanceStatItem}>
                                <Text
                                  style={[
                                    styles.agentPerformanceValue,
                                    { color: theme.text },
                                  ]}
                                >
                                  {dpr}
                                </Text>
                                <Text
                                  style={[
                                    styles.agentPerformanceLabel,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  DPR
                                </Text>
                              </View>
                              <View style={styles.agentPerformanceStatItem}>
                                <Text
                                  style={[
                                    styles.agentPerformanceValue,
                                    { color: theme.text },
                                  ]}
                                >
                                  {apr}
                                </Text>
                                <Text
                                  style={[
                                    styles.agentPerformanceLabel,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  APR
                                </Text>
                              </View>
                              <View style={styles.agentPerformanceStatItem}>
                                <Text
                                  style={[
                                    styles.agentPerformanceValue,
                                    { color: theme.text },
                                  ]}
                                >
                                  {fkPercent}%
                                </Text>
                                <Text
                                  style={[
                                    styles.agentPerformanceLabel,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  FK%
                                </Text>
                              </View>
                              <View style={styles.agentPerformanceStatItem}>
                                <Text
                                  style={[
                                    styles.agentPerformanceValue,
                                    { color: theme.text },
                                  ]}
                                >
                                  {fdPercent}%
                                </Text>
                                <Text
                                  style={[
                                    styles.agentPerformanceLabel,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  FD%
                                </Text>
                              </View>
                              <View style={styles.agentPerformanceStatItem}>
                                <Text
                                  style={[
                                    styles.agentPerformanceValue,
                                    { color: theme.text },
                                  ]}
                                >
                                  {kastPercent}%
                                </Text>
                                <Text
                                  style={[
                                    styles.agentPerformanceLabel,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  KAST%
                                </Text>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* Top Comps */}
                {getCurrentStatsData().mapTopComps && (
                  <View
                    style={[
                      styles.statsCard,
                      { backgroundColor: theme.surface },
                    ]}
                  >
                    <Text
                      style={[styles.statsCardTitle, { color: theme.text }]}
                    >
                      Top Comps
                    </Text>
                    <View style={styles.topCompsContainer}>
                      {Object.entries(
                        getCurrentStatsData().mapTopComps.reduce(
                          (acc, comp) => {
                            if (!acc[comp.mapName]) {
                              acc[comp.mapName] = [];
                            }
                            acc[comp.mapName].push(comp);
                            return acc;
                          },
                          {},
                        ),
                      ).map(([mapName, comps]) => {
                        const isExpanded = !!expandedMaps[mapName];
                        const hasMore = comps.length > 2;
                        const displayComps = isExpanded
                          ? comps
                          : comps.slice(0, 2);
                        const Wrapper = hasMore ? TouchableOpacity : View;

                        return (
                          <View key={mapName} style={styles.mapCompsSection}>
                            <Wrapper
                              style={styles.mapCompsHeader}
                              onPress={
                                hasMore
                                  ? () =>
                                      setExpandedMaps((prev) => ({
                                        ...prev,
                                        [mapName]: !prev[mapName],
                                      }))
                                  : undefined
                              }
                            >
                              <Text
                                style={[
                                  styles.mapCompsTitle,
                                  { color: colors.primary },
                                ]}
                              >
                                {mapName}
                              </Text>
                              {hasMore && (
                                <TouchableOpacity style={styles.mapCompsToggle}>
                                  <Ionicons
                                    name={
                                      isExpanded ? "chevron-up" : "chevron-down"
                                    }
                                    size={18}
                                    color={colors.primary}
                                  />
                                </TouchableOpacity>
                              )}
                            </Wrapper>

                            {displayComps.map((comp, index) => (
                              <View
                                key={comp.id || index}
                                style={[
                                  styles.compRow,
                                  { position: "relative", overflow: "hidden" },
                                ]}
                              >
                                <Image
                                  source={{ uri: getMapSampleUrl(mapName) }}
                                  style={styles.compRowMapBackground}
                                  resizeMode="cover"
                                />
                                <View style={styles.compRowMapOverlay} />
                                <View style={styles.compRowContent}>
                                  <View style={styles.compAgents}>
                                    {comp.comp.map((agentId) => (
                                      <Image
                                        key={agentId}
                                        source={{
                                          uri: getAgentImageUrl(
                                            getAgentDisplayName(agentId),
                                          ),
                                        }}
                                        style={styles.compAgentImage}
                                        resizeMode="contain"
                                      />
                                    ))}
                                  </View>
                                  <Text
                                    style={[
                                      styles.compPicks,
                                      { color: "white" },
                                    ]}
                                  >
                                    {comp.picks} pick
                                    {comp.picks !== 1 ? "s" : ""}
                                  </Text>
                                </View>
                              </View>
                            ))}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
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
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    flex: 1,
  },
  refreshButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  heroSection: {
    padding: 24,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 24,
    borderRadius: 16,
    alignItems: "center",
  },
  heroImage: {
    width: 120,
    height: 120,
    borderRadius: 12,
    marginBottom: 16,
  },
  heroImagePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  heroContent: {
    alignItems: "center",
  },
  eventTitle: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
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
  eventDescription: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "600",
  },
  detailsSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  statsSection: {
    flex: 1,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
  },
  detailCard: {
    padding: 16,
    borderRadius: 12,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  detailContent: {
    marginLeft: 12,
    flex: 1,
  },
  detailLabel: {
    fontSize: 14,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  actionsSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  bottomPadding: {
    height: 32,
  },
  // Header styles
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingBottom: 16,
    width: "100%",
  },
  heroHeaderTitle: {
    fontSize: 18,
    fontWeight: "bold",
    flex: 1,
    marginLeft: 16,
  },
  // Event info styles
  eventInfoContainer: {
    marginTop: 5,
  },
  eventInfo: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  // Back button styles
  backButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  // Tab navigation styles
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

  // Child Events Section
  childEventsSection: {
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  childEventsScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  childEventButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 60,
    alignItems: "center",
  },
  childEventButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  // Teams section styles
  teamsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  teamCard: {
    width: "31%",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    minHeight: 90,
    marginBottom: 12,
  },
  teamLogo: {
    width: 40,
    height: 40,
    marginBottom: 8,
  },
  teamLogoPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 4,
  },
  teamName: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  // Coming soon styles
  comingSoonContainer: {
    alignItems: "center",
    paddingVertical: 48,
  },
  comingSoonText: {
    fontSize: 16,
    textAlign: "center",
    marginTop: 16,
  },
  // Results section styles
  eventCard: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    justifyContent: "space-between",
  },
  eventHeaderLeft: {
    flex: 1,
  },
  eventName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  eventMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  eventDates: {
    fontSize: 14,
  },
  expandedContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  groupButtonsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 16,
  },
  groupButton: {
    flexBasis: "23%", // ~25% minus gap for 4 buttons per row
    flexGrow: 1,
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    minWidth: 0,
  },
  groupButtonText: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    flexShrink: 1,
  },
  groupContainer: {
    marginBottom: 20,
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  standingsTable: {
    borderRadius: 8,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
    alignItems: "center",
  },
  headerText: {
    fontSize: 12,
    fontWeight: "600",
    width: 40,
    textAlign: "center",
  },
  headerTextTeam: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
    textAlign: "left",
    paddingLeft: 4,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  cellText: {
    fontSize: 14,
    width: 40,
    textAlign: "center",
  },
  teamCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 4,
  },
  teamLogoSmall: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  teamNameText: {
    fontSize: 14,
    fontWeight: "500",
  },
  showMatchesButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 12,
    alignItems: "center",
  },
  showMatchesText: {
    fontSize: 14,
    fontWeight: "600",
  },
  matchesList: {
    marginTop: 12,
  },
  matchCard: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  matchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  matchDate: {
    fontSize: 12,
  },
  matchTime: {
    fontSize: 12,
  },
  matchTeams: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  matchTeam: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  matchTeamName: {
    fontSize: 14,
    fontWeight: "500",
  },
  matchTeamLogo: {
    width: 24,
    height: 24,
    marginHorizontal: 8,
  },
  matchScore: {
    fontSize: 16,
    fontWeight: "bold",
  },
  matchVs: {
    fontSize: 12,
    marginHorizontal: 16,
  },
  // Playoff Bracket Styles
  playoffContainer: {
    marginTop: 0,
    marginHorizontal: -5,
  },
  bracketScrollView: {
    marginTop: 16,
  },
  bracketContainer: {
    paddingLeft: 0,
    paddingRight: 0,
    flexDirection: "column",
  },
  bracketSection: {
    marginBottom: 5,
  },
  bracketSectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  mapCompsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  mapCompsToggle: {
    padding: 6,
  },
  bracketRounds: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  lowerBracketRounds: {
    marginTop: 32,
  },
  bracketRound: {
    marginRight: 24,
    minWidth: 160, // Increased from 140 for better mobile display
  },
  roundTitle: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 12,
    textTransform: "uppercase",
  },
  bracketMatch: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    minHeight: 80,
    minWidth: 140, // Ensure minimum width for team names
  },
  bracketTeam: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginVertical: 2,
    minWidth: 0, // Allow container to shrink
    flex: 1, // Take available space
  },
  winnerTeam: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  loserTeam: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  bracketTeamLogo: {
    width: 18,
    height: 18,
    marginRight: 6,
  },
  bracketTeamName: {
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
    minWidth: 0, // Allow text to shrink if needed
    flexShrink: 1, // Allow text to shrink
  },
  bracketTeamScore: {
    fontSize: 12,
    fontWeight: "bold",
    minWidth: 20,
    textAlign: "center",
  },
  // Results Tab Styles
  resultsDateSection: {
    marginBottom: 24,
  },
  resultsDateHeader: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  resultMatchCard: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
  },
  resultStageHeader: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  resultStageText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  resultMatchContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  resultTeam: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
  },
  resultTeam2: {
    justifyContent: "flex-end",
  },
  resultWinnerTeam: {
    // Winner team styling will be handled by opacity in the component
  },
  resultTeamLogo: {
    width: 48,
    height: 48,
    marginBottom: 8,
  },
  resultTeamName: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    maxWidth: 80,
  },
  resultTeamName2: {
    textAlign: "center",
  },
  resultScoreSection: {
    alignItems: "center",
    minWidth: 100,
    paddingHorizontal: 16,
  },
  resultScore: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  resultScoreText: {
    fontSize: 18,
    fontWeight: "bold",
    minWidth: 24,
    textAlign: "center",
  },
  resultScoreSeparator: {
    fontSize: 16,
    marginHorizontal: 8,
  },
  resultStatus: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 2,
  },
  resultStatusText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },
  resultTime: {
    fontSize: 12,
  },

  // Weekly Tournament Styles
  weeklyContainer: {
    padding: 16,
  },
  weekSection: {
    marginBottom: 20,
    borderRadius: 12,
    padding: 16,
  },
  weekTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  weeklyMatchCard: {
    borderRadius: 8,
    marginBottom: 12,
    padding: 12,
  },
  weeklyMatchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  weeklyMatchDate: {
    fontSize: 12,
    fontWeight: "500",
  },
  weeklyMatchTime: {
    fontSize: 12,
  },
  weeklyMatchTeams: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  weeklyMatchTeam: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  weeklyTeamLogo: {
    width: 32,
    height: 32,
    marginHorizontal: 8,
  },
  weeklyTeamName: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  weeklyTeamScore: {
    fontSize: 18,
    fontWeight: "bold",
    minWidth: 30,
    textAlign: "center",
  },
  weeklyMatchVs: {
    fontSize: 12,
    fontWeight: "500",
    marginHorizontal: 16,
  },

  // Ranking Change Styles
  rankingCell: {
    width: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  rankingChangeIndicator: {
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
    minWidth: 12,
  },
  rankingChangeTriangle: {
    fontSize: 8,
    lineHeight: 8,
    textAlign: "center",
  },
  rankingChangeNumber: {
    fontSize: 10,
    lineHeight: 10,
    textAlign: "center",
    fontWeight: "bold",
  },

  // Stats Tab Styles
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 50,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  statsCard: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    borderRadius: 12,
  },
  statsCardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },

  // Role-based agent picks
  roleContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  roleSection: {
    width: "48%",
    marginBottom: 16,
  },
  roleTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  agentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  agentPickItem: {
    width: "30%",
    alignItems: "center",
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  agentPickImage: {
    width: 32,
    height: 32,
    marginBottom: 4,
  },
  agentPickName: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  agentPickStats: {
    fontSize: 8,
    textAlign: "center",
  },
  agentPickWinRate: {
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center",
  },

  // Agent Performance Stats Table
  agentStatsTable: {
    marginTop: 8,
  },
  agentStatsHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  agentStatsHeaderText: {
    fontSize: 12,
    fontWeight: "bold",
    flex: 1,
    textAlign: "center",
  },
  agentStatsRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  agentStatsAgentCell: {
    flexDirection: "row",
    alignItems: "center",
    flex: 2,
  },
  agentStatsAgentImage: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  agentStatsAgentName: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  agentStatsCell: {
    fontSize: 11,
    flex: 1,
    textAlign: "center",
  },

  // Multikills Table
  multikillsTable: {
    marginTop: 8,
  },
  multikillsHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  multikillsHeaderText: {
    fontSize: 12,
    fontWeight: "bold",
    flex: 1,
    textAlign: "center",
  },
  multikillsRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  multikillsPlayerCell: {
    flexDirection: "row",
    alignItems: "center",
    flex: 2,
  },
  multikillsRank: {
    fontSize: 12,
    fontWeight: "bold",
    width: 20,
    textAlign: "center",
  },
  multikillsPlayerImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginHorizontal: 8,
  },
  multikillsPlayerName: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  multikillsTotal: {
    fontSize: 14,
    fontWeight: "bold",
    marginLeft: 8,
  },
  multikillsCell: {
    fontSize: 11,
    flex: 1,
    textAlign: "center",
  },

  // Top Players Table
  topPlayersTable: {
    marginTop: 8,
  },
  topPlayersHeader: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  topPlayersHeaderText: {
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
  },
  topPlayersRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  topPlayersRank: {
    fontSize: 12,
    fontWeight: "bold",
    width: 20,
    textAlign: "center",
  },
  topPlayersTeamLogo: {
    width: 24,
    height: 24,
    marginHorizontal: 8,
  },
  topPlayersName: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  topPlayersAcs: {
    fontSize: 14,
    fontWeight: "bold",
    marginRight: 8,
  },
  topPlayersAgents: {
    flexDirection: "row",
    alignItems: "center",
  },
  topPlayersAgentImage: {
    width: 20,
    height: 20,
    marginLeft: 2,
  },
  topPlayersMoreAgents: {
    fontSize: 10,
    marginLeft: 4,
  },

  // Weapon Kills Grid
  weaponKillsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  weaponKillsItem: {
    width: "30%",
    alignItems: "center",
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  weaponKillsPlayerImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginBottom: 4,
  },
  weaponKillsPlayerName: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  weaponKillsWeapon: {
    fontSize: 8,
    textAlign: "center",
    marginVertical: 2,
  },
  weaponKillsCount: {
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center",
  },

  // Top Agent Picks (Column Layout)
  agentColumnGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  agentColumnItem: {
    width: "48%",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  agentColumnImage: {
    width: 48,
    height: 48,
    marginBottom: 8,
  },
  agentColumnWinRate: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  agentColumnPicks: {
    fontSize: 12,
  },

  // Agent Performance (Horizontal Scroll Cards) - Updated
  agentPerformanceScrollContent: {
    gap: 12,
  },
  agentPerformanceCard: {
    width: 120,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  agentPerformanceImage: {
    width: 48,
    height: 48,
    marginBottom: 8,
  },
  agentPerformanceName: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 12,
  },
  agentPerformanceStats: {
    alignItems: "center",
    gap: 8,
  },
  agentPerformanceStatItem: {
    alignItems: "center",
  },
  agentPerformanceValue: {
    fontSize: 14,
    fontWeight: "bold",
  },
  agentPerformanceLabel: {
    fontSize: 10,
    marginTop: 2,
  },

  // Multikills (Horizontal Scroll Cards) - Updated
  multikillsScrollContent: {
    gap: 12,
  },
  multikillsCard: {
    width: 140,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  multikillsRankCard: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  multikillsPlayerImageCard: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 8,
  },
  multikillsPlayerImagePlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  multikillsPlayerNameCard: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  multikillsTotalCard: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  multikillsStatsCard: {
    flexDirection: "row",
    gap: 8,
  },
  multikillsStatItem: {
    alignItems: "center",
  },
  multikillsStatValue: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  multikillsStatLabel: {
    fontSize: 10,
    textAlign: "center",
    marginTop: 2,
  },

  // Top Players (Team Logo Placeholder)
  topPlayersTeamLogoPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
  },

  // Weapon Kills (Column Layout)
  weaponKillsColumn: {
    gap: 8,
  },
  weaponKillsRowItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 8,
  },
  weaponKillsPlayerSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  weaponKillsPlayerImageRow: {
    width: 35,
    height: 35,
    borderRadius: 16,
    marginRight: 12,
  },
  weaponKillsPlayerImagePlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  weaponKillsPlayerNameRow: {
    fontSize: 16,
    fontWeight: "600",
  },
  playerInfoWrapper: {
    flexDirection: "column",
    justifyContent: "center",
    flexShrink: 1,
  },

  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },

  teamLogo1: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 6,
  },

  teamLogoPlaceholder1: {
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 4,
  },

  teamName: {
    fontSize: 12,
    fontWeight: "500",
  },

  weaponKillsWeaponSection: {
    alignItems: "center",
  },
  weaponKillsWeaponImage: {
    width: 40,
    height: 32,
    marginBottom: 4,
  },
  weaponKillsCountRow: {
    fontSize: 12,
    fontWeight: "bold",
  },

  // Top Comps (Map Backgrounds)
  compRowMapBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  compRowMapOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  compRowContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 1,
  },

  // Top Comps
  topCompsContainer: {
    marginTop: 8,
  },
  mapCompsSection: {
    marginBottom: 20,
  },
  mapCompsTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
  },
  compRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  compAgents: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  compAgentImage: {
    width: 24,
    height: 24,
    marginRight: 4,
  },
  compPicks: {
    fontSize: 12,
    fontWeight: "600",
  },
});

export default VALEventScreen;

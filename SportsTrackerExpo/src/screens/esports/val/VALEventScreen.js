import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { getEventDetails, formatEventDateRange, formatPrizePool } from '../../../services/valorantService';

const VALEventScreen = ({ navigation, route }) => {
  const { eventId } = route.params;
  const { colors, theme } = useTheme();
  const [event, setEvent] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedEvents, setExpandedEvents] = useState({});
  const [activeGroups, setActiveGroups] = useState({});
  const [showMatches, setShowMatches] = useState({});

  useEffect(() => {
    loadData();
  }, [eventId]);

  // Extract teams from child events
  const extractTeamsFromEvent = (eventData) => {
    const allTeams = [];
    const teamIds = new Set(); // To avoid duplicates
    
    if (eventData.childEvents && eventData.childEvents.length > 0) {
      eventData.childEvents.forEach(childEvent => {
        if (childEvent.bracketJson && childEvent.bracketJson.groups) {
          childEvent.bracketJson.groups.forEach(group => {
            if (group.teams && group.teams.length > 0) {
              group.teams.forEach(team => {
                if (!teamIds.has(team.id)) {
                  teamIds.add(team.id);
                  allTeams.push({
                    id: team.id,
                    name: team.name,
                    shortName: team.shortName,
                    logoUrl: team.logoUrl,
                    countryId: team.countryId,
                    country: team.country
                  });
                }
              });
            }
          });
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
    
    if (now < start) return 'Scheduled';
    if (now > end) return 'Completed';
    return 'In Progress';
  };

  // Extract matches from group seeds array
  const extractSeriesFromGroup = (group) => {
    const series = [];
    
    if (group.seeds && group.seeds.length > 0) {
      group.seeds.forEach(seed => {
        // Only add if there are actually teams (not empty seeds)
        if (seed.team1 && seed.team2) {
          series.push({
            id: seed.id || seed.seriesId, // Include series ID
            team1: seed.team1,
            team2: seed.team2,
            team1Score: seed.team1Score || 0,
            team2Score: seed.team2Score || 0,
            startDate: seed.matches && seed.matches.length > 0 ? seed.matches[0].startDate : null,
            completed: seed.completed || false,
            matches: seed.matches || []
          });
        }
      });
    }
    
    return series;
  };

  // Extract all matches from event for Results tab
  const extractAllMatches = (eventData) => {
    const allMatches = [];
    
    if (!eventData.childEvents || eventData.childEvents.length === 0) {
      return allMatches;
    }
    
    eventData.childEvents.forEach(childEvent => {
      const eventType = childEvent.bracketJson?.type || 'unknown';
      
      if (eventType === 'group' && childEvent.bracketJson.groups) {
        // Group stage matches
        childEvent.bracketJson.groups.forEach(group => {
          const groupSeries = extractSeriesFromGroup(group);
          groupSeries.forEach(series => {
            allMatches.push({
              ...series,
              eventName: childEvent.name || childEvent.shortName,
              stageTitle: group.title || `Group ${String.fromCharCode(65 + childEvent.bracketJson.groups.indexOf(group))}`,
              eventType: 'group'
            });
          });
        });
      } else if (eventType === 'double' && (childEvent.bracketJson.winners || childEvent.bracketJson.losers)) {
        // Playoff matches
        
        // Upper bracket matches
        if (childEvent.bracketJson.winners) {
          childEvent.bracketJson.winners.forEach(round => {
            if (round.seeds) {
              round.seeds.forEach(match => {
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
                    eventType: 'playoff-upper'
                  });
                }
              });
            }
          });
        }
        
        // Lower bracket matches
        if (childEvent.bracketJson.losers) {
          childEvent.bracketJson.losers.forEach(round => {
            if (round.seeds) {
              round.seeds.forEach(match => {
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
                    eventType: 'playoff-lower'
                  });
                }
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
    
    group.teams.forEach(team => {
      let seriesWins = 0;
      let seriesLosses = 0;
      let roundsWon = 0;
      let roundsLost = 0;
      
      // Calculate stats from series (seeds)
      if (group.seeds) {
        group.seeds.forEach(seed => {
          if (seed.team1Id === team.id || seed.team2Id === team.id) {
            const isTeam1 = seed.team1Id === team.id;
            
            // Use series scores for wins/losses
            if (seed.completed) {
              const teamSeriesScore = isTeam1 ? seed.team1Score : seed.team2Score;
              const opponentSeriesScore = isTeam1 ? seed.team2Score : seed.team1Score;
              
              if (teamSeriesScore > opponentSeriesScore) {
                seriesWins++;
              } else if (opponentSeriesScore > teamSeriesScore) {
                seriesLosses++;
              }
              
              // Use round wins/losses for round differential
              roundsWon += isTeam1 ? (seed.team1RoundWins || 0) : (seed.team2RoundWins || 0);
              roundsLost += isTeam1 ? (seed.team1RoundLosses || 0) : (seed.team2RoundLosses || 0);
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
        roundDifferential: roundDifferential >= 0 ? `+${roundDifferential}` : `${roundDifferential}`,
        qualified: team.qualified || false,
        nonQualified: team.nonQualified || false
      });
    });
    
    // Sort by losses (asc), then by wins (desc)
    standings.sort((a, b) => {
      if (a.losses !== b.losses) return a.losses - b.losses;
      return b.wins - a.wins;
    });
    
    return standings;
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const eventData = await getEventDetails(eventId);
      setEvent(eventData); // eventData is already the event object from pageProps.event
      
      // Extract teams from child events
      const extractedTeams = extractTeamsFromEvent(eventData);
      setTeams(extractedTeams);
    } catch (error) {
      console.error('Error loading Valorant event:', error);
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

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading event details...
        </Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle-outline" size={64} color={theme.textTertiary} />
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
        <View style={[styles.heroSection, { backgroundColor: theme.surfaceSecondary }]}>
          {event.imageUrl || event.logoUrl ? (
            <Image
              source={{ uri: event.imageUrl || event.logoUrl }}
              style={styles.heroImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.heroImagePlaceholder, { backgroundColor: colors.primary }]}>
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
            
            <Text style={[styles.eventDescription, { color: theme.textSecondary }]}>
              {event.description || 'Valorant tournament'}
            </Text>
            
            {/* Event Info */}
            <View style={styles.eventInfoContainer}>
              <Text style={[styles.eventInfo, { color: theme.textSecondary }]}>
                {event.startDate && event.endDate 
                  ? formatEventDateRange(event.startDate, event.endDate)
                  : event.startDate 
                    ? new Date(event.startDate).toLocaleDateString()
                    : 'TBD'}
                {event.prizePool && (
                  <Text> • {formatPrizePool(event.prizePool, event.prizePoolCurrency)}</Text>
                )}
                <Text> • {event.country?.niceName || event.region?.name || 'Global'}</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* Tab Navigation */}
        <View style={[styles.tabContainer, { backgroundColor: theme.surface }]}>
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'overview' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }
            ]}
            onPress={() => setActiveTab('overview')}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === 'overview' ? colors.primary : theme.textSecondary }
            ]}>
              Overview
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'results' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }
            ]}
            onPress={() => setActiveTab('results')}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === 'results' ? colors.primary : theme.textSecondary }
            ]}>
              Results
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <>
            {/* Results Section */}
            {event.childEvents && event.childEvents.length > 0 && (
              <View style={styles.detailsSection}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Results
                </Text>
                
                {/* Child Events */}
                {event.childEvents.map((childEvent, index) => {
                  const status = getEventStatus(childEvent.startDate, childEvent.endDate);
                  const isExpanded = expandedEvents[childEvent.id] || false;
                  
                  return (
                    <View key={childEvent.id} style={[styles.eventCard, { backgroundColor: theme.surfaceSecondary }]}>
                      {/* Event Header */}
                      <TouchableOpacity
                        style={styles.eventHeader}
                        onPress={() => {
                          const isCurrentlyExpanded = expandedEvents[childEvent.id];
                          setExpandedEvents(prev => ({
                            ...prev,
                            [childEvent.id]: !prev[childEvent.id]
                          }));
                          
                          // Auto-select first group when expanding
                          if (!isCurrentlyExpanded && childEvent.bracketJson && childEvent.bracketJson.groups) {
                            setActiveGroups(prev => ({
                              ...prev,
                              [`${childEvent.id}-0`]: true
                            }));
                          }
                        }}
                      >
                        <View style={styles.eventHeaderLeft}>
                          <Text style={[styles.eventName, { color: theme.text }]}>
                            {childEvent.shortName || childEvent.name}
                          </Text>
                          <View style={styles.eventMeta}>
                            <View style={[
                              styles.statusBadge, 
                              { backgroundColor: status === 'Completed' ? theme.success : status === 'In Progress' ? theme.error : theme.warning }
                            ]}>
                              <Text style={styles.statusText}>{status}</Text>
                            </View>
                            <Text style={[styles.eventDates, { color: theme.textSecondary }]}>
                              {childEvent.startDate && childEvent.endDate 
                                ? formatEventDateRange(childEvent.startDate, childEvent.endDate)
                                : 'TBD'}
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
                          {childEvent.bracketJson.type === 'group' && childEvent.bracketJson.groups && (
                            <View style={styles.groupButtonsContainer}>
                              {childEvent.bracketJson.groups.map((group, groupIndex) => (
                                <TouchableOpacity
                                  key={groupIndex}
                                  style={[
                                    styles.groupButton,
                                    { 
                                      backgroundColor: activeGroups[`${childEvent.id}-${groupIndex}`] 
                                        ? colors.primary 
                                        : theme.surface,
                                      borderColor: colors.primary
                                    }
                                  ]}
                                  onPress={() => setActiveGroups(prev => {
                                    const newState = { ...prev };
                                    // First, deactivate all groups for this event
                                    childEvent.bracketJson.groups.forEach((_, idx) => {
                                      newState[`${childEvent.id}-${idx}`] = false;
                                    });
                                    // Then activate only the clicked group
                                    newState[`${childEvent.id}-${groupIndex}`] = true;
                                    return newState;
                                  })}
                                >
                                  <Text style={[
                                    styles.groupButtonText,
                                    { 
                                      color: activeGroups[`${childEvent.id}-${groupIndex}`] 
                                        ? 'white' 
                                        : colors.primary 
                                    }
                                  ]}>
                                    {group.title || `Group ${String.fromCharCode(65 + groupIndex)}`}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                          
                          {/* Group Standings - Only show for group type */}
                          {childEvent.bracketJson.type === 'group' && childEvent.bracketJson.groups && childEvent.bracketJson.groups.map((group, groupIndex) => {
                            const isGroupActive = activeGroups[`${childEvent.id}-${groupIndex}`];
                            if (!isGroupActive) return null;
                            
                            const standings = calculateGroupStandings(group);
                            const showMatchesKey = `${childEvent.id}-${groupIndex}`;
                            
                            return (
                              <View key={groupIndex} style={styles.groupContainer}>
                                <Text style={[styles.groupTitle, { color: theme.text }]}>
                                  {group.title || `Group ${String.fromCharCode(65 + groupIndex)}`} Standings
                                </Text>
                                
                                {/* Standings Table */}
                                <View style={[styles.standingsTable, { backgroundColor: theme.surface }]}>
                                  {/* Table Header */}
                                  <View style={styles.tableHeader}>
                                    <Text style={[styles.headerText, { color: theme.textSecondary }]}>#</Text>
                                    <Text style={[styles.headerTextTeam, { color: theme.textSecondary }]}>Team</Text>
                                    <Text style={[styles.headerText, { color: theme.textSecondary }]}>W</Text>
                                    <Text style={[styles.headerText, { color: theme.textSecondary }]}>L</Text>
                                    <Text style={[styles.headerText, { color: theme.textSecondary }]}>RW/RL</Text>
                                  </View>
                                  
                                  {/* Table Rows */}
                                  {standings.map((team, teamIndex) => (
                                    <View 
                                      key={team.id} 
                                      style={[
                                        styles.tableRow,
                                        { 
                                          borderLeftWidth: 3,
                                          borderLeftColor: team.qualified ? theme.success : team.nonQualified ? theme.error : theme.textSecondary
                                        }
                                      ]}
                                    >
                                      <Text style={[styles.cellText, { color: theme.textSecondary }]}>
                                        {teamIndex + 1}
                                      </Text>
                                      <View style={styles.teamCell}>
                                        <Image
                                          source={{ uri: team.logoUrl || 'https://i.imgur.com/BIC4pnO.webp' }}
                                          style={styles.teamLogoSmall}
                                          resizeMode="contain"
                                        />
                                        <Text style={[styles.teamNameText, { color: theme.text }]}>
                                          {team.shortName || team.name}
                                        </Text>
                                      </View>
                                      <Text style={[styles.cellText, { color: theme.text }]}>{team.wins}</Text>
                                      <Text style={[styles.cellText, { color: theme.text }]}>{team.losses}</Text>
                                      <Text style={[styles.cellText, { color: theme.text }]}>
                                        {team.roundsWon}/{team.roundsLost}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                                
                                {/* Show/Hide Matches Button */}
                                <TouchableOpacity
                                  style={[styles.showMatchesButton, { backgroundColor: theme.surface }]}
                                  onPress={() => setShowMatches(prev => ({
                                    ...prev,
                                    [showMatchesKey]: !prev[showMatchesKey]
                                  }))}
                                >
                                  <Text style={[styles.showMatchesText, { color: colors.primary }]}>
                                    {showMatches[showMatchesKey] ? 'Hide Matches' : 'Show Matches'} 
                                    ({extractSeriesFromGroup(group).length})
                                  </Text>
                                </TouchableOpacity>
                                
                                {/* Series List */}
                                {showMatches[showMatchesKey] && (
                                  <View style={styles.matchesList}>
                                    {extractSeriesFromGroup(group).map((series, seriesIndex) => {
                                      const team1IsWinner = series.team1Score > series.team2Score;
                                      const team2IsWinner = series.team2Score > series.team1Score;
                                      const seriesCompleted = series.completed && (series.team1Score > 0 || series.team2Score > 0);
                                      
                                      return (
                                        <TouchableOpacity 
                                          key={seriesIndex} 
                                          style={[styles.matchCard, { backgroundColor: theme.surface }]}
                                          onPress={() => {
                                            navigation.navigate('VALSeries', {
                                              seriesId: series.id
                                            });
                                          }}
                                          activeOpacity={0.7}
                                        >
                                          <View style={styles.matchHeader}>
                                            <Text style={[styles.matchDate, { color: theme.textSecondary }]}>
                                              {series.startDate ? 
                                                new Date(series.startDate).toLocaleDateString('en-US', { 
                                                  month: 'short', 
                                                  day: 'numeric' 
                                                }).replace(',', '') : 'TBD'}
                                            </Text>
                                            <Text style={[styles.matchTime, { color: theme.textSecondary }]}>
                                              {series.startDate ? new Date(series.startDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                                            </Text>
                                          </View>
                                          <View style={styles.matchTeams}>
                                            <View style={styles.matchTeam}>
                                              <Image
                                                source={{ uri: series.team1?.logoUrl || 'https://i.imgur.com/BIC4pnO.webp' }}
                                                style={[
                                                  styles.matchTeamLogo,
                                                  { opacity: seriesCompleted && !team1IsWinner ? 0.5 : 1 }
                                                ]}
                                                resizeMode="contain"
                                              />
                                              <Text style={[
                                                styles.matchTeamName, 
                                                { 
                                                  color: theme.text,
                                                  opacity: seriesCompleted && !team1IsWinner ? 0.6 : 1
                                                }
                                              ]}>
                                                {series.team1?.shortName || 'TBD'}
                                              </Text>
                                              <Text style={[
                                                styles.matchScore, 
                                                { 
                                                  color: theme.text,
                                                  opacity: seriesCompleted && !team1IsWinner ? 0.6 : 1
                                                }
                                              ]}>
                                                {series.team1Score || 0}
                                              </Text>
                                            </View>
                                            <Text style={[styles.matchVs, { color: theme.textSecondary }]}>vs</Text>
                                            <View style={styles.matchTeam}>
                                              <Text style={[
                                                styles.matchScore, 
                                                { 
                                                  color: theme.text,
                                                  opacity: seriesCompleted && !team2IsWinner ? 0.6 : 1
                                                }
                                              ]}>
                                                {series.team2Score || 0}
                                              </Text>
                                              <Text style={[
                                                styles.matchTeamName, 
                                                { 
                                                  color: theme.text,
                                                  opacity: seriesCompleted && !team2IsWinner ? 0.6 : 1
                                                }
                                              ]}>
                                                {series.team2?.shortName || 'TBD'}
                                              </Text>
                                              <Image
                                                source={{ uri: series.team2?.logoUrl || 'https://i.imgur.com/BIC4pnO.webp' }}
                                                style={[
                                                  styles.matchTeamLogo,
                                                  { opacity: seriesCompleted && !team2IsWinner ? 0.5 : 1 }
                                                ]}
                                                resizeMode="contain"
                                              />
                                            </View>
                                          </View>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>
                                )}
                              </View>
                            );
                          })}
                          
                          {/* Playoff Bracket Content */}
{childEvent.bracketJson.type === 'double' && (
  <View style={styles.playoffContainer}>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bracketScrollView}
      contentContainerStyle={styles.bracketContainer}
    >
      {(() => {
        const BOX_HEIGHT = 100;
        const BOX_MARGIN = 20;

        function computeBracketPositions(rounds) {
          if (!rounds?.length) return { positions: [], maxHeight: 200 };

          const positions = [];
          let maxHeight = 0;

          rounds.forEach((round, roundIndex) => {
            const currentMatchCount = round.seeds?.length || 0;
            
            if (currentMatchCount === 0) {
              positions.push([]);
              return;
            }

            let spacing, yOffset;

            // Use the same logic for both upper and lower brackets for consistency
            const prevMatchCount = roundIndex > 0 ? rounds[roundIndex - 1]?.seeds?.length || 0 : 0;
            const sameAsPrevious = prevMatchCount === currentMatchCount && roundIndex > 0;

            if (sameAsPrevious) {
              // Same number of matches as previous round - align horizontally
              spacing = positions[roundIndex - 1].length >= 2 ? 
                positions[roundIndex - 1][1].top - positions[roundIndex - 1][0].top : 
                (BOX_HEIGHT + BOX_MARGIN) * Math.pow(2, roundIndex - 1);
              yOffset = positions[roundIndex - 1][0]?.top || spacing / 2;
            } else if (roundIndex > 0 && prevMatchCount > currentMatchCount && positions[roundIndex - 1].length > 0) {
              // Fewer matches than previous round - center between previous matches
              const prevPositions = positions[roundIndex - 1];
              if (prevPositions.length >= 2) {
                // Calculate spacing to center current matches between previous ones
                const prevSpacing = prevPositions[1].top - prevPositions[0].top;
                const matchesPerGroup = prevMatchCount / currentMatchCount;
                spacing = prevSpacing * matchesPerGroup;
                // Center the first match between appropriate previous matches
                yOffset = prevPositions[0].top + (prevSpacing * (matchesPerGroup - 1)) / 2;
              } else {
                // Single previous match case
                spacing = (BOX_HEIGHT + BOX_MARGIN) * Math.pow(2, roundIndex);
                yOffset = prevPositions[0].top;
              }
            } else {
              // First round or more matches than previous - use standard spacing
              spacing = (BOX_HEIGHT + BOX_MARGIN) * Math.pow(2, roundIndex);
              yOffset = spacing / 2;
            }

            const roundPositions = round.seeds.map((_, matchIndex) => ({
              top: yOffset + matchIndex * spacing,
              left: 15,
            }));

            positions.push(roundPositions);

            // Calculate the maximum height needed for this round
            if (roundPositions.length > 0) {
              const lastMatchTop = roundPositions[roundPositions.length - 1].top;
              const roundMaxHeight = lastMatchTop + BOX_HEIGHT + BOX_MARGIN;
              maxHeight = Math.max(maxHeight, roundMaxHeight);
            }
          });

          return { positions, maxHeight };
        }

        const winnerBracket = computeBracketPositions(
          childEvent.bracketJson.winners || []
        );
        const loserBracket = computeBracketPositions(
          childEvent.bracketJson.losers || []
        );
        
        const winnerPositions = winnerBracket.positions;
        const loserPositions = loserBracket.positions;

        return (
          <>
            {/* Upper Bracket */}
            {childEvent.bracketJson.winners && (
              <View style={styles.bracketSection}>
                <View style={[styles.bracketRounds, { position: 'relative', height: winnerBracket.maxHeight }]}>
                  {childEvent.bracketJson.winners.map((round, roundIndex) => (
                    <View key={roundIndex} style={styles.bracketRound}>
                      <Text
                        style={[
                          styles.roundTitle,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {round.title}
                      </Text>

                      {round.seeds &&
                        round.seeds.map((match, matchIndex) => {
                          const pos =
                            winnerPositions[roundIndex]?.[matchIndex] || {
                              top: 0,
                              left: 0,
                            };

                          return (
                            <TouchableOpacity
                              key={matchIndex}
                              style={[
                                styles.bracketMatch,
                                {
                                  position: 'absolute',
                                  top: pos.top,
                                  left: pos.left,
                                  backgroundColor: theme.surface,
                                },
                              ]}
                              onPress={() => {
                                if (match.teams && match.teams.length >= 2) {
                                  navigation.navigate('VALSeries', {
                                    seriesId: match.seriesId || match.id
                                  });
                                }
                              }}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.matchDate,
                                  { color: theme.textSecondary },
                                ]}
                              >
                                {match.startDate
                                  ? new Date(match.startDate).toLocaleDateString(
                                      'en-US',
                                      {
                                        month: 'short',
                                        day: 'numeric',
                                      }
                                    )
                                  : 'TBD'}
                              </Text>

                              {match.teams &&
                                match.teams.map((team, teamIndex) => {
                                  const isWinner =
                                    match.completed &&
                                    team.score >
                                      (match.teams[1 - teamIndex]?.score || 0);
                                  const isLoser =
                                    match.completed &&
                                    team.score <
                                      (match.teams[1 - teamIndex]?.score || 0);

                                  return (
                                    <View
                                      key={teamIndex}
                                      style={[
                                        styles.bracketTeam,
                                        isWinner && styles.winnerTeam,
                                        isLoser && styles.loserTeam,
                                      ]}
                                    >
                                      <Image
                                        source={{
                                          uri:
                                            team.logoUrl ||
                                            'https://i.imgur.com/BIC4pnO.webp',
                                        }}
                                        style={[
                                          styles.bracketTeamLogo,
                                          { opacity: isLoser ? 0.5 : 1 },
                                        ]}
                                        resizeMode="contain"
                                      />
                                      <Text
                                        style={[
                                          styles.bracketTeamName,
                                          {
                                            color: theme.text,
                                            opacity: isLoser ? 0.6 : 1,
                                          },
                                        ]}
                                        numberOfLines={1}
                                        ellipsizeMode="tail"
                                      >
                                        {team.shortName ||
                                          team.name ||
                                          'TBD'}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.bracketTeamScore,
                                          {
                                            color: theme.text,
                                            opacity: isLoser ? 0.6 : 1,
                                          },
                                        ]}
                                      >
                                        {team.score || 0}
                                      </Text>
                                    </View>
                                  );
                                })}
                            </TouchableOpacity>
                          );
                        })}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Lower Bracket */}
            {childEvent.bracketJson.losers && (
              <View style={styles.bracketSection}>
                <View style={[styles.bracketRounds, { position: 'relative', height: loserBracket.maxHeight }]}>
                  {childEvent.bracketJson.losers.map((round, roundIndex) => (
                    <View key={roundIndex} style={styles.bracketRound}>
                      <Text
                        style={[
                          styles.roundTitle,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {round.title}
                      </Text>

                      {round.seeds &&
                        round.seeds.map((match, matchIndex) => {
                          const pos =
                            loserPositions[roundIndex]?.[matchIndex] || {
                              top: 0,
                              left: 0,
                            };

                          return (
                            <TouchableOpacity
                              key={matchIndex}
                              style={[
                                styles.bracketMatch,
                                {
                                  position: 'absolute',
                                  top: pos.top,
                                  left: pos.left,
                                  backgroundColor: theme.surface,
                                },
                              ]}
                              onPress={() => {
                                if (match.teams && match.teams.length >= 2) {
                                  navigation.navigate('VALSeries', {
                                    seriesId: match.seriesId || match.id
                                  });
                                }
                              }}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.matchDate,
                                  { color: theme.textSecondary },
                                ]}
                              >
                                {match.startDate
                                  ? new Date(match.startDate).toLocaleDateString(
                                      'en-US',
                                      {
                                        month: 'short',
                                        day: 'numeric',
                                      }
                                    )
                                  : 'TBD'}
                              </Text>

                              {match.teams &&
                                match.teams.map((team, teamIndex) => {
                                  const isWinner =
                                    match.completed &&
                                    team.score >
                                      (match.teams[1 - teamIndex]?.score || 0);
                                  const isLoser =
                                    match.completed &&
                                    team.score <
                                      (match.teams[1 - teamIndex]?.score || 0);

                                  return (
                                    <View
                                      key={teamIndex}
                                      style={[
                                        styles.bracketTeam,
                                        isWinner && styles.winnerTeam,
                                        isLoser && styles.loserTeam,
                                      ]}
                                    >
                                      <Image
                                        source={{
                                          uri:
                                            team.logoUrl ||
                                            'https://i.imgur.com/BIC4pnO.webp',
                                        }}
                                        style={[
                                          styles.bracketTeamLogo,
                                          { opacity: isLoser ? 0.5 : 1 },
                                        ]}
                                        resizeMode="contain"
                                      />
                                      <Text
                                        style={[
                                          styles.bracketTeamName,
                                          {
                                            color: theme.text,
                                            opacity: isLoser ? 0.6 : 1,
                                          },
                                        ]}
                                        numberOfLines={1}
                                        ellipsizeMode="tail"
                                      >
                                        {team.shortName ||
                                          team.name ||
                                          'TBD'}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.bracketTeamScore,
                                          {
                                            color: theme.text,
                                            opacity: isLoser ? 0.6 : 1,
                                          },
                                        ]}
                                      >
                                        {team.score || 0}
                                      </Text>
                                    </View>
                                  );
                                })}
                            </TouchableOpacity>
                          );
                        })}
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        );
      })()}
    </ScrollView>
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
                    <View key={team.id || index} style={[styles.teamCard, { backgroundColor: theme.surfaceSecondary }]}>
                      <Image
                        source={{ uri: team.logoUrl || 'https://i.imgur.com/BIC4pnO.webp' }}
                        style={styles.teamLogo}
                        resizeMode="contain"
                      />
                      <Text style={[styles.teamName, { color: theme.text }]} numberOfLines={2}>
                        {team.shortName || team.name}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {activeTab === 'results' && (
          <View style={styles.detailsSection}>
            {(() => {
              const allMatches = extractAllMatches(event);
              
              if (allMatches.length === 0) {
                return (
                  <View style={styles.comingSoonContainer}>
                    <Ionicons name="trophy-outline" size={48} color={theme.textSecondary} />
                    <Text style={[styles.comingSoonText, { color: theme.textSecondary }]}>
                      No results available yet
                    </Text>
                  </View>
                );
              }

              // Group matches by date for headers
              const matchesByDate = {};
              allMatches.forEach(match => {
                if (match.startDate) {
                  const dateKey = new Date(match.startDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  });
                  if (!matchesByDate[dateKey]) {
                    matchesByDate[dateKey] = [];
                  }
                  matchesByDate[dateKey].push(match);
                } else {
                  // Handle matches without dates
                  const tbdKey = 'To Be Determined';
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
                      <Text style={[styles.resultsDateHeader, { color: theme.text }]}>
                        {dateKey}
                      </Text>
                      
                      {/* Matches for this date */}
                      {matches.map((match, matchIndex) => {
                        const team1IsWinner = match.completed && match.team1Score > match.team2Score;
                        const team2IsWinner = match.completed && match.team2Score > match.team1Score;
                        const isDraw = match.completed && match.team1Score === match.team2Score;
                        
                        return (
                          <TouchableOpacity 
                            key={`${dateKey}-${matchIndex}`} 
                            style={[styles.resultMatchCard, { backgroundColor: theme.surface }]}
                            onPress={() => {
                              // Navigate to series screen with series ID
                              navigation.navigate('VALSeries', {
                                seriesId: match.id || match.seriesId
                              });
                            }}
                            activeOpacity={0.7}
                          >
                            {/* Stage Header */}
                            <View style={[styles.resultStageHeader, { backgroundColor: theme.surfaceSecondary }]}>
                              <Text style={[styles.resultStageText, { color: theme.textSecondary }]}>
                                {match.stageTitle}
                              </Text>
                            </View>
                            
                            {/* Match Content */}
                            <View style={styles.resultMatchContent}>
                              {/* Team 1 */}
                              <View style={[styles.resultTeam, team1IsWinner && styles.resultWinnerTeam]}>
                                <Image
                                  source={{ 
                                    uri: match.team1?.logoUrl || 'https://i.imgur.com/BIC4pnO.webp' 
                                  }}
                                  style={[
                                    styles.resultTeamLogo,
                                    { opacity: match.completed && !team1IsWinner && !isDraw ? 0.5 : 1 }
                                  ]}
                                  resizeMode="contain"
                                />
                                <Text 
                                  style={[
                                    styles.resultTeamName, 
                                    { 
                                      color: theme.text,
                                      opacity: match.completed && !team1IsWinner && !isDraw ? 0.6 : 1
                                    }
                                  ]}
                                  numberOfLines={1}
                                >
                                  {match.team1?.shortName || match.team1?.name || 'TBD'}
                                </Text>
                              </View>
                              
                              {/* Score and Status */}
                              <View style={styles.resultScoreSection}>
                                <View style={styles.resultScore}>
                                  <Text style={[
                                    styles.resultScoreText, 
                                    { 
                                      color: theme.text,
                                      opacity: match.completed && !team1IsWinner && !isDraw ? 0.6 : 1
                                    }
                                  ]}>
                                    {match.team1Score}
                                  </Text>
                                  <Text style={[styles.resultScoreSeparator, { color: theme.textSecondary }]}>
                                    -
                                  </Text>
                                  <Text style={[
                                    styles.resultScoreText, 
                                    { 
                                      color: theme.text,
                                      opacity: match.completed && !team2IsWinner && !isDraw ? 0.6 : 1
                                    }
                                  ]}>
                                    {match.team2Score}
                                  </Text>
                                </View>
                                
                                {match.completed && (
                                  <View style={[styles.resultStatus, { backgroundColor: theme.success }]}>
                                    <Text style={styles.resultStatusText}>FINISHED</Text>
                                  </View>
                                )}
                                
                                {!match.completed && match.startDate && (
                                  <Text style={[styles.resultTime, { color: theme.textSecondary }]}>
                                    {new Date(match.startDate).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </Text>
                                )}
                              </View>
                              
                              {/* Team 2 */}
                              <View style={[styles.resultTeam, styles.resultTeam2, team2IsWinner && styles.resultWinnerTeam]}>
                                <Image
                                  source={{ 
                                    uri: match.team2?.logoUrl || 'https://i.imgur.com/BIC4pnO.webp' 
                                  }}
                                  style={[
                                    styles.resultTeamLogo,
                                    { opacity: match.completed && !team2IsWinner && !isDraw ? 0.5 : 1 }
                                  ]}
                                  resizeMode="contain"
                                />
                                <Text 
                                  style={[
                                    styles.resultTeamName, 
                                    styles.resultTeamName2,
                                    { 
                                      color: theme.text,
                                      opacity: match.completed && !team2IsWinner && !isDraw ? 0.6 : 1
                                    }
                                  ]}
                                  numberOfLines={1}
                                >
                                  {match.team2?.shortName || match.team2?.name || 'TBD'}
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
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
    fontWeight: 'bold',
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
    alignItems: 'center',
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
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroContent: {
    alignItems: 'center',
  },
  eventTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff4444',
    marginRight: 6,
  },
  liveText: {
    color: '#ff4444',
    fontSize: 12,
    fontWeight: 'bold',
  },
  eventDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
  },
  detailsSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  detailCard: {
    padding: 16,
    borderRadius: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    fontWeight: '600',
  },
  actionsSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  bottomPadding: {
    height: 32,
  },
  // Header styles
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 16,
    width: '100%',
  },
  heroHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    marginLeft: 16,
  },
  // Event info styles
  eventInfoContainer: {
    marginTop: 5,
  },
  eventInfo: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Back button styles
  backButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  // Tab navigation styles
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Teams section styles
  teamsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  teamCard: {
    width: '31%',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 90,
    marginBottom: 12,
  },
  teamLogo: {
    width: 40,
    height: 40,
    marginBottom: 8,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Coming soon styles
  comingSoonContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  comingSoonText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
  },
  // Results section styles
  eventCard: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    justifyContent: 'space-between',
  },
  eventHeaderLeft: {
    flex: 1,
  },
  eventName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  eventDates: {
    fontSize: 14,
  },
  expandedContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  groupButtonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  groupButton: {
    flexBasis: '23%', // ~25% minus gap for 4 buttons per row
    flexGrow: 1,
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  groupButtonText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
  groupContainer: {
    marginBottom: 20,
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  standingsTable: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
    alignItems: 'center',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '600',
    width: 40,
    textAlign: 'center',
  },
  headerTextTeam: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    textAlign: 'left',
    paddingLeft: 4,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  cellText: {
    fontSize: 14,
    width: 40,
    textAlign: 'center',
  },
  teamCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
  },
  teamLogoSmall: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  teamNameText: {
    fontSize: 14,
    fontWeight: '500',
  },
  showMatchesButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  showMatchesText: {
    fontSize: 14,
    fontWeight: '600',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  matchDate: {
    fontSize: 12,
  },
  matchTime: {
    fontSize: 12,
  },
  matchTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchTeam: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchTeamName: {
    fontSize: 14,
    fontWeight: '500',
  },
  matchTeamLogo: {
    width: 24,
    height: 24,
    marginHorizontal: 8,
  },
  matchScore: {
    fontSize: 16,
    fontWeight: 'bold',
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
    flexDirection: 'column',
  },
  bracketSection: {
    marginBottom: 5,
  },
  bracketSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  bracketRounds: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  bracketMatch: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    minHeight: 80,
    minWidth: 140, // Ensure minimum width for team names
  },
  bracketTeam: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginVertical: 2,
    minWidth: 0, // Allow container to shrink
    flex: 1, // Take available space
  },
  winnerTeam: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  loserTeam: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  bracketTeamLogo: {
    width: 18,
    height: 18,
    marginRight: 6,
  },
  bracketTeamName: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
    minWidth: 0, // Allow text to shrink if needed
    flexShrink: 1, // Allow text to shrink
  },
  bracketTeamScore: {
    fontSize: 12,
    fontWeight: 'bold',
    minWidth: 20,
    textAlign: 'center',
  },
  // Results Tab Styles
  resultsDateSection: {
    marginBottom: 24,
  },
  resultsDateHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  resultMatchCard: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  resultStageHeader: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  resultStageText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  resultMatchContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  resultTeam: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
  },
  resultTeam2: {
    justifyContent: 'flex-end',
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
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 80,
  },
  resultTeamName2: {
    textAlign: 'center',
  },
  resultScoreSection: {
    alignItems: 'center',
    minWidth: 100,
    paddingHorizontal: 16,
  },
  resultScore: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  resultScoreText: {
    fontSize: 18,
    fontWeight: 'bold',
    minWidth: 24,
    textAlign: 'center',
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
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  resultTime: {
    fontSize: 12,
  },
});

export default VALEventScreen;
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../../../context/ThemeContext';
import { getLiveSeries, getCompletedSeries, getUpcomingSeries } from '../../../services/valorantService';

const { width } = Dimensions.get('window');

const VALHomeScreen = ({ navigation, route }) => {
  const { colors, theme } = useTheme();
  const [liveSeries, setLiveSeries] = useState([]);
  const [completedSeries, setCompletedSeries] = useState([]);
  const [upcomingSeries, setUpcomingSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rawApiData, setRawApiData] = useState(null);
  const [activeFilter, setActiveFilter] = useState('today');
  const [selectedGame, setSelectedGame] = useState('VAL');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      
      // Fetch series data from rib.gg API
      const [liveData, todayCompletedData, todayUpcomingData] = await Promise.all([
        getLiveSeries(),
        getCompletedSeries(today),
        getUpcomingSeries(today)
      ]);
      
      // Store raw API data for debugging
      setRawApiData({
        live: liveData,
        completed: todayCompletedData,
        upcoming: todayUpcomingData,
        timestamp: new Date().toISOString(),
        currentDate: new Date().toString()
      });
      
      setLiveSeries(liveData?.data || []);
      setCompletedSeries(todayCompletedData?.data || []);
      setUpcomingSeries(todayUpcomingData?.data || []);
    } catch (error) {
      console.error('Error loading Valorant series data:', error);
      // Fallback to empty arrays on error
      setLiveSeries([]);
      setCompletedSeries([]);
      setUpcomingSeries([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const copyRawApiData = async () => {
    if (rawApiData) {
      try {
        const dataString = JSON.stringify(rawApiData, null, 2);
        await Clipboard.setStringAsync(dataString);
        Alert.alert('Success', 'Raw API data copied to clipboard!');
      } catch (error) {
        Alert.alert('Error', 'Failed to copy data to clipboard');
      }
    } else {
      Alert.alert('No Data', 'No API data available to copy');
    }
  };

  const handleGameFilterPress = (gameName) => {
    setSelectedGame(gameName);
    if (gameName === 'CS2') {
      // Navigate to the parent navigator and then to CS2 tab
      navigation.getParent()?.navigate('CS2');
    } else if (gameName === 'VAL') {
      // Already on VAL, no navigation needed
    }
    // TODO: Add navigation for other games when implemented  
  };

  // Load data for selected date filter
  const loadFilteredData = async (filter) => {
    try {
      const today = new Date();
      let targetDate;
      
      switch (filter) {
        case 'yesterday':
          targetDate = new Date(today.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'today':
          targetDate = today;
          break;
        case 'tomorrow':
          targetDate = new Date(today.getTime() + 24 * 60 * 60 * 1000);
          break;
        default:
          targetDate = today;
      }
      
      const [completedData, upcomingData] = await Promise.all([
        getCompletedSeries(targetDate),
        getUpcomingSeries(targetDate)
      ]);
      
      setCompletedSeries(completedData?.data || []);
      setUpcomingSeries(upcomingData?.data || []);
    } catch (error) {
      console.error('Error loading filtered data:', error);
      setCompletedSeries([]);
      setUpcomingSeries([]);
    }
  };

  // Handle filter change
  const handleFilterChange = (filter) => {
    setActiveFilter(filter);
    loadFilteredData(filter);
  };

  // Helper function to format relative time
  const getRelativeTime = (dateString) => {
    const now = new Date();
    const eventDate = new Date(dateString);
    const diffMs = now - eventDate;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      // Format as "Oct 12, 2025 • 3:30 PM"
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      const month = monthNames[eventDate.getMonth()];
      const day = eventDate.getDate();
      const year = eventDate.getFullYear();
      
      let hours = eventDate.getHours();
      const minutes = eventDate.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      
      hours = hours % 12;
      hours = hours ? hours : 12; // 0 should be 12
      
      const formattedTime = `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
      
      return `${month} ${day}, ${year} • ${formattedTime}`;
    }
  };

  // Helper function to clean event name (remove text after ' - ')
  const cleanEventName = (eventName) => {
    if (!eventName) return '';
    const dashIndex = eventName.indexOf(' - ') !== -1 ? eventName.indexOf(' - ') : eventName.indexOf(': ');
    return dashIndex !== -1 ? eventName.substring(0, dashIndex) : eventName;
  };

  // Live Series Card - Liquipedia style with teams on left/right, score in middle
  const LiveSeriesCard = ({ series }) => (
    <TouchableOpacity
      style={[styles.liveSeriesCard, { backgroundColor: theme.surfaceSecondary }]}
      onPress={() => navigation.navigate('VALSeries', { seriesId: series.id })}
    >
      <View style={styles.liveIndicator}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE</Text>
      </View>
      
      {/* Event Child Label */}
      <Text style={[styles.liveEventChildLabel, { color: theme.textTertiary }]} numberOfLines={1}>
        {series.eventChildLabel || 'Main Event'}
      </Text>
      
      {/* Event Name (cleaned) */}
      <Text style={[styles.liveEventName, { color: theme.text }]} numberOfLines={1}>
        {cleanEventName(series.eventName)}
      </Text>
      
      {/* Teams Layout - Liquipedia style */}
      <View style={styles.liveTeamsContainer}>
        {/* Team 1 - Left Side */}
        <View style={styles.liveTeamSide}>
          <View style={styles.liveTeamLogo}>
            {series.team1?.logoUrl ? (
              <Image
                source={{ uri: series.team1.logoUrl }}
                style={styles.teamLogoImage}
                resizeMode="contain"
              />
            ) : (
              <View style={[styles.teamLogoPlaceholder, { backgroundColor: colors.primary }]}>
                <Text style={styles.teamLogoText}>
                  {(series.team1?.name || 'T1').substring(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.liveTeamName, { color: theme.text }]} numberOfLines={1}>
            {series.team1?.name || 'Team 1'}
          </Text>
        </View>
        
        {/* Score in Middle */}
        <View style={styles.liveScoreContainer}>
          <Text style={[styles.liveScore, { color: theme.text }]}>
            {series.team1Score || 0} - {series.team2Score || 0}
          </Text>
        </View>
        
        {/* Team 2 - Right Side */}
        <View style={styles.liveTeamSide}>
          <View style={styles.liveTeamLogo}>
            {series.team2?.logoUrl ? (
              <Image
                source={{ uri: series.team2.logoUrl }}
                style={styles.teamLogoImage}
                resizeMode="contain"
              />
            ) : (
              <View style={[styles.teamLogoPlaceholder, { backgroundColor: colors.secondary }]}>
                <Text style={styles.teamLogoText}>
                  {(series.team2?.name || 'T2').substring(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.liveTeamName, { color: theme.text }]} numberOfLines={1}>
            {series.team2?.name || 'Team 2'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  // Group series by event for upcoming matches section
  const groupSeriesByEvent = (series) => {
    const grouped = {};
    series.forEach(s => {
      const eventKey = s.eventId || s.eventName;
      if (!grouped[eventKey]) {
        grouped[eventKey] = {
          eventId: s.eventId,
          parentEventId: s.parentEventId,
          eventName: s.eventName,
          eventChildLabel: s.eventChildLabel,
          series: []
        };
      }
      grouped[eventKey].series.push(s);
    });
    return Object.values(grouped);
  };

  // Upcoming Matches Section - Liquipedia style grouped by event
  const UpcomingMatchesSection = ({ series }) => {
    const groupedEvents = groupSeriesByEvent(series);
    
    return (
      <View style={styles.upcomingMatchesContainer}>
        {groupedEvents.map((event) => (
          <View key={event.eventId} style={[styles.eventContainer, { backgroundColor: theme.surfaceSecondary }]}>
            {/* Event Header with Logo */}
            <TouchableOpacity 
              style={styles.eventHeaderContainer}
              onPress={() => navigation.navigate('VALEvent', { eventId: event.parentEventId })}
            >
              <View style={styles.eventLogoContainer}>
                {event.series[0]?.eventLogoUrl ? (
                  <Image
                    source={{ uri: event.series[0].eventLogoUrl }}
                    style={styles.eventLogoImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={[styles.eventLogoPlaceholder, { backgroundColor: colors.primary }]}>
                    <Ionicons name="trophy" size={16} color="white" />
                  </View>
                )}
              </View>
              
              <View style={styles.eventInfo}>
                <Text style={[styles.upcomingEventName, { color: theme.text }]} numberOfLines={1}>
                  {cleanEventName(event.eventName)}
                </Text>
                <Text style={[styles.upcomingEventChildLabel, { color: theme.textTertiary }]} numberOfLines={1}>
                  {event.eventChildLabel || 'Tournament'}
                </Text>
              </View>
            </TouchableOpacity>
            
            {/* Matches in this event */}
            <View style={styles.matchesList}>
              {event.series.map((match, index) => (
                <View key={match.id}>
                  <TouchableOpacity
                    style={styles.upcomingMatchRow}
                    onPress={() => navigation.navigate('VALSeries', { seriesId: match.id })}
                  >
                    {/* Time on left */}
                    <View style={styles.matchTimeContainer}>
                      <Text style={[styles.matchTime, { color: theme.textSecondary }]}>
                        {(() => {
                          const date = new Date(match.startDate);
                          // Get hours and minutes in 12-hour format
                          let hours = date.getHours();
                          const minutes = date.getMinutes();
                          hours = hours % 12;
                          hours = hours ? hours : 12; // 0 should be 12
                          const formattedHours = hours.toString().padStart(2, '0');
                          const formattedMinutes = minutes.toString().padStart(2, '0');
                          return `${formattedHours}:${formattedMinutes}`;
                        })()}
                      </Text>
                      <Text style={[styles.matchTimeAmPm, { color: theme.textSecondary }]}>
                        {(() => {
                          const date = new Date(match.startDate);
                          const hours = date.getHours();
                          return hours >= 12 ? 'PM' : 'AM';
                        })()}
                      </Text>
                    </View>
                    
                    {/* Teams stacked vertically */}
                    <View style={styles.stackedTeams}>
                      {/* Team 1 */}
                      <View style={styles.teamWithLogo}>
                        <View style={styles.teamLogoSmall}>
                          {match.team1?.logoUrl ? (
                            <Image
                              source={{ uri: match.team1.logoUrl }}
                              style={styles.teamLogoSmallImage}
                              resizeMode="contain"
                            />
                          ) : (
                            <View style={[styles.teamLogoSmallPlaceholder, { backgroundColor: colors.primary }]}>
                              <Text style={styles.teamLogoSmallText}>
                                {(match.team1?.name || 'T1').substring(0, 1).toUpperCase()}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.stackedTeamName, { color: theme.text }]} numberOfLines={1}>
                          {match.team1?.name || 'TBD'}
                        </Text>
                      </View>
                      
                      {/* Team 2 */}
                      <View style={styles.teamWithLogo}>
                        <View style={styles.teamLogoSmall}>
                          {match.team2?.logoUrl ? (
                            <Image
                              source={{ uri: match.team2.logoUrl }}
                              style={styles.teamLogoSmallImage}
                              resizeMode="contain"
                            />
                          ) : (
                            <View style={[styles.teamLogoSmallPlaceholder, { backgroundColor: colors.secondary }]}>
                              <Text style={styles.teamLogoSmallText}>
                                {(match.team2?.name || 'T2').substring(0, 1).toUpperCase()}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.stackedTeamName, { color: theme.text }]} numberOfLines={1}>
                          {match.team2?.name || 'TBD'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  
                  {/* Separator line between matches (except last one) */}
                  {index < event.series.length - 1 && (
                    <View style={[styles.matchSeparator, { backgroundColor: theme.border }]} />
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  };

  // Completed Series Card - Cube-like form with event child label and relative time
  const CompletedSeriesCard = ({ series }) => (
    <TouchableOpacity
      style={[styles.completedSeriesCard, { backgroundColor: theme.surfaceSecondary }]}
      onPress={() => navigation.navigate('VALSeries', { seriesId: series.id })}
    >
      {/* Event Child Label */}
        <Text style={[styles.completedEventLabel, { color: theme.text }]} numberOfLines={1}>
          {series.eventChildLabel || series.eventName}
        </Text>
      
      {/* Relative Time */}
      <Text style={[styles.completedTime, { color: theme.textSecondary }]}>
        {getRelativeTime(series.startDate)}
      </Text>
      
      {/* Teams and Scores */}
      <View style={styles.completedTeamsContainer}>
        <View style={styles.completedTeamRow}>
          <View style={styles.completedTeamWithLogo}>
            <View style={styles.completedTeamLogo}>
              {series.team1?.logoUrl ? (
                <Image
                  source={{ uri: series.team1.logoUrl }}
                  style={styles.completedTeamLogoImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={[styles.completedTeamLogoPlaceholder, { backgroundColor: colors.primary }]}>
                  <Text style={styles.completedTeamLogoText}>
                    {(series.team1?.name || 'T1').substring(0, 1).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.completedTeamName, { color: theme.text }]} numberOfLines={1}>
              {series.team1?.name || 'Team 1'}
            </Text>
          </View>
          <Text style={[styles.completedScore, { 
            color: (series.team1Score || 0) > (series.team2Score || 0) ? colors.primary : theme.textSecondary
          }]}>
            {series.team1Score || 0}
          </Text>
        </View>
        <View style={styles.completedTeamRow}>
          <View style={styles.completedTeamWithLogo}>
            <View style={styles.completedTeamLogo}>
              {series.team2?.logoUrl ? (
                <Image
                  source={{ uri: series.team2.logoUrl }}
                  style={styles.completedTeamLogoImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={[styles.completedTeamLogoPlaceholder, { backgroundColor: colors.secondary }]}>
                  <Text style={styles.completedTeamLogoText}>
                    {(series.team2?.name || 'T2').substring(0, 1).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.completedTeamName, { color: theme.text }]} numberOfLines={1}>
              {series.team2?.name || 'Team 2'}
            </Text>
          </View>
          <Text style={[styles.completedScore, { 
            color: (series.team2Score || 0) > (series.team1Score || 0) ? colors.primary : theme.textSecondary
          }]}>
            {series.team2Score || 0}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );



  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading Valorant esports data...
        </Text>
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
      >
        {/* Header */}
        <View style={styles.header}>
          
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            VALORANT
          </Text>
        </View>

        {/* Live Matches */}
        {liveSeries.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>● Live matches</Text>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
              {liveSeries.map((series) => (
                <LiveSeriesCard key={series.id} series={series} />
              ))}
            </ScrollView>
          </View>
        )}



        {/* Upcoming Matches Filter Buttons */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Upcoming matches</Text>
          </View>
          
          <View style={styles.upcomingFilters}>
            {['yesterday', 'today', 'tomorrow'].map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.upcomingFilterButton,
                  activeFilter === filter && styles.activeUpcomingFilter,
                  { 
                    backgroundColor: activeFilter === filter ? colors.primary : theme.surfaceSecondary,
                    borderColor: theme.border 
                  }
                ]}
                onPress={() => handleFilterChange(filter)}
              >
                <Text style={[
                  styles.upcomingFilterText,
                  { color: activeFilter === filter ? 'white' : theme.text }
                ]}>
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Upcoming Matches - Grouped by Event */}
        {upcomingSeries.length > 0 ? (
          <View style={styles.upcomingContainer}>
            <UpcomingMatchesSection series={upcomingSeries} />
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={theme.textTertiary} />
            <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
              No upcoming matches for {activeFilter}
            </Text>
          </View>
        )}

        {/* Completed Matches */}
        {completedSeries.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Completed matches</Text>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
              {completedSeries.map((series) => (
                <CompletedSeriesCard key={series.id} series={series} />
              ))}
            </ScrollView>
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
    lineHeight: 24,
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
    fontSize: 24,
    fontWeight: 'bold',
    flex: 1,
  },
  debugButton: {
    padding: 8,
  },
  filterContainer: {
    marginBottom: 24,
  },
  filterScroll: {
    paddingLeft: 16,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 12,
  },
  activeFilterChip: {
    // Active styles handled in component
  },
  filterIcon: {
    marginRight: 6,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  horizontalScroll: {
    paddingLeft: 16,
  },
  liveCard: {
    width: width * 0.7,
    padding: 16,
    borderRadius: 12,
    marginRight: 12,
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
  liveTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  liveSubtitle: {
    fontSize: 14,
  },
  recentCard: {
    width: width * 0.6,
    padding: 16,
    borderRadius: 12,
    marginRight: 12,
  },
  scoreContainer: {
    marginBottom: 8,
  },
  score: {
    fontSize: 12,
    fontWeight: 'bold',
    opacity: 0.7,
  },
  recentTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  recentDate: {
    fontSize: 14,
  },
  upcomingFilters: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  upcomingFilterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
  },
  activeUpcomingFilter: {
    // Active styles handled in component
  },
  upcomingFilterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  upcomingGrid: {
    paddingHorizontal: 16,
  },
  upcomingCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  upcomingTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  upcomingDate: {
    fontSize: 14,
    marginBottom: 4,
  },
  upcomingSubtitle: {
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyStateText: {
    marginTop: 12,
    fontSize: 16,
    textAlign: 'center',
  },
  bottomPadding: {
    height: 32,
  },
  
  // Live Series Card Styles - Liquipedia Layout
  liveSeriesCard: {
    width: 280,
    padding: 16,
    borderRadius: 12,
    marginRight: 12,
    minHeight: 130,
  },
  liveEventChildLabel: {
    marginTop: -20,
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 4,
  },
  liveEventName: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  liveTeamsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  liveTeamSide: {
    alignItems: 'center',
    flex: 1,
  },
  liveTeamLogo: {
    width: 32,
    height: 32,
    marginBottom: 8,
  },
  teamLogoImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  teamLogoPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  teamLogoText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: 'white',
  },
  liveTeamName: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  liveScoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  liveScore: {
    fontSize: 25,
    fontWeight: 'bold',
  },
  eventChildLabel: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  eventName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    lineHeight: 18,
  },
  teamsContainer: {
    marginTop: 'auto',
  },
  teamRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  teamScore: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  
  // Upcoming Matches Styles - Liquipedia Layout
  upcomingContainer: {
    paddingHorizontal: 16,
  },
  upcomingMatchesContainer: {
    marginBottom: 24,
  },
  eventContainer: {
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  eventHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  eventLogoContainer: {
    marginRight: 12,
  },
  eventLogoImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  eventLogoPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventInfo: {
    flex: 1,
  },
  upcomingEventName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  upcomingEventChildLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  matchesList: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  upcomingMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  matchTimeContainer: {
    width: 50,
    marginRight: 16,
  },
  matchTime: {
    fontSize: 12,
    fontWeight: '500',
  },
  matchTimeAmPm: {
    fontSize: 11,
    opacity: 0.7,
  },
  stackedTeams: {
    flex: 1,
  },
  teamWithLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamLogoSmall: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  teamLogoSmallImage: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  teamLogoSmallPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  teamLogoSmallText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: 'white',
  },
  stackedTeamName: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  matchSeparator: {
    height: 1,
    marginHorizontal: 16,
    opacity: 0.3,
  },
  
  // Completed Matches Styles - Horizontal Scroll
  completedSeriesCard: {
    width: 180,
    padding: 12,
    borderRadius: 8,
    marginRight: 12,
    minHeight: 120,
  },
  completedEventLabel: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  completedTime: {
    fontSize: 11,
    marginBottom: 8,
  },
  completedTeamsContainer: {
    marginTop: 'auto',
  },
  completedTeamRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  completedTeamWithLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  completedTeamLogo: {
    width: 16,
    height: 16,
    marginRight: 6,
  },
  completedTeamLogoImage: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  completedTeamLogoPlaceholder: {
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completedTeamLogoText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: 'white',
  },
  completedTeamName: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  completedScore: {
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});

export default VALHomeScreen;
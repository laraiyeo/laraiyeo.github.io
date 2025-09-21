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
  Alert,
  FlatList
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useWindowDimensions } from 'react-native';

const RacerDetailsScreen = ({ route }) => {
  const { racerId, racerName, teamColor } = route.params || {};
  const { theme, colors, isDarkMode } = useTheme();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();

  const [selectedTab, setSelectedTab] = useState('STATS');
  const [racerData, setRacerData] = useState(null);
  const [raceLog, setRaceLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const tabs = [
    { key: 'STATS', name: 'Stats' },
    { key: 'RACE_LOG', name: 'Race Log' }
  ];

  useEffect(() => {
    navigation.setOptions({
      title: racerName || 'Racer Details',
      headerStyle: {
        backgroundColor: colors.primary,
      },
      headerTintColor: '#fff',
      headerTitleStyle: {
        fontWeight: 'bold',
      },
    });
  }, [navigation, racerName, colors.primary]);

  useEffect(() => {
    fetchRacerDetails();
  }, [racerId]);

  const fetchRacerDetails = async () => {
    try {
      setLoading(true);
      
      await Promise.all([
        fetchRacerStats(),
        fetchRacerRaceLog()
      ]);
      
    } catch (error) {
      console.error('Error fetching racer details:', error);
      Alert.alert('Error', 'Failed to fetch racer details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchRacerStats = async () => {
    try {
      // Fetch driver standings to get stats
      const response = await fetch('https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2025/types/2/standings/0');
      const data = await response.json();
      
      if (data?.standings) {
        const driverStanding = data.standings.find(standing => {
          return standing.athlete?.id === racerId || 
                 standing.athlete?.displayName === racerName ||
                 standing.athlete?.name === racerName;
        });
        
        if (driverStanding) {
          // Get detailed athlete information
          const athleteResponse = await fetch(driverStanding.athlete.$ref);
          const athleteData = await athleteResponse.json();
          
          // Get team information
          let teamName = 'Unknown Team';
          let teamColorHex = teamColor || '#000000';
          
          try {
            if (athleteData.eventLog?.$ref) {
              const eventLogResponse = await fetch(athleteData.eventLog.$ref);
              const eventLogData = await eventLogResponse.json();
              
              if (eventLogData.items?.[0]?.team) {
                teamName = eventLogData.items[0].team.displayName || eventLogData.items[0].team.name;
                teamColorHex = eventLogData.items[0].team.color ? 
                  (eventLogData.items[0].team.color.startsWith('#') ? 
                    eventLogData.items[0].team.color : 
                    `#${eventLogData.items[0].team.color}`) : 
                  teamColor || '#000000';
              }
            }
          } catch (teamError) {
            console.error('Error fetching team info:', teamError);
          }
          
          // Find position in standings
          const position = data.standings.findIndex(s => s.athlete?.id === racerId) + 1;
          
          setRacerData({
            id: athleteData.id,
            name: athleteData.displayName || athleteData.name,
            firstName: athleteData.firstName || '',
            lastName: athleteData.lastName || '',
            nationality: athleteData.citizenship || '',
            birthDate: athleteData.dateOfBirth || '',
            headshot: buildESPNHeadshotUrl(athleteData.id),
            team: {
              name: teamName,
              color: teamColorHex
            },
            position: position || 0,
            points: driverStanding.records?.[0]?.stats?.find(stat => stat.name === 'championshipPts')?.displayValue || '0',
            wins: driverStanding.records?.[0]?.stats?.find(stat => stat.name === 'wins')?.displayValue || '0',
            podiums: driverStanding.records?.[0]?.stats?.find(stat => stat.name === 'top5')?.displayValue || '0',
            polePositions: driverStanding.records?.[0]?.stats?.find(stat => stat.name === 'poles')?.displayValue || '0',
            fastestLaps: driverStanding.records?.[0]?.stats?.find(stat => stat.name === 'fastestLaps')?.displayValue || '0',
            dnfs: driverStanding.records?.[0]?.stats?.find(stat => stat.name === 'dnfs')?.displayValue || '0'
          });
        }
      }
    } catch (error) {
      console.error('Error fetching racer stats:', error);
    }
  };

  const fetchRacerRaceLog = async () => {
    try {
      // Fetch recent races/events for race log
      const response = await fetch('https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2025/types/2/events');
      const data = await response.json();
      
      if (data?.items) {
        const recentRaces = data.items.slice(0, 15); // Get last 15 races
        const raceLogData = [];
        
        for (const raceRef of recentRaces) {
          try {
            const raceResponse = await fetch(raceRef.$ref);
            const raceData = await raceResponse.json();
            
            // Get competition results for this race
            if (raceData.competitions?.[0]?.$ref) {
              const compResponse = await fetch(`${raceData.competitions[0].$ref}/competitors`);
              const compData = await compResponse.json();
              
              // Find this driver's result
              const driverResult = compData.items?.find(comp => 
                comp.athlete?.id === racerId ||
                comp.athlete?.displayName === racerName ||
                comp.athlete?.name === racerName
              );
              
              if (driverResult) {
                // Get additional race statistics if available
                let gap = '';
                let fastestLap = '';
                let grid = '';
                
                if (driverResult.statistics) {
                  const gapStat = driverResult.statistics.find(stat => stat.name === 'gap' || stat.name === 'behind');
                  const fastestLapStat = driverResult.statistics.find(stat => stat.name === 'fastestLap');
                  const gridStat = driverResult.statistics.find(stat => stat.name === 'grid' || stat.name === 'startPosition');
                  
                  gap = gapStat?.displayValue || '';
                  fastestLap = fastestLapStat?.displayValue || '';
                  grid = gridStat?.displayValue || '';
                }
                
                raceLogData.push({
                  id: raceData.id,
                  name: raceData.name,
                  date: raceData.date,
                  venue: raceData.competitions?.[0]?.venue?.fullName || 'Unknown Venue',
                  position: driverResult.order || driverResult.rank || 'DNF',
                  points: driverResult.statistics?.find(stat => stat.name === 'points')?.displayValue || '0',
                  gap: gap,
                  fastestLap: fastestLap,
                  grid: grid,
                  status: driverResult.status || 'Finished'
                });
              }
            }
          } catch (raceError) {
            console.error('Error fetching race data:', raceError);
          }
        }
        
        // Sort by date (most recent first)
        raceLogData.sort((a, b) => new Date(b.date) - new Date(a.date));
        setRaceLog(raceLogData);
      }
    } catch (error) {
      console.error('Error fetching race log:', error);
    }
  };

  // Build ESPN headshot URL
  const buildESPNHeadshotUrl = (athleteId) => {
    if (!athleteId) return null;
    return `https://a.espncdn.com/i/headshots/rpm/players/full/${athleteId}.png`;
  };

  // Helper to get initials
  const getInitials = (firstName = '', lastName = '') => {
    const first = firstName?.trim()?.[0] || '';
    const last = lastName?.trim()?.[0] || '';
    return (first + last).toUpperCase() || '--';
  };

  // Helper to format age from birth date
  const getAge = (birthDate) => {
    if (!birthDate) return '';
    const age = new Date().getFullYear() - new Date(birthDate).getFullYear();
    return age > 0 ? `${age} years` : '';
  };

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetchRacerDetails();
  }, []);

  const renderStatsTab = () => (
    <View style={styles.tabContent}>
      {racerData ? (
        <>
          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text allowFontScaling={false} style={[styles.statValue, { color: theme.text }]}>
                {racerData.points}
              </Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>
                Championship Points
              </Text>
            </View>
            
            <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text allowFontScaling={false} style={[styles.statValue, { color: theme.text }]}>
                {racerData.wins}
              </Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>
                Wins
              </Text>
            </View>
            
            <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text allowFontScaling={false} style={[styles.statValue, { color: theme.text }]}>
                {racerData.podiums}
              </Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>
                Top 5 Finishes
              </Text>
            </View>
            
            <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text allowFontScaling={false} style={[styles.statValue, { color: theme.text }]}>
                {racerData.polePositions}
              </Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>
                Pole Positions
              </Text>
            </View>
            
            <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text allowFontScaling={false} style={[styles.statValue, { color: theme.text }]}>
                {racerData.fastestLaps}
              </Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>
                Fastest Laps
              </Text>
            </View>
            
            <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text allowFontScaling={false} style={[styles.statValue, { color: theme.text }]}>
                {racerData.dnfs}
              </Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>
                DNFs
              </Text>
            </View>
          </View>
        </>
      ) : (
        <Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.textSecondary }]}>
          No racer data available
        </Text>
      )}
    </View>
  );

  const renderRaceLogTab = () => (
    <View style={styles.tabContent}>
      {raceLog.length > 0 ? (
        <FlatList
          data={raceLog}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={[styles.raceLogItem, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.raceHeader}>
                <View style={styles.raceInfo}>
                  <Text allowFontScaling={false} style={[styles.raceName, { color: theme.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.raceVenue, { color: theme.textSecondary }]} numberOfLines={1}>
                    {item.venue}
                  </Text>
                </View>
                <Text allowFontScaling={false} style={[styles.raceDate, { color: theme.textSecondary }]}>
                  {new Date(item.date).toLocaleDateString()}
                </Text>
              </View>
              
              <View style={styles.raceResults}>
                <View style={styles.resultRow}>
                  <View style={styles.resultItem}>
                    <Text allowFontScaling={false} style={[styles.resultLabel, { color: theme.textSecondary }]}>
                      Position
                    </Text>
                    <Text allowFontScaling={false} style={[styles.resultValue, { color: theme.text }]}>
                      {typeof item.position === 'number' ? `P${item.position}` : item.position}
                    </Text>
                  </View>
                  
                  <View style={styles.resultItem}>
                    <Text allowFontScaling={false} style={[styles.resultLabel, { color: theme.textSecondary }]}>
                      Points
                    </Text>
                    <Text allowFontScaling={false} style={[styles.resultValue, { color: theme.text }]}>
                      {item.points}
                    </Text>
                  </View>
                  
                  {item.grid && (
                    <View style={styles.resultItem}>
                      <Text allowFontScaling={false} style={[styles.resultLabel, { color: theme.textSecondary }]}>
                        Grid
                      </Text>
                      <Text allowFontScaling={false} style={[styles.resultValue, { color: theme.text }]}>
                        {item.grid}
                      </Text>
                    </View>
                  )}
                </View>
                
                {(item.gap || item.fastestLap) && (
                  <View style={styles.resultRow}>
                    {item.gap && (
                      <View style={styles.resultItem}>
                        <Text allowFontScaling={false} style={[styles.resultLabel, { color: theme.textSecondary }]}>
                          Gap
                        </Text>
                        <Text allowFontScaling={false} style={[styles.resultValue, { color: theme.text }]}>
                          {item.gap}
                        </Text>
                      </View>
                    )}
                    
                    {item.fastestLap && (
                      <View style={styles.resultItem}>
                        <Text allowFontScaling={false} style={[styles.resultLabel, { color: theme.textSecondary }]}>
                          Fastest Lap
                        </Text>
                        <Text allowFontScaling={false} style={[styles.resultValue, { color: theme.text }]}>
                          {item.fastestLap}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </View>
          )}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.textSecondary }]}>
          No race log data available
        </Text>
      )}
    </View>
  );

  const renderTabContent = () => {
    switch (selectedTab) {
      case 'STATS':
        return renderStatsTab();
      case 'RACE_LOG':
        return renderRaceLogTab();
      default:
        return renderStatsTab();
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    racerHeaderSection: {
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 3.84,
      elevation: 5,
    },
    racerHeaderContent: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 20,
    },
    racerHeaderImageContainer: {
      marginRight: 16,
    },
    racerHeaderImage: {
      width: 80,
      height: 80,
      borderRadius: 40,
      borderWidth: 3,
    },
    racerHeaderImagePlaceholder: {
      width: 80,
      height: 80,
      borderRadius: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    racerHeaderInitials: {
      fontSize: 24,
      fontWeight: 'bold',
      color: '#fff',
    },
    racerHeaderInfo: {
      flex: 1,
    },
    racerHeaderName: {
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 4,
    },
    racerHeaderTeam: {
      fontSize: 16,
      marginBottom: 2,
    },
    racerHeaderNationality: {
      fontSize: 14,
      marginBottom: 8,
    },
    racerHeaderColorBar: {
      height: 4,
      width: 120,
      borderRadius: 2,
    },
    racerHeaderPosition: {
      alignItems: 'center',
      paddingLeft: 16,
    },
    racerHeaderPositionNumber: {
      fontSize: 32,
      fontWeight: 'bold',
    },
    racerHeaderPositionLabel: {
      fontSize: 12,
      marginTop: 4,
    },
    tabContainer: {
      flexDirection: 'row',
      backgroundColor: theme.surface,
      marginHorizontal: 20,
      marginVertical: 15,
      borderRadius: 8,
      padding: 4,
    },
    tabButton: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      borderRadius: 6,
    },
    activeTabButton: {
      backgroundColor: colors.primary,
    },
    tabButtonText: {
      fontSize: 14,
      fontWeight: '600',
    },
    activeTabButtonText: {
      color: '#fff',
    },
    inactiveTabButtonText: {
      color: theme.textSecondary,
    },
    tabContent: {
      flex: 1,
      paddingHorizontal: 20,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 10,
      fontSize: 16,
      color: theme.textSecondary,
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    statCard: {
      width: (width - 60) / 2,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      alignItems: 'center',
    },
    statValue: {
      fontSize: 28,
      fontWeight: 'bold',
      marginBottom: 4,
    },
    statLabel: {
      fontSize: 12,
      textAlign: 'center',
    },
    raceLogItem: {
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
    },
    raceHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    raceInfo: {
      flex: 1,
      marginRight: 12,
    },
    raceName: {
      fontSize: 16,
      fontWeight: 'bold',
      marginBottom: 2,
    },
    raceVenue: {
      fontSize: 12,
    },
    raceDate: {
      fontSize: 12,
      textAlign: 'right',
    },
    raceResults: {
      gap: 8,
    },
    resultRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    resultItem: {
      flex: 1,
      alignItems: 'center',
    },
    resultLabel: {
      fontSize: 10,
      marginBottom: 2,
    },
    resultValue: {
      fontSize: 14,
      fontWeight: 'bold',
    },
    placeholderText: {
      fontSize: 16,
      textAlign: 'center',
      marginTop: 40,
    },
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.tabContainer}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tabButton,
                selectedTab === tab.key && styles.activeTabButton,
              ]}
              onPress={() => setSelectedTab(tab.key)}
            >
              <Text allowFontScaling={false}
                style={[
                  styles.tabButtonText,
                  selectedTab === tab.key
                    ? styles.activeTabButtonText
                    : styles.inactiveTabButtonText,
                ]}
              >
                {tab.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text allowFontScaling={false} style={styles.loadingText}>Loading Racer Details...</Text>
        </View>
      </View>
    );
  }

  const renderRacerHeader = () => (
    <View style={[styles.racerHeaderSection, { backgroundColor: theme.surface }]}>
      <View style={styles.racerHeaderContent}>
        <View style={styles.racerHeaderImageContainer}>
          {racerData?.headshot ? (
            <Image 
              source={{ uri: racerData.headshot }} 
              style={[styles.racerHeaderImage, { borderColor: racerData.team?.color || teamColor }]}
            />
          ) : (
            <View style={[styles.racerHeaderImagePlaceholder, { backgroundColor: racerData?.team?.color || teamColor || theme.border }]}>
              <Text allowFontScaling={false} style={styles.racerHeaderInitials}>
                {racerData ? getInitials(racerData.firstName, racerData.lastName) : getInitials('', '')}
              </Text>
            </View>
          )}
        </View>
        
        <View style={styles.racerHeaderInfo}>
          <Text allowFontScaling={false} style={[styles.racerHeaderName, { color: theme.text }]}>
            {racerData?.name || racerName || 'Racer'}
          </Text>
          <Text allowFontScaling={false} style={[styles.racerHeaderTeam, { color: theme.textSecondary }]}>
            {racerData?.team?.name || 'Team'}
          </Text>
          {racerData?.nationality && (
            <Text allowFontScaling={false} style={[styles.racerHeaderNationality, { color: theme.textSecondary }]}>
              {racerData.nationality} {racerData.birthDate && `• ${getAge(racerData.birthDate)}`}
            </Text>
          )}
          {racerData?.team?.color && (
            <View style={[styles.racerHeaderColorBar, { backgroundColor: racerData.team.color }]} />
          )}
        </View>
        
        {racerData?.position && (
          <View style={styles.racerHeaderPosition}>
            <Text allowFontScaling={false} style={[styles.racerHeaderPositionNumber, { color: theme.text }]}>
              {racerData.position}
            </Text>
            <Text allowFontScaling={false} style={[styles.racerHeaderPositionLabel, { color: theme.textSecondary }]}>
              POSITION
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {renderRacerHeader()}
      
      <View style={styles.tabContainer}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tabButton,
              selectedTab === tab.key && styles.activeTabButton,
            ]}
            onPress={() => setSelectedTab(tab.key)}
          >
            <Text allowFontScaling={false}
              style={[
                styles.tabButtonText,
                selectedTab === tab.key
                  ? styles.activeTabButtonText
                  : styles.inactiveTabButtonText,
              ]}
            >
              {tab.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {renderTabContent()}
      </ScrollView>
    </View>
  );
};

export default RacerDetailsScreen;
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
      // Prefer the athlete records endpoint which contains headshot, team, and stats
      const currentYear = new Date().getFullYear();
      const url = `https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/${currentYear}/types/2/athletes/${racerId}/records/0?lang=en&region=us`;
      const apiResponse = await fetch(url);
      
      if (!apiResponse.ok) {
        throw new Error(`HTTP ${apiResponse.status}`);
      }
      
      const data = await apiResponse.json();
      
      // Validate that we have relevant data
      console.log('Validating F1 racer records data:', data);
      if (!(data && (data.records || data.athlete || data.stats))) {
        throw new Error('No racer records data found');
      }
      
      const response = { data, year: currentYear };
      const records = response?.data || response;

      // Debug logging to see response structure
      console.log(`[RacerDetails] ESPN records for ${racerId}:`, JSON.stringify(records, null, 2));

      // records may include an athlete object and records[0] with stats, or stats directly
      const recordItem = records?.records?.[0] || records;
      const athlete = records?.athlete || recordItem?.athlete || { id: racerId, displayName: racerName };
      
      // If records has stats directly, use those
      const statsArray = records?.stats || recordItem?.stats || recordItem?.statistics || [];

      // Extract team info from recordItem or fallback to provided teamColor
      let teamName = 'Unknown Team';
      let teamColorHex = teamColor || '#000000';
      
      // Try multiple sources for team info
      if (recordItem?.team) {
        teamName = recordItem.team.displayName || recordItem.team.name || teamName;
        if (recordItem.team.color) {
          teamColorHex = recordItem.team.color.startsWith('#') ? recordItem.team.color : `#${recordItem.team.color}`;
        }
      } else if (athlete?.team) {
        teamName = athlete.team.displayName || athlete.team.name || teamName;
        if (athlete.team.color) {
          teamColorHex = athlete.team.color.startsWith('#') ? athlete.team.color : `#${athlete.team.color}`;
        }
      } else if (records?.team) {
        teamName = records.team.displayName || records.team.name || teamName;
        if (records.team.color) {
          teamColorHex = records.team.color.startsWith('#') ? records.team.color : `#${records.team.color}`;
        }
      }
      
      // Try extra fallbacks when team name isn't present but color is
      if ((!teamName || teamName === 'Unknown Team') && teamColorHex) {
        // Check alternative team fields
        const altTeamName = recordItem?.team?.shortName || recordItem?.team?.abbr || recordItem?.team?.organization?.displayName || athlete?.team?.shortName || athlete?.team?.abbr || records?.team?.shortName;
        if (altTeamName) teamName = altTeamName;

        // Map known team colors to team names as a last resort
        const COLOR_TO_TEAM = {
          '#27f4d2': 'Mercedes',
          '#3671c6': 'Red Bull',
          '#e8002d': 'Ferrari',
          '#ff8000': 'McLaren',
          '#ff87bc': 'Alpine',
          '#6692ff': 'Racing Bulls',
          '#64c4ff': 'Williams',
          '#52e252': 'Sauber',
          '#b6babd': 'Haas'
        };

        const normalized = (teamColorHex || '').toLowerCase();
        if (COLOR_TO_TEAM[normalized]) {
          teamName = COLOR_TO_TEAM[normalized];
        }
      }

      console.log(`[RacerDetails] Extracted team: ${teamName}, color: ${teamColorHex}`);

      // Try to get headshot from athlete info if present; otherwise use ESPN headshot URL
      let headshotUrl = buildESPNHeadshotUrl(athlete.id);
      if (athlete?.images && Array.isArray(athlete.images)) {
        const img = athlete.images.find(i => i && (i.rel === 'full' || i.rel === 'profile' || i.type === 'headshot')) || athlete.images[0];
        if (img?.url) headshotUrl = img.url;
      }

      // Helper to extract a named stat from the stats array
      const statValue = (name) => {
        return statsArray?.find(s => s.name === name)?.displayValue
          || recordItem?.stats?.find(s => s.name === name)?.displayValue
          || recordItem?.statistics?.find(s => s.name === name)?.displayValue
          || '0';
      };

      // Position might be present on the record or elsewhere; default to 0
      const position = recordItem?.position || 0;

      setRacerData({
        id: athlete.id,
        name: athlete.displayName || athlete.name || racerName,
        firstName: athlete.firstName || '',
        lastName: athlete.lastName || '',
        nationality: athlete.citizenship || athlete.nationality || '',
        birthDate: athlete.dateOfBirth || athlete.birthDate || '',
        headshot: headshotUrl,
        team: {
          name: teamName,
          color: teamColorHex
        },
        position: position || 0,
        rank: statValue('rank'),
        points: statValue('championshipPts'),
        wins: statValue('wins'),
        podiums: statValue('top5'),
        polePositions: statValue('poles'),
        starts: statValue('starts'),
        dnfs: statValue('dnf'),
        top10: statValue('top10')
      });

    } catch (error) {
      console.error('Error fetching racer stats (records endpoint):', error);
      // Fallback: attempt previous approach via standings endpoint
      try {
        const currentYear = new Date().getFullYear();
        const url = `https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/${currentYear}/types/2/standings/0`;
        const apiResponse = await fetch(url);
        
        if (!apiResponse.ok) {
          throw new Error(`HTTP ${apiResponse.status}`);
        }
        
        const standingsData = await apiResponse.json();
        
        // Validate that we have relevant data
        console.log('Validating F1 driver standings data:', standingsData);
        if (!(standingsData.standings && standingsData.standings.length > 0)) {
          throw new Error('No driver standings data found');
        }
        
        const response = { data: standingsData, year: currentYear };
        const data = response?.data || response;
        if (data?.standings) {
          const driverStanding = data.standings.find(standing => {
            return standing.athlete?.id === racerId || 
                   standing.athlete?.displayName === racerName ||
                   standing.athlete?.name === racerName;
          });
          if (driverStanding) {
            const athleteResponse = await fetch(driverStanding.athlete.$ref);
            const athleteData = await athleteResponse.json();
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
                name: 'Unknown Team',
                color: teamColor || '#000000'
              },
              position: position || 0,
              rank: driverStanding.records?.[0]?.stats?.find(stat => stat.name === 'rank')?.displayValue || '0',
              points: driverStanding.records?.[0]?.stats?.find(stat => stat.name === 'championshipPts')?.displayValue || '0',
              wins: driverStanding.records?.[0]?.stats?.find(stat => stat.name === 'wins')?.displayValue || '0',
              podiums: driverStanding.records?.[0]?.stats?.find(stat => stat.name === 'top5')?.displayValue || '0',
              polePositions: driverStanding.records?.[0]?.stats?.find(stat => stat.name === 'poles')?.displayValue || '0',
              starts: driverStanding.records?.[0]?.stats?.find(stat => stat.name === 'starts')?.displayValue || '0',
              dnfs: driverStanding.records?.[0]?.stats?.find(stat => stat.name === 'dnf')?.displayValue || '0',
              top10: driverStanding.records?.[0]?.stats?.find(stat => stat.name === 'top10')?.displayValue || '0',
            });
          }
        }
      } catch (err) {
        console.error('Fallback error fetching racer stats:', err);
      }
    }
  };

  const fetchRacerRaceLog = async () => {
    try {
      // First fetch the athlete data to get the eventLog $ref
      const currentYear = new Date().getFullYear();
      const url = `https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/${currentYear}/athletes/${racerId}?lang=en&region=us`;
      const apiResponse = await fetch(url);
      
      if (!apiResponse.ok) {
        throw new Error(`HTTP ${apiResponse.status}`);
      }
      
      const athleteRawData = await apiResponse.json();
      
      // Validate that we have relevant data
      console.log('Validating F1 athlete data:', athleteRawData);
      if (!(athleteRawData && athleteRawData.id)) {
        throw new Error('No athlete data found');
      }
      
      const athleteResponse = { data: athleteRawData, year: currentYear };
      const athleteData = athleteResponse?.data || athleteResponse;
      
      console.log(`[RacerDetails] Athlete data for ${racerId}:`, JSON.stringify(athleteData, null, 2));
      
      if (!athleteData?.eventLog?.$ref) {
        console.warn(`[RacerDetails] No eventLog found for athlete ${racerId}`);
        return;
      }
      
      // Fetch the eventLog to get list of events
      const eventLogResponse = await fetch(athleteData.eventLog.$ref);
      const eventLogData = await eventLogResponse.json();
      
      console.log(`[RacerDetails] EventLog data:`, JSON.stringify(eventLogData, null, 2));
      
      if (!eventLogData?.events?.items) {
        console.warn(`[RacerDetails] No events found in eventLog`);
        return;
      }
      
      const raceLogData = [];
      const events = eventLogData.events.items.slice(0, 24); // Get last 15 events
      
      for (const eventItem of events) {
        try {
          // Only process events that have been played
          if (!eventItem.played) continue;
          
          // Fetch the event details
          const eventResponse = await fetch(eventItem.event.$ref);
          const eventData = await eventResponse.json();

          const venueResponse = await fetch(eventData.venues[0].$ref);
          const venueData = await venueResponse.json();

          // Fetch the statistics for this specific event and athlete
          if (eventItem.statistics?.$ref) {
            const statsResponse = await fetch(eventItem.statistics.$ref);
            const statsData = await statsResponse.json();
            
            console.log(`[RacerDetails] Stats for event ${eventItem.eventId}:`, JSON.stringify(statsData, null, 2));
            
            // Extract the required stats from the statistics structure (like c3.txt)
            const stats = statsData?.splits?.categories?.[0]?.stats || [];
            
            const findStat = (statName) => {
              const stat = stats.find(s => s.name === statName);
              return stat?.displayValue || stat?.value || '';
            };
            
            const lapsCompleted = findStat('lapsCompleted');
            const behindLaps = findStat('behindLaps');
            const totalTime = findStat('totalTime') || findStat('time');
            const place = findStat('place');
            
            // Prefer endDate for sorting if available, fall back to start date
            const sortDate = eventData.endDate || eventData.date;
            raceLogData.push({
              id: eventItem.eventId,
              name: eventData.name || 'Unknown Race',
              date: `${formatEventDate(eventData.date)}\n${formatEventDate(eventData.endDate)}`,
              sortDate,
              venue: venueData.fullName || 'Unknown Venue',
              countryFlag: venueData.countryFlag?.href || '',
              racerName: athleteData.displayName || athleteData.name || racerName,
              lapsCompleted: lapsCompleted || '-',
              behindOrTotal: behindLaps ? `+${behindLaps} Laps` : totalTime ? totalTime : '-',
              place: place || '-'
            });
          }
        } catch (eventError) {
          console.error(`Error processing event ${eventItem.eventId}:`, eventError);
        }
      }
      
  // Sort by sortDate (most recent first). sortDate prefers endDate when available
  raceLogData.sort((a, b) => new Date(b.sortDate || b.date) - new Date(a.sortDate || a.date));
      setRaceLog(raceLogData);
      
      console.log(`[RacerDetails] Final race log data:`, JSON.stringify(raceLogData, null, 2));
      
    } catch (error) {
      console.error('Error fetching race log:', error);
    }
  };

  // Build ESPN headshot URL
  const buildESPNHeadshotUrl = (athleteId) => {
    if (!athleteId) return null;
    return `https://a.espncdn.com/i/headshots/rpm/players/full/${athleteId}.png`;
  };

  // Racer header image with fallback to initials (mirrors DriverImage behavior)
  const RacerHeaderImage = ({ racer, teamColor }) => {
    const [imageError, setImageError] = useState(false);
    const headshot = racer?.headshot;

    useEffect(() => {
      setImageError(false);
    }, [headshot]);

    if (!headshot || imageError) {
      return (
        <View style={[styles.racerHeaderImagePlaceholder, { backgroundColor: racer?.team?.color || teamColor || theme.border }]}> 
          <Text allowFontScaling={false} style={styles.racerHeaderInitials}>
            {getInitials(racer?.firstName || '', racer?.lastName || '', racer?.name || racerName || '')}
          </Text>
        </View>
      );
    }

    return (
      <Image
        source={{ uri: headshot }}
        style={[styles.racerHeaderImage, { borderColor: racer?.team?.color || teamColor || theme.border }]}
        onError={() => setImageError(true)}
      />
    );
  };

  // Helper to get initials
  const getInitials = (firstName = '', lastName = '', fullName = '') => {
    const first = firstName?.trim()?.[0] || '';
    const last = lastName?.trim()?.[0] || '';
    
    if (first && last) {
      return (first + last).toUpperCase();
    }
    
    // Fallback to splitting fullName if firstName/lastName not available
    if (fullName) {
      const nameParts = fullName.trim().split(' ');
      if (nameParts.length >= 2) {
        return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
      } else if (nameParts.length === 1) {
        return nameParts[0].substring(0, 2).toUpperCase();
      }
    }
    
    return '--';
  };

  const formatEventDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return '';
    const weekday = d.toLocaleString('en-US', { weekday: 'short' });
    const month = d.toLocaleString('en-US', { month: 'short' });
    const day = d.getDate();
    const hours = d.getHours();
    return `${weekday}, ${month} ${day}`;
  };

  // Helper to format age from birth date
  const getAge = (birthDate) => {
    if (!birthDate) return '';
    const age = new Date().getFullYear() - new Date(birthDate).getFullYear();
    return age > 0 ? `${age} years` : '';
  };

  // Build team logo URL with dark/light variants like StandingsScreen
  const getTeamLogo = (teamName) => {
    if (!teamName) return '';

    const nameMap = {
      'McLaren': 'mclaren',
      'Ferrari': 'ferrari',
      'Red Bull': 'redbullracing',
      'Mercedes': 'mercedes',
      'Aston Martin': 'astonmartin',
      'Alpine': 'alpine',
      'Williams': 'williams',
      'RB': 'rb',
      'Haas': 'haas',
      'Sauber': 'kicksauber'
    };

    const logoName = nameMap[teamName] || teamName.toLowerCase().replace(/\s+/g, '');
    const variant = isDarkMode ? 'logowhite' : 'logoblack';
    const currentYear = new Date().getFullYear(); // Use current year for logos
    return `https://media.formula1.com/image/upload/c_fit,h_1080/q_auto/v1740000000/common/f1/${currentYear}/${logoName}/${currentYear}${logoName}${variant}.webp`;
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
                {racerData.rank}
              </Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>
                Rank
              </Text>
            </View>

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
                {racerData.top10}
              </Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>
                Top 10 Finishes
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
                {racerData.starts}
              </Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>
                Starts
              </Text>
            </View>
            
            <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text allowFontScaling={false} style={[styles.statValue, { color: theme.text }]}>
                {racerData.dnfs}
              </Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>
                DNF{racerData.dnfs === '1' ? '' : 's'}
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
            <TouchableOpacity 
              style={[styles.raceLogItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => navigation.navigate('F1RaceDetails', { 
                raceId: item.id,
                eventId: item.id,
                raceName: item.name,
                raceDate: item.sortDate || item.date,
                sport: 'f1'
              })}
            >
              <View style={styles.raceHeader}>
                <View style={styles.raceInfo}>
                  <Text allowFontScaling={false} style={[styles.raceName, { color: theme.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {item.countryFlag ? (
                      <Image
                        source={{ uri: item.countryFlag }}
                        style={{ width: 20, height: 20, marginRight: 6 }}
                        resizeMode="contain"
                      />
                    ) : null}
                    <Text
                      allowFontScaling={false}
                      style={[styles.raceVenue, { color: theme.textSecondary }]}
                      numberOfLines={1}
                    >
                      {item.venue}
                    </Text>
                  </View>
                </View>
                <Text allowFontScaling={false} style={[styles.raceDate, { color: theme.textSecondary }]}>
                  {item.date}
                </Text>
              </View>
              
              {/* Racer name and stats section */}
              <View style={{ paddingTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  {/* Team logo next to racer name */}
                  <Image
                    source={{ uri: getTeamLogo(racerData?.team?.name) }}
                    style={styles.raceLogTeamLogo}
                    onError={() => { /* ignore failures, keep name visible */ }}
                  />
                  <Text allowFontScaling={false} style={[styles.racerNameInLog, { color: theme.text, marginLeft: 8 }]}>
                    {item.racerName}
                  </Text>
                </View>
                
                <View style={[styles.resultRow, { marginTop: 8 }]}>
                  <View style={styles.resultItem}>
                    <Text allowFontScaling={false} style={[styles.resultLabel, { color: theme.textSecondary }]}>
                      Laps
                    </Text>
                    <Text allowFontScaling={false} style={[styles.resultValue, { color: theme.text }]}>
                      {item.lapsCompleted}
                    </Text>
                  </View>
                  
                  <View style={styles.resultItem}>
                    <Text allowFontScaling={false} style={[styles.resultLabel, { color: theme.textSecondary }]}>
                      Time
                    </Text>
                    <Text allowFontScaling={false} style={[styles.resultValue, { color: theme.text }]}>
                      {item.behindOrTotal}
                    </Text>
                  </View>
                  
                  <View style={styles.resultItem}>
                    <Text allowFontScaling={false} style={[styles.resultLabel, { color: theme.textSecondary }]}>
                      Place
                    </Text>
                    <Text allowFontScaling={false} style={[styles.resultValue, { color: theme.text }]}>
                      {item.place}
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
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
    teamLogo: {
      width: 56,
      height: 56,
      resizeMode: 'contain',
      borderRadius: 8,
    },
    teamLogoPlaceholder: {
      width: 56,
      height: 56,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
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
    racerNameInLog: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 4,
    },
    raceLogTeamLogo: {
      width: 28,
      height: 28,
      resizeMode: 'contain',
      borderRadius: 4,
      backgroundColor: 'transparent'
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
          <RacerHeaderImage racer={racerData} teamColor={teamColor} />
        </View>
        
        <View style={styles.racerHeaderInfo}>
          <Text allowFontScaling={false} style={[styles.racerHeaderName, { color: theme.text }]}>
            {racerData?.name || racerName || 'Racer'}
          </Text>
          <Text allowFontScaling={false} style={[styles.racerHeaderTeam, { color: theme.textSecondary }]}>
            {racerData?.team?.name || racerData?.team?.displayName || 'Unknown Team'}
          </Text>
          {racerData?.team?.name && (
            <View style={{ height: 3, width: 120, marginTop: 6, backgroundColor: racerData.team.color }} />
          )}
          {racerData?.nationality && (
            <Text allowFontScaling={false} style={[styles.racerHeaderNationality, { color: theme.textSecondary }]}>
              {racerData.nationality} {racerData.birthDate && `• ${getAge(racerData.birthDate)}`}
            </Text>
          )}
          {racerData?.team?.color && (
            <View style={[styles.racerHeaderColorBar, { backgroundColor: racerData.team.color }]} />
          )}
        </View>
        
        {(
          (() => {
            const teamName = racerData?.team?.name || racerData?.team?.displayName || '';
            const logoUrl = getTeamLogo(teamName);
            if (teamName && logoUrl) {
              return (
                <View style={styles.racerHeaderPosition}>
                  <Image source={{ uri: logoUrl }} style={styles.teamLogo} />
                </View>
              );
            }
            // Fallback to position number or initials
            if (racerData?.position) {
              return (
                <View style={styles.racerHeaderPosition}>
                  <Text allowFontScaling={false} style={[styles.racerHeaderPositionNumber, { color: theme.text }]}>
                    {racerData.position}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.racerHeaderPositionLabel, { color: theme.textSecondary }]}>
                    POSITION
                  </Text>
                </View>
              );
            }
            return (
              <View style={styles.racerHeaderPosition}>
                <View style={[styles.teamLogoPlaceholder, { backgroundColor: racerData?.team?.color || teamColor || theme.border }]}>
                  <Text allowFontScaling={false} style={[styles.racerHeaderPositionNumber, { color: '#fff' }]}>
                    {getInitials(racerData?.firstName || '', racerData?.lastName || '', racerData?.name || racerName || '')}
                  </Text>
                </View>
              </View>
            );
          })()
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
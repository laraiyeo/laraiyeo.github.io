import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BackendMLBService } from '../../services/BackendMLBService';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';
import { convertMLBIdToESPNId, ESPN_ABBREVIATION_TO_MLB_ID, ESPN_ABBREVIATION_TO_ESPN_ID } from '../../utils/TeamIdMapping';

const StandingsScreen = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const { isFavorite } = useFavorites();
  const [standings, setStandings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [intervalId, setIntervalId] = useState(null);
  const [usingBackend, setUsingBackend] = useState(true);
  const [backendError, setBackendError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const navigation = useNavigation();

  // Initialize backend service
  useEffect(() => {
    const initializeBackend = async () => {
      try {
        console.log('StandingsScreen: Initializing backend service...');
        await BackendMLBService.initialize([]);
        console.log('StandingsScreen: Backend service initialized successfully');
        setIsInitialized(true);
        setBackendError(null);
        setUsingBackend(true);
      } catch (error) {
        console.error('StandingsScreen: Backend initialization failed:', error);
        setBackendError(error.message);
        setUsingBackend(false);
        setIsInitialized(true);
      }
    };

    initializeBackend();
  }, []);

  useEffect(() => {
    if (!isInitialized) return;

    fetchStandings();
    
    // Focus listener to start updates when screen becomes active
    const unsubscribeFocus = navigation.addListener('focus', () => {
      console.log('Standings screen focused - starting updates');
      fetchStandings();
      const interval = setInterval(fetchStandings, usingBackend ? 60000 : 30000); // 1min for backend, 30s for fallback
      setIntervalId(interval);
    });
    
    // Blur listener to stop updates when screen becomes inactive
    const unsubscribeBlur = navigation.addListener('blur', () => {
      console.log('Standings screen blurred - stopping updates');
      if (intervalId) {
        clearInterval(intervalId);
        setIntervalId(null);
      }
    });
    
    return () => {
      console.log('Standings screen unmounted - cleaning up');
      if (intervalId) {
        clearInterval(intervalId);
      }
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation, intervalId, isInitialized, usingBackend]);

  const fetchStandings = async () => {
    if (!isInitialized) {
      console.log('StandingsScreen: Not initialized yet, skipping fetch');
      return;
    }

    try {
      console.log('StandingsScreen: Fetching standings, usingBackend:', usingBackend);

      if (usingBackend) {
        // Try to get standings from backend first
        try {
          const backendStandings = await BackendMLBService.getStandings();
          console.log('StandingsScreen: Got standings from backend:', backendStandings?.data?.records?.length || 0);
          
          if (backendStandings && backendStandings.data && backendStandings.data.records && backendStandings.data.records.length > 0) {
            // Transform backend data to expected format
            setStandings({ content: { standings: { groups: backendStandings.data.records } } });
            setBackendError(null);
            return;
          } else {
            console.log('StandingsScreen: Backend returned empty or invalid standings, falling back to direct API');
          }
        } catch (backendError) {
          console.error('StandingsScreen: Backend standings failed:', backendError);
          setBackendError(backendError.message);
          setUsingBackend(false);
        }
      }

      // Fallback to direct ESPN API
      console.log('StandingsScreen: Using direct ESPN API fallback');
      const response = await fetch('https://cdn.espn.com/core/mlb/standings?xhr=1');
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      
      const data = await response.json();
      setStandings(data);
      
      console.log('StandingsScreen: Successfully fetched from ESPN API');
      
    } catch (error) {
      console.error('StandingsScreen: Error fetching standings:', error);
      
      Alert.alert(
        'Error',
        'Failed to load standings. Please check your connection and try again.',
        [
          { text: 'Retry', onPress: fetchStandings },
          { text: 'OK' }
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  const getESPNTeamId = (espnTeam) => {
    console.log('Team abbreviation:', espnTeam.abbreviation, 'ESPN ID:', espnTeam.id);
    
    // First try abbreviation mapping to get ESPN ID directly
    let espnId = ESPN_ABBREVIATION_TO_ESPN_ID[espnTeam.abbreviation];
    
    // If abbreviation mapping fails, use the ESPN ID from the API response
    if (!espnId) {
      espnId = espnTeam.id?.toString();
      console.log('Using direct ESPN ID from API:', espnId);
    }
    
    if (!espnId) {
      console.warn('No ESPN ID found for team:', espnTeam.abbreviation, 'ESPN API ID:', espnTeam.id);
      return espnTeam.id;
    }
    
    console.log('Final ESPN ID for favorites:', espnId);
    return espnId;
  };

  const getTeamLogo = (teamAbbreviation) => {
    return getTeamLogoUrl('mlb', teamAbbreviation);
  };

  const renderMLBStandings = () => {
    if (!standings?.content?.standings?.groups) return null;

    const groups = standings.content.standings.groups;
    const americanLeague = groups.find(group => group.name === "American League");
    const nationalLeague = groups.find(group => group.name === "National League");

    return (
      <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
        {[americanLeague, nationalLeague].filter(Boolean).map((league, leagueIndex) => (
          <View key={leagueIndex} style={[styles.conferenceContainer, { backgroundColor: theme.surface }]}>
            <Text allowFontScaling={false} style={[styles.conferenceTitle, { color: colors.primary, borderBottomColor: theme.border }]}>{league.name}</Text>
            
            {league.groups.map((division, divIndex) => (
              <View key={divIndex} style={styles.divisionContainer}>
                <Text allowFontScaling={false} style={[styles.divisionTitle, { color: theme.text }]}>{division.name}</Text>
                
                <View style={[styles.tableContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={[styles.tableHeader, { backgroundColor: colors.primary }]}>
                    <Text allowFontScaling={false} style={[styles.headerCell, styles.teamColumn, { color: 'white' }]}>Team</Text>
                    <Text allowFontScaling={false} style={[styles.headerCell, { color: 'white' }]}>W</Text>
                    <Text allowFontScaling={false} style={[styles.headerCell, { color: 'white' }]}>L</Text>
                    <Text allowFontScaling={false} style={[styles.headerCell, { color: 'white' }]}>PCT</Text>
                    <Text allowFontScaling={false} style={[styles.headerCell, { color: 'white' }]}>GB</Text>
                    <Text allowFontScaling={false} style={[styles.headerCell, { color: 'white' }]}>RS</Text>
                    <Text allowFontScaling={false} style={[styles.headerCell, { color: 'white' }]}>RA</Text>
                  </View>
                  
                  {division.standings.entries
                    .sort((a, b) => a.team.seed - b.team.seed)
                    .map((entry, teamIndex) => {
                      const wins = entry.stats.find(stat => stat.name === "wins")?.displayValue || "0";
                      const losses = entry.stats.find(stat => stat.name === "losses")?.displayValue || "0";
                      const winPercent = entry.stats.find(stat => stat.name === "winPercent")?.displayValue || "0.000";
                      const gamesBehind = entry.stats.find(stat => stat.name === "gamesBehind")?.displayValue || "-";
                      const pointsFor = entry.stats.find(stat => stat.name === "pointsFor")?.displayValue || "0";
                      const pointsAgainst = entry.stats.find(stat => stat.name === "pointsAgainst")?.displayValue || "0";
                      console.log('Team entry:', JSON.stringify(entry.team, null, 2)); // Debug log
                      const espnTeamId = getESPNTeamId(entry.team);
                      const clinchCode = entry.team?.clincher ? entry.team.clincher.toUpperCase() : null;
                      const clinchColor = (clinchCode === 'X' || clinchCode === '*') ? theme.success : clinchCode === 'Z' ? theme.warning : clinchCode === 'E' ? theme.error : clinchCode === 'Y' ? theme.info : theme.surface;

                      return (
                        <TouchableOpacity 
                          key={teamIndex} 
                          style={[styles.tableRow, { backgroundColor: theme.surface, borderBottomColor: theme.border, borderLeftColor: clinchColor, borderLeftWidth: clinchCode ? 4 : 0 }]}
                          onPress={() => {
                            console.log('Navigating to team:', espnTeamId, entry.team.abbreviation);
                            navigation.navigate('TeamPage', { teamId: espnTeamId, sport: 'mlb' });
                          }}
                        >
                          <View style={[styles.tableCell, styles.teamColumn]}>
                            <Image 
                              source={{ uri: getTeamLogo(entry.team.abbreviation) }}
                              style={styles.teamLogo}
                              defaultSource={{ uri: `https://via.placeholder.com/20x20?text=MLB` }}
                            />
                            <Text allowFontScaling={false} style={[
                              styles.teamName, 
                              { 
                                color: isFavorite(espnTeamId, 'mlb') ? colors.primary : theme.text 
                              }
                            ]} numberOfLines={1}>
                              <Text allowFontScaling={false} style={[styles.teamSeed, { color: colors.primary }]}>({entry.team.seed}) </Text> 
                              {isFavorite(espnTeamId, 'mlb') && '★ '}
                              {entry.team.shortDisplayName}
                            </Text>
                          </View>
                          <Text allowFontScaling={false} style={[styles.tableCell, { color: theme.text }]}>{wins}</Text>
                          <Text allowFontScaling={false} style={[styles.tableCell, { color: theme.text }]}>{losses}</Text>
                          <Text allowFontScaling={false} style={[styles.tableCell, { color: theme.text }]}>{winPercent}</Text>
                          <Text allowFontScaling={false} style={[styles.tableCell, { color: theme.text }]}>{gamesBehind}</Text>
                          <Text allowFontScaling={false} style={[styles.tableCell, { color: theme.text }]}>{pointsFor}</Text>
                          <Text allowFontScaling={false} style={[styles.tableCell, { color: theme.text }]}>{pointsAgainst}</Text>
                        </TouchableOpacity>
                      );
                    })}
                </View>
              </View>
            ))}
          </View>
          ))}

        {/* Legend for clinch colors */}
        <View style={[styles.legendContainer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <Text allowFontScaling={false} style={[styles.legendTitle, { color: colors.primary }]}>Legend</Text>
          <View style={styles.legendItems}>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: theme.success }]} />
              <Text allowFontScaling={false} style={[styles.legendLabel, { color: theme.text }]}>* - Clinched Best League Record</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: theme.success }]} />
              <Text allowFontScaling={false} style={[styles.legendLabel, { color: theme.text }]}>X - Clinched Division</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: theme.warning }]} />
              <Text allowFontScaling={false} style={[styles.legendLabel, { color: theme.text }]}>Z - Clinched Playoffs</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: theme.info }]} />
              <Text allowFontScaling={false} style={[styles.legendLabel, { color: theme.text }]}>Y - Clinched Wild Card</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: theme.error }]} />
              <Text allowFontScaling={false} style={[styles.legendLabel, { color: theme.text }]}>E - Eliminated</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.textSecondary }]}>Loading standings...</Text>
      </View>
    );
  }

  if (!standings) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.background }]}>
        <Text allowFontScaling={false} style={[styles.errorText, { color: theme.text }]}>Standings not available</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Backend Status Banner */}
      {backendError && (
        <View style={[styles.statusBanner, { backgroundColor: '#ff9800' }]}>
          <Text style={[styles.statusText, { color: '#fff' }]}>
            ⚠️ Using direct API (Backend: {backendError})
          </Text>
        </View>
      )}

      {usingBackend && !backendError && (
        <View style={[styles.statusBanner, { backgroundColor: '#4caf50' }]}>
          <Text style={[styles.statusText, { color: '#fff' }]}>
            ✅ Delta updates active - reduced data usage
          </Text>
        </View>
      )}

      {renderMLBStandings()}
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
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  conferenceContainer: {
    margin: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  conferenceTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  divisionContainer: {
    margin: 10,
  },
  divisionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  tableContainer: {
    borderWidth: 1,
    borderRadius: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  headerCell: {
    flex: 1,
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tableCell: {
    flex: 1,
    fontSize: 12,
    textAlign: 'center',
  },
  teamColumn: {
    flex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  teamLogo: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  teamName: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  teamSeed: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  legendContainer: {
    marginHorizontal: 10,
    marginTop: 12,
    padding: 12,
    borderTopWidth: 1,
    borderRadius: 6,
    marginBottom: 25,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  legendItems: {
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendSwatch: {
    width: 16,
    height: 16,
    borderRadius: 4,
    marginRight: 8,
  },
  legendLabel: {
    fontSize: 12,
  },
  statusBanner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
});

export default StandingsScreen;

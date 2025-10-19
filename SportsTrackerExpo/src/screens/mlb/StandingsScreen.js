import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';
import { convertMLBIdToESPNId, ESPN_ABBREVIATION_TO_MLB_ID, ESPN_ABBREVIATION_TO_ESPN_ID } from '../../utils/TeamIdMapping';

const StandingsScreen = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const { isFavorite } = useFavorites();
  const [standings, setStandings] = useState(null);
  const [loading, setLoading] = useState(false); // Start as false, only show when actually loading
  const [intervalId, setIntervalId] = useState(null);
  const intervalRef = useRef(null); // More reliable interval tracking
  const instanceId = useRef(Math.random().toString(36).substr(2, 9)); // Unique instance ID
  const navigation = useNavigation();

  console.log('MLB Standings instance created:', instanceId.current);

  useEffect(() => {
    console.log('MLB Standings useEffect mount:', instanceId.current);
    
    // Fetch on mount only (like StatsScreen - no background updates)
    fetchStandings();
    
    // No interval - just fetch once and cache the data
    // This prevents any background fetching issues
    
    return () => {
      console.log('MLB Standings useEffect cleanup:', instanceId.current);
      
      // Clean up any existing intervals just in case
      if (intervalRef.current) {
        console.log('MLB Standings: Cleaning up interval on unmount:', instanceId.current);
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (intervalId) {
        console.log('MLB Standings: Cleaning up state interval on unmount:', instanceId.current);
        clearInterval(intervalId);
        setIntervalId(null);
      }
    };
  }, []);

  const fetchStandings = async (silent = false) => {
    console.log('MLB Standings: fetchStandings called, instance:', instanceId.current, 'silent:', silent);
    try {
      // Only show loading for non-silent updates
      if (!silent) {
        setLoading(true);
      }
      
      // Use direct ESPN API
      const response = await fetch('https://cdn.espn.com/core/mlb/standings?xhr=1');
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      
      const data = await response.json();
      setStandings(data);
      
    } catch (error) {
      console.error('StandingsScreen: Error fetching standings:', error);
      
      // Only show alerts for non-silent updates
      if (!silent) {
        Alert.alert(
          'Error',
          'Failed to load standings. Please check your connection and try again.',
          [
            { text: 'Retry', onPress: () => fetchStandings(false) },
            { text: 'OK' }
          ]
        );
      }
    } finally {
      // Only clear loading for non-silent updates
      if (!silent) {
        setLoading(false);
      }
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
});

export default StandingsScreen;

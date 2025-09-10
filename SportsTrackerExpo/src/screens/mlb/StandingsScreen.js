import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';

const StandingsScreen = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const [standings, setStandings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [intervalId, setIntervalId] = useState(null);
  const navigation = useNavigation();

  useEffect(() => {
    fetchStandings();
    
    // Focus listener to start updates when screen becomes active
    const unsubscribeFocus = navigation.addListener('focus', () => {
      console.log('Standings screen focused - starting updates');
      fetchStandings();
      const interval = setInterval(fetchStandings, 30000);
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
  }, [navigation, intervalId]);

  const fetchStandings = async () => {
    try {
      const response = await fetch('https://cdn.espn.com/core/mlb/standings?xhr=1');
      const data = await response.json();
      
      setStandings(data);
    } catch (error) {
      console.error('Error fetching standings:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMLBTeamId = (espnTeam) => {
    // ESPN team abbreviations to MLB team IDs mapping
    const teamMapping = {
      'LAA': '108', 'HOU': '117', 'ATH': '133', 'TOR': '141', 'ATL': '144',
      'MIL': '158', 'STL': '138', 'CHC': '112', 'ARI': '109', 'LAD': '119',
      'SF': '137', 'CLE': '114', 'SEA': '136', 'MIA': '146', 'NYM': '121',
      'WSH': '120', 'BAL': '110', 'SD': '135', 'PHI': '143', 'PIT': '134',
      'TEX': '140', 'TB': '139', 'BOS': '111', 'CIN': '113', 'COL': '115',
      'KC': '118', 'DET': '116', 'MIN': '142', 'CWS': '145', 'NYY': '147',
      // Alternative abbreviations that ESPN might use
      'A': '133',   // Sometimes Athletics use just 'A'
      'AS': '133'   // Alternative Athletics abbreviation
    };

    // ESPN team ID to MLB team ID mapping (as backup)
    const espnIdMapping = {
      '11': '133',  // Athletics ESPN ID 11 -> MLB ID 133
      '12': '117',  // Astros
      '13': '110',  // Orioles
      // Add more as needed
    };
    
    console.log('Team abbreviation:', espnTeam.abbreviation, 'ESPN ID:', espnTeam.id);
    
    // First try abbreviation mapping
    let mlbId = teamMapping[espnTeam.abbreviation];
    
    // If abbreviation mapping fails, try ESPN ID mapping
    if (!mlbId) {
      mlbId = espnIdMapping[espnTeam.id?.toString()];
      console.log('Using ESPN ID mapping for team ID:', espnTeam.id, '-> MLB ID:', mlbId);
    }
    
    if (!mlbId) {
      console.warn('No MLB ID mapping found for team:', espnTeam.abbreviation, 'ESPN ID:', espnTeam.id, 'Using ESPN ID as fallback');
      return espnTeam.id;
    }
    
    console.log('Final MLB ID:', mlbId);
    return mlbId;
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
            <Text style={[styles.conferenceTitle, { color: colors.primary }]}>{league.name}</Text>
            
            {league.groups.map((division, divIndex) => (
              <View key={divIndex} style={styles.divisionContainer}>
                <Text style={[styles.divisionTitle, { color: theme.text }]}>{division.name}</Text>
                
                <View style={[styles.tableContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={[styles.tableHeader, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.headerCell, styles.teamColumn, { color: 'white' }]}>Team</Text>
                    <Text style={[styles.headerCell, { color: 'white' }]}>W</Text>
                    <Text style={[styles.headerCell, { color: 'white' }]}>L</Text>
                    <Text style={[styles.headerCell, { color: 'white' }]}>PCT</Text>
                    <Text style={[styles.headerCell, { color: 'white' }]}>GB</Text>
                    <Text style={[styles.headerCell, { color: 'white' }]}>RS</Text>
                    <Text style={[styles.headerCell, { color: 'white' }]}>RA</Text>
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
                      const mlbTeamId = getMLBTeamId(entry.team);
                      
                      return (
                        <TouchableOpacity 
                          key={teamIndex} 
                          style={[styles.tableRow, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}
                          onPress={() => {
                            console.log('Navigating to team:', mlbTeamId, entry.team.abbreviation);
                            navigation.navigate('TeamPage', { teamId: mlbTeamId, sport: 'mlb' });
                          }}
                        >
                          <View style={[styles.tableCell, styles.teamColumn]}>
                            <Image 
                              source={{ uri: getTeamLogo(entry.team.abbreviation) }}
                              style={styles.teamLogo}
                              defaultSource={{ uri: `https://via.placeholder.com/20x20?text=MLB` }}
                            />
                            <Text style={[styles.teamName, { color: theme.text }]} numberOfLines={1}>
                              <Text style={[styles.teamSeed, { color: colors.primary }]}>({entry.team.seed})</Text> {entry.team.shortDisplayName}
                            </Text>
                          </View>
                          <Text style={[styles.tableCell, { color: theme.text }]}>{wins}</Text>
                          <Text style={[styles.tableCell, { color: theme.text }]}>{losses}</Text>
                          <Text style={[styles.tableCell, { color: theme.text }]}>{winPercent}</Text>
                          <Text style={[styles.tableCell, { color: theme.text }]}>{gamesBehind}</Text>
                          <Text style={[styles.tableCell, { color: theme.text }]}>{pointsFor}</Text>
                          <Text style={[styles.tableCell, { color: theme.text }]}>{pointsAgainst}</Text>
                        </TouchableOpacity>
                      );
                    })}
                </View>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading standings...</Text>
      </View>
    );
  }

  if (!standings) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.text }]}>Standings not available</Text>
      </View>
    );
  }

  return renderMLBStandings();
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
});

export default StandingsScreen;

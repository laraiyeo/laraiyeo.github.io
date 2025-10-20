import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';

const StandingsScreen = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const { isFavorite } = useFavorites();
  const [standings, setStandings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [intervalId, setIntervalId] = useState(null);
  const navigation = useNavigation();

  useEffect(() => {
    // Fetch on mount only (like StatsScreen - no background updates)
    fetchStandings();
    
    // No interval - just fetch once and cache the data like StatsScreen
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
        setIntervalId(null);
      }
    };
  }, []);

  const fetchStandings = async (silent = false) => {
    try {
      // Only show loading for non-silent updates
      if (!silent) {
        setLoading(true);
      }
      
      const response = await fetch('https://cdn.espn.com/core/nfl/standings?xhr=1');
      const data = await response.json();
      
      setStandings(data);
    } catch (error) {
      console.error('Error fetching standings:', error);
    } finally {
      // Only clear loading for non-silent updates
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const getTeamLogo = (teamAbbreviation) => {
    return getTeamLogoUrl('nfl', teamAbbreviation);
  };

  const getNFLTeamId = (espnTeam) => {
    // ESPN team abbreviations to NFL team IDs mapping
    const teamMapping = {
      'BUF': '2', 'MIA': '15', 'NE': '17', 'NYJ': '20',
      'BAL': '33', 'CIN': '4', 'CLE': '5', 'PIT': '23',
      'HOU': '34', 'IND': '11', 'JAX': '30', 'TEN': '10',
      'DEN': '7', 'KC': '12', 'LV': '13', 'LAC': '24',
      'DAL': '6', 'NYG': '19', 'PHI': '21', 'WAS': '28',
      'CHI': '3', 'DET': '8', 'GB': '9', 'MIN': '16',
      'ATL': '1', 'CAR': '29', 'NO': '18', 'TB': '27',
      'ARI': '22', 'LAR': '14', 'SF': '25', 'SEA': '26'
    };

    console.log('Team abbreviation:', espnTeam.abbreviation, 'ESPN ID:', espnTeam.id);
    
    let nflId = teamMapping[espnTeam.abbreviation];
    
    if (!nflId) {
      console.warn('No NFL ID mapping found for team:', espnTeam.abbreviation, 'ESPN ID:', espnTeam.id, 'Using ESPN ID as fallback');
      return espnTeam.id;
    }
    
    console.log('Final NFL ID:', nflId);
    return nflId;
  };

  const renderNFLStandings = () => {
    if (!standings?.content?.standings?.groups) return null;

    const groups = standings.content.standings.groups;
    const afc = groups.find(group => group.name === "American Football Conference");
    const nfc = groups.find(group => group.name === "National Football Conference");

    return (
      <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
        {[afc, nfc].filter(Boolean).map((conference, confIndex) => (
          <View key={confIndex} style={[styles.conferenceContainer, { backgroundColor: theme.surface }]}>
            <Text allowFontScaling={false} style={[styles.conferenceTitle, { color: colors.primary, borderBottomColor: theme.border }]}>{conference.name}</Text>
            
            {conference.groups.map((division, divIndex) => (
              <View key={divIndex} style={styles.divisionContainer}>
                <Text allowFontScaling={false} style={[styles.divisionTitle, { color: theme.text }]}>{division.name}</Text>
                
                <View style={[styles.tableContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={[styles.tableHeader, { backgroundColor: colors.primary }]}>
                    <Text allowFontScaling={false} style={[styles.headerCell, styles.teamColumn, { color: 'white' }]}>Team</Text>
                    <Text allowFontScaling={false} style={[styles.headerCell, { color: 'white' }]}>W</Text>
                    <Text allowFontScaling={false} style={[styles.headerCell, { color: 'white' }]}>L</Text>
                    <Text allowFontScaling={false} style={[styles.headerCell, { color: 'white' }]}>T</Text>
                    <Text allowFontScaling={false} style={[styles.headerCell, { color: 'white' }]}>PCT</Text>
                    <Text allowFontScaling={false} style={[styles.headerCell, { color: 'white' }]}>PF</Text>
                    <Text allowFontScaling={false} style={[styles.headerCell, { color: 'white' }]}>PA</Text>
                    <Text allowFontScaling={false} style={[styles.headerCell, { color: 'white' }]}>DIFF</Text>
                  </View>
                  
                  {division.standings.entries
                    .sort((a, b) => {
                      const aWins = parseInt(a.stats.find(stat => stat.name === "wins")?.value || "0");
                      const bWins = parseInt(b.stats.find(stat => stat.name === "wins")?.value || "0");
                      if (aWins !== bWins) return bWins - aWins;
                      
                      const aWinPct = parseFloat(a.stats.find(stat => stat.name === "winPercent")?.value || "0");
                      const bWinPct = parseFloat(b.stats.find(stat => stat.name === "winPercent")?.value || "0");
                      return bWinPct - aWinPct;
                    })
                    .map((entry, teamIndex) => {
                      const wins = entry.stats.find(stat => stat.name === "wins")?.displayValue || "0";
                      const losses = entry.stats.find(stat => stat.name === "losses")?.displayValue || "0";
                      const ties = entry.stats.find(stat => stat.name === "ties")?.displayValue || "0";
                      const winPercent = entry.stats.find(stat => stat.name === "winPercent")?.displayValue || "0.000";
                      const pointsFor = entry.stats.find(stat => stat.name === "pointsFor")?.displayValue || "0";
                      const pointsAgainst = entry.stats.find(stat => stat.name === "pointsAgainst")?.displayValue || "0";
                      const differential = entry.stats.find(stat => stat.name === "differential")?.displayValue || "0";
                      
                      const diffValue = parseInt(differential);
                      const diffColor = diffValue > 0 ? '#008000' : diffValue < 0 ? '#FF0000' : theme.textSecondary;
                      const nflTeamId = getNFLTeamId(entry.team);
                      
                      return (
                        <TouchableOpacity 
                          key={teamIndex} 
                          style={[styles.tableRow, { borderBottomColor: theme.border }]}
                          onPress={() => navigation.navigate('TeamPage', { teamId: nflTeamId, sport: 'nfl' })}
                        >
                          <View style={[styles.tableCell, styles.teamColumn]}>
                            <Image 
                              source={{ uri: getTeamLogo(entry.team.abbreviation) }}
                              style={styles.teamLogo}
                              defaultSource={{ uri: `https://via.placeholder.com/20x20?text=NFL` }}
                            />
                            <Text allowFontScaling={false} style={[
                              styles.teamName, 
                              { 
                                color: isFavorite(nflTeamId, 'nfl') ? colors.primary : theme.text 
                              }
                            ]} numberOfLines={1}>
                              {isFavorite(nflTeamId, 'nfl') && '★ '}
                              {entry.team.shortDisplayName}
                            </Text>
                          </View>
                          <Text allowFontScaling={false} style={[styles.tableCell, { color: theme.text }]}>{wins}</Text>
                          <Text allowFontScaling={false} style={[styles.tableCell, { color: theme.text }]}>{losses}</Text>
                          <Text allowFontScaling={false} style={[styles.tableCell, { color: theme.text }]}>{ties}</Text>
                          <Text allowFontScaling={false} style={[styles.tableCell, { color: theme.text }]}>{winPercent}</Text>
                          <Text allowFontScaling={false} style={[styles.tableCell, { color: theme.text }]}>{pointsFor}</Text>
                          <Text allowFontScaling={false} style={[styles.tableCell, { color: theme.text }]}>{pointsAgainst}</Text>
                          <Text allowFontScaling={false} style={[styles.tableCell, { color: diffColor }]}>{differential}</Text>
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

  return renderNFLStandings();
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
});

export default StandingsScreen;

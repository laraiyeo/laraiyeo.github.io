import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const StandingsScreen = ({ route }) => {
  const { sport } = route.params;
  const [standings, setStandings] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  useEffect(() => {
    fetchStandings();
    const interval = setInterval(fetchStandings, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

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
      'LAA': '108', 'HOU': '117', 'OAK': '133', 'TOR': '141', 'ATL': '144',
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
    const abbrev = teamAbbreviation.toLowerCase();
    return `https://a.espncdn.com/i/teamlogos/mlb/500/${abbrev}.png`;
  };

  const renderMLBStandings = () => {
    if (!standings?.content?.standings?.groups) return null;

    const groups = standings.content.standings.groups;
    const americanLeague = groups.find(group => group.name === "American League");
    const nationalLeague = groups.find(group => group.name === "National League");

    return (
      <ScrollView style={styles.container}>
        {[americanLeague, nationalLeague].filter(Boolean).map((league, leagueIndex) => (
          <View key={leagueIndex} style={styles.conferenceContainer}>
            <Text style={styles.conferenceTitle}>{league.name}</Text>
            
            {league.groups.map((division, divIndex) => (
              <View key={divIndex} style={styles.divisionContainer}>
                <Text style={styles.divisionTitle}>{division.name}</Text>
                
                <View style={styles.tableContainer}>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.headerCell, styles.teamColumn]}>Team</Text>
                    <Text style={styles.headerCell}>W</Text>
                    <Text style={styles.headerCell}>L</Text>
                    <Text style={styles.headerCell}>PCT</Text>
                    <Text style={styles.headerCell}>GB</Text>
                    <Text style={styles.headerCell}>RS</Text>
                    <Text style={styles.headerCell}>RA</Text>
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
                          style={styles.tableRow}
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
                            <Text style={styles.teamName} numberOfLines={1}>
                              <Text style={styles.teamSeed}>({entry.team.seed})</Text> {entry.team.shortDisplayName}
                            </Text>
                          </View>
                          <Text style={styles.tableCell}>{wins}</Text>
                          <Text style={styles.tableCell}>{losses}</Text>
                          <Text style={styles.tableCell}>{winPercent}</Text>
                          <Text style={styles.tableCell}>{gamesBehind}</Text>
                          <Text style={styles.tableCell}>{pointsFor}</Text>
                          <Text style={styles.tableCell}>{pointsAgainst}</Text>
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#013369" />
        <Text style={styles.loadingText}>Loading standings...</Text>
      </View>
    );
  }

  if (!standings) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Standings not available</Text>
      </View>
    );
  }

  return renderMLBStandings();
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  conferenceContainer: {
    backgroundColor: '#fff',
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
    color: '#013369',
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
    color: '#333',
    marginBottom: 10,
  },
  tableContainer: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    paddingVertical: 10,
    paddingHorizontal: 5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    alignItems: 'center',
  },
  headerCell: {
    flex: 1,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
    textAlign: 'center',
  },
  tableCell: {
    flex: 1,
    fontSize: 12,
    color: '#333',
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
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  teamSeed: {
    fontSize: 12,
    color: '#777',
    fontWeight: '500',
    flex: 1,
  },
});

export default StandingsScreen;

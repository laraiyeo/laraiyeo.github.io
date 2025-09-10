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
  }, [sport]);

  const getStandingsUrl = () => {
    switch (sport) {
      case 'nfl':
        return 'https://cdn.espn.com/core/nfl/standings?xhr=1';
      case 'nba':
        return 'https://cdn.espn.com/core/nba/standings?xhr=1';
      case 'nhl':
        return 'https://cdn.espn.com/core/nhl/standings?xhr=1';
      case 'mlb':
        return 'https://cdn.espn.com/core/mlb/standings?xhr=1';
      default:
        return null;
    }
  };

  const fetchStandings = async () => {
    try {
      const url = getStandingsUrl();
      if (!url) {
        setLoading(false);
        return;
      }

      const response = await fetch(url);
      const data = await response.json();
      
      setStandings(data);
    } catch (error) {
      console.error('Error fetching standings:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTeamLogo = (teamAbbreviation) => {
    const abbrev = teamAbbreviation.toLowerCase();
    return `https://a.espncdn.com/i/teamlogos/${sport}/500-dark/${abbrev}.png`;
  };

  const renderNFLStandings = () => {
    if (!standings?.content?.standings?.groups) return null;

    const groups = standings.content.standings.groups;
    const afc = groups.find(group => group.name === "American Football Conference");
    const nfc = groups.find(group => group.name === "National Football Conference");

    return (
      <ScrollView style={styles.container}>
        {[afc, nfc].filter(Boolean).map((conference, confIndex) => (
          <View key={confIndex} style={styles.conferenceContainer}>
            <Text style={styles.conferenceTitle}>{conference.name}</Text>
            
            {conference.groups.map((division, divIndex) => (
              <View key={divIndex} style={styles.divisionContainer}>
                <Text style={styles.divisionTitle}>{division.name}</Text>
                
                <View style={styles.tableContainer}>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.headerCell, styles.teamColumn]}>Team</Text>
                    <Text style={styles.headerCell}>W</Text>
                    <Text style={styles.headerCell}>L</Text>
                    <Text style={styles.headerCell}>T</Text>
                    <Text style={styles.headerCell}>PCT</Text>
                    <Text style={styles.headerCell}>PF</Text>
                    <Text style={styles.headerCell}>PA</Text>
                    <Text style={styles.headerCell}>DIFF</Text>
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
                      const diffColor = diffValue > 0 ? '#008000' : diffValue < 0 ? '#FF0000' : '#666';
                      
                      return (
                        <TouchableOpacity 
                          key={teamIndex} 
                          style={styles.tableRow}
                          onPress={() => navigation.navigate('TeamPage', { teamId: entry.team.id, sport })}
                        >
                          <View style={[styles.tableCell, styles.teamColumn]}>
                            <Image 
                              source={{ uri: getTeamLogo(entry.team.abbreviation) }}
                              style={styles.teamLogo}
                              defaultSource={{ uri: `https://via.placeholder.com/20x20?text=${sport.toUpperCase()}` }}
                            />
                            <Text style={styles.teamName} numberOfLines={1}>
                              {entry.team.displayName}
                            </Text>
                          </View>
                          <Text style={styles.tableCell}>{wins}</Text>
                          <Text style={styles.tableCell}>{losses}</Text>
                          <Text style={styles.tableCell}>{ties}</Text>
                          <Text style={styles.tableCell}>{winPercent}</Text>
                          <Text style={styles.tableCell}>{pointsFor}</Text>
                          <Text style={styles.tableCell}>{pointsAgainst}</Text>
                          <Text style={[styles.tableCell, { color: diffColor }]}>{differential}</Text>
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

  const renderGenericStandings = () => {
    if (!standings?.content?.standings?.groups) return null;

    return (
      <ScrollView style={styles.container}>
        {standings.content.standings.groups.map((group, groupIndex) => (
          <View key={groupIndex} style={styles.conferenceContainer}>
            <Text style={styles.conferenceTitle}>{group.name}</Text>
            
            <View style={styles.tableContainer}>
              <View style={styles.tableHeader}>
                <Text style={[styles.headerCell, styles.teamColumn]}>Team</Text>
                <Text style={styles.headerCell}>W</Text>
                <Text style={styles.headerCell}>L</Text>
                <Text style={styles.headerCell}>PCT</Text>
              </View>
              
              {group.standings.entries.map((entry, teamIndex) => {
                const wins = entry.stats.find(stat => stat.name === "wins")?.displayValue || "0";
                const losses = entry.stats.find(stat => stat.name === "losses")?.displayValue || "0";
                const winPercent = entry.stats.find(stat => stat.name === "winPercent")?.displayValue || "0.000";
                
                return (
                  <TouchableOpacity 
                    key={teamIndex} 
                    style={styles.tableRow}
                    onPress={() => navigation.navigate('TeamPage', { teamId: entry.team.id, sport })}
                  >
                    <View style={[styles.tableCell, styles.teamColumn]}>
                      <Image 
                        source={{ uri: getTeamLogo(entry.team.abbreviation) }}
                        style={styles.teamLogo}
                        defaultSource={{ uri: `https://via.placeholder.com/20x20?text=${sport.toUpperCase()}` }}
                      />
                      <Text style={styles.teamName} numberOfLines={1}>
                        {entry.team.displayName}
                      </Text>
                    </View>
                    <Text style={styles.tableCell}>{wins}</Text>
                    <Text style={styles.tableCell}>{losses}</Text>
                    <Text style={styles.tableCell}>{winPercent}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
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
        <Text style={styles.errorText}>Standings not available for {sport.toUpperCase()}</Text>
      </View>
    );
  }

  return sport === 'nfl' ? renderNFLStandings() : renderGenericStandings();
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
});

export default StandingsScreen;

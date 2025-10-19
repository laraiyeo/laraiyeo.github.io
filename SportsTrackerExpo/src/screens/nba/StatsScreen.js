import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Image, 
  ActivityIndicator,
  Modal,
  FlatList 
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import NHLDataService from '../../services/NHLDataService';

// Helper function to convert HTTP URLs to HTTPS
const convertToHttps = (url) => {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
};

// NBA-specific year logic: September-December uses next year, otherwise current year
const getNBAYear = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const month = now.getMonth(); // 0-based: 0=January, 8=September, 11=December
  
  // If current month is September (8) to December (11), use next year
  if (month >= 8) { // September to December
    return currentYear + 1;
  }
  
  return currentYear;
};

const StatsScreen = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const navigation = useNavigation();
  
  const [selectedType, setSelectedType] = useState('ATHLETES');
  const [playerStats, setPlayerStats] = useState({});
  const [teamStats, setTeamStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalData, setModalData] = useState([]);
  const [modalTitle, setModalTitle] = useState('');
  
  // Cache flags to avoid refetching
  const [playerStatsLoaded, setPlayerStatsLoaded] = useState(false);
  const [teamStatsLoaded, setTeamStatsLoaded] = useState(false);

  const statTypes = [
    { key: 'ATHLETES', name: 'Athletes' },
    { key: 'TEAMS', name: 'Teams' }
  ];

  useEffect(() => {
    fetchStats();
  }, [selectedType]);

  const fetchStats = async () => {
    // Only show loading if we haven't cached the data yet
    const needsLoading = (selectedType === 'ATHLETES' && !playerStatsLoaded) || 
                         (selectedType === 'TEAMS' && !teamStatsLoaded);
    
    if (needsLoading) {
      setLoading(true);
    }
    
    try {
      if (selectedType === 'ATHLETES' && !playerStatsLoaded) {
        await fetchPlayerStats();
        setPlayerStatsLoaded(true);
      } else if (selectedType === 'TEAMS' && !teamStatsLoaded) {
        await fetchTeamStats();
        setTeamStatsLoaded(true);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      if (needsLoading) {
        setLoading(false);
      }
    }
  };

  const fetchPlayerStats = async () => {
    try {
      const currentYear = getNBAYear();
      const response = await fetch(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${currentYear}/types/2/leaders?limit=10`);
      const rawData = await response.json();
      
      // Validate that we have relevant data
      if (!(rawData && rawData.categories && rawData.categories.length > 0)) {
        throw new Error('No stats data found');
      }
      
      const data = rawData;
      
      if (data.categories) {
        // First, collect all unique athlete and team refs
        const athleteRefs = new Set();
        const teamRefs = new Set();
        
        data.categories.forEach(category => {
          category.leaders?.forEach(leader => {
            if (leader.athlete?.$ref) athleteRefs.add(leader.athlete.$ref);
            if (leader.team?.$ref) teamRefs.add(leader.team.$ref);
          });
        });

        // Fetch all athlete and team data in parallel
        const [athleteResults, teamResults] = await Promise.all([
          Promise.all(Array.from(athleteRefs).map(ref => 
            fetch(convertToHttps(ref)).then(res => res.json()).catch(err => {
              console.warn('Failed to fetch athlete:', convertToHttps(ref), err);
              return null;
            })
          )),
          Promise.all(Array.from(teamRefs).map(ref => 
            fetch(convertToHttps(ref)).then(res => res.json()).catch(err => {
              console.warn('Failed to fetch team:', convertToHttps(ref), err);
              return null;
            })
          ))
        ]);

        // Create lookup maps
        const athleteMap = new Map();
        const teamMap = new Map();
        
        Array.from(athleteRefs).forEach((ref, index) => {
          if (athleteResults[index]) {
            athleteMap.set(ref, athleteResults[index]);
          }
        });
        
        Array.from(teamRefs).forEach((ref, index) => {
          if (teamResults[index]) {
            teamMap.set(ref, teamResults[index]);
          }
        });

        // Process categories with resolved data
        const processedStats = {};
        data.categories.forEach(category => {
          const enrichedCategory = {
            ...category,
            leaders: category.leaders?.map(leader => ({
              ...leader,
              athleteData: leader.athlete?.$ref ? athleteMap.get(leader.athlete.$ref) : null,
              teamData: leader.team?.$ref ? teamMap.get(leader.team.$ref) : null
            })) || []
          };
          processedStats[category.name] = enrichedCategory;
        });
        
        setPlayerStats(processedStats);
      }
    } catch (error) {
      console.error('Error fetching player stats:', error);
    }
  };

  const fetchTeamStats = async () => {
    try {
      const response = await fetch('https://site.web.api.espn.com/apis/site/v3/sports/basketball/nba/teamleaders');
      const data = await response.json();
      
      if (data.teamLeaders && data.teamLeaders.categories) {
        const processedStats = {};
        data.teamLeaders.categories.forEach(category => {
          processedStats[category.name] = category;
        });
        setTeamStats(processedStats);
      }
    } catch (error) {
      console.error('Error fetching team stats:', error);
    }
  };

  const getNHLTeamAbbreviation = (team) => {
    const teamMapping = {
      1: 'ATL', 2: 'BOS', 3: 'NOP', 4: 'CHI', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET', 9: 'GSW', 10: 'HOU',
      11: 'IND', 12: 'LAC', 13: 'LAL', 14: 'MIA', 15: 'MIL', 16: 'MIN', 17: 'BKN', 18: 'NY', 19: 'ORL', 20: 'PHI',
      21: 'PHX', 22: 'POR', 23: 'SAC', 24: 'SA', 25: 'OKC', 26: 'UTAH', 27: 'WSH', 28: 'TOR', 29: 'MEM', 30: 'CHA',
    };

    if (team?.abbreviation) {
      return team.abbreviation;
    }
    
    const abbr = teamMapping[team?.id];
    if (abbr) {
      return abbr;
    }
    
    return team?.displayName?.substring(0, 3)?.toUpperCase() || 'NBA';
  };

  const openModal = (leaders, categoryName) => {
    setModalData(leaders);
    setModalTitle(categoryName);
    setModalVisible(true);
  };

  const renderLeaderRow = (leader, index, isFirst = false) => {
    let teamAbbr;
    let displayName;
    let displayValue;
    let playerId;
    let teamData;
    
    if (selectedType === 'ATHLETES') {
      // For player stats from core API with resolved data
      teamData = leader.teamData;
      teamAbbr = getNHLTeamAbbreviation(teamData);
      displayName = leader.athleteData?.displayName || leader.athleteData?.fullName || 'Unknown Player';
      displayValue = leader.displayValue || leader.value;
      playerId = leader.athleteData?.id;
    } else {
      // For team stats from site API
      teamData = leader.team;
      teamAbbr = getNHLTeamAbbreviation(teamData);
      displayName = teamData?.displayName || teamData?.name;
      displayValue = leader.displayValue || leader.value;
    }
    
    if (isFirst) {
      return (
        <View key={index} style={[styles.firstLeaderRow, { borderBottomColor: theme.border }]}>
          {selectedType === 'ATHLETES' ? (
            <Image
              source={{ 
                uri: `https://a.espncdn.com/i/headshots/nba/players/full/${playerId}.png`
              }}
              style={styles.playerHeadshot}
              defaultSource={{ uri: 'https://via.placeholder.com/50x50?text=NBA' }}
            />
          ) : (
            <Image
              source={{ uri: getTeamLogoUrl('nba', teamAbbr) }}
              style={styles.teamLogoLarge}
            />
          )}
          <View style={styles.firstLeaderInfo}>
            <View style={styles.playerNameRow}>
              {selectedType === 'ATHLETES' && (
                <Image
                  source={{ uri: getTeamLogoUrl('nba', teamAbbr) }}
                  style={styles.teamLogoSmall}
                />
              )}
              <Text allowFontScaling={false} style={[styles.playerName, { color: theme.text }]}>
                {displayName}
              </Text>
            </View>
            {selectedType === 'ATHLETES' && teamData && (
              <Text allowFontScaling={false} style={[styles.teamName, { color: theme.textSecondary }]}>
                {teamData.displayName || teamData.name}
              </Text>
            )}
          </View>
          <Text allowFontScaling={false} style={[styles.statValue, { color: colors.primary }]}>
            {displayValue}
          </Text>
        </View>
      );
    } else {
      return (
        <View key={index} style={styles.leaderRow}>
          <Text allowFontScaling={false} style={[styles.rank, { color: theme.textSecondary }]}>
            {index + 1}
          </Text>
          {selectedType === 'ATHLETES' && (
            <Image
              source={{ uri: getTeamLogoUrl('nba', teamAbbr) }}
              style={styles.teamLogoSmall}
            />
          )}
          <Text allowFontScaling={false} style={[styles.playerNameCompact, { color: theme.text }]}>
            {displayName}
          </Text>
          <Text allowFontScaling={false} style={[styles.statValueCompact, { color: colors.primary }]}>
            {displayValue}
          </Text>
        </View>
      );
    }
  };

  const renderCategory = (category) => {
    const leaders = category.leaders || [];
    const displayLeaders = leaders.slice(0, 5);
    
    return (
      <TouchableOpacity 
        key={category.name}
        style={[styles.categoryContainer, { backgroundColor: theme.surface }]}
        onPress={() => openModal(leaders, category.displayName || category.name)}
      >
        <Text allowFontScaling={false} style={[styles.categoryTitle, { color: colors.primary }]}>
          {category.displayName || category.name}
        </Text>
        {displayLeaders.map((leader, index) => 
          renderLeaderRow(leader, index, index === 0)
        )}
        {leaders.length > 5 && (
          <Text allowFontScaling={false} style={[styles.viewMore, { color: colors.secondary }]}>
            Tap to view all {leaders.length} leaders
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderModalItem = ({ item, index }) => {
    let teamAbbr;
    let displayName;
    let displayValue;
    let playerId;
    let teamData;
    
    if (selectedType === 'ATHLETES') {
      // For player stats with resolved data
      teamData = item.teamData;
      teamAbbr = getNHLTeamAbbreviation(teamData);
      displayName = item.athleteData?.displayName || item.athleteData?.fullName || 'Unknown Player';
      displayValue = item.displayValue || item.value;
      playerId = item.athleteData?.id;
    } else {
      // For team stats
      teamData = item.team;
      teamAbbr = getNHLTeamAbbreviation(teamData);
      displayName = teamData?.displayName || teamData?.name;
      displayValue = item.displayValue || item.value;
    }

    return (
      <TouchableOpacity 
        style={[styles.modalItem, { backgroundColor: theme.surface }]}
        onPress={() => {
          setModalVisible(false);
          if (selectedType === 'ATHLETES') {
            navigation.navigate('PlayerPage', { 
              playerId: playerId, 
              sport: 'nba' 
            });
          } else {
            navigation.navigate('TeamPage', { 
              teamId: teamData?.id, 
              teamName: displayName,
              sport: 'nba' 
            });
          }
        }}
      >
        <Text allowFontScaling={false} style={[styles.modalRank, { color: theme.textSecondary }]}>
          {index + 1}
        </Text>
        {selectedType === 'ATHLETES' ? (
          <Image
            source={{ 
              uri: `https://a.espncdn.com/i/headshots/nba/players/full/${playerId}.png`
            }}
            style={styles.modalHeadshot}
            defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=NBA' }}
          />
        ) : (
          <Image
            source={{ uri: getTeamLogoUrl('nba', teamAbbr) }}
            style={styles.modalHeadshot}
          />
        )}
        <View style={styles.modalPlayerInfo}>
          <View style={styles.modalNameRow}>
            {selectedType === 'ATHLETES' && (
              <Image
                source={{ uri: getTeamLogoUrl('nba', teamAbbr) }}
                style={styles.modalTeamLogo}
              />
            )}
            <Text allowFontScaling={false} style={[styles.modalPlayerName, { color: theme.text }]}>
              {displayName}
            </Text>
          </View>
          {selectedType === 'ATHLETES' && teamData && (
            <Text allowFontScaling={false} style={[styles.modalTeamName, { color: theme.textSecondary }]}>
              {teamData.displayName || teamData.name}
            </Text>
          )}
        </View>
        <Text allowFontScaling={false} style={[styles.modalStatValue, { color: colors.primary }]}>
          {displayValue}
        </Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading stats...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Type Selector */}
      <View style={[styles.leagueSelector, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        {statTypes.map(type => (
          <TouchableOpacity
            key={type.key}
            style={[
              styles.leagueButton,
              { 
                backgroundColor: selectedType === type.key ? colors.primary : 'transparent',
                borderColor: colors.primary
              }
            ]}
            onPress={() => setSelectedType(type.key)}
          >
            <Text allowFontScaling={false} style={[
              styles.leagueButtonText,
              { color: selectedType === type.key ? '#fff' : colors.primary }
            ]}>
              {type.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* NBA Statistics */}
        <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>
          {selectedType === 'ATHLETES' ? 'Player Leaders' : 'Team Leaders'}
        </Text>
        
        {selectedType === 'ATHLETES' 
          ? Object.values(playerStats).map(category => renderCategory(category))
          : Object.values(teamStats).map(category => renderCategory(category))
        }
      </ScrollView>

      {/* Modal for full top 10 */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <Text allowFontScaling={false} style={[styles.modalHeaderTitle, { color: theme.text }]}>
              {modalTitle} Leaders
            </Text>
            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              style={styles.modalCloseButton}
            >
              <Text allowFontScaling={false} style={[styles.modalCloseText, { color: colors.primary }]}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={modalData}
            renderItem={renderModalItem}
            keyExtractor={(item, index) => selectedType === 'ATHLETES' ? item.athlete?.$ref || index.toString() : item.team?.id?.toString() || index.toString()}
            style={styles.modalList}
          />
        </View>
      </Modal>
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
  leagueSelector: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  leagueButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 80,
    alignItems: 'center',
  },
  leagueButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 16,
    textAlign: 'center',
  },
  categoryContainer: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  firstLeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    marginBottom: 8,
  },
  playerHeadshot: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  teamLogoLarge: {
    width: 50,
    height: 50,
    marginRight: 12,
  },
  firstLeaderInfo: {
    flex: 1,
  },
  playerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  teamLogoSmall: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  playerName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  teamName: {
    fontSize: 14,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    minWidth: 60,
    textAlign: 'right',
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  rank: {
    fontSize: 14,
    fontWeight: '600',
    width: 30,
    textAlign: 'center',
  },
  playerNameCompact: {
    flex: 1,
    fontSize: 14,
    marginLeft: 8,
  },
  statValueCompact: {
    fontSize: 16,
    fontWeight: 'bold',
    minWidth: 50,
    textAlign: 'right',
  },
  viewMore: {
    textAlign: 'center',
    marginTop: 8,
    fontSize: 12,
    fontStyle: 'italic',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    padding: 8,
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalList: {
    flex: 1,
    padding: 16,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  modalRank: {
    fontSize: 16,
    fontWeight: 'bold',
    width: 30,
    textAlign: 'center',
  },
  modalHeadshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginHorizontal: 12,
  },
  modalPlayerInfo: {
    flex: 1,
  },
  modalNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  modalTeamLogo: {
    width: 16,
    height: 16,
    marginRight: 6,
  },
  modalPlayerName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalTeamName: {
    fontSize: 12,
  },
  modalStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
    minWidth: 60,
    textAlign: 'right',
  },
});

export default StatsScreen;

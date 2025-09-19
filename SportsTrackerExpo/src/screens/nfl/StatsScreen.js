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
import NFLDataService from '../../services/NFLDataService';

const StatsScreen = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const navigation = useNavigation();
  
  const [selectedType, setSelectedType] = useState('ATHLETES');
  const [offenseStats, setOffenseStats] = useState({});
  const [defenseStats, setDefenseStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalData, setModalData] = useState([]);
  const [modalTitle, setModalTitle] = useState('');

  const statTypes = [
    { key: 'ATHLETES', name: 'Athletes' },
    { key: 'TEAMS', name: 'Teams' }
  ];

  const offenseCategories = [
    { key: 'passingYards', name: 'Passing Yards', abbr: 'PASS YDS', position: 'QB' },
    { key: 'passingTouchdowns', name: 'Passing Touchdowns', abbr: 'PASS TD', position: 'QB' },
    { key: 'rushingYards', name: 'Rushing Yards', abbr: 'RUSH YDS', position: 'RB' },
    { key: 'rushingTouchdowns', name: 'Rushing Touchdowns', abbr: 'RUSH TD', position: 'RB' },
    { key: 'receivingYards', name: 'Receiving Yards', abbr: 'REC YDS', position: 'WR' },
    { key: 'receivingTouchdowns', name: 'Receiving Touchdowns', abbr: 'REC TD', position: 'WR' }
  ];

  const defenseCategories = [
    { key: 'tackles', name: 'Tackles', abbr: 'TKLS', position: 'LB' },
    { key: 'sacks', name: 'Sacks', abbr: 'SACKS', position: 'DE' },
    { key: 'interceptions', name: 'Interceptions', abbr: 'INT', position: 'CB' },
    { key: 'forcedFumbles', name: 'Forced Fumbles', abbr: 'FF', position: 'LB' }
  ];

  useEffect(() => {
    initializeData();
  }, []);

  const initializeData = async () => {
    setLoading(true);
    try {
      // Initialize NFL data service
      await NFLDataService.initializeData();
      
      if (selectedType === 'ATHLETES') {
        await fetchPlayerStats();
      } else {
        await fetchTeamStats();
      }
    } catch (error) {
      console.error('Error initializing data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedType === 'ATHLETES') {
      fetchPlayerStats();
    } else {
      fetchTeamStats();
    }
  }, [selectedType]);

  const fetchPlayerStats = async () => {
    try {
      // Generate mock data for now since ESPN doesn't provide detailed stats
      const processedOffense = {};
      const processedDefense = {};
      
      offenseCategories.forEach(category => {
        processedOffense[category.key] = generateMockPlayerLeaders(category);
      });
      
      defenseCategories.forEach(category => {
        processedDefense[category.key] = generateMockPlayerLeaders(category);
      });
      
      setOffenseStats(processedOffense);
      setDefenseStats(processedDefense);
    } catch (error) {
      console.error('Error fetching player stats:', error);
    }
  };

  const fetchTeamStats = async () => {
    try {
      // Generate mock team data for now
      const processedOffense = {};
      const processedDefense = {};
      
      offenseCategories.forEach(category => {
        processedOffense[category.key] = generateMockTeamLeaders(category);
      });
      
      defenseCategories.forEach(category => {
        processedDefense[category.key] = generateMockTeamLeaders(category);
      });
      
      setOffenseStats(processedOffense);
      setDefenseStats(processedDefense);
    } catch (error) {
      console.error('Error fetching team stats:', error);
    }
  };

  const generateMockPlayerLeaders = (category) => {
    const allPlayers = NFLDataService.getAllPlayers();
    const relevantPlayers = allPlayers.filter(player => 
      player.position?.abbreviation === category.position ||
      player.position?.displayName?.includes(category.position)
    ).slice(0, 10);

    return relevantPlayers.map((player, index) => ({
      rank: index + 1,
      person: {
        id: player.id,
        fullName: player.displayName || player.firstName + ' ' + player.lastName
      },
      team: player.team,
      value: Math.floor(Math.random() * 2000) + 500 // Mock stat value
    }));
  };

  const generateMockTeamLeaders = (category) => {
    const allTeams = NFLDataService.getTeams();
    
    return allTeams.slice(0, 10).map((team, index) => ({
      rank: index + 1,
      team: team,
      value: Math.floor(Math.random() * 3000) + 1000 // Mock stat value
    }));
  };

  const getNFLTeamAbbreviation = (team) => {
    const teamMapping = {
      1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL',
      7: 'DEN', 8: 'DET', 9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC',
      13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO',
      19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC',
      25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WSH', 29: 'CAR', 30: 'JAX',
      33: 'BAL', 34: 'HOU'
    };

    if (team?.abbreviation) {
      return team.abbreviation;
    }
    
    const abbr = teamMapping[team?.id];
    if (abbr) {
      return abbr;
    }
    
    return team?.displayName?.substring(0, 3)?.toUpperCase() || 'NFL';
  };

  const openModal = (leaders, categoryName) => {
    setModalData(leaders);
    setModalTitle(categoryName);
    setModalVisible(true);
  };

  const renderLeaderRow = (leader, index, isFirst = false) => {
    const teamAbbr = getNFLTeamAbbreviation(leader.team);
    
    if (isFirst) {
      return (
        <View key={index} style={[styles.firstLeaderRow, { borderBottomColor: theme.border }]}>
          {selectedType === 'ATHLETES' ? (
            <Image
              source={{ 
                uri: `https://a.espncdn.com/i/headshots/nfl/players/full/${leader.person?.id}.png`
              }}
              style={styles.playerHeadshot}
              defaultSource={{ uri: 'https://via.placeholder.com/50x50?text=NFL' }}
            />
          ) : (
            <Image
              source={{ uri: getTeamLogoUrl('nfl', teamAbbr) }}
              style={styles.teamLogoLarge}
            />
          )}
          <View style={styles.firstLeaderInfo}>
            <View style={styles.playerNameRow}>
              <Image
                source={{ uri: getTeamLogoUrl('nfl', teamAbbr) }}
                style={styles.teamLogoSmall}
              />
              <Text allowFontScaling={false} style={[styles.playerName, { color: theme.text }]}>
                {selectedType === 'ATHLETES' ? leader.person?.fullName : leader.team?.displayName}
              </Text>
            </View>
            {selectedType === 'ATHLETES' && (
              <Text allowFontScaling={false} style={[styles.teamName, { color: theme.textSecondary }]}>
                {leader.team?.displayName}
              </Text>
            )}
          </View>
          <Text allowFontScaling={false} style={[styles.statValue, { color: colors.primary }]}>
            {leader.value}
          </Text>
        </View>
      );
    } else {
      return (
        <View key={index} style={styles.leaderRow}>
          <Text allowFontScaling={false} style={[styles.rank, { color: theme.textSecondary }]}>
            {leader.rank}
          </Text>
          <Image
            source={{ uri: getTeamLogoUrl('nfl', teamAbbr) }}
            style={styles.teamLogoSmall}
          />
          <Text allowFontScaling={false} style={[styles.playerNameCompact, { color: theme.text }]}>
            {selectedType === 'ATHLETES' ? leader.person?.fullName : leader.team?.displayName}
          </Text>
          <Text allowFontScaling={false} style={[styles.statValueCompact, { color: colors.primary }]}>
            {leader.value}
          </Text>
        </View>
      );
    }
  };

  const renderCategory = (categoryKey, categoryInfo, stats) => {
    const leaders = stats[categoryKey] || [];
    const displayLeaders = leaders.slice(0, 5);
    
    return (
      <TouchableOpacity 
        key={categoryKey}
        style={[styles.categoryContainer, { backgroundColor: theme.surface }]}
        onPress={() => openModal(leaders, categoryInfo.name)}
      >
        <Text allowFontScaling={false} style={[styles.categoryTitle, { color: colors.primary }]}>
          {categoryInfo.name}
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

  const renderModalItem = ({ item, index }) => (
    <TouchableOpacity 
      style={[styles.modalItem, { backgroundColor: theme.surface }]}
      onPress={() => {
        setModalVisible(false);
        if (selectedType === 'ATHLETES') {
          navigation.navigate('PlayerPage', { 
            playerId: item.person?.id, 
            sport: 'nfl' 
          });
        } else {
          navigation.navigate('TeamPage', { 
            teamId: item.team?.id, 
            teamName: item.team?.displayName,
            sport: 'nfl' 
          });
        }
      }}
    >
      <Text allowFontScaling={false} style={[styles.modalRank, { color: theme.textSecondary }]}>
        {item.rank}
      </Text>
      {selectedType === 'ATHLETES' ? (
        <Image
          source={{ 
            uri: `https://a.espncdn.com/i/headshots/nfl/players/full/${item.person?.id}.png`
          }}
          style={styles.modalHeadshot}
          defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=NFL' }}
        />
      ) : (
        <Image
          source={{ uri: getTeamLogoUrl('nfl', getNFLTeamAbbreviation(item.team)) }}
          style={styles.modalHeadshot}
        />
      )}
      <View style={styles.modalPlayerInfo}>
        <View style={styles.modalNameRow}>
          <Image
            source={{ uri: getTeamLogoUrl('nfl', getNFLTeamAbbreviation(item.team)) }}
            style={styles.modalTeamLogo}
          />
          <Text allowFontScaling={false} style={[styles.modalPlayerName, { color: theme.text }]}>
            {selectedType === 'ATHLETES' ? item.person?.fullName : item.team?.displayName}
          </Text>
        </View>
        {selectedType === 'ATHLETES' && (
          <Text allowFontScaling={false} style={[styles.modalTeamName, { color: theme.textSecondary }]}>
            {item.team?.displayName}
          </Text>
        )}
      </View>
      <Text allowFontScaling={false} style={[styles.modalStatValue, { color: colors.primary }]}>
        {item.value}
      </Text>
    </TouchableOpacity>
  );

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
      <View style={[styles.leagueSelector, { backgroundColor: theme.surface }]}>
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
        {/* Offense Stats */}
        <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>
          Offense Leaders
        </Text>
        {offenseCategories.map(category => 
          renderCategory(category.key, category, offenseStats)
        )}

        {/* Defense Stats */}
        <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>
          Defense Leaders
        </Text>
        {defenseCategories.map(category => 
          renderCategory(category.key, category, defenseStats)
        )}
      </ScrollView>

      {/* Modal for full top 10 */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: theme.surface }]}>
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
            keyExtractor={item => selectedType === 'ATHLETES' ? item.person?.id?.toString() : item.team?.id?.toString()}
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

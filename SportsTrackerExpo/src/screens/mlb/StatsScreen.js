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

const StatsScreen = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const navigation = useNavigation();
  
  const [selectedLeague, setSelectedLeague] = useState('ALL');
  const [hittingStats, setHittingStats] = useState({});
  const [pitchingStats, setPitchingStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalData, setModalData] = useState([]);
  const [modalTitle, setModalTitle] = useState('');

  const leagues = [
    { key: 'ALL', name: 'All MLB', id: null },
    { key: 'AL', name: 'American League', id: 103 },
    { key: 'NL', name: 'National League', id: 104 }
  ];

  const hittingCategories = [
    { key: 'battingAverage', name: 'Batting Average', abbr: 'AVG' },
    { key: 'homeRuns', name: 'Home Runs', abbr: 'HR' },
    { key: 'runsBattedIn', name: 'RBIs', abbr: 'RBI' },
    { key: 'hits', name: 'Hits', abbr: 'H' },
    { key: 'runs', name: 'Runs', abbr: 'R' },
    { key: 'stolenBases', name: 'Stolen Bases', abbr: 'SB' }
  ];

  const pitchingCategories = [
    { key: 'earnedRunAverage', name: 'Earned Run Average', abbr: 'ERA' },
    { key: 'strikeouts', name: 'Strikeouts', abbr: 'SO' },
    { key: 'wins', name: 'Wins', abbr: 'W' },
    { key: 'saves', name: 'Saves', abbr: 'SV' }
  ];

  useEffect(() => {
    fetchStats();
  }, [selectedLeague]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const leagueParam = selectedLeague === 'ALL' ? '' : `&leagueId=${leagues.find(l => l.key === selectedLeague).id}`;
      
      // Fetch hitting stats
      const hittingResponse = await fetch(
        `https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=battingAverage,homeRuns,rbi,hits,runs,stolenBases&leaderGameTypes=R&season=2025&limit=10${leagueParam}&statGroup=hitting`
      );
      const hittingData = await hittingResponse.json();
      
      // Fetch pitching stats
      const pitchingResponse = await fetch(
        `https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=era,strikeouts,wins,saves&leaderGameTypes=R&season=2025&limit=10${leagueParam}&statGroup=pitching`
      );
      const pitchingData = await pitchingResponse.json();
      
      // Process hitting stats
      const processedHitting = {};
      hittingData.leagueLeaders?.forEach(category => {
        processedHitting[category.leaderCategory] = category.leaders;
      });
      
      // Process pitching stats
      const processedPitching = {};
      pitchingData.leagueLeaders?.forEach(category => {
        processedPitching[category.leaderCategory] = category.leaders;
      });
      
      setHittingStats(processedHitting);
      setPitchingStats(processedPitching);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTeamAbbreviation = (teamId) => {
    const teamMapping = {
      108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC',
      113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU',
      118: 'KC', 119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'OAK',
      134: 'PIT', 135: 'SD', 136: 'SEA', 137: 'SF', 138: 'STL',
      139: 'TB', 140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI',
      144: 'ATL', 145: 'CWS', 146: 'MIA', 147: 'NYY', 158: 'MIL'
    };
    return teamMapping[teamId] || 'MLB';
  };

  const openModal = (leaders, categoryName) => {
    setModalData(leaders);
    setModalTitle(categoryName);
    setModalVisible(true);
  };

  const renderLeaderRow = (leader, index, isFirst = false) => {
    const teamAbbr = getTeamAbbreviation(leader.team.id);
    
    if (isFirst) {
      return (
        <View key={leader.person.id} style={[styles.firstLeaderRow, { borderBottomColor: theme.border }]}>
          <Image
            source={{ 
              uri: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${leader.person.id}/headshot/67/current`
            }}
            style={styles.playerHeadshot}
            defaultSource={{ uri: 'https://via.placeholder.com/50x50?text=MLB' }}
          />
          <View style={styles.firstLeaderInfo}>
            <View style={styles.playerNameRow}>
              <Image
                source={{ uri: getTeamLogoUrl('mlb', teamAbbr) }}
                style={styles.teamLogoSmall}
              />
              <Text allowFontScaling={false} style={[styles.playerName, { color: theme.text }]}>
                {leader.person.fullName}
              </Text>
            </View>
            <Text allowFontScaling={false} style={[styles.teamName, { color: theme.textSecondary }]}>
              {leader.team.name}
            </Text>
          </View>
          <Text allowFontScaling={false} style={[styles.statValue, { color: colors.primary }]}>
            {leader.value}
          </Text>
        </View>
      );
    } else {
      return (
        <View key={leader.person.id} style={styles.leaderRow}>
          <Text allowFontScaling={false} style={[styles.rank, { color: theme.textSecondary }]}>
            {leader.rank}
          </Text>
          <Image
            source={{ uri: getTeamLogoUrl('mlb', teamAbbr) }}
            style={styles.teamLogoSmall}
          />
          <Text allowFontScaling={false} style={[styles.playerNameCompact, { color: theme.text }]}>
            {leader.person.fullName}
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
        navigation.navigate('PlayerPage', { 
          playerId: item.person.id, 
          sport: 'mlb' 
        });
      }}
    >
      <Text allowFontScaling={false} style={[styles.modalRank, { color: theme.textSecondary }]}>
        {item.rank}
      </Text>
      <Image
        source={{ 
          uri: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${item.person.id}/headshot/67/current`
        }}
        style={styles.modalHeadshot}
        defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
      />
      <View style={styles.modalPlayerInfo}>
        <View style={styles.modalNameRow}>
          <Image
            source={{ uri: getTeamLogoUrl('mlb', getTeamAbbreviation(item.team.id)) }}
            style={styles.modalTeamLogo}
          />
          <Text allowFontScaling={false} style={[styles.modalPlayerName, { color: theme.text }]}>
            {item.person.fullName}
          </Text>
        </View>
        <Text allowFontScaling={false} style={[styles.modalTeamName, { color: theme.textSecondary }]}>
          {item.team.name}
        </Text>
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
      {/* League Selector */}
      <View style={[styles.leagueSelector, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        {leagues.map(league => (
          <TouchableOpacity
            key={league.key}
            style={[
              styles.leagueButton,
              { 
                backgroundColor: selectedLeague === league.key ? colors.primary : 'transparent',
                borderColor: colors.primary
              }
            ]}
            onPress={() => setSelectedLeague(league.key)}
          >
            <Text allowFontScaling={false} style={[
              styles.leagueButtonText,
              { color: selectedLeague === league.key ? '#fff' : colors.primary }
            ]}>
              {league.key}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Hitting Stats */}
        <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>
          Hitting Leaders
        </Text>
        {hittingCategories.map(category => 
          renderCategory(category.key, category, hittingStats)
        )}

        {/* Pitching Stats */}
        <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>
          Pitching Leaders
        </Text>
        {pitchingCategories.map(category => 
          renderCategory(category.key, category, pitchingStats)
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
            keyExtractor={item => item.person.id.toString()}
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
    minWidth: 60,
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

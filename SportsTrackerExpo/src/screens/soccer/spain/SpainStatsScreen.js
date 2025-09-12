import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Image,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SpainServiceEnhanced } from '../../../services/soccer/SpainServiceEnhanced';
import { useTheme } from '../../../context/ThemeContext';

const SpainStatsScreen = ({ navigation, route }) => {
  const { theme, colors } = useTheme();
  const [activeTab, setActiveTab] = useState('league'); // 'league', 'players', 'teams'
  const [activeCategory, setActiveCategory] = useState('scorers'); // For players: 'scorers', 'assists', 'cards'
  const [loading, setLoading] = useState(true);
  const [statsData, setStatsData] = useState({
    league: null,
    topScorers: [],
    topAssists: [],
    topCards: [],
    teamStats: []
  });

  useEffect(() => {
    loadStatsData();
  }, []);

  const loadStatsData = async () => {
    try {
      setLoading(true);

      const [
        leagueStats,
        topScorers,
        topAssists,
        topCards,
        teamStats
      ] = await Promise.all([
        SpainServiceEnhanced.getLeagueStats(),
        SpainServiceEnhanced.getTopScorers(),
        SpainServiceEnhanced.getTopAssists(),
        SpainServiceEnhanced.getTopCards(),
        SpainServiceEnhanced.getTeamStats()
      ]);

      // Process players with team logos
      const processPlayerStats = async (players) => {
        return Promise.all(
          (players || []).map(async (player) => {
            let teamLogo = null;
            if (player.team?.id) {
              teamLogo = await SpainServiceEnhanced.getTeamLogoWithFallback(player.team.id);
            }
            return {
              ...player,
              team: {
                ...player.team,
                logo: teamLogo
              }
            };
          })
        );
      };

      // Process team stats with logos
      const processTeamStats = async (teams) => {
        return Promise.all(
          (teams || []).map(async (team) => {
            const logo = await SpainServiceEnhanced.getTeamLogoWithFallback(team.id);
            return {
              ...team,
              logo
            };
          })
        );
      };

      const [
        processedScorers,
        processedAssists,
        processedCards,
        processedTeams
      ] = await Promise.all([
        processPlayerStats(topScorers),
        processPlayerStats(topAssists),
        processPlayerStats(topCards),
        processTeamStats(teamStats)
      ]);

      setStatsData({
        league: leagueStats,
        topScorers: processedScorers,
        topAssists: processedAssists,
        topCards: processedCards,
        teamStats: processedTeams
      });

    } catch (error) {
      console.error('Error loading stats:', error);
      Alert.alert('Error', 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const handlePlayerPress = (player) => {
    navigation.navigate('PlayerPage', {
      playerId: player.id,
      playerName: player.displayName,
      sport: 'soccer',
      league: 'spain'
    });
  };

  const handleTeamPress = (team) => {
    navigation.navigate('TeamPage', {
      teamId: team.id,
      teamName: team.displayName,
      sport: 'soccer',
      league: 'spain'
    });
  };

  const renderTabSelector = () => (
    <View style={styles.tabContainer}>
      <TouchableOpacity
        style={[
          styles.tab,
          activeTab === 'league' && { backgroundColor: colors.primary }
        ]}
        onPress={() => setActiveTab('league')}
      >
        <Text
          style={[
            styles.tabText,
            { color: activeTab === 'league' ? '#fff' : theme.text }
          ]}
        >
          League
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.tab,
          activeTab === 'players' && { backgroundColor: colors.primary }
        ]}
        onPress={() => setActiveTab('players')}
      >
        <Text
          style={[
            styles.tabText,
            { color: activeTab === 'players' ? '#fff' : theme.text }
          ]}
        >
          Players
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.tab,
          activeTab === 'teams' && { backgroundColor: colors.primary }
        ]}
        onPress={() => setActiveTab('teams')}
      >
        <Text
          style={[
            styles.tabText,
            { color: activeTab === 'teams' ? '#fff' : theme.text }
          ]}
        >
          Teams
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderPlayerCategorySelector = () => (
    <View style={styles.categoryContainer}>
      <TouchableOpacity
        style={[
          styles.categoryTab,
          activeCategory === 'scorers' && { backgroundColor: colors.primary }
        ]}
        onPress={() => setActiveCategory('scorers')}
      >
        <Ionicons 
          name="football" 
          size={16} 
          color={activeCategory === 'scorers' ? '#fff' : theme.textSecondary} 
        />
        <Text
          style={[
            styles.categoryText,
            { color: activeCategory === 'scorers' ? '#fff' : theme.text }
          ]}
        >
          Top Scorers
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.categoryTab,
          activeCategory === 'assists' && { backgroundColor: colors.primary }
        ]}
        onPress={() => setActiveCategory('assists')}
      >
        <Ionicons 
          name="hand-right" 
          size={16} 
          color={activeCategory === 'assists' ? '#fff' : theme.textSecondary} 
        />
        <Text
          style={[
            styles.categoryText,
            { color: activeCategory === 'assists' ? '#fff' : theme.text }
          ]}
        >
          Assists
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.categoryTab,
          activeCategory === 'cards' && { backgroundColor: colors.primary }
        ]}
        onPress={() => setActiveCategory('cards')}
      >
        <Ionicons 
          name="card" 
          size={16} 
          color={activeCategory === 'cards' ? '#fff' : theme.textSecondary} 
        />
        <Text
          style={[
            styles.categoryText,
            { color: activeCategory === 'cards' ? '#fff' : theme.text }
          ]}
        >
          Cards
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderLeagueStats = () => {
    const { league } = statsData;
    if (!league) return null;

    return (
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            League Overview
          </Text>
          
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.primary }]}>
                {league.totalTeams || 20}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                Teams
              </Text>
            </View>
            
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.primary }]}>
                {league.matchesPlayed || 0}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                Matches Played
              </Text>
            </View>
            
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.primary }]}>
                {league.totalGoals || 0}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                Total Goals
              </Text>
            </View>
            
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.primary }]}>
                {league.averageGoals ? league.averageGoals.toFixed(1) : '0.0'}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                Goals/Match
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Competition Stats
          </Text>
          
          <View style={styles.competitionItem}>
            <View style={styles.competitionInfo}>
              <Text style={[styles.competitionName, { color: theme.text }]}>
                La Liga
              </Text>
              <Text style={[styles.competitionDetails, { color: theme.textSecondary }]}>
                Matchday {league.currentMatchday || 1} of {league.totalMatchdays || 38}
              </Text>
            </View>
            <View style={styles.competitionProgress}>
              <View style={[
                styles.progressBar,
                { backgroundColor: theme.background }
              ]}>
                <View style={[
                  styles.progressFill,
                  { 
                    backgroundColor: colors.primary,
                    width: `${((league.currentMatchday || 1) / (league.totalMatchdays || 38)) * 100}%`
                  }
                ]} />
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Quick Stats
          </Text>
          
          <View style={styles.quickStatsContainer}>
            <View style={styles.quickStatRow}>
              <Text style={[styles.quickStatLabel, { color: theme.textSecondary }]}>
                Yellow Cards
              </Text>
              <Text style={[styles.quickStatValue, { color: theme.text }]}>
                {league.yellowCards || 0}
              </Text>
            </View>
            
            <View style={styles.quickStatRow}>
              <Text style={[styles.quickStatLabel, { color: theme.textSecondary }]}>
                Red Cards
              </Text>
              <Text style={[styles.quickStatValue, { color: theme.text }]}>
                {league.redCards || 0}
              </Text>
            </View>
            
            <View style={styles.quickStatRow}>
              <Text style={[styles.quickStatLabel, { color: theme.textSecondary }]}>
                Penalties
              </Text>
              <Text style={[styles.quickStatValue, { color: theme.text }]}>
                {league.penalties || 0}
              </Text>
            </View>
            
            <View style={styles.quickStatRow}>
              <Text style={[styles.quickStatLabel, { color: theme.textSecondary }]}>
                Clean Sheets
              </Text>
              <Text style={[styles.quickStatValue, { color: theme.text }]}>
                {league.cleanSheets || 0}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  };

  const renderPlayerItem = ({ item: player, index }) => (
    <TouchableOpacity
      style={[styles.playerItem, { backgroundColor: theme.surface }]}
      onPress={() => handlePlayerPress(player)}
      activeOpacity={0.7}
    >
      <View style={styles.playerRank}>
        <Text style={[styles.rankNumber, { color: colors.primary }]}>
          {index + 1}
        </Text>
      </View>
      
      <View style={[styles.playerAvatar, { backgroundColor: colors.primary }]}>
        <Text style={styles.playerInitials}>
          {player.displayName.split(' ').map(n => n[0]).join('').substring(0, 2)}
        </Text>
      </View>
      
      <View style={styles.playerDetails}>
        <Text style={[styles.playerName, { color: theme.text }]}>
          {player.displayName}
        </Text>
        <View style={styles.playerTeamRow}>
          {player.team?.logo && (
            <Image
              source={{ uri: player.team.logo }}
              style={styles.playerTeamLogo}
              resizeMode="contain"
            />
          )}
          <Text style={[styles.playerTeam, { color: theme.textSecondary }]}>
            {player.team?.displayName || 'Unknown Team'}
          </Text>
        </View>
      </View>
      
      <View style={styles.playerStat}>
        <Text style={[styles.statValue, { color: colors.primary }]}>
          {activeCategory === 'scorers' ? (player.goals || 0) :
           activeCategory === 'assists' ? (player.assists || 0) :
           (player.yellowCards || 0) + (player.redCards || 0)}
        </Text>
        <Text style={[styles.statUnit, { color: theme.textSecondary }]}>
          {activeCategory === 'scorers' ? 'goals' :
           activeCategory === 'assists' ? 'assists' : 'cards'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderPlayersStats = () => {
    const currentData = 
      activeCategory === 'scorers' ? statsData.topScorers :
      activeCategory === 'assists' ? statsData.topAssists :
      statsData.topCards;

    return (
      <View style={styles.content}>
        {renderPlayerCategorySelector()}
        <FlatList
          data={currentData}
          renderItem={renderPlayerItem}
          keyExtractor={(item) => `${item.id}-${activeCategory}`}
          contentContainerStyle={styles.playersContainer}
          showsVerticalScrollIndicator={false}
        />
      </View>
    );
  };

  const renderTeamStatItem = ({ item: team, index }) => (
    <TouchableOpacity
      style={[styles.teamStatItem, { backgroundColor: theme.surface }]}
      onPress={() => handleTeamPress(team)}
      activeOpacity={0.7}
    >
      <View style={styles.teamRank}>
        <Text style={[styles.rankNumber, { color: colors.primary }]}>
          {index + 1}
        </Text>
      </View>
      
      <Image
        source={{ uri: team.logo }}
        style={styles.teamStatLogo}
        resizeMode="contain"
      />
      
      <View style={styles.teamStatDetails}>
        <Text style={[styles.teamStatName, { color: theme.text }]}>
          {team.displayName}
        </Text>
        <View style={styles.teamStatRow}>
          <View style={styles.teamQuickStat}>
            <Text style={[styles.teamQuickStatValue, { color: theme.text }]}>
              {team.wins || 0}
            </Text>
            <Text style={[styles.teamQuickStatLabel, { color: theme.textSecondary }]}>
              W
            </Text>
          </View>
          <View style={styles.teamQuickStat}>
            <Text style={[styles.teamQuickStatValue, { color: theme.text }]}>
              {team.draws || 0}
            </Text>
            <Text style={[styles.teamQuickStatLabel, { color: theme.textSecondary }]}>
              D
            </Text>
          </View>
          <View style={styles.teamQuickStat}>
            <Text style={[styles.teamQuickStatValue, { color: theme.text }]}>
              {team.losses || 0}
            </Text>
            <Text style={[styles.teamQuickStatLabel, { color: theme.textSecondary }]}>
              L
            </Text>
          </View>
        </View>
      </View>
      
      <View style={styles.teamMainStat}>
        <Text style={[styles.teamPoints, { color: colors.primary }]}>
          {team.points || 0}
        </Text>
        <Text style={[styles.teamPointsLabel, { color: theme.textSecondary }]}>
          pts
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderTeamsStats = () => (
    <View style={styles.content}>
      <FlatList
        data={statsData.teamStats}
        renderItem={renderTeamStatItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.teamsContainer}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.text }]}>
          Loading statistics...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderTabSelector()}
      
      {activeTab === 'league' && renderLeagueStats()}
      {activeTab === 'players' && renderPlayersStats()}
      {activeTab === 'teams' && renderTeamsStats()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.05)',
    margin: 16,
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  section: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statItem: {
    width: '48%',
    alignItems: 'center',
    marginBottom: 16,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  competitionItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  competitionInfo: {
    flex: 1,
  },
  competitionName: {
    fontSize: 16,
    fontWeight: '600',
  },
  competitionDetails: {
    fontSize: 12,
    marginTop: 2,
  },
  competitionProgress: {
    flex: 1,
    marginLeft: 16,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  quickStatsContainer: {
    gap: 12,
  },
  quickStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quickStatLabel: {
    fontSize: 14,
  },
  quickStatValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  categoryContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.05)',
    margin: 16,
    borderRadius: 8,
    padding: 4,
  },
  categoryTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 6,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  playersContainer: {
    padding: 16,
  },
  playerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  playerRank: {
    width: 32,
    alignItems: 'center',
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  playerInitials: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  playerDetails: {
    flex: 1,
  },
  playerName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  playerTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerTeamLogo: {
    width: 16,
    height: 16,
    marginRight: 6,
  },
  playerTeam: {
    fontSize: 11,
  },
  playerStat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  statUnit: {
    fontSize: 10,
    marginTop: 2,
  },
  teamsContainer: {
    padding: 16,
  },
  teamStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  teamRank: {
    width: 32,
    alignItems: 'center',
  },
  teamStatLogo: {
    width: 36,
    height: 36,
    marginHorizontal: 12,
  },
  teamStatDetails: {
    flex: 1,
  },
  teamStatName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  teamStatRow: {
    flexDirection: 'row',
    gap: 16,
  },
  teamQuickStat: {
    alignItems: 'center',
  },
  teamQuickStatValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  teamQuickStatLabel: {
    fontSize: 10,
  },
  teamMainStat: {
    alignItems: 'center',
  },
  teamPoints: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  teamPointsLabel: {
    fontSize: 10,
    marginTop: 2,
  },
});

export default SpainStatsScreen;
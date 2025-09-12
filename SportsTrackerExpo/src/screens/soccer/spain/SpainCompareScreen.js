import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Modal,
  FlatList,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SpainServiceEnhanced } from '../../../services/soccer/SpainServiceEnhanced';
import { useTheme } from '../../../context/ThemeContext';

const SpainCompareScreen = ({ navigation, route }) => {
  const { theme, colors } = useTheme();
  const [team1, setTeam1] = useState(null);
  const [team2, setTeam2] = useState(null);
  const [availableTeams, setAvailableTeams] = useState([]);
  const [selectingFor, setSelectingFor] = useState(null); // 'team1' or 'team2'
  const [modalVisible, setModalVisible] = useState(false);
  const [comparisonData, setComparisonData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(true);

  useEffect(() => {
    loadAvailableTeams();
  }, []);

  useEffect(() => {
    if (team1 && team2) {
      compareTeams();
    }
  }, [team1, team2]);

  const loadAvailableTeams = async () => {
    try {
      setLoadingTeams(true);
      const teams = await SpainServiceEnhanced.getAllTeams();
      
      // Process teams with logos
      const processedTeams = await Promise.all(
        teams.map(async (team) => {
          const logo = await SpainServiceEnhanced.getTeamLogoWithFallback(team.id);
          return {
            ...team,
            logo
          };
        })
      );

      setAvailableTeams(processedTeams);
    } catch (error) {
      console.error('Error loading teams:', error);
      Alert.alert('Error', 'Failed to load teams');
    } finally {
      setLoadingTeams(false);
    }
  };

  const compareTeams = async () => {
    if (!team1 || !team2) return;

    try {
      setLoading(true);
      const [team1Stats, team2Stats, headToHead] = await Promise.all([
        SpainServiceEnhanced.getTeamStats(team1.id),
        SpainServiceEnhanced.getTeamStats(team2.id),
        SpainServiceEnhanced.getHeadToHead(team1.id, team2.id)
      ]);

      setComparisonData({
        team1: { ...team1, stats: team1Stats },
        team2: { ...team2, stats: team2Stats },
        headToHead
      });
    } catch (error) {
      console.error('Error comparing teams:', error);
      Alert.alert('Error', 'Failed to compare teams');
    } finally {
      setLoading(false);
    }
  };

  const openTeamSelector = (forTeam) => {
    setSelectingFor(forTeam);
    setModalVisible(true);
  };

  const selectTeam = (team) => {
    if (selectingFor === 'team1') {
      setTeam1(team);
    } else {
      setTeam2(team);
    }
    setModalVisible(false);
    setSelectingFor(null);
  };

  const swapTeams = () => {
    const temp = team1;
    setTeam1(team2);
    setTeam2(temp);
  };

  const clearComparison = () => {
    setTeam1(null);
    setTeam2(null);
    setComparisonData(null);
  };

  const renderTeamSelector = () => (
    <Modal
      visible={modalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
        <View style={[styles.modalHeader, { backgroundColor: theme.surface }]}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>
            Select Team
          </Text>
          <TouchableOpacity
            onPress={() => setModalVisible(false)}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>

        {loadingTeams ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={availableTeams}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.teamOption, { backgroundColor: theme.surface }]}
                onPress={() => selectTeam(item)}
              >
                <Image
                  source={{ uri: item.logo }}
                  style={styles.teamOptionLogo}
                  resizeMode="contain"
                />
                <View style={styles.teamOptionInfo}>
                  <Text style={[styles.teamOptionName, { color: theme.text }]}>
                    {item.displayName}
                  </Text>
                  <Text style={[styles.teamOptionLocation, { color: theme.textSecondary }]}>
                    {item.location}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.teamsList}
          />
        )}
      </View>
    </Modal>
  );

  const renderTeamCard = (team, position) => (
    <TouchableOpacity
      style={[styles.teamCard, { backgroundColor: theme.surface }]}
      onPress={() => openTeamSelector(position)}
      activeOpacity={0.7}
    >
      {team ? (
        <>
          <Image
            source={{ uri: team.logo }}
            style={styles.teamCardLogo}
            resizeMode="contain"
          />
          <Text style={[styles.teamCardName, { color: theme.text }]}>
            {team.displayName}
          </Text>
          <Text style={[styles.teamCardLocation, { color: theme.textSecondary }]}>
            {team.location}
          </Text>
        </>
      ) : (
        <>
          <View style={[styles.placeholderLogo, { backgroundColor: theme.background }]}>
            <Ionicons name="add" size={32} color={theme.textSecondary} />
          </View>
          <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
            Select Team
          </Text>
        </>
      )}
    </TouchableOpacity>
  );

  const renderVersusSection = () => (
    <View style={styles.versusContainer}>
      <View style={styles.teamsRow}>
        {renderTeamCard(team1, 'team1')}
        
        <View style={styles.versusMiddle}>
          <Text style={[styles.versusText, { color: colors.primary }]}>VS</Text>
          {team1 && team2 && (
            <TouchableOpacity onPress={swapTeams} style={styles.swapButton}>
              <Ionicons name="swap-horizontal" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
        
        {renderTeamCard(team2, 'team2')}
      </View>

      {team1 && team2 && (
        <TouchableOpacity
          style={[styles.clearButton, { backgroundColor: theme.background }]}
          onPress={clearComparison}
        >
          <Text style={[styles.clearButtonText, { color: theme.textSecondary }]}>
            Clear Comparison
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderStatComparison = (label, team1Value, team2Value, isPercentage = false) => {
    const val1 = parseFloat(team1Value) || 0;
    const val2 = parseFloat(team2Value) || 0;
    const team1Better = val1 > val2;
    const team2Better = val2 > val1;

    return (
      <View style={styles.statRow}>
        <View style={[styles.statValue, team1Better && styles.betterStat]}>
          <Text style={[
            styles.statNumber, 
            { color: team1Better ? colors.primary : theme.text }
          ]}>
            {isPercentage ? `${val1.toFixed(1)}%` : val1.toString()}
          </Text>
        </View>
        
        <View style={styles.statLabel}>
          <Text style={[styles.statLabelText, { color: theme.text }]}>
            {label}
          </Text>
        </View>
        
        <View style={[styles.statValue, team2Better && styles.betterStat]}>
          <Text style={[
            styles.statNumber, 
            { color: team2Better ? colors.primary : theme.text }
          ]}>
            {isPercentage ? `${val2.toFixed(1)}%` : val2.toString()}
          </Text>
        </View>
      </View>
    );
  };

  const renderComparison = () => {
    if (!comparisonData) return null;

    const { team1: t1, team2: t2, headToHead } = comparisonData;

    return (
      <ScrollView style={styles.comparisonContainer} showsVerticalScrollIndicator={false}>
        {/* Head to Head */}
        {headToHead && (
          <View style={[styles.section, { backgroundColor: theme.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Head to Head
            </Text>
            <View style={styles.headToHeadContainer}>
              <View style={styles.headToHeadStat}>
                <Text style={[styles.headToHeadNumber, { color: colors.primary }]}>
                  {headToHead.team1Wins || 0}
                </Text>
                <Text style={[styles.headToHeadLabel, { color: theme.textSecondary }]}>
                  Wins
                </Text>
              </View>
              
              <View style={styles.headToHeadStat}>
                <Text style={[styles.headToHeadNumber, { color: theme.textSecondary }]}>
                  {headToHead.draws || 0}
                </Text>
                <Text style={[styles.headToHeadLabel, { color: theme.textSecondary }]}>
                  Draws
                </Text>
              </View>
              
              <View style={styles.headToHeadStat}>
                <Text style={[styles.headToHeadNumber, { color: colors.primary }]}>
                  {headToHead.team2Wins || 0}
                </Text>
                <Text style={[styles.headToHeadLabel, { color: theme.textSecondary }]}>
                  Wins
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Stats Comparison */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Season Statistics
          </Text>
          
          <View style={styles.statsContainer}>
            {renderStatComparison(
              'Matches Played',
              t1.stats?.matchesPlayed || 0,
              t2.stats?.matchesPlayed || 0
            )}
            {renderStatComparison(
              'Wins',
              t1.stats?.wins || 0,
              t2.stats?.wins || 0
            )}
            {renderStatComparison(
              'Draws',
              t1.stats?.draws || 0,
              t2.stats?.draws || 0
            )}
            {renderStatComparison(
              'Losses',
              t1.stats?.losses || 0,
              t2.stats?.losses || 0
            )}
            {renderStatComparison(
              'Goals For',
              t1.stats?.goalsFor || 0,
              t2.stats?.goalsFor || 0
            )}
            {renderStatComparison(
              'Goals Against',
              t2.stats?.goalsAgainst || 0, // Lower is better
              t1.stats?.goalsAgainst || 0
            )}
            {renderStatComparison(
              'Goal Difference',
              t1.stats?.goalDifference || 0,
              t2.stats?.goalDifference || 0
            )}
            {renderStatComparison(
              'Points',
              t1.stats?.points || 0,
              t2.stats?.points || 0
            )}
            {renderStatComparison(
              'Win Rate',
              ((t1.stats?.wins || 0) / Math.max(t1.stats?.matchesPlayed || 1, 1)) * 100,
              ((t2.stats?.wins || 0) / Math.max(t2.stats?.matchesPlayed || 1, 1)) * 100,
              true
            )}
          </View>
        </View>

        {/* Form Guide */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Recent Form (Last 5 Games)
          </Text>
          <View style={styles.formContainer}>
            <View style={styles.formTeam}>
              <Text style={[styles.formTeamName, { color: theme.text }]}>
                {t1.shortDisplayName || t1.displayName}
              </Text>
              <View style={styles.formIndicators}>
                {(t1.stats?.form || 'NNNNN').split('').map((result, index) => (
                  <View
                    key={index}
                    style={[
                      styles.formDot,
                      {
                        backgroundColor:
                          result === 'W' ? '#4CAF50' :
                          result === 'D' ? '#FFC107' :
                          result === 'L' ? '#F44336' : theme.background
                      }
                    ]}
                  />
                ))}
              </View>
            </View>
            
            <View style={styles.formTeam}>
              <Text style={[styles.formTeamName, { color: theme.text }]}>
                {t2.shortDisplayName || t2.displayName}
              </Text>
              <View style={styles.formIndicators}>
                {(t2.stats?.form || 'NNNNN').split('').map((result, index) => (
                  <View
                    key={index}
                    style={[
                      styles.formDot,
                      {
                        backgroundColor:
                          result === 'W' ? '#4CAF50' :
                          result === 'D' ? '#FFC107' :
                          result === 'L' ? '#F44336' : theme.background
                      }
                    ]}
                  />
                ))}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderVersusSection()}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: theme.text }]}>
            Comparing teams...
          </Text>
        </View>
      ) : comparisonData ? (
        renderComparison()
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="stats-chart" size={64} color={theme.textSecondary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            Compare Teams
          </Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            Select two teams to compare their statistics and head-to-head record
          </Text>
        </View>
      )}

      {renderTeamSelector()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  versusContainer: {
    padding: 16,
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamCard: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  teamCardLogo: {
    width: 60,
    height: 60,
    marginBottom: 8,
  },
  teamCardName: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  teamCardLocation: {
    fontSize: 11,
    textAlign: 'center',
  },
  placeholderLogo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.1)',
    borderStyle: 'dashed',
  },
  placeholderText: {
    fontSize: 12,
    fontWeight: '500',
  },
  versusMiddle: {
    alignItems: 'center',
    marginHorizontal: 16,
  },
  versusText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  swapButton: {
    marginTop: 8,
    padding: 8,
  },
  clearButton: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  comparisonContainer: {
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
  headToHeadContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  headToHeadStat: {
    alignItems: 'center',
  },
  headToHeadNumber: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headToHeadLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  statsContainer: {
    gap: 12,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statValue: {
    flex: 1,
    alignItems: 'center',
    padding: 8,
    borderRadius: 6,
  },
  betterStat: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  statNumber: {
    fontSize: 16,
    fontWeight: '600',
  },
  statLabel: {
    flex: 1.5,
    alignItems: 'center',
  },
  statLabelText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  formContainer: {
    gap: 16,
  },
  formTeam: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  formTeamName: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  formIndicators: {
    flexDirection: 'row',
    gap: 4,
  },
  formDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
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
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  teamsList: {
    padding: 16,
  },
  teamOption: {
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
  teamOptionLogo: {
    width: 40,
    height: 40,
    marginRight: 12,
  },
  teamOptionInfo: {
    flex: 1,
  },
  teamOptionName: {
    fontSize: 16,
    fontWeight: '600',
  },
  teamOptionLocation: {
    fontSize: 12,
    marginTop: 2,
  },
});

export default SpainCompareScreen;
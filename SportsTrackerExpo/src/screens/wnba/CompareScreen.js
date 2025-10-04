import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  Image, 
  ScrollView, 
  ActivityIndicator, 
  Modal, 
  TextInput, 
  FlatList,
  StyleSheet 
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import WNBADataService from '../../services/WNBADataService';
import YearFallbackUtils from '../../utils/YearFallbackUtils';

const CompareScreen = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors, isDarkMode, getTeamLogoUrl } = useTheme();
  
  // State for player comparison
  const [player1, setPlayer1] = useState(null);
  const [player2, setPlayer2] = useState(null);
  const [player1Year, setPlayer1Year] = useState(YearFallbackUtils.getCurrentYear());
  const [player2Year, setPlayer2Year] = useState(YearFallbackUtils.getCurrentYear());
  const [comparisonStats, setComparisonStats] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // State for player search
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchingForPlayer, setSearchingForPlayer] = useState(null); // 1 or 2
  
  // State for year selectors
  const [showYear1Picker, setShowYear1Picker] = useState(false);
  const [showYear2Picker, setShowYear2Picker] = useState(false);
  
  // WNBA data loading state
  const [wnbaDataLoading, setWnbaDataLoading] = useState(true);
  const [allWNBAPlayers, setAllWNBAPlayers] = useState([]);

  // Generate year options
  const currentYear = YearFallbackUtils.getCurrentYear();
  const startYear = 2020;
  const yearOptions = Array.from({length: currentYear - startYear + 1}, (_, i) => currentYear - i);

  useEffect(() => {
    initializeWNBAData();
  }, []);

  useEffect(() => {
    if (player1 && player2) {
      loadComparison();
    }
  }, [player1, player2, player1Year, player2Year]);

  const initializeWNBAData = async () => {
    try {
      await WNBADataService.initializeData();
      setAllWNBAPlayers(WNBADataService.getAllPlayers());
    } catch (error) {
      console.error('Error initializing WNBA data:', error);
    } finally {
      setWnbaDataLoading(false);
    }
  };

  const searchPlayers = (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    const results = allWNBAPlayers.filter(player =>
      player.displayName && 
      player.displayName.toLowerCase().includes(query.toLowerCase())
    );
    setSearchResults(results);
  };

  const selectPlayer = (player, playerNumber) => {
    const otherPlayer = playerNumber === 1 ? player2 : player1;
    
    // In WNBA, all players can be compared with each other
    if (otherPlayer && !WNBADataService.canCompare(player, otherPlayer)) {
      // This should never happen in WNBA since canCompare always returns true
      console.warn('Players cannot be compared, but this should not happen in WNBA');
    }
    
    if (playerNumber === 1) {
      setPlayer1(player);
    } else {
      setPlayer2(player);
    }
    setShowSearchModal(false);
    setSearchText('');
    setSearchResults([]);
  };

  const clearPlayer = (playerNumber) => {
    if (playerNumber === 1) {
      setPlayer1(null);
    } else {
      setPlayer2(null);
    }
    setComparisonStats(null);
  };

  const openPlayerSearch = (playerNumber) => {
    setSearchingForPlayer(playerNumber);
    setShowSearchModal(true);
  };

  const loadComparison = async () => {
    if (!player1 || !player2) return;

    setLoading(true);
    try {
      const [stats1, stats2] = await Promise.all([
        fetchPlayerStats(player1.id, player1Year),
        fetchPlayerStats(player2.id, player2Year)
      ]);

      setComparisonStats({
        player1: stats1,
        player2: stats2
      });
    } catch (error) {
      console.error('Error loading comparison:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlayerStats = async (playerId, year) => {
    try {
      const response = await fetch(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/seasons/${year}/types/2/athletes/${playerId}/statistics?lang=en&region=us`);
      const data = await response.json();
      
      if (data.splits && data.splits.categories) {
        const stats = {};
        data.splits.categories.forEach(category => {
          if (category.name && category.stats) {
            category.stats.forEach(stat => {
              if (stat.name && stat.displayValue !== undefined) {
                // Use the actual stat name from the API response
                const statName = stat.name;
                
                stats[statName] = {
                  value: parseFloat(stat.value) || stat.value,
                  displayValue: stat.displayValue
                };
              }
            });
          }
        });
        
        return {
          categories: data.splits.categories,
          stats: stats,
          player: data.athlete || {}
        };
      }
      
      return { categories: [], stats: {}, player: {} };
    } catch (error) {
      console.error('Error fetching player stats:', error);
      return { categories: [], stats: {}, player: {} };
    }
  };

  // WNBA Position Groupings - all can compare
  const getPositionGroup = (position) => {
    return WNBADataService.getPositionGroup(position);
  };

  // Get relevant stats for WNBA players
  const getPositionStats = (positionGroup, categories) => {
    const statMappings = {
      player: {
        'Scoring': ['points', 'avgPoints', 'avg48Points', 'fieldGoalPct', 'threePointPct', 'freeThrowPct'],
        'Rebounding': ['avgRebounds', 'rebounds', 'offensiveRebounds', 'defensiveRebounds'],
        'Playmaking': ['PER', 'avgAssists', 'assists', 'turnovers', 'steals', 'doubleDouble'],
        'Defending': ['steals', 'blocks', 'fouls']
      }
    };

    return statMappings[positionGroup] || statMappings.player;
  };

  // Define which stats are better when lower
  const isLowerBetter = (statName) => {
    const lowerIsBetterStats = ['turnovers', 'fouls'];
    return lowerIsBetterStats.includes(statName);
  };

  const getWNBATeamAbbreviation = (team) => {
    const teamMapping = {
      '3' : 'DAL', '5' : 'IND', '6' : 'LA', '8' : 'MIN', '9' : 'NY', '11' : 'PHX', '14' : 'SEA', 
      '16' : 'WSH', '17' : 'LV', '18' : 'CON', '19' : 'CHI', '20' : 'ATL', '129689' : 'GS'
    };

    if (team?.abbreviation) {
      return team.abbreviation;
    }
    
    const abbr = teamMapping[team?.id?.toString()];
    if (abbr) {
      return abbr;
    }
    
    return team?.name?.substring(0, 3)?.toUpperCase() || 'WNBA';
  };

  const getTeamLogo = (player) => {
    const teamLogoUrl = isDarkMode ? player.team?.logos?.[1]?.href : player.team?.logos?.[0]?.href;
    return teamLogoUrl || getTeamLogoUrl('wnba', getWNBATeamAbbreviation(player.team));
  };

  const renderPlayerCard = (player, playerNumber) => {
    const currentYear = playerNumber === 1 ? player1Year : player2Year;
    const showYearPicker = playerNumber === 1 ? showYear1Picker : showYear2Picker;
    const setShowYearPicker = playerNumber === 1 ? setShowYear1Picker : setShowYear2Picker;
    const setYear = playerNumber === 1 ? setPlayer1Year : setPlayer2Year;

    if (!player) {
      return (
        <TouchableOpacity
          style={[styles.playerCard, styles.addPlayerButton, { 
            backgroundColor: theme.surface,
            borderColor: theme.border
          }]}
          onPress={() => openPlayerSearch(playerNumber)}
        >
          <Text style={[styles.addPlayerIcon, { color: colors.primary }]}>+</Text>
          <Text style={[styles.addPlayerText, { color: theme.text }]}>
            Add Player {playerNumber}
          </Text>
        </TouchableOpacity>
      );
    }

    return (
      <View style={[styles.playerCard, { 
        backgroundColor: theme.surface,
        borderColor: theme.border
      }]}>
        <TouchableOpacity
          style={styles.clearButton}
          onPress={() => clearPlayer(playerNumber)}
        >
          <Text style={styles.clearButtonText}>×</Text>
        </TouchableOpacity>

        <View style={styles.teamHeader}>
          <Image
            source={{ uri: getTeamLogo(player) }}
            style={styles.teamLogo}
          />
          <Text style={[styles.teamName, { color: theme.textSecondary }]}>
            {getWNBATeamAbbreviation(player.team)}
          </Text>
        </View>

        <View style={styles.playerImageContainer}>
          <Image
            source={{ 
              uri: player.headshot?.href || `https://a.espncdn.com/i/headshots/wnba/players/full/${player.id}.png`
            }}
            style={styles.playerImage}
          />
        </View>

        <View style={styles.playerNameContainer}>
          <Text style={[styles.playerName, { color: theme.text }]}>
            {player.displayName}
          </Text>
          <Text style={[styles.playerDetails, { color: theme.textSecondary }]}>
            {player.position?.displayName || 'Player'} • #{player.jersey || '00'}
          </Text>
        </View>

        <View style={styles.yearSelector}>
          <Text style={[styles.yearLabel, { color: theme.textSecondary }]}>Season</Text>
          <TouchableOpacity
            style={[styles.yearButton, { 
              borderColor: theme.border, 
              backgroundColor: theme.background 
            }]}
            onPress={() => setShowYearPicker(true)}
          >
            <Text style={[styles.yearButtonText, { color: theme.text }]}>
              {currentYear}
            </Text>
            <Text style={[styles.yearButtonArrow, { color: theme.textSecondary }]}>
              ▼
            </Text>
          </TouchableOpacity>
        </View>

        {/* Year Picker Modal */}
        <Modal visible={showYearPicker} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.yearPickerModal, { backgroundColor: theme.surface }]}>
              <Text style={[styles.yearPickerTitle, { 
                color: theme.text, 
                borderBottomColor: theme.border 
              }]}>
                Select Season
              </Text>
              <ScrollView style={styles.yearOptions}>
                {yearOptions.map(year => (
                  <TouchableOpacity
                    key={year}
                    style={styles.yearOption}
                    onPress={() => {
                      setYear(year);
                      setShowYearPicker(false);
                    }}
                  >
                    <Text style={[styles.yearOptionText, { 
                      color: year === currentYear ? colors.primary : theme.text 
                    }]}>
                      {year}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={[styles.yearPickerCancel, { borderTopColor: theme.border }]}
                onPress={() => setShowYearPicker(false)}
              >
                <Text style={[styles.yearPickerCancelText, { color: colors.primary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  };

  const renderComparisonStats = () => {
    if (!comparisonStats || !comparisonStats.player1 || !comparisonStats.player2) {
      return null;
    }

    const positionGroup = getPositionGroup(player1.position?.displayName);
    const statCategories = getPositionStats(positionGroup, comparisonStats.player1.categories);

    return (
      <View style={styles.statsContainer}>
        <View style={[styles.comparisonHeader, { backgroundColor: colors.primary }]}>
          <Text style={[styles.comparisonType, { color: 'white' }]}>
            Player Comparison ({player1Year} vs {player2Year})
          </Text>
        </View>

        {Object.entries(statCategories).map(([categoryName, statNames]) => (
          <View key={categoryName}>
            <Text style={[styles.categoryHeader, { 
              color: 'white', 
              backgroundColor: colors.primary 
            }]}>
              {categoryName}
            </Text>
            
            {statNames.map(statName => {
              const stat1 = comparisonStats.player1.stats[statName];
              const stat2 = comparisonStats.player2.stats[statName];
              
              if (!stat1 && !stat2) return null;

              const value1 = stat1?.value || 0;
              const value2 = stat2?.value || 0;
              const display1 = stat1?.displayValue || '0';
              const display2 = stat2?.displayValue || '0';

              // For stats where lower is better, reverse the comparison
              const lowerIsBetter = isLowerBetter(statName);
              const isPlayer1Better = lowerIsBetter 
                ? parseFloat(value1) < parseFloat(value2)
                : parseFloat(value1) > parseFloat(value2);
              const isPlayer2Better = lowerIsBetter
                ? parseFloat(value2) < parseFloat(value1)
                : parseFloat(value2) > parseFloat(value1);

              return (
                <View 
                  key={statName}
                  style={[styles.statRow, { backgroundColor: theme.surface }]}
                >
                  <View style={[styles.statBox, { 
                    backgroundColor: isPlayer1Better ? colors.primary + '20' : 'transparent',
                    borderColor: isPlayer1Better ? colors.primary : theme.border 
                  }]}>
                    <Text style={[styles.statValue, { 
                      color: isPlayer1Better ? colors.primary : theme.text 
                    }]}>
                      {display1}
                    </Text>
                    {isPlayer1Better && (
                      <Text style={[styles.statRank, { color: colors.primary }]}>
                        BETTER
                      </Text>
                    )}
                  </View>
                  
                  <View style={styles.statLabelContainer}>
                    <Text style={[styles.statLabel, { color: theme.text }]}>
                      {statName.charAt(0).toUpperCase() + statName.slice(1).replace(/([A-Z, 4])/g, ' $1')}
                    </Text>
                  </View>
                  
                  <View style={[styles.statBox, { 
                    backgroundColor: isPlayer2Better ? colors.primary + '20' : 'transparent',
                    borderColor: isPlayer2Better ? colors.primary : theme.border 
                  }]}>
                    <Text style={[styles.statValue, { 
                      color: isPlayer2Better ? colors.primary : theme.text 
                    }]}>
                      {display2}
                    </Text>
                    {isPlayer2Better && (
                      <Text style={[styles.statRank, { color: colors.primary }]}>
                        BETTER
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  if (wnbaDataLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading WNBA data...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.primary }]}>Compare Players</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Compare WNBA players - all positions can be compared
          </Text>
        </View>

        <View style={styles.playersHeader}>
          {renderPlayerCard(player1, 1)}
          
          <View style={styles.vsContainer}>
            <Text style={[styles.vsText, { color: theme.text }]}>VS</Text>
          </View>
          
          {renderPlayerCard(player2, 2)}
        </View>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
              Loading comparison...
            </Text>
          </View>
        )}

        {!loading && comparisonStats && renderComparisonStats()}

        {!loading && !comparisonStats && player1 && player2 && (
          <View style={styles.errorContainer}>
            <Text style={[styles.errorText, { color: theme.textSecondary }]}>
              Unable to load statistics for comparison
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Player Search Modal */}
      <Modal 
        visible={showSearchModal} 
        animationType="slide" 
        presentationStyle="pageSheet" 
        onRequestClose={() => setShowSearchModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Select Player {searchingForPlayer}
            </Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowSearchModal(false)}
            >
              <Text style={[styles.modalCloseText, { color: colors.primary }]}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <TextInput
              style={[styles.searchInput, { 
                color: theme.text, 
                backgroundColor: theme.surface,
                borderColor: theme.border 
              }]}
              placeholder="Search for a player..."
              placeholderTextColor={theme.textSecondary}
              value={searchText}
              onChangeText={(text) => {
                setSearchText(text);
                searchPlayers(text);
              }}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>

          <View style={styles.searchResults}>
            <FlatList
              data={searchResults}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.searchResultItem, { backgroundColor: theme.surface }]}
                  onPress={() => selectPlayer(item, searchingForPlayer)}
                >
                  <View style={[styles.searchResultImage, { backgroundColor: theme.background }]}>
                    <Image
                      source={{ 
                        uri: item.headshot?.href || `https://a.espncdn.com/i/headshots/wnba/players/full/${item.id}.png`
                      }}
                      style={styles.playerHeadshot}
                    />
                  </View>
                  <View style={styles.searchResultInfo}>
                    <Text style={[styles.searchResultName, { color: theme.text }]}>
                      {item.displayName}
                    </Text>
                    <Text style={[styles.searchResultDetails, { color: theme.textSecondary }]}>
                      {item.position?.displayName || 'Player'} • #{item.jersey || '00'}
                    </Text>
                    <Text style={[styles.searchResultTeam, { color: theme.textTertiary }]}>
                      {getWNBATeamAbbreviation(item.team)}
                    </Text>
                  </View>
                  <Image
                    source={{ uri: getTeamLogo(item) }}
                    style={styles.searchResultTeamLogo}
                  />
                </TouchableOpacity>
              )}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  playersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 16,
  },
  playerCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    position: 'relative',
    minHeight: 240,
    justifyContent: 'flex-start',
    borderWidth: 1,
  },
  teamHeader: {
    alignItems: 'center',
    marginBottom: 8,
  },
  teamLogo: {
    width: 28,
    height: 28,
    marginBottom: 4,
  },
  teamName: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  playerImageContainer: {
    alignItems: 'center',
    marginBottom: 6,
  },
  playerNameContainer: {
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  clearButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#dc3545',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  clearButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  playerImage: {
    width: 70,
    height: 70,
    borderRadius: 30,
    marginBottom: 12,
  },
  playerHeadshot: {
    width: 50,
    height: 50,
    borderRadius: 50,
  },
  playerName: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  playerDetails: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  yearSelector: {
    alignItems: 'center',
    gap: 8,
  },
  yearLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  yearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 80,
  },
  yearButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  yearButtonArrow: {
    fontSize: 12,
    marginLeft: 8,
  },
  addPlayerButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  addPlayerIcon: {
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  addPlayerText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  vsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statsContainer: {
    gap: 8,
    marginTop: 8,
  },
  comparisonHeader: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 12,
    borderRadius: 8,
  },
  comparisonType: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  categoryHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    padding: 12,
    textAlign: 'center',
    marginBottom: 8,
    borderRadius: 6,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 12,
    marginBottom: 4,
  },
  statBox: {
    flex: 1,
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  statRank: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  statLabelContainer: {
    width: 80,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  errorContainer: {
    padding: 20,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
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
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    padding: 8,
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '500',
  },
  searchContainer: {
    padding: 16,
  },
  searchInput: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
  searchResults: {
    flex: 1,
    padding: 16,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    gap: 12,
  },
  searchResultImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultInitials: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  searchResultInfo: {
    flex: 1,
  },
  searchResultName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  searchResultDetails: {
    fontSize: 14,
    marginTop: 2,
  },
  searchResultTeam: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  searchResultTeamLogo: {
    width: 24,
    height: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  yearPickerModal: {
    width: 280,
    maxHeight: 400,
    borderRadius: 12,
    margin: 20,
  },
  yearPickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  yearOptions: {
    maxHeight: 250,
  },
  yearOption: {
    padding: 16,
    alignItems: 'center',
  },
  yearOptionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  yearPickerCancel: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 1,
  },
  yearPickerCancelText: {
    fontSize: 16,
    fontWeight: '500',
  },
});

export default CompareScreen;
import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  Image, 
  ActivityIndicator,
  Modal,
  Alert
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';

const CompareScreen = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors, isDarkMode, getTeamLogoUrl } = useTheme();
  
  // State for player comparison
  const [player1, setPlayer1] = useState(null);
  const [player2, setPlayer2] = useState(null);
  const [player1Year, setPlayer1Year] = useState(new Date().getFullYear());
  const [player2Year, setPlayer2Year] = useState(new Date().getFullYear());
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
  
  // All MLB players cache
  const [allMLBPlayers, setAllMLBPlayers] = useState([]);

  // Generate year options
  const currentYear = new Date().getFullYear();
  const startYear = 2022;
  const yearOptions = Array.from({length: currentYear - startYear + 1}, (_, i) => currentYear - i);

  useEffect(() => {
    fetchAllMLBPlayers();
  }, []);

  useEffect(() => {
    if (player1 && player2) {
      loadComparison();
    }
  }, [player1, player2, player1Year, player2Year]);

  const fetchAllMLBPlayers = async () => {
    try {
      const teams = [
        108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121,
        133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 158
      ];
      
      // Team mapping for logos and names
      const teamMapping = {
        108: { name: 'Los Angeles Angels', abbr: 'LAA' },
        109: { name: 'Arizona Diamondbacks', abbr: 'ARI' },
        110: { name: 'Baltimore Orioles', abbr: 'BAL' },
        111: { name: 'Boston Red Sox', abbr: 'BOS' },
        112: { name: 'Chicago Cubs', abbr: 'CHC' },
        113: { name: 'Cincinnati Reds', abbr: 'CIN' },
        114: { name: 'Cleveland Guardians', abbr: 'CLE' },
        115: { name: 'Colorado Rockies', abbr: 'COL' },
        116: { name: 'Detroit Tigers', abbr: 'DET' },
        117: { name: 'Houston Astros', abbr: 'HOU' },
        118: { name: 'Kansas City Royals', abbr: 'KC' },
        119: { name: 'Los Angeles Dodgers', abbr: 'LAD' },
        120: { name: 'Washington Nationals', abbr: 'WSH' },
        121: { name: 'New York Mets', abbr: 'NYM' },
        133: { name: 'Oakland Athletics', abbr: 'OAK' },
        134: { name: 'Pittsburgh Pirates', abbr: 'PIT' },
        135: { name: 'San Diego Padres', abbr: 'SD' },
        136: { name: 'Seattle Mariners', abbr: 'SEA' },
        137: { name: 'San Francisco Giants', abbr: 'SF' },
        138: { name: 'St. Louis Cardinals', abbr: 'STL' },
        139: { name: 'Tampa Bay Rays', abbr: 'TB' },
        140: { name: 'Texas Rangers', abbr: 'TEX' },
        141: { name: 'Toronto Blue Jays', abbr: 'TOR' },
        142: { name: 'Minnesota Twins', abbr: 'MIN' },
        143: { name: 'Philadelphia Phillies', abbr: 'PHI' },
        144: { name: 'Atlanta Braves', abbr: 'ATL' },
        145: { name: 'Chicago White Sox', abbr: 'CWS' },
        146: { name: 'Miami Marlins', abbr: 'MIA' },
        147: { name: 'New York Yankees', abbr: 'NYY' },
        158: { name: 'Milwaukee Brewers', abbr: 'MIL' }
      };
      
      const allPlayers = [];
      
      for (const teamId of teams) {
        try {
          const response = await fetch(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=active&season=${currentYear}`);
          const data = await response.json();
          
          if (data.roster) {
            const teamInfo = teamMapping[teamId];
            const teamPlayers = data.roster.map(player => ({
              id: player.person.id,
              firstName: player.person.firstName || '',
              lastName: player.person.lastName || '',
              fullName: player.person.fullName,
              displayName: player.person.fullName,
              position: player.position.abbreviation,
              positionCode: player.position.code,
              jersey: player.jerseyNumber || 'N/A',
              teamId: teamId,
              teamName: teamInfo.name,
              teamAbbr: teamInfo.abbr,
              headshot: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${player.person.id}/headshot/67/current`,
              isTwoWayPlayer: player.position.abbreviation === 'TWP' || player.position.name === 'Two-Way Player'
            }));
            allPlayers.push(...teamPlayers);
          }
        } catch (error) {
          console.log(`Error fetching roster for team ${teamId}:`, error);
        }
      }
      
      setAllMLBPlayers(allPlayers);
    } catch (error) {
      console.error('Error fetching all MLB players:', error);
    }
  };

  const searchPlayers = (query) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    const filteredPlayers = allMLBPlayers
      .filter(player => {
        const fullName = player.fullName.toLowerCase();
        return fullName.includes(query.toLowerCase());
      })
      .slice(0, 10); // Limit to 10 results

    setSearchResults(filteredPlayers);
  };

  const selectPlayer = (player, playerNumber) => {
    const playerData = {
      id: player.id,
      firstName: player.firstName,
      lastName: player.lastName,
      fullName: player.fullName,
      position: player.position,
      jersey: player.jersey,
      headshot: player.headshot,
      teamName: player.teamName,
      teamAbbr: player.teamAbbr,
      isTwoWayPlayer: player.isTwoWayPlayer || false,
      twoWayRole: null
    };

    if (playerNumber === 1) {
      setPlayer1(playerData);
    } else {
      setPlayer2(playerData);
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
      // Determine if players are pitchers (including TWP players)
      const isPitcher1 = player1.position === 'P' || player1.position === 'Pitcher' ||
                         player1.position === 'SP' || player1.position === 'RP' ||
                         player1.position === 'CP' || player1.isTwoWayPlayer;
      const isPitcher2 = player2.position === 'P' || player2.position === 'Pitcher' ||
                         player2.position === 'SP' || player2.position === 'RP' ||
                         player2.position === 'CP' || player2.isTwoWayPlayer;

      // For TWP players, we can compare them with both pitchers and hitters
      // Check if we have a valid comparison scenario
      const canCompare = (
        // Both are TWP
        (player1.isTwoWayPlayer && player2.isTwoWayPlayer) ||
        // One is TWP, other is pitcher
        (player1.isTwoWayPlayer && isPitcher2) ||
        (player2.isTwoWayPlayer && isPitcher1) ||
        // One is TWP, other is hitter
        (player1.isTwoWayPlayer && !isPitcher2) ||
        (player2.isTwoWayPlayer && !isPitcher1) ||
        // Both are regular players of same type
        (isPitcher1 === isPitcher2 && !player1.isTwoWayPlayer && !player2.isTwoWayPlayer)
      );

      if (!canCompare) {
        Alert.alert('Invalid Comparison', 'Can only compare pitchers with pitchers, hitters with hitters, or Two-Way Players with either.');
        setComparisonStats(null);
        setLoading(false);
        return;
      }

      // Determine which type of stats to compare
      // For TWP vs regular player, use the regular player's type
      // For TWP vs TWP, default to hitting stats
      let useHittingStats = true;
      if (player1.isTwoWayPlayer && player2.isTwoWayPlayer) {
        useHittingStats = true; // Default to hitting for TWP vs TWP
      } else if (player1.isTwoWayPlayer && !player2.isTwoWayPlayer) {
        useHittingStats = !isPitcher2; // Use player2's type
      } else if (!player1.isTwoWayPlayer && player2.isTwoWayPlayer) {
        useHittingStats = !isPitcher1; // Use player1's type
      } else {
        useHittingStats = !isPitcher1; // Both regular players
      }

      const group = useHittingStats ? 'hitting' : 'pitching';
      
      const [player1Response, player2Response] = await Promise.all([
        fetch(`https://statsapi.mlb.com/api/v1/people/${player1.id}/stats?stats=season&group=${group}&season=${player1Year}`),
        fetch(`https://statsapi.mlb.com/api/v1/people/${player2.id}/stats?stats=season&group=${group}&season=${player2Year}`)
      ]);

      const [player1Data, player2Data] = await Promise.all([
        player1Response.json(),
        player2Response.json()
      ]);

      const player1Stats = player1Data.stats?.[0]?.splits?.[0]?.stat;
      const player2Stats = player2Data.stats?.[0]?.splits?.[0]?.stat;

      if (!player1Stats && !player2Stats) {
        setComparisonStats({ error: 'No statistics available for comparison' });
        setLoading(false);
        return;
      }

      // Define stats to compare based on comparison type
      let statsToCompare;
      if (useHittingStats) {
        statsToCompare = [
          { key: "avg", label: "AVG", higherIsBetter: true },
          { key: "homeRuns", label: "HR", higherIsBetter: true },
          { key: "rbi", label: "RBI", higherIsBetter: true },
          { key: "obp", label: "OBP", higherIsBetter: true },
          { key: "slg", label: "SLG", higherIsBetter: true },
          { key: "ops", label: "OPS", higherIsBetter: true },
          { key: "hits", label: "Hits", higherIsBetter: true },
          { key: "runs", label: "Runs", higherIsBetter: true },
          { key: "stolenBases", label: "SB", higherIsBetter: true },
          { key: "strikeOuts", label: "SO", higherIsBetter: false }
        ];
      } else {
        statsToCompare = [
          { key: "era", label: "ERA", higherIsBetter: false },
          { key: "whip", label: "WHIP", higherIsBetter: false },
          { key: "wins", label: "Wins", higherIsBetter: true },
          { key: "strikeOuts", label: "SO", higherIsBetter: true },
          { key: "saves", label: "Saves", higherIsBetter: true },
          { key: "inningsPitched", label: "IP", higherIsBetter: true },
          { key: "baseOnBalls", label: "BB", higherIsBetter: false },
          { key: "losses", label: "L", higherIsBetter: false },
          { key: "hits", label: "H", higherIsBetter: false },
          { key: "homeRuns", label: "HR", higherIsBetter: false }
        ];
      }

      // Process comparison data
      const comparisonData = statsToCompare.map(statDef => {
        const defaultValue = statDef.key.includes('avg') || statDef.key.includes('obp') || 
                           statDef.key.includes('slg') || statDef.key.includes('ops') || 
                           statDef.key.includes('era') || statDef.key.includes('whip') ? '0.000' : '0';
        
        const stat1Value = player1Stats?.[statDef.key] || defaultValue;
        const stat2Value = player2Stats?.[statDef.key] || defaultValue;
        
        const num1 = parseFloat(stat1Value) || 0;
        const num2 = parseFloat(stat2Value) || 0;
        
        let player1Better = false;
        let player2Better = false;
        
        if (num1 !== 0 && num2 !== 0) {
          if (statDef.higherIsBetter) {
            player1Better = num1 > num2;
            player2Better = num2 > num1;
          } else {
            player1Better = num1 < num2;
            player2Better = num2 < num1;
          }
        }

        return {
          ...statDef,
          player1Value: stat1Value,
          player2Value: stat2Value,
          player1Better,
          player2Better
        };
      });

      setComparisonStats({
        isPitcher: !useHittingStats,
        stats: comparisonData,
        comparisonType: useHittingStats ? 'Hitting' : 'Pitching'
      });

    } catch (error) {
      console.error('Error loading comparison:', error);
      setComparisonStats({ error: 'Error loading comparison statistics' });
    }
    setLoading(false);
  };

  const getTeamLogo = (player) => {
    if (!player || !player.teamAbbr) return null;
    
    // Use the same theme context function as ScoreboardScreen and StandingsScreen
    return getTeamLogoUrl('mlb', player.teamAbbr);
  };

  const renderPlayerCard = (player, playerNumber) => {
    const isPlayer1 = playerNumber === 1;
    
    return (
      <View style={[styles.playerCard, { backgroundColor: theme.surface }]}>
        {player ? (
          <>
            <TouchableOpacity 
              style={styles.clearButton}
              onPress={() => clearPlayer(playerNumber)}
            >
              <Text allowFontScaling={false} style={styles.clearButtonText}>×</Text>
            </TouchableOpacity>
            
            {/* Team Logo and Name */}
            {player.teamAbbr && (
              <View style={styles.teamHeader}>
                <Image
                  source={{ uri: getTeamLogo(player) }}
                  style={styles.teamLogo}
                  resizeMode="contain"
                />
                <Text allowFontScaling={false} style={[styles.teamName, { color: theme.text }]}>
                  {player.teamAbbr}
                </Text>
              </View>
            )}
            
            {/* Player Image Container with fixed height */}
            <View style={styles.playerImageContainer}>
              <Image 
                source={{ uri: player.headshot }}
                style={styles.playerImage}
                defaultSource={{ uri: 'https://via.placeholder.com/60x60?text=MLB' }}
              />
            </View>
            
            {/* Player Name Container with fixed height for equal sizing */}
            <View style={styles.playerNameContainer}>
              <Text allowFontScaling={false} style={[styles.playerName, { color: theme.text }]} numberOfLines={2}>
                {player.fullName}
              </Text>
              <Text allowFontScaling={false} style={[styles.playerDetails, { color: theme.textSecondary }]}>
                #{player.jersey} | {player.position} {player.isTwoWayPlayer && '(TWP)'}
              </Text>
            </View>
            
            <View style={styles.yearSelector}>
              <Text allowFontScaling={false} style={[styles.yearLabel, { color: theme.text }]}>Year:</Text>
              <TouchableOpacity 
                style={[styles.yearButton, { 
                  backgroundColor: theme.surface,
                  borderColor: theme.border 
                }]}
                onPress={() => {
                  if (isPlayer1) {
                    setShowYear1Picker(true);
                  } else {
                    setShowYear2Picker(true);
                  }
                }}
              >
                <Text allowFontScaling={false} style={[styles.yearButtonText, { color: theme.text }]}>
                  {isPlayer1 ? player1Year : player2Year}
                </Text>
                <Text allowFontScaling={false} style={[styles.yearButtonArrow, { color: theme.textSecondary }]}>▼</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <TouchableOpacity 
            style={styles.addPlayerButton}
            onPress={() => openPlayerSearch(playerNumber)}
          >
            <Text allowFontScaling={false} style={[styles.addPlayerIcon, { color: colors.primary }]}>
              +
            </Text>
            <Text allowFontScaling={false} style={[styles.addPlayerText, { color: colors.primary }]}>
              Add Player {playerNumber}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderComparisonStats = () => {
    if (!comparisonStats) return null;
    
    if (comparisonStats.error) {
      return (
        <View style={styles.errorContainer}>
          <Text allowFontScaling={false} style={[styles.errorText, { color: theme.textSecondary }]}>
            {comparisonStats.error}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.statsContainer}>
        {/* Comparison Type Header */}
        {comparisonStats.comparisonType && (
          <View style={styles.comparisonHeader}>
            <Text allowFontScaling={false} style={[styles.comparisonType, { color: theme.text }]}>
              {comparisonStats.comparisonType} Statistics
            </Text>
          </View>
        )}
        
        {comparisonStats.stats.map((stat, index) => (
          <View key={index} style={[styles.statRow, { backgroundColor: theme.surface }]}>
            {/* Player 1 Stat */}
            <View style={[
              styles.statBox,
              { 
                backgroundColor: stat.player1Better ? colors.secondary + '20' : theme.background,
                borderColor: stat.player1Better ? colors.secondary : theme.border,
                borderWidth: stat.player1Better ? 2 : 1
              }
            ]}>
              <Text allowFontScaling={false} style={[
                styles.statValue,
                { color: stat.player1Better ? colors.secondary : theme.text }
              ]}>
                {stat.player1Value}
              </Text>
            </View>
            
            {/* Stat Label */}
            <View style={styles.statLabelContainer}>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.text }]}>
                {stat.label}
              </Text>
            </View>
            
            {/* Player 2 Stat */}
            <View style={[
              styles.statBox,
              { 
                backgroundColor: stat.player2Better ? colors.secondary + '20' : theme.background,
                borderColor: stat.player2Better ? colors.secondary : theme.border,
                borderWidth: stat.player2Better ? 2 : 1
              }
            ]}>
              <Text allowFontScaling={false} style={[
                styles.statValue,
                { color: stat.player2Better ? colors.secondary : theme.text }
              ]}>
                {stat.player2Value}
              </Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderSearchModal = () => (
    <Modal
      visible={showSearchModal}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowSearchModal(false)}
    >
      <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
        <View style={[styles.modalHeader, { backgroundColor: theme.surface }]}>
          <Text allowFontScaling={false} style={[styles.modalTitle, { color: theme.text }]}>
            Select Player {searchingForPlayer}
          </Text>
          <TouchableOpacity
            onPress={() => setShowSearchModal(false)}
            style={styles.modalCloseButton}
          >
            <Text allowFontScaling={false} style={[styles.modalCloseText, { color: colors.primary }]}>Close</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.searchContainer}>
          <TextInput
            style={[styles.searchInput, { 
              backgroundColor: theme.surface, 
              color: theme.text,
              borderColor: theme.border
            }]}
            placeholder="Search for a player..."
            placeholderTextColor={theme.textSecondary}
            value={searchText}
            onChangeText={(text) => {
              setSearchText(text);
              searchPlayers(text);
            }}
            autoFocus
          />
        </View>
        
        <ScrollView style={styles.searchResults}>
          {searchResults.map((player) => (
            <TouchableOpacity
              key={player.id}
              style={[styles.searchResultItem, { backgroundColor: theme.surface }]}
              onPress={() => selectPlayer(player, searchingForPlayer)}
            >
              <Image 
                source={{ uri: player.headshot }}
                style={styles.searchResultImage}
                defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
              />
              <View style={styles.searchResultInfo}>
                <Text allowFontScaling={false} style={[styles.searchResultName, { color: theme.text }]}>
                  {player.fullName}
                </Text>
                <Text allowFontScaling={false} style={[styles.searchResultDetails, { color: theme.textSecondary }]}>
                  #{player.jersey} | {player.position} {player.isTwoWayPlayer && '(TWP)'}
                </Text>
                {player.teamName && (
                  <Text allowFontScaling={false} style={[styles.searchResultTeam, { color: theme.textSecondary }]}>
                    {player.teamName}
                  </Text>
                )}
              </View>
              {player.teamAbbr && (
                <Image
                  source={{ uri: getTeamLogo(player) }}
                  style={styles.searchResultTeamLogo}
                  resizeMode="contain"
                />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text allowFontScaling={false} style={[styles.title, { color: colors.primary }]}>Player Comparison</Text>
          <Text allowFontScaling={false} style={[styles.subtitle, { color: theme.textSecondary }]}>
            Compare MLB players side by side
          </Text>
        </View>

        {/* Players Header */}
        <View style={styles.playersHeader}>
          {renderPlayerCard(player1, 1)}
          
          <View style={styles.vsContainer}>
            <Text allowFontScaling={false} style={[styles.vsText, { color: theme.text }]}>VS</Text>
          </View>
          
          {renderPlayerCard(player2, 2)}
        </View>

        {/* Comparison Stats */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.textSecondary }]}>
              Loading comparison...
            </Text>
          </View>
        ) : (
          renderComparisonStats()
        )}
      </ScrollView>

      {renderSearchModal()}
      
      {/* Year Picker Modals */}
      <Modal
        visible={showYear1Picker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowYear1Picker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.yearPickerModal, { backgroundColor: theme.surface }]}>
            <Text allowFontScaling={false} style={[styles.yearPickerTitle, { color: theme.text }]}>
              Select Year for {player1?.fullName}
            </Text>
            <ScrollView style={styles.yearOptions}>
              {yearOptions.map(year => (
                <TouchableOpacity
                  key={year}
                  style={[
                    styles.yearOption,
                    { backgroundColor: year === player1Year ? colors.primary : 'transparent' }
                  ]}
                  onPress={() => {
                    setPlayer1Year(year);
                    setShowYear1Picker(false);
                  }}
                >
                  <Text allowFontScaling={false} style={[
                    styles.yearOptionText,
                    { color: year === player1Year ? 'white' : theme.text }
                  ]}>
                    {year}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.yearPickerCancel, { borderTopColor: theme.border }]}
              onPress={() => setShowYear1Picker(false)}
            >
              <Text allowFontScaling={false} style={[styles.yearPickerCancelText, { color: colors.primary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showYear2Picker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowYear2Picker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.yearPickerModal, { backgroundColor: theme.surface }]}>
            <Text allowFontScaling={false} style={[styles.yearPickerTitle, { color: theme.text }]}>
              Select Year for {player2?.fullName}
            </Text>
            <ScrollView style={styles.yearOptions}>
              {yearOptions.map(year => (
                <TouchableOpacity
                  key={year}
                  style={[
                    styles.yearOption,
                    { backgroundColor: year === player2Year ? colors.primary : 'transparent' }
                  ]}
                  onPress={() => {
                    setPlayer2Year(year);
                    setShowYear2Picker(false);
                  }}
                >
                  <Text allowFontScaling={false} style={[
                    styles.yearOptionText,
                    { color: year === player2Year ? 'white' : theme.text }
                  ]}>
                    {year}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.yearPickerCancel, { borderTopColor: theme.border }]}
              onPress={() => setShowYear2Picker(false)}
            >
              <Text allowFontScaling={false} style={[styles.yearPickerCancelText, { color: colors.primary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
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
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 12,
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
    paddingVertical: 8,
    marginBottom: 12,
  },
  comparisonType: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 12,
  },
  statBox: {
    flex: 1,
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
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
    borderBottomColor: '#ddd',
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
    width: 40,
    height: 40,
    borderRadius: 20,
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
    borderBottomColor: '#ddd',
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

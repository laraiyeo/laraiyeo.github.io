import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  FlatList, 
  TouchableOpacity, 
  Image, 
  ActivityIndicator, 
  StyleSheet 
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import NFLDataService from '../../services/NFLDataService';

const SearchScreen = ({ route, navigation }) => {
  const { sport } = route.params;
  const { theme, colors, getTeamLogoUrl, isDarkMode } = useTheme();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  
  // Local state for NFL data
  const [nflData, setNflData] = useState(NFLDataService.getData());

  // Initialize data on component mount
  useEffect(() => {
    const initData = async () => {
      await NFLDataService.initializeData();
    };
    
    initData();

    // Listen for data updates
    const unsubscribe = NFLDataService.addListener(setNflData);
    return unsubscribe;
  }, []);

  // Debounce search to avoid too many API calls
  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      if (searchQuery.length >= 4) {
        performSearch(searchQuery);
      } else if (searchQuery.length === 0) {
        setSearchResults([]);
        setHasSearched(false);
      }
    }, 500);

    return () => clearTimeout(delayedSearch);
  }, [searchQuery, nflData.teamsCache, nflData.playersCache]);

  const performSearch = async (query) => {
    if (query.length < 4) return;
    
    // Wait for data to be initialized if not already
    if (!nflData.teamsCache || !nflData.playersCache) {
      if (!nflData.isInitializing) {
        await NFLDataService.initializeData();
      }
      return;
    }
    
    setLoading(true);
    setHasSearched(true);
    
    try {
      const teamResults = NFLDataService.searchTeams(query);
      const playerResults = NFLDataService.searchPlayers(query);
      
      const combinedResults = [
        ...teamResults.map(team => ({ ...team, type: 'team' })),
        ...playerResults.map(player => ({ ...player, type: 'player' }))
      ];
      
      setSearchResults(combinedResults);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const getNFLTeamAbbreviation = (team) => {
    const teamMapping = {
      '1': 'ATL', '2': 'BUF', '3': 'CHI', '4': 'CIN', '5': 'CLE', '6': 'DAL',
      '7': 'DEN', '8': 'DET', '9': 'GB', '10': 'TEN', '11': 'IND', '12': 'KC',
      '13': 'LV', '14': 'LAR', '15': 'MIA', '16': 'MIN', '17': 'NE', '18': 'NO',
      '19': 'NYG', '20': 'NYJ', '21': 'PHI', '22': 'ARI', '23': 'PIT', '24': 'LAC',
      '25': 'SF', '26': 'SEA', '27': 'TB', '28': 'WAS', '29': 'CAR', '30': 'JAX',
      '33': 'BAL', '34': 'HOU'
    };

    if (team?.abbreviation) {
      return team.abbreviation;
    }
    
    const abbr = teamMapping[team?.id?.toString()];
    if (abbr) {
      return abbr;
    }
    
    return team?.name?.substring(0, 3)?.toUpperCase() || 'NFL';
  };

  const handleItemPress = (item) => {
    if (item.type === 'team') {
      navigation.navigate('TeamPage', {
        teamId: item.id,
        teamName: item.displayName,
        sport: sport
      });
    } else {
      navigation.navigate('PlayerPage', {
        playerId: item.id,
        playerName: item.displayName,
        teamId: item.team?.id,
        sport: sport
      });
    }
  };

  const renderTeamItem = (item) => {
    const teamLogoUrl = isDarkMode ? item.logos?.[1]?.href : item.logos?.[0]?.href;
    
    return (
      <TouchableOpacity
        style={[styles.resultItem, { backgroundColor: theme.surface }]}
        onPress={() => handleItemPress(item)}
      >
        <Image
          source={{ uri: teamLogoUrl }}
          style={styles.teamLogo}
        />
        <View style={styles.teamInfo}>
          <Text allowFontScaling={false} style={[styles.teamName, { color: theme.text }]}>
            {item.displayName}
          </Text>
          <Text allowFontScaling={false} style={[styles.teamDetails, { color: theme.textSecondary }]}>
            {item.location} • NFL
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPlayerItem = (item) => {
    const teamAbbr = item.team?.abbreviation || 'NFL';
    
    return (
      <TouchableOpacity
        style={[styles.resultItem, { backgroundColor: theme.surface }]}
        onPress={() => handleItemPress(item)}
      >
        <Image
          source={{ 
            uri: item.headshot?.href || `https://a.espncdn.com/i/headshots/nfl/players/full/${item.id}.png`
          }}
          style={styles.playerHeadshot}
        />
        <View style={styles.playerInfo}>
          <Text allowFontScaling={false} style={[styles.playerName, { color: theme.text }]}>
            {item.displayName}
          </Text>
          <Text allowFontScaling={false} style={[styles.playerDetails, { color: theme.textSecondary }]}>
            {item.position?.displayName || 'Player'} • {teamAbbr}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderResultItem = ({ item }) => {
    return item.type === 'team' ? renderTeamItem(item) : renderPlayerItem(item);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.searchHeader, { backgroundColor: theme.surface }]}>
        <Text allowFontScaling={false} style={[styles.title, { color: colors.primary }]}>Search</Text>
        <Text allowFontScaling={false} style={[styles.subtitle, { color: theme.textSecondary }]}>
          Search for {sport.toUpperCase()} teams and players
        </Text>
      </View>

      {/* Search Input */}
      <View style={[styles.searchInputContainer, { backgroundColor: theme.surface }]}>
        <TextInput
          style={[styles.searchInput, { 
            color: theme.text, 
            backgroundColor: theme.background,
            borderColor: theme.border 
          }]}
          placeholder="Search teams and players... (4 characters minimum)"
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="words"
          autoCorrect={false}
        />
      </View>

      {/* Results */}
      <View style={styles.resultsContainer}>
        {nflData.isInitializing && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.textSecondary }]}>
              Loading NFL data...
            </Text>
          </View>
        )}

        {!nflData.isInitializing && loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.textSecondary }]}>
              Searching...
            </Text>
          </View>
        )}

        {!nflData.isInitializing && !loading && hasSearched && searchResults.length === 0 && (
          <View style={styles.noResultsContainer}>
            <Text allowFontScaling={false} style={[styles.noResultsText, { color: theme.textSecondary }]}>
              No results found for "{searchQuery}"
            </Text>
            <Text allowFontScaling={false} style={[styles.noResultsSubtext, { color: theme.textTertiary }]}>
              Try searching for team names or player names
            </Text>
          </View>
        )}

        {!nflData.isInitializing && !loading && searchResults.length > 0 && (
          <FlatList
            data={searchResults}
            renderItem={renderResultItem}
            keyExtractor={(item) => `${item.type}-${item.id}`}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.resultsList}
          />
        )}

        {!nflData.isInitializing && !hasSearched && searchQuery.length === 0 && (
          <View style={styles.instructionsContainer}>
            <Text allowFontScaling={false} style={[styles.instructionsText, { color: theme.textSecondary }]}>
              Enter at least 4 characters to search for teams and players
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchHeader: {
    padding: 20,
    paddingBottom: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
  },
  searchInputContainer: {
    padding: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  searchInput: {
    height: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 15,
    fontSize: 16,
  },
  resultsContainer: {
    flex: 1,
    paddingHorizontal: 15,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  noResultsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  noResultsText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 5,
  },
  noResultsSubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  instructionsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionsText: {
    fontSize: 16,
    textAlign: 'center',
    marginHorizontal: 20,
  },
  resultsList: {
    paddingTop: 10,
    paddingBottom: 20,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    marginVertical: 5,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  teamLogo: {
    width: 40,
    height: 40,
    marginRight: 15,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },
  teamDetails: {
    fontSize: 14,
  },
  playerHeadshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 15,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },
  playerDetails: {
    fontSize: 14,
  },
});

export default SearchScreen;

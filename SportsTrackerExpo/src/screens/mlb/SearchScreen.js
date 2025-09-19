import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  FlatList, 
  TouchableOpacity, 
  Image, 
  ActivityIndicator,
  Alert 
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';

const SearchScreen = ({ route, navigation }) => {
  const { sport } = route.params;
  const { theme, colors, getTeamLogoUrl } = useTheme();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Debounce search to avoid too many API calls
  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      if (searchQuery.length >= 3) {
        performSearch(searchQuery);
      } else {
        setSearchResults([]);
        setHasSearched(false);
      }
    }, 500);

    return () => clearTimeout(delayedSearch);
  }, [searchQuery]);

  const performSearch = async (query) => {
    if (query.length < 3) return;
    
    setLoading(true);
    setHasSearched(true);
    
    try {
      const results = [];
      
      // Search for teams
      const teamResults = await searchTeams(query);
      results.push(...teamResults);
      
      // Search for players
      const playerResults = await searchPlayers(query);
      results.push(...playerResults);
      
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      Alert.alert('Error', 'Failed to search. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const searchTeams = async (query) => {
    try {
      // Get all MLB teams
      const response = await fetch('https://statsapi.mlb.com/api/v1/teams?sportId=1');
      const data = await response.json();
      
      if (data.teams) {
        return data.teams
          .filter(team => 
            team.name.toLowerCase().includes(query.toLowerCase()) ||
            team.teamName.toLowerCase().includes(query.toLowerCase()) ||
            team.locationName.toLowerCase().includes(query.toLowerCase()) ||
            team.abbreviation?.toLowerCase().includes(query.toLowerCase())
          )
          .map(team => ({
            id: team.id,
            type: 'team',
            name: team.name,
            teamName: team.teamName,
            locationName: team.locationName,
            abbreviation: team.abbreviation,
          }));
      }
      return [];
    } catch (error) {
      console.error('Team search error:', error);
      return [];
    }
  };

  const searchPlayers = async (query) => {
    try {
      // Search players using MLB API
      const response = await fetch(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      if (data.people) {
        const activePlayers = data.people.filter(player => player.active);
        
        // For each player, try to get their current team info
        const playersWithTeams = await Promise.all(
          activePlayers.map(async (player) => {
            try {
              // Try to get current team info from player stats
              const currentYear = new Date().getFullYear();
              const statsResponse = await fetch(`https://statsapi.mlb.com/api/v1/people/${player.id}/stats?stats=season&season=${currentYear}`);
              const statsData = await statsResponse.json();
              
              let currentTeam = null;
              if (statsData.stats && statsData.stats.length > 0) {
                for (const stat of statsData.stats) {
                  if (stat.splits && stat.splits.length > 0 && stat.splits[0].team) {
                    currentTeam = stat.splits[0].team;
                    break;
                  }
                }
              }
              
              return {
                id: player.id,
                type: 'player',
                fullName: player.fullName,
                firstName: player.firstName,
                lastName: player.lastName,
                primaryNumber: player.primaryNumber,
                primaryPosition: player.primaryPosition,
                currentTeam: currentTeam,
              };
            } catch (error) {
              console.warn(`Failed to get team info for player ${player.id}:`, error);
              return {
                id: player.id,
                type: 'player',
                fullName: player.fullName,
                firstName: player.firstName,
                lastName: player.lastName,
                primaryNumber: player.primaryNumber,
                primaryPosition: player.primaryPosition,
                currentTeam: null,
              };
            }
          })
        );
        
        return playersWithTeams;
      }
      return [];
    } catch (error) {
      console.error('Player search error:', error);
      return [];
    }
  };

  const getMLBTeamAbbreviation = (team) => {
    const teamMapping = {
      '108': 'LAA', '117': 'HOU', '133': 'OAK', '141': 'TOR', '144': 'ATL',
      '158': 'MIL', '138': 'STL', '112': 'CHC', '109': 'ARI', '119': 'LAD',
      '137': 'SF', '114': 'CLE', '136': 'SEA', '146': 'MIA', '121': 'NYM',
      '120': 'WSH', '110': 'BAL', '135': 'SD', '143': 'PHI', '134': 'PIT',
      '140': 'TEX', '139': 'TB', '111': 'BOS', '113': 'CIN', '115': 'COL',
      '118': 'KC', '116': 'DET', '142': 'MIN', '145': 'CWS', '147': 'NYY',
    };

    if (team?.abbreviation) {
      return team.abbreviation;
    }
    
    const abbr = teamMapping[team?.id?.toString()];
    if (abbr) {
      return abbr;
    }
    
    return team?.name?.substring(0, 3)?.toUpperCase() || 'MLB';
  };

  const handleItemPress = (item) => {
    if (item.type === 'team') {
      // Navigate to team page
      navigation.navigate('TeamPage', { 
        teamId: item.id,
        teamName: item.name,
        sport: sport 
      });
    } else if (item.type === 'player') {
      // Navigate to player page
      navigation.navigate('PlayerPage', {
        playerId: item.id,
        playerName: item.fullName,
        teamId: item.currentTeam?.id,
        sport: sport
      });
    }
  };

  const renderTeamItem = (item) => {
    const teamAbbr = getMLBTeamAbbreviation(item);
    
    return (
      <TouchableOpacity
        style={[styles.resultItem, { backgroundColor: theme.surface }]}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.7}
      >
        <Image 
          source={{ uri: getTeamLogoUrl('mlb', teamAbbr) }}
          style={styles.teamLogo}
          defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
        />
        <View style={styles.teamInfo}>
          <Text allowFontScaling={false} style={[styles.teamName, { color: theme.text }]}>
            {item.name}
          </Text>
          <Text allowFontScaling={false} style={[styles.teamDetails, { color: theme.textSecondary }]}>
            {teamAbbr} • Team
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPlayerItem = (item) => {
    const teamAbbr = item.currentTeam ? getMLBTeamAbbreviation(item.currentTeam) : null;
    
    return (
      <TouchableOpacity
        style={[styles.resultItem, { backgroundColor: theme.surface }]}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.7}
      >
        <Image 
          source={{ 
            uri: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${item.id}/headshot/67/current` 
          }}
          style={styles.playerHeadshot}
          defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=MLB' }}
        />
        <View style={styles.playerInfo}>
          <Text allowFontScaling={false} style={[styles.playerName, { color: theme.text }]}>
            {item.fullName}
          </Text>
          <Text allowFontScaling={false} style={[styles.playerDetails, { color: theme.textSecondary }]}>
            #{item.primaryNumber || '--'} • {item.primaryPosition?.name || 'N/A'} • {teamAbbr || 'Free Agent'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderResultItem = ({ item }) => {
    if (item.type === 'team') {
      return renderTeamItem(item);
    } else if (item.type === 'player') {
      return renderPlayerItem(item);
    }
    return null;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Search Header */}
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
          placeholder="Search teams and players... (3 characters minimum)"
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="words"
          autoCorrect={false}
        />
      </View>

      {/* Results */}
      <View style={styles.resultsContainer}>
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.textSecondary }]}>
              Searching...
            </Text>
          </View>
        )}

        {!loading && hasSearched && searchResults.length === 0 && (
          <View style={styles.noResultsContainer}>
            <Text allowFontScaling={false} style={[styles.noResultsText, { color: theme.textSecondary }]}>
              No results found for "{searchQuery}"
            </Text>
            <Text allowFontScaling={false} style={[styles.noResultsSubtext, { color: theme.textTertiary }]}>
              Try searching for team names or player names
            </Text>
          </View>
        )}

        {!loading && searchResults.length > 0 && (
          <FlatList
            data={searchResults}
            renderItem={renderResultItem}
            keyExtractor={(item) => `${item.type}-${item.id}`}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.resultsList}
          />
        )}

        {!hasSearched && searchQuery.length === 0 && (
          <View style={styles.instructionsContainer}>
            <Text allowFontScaling={false} style={[styles.instructionsText, { color: theme.textSecondary }]}>
              Enter at least 3 characters to search for teams and players
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

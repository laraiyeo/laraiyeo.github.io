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
import { EnglandServiceEnhanced } from '../../../services/soccer/EnglandServiceEnhanced';
import { useTheme } from '../../../context/ThemeContext';

// Convert HTTP URLs to HTTPS to avoid mixed content issues
const convertToHttps = (url) => {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
};

const EnglandSearchScreen = ({ route, navigation }) => {
  const { sport } = route?.params || { sport: 'English' };
  const { theme, colors, isDarkMode } = useTheme();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // TeamLogoImage component with dark mode and fallback support
  const TeamLogoImage = ({ teamId, style }) => {
    const [logoSource, setLogoSource] = useState(null);
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
      if (teamId) {
        const logos = getTeamLogo(teamId, isDarkMode);
        setLogoSource({ uri: logos.primaryUrl });
      } else {
        const logos = getTeamLogo(teamId, isDarkMode);
        setLogoSource({ uri: logos.primaryUrl });
      }
      setRetryCount(0);
    }, [teamId, isDarkMode]);

    const handleError = () => {
      if (retryCount === 0) {
        const logos = getTeamLogo(teamId, isDarkMode);
        setLogoSource({ uri: logos.fallbackUrl });
        setRetryCount(1);
      } else {
        // Final fallback - use actual logo URL first if teamId exists
        if (teamId) {
          const finalFallbackUrl = `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
          setLogoSource({ uri: finalFallbackUrl });
        } else {
          setLogoSource(require('../../../../assets/soccer.png'));
        }
      }
    };

    return (
      <Image
        style={style}
        source={logoSource || (teamId ? { uri: getTeamLogo(teamId, isDarkMode).primaryUrl } : require('../../../../assets/soccer.png'))}
        defaultSource={teamId ? { uri: getTeamLogo(teamId, isDarkMode).primaryUrl } : require('../../../../assets/soccer.png')}
        onError={handleError}
      />
    );
  };

  // Enhanced logo function with dark mode support and fallbacks
  const getTeamLogo = (teamId, isDarkMode) => {
    const primaryUrl = isDarkMode
      ? `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`
      : `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
    
    const fallbackUrl = isDarkMode
      ? `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`
      : `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`;

    return { primaryUrl, fallbackUrl };
  };

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
      
      // Search for teams with error handling
      try {
        const teamResults = await searchTeams(query);
        results.push(...teamResults);
      } catch (teamError) {
        console.error('Team search failed:', teamError);
        // Continue with player search even if team search fails
      }
      
      // Search for players with error handling
      try {
        const playerResults = await searchPlayers(query);
        results.push(...playerResults);
      } catch (playerError) {
        console.error('Player search failed:', playerError);
        // Continue even if player search fails
      }
      
      setSearchResults(results);
      
      // Only show alert if both searches failed and no results
      if (results.length === 0) {
        console.warn('Both team and player searches failed or returned no results');
      }
      
    } catch (error) {
      console.error('Search error:', error);
      // Don't show alert for every search failure, just log it
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const searchTeams = async (query) => {
    try {
      const teamsData = await EnglandServiceEnhanced.searchTeams(query);
      
      if (teamsData && Array.isArray(teamsData)) {
        const processedTeams = await Promise.all(
          teamsData.map(async (teamData) => {
            try {
              const logo = await EnglandServiceEnhanced.getTeamLogoWithFallback(teamData.team.id);
              return {
                id: teamData.team.id,
                type: 'team',
                name: teamData.team.displayName,
                teamName: teamData.team.name,
                locationName: teamData.team.location,
                abbreviation: teamData.team.shortDisplayName,
                logo: logo
              };
            } catch (logoError) {
              console.warn('Failed to get logo for team:', teamData.team.id);
              // Return team data with fallback logo URL or placeholder
              return {
                id: teamData.team.id,
                type: 'team',
                name: teamData.team.displayName,
                teamName: teamData.team.name,
                locationName: teamData.team.location,
                abbreviation: teamData.team.shortDisplayName,
                logo: 'https://via.placeholder.com/40x40?text=TEAM'
              };
            }
          })
        );
        return processedTeams;
      }
      return [];
    } catch (error) {
      console.error('Team search error:', error);
      throw error; // Re-throw to be caught by performSearch
    }
  };

  const searchPlayers = async (query) => {
    try {
      const playersData = await EnglandServiceEnhanced.searchPlayers(query);
      
      if (playersData && Array.isArray(playersData)) {
        // Fetch team data to get colors
        const playersWithTeamInfo = await Promise.all(
          playersData.map(async (playerData) => {
            let teamColorInfo = null;
            
            // Try to fetch team data for color information
            if (playerData.teamId) {
              try {
                const teamResponse = await fetch(convertToHttps(`https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/${playerData.teamId}`));
                const teamData = await teamResponse.json();
                
                if (teamData.team) {
                  teamColorInfo = {
                    color: teamData.team.color,
                    alternateColor: teamData.team.alternateColor
                  };
                }
              } catch (teamError) {
                console.warn('Failed to fetch team color for team:', playerData.teamId);
              }
            }
            
            return {
              id: playerData.id,
              type: 'player',
              fullName: playerData.displayName || playerData.fullName,
              firstName: playerData.firstName || '',
              lastName: playerData.lastName || '',
              primaryNumber: playerData.jersey || null,
              primaryPosition: playerData.position, // This is already a string
              currentTeam: playerData.team, // This is a string (team name)
              teamAbbr: playerData.teamAbbr, // Use the abbreviated team name directly
              teamColor: teamColorInfo, // Add team color info
            };
          })
        );
        
        return playersWithTeamInfo;
      }
      return [];
    } catch (error) {
      console.error('Player search error:', error);
      throw error; // Re-throw to be caught by performSearch
    }
  };

  const getSoccerTeamAbbreviation = (team) => {
    if (team?.abbreviation) {
      return team.abbreviation;
    }
    
    return team?.name?.substring(0, 3)?.toUpperCase() || 'SOC';
  };

  // Get team color like in player page
  const getTeamColor = (team) => {
    if (!team) return colors.primary;
    
    // Use alternate color if main color is too light/problematic
    const isUsingAlternateColor = ["ffffff", "ffee00", "ffff00", "81f733", "000000", "f7f316", "eef209", "ece83a", "1c31ce", "ffd700"].includes(team.color);
    
    if (isUsingAlternateColor && team.alternateColor) {
      return `#${team.alternateColor}`;
    } else if (team.color && team.color !== "000000") {
      return `#${team.color}`;
    }
    
    return colors.primary;
  };

  const handleItemPress = (item) => {
    if (item.type === 'team') {
      // Navigate to team page
      navigation.navigate('EnglandTeamPage', { 
        teamId: item.id,
        teamName: item.name,
        sport: sport,
        league: 'england'
      });
    } else if (item.type === 'player') {
      // Navigate to player page
      navigation.navigate('EnglandPlayerPage', {
        playerId: item.id,
        playerName: item.fullName,
        teamId: item.teamId || null, // Use teamId from player data
        sport: sport,
        league: 'england'
      });
    }
  };

  const renderTeamItem = (item) => {
    const teamAbbr = getSoccerTeamAbbreviation(item);
    
    return (
      <TouchableOpacity
        style={[styles.resultItem, { backgroundColor: theme.surface }]}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.7}
      >
        <TeamLogoImage 
          teamId={item.id}
          style={styles.teamLogo}
        />
        <View style={styles.teamInfo}>
          <Text style={[styles.teamName, { color: theme.text }]}>
            {item.name}
          </Text>
          <Text style={[styles.teamDetails, { color: theme.textSecondary }]}>
            {teamAbbr} • Team
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPlayerItem = (item) => {
    // Use the teamAbbr directly since currentTeam is just a string (team name)
    const teamAbbr = item.teamAbbr || 'SOC';
    // Get team color or fallback to primary color
    const playerAvatarColor = item.teamColor ? getTeamColor(item.teamColor) : colors.primary;
    
    return (
      <TouchableOpacity
        style={[styles.resultItem, { backgroundColor: theme.surface }]}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.playerAvatar, { backgroundColor: playerAvatarColor }]}>
          <Text style={styles.playerInitials}>
            {item.fullName.split(' ').map(n => n[0]).join('').substring(0, 2)}
          </Text>
        </View>
        <View style={styles.playerInfo}>
          <Text style={[styles.playerName, { color: theme.text }]}>
            {item.fullName}
          </Text>
          <Text style={[styles.playerDetails, { color: theme.textSecondary }]}>
            #{item.primaryNumber || '--'} • {item.primaryPosition || 'N/A'} • {teamAbbr}
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
        <Text style={[styles.title, { color: colors.primary }]}>Search</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Search for {(sport || 'English').toUpperCase()} teams and players
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
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
              Searching...
            </Text>
          </View>
        )}

        {!loading && hasSearched && searchResults.length === 0 && (
          <View style={styles.noResultsContainer}>
            <Text style={[styles.noResultsText, { color: theme.textSecondary }]}>
              No results found for "{searchQuery}"
            </Text>
            <Text style={[styles.noResultsSubtext, { color: theme.textTertiary }]}>
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
            <Text style={[styles.instructionsText, { color: theme.textSecondary }]}>
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
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  playerInitials: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
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

export default EnglandSearchScreen;

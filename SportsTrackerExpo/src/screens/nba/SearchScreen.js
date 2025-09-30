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
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { NBAService } from '../../services/NBAService';

const NBASearchScreen = ({ route, navigation }) => {
  const { sport } = route.params;
  const { theme, colors, getTeamLogoUrl } = useTheme();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [teams, setTeams] = useState([]);

  // Load teams data
  useEffect(() => {
    const loadTeams = async () => {
      try {
        const teamsData = await NBAService.getTeams();
        if (teamsData?.sports?.[0]?.leagues?.[0]?.teams) {
          setTeams(teamsData.sports[0].leagues[0].teams.map(team => NBAService.formatTeamForMobile(team)));
        }
      } catch (error) {
        console.error('Failed to load NBA teams:', error);
      }
    };

    loadTeams();
  }, []);

  // Debounce search
  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      if (searchQuery.length >= 2) {
        performSearch(searchQuery);
      } else if (searchQuery.length === 0) {
        setSearchResults([]);
        setHasSearched(false);
      }
    }, 500);

    return () => clearTimeout(delayedSearch);
  }, [searchQuery, teams]);

  const performSearch = async (query) => {
    if (query.length < 2) return;
    
    setLoading(true);
    setHasSearched(true);
    
    try {
      const lowerQuery = query.toLowerCase();
      
      // Search teams
      const teamResults = teams.filter(team => 
        team.displayName?.toLowerCase().includes(lowerQuery) ||
        team.name?.toLowerCase().includes(lowerQuery) ||
        team.abbreviation?.toLowerCase().includes(lowerQuery) ||
        team.location?.toLowerCase().includes(lowerQuery) ||
        team.nickname?.toLowerCase().includes(lowerQuery)
      ).map(team => ({ ...team, type: 'team' }));
      
      setSearchResults(teamResults);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const getNBATeamAbbreviation = (team) => {
    const normalizeMap = {
      'gs': 'gsw',
      'sa': 'sas', 
      'no': 'nop',
      'ny': 'nyk',
      'bkn': 'bk'
    };
    
    const abbr = team?.abbreviation?.toLowerCase();
    return normalizeMap[abbr] || team?.abbreviation || '';
  };

  const navigateToTeam = (team) => {
    navigation.navigate('TeamPage', { 
      teamId: team.id, 
      sport: 'nba',
      teamName: team.displayName,
      teamAbbreviation: team.abbreviation
    });
  };

  const renderSearchResult = ({ item }) => {
    if (item.type === 'team') {
      return (
        <TouchableOpacity
          style={[styles.resultItem, { backgroundColor: theme.surface }]}
          onPress={() => navigateToTeam(item)}
          activeOpacity={0.7}
        >
          <Image
            source={{ uri: getTeamLogoUrl('nba', getNBATeamAbbreviation(item)) }}
            style={styles.teamLogo}
            defaultSource={require('../../../assets/nba.png')}
          />
          <View style={styles.resultInfo}>
            <Text allowFontScaling={false} style={[styles.primaryText, { color: theme.text }]}>
              {item.displayName}
            </Text>
            <Text allowFontScaling={false} style={[styles.secondaryText, { color: theme.textSecondary }]}>
              {item.location} • {item.abbreviation}
            </Text>
            {item.record && (
              <Text allowFontScaling={false} style={[styles.recordText, { color: theme.textSecondary }]}>
                {item.record}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      );
    }

    return null;
  };

  const renderEmptyState = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text allowFontScaling={false} style={[styles.emptyText, { color: theme.textSecondary }]}>
            Searching...
          </Text>
        </View>
      );
    }

    if (!hasSearched) {
      return (
        <View style={styles.centerContainer}>
          <Ionicons name="search" size={64} color={theme.textSecondary} />
          <Text allowFontScaling={false} style={[styles.emptyText, { color: theme.textSecondary }]}>
            Search for NBA teams
          </Text>
          <Text allowFontScaling={false} style={[styles.emptySubtext, { color: theme.textSecondary }]}>
            Enter at least 2 characters to start searching
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.centerContainer}>
        <Ionicons name="search" size={64} color={theme.textSecondary} />
        <Text allowFontScaling={false} style={[styles.emptyText, { color: theme.textSecondary }]}>
          No results found
        </Text>
        <Text allowFontScaling={false} style={[styles.emptySubtext, { color: theme.textSecondary }]}>
          Try searching with different keywords
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Search Input */}
      <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
        <Ionicons 
          name="search" 
          size={20} 
          color={theme.textSecondary} 
          style={styles.searchIcon} 
        />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search teams..."
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
            <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Results */}
      <FlatList
        data={searchResults}
        renderItem={renderSearchResult}
        keyExtractor={(item, index) => `${item.type}-${item.id || index}`}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 8,
  },
  clearButton: {
    padding: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    flexGrow: 1,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  teamLogo: {
    width: 40,
    height: 40,
    marginRight: 12,
  },
  resultInfo: {
    flex: 1,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryText: {
    fontSize: 14,
    marginTop: 2,
  },
  recordText: {
    fontSize: 12,
    marginTop: 2,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});

export default NBASearchScreen;
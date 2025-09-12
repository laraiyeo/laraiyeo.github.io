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
  Keyboard
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SpainServiceEnhanced } from '../../../services/soccer/SpainServiceEnhanced';
import { useTheme } from '../../../context/ThemeContext';

const SpainSearchScreen = ({ navigation, route }) => {
  const { theme, colors } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState({ teams: [], players: [] });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('teams'); // 'teams' or 'players'
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        performSearch();
      } else {
        setSearchResults({ teams: [], players: [] });
        setHasSearched(false);
      }
    }, 500); // Debounce search

    return () => clearTimeout(delayedSearch);
  }, [searchQuery]);

  const performSearch = async () => {
    try {
      setLoading(true);
      setHasSearched(true);

      console.log('Searching Spain for:', searchQuery);
      
      const [teamsData, playersData] = await Promise.all([
        SpainServiceEnhanced.searchTeams(searchQuery),
        SpainServiceEnhanced.searchPlayers(searchQuery)
      ]);

      // Process teams with logos
      const processedTeams = await Promise.all(
        (teamsData || []).map(async (teamData) => {
          const logo = await SpainServiceEnhanced.getTeamLogoWithFallback(teamData.team.id);
          return {
            ...teamData.team,
            logo
          };
        })
      );

      // Process players
      const processedPlayers = (playersData || []).map(playerData => ({
        ...playerData.athlete,
        team: playerData.team
      }));

      setSearchResults({
        teams: processedTeams,
        players: processedPlayers
      });

      setLoading(false);
    } catch (error) {
      console.error('Error searching Spain:', error);
      setLoading(false);
      setSearchResults({ teams: [], players: [] });
    }
  };

  const handleTeamPress = (team) => {
    Keyboard.dismiss();
    console.log('Team selected:', team.displayName);
    navigation.navigate('TeamPage', {
      teamId: team.id,
      teamName: team.displayName,
      sport: 'soccer',
      league: 'spain'
    });
  };

  const handlePlayerPress = (player) => {
    Keyboard.dismiss();
    console.log('Player selected:', player.displayName);
    navigation.navigate('PlayerPage', {
      playerId: player.id,
      playerName: player.displayName,
      sport: 'soccer',
      league: 'spain'
    });
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults({ teams: [], players: [] });
    setHasSearched(false);
    Keyboard.dismiss();
  };

  const renderSearchHeader = () => (
    <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
      <View style={[styles.searchInputContainer, { backgroundColor: theme.background }]}>
        <Ionicons 
          name="search" 
          size={20} 
          color={theme.textSecondary} 
          style={styles.searchIcon}
        />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search teams and players..."
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={performSearch}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
            <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
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
            Teams ({searchResults.teams.length})
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
            Players ({searchResults.players.length})
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderTeamItem = ({ item: team }) => (
    <TouchableOpacity
      style={[styles.resultItem, { backgroundColor: theme.surface }]}
      onPress={() => handleTeamPress(team)}
      activeOpacity={0.7}
    >
      <Image
        source={{ uri: team.logo }}
        style={styles.teamLogo}
        resizeMode="contain"
      />
      <View style={styles.teamInfo}>
        <Text style={[styles.teamName, { color: theme.text }]}>
          {team.displayName}
        </Text>
        <Text style={[styles.teamLocation, { color: theme.textSecondary }]}>
          {team.location}
        </Text>
        {team.shortDisplayName && (
          <Text style={[styles.teamAbbreviation, { color: theme.textSecondary }]}>
            {team.shortDisplayName}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
    </TouchableOpacity>
  );

  const renderPlayerItem = ({ item: player }) => (
    <TouchableOpacity
      style={[styles.resultItem, { backgroundColor: theme.surface }]}
      onPress={() => handlePlayerPress(player)}
      activeOpacity={0.7}
    >
      <View style={[styles.playerAvatar, { backgroundColor: colors.primary }]}>
        <Text style={styles.playerInitials}>
          {player.displayName.split(' ').map(n => n[0]).join('').substring(0, 2)}
        </Text>
      </View>
      <View style={styles.playerInfo}>
        <Text style={[styles.playerName, { color: theme.text }]}>
          {player.displayName}
        </Text>
        {player.position && (
          <Text style={[styles.playerPosition, { color: theme.textSecondary }]}>
            {player.position.displayName}
          </Text>
        )}
        {player.team && (
          <Text style={[styles.playerTeam, { color: theme.textSecondary }]}>
            {player.team.displayName}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
    </TouchableOpacity>
  );

  const renderEmptyState = () => {
    if (!hasSearched && searchQuery.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="search" size={64} color={theme.textSecondary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            Search Spain Football
          </Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            Find teams and players from La Liga, Copa del Rey, and Spanish Supercopa
          </Text>
        </View>
      );
    }

    if (hasSearched && searchQuery.length >= 2) {
      const currentResults = activeTab === 'teams' ? searchResults.teams : searchResults.players;
      if (currentResults.length === 0) {
        return (
          <View style={styles.emptyContainer}>
            <Ionicons name="search" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              No {activeTab} found
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              Try adjusting your search terms
            </Text>
          </View>
        );
      }
    }

    return null;
  };

  const getCurrentData = () => {
    return activeTab === 'teams' ? searchResults.teams : searchResults.players;
  };

  const getCurrentRenderItem = () => {
    return activeTab === 'teams' ? renderTeamItem : renderPlayerItem;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderSearchHeader()}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: theme.text }]}>
            Searching...
          </Text>
        </View>
      ) : (
        <>
          {renderEmptyState()}
          {hasSearched && getCurrentData().length > 0 && (
            <FlatList
              data={getCurrentData()}
              renderItem={getCurrentRenderItem()}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
  },
  clearButton: {
    padding: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
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
  listContainer: {
    padding: 16,
  },
  resultItem: {
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
  teamLogo: {
    width: 40,
    height: 40,
    marginRight: 12,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  teamLocation: {
    fontSize: 12,
    marginBottom: 2,
  },
  teamAbbreviation: {
    fontSize: 11,
    fontWeight: '500',
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
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
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  playerPosition: {
    fontSize: 12,
    marginBottom: 2,
  },
  playerTeam: {
    fontSize: 11,
    fontWeight: '500',
  },
});

export default SpainSearchScreen;
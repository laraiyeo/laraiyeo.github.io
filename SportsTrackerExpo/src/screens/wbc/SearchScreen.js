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
  Alert,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import WBCService from '../../services/WBCService';
import { loadWBCSearchData } from '../../services/WBCSearchCache';

const SearchScreen = ({ route, navigation }) => {
  const { sport } = route.params;
  const { theme, colors, isDarkMode } = useTheme();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);   // initial data load
  const [hasSearched, setHasSearched] = useState(false);
  const [allTeams, setAllTeams] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);

  // Load all WBC data from cache on mount
  useEffect(() => {
    let mounted = true;
    loadWBCSearchData()
      .then(({ teams, players }) => {
        if (!mounted) return;
        setAllTeams(teams);
        setAllPlayers(players);
      })
      .catch((e) => {
        console.error('WBC search data load error:', e);
        if (mounted) Alert.alert('Error', 'Failed to load WBC data. Please try again.');
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  // Debounced client-side filter
  useEffect(() => {
    if (loading) return; // wait for data
    const t = setTimeout(() => {
      if (searchQuery.length >= 3) {
        filterResults(searchQuery);
      } else {
        setSearchResults([]);
        setHasSearched(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, allTeams, allPlayers, loading]);

  const filterResults = (query) => {
    const q = query.toLowerCase();
    const teamMatches = allTeams
      .filter(
        (t) =>
          t.name?.toLowerCase().includes(q) ||
          t.abbreviation?.toLowerCase().includes(q) ||
          t.divisionName?.toLowerCase().includes(q),
      )
      .map((t) => ({ ...t, type: 'team' }));

    const playerMatches = allPlayers
      .filter((p) => p.fullName?.toLowerCase().includes(q))
      .map((p) => ({ ...p, type: 'player' }));

    setSearchResults([...teamMatches, ...playerMatches]);
    setHasSearched(true);
  };

  const handleItemPress = (item) => {
    if (item.type === 'team') {
      navigation.navigate('TeamPage', {
        teamId: item.id,
        teamName: item.name,
        sport,
      });
    } else {
      navigation.navigate('PlayerPage', {
        playerId: item.id,
        playerName: item.fullName,
        teamId: item.currentTeam?.id,
        sport,
      });
    }
  };

  const renderTeamItem = (item) => {
    const logo = WBCService.getTeamLogo(item.id, isDarkMode);
    const teamColor = WBCService.getTeamColor(item.id);
    return (
      <TouchableOpacity
        style={[styles.resultItem, { backgroundColor: theme.surface, borderLeftWidth: 4, borderLeftColor: teamColor || colors.primary }]}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.7}
      >
        {logo ? (
          <Image source={{ uri: logo }} style={styles.teamLogo} resizeMode="contain" />
        ) : (
          <View style={[styles.teamLogo, styles.logoPlaceholder, { backgroundColor: theme.border }]} />
        )}
        <View style={styles.teamInfo}>
          <Text allowFontScaling={false} style={[styles.teamName, { color: theme.text }]}>
            {item.name}
          </Text>
          <Text allowFontScaling={false} style={[styles.teamDetails, { color: theme.textSecondary }]}>
            {item.abbreviation} • {item.divisionName || 'Team'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPlayerItem = (item) => {
    const teamLogo = WBCService.getTeamLogo(item.currentTeam?.id, isDarkMode);
    const teamName = allTeams.find((t) => t.id === item.currentTeam?.id)?.name || '';
    const teamColor = WBCService.getTeamColor(item.currentTeam?.id);
    return (
      <TouchableOpacity
        style={[styles.resultItem, { backgroundColor: theme.surface, borderLeftWidth: 4, borderLeftColor: teamColor || colors.primary }]}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.7}
      >
        <Image
          source={{
            uri: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${item.id}/headshot/67/current`,
          }}
          style={styles.playerHeadshot}
        />
        <View style={styles.playerInfo}>
          <Text allowFontScaling={false} style={[styles.playerName, { color: theme.text }]}>
            {item.fullName}
          </Text>
          <Text allowFontScaling={false} style={[styles.playerDetails, { color: theme.textSecondary }]}>
            #{item.primaryNumber || '--'} • {item.primaryPosition?.abbreviation || 'N/A'}
            {teamName ? ` • ${teamName}` : ''}
          </Text>
        </View>
        {teamLogo ? (
          <Image source={{ uri: teamLogo }} style={styles.teamLogoSmall} resizeMode="contain" />
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderResultItem = ({ item }) =>
    item.type === 'team' ? renderTeamItem(item) : renderPlayerItem(item);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.searchHeader, { backgroundColor: theme.surface }]}>
        <Text allowFontScaling={false} style={[styles.title, { color: colors.primary }]}>
          Search
        </Text>
        <Text allowFontScaling={false} style={[styles.subtitle, { color: theme.textSecondary }]}>
          Search for WBC teams and players
        </Text>
      </View>

      {/* Search Input */}
      <View style={[styles.searchInputContainer, { backgroundColor: theme.surface }]}>
        <TextInput
          style={[
            styles.searchInput,
            { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
          ]}
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
              Loading WBC data...
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

        {!loading && !hasSearched && searchQuery.length === 0 && (
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
  container: { flex: 1 },
  searchHeader: {
    padding: 20,
    paddingBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 5 },
  subtitle: { fontSize: 16 },
  searchInputContainer: {
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
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
  resultsContainer: { flex: 1, paddingHorizontal: 15 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 50 },
  loadingText: { marginTop: 10, fontSize: 16 },
  noResultsContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 50 },
  noResultsText: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 5 },
  noResultsSubtext: { fontSize: 14, textAlign: 'center' },
  instructionsContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  instructionsText: { fontSize: 16, textAlign: 'center', marginHorizontal: 20 },
  resultsList: { paddingTop: 10, paddingBottom: 20 },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    marginVertical: 5,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  teamLogo: { width: 40, height: 40, marginRight: 15 },
  logoPlaceholder: { borderRadius: 6 },
  teamInfo: { flex: 1 },
  teamName: { fontSize: 18, fontWeight: '600', marginBottom: 2 },
  teamDetails: { fontSize: 14 },
  playerHeadshot: { width: 40, height: 40, borderRadius: 20, marginRight: 15 },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 18, fontWeight: '600', marginBottom: 2 },
  playerDetails: { fontSize: 14 },
  teamLogoSmall: { width: 28, height: 28 },
});

export default SearchScreen;

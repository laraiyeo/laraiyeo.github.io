import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Image,
  FlatList
} from 'react-native';
import { ItalyServiceEnhanced } from '../../../services/soccer/ItalyServiceEnhanced';
import { useTheme } from '../../../context/ThemeContext';
import { useFavorites } from '../../../context/FavoritesContext';

// Same NOTE_COLORS mapping as soccer web app
const NOTE_COLORS = {
  "Champions League": "#008000", // Green
  "Champions League qualifying": "#81D6AC", // Light Green
  "Europa League": "#469dfa", // Dark Blue
  "Conference League qualifying": "#ADD8E6", // Light Blue
  "Relegation playoff": "#FFFF00", // Yellow
  "Relegation": "#FF7F84", // Red
};

const ItalyStandingsScreen = ({ navigation, route }) => {
  const { theme, colors, isDarkMode } = useTheme();
  const { isFavorite } = useFavorites();
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
        // Final fallback - use soccer.png asset for all cases
        setLogoSource(require('../../../../assets/soccer.png'));
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

  useEffect(() => {
    loadStandings();
  }, []);

  const loadStandings = async () => {
    try {
      setLoading(true);
      console.log('Loading Italy standings...');
      const data = await ItalyServiceEnhanced.getStandings();
      
      console.log('Standings data received:', JSON.stringify(data, null, 2));
      
      // Process standings data
      if (data.children && data.children.length > 0) {
        console.log('Found children:', data.children.length);
        const standingsData = data.children[0].standings.entries.map(entry => ({
          team: entry.team,
          stats: entry.stats,
          logo: null // Will be loaded async
        }));

        console.log('Processed standings data:', standingsData.length, 'teams');

        // Load team logos
        const processedStandings = await Promise.all(
          standingsData.map(async (team) => {
            const logo = await ItalyServiceEnhanced.getTeamLogoWithFallback(team.team.id);
            return { ...team, logo };
          })
        );

        console.log('Final processed standings:', processedStandings.length, 'teams');
        setStandings(processedStandings);
      } else {
        console.log('No children found in data or children is empty');
        console.log('Data structure:', Object.keys(data));
        
        // Try alternative data structure
        if (data.standings && data.standings.entries) {
          console.log('Found direct standings structure');
          const standingsData = data.standings.entries.map(entry => ({
            team: entry.team,
            stats: entry.stats,
            note: entry.note, // Include the note data!
            logo: null
          }));

          const processedStandings = await Promise.all(
            standingsData.map(async (team) => {
              const logo = await ItalyServiceEnhanced.getTeamLogoWithFallback(team.team.id);
              return { ...team, logo };
            })
          );

          setStandings(processedStandings);
        }
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading Italy standings:', error);
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStandings();
    setRefreshing(false);
  };

  const handleTeamPress = (team) => {
    console.log('Team pressed:', team.team.displayName);
    navigation.navigate('ItalyTeamPage', {
      teamId: team.team.id,
      teamName: team.team.displayName,
      sport: 'Italian',
      league: 'italy'
    });
  };

  const getPositionColor = (position, note) => {
    // Use the same logic as soccer web app
    if (note && note.description) {
      // First try to get color from NOTE_COLORS mapping by description
      const customColor = NOTE_COLORS[note.description] || note.color;
      return customColor;
    }
    
    // If no note from API, return neutral grey for all positions
    return '#808080'; // Default grey for teams without qualification status
  };

  const renderStandingsHeader = () => (
    <View style={[styles.headerRow, { backgroundColor: theme.surface }]}>
      <Text style={[styles.positionHeader, { color: theme.textSecondary }]}>#</Text>
      <Text style={[styles.teamHeader, { color: theme.textSecondary }]}>Team</Text>
      <Text style={[styles.statHeader, { color: theme.textSecondary }]}>MP</Text>
      <Text style={[styles.statHeader, { color: theme.textSecondary }]}>W</Text>
      <Text style={[styles.statHeader, { color: theme.textSecondary }]}>D</Text>
      <Text style={[styles.statHeader, { color: theme.textSecondary }]}>L</Text>
      <Text style={[styles.statHeader, { color: theme.textSecondary }]}>GD</Text>
      <Text style={[styles.pointsHeader, { color: theme.textSecondary }]}>Pts</Text>
    </View>
  );

  const renderStandingItem = ({ item, index }) => {
    const position = index + 1;
    const stats = item.stats; // This is the array from CDN
    
    // Console log to debug note data
    console.log(`Team ${position} (${item.team.displayName}):`, {
      note: item.note,
      noteColor: item.note?.color,
      noteDescription: item.note?.description
    });
    
    // Extract stats using the exact same logic as soccer web app
    const gamesPlayed = stats.find(stat => stat.name === "gamesPlayed")?.displayValue || "0";
    const wins = stats.find(stat => stat.name === "wins")?.displayValue || "0";
    const draws = stats.find(stat => stat.name === "ties")?.displayValue || "0";
    const losses = stats.find(stat => stat.name === "losses")?.displayValue || "0";
    const goalDifference = stats.find(stat => stat.name === "pointDifferential")?.displayValue || "0";
    const points = stats.find(stat => stat.name === "points")?.displayValue || "0";

    // Debug goal difference
    console.log(`${item.team.displayName} GD:`, goalDifference, 'First char:', goalDifference.charAt(0));

    // Get goal difference color based on first character of displayValue
    const getGoalDifferenceColor = (gdDisplayValue) => {
      const firstChar = gdDisplayValue.toString().charAt(0);
      console.log(`Color for ${gdDisplayValue}: firstChar=${firstChar}, color=${firstChar === '+' ? 'GREEN' : firstChar === '-' ? 'RED' : 'GREY'}`);
      if (firstChar === '+') return '#22c55e'; // Explicit green for positive
      if (firstChar === '-') return '#ef4444'; // Explicit red for negative
      return '#6b7280'; // Explicit grey for zero or other
    };

    return (
      <TouchableOpacity
        style={[styles.standingRow, { backgroundColor: theme.surface }]}
        onPress={() => handleTeamPress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.positionContainer, { backgroundColor: getPositionColor(position, item.note) }]}>
          <Text style={[styles.positionText, { color: '#fff' }]}>{position}</Text>
        </View>
        
        <View style={styles.teamContainer}>
          <TeamLogoImage
            teamId={item.team.id}
            style={styles.teamLogo}
          />
          <Text style={[styles.teamName, { color: isFavorite(item.team.id) ? colors.primary : theme.text }]} numberOfLines={1}>
            {isFavorite(item.team.id) ? '★ ' : ''}{item.team.displayName}
          </Text>
        </View>

        <Text style={[styles.statText, { color: theme.text }]}>{gamesPlayed}</Text>
        <Text style={[styles.statText, { color: theme.text }]}>{wins}</Text>
        <Text style={[styles.statText, { color: theme.text }]}>{draws}</Text>
        <Text style={[styles.statText, { color: theme.text }]}>{losses}</Text>
        <Text style={[styles.statText, { color: getGoalDifferenceColor(goalDifference) }]}>
          {goalDifference}
        </Text>
        <Text style={[styles.pointsText, { color: theme.text }]}>{points}</Text>
      </TouchableOpacity>
    );
  };

  const renderLegend = () => (
    <View style={[styles.legendContainer, { backgroundColor: theme.surface }]}>
      <Text style={[styles.legendTitle, { color: theme.text }]}>Qualification</Text>
      
      {/* Champions League */}
      <View style={styles.legendRow}>
        <View style={[styles.legendColor, { backgroundColor: NOTE_COLORS["Champions League"] }]} />
        <Text style={[styles.legendText, { color: theme.textSecondary }]}>Champions League</Text>
      </View>
      
      {/* Champions League qualifying */}
      <View style={styles.legendRow}>
        <View style={[styles.legendColor, { backgroundColor: NOTE_COLORS["Champions League qualifying"] }]} />
        <Text style={[styles.legendText, { color: theme.textSecondary }]}>Champions League qualifying</Text>
      </View>
      
      {/* Europa League */}
      <View style={styles.legendRow}>
        <View style={[styles.legendColor, { backgroundColor: NOTE_COLORS["Europa League"] }]} />
        <Text style={[styles.legendText, { color: theme.textSecondary }]}>Europa League</Text>
      </View>
      
      {/* Conference League qualifying */}
      <View style={styles.legendRow}>
        <View style={[styles.legendColor, { backgroundColor: NOTE_COLORS["Conference League qualifying"] }]} />
        <Text style={[styles.legendText, { color: theme.textSecondary }]}>Conference League qualifying</Text>
      </View>
      
      {/* Relegation playoff */}
      <View style={styles.legendRow}>
        <View style={[styles.legendColor, { backgroundColor: NOTE_COLORS["Relegation playoff"] }]} />
        <Text style={[styles.legendText, { color: theme.textSecondary }]}>Relegation playoff</Text>
      </View>
      
      {/* Relegation */}
      <View style={styles.legendRow}>
        <View style={[styles.legendColor, { backgroundColor: NOTE_COLORS["Relegation"] }]} />
        <Text style={[styles.legendText, { color: theme.textSecondary }]}>Relegation</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.text }]}>
          Loading standings...
        </Text>
      </View>
    );
  }

  if (standings.length === 0) {
    return (
      <View style={[styles.container, styles.emptyContainer, { backgroundColor: theme.background }]}>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          No standings data available
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={loadStandings}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderStandingsHeader()}
      
      <FlatList
        data={standings}
        renderItem={renderStandingItem}
        keyExtractor={(item) => item.team.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListFooterComponent={renderLegend}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContainer: {
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  positionHeader: {
    width: 30,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  teamHeader: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 12,
  },
  statHeader: {
    width: 30,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  pointsHeader: {
    width: 40,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  positionContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  positionText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  teamContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  teamLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  statText: {
    width: 30,
    fontSize: 12,
    textAlign: 'center',
  },
  pointsText: {
    width: 40,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  legendContainer: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  legendTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    fontSize: 12,
  },
});

export default ItalyStandingsScreen;

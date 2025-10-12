import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { getTournaments, getTournamentSeries } from '../../../services/cs2Service';

const { width } = Dimensions.get('window');

const CS2DiscoverScreen = ({ navigation }) => {
  const { colors, theme } = useTheme();
  const [featuredTournaments, setFeaturedTournaments] = useState([]);
  const [trendingTournaments, setTrendingTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGame, setSelectedGame] = useState('CS2');

  const gameFilters = [
    { name: 'CS2', icon: 'game-controller', active: true },
    { name: 'VALORANT', icon: 'game-controller', active: false },
    { name: 'Dota 2', icon: 'game-controller', active: false },
    { name: 'LoL', icon: 'game-controller', active: false }
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const tournaments = await getTournaments(null, null, 20);
      
      // Split tournaments into featured and trending
      const allTournaments = tournaments.edges || [];
      setFeaturedTournaments(allTournaments.slice(0, 5));
      setTrendingTournaments(allTournaments.slice(5, 15));
    } catch (error) {
      console.error('Error loading CS2 discover data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const FeaturedTournamentCard = ({ tournament, isLarge = false }) => {
    const tournamentData = tournament.node;
    
    return (
      <TouchableOpacity
        style={[
          styles.featuredCard,
          isLarge ? styles.largeFeaturedCard : styles.smallFeaturedCard,
          { backgroundColor: theme.surfaceSecondary }
        ]}
        onPress={() => navigation.navigate('CS2Tournament', { tournamentId: tournamentData.id })}
      >
        <View style={styles.featuredImageContainer}>
          {/* Tournament image placeholder - using gradient background */}
          <View style={[styles.featuredImage, { backgroundColor: '#ff6600' }]}>
            <View style={styles.featuredOverlay}>
              <Text style={styles.featuredBadge}>FEATURED</Text>
            </View>
          </View>
        </View>
        
        <View style={styles.featuredContent}>
          <Text style={[styles.featuredTitle, { color: theme.text }]} numberOfLines={2}>
            {tournamentData.name}
          </Text>
          <Text style={[styles.featuredDate, { color: theme.textSecondary }]}>
            Jun 18 - Jun 19 • 9+ hrs
          </Text>
          <Text style={[styles.featuredSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
            {tournamentData.nameShortened || 'CS2 Tournament'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const TrendingTournamentCard = ({ tournament }) => {
    const tournamentData = tournament.node;
    
    return (
      <TouchableOpacity
        style={[styles.trendingCard, { backgroundColor: theme.surfaceSecondary }]}
        onPress={() => navigation.navigate('CS2Tournament', { tournamentId: tournamentData.id })}
      >
        <View style={styles.trendingImageContainer}>
          <View style={[styles.trendingImage, { backgroundColor: '#333' }]}>
            <Ionicons name="trophy" size={24} color="#ff6600" />
          </View>
        </View>
        
        <View style={styles.trendingContent}>
          <Text style={[styles.trendingTitle, { color: theme.text }]} numberOfLines={2}>
            {tournamentData.name}
          </Text>
          <Text style={[styles.trendingSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
            {tournamentData.nameShortened || 'Tournament'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.text }]}>
          Browse esports and discover tournaments to watch
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Browse esports and discover{'\n'}tournaments to watch
        </Text>
        
        <TouchableOpacity style={styles.searchButton}>
          <Ionicons name="search" size={20} color={theme.text} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.profileButton}>
          <Ionicons name="person-circle" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* Game Filter */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {gameFilters.map((game, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.filterChip,
                game.active && styles.activeFilterChip,
                { backgroundColor: game.active ? colors.primary : theme.surfaceSecondary }
              ]}
              onPress={() => setSelectedGame(game.name)}
            >
              <Ionicons 
                name={game.icon} 
                size={16} 
                color={game.active ? 'white' : theme.text} 
                style={styles.filterIcon}
              />
              <Text style={[
                styles.filterText,
                { color: game.active ? 'white' : theme.text }
              ]}>
                {game.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Featured Section */}
      {featuredTournaments.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Featured</Text>
          </View>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.featuredScroll}>
            {featuredTournaments.map((tournament, index) => (
              <FeaturedTournamentCard 
                key={tournament.node.id} 
                tournament={tournament} 
                isLarge={index === 0}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Trending Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Trending</Text>
        </View>
        
        <View style={styles.trendingGrid}>
          {trendingTournaments.slice(0, 6).map((tournament, index) => (
            <TrendingTournamentCard key={tournament.node.id} tournament={tournament} />
          ))}
        </View>
      </View>

      {/* Additional Categories */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Categories</Text>
        </View>
        
        <View style={styles.categoriesContainer}>
          <TouchableOpacity style={[styles.categoryCard, { backgroundColor: theme.surfaceSecondary }]}>
            <Ionicons name="flame" size={24} color="#ff4444" />
            <Text style={[styles.categoryTitle, { color: theme.text }]}>Popular</Text>
            <Text style={[styles.categorySubtitle, { color: theme.textSecondary }]}>
              Most watched tournaments
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.categoryCard, { backgroundColor: theme.surfaceSecondary }]}>
            <Ionicons name="calendar" size={24} color="#00aa44" />
            <Text style={[styles.categoryTitle, { color: theme.text }]}>Upcoming</Text>
            <Text style={[styles.categorySubtitle, { color: theme.textSecondary }]}>
              Don't miss these events
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.categoryCard, { backgroundColor: theme.surfaceSecondary }]}>
            <Ionicons name="trophy" size={24} color="#ffaa00" />
            <Text style={[styles.categoryTitle, { color: theme.text }]}>Championships</Text>
            <Text style={[styles.categorySubtitle, { color: theme.textSecondary }]}>
              Major competitions
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.categoryCard, { backgroundColor: theme.surfaceSecondary }]}>
            <Ionicons name="star" size={24} color="#aa00ff" />
            <Text style={[styles.categoryTitle, { color: theme.text }]}>Premium</Text>
            <Text style={[styles.categorySubtitle, { color: theme.textSecondary }]}>
              Exclusive content
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    flex: 1,
    lineHeight: 32,
  },
  searchButton: {
    padding: 8,
    marginLeft: 16,
  },
  profileButton: {
    padding: 8,
    marginLeft: 8,
  },
  filterContainer: {
    marginBottom: 24,
  },
  filterScroll: {
    paddingLeft: 16,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 12,
  },
  activeFilterChip: {
    // Style applied via backgroundColor prop
  },
  filterIcon: {
    marginRight: 6,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  featuredScroll: {
    paddingLeft: 16,
  },
  featuredCard: {
    marginRight: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  largeFeaturedCard: {
    width: 280,
  },
  smallFeaturedCard: {
    width: 240,
  },
  featuredImageContainer: {
    position: 'relative',
  },
  featuredImage: {
    height: 160,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  featuredOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
  },
  featuredBadge: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  featuredContent: {
    padding: 16,
  },
  featuredTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  featuredDate: {
    fontSize: 12,
    marginBottom: 4,
  },
  featuredSubtitle: {
    fontSize: 12,
  },
  trendingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
  },
  trendingCard: {
    width: (width - 44) / 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  trendingImageContainer: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendingImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendingContent: {
    padding: 12,
  },
  trendingTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  trendingSubtitle: {
    fontSize: 12,
  },
  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
  },
  categoryCard: {
    width: (width - 44) / 2,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  categorySubtitle: {
    fontSize: 12,
    textAlign: 'center',
  },
});

export default CS2DiscoverScreen;
import React, { useState, useEffect, useRef } from 'react';
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
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { getCurrentAndUpcomingTournaments, getUpcomingTournaments, getRecentTournaments } from '../../../services/cs2Service';

const { width } = Dimensions.get('window');

const CS2DiscoverScreen = ({ navigation }) => {
  const { colors, theme } = useTheme();
  const [featuredEvents, setFeaturedEvents] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [completedEvents, setCompletedEvents] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [allCompletedEvents, setAllCompletedEvents] = useState([]);
  const [allUpcomingEvents, setAllUpcomingEvents] = useState([]);
  const [allCurrentEvents, setAllCurrentEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [showUpcomingModal, setShowUpcomingModal] = useState(false);
  const [showCurrentModal, setShowCurrentModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Fetch CS2 tournaments data - current, upcoming, and recent
      const [currentTournaments, upcomingTournaments, recentTournaments] = await Promise.all([
        getCurrentAndUpcomingTournaments(1000),
        getUpcomingTournaments(1000),
        getRecentTournaments(1000)
      ]);
      
      // Transform tournament data to match event structure
      const currentEvents = (currentTournaments.edges || []).map(tournament => ({
        id: tournament.node.id,
        slug: tournament.node.slug,
        name: tournament.node.name,
        startDate: tournament.node.startDate || new Date().toISOString(),
        endDate: tournament.node.endDate || new Date().toISOString(),
        imageUrl: tournament.node.image || null,
        logoUrl: tournament.node.image || null,
        prizePool: tournament.node.prize || null,
        prizePoolCurrency: 'USD',
        status: tournament.node.status || 'current'
      }));
      
      const upcomingEvents = (upcomingTournaments.edges || []).map(tournament => ({
        id: tournament.node.id,
        slug: tournament.node.slug,
        name: tournament.node.name,
        startDate: tournament.node.startDate || new Date().toISOString(),
        endDate: tournament.node.endDate || new Date().toISOString(),
        imageUrl: tournament.node.image || null,
        logoUrl: tournament.node.image || null,
        prizePool: tournament.node.prize || null,
        prizePoolCurrency: 'USD'
      }));
      
      const recentEvents = (recentTournaments.edges || []).map(tournament => ({
        id: tournament.node.id,
        slug: tournament.node.slug,
        name: tournament.node.name,
        startDate: tournament.node.startDate || new Date().toISOString(),
        endDate: tournament.node.endDate || new Date().toISOString(),
        imageUrl: tournament.node.image || null,
        logoUrl: tournament.node.image || null,
        prizePool: tournament.node.prize || null,
        prizePoolCurrency: 'USD'
      }));
      
      // Set live events (empty for now since we don't have live tournament data)
      setLiveEvents([]);
      
      // Create featured events - only show tournaments with "current" status
      const currentList = currentEvents.filter(event => event.status === 'current');
      const upcomingList = upcomingEvents;
      const completedList = recentEvents;
      
      // Only show current/in-progress tournaments in featured section
      const featured = currentList.slice(0, 5);
      
      setFeaturedEvents(featured);
      setCompletedEvents(completedList.slice(0, 5));
      setUpcomingEvents(upcomingList.slice(0, 5));
      setAllCompletedEvents(completedList);
      setAllUpcomingEvents(upcomingList);
      setAllCurrentEvents(currentList);
    } catch (error) {
      console.error('Error loading CS2 discover data:', error);
      setFeaturedEvents([]);
      setLiveEvents([]);
      setCompletedEvents([]);
      setUpcomingEvents([]);
      setAllCompletedEvents([]);
      setAllUpcomingEvents([]);
      setAllCurrentEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Helper functions to match VAL discover screen
  const formatEventDateRange = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const options = { month: 'short', day: 'numeric' };
    
    if (start.toDateString() === end.toDateString()) {
      return start.toLocaleDateString('en-US', options);
    }
    
    return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
  };

  const formatPrizePool = (amount, currency = 'USD') => {
    if (!amount) return null;
    
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    }
    return `$${amount.toLocaleString()}`;
  };

  const FeaturedEventCard = ({ event, index, scrollX }) => {
    const start = new Date(event.startDate);
    const options = { month: 'short', day: 'numeric' };
    const dateRange = start.toLocaleDateString('en-US', options);
    const prizePool = formatPrizePool(event.prizePool, event.prizePoolCurrency);
    
    // Check if event is live
    const now = new Date();
    const startDate = new Date(event.startDate);
    const endDate = new Date(event.endDate);
    const isLive = event.status === 'current';
    
    const cardWidth = width * 0.85;
    const spacing = 16;
    
    return (
      <TouchableOpacity
        style={[
          styles.carouselFeaturedCard,
          { backgroundColor: theme.surfaceSecondary, width: cardWidth }
        ]}
        onPress={() => navigation.navigate('CS2Tournament', { 
          tournamentId: event.id, 
          tournamentSlug: event.slug 
        })}
      >
        <View style={styles.featuredImageContainer}>
          {event.imageUrl || event.logoUrl ? (
            <Image
              source={{ uri: event.imageUrl || event.logoUrl }}
              style={[styles.featuredImage, { backgroundColor: theme.surface }]}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.featuredImage, { backgroundColor: colors.primary }]} />
          )}
          
          <View style={styles.featuredOverlay}>
            <View style={styles.featuredBadgeContainer}>
              {isLive && (
                <View style={styles.liveBadge}>
                  <View style={styles.liveIndicator} />
                  <Text style={styles.liveBadgeText}>IN PROGRESS</Text>
                </View>
              )}
              <Text style={styles.featuredBadge}>FEATURED</Text>
            </View>
          </View>
        </View>
        
        <View style={styles.featuredContent}>
          <Text style={[styles.featuredTitle, { color: theme.text }]} numberOfLines={2}>
            {event.name}
          </Text>
          <View style={styles.featuredDetails}>
            <Text style={[styles.featuredDate, { color: theme.textSecondary }]}>
              Start: {dateRange}
            </Text>
            {prizePool && (
              <>
                <Text style={[styles.featuredDivider, { color: theme.textSecondary }]}> • </Text>
                <Text style={[styles.featuredPrizePool, { color: theme.textSecondary }]}>
                  {prizePool}
                </Text>
              </>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const EventCard = ({ event, type = 'upcoming', isModal = false, onPress }) => {
    const dateRange = formatEventDateRange(event.startDate, event.endDate);
    const prizePool = formatPrizePool(event.prizePool, event.prizePoolCurrency);
    
    const handlePress = () => {
      if (onPress) {
        onPress(event.id);
      } else {
        navigation.navigate('CS2Tournament', { 
          tournamentId: event.id, 
          tournamentSlug: event.slug 
        });
      }
    };
    
    return (
      <TouchableOpacity
        style={[
          isModal ? styles.modalEventCard : styles.eventCard, 
          { backgroundColor: theme.surfaceSecondary }
        ]}
        onPress={handlePress}
      >
        <View style={styles.eventImageContainer}>
          {event.imageUrl || event.logoUrl ? (
            <Image
              source={{ uri: event.imageUrl || event.logoUrl }}
              style={styles.eventImage}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.eventImagePlaceholder, { backgroundColor: colors.primary }]}>
              <Ionicons name="trophy" size={24} color="white" />
            </View>
          )}
        </View>
        
        <View style={styles.eventContent}>
          <Text style={[styles.eventTitle, { color: theme.text }]} numberOfLines={2}>
            {event.name}
          </Text>
          <View style={styles.eventDetails}>
            <Text style={[styles.eventDate, { color: theme.textSecondary }]}>
              {dateRange}
            </Text>
            {prizePool && (
              <>
                <Text style={[styles.eventDivider, { color: theme.textSecondary }]}> • </Text>
                <Text style={[styles.eventPrizePool, { color: theme.textSecondary }]}>
                  {prizePool}
                </Text>
              </>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const FullListModal = ({ visible, onClose, events, title, type }) => {
    const handleEventPress = (eventId) => {
      onClose(); // Close the modal first
      navigation.navigate('CS2Tournament', { 
        tournamentId: eventId, 
        tournamentSlug: events.find(e => e.id === eventId)?.slug 
      }); // Then navigate
    };

    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {events.map((event) => (
              <EventCard 
                key={event.id} 
                event={event} 
                type={type} 
                isModal={true} 
                onPress={handleEventPress}
              />
            ))}
            <View style={styles.bottomPadding} />
          </ScrollView>
        </View>
      </Modal>
    );
  };

  const TrendingTournamentCard = ({ tournament }) => {
    const tournamentData = tournament.node;
    
    return (
      <TouchableOpacity
        style={[styles.trendingCard, { backgroundColor: theme.surfaceSecondary }]}
        onPress={() => navigation.navigate('CS2Tournament', { 
          tournamentId: tournamentData.id, 
          tournamentSlug: tournamentData.slug 
        })}
      >
        <View style={styles.trendingImageContainer}>
          <View style={[styles.trendingImage, { backgroundColor: '#333' }]}>
            <Ionicons name="trophy" size={24} color={colors.primary} />
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
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading CS2 tournaments and events...{'\n'}
          Discover major Counter-Strike competitions
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Counter-Strike Events
        </Text>
        
      </View>

      {/* Featured Section */}
      {featuredEvents.length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.sectionHeader}
            onPress={() => setShowCurrentModal(true)}
            disabled={allCurrentEvents.length === 0}
          >
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Featured</Text>
            {allCurrentEvents.length > 0 && (
              <View style={styles.sectionArrow}>
                <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
              </View>
            )}
          </TouchableOpacity>
          
          <FlatList
            data={featuredEvents}
            renderItem={({ item, index }) => (
              <FeaturedEventCard event={item} index={index} />
            )}
            keyExtractor={(item) => item.id.toString()}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContainer}
            snapToInterval={width * 0.85 + 16}
            decelerationRate="fast"
            snapToAlignment="start"
            ItemSeparatorComponent={() => <View style={{ width: 16 }} />}
          />
        </View>
      )}

      {/* Completed Events Section */}
      {completedEvents.length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.sectionHeader}
            onPress={() => setShowCompletedModal(true)}
            disabled={allCompletedEvents.length <= 5}
          >
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Completed Events</Text>
            {allCompletedEvents.length > 5 && (
              <View style={styles.sectionArrow}>
                <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
              </View>
            )}
          </TouchableOpacity>
          
          <View style={styles.eventsGrid}>
            {completedEvents.map((event) => (
              <EventCard key={event.id} event={event} type="completed" />
            ))}
          </View>
        </View>
      )}

      {/* Upcoming Events Section */}
      {upcomingEvents.length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.sectionHeader}
            onPress={() => setShowUpcomingModal(true)}
            disabled={allUpcomingEvents.length <= 5}
          >
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Upcoming Events</Text>
            {allUpcomingEvents.length > 5 && (
              <View style={styles.sectionArrow}>
                <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
              </View>
            )}
          </TouchableOpacity>
          
          <View style={styles.eventsGrid}>
            {upcomingEvents.map((event) => (
              <EventCard key={event.id} event={event} type="upcoming" />
            ))}
          </View>
        </View>
      )}

      {/* Modals */}
      <FullListModal
        visible={showCurrentModal}
        onClose={() => setShowCurrentModal(false)}
        events={allCurrentEvents}
        title="All Live Events"
        type="live"
      />
      
      <FullListModal
        visible={showCompletedModal}
        onClose={() => setShowCompletedModal(false)}
        events={allCompletedEvents}
        title="All Completed Events"
        type="completed"
      />
      
      <FullListModal
        visible={showUpcomingModal}
        onClose={() => setShowUpcomingModal(false)}
        events={allUpcomingEvents}
        title="All Upcoming Events"
        type="upcoming"
      />

      {/* Empty State */}
      {featuredEvents.length === 0 && completedEvents.length === 0 && upcomingEvents.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="search" size={64} color={theme.textTertiary} />
          <Text style={[styles.emptyStateTitle, { color: theme.text }]}>
            Discover Counter-Strike Esports
          </Text>
          <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
            Stay tuned for upcoming tournaments and events
          </Text>
          <TouchableOpacity 
            style={[styles.exploreButton, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('CS2Home')}
          >
            <Text style={styles.exploreButtonText}>
              Explore Counter-Strike
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.bottomPadding} />
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
  backButton: {
    padding: 8,
    marginRight: 8,
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
    // Active styles handled in component
  },
  filterIcon: {
    marginRight: 6,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  sectionArrow: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  carouselContainer: {
    paddingHorizontal: 16,
  },
  carouselFeaturedCard: {
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  featuredImageContainer: {
    height: 200,
  },
  featuredImage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
  },
  featuredOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  featuredBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featuredBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  liveBadge: {
    backgroundColor: '#ff4444',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 4,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'white',
  },
  liveBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  featuredContent: {
    padding: 16,
  },
  featuredTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  featuredDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featuredDate: {
    fontSize: 14,
  },
  featuredDivider: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  featuredPrizePool: {
    fontSize: 14,
    fontWeight: '600',
  },
  eventsGrid: {
    paddingHorizontal: 16,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  modalEventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    marginHorizontal: 15,
  },
  eventImageContainer: {
    marginRight: 16,
    width: 80,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventImage: {
    width: 80,
    height: 60,
    borderRadius: 8,
  },
  eventImagePlaceholder: {
    width: 80,
    height: 60,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventContent: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  eventDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventDate: {
    fontSize: 14,
  },
  eventDivider: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  eventPrizePool: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  exploreButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  exploreButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 32,
  },
  modalContainer: {
    flex: 1,
    paddingTop: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    padding: 8,
  },
  modalContent: {
    flex: 1,
    paddingTop: 16,
  },
});

export default CS2DiscoverScreen;
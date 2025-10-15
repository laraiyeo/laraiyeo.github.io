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
import { getDiscoverEvents, formatEventDateRange, formatPrizePool } from '../../../services/valorantService';

const { width } = Dimensions.get('window');

const VALDiscoverScreen = ({ navigation }) => {
  const { colors, theme } = useTheme();
  const [featuredEvents, setFeaturedEvents] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [completedEvents, setCompletedEvents] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [allCompletedEvents, setAllCompletedEvents] = useState([]);
  const [allUpcomingEvents, setAllUpcomingEvents] = useState([]);
  const [allLiveEvents, setAllLiveEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Removed selectedGame state since game selection is now handled by top tabs
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [showUpcomingModal, setShowUpcomingModal] = useState(false);
  const [showLiveModal, setShowLiveModal] = useState(false);

  // Removed gameFilters since they're now handled by top tab navigation

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Fetch filtered discover events from rib.gg API
      const discoverData = await getDiscoverEvents(1000);
      
      // Set live events
      setLiveEvents(discoverData.live || []);
      
      // Create featured events with priority: live > mix > fallback
      let featured = [];
      const liveEventsList = discoverData.live || [];
      const upcomingList = discoverData.allUpcoming || [];
      const completedList = discoverData.allCompleted || [];
      
      if (liveEventsList.length >= 5) {
        // Enough live events, use top 5 by rank
        featured = liveEventsList.slice(0, 5);
      } else if (liveEventsList.length > 0) {
        // Some live events, mix with upcoming/completed
        featured = [...liveEventsList];
        const remaining = 5 - featured.length;
        
        // Fill with upcoming first, then completed
        const additionalEvents = [...upcomingList, ...completedList].slice(0, remaining);
        featured = [...featured, ...additionalEvents];
      } else {
        // No live events, use upcoming or completed
        if (upcomingList.length > 0) {
          featured = upcomingList.slice(0, 5);
        } else {
          featured = completedList.slice(0, 5);
        }
      }
      
      setFeaturedEvents(featured);
      setCompletedEvents(discoverData.completed || []);
      setUpcomingEvents(discoverData.upcoming || []);
      setAllCompletedEvents(discoverData.allCompleted || []);
      setAllUpcomingEvents(discoverData.allUpcoming || []);
      setAllLiveEvents(liveEventsList);
    } catch (error) {
      console.error('Error loading Valorant discover data:', error);
      setFeaturedEvents([]);
      setLiveEvents([]);
      setCompletedEvents([]);
      setUpcomingEvents([]);
      setAllCompletedEvents([]);
      setAllUpcomingEvents([]);
      setAllLiveEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Removed handleGameFilterPress since game switching is now handled by top tabs

  const FeaturedEventCard = ({ event, index, scrollX }) => {
    const dateRange = formatEventDateRange(event.startDate, event.endDate);
    const prizePool = formatPrizePool(event.prizePool, event.prizePoolCurrency);
    
    // Check if event is live
    const now = new Date();
    const startDate = new Date(event.startDate);
    const endDate = new Date(event.endDate);
    const isLive = startDate <= now && endDate >= now;
    
    const cardWidth = width * 0.85;
    const spacing = 16;
    
    return (
      <TouchableOpacity
        style={[
          styles.carouselFeaturedCard,
          { backgroundColor: theme.surfaceSecondary, width: cardWidth }
        ]}
        onPress={() => navigation.navigate('VALEvent', { eventId: event.id })}
      >
        <View style={styles.featuredImageContainer}>
          {event.imageUrl || event.logoUrl ? (
            <Image
              source={{ uri: event.imageUrl || event.logoUrl }}
              style={styles.featuredImage}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.featuredImage, { backgroundColor: '#ff4654' }]} />
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
              {dateRange}
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
        navigation.navigate('VALEvent', { eventId: event.id });
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
      navigation.navigate('VALEvent', { eventId }); // Then navigate
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

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading VCT tournaments and events...{'\n'}
          Discover major Valorant competitions
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
          Valorant Events
        </Text>
        
      </View>

      {/* Game filter removed - now handled by top tab navigation */}

      {/* Featured Section */}
      {featuredEvents.length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.sectionHeader}
            onPress={() => setShowLiveModal(true)}
            disabled={allLiveEvents.length === 0}
          >
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Featured</Text>
            {allLiveEvents.length > 0 && (
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
        visible={showLiveModal}
        onClose={() => setShowLiveModal(false)}
        events={allLiveEvents}
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
            Discover Valorant Esports
          </Text>
          <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
            Stay tuned for upcoming tournaments and events
          </Text>
          <TouchableOpacity 
            style={[styles.exploreButton, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('VALHome')}
          >
            <Text style={styles.exploreButtonText}>
              Explore Valorant
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

export default VALDiscoverScreen;
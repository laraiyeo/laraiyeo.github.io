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
import { getLeagues, getTournamentsForLeague, getTournaments, getTeams } from '../../../services/lolService';

const { width } = Dimensions.get('window');

const LOLDiscoverScreen = ({ navigation }) => {
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
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [showUpcomingModal, setShowUpcomingModal] = useState(false);
  const [showLiveModal, setShowLiveModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Fetch all leagues first (matching leagues.js pattern)
      const leaguesData = await getLeagues();
      console.log('Loaded leagues:', leaguesData.length);
      
      if (!leaguesData || leaguesData.length === 0) {
        throw new Error('No leagues found');
      }
      
      // Filter out leagues with displayPriority.status === 'hidden'
      const visibleLeagues = leaguesData.filter(league => {
        return league.displayPriority?.status !== 'hidden';
      });
      
      console.log('Visible leagues (non-hidden):', visibleLeagues.length);
      console.log('Hidden leagues filtered out:', leaguesData.length - visibleLeagues.length);
      
      // Load tournament data for visible leagues
      const leaguesToLoad = visibleLeagues;
      const allEvents = [];
      
      console.log('Loading tournaments for', leaguesToLoad.length, 'leagues');
      
      const tournamentPromises = leaguesToLoad.map(async (league) => {
        try {
          const tournaments = await getTournamentsForLeague(league.id);
          console.log(`League ${league.name}: ${tournaments.length} total tournaments`);
          
          // Filter tournaments for 2025 only
          const tournaments2025 = tournaments.filter(tournament => {
            return tournament.startDate && tournament.startDate.startsWith('2025');
          });
          
          console.log(`League ${league.name}: ${tournaments2025.length} tournaments in 2025`);
          
          // Transform tournaments to events format
          return tournaments2025.map((tournament) => {
            const now = new Date();
            const startDate = new Date(tournament.startDate);
            const endDate = new Date(tournament.endDate);
            
            // Determine state based on actual dates
            let state;
            if (now >= startDate && now <= endDate) {
              state = 'live';
            } else if (now < startDate) {
              state = 'upcoming';
            } else {
              state = 'completed';
            }
            
            // Format tournament name from slug
            const formatName = (slug) => {
              if (!slug) return 'Unknown Tournament';
              
              // Remove year patterns (e.g., _2025, _2024, etc.)
              let formatted = slug.replace(/_\d{4}$/, '');
              
              // Replace underscores with spaces and capitalize each word
              formatted = formatted
                .split('_')
                .map(word => {
                  if (word.length === 3) {
                    // Capitalize all 3 letters if word is exactly 3 letters
                    return word.toUpperCase();
                  } else {
                    // Normal capitalization for other words
                    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                  }
                })
                .join(' ');
              
              return formatted;
            };
            
            return {
              ...tournament,
              id: tournament.id,
              name: formatName(tournament.slug),
              league: league,
              state: state,
              startDate: tournament.startDate,
              endDate: tournament.endDate,
              region: league.region, // Use region instead of prize pool
              prizePool: null, // No prize money available
              prizePoolCurrency: null,
              imageUrl: league.image, // Use league image
              logoUrl: league.image
            };
          });
        } catch (error) {
          console.warn(`Failed to load tournaments for league ${league.id}:`, error);
          return [];
        }
      });

      const tournamentArrays = await Promise.allSettled(tournamentPromises);
      
      // Flatten all tournament arrays
      tournamentArrays.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          allEvents.push(...result.value);
        }
      });
      
      console.log('Total events loaded:', allEvents.length);
      
      // Separate events by state
      const liveEventsList = allEvents.filter(e => e.state === 'live');
      const upcomingListUnsorted = allEvents.filter(e => e.state === 'upcoming');
      const completedListUnsorted = allEvents.filter(e => e.state === 'completed');
      
      // Sort upcoming events by start date ascending (nearest first)
      const upcomingList = upcomingListUnsorted.sort((a, b) => {
        return new Date(a.startDate) - new Date(b.startDate);
      });
      
      // Sort completed events by end date descending (most recent first)  
      const completedList = completedListUnsorted.sort((a, b) => {
        return new Date(b.endDate) - new Date(a.endDate);
      });
      
      console.log('Events by state:', {
        live: liveEventsList.length,
        upcoming: upcomingList.length,
        completed: completedList.length
      });
      
      setLiveEvents(liveEventsList);
      setAllLiveEvents(liveEventsList);
      
      // Create featured events with priority: live > mix > fallback
      let featured = [];
      if (liveEventsList.length >= 5) {
        featured = liveEventsList.slice(0, 5);
      } else if (liveEventsList.length > 0) {
        featured = [...liveEventsList];
        const remaining = 5 - featured.length;
        const additionalEvents = [...upcomingList, ...completedList].slice(0, remaining);
        featured = [...featured, ...additionalEvents];
      } else {
        if (upcomingList.length > 0) {
          featured = upcomingList.slice(0, 5);
        } else {
          featured = completedList.slice(0, 5);
        }
      }
      
      setFeaturedEvents(featured);
      setCompletedEvents(completedList.slice(0, 5));
      setUpcomingEvents(upcomingList.slice(0, 5));
      setAllCompletedEvents(completedList);
      setAllUpcomingEvents(upcomingList);
      
    } catch (error) {
      console.error('Error loading LoL discover data:', error);
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

  // Helper functions matching VAL service
  const formatEventDateRange = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const startDay = start.getDate();
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
    const endDay = end.getDate();
    
    if (startMonth === endMonth) {
      return `${startMonth} ${startDay}-${endDay}`;
    } else {
      return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
    }
  };

  const formatRegion = (region) => {
    if (!region) return null;
    
    // Format region names for better display
    const regionMap = {
      'INTERNATIONAL': 'International',
      'NORTH AMERICA': 'North America', 
      'AMERICAS': 'Americas',
      'EMEA': 'EMEA',
      'KOREA': 'Korea',
      'CHINA': 'China',
      'PACIFIC': 'Pacific',
      'JAPAN': 'Japan',
      'BRAZIL': 'Brazil',
      'LATIN AMERICA': 'Latin America',
      'LATIN AMERICA NORTH': 'LAN',
      'LATIN AMERICA SOUTH': 'LAS',
      'HONG KONG, MACAU, TAIWAN': 'PCS',
      'OCEANIA': 'Oceania',
      'VIETNAM': 'Vietnam',
      'COMMONWEALTH OF INDEPENDENT STATES': 'CIS'
    };
    
    return regionMap[region] || region;
  };

  const FeaturedEventCard = ({ event, index, scrollX }) => {
    const dateRange = formatEventDateRange(event.startDate, event.endDate);
    const region = formatRegion(event.region);
    
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
        onPress={() => navigation.navigate('LOLTournament', { 
          tournamentId: event.id, 
          league: event.league 
        })}
      >
        <View style={styles.featuredImageContainer}>
          {event.imageUrl || event.logoUrl ? (
            <Image
              source={{ uri: event.imageUrl || event.logoUrl }}
              style={styles.featuredImage}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.featuredImage, { backgroundColor: '#C89B3C' }]} />
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
            {region && (
              <>
                <Text style={[styles.featuredDivider, { color: theme.textSecondary }]}> • </Text>
                <Text style={[styles.featuredPrizePool, { color: theme.textSecondary }]}>
                  {region}
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
    const region = formatRegion(event.region);
    
    const handlePress = () => {
      if (onPress) {
        onPress(event.id);
      } else {
        navigation.navigate('LOLTournament', { 
          tournamentId: event.id, 
          league: event.league 
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
            {region && (
              <>
                <Text style={[styles.eventDivider, { color: theme.textSecondary }]}> • </Text>
                <Text style={[styles.eventPrizePool, { color: theme.textSecondary }]}>
                  {region}
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
      const event = events.find(e => e.id === eventId);
      onClose(); // Close the modal first
      navigation.navigate('LOLTournament', { 
        tournamentId: eventId, 
        league: event?.league 
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

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading LoL tournaments and events...{'\n'}
          Discover major League of Legends competitions
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
          League of Legends Events
        </Text>
        
      </View>

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
            Discover League of Legends Esports
          </Text>
          <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
            Stay tuned for upcoming tournaments and events
          </Text>
          <TouchableOpacity 
            style={[styles.exploreButton, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('LOLHome')}
          >
            <Text style={styles.exploreButtonText}>
              Explore League of Legends
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

export default LOLDiscoverScreen;
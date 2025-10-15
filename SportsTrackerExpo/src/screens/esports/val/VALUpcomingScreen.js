import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { getUpcomingEvents } from '../../../services/valorantService';

const VALUpcomingScreen = ({ navigation }) => {
  const { colors, theme } = useTheme();
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const upcomingData = await getUpcomingEvents(20);
      setUpcomingEvents(upcomingData?.data || []);
    } catch (error) {
      console.error('Error loading upcoming Valorant events:', error);
      setUpcomingEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getFilteredEvents = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    return upcomingEvents.filter(event => {
      if (!event.startDate) return false;
      const eventDate = new Date(event.startDate);
      const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());

      switch (activeFilter) {
        case 'today':
          return eventDay.getTime() === today.getTime();
        case 'tomorrow':
          return eventDay.getTime() === tomorrow.getTime();
        case 'week':
          return eventDay >= today && eventDay <= weekFromNow;
        default:
          return true;
      }
    });
  };

  const UpcomingEventCard = ({ event }) => (
    <TouchableOpacity
      style={[styles.eventCard, { backgroundColor: theme.surfaceSecondary }]}
      onPress={() => navigation.navigate('VALEvent', { eventId: event.id })}
    >
      <View style={styles.upcomingIndicator}>
        <Ionicons name="time-outline" size={16} color={colors.primary} />
        <Text style={[styles.upcomingText, { color: colors.primary }]}>UPCOMING</Text>
      </View>
      
      <Text style={[styles.eventTitle, { color: theme.text }]} numberOfLines={2}>
        {event.name}
      </Text>
      
      <Text style={[styles.eventSubtitle, { color: theme.textSecondary }]}>
        {event.shortName || 'Valorant Event'}
      </Text>
      
      <View style={styles.eventMeta}>
        <Text style={[styles.eventMetaText, { color: theme.textSecondary }]}>
          Starts: {event.startDate ? new Date(event.startDate).toLocaleDateString() : 'TBD'}
        </Text>
        {event.prizePool && (
          <Text style={[styles.prizeText, { color: colors.primary }]}>
            ${event.prizePool}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const filteredEvents = getFilteredEvents();

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading upcoming Valorant events...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Upcoming Events
        </Text>
        
        <TouchableOpacity 
          style={styles.refreshButton}
          onPress={onRefresh}
        >
          <Ionicons name="refresh" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Filter Buttons */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {['all', 'today', 'tomorrow', 'week'].map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterButton,
                activeFilter === filter && styles.activeFilterButton,
                { 
                  backgroundColor: activeFilter === filter ? colors.primary : theme.surfaceSecondary,
                  borderColor: theme.border 
                }
              ]}
              onPress={() => setActiveFilter(filter)}
            >
              <Text style={[
                styles.filterButtonText,
                { color: activeFilter === filter ? 'white' : theme.text }
              ]}>
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        {filteredEvents.length > 0 ? (
          <View style={styles.eventsList}>
            {filteredEvents.map((event) => (
              <UpcomingEventCard key={event.id} event={event} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color={theme.textTertiary} />
            <Text style={[styles.emptyStateTitle, { color: theme.text }]}>
              No Upcoming Events
            </Text>
            <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
              {activeFilter === 'all' 
                ? 'No upcoming Valorant events scheduled at the moment.'
                : `No events scheduled for ${activeFilter}.`}
              {'\n'}Check back later for new tournaments!
            </Text>
          </View>
        )}
        
        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    flex: 1,
  },
  refreshButton: {
    padding: 8,
  },
  filterContainer: {
    marginBottom: 16,
  },
  filterScroll: {
    paddingLeft: 16,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
  },
  activeFilterButton: {
    // Active styles handled in component
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  eventsList: {
    paddingHorizontal: 16,
  },
  eventCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  upcomingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  upcomingText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  eventSubtitle: {
    fontSize: 14,
    marginBottom: 8,
  },
  eventMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  eventMetaText: {
    fontSize: 12,
  },
  prizeText: {
    fontSize: 14,
    fontWeight: 'bold',
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
  },
  bottomPadding: {
    height: 32,
  },
});

export default VALUpcomingScreen;
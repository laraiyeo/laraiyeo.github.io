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
import { getLiveEvents } from '../../../services/valorantService';

const VALLiveScreen = ({ navigation }) => {
  const { colors, theme } = useTheme();
  const [liveEvents, setLiveEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const liveData = await getLiveEvents(20);
      setLiveEvents(liveData?.data || []);
    } catch (error) {
      console.error('Error loading live Valorant events:', error);
      setLiveEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const LiveEventCard = ({ event }) => (
    <TouchableOpacity
      style={[styles.eventCard, { backgroundColor: theme.surfaceSecondary }]}
      onPress={() => navigation.navigate('VALEvent', { eventId: event.id })}
    >
      <View style={styles.liveIndicator}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE</Text>
      </View>
      
      <Text style={[styles.eventTitle, { color: theme.text }]} numberOfLines={2}>
        {event.name}
      </Text>
      
      <Text style={[styles.eventSubtitle, { color: theme.textSecondary }]}>
        {event.shortName || 'Valorant Event'}
      </Text>
      
      <View style={styles.eventMeta}>
        <Text style={[styles.eventMetaText, { color: theme.textSecondary }]}>
          {event.region || 'Global'} • {event.prizePool ? `$${event.prizePool}` : 'No prize pool'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading live Valorant events...
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
          Live Events
        </Text>
        
        <TouchableOpacity 
          style={styles.refreshButton}
          onPress={onRefresh}
        >
          <Ionicons name="refresh" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        {liveEvents.length > 0 ? (
          <View style={styles.eventsList}>
            {liveEvents.map((event) => (
              <LiveEventCard key={event.id} event={event} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="radio-outline" size={64} color={theme.textTertiary} />
            <Text style={[styles.emptyStateTitle, { color: theme.text }]}>
              No Live Events
            </Text>
            <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
              There are currently no live Valorant events.{'\n'}Check back later for live matches!
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
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff4444',
    marginRight: 6,
  },
  liveText: {
    color: '#ff4444',
    fontSize: 12,
    fontWeight: 'bold',
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
    marginTop: 4,
  },
  eventMetaText: {
    fontSize: 12,
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

export default VALLiveScreen;
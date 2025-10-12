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
import { getRecentEvents } from '../../../services/valorantService';

const VALResultsScreen = ({ navigation }) => {
  const { colors, theme } = useTheme();
  const [recentEvents, setRecentEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const recentData = await getRecentEvents(20);
      setRecentEvents(recentData?.data || []);
    } catch (error) {
      console.error('Error loading recent Valorant events:', error);
      setRecentEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const RecentEventCard = ({ event }) => (
    <TouchableOpacity
      style={[styles.eventCard, { backgroundColor: theme.surfaceSecondary }]}
      onPress={() => navigation.navigate('VALEvent', { eventId: event.id })}
    >
      <View style={styles.completedIndicator}>
        <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
        <Text style={[styles.completedText, { color: '#4CAF50' }]}>COMPLETED</Text>
      </View>
      
      <Text style={[styles.eventTitle, { color: theme.text }]} numberOfLines={2}>
        {event.name}
      </Text>
      
      <Text style={[styles.eventSubtitle, { color: theme.textSecondary }]}>
        {event.shortName || 'Valorant Event'}
      </Text>
      
      <View style={styles.eventMeta}>
        <Text style={[styles.eventMetaText, { color: theme.textSecondary }]}>
          Ended: {event.endDate ? new Date(event.endDate).toLocaleDateString() : 'Recently'}
        </Text>
        {event.prizePool && (
          <Text style={[styles.prizeText, { color: colors.primary }]}>
            ${event.prizePool}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading recent Valorant results...
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
          Recent Results
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
        {recentEvents.length > 0 ? (
          <View style={styles.eventsList}>
            {recentEvents.map((event) => (
              <RecentEventCard key={event.id} event={event} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="trophy-outline" size={64} color={theme.textTertiary} />
            <Text style={[styles.emptyStateTitle, { color: theme.text }]}>
              No Recent Results
            </Text>
            <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
              Recent Valorant tournament results will appear here.{'\n'}Check back after events conclude!
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
  completedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  completedText: {
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

export default VALResultsScreen;
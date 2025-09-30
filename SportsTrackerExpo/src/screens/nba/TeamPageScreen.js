import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';
import { NBAService } from '../../services/NBAService';

const NBATeamPageScreen = ({ route, navigation }) => {
  const { teamId, teamName, teamAbbreviation } = route.params;
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const [teamDetails, setTeamDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTeamDetails();
  }, [teamId]);

  const loadTeamDetails = async () => {
    try {
      const data = await NBAService.getTeamDetails(teamId);
      setTeamDetails(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load team details');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const normalizeAbbreviation = (abbrev) => {
    if (!abbrev) return abbrev;
    const a = String(abbrev).toLowerCase();
    const map = { 'gs': 'gsw', 'sa': 'sas', 'no': 'nop', 'ny': 'nyk', 'bkn': 'bk' };
    return (map[a] || abbrev).toString();
  };

  const toggleTeamFavorite = () => {
    if (isFavorite('nba-team', teamId)) {
      removeFavorite('nba-team', teamId);
    } else {
      addFavorite('nba-team', teamId, {
        id: teamId,
        name: teamName || teamDetails?.team?.displayName || 'Team',
        abbreviation: teamAbbreviation || teamDetails?.team?.abbreviation || '',
        sport: 'nba'
      });
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.text }]}>
          Loading team details...
        </Text>
      </View>
    );
  }

  if (!teamDetails) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text allowFontScaling={false} style={[styles.errorText, { color: theme.text }]}>
          Team details not available
        </Text>
      </View>
    );
  }

  const team = teamDetails.team || {};
  const isTeamFavorited = isFavorite('nba-team', teamId);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.surface }]}>
        <View style={styles.headerContent}>
          <Image
            source={{ uri: getTeamLogoUrl('nba', normalizeAbbreviation(team.abbreviation)) }}
            style={styles.teamLogo}
            defaultSource={require('../../../assets/nba.png')}
          />
          <View style={styles.teamInfo}>
            <Text allowFontScaling={false} style={[styles.teamName, { color: theme.text }]}>
              {team.displayName || teamName}
            </Text>
            <Text allowFontScaling={false} style={[styles.teamLocation, { color: theme.textSecondary }]}>
              {team.location} {team.nickname}
            </Text>
            <Text allowFontScaling={false} style={[styles.teamAbbreviation, { color: theme.textSecondary }]}>
              {team.abbreviation || teamAbbreviation}
            </Text>
          </View>
          <TouchableOpacity onPress={toggleTeamFavorite} style={styles.favoriteButton}>
            <Ionicons
              name={isTeamFavorited ? "star" : "star-outline"}
              size={24}
              color={isTeamFavorited ? colors.primary : theme.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Team Stats */}
      {team.record && (
        <View style={[styles.statsContainer, { backgroundColor: theme.surface }]}>
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>
            Season Record
          </Text>
          <View style={styles.recordContainer}>
            <Text allowFontScaling={false} style={[styles.recordText, { color: theme.text }]}>
              {team.record.items?.[0]?.summary || 'N/A'}
            </Text>
            {team.standingSummary && (
              <Text allowFontScaling={false} style={[styles.standingText, { color: theme.textSecondary }]}>
                {team.standingSummary}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Venue Information */}
      {team.venue && (
        <View style={[styles.venueContainer, { backgroundColor: theme.surface }]}>
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>
            Home Venue
          </Text>
          <View style={styles.venueInfo}>
            <Ionicons name="location-outline" size={20} color={theme.textSecondary} />
            <Text allowFontScaling={false} style={[styles.venueText, { color: theme.textSecondary }]}>
              {team.venue.fullName}
            </Text>
          </View>
          {team.venue.capacity && (
            <View style={styles.venueInfo}>
              <Ionicons name="people-outline" size={20} color={theme.textSecondary} />
              <Text allowFontScaling={false} style={[styles.venueText, { color: theme.textSecondary }]}>
                Capacity: {team.venue.capacity.toLocaleString()}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Team Colors */}
      {(team.color || team.alternateColor) && (
        <View style={[styles.colorsContainer, { backgroundColor: theme.surface }]}>
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>
            Team Colors
          </Text>
          <View style={styles.colorRow}>
            {team.color && (
              <View style={styles.colorItem}>
                <View style={[styles.colorSwatch, { backgroundColor: `#${team.color}` }]} />
                <Text allowFontScaling={false} style={[styles.colorText, { color: theme.textSecondary }]}>
                  Primary
                </Text>
              </View>
            )}
            {team.alternateColor && (
              <View style={styles.colorItem}>
                <View style={[styles.colorSwatch, { backgroundColor: `#${team.alternateColor}` }]} />
                <Text allowFontScaling={false} style={[styles.colorText, { color: theme.textSecondary }]}>
                  Secondary
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Coming Soon */}
      <View style={[styles.comingSoonContainer, { backgroundColor: theme.surface }]}>
        <Ionicons name="basketball-outline" size={48} color={theme.textSecondary} />
        <Text allowFontScaling={false} style={[styles.comingSoonTitle, { color: theme.text }]}>
          More Team Details Coming Soon
        </Text>
        <Text allowFontScaling={false} style={[styles.comingSoonText, { color: theme.textSecondary }]}>
          Roster, recent games, statistics, and more team information will be available soon.
        </Text>
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
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 32,
  },
  header: {
    margin: 16,
    padding: 20,
    borderRadius: 12,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamLogo: {
    width: 80,
    height: 80,
    marginRight: 16,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  teamLocation: {
    fontSize: 16,
    marginBottom: 2,
  },
  teamAbbreviation: {
    fontSize: 14,
  },
  favoriteButton: {
    padding: 8,
  },
  statsContainer: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  recordContainer: {
    alignItems: 'center',
  },
  recordText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  standingText: {
    fontSize: 14,
  },
  venueContainer: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  venueInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  venueText: {
    fontSize: 14,
    marginLeft: 8,
  },
  colorsContainer: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 20,
  },
  colorItem: {
    alignItems: 'center',
  },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  colorText: {
    fontSize: 12,
  },
  comingSoonContainer: {
    margin: 16,
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  comingSoonTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 8,
  },
  comingSoonText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default NBATeamPageScreen;
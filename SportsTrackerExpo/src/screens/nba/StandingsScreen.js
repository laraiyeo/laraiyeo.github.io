import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';
import { NBAService } from '../../services/NBAService';

// Helper to normalize API team info to what UI expects
const normalizeTeam = (entry) => {
  const team = entry.team || {};
  const stats = entry.stats || [];
  
  // Convert stats array to object for easier access
  const statObj = {};
  stats.forEach(stat => {
    statObj[stat.name] = stat.displayValue;
  });

  return {
    id: team.id?.toString() || undefined,
    abbreviation: team.abbreviation,
    displayName: team.displayName,
    logo: team.logo,
    seed: statObj.rank || statObj.seed,
    wins: statObj.wins || '0',
    losses: statObj.losses || '0',
    winPercentage: statObj.winPercent || statObj.winPercentage || '0.000',
    gamesBehind: statObj.gamesBehind || statObj.gb || '0',
    streak: statObj.streak || '',
    pointsFor: statObj.pointsFor || statObj.pf || '0',
    pointsAgainst: statObj.pointsAgainst || statObj.pa || '0',
    conferenceName: team.conferenceName,
    divisionName: team.divisionName,
    clinchIndicator: statObj.clinchIndicator || null,
  };
};

const NBAStandingsScreen = () => {
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const { isFavorite } = useFavorites();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [standings, setStandings] = useState(null);
  const [intervalId, setIntervalId] = useState(null);

  // NBA team abbreviation -> id mapping for navigation
  const abbrToIdMap = {
    'atl': '1', 'bos': '2', 'bkn': '17', 'cha': '30', 'chi': '4', 'cle': '5',
    'dal': '6', 'den': '7', 'det': '8', 'gs': '9', 'hou': '10', 'ind': '11',
    'lac': '12', 'lal': '13', 'mem': '29', 'mia': '14', 'mil': '15', 'min': '16',
    'no': '3', 'nyk': '18', 'okc': '25', 'orl': '19', 'phi': '20', 'phx': '21',
    'por': '22', 'sac': '23', 'sa': '24', 'tor': '28', 'uta': '26', 'wsh': '27'
  };

  const mapAbbrToId = (abbr) => {
    if (!abbr) return null;
    return abbrToIdMap[String(abbr).toLowerCase()] || null;
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await NBAService.getStandings();
        if (!mounted) return;
        const formattedData = NBAService.formatStandingsForMobile(data);
        setStandings(formattedData);
      } catch (e) {
        console.error('Failed to load NBA standings', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    const unsubscribeFocus = navigation.addListener('focus', () => {
      load();
      const id = setInterval(load, 30000);
      setIntervalId(id);
    });

    const unsubscribeBlur = navigation.addListener('blur', () => {
      if (intervalId) { clearInterval(intervalId); setIntervalId(null); }
    });

    return () => { mounted = false; if (intervalId) clearInterval(intervalId); unsubscribeFocus(); unsubscribeBlur(); };
  }, [navigation, intervalId]);

  if (loading) return (<View style={[styles.loadingContainer, { backgroundColor: theme.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>);
  if (!standings) return (<View style={[styles.container, { backgroundColor: theme.background }]}><Text style={{ color: theme.text }}>No standings available</Text></View>);

  // Team navigation function with proper ID handling
  const navigateToTeam = (team) => {
    const safeId = team.id || mapAbbrToId(team.abbreviation) || team;
    navigation.navigate('TeamPage', { teamId: safeId, sport: 'nba' });
  };

  // Helper function to get NBA team ID for favorites
  const getNBATeamId = (team) => {
    return team?.id || mapAbbrToId(team?.abbreviation) || null;
  };

  // Helper to render a single team row
  const renderTeamRow = (team, index) => {
    const teamId = getNBATeamId(team);
    const isFav = teamId && isFavorite('nba-team', teamId);
    const normalizeAbbreviation = (abbrev) => {
      if (!abbrev) return abbrev;
      const a = String(abbrev).toLowerCase();
      const map = { 'gs': 'gsw', 'sa': 'sas', 'no': 'nop', 'ny': 'nyk', 'bkn': 'bk' };
      return (map[a] || abbrev).toString();
    };

    return (
      <TouchableOpacity
        key={`${team.id || team.abbreviation}-${index}`}
        style={[styles.teamRow, { backgroundColor: theme.surface }]}
        onPress={() => navigateToTeam(team)}
        activeOpacity={0.7}
      >
        <View style={styles.teamRank}>
          <Text allowFontScaling={false} style={[styles.rankText, { color: theme.textSecondary }]}>
            {team.seed || index + 1}
          </Text>
        </View>

        <Image
          source={{ uri: getTeamLogoUrl('nba', normalizeAbbreviation(team.abbreviation)) }}
          style={styles.teamLogo}
          defaultSource={require('../../../assets/nba.png')}
        />

        <View style={styles.teamInfo}>
          <View style={styles.teamNameContainer}>
            <Text allowFontScaling={false} style={[styles.teamName, { color: theme.text }]} numberOfLines={1}>
              {team.displayName}
            </Text>
            {isFav && <Ionicons name="star" size={16} color={colors.primary} style={styles.favoriteIcon} />}
          </View>
          <Text allowFontScaling={false} style={[styles.teamRecord, { color: theme.textSecondary }]}>
            {team.wins}-{team.losses} ({team.winPercentage})
          </Text>
          {team.streak && (
            <Text allowFontScaling={false} style={[styles.teamStreak, { color: theme.textSecondary }]}>
              {team.streak}
            </Text>
          )}
        </View>

        <View style={styles.teamStats}>
          <Text allowFontScaling={false} style={[styles.statText, { color: theme.textSecondary }]}>
            GB: {team.gamesBehind}
          </Text>
          {team.clinchIndicator && (
            <Text allowFontScaling={false} style={[styles.clinchText, { color: colors.success }]}>
              {team.clinchIndicator}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Helper to render a division section
  const renderDivision = (divisionName, teams, conferenceIndex, divisionIndex) => {
    if (!teams || teams.length === 0) return null;

    return (
      <View key={`${conferenceIndex}-${divisionIndex}`} style={styles.divisionContainer}>
        {divisionName && (
          <View style={[styles.divisionHeader, { backgroundColor: theme.surface }]}>
            <Text allowFontScaling={false} style={[styles.divisionTitle, { color: theme.text }]}>
              {divisionName}
            </Text>
          </View>
        )}
        {teams.map((team, teamIndex) => renderTeamRow(team, teamIndex))}
      </View>
    );
  };

  // Helper to render a conference
  const renderConference = (conferenceName, divisions, conferenceIndex) => {
    return (
      <View key={conferenceIndex} style={styles.conferenceContainer}>
        <View style={[styles.conferenceHeader, { backgroundColor: colors.primary }]}>
          <Text allowFontScaling={false} style={styles.conferenceTitle}>
            {conferenceName}
          </Text>
        </View>
        {Object.entries(divisions).map(([divisionName, teams], divisionIndex) => 
          renderDivision(divisionName, teams, conferenceIndex, divisionIndex)
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {Object.entries(standings).map(([conferenceName, divisions], conferenceIndex) => 
          renderConference(conferenceName, divisions, conferenceIndex)
        )}
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
  },
  scrollContent: {
    padding: 16,
  },
  conferenceContainer: {
    marginBottom: 24,
  },
  conferenceHeader: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  conferenceTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  divisionContainer: {
    marginBottom: 16,
  },
  divisionHeader: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginBottom: 4,
  },
  divisionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 2,
    borderRadius: 8,
  },
  teamRank: {
    width: 30,
    marginRight: 12,
  },
  rankText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  teamLogo: {
    width: 32,
    height: 32,
    marginRight: 12,
  },
  teamInfo: {
    flex: 1,
  },
  teamNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamName: {
    fontSize: 16,
    fontWeight: '600',
  },
  favoriteIcon: {
    marginLeft: 6,
  },
  teamRecord: {
    fontSize: 12,
    marginTop: 2,
  },
  teamStreak: {
    fontSize: 12,
    marginTop: 1,
  },
  teamStats: {
    alignItems: 'flex-end',
    minWidth: 60,
  },
  statText: {
    fontSize: 12,
  },
  clinchText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
});

export default NBAStandingsScreen;
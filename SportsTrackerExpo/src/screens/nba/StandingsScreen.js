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
  const stats = entry.stats || {};
  
  // Stats are already converted to object format by formatStandingsForMobile
  const statObj = stats;

  // Calculate PPG stats
  const totalGames = parseInt(statObj.wins || '0') + parseInt(statObj.losses || '0');
  const ppg = totalGames > 0 ? (parseFloat(statObj.pointsFor || '0') / totalGames).toFixed(1) : '0.0';
  const oppPpg = totalGames > 0 ? (parseFloat(statObj.pointsAgainst || '0') / totalGames).toFixed(1) : '0.0';
  const diff = totalGames > 0 ? (parseFloat(ppg) - parseFloat(oppPpg)).toFixed(1) : '0.0';
  const diffFormatted = diff > 0 ? `+${diff}` : diff;

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
    pointsFor: statObj.avgPointsFor || statObj.pf || '0',
    pointsAgainst: statObj.avgPointsAgainst || statObj.pa || '0',
    diff: statObj.differential || '0',
    conferenceName: team.conferenceName,
    divisionName: team.divisionName,
    clinchIndicator: statObj.clinchIndicator || null,
  };
};

const TeamLogo = ({ teamAbbreviation, size, style, iconStyle }) => {
  const { colors, getTeamLogoUrl } = useTheme();
  const [imageError, setImageError] = useState(false);
  
  const logoUri = getTeamLogoUrl('nba', teamAbbreviation);
  
  if (!logoUri || imageError) {
    return (
      <Ionicons 
        name="basketball" 
        size={size} 
        color={colors.primary} 
        style={iconStyle}
      />
    );
  }
  
  return (
    <Image
      source={{ uri: logoUri }}
      style={style}
      onError={() => setImageError(true)}
    />
  );
};

const NBAStandingsScreen = () => {
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const { isFavorite } = useFavorites();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
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
    const load = async (silent = false) => {
      try {
        // Only show loading for non-silent updates
        if (!silent && mounted) {
          setLoading(true);
        }
        
        const data = await NBAService.getStandings();
        if (!mounted) return;
        const formattedData = NBAService.formatStandingsForMobile(data);
        setStandings(formattedData);
      } catch (e) {
        console.error('Failed to load NBA standings', e);
      } finally {
        if (mounted && !silent) {
          setLoading(false);
        }
      }
    };

    // Initial load only (like StatsScreen - no background updates)
    load();

    return () => { 
      mounted = false; 
      if (intervalId) {
        clearInterval(intervalId);
        setIntervalId(null);
      }
    };
  }, []);

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
  const renderTeamRow = (entry, index) => {
    const team = normalizeTeam(entry);
    const teamId = getNBATeamId(team);
    const isFav = teamId && isFavorite(teamId, 'nba');
    const normalizeAbbreviation = (abbrev) => {
      if (!abbrev) return abbrev;
      const a = String(abbrev).toLowerCase();
      const map = {};
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

        <TeamLogo 
          teamAbbreviation={normalizeAbbreviation(team.abbreviation)}
          size={28}
          style={styles.teamLogo}
          iconStyle={{ marginHorizontal: 8 }}
        />

        <View style={styles.teamInfo}>
          <View style={styles.teamNameContainer}>
            {isFav && <Ionicons name="star" size={16} color={colors.primary} style={styles.favoriteIcon} />}
            <Text allowFontScaling={false} style={[styles.teamName, { color: isFav ? colors.primary : theme.text }]} numberOfLines={1}>
              {team.displayName}
            </Text>
          </View>
          <View style={styles.recordStreakContainer}>
            <Text allowFontScaling={false} style={[styles.teamRecord, { color: theme.textSecondary }]}>
              {team.wins}-{team.losses} ({team.winPercentage})
            </Text>
            {team.streak && (
              <Text allowFontScaling={false} style={[
                styles.teamStreak, 
                { 
                  color: team.streak.charAt(0) === 'W' ? theme.success : 
                         team.streak.charAt(0) === 'L' ? theme.error : 
                         theme.textSecondary 
                }
              ]}>
                {team.streak}
              </Text>
            )}
          </View>
          <View style={styles.ppgContainer}>
            <Text allowFontScaling={false} style={[styles.ppgText, { color: theme.textSecondary }]}>
              PPG: {team.pointsFor} | OPP: {team.pointsAgainst} | 
            </Text>
            <Text allowFontScaling={false} style={[
              styles.diffText, 
              { 
                color: team.diff.charAt(0) === '+' ? theme.success : 
                       team.diff.charAt(0) === '-' ? theme.error : 
                       theme.textSecondary 
              }
            ]}>
              &nbsp;{team.diff}
            </Text>
          </View>
        </View>

        <View style={styles.teamStats}>
          <Text allowFontScaling={false} style={[styles.statText, { color: theme.textSecondary }]}>
            GB: {team.gamesBehind}
          </Text>
          {team.clinchIndicator && (
            <Text allowFontScaling={false} style={[styles.clinchText, { color: theme.success }]}>
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
        {divisionName !== 'teams' && (
          <View style={[styles.divisionHeader, { backgroundColor: theme.surface }]}>
            <Text allowFontScaling={false} style={[styles.divisionTitle, { color: theme.text }]}>
              {divisionName}
            </Text>
          </View>
        )}
        {teams.map((teamEntry, teamIndex) => renderTeamRow(teamEntry, teamIndex))}
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
    marginRight: 6,
  },
  recordStreakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  teamRecord: {
    fontSize: 12,
    marginRight: 8,
  },
  teamStreak: {
    fontSize: 12,
    fontWeight: '600',
  },
  ppgContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  ppgText: {
    fontSize: 11,
  },
  diffText: {
    fontSize: 11,
    fontWeight: '600',
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
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';
import { WNBAService } from '../../services/WNBAService';

// Helper to normalize API team info to what UI expects
const normalizeTeam = (entry) => {
  const team = entry.team || {};
  const stats = entry.stats || {};
  
  // Stats are already converted to object format by formatStandingsForMobile
  const statObj = stats;

  // WNBA has direct PPG stats in the API (avgPointsFor, avgPointsAgainst)
  const ppg = statObj.avgPointsFor || '0.0';
  const oppPpg = statObj.avgPointsAgainst || '0.0';
  const diff = (parseFloat(ppg) - parseFloat(oppPpg)).toFixed(1);
  const diffFormatted = diff > 0 ? `+${diff}` : diff;

  return {
    id: team.id?.toString() || undefined,
    abbreviation: team.abbreviation,
    displayName: team.displayName,
    logo: team.logo,
    seed: team.seed || statObj.rank || statObj.seed,
    wins: statObj.wins || '0',
    losses: statObj.losses || '0',
    winPercentage: statObj.winPercent || statObj.winPercentage || '0.000',
    gamesBehind: statObj.gamesBehind || statObj.gb || '0',
    streak: statObj.streak || '',
    pointsFor: statObj.pointsFor || statObj.pf || '0',
    pointsAgainst: statObj.pointsAgainst || statObj.pa || '0',
    ppg: ppg,
    oppPpg: oppPpg,
    diff: diffFormatted,
    conferenceName: team.conferenceName,
    divisionName: team.divisionName,
    clinchIndicator: team.clincher || statObj.clinchIndicator || null,
  };
};

const TeamLogo = ({ teamAbbreviation, size, style, iconStyle }) => {
  const { colors, getTeamLogoUrl } = useTheme();
  const [imageError, setImageError] = useState(false);
  
  const logoUri = getTeamLogoUrl('wnba', teamAbbreviation);
  
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

const WNBAStandingsScreen = () => {
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const { isFavorite } = useFavorites();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [standings, setStandings] = useState(null);
  const [intervalId, setIntervalId] = useState(null);

  // WNBA team abbreviation -> id mapping for navigation
  const abbrToIdMap = {
  'dal': '3', 'ind': '5', 'la': '6', 'min': '8', 'ny': '9', 'phx': '11',
  'sea': '14', 'wsh': '16', 'lv': '17', 'con': '18', 'chi': '19', 'atl': '20', 'gs': '129689'
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
        
        const data = await WNBAService.getStandings();
        if (!mounted) return;
        const formattedData = WNBAService.formatStandingsForMobile(data);
        setStandings(formattedData);
      } catch (e) {
        console.error('Failed to load WNBA standings', e);
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
    navigation.navigate('TeamPage', { teamId: safeId, sport: 'wnba' });
  };

  // Helper function to get WNBA team ID for favorites
  const getWNBATeamId = (team) => {
    return team?.id || mapAbbrToId(team?.abbreviation) || null;
  };

  // Helper to render a single team row
  const renderTeamRow = (entry, index) => {
    const team = normalizeTeam(entry);
    
    // Debug: Log the first team's data to see structure
    if (index === 0) {
      console.log('WNBA Team Data:', JSON.stringify(team, null, 2));
      console.log('Original Entry:', JSON.stringify(entry, null, 2));
    }
    
    const teamId = getWNBATeamId(team);
    const isFav = teamId && isFavorite(teamId, 'wnba');
    const normalizeAbbreviation = (abbrev) => {
      if (!abbrev) return abbrev;
      const a = String(abbrev).toLowerCase();
      const map = {};
      return (map[a] || abbrev).toString();
    };

    // Determine clinch border color
    const getClinchBorderColor = () => {
      if (!team.clinchIndicator) return 'transparent';
      const clincher = team.clinchIndicator.toLowerCase();
      if (['z', 'y', 'x', 'xp', '*', 'cx'].includes(clincher)) return theme.success;
      if (clincher === 'e') return theme.error;
      return theme.textSecondary;
    };

    return (
      <TouchableOpacity
        key={`${team.id || team.abbreviation}-${index}`}
        style={[
          styles.teamRow, 
          { 
            backgroundColor: theme.surface,
            borderLeftWidth: team.clinchIndicator ? 4 : 0,
            borderLeftColor: getClinchBorderColor()
          }
        ]}
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
            {team.clinchIndicator && (
              <Text allowFontScaling={false} style={[
                styles.clinchText,
                { 
                  color: ['z', 'y', 'x', 'xp', '*', 'cx'].includes(team.clinchIndicator.toLowerCase()) ? theme.success :
                         ['e'].includes(team.clinchIndicator.toLowerCase()) ? theme.error :
                         theme.textSecondary
                }
              ]}>
                - {team.clinchIndicator.toUpperCase()}
              </Text>
            )}
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
              PPG: {team.ppg} | OPP: {team.oppPpg} | 
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

  // Helper to render the legend
  const renderLegend = () => {
    return (
      <View style={[styles.legendContainer, { backgroundColor: theme.surface }]}>
        <Text allowFontScaling={false} style={[styles.legendTitle, { color: theme.text }]}>
          Playoff Indicators
        </Text>
        <View style={styles.legendGrid}>
          <View style={styles.legendItem}>
            <View style={[styles.legendIndicator, { backgroundColor: theme.success }]} />
            <Text allowFontScaling={false} style={[styles.legendText, { color: theme.textSecondary }]}>
              * - Clinched Best League Record
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendIndicator, { backgroundColor: theme.success }]} />
            <Text allowFontScaling={false} style={[styles.legendText, { color: theme.textSecondary }]}>
              CX - Clinched Playoffs and Won Commissioner's Cup
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendIndicator, { backgroundColor: theme.success }]} />
            <Text allowFontScaling={false} style={[styles.legendText, { color: theme.textSecondary }]}>
              X - Clinched Playoffs
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendIndicator, { backgroundColor: theme.error }]} />
            <Text allowFontScaling={false} style={[styles.legendText, { color: theme.textSecondary }]}>
              E - Eliminated From Playoffs
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {Object.entries(standings).map(([conferenceName, divisions], conferenceIndex) => 
          renderConference(conferenceName, divisions, conferenceIndex)
        )}
        {renderLegend()}
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
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  legendContainer: {
    marginTop: 24,
    padding: 16,
    borderRadius: 8,
  },
  legendTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    marginBottom: 8,
  },
  legendIndicator: {
    width: 4,
    height: 16,
    marginRight: 8,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 12,
    flex: 1,
  },
});

export default WNBAStandingsScreen;
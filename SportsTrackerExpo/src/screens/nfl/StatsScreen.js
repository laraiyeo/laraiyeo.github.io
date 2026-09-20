import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';

// Helper function to convert HTTP URLs to HTTPS
const convertToHttps = (url) => {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
};

// NFL-specific year logic: July-December uses current year, otherwise previous year
const getNFLYear = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const month = now.getMonth(); // 0-based: 0=January, 6=July, 11=December
  
  // If current month is July (6) to December (11), use current year
  if (month >= 6) { // July to December
    return currentYear;
  }
  
  // Otherwise use previous year (January to June)
  return currentYear - 1;
};

const StatsScreen = ({ route }) => {
  const { sport } = route.params;
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const navigation = useNavigation();
  
  const [selectedType, setSelectedType] = useState('ATHLETES');
  const [playerStats, setPlayerStats] = useState({});
  const [teamStats, setTeamStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState({});
  
  // Cache flags to avoid refetching
  const [playerStatsLoaded, setPlayerStatsLoaded] = useState(false);
  const [teamStatsLoaded, setTeamStatsLoaded] = useState(false);

  const statTypes = [
    { key: 'ATHLETES', name: 'Athletes' },
    { key: 'TEAMS', name: 'Teams' }
  ];

  useEffect(() => {
    fetchStats();
  }, [selectedType]);

  const fetchStats = async () => {
    // Only show loading if we haven't cached the data yet
    const needsLoading = (selectedType === 'ATHLETES' && !playerStatsLoaded) || 
                         (selectedType === 'TEAMS' && !teamStatsLoaded);
    
    if (needsLoading) {
      setLoading(true);
    }
    
    try {
      if (selectedType === 'ATHLETES' && !playerStatsLoaded) {
        await fetchPlayerStats();
        setPlayerStatsLoaded(true);
      } else if (selectedType === 'TEAMS' && !teamStatsLoaded) {
        await fetchTeamStats();
        setTeamStatsLoaded(true);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      if (needsLoading) {
        setLoading(false);
      }
    }
  };

  const fetchPlayerStats = async () => {
    try {
      const currentYear = getNFLYear();
      const response = await fetch(`https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${currentYear}/types/2/leaders?limit=10`);
      const rawData = await response.json();
      
      // Validate that we have relevant data
      if (!(rawData && rawData.categories && rawData.categories.length > 0)) {
        throw new Error('No stats data found');
      }
      
      const data = rawData;
      
      if (data.categories) {
        // First, collect all unique athlete and team refs
        const athleteRefs = new Set();
        const teamRefs = new Set();
        
        data.categories.forEach(category => {
          category.leaders?.forEach(leader => {
            if (leader.athlete?.$ref) athleteRefs.add(leader.athlete.$ref);
            if (leader.team?.$ref) teamRefs.add(leader.team.$ref);
          });
        });

        // Fetch all athlete and team data in parallel
        const [athleteResults, teamResults] = await Promise.all([
          Promise.all(Array.from(athleteRefs).map(ref => {
            return fetch(convertToHttps(ref)).then(res => res.json()).catch(err => {
              console.warn('Failed to fetch athlete:', convertToHttps(ref), err);
              return null;
            });
          })),
          Promise.all(Array.from(teamRefs).map(ref => {
            return fetch(convertToHttps(ref)).then(res => res.json()).catch(err => {
              console.warn('Failed to fetch team:', convertToHttps(ref), err);
              return null;
            });
          }))
        ]);

        // Create lookup maps
        const athleteMap = new Map();
        const teamMap = new Map();
        
        Array.from(athleteRefs).forEach((ref, index) => {
          if (athleteResults[index]) {
            athleteMap.set(ref, athleteResults[index]);
          }
        });
        
        Array.from(teamRefs).forEach((ref, index) => {
          if (teamResults[index]) {
            teamMap.set(ref, teamResults[index]);
          }
        });

        // Process categories with resolved data
        const processedStats = {};
        data.categories.forEach(category => {
          const enrichedCategory = {
            ...category,
            leaders: category.leaders?.map(leader => ({
              ...leader,
              athleteData: leader.athlete?.$ref ? athleteMap.get(leader.athlete.$ref) : null,
              teamData: leader.team?.$ref ? teamMap.get(leader.team.$ref) : null
            })) || []
          };
          processedStats[category.name] = enrichedCategory;
        });
        
        setPlayerStats(processedStats);
      }
    } catch (error) {
      console.error('Error fetching player stats:', error);
    }
  };

  const fetchTeamStats = async () => {
    try {
      const response = await fetch('https://site.web.api.espn.com/apis/site/v3/sports/football/nfl/teamleaders');
      const data = await response.json();
      
      if (data.teamLeaders && data.teamLeaders.categories) {
        const processedStats = {};
        data.teamLeaders.categories.forEach(category => {
          processedStats[category.name] = category;
        });
        setTeamStats(processedStats);
      }
    } catch (error) {
      console.error('Error fetching team stats:', error);
    }
  };

  const getNFLTeamAbbreviation = (team) => {
    const teamMapping = {
      1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL',
      7: 'DEN', 8: 'DET', 9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC',
      13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO',
      19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC',
      25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WSH', 29: 'CAR', 30: 'JAX',
      33: 'BAL', 34: 'HOU'
    };

    if (team?.abbreviation) {
      return team.abbreviation;
    }
    
    const abbr = teamMapping[team?.id];
    if (abbr) {
      return abbr;
    }
    
    return team?.displayName?.substring(0, 3)?.toUpperCase() || 'NFL';
  };

  const resolveLeader = (leader) => {
    let teamAbbr;
    let displayName;
    let displayValue;
    let playerId;
    let teamData;
    let teamId;

    if (selectedType === 'ATHLETES') {
      teamData = leader.teamData;
      teamAbbr = getNFLTeamAbbreviation(teamData);
      displayName = leader.athleteData?.displayName || leader.athleteData?.fullName || 'Unknown Player';
      displayValue = leader.displayValue || leader.value;
      playerId = leader.athleteData?.id;
      teamId = teamData?.id;
    } else {
      teamData = leader.team;
      teamAbbr = getNFLTeamAbbreviation(teamData);
      displayName = teamData?.displayName || teamData?.name;
      displayValue = leader.displayValue || leader.value;
      teamId = teamData?.id;
    }

    return { teamAbbr, displayName, displayValue, playerId, teamData, teamId };
  };

  const getTeamColorHex = (teamData) => {
    const color = teamData?.color;
    if (!color) return colors.primary;
    const hex = String(color).replace('#', '');
    return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex}` : colors.primary;
  };

  const getHeadshotUrl = (playerId) =>
    `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${playerId}.png&w=200`;

  const navigateToLeader = (leader) => {
    const { playerId, teamId, displayName } = resolveLeader(leader);
    if (selectedType === 'ATHLETES') {
      navigation.navigate('PlayerPage', {
        playerId: playerId,
        sport: 'nfl',
      });
    } else {
      navigation.navigate('TeamPage', {
        teamId: teamId,
        teamName: displayName,
        sport: 'nfl',
      });
    }
  };

  const renderPodiumPlayer = (leader, rank, barHeight, barColor) => {
    const { teamAbbr, displayName, displayValue, playerId, teamData } = resolveLeader(leader);
    const teamColor = getTeamColorHex(teamData);
    const isFirst = rank === 1;

    return (
      <TouchableOpacity
        key={`podium-${playerId || teamData?.id || rank}`}
        style={styles.podiumPlayer}
        onPress={() => navigateToLeader(leader)}
        activeOpacity={0.7}
      >
        {/* Headshot / logo with team logo overlay (athletes only) */}
        <View style={styles.podiumHeadshotContainer}>
          {selectedType === 'ATHLETES' ? (
            <>
              <Image
                cachePolicy="memory-disk"
                source={{ uri: getHeadshotUrl(playerId) }}
                style={[
                  styles.podiumHeadshot,
                  { borderColor: teamColor },
                  isFirst && styles.podiumHeadshotFirst,
                ]}
                defaultSource={{ uri: 'https://via.placeholder.com/60x60?text=NFL' }}
              />
              <Image
                cachePolicy="memory-disk"
                source={{ uri: getTeamLogoUrl('nfl', teamAbbr) }}
                style={[
                  styles.podiumLogoOverlay,
                  { borderColor: teamColor },
                  isFirst && styles.podiumLogoOverlayFirst,
                ]}
              />
            </>
          ) : (
            <Image
              cachePolicy="memory-disk"
              source={{ uri: getTeamLogoUrl('nfl', teamAbbr) }}
              style={[
                styles.podiumTeamLogo,
                { borderColor: teamColor },
                isFirst && styles.podiumTeamLogoFirst,
              ]}
            />
          )}
        </View>

        {/* Name */}
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[styles.podiumName, { color: theme.text }, isFirst && styles.podiumNameFirst]}
        >
          {displayName}
        </Text>

        {/* Bar with value */}
        <View
          style={[
            styles.podiumBar,
            {
              height: barHeight,
              backgroundColor: barColor,
            },
            isFirst && styles.podiumBarFirst,
          ]}
        >
          <Text
            allowFontScaling={false}
            style={[styles.podiumBarValue, isFirst && styles.podiumBarValueFirst]}
          >
            {displayValue}
          </Text>
        </View>

        {/* Rank badge */}
        <View style={[styles.podiumRankBadge, { backgroundColor: barColor }]}>
          <Text allowFontScaling={false} style={styles.podiumRankText}>
            {rank}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderRemainingLeader = (leader, index) => {
    const { teamAbbr, displayName, displayValue, teamData } = resolveLeader(leader);

    return (
      <TouchableOpacity
        key={`remaining-${index}`}
        style={[styles.remainingRow, { borderBottomColor: theme.border }]}
        onPress={() => navigateToLeader(leader)}
        activeOpacity={0.7}
      >
        <Text
          allowFontScaling={false}
          style={[styles.remainingRank, { color: theme.textSecondary }]}
        >
          {index + 4}
        </Text>
        <Image
          cachePolicy="memory-disk"
          source={{ uri: getTeamLogoUrl('nfl', teamAbbr) }}
          style={styles.remainingTeamLogo}
        />
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[styles.remainingName, { color: theme.text }]}
        >
          {displayName}
        </Text>
        <Text
          allowFontScaling={false}
          style={[styles.remainingValue, { color: colors.primary }]}
        >
          {displayValue}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderCategory = (category) => {
    const leaders = category.leaders || [];
    if (leaders.length === 0) return null;

    const categoryKey = category.name;
    const podiumLeaders = leaders.slice(0, 3);
    const remainingLeaders = leaders.slice(3);
    const isExpanded = expandedCategories[categoryKey] || false;

    return (
      <View
        key={categoryKey}
        style={[styles.categoryContainer, { backgroundColor: theme.surface }]}
      >
        <Text allowFontScaling={false} style={[styles.categoryTitle, { color: colors.primary }]}>
          {(category.displayName || category.name)
  .replace(/-/g, ' ')
  .replace(/^./, (char) => char.toUpperCase())}
        </Text>

        {/* Podium */}
        <View style={styles.podiumContainer}>
          {/* 2nd Place - Left */}
          {podiumLeaders[1] && renderPodiumPlayer(podiumLeaders[1], 2, 70, '#C0C0C0')}

          {/* 1st Place - Center */}
          {podiumLeaders[0] && renderPodiumPlayer(podiumLeaders[0], 1, 100, '#FFD700')}

          {/* 3rd Place - Right */}
          {podiumLeaders[2] && renderPodiumPlayer(podiumLeaders[2], 3, 55, '#CD7F32')}
        </View>

        {/* Remaining leaders (expandable) */}
        {remainingLeaders.length > 0 && (
          <>
            <TouchableOpacity
              style={[styles.expandButton, { borderColor: colors.primary }]}
              onPress={() =>
                setExpandedCategories((prev) => ({
                  ...prev,
                  [categoryKey]: !prev[categoryKey],
                }))
              }
              activeOpacity={0.7}
            >
              <Text
                allowFontScaling={false}
                style={[styles.expandButtonText, { color: colors.primary }]}
              >
                {isExpanded
                  ? '▲ Collapse'
                  : `▼ Expand to view ${remainingLeaders.length} more`}
              </Text>
            </TouchableOpacity>

            {isExpanded && (
              <View style={styles.remainingContainer}>
                {remainingLeaders.map((leader, index) => renderRemainingLeader(leader, index))}
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading stats...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Type Selector */}
      <View style={[styles.leagueSelector, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        {statTypes.map(type => (
          <TouchableOpacity
            key={type.key}
            style={[
              styles.leagueButton,
              { 
                backgroundColor: selectedType === type.key ? colors.primary : 'transparent',
                borderColor: colors.primary
              }
            ]}
            onPress={() => setSelectedType(type.key)}
          >
            <Text allowFontScaling={false} style={[
              styles.leagueButtonText,
              { color: selectedType === type.key ? '#fff' : colors.primary }
            ]}>
              {type.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* NFL Statistics */}
        <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text, marginTop: -5 }]}>
          {selectedType === 'ATHLETES' ? 'Player Leaders' : 'Team Leaders'}
        </Text>
        
        {selectedType === 'ATHLETES' 
          ? Object.values(playerStats).map(category => renderCategory(category))
          : Object.values(teamStats).map(category => renderCategory(category))
        }
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
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  leagueSelector: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  leagueButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 80,
    alignItems: 'center',
  },
  leagueButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 16,
    textAlign: 'center',
  },
  categoryContainer: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },

  // ── Podium ──
  podiumContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingTop: 8,
    paddingBottom: 4,
  },
  podiumPlayer: {
    alignItems: 'center',
    marginHorizontal: 6,
    flex: 1,
    maxWidth: 110,
  },
  podiumHeadshotContainer: {
    position: 'relative',
    marginBottom: 6,
  },
  podiumHeadshot: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
  },
  podiumHeadshotFirst: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
  },
  podiumTeamLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
  },
  podiumTeamLogoFirst: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
  },
  podiumLogoOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    backgroundColor: '#ffffff42',
  },
  podiumLogoOverlayFirst: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  podiumName: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 6,
    maxWidth: 100,
  },
  podiumNameFirst: {
    fontSize: 13,
    fontWeight: '700',
  },
  podiumBar: {
    width: '100%',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 36,
  },
  podiumBarFirst: {
    borderRadius: 8,
  },
  podiumBarValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  podiumBarValueFirst: {
    fontSize: 20,
    color: '#5a4a00',
  },
  podiumRankBadge: {
    marginTop: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  podiumRankText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },

  // ── Expand / Collapse ──
  expandButton: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  expandButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  remainingContainer: {
    marginTop: 8,
  },
  remainingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  remainingRank: {
    fontSize: 13,
    fontWeight: '600',
    width: 28,
    textAlign: 'center',
  },
  remainingTeamLogo: {
    width: 20,
    height: 20,
    marginRight: 10,
  },
  remainingName: {
    flex: 1,
    fontSize: 14,
  },
  remainingValue: {
    fontSize: 16,
    fontWeight: 'bold',
    minWidth: 50,
    textAlign: 'right',
  },
});

export default StatsScreen;

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Modal,
  Dimensions,
  Alert,
} from 'react-native';
import { Ionicons, MaterialIcons, FontAwesome6 } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import VAL2DMapViewer from '../../../components/esports/val/VAL2DMapViewer';
import {
  fetchMatchDetails,
  fetchMatchSeries,
  processPlayerStats,
  processRoundEvents,
  processEconomyData,
  getTeamStats,
  getHalfTimeStats,
  calculateWinProbability
} from '../../../services/valorantMatchService';
import {
  getAgentDisplayName,
  getMapNameById,
  getMapDisplayName,
  getAgentImageUrl,
  getMapSampleUrl,
  getMapImageUrl,
  getWinConditionIcon,
  getAttackDefenseIcon
} from '../../../services/valorantSeriesService';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const VALMatchScreen = ({ navigation, route }) => {
  const { matchId, matchData } = route.params;
  const { colors, theme } = useTheme();
  
  const [match, setMatch] = useState(null);
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedRound, setSelectedRound] = useState(1);
  const [mapImageLoaded, setMapImageLoaded] = useState(false);
  const [mapImageError, setMapImageError] = useState(false);
  const [processedData, setProcessedData] = useState({
    playerStats: [],
    rounds: [],
    team1Stats: null,
    team2Stats: null,
    halfTimeStats: null,
    playersWithInfo: [],
    statsWithInfo: [],
    currentMatch: null,
    roundsWithInfo: []
  });

  // Create stable map name to prevent flickering
  const stableMapName = useMemo(() => {
    // Prioritize matchData.mapName as it's immediately available
    if (matchData?.mapName) {
      return matchData.mapName;
    }
    // Fall back to match data only if we have it and it's valid
    if (match?.map?.name) {
      return match.map.name;
    }
    return null;
  }, [matchData?.mapName, match?.map?.name]);

  // Reset and preload map image when stable map name changes
  useEffect(() => {
    if (stableMapName) {
      setMapImageLoaded(false);
      setMapImageError(false);
      
      // Create a unique URL with cache-busting parameter to avoid team logo cache conflicts
      const mapImageUrl = `${getMapImageUrl(stableMapName)}?type=map&name=${stableMapName}`;
      
      // Preload the image to prevent flickering
      Image.prefetch(mapImageUrl)
        .then(() => {
          setMapImageLoaded(true);
        })
        .catch(() => {
          setMapImageError(true);
        });
    }
  }, [stableMapName]);

  // Aggressively reset image cache when switching to events tab from economy
  useEffect(() => {
    if (activeTab === 'events' && stableMapName) {
      setMapImageLoaded(false);
      setMapImageError(false);
      
      // Clear any potential team logo cache conflicts
      setTimeout(() => {
        const mapImageUrl = `${getMapImageUrl(stableMapName)}?type=map&name=${stableMapName}&tab=events`;
        
        Image.prefetch(mapImageUrl)
          .then(() => {
            setMapImageLoaded(true);
          })
          .catch(() => {
            setMapImageError(true);
          });
      }, 100); // Slightly longer delay to ensure cache clearing
    }
  }, [activeTab, stableMapName]);

  useEffect(() => {
    loadMatchData();
  }, [matchId]);

  const loadMatchData = async () => {
    try {
      setLoading(true);
      
      // Fetch both match details and series data
      const [matchDetails, seriesData] = await Promise.all([
        fetchMatchDetails(matchId),
        fetchMatchSeries(matchId)
      ]);
      
      // Find the specific match in the series data
      const currentMatch = seriesData.matches?.find(match => match.id.toString() === matchId.toString());
      
      // Process the raw data
      const playerStats = processPlayerStats(matchDetails.playerStats);
      const rounds = processRoundEvents(matchDetails.events);
      const team1Stats = getTeamStats(playerStats, 1);
      const team2Stats = getTeamStats(playerStats, 2);
      const halfTimeStats = getHalfTimeStats(rounds);
      
      // Combine player info from series with stats from match details
      const playersWithInfo = matchDetails.playerStats?.map(stat => {
        // Find matching player from series data
        const seriesPlayer = currentMatch?.players?.find(p => p.playerId === stat.playerId) || 
                           seriesData.players?.find(p => p.playerId === stat.playerId);
        
        return {
          ...stat,
          ...seriesPlayer,
          displayName: seriesPlayer?.player?.ign || seriesPlayer?.playerName || 'Unknown',
          characterId: seriesPlayer?.agentId || seriesPlayer?.characterId
        };
      }) || [];
      
      const statsWithInfo = currentMatch?.stats || [];
      const roundsWithInfo = currentMatch?.rounds || [];
      
      setMatch(matchDetails);
      setSeries(seriesData);
      setProcessedData({
        playerStats,
        rounds,
        team1Stats,
        team2Stats,
        halfTimeStats,
        playersWithInfo,
        statsWithInfo,
        currentMatch,
        roundsWithInfo
      });
      
    } catch (error) {
      console.error('Error loading match data:', error);
      Alert.alert('Error', 'Failed to load match data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMatchData();
    setRefreshing(false);
  };

  // Calculate half time stats from rounds data
  const calculateHalfTimeStats = (rounds) => {
    if (!rounds || rounds.length === 0) return null;

    const firstHalf = rounds.filter(round => round.number <= 12);
    const secondHalf = rounds.filter(round => round.number >= 13 && round.number <= 24);
    const overtime = rounds.filter(round => round.number > 24);

    const getTeamWins = (roundsArray, teamNumber) => {
      return roundsArray.filter(round => 
        (round.winningTeamNumber === teamNumber) || (round.winner === teamNumber)
      ).length;
    };

    return {
      firstHalf: {
        team1: getTeamWins(firstHalf, 1),
        team2: getTeamWins(firstHalf, 2),
        total: firstHalf.length
      },
      secondHalf: {
        team1: getTeamWins(secondHalf, 1),
        team2: getTeamWins(secondHalf, 2), 
        total: secondHalf.length
      },
      overtime: overtime.length > 0 ? {
        team1: getTeamWins(overtime, 1),
        team2: getTeamWins(overtime, 2),
        total: overtime.length
      } : null,
      hasOvertime: overtime.length > 0
    };
  };

  const renderMatchHeader = () => {
    if (!matchData && !series) return null;

    // Use series data if available, otherwise fall back to matchData
    const team1 = series?.team1 || matchData?.team1;
    const team2 = series?.team2 || matchData?.team2;
    const team1Score = matchData?.team1Score || 0;
    const team2Score = matchData?.team2Score || 0;

    return (
      <View style={[styles.matchHeader, { backgroundColor: colors.card }]}>
        <View style={styles.matchHeaderContent}>
          {/* Map Background */}
          {stableMapName && (
            <Image
              source={{ uri: getMapSampleUrl(stableMapName) }}
              style={styles.mapBackground}
              resizeMode="cover"
            />
          )}
          <View style={styles.mapOverlay} />
          
          {/* Match Info */}
          <View style={styles.matchInfo}>
            <Text style={[styles.mapName, { color: '#fff' }]}>
              {stableMapName ? getMapDisplayName(stableMapName) : 'Loading...'}
            </Text>
            
            {/* Team Score */}
            <View style={styles.teamScoreContainer}>
              <View style={styles.teamSection}>
                <Image
                  source={{ uri: team1?.logoUrl }}
                  style={styles.teamLogo}
                  resizeMode="contain"
                />
                <Text style={[styles.teamName, { color: '#fff' }]}>
                  {team1?.shortName || team1?.name}
                </Text>
              </View>
              
              <View style={styles.scoreSection}>
                <Text style={[styles.finalScore, { color: '#fff' }]}>
                  {team1Score} - {team2Score}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(matchData?.status || 'COMPLETED') }]}>
                  <Text style={styles.statusText}>{matchData?.status || 'COMPLETED'}</Text>
                </View>
              </View>
              
              <View style={styles.teamSection}>
                <Image
                  source={{ uri: team2?.logoUrl }}
                  style={styles.teamLogo}
                  resizeMode="contain"
                />
                <Text style={[styles.teamName, { color: '#fff' }]}>
                  {team2?.shortName || team2?.name}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderTabNavigation = () => (
    <View style={[styles.tabContainer, { backgroundColor: colors.card }]}>
      {[
        { key: 'overview', label: 'Overview', icon: 'analytics' },
        { key: 'rounds', label: 'Events', icon: 'timer' },
        { key: 'economy', label: 'Economy', icon: 'cash' }
      ].map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[
            styles.tabButton,
            { backgroundColor: activeTab === tab.key ? colors.primary : 'transparent' }
          ]}
          onPress={() => setActiveTab(tab.key)}
        >
          <Ionicons 
            name={tab.icon} 
            size={16} 
            color={activeTab === tab.key ? '#fff' : theme.textSecondary} 
          />
          <Text style={[
            styles.tabText,
            { color: activeTab === tab.key ? '#fff' : theme.textSecondary }
          ]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderOverviewTab = () => (
    <View style={styles.contentContainer}>
      {/* Roster */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Roster</Text>
        <View style={styles.teamsContainer}>
          {/* Team 1 */}
          <View style={styles.leftTeamContainer}>
            <Text style={[styles.teamLabel, { color: theme.text }]}>
              {series?.team1?.shortName || 'Team 1'}
            </Text>
            <View style={styles.leftPlayersColumn}>
              {processedData.playersWithInfo
                ?.filter(player => player.teamNumber === 1)
                .slice(0, 5)
                .map((player, pIndex) => {
                  const agentName = getAgentDisplayName(player.agentId);
                  return (
                    <View key={pIndex} style={styles.leftPlayerItem}>
                      <Image
                        source={{ uri: getAgentImageUrl(agentName) }}
                        style={styles.agentImage}
                        resizeMode="cover"
                      />
                      <View style={styles.playerInfo}>
                        <Text style={[styles.playerName, { color: theme.text }]}>
                          {player.player?.ign || player.playerName}
                        </Text>
                        <Text style={[styles.agentName, { color: theme.textSecondary }]}>
                          {agentName}
                        </Text>
                        <Text style={[styles.playerStats, { color: theme.textSecondary }]}>
                          {parseFloat(player.rating || 0).toFixed(2)} • {player.kills || 0}/{player.deaths || 0}/{player.assists || 0}
                        </Text>
                      </View>
                    </View>
                  );
                })
              }
            </View>
          </View>
          
          {/* Team 2 */}
          <View style={styles.rightTeamContainer}>
            <Text style={[styles.teamLabel, { color: theme.text }]}>
              {series?.team2?.shortName || 'Team 2'}
            </Text>
            <View style={styles.rightPlayersColumn}>
              {processedData.playersWithInfo
                ?.filter(player => player.teamNumber === 2)
                .slice(0, 5)
                .map((player, pIndex) => {
                  const agentName = getAgentDisplayName(player.agentId);
                  return (
                    <View key={pIndex} style={styles.rightPlayerItem}>
                      <View style={styles.playerInfoRight}>
                        <Text style={[styles.playerName, { color: theme.text, textAlign: 'right' }]}>
                          {player.player?.ign || player.playerName}
                        </Text>
                        <Text style={[styles.agentName, { color: theme.textSecondary, textAlign: 'right' }]}>
                          {agentName}
                        </Text>
                        <Text style={[styles.playerStats, { color: theme.textSecondary, textAlign: 'right' }]}>
                          {parseFloat(player.rating || 0).toFixed(2)} • {player.kills || 0}/{player.deaths || 0}/{player.assists || 0}
                        </Text>
                      </View>
                      <Image
                        source={{ uri: getAgentImageUrl(agentName) }}
                        style={styles.agentImage}
                        resizeMode="cover"
                      />
                    </View>
                  );
                })
              }
            </View>
          </View>
        </View>
      </View>

      {/* Half Time Stats */}
      {(() => {
        const halfTimeStats = calculateHalfTimeStats(processedData.roundsWithInfo);
        return halfTimeStats && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Half Time Breakdown</Text>
            <View style={styles.halfTimeContainer}>
              <View style={styles.halfTimeRow}>
                <View style={[styles.halfCard, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.halfTitle, { color: theme.text }]}>First Half</Text>
                  <Text style={[styles.halfScore, { color: theme.text }]}>
                    {halfTimeStats.firstHalf.team1} - {halfTimeStats.firstHalf.team2}
                  </Text>
                </View>
                <View style={[styles.halfCard, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.halfTitle, { color: theme.text }]}>Second Half</Text>
                  <Text style={[styles.halfScore, { color: theme.text }]}>
                    {halfTimeStats.secondHalf.team1} - {halfTimeStats.secondHalf.team2}
                  </Text>
                </View>
              </View>
              {/* Overtime - Only if there are overtime rounds */}
              {halfTimeStats.hasOvertime && (
                <View style={[styles.overtimeCard, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.halfTitle, { color: theme.text }]}>Overtime</Text>
                  <Text style={[styles.halfScore, { color: theme.text }]}>
                    {halfTimeStats.overtime.team1} - {halfTimeStats.overtime.team2}
                  </Text>
                </View>
              )}
            </View>
          </View>
        );
      })()}
    </View>
  );

  // Helper functions for weapon, armor and agent mapping
  const getAgentImage = (agentId) => {
    // Use rib.gg agent images
    return `https://www.rib.gg/assets/agents/${agentId}.webp`;
  };

  const getWeaponImage = (weaponId) => {
    // Map weapon ID to weapon name based on id info.txt
    const weaponMapping = {
      1: 'spike',
      2: 'odin',
      3: 'ares',
      4: 'vandal',
      5: 'bulldog',
      6: 'phantom',
      7: 'classic npe',
      8: 'judge',
      9: 'bucky',
      10: 'frenzy',
      11: 'classic',
      12: 'ghost',
      13: 'sheriff',
      14: 'shorty',
      15: 'operator',
      16: 'guardian',
      17: 'marshal',
      18: 'spectre',
      19: 'stinger',
      20: 'melee',
      21: 'goldengun',
      23: 'outlaw',
    };
    
    const weaponName = weaponMapping[weaponId];
    return weaponName ? `https://www.rib.gg/assets/weapons/${weaponName}.png` : null;
  };

  const getArmorImage = (armorId) => {
    if (!armorId) return null;
    // Map armor ID to armor type based on id info.txt
    const armorMapping = {
      1: 'light',   // Light armor
      2: 'heavy',   // Heavy armor  
      3: 'regen',   // Regen armor
    };
    
    const armorType = armorMapping[armorId];
    return armorType ? `https://www.rib.gg/assets/match/${armorType}-shields.png` : null;
  };

  const getAbilityImage = (ability) => {
    if (!ability) return null;
    // Normalize ability name: lowercase and replace spaces with dashes
    const normalizedAbility = ability.toLowerCase().replace(/\s+/g, '-');
    return `https://www.rib.gg/assets/abilities/${normalizedAbility}.png`;
  };

  const renderTeamTable = (teamStats, teamInfo, teamNumber) => {
    return (
      <View style={styles.teamTableContainer}>
        {/* Team Header */}
        <View style={[styles.teamTableHeader, { backgroundColor: theme.surface }]}>
          <Image source={{ uri: teamInfo?.logoUrl }} style={styles.teamHeaderLogo} />
          <Text style={[styles.teamHeaderName, { color: theme.text }]}>{teamInfo?.name}</Text>
        </View>
        
        {/* Table Content */}
        <View style={styles.teamTable}>
          {teamStats.map((player, index) => (
            <View key={player.id} style={[styles.playerTableRow, { backgroundColor: index % 2 === 0 ? theme.surface : theme.surfaceSecondary }]}>
              {/* First Row: Agent, Player Name, K/A */}
              <View style={styles.playerFirstRow}>
                <View style={styles.playerLeftSection}>
                  <Image 
                    source={{ uri: getAgentImageUrl(getAgentDisplayName(player.agentId)) }} 
                    style={[styles.agentImageMedium, { opacity: player.economy.survived ? 1 : 0.3 }]}
                  />
                  <View style={styles.playerNameSection}>
                    <Text style={[styles.playerTableName, { 
                      color: player.economy.survived ? theme.text : theme.textSecondary 
                    }]}>
                      {player.ign}
                    </Text>
                    <Text style={[styles.playerHeadshot, { color: theme.textSecondary }]}>
                      {getAgentDisplayName(player.agentId)}
                    </Text>
                  </View>
                </View>
                {/* Action Icons - between player info and K/A */}
                <View style={styles.playerActionsContainer}>
                  {player.actions?.map((action, actionIndex) => (
                    <View key={actionIndex} style={[
                      styles.actionIcon, 
                      action.type === 'first' ? styles.actionIconWide : {},
                      { 
                        backgroundColor: action.type === 'first' ? '#e74c3c' : 
                                        action.type === 'ace' ? '#f39c12' :
                                        action.type === 'quad' ? '#e67e22' :
                                        action.type === 'triple' ? '#3498db' :
                                        action.type === 'double' ? '#27ae60' :
                                        action.type === 'plant' ? '#9b59b6' : '#34495e'
                      }
                    ]}>
                      {action.type === 'first' ? (
                        <View style={styles.actionWithIcon}>
                          <FontAwesome6 name="skull" size={10} color="white" />
                          <Text style={styles.actionIconText}>1st</Text>
                        </View>
                      ) : action.type === 'plant' ? (
                        <FontAwesome6 name="bomb" size={14} color="white" />
                      ) : action.type === 'defuse' ? (
                        <FontAwesome6 name="wrench" size={14} color="white" />
                      ) : (
                        <Text style={styles.actionIconText}>{action.text}</Text>
                      )}
                    </View>
                  ))}
                </View>
                <View style={styles.killAssistSection}>
                  <Text style={[styles.killAssistText, { color: theme.text }]}>
                    K • {player.kills} | A • {player.assists}
                  </Text>
                </View>
              </View>
              
              {/* Second Row: Armor, Weapon, Credits */}
              <View style={styles.playerSecondRow}>
                <View style={styles.equipmentSection}>
                  <View style={styles.armorSection}>
                    {player.economy?.armorId ? (
                      <Image 
                        source={{ uri: getArmorImage(player.economy.armorId) }} 
                        style={styles.equipmentImage}
                      />
                    ) : (
                      <View style={styles.equipmentPlaceholder}>
                        <Text style={[styles.equipmentPlaceholderText, { color: theme.textSecondary }]}>-</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.weaponSection}>
                    {player.economy?.weaponId ? (
                      <Image 
                        source={{ uri: getWeaponImage(player.economy.weaponId) }} 
                        style={styles.equipmentImage}
                      />
                    ) : (
                      <View style={styles.equipmentPlaceholder}>
                        <Text style={[styles.equipmentPlaceholderText, { color: theme.textSecondary }]}>-</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.economySection}>
                  <Text style={[styles.loadoutValue, { color: theme.text }]}>
                    ${player.economy?.loadoutValue || 0}
                  </Text>
                  <Text style={[styles.creditsInfo, { color: theme.textSecondary }]}>
                    Spent: ${player.economy?.spentCreds || 0} | Remaining: ${player.economy?.remainingCreds || 0}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderRoundTable = () => {
    if (!match?.economies || !selectedRound || !series) return null;

    // Get economy data for selected round
    const roundEconomies = match.economies.filter(eco => eco.roundNumber === selectedRound);
    
    // Find the current match in the series to get player data
    const currentMatch = series.matches?.find(m => m.id === match.id);
    if (!currentMatch?.players) return null;
    
    // Get team players from current match in series
    const team1Players = currentMatch.players.filter(p => p.teamNumber === 1);
    const team2Players = currentMatch.players.filter(p => p.teamNumber === 2);
    const allPlayers = [...team1Players, ...team2Players];

    // Calculate stats from events for this round
    const roundEvents = match.events?.filter(event => event.roundNumber === selectedRound) || [];
    const killEvents = roundEvents.filter(event => event.eventType === 'kill');
    const plantEvents = roundEvents.filter(event => event.eventType === 'plant');
    const defuseEvents = roundEvents.filter(event => event.eventType === 'defuse');
    
    // Find first kill
    const firstKill = killEvents.length > 0 ? killEvents[0] : null;
    
    const playerStats = allPlayers.map(playerData => {
      const playerEconomy = roundEconomies.find(eco => eco.playerId === playerData.playerId);
      
      // Count kills for this player
      const kills = killEvents.filter(event => event.playerId === playerData.playerId).length;
      
      // Count assists for this player
      const assists = killEvents.reduce((count, event) => {
        const hasAssist = event.assists?.some(assist => assist.assistantId === playerData.playerId);
        return count + (hasAssist ? 1 : 0);
      }, 0);
      
      // Check if player died this round
      const died = killEvents.some(event => event.victimId === playerData.playerId);

      // Calculate action icons
      const actions = [];
      
      // First kill
      if (firstKill && firstKill.playerId === playerData.playerId) {
        actions.push({ type: 'first', icon: 'skull', text: '1st' });
      }
      
      // Multi-kills
      if (kills >= 5) {
        actions.push({ type: 'ace', icon: 'star', text: 'ACE' });
      } else if (kills >= 4) {
        actions.push({ type: 'quad', icon: 'star', text: '4K' });
      } else if (kills >= 3) {
        actions.push({ type: 'triple', icon: 'star', text: '3K' });
      } else if (kills >= 2) {
        actions.push({ type: 'double', icon: 'star', text: '2K' });
      }
      
      // Plant
      if (plantEvents.some(event => event.playerId === playerData.playerId)) {
        actions.push({ type: 'plant', icon: 'radio-button-on', text: 'P' });
      }
      
      // Defuse
      if (defuseEvents.some(event => event.playerId === playerData.playerId)) {
        actions.push({ type: 'defuse', icon: 'build', text: 'D' });
      }

      return {
        id: playerData.playerId,
        ign: playerData.player.ign,
        agentId: playerData.agentId,
        teamNumber: playerData.teamNumber,
        economy: playerEconomy,
        kills,
        assists,
        survived: !died,
        actions,
        player: playerData.player
      };
    });

    const team1Stats = playerStats.filter(p => p.teamNumber === 1);
    const team2Stats = playerStats.filter(p => p.teamNumber === 2);

    return (
      <View style={styles.roundTableContainer}>
        <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 16 }]}>
          Round {selectedRound} Economy
        </Text>
        
        {/* Team 1 Table */}
        {renderTeamTable(team1Stats, series.team1, 1)}
        
        {/* Team 2 Table */}
        {renderTeamTable(team2Stats, series.team2, 2)}
      </View>
    );
  };

  const [timelinePosition, setTimelinePosition] = useState(0); // Keep in milliseconds

  const renderRoundsTab = () => {
    // Get events for selected round
    const roundEvents = match?.events?.filter(event => event.roundNumber === selectedRound) || [];
    
    // Keep raw millisecond values - each distinct event time gets its own button
    const eventTimesMs = roundEvents.map(event => event.roundTimeMillis);
    const minTimeMs = Math.min(0, ...eventTimesMs);
    // Calculate max time from actual events 
    const maxTimeMs = eventTimesMs.length > 0 ? Math.max(...eventTimesMs) : 120000;
    
    // Create sorted unique event times in milliseconds - NO grouping, each distinct time gets its own button
    const uniqueEventTimesMs = [...new Set(eventTimesMs)].sort((a, b) => a - b);
    if (uniqueEventTimesMs.length === 0) uniqueEventTimesMs.push(0);
    
    // Get events at current timeline position (exact millisecond time only)
    const currentEvents = roundEvents.filter(event => {
      return event.roundTimeMillis === timelinePosition;
    });
    
    // Filter for kill, plant, and defuse events and sort by time
    const relevantEvents = currentEvents
      .filter(event => ['kill', 'plant', 'defuse'].includes(event.eventType))
      .sort((a, b) => a.roundTimeMillis - b.roundTimeMillis);

    return (
      <View style={styles.contentContainer}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Events Timeline</Text>
        
        {/* Round Selection */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roundsScroll}>
          {processedData.roundsWithInfo?.map((round, index) => {
            const winCondition = round.winCondition || 'ELIMINATION';
            const winConditionIcon = getWinConditionIcon(winCondition);
            const winningTeam = round.winningTeamNumber || round.winner;
            
            return (
              <TouchableOpacity 
                key={index} 
                style={[
                  styles.roundCard, 
                  { 
                    backgroundColor: selectedRound === round.number ? colors.primary : theme.surface,
                    borderWidth: selectedRound === round.number ? 2 : 0,
                    borderColor: colors.primary
                  }
                ]}
                onPress={() => {
                  setSelectedRound(round.number);
                  setTimelinePosition(0); // Reset timeline when switching rounds
                }}
              >
                <Text style={[styles.roundNumber, { color: selectedRound === round.number ? '#fff' : theme.text }]}>Round {round.number}</Text>
                <View style={styles.roundWinnerSection}>
                  <Image
                    source={{ uri: winningTeam === 1 ? series?.team1?.logoUrl : series?.team2?.logoUrl }}
                    style={styles.roundWinnerLogo}
                    resizeMode="contain"
                  />
                  <View style={[
                    styles.roundWinner,
                    { backgroundColor: theme.surfaceSecondary }
                  ]}>
                    <View style={styles.winConditionContainer}>
                      <FontAwesome6 
                        name={winConditionIcon} 
                        size={12} 
                        color={theme.text} 
                        style={styles.winConditionIcon}
                      />
                      <Text style={[styles.roundWinnerText, { color: theme.text }]}>
                        {winCondition.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {selectedRound && (
          <View style={styles.timelineContainer}>
            {/* Horizontal Timeline Buttons */}
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              style={styles.timelineScroll}
              contentContainerStyle={styles.timelineScrollContent}
            >
              {uniqueEventTimesMs.map((timeMs, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.timeButton,
                    {
                      backgroundColor: timelinePosition === timeMs ? colors.primary : theme.surface,
                      borderColor: timelinePosition === timeMs ? colors.primary : theme.border,
                    }
                  ]}
                  onPress={() => setTimelinePosition(timeMs)}
                >
                  <Text style={[
                    styles.timeButtonText,
                    { color: timelinePosition === timeMs ? '#fff' : theme.text }
                  ]}>
                    {Math.floor(timeMs / 1000)}s
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            {/* Content Area */}
            <View style={styles.timelineContent}>
              {/* 2D Map Viewer */}
              <VAL2DMapViewer
                matchData={match}
                playersWithInfo={processedData.playersWithInfo}
                locations={match?.locations || []}
                selectedRound={selectedRound}
                selectedTime={timelinePosition}
                mapName={stableMapName}
              />

              {/* Kill Feed */}
              <View style={styles.killFeedContainer}>
                <Text style={[styles.killFeedTitle, { color: theme.text }]}>Events at {Math.floor(timelinePosition / 1000)}s</Text>
              <ScrollView style={styles.killFeedScroll}>
                {currentEvents.map((event, index) => {
                  // Handle different event types
                  if (event.eventType === 'kill') {
                    const killer = processedData.playersWithInfo?.find(p => p.playerId === event.playerId);
                    const victim = processedData.playersWithInfo?.find(p => p.playerId === event.referencePlayerId);
                    const assistants = event.assists?.map(assist => 
                      processedData.playersWithInfo?.find(p => p.playerId === assist.assistantId)
                    ).filter(Boolean) || [];

                    // Determine positioning: Team 1 always on left, Team 2 always on right
                    const isKillerTeam1 = killer?.teamNumber === 1;
                    const leftPlayer = isKillerTeam1 ? killer : victim;
                    const rightPlayer = isKillerTeam1 ? victim : killer;
                    const weaponFlipped = isKillerTeam1; // Flip weapon if killer is team 2

                    return (
                      <View key={index} style={[styles.killFeedItem, { backgroundColor: theme.surface }]}>
                        <View style={styles.killFeedMain}>
                          {/* Left Player */}
                          <View style={styles.killerSection}>
                            <Image
                              source={{ uri: getAgentImageUrl(getAgentDisplayName(leftPlayer?.characterId || leftPlayer?.agentId)) }}
                              style={[
                                styles.killFeedAgentImage,
                                !isKillerTeam1 && leftPlayer === victim && { opacity: 0.3 }
                              ]}
                            />
                            <Text style={[
                              styles.killFeedPlayerName, 
                              { 
                                color: theme.text,
                                opacity: !isKillerTeam1 && leftPlayer === victim ? 0.3 : 1
                              }
                            ]}>
                              {leftPlayer?.displayName || 'Unknown'}
                            </Text>
                          </View>

                          {/* Weapon or Ability */}
                          <View style={styles.weaponSection}>
                            {event.weaponId ? (
                              <Image
                                source={{ uri: getWeaponImage(event.weaponId) }}
                                style={[
                                  styles.killFeedWeaponImage,
                                  weaponFlipped && styles.weaponFlipped
                                ]}
                              />
                            ) : event.ability ? (
                              <Image
                                source={{ uri: getAbilityImage(event.ability) }}
                                style={[
                                  styles.killFeedWeaponImage,
                                  weaponFlipped && styles.weaponFlipped
                                ]}
                              />
                            ) : (
                              <View style={styles.killFeedWeaponPlaceholder}>
                                <Text style={[styles.killFeedWeaponText, { color: theme.textSecondary }]}>
                                  ?
                                </Text>
                              </View>
                            )}
                          </View>

                          {/* Right Player */}
                          <View style={styles.victimSection}>
                            <Text style={[
                              styles.killFeedPlayerName, 
                              { 
                                color: theme.text,
                                opacity: isKillerTeam1 && rightPlayer === victim ? 0.3 : 1
                              }
                            ]}>
                              {rightPlayer?.displayName || 'Unknown'}
                            </Text>
                            <Image
                              source={{ uri: getAgentImageUrl(getAgentDisplayName(rightPlayer?.characterId || rightPlayer?.agentId)) }}
                              style={[
                                styles.killFeedAgentImage,
                                isKillerTeam1 && rightPlayer === victim && { opacity: 0.3 }
                              ]}
                            />
                          </View>
                        </View>

                        {/* Assistants */}
                        {assistants && assistants.length > 0 && assistants.filter(Boolean).length > 0 && (
                          <View style={styles.assistantsSection}>
                            <Text style={[styles.assistLabel, { color: theme.textSecondary }]}>Assisted by:</Text>
                            <View style={styles.assistantsList}>
                              {assistants.filter(Boolean).map((assistant, assistIndex) => (
                                <Image
                                  key={assistIndex}
                                  source={{ uri: getAgentImageUrl(getAgentDisplayName(assistant?.characterId || assistant?.agentId)) }}
                                  style={styles.assistantAgentImage}
                                />
                              ))}
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  } else if (event.eventType === 'plant' || event.eventType === 'defuse') {
                    const player = processedData.playersWithInfo?.find(p => p.playerId === event.playerId);
                    const isPlant = event.eventType === 'plant';
                    
                    return (
                      <View key={index} style={[styles.killFeedItem, { backgroundColor: theme.surface }]}>
                        <View style={styles.bombEventMain}>
                          <Image
                            source={{ uri: getAgentImageUrl(getAgentDisplayName(player?.characterId || player?.agentId)) }}
                            style={styles.killFeedAgentImage}
                          />
                          <Text style={[styles.killFeedPlayerName, { color: theme.text }]}>
                            {player?.displayName || 'Unknown'}
                          </Text>
                          <View style={styles.bombIconSection}>
                            <Ionicons 
                              name={isPlant ? 'nuclear' : 'construct'} 
                              size={20} 
                              color={isPlant ? '#ff4444' : '#44ff44'} 
                            />
                            <Text style={[styles.bombActionText, { color: theme.text }]}>
                              {isPlant ? 'Planted' : 'Defused'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  }
                  
                  return null;
                })}
                
                {relevantEvents.length === 0 && (
                  <Text style={[styles.noEventsText, { color: theme.textSecondary }]}>
                    No events at this time
                  </Text>
                )}
              </ScrollView>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderEconomyTab = () => (
    <View style={styles.contentContainer}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Economy By Round</Text>
      
      {/* Round Slider */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roundsScroll}>
        {processedData.roundsWithInfo?.map((round, index) => {
          const winCondition = round.winCondition || 'ELIMINATION';
          const winConditionIcon = getWinConditionIcon(winCondition);
          const winningTeam = round.winningTeamNumber || round.winner;
          
          return (
            <TouchableOpacity 
              key={index} 
              style={[
                styles.roundCard, 
                { 
                  backgroundColor: selectedRound === round.number ? colors.primary : theme.surface,
                  borderWidth: selectedRound === round.number ? 2 : 0,
                  borderColor: colors.primary
                }
              ]}
              onPress={() => {
                setSelectedRound(round.number);
                setTimelinePosition(0); // Reset timeline when switching rounds
              }}
            >
              <Text style={[styles.roundNumber, { color: selectedRound === round.number ? '#fff' : theme.text }]}>Round {round.number}</Text>
              <View style={styles.roundWinnerSection}>
                <Image
                  source={{ 
                    uri: `${winningTeam === 1 ? series?.team1?.logoUrl : series?.team2?.logoUrl}?type=teamlogo&round=${round.number}`,
                    cache: 'force-cache'
                  }}
                  style={styles.roundWinnerLogo}
                  resizeMode="contain"
                />
                <View style={[
                  styles.roundWinner,
                  { backgroundColor: theme.surfaceSecondary }
                ]}>
                  <View style={styles.winConditionContainer}>
                    <FontAwesome6 
                      name={winConditionIcon} 
                      size={12} 
                      color={theme.text} 
                      style={styles.winConditionIcon}
                    />
                    <Text style={[styles.roundWinnerText, { color: selectedRound === round.number ? '#fff' : theme.text }]}>
                      {winCondition.toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {selectedRound ? renderRoundTable() : (
        <View style={styles.comingSoonContainer}>
          <Ionicons name="construct" size={48} color={theme.textSecondary} />
          <Text style={[styles.comingSoonText, { color: theme.textSecondary }]}>
            Select a round to view economy data
          </Text>
        </View>
      )}
    </View>
  );



  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'live':
      case 'ongoing':
        return theme.error;
      case 'completed':
      case 'finished':
        return theme.success;
      case 'upcoming':
      case 'scheduled':
        return theme.warning;
      default:
        return theme.surfaceSecondary;
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverviewTab();
      case 'rounds':
        return renderRoundsTab();
      case 'economy':
        return renderEconomyTab();
      default:
        return renderOverviewTab();
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: theme.text }]}>
            Loading match details...
          </Text>
        </View>
      </View>
    );
  }

  if (!match && !matchData) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color={theme.error} />
          <Text style={[styles.errorTitle, { color: theme.text }]}>Match Not Found</Text>
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>
            The requested match could not be loaded.
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={loadMatchData}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {renderMatchHeader()}
        {renderTabNavigation()}
        {renderContent()}
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
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
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  refreshButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  matchHeader: {
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  matchHeaderContent: {
    position: 'relative',
    height: 150,
  },
  mapBackground: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  mapOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  matchInfo: {
    marginTop: -5,
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  mapName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  teamScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  teamSection: {
    alignItems: 'center',
    flex: 1,
  },
  teamLogo: {
    width: 48,
    height: 48,
    marginBottom: 8,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  scoreSection: {
    alignItems: 'center',
    flex: 1,
  },
  finalScore: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  teamStatsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  teamStatCard: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
  },
  teamStatName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 14,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  halfTimeContainer: {
    gap: 12,
  },
  halfTimeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfCard: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  overtimeCard: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
    minWidth: 120,
    alignSelf: 'center',
  },
  halfTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  halfScore: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  teamPlayersSection: {
    marginBottom: 24,
  },
  teamTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  playerCard: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  agentImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  agentName: {
    fontSize: 12,
  },
  playerRating: {
    alignItems: 'center',
  },
  ratingValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  playerStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statColumn: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  roundsScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  roundCard: {
    width: 120,
    padding: 12,
    borderRadius: 8,
    marginRight: 12,
    alignItems: 'center',
  },
  roundNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  roundWinner: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: -4,
  },
  roundWinnerText: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  roundWinType: {
    fontSize: 10,
    textAlign: 'center',
  },
  comingSoonContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  comingSoonText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
  },
  // Roster styles
  teamsContainer: {
    flexDirection: 'row',
    flex: 1,
  },
  leftTeamContainer: {
    flex: 1,
    paddingRight: 8,
  },
  rightTeamContainer: {
    flex: 1,
    paddingLeft: 8,
  },
  teamLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  leftPlayersColumn: {
    alignItems: 'flex-start',
  },
  rightPlayersColumn: {
    alignItems: 'flex-end',
  },
  leftPlayerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  rightPlayerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  playerInfo: {
    marginLeft: 12,
  },
  playerInfoRight: {
    marginRight: 12,
  },
  agentImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  playerName: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  agentName: {
    fontSize: 12,
    fontWeight: '500',
  },
  playerStats: {
    fontSize: 11,
    fontWeight: '400',
    marginTop: 2,
  },
  // Round winner styles
  roundWinnerSection: {
    alignItems: 'center',
    marginBottom: 4,
  },
  roundWinnerLogo: {
    width: 24,
    height: 24,
    marginBottom: 4,
  },
  winConditionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  winConditionIcon: {
    marginRight: 4,
  },
  // Sliding table styles
  roundTableContainer: {
    marginTop: 24,
  },
  slidingTableContainer: {
    flexDirection: 'row',
    maxHeight: 400,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    overflow: 'hidden',
  },
  fixedColumn: {
    width: 160,
    borderRightWidth: 1,
    borderRightColor: '#333',
    backgroundColor: '#2c2c2c',
  },
  scrollableColumn: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  tableHeader: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  teamSection: {
    marginBottom: 0,
  },
  teamHeaderRow: {
    height: 35,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  teamLogoSmall: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  teamNameSmall: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  playerRow: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#444',
  },
  agentImageSmall: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginRight: 8,
  },
  playerNameSmall: {
    fontSize: 11,
    flex: 1,
  },
  playerActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  actionIcon: {
    width: 26,
    height: 26,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  actionIconWide: {
    width: 38,
    paddingHorizontal: 4,
  },
  actionIconText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: 'white',
  },
  actionWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  statsContent: {
    minWidth: 300,
    backgroundColor: '#1a1a1a',
  },
  statsHeaderRow: {
    flexDirection: 'row',
    height: 40,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  statHeaderCell: {
    width: 75,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 0.5,
    borderRightColor: '#444',
  },
  teamStatsSection: {
    marginBottom: 0,
  },
  teamStatsHeader: {
    height: 35,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  statsRow: {
    height: 30,
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#444',
  },
  statCell: {
    width: 75,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 0.5,
    borderRightColor: '#444',
  },
  statText: {
    fontSize: 11,
    fontWeight: '500',
  },
  weaponArmorImage: {
    width: 20,
    height: 16,
    resizeMode: 'contain',
  },
  // New team table styles
  teamTableContainer: {
    marginBottom: 24,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
  },
  teamTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  teamHeaderLogo: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  teamHeaderName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  teamTable: {
    // Container for all player rows
  },
  playerTableRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#444',
  },
  playerFirstRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  playerLeftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  agentImageMedium: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
  },
  playerNameSection: {
    flex: 1,
  },
  playerTableName: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  playerHeadshot: {
    fontSize: 12,
  },
  killAssistSection: {
    alignItems: 'flex-end',
  },
  killAssistText: {
    fontSize: 14,
    fontWeight: '600',
  },
  playerSecondRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  equipmentSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  armorSection: {
    marginRight: 16,
  },
  weaponSection: {
    marginRight: 16,
  },
  equipmentImage: {
    width: 32,
    height: 24,
    resizeMode: 'contain',
  },
  equipmentPlaceholder: {
    width: 32,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  equipmentPlaceholderText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  economySection: {
    alignItems: 'flex-end',
    flex: 1,
  },
  loadoutValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  creditsInfo: {
    fontSize: 12,
  },
  // Timeline styles
  timelineContainer: {
    marginTop: 24,
  },
  timelineScroll: {
    marginBottom: 16,
    maxHeight: 50,
  },
  timelineScrollContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  timeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    minWidth: 50,
    alignItems: 'center',
  },
  timeButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  timelineContent: {
    flex: 1,
  },
  mapContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
    aspectRatio: 1, // Maps are typically square
  },
  timelineMapImage: {
    width: '100%',
    height: undefined,
    aspectRatio: 1,
    resizeMode: 'cover',
  },
  mapPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  killFeedContainer: {
    maxHeight: 300,
  },
  killFeedTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  killFeedScroll: {
    maxHeight: 250,
  },
  killFeedItem: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  killFeedMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  killerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  victimSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  weaponSection: {
    alignItems: 'center',
    marginHorizontal: 16,
  },
  killFeedAgentImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginHorizontal: 6,
  },
  killFeedPlayerName: {
    fontSize: 14,
    fontWeight: '600',
  },
  killFeedWeaponImage: {
    width: 60,
    height: 30,
    resizeMode: 'contain',
  },
  weaponFlipped: {
    transform: [{ scaleX: -1 }],
  },
  killFeedWeaponPlaceholder: {
    width: 32,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  killFeedWeaponText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  assistantsSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
    flexDirection: 'row',
    alignItems: 'center',
  },
  assistLabel: {
    fontSize: 12,
    marginRight: 8,
    fontWeight: '500',
  },
  assistantsList: {
    flexDirection: 'row',
  },
  assistantAgentImage: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 6,
  },
  noEventsText: {
    textAlign: 'center',
    fontStyle: 'italic',
    padding: 20,
  },
  // Bomb event styles
  bombEventMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  bombIconSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
  },
  bombActionText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 16,
  },
});

export default VALMatchScreen;
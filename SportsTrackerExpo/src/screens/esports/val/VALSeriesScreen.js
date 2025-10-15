import React, { useState, useEffect } from 'react';
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
  Linking,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons, FontAwesome6 } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import {
  getSeriesDetails,
  getTeamsHeadToHead,
  formatSeriesData,
  getAgentDisplayName,
  getMapNameById,
  getMapDisplayName,
  getAgentImageUrl,
  getMapImageUrl,
  getMapSampleUrl,
  formatMatchData,
  processRoundData,
  calculateAttackDefenseStats,
  organizeRoundsByHalves,
  getWinConditionIcon,
  getAttackDefenseIcon
} from '../../../services/valorantSeriesService';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const VALSeriesScreen = ({ navigation, route }) => {
  const { seriesId, seriesData } = route.params;
  const { colors, theme } = useTheme();
  const [series, setSeries] = useState(null);
  const [headToHeadData, setHeadToHeadData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedGameIndex, setSelectedGameIndex] = useState(0);
  const [showRoundsModal, setShowRoundsModal] = useState(false);
  const [showPlayersModal, setShowPlayersModal] = useState(false);
  const [selectedModalGame, setSelectedModalGame] = useState(null);
  const [showVODModal, setShowVODModal] = useState(false);
  const [selectedVODUrl, setSelectedVODUrl] = useState(null);

  // Functions now imported from valorantSeriesService

  useEffect(() => {
    loadSeriesData();
  }, [seriesId]);

  const loadSeriesData = async () => {
    try {
      setLoading(true);
      
      // Always try to fetch real series data from rib.gg API first
      if (seriesId) {
        const rawSeriesData = await getSeriesDetails(seriesId);
        const formattedData = formatSeriesData(rawSeriesData);
        setSeries(formattedData);
        
        // Fetch head-to-head data if we have team IDs
        if (formattedData.team1?.id && formattedData.team2?.id) {
          try {
            const headToHead = await getTeamsHeadToHead(formattedData.team1.id, formattedData.team2.id);
            setHeadToHeadData(headToHead);
          } catch (headToHeadError) {
            console.error('Error loading head-to-head data:', headToHeadError);
            setHeadToHeadData(null);
          }
        }
      } else {
        throw new Error('No series ID provided');
      }
    } catch (error) {
      console.error('Error loading series data:', error);
      
      // Fallback to passed series data if API fails
      if (seriesData) {
        console.log('Using fallback series data');
        setSeries(seriesData);
      } else {
        // If no fallback data, show error
        setSeries(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSeriesData();
    setRefreshing(false);
  };

  const openRoundsModal = (gameIndex) => {
    setSelectedModalGame(gameIndex);
    setShowRoundsModal(true);
  };

  const openPlayersModal = (gameIndex) => {
    setSelectedModalGame(gameIndex);
    setShowPlayersModal(true);
  };

  const openVOD = (vodUrl) => {
    if (!vodUrl) return;
    
    // Convert YouTube watch URL to embed URL for better in-app experience
    let embedUrl = vodUrl;
    if (vodUrl.includes('youtube.com/watch?v=')) {
      const videoId = vodUrl.split('v=')[1].split('&')[0];
      embedUrl = `https://www.youtube.com/embed/${videoId}`;
    } else if (vodUrl.includes('youtu.be/')) {
      const videoId = vodUrl.split('youtu.be/')[1].split('?')[0];
      embedUrl = `https://www.youtube.com/embed/${videoId}`;
    }
    
    setSelectedVODUrl(embedUrl);
    setShowVODModal(true);
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading series details...
        </Text>
      </View>
    );
  }

  if (!series) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle-outline" size={64} color={theme.textTertiary} />
        <Text style={[styles.errorTitle, { color: theme.text }]}>
          Series Not Found
        </Text>
        <Text style={[styles.errorText, { color: theme.textSecondary }]}>
          The requested series could not be loaded.
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={loadSeriesData}
        >
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        {/* Series Header */}
        <View style={[styles.seriesHeader, { backgroundColor: theme.surfaceSecondary }]}>
          {/* Event Name */}
          <Text style={[styles.eventName, { color: theme.text }]}>
            {series.eventName || 'Match Details'}
          </Text>
          
          {/* Main Matchup Row */}
          <View style={styles.matchupRow}>
            {/* Team 1 Complete Section */}
            <View style={styles.teamCompleteSection}>
              {/* Logo and Score Row */}
              <View style={styles.logoScoreRow}>
                <Image
                  source={{ uri: series.team1?.logoUrl || 'https://i.imgur.com/BIC4pnO.webp' }}
                  style={[
                    styles.teamLogoHead,
                    { opacity: series.completed && series.team1Score < series.team2Score ? 0.6 : 1 }
                  ]}
                  resizeMode="contain"
                />
                <Text style={[
                  styles.scoreText, 
                  { 
                    color: theme.text,
                    opacity: series.completed && series.team1Score < series.team2Score ? 0.6 : 1
                  }
                ]}>
                  {series.team1Score || 0}
                </Text>
              </View>
              {/* Team Name Below */}
              <Text style={[
                styles.teamName, 
                { 
                  color: theme.text,
                  opacity: series.completed && series.team1Score < series.team2Score ? 0.6 : 1
                }
              ]}>
                {series.team1?.shortName || 'TBD'}
              </Text>
            </View>

            {/* Score Separator */}
            <Text style={[styles.scoreSeparator, { color: theme.textSecondary }]}>-</Text>

            {/* Team 2 Complete Section */}
            <View style={styles.teamCompleteSection}>
              {/* Score and Logo Row */}
              <View style={styles.logoScoreRow}>
                <Text style={[
                  styles.scoreText, 
                  { 
                    color: theme.text,
                    opacity: series.completed && series.team2Score < series.team1Score ? 0.6 : 1
                  }
                ]}>
                  {series.team2Score || 0}
                </Text>
                <Image
                  source={{ uri: series.team2?.logoUrl || 'https://i.imgur.com/BIC4pnO.webp' }}
                  style={[
                    styles.teamLogoHead,
                    { opacity: series.completed && series.team2Score < series.team1Score ? 0.6 : 1 }
                  ]}
                  resizeMode="contain"
                />
              </View>
              {/* Team Name Below */}
              <Text style={[
                styles.teamName, 
                { 
                  color: theme.text,
                  opacity: series.completed && series.team2Score < series.team1Score ? 0.6 : 1
                }
              ]}>
                {series.team2?.shortName || 'TBD'}
              </Text>
            </View>
          </View>
          
          {/* Status and Date */}
          <View style={styles.statusDateContainer}>
            {series.completed ? (
              <View style={[styles.statusBadge, { backgroundColor: theme.success }]}>
                <Text style={styles.statusText}>FINISHED</Text>
              </View>
            ) : series.live ? (
              <View style={[styles.statusBadge, { backgroundColor: theme.error }]}>
                <Text style={styles.statusText}>LIVE</Text>
              </View>
            ) : (
              <View style={[styles.statusBadge, { backgroundColor: theme.warning }]}>
                <Text style={styles.statusText}>SCHEDULED</Text>
              </View>
            )}
            
            {series.startDate && (
              <Text style={[styles.dateText, { color: theme.textSecondary }]}>
                {new Date(series.startDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })} • {new Date(series.startDate).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: 'numeric',
                  hour12: true
                })}
              </Text>
            )}
          </View>
        </View>

        {/* Tab Navigation */}
        <View style={[styles.tabContainer, { backgroundColor: theme.surface }]}>
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'overview' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }
            ]}
            onPress={() => setActiveTab('overview')}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === 'overview' ? colors.primary : theme.textSecondary }
            ]}>
              Overview
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'stats' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }
            ]}
            onPress={() => setActiveTab('stats')}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === 'stats' ? colors.primary : theme.textSecondary }
            ]}>
              Stats
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <View style={styles.contentContainer}>
            {/* Game Details Section */}
            <View style={styles.gameDetailsSection}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Game details
              </Text>
              
              {series.matches && series.matches.length > 0 && (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.gameScrollView}
                  contentContainerStyle={styles.gameScrollContent}
                >
                  {series.matches
                    .filter(match => match.map?.name) // Only render if map name exists
                    .map((match, index) => {
                    const mapName = getMapDisplayName(match.map?.name);
                    const team1Won = match.team1Score > match.team2Score;
                    const team2Won = match.team2Score > match.team1Score;
                    
                    return (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.gameCard,
                          { backgroundColor: theme.surface }
                        ]}
                        onPress={() => {
                          setSelectedGameIndex(index);
                          // Navigate to match details screen
                          navigation.navigate('VALMatch', {
                            matchId: match.matchId || match.id,
                            matchData: {
                              mapName: match.map?.name,
                              team1: series.team1,
                              team2: series.team2,
                              team1Score: match.team1Score,
                              team2Score: match.team2Score,
                              status: match.completed ? 'COMPLETED' : (match.live ? 'LIVE' : 'SCHEDULED'),
                              players: match.players
                            }
                          });
                        }}
                      >
                        {/* SECTION 1: Header */}
                        <View style={[styles.headerSection, { backgroundColor: theme.surface }]}>
                          <Text style={[styles.gameTitle, { color: theme.text }]}>
                            Game {index + 1}
                          </Text>
                          {match.completed ? (
                            <View style={[styles.gameStatus, { backgroundColor: theme.success }]}>
                              <Text style={styles.gameStatusText}>FINISHED</Text>
                            </View>
                          ) : match.live ? (
                            <View style={[styles.gameStatus, { backgroundColor: theme.error }]}>
                              <Text style={styles.gameStatusText}>LIVE</Text>
                            </View>
                          ) : (
                            <View style={[styles.gameStatus, { backgroundColor: theme.warning }]}>
                              <Text style={styles.gameStatusText}>SCHEDULED</Text>
                            </View>
                          )}
                        </View>

                        {/* SECTION 2: Map & Score */}
                        <View style={styles.mapScoreSection}>
                          {/* Map Background */}
                          <Image
                            source={{ uri: getMapSampleUrl(mapName) }}
                            style={styles.mapBackground}
                            resizeMode="cover"
                          />
                          
                          {/* Map Overlay */}
                          <View style={styles.mapOverlay} />
                          
                          {/* Score Content */}
                          <View style={styles.scoreContent}>
                            <View style={styles.teamScoreContainer}>
                              <Image
                                source={{ uri: series.team1?.logoUrl }}
                                style={[
                                  styles.teamLogo,
                                  { opacity: match.completed && !team1Won ? 0.6 : 1 }
                                ]}
                                resizeMode="contain"
                              />
                              <Text style={[
                                styles.gameScoreText, 
                                { 
                                  color: 'white',
                                  opacity: match.completed && !team1Won ? 0.6 : 1
                                }
                              ]}>
                                {match.team1Score || 0}
                              </Text>
                            </View>
                            
                            <View style={styles.mapNameContainer}>
                              <Text style={[styles.mapName, { color: 'white' }]}>
                                {mapName}
                              </Text>
                            </View>
                            
                            <View style={styles.teamScoreContainer}>
                              <Text style={[
                                styles.gameScoreText, 
                                { 
                                  color: 'white',
                                  opacity: match.completed && !team2Won ? 0.6 : 1
                                }
                              ]}>
                                {match.team2Score || 0}
                              </Text>
                              <Image
                                source={{ uri: series.team2?.logoUrl }}
                                style={[
                                  styles.teamLogo,
                                  { opacity: match.completed && !team2Won ? 0.6 : 1 }
                                ]}
                                resizeMode="contain"
                              />
                            </View>
                          </View>
                        </View>

                        {/* SECTION 3: Players */}
                        <View style={[styles.playersSection, { backgroundColor: theme.surface }]}>
                          {match.players && (
                            <>
                              {/* Teams Side by Side */}
                              <View style={styles.teamsContainer}>
                                {/* Team 1 - Left Side */}
                                <View style={styles.leftTeamContainer}>
                                  <Text style={[styles.teamLabel, { color: theme.text }]}>
                                    {series.team1?.shortName || 'Team 1'}
                                  </Text>
                                  <View style={styles.leftPlayersColumn}>
                                    {match.players
                                      .filter(player => player.teamNumber === 1)
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
                                                {player.player?.ign}
                                              </Text>
                                              <Text style={[styles.agentName, { color: theme.textSecondary }]}>
                                                {agentName}
                                              </Text>
                                            </View>
                                          </View>
                                        );
                                      })
                                    }
                                  </View>
                                </View>
                                
                                {/* Team 2 - Right Side */}
                                <View style={styles.rightTeamContainer}>
                                  <Text style={[styles.teamLabel, { color: theme.text }]}>
                                    {series.team2?.shortName || 'Team 2'}
                                  </Text>
                                  <View style={styles.rightPlayersColumn}>
                                    {match.players
                                      .filter(player => player.teamNumber === 2)
                                      .slice(0, 5)
                                      .map((player, pIndex) => {
                                        const agentName = getAgentDisplayName(player.agentId);
                                        return (
                                          <View key={pIndex} style={styles.rightPlayerItem}>
                                            <View style={styles.playerInfoRight}>
                                              <Text style={[styles.playerName, { color: theme.text, textAlign: 'right' }]}>
                                                {player.player?.ign}
                                              </Text>
                                              <Text style={[styles.agentName, { color: theme.textSecondary, textAlign: 'right' }]}>
                                                {agentName}
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

                              {/* Action Buttons */}
                              <View style={styles.gameActions}>
                                <TouchableOpacity
                                  style={[styles.actionButton, { backgroundColor: colors.primary }]}
                                  onPress={() => openRoundsModal(index)}
                                >
                                  <Text style={styles.actionButtonText}>Rounds</Text>
                                </TouchableOpacity>
                                
                                <TouchableOpacity
                                  style={[styles.actionButton, { backgroundColor: colors.primary }]}
                                  onPress={() => openPlayersModal(index)}
                                >
                                  <Text style={styles.actionButtonText}>Players</Text>
                                </TouchableOpacity>
                              </View>
                            </>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {/* Maps Section */}
            {series.pickban && series.pickban.length > 0 && (
              <View style={styles.mapsSection}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Maps
                </Text>
                
                <View style={styles.mapsGrid}>
                  {series.pickban.map((pickban, index) => {
                    const mapName = getMapNameById(pickban.mapId);
                    const isPick = pickban.type === 'pick';
                    const isBan = pickban.type === 'ban';
                    const isLeftover = pickban.isLeftover;
                    
                    // Get team info - ensure type comparison works correctly
                    const team = (pickban.teamId == series.team1?.id) ? series.team1 : series.team2;
                    const teamName = team?.shortName || 'Unknown';
                    
                    // Determine display text
                    let displayText;
                    if (isLeftover) {
                      displayText = 'Decider';
                    } else {
                      displayText = `${teamName} - ${isPick ? 'PICK' : 'BAN'}`;
                    }
                    
                    return (
                      <View
                        key={index}
                        style={[
                          styles.mapCard,
                          { backgroundColor: theme.surface },
                          isBan && !isLeftover && { opacity: 0.6 }
                        ]}
                      >
                        <Image
                          source={{ uri: getMapSampleUrl(mapName) }}
                          style={styles.mapImage}
                          resizeMode="cover"
                        />
                        
                        {/* Ban overlay - only on the image */}
                        {isBan && !isLeftover && (
                          <View style={styles.mapBanImageOverlay}>
                            <Ionicons
                              name="close"
                              size={40}
                              color="rgba(255, 255, 255, 0.9)"
                              style={styles.banIcon}
                            />
                          </View>
                        )}
                        
                        <View style={styles.mapCardOverlay}>
                          <Text style={[styles.mapCardName, { color: 'white' }]}>
                            {mapName}
                          </Text>
                          
                          <View style={[
                            styles.mapTypeBadge,
                            { 
                              backgroundColor: isLeftover 
                                ? theme.warning 
                                : isPick 
                                  ? theme.success 
                                  : theme.error 
                            }
                          ]}>
                            <Text style={[styles.mapTypeText, { color: 'white' }]}>
                              {displayText}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* VODs Section */}
            {series.matches && series.matches.filter(match => match.vodUrl).length > 0 && (
              <View style={styles.vodsSection}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  VODs
                </Text>
                
                <View style={styles.vodsContainer}>
                  {series.matches
                    .filter(match => match.vodUrl)
                    .map((match, index) => {
                      const mapName = getMapDisplayName(match.map?.name);
                      return (
                        <TouchableOpacity
                          key={index}
                          style={[styles.vodButton, { backgroundColor: theme.surface }]}
                          onPress={() => openVOD(match.vodUrl)}
                          activeOpacity={0.7}
                        >
                          <Image
                            source={{
                              uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/YouTube_play_button_icon_%282013%E2%80%932017%29.svg/2560px-YouTube_play_button_icon_%282013%E2%80%932017%29.svg.png'
                            }}
                            style={styles.youtubeIcon}
                            resizeMode="contain"
                          />
                          <Text style={[styles.vodButtonText, { color: theme.text }]}>
                            VOD - {mapName}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                </View>
              </View>
            )}
          </View>
        )}

        {activeTab === 'stats' && (
          <View style={styles.contentContainer}>
            {headToHeadData ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Head-to-Head Record */}
                {headToHeadData.previousMatchupSeries && headToHeadData.previousMatchupSeries.length > 0 && (
                  <View style={styles.statsSection}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>
                      Head-to-Head Record
                    </Text>
                    
                    {/* Overall Record */}
                    <View style={[styles.recordCard, { backgroundColor: theme.surface }]}>
                      <View style={styles.recordStats}>
                        <View style={styles.teamRecord}>
                          <Text style={[styles.teamRecordName, { color: theme.text }]}>
                            {series.team1?.shortName}
                          </Text>
                          <View style={styles.teamRecordScoreRow}>
                            <Image
                              source={{ uri: series.team1?.logoUrl }}
                              style={styles.recordTeamLogo}
                              resizeMode="contain"
                            />
                            <Text style={[styles.teamRecordScore, { color: theme.text }]}>
                              {headToHeadData.previousMatchupSeries.filter(s => 
                                (s.team1Id === series.team1?.id && s.team1Score > s.team2Score) ||
                                (s.team2Id === series.team1?.id && s.team2Score > s.team1Score)
                              ).length}
                            </Text>
                          </View>
                        </View>
                        
                        <Text style={[styles.recordSeparator, { color: theme.textSecondary }]}>-</Text>
                        
                        <View style={styles.teamRecord}>
                          <Text style={[styles.teamRecordName, { color: theme.text }]}>
                            {series.team2?.shortName}
                          </Text>
                          <View style={styles.teamRecordScoreRow}>
                            <Text style={[styles.teamRecordScore, { color: theme.text }]}>
                              {headToHeadData.previousMatchupSeries.filter(s => 
                                (s.team1Id === series.team2?.id && s.team1Score > s.team2Score) ||
                                (s.team2Id === series.team2?.id && s.team2Score > s.team1Score)
                              ).length}
                            </Text>
                            <Image
                              source={{ uri: series.team2?.logoUrl }}
                              style={styles.recordTeamLogo}
                              resizeMode="contain"
                            />
                          </View>
                        </View>
                      </View>
                      
                      <Text style={[styles.recordSubtext, { color: theme.textSecondary }]}>
                        Last {headToHeadData.previousMatchupSeries.length} matches
                      </Text>
                    </View>

                    {/* Recent Matches */}
                    <View style={styles.recentMatches}>
                      <Text style={[styles.subsectionTitle, { color: theme.text }]}>
                        Recent Matches
                      </Text>
                      {headToHeadData.previousMatchupSeries.slice(0, 5).map((match, index) => {
                        const team1Won = (match.team1Id === series.team1?.id && match.team1Score > match.team2Score) ||
                                        (match.team2Id === series.team1?.id && match.team2Score > match.team1Score);
                        const team2Won = !team1Won;
                        
                        return (
                          <TouchableOpacity 
                            key={match.id} 
                            style={[styles.matchHistoryItem, { backgroundColor: theme.surfaceSecondary }]}
                            onPress={() => navigation.push('VALSeries', { 
                              seriesId: match.id, 
                              seriesData: match 
                            })}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.matchHistoryEvent, { color: theme.textSecondary }]}>
                              {match.eventName}
                            </Text>
                            <View style={styles.matchHistoryContent}>
                              <View style={styles.matchHistoryTeams}>
                                <View style={styles.matchHistoryTeamLeft}>
                                  <Image
                                    source={{ uri: series.team1?.logoUrl }}
                                    style={[styles.matchHistoryLogo, { opacity: team1Won ? 1 : 0.6 }]}
                                    resizeMode="contain"
                                  />
                                  <Text style={[
                                    styles.matchHistoryTeamName, 
                                    { color: theme.text, opacity: team1Won ? 1 : 0.6 }
                                  ]}>
                                    {series.team1?.shortName}
                                  </Text>
                                </View>
                                
                                <View style={styles.matchHistoryScore}>
                                  <Text style={[styles.matchHistoryScoreText, { color: team1Won ? theme.text : theme.textSecondary }]}>
                                    {match.team1Id === series.team1?.id ? match.team1Score : match.team2Score}
                                  </Text>
                                  <Text style={[styles.matchHistoryScoreSep, { color: theme.textSecondary }]}>-</Text>
                                  <Text style={[styles.matchHistoryScoreText, { color: team2Won ? theme.text : theme.textSecondary }]}>
                                    {match.team1Id === series.team1?.id ? match.team2Score : match.team1Score}
                                  </Text>
                                </View>
                                
                                <View style={styles.matchHistoryTeamRight}>
                                  <Image
                                    source={{ uri: series.team2?.logoUrl }}
                                    style={[styles.matchHistoryLogoRight, { opacity: team2Won ? 1 : 0.6 }]}
                                    resizeMode="contain"
                                  />
                                  <Text style={[
                                    styles.matchHistoryTeamName, 
                                    { color: theme.text, opacity: team2Won ? 1 : 0.6 }
                                  ]}>
                                    {series.team2?.shortName}
                                  </Text>
                                </View>
                              </View>
                              
                              <Text style={[styles.matchHistoryDate, { color: theme.textSecondary }]}>
                                {new Date(match.startDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Map Success Rates */}
                {headToHeadData.mapSuccess && headToHeadData.mapSuccess.length > 0 && (
                  <View style={styles.statsSection}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>
                      Map Performance
                    </Text>
                    
                    <View style={styles.mapStatsGrid}>
                      {headToHeadData.mapSuccess.map((mapData, index) => {
                        const team1WinRate = mapData.team1.matchesPlayed > 0 
                          ? ((mapData.team1.matchesWon / mapData.team1.matchesPlayed) * 100).toFixed(0)
                          : 0;
                        const team2WinRate = mapData.team2.matchesPlayed > 0 
                          ? ((mapData.team2.matchesWon / mapData.team2.matchesPlayed) * 100).toFixed(0)
                          : 0;
                          
                        return (
                          <View key={mapData.mapId} style={styles.mapStatCard}>
                            <Image
                              source={{ uri: getMapSampleUrl(mapData.mapName) }}
                              style={styles.mapStatBackground}
                              resizeMode="cover"
                            />
                            <View style={styles.mapStatOverlay} />
                            <View style={styles.mapStatContent}>
                              <Text style={[styles.mapStatName, { color: 'white' }]}>
                                {mapData.mapName}
                              </Text>
                              
                              <View style={styles.mapStatTeams}>
                                <View style={styles.mapStatTeam}>
                                  <Text style={[styles.mapStatTeamName, { color: 'white' }]}>
                                    {series.team1?.shortName}
                                  </Text>
                                  <Text style={[styles.mapStatWinRate, { color: 'white' }]}>
                                    {team1WinRate}%
                                  </Text>
                                  <Text style={[styles.mapStatRecord, { color: 'rgba(255,255,255,0.8)' }]}>
                                    {mapData.team1.matchesWon}W {mapData.team1.matchesPlayed - mapData.team1.matchesWon}L
                                  </Text>
                                </View>
                                
                                <View style={styles.mapStatDivider} />
                                
                                <View style={styles.mapStatTeam}>
                                  <Text style={[styles.mapStatTeamName, { color: 'white' }]}>
                                    {series.team2?.shortName}
                                  </Text>
                                  <Text style={[styles.mapStatWinRate, { color: 'white' }]}>
                                    {team2WinRate}%
                                  </Text>
                                  <Text style={[styles.mapStatRecord, { color: 'rgba(255,255,255,0.8)' }]}>
                                    {mapData.team2.matchesWon}W {mapData.team2.matchesPlayed - mapData.team2.matchesWon}L
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Recent Form - Team 1 */}
                {headToHeadData.team1Series && headToHeadData.team1Series.length > 0 && (
                  <View style={styles.statsSection}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>
                      {series.team1?.shortName} Recent Form
                    </Text>
                    
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentFormScroll}>
                      {headToHeadData.team1Series.slice(0, 5).map((match, index) => {
                        const isTeam1 = match.team1Id === series.team1?.id;
                        const teamScore = isTeam1 ? match.team1Score : match.team2Score;
                        const opponentScore = isTeam1 ? match.team2Score : match.team1Score;
                        const won = teamScore > opponentScore;
                        const opponent = isTeam1 ? match.team2 : match.team1;
                        
                        return (
                          <TouchableOpacity 
                            key={match.id} 
                            style={[styles.recentFormGameCard, { backgroundColor: theme.surface }]}
                            onPress={() => navigation.push('VALSeries', { 
                              seriesId: match.id, 
                              seriesData: match 
                            })}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.formResultBadge, { backgroundColor: won ? theme.success : theme.error }]}>
                              <Text style={styles.formResultText}>{won ? 'W' : 'L'}</Text>
                            </View>
                            
                            <View style={styles.formGameContent}>
                              <Text style={[styles.formEventName, { color: theme.textSecondary }]} numberOfLines={1}>
                                {match.eventChildLabel}
                              </Text>
                              
                              <View style={styles.formMatchup}>
                                <Image
                                  source={{ uri: series.team1?.logoUrl }}
                                  style={styles.formTeamLogo}
                                  resizeMode="contain"
                                />
                                <View style={styles.formScoreContainer}>
                                  <Text style={[styles.formScore, { color: theme.text }]}>
                                    {teamScore} - {opponentScore}
                                  </Text>
                                </View>
                                <Image
                                  source={{ uri: opponent?.logoUrl || 'https://i.imgur.com/BIC4pnO.webp' }}
                                  style={styles.formTeamLogo}
                                  resizeMode="contain"
                                />
                              </View>
                              
                              <Text style={[styles.formDate, { color: theme.textSecondary }]}>
                                {new Date(match.startDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* Recent Form - Team 2 */}
                {headToHeadData.team2Series && headToHeadData.team2Series.length > 0 && (
                  <View style={styles.statsSection}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>
                      {series.team2?.shortName} Recent Form
                    </Text>
                    
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentFormScroll}>
                      {headToHeadData.team2Series.slice(0, 5).map((match, index) => {
                        const isTeam1 = match.team1Id === series.team2?.id;
                        const teamScore = isTeam1 ? match.team1Score : match.team2Score;
                        const opponentScore = isTeam1 ? match.team2Score : match.team1Score;
                        const won = teamScore > opponentScore;
                        const opponent = isTeam1 ? match.team2 : match.team1;
                        
                        return (
                          <TouchableOpacity 
                            key={match.id} 
                            style={[styles.recentFormGameCard, { backgroundColor: theme.surface }]}
                            onPress={() => navigation.push('VALSeries', { 
                              seriesId: match.id, 
                              seriesData: match 
                            })}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.formResultBadge, { backgroundColor: won ? theme.success : theme.error }]}>
                              <Text style={styles.formResultText}>{won ? 'W' : 'L'}</Text>
                            </View>
                            
                            <View style={styles.formGameContent}>
                              <Text style={[styles.formEventName, { color: theme.textSecondary }]} numberOfLines={1}>
                                {match.eventChildLabel}
                              </Text>
                              
                              <View style={styles.formMatchup}>
                                <Image
                                  source={{ uri: series.team2?.logoUrl }}
                                  style={styles.formTeamLogo}
                                  resizeMode="contain"
                                />
                                <View style={styles.formScoreContainer}>
                                  <Text style={[styles.formScore, { color: theme.text }]}>
                                    {teamScore} - {opponentScore}
                                  </Text>
                                </View>
                                <Image
                                  source={{ uri: opponent?.logoUrl || 'https://i.imgur.com/BIC4pnO.webp' }}
                                  style={styles.formTeamLogo}
                                  resizeMode="contain"
                                />
                              </View>
                              
                              <Text style={[styles.formDate, { color: theme.textSecondary }]}>
                                {new Date(match.startDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </ScrollView>
            ) : (
              <View style={styles.comingSoonContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.comingSoonText, { color: theme.textSecondary }]}>
                  Loading team statistics...
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Rounds Modal */}
      <Modal
        visible={showRoundsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRoundsModal(false)}
      >
        <View style={styles.halfModalContainer}>
          <TouchableOpacity 
            style={styles.modalBackgroundOverlay}
            activeOpacity={1}
            onPress={() => setShowRoundsModal(false)}
          />
          <View 
            style={[styles.modalContent, { backgroundColor: theme.background }]}
          >
            {selectedModalGame !== null && series.matches && series.matches[selectedModalGame] ? (() => {
              const match = series.matches[selectedModalGame];
              const matchId = match.id;
              const attackDefenseStats = calculateAttackDefenseStats(series.stats?.rounds || [], matchId);
              const roundsByHalves = organizeRoundsByHalves(series.stats?.rounds || [], matchId);
              const mapName = getMapDisplayName(match.map.name);
              
              return (
                <View style={styles.roundsModalContainer}>
                  {/* Fixed Header with Map Background */}
                  <View style={styles.roundsFloatingHeader}>
                    <Image
                      source={{ uri: getMapSampleUrl(mapName) }}
                      style={styles.roundsMapBackground}
                      resizeMode="cover"
                    />
                    <View style={styles.roundsMapOverlay} />
                    
                    {/* Team Info and Stats */}
                    <View style={styles.roundsTeamStatsContainer}>
                      {/* Team 1 */}
                      <View style={styles.roundsTeamSection}>
                        <Image
                          source={{ uri: series.team1?.logoUrl }}
                          style={styles.roundsTeamLogo}
                          resizeMode="contain"
                        />
                        <Text style={styles.roundsTeamName}>{series.team1?.shortName || series.team1?.name}</Text>
                        <View style={styles.roundsAttackDefenseStats}>
                          <View style={styles.roundsStatItem}>
                            <FontAwesome6 name="gun" size={12} color="white" />
                            <Text style={styles.roundsStatText}>{attackDefenseStats.team1.attack}</Text>
                          </View>
                          <View style={styles.roundsStatItem}>
                            <FontAwesome6 name="shield-halved" size={12} color="white" />
                            <Text style={styles.roundsStatText}>{attackDefenseStats.team1.defense}</Text>
                          </View>
                        </View>
                      </View>
                      
                      {/* Map Name and Score */}
                      <View style={styles.roundsMapScoreSection}>
                        <Text style={styles.roundsMapName}>{mapName}</Text>
                        <Text style={styles.roundsFinalScore}>
                          {match.team1Score} - {match.team2Score}
                        </Text>
                      </View>
                      
                      {/* Team 2 */}
                      <View style={styles.roundsTeamSection}>
                        <Image
                          source={{ uri: series.team2?.logoUrl }}
                          style={styles.roundsTeamLogo}
                          resizeMode="contain"
                        />
                        <Text style={styles.roundsTeamName}>{series.team2?.shortName || series.team2?.name}</Text>
                        <View style={styles.roundsAttackDefenseStats}>
                          <View style={styles.roundsStatItem}>
                            <FontAwesome6 name="gun" size={12} color="white" />
                            <Text style={styles.roundsStatText}>{attackDefenseStats.team2.attack}</Text>
                          </View>
                          <View style={styles.roundsStatItem}>
                            <FontAwesome6 name="shield-halved" size={12} color="white" />
                            <Text style={styles.roundsStatText}>{attackDefenseStats.team2.defense}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                  
                  {/* Scrollable Rounds Content */}
                  <ScrollView style={styles.roundsScrollableContent} showsVerticalScrollIndicator={false}>
                    {/* First Half */}
                    {roundsByHalves.firstHalf.length > 0 && (
                      <View style={styles.roundsHalfSection}>
                        <Text style={[styles.roundsHalfTitle, { color: theme.text }]}>1st Half</Text>
                        <View style={styles.liquipediaRoundsContainer}>
                          {/* Team Logos - Properly Aligned */}
                          <View style={styles.fixedTeamLogosStack}>
                            <View style={styles.roundNumberSpace} />
                            <View style={styles.teamLogoAligned}>
                              <Image
                                source={{ uri: series.team1?.logoUrl }}
                                style={styles.roundsRowTeamLogo}
                                resizeMode="contain"
                              />
                            </View>
                            <View style={styles.teamLogoAligned}>
                              <Image
                                source={{ uri: series.team2?.logoUrl }}
                                style={styles.roundsRowTeamLogo}
                                resizeMode="contain"
                              />
                            </View>
                          </View>
                          
                          {/* Scrollable Rounds Section */}
                          <ScrollView 
                            horizontal 
                            style={styles.roundsHorizontalScroll}
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.roundsHorizontalContent}
                          >
                            {roundsByHalves.firstHalf.map((round, index) => (
                              <View key={round.id} style={styles.liquipediaRoundColumn}>
                                <Text style={[styles.roundCardNumber, { color: theme.text }]}>{round.number}</Text>
                                
                                {/* Team 1 Round (Top) */}
                                <View style={[
                                  styles.liquipediaRoundIndicator,
                                  { 
                                    backgroundColor: round.winningTeamNumber === 1 
                                      ? (round.attackingTeamNumber === 1 ? theme.error : theme.success)
                                      : 'rgba(255,255,255,0.1)',
                                  }
                                ]}>
                                  {round.winningTeamNumber === 1 && (
                                    <FontAwesome6 
                                      name={getWinConditionIcon(round.winCondition)} 
                                      size={12} 
                                      color="white" 
                                    />
                                  )}
                                </View>
                                
                                {/* Team 2 Round (Bottom) */}
                                <View style={[
                                  styles.liquipediaRoundIndicator,
                                  { 
                                    backgroundColor: round.winningTeamNumber === 2 
                                      ? (round.attackingTeamNumber === 2 ? theme.error : theme.success)
                                      : 'rgba(255,255,255,0.1)',
                                  }
                                ]}>
                                  {round.winningTeamNumber === 2 && (
                                    <FontAwesome6 
                                      name={getWinConditionIcon(round.winCondition)} 
                                      size={12} 
                                      color="white" 
                                    />
                                  )}
                                </View>
                              </View>
                            ))}
                          </ScrollView>
                        </View>
                      </View>
                    )}
                    
                    {/* Second Half */}
                    {roundsByHalves.secondHalf.length > 0 && (
                      <View style={styles.roundsHalfSection}>
                        <Text style={[styles.roundsHalfTitle, { color: theme.text }]}>2nd Half</Text>
                        <View style={styles.liquipediaRoundsContainer}>
                          {/* Team Logos - Properly Aligned */}
                          <View style={styles.fixedTeamLogosStack}>
                            <View style={styles.roundNumberSpace} />
                            <View style={styles.teamLogoAligned}>
                              <Image
                                source={{ uri: series.team1?.logoUrl }}
                                style={styles.roundsRowTeamLogo}
                                resizeMode="contain"
                              />
                            </View>
                            <View style={styles.teamLogoAligned}>
                              <Image
                                source={{ uri: series.team2?.logoUrl }}
                                style={styles.roundsRowTeamLogo}
                                resizeMode="contain"
                              />
                            </View>
                          </View>
                          
                          {/* Scrollable Rounds Section */}
                          <ScrollView 
                            horizontal 
                            style={styles.roundsHorizontalScroll}
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.roundsHorizontalContent}
                          >
                            {roundsByHalves.secondHalf.map((round, index) => (
                              <View key={round.id} style={styles.liquipediaRoundColumn}>
                                <Text style={[styles.roundCardNumber, { color: theme.text }]}>{round.number}</Text>
                                
                                {/* Team 1 Round (Top) */}
                                <View style={[
                                  styles.liquipediaRoundIndicator,
                                  { 
                                    backgroundColor: round.winningTeamNumber === 1 
                                      ? (round.attackingTeamNumber === 1 ? theme.error : theme.success)
                                      : 'rgba(255,255,255,0.1)',
                                  }
                                ]}>
                                  {round.winningTeamNumber === 1 && (
                                    <FontAwesome6 
                                      name={getWinConditionIcon(round.winCondition)} 
                                      size={12} 
                                      color="white" 
                                    />
                                  )}
                                </View>
                                
                                {/* Team 2 Round (Bottom) */}
                                <View style={[
                                  styles.liquipediaRoundIndicator,
                                  { 
                                    backgroundColor: round.winningTeamNumber === 2 
                                      ? (round.attackingTeamNumber === 2 ? theme.error : theme.success)
                                      : 'rgba(255,255,255,0.1)',
                                  }
                                ]}>
                                  {round.winningTeamNumber === 2 && (
                                    <FontAwesome6 
                                      name={getWinConditionIcon(round.winCondition)} 
                                      size={12} 
                                      color="white" 
                                    />
                                  )}
                                </View>
                              </View>
                            ))}
                          </ScrollView>
                        </View>
                      </View>
                    )}
                    
                    {/* Overtime */}
                    {roundsByHalves.overtime.length > 0 && (
                      <View style={styles.roundsHalfSection}>
                        <Text style={[styles.roundsHalfTitle, { color: theme.text }]}>Overtime</Text>
                        <View style={styles.liquipediaRoundsContainer}>
                          {/* Team Logos - Properly Aligned */}
                          <View style={styles.fixedTeamLogosStack}>
                            <View style={styles.roundNumberSpace} />
                            <View style={styles.teamLogoAligned}>
                              <Image
                                source={{ uri: series.team1?.logoUrl }}
                                style={styles.roundsRowTeamLogo}
                                resizeMode="contain"
                              />
                            </View>
                            <View style={styles.teamLogoAligned}>
                              <Image
                                source={{ uri: series.team2?.logoUrl }}
                                style={styles.roundsRowTeamLogo}
                                resizeMode="contain"
                              />
                            </View>
                          </View>
                          
                          {/* Scrollable Rounds Section */}
                          <ScrollView 
                            horizontal 
                            style={styles.roundsHorizontalScroll}
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.roundsHorizontalContent}
                          >
                            {roundsByHalves.overtime.map((round, index) => (
                              <View key={round.id} style={styles.liquipediaRoundColumn}>
                                <Text style={[styles.roundCardNumber, { color: theme.text }]}>{round.number}</Text>
                                
                                {/* Team 1 Round (Top) */}
                                <View style={[
                                  styles.liquipediaRoundIndicator,
                                  { 
                                    backgroundColor: round.winningTeamNumber === 1 
                                      ? (round.attackingTeamNumber === 1 ? theme.error : theme.success)
                                      : 'rgba(255,255,255,0.1)',
                                  }
                                ]}>
                                  {round.winningTeamNumber === 1 && (
                                    <FontAwesome6 
                                      name={getWinConditionIcon(round.winCondition)} 
                                      size={12} 
                                      color="white" 
                                    />
                                  )}
                                </View>
                                
                                {/* Team 2 Round (Bottom) */}
                                <View style={[
                                  styles.liquipediaRoundIndicator,
                                  { 
                                    backgroundColor: round.winningTeamNumber === 2 
                                      ? (round.attackingTeamNumber === 2 ? theme.error : theme.success)
                                      : 'rgba(255,255,255,0.1)',
                                  }
                                ]}>
                                  {round.winningTeamNumber === 2 && (
                                    <FontAwesome6 
                                      name={getWinConditionIcon(round.winCondition)} 
                                      size={12} 
                                      color="white" 
                                    />
                                  )}
                                </View>
                              </View>
                            ))}
                          </ScrollView>
                        </View>
                      </View>
                    )}
                    
                    {/* No Rounds Available */}
                    {roundsByHalves.firstHalf.length === 0 && roundsByHalves.secondHalf.length === 0 && roundsByHalves.overtime.length === 0 && (
                      <View style={styles.noRoundsContainer}>
                        <Text style={[styles.noDataText, { color: theme.textSecondary }]}>
                          Round details not available for this match
                        </Text>
                      </View>
                    )}
                    
                    {/* Add bottom padding for scrolling */}
                    <View style={{ height: 20 }} />
                  </ScrollView>
                </View>
              );
            })() : (
              <View style={styles.noDataContainer}>
                <TouchableOpacity
                  style={styles.roundsCloseButton}
                  onPress={() => setShowRoundsModal(false)}
                >
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.noDataText, { color: theme.textSecondary }]}>
                  No match selected
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Players Modal */}
      <Modal
        visible={showPlayersModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPlayersModal(false)}
      >
        <View style={styles.halfModalContainer}>
          <TouchableOpacity 
            style={styles.modalBackgroundOverlay}
            activeOpacity={1}
            onPress={() => setShowPlayersModal(false)}
          />
          <View 
            style={[styles.modalContent, { backgroundColor: theme.background }]}
          >
            {selectedModalGame !== null && series.matches && series.matches[selectedModalGame] ? (() => {
              const match = series.matches[selectedModalGame];
              const matchId = match.id;
              const mapName = getMapDisplayName(match.map.name);
              
              // Get players from match.players array (same as main view)
              const team1Players = match.players?.filter(player => player.teamNumber === 1) || [];
              const team2Players = match.players?.filter(player => player.teamNumber === 2) || [];
              
              return (
                <View style={styles.playersModalContainer}>
                  {/* Fixed Header with Map Background - Same as Rounds Modal */}
                  <View style={styles.roundsFloatingHeader}>
                    <Image
                      source={{ uri: getMapSampleUrl(mapName) }}
                      style={styles.roundsMapBackground}
                      resizeMode="cover"
                    />
                    <View style={styles.roundsMapOverlay} />
                    
                    {/* Team Info and Stats */}
                    <View style={styles.roundsTeamStatsContainer}>
                      {/* Team 1 */}
                      <View style={styles.roundsTeamSection}>
                        <Image
                          source={{ uri: series.team1?.logoUrl }}
                          style={styles.roundsTeamLogo}
                          resizeMode="contain"
                        />
                        <Text style={styles.roundsTeamName}>{series.team1?.shortName || series.team1?.name}</Text>
                      </View>
                      
                      {/* Map Name and Score */}
                      <View style={styles.roundsMapScoreSection}>
                        <Text style={styles.roundsMapName}>{mapName}</Text>
                        <Text style={styles.roundsFinalScore}>
                          {match.team1Score} - {match.team2Score}
                        </Text>
                      </View>
                      
                      {/* Team 2 */}
                      <View style={styles.roundsTeamSection}>
                        <Image
                          source={{ uri: series.team2?.logoUrl }}
                          style={styles.roundsTeamLogo}
                          resizeMode="contain"
                        />
                        <Text style={styles.roundsTeamName}>{series.team2?.shortName || series.team2?.name}</Text>
                      </View>
                    </View>
                  </View>
                  
                  {/* Scrollable Players Content */}
                  <ScrollView style={styles.playersScrollableContent} showsVerticalScrollIndicator={false}>
                    <View style={styles.playersMainSection}>
                      <View style={styles.teamsContainer}>
                        {/* Left Team Container - Team 1 */}
                        <View style={styles.leftTeamContainer}>
                          <Text style={[styles.teamLabel, { color: theme.text }]}>
                            {series.team1?.shortName || series.team1?.name}
                          </Text>
                          <View style={styles.leftPlayersColumn}>
                            {team1Players.slice(0, 5).map((player, index) => {
                              // Aggregate player stats from all rounds for this match
                              const playerRoundStats = series.playerStats?.filter(stat => 
                                stat.matchId === matchId && stat.playerId === player.playerId
                              ) || [];
                              
                              const aggregatedStats = playerRoundStats.reduce((acc, stat) => ({
                                kills: acc.kills + (stat.kills || 0),
                                deaths: acc.deaths + (stat.deaths || 0),
                                assists: acc.assists + (stat.assists || 0),
                                acs: acc.acs + (stat.acs || 0),
                                damage: acc.damage + (stat.damage || 0)
                              }), { kills: 0, deaths: 0, assists: 0, acs: 0, damage: 0 });
                              
                              // Calculate rating (simplified ACS-based rating)
                              const avgAcs = playerRoundStats.length > 0 ? aggregatedStats.acs / playerRoundStats.length : 0;
                              const rating = (avgAcs / 100).toFixed(2);
                              const agentName = getAgentDisplayName(player.agentId);
                              
                              return (
                                <View key={player.playerId} style={styles.leftPlayerItem}>
                                  <Image
                                    source={{ uri: getAgentImageUrl(agentName) }}
                                    style={styles.agentImage}
                                    resizeMode="cover"
                                  />
                                  <View style={styles.playerInfo}>
                                    <Text style={[styles.playerName, { color: theme.text }]}>
                                      {player.player?.ign || 'Unknown'}
                                    </Text>
                                    <Text style={[styles.playerStats, { color: theme.textSecondary }]}>
                                      {rating} | {aggregatedStats.kills}/{aggregatedStats.deaths}/{aggregatedStats.assists}
                                    </Text>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        </View>
                        
                        {/* Right Team Container - Team 2 */}
                        <View style={styles.rightTeamContainer}>
                          <Text style={[styles.teamLabel, { color: theme.text }]}>
                            {series.team2?.shortName || series.team2?.name}
                          </Text>
                          <View style={styles.rightPlayersColumn}>
                            {team2Players.slice(0, 5).map((player, index) => {
                              // Aggregate player stats from all rounds for this match
                              const playerRoundStats = series.playerStats?.filter(stat => 
                                stat.matchId === matchId && stat.playerId === player.playerId
                              ) || [];
                              
                              const aggregatedStats = playerRoundStats.reduce((acc, stat) => ({
                                kills: acc.kills + (stat.kills || 0),
                                deaths: acc.deaths + (stat.deaths || 0),
                                assists: acc.assists + (stat.assists || 0),
                                acs: acc.acs + (stat.acs || 0),
                                damage: acc.damage + (stat.damage || 0)
                              }), { kills: 0, deaths: 0, assists: 0, acs: 0, damage: 0 });
                              
                              // Calculate rating (simplified ACS-based rating)
                              const avgAcs = playerRoundStats.length > 0 ? aggregatedStats.acs / playerRoundStats.length : 0;
                              const rating = (avgAcs / 100).toFixed(2);
                              const agentName = getAgentDisplayName(player.agentId);
                              
                              return (
                                <View key={player.playerId} style={styles.rightPlayerItem}>
                                  <View style={styles.playerInfoRight}>
                                    <Text style={[styles.playerName, { color: theme.text }]}>
                                      {player.player?.ign || 'Unknown'}
                                    </Text>
                                    <Text style={[styles.playerStats, { color: theme.textSecondary }]}>
                                      {rating} | {aggregatedStats.kills}/{aggregatedStats.deaths}/{aggregatedStats.assists}
                                    </Text>
                                  </View>
                                  <Image
                                    source={{ uri: getAgentImageUrl(agentName) }}
                                    style={styles.agentImage}
                                    resizeMode="cover"
                                  />
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      </View>
                    </View>
                    
                    {/* No Players Available */}
                    {team1Players.length === 0 && team2Players.length === 0 && (
                      <View style={styles.noRoundsContainer}>
                        <Text style={[styles.noDataText, { color: theme.textSecondary }]}>
                          Player stats not available for this match
                        </Text>
                      </View>
                    )}
                    
                    {/* Add bottom padding for scrolling */}
                    <View style={{ height: 20 }} />
                  </ScrollView>
                </View>
              );
            })() : (
              <View style={styles.noDataContainer}>
                <TouchableOpacity
                  style={styles.roundsCloseButton}
                  onPress={() => setShowPlayersModal(false)}
                >
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.noDataText, { color: theme.textSecondary }]}>
                  No match selected
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* VOD Modal */}
      <Modal
        visible={showVODModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowVODModal(false)}
      >
        <View style={styles.vodModalContainer}>
          <View style={styles.vodModalContent}>
            <View style={[styles.vodModalHeader, { backgroundColor: theme.surface }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                VOD Player
              </Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowVODModal(false)}
              >
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            
            {selectedVODUrl && (
              <WebView
                source={{ uri: selectedVODUrl }}
                style={styles.vodWebView}
                allowsFullscreenVideo={true}
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                renderLoading={() => (
                  <View style={styles.vodLoadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.vodLoadingText, { color: theme.text }]}>
                      Loading VOD...
                    </Text>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
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
  seriesHeader: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 15,
    marginBottom: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  eventName: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  matchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -40,
  },
  teamCompleteSection: {
    alignItems: 'center',
    flex: 1,
  },
  logoScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamLogoHead: {
    width: 64,
    height: 64,
    marginHorizontal: 18,
  },
  scoreText: {
    fontSize: 32,
    fontWeight: 'bold',
    minWidth: 40,
    textAlign: 'center',
  },
  scoreSeparator: {
    fontSize: 24,
    marginHorizontal: 16,
    alignSelf: 'flex-start',
    marginTop: 16,
  },
  teamName: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  statusDateContainer: {
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  dateText: {
    fontSize: 14,
    textAlign: 'center',
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
    paddingVertical: 16,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
  },
  contentContainer: {
    paddingHorizontal: 16,
  },
  gameDetailsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  gameScrollView: {
    marginHorizontal: -16,
  },
  gameScrollContent: {
    paddingHorizontal: 16,
  },
  gameCard: {
    width: 340,
    minHeight: 400,
    borderRadius: 12,
    marginRight: 12,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  // SECTION 1: Header
  headerSection: {
    height: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  // SECTION 2: Map & Score
  mapScoreSection: {
    height: 100,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  mapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  scoreContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
    zIndex: 1,
  },
  mapNameContainer: {
    flex: 1,
    alignItems: 'center',
  },
  gameTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  gameStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  gameStatusText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  teamScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamLogo: {
    width: 32,
    height: 32,
    marginHorizontal: 12,
  },
  gameScoreText: {
    fontSize: 26,
    fontWeight: 'bold',
    color: 'white',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  mapName: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    color: 'white',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  gameActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 8,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // SECTION 3: Players
  playersSection: {
    flex: 1,
    padding: 12,
    paddingBottom: 0,
    minHeight: 200,
  },
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
  mapsSection: {
    marginBottom: 24,
  },
  mapsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  mapCard: {
    width: '48%',
    height: 120,
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  mapCardOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.76)',
    padding: 8,
  },
  mapCardName: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  mapTypeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  mapTypeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  mapBanImageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 60,
    backgroundColor: 'rgba(255, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  banIcon: {
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
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
  vodsSection: {
    marginBottom: 24,
  },
  vodsContainer: {
    gap: 12,
  },
  vodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  youtubeIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  vodButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  vodModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vodModalContent: {
    width: '95%',
    height: '80%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  vodModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  vodWebView: {
    flex: 1,
  },
  vodLoadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  vodLoadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  modalContainer: {
    flex: 1,
  },
  halfModalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0)',
  },
  modalBackgroundOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    height: screenHeight * 0.65,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    padding: 8,
  },
  modalScrollContent: {
    flex: 1,
    padding: 16,
  },
  modalSubtitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalScore: {
    fontSize: 14,
    marginBottom: 16,
  },
  roundsContainer: {
    flex: 1,
  },
  roundsList: {
    marginTop: 16,
  },
  roundItem: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  roundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  roundNumber: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  roundWinner: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  roundWinnerText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  roundWinType: {
    fontSize: 12,
  },
  playersContainer: {
    flex: 1,
  },
  playersList: {
    marginTop: 16,
  },
  teamSection: {
    marginBottom: 24,
  },
  teamName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  playerItem: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  playerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  playerName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  playerAgent: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  playerStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statText: {
    fontSize: 12,
  },
  noDataText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 32,
  },
  // Rounds Modal Styles
  roundsModalContainer: {
    flex: 1,
  },
  roundsFloatingHeader: {
    height: 120,
    position: 'relative',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  roundsMapBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  roundsMapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  roundsCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 3,
  },
  roundsTeamStatsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    zIndex: 2,
  },
  roundsTeamSection: {
    alignItems: 'center',
    flex: 1,
  },
  roundsTeamLogo: {
    width: 32,
    height: 32,
    marginBottom: 4,
  },
  roundsTeamName: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  roundsAttackDefenseStats: {
    flexDirection: 'row',
    gap: 12,
  },
  roundsStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roundsStatText: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  roundsMapScoreSection: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 16,
  },
  roundsMapName: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  roundsFinalScore: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  roundsScrollableContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  roundsHalfSection: {
    marginTop: 20,
    marginBottom: 16,
  },
  roundsHalfTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  liquipediaRoundsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    minHeight: 80,
  },
  fixedTeamLogosStack: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  roundNumberSpace: {
    height: 24,
    marginBottom: 6,
  },
  teamLogoAligned: {
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 3,
  },
  roundsRowTeamLogo: {
    width: 28,
    height: 28,
  },
  roundsHorizontalScroll: {
    flex: 1,
    marginHorizontal: 8,
  },
  roundsHorizontalContent: {
    paddingHorizontal: 4,
    minWidth: screenWidth - 100,
  },
  liquipediaRoundColumn: {
    alignItems: 'center',
    marginHorizontal: 3,
    minWidth: 32,
  },
  roundCardNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  liquipediaRoundIndicator: {
    width: 28,
    height: 20,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 3,
  },
  noRoundsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  noDataContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  // Players Modal Styles
  playersModalContainer: {
    flex: 1,
  },
  playersScrollableContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  playersMainSection: {
    flex: 1,
    paddingTop: 20,
  },
  playerStats: {
    fontSize: 12,
    fontWeight: '500',
  },
  // Stats Tab Styles
  statsSection: {
    marginBottom: 32,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
    marginTop: 8,
  },
  recordCard: {
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  recordStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamRecord: {
    alignItems: 'center',
    minWidth: 80,
  },
  teamRecordName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  teamRecordScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recordTeamLogo: {
    width: 40,
    height: 40,
  },
  teamRecordScore: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  recordSeparator: {
    marginTop: 25,
    fontSize: 24,
    marginHorizontal: 20,
  },
  recordSubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  recentMatches: {
    marginTop: 16,
  },
  matchHistoryItem: {
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
  },
  matchHistoryContent: {
    alignItems: 'center',
  },
  matchHistoryTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  matchHistoryEvent: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  matchHistoryTeamLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  matchHistoryTeamRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flex: 1,
  },
  matchHistoryLogo: {
    width: 35,
    height: 35,
    marginRight: 8,
  },
  matchHistoryLogoRight: {
    width: 35,
    height: 35,
    marginLeft: 8,
  },
  matchHistoryTeamName: {
    fontSize: 14,
    fontWeight: '600',
  },
  matchHistoryScore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  matchHistoryScoreText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  matchHistoryScoreSep: {
    fontSize: 16,
    marginHorizontal: 8,
  },
  matchHistoryDate: {
    fontSize: 12,
    textAlign: 'center',
  },
  mapStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  mapStatCard: {
    width: '48%',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  mapStatBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  mapStatOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  mapStatContent: {
    padding: 16,
    position: 'relative',
    zIndex: 1,
  },
  mapStatName: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  mapStatTeams: {
    flexDirection: 'row',
  },
  mapStatTeam: {
    flex: 1,
    alignItems: 'center',
  },
  mapStatDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 12,
  },
  mapStatTeamName: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  mapStatWinRate: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  mapStatRecord: {
    fontSize: 10,
  },
  recentFormScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  recentFormGameCard: {
    width: 140,
    borderRadius: 8,
    padding: 12,
    marginRight: 12,
    position: 'relative',
  },
  formResultBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  formResultText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  formGameContent: {
    alignItems: 'center',
  },
  formEventName: {
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 15,
  },
  formMatchup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  formTeamLogo: {
    width: 24,
    height: 24,
  },
  formScoreContainer: {
    flex: 1,
    alignItems: 'center',
  },
  formScore: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  formDate: {
    fontSize: 10,
    textAlign: 'center',
  },
});

export default VALSeriesScreen;
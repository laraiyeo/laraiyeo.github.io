import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Image,
  Animated,
  Modal
} from 'react-native';
import { MLBService } from '../../services/MLBService';

const MLBGameDetailsScreen = ({ route, navigation }) => {
  const { gameId, sport } = route?.params || {};
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updateInterval, setUpdateInterval] = useState(null);
  const [lastUpdateHash, setLastUpdateHash] = useState('');
  const [lastPlaysHash, setLastPlaysHash] = useState('');
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [activeTab, setActiveTab] = useState('stats');
  const [playsData, setPlaysData] = useState(null);
  const [teamStatsData, setTeamStatsData] = useState(null);
  const [loadingPlays, setLoadingPlays] = useState(false);
  const [loadingTeamStats, setLoadingTeamStats] = useState(false);
  const [openPlays, setOpenPlays] = useState(new Set());
  const [isIncrementalUpdate, setIsIncrementalUpdate] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerModalVisible, setPlayerModalVisible] = useState(false);
  const [playerStats, setPlayerStats] = useState(null);
  const [loadingPlayerStats, setLoadingPlayerStats] = useState(false);
  const scrollViewRef = useRef(null);
  const playsScrollViewRef = useRef(null);
  const stickyHeaderOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    console.log('MLBGameDetailsScreen: Main useEffect triggered, gameId:', gameId);
    
    if (!gameId) {
      Alert.alert('Error', 'Game ID not provided');
      navigation.goBack();
      return;
    }
    
    loadGameDetails();
  }, [gameId]);

  // Set up live updates after gameData is loaded
  useEffect(() => {
    if (!gameData) return;
    
    const isLiveGame = gameData?.gameData?.status?.statusCode === 'I'; // In progress
    console.log('MLBGameDetailsScreen: Setting up live updates, isLive:', isLiveGame);
    
    if (isLiveGame) {
      const interval = setInterval(() => {
        console.log('MLBGameDetailsScreen: Live update tick');
        loadGameDetails(true);
      }, 2000); // Update every 2 seconds for live games
      
      setUpdateInterval(interval);
      
      return () => {
        console.log('MLBGameDetailsScreen: Clearing live update interval');
        clearInterval(interval);
      };
    }
  }, [gameData]);

  // Clear cache when component unmounts or gameId changes
  useEffect(() => {
    return () => {
      MLBService.clearCache?.();
    };
  }, [gameId]);

  // Refresh plays data when active tab is plays and game data changes
  useEffect(() => {
    if (gameData && activeTab === 'plays') {
      // Always refresh plays when switching to plays tab or when game data changes while on plays tab
      loadPlaysData();
    }
  }, [gameData, activeTab]);

  // Monitor for live updates specifically for plays
  useEffect(() => {
    if (gameData && activeTab === 'plays') {
      // Create a more detailed hash just for plays updates
      const currentPlaysCount = gameData.liveData?.plays?.allPlays?.length || 0;
      const currentPlayEvents = gameData.liveData?.plays?.currentPlay?.playEvents?.length || 0;
      const currentPlayResult = gameData.liveData?.plays?.currentPlay?.result?.description || '';
      const lastPlayId = gameData.liveData?.plays?.allPlays?.[gameData.liveData?.plays?.allPlays?.length - 1]?.about?.atBatIndex;
      
      const playsHash = JSON.stringify({
        playsCount: currentPlaysCount,
        currentPlayEvents: currentPlayEvents,
        currentPlayResult: currentPlayResult,
        lastPlayId: lastPlayId
      });
      
      if (playsHash !== lastPlaysHash && lastPlaysHash !== '') {
        console.log('Plays data changed, updating incrementally...');
        
        // Check if we have more plays than before (new plays added)
        const existingPlaysCount = playsData?.allPlays?.length || 0;
        if (currentPlaysCount > existingPlaysCount) {
          // New plays added - update incrementally
          setIsIncrementalUpdate(true);
          updatePlaysDataIncremental(gameData.liveData?.plays);
        } else {
          // Play events changed for existing play - refresh all
          setIsIncrementalUpdate(false);
          loadPlaysData();
        }
      }
      setLastPlaysHash(playsHash);
    }
  }, [gameData, activeTab, lastPlaysHash, playsData]);

  const createDataHash = (data) => {
    if (!data) return '';
    
    // Create a hash based on key game state data
    const hashData = {
      score: data.liveData?.linescore?.teams,
      inning: data.liveData?.linescore?.currentInning,
      inningState: data.liveData?.linescore?.inningState,
      outs: data.liveData?.linescore?.outs,
      balls: data.liveData?.linescore?.balls,
      strikes: data.liveData?.linescore?.strikes,
      status: data.gameData?.status?.detailedState,
      playsCount: data.liveData?.plays?.allPlays?.length || 0,
      currentPlay: data.liveData?.plays?.currentPlay?.playEvents?.length || 0,
      currentPlayResult: data.liveData?.plays?.currentPlay?.result?.description || '',
      lastPlayTimestamp: data.liveData?.plays?.allPlays?.[data.liveData?.plays?.allPlays?.length - 1]?.about?.startTime
    };
    
    return JSON.stringify(hashData);
  };

  const loadGameDetails = async (silentUpdate = false) => {
    try {
      if (!gameId) {
        console.error('MLBGameDetailsScreen: No gameId provided');
        return;
      }

      if (!silentUpdate) {
        setLoading(true);
      }

      console.log('MLBGameDetailsScreen: Loading game details for gameId:', gameId);
      const data = await MLBService.getGameDetails(gameId);
      
      // Check for changes
      const newHash = createDataHash(data);
      if (silentUpdate && newHash === lastUpdateHash) {
        return; // No changes, skip update
      }
      
      setLastUpdateHash(newHash);
      setGameData(data);
      
    } catch (error) {
      console.error('Error loading game details:', error);
      if (!silentUpdate) {
        Alert.alert('Error', 'Failed to load game details');
      }
    } finally {
      if (!silentUpdate) {
        setLoading(false);
      }
    }
  };

  const loadPlaysData = async () => {
    if (!gameId || loadingPlays) return;
    
    try {
      setIsIncrementalUpdate(false);
      setLoadingPlays(true);
      const plays = await MLBService.getPlayByPlay(gameId);
      setPlaysData(plays);
    } catch (error) {
      console.error('Error loading plays:', error);
      Alert.alert('Error', 'Failed to load plays data');
    } finally {
      setLoadingPlays(false);
    }
  };

  const updatePlaysDataIncremental = async (newPlaysData) => {
    if (!newPlaysData || !playsData) {
      // If we don't have existing data, load all plays
      loadPlaysData();
      return;
    }

    const newAllPlays = newPlaysData.allPlays || [];
    const existingAllPlays = playsData.allPlays || [];
    
    // Check if there are actually new plays
    if (newAllPlays.length <= existingAllPlays.length) {
      // No new plays, just update the current play and other metadata without touching allPlays
      setPlaysData(prevData => ({
        ...prevData,
        currentPlay: newPlaysData.currentPlay,
        scoringPlays: newPlaysData.scoringPlays,
        playsByInning: newPlaysData.playsByInning
      }));
      return;
    }

    // Get only the new plays (plays that weren't in the previous data)
    const newPlays = newAllPlays.slice(existingAllPlays.length);
    console.log(`Adding ${newPlays.length} new plays incrementally`);

    // Use functional update to append new plays to existing array without replacing the entire reference
    setPlaysData(prevData => ({
      ...newPlaysData,
      allPlays: [...prevData.allPlays, ...newPlays]
    }));

    // Reset incremental update flag after a short delay
    setTimeout(() => {
      setIsIncrementalUpdate(false);
    }, 100);
  };

  const loadTeamStats = async () => {
    if (!gameId || loadingTeamStats) return;
    
    try {
      setLoadingTeamStats(true);
      const stats = await MLBService.getTeamStats(gameId);
      setTeamStatsData(stats);
    } catch (error) {
      console.error('Error loading team stats:', error);
      Alert.alert('Error', 'Failed to load team stats');
    } finally {
      setLoadingTeamStats(false);
    }
  };

  const formatInning = (inning, inningState) => {
    if (!inning) return '';
    const ordinal = MLBService.getOrdinalSuffix(inning);
    return inningState === 'Top' ? `Top ${ordinal}` : `Bot ${ordinal}`;
  };

  const handlePlayerPress = async (player, team) => {
    setSelectedPlayer({
      ...player,
      team: team
    });
    setPlayerModalVisible(true);
    setLoadingPlayerStats(true);

    try {
      console.log('Fetching game stats for player ID:', player.person?.id, 'in game:', gameId);
      const gameStats = await MLBService.getPlayerGameStats(gameId, player.person?.id);
      console.log('Game stats received:', gameStats);
      
      if (gameStats) {
        setPlayerStats(gameStats);
      } else {
        console.log('No valid stats data received');
        setPlayerStats(null);
      }
    } catch (error) {
      console.error('Error loading player stats:', error);
      setPlayerStats(null);
    } finally {
      setLoadingPlayerStats(false);
    }
  };

  const closePlayerModal = () => {
    setPlayerModalVisible(false);
    setSelectedPlayer(null);
    setPlayerStats(null);
  };

  const handleScroll = (event) => {
    const offsetY = event.nativeEvent.contentOffset.y;

    // Define the transition range - moved earlier
    const fadeStartY = 100; // Start fading in when scrolled past this point
    const fadeEndY = 150;   // Fully visible at this point

    // Calculate opacity based on scroll position within the transition range
    let opacity = 0;
    if (offsetY >= fadeStartY) {
      if (offsetY >= fadeEndY) {
        opacity = 1; // Fully visible
      } else {
        // Gradual transition between fadeStartY and fadeEndY
        opacity = (offsetY - fadeStartY) / (fadeEndY - fadeStartY);
      }
    }

    // Update state for conditional padding
    const shouldShow = opacity > 0;
    if (shouldShow !== showStickyHeader) {
      setShowStickyHeader(shouldShow);
    }

    // Smoothly animate to the calculated opacity
    Animated.timing(stickyHeaderOpacity, {
      toValue: opacity,
      duration: 0, // Immediate response to scroll
      useNativeDriver: true,
    }).start();
  };

  const renderStickyHeader = () => {
    if (!showStickyHeader || !gameData) return null;

    const awayTeam = gameData.gameData?.teams?.away;
    const homeTeam = gameData.gameData?.teams?.home;
    const linescore = gameData.liveData?.linescore;
    const status = gameData.gameData?.status;

    const awayScore = linescore?.teams?.away?.runs || 0;
    const homeScore = linescore?.teams?.home?.runs || 0;
    const isGameFinal = status?.statusCode === 'F';

    const awayScoreStyle = isGameFinal && awayScore < homeScore ? styles.losingStickyTeamScore : styles.stickyTeamScore;
    const homeScoreStyle = isGameFinal && homeScore < awayScore ? styles.losingStickyTeamScore : styles.stickyTeamScore;

    return (
      <Animated.View
        style={[
          styles.stickyHeader,
          {
            opacity: stickyHeaderOpacity,
            transform: [{
              translateY: stickyHeaderOpacity.interpolate({
                inputRange: [0, 1],
                outputRange: [-20, 0], // Smaller, more subtle slide effect
              })
            }]
          }
        ]}
        pointerEvents={showStickyHeader ? 'auto' : 'none'}
      >
        {/* Away Team */}
        <View style={styles.stickyTeamAway}>
          <Image
            source={{ uri: MLBService.getLogoUrl(awayTeam?.name || '', awayTeam?.abbreviation) }}
            style={styles.stickyTeamLogo}
            defaultSource={{ uri: 'https://via.placeholder.com/28x28?text=MLB' }}
          />
          <Text style={awayScoreStyle}>{awayScore}</Text>
        </View>

        {/* Game Status */}
        <View style={styles.stickyStatus}>
          {status?.statusCode === 'F' ? (
            <Text style={styles.stickyStatusText}>Final</Text>
          ) : status?.statusCode === 'I' ? (
            <>
              <Text style={styles.stickyStatusText}>
                {formatInning(linescore?.currentInning, linescore?.inningState)}
              </Text>
              <Text style={styles.stickyClock}>
                {linescore?.balls || 0}-{linescore?.strikes || 0}, {linescore?.outs || 0} out{(linescore?.outs || 0) !== 1 ? 's' : ''}
              </Text>
            </>
          ) : (
            <Text style={styles.stickyStatusText}>{status?.detailedState || 'Scheduled'}</Text>
          )}
        </View>

        {/* Home Team */}
        <View style={styles.stickyTeamHome}>
          <Text style={homeScoreStyle}>{homeScore}</Text>
          <Image
            source={{ uri: MLBService.getLogoUrl(homeTeam?.name || '', homeTeam?.abbreviation) }}
            style={styles.stickyTeamLogo}
            defaultSource={{ uri: 'https://via.placeholder.com/28x28?text=MLB' }}
          />
        </View>
      </Animated.View>
    );
  };

  const renderTabNavigation = () => {
    const tabs = [
      { key: 'stats', label: 'Stats' },
      { key: 'away', label: 'Away' },
      { key: 'home', label: 'Home' },
      { key: 'plays', label: 'Plays' }
    ];

    return (
      <View style={styles.tabContainer}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tabButton,
              activeTab === tab.key && styles.activeTabButton,
              tab.key !== 'plays' && styles.tabButtonBorder
            ]}
            onPress={() => {
              setActiveTab(tab.key);
              if (tab.key === 'plays') {
                if (!playsData) {
                  loadPlaysData();
                }
              } else if ((tab.key === 'away' || tab.key === 'home') && !teamStatsData) {
                loadTeamStats();
              }
            }}
          >
            <Text style={[
              styles.tabText,
              activeTab === tab.key && styles.activeTabText
            ]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderGameHeader = () => {
    if (!gameData) return null;

    const awayTeam = gameData.gameData?.teams?.away;
    const homeTeam = gameData.gameData?.teams?.home;
    const linescore = gameData.liveData?.linescore;
    const status = gameData.gameData?.status;

    const awayScore = linescore?.teams?.away?.runs || 0;
    const homeScore = linescore?.teams?.home?.runs || 0;
    const isGameFinal = status?.statusCode === 'F';
    
    const awayScoreStyle = isGameFinal && awayScore < homeScore ? styles.losingTeamScore : styles.teamScore;
    const homeScoreStyle = isGameFinal && homeScore < awayScore ? styles.losingTeamScore : styles.teamScore;
    const awayNameStyle = isGameFinal && awayScore < homeScore ? styles.losingTeamName : styles.teamName;
    const homeNameStyle = isGameFinal && homeScore < awayScore ? styles.losingTeamName : styles.teamName;

    return (
      <View style={styles.gameHeader}>
        <View style={styles.teamContainer}>
          {/* Away Team */}
          <View style={styles.team}>
            <Text style={awayScoreStyle}>{awayScore}</Text>
            <Image 
              source={{ uri: MLBService.getLogoUrl(awayTeam?.name || '', awayTeam?.abbreviation) }} 
              style={styles.teamLogo}
              defaultSource={{ uri: 'https://via.placeholder.com/50x50?text=MLB' }}
            />
            <View style={styles.teamNameContainer}>
              <Text style={awayNameStyle}>{awayTeam?.abbreviation || 'AWAY'}</Text>
            </View>
          </View>

          {/* Game Status */}
          <View style={styles.vsContainer}>
            <Text style={styles.vsText}>vs</Text>
            {status?.statusCode === 'F' ? (
              <Text style={styles.gameStatus}>Final</Text>
            ) : status?.statusCode === 'I' ? (
              <>
                <Text style={styles.gameStatus}>
                  {formatInning(linescore?.currentInning, linescore?.inningState)}
                </Text>
                <Text style={styles.gameClock}>
                  {linescore?.balls || 0}-{linescore?.strikes || 0}, {linescore?.outs || 0} out{(linescore?.outs || 0) !== 1 ? 's' : ''}
                </Text>
                {renderBases()}
              </>
            ) : (
              <Text style={styles.gameStatus}>{status?.detailedState || 'Scheduled'}</Text>
            )}
          </View>

          {/* Home Team */}
          <View style={styles.team}>
            <Text style={homeScoreStyle}>{homeScore}</Text>
            <Image 
              source={{ uri: MLBService.getLogoUrl(homeTeam?.name || '', homeTeam?.abbreviation) }} 
              style={styles.teamLogo}
              defaultSource={{ uri: 'https://via.placeholder.com/50x50?text=MLB' }}
            />
            <View style={styles.teamNameContainer}>
              <Text style={homeNameStyle}>{homeTeam?.abbreviation || 'HOME'}</Text>
            </View>
          </View>
        </View>
        
        <View style={styles.gameInfo}>
          <Text style={styles.venue}>{gameData.gameData?.venue?.name || ''}</Text>
          {gameData.gameData?.datetime?.originalDate && (
            <Text style={styles.date}>
              {new Date(gameData.gameData.datetime.originalDate).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </Text>
          )}
        </View>
      </View>
    );
  };

  const renderBases = () => {
    if (!gameData?.liveData?.linescore?.offense) return null;

    const offense = gameData.liveData.linescore.offense;
    const hasFirst = !!offense.first;
    const hasSecond = !!offense.second;
    const hasThird = !!offense.third;

    return (
      <View style={styles.basesContainer}>
        <View style={styles.basesDisplay}>
          <View style={[styles.base, styles.secondBase, hasSecond && styles.occupiedBase]} />
          <View style={styles.basesRow}>
            <View style={[styles.base, styles.thirdBase, hasThird && styles.occupiedBase]} />
            <View style={[styles.base, styles.firstBase, hasFirst && styles.occupiedBase]} />
          </View>
        </View>
      </View>
    );
  };

  const renderLineScore = () => {
    if (!gameData?.liveData?.linescore) return null;

    const linescore = gameData.liveData.linescore;
    const innings = linescore.innings || [];
    const awayTeam = gameData.gameData?.teams?.away;
    const homeTeam = gameData.gameData?.teams?.home;

    if (innings.length === 0) return null;

    return (
      <View style={styles.lineScoreContainer}>
        <Text style={styles.sectionTitle}>Line Score</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.lineScoreTable}>
            {/* Header Row */}
            <View style={styles.lineScoreRow}>
              <View style={[styles.lineScoreCell, styles.teamCell]}>
                <Text style={styles.lineScoreHeaderText}>Team</Text>
              </View>
              {innings.map((inning, index) => (
                <View key={index} style={styles.lineScoreCell}>
                  <Text style={styles.lineScoreHeaderText}>{index + 1}</Text>
                </View>
              ))}
              <View style={styles.lineScoreCell}>
                <Text style={styles.lineScoreHeaderText}>R</Text>
              </View>
              <View style={styles.lineScoreCell}>
                <Text style={styles.lineScoreHeaderText}>H</Text>
              </View>
              <View style={styles.lineScoreCell}>
                <Text style={styles.lineScoreHeaderText}>E</Text>
              </View>
            </View>

            {/* Away Team Row */}
            <View style={styles.lineScoreRow}>
              <View style={[styles.lineScoreCell, styles.teamCell]}>
                <View style={styles.lineScoreTeamContainer}>
                  <Image
                    source={{ uri: MLBService.getLogoUrl(awayTeam?.name, awayTeam?.abbreviation) }}
                    style={styles.lineScoreTeamLogo}
                  />
                  <Text style={styles.lineScoreTeamText}>{awayTeam?.abbreviation || 'AWAY'}</Text>
                </View>
              </View>
              {innings.map((inning, index) => (
                <View key={index} style={styles.lineScoreCell}>
                  <Text style={styles.lineScoreText}>{inning.away?.runs || '-'}</Text>
                </View>
              ))}
              <View style={styles.lineScoreCell}>
                <Text style={[styles.lineScoreText, styles.lineScoreTotalText]}>
                  {linescore.teams?.away?.runs || 0}
                </Text>
              </View>
              <View style={styles.lineScoreCell}>
                <Text style={styles.lineScoreText}>{linescore.teams?.away?.hits || 0}</Text>
              </View>
              <View style={styles.lineScoreCell}>
                <Text style={styles.lineScoreText}>{linescore.teams?.away?.errors || 0}</Text>
              </View>
            </View>

            {/* Home Team Row */}
            <View style={styles.lineScoreRow}>
              <View style={[styles.lineScoreCell, styles.teamCell]}>
                <View style={styles.lineScoreTeamContainer}>
                  <Image
                    source={{ uri: MLBService.getLogoUrl(homeTeam?.name, homeTeam?.abbreviation) }}
                    style={styles.lineScoreTeamLogo}
                  />
                  <Text style={styles.lineScoreTeamText}>{homeTeam?.abbreviation || 'HOME'}</Text>
                </View>
              </View>
              {innings.map((inning, index) => (
                <View key={index} style={styles.lineScoreCell}>
                  <Text style={styles.lineScoreText}>{inning.home?.runs || '-'}</Text>
                </View>
              ))}
              <View style={styles.lineScoreCell}>
                <Text style={[styles.lineScoreText, styles.lineScoreTotalText]}>
                  {linescore.teams?.home?.runs || 0}
                </Text>
              </View>
              <View style={styles.lineScoreCell}>
                <Text style={styles.lineScoreText}>{linescore.teams?.home?.hits || 0}</Text>
              </View>
              <View style={styles.lineScoreCell}>
                <Text style={styles.lineScoreText}>{linescore.teams?.home?.errors || 0}</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderCurrentPlay = () => {
    if (!gameData?.liveData?.plays?.currentPlay) return null;

    const currentPlay = gameData.liveData.plays.currentPlay;
    const status = gameData.gameData?.status;

    if (status?.statusCode !== 'I') return null; // Only show for in-progress games

    return (
      <View style={styles.currentPlayContainer}>
        <Text style={styles.sectionTitle}>Current Situation</Text>
        <View style={styles.currentPlayContent}>
          {currentPlay.result?.description && (
            <Text style={styles.currentPlayText}>{currentPlay.result.description}</Text>
          )}
          {currentPlay.about?.inning && (
            <Text style={styles.currentPlayDetails}>
              {formatInning(currentPlay.about.inning, currentPlay.about.halfInning)}
            </Text>
          )}
        </View>
      </View>
    );
  };

  const renderStatsContent = () => {
    return (
      <View style={styles.section}>
        {renderLineScore()}
        {renderMomentumChart()}
        {renderTeamStats()}
      </View>
    );
  };

  const renderTeamContent = (teamType) => {
    if (!gameData) return null;

    const team = teamType === 'away' ? gameData.gameData?.teams?.away : gameData.gameData?.teams?.home;
    const teamStats = teamType === 'away' ? gameData.liveData?.boxscore?.teams?.away : gameData.liveData?.boxscore?.teams?.home;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{team?.name || `${teamType} Team`} Box Score</Text>
        {renderTeamBoxScore(teamStats, team)}
      </View>
    );
  };

  const renderTeamBoxScore = (teamStats, team) => {
    if (!teamStats) return null;

    const batters = teamStats.batters || [];
    const pitchers = teamStats.pitchers || [];

    return (
      <View style={styles.teamBoxScoreContainer}>
        <View style={styles.teamBoxScoreHeader}>
          <Image 
            source={{ uri: MLBService.getLogoUrl(team?.name || '', team?.abbreviation) }} 
            style={styles.teamBoxScoreLogo}
            defaultSource={{ uri: 'https://via.placeholder.com/30x30?text=MLB' }}
          />
          <Text style={styles.sectionTitle}>{team?.name || 'Team'}</Text>
        </View>

        {/* Batting Stats */}
        <View style={styles.statCategoryContainer}>
          <Text style={styles.statCategoryTitle}>Batting</Text>
          <View style={styles.statTableHeader}>
            <Text style={styles.statTableHeaderPlayer}>Player</Text>
            <Text style={styles.statTableHeaderStat}>AB</Text>
            <Text style={styles.statTableHeaderStat}>R</Text>
            <Text style={styles.statTableHeaderStat}>H</Text>
            <Text style={styles.statTableHeaderStat}>RBI</Text>
            <Text style={styles.statTableHeaderStat}>AVG</Text>
          </View>
          {batters.slice(0, 9).map((batterId, index) => {
            const player = teamStats.players?.[`ID${batterId}`];
            if (!player) return null;
            
            const stats = player.stats?.batting || {};
            return (
              <TouchableOpacity 
                key={batterId} 
                style={styles.statTableRow}
                onPress={() => handlePlayerPress(player, team)}
              >
                <View style={styles.statTablePlayerCell}>
                  <Text style={styles.statTablePlayerName}>
                    {player.person?.fullName || 'Unknown Player'}
                  </Text>
                  <Text style={styles.statTablePlayerNumber}>
                    #{player.jerseyNumber || '--'} {player.position?.abbreviation || ''}
                  </Text>
                </View>
                <Text style={styles.statTableStatCell}>{stats.atBats || 0}</Text>
                <Text style={styles.statTableStatCell}>{stats.runs || 0}</Text>
                <Text style={styles.statTableStatCell}>{stats.hits || 0}</Text>
                <Text style={styles.statTableStatCell}>{stats.rbi || 0}</Text>
                <Text style={styles.statTableStatCell}>{player.seasonStats?.batting?.avg || '.000'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Pitching Stats */}
        <View style={styles.statCategoryContainer}>
          <Text style={styles.statCategoryTitle}>Pitching</Text>
          <View style={styles.statTableHeader}>
            <Text style={styles.statTableHeaderPlayer}>Player</Text>
            <Text style={styles.statTableHeaderStat}>IP</Text>
            <Text style={styles.statTableHeaderStat}>H</Text>
            <Text style={styles.statTableHeaderStat}>R</Text>
            <Text style={styles.statTableHeaderStat}>ER</Text>
            <Text style={styles.statTableHeaderStat}>ERA</Text>
          </View>
          {pitchers.map((pitcherId, index) => {
            const player = teamStats.players?.[`ID${pitcherId}`];
            if (!player) return null;
            
            const stats = player.stats?.pitching || {};
            return (
              <TouchableOpacity 
                key={pitcherId} 
                style={styles.statTableRow}
                onPress={() => handlePlayerPress(player, team)}
              >
                <View style={styles.statTablePlayerCell}>
                  <Text style={styles.statTablePlayerName}>
                    {player.person?.fullName || 'Unknown Player'}
                  </Text>
                  <Text style={styles.statTablePlayerNumber}>
                    #{player.jerseyNumber || '--'} {player.position?.abbreviation || ''}
                  </Text>
                </View>
                <Text style={styles.statTableStatCell}>{stats.inningsPitched || '0.0'}</Text>
                <Text style={styles.statTableStatCell}>{stats.hits || 0}</Text>
                <Text style={styles.statTableStatCell}>{stats.runs || 0}</Text>
                <Text style={styles.statTableStatCell}>{stats.earnedRuns || 0}</Text>
                <Text style={styles.statTableStatCell}>{player.seasonStats?.pitching?.era || '0.00'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderTeamStats = () => {
    if (!gameData?.liveData?.boxscore?.teams) return null;

    const awayTeam = gameData.gameData?.teams?.away;
    const homeTeam = gameData.gameData?.teams?.home;
    const awayStats = gameData.liveData.boxscore.teams.away?.teamStats?.batting || {};
    const homeStats = gameData.liveData.boxscore.teams.home?.teamStats?.batting || {};

    const awayColor = MLBService.getTeamColor(awayTeam?.name || awayTeam?.team?.name);
    const homeColor = MLBService.getTeamColor(homeTeam?.name || homeTeam?.team?.name);

    // Helper function to render stats row with bars
    const renderStatsRow = (label, awayValue, homeValue) => {
      const awayNum = typeof awayValue === 'number' ? awayValue : parseFloat(awayValue) || 0;
      const homeNum = typeof homeValue === 'number' ? homeValue : parseFloat(homeValue) || 0;
      const total = awayNum + homeNum;
      const awayPercent = total > 0 ? (awayNum / total) * 100 : 50;
      const homePercent = total > 0 ? (homeNum / total) * 100 : 50;

      return (
        <View key={label} style={{ marginBottom: 28 }}>
          <View style={styles.statsRow}>
            <Text style={styles.statsValue}>{awayValue}</Text>
            <View style={styles.statsBarContainer}>
              <View style={styles.statsBar}>
                <View
                  style={[
                    styles.statsBarFill,
                    styles.awayBarFill,
                    { width: `${awayPercent}%`, backgroundColor: awayColor }
                  ]}
                />
              </View>
              <View style={styles.statsBar}>
                <View
                  style={[
                    styles.statsBarFill,
                    styles.homeBarFill,
                    { width: `${homePercent}%`, backgroundColor: homeColor }
                  ]}
                />
              </View>
            </View>
            <Text style={styles.statsValue}>{homeValue}</Text>
          </View>
          <View style={{ alignItems: 'center', marginTop: -25 }}>
            <Text style={styles.statsLabel}>{label}</Text>
          </View>
        </View>
      );
    };

    return (
      <View style={styles.teamStatsContainer}>
        <Text style={styles.sectionTitle}>Team Statistics</Text>

        {/* Team Headers */}
        <View style={styles.statsTeams}>
          <View style={styles.statsTeam}>
            <Image
              source={{ uri: MLBService.getLogoUrl(awayTeam?.name || '', awayTeam?.abbreviation) }}
              style={styles.statsTeamLogo}
              defaultSource={{ uri: 'https://via.placeholder.com/30x30?text=MLB' }}
            />
            <Text style={styles.statsTeamName}>{awayTeam?.name || 'Away Team'}</Text>
          </View>
          <View style={styles.statsTeam}>
            <Image
              source={{ uri: MLBService.getLogoUrl(homeTeam?.name || '', homeTeam?.abbreviation) }}
              style={styles.statsTeamLogo}
              defaultSource={{ uri: 'https://via.placeholder.com/30x30?text=MLB' }}
            />
            <Text style={styles.statsTeamName}>{homeTeam?.name || 'Home Team'}</Text>
          </View>
        </View>

        {/* Stats Rows */}
        <View style={styles.statsSection}>
          {renderStatsRow('Hits', awayStats.hits || 0, homeStats.hits || 0)}
          {renderStatsRow('At Bats', awayStats.atBats || 0, homeStats.atBats || 0)}
          {renderStatsRow('Batting Avg', parseFloat(awayStats.avg || 0).toFixed(3), parseFloat(homeStats.avg || 0).toFixed(3))}
          {renderStatsRow('OPS', parseFloat(awayStats.ops || 0).toFixed(3), parseFloat(homeStats.ops || 0).toFixed(3))}
          {renderStatsRow('Strikeouts', awayStats.strikeOuts || 0, homeStats.strikeOuts || 0)}
          {renderStatsRow('Walks', awayStats.baseOnBalls || 0, homeStats.baseOnBalls || 0)}
          {renderStatsRow('Left on Base', awayStats.leftOnBase || 0, homeStats.leftOnBase || 0)}
          {renderStatsRow('Home Runs', awayStats.homeRuns || 0, homeStats.homeRuns || 0)}
          {renderStatsRow('Stolen Bases', awayStats.stolenBases || 0, homeStats.stolenBases || 0)}
        </View>
      </View>
    );
  };

  const renderPlaysContent = () => {
    console.log('renderPlaysContent called, loadingPlays:', loadingPlays, 'isIncrementalUpdate:', isIncrementalUpdate);
    
    // Only show loading if it's not an incremental update
    if (loadingPlays && !isIncrementalUpdate) {
      console.log('Showing loading spinner');
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#002D72" />
          <Text style={styles.loadingText}>Loading Plays...</Text>
        </View>
      );
    }

    if (!playsData) {
      return (
        <View style={styles.placeholderContainer}>
          <Text style={styles.placeholderText}>No plays data available</Text>
        </View>
      );
    }

    console.log('Rendering plays section with', playsData.allPlays?.length, 'plays');
    return (
      <View style={styles.section}>
        {renderPlayByPlay()}
      </View>
    );
  };

  const renderMomentumChart = () => {
    if (!gameData?.liveData?.linescore?.innings) return null;

    const awayTeam = gameData.gameData?.teams?.away;
    const homeTeam = gameData.gameData?.teams?.home;
    const innings = gameData.liveData.linescore.innings;
    
    // Get team colors from the team data or use defaults
    const awayColor = MLBService.getTeamColor(awayTeam?.name || awayTeam?.team?.name);
    const homeColor = MLBService.getTeamColor(homeTeam?.name || homeTeam?.team?.name);

    // Calculate momentum for each inning
    let momentumPoints = [];
    let cumulativeAwayRuns = 0;
    let cumulativeHomeRuns = 0;
    let cumulativeAwayHits = 0;
    let cumulativeHomeHits = 0;

    // Starting at balanced (50%)
    momentumPoints.push(50);

    innings.forEach((inning, index) => {
      const awayRuns = inning.away?.runs || 0;
      const homeRuns = inning.home?.runs || 0;
      const awayHits = inning.away?.hits || 0;
      const homeHits = inning.home?.hits || 0;

      cumulativeAwayRuns += awayRuns;
      cumulativeHomeRuns += homeRuns;
      cumulativeAwayHits += awayHits;
      cumulativeHomeHits += homeHits;

      // Calculate momentum based on runs and hits
      // Runs are weighted more heavily than hits
      const runDiff = cumulativeHomeRuns - cumulativeAwayRuns;
      const hitDiff = cumulativeHomeHits - cumulativeAwayHits;

      // Momentum calculation: runs worth 3x hits, with diminishing returns
      const momentumScore = (runDiff * 3) + (hitDiff * 1);

      // Convert to percentage (0-100, where 50 is balanced)
      // Use sigmoid-like function for smooth transitions
      let momentum = 50 + (momentumScore * 5);

      // Add some recent inning bias (what happened this inning affects momentum more)
      const recentRunDiff = homeRuns - awayRuns;
      const recentHitDiff = homeHits - awayHits;
      const recentMomentum = (recentRunDiff * 2) + (recentHitDiff * 0.5);
      momentum += recentMomentum * 3;

      // Cap between 10-90% for visual appeal
      momentum = Math.max(10, Math.min(90, momentum));

      momentumPoints.push(momentum);
    });

    // Ensure we have at least 9 innings for proper display
    const totalInnings = Math.max(9, innings.length);

    // Calculate individual inning data for both teams
    let inningData = [];

    for (let i = 0; i < totalInnings; i++) {
      if (i < innings.length) {
        const inning = innings[i];
        const awayRuns = inning.away?.runs || 0;
        const homeRuns = inning.home?.runs || 0;
        const awayHits = inning.away?.hits || 0;
        const homeHits = inning.home?.hits || 0;

        // Calculate combined activity for each team (runs worth more than hits)
        const awayActivity = (awayRuns * 3) + awayHits;
        const homeActivity = (homeRuns * 3) + homeHits;

        inningData.push({
          inning: i + 1,
          awayRuns: awayRuns,
          homeRuns: homeRuns,
          awayHits: awayHits,
          homeHits: homeHits,
          awayActivity: awayActivity,
          homeActivity: homeActivity
        });
      } else {
        // For innings beyond current game, show no activity
        inningData.push({
          inning: i + 1,
          awayRuns: 0,
          homeRuns: 0,
          awayHits: 0,
          homeHits: 0,
          awayActivity: 0,
          homeActivity: 0
        });
      }
    }

    // Find max activity for scaling bars
    const maxActivity = Math.max(...inningData.map(d => Math.max(d.awayActivity, d.homeActivity)), 1);

    return (
      <View style={styles.momentumContainer}>
        <Text style={styles.sectionTitle}>Momentum</Text>
        <View style={styles.momentumChartWhite}>
          <View style={styles.teamLabels}>
            <View style={[styles.teamLabelContainer, styles.awayTeamLabel]}>
              <Image
                source={{ uri: MLBService.getLogoUrl(awayTeam?.name, awayTeam?.abbreviation) }}
                style={styles.momentumTeamLogo}
              />
              <Text style={styles.teamLabel}>
                {awayTeam?.abbreviation || 'AWAY'}
              </Text>
            </View>
            <View style={[styles.teamLabelContainer, styles.homeTeamLabel]}>
              <Image
                source={{ uri: MLBService.getLogoUrl(homeTeam?.name, homeTeam?.abbreviation) }}
                style={styles.momentumTeamLogo}
              />
              <Text style={styles.teamLabel}>
                {homeTeam?.abbreviation || 'HOME'}
              </Text>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.inningBarsContainer}>
              {inningData.map((data, index) => {
                const awayBarHeight = data.awayActivity > 0 ? Math.max(8, (data.awayActivity / maxActivity) * 40) : 0;
                const homeBarHeight = data.homeActivity > 0 ? Math.max(8, (data.homeActivity / maxActivity) * 40) : 0;

                return (
                  <View key={index} style={styles.inningBar}>
                    {/* Inning label at center */}
                    <View style={styles.inningLabelContainer}>
                      <Text style={styles.inningLabel}>
                        {data.inning}{data.inning === 1 ? 'st' : data.inning === 2 ? 'nd' : data.inning === 3 ? 'rd' : 'th'}
                      </Text>
                    </View>

                    {/* Away team bar (extends upward from center) */}
                    {data.awayActivity > 0 && (
                      <View style={[
                        styles.awayBarContainer,
                        { height: awayBarHeight }
                      ]}>
                        <View
                          style={[
                            styles.activityBar,
                            styles.awayBar,
                            { height: awayBarHeight, backgroundColor: awayColor }
                          ]}
                        />
                        {(data.awayRuns > 0 || data.awayHits > 0) && (
                          <Text style={[styles.barText, { position: 'absolute', top: -25 }]}>
                            {data.awayRuns}R {data.awayHits}H
                          </Text>
                        )}
                      </View>
                    )}

                    {/* Home team bar (extends downward from center) */}
                    {data.homeActivity > 0 && (
                      <View style={[
                        styles.homeBarContainer,
                        { height: homeBarHeight }
                      ]}>
                        <View
                          style={[
                            styles.activityBar,
                            styles.homeBar,
                            { height: homeBarHeight, backgroundColor: homeColor }
                          ]}
                        />
                        {(data.homeRuns > 0 || data.homeHits > 0) && (
                          <Text style={[styles.barText, { position: 'absolute', bottom: -20 }]}>
                            {data.homeRuns}R {data.homeHits}H
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    );
  };

  const renderPlayByPlay = () => {
    if (!playsData?.allPlays) return null;

    console.log('renderPlayByPlay called with', playsData.allPlays.length, 'plays');
    
    // Show all plays, not just scoring plays - reverse to show most recent first
    const allPlays = [...playsData.allPlays].reverse();

    return (
      <View style={styles.playsContainer}>
        <Text style={styles.sectionTitle}>Play-by-Play</Text>
        <ScrollView 
          ref={playsScrollViewRef}
          style={styles.playsScrollView}
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
            autoscrollToTopThreshold: 10
          }}
        >
          {allPlays.map((play, index) => {
            // Use a more unique key that includes multiple identifiers
            const playKey = `${play.about?.atBatIndex || 'unknown'}-${play.about?.playIndex || 0}-${play.about?.startTime || index}-${index}`;
            return renderPlayItem(play, playKey, index);
          })}
        </ScrollView>
      </View>
    );
  };

  const renderPlayItem = (play, playKey, index) => {
    const isOpen = openPlays.has(playKey);
    const inning = play.about?.inning || 0;
    const halfInning = play.about?.halfInning || 'top';
    const isTopInning = halfInning.toLowerCase() === 'top';
    const team = isTopInning ? gameData.gameData?.teams?.away : gameData.gameData?.teams?.home;
    
    // Check if this is a scoring play - only when runs are actually scored
    const isScoringPlay = (play.result?.rbi && play.result.rbi > 0) || 
                         (play.result?.description?.toLowerCase().includes('scores')) ||
                         (play.result?.description?.toLowerCase().includes('home run')) ||
                         (play.result?.description?.toLowerCase().includes(' run')) ||
                         (play.result?.eventType === 'home_run') ||
                         (play.result?.event?.toLowerCase().includes('home run')) ||
                         (play.about?.isScoringPlay === true);
    
    const teamColor = MLBService.getTeamColor(team?.name || '');
    const cardStyle = isScoringPlay ? 
      [styles.playCard, { backgroundColor: teamColor }] : 
      styles.playCard;
    
    const textColor = isScoringPlay ? '#fff' : '#333';

    return (
      <View key={playKey} style={cardStyle}>
        <TouchableOpacity
          style={styles.playHeader}
          onPress={() => {
            const newOpenPlays = new Set(openPlays);
            if (isOpen) {
              newOpenPlays.delete(playKey);
            } else {
              newOpenPlays.add(playKey);
            }
            setOpenPlays(newOpenPlays);
          }}
        >
          <View style={styles.playInfo}>
            <Image
              source={{ uri: MLBService.getLogoUrl(team?.name || '', team?.abbreviation, isScoringPlay ? 'dark' : 'light') }}
              style={styles.playTeamLogo}
              defaultSource={{ uri: 'https://via.placeholder.com/24x24?text=MLB' }}
            />
            <View style={styles.playSummary}>
              <Text style={[styles.playTeamName, { color: textColor }]}>{team?.abbreviation || 'TEAM'}</Text>
              <Text style={[styles.playResult, { color: textColor }]}>{play.result?.description || `${play.matchup?.batter.fullName} vs ${play.matchup?.pitcher.fullName}`}</Text>
            </View>
          </View>
          <View style={styles.playScoreSection}>
            <Text style={[styles.playInning, { color: textColor }]}>
              {isTopInning ? 'Top' : 'Bot'} {MLBService.getOrdinalSuffix(inning)}
            </Text>
            <Text style={[styles.playScore, { color: textColor }]}>
              {play.result?.awayScore || 0}-{play.result?.homeScore || 0}
            </Text>
            {renderPlayBasesSmall(play)}
          </View>
          <Text style={[styles.toggleIcon, isOpen && styles.toggleIconOpen, { color: textColor }]}>
            {isOpen ? '▼' : '▶'}
          </Text>
        </TouchableOpacity>

        {isOpen && (
          <View style={styles.playDetails}>
            {renderPlayPitches(play)}
          </View>
        )}
      </View>
    );
  };

  const renderPlayPitches = (play) => {
    const pitches = play.playEvents?.filter(event => event.isPitch) || [];

    if (pitches.length === 0) {
      return (
        <View style={styles.pitchSequenceBox}>
          <Text style={styles.pitchSequenceTitle}>At-Bat Result</Text>
          <Text style={styles.pitchDescription}>{play.result?.description}</Text>
        </View>
      );
    }

    return (
      <View style={styles.pitchSequenceBox}>
        <Text style={styles.pitchSequenceTitle}>At-Bat Pitches ({pitches.length} pitches)</Text>
        {pitches.map((pitch, index) => (
          <View key={index} style={styles.pitchRow}>
            <View style={styles.pitchNumber}>
              <Text style={styles.pitchNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.pitchInfo}>
              <View style={styles.pitchMainInfo}>
                <Text style={styles.pitchTypeText}>
                  {pitch.details?.type?.description || pitch.pitchData?.type?.description || 'Unknown'}
                </Text>
                {pitch.pitchData?.startSpeed && (
                  <Text style={styles.pitchSpeedText}>
                    {Math.round(pitch.pitchData.startSpeed)} mph
                  </Text>
                )}
                <Text style={styles.pitchCountText}>
                  ({pitch.count?.balls || 0}-{pitch.count?.strikes || 0})
                </Text>
              </View>
              <Text style={styles.pitchActionText}>
                {pitch.details?.description || 'Pitch thrown'}
              </Text>
            </View>
          </View>
        ))}
        {renderPitchVisualization(pitches, play)}
      </View>
    );
  };

  const renderPitchVisualization = (pitches, play) => {
    // Handle both single pitch and array of pitches for backward compatibility
    const pitchArray = Array.isArray(pitches) ? pitches : [pitches];
    
    if (!pitchArray || pitchArray.length === 0) {
      return null;
    }

    // Get batter and pitcher from the play's matchup data
    const batter = play?.matchup?.batter || {};
    const pitcher = play?.matchup?.pitcher || {};

    // Generate headshot URLs using MLB's official format
    const batterHeadshot = batter.id ? 
      `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${batter.id}/headshot/67/current` : null;
    const pitcherHeadshot = pitcher.id ? 
      `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${pitcher.id}/headshot/67/current` : null;

    return (
      <View style={styles.pitchVisualization}>
        {/* Batter Section */}
        <View style={styles.pitchPlayerSection}>
          {batterHeadshot && (
            <View style={styles.pitchPlayerInfo}>
              <Image
                source={{ uri: batterHeadshot }}
                style={styles.pitchPlayerHeadshot}
                defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=B' }}
              />
              <Text style={styles.pitchPlayerName}>
                {batter.fullName ? 
                  `${batter.fullName.split(' ')[0][0]}. ${batter.fullName.split(' ').pop()}` : 
                  'Batter'}
              </Text>
              <Text style={styles.pitchPlayerRole}>Batter</Text>
            </View>
          )}
        </View>

        {/* Strike Zone Visualization */}
        <View style={styles.strikeZoneContainer}>
          <View style={styles.strikeZoneOutline} />
          {pitchArray.map((pitch, index) => {
            // Try multiple coordinate sources
            let pitchData = null;
            
            if (pitch.pitchData?.coordinates) {
              pitchData = pitch.pitchData;
            } else if (pitch.coordinates) {
              pitchData = { coordinates: pitch.coordinates };
            } else if (pitch.pitchData?.pX !== undefined && pitch.pitchData?.pZ !== undefined) {
              pitchData = { coordinates: { pX: pitch.pitchData.pX, pZ: pitch.pitchData.pZ } };
            } else if (pitch.pitchNumber?.pX !== undefined && pitch.pitchNumber?.pZ !== undefined) {
              pitchData = { coordinates: { pX: pitch.pitchNumber.pX, pZ: pitch.pitchNumber.pZ } };
            } else if (pitch.pX !== undefined && pitch.pZ !== undefined) {
              pitchData = { coordinates: { pX: pitch.pX, pZ: pitch.pZ } };
            }
            
            if (!pitchData?.coordinates || (pitchData.coordinates.pX === undefined || pitchData.coordinates.pZ === undefined)) {
              return null;
            }

            // Convert plate coordinates to percentage - exact web algorithm
            const xPercent = ((pitchData.coordinates.pX + 2.0) / 4.0) * 100;
            const yPercent = pitchData.strikeZoneTop && pitchData.strikeZoneBottom ? 
              ((pitchData.strikeZoneTop - pitchData.coordinates.pZ) / 
               (pitchData.strikeZoneTop - pitchData.strikeZoneBottom)) * 60 + 20 : 50;

            // Constrain to visualization area
            const finalXPercent = Math.max(5, Math.min(95, xPercent));
            const finalYPercent = Math.max(5, Math.min(95, yPercent));

            // Convert percentages to pixel positions for React Native (120px container)
            const finalX = (finalXPercent / 100) * 120 - 6; // Center the 12px dot
            const finalY = (finalYPercent / 100) * 120 - 6; // Center the 12px dot

            // Determine pitch color based on call
            let pitchColor = '#4CAF50'; // Green for balls
            if (pitch.details?.isStrike) {
              pitchColor = '#f44336'; // Red for strikes
            } else if (pitch.details?.isInPlay) {
              pitchColor = '#2196F3'; // Blue for in play
            }

            return (
              <View
                key={index}
                style={[
                  styles.pitchLocation,
                  { 
                    backgroundColor: pitchColor,
                    left: finalX,
                    top: finalY,
                    position: 'absolute',
                    zIndex: 10,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }
                ]}
              >
                <Text style={styles.pitchNumberOnBall}>{index + 1}</Text>
              </View>
            );
          })}
        </View>

        {/* Pitcher Section */}
        <View style={styles.pitchPlayerSection}>
          {pitcherHeadshot && (
            <View style={styles.pitchPlayerInfo}>
              <Image
                source={{ uri: pitcherHeadshot }}
                style={styles.pitchPlayerHeadshot}
                defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=P' }}
              />
              <Text style={styles.pitchPlayerName}>
                {pitcher.fullName ? 
                  `${pitcher.fullName.split(' ')[0][0]}. ${pitcher.fullName.split(' ').pop()}` : 
                  'Pitcher'}
              </Text>
              <Text style={styles.pitchPlayerRole}>Pitcher</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderPlayBasesSmall = (play) => {
    const hasFirst = !!play.matchup?.postOnFirst;
    const hasSecond = !!play.matchup?.postOnSecond;
    const hasThird = !!play.matchup?.postOnThird;

    return (
      <View style={styles.playBasesSmall}>
        {/* Second base (top) */}
        <View style={[styles.playBaseSmall, styles.secondBaseSmall, hasSecond && styles.occupiedBaseSmall]} />
        {/* First and Third base row */}
        <View style={styles.playBasesRowSmall}>
          <View style={[styles.playBaseSmall, styles.thirdBaseSmall, hasThird && styles.occupiedBaseSmall]} />
          <View style={[styles.playBaseSmall, styles.firstBaseSmall, hasFirst && styles.occupiedBaseSmall]} />
        </View>
      </View>
    );
  };

  const renderPlayBases = (play) => {
    if (!play.matchup?.postOnFirst && !play.matchup?.postOnSecond && !play.matchup?.postOnThird) {
      return null;
    }

    const hasFirst = !!play.matchup?.postOnFirst;
    const hasSecond = !!play.matchup?.postOnSecond;
    const hasThird = !!play.matchup?.postOnThird;

    return (
      <View style={styles.playBasesContainer}>
        <Text style={styles.basesTitle}>Bases After Play</Text>
        <View style={styles.playBasesDisplay}>
          <View style={styles.playBasesRow}>
            <View style={[styles.playBase, styles.thirdBase, hasThird && styles.occupiedBase]} />
            <View style={[styles.playBase, styles.firstBase, hasFirst && styles.occupiedBase]} />
          </View>
          <View style={[styles.playBase, styles.secondBase, hasSecond && styles.occupiedBase]} />
        </View>
      </View>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'stats':
        return renderStatsContent();
      case 'away':
        return renderTeamContent('away');
      case 'home':
        return renderTeamContent('home');
      case 'plays':
        return renderPlaysContent();
      default:
        return renderStatsContent();
    }
  };

  const renderPlayerGameStats = (stats, player) => {
    if (!stats) return null;

    const isPitcher = player.position?.abbreviation === 'P' || player.allPositions?.some(pos => pos.abbreviation === 'P');
    const battingStats = stats.batting || {};
    const pitchingStats = stats.pitching || {};

    return (
      <View>
        {/* Game Info */}
        <View style={styles.gameStatsHeader}>
          <Text style={styles.gameStatsTitle}>Game Statistics</Text>
          <Text style={styles.gameStatsDate}>{new Date().toLocaleDateString()}</Text>
        </View>

        {/* Batting Stats */}
        {Object.keys(battingStats).length > 0 && (
          <View style={styles.statCategoryContainer}>
            <Text style={styles.statCategoryTitle}>Batting</Text>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>At Bats</Text>
              <Text style={styles.playerStatValue}>{battingStats.atBats || 0}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>Runs</Text>
              <Text style={styles.playerStatValue}>{battingStats.runs || 0}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>Hits</Text>
              <Text style={styles.playerStatValue}>{battingStats.hits || 0}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>RBI</Text>
              <Text style={styles.playerStatValue}>{battingStats.rbi || 0}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>Doubles</Text>
              <Text style={styles.playerStatValue}>{battingStats.doubles || 0}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>Triples</Text>
              <Text style={styles.playerStatValue}>{battingStats.triples || 0}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>Home Runs</Text>
              <Text style={styles.playerStatValue}>{battingStats.homeRuns || 0}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>Walks</Text>
              <Text style={styles.playerStatValue}>{battingStats.baseOnBalls || 0}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>Strikeouts</Text>
              <Text style={styles.playerStatValue}>{battingStats.strikeOuts || 0}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>Stolen Bases</Text>
              <Text style={styles.playerStatValue}>{battingStats.stolenBases || 0}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>Avg</Text>
              <Text style={styles.playerStatValue}>{battingStats.avg || '.000'}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>OBP</Text>
              <Text style={styles.playerStatValue}>{battingStats.obp || '.000'}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>SLG</Text>
              <Text style={styles.playerStatValue}>{battingStats.slg || '.000'}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>OPS</Text>
              <Text style={styles.playerStatValue}>{battingStats.ops || '.000'}</Text>
            </View>
          </View>
        )}

        {/* Pitching Stats */}
        {Object.keys(pitchingStats).length > 0 && (
          <View style={styles.statCategoryContainer}>
            <Text style={styles.statCategoryTitle}>Pitching</Text>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>Innings Pitched</Text>
              <Text style={styles.playerStatValue}>{pitchingStats.inningsPitched || '0.0'}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>Hits Allowed</Text>
              <Text style={styles.playerStatValue}>{pitchingStats.hits || 0}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>Runs Allowed</Text>
              <Text style={styles.playerStatValue}>{pitchingStats.runs || 0}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>Earned Runs</Text>
              <Text style={styles.playerStatValue}>{pitchingStats.earnedRuns || 0}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>Walks</Text>
              <Text style={styles.playerStatValue}>{pitchingStats.baseOnBalls || 0}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>Strikeouts</Text>
              <Text style={styles.playerStatValue}>{pitchingStats.strikeOuts || 0}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>Home Runs Allowed</Text>
              <Text style={styles.playerStatValue}>{pitchingStats.homeRuns || 0}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>Pitches</Text>
              <Text style={styles.playerStatValue}>{pitchingStats.numberOfPitches || 0}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>Strikes</Text>
              <Text style={styles.playerStatValue}>{pitchingStats.strikes || 0}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>ERA</Text>
              <Text style={styles.playerStatValue}>{pitchingStats.era || '0.00'}</Text>
            </View>
            <View style={styles.playerStatRow}>
              <Text style={styles.playerStatLabel}>WHIP</Text>
              <Text style={styles.playerStatValue}>{pitchingStats.whip || '0.00'}</Text>
            </View>
          </View>
        )}

        {/* No Stats Message */}
        {Object.keys(battingStats).length === 0 && Object.keys(pitchingStats).length === 0 && (
          <View style={styles.noStatsContainer}>
            <Text style={styles.noStatsText}>No statistics available for this game</Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#002D72" />
        <Text style={styles.loadingText}>Loading Game Details...</Text>
      </View>
    );
  }

  if (!gameData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Game data not available</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => loadGameDetails()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {renderGameHeader()}
        {renderTabNavigation()}
        {renderTabContent()}
      </ScrollView>
      {renderStickyHeader()}
      
      {/* Player Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={playerModalVisible}
        onRequestClose={closePlayerModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Close Button */}
            <TouchableOpacity style={styles.modalCloseButton} onPress={closePlayerModal}>
              <Text style={styles.modalCloseText}>×</Text>
            </TouchableOpacity>

            {selectedPlayer && (
              <>
                {/* Player Header */}
                <View style={styles.playerHeader}>
                  <Image 
                    source={{ 
                      uri: MLBService.getHeadshotUrl(selectedPlayer.person?.id) 
                    }}
                    style={styles.playerHeadshot}
                    defaultSource={{ uri: 'https://via.placeholder.com/80x80?text=Player' }}
                  />
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>
                      {selectedPlayer.person?.fullName || 'Unknown Player'}
                    </Text>
                    <Text style={styles.playerDetails}>
                      #{selectedPlayer.jerseyNumber || 'N/A'} • {selectedPlayer.position?.abbreviation || 'N/A'}
                    </Text>
                    <View style={styles.playerTeamInfo}>
                      <Image 
                        source={{ uri: MLBService.getLogoUrl(selectedPlayer.team?.name || '', selectedPlayer.team?.abbreviation) }}
                        style={styles.playerTeamLogo}
                        defaultSource={{ uri: 'https://via.placeholder.com/20x20?text=MLB' }}
                      />
                      <Text style={styles.playerTeamName}>
                        {selectedPlayer.team?.name || 'Unknown Team'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Player Stats */}
                <View style={styles.playerStatsContainer}>
                  {loadingPlayerStats ? (
                    <View style={styles.playerStatsLoading}>
                      <ActivityIndicator size="large" color="#002D72" />
                      <Text style={styles.loadingText}>Loading player stats...</Text>
                    </View>
                  ) : playerStats ? (
                    <ScrollView style={styles.playerStatsContent}>
                      {renderPlayerGameStats(playerStats, selectedPlayer)}
                    </ScrollView>
                  ) : (
                    <Text style={styles.noStatsText}>Unable to load player statistics</Text>
                  )}
                </View>
              </>
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
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  stickyTeamAway: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-start',
  },
  stickyTeamHome: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  stickyTeamLogo: {
    width: 28,
    height: 28,
    marginHorizontal: 8,
  },
  stickyTeamScore: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#002D72',
    minWidth: 35,
    textAlign: 'center',
  },
  losingStickyTeamScore: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#999',
    minWidth: 35,
    textAlign: 'center',
  },
  stickyStatus: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  stickyStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#002D72',
    textAlign: 'center',
  },
  stickyClock: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#002D72',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  gameHeader: {
    backgroundColor: 'white',
    padding: 20,
    marginBottom: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  teamContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  team: {
    alignItems: 'center',
    flex: 1,
  },
  teamLogo: {
    width: 50,
    height: 50,
    marginVertical: 8,
  },
  teamNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
    gap: 5,
  },
  teamName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  losingTeamName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textAlign: 'center',
  },
  teamScore: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#002D72',
    marginBottom: 5,
  },
  losingTeamScore: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#999',
    marginBottom: 5,
  },
  vsContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  vsText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 5,
  },
  gameStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: '#002D72',
    marginBottom: 2,
  },
  gameClock: {
    fontSize: 12,
    color: '#666',
  },
  gameInfo: {
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 15,
  },
  venue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 5,
  },
  date: {
    fontSize: 12,
    color: '#666',
  },
  basesContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  basesDisplay: {
    alignItems: 'center',
  },
  basesRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  base: {
    width: 8,
    height: 8,
    backgroundColor: '#ddd',
    transform: [{ rotate: '45deg' }],
    margin: 1,
  },
  firstBase: {
    marginLeft: 12,
  },
  secondBase: {
    marginBottom: 2,
  },
  thirdBase: {
    marginRight: 12,
  },
  occupiedBase: {
    backgroundColor: '#002D72',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  section: {
    backgroundColor: 'white',
    padding: 20,
    marginBottom: 10,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonBorder: {
    borderRightWidth: 1,
    borderRightColor: '#e9ecef',
  },
  activeTabButton: {
    backgroundColor: '#002D72',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  activeTabText: {
    color: 'white',
  },
  teamBoxScoreContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
  },
  teamBoxScoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  teamBoxScoreLogo: {
    width: 30,
    height: 30,
    marginRight: 12,
  },
  statCategoryContainer: {
    backgroundColor: 'white',
    borderRadius: 6,
    padding: 10,
    marginBottom: 15,
  },
  statCategoryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#002D72',
    marginBottom: 10,
    textAlign: 'center',
  },
  statTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#e9ecef',
    paddingVertical: 8,
    paddingHorizontal: 5,
    borderRadius: 4,
    marginBottom: 5,
  },
  statTableHeaderPlayer: {
    flex: 2,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#495057',
  },
  statTableHeaderStat: {
    flex: 1,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#495057',
    textAlign: 'center',
  },
  statTableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    alignItems: 'center',
  },
  statTablePlayerCell: {
    flex: 2,
    justifyContent: 'center',
  },
  statTablePlayerName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  statTablePlayerNumber: {
    fontSize: 11,
    color: '#666',
  },
  statTableStatCell: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    textAlign: 'center',
  },
  placeholderContainer: {
    padding: 40,
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  momentumContainer: {
    marginBottom: 20,
  },
  momentumChart: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  momentumChartWhite: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  teamLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  teamLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  awayTeamLabel: {
    textAlign: 'left',
  },
  homeTeamLabel: {
    textAlign: 'right',
  },
  teamLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  momentumTeamLogo: {
    width: 18,
    height: 18,
    marginRight: 6,
  },
  inningBarsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inningBar: {
    alignItems: 'center',
    marginHorizontal: 4,
    minWidth: 45,
    height: 160, // Increased to accommodate repositioned away bars
    position: 'relative',
    justifyContent: 'center',
  },
  awayBarContainer: {
    position: 'absolute',
    bottom: 85, // Position from center upward - increased for more spacing
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  homeBarContainer: {
    position: 'absolute',
    top: 80, // Position from center downward (140/2 = 70)
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  activityBar: {
    width: 40,
    borderRadius: 4,
    marginVertical: 4,
  },
  awayBar: {
    backgroundColor: '#A71930',
  },
  homeBar: {
    backgroundColor: '#002D62',
  },
  barText: {
    color: '#333',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 2,
  },
  inningLabel: {
    color: '#666',
    fontSize: 11,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  inningLabelContainer: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    transform: [{ translateY: -10 }],
  },
  teamStatsContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  statsTeams: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statsTeam: {
    flex: 1,
    alignItems: 'center',
  },
  statsTeamLogo: {
    width: 30,
    height: 30,
    marginBottom: 4,
  },
  statsTeamName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  statsSection: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    padding: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 8,
  },
  statsValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    width: 60,
    textAlign: 'center',
  },
  statsBarContainer: {
    flex: 1,
    flexDirection: 'row',
    height: 20,
    marginHorizontal: 12,
  },
  statsBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  statsBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  awayBarFill: {
    alignSelf: 'flex-start',
  },
  homeBarFill: {
    alignSelf: 'flex-end',
  },
  statsLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    flex: 1,
  },
  playsContainer: {
    marginTop: 10,
  },
  playsScrollView: {
    maxHeight: 600,
  },
  playCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  playHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  playInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  playTeamLogo: {
    width: 24,
    height: 24,
    marginRight: 10,
  },
  playSummary: {
    flex: 1,
  },
  playTeamName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#002D72',
    marginBottom: 2,
  },
  playResult: {
    fontSize: 14,
    color: '#333',
  },
  playScoreSection: {
    alignItems: 'center',
    marginRight: 10,
  },
  playBasesSmall: {
    marginTop: 4,
    alignItems: 'center',
    width: 24,
    height: 20,
    position: 'relative',
  },
  playBasesRowSmall: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 20,
    marginTop: 2,
  },
  playBaseSmall: {
    width: 4,
    height: 4,
    backgroundColor: '#ddd',
    transform: [{ rotate: '45deg' }],
    borderRadius: 0.5,
  },
  thirdBaseSmall: {
    // Position for third base (left side of bottom row)
  },
  firstBaseSmall: {
    // Position for first base (right side of bottom row)  
  },
  secondBaseSmall: {
    // Position for second base (center, above the row)
    alignSelf: 'center',
    marginBottom: 2,
  },
  occupiedBaseSmall: {
    backgroundColor: '#002D72',
    shadowColor: '#002D72',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 1,
    elevation: 2,
  },
  playInning: {
    fontSize: 10,
    color: '#666',
    marginBottom: 2,
  },
  playScore: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#002D72',
  },
  toggleIcon: {
    fontSize: 12,
    color: '#666',
  },
  toggleIconOpen: {
    transform: [{ rotate: '90deg' }],
  },
  playDetails: {
    padding: 15,
    backgroundColor: '#f8f9fa',
  },
  pitchSequence: {
    marginTop: 10,
  },
  pitchSequenceBox: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 15,
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pitchSequenceTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#002D72',
    marginBottom: 15,
    textAlign: 'center',
  },
  pitchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  pitchNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#002D72',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  pitchNumberText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  pitchInfo: {
    flex: 1,
  },
  pitchMainInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  pitchTypeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#002D72',
    marginRight: 8,
  },
  pitchSpeedText: {
    fontSize: 12,
    color: '#666',
    fontWeight: 'bold',
    marginRight: 8,
  },
  pitchCountText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  pitchActionText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
  },
  pitchContainer: {
    padding: 10,
    backgroundColor: 'white',
    borderRadius: 6,
    marginBottom: 8,
  },
  pitchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pitchCount: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#002D72',
  },
  pitchSpeed: {
    fontSize: 12,
    color: '#666',
    fontWeight: 'bold',
  },
  pitchDescription: {
    fontSize: 13,
    color: '#333',
    marginBottom: 4,
  },
  pitchType: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
  },
  pitchVisualization: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  pitchPlayerSection: {
    width: 60,
    alignItems: 'center',
  },
  pitchPlayerInfo: {
    alignItems: 'center',
  },
  pitchPlayerHeadshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 4,
    borderWidth: 2,
    borderColor: '#002D72',
  },
  pitchPlayerName: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#002D72',
    textAlign: 'center',
  },
  pitchPlayerRole: {
    fontSize: 8,
    color: '#666',
    textAlign: 'center',
    marginTop: 1,
  },
  strikeZoneContainer: {
    width: 120,
    height: 120,
    position: 'relative',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#333',
    marginHorizontal: 10,
  },
  strikeZoneOutline: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderWidth: 2,
    borderColor: '#777',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 2,
    top: '50%',
    left: '50%',
    marginLeft: -30,
    marginTop: -30,
  },
  pitchLocation: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fff',
    zIndex: 2,
  },
  pitchNumberOnBall: {
    color: 'white',
    fontSize: 8,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  pitchData: {
    flex: 1,
  },
  pitchDataText: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
  },
  playBasesContainer: {
    marginTop: 15,
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  basesTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#002D72',
    marginBottom: 8,
    textAlign: 'center',
  },
  playBasesDisplay: {
    alignItems: 'center',
  },
  playBasesRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  playBase: {
    width: 12,
    height: 12,
    backgroundColor: '#ddd',
    transform: [{ rotate: '45deg' }],
    margin: 2,
  },
  occupiedBase: {
    backgroundColor: '#002D72',
  },
  lineScoreContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  lineScoreTable: {
    minWidth: '100%',
  },
  lineScoreRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 8,
  },
  lineScoreCell: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamCell: {
    width: 60,
  },
  lineScoreHeaderText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  lineScoreTeamText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#002D72',
  },
  lineScoreText: {
    fontSize: 12,
    color: '#666',
  },
  lineScoreTotalText: {
    fontWeight: 'bold',
    color: '#002D72',
  },
  currentPlayContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  currentPlayContent: {
    alignItems: 'center',
  },
  currentPlayText: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  currentPlayDetails: {
    fontSize: 12,
    color: '#666',
  },
  lineScoreContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  lineScoreTable: {
    minWidth: '100%',
  },
  lineScoreRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 8,
  },
  lineScoreCell: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamCell: {
    width: 60,
  },
  lineScoreHeaderText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  lineScoreTeamText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#002D72',
  },
  lineScoreText: {
    fontSize: 12,
    color: '#666',
  },
  lineScoreTotalText: {
    fontWeight: 'bold',
    color: '#002D72',
  },
  currentPlayContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  currentPlayContent: {
    alignItems: 'center',
  },
  lineScoreTeamContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineScoreTeamLogo: {
    width: 16,
    height: 16,
    marginRight: 4,
  },
  teamLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  momentumTeamLogo: {
    width: 16,
    height: 16,
    marginRight: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    width: '100%',
    maxHeight: '80%',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalCloseButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  modalCloseText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  playerHeadshot: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginRight: 15,
    backgroundColor: '#f0f0f0',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  playerDetails: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  playerTeamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerTeamLogo: {
    width: 20,
    height: 20,
    marginRight: 6,
  },
  playerTeamName: {
    fontSize: 14,
    color: '#002D72',
    fontWeight: '600',
  },
  playerStatsContainer: {
    maxHeight: 400,
    marginTop: 10,
  },
  playerStatsLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  playerStatsContent: {
    paddingBottom: 10,
  },
  gameStatsHeader: {
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  gameStatsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#002D72',
    marginBottom: 4,
  },
  gameStatsDate: {
    fontSize: 14,
    color: '#666',
  },
  playerStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  playerStatLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  playerStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'right',
  },
  noStatsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  noStatsText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    padding: 40,
  },
});

export default MLBGameDetailsScreen;

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { useFavorites } from '../context/FavoritesContext';
import { useTheme } from '../context/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';

// Enhanced logo function with dark mode support and fallbacks
const getTeamLogoUrls = (teamId, isDarkMode) => {
  const primaryUrl = isDarkMode
    ? `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`
    : `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
  
  const fallbackUrl = isDarkMode
    ? `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`
    : `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`;

  return { primaryUrl, fallbackUrl };
};

// TeamLogoImage component with dark mode and fallback support
const TeamLogoImage = React.memo(({ teamId, style, isDarkMode }) => {
  const [logoSource, setLogoSource] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const { primaryUrl } = getTeamLogoUrls(teamId, isDarkMode);
    setLogoSource({ uri: primaryUrl });
    setRetryCount(0);
  }, [teamId, isDarkMode]);

  const handleError = () => {
    if (retryCount === 0) {
      const { fallbackUrl } = getTeamLogoUrls(teamId, isDarkMode);
      setLogoSource({ uri: fallbackUrl });
      setRetryCount(1);
    } else {
      setLogoSource(null);
    }
  };

  return (
    <Image
      style={style}
      source={logoSource || require('../../assets/soccer.png')}
      onError={handleError}
    />
  );
});

// Utility function to get comprehensive game status
const getGameStatus = (game, sport = 'unknown') => {
  if (!game) return { 
    isLive: false, 
    isPre: true, 
    isPost: false, 
    text: 'No game scheduled',
    time: '',
    detail: ''
  };

  // Handle different API formats based on sport
  if (sport.toLowerCase() === 'mlb') {
    // MLB API format
    const abstractState = game.status?.abstractGameState;
    const detailedState = game.status?.detailedState;
    
    const isLive = abstractState === 'Live';
    const isPre = abstractState === 'Preview';
    const isPost = abstractState === 'Final';
    
    if (isLive) {
      return { isLive: true, isPre: false, isPost: false, text: 'Live', time: '', detail: detailedState || '' };
    } else if (isPre) {
      const gameDate = new Date(game.gameDate || game.date);
      return { 
        isLive: false, 
        isPre: true, 
        isPost: false, 
        text: 'Scheduled',
        time: gameDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        detail: gameDate.toLocaleDateString()
      };
    } else if (isPost) {
      return { isLive: false, isPre: false, isPost: true, text: 'Final', time: '', detail: detailedState || '' };
    }
  } else {
    // ESPN API format (NFL, NBA, Soccer)
    const status = game.status?.type || game.competitions?.[0]?.status?.type;
    const state = status?.state;
    const name = status?.name;
    const completed = status?.completed;
    const displayClock = game.status?.displayClock || game.competitions?.[0]?.status?.displayClock || '';
    const period = game.status?.period || game.competitions?.[0]?.status?.period;
    
    const isLive = state === 'in';
    const isPre = state === 'pre';
    const isPost = state === 'post' || completed;
    
    if (isLive) {
      let detail = '';
      if (sport.toLowerCase() === 'nfl' && period) {
        if (period <= 4) {
          const quarters = ['1st', '2nd', '3rd', '4th'];
          detail = quarters[period - 1] || `Q${period}`;
        } else {
          detail = 'OT';
        }
      } else if (sport.toLowerCase() === 'soccer') {
        detail = displayClock || '';
      }
      
      return { isLive: true, isPre: false, isPost: false, text: 'Live', time: displayClock, detail };
    } else if (isPre) {
      const gameDate = new Date(game.date);
      return { 
        isLive: false, 
        isPre: true, 
        isPost: false, 
        text: 'Scheduled',
        time: gameDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        detail: gameDate.toLocaleDateString()
      };
    } else if (isPost) {
      return { isLive: false, isPre: false, isPost: true, text: 'Final', time: '', detail: name || '' };
    }
  }
  
  // Fallback
  if (game.date) {
    const gameDate = new Date(game.date);
    return { 
      isLive: false, 
      isPre: true, 
      isPost: false, 
      text: 'Scheduled',
      time: gameDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      detail: gameDate.toLocaleDateString()
    };
  }
  
  return { isLive: false, isPre: true, isPost: false, text: 'Status unknown', time: '', detail: '' };
};

// Extract team data from current game based on sport
const getTeamData = (currentGame, sport) => {
  if (!currentGame) return { homeTeam: null, awayTeam: null, homeScore: '0', awayScore: '0' };
  
  if (sport.toLowerCase() === 'mlb') {
    // MLB uses competitions array
    const competition = currentGame.competitions?.[0];
    if (!competition) return { homeTeam: null, awayTeam: null, homeScore: '0', awayScore: '0' };
    
    const awayTeam = competition.competitors?.find(team => team.homeAway === 'away');
    const homeTeam = competition.competitors?.find(team => team.homeAway === 'home');
    
    const homeScore = homeTeam?.score?.displayValue || homeTeam?.score || '0';
    const awayScore = awayTeam?.score?.displayValue || awayTeam?.score || '0';
    
    return { homeTeam, awayTeam, homeScore, awayScore };
  } else {
    // NFL/NBA/Soccer use homeTeam/awayTeam directly
    const homeTeam = currentGame.homeTeam;
    const awayTeam = currentGame.awayTeam;
    const homeScore = homeTeam?.score || '0';
    const awayScore = awayTeam?.score || '0';
    
    return { homeTeam, awayTeam, homeScore, awayScore };
  }
};

// Extract most recent play from game data
const extractMostRecentPlay = (game, homeTeam, awayTeam) => {
  if (!game) return null;
  
  try {
    const nonEmpty = (v) => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s.length > 0 ? s : null;
    };

    // 1) MLB statsapi liveData with plays.allPlays
    const isMLB = String(game.sport || '').toLowerCase().includes('mlb') || Boolean(game.mlbGameData);
    const mlbAllPlays = (isMLB && (game.liveData?.plays?.allPlays || game.liveData?.allPlays || game.mlbGameData?.liveData?.plays?.allPlays)) || null;
    
    if (isMLB && mlbAllPlays && Array.isArray(mlbAllPlays) && mlbAllPlays.length > 0) {
      const last = mlbAllPlays[mlbAllPlays.length - 1];
      const currentPlayObj = game.liveData?.plays?.currentPlay || null;
      
      let playText = '';
      try {
        // Priority order for MLB play text
        if (nonEmpty(currentPlayObj?.result?.description)) {
          playText = String(currentPlayObj.result.description).trim();
        } else if (nonEmpty(last?.result?.description)) {
          playText = String(last.result.description).trim();
        } else if (nonEmpty(currentPlayObj?.about?.playText) || nonEmpty(currentPlayObj?.about?.description)) {
          playText = String(nonEmpty(currentPlayObj.about?.playText) || nonEmpty(currentPlayObj.about?.description)).trim();
        } else if (nonEmpty(last?.about?.playText) || nonEmpty(last?.about?.description)) {
          playText = String(nonEmpty(last.about?.playText) || nonEmpty(last.about?.description)).trim();
        } else {
          // Fallback to matchup info
          const batterName = last.matchup?.batter?.fullName || currentPlayObj?.matchup?.batter?.fullName || '';
          const pitcherName = last.matchup?.pitcher?.fullName || currentPlayObj?.matchup?.pitcher?.fullName || '';
          if (batterName || pitcherName) {
            playText = `${batterName}${batterName && pitcherName ? ' vs ' : ''}${pitcherName}`.trim();
          }
        }
      } catch (e) {
        playText = last.result?.description || last.about?.playText || '';
      }

      // Determine which team made the play
      let inferredIsHome = null;
      try {
        const half = last.about?.halfInning || last.about?.half || last.about?.inningState || null;
        if (half) {
          if (String(half).toLowerCase().startsWith('t') || String(half).toLowerCase().includes('top')) {
            inferredIsHome = false;
          } else if (String(half).toLowerCase().startsWith('b') || String(half).toLowerCase().includes('bot')) {
            inferredIsHome = true;
          }
        }
      } catch (e) {}

      return {
        text: playText || '',
        shortText: last.result?.brief || last.result?.eventType || last.result?.event || '',
        team: last.team || null,
        inferredIsHome,
        raw: last
      };
    }

    // 2) ESPN-style plays data
    if (game.playsData && Array.isArray(game.playsData) && game.playsData.length > 0) {
      const mostRecent = game.playsData[0];
      return {
        text: mostRecent.text || mostRecent.shortText || mostRecent.type?.text || '',
        shortText: mostRecent.shortText || mostRecent.text || '',
        team: mostRecent.team || mostRecent.by || mostRecent.actor || null,
        raw: mostRecent
      };
    }

    // 3) Direct plays array
    if (game.plays && Array.isArray(game.plays) && game.plays.length > 0) {
      const first = game.plays[0];
      return {
        text: first.text || first.shortText || '',
        shortText: first.shortText || first.text || '',
        team: first.team || null,
        raw: first
      };
    }

    return null;
  } catch (err) {
    console.log('Error extracting most recent play:', err?.message || err);
    return null;
  }
};

// MLB-specific game card component
const MLBGameCard = ({ team, currentGame, isDarkMode, onPress }) => {
  const { teamId, teamName, sport, abbreviation } = team;
  const gameStatus = getGameStatus(currentGame, 'mlb');
  const { homeTeam, awayTeam, homeScore, awayScore } = getTeamData(currentGame, 'mlb');
  
  const cardStyle = [
    styles.gameCard,
    { 
      backgroundColor: isDarkMode ? '#2c2c2c' : '#ffffff',
      borderColor: isDarkMode ? '#444' : '#e0e0e0',
    }
  ];

  const textColor = isDarkMode ? '#ffffff' : '#000000';
  const subtitleColor = isDarkMode ? '#cccccc' : '#666666';

  // Get team abbreviations for display
  const getMLBTeamAbbr = (team) => {
    return team?.team?.abbreviation || team?.abbreviation || team?.team?.shortDisplayName || 'MLB';
  };

  const homeAbbr = getMLBTeamAbbr(homeTeam);
  const awayAbbr = getMLBTeamAbbr(awayTeam);

  // Extract current play information
  const currentPlay = extractMostRecentPlay(currentGame, homeTeam, awayTeam);

  const renderMiddleSection = () => {
    if (gameStatus.isLive && currentGame.liveData?.situation) {
      // Live game - show inning, count, bases, outs
      const situation = currentGame.liveData.situation;
      const inningText = `${situation.isTopInning ? 'Top' : 'Bot'} ${situation.inning || 1}`;
      const ballsStrikesText = `${situation.balls || 0}-${situation.strikes || 0}`;
      const outsText = `${situation.outs || 0} out${(situation.outs || 0) !== 1 ? 's' : ''}`;
      
      return (
        <View style={styles.liveGameMiddleSection}>
          <Text style={[styles.liveInningText, { color: textColor }]}>{inningText}</Text>
          <Text style={[styles.liveCountText, { color: textColor }]}>{ballsStrikesText}</Text>
          <View style={styles.miniBasesContainer}>
            <View style={[
              styles.miniBase, 
              { backgroundColor: situation.bases?.second ? '#4CAF50' : 'transparent' }
            ]} />
            <View style={styles.miniBasesRow}>
              <View style={[
                styles.miniBase, 
                { backgroundColor: situation.bases?.third ? '#4CAF50' : 'transparent' }
              ]} />
              <View style={[
                styles.miniBase, 
                { backgroundColor: situation.bases?.first ? '#4CAF50' : 'transparent' }
              ]} />
            </View>
          </View>
          <Text style={[styles.liveOutsText, { color: textColor }]}>{outsText}</Text>
        </View>
      );
    } else {
      // Scheduled or finished game
      return (
        <View style={styles.gameStatusSection}>
          <Text style={[styles.statusText, { color: gameStatus.isLive ? '#ff4444' : subtitleColor }]}>
            {gameStatus.text}
          </Text>
          {gameStatus.time && (
            <Text style={[styles.timeText, { color: subtitleColor }]}>{gameStatus.time}</Text>
          )}
          {gameStatus.detail && (
            <Text style={[styles.detailText, { color: subtitleColor }]}>{gameStatus.detail}</Text>
          )}
        </View>
      );
    }
  };

  return (
    <TouchableOpacity style={cardStyle} onPress={onPress}>
      <View style={styles.gameCardContent}>
        <View style={styles.teamSection}>
          <TeamLogoImage
            teamId={teamId}
            style={styles.teamLogo}
            isDarkMode={isDarkMode}
          />
          <View style={styles.teamInfo}>
            <Text style={[styles.teamName, { color: textColor }]}>{teamName}</Text>
            <Text style={[styles.sport, { color: subtitleColor }]}>{sport}</Text>
          </View>
        </View>
        
        {homeTeam && awayTeam && (
          <View style={styles.scoreSection}>
            <View style={styles.scoreRow}>
              <Text style={[styles.teamAbbr, { color: textColor }]}>{awayAbbr}</Text>
              <Text style={[styles.teamScore, { color: textColor }]}>{awayScore}</Text>
            </View>
            <View style={styles.scoreRow}>
              <Text style={[styles.teamAbbr, { color: textColor }]}>{homeAbbr}</Text>
              <Text style={[styles.teamScore, { color: textColor }]}>{homeScore}</Text>
            </View>
          </View>
        )}
        
        {renderMiddleSection()}
        
        {gameStatus.isLive && (
          <View style={styles.liveIndicator}>
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
      </View>
      
      {/* Recent play text */}
      {currentPlay && currentPlay.text && (
        <View style={[styles.playTextContainer, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
          <Text style={[styles.playText, { color: subtitleColor }]} numberOfLines={2}>
            {currentPlay.text}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// NFL-specific game card component
const NFLGameCard = ({ team, currentGame, isDarkMode, onPress }) => {
  const { teamId, teamName, sport, abbreviation } = team;
  const gameStatus = getGameStatus(currentGame, 'nfl');
  const { homeTeam, awayTeam, homeScore, awayScore } = getTeamData(currentGame, 'nfl');
  
  const cardStyle = [
    styles.gameCard,
    { 
      backgroundColor: isDarkMode ? '#2c2c2c' : '#ffffff',
      borderColor: isDarkMode ? '#444' : '#e0e0e0',
    }
  ];

  const textColor = isDarkMode ? '#ffffff' : '#000000';
  const subtitleColor = isDarkMode ? '#cccccc' : '#666666';

  const homeAbbr = homeTeam?.abbreviation || homeTeam?.team?.abbreviation || 'NFL';
  const awayAbbr = awayTeam?.abbreviation || awayTeam?.team?.abbreviation || 'NFL';

  // Extract current play information
  const currentPlay = extractMostRecentPlay(currentGame, homeTeam, awayTeam);

  const renderMiddleSection = () => {
    if (gameStatus.isLive) {
      // Live game - show quarter and clock
      return (
        <View style={styles.liveGameMiddleSection}>
          <Text style={[styles.liveInningText, { color: textColor }]}>{gameStatus.detail}</Text>
          <Text style={[styles.liveCountText, { color: textColor }]}>{gameStatus.time}</Text>
          
          {/* Show down/distance info if available */}
          {currentGame.situation && (
            <Text style={[styles.liveOutsText, { color: textColor }]}>
              {currentGame.situation.down ? `${currentGame.situation.down} & ${currentGame.situation.distance || 0}` : ''}
            </Text>
          )}
        </View>
      );
    } else {
      return (
        <View style={styles.gameStatusSection}>
          <Text style={[styles.statusText, { color: gameStatus.isLive ? '#ff4444' : subtitleColor }]}>
            {gameStatus.text}
          </Text>
          {gameStatus.time && (
            <Text style={[styles.timeText, { color: subtitleColor }]}>{gameStatus.time}</Text>
          )}
          {gameStatus.detail && (
            <Text style={[styles.detailText, { color: subtitleColor }]}>{gameStatus.detail}</Text>
          )}
        </View>
      );
    }
  };

  return (
    <TouchableOpacity style={cardStyle} onPress={onPress}>
      <View style={styles.gameCardContent}>
        <View style={styles.teamSection}>
          <TeamLogoImage
            teamId={teamId}
            style={styles.teamLogo}
            isDarkMode={isDarkMode}
          />
          <View style={styles.teamInfo}>
            <Text style={[styles.teamName, { color: textColor }]}>{teamName}</Text>
            <Text style={[styles.sport, { color: subtitleColor }]}>{sport}</Text>
          </View>
        </View>
        
        {homeTeam && awayTeam && (
          <View style={styles.scoreSection}>
            <View style={styles.scoreRow}>
              <Text style={[styles.teamAbbr, { color: textColor }]}>{awayAbbr}</Text>
              <Text style={[styles.teamScore, { color: textColor }]}>{awayScore}</Text>
            </View>
            <View style={styles.scoreRow}>
              <Text style={[styles.teamAbbr, { color: textColor }]}>{homeAbbr}</Text>
              <Text style={[styles.teamScore, { color: textColor }]}>{homeScore}</Text>
            </View>
          </View>
        )}
        
        {renderMiddleSection()}
        
        {gameStatus.isLive && (
          <View style={styles.liveIndicator}>
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
      </View>
      
      {/* Recent play text */}
      {currentPlay && currentPlay.text && (
        <View style={[styles.playTextContainer, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
          <Text style={[styles.playText, { color: subtitleColor }]} numberOfLines={2}>
            {currentPlay.text}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// Generic game card component for other sports
const GenericGameCard = ({ team, currentGame, isDarkMode, onPress }) => {
  const { teamId, teamName, sport, abbreviation } = team;
  const gameStatus = getGameStatus(currentGame, sport);
  
  const cardStyle = [
    styles.gameCard,
    { 
      backgroundColor: isDarkMode ? '#2c2c2c' : '#ffffff',
      borderColor: isDarkMode ? '#444' : '#e0e0e0',
    }
  ];

  const textColor = isDarkMode ? '#ffffff' : '#000000';
  const subtitleColor = isDarkMode ? '#cccccc' : '#666666';

  // Extract current play information
  const currentPlay = extractMostRecentPlay(currentGame, null, null);

  return (
    <TouchableOpacity style={cardStyle} onPress={onPress}>
      <View style={styles.gameCardContent}>
        <View style={styles.teamSection}>
          <TeamLogoImage
            teamId={teamId}
            style={styles.teamLogo}
            isDarkMode={isDarkMode}
          />
          <View style={styles.teamInfo}>
            <Text style={[styles.teamName, { color: textColor }]}>
              {teamName || 'Unknown Team'}
            </Text>
            <Text style={[styles.sport, { color: subtitleColor }]}>
              {sport} {abbreviation ? `(${abbreviation})` : ''}
            </Text>
          </View>
        </View>
        
        <View style={styles.gameStatus}>
          <Text style={[
            styles.statusText, 
            { 
              color: gameStatus.isLive ? '#ff4444' : subtitleColor,
              fontWeight: gameStatus.isLive ? 'bold' : 'normal'
            }
          ]}>
            {gameStatus.text}
          </Text>
          {gameStatus.time && (
            <Text style={[styles.timeText, { color: subtitleColor }]}>{gameStatus.time}</Text>
          )}
          {gameStatus.detail && (
            <Text style={[styles.detailText, { color: subtitleColor }]}>{gameStatus.detail}</Text>
          )}
          {gameStatus.isLive && (
            <View style={styles.liveIndicator}>
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>
      </View>
      
      {/* Recent play text */}
      {currentPlay && currentPlay.text && (
        <View style={[styles.playTextContainer, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
          <Text style={[styles.playText, { color: subtitleColor }]} numberOfLines={2}>
            {currentPlay.text}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// Main Game card component that chooses the right sport-specific card
const GameCard = ({ team, isDarkMode, onPress }) => {
  const { sport, currentGame } = team;
  
  const sportLower = sport?.toLowerCase() || '';
  
  if (sportLower === 'mlb') {
    return <MLBGameCard team={team} currentGame={currentGame} isDarkMode={isDarkMode} onPress={onPress} />;
  } else if (sportLower === 'nfl') {
    return <NFLGameCard team={team} currentGame={currentGame} isDarkMode={isDarkMode} onPress={onPress} />;
  } else {
    return <GenericGameCard team={team} currentGame={currentGame} isDarkMode={isDarkMode} onPress={onPress} />;
  }
};

const FavoritesScreen = ({ navigation }) => {
  const { isDarkMode } = useTheme();
  const { 
    favorites, 
    loading, 
    autoPopulating, 
    refreshAllCurrentGames 
  } = useFavorites();
  
  const [refreshing, setRefreshing] = useState(false);

  // Handle manual refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshAllCurrentGames();
    } catch (error) {
      console.error('Error refreshing games:', error);
      Alert.alert('Error', 'Failed to refresh games. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  // Auto-refresh when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (!loading && !autoPopulating) {
        refreshAllCurrentGames().catch(err => 
          console.error('Auto-refresh failed:', err)
        );
      }
    }, [loading, autoPopulating, refreshAllCurrentGames])
  );

  const handleTeamPress = (team) => {
    // Navigate to appropriate team page based on sport
    const sport = team.sport?.toLowerCase();
    
    if (sport === 'mlb') {
      navigation.navigate('MLBTeamPage', { 
        teamId: team.teamId, 
        teamName: team.teamName 
      });
    } else if (sport === 'nfl') {
      navigation.navigate('NFLTeamPage', { 
        teamId: team.teamId, 
        teamName: team.teamName 
      });
    } else if (sport === 'nba') {
      navigation.navigate('NBATeamPage', { 
        teamId: team.teamId, 
        teamName: team.teamName 
      });
    } else if (sport?.includes('soccer') || sport?.includes('premier') || sport?.includes('uefa')) {
      navigation.navigate('UCLTeamPage', { 
        teamId: team.teamId, 
        teamName: team.teamName 
      });
    } else {
      Alert.alert('Notice', `Team page for ${sport} is not available yet.`);
    }
  };

  // Group favorites by sport for better organization
  const groupedFavorites = favorites.reduce((groups, team) => {
    const sport = team.sport || 'Other';
    if (!groups[sport]) {
      groups[sport] = [];
    }
    groups[sport].push(team);
    return groups;
  }, {});

  const containerStyle = [
    styles.container,
    { backgroundColor: isDarkMode ? '#121212' : '#f5f5f5' }
  ];

  const titleColor = isDarkMode ? '#ffffff' : '#000000';
  const subtitleColor = isDarkMode ? '#cccccc' : '#666666';

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: isDarkMode ? '#121212' : '#f5f5f5' }]}>
        <Text style={[styles.loadingText, { color: titleColor }]}>Loading favorites...</Text>
      </View>
    );
  }

  if (favorites.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: isDarkMode ? '#121212' : '#f5f5f5' }]}>
        <Text style={[styles.emptyTitle, { color: titleColor }]}>No Favorite Teams</Text>
        <Text style={[styles.emptySubtitle, { color: subtitleColor }]}>
          Add teams to your favorites from team pages to see their games here.
        </Text>
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <Text style={[styles.title, { color: titleColor }]}>Favorite Teams</Text>
      
      {autoPopulating && (
        <Text style={[styles.subtitle, { color: subtitleColor }]}>
          Loading current games...
        </Text>
      )}
      
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={isDarkMode ? '#ffffff' : '#000000'}
            title="Pull to refresh"
            titleColor={isDarkMode ? '#ffffff' : '#000000'}
          />
        }
      >
        {Object.entries(groupedFavorites).map(([sport, teams]) => (
          <View key={sport} style={styles.sportSection}>
            <Text style={[styles.sportTitle, { color: titleColor }]}>
              {sport.toUpperCase()} ({teams.length})
            </Text>
            
            {teams.map((team) => (
              <GameCard
                key={team.teamId}
                team={team}
                isDarkMode={isDarkMode}
                onPress={() => handleTeamPress(team)}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  scrollView: {
    flex: 1,
  },
  sportSection: {
    marginBottom: 24,
  },
  sportTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    marginLeft: 4,
  },
  gameCard: {
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
  },
  gameCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  teamSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamLogo: {
    width: 40,
    height: 40,
    marginRight: 12,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  sport: {
    fontSize: 14,
  },
  gameStatus: {
    alignItems: 'flex-end',
  },
  statusText: {
    fontSize: 14,
    textAlign: 'right',
    marginBottom: 4,
  },
  timeText: {
    fontSize: 12,
    textAlign: 'right',
    marginBottom: 2,
  },
  detailText: {
    fontSize: 12,
    textAlign: 'right',
  },
  liveIndicator: {
    backgroundColor: '#ff4444',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  liveText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Sport-specific styles
  scoreSection: {
    alignItems: 'center',
    marginHorizontal: 16,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  teamAbbr: {
    fontSize: 14,
    fontWeight: '500',
    minWidth: 40,
    textAlign: 'right',
    marginRight: 8,
  },
  teamScore: {
    fontSize: 18,
    fontWeight: 'bold',
    minWidth: 30,
    textAlign: 'center',
  },
  gameStatusSection: {
    alignItems: 'center',
    flex: 1,
  },
  // MLB-specific live game styles
  liveGameMiddleSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  liveInningText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  liveCountText: {
    fontSize: 11,
    marginBottom: 2,
  },
  liveOutsText: {
    fontSize: 11,
  },
  miniBasesContainer: {
    alignItems: 'center',
    marginVertical: 2,
  },
  miniBasesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 20,
  },
  miniBase: {
    width: 6,
    height: 6,
    borderWidth: 1,
    borderColor: '#666',
    transform: [{ rotate: '45deg' }],
    margin: 1,
  },
  // Play text container
  playTextContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  playText: {
    fontSize: 11,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default FavoritesScreen;
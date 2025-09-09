import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert
} from 'react-native';
import { NFLService } from '../services/NFLService';

const NFLScoreboardScreen = ({ navigation }) => {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdateHash, setLastUpdateHash] = useState('');

  useEffect(() => {
    loadScoreboard();
    
    // Set up continuous fetching every 2 seconds
    const interval = setInterval(() => {
      loadScoreboard(true); // Silent update
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);

  const loadScoreboard = async (silentUpdate = false) => {
    try {
      if (!silentUpdate) {
        setLoading(true);
      }
      
      const scoreboardData = await NFLService.getScoreboard();
      const formattedGames = scoreboardData.events.map(game => 
        NFLService.formatGameForMobile(game)
      );
      
      // Create a hash of the current data to check for changes
      const dataHash = JSON.stringify(formattedGames.map(game => ({
        id: game.id,
        awayScore: game.awayTeam.score,
        homeScore: game.homeTeam.score,
        status: game.status,
        displayClock: game.displayClock,
        situation: game.situation
      })));
      
      // Only update if data has changed
      if (dataHash !== lastUpdateHash) {
        setLastUpdateHash(dataHash);
        
        // Group games by date with latest first
        const gamesByDate = formattedGames.reduce((acc, game) => {
          const gameDate = game.date.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "2-digit", 
            day: "2-digit",
          });
          if (!acc[gameDate]) acc[gameDate] = [];
          acc[gameDate].push(game);
          return acc;
        }, {});

        // Sort dates in reverse chronological order (latest first)
        const sortedDates = Object.keys(gamesByDate).sort(
          (a, b) => new Date(b) - new Date(a)
        );

        // Flatten back to array with date headers
        const groupedGames = [];
        for (const date of sortedDates) {
          groupedGames.push({ type: 'header', date });
          gamesByDate[date].forEach(game => {
            groupedGames.push({ type: 'game', ...game });
          });
        }
        
        setGames(groupedGames);
      } else if (silentUpdate) {
      }
    } catch (error) {
      if (!silentUpdate) {
        Alert.alert('Error', 'Failed to load NFL scoreboard');
      }
      console.error('Error loading scoreboard:', error);
    } finally {
      if (!silentUpdate) {
        setLoading(false);
      }
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadScoreboard();
    setRefreshing(false);
  };

  const navigateToGameDetails = async (gameId) => {
    
    // Start navigation immediately but preload drives in background
    navigation.navigate('GameDetails', { gameId, sport: 'nfl' });
    
    // Preload drives data for better experience (non-blocking)
    try {
      await NFLService.getDrives(gameId);
    } catch (error) {
      console.warn('Failed to preload drives data:', error);
    }
  };

  const getGameStatusText = (item) => {
    // Special handling for halftime
    if (item.status.toLowerCase() === 'halftime') {
      return 'Halftime';
    }
    // Check if game is in progress (not final, not pre-game)
    if (item.status.toLowerCase().includes('quarter') || 
        item.status.toLowerCase().includes('half') ||
        item.status.toLowerCase().includes('overtime')) {
      return item.status; // Return the quarter info directly
    }
    return item.status; // Return original status for other cases
  };

  const getGameTimeText = (item) => {
    // For finished games, show start time instead of clock
    if (item.isCompleted) {
      return item.date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }
    // For halftime, don't show any time text (status already shows "Halftime")
    if (item.status.toLowerCase() === 'halftime') {
      return '';
    }
    // For in-progress games, show clock if available
    return item.displayClock || '';
  };

  const renderDateHeader = (date) => (
    <View style={styles.dateHeader}>
      <Text style={styles.dateHeaderText}>{date}</Text>
    </View>
  );

  const renderGameCard = ({ item }) => {
    if (item.type === 'header') {
      return renderDateHeader(item.date);
    }

    return (
      <TouchableOpacity 
        style={styles.gameCard}
        onPress={() => navigateToGameDetails(item.id)}
      >
        {/* Game Status */}
        <View style={styles.gameHeader}>
          <Text style={styles.gameStatus}>{getGameStatusText(item)}</Text>
          {getGameTimeText(item) && (
            <Text style={styles.gameClock}>{getGameTimeText(item)}</Text>
          )}
        </View>

        {/* Teams */}
        <View style={styles.teamsContainer}>
          {/* Away Team */}
          <View style={styles.teamRow}>
            <View style={styles.teamLogoContainer}>
              {/* Possession indicator for away team (not during halftime) */}
              {item.situation?.possession === item.awayTeam.id && 
               item.status.toLowerCase() !== 'halftime' && (
                <Text style={[styles.possessionIndicator, styles.awayPossession]}>🏈</Text>
              )}
              <Image 
                source={{ uri: item.awayTeam.logo }} 
                style={styles.teamLogo}
                defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=NFL' }}
              />
            </View>
            <View style={styles.teamInfo}>
              <Text style={styles.teamName}>{item.awayTeam.displayName}</Text>
              <Text style={styles.teamRecord}>{item.awayTeam.record}</Text>
            </View>
            <Text style={styles.teamScore}>{item.awayTeam.score}</Text>
          </View>

          {/* Home Team */}
          <View style={styles.teamRow}>
            <View style={styles.teamLogoContainer}>
              <Image 
                source={{ uri: item.homeTeam.logo }} 
                style={styles.teamLogo}
                defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=NFL' }}
              />
              {/* Possession indicator for home team (not during halftime) */}
              {item.situation?.possession === item.homeTeam.id && 
               item.status.toLowerCase() !== 'halftime' && (
                <Text style={[styles.possessionIndicator, styles.homePossession]}>🏈</Text>
              )}
            </View>
            <View style={styles.teamInfo}>
              <Text style={styles.teamName}>{item.homeTeam.displayName}</Text>
              <Text style={styles.teamRecord}>{item.homeTeam.record}</Text>
            </View>
            <Text style={styles.teamScore}>{item.homeTeam.score}</Text>
          </View>
        </View>

        {/* Game Info */}
        <View style={styles.gameFooter}>
          <Text style={styles.venue}>{item.venue}</Text>
          {item.broadcasts.length > 0 && (
            <Text style={styles.broadcast}>{item.broadcasts.join(', ')}</Text>
          )}
          {/* Show down and distance for in-progress games (but not halftime) */}
          {item.situation?.shortDownDistanceText && 
           !item.isCompleted && 
           item.status.toLowerCase() !== 'halftime' && (
            <Text style={styles.downDistance}>{item.situation.shortDownDistanceText}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#013369" />
        <Text style={styles.loadingText}>Loading NFL Scoreboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={games}
        renderItem={renderGameCard}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#013369']}
          />
        }
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
  listContainer: {
    padding: 16,
  },
  gameCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  gameStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: '#013369',
  },
  gameClock: {
    fontSize: 14,
    color: '#666',
  },
  teamsContainer: {
    marginBottom: 12,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
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
    fontWeight: '600',
    color: '#333',
  },
  teamRecord: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  teamScore: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#013369',
    minWidth: 40,
    textAlign: 'center',
  },
  gameFooter: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 8,
  },
  venue: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  broadcast: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  downDistance: {
    fontSize: 12,
    color: '#013369',
    fontWeight: '600',
    marginTop: 2,
  },
  teamLogoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  possessionIndicator: {
    fontSize: 12,
    position: 'absolute',
    zIndex: 10,
  },
  awayPossession: {
    right: -5,
    top: -2,
  },
  homePossession: {
    left: -5,
    top: -2,
  },
  dateHeader: {
    backgroundColor: '#013369',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
  },
  dateHeaderText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
});

export default NFLScoreboardScreen;

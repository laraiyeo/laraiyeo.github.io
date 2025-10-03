import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, ScrollView } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { useFavorites } from '../../../context/FavoritesContext';
import { EuropaConferenceLeagueServiceEnhanced } from '../../../services/soccer/EuropaConferenceLeagueServiceEnhanced';
import YearFallbackUtils from '../../../utils/YearFallbackUtils';

const UECLTeamPageScreen = ({ route, navigation }) => {
  const { teamId, teamName } = route.params;
  const { theme, colors, isDarkMode } = useTheme();
  const { isFavorite, toggleFavorite, updateTeamCurrentGame } = useFavorites();
  const [activeTab, setActiveTab] = useState('Games');
  const [teamData, setTeamData] = useState(null);
  const [teamRecord, setTeamRecord] = useState(null);
  const [teamRanking, setTeamRanking] = useState(null);
  const [currentGame, setCurrentGame] = useState(null);
  const [lastMatches, setLastMatches] = useState([]);
  const [nextMatches, setNextMatches] = useState([]);
  const [lastMatchesCollapsed, setLastMatchesCollapsed] = useState(true);
  const [nextMatchesCollapsed, setNextMatchesCollapsed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState(null);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [collapsedRosterSections, setCollapsedRosterSections] = useState({
    goalkeepers: true,
    defenders: true,
    midfielders: true,
    forwards: true,
    others: true
  });
  const [teamStats, setTeamStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const liveUpdateInterval = useRef(null);

  // local updating state to avoid races while AsyncStorage writes
  const [isUpdatingFavorites, setIsUpdatingFavorites] = useState(false);

  const handleToggleFavorite = async () => {
    if (!teamData) return;
    try {
      setIsUpdatingFavorites(true);
      let currentGamePayload = null;
      if (currentGame) {
        const eventId = currentGame.id || currentGame.eventId || currentGame.gameId || currentGame.gamePk || (currentGame.competitions?.[0]?.id) || null;
        const gameDate = currentGame.date || currentGame.gameDate || null;
        const competition = currentGame.leagueCode || 'uefa.europa.conf' || (currentGame.competitions?.[0]?.league?.id) || null;
        const eventLink = currentGame.$ref || currentGame.eventLink || (eventId ? `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${competition}/events/${eventId}` : null);

        currentGamePayload = {
          eventId: eventId ? String(eventId) : null,
          eventLink: eventLink || null,
          gameDate: gameDate || null,
          competition: competition || 'uefa.europa.conf'
        };
      }

      await toggleFavorite({
        teamId: teamData.id,
        teamName: teamData.displayName || teamData.name,
        sport: 'Europa Conference League',
        leagueCode: 'uefa.europa.conf'
      }, currentGamePayload);
    } catch (e) {
      console.warn('Error toggling favorite for', teamData?.id, e);
    } finally {
      setIsUpdatingFavorites(false);
    }
  };

  // Convert HTTP URLs to HTTPS to avoid mixed content issues
  const convertToHttps = (url) => {
    if (url && url.startsWith('http://')) {
      return url.replace('http://', 'https://');
    }
    return url;
  };

  // TeamLogoImage component with dark mode and fallback support
  const TeamLogoImage = ({ teamId, style }) => {
    const [logoSource, setLogoSource] = useState(null);
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
      if (teamId) {
        const logos = getTeamLogoUrls(teamId, isDarkMode);
        setLogoSource({ uri: logos.primaryUrl });
      } else {
        const logos = getTeamLogoUrls(teamId, isDarkMode);
        setLogoSource({ uri: logos.primaryUrl });
      }
      setRetryCount(0);
    }, [teamId, isDarkMode]);

    const handleError = () => {
      if (retryCount === 0) {
        const logos = getTeamLogoUrls(teamId, isDarkMode);
        setLogoSource({ uri: logos.fallbackUrl });
        setRetryCount(1);
      } else {
        // Final fallback - use soccer.png asset for all cases
        setLogoSource(require('../../../../assets/soccer.png'));
      }
    };

    return (
      <Image
        style={style}
        source={logoSource || (teamId ? { uri: getTeamLogoUrls(teamId, isDarkMode).primaryUrl } : require('../../../../assets/soccer.png'))}
        defaultSource={teamId ? { uri: getTeamLogoUrls(teamId, isDarkMode).primaryUrl } : require('../../../../assets/soccer.png')}
        onError={handleError}
      />
    );
  };

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

  useEffect(() => {
    console.log('UECLTeamPageScreen received - teamId:', teamId, 'teamName:', teamName);
    fetchTeamData();
    
    // Cleanup interval on unmount
    return () => {
      if (liveUpdateInterval.current) {
        clearInterval(liveUpdateInterval.current);
      }
    };
  }, [teamId]);

  const fetchTeamData = async () => {
    try {
      // Fetch team basic info from ESPN Soccer API
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa.conf/teams/${teamId}`;
      console.log('Fetching team data from:', url);
      const response = await fetch(url);
      const data = await response.json();
      
      console.log('Team API response:', data);
      
      if (data.team) {
        setTeamData(data.team);
        
        // Fetch team record and matches in parallel
        await Promise.all([
          fetchTeamRecord(data.team.id),
          fetchAllMatches()
        ]);
      } else {
        console.log('No team data found in response');
      }
    } catch (error) {
      console.error('Error fetching team data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamRecord = async (teamId) => {
    try {
      console.log('Fetching team record for teamId:', teamId);
      const standingsData = await EuropaConferenceLeagueServiceEnhanced.getStandings();
      
      if (standingsData?.standings?.entries) {
        const teamEntry = standingsData.standings.entries.find(
          entry => entry.team.id === teamId
        );
        
        if (teamEntry) {
          console.log('Found team entry:', teamEntry);
          const wins = teamEntry.stats.find(stat => stat.name === "wins")?.displayValue || "0";
          const losses = teamEntry.stats.find(stat => stat.name === "losses")?.displayValue || "0";
          const draws = teamEntry.stats.find(stat => stat.name === "ties")?.displayValue || "0";
          const points = teamEntry.stats.find(stat => stat.name === "points")?.displayValue || "0";
          const position = teamEntry.stats.find(stat => stat.name === "rank")?.displayValue || "N/A";

          const getOrdinalSuffix = (num) => {
        const j = num % 10;
        const k = num % 100;
        if (j === 1 && k !== 11) return num + "st";
        if (j === 2 && k !== 12) return num + "nd";
        if (j === 3 && k !== 13) return num + "rd";
        return num + "th";
      };
          
          setTeamRecord({ wins, losses, draws, points, position });
          
          // Set ranking information like team-page.js does
          const teamPosition = standingsData.standings.entries.findIndex(entry => 
            entry.team.id === teamId
          ) + 1;
          
          const totalTeams = standingsData.standings.entries.length;
          const rankingText = `${getOrdinalSuffix(teamPosition)} in Europa Conference League`;
          
          setTeamRanking(rankingText);
          return;
        }
        console.log('Team not found in standings for teamId:', teamId);
      }
    } catch (error) {
      console.error('Error fetching team record:', error);
    }
  };

  const fetchAllMatches = async () => {
    try {
      console.log('Fetching all matches for team:', teamId);
      
      // Fetch from all UECL competitions in parallel
      const UECLCompetitions = ['uefa.europa.conf', 'uefa.europa.conf_qual'];

      const competitionPromises = UECLCompetitions.map(async (leagueCode) => {
        try {
          // Get team events from ESPN Core API for each competition
          const eventsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}/seasons/${YearFallbackUtils.getPreferredYear()}/teams/${teamId}/events?lang=en&region=us&limit=100`;
          console.log(`Fetching team events from ${leagueCode}:`, eventsUrl);
          
          const eventsResponse = await fetch(convertToHttps(eventsUrl));
          const eventsData = await eventsResponse.json();
          
          if (eventsData.items && eventsData.items.length > 0) {
            console.log(`Found ${eventsData.items.length} event references for ${leagueCode}, fetching details in parallel...`);
            
            // Fetch all event details in parallel with team and score data
            const eventPromises = eventsData.items.map(async (eventRef) => {
              try {
                const eventUrl = convertToHttps(eventRef.$ref);
                const eventResponse = await fetch(eventUrl);
                
                if (!eventResponse.ok) {
                  console.warn(`Failed to fetch event ${eventRef.$ref}: ${eventResponse.status}`);
                  return null;
                }
                
                const eventData = await eventResponse.json();
                
                // Add league information to the event
                eventData.leagueCode = leagueCode;
                
                // Fetch team and score data for each competitor
                if (eventData.competitions?.[0]?.competitors) {
                  const competitorPromises = eventData.competitions[0].competitors.map(async (competitor) => {
                    try {
                      // Fetch team and score data in parallel
                      const [teamData, scoreData] = await Promise.all([
                        competitor.team?.$ref ? 
                          fetch(convertToHttps(competitor.team.$ref))
                            .then(res => res.ok ? res.json() : null)
                            .catch(() => null) : 
                          Promise.resolve(null),
                        competitor.score?.$ref ? 
                          fetch(convertToHttps(competitor.score.$ref))
                            .then(res => res.ok ? res.json() : null)
                            .catch(() => null) : 
                          Promise.resolve(null)
                      ]);
                      
                      return {
                        ...competitor,
                        team: teamData || competitor.team,
                        score: scoreData || competitor.score
                      };
                    } catch (error) {
                      console.error('Error fetching competitor data:', error);
                      return competitor;
                    }
                  });
                  
                  eventData.competitions[0].competitors = await Promise.all(competitorPromises);
                }
                
                return eventData;
              } catch (error) {
                console.error(`Error fetching event details for ${eventRef.$ref}:`, error);
                return null;
              }
            });
            
            const competitionEvents = await Promise.all(eventPromises);
            const validCompetitionEvents = competitionEvents.filter(event => event !== null);
            
            console.log(`Successfully fetched ${validCompetitionEvents.length} out of ${eventsData.items.length} events for ${leagueCode}`);
            return validCompetitionEvents;
          } else {
            console.log(`No events found for ${leagueCode}`);
            return [];
          }
        } catch (error) {
          console.error(`Error fetching events for ${leagueCode}:`, error);
          return [];
        }
      });

      // Wait for all competitions to complete
      const allCompetitionResults = await Promise.all(competitionPromises);
      
      // Flatten all events into a single array
      const allEvents = allCompetitionResults.flat();
      
      if (allEvents.length > 0) {
        console.log(`Total events across all competitions: ${allEvents.length}`);
        
        // Sort matches by date
        allEvents.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Determine current game from all matches
        const currentTime = new Date();
        const today = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate());
        let foundCurrentGame = null;
        
        for (const eventData of allEvents) {
          const eventDate = new Date(eventData.date);
          const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
          const status = eventData.competitions?.[0]?.status?.type?.state;
          
          console.log(`Checking event ${eventData.id}: ${eventData.name} - ${eventData.date} - Status: ${status}`);
          
          // Priority 1: Live games
          if (status === 'in') {
            console.log('Found live game:', eventData.name);
            foundCurrentGame = eventData;
            break;
          }
          
          // Priority 2: Today's games (regardless of status)
          const isToday = eventDay.getTime() === today.getTime();
          if (isToday) {
            console.log('Found today\'s game:', eventData.name);
            if (!foundCurrentGame || eventDate < new Date(foundCurrentGame.date)) {
              foundCurrentGame = eventData;
            }
          }
          
          // Priority 3: Future games with 'pre' status
          else if (eventDate >= currentTime && status === 'pre') {
            if (!foundCurrentGame || eventDate < new Date(foundCurrentGame.date)) {
              console.log('Found upcoming game:', eventData.name);
              foundCurrentGame = eventData;
            }
          }
        }
        
        // Set current game
        if (foundCurrentGame) {
          console.log('Setting current game:', foundCurrentGame.name);
          setCurrentGame(foundCurrentGame);

          try {
            const favId = teamData?.id || teamId || null;
            if (favId && isFavorite(favId, 'uefa europa conf')) {
              const eventId = foundCurrentGame.id || foundCurrentGame.eventId || foundCurrentGame.gameId || foundCurrentGame.gamePk || (foundCurrentGame.competitions?.[0]?.id) || null;
              const gameDate = foundCurrentGame.date || foundCurrentGame.gameDate || null;
              const competition = foundCurrentGame.leagueCode || (foundCurrentGame.competitions?.[0]?.league?.id) || 'uefa.europa.conf';
              const eventLink = foundCurrentGame.$ref || foundCurrentGame.eventLink || (eventId ? `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${competition}/events/${eventId}` : null);

              const currentGamePayload = {
                eventId: eventId ? String(eventId) : null,
                eventLink: eventLink || null,
                gameDate: gameDate || null,
                competition: competition || 'uefa.europa.conf'
              };

              console.log('UECLTeamPageScreen: team is favorited - updating persisted currentGame:', currentGamePayload);
              await updateTeamCurrentGame(favId, currentGamePayload);
            }
          } catch (updateErr) {
            console.log('Error updating persisted favorite currentGame:', updateErr);
          }
        } else {
          console.log('No current game found');
          setCurrentGame(null);
        }
        
        // Filter past and future matches (excluding current game)
        const threeHoursAgo = new Date(currentTime.getTime() - (3 * 60 * 60 * 1000));
        
        const pastMatches = allEvents.filter(match => {
          const matchDate = new Date(match.date);
          const isPastMatch = matchDate < threeHoursAgo;
          const isCurrentGame = foundCurrentGame && match.id === foundCurrentGame.id;
          return isPastMatch && !isCurrentGame;
        }).reverse(); // Most recent first
        
        const futureMatches = allEvents.filter(match => {
          const matchDate = new Date(match.date);
          const isFutureMatch = matchDate >= threeHoursAgo;
          const isCurrentGame = foundCurrentGame && match.id === foundCurrentGame.id;
          return isFutureMatch && !isCurrentGame;
        });
        
        console.log(`Current game: ${foundCurrentGame?.name || 'None'}`);
        console.log(`Past matches: ${pastMatches.length}`);
        console.log(`Future matches: ${futureMatches.length}`);
        
        // Set the match lists
        setLastMatches(pastMatches.slice(0, 38));
        setNextMatches(futureMatches.slice(0, 38));
        
      } else {
        console.log('No events found for team');
        setCurrentGame(null);
        setLastMatches([]);
        setNextMatches([]);
      }
    } catch (error) {
      console.error('Error fetching all matches:', error);
      setCurrentGame(null);
      setLastMatches([]);
      setNextMatches([]);
    }
  };

  const fetchRoster = async () => {
    if (!teamData) return;
    
    setLoadingRoster(true);
    try {
      const rosterData = await YearFallbackUtils.fetchWithYearFallback(
        async (year) => {
          const response = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa.conf/teams/${teamId}/roster?season=${year}`
          );
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          return await response.json();
        },
        (data) => {
          console.log('Validating UECL roster data:', data);
          return data && data.athletes && data.athletes.length > 0;
        }
      );
      
      if (rosterData && rosterData.athletes) {
        setRoster(rosterData.athletes);
      } else {
        setRoster([]);
      }
    } catch (error) {
      console.error('Error fetching roster:', error);
      setRoster([]);
    } finally {
      setLoadingRoster(false);
    }
  };

  const fetchTeamStats = async () => {
    if (!teamData) return;
    
    setLoadingStats(true);
    try {
      console.log('Fetching team statistics for team:', teamId);
      
      // Fetch statistics for different UECL competitions
      const seasonTypes = [
        { id: '1', name: 'Europa Conference League', leagueCode: 'uefa.europa.conf' },
        { id: '7', name: 'Europa Conference League Qualifiers', leagueCode: 'uefa.europa.conf_qual' },
      ];
      
      const allStats = {};
      
      // Fetch stats for each season type in parallel with year fallback
      const statsPromises = seasonTypes.map(async (seasonType) => {
        try {
          const statsData = await YearFallbackUtils.fetchWithYearFallback(
            async (year) => {
              const statsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${seasonType.leagueCode}/seasons/${year}/types/1/teams/${teamId}/statistics/0?lang=en&region=us`;
              const response = await fetch(convertToHttps(statsUrl));
              
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }
              
              return await response.json();
            },
            (data) => {
              console.log(`Validating UECL team stats data for ${seasonType.name}:`, data);
              return data && data.splits && data.splits.categories && data.splits.categories.length > 0;
            }
          );
          
          if (statsData) {
            console.log(`Found ${seasonType.name} stats with ${statsData.splits.categories.length} categories`);
            
            // Handle the case where data might be wrapped in a data property
            const actualData = statsData.data || statsData;
            
            return {
              seasonType: seasonType.name,
              data: actualData
            };
          } else {
            console.log(`No stats found for ${seasonType.name}`);
            return null;
          }
        } catch (error) {
          console.error(`Error fetching ${seasonType.name} stats:`, error);
          return null;
        }
      });
      
      const statsResults = await Promise.all(statsPromises);
      const validStats = statsResults.filter(result => result !== null);
      
      // Organize stats by season type
      validStats.forEach(result => {
        allStats[result.seasonType] = result.data;
      });
      
      console.log(`Successfully fetched stats for ${Object.keys(allStats).length} competitions:`, Object.keys(allStats));
      setTeamStats(allStats);
      
    } catch (error) {
      console.error('Error fetching team stats:', error);
      setTeamStats({});
    } finally {
      setLoadingStats(false);
    }
  };

  // Handle game click navigation
  const handleGamePress = (game) => {
    console.log('Navigating to game:', game.id);
    navigation.navigate('UECLGameDetails', {
      gameId: game.id,
      sport: 'Europa Conference League',
    });
  };

  // Check if game is live
  const isGameLive = (game) => {
    if (!game || !game.status) return false;
    const state = game.status.type.state;
    return state === 'in' || state === 'live';
  };

  // Effect to load roster when Roster tab is selected
  useEffect(() => {
    if (activeTab === 'Roster' && teamData && !roster && !loadingRoster) {
      fetchRoster();
    }
  }, [activeTab, teamData, roster, loadingRoster]);

  // Effect to load stats when Stats tab is selected
  useEffect(() => {
    if (activeTab === 'Stats' && teamData && !teamStats && !loadingStats) {
      fetchTeamStats();
    }
  }, [activeTab, teamData, teamStats, loadingStats]);

  const getTeamColor = (team) => {
    if (!team) return colors.primary;
    
    // Use alternate color if main color is too light/problematic
    const isUsingAlternateColor = ["ffffff", "ffee00", "ffff00", "81f733", "000000", "f7f316", "eef209", "ece83a", "1c31ce", "ffd700"].includes(team.color);
    
    if (isUsingAlternateColor && team.alternateColor) {
      return `#${team.alternateColor}`;
    } else if (team.color) {
      return `#${team.color}`;
    }
    
    return colors.primary;
  };

  // Function to get competition display name from league code
  const getCompetitionName = (leagueCode) => {
    if (!leagueCode) return 'Europa Conference League';
    
    // Map league codes to display names
    switch (leagueCode) {
      case 'uefa.europa.conf': 
        return 'Europa Conference League';
      case 'uefa.europa.conf_qual':
        return 'Europa Conference League Qualifiers';
      default:
        return leagueCode.replace('uefa.', '').replace('_', ' ').toUpperCase();
    }
  };

  const renderTeamHeader = () => {
    if (!teamData) return null;

    const teamColor = getTeamColor(teamData);
    const isTeamFavorite = isFavorite(teamData.id, 'uefa europa conf');

    // isUpdatingFavorites and handleToggleFavorite moved to component scope

    return (
      <View style={[styles.teamHeader, { backgroundColor: theme.surface }]}>
        <TeamLogoImage
          teamId={teamData.id}
          style={styles.teamLogoHeader}
        />
        <View style={styles.teamInfo}>
          <Text allowFontScaling={false} style={[styles.teamName, { color: teamColor }]}>
            {teamData.displayName || teamData.name}
          </Text>
          <Text allowFontScaling={false} style={[styles.teamDivision, { color: theme.textSecondary }]}>
            {teamRanking || teamData.standingSummary || 'Europa Conference League'}
          </Text>
          <View style={styles.recordContainer}>
            <View style={styles.recordRow}>
              <View style={[styles.recordItem, { marginRight: 20 }]}>
                <Text allowFontScaling={false} style={[styles.recordValue, { color: teamColor }]}>
                  {teamRecord?.wins || '0'}-{teamRecord?.draws || '0'}-{teamRecord?.losses || '0'}
                </Text>
                <Text allowFontScaling={false} style={[styles.recordLabel, { color: theme.textSecondary }]}>
                  Record
                </Text>
              </View>
              <View style={styles.recordItem}>
                <Text allowFontScaling={false} style={[styles.recordValue, { color: teamColor }]}>
                  {teamRecord?.points || '0'}
                </Text>
                <Text allowFontScaling={false} style={[styles.recordLabel, { color: theme.textSecondary }]}>
                  Points
                </Text>
              </View>
            </View>
          </View>
        </View>
        <TouchableOpacity 
          style={styles.favoriteButton} 
          onPress={handleToggleFavorite}
          activeOpacity={0.7}
        >
          <Text allowFontScaling={false} style={[styles.favoriteIcon, { color: isTeamFavorite ? colors.primary : theme.textSecondary }]}>
            {isTeamFavorite ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderTabButtons = () => {
    const tabs = ['Games', 'Stats', 'Roster'];
    
    return tabs.map((tab) => (
      <TouchableOpacity
        key={tab}
        style={[
          styles.tabButton,
          activeTab === tab && [styles.activeTabButton, { borderBottomColor: colors.primary }]
        ]}
        onPress={() => setActiveTab(tab)}
        activeOpacity={0.7}
      >
        <Text allowFontScaling={false}
          style={[
            styles.tabText,
            { color: activeTab === tab ? colors.primary : theme.textSecondary },
            activeTab === tab && styles.activeTabText
          ]}
        >
          {tab}
        </Text>
      </TouchableOpacity>
    ));
  };

  const renderCurrentGame = () => {
    if (!currentGame) {
      return (
        <View style={styles.matchesSection}>
          <Text allowFontScaling={false} style={[styles.gameSectionTitle, { color: colors.primary }]}>Current Game</Text>
          <View style={[styles.noGameContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text allowFontScaling={false} style={[styles.noGameText, { color: theme.textSecondary }]}>No game scheduled today</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.matchesSection}>
        <Text allowFontScaling={false} style={[styles.gameSectionTitle, { color: colors.primary }]}>
          {isGameLive(currentGame) ? 'Live Game' : 'Current Game'}
        </Text>
        {renderMatchCard(currentGame)}
      </View>
    );
  };

  const renderMatchCard = (game) => {
    if (!game?.competitions?.[0]) return null;

    const competition = game.competitions[0];
    const competitors = competition.competitors || [];
    const homeTeam = competitors.find(c => c.homeAway === "home");
    const awayTeam = competitors.find(c => c.homeAway === "away");

    if (!homeTeam || !awayTeam) return null;

    const gameDate = new Date(game.date);
    
    // Convert to EST
    const estDate = new Date(gameDate.toLocaleString("en-US", {timeZone: "America/New_York"}));
    
    const formatGameTime = (date) => {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York'
      });
    };

    const formatGameDate = (date) => {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/New_York'
      });
    };

    // Determine game status
    const getGameStatus = () => {
      // Since status is a $ref, we'll determine status based on date and available info
      const now = new Date();
      const threeHoursAgo = new Date(now.getTime() - (3 * 60 * 60 * 1000));
      
      if (gameDate < threeHoursAgo) {
        return 'Final';
      } else if (gameDate <= now) {
        return 'Current';
      } else {
        return 'Scheduled';
      }
    };

    const gameStatus = getGameStatus();
    const venue = competition.venue?.fullName || 'TBD';

    // Get scores using the actual score data structure from c3.txt
    const getScoreValue = (scoreData) => {
      if (!scoreData) return '0';
      
      // If we have the full score data with displayValue or value
      if (scoreData.displayValue) return scoreData.displayValue;
      if (scoreData.value !== undefined) return scoreData.value.toString();
      
      // If it's still a $ref string or object, return 0
      if (typeof scoreData === 'string' || (typeof scoreData === 'object' && scoreData.$ref)) {
        return '0';
      }
      
      return scoreData.toString() || '0';
    };

    // Get shootout scores
    const getShootoutScore = (scoreData) => {
      if (!scoreData || typeof scoreData !== 'object') return null;
      
      // Look for shootoutScore in the score object
      if (scoreData.shootoutScore !== undefined && scoreData.shootoutScore !== null) {
        return scoreData.shootoutScore.toString();
      }
      
      return null;
    };

    const homeScore = getScoreValue(homeTeam.score);
    const awayScore = getScoreValue(awayTeam.score);
    const homeShootoutScore = getShootoutScore(homeTeam.score);
    const awayShootoutScore = getShootoutScore(awayTeam.score);
    
    // Determine winner/loser using shootout scores first if they exist
    const determineWinner = () => {
      if (gameStatus !== 'Final') return { homeIsWinner: false, awayIsWinner: false, isDraw: false };
      
      // If shootout scores exist, use them to determine winner
      if (homeShootoutScore !== null && awayShootoutScore !== null) {
        const homeShootout = parseInt(homeShootoutScore);
        const awayShootout = parseInt(awayShootoutScore);
        
        if (homeShootout > awayShootout) {
          return { homeIsWinner: true, awayIsWinner: false, isDraw: false };
        } else if (awayShootout > homeShootout) {
          return { homeIsWinner: false, awayIsWinner: true, isDraw: false };
        }
        // If shootout scores are equal, it's still a draw (shouldn't happen but safety)
        return { homeIsWinner: false, awayIsWinner: false, isDraw: true };
      }
      
      // Fall back to regular scores
      const homeScoreNum = parseInt(homeScore);
      const awayScoreNum = parseInt(awayScore);
      
      if (homeScoreNum > awayScoreNum) {
        return { homeIsWinner: true, awayIsWinner: false, isDraw: false };
      } else if (awayScoreNum > homeScoreNum) {
        return { homeIsWinner: false, awayIsWinner: true, isDraw: false };
      } else {
        return { homeIsWinner: false, awayIsWinner: false, isDraw: true };
      }
    };
    
    const { homeIsWinner, awayIsWinner, isDraw } = determineWinner();
    const homeIsLoser = gameStatus === 'Final' && !isDraw && !homeIsWinner;
    const awayIsLoser = gameStatus === 'Final' && !isDraw && !awayIsWinner;

    return (
      <TouchableOpacity 
        style={[styles.gameCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
        onPress={() => handleGamePress(game)}
        activeOpacity={0.7}
      >
        {/* League Header */}
        <View style={[styles.leagueHeader, { backgroundColor: theme.surfaceSecondary }]}>
          <Text allowFontScaling={false} style={[styles.leagueText, { color: colors.primary }]}>
            {getCompetitionName(game.leagueCode) || competition?.name || competition?.league?.name || 'Europa Conference League'}
          </Text>
        </View>
        
        {/* Main Match Content */}
        <View style={styles.matchContent}>
          {/* Home Team */}
          <View style={styles.teamSection}>
            <View style={styles.teamLogoRow}>
              <TeamLogoImage
                teamId={homeTeam.team?.id}
                style={[styles.teamLogo, homeIsLoser && styles.losingTeamLogo]}
              />
              {gameStatus !== 'Scheduled' && (
                <View style={styles.scoreContainer}>
                  <Text allowFontScaling={false} style={[styles.teamScore, { 
                    color: gameStatus === 'Final' && homeIsWinner ? colors.primary : 
                           homeIsLoser ? '#999' : theme.text 
                  }]}>
                    {homeScore}
                  </Text>
                  {homeShootoutScore && (
                    <Text allowFontScaling={false} style={[
                      styles.shootoutScore, 
                      { color: homeIsLoser ? '#999' : colors.primary }
                    ]}>
                      ({homeShootoutScore})
                    </Text>
                  )}
                </View>
              )}
            </View>
            <Text allowFontScaling={false} style={[styles.teamAbbreviation, { 
              color: isFavorite(homeTeam.team?.id, 'uefa europa conf') ? colors.primary : (homeIsLoser ? '#999' : theme.text)
            }]}>
              {isFavorite(homeTeam.team?.id, 'uefa europa conf') ? '★ ' : ''}{homeTeam.team?.abbreviation || homeTeam.team?.shortDisplayName || 'TBD'}
            </Text>
          </View>
          
          {/* Status Section */}
          <View style={styles.statusSection}>
            <Text allowFontScaling={false} style={[styles.gameStatus, { color: gameStatus === 'Live' ? '#ff4444' : colors.primary }]}>
              {gameStatus}
            </Text>
            <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary }]}>
              {formatGameDate(gameDate)}
            </Text>
            <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary }]}>
              {formatGameTime(gameDate)} EST
            </Text>
          </View>
          
          {/* Away Team */}
          <View style={styles.teamSection}>
            <View style={styles.teamLogoRow}>
              {gameStatus !== 'Scheduled' && (
                <View style={styles.scoreContainer}>
                  {awayShootoutScore && (
                    <Text allowFontScaling={false} style={[
                      styles.shootoutScore, 
                      { color: awayIsLoser ? '#999' : colors.primary }
                    ]}>
                      ({awayShootoutScore})
                    </Text>
                  )}
                  <Text allowFontScaling={false} style={[styles.teamScore, { 
                    color: gameStatus === 'Final' && awayIsWinner ? colors.primary : 
                           awayIsLoser ? '#999' : theme.text 
                  }]}>
                    {awayScore}
                  </Text>
                </View>
              )}
              <TeamLogoImage
                teamId={awayTeam.team?.id}
                style={[styles.teamLogo, awayIsLoser && styles.losingTeamLogo]}
              />
            </View>
            <Text allowFontScaling={false} style={[styles.teamAbbreviation, { 
              color: isFavorite(awayTeam.team?.id, 'uefa europa conf') ? colors.primary : (awayIsLoser ? '#999' : theme.text)
            }]}>
              {isFavorite(awayTeam.team?.id, 'uefa europa conf') ? '★ ' : ''}{awayTeam.team?.abbreviation || awayTeam.team?.shortDisplayName || 'TBD'}
            </Text>
          </View>
        </View>
        
        {/* Venue */}
        <View style={[styles.venueSection, { borderTopColor: theme.border }]}>
          <Text allowFontScaling={false} style={[styles.venueText, { color: theme.textSecondary }]}>{venue}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderStatsContent = () => {
    if (loadingStats) {
      return (
        <View style={styles.statsLoadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>Loading team statistics...</Text>
        </View>
      );
    }

    if (!teamStats || Object.keys(teamStats).length === 0) {
      return (
        <View style={styles.statsLoadingContainer}>
          <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>Team statistics not available</Text>
        </View>
      );
    }

    const renderStatBox = (label, value, key) => (
      <View key={key} style={[styles.statBox, { backgroundColor: theme.surface }]}>
        <Text allowFontScaling={false} style={[styles.statBoxValue, { color: colors.primary }]}>{value}</Text>
        <Text allowFontScaling={false} style={[styles.statBoxLabel, { color: theme.textSecondary }]}>{label}</Text>
      </View>
    );

    const renderCategoryStats = (category, competitionName) => {
      if (!category.stats || category.stats.length === 0) return null;

      // Group important stats by category type
      const getImportantStats = (categoryName, stats) => {
        const statMap = {};
        stats.forEach(stat => {
          statMap[stat.name] = stat.displayValue;
        });

        switch (categoryName.toLowerCase()) {
          case 'general':
            return [
              { key: 'appearances', label: 'Appearances', value: statMap.appearances },
              { key: 'wins', label: 'Wins', value: statMap.wins },
              { key: 'draws', label: 'Draws', value: statMap.draws },
              { key: 'losses', label: 'Losses', value: statMap.losses },
              { key: 'goalDifference', label: 'Goal Diff', value: statMap.goalDifference },
              { key: 'winPct', label: 'Win %', value: statMap.winPct },
              { key: 'yellowCards', label: 'Yellow Cards', value: statMap.yellowCards },
              { key: 'redCards', label: 'Red Cards', value: statMap.redCards },
              { key: 'foulsCommitted', label: 'Fouls', value: statMap.foulsCommitted }
            ].filter(stat => stat.value !== undefined);

          case 'offensive':
            return [
              { key: 'totalGoals', label: 'Goals', value: statMap.totalGoals },
              { key: 'goalAssists', label: 'Assists', value: statMap.goalAssists },
              { key: 'totalShots', label: 'Shots', value: statMap.totalShots },
              { key: 'shotsOnTarget', label: 'Shots On Target', value: statMap.shotsOnTarget },
              { key: 'shotPct', label: 'Shot %', value: statMap.shotPct },
              { key: 'penaltyKickGoals', label: 'Penalty Goals', value: statMap.penaltyKickGoals },
              { key: 'totalPasses', label: 'Passes', value: statMap.totalPasses },
              { key: 'accuratePasses', label: 'Accurate Passes', value: statMap.accuratePasses },
              { key: 'passPct', label: 'Pass %', value: statMap.passPct }
            ].filter(stat => stat.value !== undefined);

          case 'defensive':
            return [
              { key: 'effectiveTackles', label: 'Tackles Won', value: statMap.effectiveTackles },
              { key: 'totalTackles', label: 'Total Tackles', value: statMap.totalTackles },
              { key: 'tacklePct', label: 'Tackle %', value: statMap.tacklePct },
              { key: 'interceptions', label: 'Interceptions', value: statMap.interceptions },
              { key: 'blockedShots', label: 'Blocked Shots', value: statMap.blockedShots },
              { key: 'effectiveClearance', label: 'Clearances', value: statMap.effectiveClearance }
            ].filter(stat => stat.value !== undefined);

          case 'goalkeeping':
            return [
              { key: 'saves', label: 'Saves', value: statMap.saves },
              { key: 'goalsConceded', label: 'Goals Conceded', value: statMap.goalsConceded },
              { key: 'cleanSheet', label: 'Clean Sheets', value: statMap.cleanSheet },
              { key: 'penaltyKicksSaved', label: 'Penalties Saved', value: statMap.penaltyKicksSaved },
              { key: 'shotsFaced', label: 'Shots Faced', value: statMap.shotsFaced }
            ].filter(stat => stat.value !== undefined);

          default:
            return [];
        }
      };

      const categoryStats = getImportantStats(category.name, category.stats);
      if (categoryStats.length === 0) return null;

      const statBoxes = categoryStats.map(({ key, label, value }) => 
        renderStatBox(label, value || '--', `${competitionName}-${category.name}-${key}`)
      );

      // Group stats into rows of 3
      const rows = [];
      for (let i = 0; i < statBoxes.length; i += 3) {
        rows.push(statBoxes.slice(i, i + 3));
      }

      return (
        <View key={`${competitionName}-${category.name}`} style={styles.statsSection}>
          <Text allowFontScaling={false} style={[styles.statsCategoryTitle, { color: colors.primary }]}>
            {category.displayName}
          </Text>
          {rows.map((row, rowIndex) => (
            <View key={`${competitionName}-${category.name}-row-${rowIndex}`} style={styles.statsRow}>
              {row}
            </View>
          ))}
        </View>
      );
    };

    const renderCompetitionStats = (competitionName, statsData) => {
      if (!statsData?.splits?.categories) return null;

      const categories = statsData.splits.categories;
      const renderedCategories = categories.map(category => 
        renderCategoryStats(category, competitionName)
      ).filter(category => category !== null);

      if (renderedCategories.length === 0) return null;

      return (
        <View key={competitionName} style={styles.competitionSection}>
          <Text allowFontScaling={false} style={[styles.competitionTitle, { color: theme.text }]}>
            {competitionName} Team Stats
          </Text>
          {renderedCategories}
        </View>
      );
    };

    return (
      <ScrollView 
        style={[styles.statsContainer, { backgroundColor: theme.background }]} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.statsContent}
      >
        {Object.entries(teamStats).map(([competitionName, statsData]) => 
          renderCompetitionStats(competitionName, statsData)
        )}
      </ScrollView>
    );
  };

  const renderRosterContent = () => {
    if (loadingRoster) {
      return (
        <View style={styles.matchesSection}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>Loading roster...</Text>
        </View>
      );
    }

    if (!roster || roster.length === 0) {
      return (
        <View style={styles.matchesSection}>
          <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>Roster data not available</Text>
        </View>
      );
    }

    // Group players by position for soccer
    const goalkeepers = roster.filter(player => {
      const pos = player.athlete?.position?.abbreviation || player.position?.abbreviation || '';
      return pos === 'GK' || pos === 'G';
    });
    
    const defenders = roster.filter(player => {
      const pos = player.athlete?.position?.abbreviation || player.position?.abbreviation || '';
      return ['CB', 'LB', 'RB', 'LWB', 'RWB', 'D'].includes(pos);
    });
    
    const midfielders = roster.filter(player => {
      const pos = player.athlete?.position?.abbreviation || player.position?.abbreviation || '';
      return ['CM', 'CDM', 'CAM', 'LM', 'RM', 'M'].includes(pos);
    });
    
    const forwards = roster.filter(player => {
      const pos = player.athlete?.position?.abbreviation || player.position?.abbreviation || '';
      return ['ST', 'CF', 'LW', 'RW', 'F'].includes(pos);
    });
    
    const others = roster.filter(player => {
      const pos = player.athlete?.position?.abbreviation || player.position?.abbreviation || '';
      return !['GK', 'G', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'D', 'CM', 'CDM', 'CAM', 'LM', 'RM', 'M', 'ST', 'CF', 'LW', 'RW', 'F'].includes(pos);
    });

    const renderPlayerSection = (title, players, sectionKey) => {
      if (players.length === 0) return null;

      const isCollapsed = collapsedRosterSections[sectionKey];

      const toggleSection = () => {
        setCollapsedRosterSections(prev => ({
          ...prev,
          [sectionKey]: !prev[sectionKey]
        }));
      };

      return (
        <View style={styles.rosterSection}>
          <TouchableOpacity 
            style={styles.rosterSectionHeader}
            onPress={toggleSection}
            activeOpacity={0.7}
          >
            <Text allowFontScaling={false} style={[styles.rosterSectionTitle, { color: theme.text }]}>
              {title} ({players.length})
            </Text>
            <Text allowFontScaling={false} style={[styles.rosterSectionArrow, { color: theme.text }]}>
              {isCollapsed ? '▶' : '▼'}
            </Text>
          </TouchableOpacity>
          {!isCollapsed && (
            <View style={styles.rosterTableContainer}>
              <View style={[styles.rosterTableHeader, { backgroundColor: theme.surface }]}>
                <Text allowFontScaling={false} style={[styles.rosterTableHeaderPlayer, { color: theme.text }]}>Player</Text>
                <Text allowFontScaling={false} style={[styles.rosterTableHeaderStatus, { color: theme.text }]}>Position</Text>
              </View>
              {players.map((playerData) => {
                const player = playerData.athlete || playerData;
                return (
                  <TouchableOpacity 
                    key={player.id} 
                    style={[styles.rosterTableRow, { borderBottomColor: theme.border, backgroundColor: theme.surfaceSecondary }]}
                    onPress={() => {
                      console.log('Player selected:', player.id, player.fullName || player.displayName);
                      // Navigate to player page
                      navigation.navigate('UECLPlayerPage', {
                        playerId: player.id,
                        playerName: player.fullName || player.displayName || player.name,
                        teamId: teamId,
                        sport: 'Europa Conference League',
                      });
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rosterTablePlayerCell}>
                      <View style={styles.rosterPlayerRow}>
                        <View style={styles.rosterPlayerInfo}>
                          <Text allowFontScaling={false} style={[styles.rosterTablePlayerName, { color: theme.text }]}>
                            {player.fullName || player.displayName || player.name}
                          </Text>
                          <Text allowFontScaling={false} style={[styles.rosterTablePlayerDetails, { color: theme.textTertiary }]}>
                            <Text allowFontScaling={false} style={[styles.rosterTablePlayerNumber, { color: theme.textTertiary }]}>
                              #{player.jersey || player.number || '--'}
                            </Text>
                            {' • '}
                            Age {player.age || 'N/A'}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.rosterTableStatusCell}>
                      <Text allowFontScaling={false} style={[styles.rosterTableStatusText, { color: theme.text }]}>
                        {player.position?.abbreviation || player.position?.name || 'N/A'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      );
    };

    return (
      <ScrollView style={[styles.rosterContainer, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
        {renderPlayerSection('Goalkeepers', goalkeepers, 'goalkeepers')}
        {renderPlayerSection('Defenders', defenders, 'defenders')}
        {renderPlayerSection('Midfielders', midfielders, 'midfielders')}
        {renderPlayerSection('Forwards', forwards, 'forwards')}
        {others.length > 0 && renderPlayerSection('Others', others, 'others')}
      </ScrollView>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'Games':
        return (
          <ScrollView style={[styles.gamesContainer, { backgroundColor: theme.background }]}>
            {renderCurrentGame()}
            
            <View style={styles.matchesSection}>
              <TouchableOpacity 
                style={styles.sectionHeader}
                onPress={() => setLastMatchesCollapsed(!lastMatchesCollapsed)}
              >
                <Text allowFontScaling={false} style={[styles.gameSectionTitle, { color: colors.primary }]}>Last Matches</Text>
                <Text allowFontScaling={false} style={[styles.collapseArrow, { color: colors.primary }]}>
                  {lastMatchesCollapsed ? '▶' : '▼'}
                </Text>
              </TouchableOpacity>
              
              {lastMatches.length > 0 ? (
                <View>
                  {(lastMatchesCollapsed ? lastMatches.slice(0, 1) : lastMatches).map((game, index) => (
                    <View key={`last-${game.id}-${index}`}>{renderMatchCard(game)}</View>
                  ))}
                </View>
              ) : (
                <View style={[styles.gameSectionCard, { backgroundColor: theme.surface }]}>
                  <Text allowFontScaling={false} style={[styles.noGameText, { color: theme.textSecondary }]}>No previous games found</Text>
                </View>
              )}
            </View>
            
            <View style={styles.matchesSection}>
              <TouchableOpacity 
                style={styles.sectionHeader}
                onPress={() => setNextMatchesCollapsed(!nextMatchesCollapsed)}
              >
                <Text allowFontScaling={false} style={[styles.gameSectionTitle, { color: colors.primary }]}>Next Matches</Text>
                <Text allowFontScaling={false} style={[styles.collapseArrow, { color: colors.primary }]}>
                  {nextMatchesCollapsed ? '▶' : '▼'}
                </Text>
              </TouchableOpacity>
              
              {nextMatches.length > 0 ? (
                <View>
                  {(nextMatchesCollapsed ? nextMatches.slice(0, 1) : nextMatches).map((game, index) => (
                    <View key={`next-${game.id}-${index}`}>{renderMatchCard(game)}</View>
                  ))}
                </View>
              ) : (
                <View style={[styles.gameSectionCard, { backgroundColor: theme.surface }]}>
                  <Text allowFontScaling={false} style={[styles.noGameText, { color: theme.textSecondary }]}>No upcoming games found</Text>
                </View>
              )}
            </View>
          </ScrollView>
        );
      case 'Stats':
        return renderStatsContent();
      case 'Roster':
        return renderRosterContent();
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.text }]}>Loading team information...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderTeamHeader()}
      
      {/* Fixed Tab Container */}
      <View style={[styles.fixedTabContainer, { backgroundColor: theme.surface }]}>
        {renderTabButtons()}
      </View>
      
      <ScrollView style={[styles.contentScrollView, { backgroundColor: theme.background }]}>
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
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  teamLogoHeader: {
    width: 80,
    height: 80,
  },
  teamInfo: {
    flex: 1,
    marginLeft: 10,
  },
  favoriteButton: {
    padding: 8,
    marginLeft: 10,
  },
  favoriteIcon: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  teamName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  teamDivision: {
    fontSize: 16,
    marginBottom: 8,
  },
  recordContainer: {
    marginTop: 8,
    marginLeft: -8,
    minHeight: 40,
  },
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  recordItem: {
    alignItems: 'center',
    minWidth: 60,
  },
  recordValue: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  recordLabel: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
  },
  fixedTabContainer: {
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
  },
  contentScrollView: {
    flex: 1,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTabButton: {
    borderBottomWidth: 3,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
  },
  activeTabText: {
    fontWeight: 'bold',
  },
  gamesContainer: {
    flex: 1,
    paddingTop: 5,
  },
  matchesSection: {
    paddingHorizontal: 15,
    paddingVertical: 5,
  },
  contentText: {
    fontSize: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  gameSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  gameSectionCard: {
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  gameCard: {
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    overflow: 'hidden',
  },
  gameTeams: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  matchContent: {
    padding: 15,
    paddingTop: 10,
  },
  teamContainer: {
    flex: 1,
    alignItems: 'center',
  },
  gameTeamLogo: {
    width: 40,
    height: 40,
    marginBottom: 5,
  },
  gameTeamName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  versus: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 5,
  },
  gameInfo: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  gameStatus: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  gameTime: {
    fontSize: 12,
  },
  noGameContainer: {
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  noGameText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  collapseArrow: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  teamLogoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  gameTeamScore: {
    fontSize: 30,
    fontWeight: 'bold',
    marginHorizontal: 8,
  },
  losingTeamName: {
    color: '#999',
  },
  // Roster styles
  rosterContainer: {
    flex: 1,
    padding: 15,
  },
  rosterSection: {
    marginBottom: 20,
  },
  rosterSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  rosterSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
  },
  rosterSectionArrow: {
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  rosterTableContainer: {
    backgroundColor: 'white',
    borderRadius: 6,
    overflow: 'hidden',
  },
  rosterTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#e9ecef',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  rosterTableHeaderPlayer: {
    flex: 3,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#495057',
  },
  rosterTableHeaderStatus: {
    flex: 1,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#495057',
    textAlign: 'center',
  },
  rosterTableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    alignItems: 'center',
  },
  rosterTablePlayerCell: {
    flex: 3,
  },
  rosterPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerHeadshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  rosterPlayerInfo: {
    flex: 1,
    marginLeft: 30,
  },
  rosterTablePlayerName: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  rosterTablePlayerDetails: {
    fontSize: 12,
  },
  rosterTablePlayerNumber: {
    fontWeight: '500',
  },
  rosterTableStatusCell: {
    flex: 1,
    alignItems: 'center',
  },
  rosterTableStatusText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  // Stats styles
  statsContainer: {
    flex: 1,
  },
  statsContent: {
    padding: 15,
  },
  statsLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  statsSection: {
    marginBottom: 25,
  },
  statsSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  competitionSection: {
    marginBottom: 30,
  },
  competitionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    paddingHorizontal: 15,
  },
  statsCategoryTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    padding: 15,
    marginHorizontal: 5,
    minHeight: 70,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  statBoxValue: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  statBoxLabel: {
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  // New match card styles
  leagueHeader: {
    backgroundColor: '#f8f9fa',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  leagueText: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  matchContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 12,
  },
  teamSection: {
    flex: 1,
    alignItems: 'center',
  },
  teamLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamLogo: {
    width: 40,
    height: 40,
  },
  losingTeamLogo: {
    opacity: 0.5,
  },
  teamScore: {
    fontSize: 24,
    fontWeight: 'bold',
    marginHorizontal: 8,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shootoutScore: {
    fontSize: 12,
    fontWeight: '500',
    marginHorizontal: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  teamAbbreviation: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  statusSection: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  gameStatus: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  gameDateTime: {
    fontSize: 11,
    marginBottom: 2,
  },
  venueSection: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  venueText: {
    fontSize: 11,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default UECLTeamPageScreen;

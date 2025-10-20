import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../../../context/ThemeContext';
import { getSafeImageUri } from '../../../utils/imageUtils';
import { 
  getScheduledMatches,
  formatMatchData,
  getLeagues 
} from '../../../services/lolService';

const { width } = Dimensions.get('window');

const LOLHomeScreen = ({ navigation, route }) => {
  const { colors, theme } = useTheme();
  const [liveSeries, setLiveSeries] = useState([]);
  const [completedSeries, setCompletedSeries] = useState([]);
  const [upcomingSeries, setUpcomingSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rawApiData, setRawApiData] = useState(null);
  const [activeFilter, setActiveFilter] = useState('today');
  const [allMatches, setAllMatches] = useState([]);
  const [leagues, setLeagues] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Fetch leagues and matches in parallel
      const [leaguesData, fetchedMatches] = await Promise.all([
        getLeagues(),
        getScheduledMatches()
      ]);
      
      // Store leagues data for logo matching
      if (leaguesData && leaguesData.length > 0) {
        setLeagues(leaguesData);
        console.log('Loaded leagues for logo matching:', leaguesData.length);
      }
      
      if (fetchedMatches && fetchedMatches.length > 0) {
        setAllMatches(fetchedMatches);
        
        // Debug: Log all matches with their states and dates
        console.log('=== ALL MATCHES DEBUG ===');
        fetchedMatches.forEach((match, index) => {
          const matchDate = new Date(match.startTime);
          // Simple approach: Use the Date object's built-in timezone methods
          // The browser/device handles DST automatically
          const easternFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          });
          const easternParts = easternFormatter.formatToParts(matchDate);
          const easternString = `${easternParts.find(p => p.type === 'year').value}-${easternParts.find(p => p.type === 'month').value}-${easternParts.find(p => p.type === 'day').value} ${easternParts.find(p => p.type === 'hour').value}:${easternParts.find(p => p.type === 'minute').value}:${easternParts.find(p => p.type === 'second').value}`;
          
          console.log(`${index + 1}. ${match.match?.teams?.[0]?.code || 'Unknown'} vs ${match.match?.teams?.[1]?.code || 'Unknown'}`);
          console.log(`   State: ${match.state}`);
          console.log(`   UTC: ${match.startTime}`);
          console.log(`   Eastern: ${easternString}`);
          console.log(`   Eastern Date: ${easternParts.find(p => p.type === 'month').value}/${easternParts.find(p => p.type === 'day').value}/${easternParts.find(p => p.type === 'year').value}`);
        });
        console.log('=== END ALL MATCHES ===');
        
        // Enhanced filtering logic for live and upcoming matches
        const liveData = fetchedMatches.filter(event => {
          // Include if state is inProgress
          if (event.state === 'inProgress') {
            // But exclude if it has no teams or match data
            if (!event.match || !event.match.teams || event.match.teams.length < 2) {
              console.log('Excluding inProgress match with no teams:', event);
              return false;
            }
            return true;
          }
          
          // Also include unstarted matches where at least one team has gameWins > 0
          if (event.state === 'unstarted' && event.match && event.match.teams) {
            const hasGameWins = event.match.teams.some(team => 
              team.result && team.result.gameWins > 0
            );
            if (hasGameWins) {
              console.log('Including unstarted match with gameWins as live:', event.match.teams.map(t => t.code), 'Wins:', event.match.teams.map(t => t.result?.gameWins));
              return true;
            }
          }
          
          return false;
        });
        
        const upcomingData = fetchedMatches.filter(event => {
          // Only include unstarted matches that don't have any gameWins
          if (event.state === 'unstarted' && event.match && event.match.teams) {
            const hasGameWins = event.match.teams.some(team => 
              team.result && team.result.gameWins > 0
            );
            return !hasGameWins; // Only include if no team has gameWins
          }
          return false;
        });
        
        console.log(`Live matches: ${liveData.length}`);
        console.log(`Upcoming matches: ${upcomingData.length}`);
        
        // Debug logging for live matches
        console.log('=== LIVE MATCHES DEBUG ===');
        liveData.forEach((match, index) => {
          const teams = match.match?.teams || [];
          console.log(`${index + 1}. State: ${match.state}, Teams: ${teams.length}`);
          if (teams.length >= 2) {
            console.log(`   ${teams[0]?.code || 'Unknown'} (${teams[0]?.result?.gameWins || 0}) vs ${teams[1]?.code || 'Unknown'} (${teams[1]?.result?.gameWins || 0})`);
          }
        });
        console.log('=== END LIVE MATCHES ===');
        
        setLiveSeries(liveData);
        
        // Set initial upcoming and completed matches filtered by today
        filterCompletedMatches(fetchedMatches, 'today');
        
        // Store raw data for debugging
        setRawApiData({
          allMatches: fetchedMatches,
          live: liveData,
          upcoming: upcomingData
        });
      } else {
        setAllMatches([]);
        setLiveSeries([]);
        setCompletedSeries([]);
        setUpcomingSeries([]);
        setRawApiData({ allMatches: [], live: [], upcoming: [] });
      }
      
    } catch (error) {
      console.error('Error loading LoL data:', error);
      Alert.alert('Error', 'Failed to load LoL matches. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const copyRawApiData = async () => {
    try {
      await Clipboard.setStringAsync(JSON.stringify(rawApiData, null, 2));
      Alert.alert(
        'Copied!', 
        'Raw API data copied to clipboard',
        [{ text: 'OK' }],
        { cancelable: true }
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to copy data to clipboard');
    }
  };

  // Filter upcoming matches by date from cached data
  const filterCompletedMatches = (matches, filter) => {
    // Get current Eastern time and create date-only objects for comparison
    // Use Intl.DateTimeFormat for reliable timezone conversion
    const now = new Date();
    const easternFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const easternParts = easternFormatter.formatToParts(now);
    const todayEastern = new Date(`${easternParts.find(p => p.type === 'year').value}-${easternParts.find(p => p.type === 'month').value}-${easternParts.find(p => p.type === 'day').value}`);
    const yesterdayEastern = new Date(todayEastern.getTime() - 24 * 60 * 60 * 1000);
    const tomorrowEastern = new Date(todayEastern.getTime() + 24 * 60 * 60 * 1000);
    
    // Debug logging
    console.log('=== DATE FILTERING DEBUG ===');
    console.log('Today Eastern:', todayEastern.toDateString());
    console.log('Yesterday Eastern:', yesterdayEastern.toDateString());
    console.log('Tomorrow Eastern:', tomorrowEastern.toDateString());
    console.log('Filter selected:', filter);
    console.log('Total matches to filter:', matches.length);
    
    // Helper function to check if match should be considered upcoming (not live)
    const isUpcoming = (event) => {
      // Only unstarted matches that don't have any gameWins
      if (event.state === 'unstarted' && event.match && event.match.teams) {
        const hasGameWins = event.match.teams.some(team => 
          team.result && team.result.gameWins > 0
        );
        return !hasGameWins; // Only include if no team has gameWins
      }
      return false;
    };
    
    let filteredData = [];
    
    if (filter === 'yesterday') {
      filteredData = matches.filter(event => {
        if (!isUpcoming(event)) return false; // Use enhanced upcoming check
        // Convert UTC to Eastern time for proper timezone comparison using Intl.DateTimeFormat
        const eventUTC = new Date(event.startTime);
        const eventEasternFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const eventEasternParts = eventEasternFormatter.formatToParts(eventUTC);
        const eventDayEastern = new Date(`${eventEasternParts.find(p => p.type === 'year').value}-${eventEasternParts.find(p => p.type === 'month').value}-${eventEasternParts.find(p => p.type === 'day').value}`);
        
        // Debug log for each match
        console.log(`Match: ${event.match?.teams?.[0]?.code || 'Unknown'} vs ${event.match?.teams?.[1]?.code || 'Unknown'}`);
        console.log(`  State: ${event.state}`);
        console.log(`  GameWins: ${event.match?.teams?.map(t => t.result?.gameWins || 0)}`);
        console.log(`  UTC: ${event.startTime}`);
        console.log(`  Eastern Day: ${eventDayEastern.toDateString()}`);
        console.log(`  Is Yesterday: ${eventDayEastern.getTime() === yesterdayEastern.getTime()}`);
        console.log(`  Is Upcoming (no gameWins): ${isUpcoming(event)}`);
        
        return eventDayEastern.getTime() === yesterdayEastern.getTime();
      });
    } else if (filter === 'today') {
      filteredData = matches.filter(event => {
        if (!isUpcoming(event)) return false; // Use enhanced upcoming check
        // Convert UTC to Eastern time for proper timezone comparison using Intl.DateTimeFormat
        const eventUTC = new Date(event.startTime);
        const eventEasternFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const eventEasternParts = eventEasternFormatter.formatToParts(eventUTC);
        const eventDayEastern = new Date(`${eventEasternParts.find(p => p.type === 'year').value}-${eventEasternParts.find(p => p.type === 'month').value}-${eventEasternParts.find(p => p.type === 'day').value}`);
        
        // Debug log for each match
        console.log(`Match: ${event.match?.teams?.[0]?.code || 'Unknown'} vs ${event.match?.teams?.[1]?.code || 'Unknown'}`);
        console.log(`  State: ${event.state}`);
        console.log(`  GameWins: ${event.match?.teams?.map(t => t.result?.gameWins || 0)}`);
        console.log(`  UTC: ${event.startTime}`);
        console.log(`  Eastern Day: ${eventDayEastern.toDateString()}`);
        console.log(`  Is Today: ${eventDayEastern.getTime() === todayEastern.getTime()}`);
        console.log(`  Is Upcoming (no gameWins): ${isUpcoming(event)}`);
        
        return eventDayEastern.getTime() === todayEastern.getTime();
      });
    } else if (filter === 'tomorrow') {
      filteredData = matches.filter(event => {
        if (!isUpcoming(event)) return false; // Use enhanced upcoming check
        // Convert UTC to Eastern time for proper timezone comparison using Intl.DateTimeFormat
        const eventUTC = new Date(event.startTime);
        const eventEasternFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const eventEasternParts = eventEasternFormatter.formatToParts(eventUTC);
        const eventDayEastern = new Date(`${eventEasternParts.find(p => p.type === 'year').value}-${eventEasternParts.find(p => p.type === 'month').value}-${eventEasternParts.find(p => p.type === 'day').value}`);
        
        // Debug log for each match
        console.log(`Match: ${event.match?.teams?.[0]?.code || 'Unknown'} vs ${event.match?.teams?.[1]?.code || 'Unknown'}`);
        console.log(`  State: ${event.state}`);
        console.log(`  GameWins: ${event.match?.teams?.map(t => t.result?.gameWins || 0)}`);
        console.log(`  UTC: ${event.startTime}`);
        console.log(`  Eastern Day: ${eventDayEastern.toDateString()}`);
        console.log(`  Is Tomorrow: ${eventDayEastern.getTime() === tomorrowEastern.getTime()}`);
        console.log(`  Is Upcoming (no gameWins): ${isUpcoming(event)}`);
        
        return eventDayEastern.getTime() === tomorrowEastern.getTime();
      });
    }
    
    console.log(`Filtered ${filteredData.length} upcoming matches for ${filter}`);
    
    // Also filter completed matches for the same date
    let completedFilteredData = [];
    
    if (filter === 'yesterday') {
      completedFilteredData = matches.filter(event => {
        if (event.state !== 'completed') return false;
        const eventUTC = new Date(event.startTime);
        const eventEasternFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const eventEasternParts = eventEasternFormatter.formatToParts(eventUTC);
        const eventDayEastern = new Date(`${eventEasternParts.find(p => p.type === 'year').value}-${eventEasternParts.find(p => p.type === 'month').value}-${eventEasternParts.find(p => p.type === 'day').value}`);
        return eventDayEastern.getTime() === yesterdayEastern.getTime();
      });
    } else if (filter === 'today') {
      completedFilteredData = matches.filter(event => {
        if (event.state !== 'completed') return false;
        const eventUTC = new Date(event.startTime);
        const eventEasternFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const eventEasternParts = eventEasternFormatter.formatToParts(eventUTC);
        const eventDayEastern = new Date(`${eventEasternParts.find(p => p.type === 'year').value}-${eventEasternParts.find(p => p.type === 'month').value}-${eventEasternParts.find(p => p.type === 'day').value}`);
        return eventDayEastern.getTime() === todayEastern.getTime();
      });
    } else if (filter === 'tomorrow') {
      completedFilteredData = matches.filter(event => {
        if (event.state !== 'completed') return false;
        const eventUTC = new Date(event.startTime);
        const eventEasternFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const eventEasternParts = eventEasternFormatter.formatToParts(eventUTC);
        const eventDayEastern = new Date(`${eventEasternParts.find(p => p.type === 'year').value}-${eventEasternParts.find(p => p.type === 'month').value}-${eventEasternParts.find(p => p.type === 'day').value}`);
        return eventDayEastern.getTime() === tomorrowEastern.getTime();
      });
    }
    
    console.log(`Filtered ${completedFilteredData.length} completed matches for ${filter}`);
    
    // Sort completed matches by most recent first (descending order)
    completedFilteredData.sort((a, b) => {
      const dateA = new Date(a.startTime);
      const dateB = new Date(b.startTime);
      return dateB.getTime() - dateA.getTime(); // Most recent first
    });
    
    console.log('Completed matches sorted by most recent first');
    console.log('=== END DEBUG ===');
    
    setUpcomingSeries(filteredData);
    setCompletedSeries(completedFilteredData);
  };

  // Handle filter change
  const handleFilterChange = (filter) => {
    setActiveFilter(filter);
    filterCompletedMatches(allMatches, filter);
  };

  // Helper function to format relative time
  const getRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      // Format as "Oct 12, 2025 • 3:30 PM"
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      const month = monthNames[date.getMonth()];
      const day = date.getDate();
      const year = date.getFullYear();
      
      let hours = date.getHours();
      const minutes = date.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      
      hours = hours % 12;
      hours = hours ? hours : 12; // 0 should be 12
      
      const formattedTime = `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
      
      return `${month} ${day}, ${year} • ${formattedTime}`;
    }
  };

  // Helper function to clean event name (remove text after ' - ')
  const cleanEventName = (eventName) => {
    return eventName?.split(' - ')[0] || eventName;
  };

  // Helper function to get tournament logo from leagues data
  const getTournamentLogo = (tournamentName) => {
    if (!leagues || !leagues.length || !tournamentName) return null;
    
    // Find the league that matches the tournament name
    const matchingLeague = leagues.find(league => {
      // Try exact match first
      if (league.name === tournamentName) return true;
      
      // Try partial matches for common tournament formats
      const leagueName = league.name.toLowerCase();
      const tournamentLower = tournamentName.toLowerCase();
      
      // Check if tournament name contains league name or vice versa
      return leagueName.includes(tournamentLower) || tournamentLower.includes(leagueName);
    });
    
    return matchingLeague?.image || null;
  };

  // Live Series Card - LoL style with teams on left/right, score in middle
  const LiveSeriesCard = ({ match }) => {
    const formattedMatch = formatMatchData(match);
    if (!formattedMatch) return null;

    const teams = formattedMatch.teams || [];
    
    // Safety check: Don't render if we don't have at least 2 teams
    if (teams.length < 2) {
      console.log('LiveSeriesCard: Skipping render due to insufficient teams:', teams.length);
      return null;
    }
    
    const eventName = cleanEventName(formattedMatch.tournament);
    
    return (
      <TouchableOpacity
        style={[styles.liveSeriesCard, { backgroundColor: theme.surfaceSecondary }]}
        onPress={() => navigateToMatchDetails(formattedMatch)}
      >
        {/* Live indicator */}
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>

        {/* Event info */}
        <Text style={[styles.liveEventChildLabel, { color: theme.textTertiary }]}>
          {formattedMatch.blockName?.toUpperCase() || 'MATCH'}
        </Text>
        <Text style={[styles.liveEventName, { color: theme.text }]} numberOfLines={2}>
          {eventName}
        </Text>

        {/* Teams container */}
        <View style={styles.liveTeamsContainer}>
          {/* Team 1 */}
          <View style={styles.liveTeamSide}>
            <View style={styles.liveTeamLogo}>
              {teams[0]?.image ? (
                <Image
                  source={{ uri: getSafeImageUri(teams[0].image) }}
                  style={styles.teamLogoImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={[styles.teamLogoPlaceholder, { backgroundColor: theme.border }]}>
                  <Text style={styles.teamLogoText}>
                    {teams[0]?.code?.substring(0, 2).toUpperCase() || teams[0]?.name?.substring(0, 2).toUpperCase() || '??'}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.liveTeamName, { color: theme.text }]} numberOfLines={1}>
              {teams[0]?.code || teams[0]?.name || 'TBD'}
            </Text>
          </View>

          {/* Score */}
          <View style={styles.liveScoreContainer}>
            <Text style={[styles.liveScore, { color: theme.text }]}>
              {teams[0]?.result?.gameWins || 0} - {teams[1]?.result?.gameWins || 0}
            </Text>
          </View>

          {/* Team 2 */}
          <View style={styles.liveTeamSide}>
            <View style={styles.liveTeamLogo}>
              {teams[1]?.image ? (
                <Image
                  source={{ uri: getSafeImageUri(teams[1].image) }}
                  style={styles.teamLogoImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={[styles.teamLogoPlaceholder, { backgroundColor: theme.border }]}>
                  <Text style={styles.teamLogoText}>
                    {teams[1]?.code?.substring(0, 2).toUpperCase() || teams[1]?.name?.substring(0, 2).toUpperCase() || '??'}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.liveTeamName, { color: theme.text }]} numberOfLines={1}>
              {teams[1]?.code || teams[1]?.name || 'TBD'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Group series by event for upcoming matches section
  const groupSeriesByEvent = (series) => {
    const grouped = {};
    
    series.forEach(match => {
      const formattedMatch = formatMatchData(match);
      if (!formattedMatch) return;
      
      const eventKey = formattedMatch.tournament || 'Unknown Event';
      
      if (!grouped[eventKey]) {
        grouped[eventKey] = {
          eventName: eventKey,
          eventChildLabel: formattedMatch.blockName || '',
          matches: []
        };
      }
      
      grouped[eventKey].matches.push(formattedMatch);
    });
    
    return Object.values(grouped);
  };

  // Upcoming Matches Section - LoL style grouped by event
  const UpcomingMatchesSection = ({ series }) => {
    const groupedEvents = groupSeriesByEvent(series);
    
    if (groupedEvents.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
            No upcoming matches scheduled
          </Text>
        </View>
      );
    }
    
    return (
      <View style={styles.upcomingMatchesContainer}>
        {groupedEvents.map((event, index) => (
          <View key={`${event.eventName}-${index}`} style={[styles.eventContainer, { backgroundColor: theme.surfaceSecondary }]}>
            {/* Event Header */}
            <View style={[styles.eventHeaderContainer, { borderBottomColor: theme.border }]}>
              <View style={styles.eventLogoContainer}>
                {getTournamentLogo(event.eventName) ? (
                  <Image
                    source={{ uri: getSafeImageUri(getTournamentLogo(event.eventName)) }}
                    style={styles.eventLogoImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={[styles.eventLogoPlaceholder, { backgroundColor: theme.border }]}>
                    <Ionicons name="trophy" size={16} color={theme.textSecondary} />
                  </View>
                )}
              </View>
              <View style={styles.eventInfo}>
                <Text style={[styles.upcomingEventName, { color: theme.text }]} numberOfLines={1}>
                  {cleanEventName(event.eventName)}
                </Text>
                <Text style={[styles.upcomingEventChildLabel, { color: theme.textTertiary }]}>
                  {event.eventChildLabel?.toUpperCase() || 'TOURNAMENT'}
                </Text>
              </View>
            </View>
            
            {/* Matches List */}
            <View style={styles.matchesList}>
              {event.matches.map((match, matchIndex) => {
                const teams = match.teams || [];
                const matchTime = new Date(match.startTime);
                
                return (
                  <View key={`${match.id}-${matchIndex}`}>
                    <TouchableOpacity
                      style={styles.upcomingMatchRow}
                      onPress={() => navigateToMatchDetails(match)}
                    >
                      {/* Time */}
                      <View style={styles.matchTimeContainer}>
                        <Text style={[styles.matchTime, { color: theme.textSecondary }]}>
                          {(() => {
                            const date = new Date(matchTime);
                            // Get hours and minutes in 12-hour format
                            let hours = date.getHours();
                            const minutes = date.getMinutes();
                            hours = hours % 12;
                            hours = hours ? hours : 12; // 0 should be 12
                            const formattedHours = hours.toString().padStart(2, '0');
                            const formattedMinutes = minutes.toString().padStart(2, '0');
                            return `${formattedHours}:${formattedMinutes}`;
                          })()}
                        </Text>
                        <Text style={[styles.matchTimeAmPm, { color: theme.textSecondary }]}>
                          {(() => {
                            const date = new Date(matchTime);
                            const hours = date.getHours();
                            return hours >= 12 ? 'PM' : 'AM';
                          })()}
                        </Text>
                      </View>
                      
                      {/* Teams */}
                      <View style={styles.stackedTeams}>
                        {teams.slice(0, 2).map((team, teamIndex) => (
                          <View key={`${team.id || teamIndex}`} style={styles.teamWithLogo}>
                            <View style={styles.teamLogoSmall}>
                              {team.image ? (
                                <Image
                                  source={{ uri: getSafeImageUri(team.image) }}
                                  style={styles.teamLogoSmallImage}
                                  resizeMode="contain"
                                />
                              ) : (
                                <View style={[styles.teamLogoSmallPlaceholder, { backgroundColor: theme.border }]}>
                                  <Text style={styles.teamLogoSmallText}>
                                    {team.code?.substring(0, 2).toUpperCase() || team.name?.substring(0, 2).toUpperCase() || '??'}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text style={[styles.stackedTeamName, { color: theme.text }]} numberOfLines={1}>
                              {team.code || team.name || 'TBD'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </TouchableOpacity>
                    
                    {matchIndex < event.matches.length - 1 && (
                      <View style={[styles.matchSeparator, { backgroundColor: theme.border }]} />
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    );
  };

  // Completed Series Card - LoL style cube-like form with event child label and relative time
  const CompletedSeriesCard = ({ match }) => {
    const formattedMatch = formatMatchData(match);
    if (!formattedMatch) return null;

    const teams = formattedMatch.teams || [];
    const eventName = cleanEventName(formattedMatch.tournament);
    const relativeTime = getRelativeTime(formattedMatch.startTime);
    
    return (
      <TouchableOpacity
        style={[styles.completedSeriesCard, { backgroundColor: theme.surface }]}
        onPress={() => navigateToMatchDetails(formattedMatch)}
      >
        {/* Event info */}
        <Text style={[styles.completedEventLabel, { color: theme.text }]}>
          {eventName}
        </Text>
        
        <Text style={[styles.completedTime, { color: theme.textSecondary }]}>
          {relativeTime}
        </Text>

        {/* Teams */}
        <View style={styles.completedTeamsContainer}>
          {teams.slice(0, 2).map((team, index) => {
            const team1Score = teams[0]?.result?.gameWins || 0;
            const team2Score = teams[1]?.result?.gameWins || 0;
            const currentTeamScore = team.result?.gameWins || 0;
            const hasHigherScore = (index === 0 && team1Score > team2Score) || (index === 1 && team2Score > team1Score);
            
            return (
              <View key={`${team.id || index}`} style={styles.completedTeamRow}>
                <View style={styles.completedTeamWithLogo}>
                  <View style={styles.completedTeamLogo}>
                    {team.image ? (
                      <Image
                        source={{ uri: getSafeImageUri(team.image) }}
                        style={styles.completedTeamLogoImage}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={[styles.completedTeamLogoPlaceholder, { backgroundColor: theme.border }]}>
                        <Text style={styles.completedTeamLogoText}>
                          {team.code?.substring(0, 2).toUpperCase() || team.name?.substring(0, 2).toUpperCase() || '??'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.completedTeamName, { color: theme.text }]} numberOfLines={1}>
                    {team.code || team.name || 'TBD'}
                  </Text>
                </View>
                <Text style={[styles.completedScore, { 
                  color: hasHigherScore ? colors.primary : theme.textSecondary 
                }]}>
                  {currentTeamScore}
                </Text>
              </View>
            );
          })}
        </View>
      </TouchableOpacity>
    );
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const getMatchStatus = (match) => {
    switch (match.state) {
      case 'inProgress':
        return { text: 'LIVE', color: colors.error, bg: `${colors.error}20` };
      case 'completed':
        return { text: 'FINAL', color: theme.textSecondary, bg: `${theme.textSecondary}20` };
      case 'unstarted':
        return { text: formatTime(match.startTime), color: theme.textSecondary, bg: 'transparent' };
      default:
        return { text: match.state?.toUpperCase() || 'TBD', color: theme.textSecondary, bg: 'transparent' };
    }
  };

  const navigateToMatchDetails = (match) => {
    navigation.navigate('LOLMatchDetails', {
      matchId: match.id,
      match: match
    });
  };

  const renderMatchCard = (match, index) => {
    const formattedMatch = formatMatchData(match);
    if (!formattedMatch) return null;

    const status = getMatchStatus(formattedMatch);
    const teams = formattedMatch.teams || [];
    
    return (
      <TouchableOpacity
        key={`${formattedMatch.id}-${index}`}
        style={[styles.matchCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
        onPress={() => navigateToMatchDetails(formattedMatch)}
      >
        <View style={styles.matchHeader}>
          <View style={styles.tournamentInfo}>
            <Text style={[styles.tournamentName, { color: theme.textSecondary }]} numberOfLines={1}>
              {formattedMatch.tournament}
            </Text>
            <Text style={[styles.seriesInfo, { color: theme.textTertiary }]} numberOfLines={1}>
              {formattedMatch.series}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.color }]}>
              {status.text}
            </Text>
          </View>
        </View>

        <View style={styles.teamsContainer}>
          {teams.length >= 2 ? (
            <>
              {/* Team 1 */}
              <View style={styles.teamRow}>
                <View style={styles.teamInfo}>
                  {teams[0].image && (
                    <Image
                      source={{ uri: getSafeImageUri(teams[0].image) }}
                      style={styles.teamLogo}
                      resizeMode="contain"
                    />
                  )}
                  <Text style={[styles.teamName, { color: theme.text }]} numberOfLines={1}>
                    {teams[0].name || teams[0].code || 'TBD'}
                  </Text>
                </View>
                {formattedMatch.state === 'completed' && (
                  <Text style={[styles.teamScore, { color: theme.text }]}>
                    {teams[0].result?.gameWins || 0}
                  </Text>
                )}
              </View>

              {/* VS Divider */}
              <View style={styles.vsDivider}>
                <Text style={[styles.vsText, { color: theme.textTertiary }]}>VS</Text>
              </View>

              {/* Team 2 */}
              <View style={styles.teamRow}>
                <View style={styles.teamInfo}>
                  {teams[1].image && (
                    <Image
                      source={{ uri: getSafeImageUri(teams[1].image) }}
                      style={styles.teamLogo}
                      resizeMode="contain"
                    />
                  )}
                  <Text style={[styles.teamName, { color: theme.text }]} numberOfLines={1}>
                    {teams[1].name || teams[1].code || 'TBD'}
                  </Text>
                </View>
                {formattedMatch.state === 'completed' && (
                  <Text style={[styles.teamScore, { color: theme.text }]}>
                    {teams[1].result?.gameWins || 0}
                  </Text>
                )}
              </View>
            </>
          ) : (
            <View style={styles.noTeamsContainer}>
              <Text style={[styles.noTeamsText, { color: theme.textSecondary }]}>
                {formattedMatch.name}
              </Text>
            </View>
          )}
        </View>

        {formattedMatch.startTime && (
          <View style={styles.matchFooter}>
            <Text style={[styles.matchDate, { color: theme.textTertiary }]}>
              {formatDate(formattedMatch.startTime)}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderSection = (title, matches, emptyMessage) => {
    if (!matches || matches.length === 0) {
      return (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
          <View style={[styles.emptyState, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{emptyMessage}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
        {matches.map((match, index) => renderMatchCard(match, index))}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading League of Legends matches...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            LEAGUE OF LEGENDS
          </Text>
        </View>
        {/* Live Matches */}
        {liveSeries.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>● Live matches</Text>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
              {liveSeries.map((match, index) => (
                <LiveSeriesCard key={`live-${match.match?.id || index}`} match={match} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Upcoming Matches Filter Buttons */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Upcoming matches</Text>
          </View>
          
          <View style={styles.upcomingFilters}>
            {['yesterday', 'today', 'tomorrow'].map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.upcomingFilterButton,
                  activeFilter === filter && styles.activeUpcomingFilter,
                  { 
                    backgroundColor: activeFilter === filter ? colors.primary : theme.surfaceSecondary,
                    borderColor: theme.border 
                  }
                ]}
                onPress={() => handleFilterChange(filter)}
              >
                <Text style={[
                  styles.upcomingFilterText,
                  { color: activeFilter === filter ? 'white' : theme.text }
                ]}>
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Upcoming Matches - Grouped by Event */}
        {upcomingSeries.length > 0 ? (
          <View style={styles.upcomingContainer}>
            <UpcomingMatchesSection series={upcomingSeries} />
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={theme.textTertiary} />
            <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
              No upcoming matches
            </Text>
          </View>
        )}

        {/* Completed Matches */}
        {completedSeries.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Completed matches</Text>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
              {completedSeries.map((match, index) => (
                <CompletedSeriesCard key={`completed-${match.match?.id || index}`} match={match} />
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.bottomPadding} />
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
    lineHeight: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  horizontalScroll: {
    paddingLeft: 16,
  },
  // Live Series Card Styles
  liveSeriesCard: {
    width: 280,
    padding: 16,
    borderRadius: 12,
    marginRight: 12,
    minHeight: 130,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff4444',
    marginRight: 6,
  },
  liveText: {
    color: '#ff4444',
    fontSize: 12,
    fontWeight: 'bold',
  },
  liveEventChildLabel: {
    marginTop: -20,
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 4,
  },
  liveEventName: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  liveTeamsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  liveTeamSide: {
    alignItems: 'center',
    flex: 1,
  },
  liveTeamLogo: {
    width: 32,
    height: 32,
    marginBottom: 8,
  },
  teamLogoImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  teamLogoPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  teamLogoText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: 'white',
  },
  liveTeamName: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  liveScoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  liveScore: {
    fontSize: 25,
    fontWeight: 'bold',
  },
  // Upcoming Matches Styles
  upcomingFilters: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  upcomingFilterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
  },
  activeUpcomingFilter: {
    // Active styles handled in component
  },
  upcomingFilterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  upcomingContainer: {
    paddingHorizontal: 16
  },
  upcomingMatchesContainer: {
    marginBottom: 24,
  },
  eventContainer: {
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  eventHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  eventLogoContainer: {
    marginRight: 12,
  },
  eventLogoImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  eventLogoPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventInfo: {
    flex: 1,
  },
  upcomingEventName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  upcomingEventChildLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  matchesList: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  upcomingMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  matchTimeContainer: {
    width: 50,
    marginRight: 16,
  },
  matchTime: {
    fontSize: 12,
    fontWeight: '500',
  },
  matchTimeAmPm: {
    fontSize: 11,
    opacity: 0.7,
  },
  stackedTeams: {
    flex: 1,
  },
  teamWithLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamLogoSmall: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  teamLogoSmallImage: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  teamLogoSmallPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  teamLogoSmallText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: 'white',
  },
  stackedTeamName: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  matchSeparator: {
    height: 1,
    marginHorizontal: 16,
    opacity: 0.3,
  },
  // Completed Series Card Styles
  completedSeriesCard: {
    width: 180,
    padding: 12,
    borderRadius: 8,
    marginRight: 12,
    minHeight: 120,
  },
  completedEventLabel: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  completedTime: {
    fontSize: 11,
    marginBottom: 8,
  },
  eventName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    lineHeight: 18,
  },
  completedTeamsContainer: {
    marginTop: 'auto',
  },
  completedTeamRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  completedTeamWithLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  completedTeamLogo: {
    width: 16,
    height: 16,
    marginRight: 6,
  },
  completedTeamLogoImage: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  completedTeamLogoPlaceholder: {
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completedTeamLogoText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: 'white',
  },
  completedTeamName: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  completedScore: {
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  // Empty State Styles
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyStateText: {
    marginTop: 12,
    fontSize: 16,
    textAlign: 'center',
  },
  bottomPadding: {
    height: 32,
  },
});

export default LOLHomeScreen;
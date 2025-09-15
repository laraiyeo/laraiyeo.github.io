import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Dimensions,
  FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';

const { width, height } = Dimensions.get('window');

const UCLBracketScreen = ({ navigation, route }) => {
  const { theme, colors, isDarkMode } = useTheme();
  const [loading, setLoading] = useState(true);
  const [currentLeague] = useState('uefa.champions'); // Fixed to Champions League only
  const [view, setView] = useState('knockout'); // 'knockout' or 'finals'
  
  // Data states
  const [standings, setStandings] = useState([]);
  const [knockoutPairings, setKnockoutPairings] = useState({});
  const [roundOf16Matchups, setRoundOf16Matchups] = useState([]);
  const [quarterfinalsMatchups, setQuarterfinalsMatchups] = useState([]);
  const [semifinalsMatchups, setSemifinalsMatchups] = useState([]);
  const [finalsMatchups, setFinalsMatchups] = useState([]);
  
  // Modal states
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedMatchup, setSelectedMatchup] = useState(null);
  
  // Cache states
  const [cache, setCache] = useState({
    standings: null,
    knockout: null,
    roundOf16: null,
    quarterfinals: null,
    semifinals: null,
    finals: null,
    lastUpdate: 0
  });

  useEffect(() => {
    loadBracketData();
  }, []); // Remove currentLeague dependency since it's fixed

  const TeamLogoImage = ({ teamId, style }) => {
    const [logoSource, setLogoSource] = useState(null);
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
      if (teamId) {
        const logos = getTeamLogo(teamId, isDarkMode);
        setLogoSource({ uri: logos.primaryUrl });
        setRetryCount(0);
      } else {
        setLogoSource(require('../../../../assets/soccer.png'));
      }
    }, [teamId, isDarkMode]);

    const handleError = () => {
      if (retryCount === 0 && teamId) {
        const logos = getTeamLogo(teamId, isDarkMode);
        setLogoSource({ uri: logos.fallbackUrl });
        setRetryCount(1);
      } else if (retryCount === 1 && teamId) {
        setLogoSource({ uri: `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png` });
        setRetryCount(2);
      } else {
        setLogoSource(require('../../../../assets/soccer.png'));
      }
    };

    return (
      <Image
        style={style}
        source={logoSource}
        onError={handleError}
        resizeMode="contain"
      />
    );
  };

  const getTeamLogo = (teamId, isDarkMode) => {
    const primaryUrl = isDarkMode
      ? `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`
      : `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
    
    const fallbackUrl = isDarkMode
      ? `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`
      : `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`;

    return { primaryUrl, fallbackUrl };
  };

  const clearCache = () => {
    setCache({
      standings: null,
      knockout: null,
      roundOf16: null,
      quarterfinals: null,
      semifinals: null,
      finals: null,
      lastUpdate: 0
    });
  };

  const loadBracketData = async () => {
    try {
      setLoading(true);
      
      // Check cache first
      const now = Date.now();
      const cacheAge = now - cache.lastUpdate;
      const CACHE_DURATION = 30000; // 30 seconds
      
      if (cacheAge < CACHE_DURATION && cache.standings) {
        setStandings(cache.standings);
        setKnockoutPairings(cache.knockout || {});
        setRoundOf16Matchups(cache.roundOf16 || []);
        setQuarterfinalsMatchups(cache.quarterfinals || []);
        setSemifinalsMatchups(cache.semifinals || []);
        setFinalsMatchups(cache.finals || []);
        setLoading(false);
        return;
      }

      // Fetch knockout data first 
      await fetchKnockoutPlayoffs();

      // Fetch finals bracket data
      const qfData = await fetchQuarterfinalsMatchups();
      const sfData = await fetchSemifinalsMatchups();
      const finalsData = await fetchFinalsMatchups();

      setQuarterfinalsMatchups(qfData);
      setSemifinalsMatchups(sfData);
      setFinalsMatchups(finalsData);

      // Update cache
      const standingsData = await fetchStandings();
      setCache({
        standings: standingsData,
        knockout: knockoutPairings,
        roundOf16: [],
        quarterfinals: qfData,
        semifinals: sfData,
        finals: finalsData,
        lastUpdate: now
      });

    } catch (error) {
      console.error('Error loading bracket data:', error);
      Alert.alert('Error', 'Failed to load bracket data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Data fetching functions following bracket.js exactly
  const fetchKnockoutPlayoffs = async () => {
    try {
      const currentYear = new Date().getFullYear() ;
      const CALENDAR_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=${currentYear}0101`;

      const calendarResponse = await fetch(CALENDAR_API_URL);
      const calendarData = await calendarResponse.json();

      // Find the Knockout Round Playoffs stage
      const knockoutStage = calendarData.leagues?.[0]?.calendar?.[0]?.entries.find(e => 
        e.label === "Knockout Round Playoffs"
      );

      if (!knockoutStage) {
        console.log("Knockout Round Playoffs not found in calendar.");
        return;
      }

      const dates = `${knockoutStage.startDate.split("T")[0].replace(/-/g, "")}-${knockoutStage.endDate.split("T")[0].replace(/-/g, "")}`;
      const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=${dates}`;
      
      const scoreboardResponse = await fetch(SCOREBOARD_API_URL);
      const scoreboardData = await scoreboardResponse.json();
      const events = scoreboardData.events || [];

      // Get standings for team rankings
      const standings = await fetchStandings();

      // Group matches by pairing
      const pairings = groupMatchesByPairing(events, standings);
      setKnockoutPairings(pairings);

    } catch (error) {
      console.error("Error fetching knockout playoffs:", error);
    }
  };

  const fetchStandings = async () => {
    try {
      const STANDINGS_URL = `https://cdn.espn.com/core/soccer/table?xhr=1&league=uefa.champions`;
      const response = await fetch(STANDINGS_URL);
      const data = await response.json();
      
      const standings = data.content.standings.groups[0].standings.entries || [];
      setStandings(standings);
      return standings;
    } catch (error) {
      console.error("Error fetching standings:", error);
      return [];
    }
  };

  const fetchQuarterfinalsMatchups = async () => {
    try {
      const currentYear = new Date().getFullYear() ;
      const CALENDAR_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=${currentYear}0101`;

      const calendarResponse = await fetch(CALENDAR_API_URL);
      const calendarData = await calendarResponse.json();

      const quarterfinalsStage = calendarData.leagues?.[0]?.calendar?.[0]?.entries.find(e => 
        e.label === "Quarterfinals" || e.label === "Quarter-finals" || e.label.toLowerCase().includes("quarter")
      );

      if (!quarterfinalsStage) {
        return [];
      }

      const dates = `${quarterfinalsStage.startDate.split("T")[0].replace(/-/g, "")}-${quarterfinalsStage.endDate.split("T")[0].replace(/-/g, "")}`;
      const API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=${dates}`;
      
      const response = await fetch(API_URL);
      const data = await response.json();
      const events = data.events || [];
      
      return groupRoundOf16ByMatchup(events);
    } catch (error) {
      console.error("Error fetching Quarterfinals matchups:", error);
      return [];
    }
  };

  const fetchSemifinalsMatchups = async () => {
    try {
      const currentYear = new Date().getFullYear() ;
      const CALENDAR_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=${currentYear}0101`;

      const calendarResponse = await fetch(CALENDAR_API_URL);
      const calendarData = await calendarResponse.json();

      const semifinalsStage = calendarData.leagues?.[0]?.calendar?.[0]?.entries.find(e => 
        e.label === "Semifinals" || e.label === "Semi-finals" || e.label.toLowerCase().includes("semi")
      );

      if (!semifinalsStage) {
        return [];
      }

      const dates = `${semifinalsStage.startDate.split("T")[0].replace(/-/g, "")}-${semifinalsStage.endDate.split("T")[0].replace(/-/g, "")}`;
      const API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=${dates}`;
      
      const response = await fetch(API_URL);
      const data = await response.json();
      const events = data.events || [];
      
      return groupRoundOf16ByMatchup(events);
    } catch (error) {
      console.error("Error fetching Semifinals matchups:", error);
      return [];
    }
  };

  const fetchFinalsMatchups = async () => {
    try {
      const currentYear = new Date().getFullYear() ;
      const CALENDAR_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=${currentYear}0101`;

      const calendarResponse = await fetch(CALENDAR_API_URL);
      const calendarData = await calendarResponse.json();

      const finalsStage = calendarData.leagues?.[0]?.calendar?.[0]?.entries.find(e => 
        e.label === "Final"
      );

      if (!finalsStage) {
        return [];
      }

      const dates = `${finalsStage.startDate.split("T")[0].replace(/-/g, "")}-${finalsStage.endDate.split("T")[0].replace(/-/g, "")}`;
      const API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=${dates}`;
      
      const response = await fetch(API_URL);
      const data = await response.json();
      const events = data.events || [];
      
      return groupRoundOf16ByMatchup(events);
    } catch (error) {
      console.error("Error fetching Finals matchups:", error);
      return [];
    }
  };

  const groupMatchesByPairing = (events, standings) => {
    const matchups = {};

    events.forEach(event => {
      // Extract team information
      const homeTeam = {
        id: event.competitions[0].competitors[0].team.id,
        name: event.competitions[0].competitors[0].team.name,
        shortDisplayName: event.competitions[0].competitors[0].team.shortDisplayName,
        color: event.competitions[0].competitors[0].team.color
      };

      const awayTeam = {
        id: event.competitions[0].competitors[1].team.id,
        name: event.competitions[0].competitors[1].team.name,
        shortDisplayName: event.competitions[0].competitors[1].team.shortDisplayName,
        color: event.competitions[0].competitors[1].team.color
      };

      // Create matchup key - sort team IDs to ensure consistency
      const teamIds = [homeTeam.id, awayTeam.id].sort();
      const matchupKey = `${teamIds[0]}-${teamIds[1]}`;

      // Initialize matchup if it doesn't exist
      if (!matchups[matchupKey]) {
        matchups[matchupKey] = {
          homeTeam: homeTeam,
          awayTeam: awayTeam,
          matches: [],
          aggregateHome: 0,
          aggregateAway: 0
        };
      }

      // Extract scores and leg information
      const homeScore = event.competitions[0].competitors[0].score || 0;
      const awayScore = event.competitions[0].competitors[1].score || 0;
      const leg = event.name.includes("Leg 2") ? 2 : 1;
      const status = event.status.type.name.toLowerCase();

      // Add match data
      matchups[matchupKey].matches.push({
        leg: leg,
        homeScore: parseInt(homeScore),
        awayScore: parseInt(awayScore),
        status: status,
        date: event.date,
        homeShootoutScore: event.competitions[0].competitors[0].shootoutScore || 0,
        awayShootoutScore: event.competitions[0].competitors[1].shootoutScore || 0
      });

      // Update aggregate scores
      matchups[matchupKey].aggregateHome += parseInt(homeScore);
      matchups[matchupKey].aggregateAway += parseInt(awayScore);
    });

    // Convert to array and determine pairings based on rankings
    const matchupArray = Object.values(matchups);
    
    // Sort and assign to pairings based on ranking patterns
    const pairings = {
      "Pairing I": [],
      "Pairing II": [],
      "Pairing III": [],
      "Pairing IV": []
    };

    matchupArray.forEach(matchup => {
      const homeRank = getTeamRank(matchup.homeTeam.id, standings);
      const awayRank = getTeamRank(matchup.awayTeam.id, standings);
      
      const ranks = [homeRank, awayRank].filter(rank => rank !== null).sort((a, b) => a - b);
      
      if (ranks.length >= 2) {
        const sumRank = ranks[0] + ranks[1];
        if (sumRank <= 6) {
          pairings["Pairing I"].push(matchup);
        } else if (sumRank <= 12) {
          pairings["Pairing II"].push(matchup);
        } else if (sumRank <= 18) {
          pairings["Pairing III"].push(matchup);
        } else {
          pairings["Pairing IV"].push(matchup);
        }
      } else {
        pairings["Pairing IV"].push(matchup);
      }
    });

    return pairings;
  };

  const groupRoundOf16ByMatchup = (events) => {
    const matchups = {};

    events.forEach(event => {
      // Extract team information
      const homeTeam = {
        id: event.competitions[0].competitors[0].team.id,
        name: event.competitions[0].competitors[0].team.name,
        shortDisplayName: event.competitions[0].competitors[0].team.shortDisplayName,
        color: event.competitions[0].competitors[0].team.color
      };

      const awayTeam = {
        id: event.competitions[0].competitors[1].team.id,
        name: event.competitions[0].competitors[1].team.name,
        shortDisplayName: event.competitions[0].competitors[1].team.shortDisplayName,
        color: event.competitions[0].competitors[1].team.color
      };

      // Create matchup key - sort team IDs to ensure consistency
      const teamIds = [homeTeam.id, awayTeam.id].sort();
      const matchupKey = `${teamIds[0]}-${teamIds[1]}`;

      // Initialize matchup if it doesn't exist
      if (!matchups[matchupKey]) {
        matchups[matchupKey] = {
          homeTeam: homeTeam,
          awayTeam: awayTeam,
          matches: [],
          aggregateHome: 0,
          aggregateAway: 0
        };
      }

      // Extract scores and leg information
      const homeScore = event.competitions[0].competitors[0].score || 0;
      const awayScore = event.competitions[0].competitors[1].score || 0;
      const leg = event.name.includes("Leg 2") ? 2 : 1;
      const status = event.status.type.name.toLowerCase();

      // Add match data
      matchups[matchupKey].matches.push({
        leg: leg,
        homeScore: parseInt(homeScore),
        awayScore: parseInt(awayScore),
        status: status,
        date: event.date,
        homeShootoutScore: event.competitions[0].competitors[0].shootoutScore || 0,
        awayShootoutScore: event.competitions[0].competitors[1].shootoutScore || 0
      });

      // Update aggregate scores
      matchups[matchupKey].aggregateHome += parseInt(homeScore);
      matchups[matchupKey].aggregateAway += parseInt(awayScore);
    });

    return Object.values(matchups);
  };

  const getTeamRank = (teamId, standings) => {
    const teamEntry = standings.find(entry => entry.team.id === teamId);
    return teamEntry?.note?.rank || teamEntry?.team.rank || null;
  };

  // Helper functions for team abbreviation and winner info
  const abbreviateFinalsTeamName = (team) => {
    if (team.abbreviation && team.abbreviation.length <= 4) {
      return team.abbreviation;
    }
    return team.shortDisplayName || team.displayName.substring(0, 4);
  };

  const getWinnerInfo = (matchup) => {
    const { aggregateHome, aggregateAway } = matchup;
    
    // Check for shootout scores
    let homeShootoutScore = 0;
    let awayShootoutScore = 0;
    
    const finishedMatches = matchup.matches.filter(match => match.status === "post");
    const matchWithShootout = finishedMatches.find(match => match.homeShootoutScore > 0 || match.awayShootoutScore > 0);
    
    if (matchWithShootout) {
      homeShootoutScore = matchWithShootout.homeShootoutScore;
      awayShootoutScore = matchWithShootout.awayShootoutScore;
    }
    
    // If aggregate scores are tied, use shootout to determine winner
    if (aggregateHome === aggregateAway && (homeShootoutScore > 0 || awayShootoutScore > 0)) {
      if (homeShootoutScore > awayShootoutScore) {
        return {
          winner: matchup.homeTeam,
          loser: matchup.awayTeam,
          winnerScore: aggregateHome,
          loserScore: aggregateAway,
          isTie: false,
          homeShootoutScore,
          awayShootoutScore
        };
      } else {
        return {
          winner: matchup.awayTeam,
          loser: matchup.homeTeam,
          winnerScore: aggregateAway,
          loserScore: aggregateHome,
          isTie: false,
          homeShootoutScore,
          awayShootoutScore
        };
      }
    }
    
    // Regular aggregate score comparison
    if (aggregateHome > aggregateAway) {
      return {
        winner: matchup.homeTeam,
        loser: matchup.awayTeam,
        winnerScore: aggregateHome,
        loserScore: aggregateAway,
        isTie: false,
        homeShootoutScore,
        awayShootoutScore
      };
    } else if (aggregateAway > aggregateHome) {
      return {
        winner: matchup.awayTeam,
        loser: matchup.homeTeam,
        winnerScore: aggregateAway,
        loserScore: aggregateHome,
        isTie: false,
        homeShootoutScore,
        awayShootoutScore
      };
    } else {
      return {
        winner: null,
        loser: null,
        winnerScore: aggregateHome,
        loserScore: aggregateAway,
        isTie: true,
        homeShootoutScore,
        awayShootoutScore
      };
    }
  };

  const showMatchDetails = (matchup) => {
    setSelectedMatchup(matchup);
    setModalVisible(true);
  };

  const renderViewToggle = () => {
    return (
      <View style={[styles.viewToggleContainer, { backgroundColor: theme.surface }]}>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            {
              backgroundColor: view === 'knockout' ? colors.primary : theme.border,
            }
          ]}
          onPress={() => setView('knockout')}
        >
          <Text
            style={[
              styles.toggleButtonText,
              {
                color: view === 'knockout' ? '#fff' : theme.text,
              }
            ]}
          >
            Knockout Phase
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            {
              backgroundColor: view === 'finals' ? colors.primary : theme.border,
            }
          ]}
          onPress={() => setView('finals')}
        >
          <Text
            style={[
              styles.toggleButtonText,
              {
                color: view === 'finals' ? '#fff' : theme.text,
              }
            ]}
          >
            Finals Bracket
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderMatchupCard = (matchup, title = '', roundType = 'knockout') => {
    const winnerInfo = getWinnerInfo(matchup);
    const { winner, loser, winnerScore, loserScore, isTie, homeShootoutScore, awayShootoutScore } = winnerInfo;
    
    const homeScoreDisplay = homeShootoutScore > 0 ? `${matchup.aggregateHome}(${homeShootoutScore})` : matchup.aggregateHome;
    const awayScoreDisplay = awayShootoutScore > 0 ? `${matchup.aggregateAway}(${awayShootoutScore})` : matchup.aggregateAway;
    
    const isCompleted = matchup.matches.every(match => match.status === "post");
    
    return (
      <TouchableOpacity
        style={[styles.matchupCard, { backgroundColor: theme.surface }]}
        onPress={() => showMatchDetails(matchup)}
        activeOpacity={0.7}
      >
        {title && (
          <Text style={[styles.matchupTitle, { color: theme.text }]}>{title}</Text>
        )}
        
        <View style={styles.teamsContainer}>
          <View style={styles.teamRow}>
            <TeamLogoImage teamId={matchup.homeTeam.id} style={styles.teamLogo} />
            <Text 
              style={[
                styles.teamName, 
                { 
                  color: winner?.id === matchup.homeTeam.id ? colors.primary : theme.text,
                  fontWeight: winner?.id === matchup.homeTeam.id ? 'bold' : 'normal'
                }
              ]}
            >
              {roundType === 'finals' ? 
                abbreviateFinalsTeamName(matchup.homeTeam) : 
                (matchup.homeTeam.shortDisplayName || matchup.homeTeam.displayName)
              }
            </Text>
            <Text 
              style={[
                styles.teamScore, 
                { 
                  color: winner?.id === matchup.homeTeam.id ? colors.primary : theme.text,
                  fontWeight: winner?.id === matchup.homeTeam.id ? 'bold' : 'normal'
                }
              ]}
            >
              {homeScoreDisplay}
            </Text>
          </View>
          
          <View style={styles.teamRow}>
            <TeamLogoImage teamId={matchup.awayTeam.id} style={styles.teamLogo} />
            <Text 
              style={[
                styles.teamName, 
                { 
                  color: winner?.id === matchup.awayTeam.id ? colors.primary : theme.text,
                  fontWeight: winner?.id === matchup.awayTeam.id ? 'bold' : 'normal'
                }
              ]}
            >
              {roundType === 'finals' ? 
                abbreviateFinalsTeamName(matchup.awayTeam) : 
                (matchup.awayTeam.shortDisplayName || matchup.awayTeam.displayName)
              }
            </Text>
            <Text 
              style={[
                styles.teamScore, 
                { 
                  color: winner?.id === matchup.awayTeam.id ? colors.primary : theme.text,
                  fontWeight: winner?.id === matchup.awayTeam.id ? 'bold' : 'normal'
                }
              ]}
            >
              {awayScoreDisplay}
            </Text>
          </View>
        </View>
        
        <Text style={[styles.matchStatus, { color: theme.textSecondary }]}>
          {isCompleted ? 'Completed' : 'In Progress'}
        </Text>
        
        {roundType !== 'knockout' && (
          <Text style={[styles.roundLabel, { color: theme.textSecondary }]}>
            {roundType === 'roundOf16' ? 'Round of 16' : 
             roundType === 'quarterfinals' ? 'Quarterfinals' :
             roundType === 'semifinals' ? 'Semifinals' :
             roundType === 'finals' ? 'Final' : ''}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderKnockoutView = () => {
    return (
      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={[styles.pairingContainer, { backgroundColor: theme.surface }]}>
          {Object.entries(knockoutPairings).map(([pairingName, matchups]) => (
            <View key={pairingName} style={styles.pairingSection}>
              <Text style={[styles.pairingTitle, { color: theme.text }]}>{pairingName}</Text>
              <View style={[styles.pairingRow, { backgroundColor: theme.background }]}>
                {/* Left side matchups */}
                <View style={styles.pairingLeft}>
                  {matchups.slice(0, Math.ceil(matchups.length / 2)).map((matchup, index) => (
                    <TouchableOpacity
                      key={`left-${matchup.homeTeam.id}-${matchup.awayTeam.id}-${index}`}
                      style={[styles.teamMatchup, { backgroundColor: theme.surface }]}
                      onPress={() => showMatchDetails(matchup)}
                    >
                      <View style={styles.teamInfo}>
                        <View style={styles.teamLogos}>
                          <TeamLogoImage teamId={matchup.homeTeam.id} style={styles.teamLogo} />
                          <TeamLogoImage teamId={matchup.awayTeam.id} style={styles.teamLogo} />
                        </View>
                        <View style={styles.teamNames}>
                          <Text style={[styles.teamName, { color: theme.text }]}>
                            {matchup.homeTeam.shortDisplayName} vs {matchup.awayTeam.shortDisplayName}
                          </Text>
                          <View style={styles.teamSeeds}>
                            <Text style={[styles.teamSeed, { color: theme.textSecondary }]}>KO Round</Text>
                          </View>
                        </View>
                      </View>
                      <Text style={[styles.matchScore, { color: theme.text }]}>
                        {matchup.aggregateHome} : {matchup.aggregateAway}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* VS section in the middle */}
                <View style={styles.vsSection}>
                  <Text style={[styles.vsText, { color: theme.textSecondary }]}>VS</Text>
                  {matchups.length > 0 && (
                    <View style={[styles.aggregateScore, { backgroundColor: theme.background }]}>
                      <Text style={[styles.aggregateScoreText, { color: theme.text }]}>Aggregate</Text>
                    </View>
                  )}
                </View>

                {/* Right side matchups */}
                <View style={styles.pairingRight}>
                  {matchups.slice(Math.ceil(matchups.length / 2)).map((matchup, index) => (
                    <TouchableOpacity
                      key={`right-${matchup.homeTeam.id}-${matchup.awayTeam.id}-${index}`}
                      style={[styles.teamMatchup, { backgroundColor: theme.surface }]}
                      onPress={() => showMatchDetails(matchup)}
                    >
                      <View style={styles.teamInfo}>
                        <View style={styles.teamLogos}>
                          <TeamLogoImage teamId={matchup.homeTeam.id} style={styles.teamLogo} />
                          <TeamLogoImage teamId={matchup.awayTeam.id} style={styles.teamLogo} />
                        </View>
                        <View style={styles.teamNames}>
                          <Text style={[styles.teamName, { color: theme.text }]}>
                            {matchup.homeTeam.shortDisplayName} vs {matchup.awayTeam.shortDisplayName}
                          </Text>
                          <View style={styles.teamSeeds}>
                            <Text style={[styles.teamSeed, { color: theme.textSecondary }]}>KO Round</Text>
                          </View>
                        </View>
                      </View>
                      <Text style={[styles.matchScore, { color: theme.text }]}>
                        {matchup.aggregateHome} : {matchup.aggregateAway}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  const renderFinalsView = () => {
    return (
      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={[styles.bracketContainer, { backgroundColor: theme.surface }]}>
          {/* Left Conference - Quarterfinals */}
          <View style={styles.leftConference}>
            <Text style={[styles.roundTitle, { color: theme.text }]}>Quarterfinals</Text>
            {quarterfinalsMatchups.slice(0, 2).map((matchup, index) => (
              <View key={`qf-left-${matchup.homeTeam.id}-${matchup.awayTeam.id}-${index}`} style={[styles.bracketRow, { backgroundColor: theme.background }]}>
                <View style={styles.teamRow}>
                  <TeamLogoImage teamId={matchup.homeTeam.id} style={styles.teamLogoSmall} />
                  <Text style={[styles.teamNameBracket, { color: theme.text }]}>{abbreviateFinalsTeamName(matchup.homeTeam)}</Text>
                  <Text style={[styles.teamRecord, { color: theme.text }]}>{matchup.aggregateHome}</Text>
                </View>
                <View style={styles.teamRow}>
                  <TeamLogoImage teamId={matchup.awayTeam.id} style={styles.teamLogoSmall} />
                  <Text style={[styles.teamNameBracket, { color: theme.text }]}>{abbreviateFinalsTeamName(matchup.awayTeam)}</Text>
                  <Text style={[styles.teamRecord, { color: theme.text }]}>{matchup.aggregateAway}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Finals Conference */}
          <View style={styles.finalsConference}>
            {/* Semifinals */}
            {semifinalsMatchups.length > 0 && (
              <>
                <Text style={[styles.roundTitle, { color: theme.text }]}>Semifinals</Text>
                {semifinalsMatchups.map((matchup, index) => (
                  <View key={`sf-${matchup.homeTeam.id}-${matchup.awayTeam.id}-${index}`} style={[styles.bracketRow, { backgroundColor: theme.background }]}>
                    <View style={styles.teamRow}>
                      <TeamLogoImage teamId={matchup.homeTeam.id} style={styles.teamLogoSmall} />
                      <Text style={[styles.teamNameBracket, { color: theme.text }]}>{abbreviateFinalsTeamName(matchup.homeTeam)}</Text>
                      <Text style={[styles.teamRecord, { color: theme.text }]}>{matchup.aggregateHome}</Text>
                    </View>
                    <View style={styles.teamRow}>
                      <TeamLogoImage teamId={matchup.awayTeam.id} style={styles.teamLogoSmall} />
                      <Text style={[styles.teamNameBracket, { color: theme.text }]}>{abbreviateFinalsTeamName(matchup.awayTeam)}</Text>
                      <Text style={[styles.teamRecord, { color: theme.text }]}>{matchup.aggregateAway}</Text>
                    </View>
                  </View>
                ))}
              </>
            )}

            {/* Finals */}
            {finalsMatchups.length > 0 && (
              <View style={[styles.bracketRowFinals, { backgroundColor: theme.background }]}>
                <Text style={[styles.finalsTitle, { color: theme.text }]}>FINAL</Text>
                {finalsMatchups.map((matchup, index) => (
                  <View key={`f-${matchup.homeTeam.id}-${matchup.awayTeam.id}-${index}`} style={styles.finalsMatchup}>
                    <View style={styles.teamColumn}>
                      <Text style={[styles.record, { color: theme.text }]}>{matchup.aggregateHome}</Text>
                      <View style={styles.teamLine}>
                        <TeamLogoImage teamId={matchup.homeTeam.id} style={styles.teamLogoSmall} />
                        <Text style={[styles.abbrev, { color: theme.text }]}>{abbreviateFinalsTeamName(matchup.homeTeam)}</Text>
                      </View>
                    </View>
                    <Text style={[styles.vs, { color: theme.textSecondary }]}>vs</Text>
                    <View style={styles.teamColumn}>
                      <Text style={[styles.record, { color: theme.text }]}>{matchup.aggregateAway}</Text>
                      <View style={styles.teamLine}>
                        <TeamLogoImage teamId={matchup.awayTeam.id} style={styles.teamLogoSmall} />
                        <Text style={[styles.abbrev, { color: theme.text }]}>{abbreviateFinalsTeamName(matchup.awayTeam)}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Right Conference - Quarterfinals */}
          <View style={styles.rightConference}>
            <Text style={[styles.roundTitle, { color: theme.text }]}>Quarterfinals</Text>
            {quarterfinalsMatchups.slice(2, 4).map((matchup, index) => (
              <View key={`qf-right-${matchup.homeTeam.id}-${matchup.awayTeam.id}-${index}`} style={[styles.bracketRow, { backgroundColor: theme.background }]}>
                <View style={styles.teamRow}>
                  <TeamLogoImage teamId={matchup.homeTeam.id} style={styles.teamLogoSmall} />
                  <Text style={[styles.teamNameBracket, { color: theme.text }]}>{abbreviateFinalsTeamName(matchup.homeTeam)}</Text>
                  <Text style={[styles.teamRecord, { color: theme.text }]}>{matchup.aggregateHome}</Text>
                </View>
                <View style={styles.teamRow}>
                  <TeamLogoImage teamId={matchup.awayTeam.id} style={styles.teamLogoSmall} />
                  <Text style={[styles.teamNameBracket, { color: theme.text }]}>{abbreviateFinalsTeamName(matchup.awayTeam)}</Text>
                  <Text style={[styles.teamRecord, { color: theme.text }]}>{matchup.aggregateAway}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    );
  };

  const renderMatchDetailsModal = () => {
    if (!selectedMatchup) return null;

    const sortedMatches = selectedMatchup.matches.sort((a, b) => a.leg - b.leg);
    const winnerInfo = getWinnerInfo(selectedMatchup);
    const { winner, loser, winnerScore, loserScore, isTie, homeShootoutScore, awayShootoutScore } = winnerInfo;

    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Match Details</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setModalVisible(false)}
              >
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalTeamsHeader}>
              <View style={styles.modalTeamInfo}>
                <TeamLogoImage teamId={selectedMatchup.homeTeam.id} style={styles.modalTeamLogo} />
                <Text style={[styles.modalTeamName, { color: theme.text }]}>
                  {selectedMatchup.homeTeam.shortDisplayName}
                </Text>
              </View>
              <Text style={[styles.modalVs, { color: theme.textSecondary }]}>vs</Text>
              <View style={styles.modalTeamInfo}>
                <TeamLogoImage teamId={selectedMatchup.awayTeam.id} style={styles.modalTeamLogo} />
                <Text style={[styles.modalTeamName, { color: theme.text }]}>
                  {selectedMatchup.awayTeam.shortDisplayName}
                </Text>
              </View>
            </View>

            <View style={styles.aggregateContainer}>
              <Text style={[styles.aggregateLabel, { color: theme.textSecondary }]}>Aggregate Score</Text>
              <Text style={[styles.aggregateScore, { color: theme.text }]}>
                {selectedMatchup.aggregateHome}{homeShootoutScore > 0 && `(${homeShootoutScore})`} - {selectedMatchup.aggregateAway}{awayShootoutScore > 0 && `(${awayShootoutScore})`}
              </Text>
            </View>

            <FlatList
              data={sortedMatches}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              renderItem={({ item }) => (
                <View style={[styles.legContainer, { backgroundColor: theme.background }]}>
                  <Text style={[styles.legTitle, { color: theme.text }]}>
                    {item.leg === 1 ? '1st Leg' : '2nd Leg'}
                  </Text>
                  <View style={styles.legScoreContainer}>
                    <Text style={[styles.legScore, { color: theme.text }]}>
                      {item.homeScore} - {item.awayScore}
                    </Text>
                    {(item.homeShootoutScore > 0 || item.awayShootoutScore > 0) && (
                      <Text style={[styles.shootoutScore, { color: theme.textSecondary }]}>
                        ({item.homeShootoutScore} - {item.awayShootoutScore} pens)
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.legDate, { color: theme.textSecondary }]}>
                    {new Date(item.date).toLocaleDateString()}
                  </Text>
                  <Text style={[styles.legStatus, { color: theme.textSecondary }]}>
                    {item.status === 'post' ? 'Final' : item.status === 'in' ? 'Live' : 'Scheduled'}
                  </Text>
                </View>
              )}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.text }]}>Loading bracket...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderViewToggle()}
      
      {view === 'knockout' ? renderKnockoutView() : renderFinalsView()}
      
      {renderMatchDetailsModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  leagueContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  leagueButtons: {
    paddingHorizontal: 16,
    gap: 12,
  },
  leagueButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  leagueButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  viewToggleContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scrollContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  pairingSection: {
    marginVertical: 12,
  },
  pairingTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  matchupCard: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  matchupTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  teamsContainer: {
    gap: 8,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  teamLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  teamName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  teamScore: {
    fontSize: 16,
    fontWeight: 'bold',
    minWidth: 24,
    textAlign: 'center',
  },
  matchStatus: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  roundLabel: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
  finalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  finalsCardContainer: {
    width: '48%',
    marginBottom: 8,
  },
  finalsCenter: {
    alignItems: 'center',
  },
  finalCardContainer: {
    width: '70%',
    marginBottom: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: width * 0.9,
    maxHeight: height * 0.8,
    borderRadius: 12,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  modalTeamsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTeamInfo: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  modalTeamLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  modalTeamName: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalVs: {
    fontSize: 16,
    fontWeight: 'bold',
    marginHorizontal: 16,
  },
  aggregateContainer: {
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  aggregateLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  aggregateScore: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  legContainer: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  legTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  legScoreContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  legScore: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  shootoutScore: {
    fontSize: 14,
    marginTop: 4,
  },
  legDate: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },
  legStatus: {
    fontSize: 12,
    textAlign: 'center',
  },
  // Bracket Styles
  bracketContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingTop: 20,
  },
  leftConference: {
    flex: 0.3,
    alignItems: 'flex-start',
  },
  rightConference: {
    flex: 0.3,
    alignItems: 'flex-end',
  },
  finalsConference: {
    flex: 0.4,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  roundTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  bracketRow: {
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
    width: '100%',
  },
  bracketRowFinals: {
    borderWidth: 2,
    borderColor: '#FFD700',
    borderRadius: 12,
    padding: 15,
    marginTop: 20,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 3,
  },
  teamNameBracket: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    marginLeft: 8,
  },
  teamRecord: {
    fontSize: 14,
    fontWeight: 'bold',
    minWidth: 25,
    textAlign: 'center',
  },
  finalsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
    color: '#FFD700',
  },
  finalsMatchup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamColumn: {
    alignItems: 'center',
    marginHorizontal: 15,
  },
  teamLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  record: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  abbrev: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  // Knockout Pairing Styles (matching bracket.css)
  pairingContainer: {
    flex: 1,
    padding: 20,
  },
  pairingSection: {
    marginBottom: 30,
  },
  pairingTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  pairingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 20,
    padding: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  pairingLeft: {
    flex: 0.4,
    gap: 10,
  },
  pairingRight: {
    flex: 0.4,
    gap: 10,
  },
  vsSection: {
    flex: 0.2,
    alignItems: 'center',
    gap: 10,
  },
  vsText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  aggregateScore: {
    padding: 8,
    borderRadius: 5,
  },
  aggregateScoreText: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  teamMatchup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 5,
  },
  teamInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  teamLogos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamLogo: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  teamNames: {
    flex: 1,
    marginLeft: 10,
  },
  teamName: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  teamSeeds: {
    marginTop: 2,
  },
  teamSeed: {
    fontSize: 12,
  },
  matchScore: {
    fontSize: 18,
    fontWeight: 'bold',
    minWidth: 60,
    textAlign: 'center',
  },
});

export default UCLBracketScreen;

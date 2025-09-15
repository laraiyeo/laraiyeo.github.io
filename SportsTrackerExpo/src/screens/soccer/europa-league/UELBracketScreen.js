import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Dimensions,
  Alert,
  Modal,
  ScrollView,
  RefreshControl,
  Image,
} from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';

const { width } = Dimensions.get('window');

// In-memory cache for prefetched logo URIs to avoid flicker
const logoUriCache = {};

// League configuration - only Europa League
const LEAGUES = {
  "Europa League": { code: "uefa.europa", logo: "2310" },
};

const UECLBracketScreen = ({ navigation, route }) => {
  const { theme, colors, isDarkMode } = useTheme();

  // View state: 'bracket' or 'knockout' (default to 'knockout')
  const [currentView, setCurrentView] = useState('knockout');

  // Data states
  const [knockoutPairings, setKnockoutPairings] = useState({});
  const [quarterfinalsMatchups, setQuarterfinalsMatchups] = useState([]);
  const [semifinalsMatchups, setSemifinalsMatchups] = useState([]);
  const [finalsMatchups, setFinalsMatchups] = useState([]);
  const [roundOf16Matchups, setRoundOf16Matchups] = useState([]);

  // UI states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedMatchup, setSelectedMatchup] = useState(null);

  // Cache variables
  const [cachedStandings, setCachedStandings] = useState(null);
  const [cachedQuarterfinals, setCachedQuarterfinals] = useState(null);
  const [cachedSemifinals, setCachedSemifinals] = useState(null);
  const [cachedFinals, setCachedFinals] = useState(null);
  const [cachedRoundOf16, setCachedRoundOf16] = useState(null);
  const [lastStandingsCache, setLastStandingsCache] = useState(0);
  const [lastMatchupsCache, setLastMatchupsCache] = useState(0);
  const [lastBracketHash, setLastBracketHash] = useState(null);

  const CACHE_DURATION = 30000; // 30 seconds cache

  // Hash function for change detection
  const hashString = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return hash;
  };

  // Fetch standings with caching
  const fetchStandings = async () => {
    try {
      const now = Date.now();
      if (cachedStandings && (now - lastStandingsCache) < CACHE_DURATION) {
        return cachedStandings;
      }

      const STANDINGS_URL = `https://cdn.espn.com/core/soccer/table?xhr=1&league=uefa.europa`;
      const response = await fetch(STANDINGS_URL);
      const data = await response.json();

      const standings = data.content.standings.groups[0].standings.entries || [];
      setCachedStandings(standings);
      setLastStandingsCache(now);
      return standings;
    } catch (error) {
      console.error("Error fetching standings:", error);
      return cachedStandings || [];
    }
  };

  // Get team rank from standings
  const getTeamRank = (teamId, standings) => {
    const teamEntry = standings.find(entry => entry.team.id === teamId);
    return teamEntry?.note?.rank || teamEntry?.team.rank || null;
  };

  // Fetch knockout playoffs data
  const fetchKnockoutPlayoffs = async () => {
    try {
      const currentYear = new Date().getFullYear() + 1;
      const CALENDAR_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard?dates=${currentYear}0101`;

      const calendarResponse = await fetch(CALENDAR_API_URL);
      const calendarText = await calendarResponse.text();
      const newHash = hashString(calendarText);

      if (newHash === lastBracketHash) {
        console.log("No changes detected in knockout data.");
        return;
      }
      setLastBracketHash(newHash);

      const calendarData = JSON.parse(calendarText);

      // Find the Knockout Round Playoffs stage
      const knockoutStage = calendarData.leagues?.[0]?.calendar?.[0]?.entries.find(e =>
        e.label === "Knockout Round Playoffs"
      );

      if (!knockoutStage) {
        console.log("Knockout Round Playoffs not found in calendar.");
        return;
      }

      const dates = `${knockoutStage.startDate.split("T")[0].replace(/-/g, "")}-${knockoutStage.endDate.split("T")[0].replace(/-/g, "")}`;
      const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard?dates=${dates}`;

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

  // Group matches by pairing based on rankings
  const groupMatchesByPairing = (events, standings) => {
    const matchups = {};

    events.forEach(event => {
      const competition = event.competitions?.[0];
      if (!competition) return;

      const homeTeam = competition.competitors.find(c => c.homeAway === "home")?.team;
      const awayTeam = competition.competitors.find(c => c.homeAway === "away")?.team;

      if (!homeTeam || !awayTeam) return;

      // Get team rankings
      const homeRank = getTeamRank(homeTeam.id, standings);
      const awayRank = getTeamRank(awayTeam.id, standings);

      homeTeam.rank = homeRank;
      awayTeam.rank = awayRank;

      // Create unique matchup key based on team IDs
      const matchupKey = [homeTeam.id, awayTeam.id].sort().join("-");

      if (!matchups[matchupKey]) {
        const sortedTeams = [homeTeam, awayTeam].sort((a, b) => a.id.localeCompare(b.id));
        matchups[matchupKey] = {
          homeTeam: sortedTeams[0],
          awayTeam: sortedTeams[1],
          matches: [],
          aggregateHome: 0,
          aggregateAway: 0
        };
      }

      const homeScore = parseInt(competition.competitors.find(c => c.homeAway === "home")?.score || 0);
      const awayScore = parseInt(competition.competitors.find(c => c.homeAway === "away")?.score || 0);
      const homeShootoutScore = parseInt(competition.competitors.find(c => c.homeAway === "home")?.shootoutScore || 0);
      const awayShootoutScore = parseInt(competition.competitors.find(c => c.homeAway === "away")?.shootoutScore || 0);

      matchups[matchupKey].matches.push({
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        homeShootoutScore,
        awayShootoutScore,
        leg: competition.leg?.value || 1,
        status: competition.status.type.state,
        gameId: event.id,
        date: new Date(event.date).toLocaleDateString()
      });

      // Update aggregate scores correctly - add scores for each specific team
      if (competition.status.type.state === "post") {
        // Find which team in the matchup corresponds to home/away in this specific game
        const matchupHomeTeam = matchups[matchupKey].homeTeam;
        const matchupAwayTeam = matchups[matchupKey].awayTeam;

        if (homeTeam.id === matchupHomeTeam.id) {
          // Current game's home team is matchup's home team
          matchups[matchupKey].aggregateHome += homeScore;
          matchups[matchupKey].aggregateAway += awayScore;
        } else {
          // Current game's home team is matchup's away team
          matchups[matchupKey].aggregateHome += awayScore;
          matchups[matchupKey].aggregateAway += homeScore;
        }
      }
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
      const ranks = [matchup.homeTeam.rank, matchup.awayTeam.rank].sort((a, b) => a - b);

      // Assign based on typical UEFA playoff pairings - each pairing can have 2 matchups
      if ((ranks[0] >= 9 && ranks[0] <= 10) && (ranks[1] >= 23 && ranks[1] <= 24)) {
        pairings["Pairing I"].push(matchup);
      } else if ((ranks[0] >= 11 && ranks[0] <= 12) && (ranks[1] >= 21 && ranks[1] <= 22)) {
        pairings["Pairing II"].push(matchup);
      } else if ((ranks[0] >= 13 && ranks[0] <= 14) && (ranks[1] >= 19 && ranks[1] <= 20)) {
        pairings["Pairing III"].push(matchup);
      } else if ((ranks[0] >= 15 && ranks[0] <= 16) && (ranks[1] >= 17 && ranks[1] <= 18)) {
        pairings["Pairing IV"].push(matchup);
      }
    });

    return pairings;
  };

  // Fetch Round of 16 matchups
  const fetchRoundOf16Matchups = async () => {
    try {
      const now = Date.now();
      if (cachedRoundOf16 && (now - lastMatchupsCache) < CACHE_DURATION) {
        setRoundOf16Matchups(cachedRoundOf16);
        return cachedRoundOf16;
      }

      const currentYear = new Date().getFullYear() + 1;
      const CALENDAR_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard?dates=${currentYear}0101`;

      const calendarResponse = await fetch(CALENDAR_API_URL);
      const calendarData = await calendarResponse.json();

      // Find the Round of 16 stage
      let roundOf16Stage = calendarData.leagues?.[0]?.calendar?.[0]?.entries.find(e =>
        e.label === "Round of 16" ||
        e.label === "1/8-Finals" ||
        e.label === "Rd of 16" ||
        e.label === "Round of 16 Finals" ||
        e.label === "Knockout Stage Round of 16" ||
        e.label.toLowerCase().includes("round of 16") ||
        e.label.toLowerCase().includes("1/8")
      );

      if (!roundOf16Stage) {
        setRoundOf16Matchups([]);
        return [];
      }

      const dates = `${roundOf16Stage.startDate.split("T")[0].replace(/-/g, "")}-${roundOf16Stage.endDate.split("T")[0].replace(/-/g, "")}`;
      const ROUND_OF_16_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard?dates=${dates}`;

      const response = await fetch(ROUND_OF_16_API_URL);
      const data = await response.json();
      const events = data.events || [];

      const matchups = groupRoundOf16ByMatchup(events);
      setCachedRoundOf16(matchups);
      setRoundOf16Matchups(matchups);
      setLastMatchupsCache(now);
      return matchups;
    } catch (error) {
      console.error("Error fetching Round of 16 matchups:", error);
      setRoundOf16Matchups(cachedRoundOf16 || []);
      return cachedRoundOf16 || [];
    }
  };

  // Group Round of 16 matchups
  const groupRoundOf16ByMatchup = (events) => {
    const matchups = {};

    events.forEach(event => {
      const competition = event.competitions?.[0];
      if (!competition) return;

      const homeTeam = competition.competitors.find(c => c.homeAway === "home")?.team;
      const awayTeam = competition.competitors.find(c => c.homeAway === "away")?.team;

      if (!homeTeam || !awayTeam) return;

      // Create unique matchup key based on team IDs
      const matchupKey = [homeTeam.id, awayTeam.id].sort().join("-");

      if (!matchups[matchupKey]) {
        const sortedTeams = [homeTeam, awayTeam].sort((a, b) => a.id.localeCompare(b.id));
        matchups[matchupKey] = {
          homeTeam: sortedTeams[0],
          awayTeam: sortedTeams[1],
          matches: [],
          aggregateHome: 0,
          aggregateAway: 0
        };
      }

      const homeScore = parseInt(competition.competitors.find(c => c.homeAway === "home")?.score || 0);
      const awayScore = parseInt(competition.competitors.find(c => c.homeAway === "away")?.score || 0);
      const homeShootoutScore = parseInt(competition.competitors.find(c => c.homeAway === "home")?.shootoutScore || 0);
      const awayShootoutScore = parseInt(competition.competitors.find(c => c.homeAway === "away")?.shootoutScore || 0);

      matchups[matchupKey].matches.push({
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        homeShootoutScore,
        awayShootoutScore,
        leg: competition.leg?.value || 1,
        status: competition.status.type.state,
        gameId: event.id,
        date: new Date(event.date).toLocaleDateString()
      });

      // Update aggregate scores
      if (competition.status.type.state === "post") {
        const matchupHomeTeam = matchups[matchupKey].homeTeam;
        const matchupAwayTeam = matchups[matchupKey].awayTeam;

        if (homeTeam.id === matchupHomeTeam.id) {
          matchups[matchupKey].aggregateHome += homeScore;
          matchups[matchupKey].aggregateAway += awayScore;
        } else {
          matchups[matchupKey].aggregateHome += awayScore;
          matchups[matchupKey].aggregateAway += homeScore;
        }
      }
    });

    return Object.values(matchups);
  };

  // Fetch quarterfinals, semifinals, and finals
  const fetchQuarterfinalsMatchups = async () => {
    try {
      const now = Date.now();
      if (cachedQuarterfinals && (now - lastMatchupsCache) < CACHE_DURATION) {
        setQuarterfinalsMatchups(cachedQuarterfinals);
        return cachedQuarterfinals;
      }

      const currentYear = new Date().getFullYear() + 1;
      const CALENDAR_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard?dates=${currentYear}0101`;

      const calendarResponse = await fetch(CALENDAR_API_URL);
      const calendarData = await calendarResponse.json();

      const quarterfinalsStage = calendarData.leagues?.[0]?.calendar?.[0]?.entries.find(e =>
        e.label === "Quarterfinals" || e.label === "Quarter-finals" || e.label.toLowerCase().includes("quarter")
      );

      if (!quarterfinalsStage) {
        setQuarterfinalsMatchups([]);
        return [];
      }

      const dates = `${quarterfinalsStage.startDate.split("T")[0].replace(/-/g, "")}-${quarterfinalsStage.endDate.split("T")[0].replace(/-/g, "")}`;
      const API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard?dates=${dates}`;

      const response = await fetch(API_URL);
      const data = await response.json();
      const events = data.events || [];

      const matchups = groupRoundOf16ByMatchup(events);
      setCachedQuarterfinals(matchups);
      setQuarterfinalsMatchups(matchups);
      return matchups;
    } catch (error) {
      console.error("Error fetching Quarterfinals matchups:", error);
      setQuarterfinalsMatchups(cachedQuarterfinals || []);
      return cachedQuarterfinals || [];
    }
  };

  const fetchSemifinalsMatchups = async () => {
    try {
      const now = Date.now();
      if (cachedSemifinals && (now - lastMatchupsCache) < CACHE_DURATION) {
        setSemifinalsMatchups(cachedSemifinals);
        return cachedSemifinals;
      }

      const currentYear = new Date().getFullYear() + 1;
      const CALENDAR_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard?dates=${currentYear}0101`;

      const calendarResponse = await fetch(CALENDAR_API_URL);
      const calendarData = await calendarResponse.json();

      const semifinalsStage = calendarData.leagues?.[0]?.calendar?.[0]?.entries.find(e =>
        e.label === "Semifinals" || e.label === "Semi-finals" || e.label.toLowerCase().includes("semi")
      );

      if (!semifinalsStage) {
        setSemifinalsMatchups([]);
        return [];
      }

      const dates = `${semifinalsStage.startDate.split("T")[0].replace(/-/g, "")}-${semifinalsStage.endDate.split("T")[0].replace(/-/g, "")}`;
      const API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard?dates=${dates}`;

      const response = await fetch(API_URL);
      const data = await response.json();
      const events = data.events || [];

      const matchups = groupRoundOf16ByMatchup(events);
      setCachedSemifinals(matchups);
      setSemifinalsMatchups(matchups);
      return matchups;
    } catch (error) {
      console.error("Error fetching Semifinals matchups:", error);
      setSemifinalsMatchups(cachedSemifinals || []);
      return cachedSemifinals || [];
    }
  };

  const fetchFinalsMatchups = async () => {
    try {
      const now = Date.now();
      if (cachedFinals && (now - lastMatchupsCache) < CACHE_DURATION) {
        setFinalsMatchups(cachedFinals);
        return cachedFinals;
      }

      const currentYear = new Date().getFullYear() + 1;
      const CALENDAR_API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard?dates=${currentYear}0101`;

      const calendarResponse = await fetch(CALENDAR_API_URL);
      const calendarData = await calendarResponse.json();

      const finalsStage = calendarData.leagues?.[0]?.calendar?.[0]?.entries.find(e =>
        e.label === "Final"
      );

      if (!finalsStage) {
        setFinalsMatchups([]);
        return [];
      }

      const dates = `${finalsStage.startDate.split("T")[0].replace(/-/g, "")}-${finalsStage.endDate.split("T")[0].replace(/-/g, "")}`;
      const API_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard?dates=${dates}`;

      const response = await fetch(API_URL);
      const data = await response.json();
      const events = data.events || [];

      const matchups = groupRoundOf16ByMatchup(events);
      setCachedFinals(matchups);
      setFinalsMatchups(matchups);
      return matchups;
    } catch (error) {
      console.error("Error fetching Finals matchups:", error);
      setFinalsMatchups(cachedFinals || []);
      return cachedFinals || [];
    }
  };

  // Get winner info function
  const getWinnerInfo = (matchup, aggregateHome, aggregateAway) => {
    // Check if there's a deciding match with shootout scores
    let homeShootoutScore = 0;
    let awayShootoutScore = 0;

    const finishedMatches = matchup.matches.filter(match => match.status === "post");
    const matchWithShootout = finishedMatches.find(match => match.homeShootoutScore > 0 || match.awayShootoutScore > 0);

    if (matchWithShootout) {
      if (matchWithShootout.homeTeam.id === matchup.homeTeam.id) {
        homeShootoutScore = matchWithShootout.homeShootoutScore;
        awayShootoutScore = matchWithShootout.awayShootoutScore;
      } else {
        homeShootoutScore = matchWithShootout.awayShootoutScore;
        awayShootoutScore = matchWithShootout.homeShootoutScore;
      }
    }
    
    // (renderKnockoutView was previously accidentally nested here; moved to top-level)

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
      } else if (awayShootoutScore > homeShootoutScore) {
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
        winner: matchup.homeTeam,
        loser: matchup.awayTeam,
        winnerScore: aggregateHome,
        loserScore: aggregateAway,
        isTie: true,
        homeShootoutScore,
        awayShootoutScore
      };
    }
  };

  // Load all data
  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchKnockoutPlayoffs(),
        fetchRoundOf16Matchups(),
        fetchQuarterfinalsMatchups(),
        fetchSemifinalsMatchups(),
        fetchFinalsMatchups()
      ]);

      // After data loads, prefetch logos for all teams seen in the bracket
      const allTeamIds = [];
      const collectFrom = (arr) => arr && arr.forEach(m => {
        if (m.homeTeam?.id) allTeamIds.push(m.homeTeam.id);
        if (m.awayTeam?.id) allTeamIds.push(m.awayTeam.id);
      });

      collectFrom(quarterfinalsMatchups);
      collectFrom(semifinalsMatchups);
      collectFrom(finalsMatchups);
      collectFrom(roundOf16Matchups);

      // Also include pairings
      Object.values(knockoutPairings || {}).forEach(pairArr => {
        pairArr.forEach(m => {
          if (m.homeTeam?.id) allTeamIds.push(m.homeTeam.id);
          if (m.awayTeam?.id) allTeamIds.push(m.awayTeam.id);
        });
      });

      if (allTeamIds.length > 0) {
        prefetchLogos(allTeamIds);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Focus effect to reload data when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      console.log('UECLBracketScreen: Screen focused');
      loadData();

      // Set up periodic updates
      const interval = setInterval(() => {
        loadData();
      }, 30000); // Update every 30 seconds

      return () => {
        clearInterval(interval);
      };
    }, [])
  );

  // Refresh function
  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Handle matchup press for modal
  const handleMatchupPress = (matchup) => {
    setSelectedMatchup(matchup);
    setModalVisible(true);
  };

  // Handle game press for navigation
  const handleGamePress = (gameId) => {
    setModalVisible(false);
    navigation.navigate('UECLGameDetails', {
      gameId: gameId,
      sport: 'Europa League',
      competition: 'UECL'
    });
  };

  // Abbreviate team name for finals
  const abbreviateFinalsTeamName = (team) => {
    if (!team || !team.shortDisplayName) return "TBD";
    const name = team.shortDisplayName.trim();
    if (name.length <= 5) return name;
    const words = name.split(" ");
    if (words.length > 1) {
      let base = words[1];
      if (base.length > 6) base = base.slice(0, 5) + ".";
      return base;
    }
    return name;
  };

  // Helper to get team logo URLs with dark mode fallback
  const getTeamLogo = (teamId, isDark) => {
    if (!teamId) return null;
    const primaryUrl = isDark
      ? `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`
      : `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
    const fallbackUrl = isDark
      ? `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`
      : `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`;

    return { primaryUrl, fallbackUrl };
  };

  // Small TeamLogoImage component (memoized) with simple 2-stage fallback logic
  const TeamLogoImage = React.memo(({ teamId, style }) => {
    // Use cached URI synchronously when available to avoid flicker
    const initialSource = teamId && logoUriCache[teamId]
      ? { uri: logoUriCache[teamId], cache: 'force-cache' }
      : require('../../../../assets/soccer.png');
    const [source, setSource] = useState(initialSource);
    const [triedFallback, setTriedFallback] = useState(false);

    useEffect(() => {
      let mounted = true;

      // reset to placeholder when teamId changes
      setSource(require('../../../../assets/soccer.png'));
      setTriedFallback(false);

      if (!teamId) return () => { mounted = false; };

      // If we already prefetched this team's logo earlier, use it immediately
      if (logoUriCache[teamId]) {
        if (mounted) setSource({ uri: logoUriCache[teamId], cache: 'force-cache' });
        return () => { mounted = false; };
      }

      const logos = getTeamLogo(teamId, isDarkMode);
      const primary = logos?.primaryUrl;
      const fallback = logos?.fallbackUrl;

      // Try to prefetch primary, then fallback. Only update state if still mounted.
      const tryPrefetch = async (url) => {
        try {
          // Image.prefetch returns a boolean-ish promise
          await Image.prefetch(url);
          if (!mounted) return false;
          // Use cache option to help prevent re-downloads
          setSource({ uri: url, cache: 'force-cache' });
          return true;
        } catch (e) {
          return false;
        }
      };

      (async () => {
        if (primary) {
          const ok = await tryPrefetch(primary);
          if (ok) {
            // store in cache for future mounts
            logoUriCache[teamId] = primary;
            return;
          }
        }
        if (fallback) {
          const ok2 = await tryPrefetch(fallback);
          if (ok2) {
            if (mounted) setTriedFallback(true);
            logoUriCache[teamId] = fallback;
            return;
          }
        }
        // Last-resort: try the canonical URL directly
        const canonical = `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
        const ok3 = await tryPrefetch(canonical);
        if (ok3) {
          logoUriCache[teamId] = canonical;
          return;
        }
        if (mounted) {
          // leave placeholder if nothing works
          setSource(require('../../../../assets/soccer.png'));
        }
      })();

      return () => { mounted = false; };
    }, [teamId, isDarkMode]);

    // onError fallback for unexpected failures during rendering
    const handleError = () => {
      if (!teamId) return;
      if (!triedFallback) {
        const logos = getTeamLogo(teamId, isDarkMode);
        if (logos?.fallbackUrl) {
          setSource({ uri: logos.fallbackUrl, cache: 'force-cache' });
          setTriedFallback(true);
          return;
        }
      }
      // final fallback
      setSource(require('../../../../assets/soccer.png'));
    };

    return (
      <Image
        source={source}
        onError={handleError}
        style={style}
        resizeMode="contain"
      />
    );
  });

  // Prefetch an array of teamIds and populate logoUriCache to reduce flicker
  const prefetchLogos = async (teamIds = []) => {
    const unique = Array.from(new Set(teamIds.filter(Boolean)));
    await Promise.all(unique.map(async (teamId) => {
      if (logoUriCache[teamId]) return;
      const logos = getTeamLogo(teamId, isDarkMode);
      const candidates = [logos?.primaryUrl, logos?.fallbackUrl, `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`].filter(Boolean);
      for (const url of candidates) {
        try {
          await Image.prefetch(url);
          logoUriCache[teamId] = url;
          break;
        } catch (e) {
          // try next
        }
      }
    }));
  };

  // Render view selector
  const renderViewSelector = () => {
    // Knockout should be first/left and default
    return (
      <View style={[styles.selectorContainer, { backgroundColor: theme.surface }]}>
        <TouchableOpacity
          style={[
            styles.selectorButton,
            currentView === 'knockout' && { backgroundColor: colors.primary }
          ]}
          onPress={() => setCurrentView('knockout')}
        >
          <Text
            style={[
              styles.selectorText,
              { color: currentView === 'knockout' ? '#fff' : theme.text }
            ]}
          >
            Knockout
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.selectorButton,
            currentView === 'bracket' && { backgroundColor: colors.primary }
          ]}
          onPress={() => setCurrentView('bracket')}
        >
          <Text
            style={[
              styles.selectorText,
              { color: currentView === 'bracket' ? '#fff' : theme.text }
            ]}
          >
            Bracket
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Render bracket view (mobile layout)
  const renderBracketView = () => {
    const mobileBracketData = [];

    // Build rows in the requested vertical order: 2 QFs (top), top SF, FINAL, bottom SF, 2 QFs (bottom)
    // Safe fallbacks are used when some rounds are missing.
    const topQFs = quarterfinalsMatchups.slice(0, Math.min(2, quarterfinalsMatchups.length));
    const bottomQFs = quarterfinalsMatchups.length > 2 ? quarterfinalsMatchups.slice(2, Math.min(4, quarterfinalsMatchups.length)) : [];

    const topSemi = semifinalsMatchups[0] ? [semifinalsMatchups[0]] : [];
    const bottomSemi = semifinalsMatchups[1] ? [semifinalsMatchups[1]] : [];

    const finalRow = finalsMatchups[0] ? [finalsMatchups[0]] : [];

    // Always add rows, even if empty (TBD placeholders will be rendered)
    mobileBracketData.push({ type: 'qf-row', matchups: topQFs });
    mobileBracketData.push({ type: 'sf-row', matchups: topSemi });
    mobileBracketData.push({ type: 'finals-row', matchups: finalRow });
    mobileBracketData.push({ type: 'sf-row', matchups: bottomSemi });
    mobileBracketData.push({ type: 'qf-row', matchups: bottomQFs });

    return (
      <FlatList
        data={mobileBracketData}
        keyExtractor={(item, index) => `bracket-${index}`}
        renderItem={({ item }) => renderBracketRow(item)}
        contentContainerStyle={styles.bracketContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    );
  };

    // Top-level renderKnockoutView (moved out of getWinnerInfo)
    const renderKnockoutView = () => {
      const pairingData = Object.entries(knockoutPairings || {});

      return (
        <FlatList
          data={pairingData}
          keyExtractor={(item) => item[0]}
          renderItem={({ item }) => renderPairingRow(item)}
          contentContainerStyle={styles.knockoutContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      );
    };

  // Render bracket row
  const renderBracketRow = (rowData) => {
    const { type, matchups } = rowData;

    return (
      <View style={[styles.mobileRow, styles[`${type}`]]}>
        {matchups.map((matchup, index) => {
          // If this is the finals row, try to get a representative gameId to navigate to
          let finalGameId = null;
          if (type === 'finals-row' && matchup && matchup.matches && matchup.matches.length > 0) {
            // Prefer an in-progress or finished match, otherwise take the first
            const prefer = matchup.matches.find(m => m.status === 'in') || matchup.matches.find(m => m.status === 'post') || matchup.matches[0];
            finalGameId = prefer?.gameId || null;
          }

          const onPressHandler = type === 'finals-row'
            ? (finalGameId ? () => handleGamePress(finalGameId) : undefined)
            : () => handleMatchupPress(matchup);

          return (
            <TouchableOpacity
              key={`${type}-${index}`}
              style={[
                styles.bracketRound,
                type === 'qf-row' && styles.qfRound,
                type === 'sf-row' && styles.sfRound,
                type === 'finals-row' && styles.finalsRound,
                { backgroundColor: theme.surface, shadowColor: theme.text }
              ]}
              onPress={onPressHandler}
            >
              {renderMatchupCard(matchup, type)}
            </TouchableOpacity>
          );
        })}
        
        {/* Add TBD placeholders when there are missing matchups */}
        {type === 'qf-row' && matchups.length < 2 && (
          Array.from({ length: 2 - matchups.length }, (_, index) => (
            <View
              key={`${type}-tbd-${index}`}
              style={[
                styles.bracketRound,
                styles.qfRound,
                styles.tbaMatchup,
                { backgroundColor: theme.surfaceSecondary, shadowColor: theme.text, borderColor: theme.border }
              ]}
            >
              <View style={[styles.cardContent, styles.tbaCard]}>
                <Text style={[styles.teamName, { color: theme.textSecondary }]}>TBD vs TBD</Text>
              </View>
            </View>
          ))
        )}
        {type === 'sf-row' && matchups.length === 0 && (
          <View
            key={`${type}-tbd`}
            style={[
              styles.bracketRound,
              styles.sfRound,
              styles.tbaMatchup,
              { backgroundColor: theme.surfaceSecondary, shadowColor: theme.text, borderColor: theme.border }
            ]}
          >
            <View style={[styles.cardContent, styles.tbaCard]}>
              <Text style={[styles.teamName, { color: theme.textSecondary }]}>TBD vs TBD</Text>
            </View>
          </View>
        )}
        {type === 'finals-row' && matchups.length === 0 && (
          <View
            key={`${type}-tbd`}
            style={[
              styles.bracketRound,
              styles.finalsRound,
              styles.tbaMatchup,
              { backgroundColor: theme.surfaceSecondary, shadowColor: theme.text, borderColor: theme.border }
            ]}
          >
            <View style={[styles.cardContent, styles.tbaCard]}>
              <Text style={[styles.teamName, { color: theme.textSecondary }]}>FINAL</Text>
              <Text style={[styles.matchScore, { color: theme.textSecondary }]}>TBD vs TBD</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  // Render matchup card
  const renderMatchupCard = (matchup, type) => {
    const aggregateHome = matchup.aggregateHome || 0;
    const aggregateAway = matchup.aggregateAway || 0;

    const { winner, loser, winnerScore, loserScore, isTie, homeShootoutScore, awayShootoutScore } = getWinnerInfo(matchup, aggregateHome, aggregateAway);

    let firstTeam, secondTeam, firstScore, secondScore, firstIsWinner = false;
    let firstShootoutScore = 0, secondShootoutScore = 0;

    if (type === "finals-row") {
      firstTeam = matchup.homeTeam;
      secondTeam = matchup.awayTeam;
      firstScore = aggregateHome;
      secondScore = aggregateAway;
      firstShootoutScore = homeShootoutScore;
      secondShootoutScore = awayShootoutScore;
      firstIsWinner = !isTie && winner.id === firstTeam.id;
    } else {
      if (!isTie) {
        firstTeam = winner;
        secondTeam = loser;
        firstScore = winnerScore;
        secondScore = loserScore;
        firstIsWinner = true;
        if (firstTeam.id === matchup.homeTeam.id) {
          firstShootoutScore = homeShootoutScore;
          secondShootoutScore = awayShootoutScore;
        } else {
          firstShootoutScore = awayShootoutScore;
          secondShootoutScore = homeShootoutScore;
        }
      } else {
        firstTeam = matchup.homeTeam;
        secondTeam = matchup.awayTeam;
        firstScore = aggregateHome;
        secondScore = aggregateAway;
        firstShootoutScore = homeShootoutScore;
        secondShootoutScore = awayShootoutScore;
      }
    }

    const firstScoreDisplay = firstShootoutScore > 0 ? `${firstScore}(${firstShootoutScore})` : firstScore.toString();
    const secondScoreDisplay = secondShootoutScore > 0 ? `${secondScore}(${secondShootoutScore})` : secondScore.toString();

    if (type === "finals-row") {
      const firstAbbrev = abbreviateFinalsTeamName(firstTeam) || (firstTeam?.displayName || "TBD");
      const secondAbbrev = abbreviateFinalsTeamName(secondTeam) || (secondTeam?.displayName || "TBD");

      return (
        <View style={styles.finalsCard}>
          <Text style={[styles.finalsTitle, { color: theme.text }]}>FINAL</Text>
          <View style={styles.finalsMatchupHorizontal}>
            <View style={styles.finalTeamLeft}>
              <TeamLogoImage teamId={firstTeam?.id} style={styles.finalLogoLeft} />
              <View style={styles.finalTeamTexts}>
                <Text style={[styles.teamAbbrev, { color: firstIsWinner ? colors.primary : theme.text }]}>{firstAbbrev}</Text>
                <Text style={[styles.teamScore, { color: firstIsWinner ? colors.primary : theme.text }]}>{firstScoreDisplay}</Text>
              </View>
            </View>

            <View style={styles.finalSeparator}>
              <Text style={[styles.vsText, { color: theme.textSecondary }]}>vs</Text>
            </View>

            <View style={styles.finalTeamRight}>
              <View style={styles.finalTeamTexts}>
                <Text style={[styles.teamAbbrev, { color: !isTie && !firstIsWinner ? colors.primary : theme.text }]}>{secondAbbrev}</Text>
                <Text style={[styles.teamScore, { color: !isTie && !firstIsWinner ? colors.primary : theme.text }]}>{secondScoreDisplay}</Text>
              </View>
              <TeamLogoImage teamId={secondTeam?.id} style={styles.finalLogoRight} />
            </View>
          </View>
        </View>
      );
    }

    // Non-finals layout: vertical team sections with logos on top
    return (
      <View style={styles.matchupCard}>
        <View style={styles.teamSectionVertical}>
          <TeamLogoImage teamId={firstTeam?.id} style={styles.bracketLogoTop} />
          <Text style={[styles.teamName, { color: firstIsWinner ? colors.primary : theme.text }]}>{firstTeam.shortDisplayName}</Text>
          <Text style={[styles.teamScore, { color: firstIsWinner ? colors.primary : theme.text }]}>{firstScoreDisplay}</Text>
        </View>
        <View style={styles.teamSectionVertical}>
          <TeamLogoImage teamId={secondTeam?.id} style={styles.bracketLogoTop} />
          <Text style={[styles.teamName, { color: !isTie && !firstIsWinner ? colors.primary : theme.text }]}>{secondTeam.shortDisplayName}</Text>
          <Text style={[styles.teamScore, { color: !isTie && !firstIsWinner ? colors.primary : theme.text }]}>{secondScoreDisplay}</Text>
        </View>
      </View>
    );
  };

  // Render pairing row
  const renderPairingRow = ([pairingName, matchups]) => {
    if (matchups.length === 0) {
      return (
        <View style={[styles.pairingRow, { backgroundColor: theme.surface }]}>
          <Text style={[styles.pairingTitle, { color: theme.text }]}>{pairingName}</Text>
          <View style={styles.pairingContent}>
            <View style={styles.pairingLeft}>
              <View style={[styles.teamMatchup, styles.tbaMatchup, { backgroundColor: theme.surfaceSecondary, shadowColor: theme.text, borderColor: theme.border }]}>
                <Text style={[styles.teamName, { color: theme.textSecondary }]}>TBD vs TBD</Text>
                <Text style={[styles.matchScore, { color: theme.textSecondary }]}>Agg: - : -</Text>
              </View>
              <View style={[styles.teamMatchup, styles.tbaMatchup, { backgroundColor: theme.surfaceSecondary, shadowColor: theme.text, borderColor: theme.border }]}>
                <Text style={[styles.teamName, { color: theme.textSecondary }]}>TBD vs TBD</Text>
                <Text style={[styles.matchScore, { color: theme.textSecondary }]}>Agg: - : -</Text>
              </View>
            </View>
            <View style={styles.vsSection}>
              <Text style={[styles.vsText, { color: theme.textSecondary }]}>vs</Text>
            </View>
            <View style={styles.pairingRight}>
              <View style={[styles.teamMatchup, styles.tbaMatchup, { backgroundColor: theme.surfaceSecondary, shadowColor: theme.text, borderColor: theme.border }]}>
                <Text style={[styles.teamName, { color: theme.textSecondary }]}>Round of 16</Text>
                <Text style={[styles.matchScore, { color: theme.textSecondary }]}>TBD vs TBD</Text>
              </View>
              <View style={[styles.teamMatchup, styles.tbaMatchup, { backgroundColor: theme.surfaceSecondary, shadowColor: theme.text, borderColor: theme.border }]}>
                <Text style={[styles.teamName, { color: theme.textSecondary }]}>Round of 16</Text>
                <Text style={[styles.matchScore, { color: theme.textSecondary }]}>TBD vs TBD</Text>
              </View>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.pairingRow, { backgroundColor: theme.surface }]}>
        <Text style={[styles.pairingTitle, { color: theme.text }]}>{pairingName}</Text>
        <View style={styles.pairingContent}>
          <View style={styles.pairingLeft}>
            {matchups.map((matchup, index) => (
              <TouchableOpacity
                key={`left-${index}`}
                style={[styles.teamMatchup, {backgroundColor: theme.surfaceSecondary, shadowColor: theme.text}]}
                onPress={() => handleMatchupPress(matchup)}
              >
                {renderAggregateCard(matchup)}
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.vsSection}>
            <Text style={[styles.vsText, { color: theme.textSecondary }]}>-</Text>
          </View>
          <View style={styles.pairingRight}>
            {matchups.map((matchup, index) => {
              const r16Matchup = findMatchingRoundOf16(matchup, roundOf16Matchups) || matchup;
              return (
                <TouchableOpacity
                  key={`right-${index}`}
                  style={[styles.teamMatchup, {backgroundColor: theme.surfaceSecondary, shadowColor: theme.text}]}
                  onPress={() => handleMatchupPress(r16Matchup)}
                >
                  {renderRoundOf16Card(matchup, index)}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  // Render aggregate card for knockout view
  const renderAggregateCard = (matchup) => {
    const aggregateHome = matchup.aggregateHome;
    const aggregateAway = matchup.aggregateAway;

    const { winner, loser, winnerScore, loserScore, isTie, homeShootoutScore, awayShootoutScore } = getWinnerInfo(matchup, aggregateHome, aggregateAway);

    let firstTeam, secondTeam, firstScore, secondScore, firstIsWinner;
    if (!isTie) {
      firstTeam = winner;
      secondTeam = loser;
      firstScore = winnerScore;
      secondScore = loserScore;
      firstIsWinner = true;
    } else {
      firstTeam = matchup.homeTeam;
      secondTeam = matchup.awayTeam;
      firstScore = aggregateHome;
      secondScore = aggregateAway;
      firstIsWinner = false;
    }

    let firstShootoutScore = 0;
    let secondShootoutScore = 0;
    if (homeShootoutScore > 0 || awayShootoutScore > 0) {
      if (firstTeam.id === matchup.homeTeam.id) {
        firstShootoutScore = homeShootoutScore;
        secondShootoutScore = awayShootoutScore;
      } else {
        firstShootoutScore = awayShootoutScore;
        secondShootoutScore = homeShootoutScore;
      }
    }

    const firstScoreDisplay = firstShootoutScore > 0 ? `${firstScore}(${firstShootoutScore})` : firstScore.toString();
    const secondScoreDisplay = secondShootoutScore > 0 ? `${secondScore}(${secondShootoutScore})` : secondScore.toString();

    return (
      <View style={styles.cardContent}>
        <View style={styles.teamInfo}>
          <Text style={[styles.teamName, { color: firstIsWinner && !isTie ? colors.primary : theme.text }]}>
            {firstTeam.shortDisplayName}
          </Text>
          <Text style={[styles.teamName, { color: !firstIsWinner && !isTie ? colors.primary : theme.text }]}>
            {secondTeam.shortDisplayName}
          </Text>
        </View>
        <View style={styles.scoreSection}>
          <Text style={[styles.matchScore, { color: firstIsWinner && !isTie ? colors.primary : theme.text }]}>
            {firstScoreDisplay}
          </Text>
          <Text style={[styles.matchScore, { color: theme.textSecondary }]}>:</Text>
          <Text style={[styles.matchScore, { color: !firstIsWinner && !isTie ? colors.primary : theme.text }]}>
            {secondScoreDisplay}
          </Text>
        </View>
      </View>
    );
  };

  // Render Round of 16 card for knockout view
  const renderRoundOf16Card = (knockoutMatchup, matchIndex) => {
    const roundOf16Matchup = findMatchingRoundOf16(knockoutMatchup, roundOf16Matchups);

    if (!roundOf16Matchup) {
      return (
        <View style={[styles.cardContent, styles.tbaCard, { backgroundColor: theme.surfaceSecondary, shadowColor: theme.text, borderColor: theme.border }]}>
          <Text style={[styles.teamName, { color: theme.textSecondary }]}>Round of 16</Text>
          <Text style={[styles.matchScore, { color: theme.textSecondary }]}>TBD vs TBD</Text>
        </View>
      );
    }

    const homeTeam = roundOf16Matchup.homeTeam;
    const awayTeam = roundOf16Matchup.awayTeam;
    const homeScore = roundOf16Matchup.aggregateHome;
    const awayScore = roundOf16Matchup.aggregateAway;

    const { winner, loser, winnerScore, loserScore, isTie, homeShootoutScore, awayShootoutScore } = getWinnerInfo(roundOf16Matchup, homeScore, awayScore);

    let winnerId = null, loserId = null;
    if (!isTie) {
      winnerId = winner.id;
      loserId = loser.id;
    }

    const homeScoreDisplay = homeShootoutScore > 0 ? `${homeScore}(${homeShootoutScore})` : homeScore.toString();
    const awayScoreDisplay = awayShootoutScore > 0 ? `${awayScore}(${awayShootoutScore})` : awayScore.toString();

    return (
      <View style={styles.cardContent}>
        <View style={styles.teamInfo}>
          <Text style={[styles.teamName, { color: homeTeam.id === winnerId ? colors.primary : theme.text }]}>
            {homeTeam.shortDisplayName}
          </Text>
          <Text style={[styles.teamName, { color: awayTeam.id === winnerId ? colors.primary : theme.text }]}>
            {awayTeam.shortDisplayName}
          </Text>
        </View>
        <View style={styles.scoreSection}>
          <Text style={[styles.matchScore, { color: homeTeam.id === winnerId ? colors.primary : theme.text }]}>
            {homeScoreDisplay}
          </Text>
          <Text style={[styles.matchScore, { color: theme.textSecondary }]}>:</Text>
          <Text style={[styles.matchScore, { color: awayTeam.id === winnerId ? colors.primary : theme.text }]}>
            {awayScoreDisplay}
          </Text>
        </View>
      </View>
    );
  };

  // Find matching Round of 16 matchup
  const findMatchingRoundOf16 = (knockoutMatchup, roundOf16Matchups) => {
    if (!knockoutMatchup || !roundOf16Matchups || roundOf16Matchups.length === 0) {
      return null;
    }

    const koTeams = [knockoutMatchup.homeTeam.id, knockoutMatchup.awayTeam.id];

    return roundOf16Matchups.find(r16Matchup => {
      const r16Teams = [r16Matchup.homeTeam.id, r16Matchup.awayTeam.id];
      return koTeams.some(koTeamId => r16Teams.includes(koTeamId));
    });
  };

  // Render modal for leg details
  const renderModal = () => {
    if (!selectedMatchup) return null;

    const sortedMatches = selectedMatchup.matches.sort((a, b) => a.leg - b.leg);
    const { winner, loser, winnerScore, loserScore, isTie, homeShootoutScore, awayShootoutScore } = getWinnerInfo(selectedMatchup, selectedMatchup.aggregateHome, selectedMatchup.aggregateAway);

    const homeAggregateDisplay = homeShootoutScore > 0 ? `${selectedMatchup.aggregateHome}(${homeShootoutScore})` : selectedMatchup.aggregateHome.toString();
    const awayAggregateDisplay = awayShootoutScore > 0 ? `${selectedMatchup.aggregateAway}(${awayShootoutScore})` : selectedMatchup.aggregateAway.toString();

    return (
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={[styles.closeButtonText, { color: theme.text }]}>×</Text>
            </TouchableOpacity>

            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {selectedMatchup.homeTeam.shortDisplayName} vs {selectedMatchup.awayTeam.shortDisplayName}
            </Text>

            <ScrollView style={styles.legsContainer}>
              {[1, 2].map(legNumber => {
                const match = sortedMatches.find(m => m.leg === legNumber);
                // If a match exists for this leg, render the whole card as a single touchable
                if (match) {
                  return (
                    <TouchableOpacity
                      key={legNumber}
                      style={[styles.legCard, { backgroundColor: theme.background }]}
                      onPress={() => handleGamePress(match.gameId)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.legHeader}>
                        <Text style={[styles.legTitle, { color: theme.text }]}>
                          Leg {legNumber} - {match.status === "post" ? "Finished" : match.status === "in" ? "In Progress" : "Scheduled"}
                        </Text>
                        {match.date && (
                          <Text style={[styles.legDate, { color: theme.textSecondary }]}>({match.date})</Text>
                        )}
                      </View>

                      <View style={styles.legMatchup}>
                        <View style={styles.legTeam}>
                          <TeamLogoImage teamId={match.homeTeam?.id} style={[styles.legLogo, styles.legLogoLeft]} />
                          <View style={[styles.legTeamTextsCenter, styles.legTeamTextsHome]}>
                            <Text style={[styles.legTeamName, { color: match.status === "post" && match.homeScore > match.awayScore ? colors.primary : theme.text }]}>{match.homeTeam.shortDisplayName}</Text>
                            <Text style={[styles.legScore, { color: match.status === "post" && match.homeScore > match.awayScore ? colors.primary : theme.text }]}>
                              {match.homeShootoutScore > 0 ? `${match.homeScore}(${match.homeShootoutScore})` : match.homeScore}
                            </Text>
                          </View>
                        </View>

                        <Text style={[styles.legVs, { color: theme.textSecondary }]}>:</Text>

                        <View style={styles.legTeam}>
                          <TeamLogoImage teamId={match.awayTeam?.id} style={[styles.legLogo, styles.legLogoRight]} />
                          <View style={[styles.legTeamTextsCenter, styles.legTeamTextsAway]}>
                            <Text style={[styles.legTeamName, { color: match.status === "post" && match.awayScore > match.homeScore ? colors.primary : theme.text }]}>{match.awayTeam.shortDisplayName}</Text>
                            <Text style={[styles.legScore, { color: match.status === "post" && match.awayScore > match.homeScore ? colors.primary : theme.text }]}>
                              {match.awayShootoutScore > 0 ? `${match.awayScore}(${match.awayShootoutScore})` : match.awayScore}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Show an indicator for live/scheduled but avoid an inner Touchable to prevent nested touchables */}
                      {match.status === "pre" || match.status === "in" ? (
                        <View style={[styles.viewGameButton, { backgroundColor: colors.primary }]}> 
                          <Text style={[styles.viewGameText, { color: '#fff' }]}>{match.status === "in" ? "Watch Live" : "View Game"}</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                }

                // No match scheduled for this leg
                return (
                  <View key={legNumber} style={[styles.legCard, { backgroundColor: theme.background }]}>
                    <Text style={[styles.legTitle, { color: theme.textSecondary }]}>Leg {legNumber} - Not Scheduled</Text>
                  </View>
                );
              })}
            </ScrollView>

            <View style={[styles.aggregateSection, { backgroundColor: theme.background }]}>
              <Text style={[styles.aggregateText, { color: theme.text }]}>
                Aggregate Score - {homeAggregateDisplay} : {awayAggregateDisplay}
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  if (loading && Object.keys(knockoutPairings).length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {renderViewSelector()}
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.text }]}>Loading bracket data...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderViewSelector()}

      {currentView === 'bracket' ? renderBracketView() : renderKnockoutView()}

      {renderModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  selectorContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  selectorButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 4,
    borderRadius: 20,
    alignItems: 'center',
  },
  selectorText: {
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
  },
  bracketContainer: {
    padding: 16,
  },
  mobileRow: {
    width: '100%',
    marginBottom: 20,
  },
  'qf-row': {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  'sf-row': {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  'finals-row': {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bracketRound: {
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#f9f9f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  qfRound: {
    flex: 1,
    maxWidth: '48%',
  },
  sfRound: {
    flex: 0.6,
    maxWidth: '60%',
    alignSelf: 'center',
  },
  finalsRound: {
    flex: 0.8,
    maxWidth: '80%',
    alignSelf: 'center',
  },
  matchupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  teamSection: {
    alignItems: 'center',
    gap: 5,
  },
  teamName: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  teamScore: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  finalsCard: {
    alignItems: 'center',
    gap: 15,
  },
  finalsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  finalsMatchup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  finalsMatchupHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  finalTeamLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    flex: 1,
    justifyContent: 'flex-start',
  },
  finalTeamRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    flex: 1,
    justifyContent: 'flex-end',
  },
  finalTeamTexts: {
    alignItems: 'center',
    gap: 4,
  },
  finalSeparator: {
    width: 60,
    alignItems: 'center',
  },
  finalLogoLeft: {
    width: 44,
    height: 44,
  },
  finalLogoRight: {
    width: 44,
    height: 44,
  },
  teamColumn: {
    alignItems: 'center',
    gap: 5,
  },
  teamSectionVertical: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  bracketLogoTop: {
    width: 36,
    height: 36,
    marginBottom: 4,
  },
  teamAbbrev: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  vsText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  knockoutContainer: {
    padding: 16,
  },
  pairingRow: {
    borderRadius: 8,
    marginBottom: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  pairingTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  pairingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  pairingLeft: {
    flex: 1,
    gap: 8,
  },
  pairingRight: {
    flex: 1,
    gap: 8,
  },
  vsSection: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  teamMatchup: {
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  tbaMatchup: {
    backgroundColor: '#f8f9fa',
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: '#ccc',
  },
  cardContent: {
    gap: 8,
  },
  teamInfo: {
    gap: 4,
  },
  scoreSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  matchScore: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  tbaCard: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    borderRadius: 10,
    padding: 20,
    maxWidth: width * 0.9,
    width: '90%',
    maxHeight: '80%',
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 15,
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  legsContainer: {
    maxHeight: 300,
  },
  legCard: {
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
  },
  legHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  legTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  legDate: {
    fontSize: 12,
  },
  legMatchup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  legTeam: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  legTeamName: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  legScore: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  legVs: {
    fontSize: 16,
    fontWeight: 'bold',
    marginHorizontal: 10,
  },
  legLogo: {
    width: 36,
    height: 36,
  },
  legLogoLeft: {
    position: 'absolute',
    left: 8,
  },
  legLogoRight: {
    position: 'absolute',
    right: 8,
  },
  legTeamTextsCenter: {
    alignItems: 'center',
  },
  legTeamTextsHome: {
    paddingLeft: 30,
  },
  legTeamTextsAway: {
    paddingRight: 30,
  },
  viewGameButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  viewGameText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  aggregateSection: {
    borderRadius: 8,
    padding: 15,
    marginTop: 10,
  },
  aggregateText: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default UECLBracketScreen;

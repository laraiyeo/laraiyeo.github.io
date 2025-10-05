import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  Modal
} from 'react-native';
import { WebView } from 'react-native-webview';
import { SvgUri } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';
import { useWindowDimensions } from 'react-native';
import YearFallbackUtils from '../../utils/YearFallbackUtils';

// Global image cache to persist across component re-renders
const loadedImages = new Set();
const imageComponentCache = new Map(); // Cache actual Image components

// Helper function for initials (extracted to avoid recreation)
const getInitials = (firstName, lastName) => {
  if (!firstName && !lastName) return '';
  const first = (firstName || '').trim();
  const last = (lastName || '').trim();
  return ((first[0] || '') + (last[0] || '')).toUpperCase();
};

// Grid driver image component (moved outside to prevent recreation)
const GridDriverImage = React.memo(({ headshot, athlete, driverName, teamColor, theme, styles }) => {
  const [imageError, setImageError] = useState(() => {
    // Initialize with error state if we know this image failed before
    return headshot ? !loadedImages.has(headshot) : false;
  });

  // Only reset error state when headshot URL actually changes
  useEffect(() => {
    if (headshot) {
      if (loadedImages.has(headshot)) {
        // This image loaded successfully before, don't show error
        setImageError(false);
      } else {
        // New/unknown image, reset error state to try loading
        setImageError(false);
      }
    }
  }, [headshot]);

  if (!headshot || imageError) {
    return (
      <View style={[
        styles.gridDriverAvatarEmpty, 
        { 
          borderColor: teamColor || theme.border,
          backgroundColor: teamColor || theme.border 
        }
      ]}>
        <Text allowFontScaling={false} style={[styles.gridDriverInitials, { color: '#fff' }]}>
          {athlete ? getInitials(athlete.firstName, athlete.lastName) : (driverName || '').split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()}
        </Text>
      </View>
    );
  }

  // Use cached Image component or create new one
  const cacheKey = `${headshot}_${teamColor || theme.border}`;
  if (!imageComponentCache.has(cacheKey)) {
    imageComponentCache.set(cacheKey, (
      <Image
        source={{ uri: headshot, cache: 'force-cache' }}
        style={[styles.gridDriverAvatar, { borderColor: teamColor || theme.border }]}
        onError={() => {
          setImageError(true);
          if (headshot) {
            loadedImages.delete(headshot);
            imageComponentCache.delete(cacheKey);
          }
        }}
        onLoad={() => {
          if (headshot) loadedImages.add(headshot);
        }}
      />
    ));
  }

  return imageComponentCache.get(cacheKey);
});

const RaceDetailsScreen = ({ route }) => {
  const { raceId, eventId, raceName, raceDate } = route.params || {};
  const { theme, colors, isDarkMode } = useTheme();
  const navigation = useNavigation();
  const { isFavorite, toggleFavorite } = useFavorites();

  const [selectedTab, setSelectedTab] = useState('INFO');
  const [raceData, setRaceData] = useState(null);
  const [circuitInfo, setCircuitInfo] = useState(null);
  const [winnerDriver, setWinnerDriver] = useState(null);
  // allow Results screen to pass the nextCompetitionType so details header and list match
  const passedNextCompetitionType = (route.params && route.params.nextCompetitionType) || null;
  const [nextCompetitionLabel, setNextCompetitionLabel] = useState(passedNextCompetitionType);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [competitionResults, setCompetitionResults] = useState({});
  const [competitionOrder, setCompetitionOrder] = useState([]);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState(null);
  const [raceStatus, setRaceStatus] = useState(null);
  const [driverModalVisible, setDriverModalVisible] = useState(false);
  const [selectedDriverDetails, setSelectedDriverDetails] = useState(null);
  const { width: windowWidth } = useWindowDimensions();

  // Streaming state
  const [streamModalVisible, setStreamModalVisible] = useState(false);
  const [isStreamLoading, setIsStreamLoading] = useState(true);
  const [selectedStream, setSelectedStream] = useState(1); // 1 for Test 1, 2 for Test 2

  // Live race tracking state
  const [isLiveRace, setIsLiveRace] = useState(false);
  const [liveUpdateInterval, setLiveUpdateInterval] = useState(null);
  const [currentLiveSession, setCurrentLiveSession] = useState(null);
  const [nextScheduledSession, setNextScheduledSession] = useState(null);

  // Refs to access current values in interval callbacks
  const selectedTabRef = useRef(selectedTab);
  const selectedCompetitionIdRef = useRef(selectedCompetitionId);
  const competitionResultsRef = useRef(competitionResults);

  // Keep refs updated with current values
  useEffect(() => { selectedTabRef.current = selectedTab; }, [selectedTab]);
  useEffect(() => { selectedCompetitionIdRef.current = selectedCompetitionId; }, [selectedCompetitionId]);
  useEffect(() => { competitionResultsRef.current = competitionResults; }, [competitionResults]);

  // OpenF1 API related state
  const [openF1Data, setOpenF1Data] = useState({
    meetingKey: null,
    sessions: [],
    selectedSessionKey: null,
    events: [],
    drivers: {},
    eventsLoading: false,
    eventsError: null,
    selectedDriverFilter: null, // null means show all drivers, otherwise driver number
    stints: [] // array of stints for the current selected session
  });

  const tabs = [
    { key: 'INFO', name: 'Info' },
    { key: 'RESULTS', name: 'Results' },
    { key: 'GRID', name: 'Grid' },
    { key: 'EVENTS', name: 'Events' }
  ];

  // Helper to extract live position from gapToLeader statistics
  const getLivePosition = (competitor) => {
    if (!competitor.liveStats || !competitor.liveStats.splits || !competitor.liveStats.splits.categories) {
      return competitor.order;
    }
    
    // gapToLeader is categories[1]
    const gapToLeaderSplit = competitor.liveStats.splits.categories[1];
    if (!gapToLeaderSplit || gapToLeaderSplit.name !== 'gapToLeader') {
      return competitor.order;
    }
    
    const positionStat = gapToLeaderSplit.stats?.find(stat => stat.name === 'position');
    if (positionStat) {
      return positionStat.value;
    }
    
    return competitor.order;
  };

  // Helper to extract live gap to leader from statistics
  const getLiveGapToLeader = (competitor) => {
    if (!competitor.liveStats || !competitor.liveStats.splits || !competitor.liveStats.splits.categories) {
      return competitor.behindTime || (competitor.behindLaps != null ? `+${competitor.behindLaps} Laps` : competitor.totalTime);
    }
    
    const categories = competitor.liveStats.splits.categories;
    
    // Priority 1: categories[1].gapToLeader (if exists and valid)
    if (categories[1] && categories[1].name === 'gapToLeader') {
      const gapStat = categories[1].stats?.find(stat => stat.name === 'gapToLeader');
      if (gapStat) {
        if (gapStat.value === 0) {
          return 'Leader';
        }
        return gapStat.displayValue || gapStat.value;
      } else {
        // gapToLeader category exists but no gapToLeader stat - check if this is position 1
        const positionStat = categories[1].stats?.find(stat => stat.name === 'position');
        if (positionStat && positionStat.value === 1) {
          return 'Leader';
        }
      }
    }
    
    // Priority 2: categories[0].behindTime (if exists)
    if (categories[0] && categories[0].stats) {
      const behindTimeStat = categories[0].stats.find(stat => stat.name === 'behindTime');
      if (behindTimeStat && behindTimeStat.displayValue) {
        return behindTimeStat.displayValue;
      }
    }
    
    // Priority 3: categories[0].behindLaps (if exists)
    if (categories[0] && categories[0].stats) {
      const behindLapsStat = categories[0].stats.find(stat => stat.name === 'behindLaps');
      if (behindLapsStat && behindLapsStat.value != null) {
        return `+${behindLapsStat.value} Laps`;
      }
    }
    
    // Priority 4: categories[0].totalTime (if exists)
    if (categories[0] && categories[0].stats) {
      const totalTimeStat = categories[0].stats.find(stat => stat.name === 'totalTime');
      if (totalTimeStat && totalTimeStat.displayValue) {
        return totalTimeStat.displayValue;
      }
    }
    
    // Fallback to original competitor data
    return competitor.behindTime || (competitor.behindLaps != null ? `+${competitor.behindLaps} Laps` : competitor.totalTime);
  };

  // Memoized sorted competitors for Results tab
  const sortedCompetitors = React.useMemo(() => {
    if (!selectedCompetitionId || !competitionResults[selectedCompetitionId]) {
      return [];
    }
    
    const competitors = competitionResults[selectedCompetitionId].competitors;
    const hasAnyLiveStats = competitors.some(c => !!c.liveStats);
    
    return competitors
      .slice()
      .sort((a, b) => {
        // Only sort by live position if race is live AND we have live stats
        if (isLiveRace && hasAnyLiveStats) {
          const aPos = getLivePosition(a) || 999;
          const bPos = getLivePosition(b) || 999;
          return aPos - bPos;
        }
        return (a.order || 999) - (b.order || 999);
      });
  }, [competitionResults, selectedCompetitionId, isLiveRace]);

  // Memoized sorted competitors for Grid tab
  const sortedGridCompetitors = React.useMemo(() => {
    if (!selectedCompetitionId || !competitionResults[selectedCompetitionId]) {
      return [];
    }
    
    const competitors = competitionResults[selectedCompetitionId].competitors || [];
    const hasAnyLiveStats = competitors.some(c => !!c.liveStats);
    
    return competitors.slice().sort((a,b) => {
      if (isLiveRace && hasAnyLiveStats) {
        const aPos = getLivePosition(a) || 999;
        const bPos = getLivePosition(b) || 999;
        return aPos - bPos;
      } else {
        const aOrder = (a.order != null ? Number(a.order) : (a.startOrder != null ? Number(a.startOrder) : Number(a.startPosition ?? 0)) ) || 0;
        const bOrder = (b.order != null ? Number(b.order) : (b.startOrder != null ? Number(b.startOrder) : Number(b.startPosition ?? 0)) ) || 0;
        return aOrder - bOrder;
      }
    });
  }, [competitionResults, selectedCompetitionId, isLiveRace]);

  // Helper to get F1 team ID for favorites
  const getF1TeamId = (teamName) => {
    if (!teamName) return null;
    return `f1_${teamName.toLowerCase().replace(/\s+/g, '_')}`;
  };

  const handleTeamFavoriteToggle = async (teamName, teamColor) => {
    if (!teamName) return;
    try {
      await toggleFavorite({ teamId: getF1TeamId(teamName), teamName, sport: 'f1', leagueCode: 'f1', teamColor });
    } catch (e) {
      console.error('Error toggling favorite from RaceDetailsScreen', e);
    }
  };

  // Helper to determine if streaming should be available
  const isStreamingAvailable = () => {
    if (!raceData) {
      console.log('No race data available');
      return false;
    }

    // Get current time in EST
    const now = new Date();
    const estOffset = -5 * 60; // EST is UTC-5 (in minutes)
    const nowEST = new Date(now.getTime() + (estOffset * 60 * 1000));
    
    // Get race weekend start and end dates
    const raceStartDate = raceData.date ? new Date(raceData.date) : null;
    const raceEndDate = raceData.endDate ? new Date(raceData.endDate) : null;
    
    console.log('Stream availability check:', {
      nowEST: nowEST.toISOString(),
      raceStartDate: raceStartDate?.toISOString(),
      raceEndDate: raceEndDate?.toISOString(),
    });

    if (!raceStartDate || !raceEndDate) {
      console.log('Race dates not available');
      return false;
    }

    // Convert race dates to EST for comparison
    const raceStartEST = new Date(raceStartDate.getTime() + (estOffset * 60 * 1000));
    const raceEndEST = new Date(raceEndDate.getTime() + (estOffset * 60 * 1000));
    
    // Check if current EST date is within race weekend
    const currentESTDateOnly = new Date(nowEST.getFullYear(), nowEST.getMonth(), nowEST.getDate());
    const raceStartDateOnly = new Date(raceStartEST.getFullYear(), raceStartEST.getMonth(), raceStartEST.getDate());
    const raceEndDateOnly = new Date(raceEndEST.getFullYear(), raceEndEST.getMonth(), raceEndEST.getDate());
    
    const isWithinRaceWeekend = currentESTDateOnly >= raceStartDateOnly && currentESTDateOnly <= raceEndDateOnly;
    
    console.log('Date comparison:', {
      currentESTDateOnly: currentESTDateOnly.toDateString(),
      raceStartDateOnly: raceStartDateOnly.toDateString(),
      raceEndDateOnly: raceEndDateOnly.toDateString(),
      isWithinRaceWeekend
    });

    return isWithinRaceWeekend;
  };

  useEffect(() => {
    fetchRaceDetails();
    loadOpenF1Data();
  }, [raceId]);

  // Load events when selected session changes
  useEffect(() => {
    if (openF1Data.selectedSessionKey) {
      loadEventsForSession(openF1Data.selectedSessionKey);
    }
  }, [openF1Data.selectedSessionKey]);

  // Sync OpenF1 session selection with ESPN competition selection
  useEffect(() => {
    if (!selectedCompetitionId || !openF1Data.sessions || openF1Data.sessions.length === 0) return;

    // Try to map ESPN competition to OpenF1 session
    const competition = competitionResults[selectedCompetitionId];
    if (!competition) return;

    let targetSession = null;
    const competitionName = competition.name?.toLowerCase() || '';

    // Map ESPN competition types to OpenF1 session types
    // Also check the type abbreviation for more reliable mapping
    const compTypeAbbrev = competition.type?.abbreviation?.toLowerCase() || '';
    const compTypeName = competition.type?.name?.toLowerCase() || '';
    const compDisplayName = competition.type?.displayName?.toLowerCase() || '';
    
    if (compTypeAbbrev === 'race') {
      targetSession = openF1Data.sessions.find(s => s.session_name === 'Race');
    } else if (compTypeAbbrev === 'qual') {
      targetSession = openF1Data.sessions.find(s => s.session_name === 'Qualifying');
    } else if (compTypeAbbrev === 'fp3') {
      targetSession = openF1Data.sessions.find(s => s.session_name === 'Practice 3');
    } else if (compTypeAbbrev === 'fp2') {
      targetSession = openF1Data.sessions.find(s => s.session_name === 'Practice 2');
    } else if (compTypeAbbrev === 'fp1') {
      targetSession = openF1Data.sessions.find(s => s.session_name === 'Practice 1');
    } else if (compTypeAbbrev === 'ss') {
      targetSession = openF1Data.sessions.find(s => s.session_name === 'Sprint Qualifying');
    } else if (compTypeAbbrev === 'sr') {
      targetSession = openF1Data.sessions.find(s => s.session_name === 'Sprint');
    }

    // If we found a matching session, switch to it
    if (targetSession && targetSession.session_key !== openF1Data.selectedSessionKey) {
      setOpenF1Data(prev => ({
        ...prev,
        selectedSessionKey: targetSession.session_key
      }));
    }
  }, [selectedCompetitionId, competitionResults, openF1Data.sessions]);

  // When raceData is loaded, fetch competition results and default selected competition
  useEffect(() => {
    let mounted = true;
    const loadResults = async () => {
      if (!raceData) return;
      const { results: res, order } = await fetchCompetitionResultsForEvent(raceData);
      if (!mounted) return;
      setCompetitionResults(res);
      setCompetitionOrder(order);

      // pick default competition - prefer current (nextCompetitionLabel) or last completed competition
      if (order && order.length > 0) {
        let preferred = null;
        if (nextCompetitionLabel) {
          preferred = order.find(id => {
            const r = res[id];
            const t = r?.type || {};
            const label = (t.abbreviation || t.displayName || t.text || r.name || '').toString().toLowerCase();
            return label === ('' + nextCompetitionLabel).toString().toLowerCase();
          });
        }

        if (!preferred) {
          // Smart competition selection: prioritize live > next upcoming > completed
          let liveCompetition = null;
          let nextUpcomingCompetition = null;
          let nextUpcomingDate = null;
          let lastCompletedCompetition = null;
          
          const now = new Date();
          console.log('[Competition Selection] Current time:', now.toISOString());
          console.log('[Competition Selection] Raw raceData.competitions:', raceData.competitions);
          
          // Create array of competitions with their dates for better sorting
          const competitionsWithDates = await Promise.all(order.map(async (competitionId) => {
            const r = res[competitionId];
            if (!r) return null;
            
            // Try to find corresponding competition in original raceData for date/status info
            const originalComp = raceData.competitions.find(comp => {
              const compId = comp.id || (comp.$ref && comp.$ref.split('/').pop());
              return compId === competitionId;
            });
            
            const compDate = originalComp?.date ? new Date(originalComp.date) : (r.date ? new Date(r.date) : null);
            const endDate = originalComp?.endDate ? new Date(originalComp.endDate) : (r.endDate ? new Date(r.endDate) : (compDate ? new Date(compDate.getTime() + 3 * 60 * 60 * 1000) : null));
            
            // Fetch status from $ref if available
            let status = null;
            const statusRef = originalComp?.status?.$ref || r.status?.$ref;
            if (statusRef) {
              try {
                const statusResponse = await fetch(convertToHttps(statusRef));
                if (statusResponse.ok) {
                  const statusData = await statusResponse.json();
                  status = statusData.type;
                } else {
                  console.warn(`Failed to fetch status for ${competitionId}:`, statusResponse.status);
                }
              } catch (error) {
                console.warn(`Error fetching status for ${competitionId}:`, error);
              }
            }
            
            // Fallback to direct status if no $ref or fetch failed
            if (!status) {
              status = originalComp?.status?.type || r.status?.type;
            }
            
            // ESPN status can be confusing - "End of Session" means completed even if completed: false
            const isCompleted = status?.completed === true || 
                                status?.state === 'post' || 
                                status?.description === 'End of Session' ||
                                status?.detail === 'End of Session' ||
                                status?.name === 'STATUS_SESSION_COMPLETE';
            const isLive = !isCompleted && compDate && endDate && now >= compDate && now <= endDate && 
                          (status?.state === 'in' || status?.state === 'active');
            const isUpcoming = !isCompleted && compDate && now < compDate;
            
            const competitorCount = r.competitors?.length || 0;
            const hasResults = r.competitors?.some(c => c.winner || c.order) || false;
            
            console.log(`[Competition Status] ${r.name || r.type?.displayName || competitionId}:`, {
              id: competitionId,
              date: compDate?.toISOString(),
              endDate: endDate?.toISOString(),
              originalCompDate: originalComp?.date,
              originalCompStatus: originalComp?.status,
              processedStatus: r.status,
              isCompleted,
              isLive,
              isUpcoming,
              competitorCount,
              hasResults,
              statusState: status?.state,
              statusCompleted: status?.completed,
              statusDescription: status?.description,
              competitionType: r.type?.displayName || r.type?.abbreviation,
              originalComp: originalComp ? 'found' : 'not found'
            });
            
            return {
              id: competitionId,
              competition: r,
              date: compDate,
              endDate,
              isCompleted,
              isLive,
              isUpcoming,
              hasResults
            };
          })).then(results => results.filter(Boolean));
          
          // Sort by date to find chronologically next sessions
          competitionsWithDates.sort((a, b) => {
            if (!a.date && !b.date) return 0;
            if (!a.date) return 1;
            if (!b.date) return -1;
            return a.date.getTime() - b.date.getTime();
          });
          
          // Find live session first
          for (const comp of competitionsWithDates) {
            if (comp.isLive) {
              liveCompetition = comp.id;
              console.log('[Competition Selection] Found live competition:', comp.competition.name);
              break;
            }
          }
          
          // Find next upcoming session (chronologically next)
          if (!liveCompetition) {
            for (const comp of competitionsWithDates) {
              if (comp.isUpcoming) {
                nextUpcomingCompetition = comp.id;
                nextUpcomingDate = comp.date;
                console.log('[Competition Selection] Found next upcoming competition:', comp.competition.name, 'at', comp.date?.toISOString());
                break;
              }
            }
          }
          
          // Find last completed with results
          if (!liveCompetition && !nextUpcomingCompetition) {
            for (let i = competitionsWithDates.length - 1; i >= 0; i--) {
              const comp = competitionsWithDates[i];
              if (comp.isCompleted && comp.hasResults) {
                lastCompletedCompetition = comp.id;
                console.log('[Competition Selection] Found last completed competition:', comp.competition.name);
                break;
              }
            }
          }
          
          // Select in priority order: live > next upcoming > last completed > last in order
          preferred = liveCompetition || nextUpcomingCompetition || lastCompletedCompetition || order[order.length - 1];
          
          const selectedCompetitionName = res[preferred]?.name || res[preferred]?.type?.displayName || preferred;
          console.log('=== COMPETITION SELECTION SUMMARY ===');
          console.log('Available options:', {
            live: liveCompetition ? `${res[liveCompetition]?.name || liveCompetition}` : null,
            nextUpcoming: nextUpcomingCompetition ? `${res[nextUpcomingCompetition]?.name || nextUpcomingCompetition}` : null,
            lastCompleted: lastCompletedCompetition ? `${res[lastCompletedCompetition]?.name || lastCompletedCompetition}` : null,
            fallback: `${res[order[order.length - 1]]?.name || order[order.length - 1]}`
          });
          console.log('FINAL SELECTION:', selectedCompetitionName, `(ID: ${preferred})`);
          console.log('Selection reason:', 
            liveCompetition ? 'Live competition found' :
            nextUpcomingCompetition ? 'Next upcoming competition' :
            lastCompletedCompetition ? 'Last completed competition with results' :
            'Fallback to last in order'
          );
          console.log('=====================================');
        }
        setSelectedCompetitionId(preferred);
      }
    };
    loadResults();
    return () => { mounted = false; };
  }, [raceData]);

  const convertToHttps = (url) => {
    if (url && url.startsWith('http://')) {
      return url.replace('http://', 'https://');
    }
    return url;
  };

  // Fetch competition status when selected competition changes
  useEffect(() => {
    let mounted = true;
    const loadStatus = async () => {
      setRaceStatus(null);
      try {
        if (!selectedCompetitionId || !competitionResults[selectedCompetitionId]) return;
        const comp = competitionResults[selectedCompetitionId];
        // status may be at comp.status.$ref or comp.raw.status.$ref or comp.$ref/status
        let statusRef = comp?.status?.$ref || comp?.raw?.status?.$ref || null;

        // try to derive status URL from competition $ref if missing
        if (!statusRef && comp.$ref) {
          // common status path: {comp.$ref}/status?lang=en&region=us
          const base = ('' + comp.$ref).split('?')[0].replace(/\/$/, '');
          statusRef = `${base}/status?lang=en&region=us`;
        }

        if (statusRef) {
          // Use standard fetch without custom headers to avoid CORS issues
          const resp = await fetch(convertToHttps(statusRef));
          if (resp && resp.ok) {
            const json = await resp.json();
            if (!mounted) return;
            setRaceStatus(json);
            return;
          }
        }
      } catch (e) {
        // ignore errors, leave raceStatus null
      }
    };
    loadStatus();
    return () => { mounted = false; };
  }, [selectedCompetitionId, competitionResults]);

  // Component to render SVG using WebView on mobile
  const SvgViewer = ({ uri, width, height, style }) => {
    const svgHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          body { 
            margin: 0; 
            padding: 0; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            height: 100vh; 
            background: transparent;
          }
          svg { 
            max-width: 100%; 
            max-height: 100%; 
            width: auto; 
            height: auto; 
          }
        </style>
      </head>
      <body>
        <img src="${uri}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
      </body>
      </html>
    `;

    return (
      <WebView
        source={{ html: svgHtml }}
        style={[{ width, height }, style]}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        bounces={false}
        scalesPageToFit={false}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}
      />
    );
  };

  // Choose the best circuit map href from diagrams based on theme
  const getCircuitMapHref = (diagrams = [], darkMode = false) => {
    if (!Array.isArray(diagrams) || diagrams.length === 0) return null;

    // prefer day-dark when darkMode, otherwise day. Prefer .svg over other types.
    const preferRel = darkMode ? 'day-dark' : 'day';

    // look for exact rel match with 'full' and prefer svg
    const candidates = diagrams.filter(d => Array.isArray(d.rel) && d.rel.includes(preferRel));
    const svgPrefer = (arr) => {
      if (!arr || arr.length === 0) return null;
      const svg = arr.find(d => d.href && d.href.endsWith('.svg'));
      if (svg) return svg.href;
      return arr[0].href || null;
    };

    const pick = svgPrefer(candidates) || svgPrefer(diagrams);
    return pick ? convertToHttps(pick) : null;
  };

  const buildESPNHeadshotUrl = (athleteId) => {
    if (!athleteId) return null;
    return `https://a.espncdn.com/i/headshots/rpm/players/full/${athleteId}.png`;
  };

  // Predefined team color map (matches StandingsScreen constructorColors)
  const PREDEFINED_TEAM_COLORS = {
    'Mercedes': '#27F4D2',
    'Red Bull': '#3671C6',
    'Ferrari': '#E8002D',
    'McLaren': '#FF8000',
    'Alpine': '#FF87BC',
    'Racing Bulls': '#6692FF',
    'Aston Martin': '#229971',
    'Williams': '#64C4FF',
    'Sauber': '#52E252',
    'Haas': '#B6BABD'
  };

  // Tire image mapping (from c2.txt)
  const TIRE_IMAGES = {
    SOFT: 'https://upload.wikimedia.org/wikipedia/commons/d/df/F1_tire_Pirelli_PZero_Red.svg',
    MEDIUM: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/F1_tire_Pirelli_PZero_Yellow.svg',
    HARD: 'https://upload.wikimedia.org/wikipedia/commons/d/d6/F1_tire_Pirelli_PZero_White.svg',
    INTERMEDIATE: 'https://upload.wikimedia.org/wikipedia/commons/8/86/F1_tire_Pirelli_Cinturato_Green.svg',
    WET: 'https://upload.wikimedia.org/wikipedia/commons/6/63/F1_tire_Pirelli_Cinturato_Blue.svg'
  };

  // Helper to format color (adds # if missing, like StandingsScreen)
  const formatColor = (color) => {
    if (!color) return '#000000';
    return color.startsWith('#') ? color : `#${color}`;
  };



  const resolveTeamColor = (manufacturer) => {
    if (manufacturer) {
      // Direct lookup first
      if (PREDEFINED_TEAM_COLORS[manufacturer]) {
        return PREDEFINED_TEAM_COLORS[manufacturer];
      }
      
      // Handle common manufacturer name variations
      const normalizedManufacturer = manufacturer.toString().trim();
      
      // Common team name mappings to handle API variations
      const teamNameMappings = {
        'Red Bull Racing': 'Red Bull',
        'Scuderia Ferrari': 'Ferrari',
        'Mercedes-AMG Petronas': 'Mercedes',
        'Mercedes-AMG': 'Mercedes',
        'McLaren F1 Team': 'McLaren',
        'Aston Martin Aramco': 'Aston Martin',
        'Alpine F1 Team': 'Alpine',
        'Williams Racing': 'Williams',
        'MoneyGram Haas F1': 'Haas',
        'Haas F1 Team': 'Haas',
        'Kick Sauber': 'Sauber',
        'Sauber': 'Sauber',
        'Visa Cash App RB': 'Racing Bulls',
        'RB': 'Racing Bulls',
        'AlphaTauri': 'Racing Bulls',
        'Scuderia AlphaTauri': 'Racing Bulls'
      };
      
      // Try mapped name
      const mappedName = teamNameMappings[normalizedManufacturer];
      if (mappedName && PREDEFINED_TEAM_COLORS[mappedName]) {
        return PREDEFINED_TEAM_COLORS[mappedName];
      }
      
      // Try partial matching for manufacturer names
      for (const [key, color] of Object.entries(PREDEFINED_TEAM_COLORS)) {
        if (normalizedManufacturer.toLowerCase().includes(key.toLowerCase()) || 
            key.toLowerCase().includes(normalizedManufacturer.toLowerCase())) {
          return color;
        }
      }
    }
    
    return '#000000';
  };

  // Function to fetch driver standings (needed to get event log)
  const fetchDriverStandings = async () => {
    try {
      const data = await YearFallbackUtils.fetchWithYearFallback(
        (year) => `https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/${year}/types/2/standings/0`,
        (data) => data.standings && data.standings.length > 0
      );
      return data;
    } catch (error) {
      console.error('Error fetching driver standings:', error);
      return null;
    }
  };

  // Function to fetch athlete data
  const fetchAthleteData = async (athleteRef) => {
    try {
      const response = await fetch(convertToHttps(athleteRef));
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching athlete data:', error);
      return null;
    }
  };

  // Function to fetch event log data (same as race-info.js)
  const fetchEventLogData = async (raceId) => {
    try {
      // Get driver standings
      const standingsData = await fetchDriverStandings();
      if (!standingsData || !standingsData.standings || standingsData.standings.length === 0) {
        return null;
      }

      // Get event log from first driver
      const firstDriverData = await fetchAthleteData(standingsData.standings[0].athlete.$ref);
      
      if (!firstDriverData || !firstDriverData.eventLog?.$ref) {
        return null;
      }

      const eventLogResponse = await fetch(convertToHttps(firstDriverData.eventLog.$ref));
      const eventLogData = await eventLogResponse.json();
      
      return eventLogData;
    } catch (error) {
      console.error('Error fetching event log data:', error);
      return null;
    }
  };

  // Lightweight in-memory athlete cache to avoid repeated fetches
  const athleteCache = {};
  const athleteCacheExpiry = {};
  const ATHLETE_CACHE_MS = 1000 * 60 * 60; // 1 hour

  const fetchAthleteCached = async (athleteRef) => {
    if (!athleteRef) return null;
    const now = Date.now();
    if (athleteCache[athleteRef] && athleteCacheExpiry[athleteRef] > now) return athleteCache[athleteRef];
    try {
      const data = await fetchAthleteData(athleteRef);
      athleteCache[athleteRef] = data;
      athleteCacheExpiry[athleteRef] = now + ATHLETE_CACHE_MS;
      return data;
    } catch (e) {
      return null;
    }
  };

  // Get stints for a given driver number from openF1Data.stints
  const getStintsForDriver = (driverNumber) => {
    console.log('getStintsForDriver called with driverNumber:', driverNumber);
    console.log('openF1Data.stints:', openF1Data.stints);
    if (!driverNumber || !openF1Data || !Array.isArray(openF1Data.stints)) {
      console.log('Early return from getStintsForDriver - missing data');
      return [];
    }
    // openf1 stints use driver_number field
    const filtered = openF1Data.stints.filter(s => Number(s.driver_number) === Number(driverNumber));
    console.log('Filtered stints for driver', driverNumber, ':', filtered);
    return filtered.sort((a,b) => (a.lap_start || 0) - (b.lap_start || 0));
  };

  // Render Tires UI: each stint row shows tire icon and lap range, with arrows between
  const renderTiresForDriver = (driverNumber) => {
    console.log('renderTiresForDriver called with driverNumber:', driverNumber);
    const stints = getStintsForDriver(driverNumber);
    console.log('Got stints for rendering:', stints);
    if (!stints || stints.length === 0) {
      console.log('No stints found, showing debug message');
      // Show debug message instead of null for now
      return (
        <View style={{ marginTop: 8 }}>
          <Text allowFontScaling={false} style={[styles.modalStatLabel, { color: theme.textSecondary, marginBottom: 6 }]}>Tires</Text>
          <Text allowFontScaling={false} style={[styles.modalStatValue, { color: theme.text, fontSize: 12 }]}>
            No stints data (Driver: {driverNumber || 'unknown'})
          </Text>
        </View>
      );
    }

    // Build rows: display each stint as [icon lap_start - lap_end] -> between
    return (
      <View style={{ marginTop: 8 }}>
        <Text allowFontScaling={false} style={[styles.modalStatLabel, { color: theme.textSecondary, marginBottom: 6 }]}>Tires</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap' }}>
          {stints.map((s, idx) => {
            const comp = (s.compound || '').toUpperCase();
            const icon = TIRE_IMAGES[comp] || null;
            const lapStart = s.lap_start != null ? s.lap_start : '-';
            const lapEnd = s.lap_end != null ? s.lap_end : '-';
            return (
              <React.Fragment key={`stint-${idx}`}>
                <View style={{ alignItems: 'center', marginRight: 6 }}>
                  {icon ? (
                    icon.toLowerCase().endsWith('.svg') ? (
                      <SvgUri uri={icon} width={28} height={28} />
                    ) : (
                      <Image source={{ uri: icon }} style={{ width: 28, height: 28 }} />
                    )
                  ) : (
                    <View style={{ width: 28, height: 28, backgroundColor: '#ddd', borderRadius: 14 }} />
                  )}
                  <Text allowFontScaling={false} style={[styles.modalStatValue, { color: theme.text, fontSize: 12, marginTop: 2 }]}>{`${lapStart} - ${lapEnd}`}</Text>
                </View>
                {idx !== stints.length - 1 ? (
                  <View style={{ width: 18, alignItems: 'center', justifyContent: 'center' }}>
                    <Text allowFontScaling={false} style={{ color: theme.textSecondary }}>{'→'}</Text>
                  </View>
                ) : null}
              </React.Fragment>
            );
          })}
        </View>
      </View>
    );
  };

  // Compact inline renderer used as the right-side value for the modal stat row
  const renderTiresInlineForDriver = (driverNumber) => {
    const stints = getStintsForDriver(driverNumber);
    if (!stints || stints.length === 0) return null;
    // Chunk into rows of 5
    const chunkSize = 5;
    const rows = [];
    for (let i = 0; i < stints.length; i += chunkSize) {
      rows.push(stints.slice(i, i + chunkSize));
    }

    return (
      <View style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
        {rows.map((row, rowIdx) => (
          <View key={`stint-row-${rowIdx}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: rowIdx === 0 ? 0 : 6 }}>
            {row.map((s, idx) => {
              const comp = (s.compound || '').toUpperCase();
              const icon = TIRE_IMAGES[comp] || null;
              const lapStart = s.lap_start != null ? s.lap_start : '-';
              const lapEnd = s.lap_end != null ? s.lap_end : '-';
              const globalIdx = rowIdx * chunkSize + idx;
              return (
                <React.Fragment key={`stint-inline-${globalIdx}`}>
                  <View style={{ alignItems: 'center', marginLeft: idx === 0 ? 0 : 8 }}>
                    {icon ? (
                      icon.toLowerCase().endsWith('.svg') ? (
                        <SvgUri uri={icon} width={28} height={28} />
                      ) : (
                        <Image source={{ uri: icon }} style={{ width: 28, height: 28 }} />
                      )
                    ) : (
                      <View style={{ width: 28, height: 28, backgroundColor: '#ddd', borderRadius: 10 }} />
                    )}
                    <Text allowFontScaling={false} style={[styles.modalStatValue, { color: theme.text, fontSize: 11, marginTop: 2 }]}>{`${lapStart} - ${lapEnd}`}</Text>
                  </View>
                  {idx !== row.length - 1 ? (
                    <View style={{ width: 18, alignItems: 'center', justifyContent: 'center' }}>
                      <Text allowFontScaling={false} style={{ color: theme.textSecondary, fontSize: 12, marginLeft: 8, marginBottom: 8 }}>{'→'}</Text>
                    </View>
                  ) : null}
                </React.Fragment>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  // Fetch per-competitor statistics JSON (returns parsed stats object)
  const fetchDriverStats = async (competitor) => {
    if (!competitor) return null;
    try {
      // competitor.raw may have statistics.$ref or the statistics endpoint can be constructed
      let statRef = competitor.raw?.statistics?.$ref || competitor.raw?.statistics?.href || null;
      if (!statRef && competitor.raw && competitor.id && competitionResults[selectedCompetitionId] && competitionResults[selectedCompetitionId].raw) {
        const base = ('' + competitionResults[selectedCompetitionId].raw.$ref).split('?')[0].replace(/\/$/, '');
        statRef = `${base}/competitors/${competitor.id}/statistics?lang=en&region=us`;
      }
      if (!statRef) return null;
      const resp = await fetch(convertToHttps(statRef));
      if (!resp || !resp.ok) return null;
      const j = await resp.json();
      return j;
    } catch (e) {
      return null;
    }
  };

  // Helper: format milliseconds to mm:ss.mmm or h:mm:ss if large
  const formatMs = (ms) => {
    if (ms == null) return null;
    const m = Number(ms);
    if (isNaN(m)) return String(ms);
    const sign = m < 0 ? '-' : '';
    const abs = Math.abs(m);
    const hours = Math.floor(abs / 3600000);
    const minutes = Math.floor((abs % 3600000) / 60000);
    const seconds = Math.floor((abs % 60000) / 1000);
    const millis = Math.floor(abs % 1000);
    const pad = (v, l = 2) => String(v).padStart(l, '0');
    if (hours > 0) return `${sign}${hours}:${pad(minutes)}:${pad(seconds)}.${String(millis).padStart(3,'0')}`;
    return `${sign}${minutes}:${pad(seconds)}.${String(millis).padStart(3,'0')}`;
  };

  // Fetch competition results for the eventData competitions (optimized)
  const fetchCompetitionResultsForEvent = async (eventData) => {
    if (!eventData || !Array.isArray(eventData.competitions)) return { results: {}, order: [] };

    const results = {};
    const order = [];

    // Process competitions in parallel but record order serially
    await Promise.all(eventData.competitions.map(async (comp) => {
      try {
        const compId = comp.id || (comp.$ref && comp.$ref.split('/').pop());
        const compType = comp.type || {};
        const compName = compType.displayName || compType.text || compType.abbreviation || compType.name || 'Competition';

        order.push(compId);

        const competitors = Array.isArray(comp.competitors) ? comp.competitors : [];

        const competitorPromises = competitors.map(async (c) => {
          const athleteRef = c.athlete && c.athlete.$ref ? c.athlete.$ref : null;
          let athleteData = null;
          if (athleteRef) athleteData = await fetchAthleteCached(athleteRef);

          const name = athleteData?.displayName || athleteData?.shortName || c.athlete?.displayName || c.athlete?.shortName || '';
          const id = c.id || c.uid || (athleteRef ? athleteRef.split('/').pop() : null);
          const manufacturer = c.vehicle?.manufacturer || c.team?.displayName || '';
          const teamColor = resolveTeamColor(manufacturer);
          
          // Debug logging to help identify manufacturer name mismatches
          if (manufacturer && teamColor === '#000000') {
            console.log('No team color found for manufacturer:', manufacturer, 'for driver:', name);
          }
          const winner = c.winner === true;
          const orderPos = c.rank || c.order || null;
          const startOrderPos = c.startOrder ?? c.startPosition ?? null;

          // Try to get timing and laps from embedded fields
          let totalTime = null;
          let laps = null;
          if (c.result) {
            if (c.result.time) totalTime = c.result.time.displayValue || c.result.time.text || (c.result.time.value ? String(c.result.time.value) : null);
            if (c.result.laps != null) laps = c.result.laps;
          }
          if (Array.isArray(c.statistics) && (!totalTime || !laps)) {
            for (const s of c.statistics) {
              const key = (s.name || s.displayName || '').toString().toLowerCase();
              const val = s.value ?? s.displayValue ?? s.text ?? s.rank ?? null;
              if (!totalTime && key.includes('time')) totalTime = val;
              if (!laps && (key.includes('lapsCompleted'))) laps = val;
            }
          }

          return {
            id,
            name,
            manufacturer,
            teamColor,
            winner,
            order: orderPos,
            startOrder: startOrderPos,
            totalTime,
            laps,
            statistics: c.statistics, // Preserve statistics array with $ref for live updates
            raw: c
          };
        });

        let resolved = await Promise.all(competitorPromises);

        // If some competitors lack timing/lap/qual data, fetch competitor-level statistics endpoints in parallel
        const needIndexes = resolved.map((r, i) => (!r.totalTime && !r.laps && !r.qual1 && !r.qual2 && !r.qual3) ? i : -1).filter(i => i >= 0);
        if (needIndexes.length > 0) {
          // base competition url without query string
          const baseComp = comp.$ref ? ('' + comp.$ref).split('?')[0] : null;

          const statFetches = needIndexes.map(async (idx) => {
            const r = resolved[idx];
            // try explicit stat ref on the competitor
            let statRef = r.raw?.statistics?.$ref || r.raw?.statistics?.href || null;
            if (!statRef && baseComp && r.id) {
              statRef = `${baseComp}/competitors/${r.id}/statistics?lang=en&region=us`;
            }
            if (!statRef) return null;
            try {
              const resp = await fetch(convertToHttps(statRef));
              if (!resp || !resp.ok) return null;
              const statsJson = await resp.json();
              // parse statsJson for totalTime, laps, qual times, behindTime
              const parsed = { totalTime: null, laps: null, qual1: null, qual2: null, qual3: null, behindTime: null, fastestLap: null, behindLaps: null };
              const splits = statsJson?.splits;
                    if (splits && Array.isArray(splits.categories)) {
                for (const cat of splits.categories) {
                  if (!cat || !Array.isArray(cat.stats)) continue;
                  for (const s of cat.stats) {
                    const key = (s.name || s.displayName || s.abbreviation || '').toString().toLowerCase();
                    const val = s.displayValue ?? s.value ?? s.text ?? s.rank ?? null;
                    if (!parsed.laps && key.includes('lapscompleted')) parsed.laps = val;
                    if (!parsed.totalTime && (key.includes('totaltime') || key.includes('total race time') || key.includes('total_time') || key.includes('total'))) parsed.totalTime = val;
                    if (!parsed.qual1 && (key.includes('qual1') || key.includes('q1') || key.includes('qual1timems') || key.includes('qual1time'))) parsed.qual1 = val;
                    if (!parsed.qual2 && (key.includes('qual2') || key.includes('q2') || key.includes('qual2timems') || key.includes('qual2time'))) parsed.qual2 = val;
                    if (!parsed.qual3 && (key.includes('qual3') || key.includes('q3') || key.includes('qual3timems') || key.includes('qual3time'))) parsed.qual3 = val;
                          if (!parsed.behindTime && key.includes('behind') && !key.includes('behindlaps')) parsed.behindTime = val;
                          // behindLaps is provided as a separate stat in some feeds (e.g., behindLaps or LH)
                          if (!parsed.behindLaps && (key.includes('behindlaps') || key === 'behindlaps')) parsed.behindLaps = val;
                          // place may be provided in the competitor statistics and should be used as the authoritative order
                          if (!parsed.place && key.includes('place') && key !== 'pitsplace') parsed.place = val;
                    // also check abbreviation matches
                    const ab = (s.abbreviation || '').toString().toLowerCase();
                    if (!parsed.totalTime && (ab === 'tot' || ab === 'totaltime')) parsed.totalTime = val;
                    if (!parsed.laps && (ab === 'lc' || ab === 'laps')) parsed.laps = val;
                          if (!parsed.behindLaps && (ab === 'lh' || ab === 'behindlaps')) parsed.behindLaps = val;
                          if (!parsed.place && (ab === 'p' || ab === 'place')) parsed.place = val;
                    if (!parsed.fastestLap && (ab === 'fl' || ab === 'flt')) parsed.fastestLap = val;
                  }
                }
              }

              // fallback: if statsJson has direct fields
              if (!parsed.totalTime && statsJson?.totalTime) parsed.totalTime = statsJson.totalTime.displayValue ?? statsJson.totalTime;
              if (!parsed.laps && statsJson?.lapsCompleted) parsed.laps = statsJson.lapsCompleted.displayValue ?? statsJson.lapsCompleted;

              // normalize times: prefer display string, else convert ms numbers
              const normalizeTime = (v) => {
                if (v == null) return null;
                if (typeof v === 'string') return v;
                if (typeof v === 'number') return formatMs(v);
                return String(v);
              };

              r.totalTime = normalizeTime(parsed.totalTime);
              r.laps = parsed.laps != null ? parsed.laps : r.laps;
              r.qual1 = normalizeTime(parsed.qual1);
              r.qual2 = normalizeTime(parsed.qual2);
              r.qual3 = normalizeTime(parsed.qual3);
              r.behindTime = normalizeTime(parsed.behindTime);
              r.fastestLap = normalizeTime(parsed.fastestLap);
              r.behindLaps = normalizeTime(parsed.behindLaps);
              // assign behindLaps and place if available
              if (parsed.behindLaps != null) r.behindLaps = parsed.behindLaps;
              if (parsed.place != null) r.order = parsed.place;
            } catch (e) {
              // ignore per-competitor stat fetch errors
            }
            return null;
          });

          try {
            await Promise.all(statFetches);
          } catch (pf) { /* ignore */ }
        }

        results[compId] = {
          id: compId,
          name: compName,
          type: compType,
          competitors: resolved,
          raw: comp
        };
      } catch (e) {
        // ignore per-competition errors
      }
    }));

    return { results, order };
  };

  // OpenF1 API functions
  const fetchOpenF1Meetings = async (year = new Date().getFullYear()) => {
    try {
      const response = await fetch(`https://timestampedforf1.jeffreyjpz.com/api/v1/meetings?year=${year}`);
      if (!response.ok) throw new Error(`Failed to fetch meetings: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching OpenF1 meetings:', error);
      return [];
    }
  };

  const fetchOpenF1Sessions = async (meetingKey) => {
    try {
      const response = await fetch(`https://timestampedforf1.jeffreyjpz.com/api/v1/sessions?meeting_key=${meetingKey}`);
      if (!response.ok) throw new Error(`Failed to fetch sessions: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching OpenF1 sessions:', error);
      return [];
    }
  };

  const fetchOpenF1Drivers = async (sessionKey) => {
    try {
      const response = await fetch(`https://timestampedforf1.jeffreyjpz.com/api/v1/drivers?session_key=${sessionKey}`);
      if (!response.ok) throw new Error(`Failed to fetch drivers: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching OpenF1 drivers:', error);
      return [];
    }
  };

  const fetchOpenF1Events = async (sessionKey) => {
    try {
      const response = await fetch(`https://timestampedforf1.jeffreyjpz.com/api/v1/events?session_key=${sessionKey}`);
      if (!response.ok) {
        // Check if it's a temporary unavailability (during live session)
        if (response.status === 403 || response.status === 429) {
          throw new Error('Events data not yet ready - API access is restricted during live sessions');
        }
        throw new Error(`Failed to fetch events: ${response.status}`);
      }
      const events = await response.json();
      // Sort events by date (newest first, which means bottom first for display)
      return events.sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (error) {
      console.error('Error fetching OpenF1 events:', error);
      throw error; // Re-throw to handle UI state
    }
  };

  const fetchOpenF1Stints = async (sessionKey) => {
    try {
      console.log('Fetching stints for session key:', sessionKey);
      const response = await fetch(`https://api.openf1.org/v1/stints?session_key=${sessionKey}`);
      if (!response.ok) throw new Error(`Failed to fetch stints: ${response.status}`);
      const stints = await response.json();
      console.log('Fetched stints:', stints);
      return stints;
    } catch (error) {
      console.error('Error fetching OpenF1 stints:', error);
      return [];
    }
  };

  const matchRaceWithOpenF1Meeting = async (raceName, raceDate) => {
    try {
      const meetings = await fetchOpenF1Meetings();
      if (!meetings || meetings.length === 0) return null;

      // Try to match by name similarity and date proximity
      const targetDate = new Date(raceDate);
      let bestMatch = null;
      let bestScore = 0;

      for (const meeting of meetings) {
        const meetingDate = new Date(meeting.date_start);
        const daysDiff = Math.abs((targetDate - meetingDate) / (1000 * 60 * 60 * 24));
        
        // Only consider meetings within 7 days
        if (daysDiff > 7) continue;

        // Score based on name similarity and date proximity
        const nameScore = raceName.toLowerCase().includes(meeting.meeting_name.toLowerCase().split(' ')[0]) ? 1 : 0;
        const locationScore = raceName.toLowerCase().includes(meeting.location.toLowerCase()) ? 1 : 0;
        const dateScore = Math.max(0, 1 - (daysDiff / 7)); // Higher score for closer dates
        
        const totalScore = nameScore * 2 + locationScore * 2 + dateScore;
        
        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestMatch = meeting;
        }
      }

      return bestMatch;
    } catch (error) {
      console.error('Error matching race with OpenF1 meeting:', error);
      return null;
    }
  };

  const loadOpenF1Data = async () => {
    try {
      if (!raceName || !raceDate) return;

      const meeting = await matchRaceWithOpenF1Meeting(raceName, raceDate);
      if (!meeting) {
        console.log('No matching OpenF1 meeting found for race:', raceName);
        return;
      }

      const sessions = await fetchOpenF1Sessions(meeting.meeting_key);
      const raceSession = sessions.find(s => s.session_name === 'Race');
      
      setOpenF1Data(prev => ({
        ...prev,
        meetingKey: meeting.meeting_key,
        sessions: sessions,
        selectedSessionKey: raceSession?.session_key || sessions[0]?.session_key || null
      }));

    } catch (error) {
      console.error('Error loading OpenF1 data:', error);
      setOpenF1Data(prev => ({
        ...prev,
        eventsError: 'Failed to load OpenF1 data'
      }));
    }
  };

  const loadEventsForSession = async (sessionKey) => {
    if (!sessionKey) return;

    setOpenF1Data(prev => ({
      ...prev,
      eventsLoading: true,
      eventsError: null
    }));

    try {
      const [events, drivers, stints] = await Promise.all([
        fetchOpenF1Events(sessionKey),
        fetchOpenF1Drivers(sessionKey),
        fetchOpenF1Stints(sessionKey)
      ]);

      // Create a driver lookup map
      const driverMap = {};
      drivers.forEach(driver => {
        driverMap[driver.driver_number] = driver;
      });

      setOpenF1Data(prev => ({
        ...prev,
        events: events,
        drivers: driverMap,
        stints: Array.isArray(stints) ? stints : [],
        eventsLoading: false,
        eventsError: null
      }));

    } catch (error) {
      setOpenF1Data(prev => ({
        ...prev,
        events: [],
        drivers: {},
        eventsLoading: false,
        eventsError: error.message
      }));
    }
  };

  // Stream modal functions
  const openStreamModal = async () => {
    console.log('Header clicked! Opening stream modal...');
    
    if (!isStreamingAvailable()) {
      console.log('Stream not available, showing alert');
      Alert.alert('Stream Unavailable', 'Streaming is only available during the race weekend (Oct 3-5, 2025 EST).');
      return;
    }

    console.log('Stream available, opening modal');
    setStreamModalVisible(true);
    setIsStreamLoading(true);
    
    // Simulate loading time for stream
    setTimeout(() => {
      setIsStreamLoading(false);
    }, 2000);
  };

  const closeStreamModal = () => {
    setStreamModalVisible(false);
    setIsStreamLoading(true);
  };

  const fetchRaceWinner = async (eventData) => {
    try {
      // Look for the Race competition in the competitions array
      const raceCompetition = eventData.competitions?.find(comp => 
        comp.type?.name?.toLowerCase().includes('race') || 
        comp.type?.displayName?.toLowerCase().includes('race') ||
        comp.type?.abbreviation?.toLowerCase().includes('race')
      );
      
      if (raceCompetition && raceCompetition.competitors) {
        // Find the winner (winner: true)
        const winnerCompetitor = raceCompetition.competitors.find(c => c.winner === true);
        
        if (winnerCompetitor && winnerCompetitor.athlete?.$ref) {
          // Get driver info
          const athleteData = await fetchAthleteData(winnerCompetitor.athlete.$ref);
          if (athleteData) {
            return {
              name: athleteData.shortName || athleteData.displayName || athleteData.fullName || 'Unknown',
              lastName: athleteData.lastName || athleteData.shortName || 'Unknown',
              headshot: buildESPNHeadshotUrl(athleteData.id),
              team: winnerCompetitor.vehicle?.manufacturer || 'Unknown Team'
            };
          }
        }
      }
      return null;
    } catch (error) {
      console.error('Error fetching race winner:', error);
      return null;
    }
  };

  const fetchRaceDetails = async () => {
    try {
      setLoading(true);
      let eventData = null;

      // If eventId was passed, fetch the event directly from ESPN v2 events endpoint
      if (eventId) {
        try {
          const eventUrl = `https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/events/${eventId}?lang=en&region=us`;
          const evResp = await fetch(convertToHttps(eventUrl));
          if (evResp && evResp.ok) {
            eventData = await evResp.json();
          }
        } catch (e) {
          console.warn('Direct event fetch failed, falling back to event log approach', e);
        }
      }

      // Fallback: use existing event log method if direct fetch didn't work
      if (!eventData) {
        // Get event log data using the same approach as race-info.js
        const eventLogData = await fetchEventLogData(raceId);
        if (!eventLogData) {
          throw new Error("No event log found");
        }

        // Find the specific race by competition ID
        const raceEvent = eventLogData.events?.items?.find(event => 
          event.competitionId === raceId
        );

        if (!raceEvent) {
          throw new Error("Race not found in event log");
        }

        // Get event details
        const eventResponse = await fetch(convertToHttps(raceEvent.event.$ref));
        eventData = await eventResponse.json();
      }
      
      setRaceData(eventData);
      
      // Fetch venue, circuit, and race winner data in parallel
      const parallelFetches = [];
      
      // Add venue fetch if venues exist
      if (eventData.venues && eventData.venues.length > 0) {
        parallelFetches.push(
          fetch(convertToHttps(eventData.venues[0].$ref))
            .then(response => response.json())
            .then(venueData => ({ type: 'venue', data: venueData }))
            .catch(error => {
              console.error('Error fetching venue data:', error);
              return null;
            })
        );
      }
      
      // Add circuit fetch if circuit exists
      const circuitRef = eventData.circuit?.$ref || eventData.circuit;
      if (circuitRef && typeof circuitRef === 'string') {
        parallelFetches.push(
          fetch(convertToHttps(circuitRef))
            .then(response => response.json())
            .then(circuitData => ({ type: 'circuit', data: circuitData }))
            .catch(error => {
              console.error('Error fetching circuit data:', error);
              return null;
            })
        );
      }
      
      // Add race winner fetch
      parallelFetches.push(
        fetchRaceWinner(eventData)
          .then(winner => ({ type: 'winner', data: winner }))
          .catch(error => {
            console.error('Error fetching race winner:', error);
            return null;
          })
      );
      
      // Execute all fetches in parallel
      const results = await Promise.all(parallelFetches);
      
      // Process results
      let venueData = null;
      let circuitData = null;
      let winner = null;
      
      results.forEach(result => {
        if (!result) return;
        
        switch (result.type) {
          case 'venue':
            venueData = result.data;
            break;
          case 'circuit':
            circuitData = result.data;
            break;
          case 'winner':
            winner = result.data;
            break;
        }
      });
      
      // Process venue data
      if (venueData) {
        setCircuitInfo({
          name: venueData.fullName || 'Unknown Circuit',
          city: venueData.address?.city || '',
          country: venueData.address?.country || '',
          countryFlag: venueData.countryFlag?.href || ''
        });
      }
      
      // Process circuit data
      if (circuitData) {
        const mapHref = getCircuitMapHref(circuitData.diagrams, isDarkMode);
        const circuitFields = {
          type: circuitData.type || circuitData.type?.text || '',
          length: circuitData.length || '',
          distance: circuitData.distance || '',
          laps: circuitData.laps || '',
          turns: circuitData.turns || '',
          direction: circuitData.direction || '',
          established: circuitData.established || '',
          fastestLapTime: circuitData.fastestLapTime || '',
          fastestLapYear: circuitData.fastestLapYear || ''
        };

        if (mapHref) {
          circuitFields.mapHref = mapHref;
        }

        // Fetch fastest lap driver if available
        const fastestRef = circuitData.fastestLapDriver?.$ref || circuitData.fastestLapDriver;
        if (fastestRef && typeof fastestRef === 'string') {
          try {
            const athlete = await fetchAthleteData(fastestRef);
            if (athlete) {
              circuitFields.fastestDriverName = athlete.displayName || athlete.shortName || athlete.fullName || '';
            }
          } catch (fdErr) {
            // ignore fastest driver fetch errors
          }
        }

        setCircuitInfo(prev => ({ ...(prev || {}), ...circuitFields }));
      }
      
      // Process race winner
      if (winner) {
        setWinnerDriver(winner);
      }      // Determine current/next competition label, but only when the event is in-progress
      try {
  const nowMs = Date.now();
  const startMs = Date.parse(eventData.date || '');
  const endMs = Date.parse(eventData.endDate || eventData.end || eventData.date || '') || 0;
  // Base completion by end time (don't add an arbitrary +24h here)
  const isCompletedByTime = endMs ? nowMs > endMs : false;
  const isUpcoming = startMs ? nowMs < startMs : false;
  // We'll also inspect competition status objects for an authoritative 'final'/'post' state
  let anyCompetitionFinal = false;

        if (isInProgress) {
          const comps = eventData.competitions || [];
          let chosen = null;
          let chosenMs = null;

          for (const comp of comps) {
            try {
              const compData = comp.$ref ? await (await fetch(convertToHttps(comp.$ref))).json() : comp;
              const compType = compData?.type || comp.type || {};
              const compLabel = compType.text || compType.displayName || compType.abbreviation || compType.name || null;
              const statusRef = compData?.status?.$ref || comp.status?.$ref || compData?.status;
              let statusData = null;
              if (typeof statusRef === 'string') {
                try {
                  statusData = await (await fetch(convertToHttps(statusRef))).json();
                } catch (se) {
                  statusData = null;
                }
              } else if (statusRef && typeof statusRef === 'object') {
                statusData = statusRef;
              }

                // Prefer active/in-progress competitions
                const isActive = statusData && (statusData.type?.state === 'in' || statusData.type?.state === 'active' || (statusData.type?.name && statusData.type?.name.toString().toLowerCase().includes('in')));
                const isScheduled = statusData && (statusData.type?.state === 'pre' || (statusData.type?.name && statusData.type?.name.toString().toLowerCase().includes('scheduled')));
                const isFinal = statusData && (statusData.type?.state === 'post' || (statusData.type?.name && statusData.type?.name.toString().toLowerCase().includes('final')) || (statusData.type?.name && statusData.type?.name.toString().toLowerCase().includes('status_final')));
                if (isFinal) anyCompetitionFinal = true;

              const compStartMs = Date.parse(compData?.date || comp.date || '');

              if (isActive) {
                chosen = compLabel || compType.displayName || compType.name;
                break;
              }

              if (isScheduled && compStartMs) {
                if (!chosenMs || compStartMs < chosenMs) {
                  chosen = compLabel || compType.displayName || compType.name;
                  chosenMs = compStartMs;
                }
              }
            } catch (innerErr) {
              // ignore and continue
            }
          }

            // Determine in-progress: either by time window (between start and end) or by active competition status
            const isInProgress = (!isUpcoming && !isCompletedByTime) || !!chosen;

            // Don't show a nextCompetitionLabel for events that are clearly completed
            if (isInProgress && chosen) {
              setNextCompetitionLabel(passedNextCompetitionType || chosen);
            } else {
              setNextCompetitionLabel(null);
            }
        } else {
          // ensure label is cleared for non in-progress events
          setNextCompetitionLabel(null);
        }
      } catch (ncErr) {
        // ignore
      }
      
    } catch (error) {
      console.error('Error fetching race details:', error);
      Alert.alert('Error', 'Failed to fetch race details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetchRaceDetails();
  }, [raceId]);

  // Live race functionality
  const checkIfRaceIsLive = () => {
    if (!raceData || !raceData.competitions) return false;

    // Primary check: if we have race status, use it as the authoritative source
    if (raceStatus && raceStatus.type) {
      const statusState = raceStatus.type.state;
      const completed = raceStatus.type.completed;
      
      // If explicitly completed, not live
      if (completed === true) {
        console.log('[checkIfRaceIsLive] Not live - session completed:', completed);
        return false;
      }
      
      // If state is post/final, not live
      if (statusState === 'post' || statusState === 'final') {
        console.log('[checkIfRaceIsLive] Not live - state:', statusState);
        return false;
      }
      
      // If status state indicates active/in-progress, it's live
      const isLiveByStatus = statusState === 'in' || statusState === 'active';
      
      if (isLiveByStatus) {
        console.log('[checkIfRaceIsLive] Live by status - state:', statusState, 'completed:', completed);
        return true;
      }
    }

    // Secondary check: if we have a selected competition, check its specific status
    if (selectedCompetitionId && competitionResults[selectedCompetitionId]) {
      const competition = competitionResults[selectedCompetitionId];
      if (competition.status?.type) {
        const statusState = competition.status.type.state;
        const completed = competition.status.type.completed;
        
        if (completed === true || statusState === 'post' || statusState === 'final') {
          console.log('[checkIfRaceIsLive] Not live - selected competition completed:', statusState);
          return false;
        }
        
        if (statusState === 'in' || statusState === 'active') {
          console.log('[checkIfRaceIsLive] Live - selected competition active:', statusState);
          return true;
        }
      }
    }

    // Fallback: Use time-based check if no status available or status is inconclusive
    // But be more strict - only consider live if we have evidence it's not completed
    const now = new Date();
    
    for (const competition of raceData.competitions) {
      const compStart = new Date(competition.date);
      const compEnd = competition.endDate ? new Date(competition.endDate) : new Date(compStart.getTime() + 3 * 60 * 60 * 1000); // Default 3 hours if no end time
      
      if (now >= compStart && now <= compEnd) {
        // Check if this competition has results indicating it's completed
        const compId = competition.id || (competition.$ref && competition.$ref.split('/').pop());
        const compResults = competitionResults[compId];
        const hasResults = compResults?.competitors?.some(c => c.winner || c.order) || false;
        
        if (hasResults) {
          console.log('[checkIfRaceIsLive] Not live - competition has results despite time window:', compId);
          continue; // Skip this competition, it's completed
        }
        
        setCurrentLiveSession(competition);
        console.log('[checkIfRaceIsLive] Live by time window (fallback) - no results found');
        return true;
      }
    }
    
    console.log('[checkIfRaceIsLive] Not live - no active sessions found');
    return false;
  };

  const findNextScheduledSession = () => {
    if (!raceData || !raceData.competitions) return null;

    const now = new Date();
    let nextSession = null;
    let earliestTime = null;

    for (const competition of raceData.competitions) {
      const compStart = new Date(competition.date);
      
      if (compStart > now) {
        if (!earliestTime || compStart < earliestTime) {
          earliestTime = compStart;
          nextSession = competition;
        }
      }
    }

    return nextSession;
  };

  const updateLiveRaceStatus = async () => {
    const isLive = checkIfRaceIsLive();
    setIsLiveRace(isLive);

    // Use refs to get current values
    const currentTab = selectedTabRef.current;
    const currentCompetitionId = selectedCompetitionIdRef.current;
    const currentCompetitionResults = competitionResultsRef.current;

    console.log('[updateLiveRaceStatus]', {
      isLive,
      selectedTab: currentTab,
      selectedCompetitionId: currentCompetitionId,
      hasCompetitionResults: !!currentCompetitionResults[currentCompetitionId]
    });

    if (!isLive) {
      const nextSession = findNextScheduledSession();
      setNextScheduledSession(nextSession);
      return;
    }

    // Update competitor statistics and status when live and on Results or Grid tab
    if (isLive && (currentTab === 'RESULTS' || currentTab === 'GRID') && currentCompetitionId) {
      try {
        const selectedComp = currentCompetitionResults[currentCompetitionId];
        if (!selectedComp || !selectedComp.competitors) {
          return;
        }

        console.log('[updateLiveRaceStatus] Updating', selectedComp.competitors.length, 'competitors with live stats');

        // First, update the competition status to check if still live
        if (selectedComp.status && selectedComp.status.$ref) {
          try {
            // Use occasional cache-busting to avoid CORS preflight issues
            const statusUrl = selectedComp.status.$ref + (Math.random() > 0.7 ? (selectedComp.status.$ref.includes('?') ? '&' : '?') + '_=' + Date.now() : '');
            const statusResponse = await fetch(convertToHttps(statusUrl));
            const statusData = await statusResponse.json();
            setRaceStatus(statusData);
            console.log('[updateLiveRaceStatus] Updated race status:', statusData.type?.name);
            
            // Check if session has ended - if so, stop live updates
            const statusState = statusData.type?.state;
            const completed = statusData.type?.completed;
            
            // Session is complete if explicitly marked as completed OR state is post/final
            const isComplete = completed === true || statusState === 'post' || statusState === 'final';
            
            if (isComplete) {
              console.log('[updateLiveRaceStatus] Session complete, stopping live updates - state:', statusState, 'completed:', completed);
              stopLiveUpdates();
              setIsLiveRace(false);
              return;
            }
          } catch (statusError) {
            console.error('Error updating race status:', statusError);
          }
        }

        // Update statistics for each competitor
        const updatedCompetitors = await Promise.all(
          selectedComp.competitors.map(async (competitor, index) => {
            try {
              if (competitor.statistics && competitor.statistics.$ref) {
                // Append /0 to get the detailed split statistics
                // Use minimal cache-busting to avoid CORS preflight issues
                const statsRef = competitor.statistics.$ref + '/0' + (Math.random() > 0.5 ? '?_=' + Date.now() : '');
                const response = await fetch(convertToHttps(statsRef));
                const statsData = await response.json();
                
                const updatedCompetitor = {
                  ...competitor,
                  liveStats: statsData
                };
                
                // Successfully updated with live stats
                return updatedCompetitor;
              }
              return competitor;
            } catch (error) {
              console.error('Error updating competitor stats:', error);
              return competitor;
            }
          })
        );

        const competitorsWithLiveStats = updatedCompetitors.filter(c => !!c.liveStats).length;
        console.log(`[updateLiveRaceStatus] Updating state: ${competitorsWithLiveStats}/${updatedCompetitors.length} competitors have live stats`);

        // Update only the selected competition with new competitor data
        setCompetitionResults(prev => ({
          ...prev,
          [currentCompetitionId]: {
            ...prev[currentCompetitionId],
            competitors: updatedCompetitors
          }
        }));
      } catch (error) {
        console.error('Error updating live race data:', error);
      }
    }
  };

  const startLiveUpdates = () => {
    if (liveUpdateInterval) return; // Already running

    console.log('[startLiveUpdates] Starting live updates every 5 seconds');
    const interval = setInterval(() => {
      updateLiveRaceStatus();
    }, 5000); // Update every 5 seconds

    setLiveUpdateInterval(interval);
  };

  const stopLiveUpdates = () => {
    if (liveUpdateInterval) {
      console.log('[stopLiveUpdates] Stopping live updates');
      clearInterval(liveUpdateInterval);
      setLiveUpdateInterval(null);
    }
  };

  // Check for live status on component mount and data changes
  useEffect(() => {
    if (raceData) {
      console.log('[useEffect] Checking live status - raceData exists, selectedCompetitionId:', selectedCompetitionId);
      updateLiveRaceStatus();
      
      const isLive = checkIfRaceIsLive();
      console.log('[useEffect] checkIfRaceIsLive result:', isLive);
      
      if (isLive) {
        startLiveUpdates();
      } else {
        stopLiveUpdates();
      }
    }

    // Cleanup on unmount
    return () => {
      stopLiveUpdates();
    };
  }, [raceData, selectedCompetitionId]);

  // Separate effect to handle immediate update when switching to Results/Grid tabs
  useEffect(() => {
    if (raceData && checkIfRaceIsLive() && (selectedTab === 'RESULTS' || selectedTab === 'GRID')) {
      console.log('[useEffect] Tab switched to', selectedTab, '- triggering immediate update');
      updateLiveRaceStatus();
    }
  }, [selectedTab]);

  const formatRaceDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  const RaceDetailsHeader = () => {
    // Get current competition type for display
    const getCurrentCompetitionType = () => {
      if (selectedCompetitionId && competitionResults[selectedCompetitionId]) {
        const comp = competitionResults[selectedCompetitionId];
        return comp.type?.displayName || comp.type?.name || comp.name || '';
      }
      return '';
    };

    const currentCompType = getCurrentCompetitionType();
    
    // Get selected competition data for header display
    const selectedCompetition = selectedCompetitionId && competitionResults[selectedCompetitionId] 
      ? competitionResults[selectedCompetitionId] 
      : null;
    
    // Find corresponding original competition data for date/status
    const selectedOriginalComp = selectedCompetition && raceData?.competitions?.find(comp => {
      const compId = comp.id || (comp.$ref && comp.$ref.split('/').pop());
      return compId === selectedCompetitionId;
    });
    
    // Determine color based on selected competition status, not global live status
    let compTypeColor = theme.textSecondary;
    if (selectedCompetition && selectedOriginalComp) {
      const compDate = selectedOriginalComp.date ? new Date(selectedOriginalComp.date) : null;
      const endDate = selectedOriginalComp.endDate ? new Date(selectedOriginalComp.endDate) : 
                     (compDate ? new Date(compDate.getTime() + 3 * 60 * 60 * 1000) : null);
      const now = new Date();
      
      // Check if session is completed (either by time or by having results)
      const hasResults = selectedCompetition.competitors?.some(c => c.winner || c.order) || false;
      const isTimeCompleted = endDate && now > endDate;
      const isCompleted = hasResults || isTimeCompleted;
      
      const isSelectedLive = !isCompleted && compDate && endDate && now >= compDate && now <= endDate;
      const isSelectedUpcoming = !isCompleted && compDate && now < compDate;
      
      if (isCompleted) {
        compTypeColor = theme.success; // Green for completed
      } else if (isSelectedLive) {
        compTypeColor = theme.error; // Red for live
      } else if (isSelectedUpcoming) {
        compTypeColor = theme.warning; // Yellow for upcoming
      }
    }

    const compNum = selectedCompetition?.type?.abbreviation === 'FP1' ? '1' :
                    selectedCompetition?.type?.abbreviation === 'FP2' ? '2' :
                    selectedCompetition?.type?.abbreviation === 'FP3' ? '3' : '';

    return (
      <View style={styles.headerContainer}>
        
        <TouchableOpacity 
          style={[styles.headerCard, { 
            backgroundColor: theme.surface, 
            borderColor: 'transparent',
            opacity: isStreamingAvailable() ? 1 : 0.8
          }]}
          onPress={openStreamModal}
          activeOpacity={isStreamingAvailable() ? 0.7 : 1}
          disabled={!isStreamingAvailable()}
        >
          <View style={styles.headerCardContent}>
          <View style={styles.headerCardLeft}>
            <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
              {raceName || 'F1 Race'}
            </Text>

            {selectedCompetition && selectedOriginalComp ? (
              <View>
                <Text allowFontScaling={false} style={[styles.headerMeta, { color: theme.textSecondary, fontSize: 12 }]}>
                  {formatRaceDate(selectedOriginalComp.date)}
                </Text>
              </View>
            ) : raceDate ? (
              <Text allowFontScaling={false} style={[styles.headerMeta, { color: theme.textSecondary }]}>
                {formatRaceDate(raceDate)}
              </Text>
            ) : (
              <Text allowFontScaling={false} style={[styles.headerMeta, { color: theme.textSecondary }]}>TBD</Text>
            )}

            {circuitInfo && (
              <View style={styles.headerCardBottom}>
                <View style={styles.headerCircuitRow}>
                  {circuitInfo.countryFlag ? (
                    <Image
                      source={{ uri: convertToHttps(circuitInfo.countryFlag) }}
                      style={styles.headerCountryFlag}
                    />
                  ) : null}
                  <Text allowFontScaling={false} style={[styles.circuitName, { color: theme.text }]} numberOfLines={1}>
                    {circuitInfo.name}
                  </Text>
                </View>
                <Text allowFontScaling={false} style={[styles.circuitLocation, { color: theme.textSecondary }]} numberOfLines={1}>
                  {circuitInfo.city}{circuitInfo.city && circuitInfo.country ? ', ' : ''}{circuitInfo.country}
                </Text>
              </View>
            )}
          </View>

          {winnerDriver && (
            <View style={styles.headerCardRight}>
              <View style={styles.winnerContainer}>
                {winnerDriver.headshot ? (
                  <Image
                    source={{ uri: winnerDriver.headshot }}
                    style={styles.winnerImage}
                  />
                ) : (
                  <View style={[styles.winnerImagePlaceholder, { backgroundColor: colors.primary }]}>
                    <Text allowFontScaling={false} style={styles.winnerInitials}>
                      {(winnerDriver.firstName?.[0] || '') + (winnerDriver.lastName?.[0] || '')}
                    </Text>
                  </View>
                )}
                <Text allowFontScaling={false} style={[styles.winnerName, { color: theme.text }]} numberOfLines={1}>
                  {winnerDriver.lastName || winnerDriver.name}
                </Text>
                <Text allowFontScaling={false} style={[styles.winnerLabel, { color: theme.textSecondary }]}>
                  WINNER
                </Text>
              </View>
            </View>
          )}
          {/* Show next/current competition label on the right of circuit info when available */}
          {nextCompetitionLabel ? (
            <View style={styles.nextCompContainer}>
              <Text allowFontScaling={false} style={[styles.nextCompText, { color: compTypeColor }]} numberOfLines={1}>
                {currentCompType} {compNum}
              </Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    </View>
    );
  };

  const renderTabButtons = () => (
    <View style={[styles.tabContainer, { backgroundColor: theme.surface }]}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[
            styles.tabButton,
            selectedTab === tab.key && [styles.activeTab, { backgroundColor: colors.primary }]
          ]}
          onPress={() => setSelectedTab(tab.key)}
        >
          <Text
            allowFontScaling={false}
            style={[
              styles.tabText,
              selectedTab === tab.key 
                ? styles.activeTabText 
                : { color: theme.textSecondary }
            ]}
          >
            {tab.name}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderInfoTab = () => (
    <View style={styles.tabContent}>
      <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>
        Race Information
      </Text>
      
      {/* show race map if available */}
      {circuitInfo?.mapHref ? (
        <View style={[styles.mapContainer, { backgroundColor: theme.surface }]}>
          {Platform.OS === 'web' ? (
            <Image
              source={{ uri: circuitInfo.mapHref }}
              style={[styles.circuitMap, { width: windowWidth - 60, height: Math.round((windowWidth) * 0.8) }]}
              resizeMode="contain"
            />
          ) : (
            <SvgViewer
              uri={circuitInfo.mapHref}
              width={windowWidth - 60}
              height={Math.round((windowWidth) * 0.8)}
              style={styles.circuitMap}
            />
          )}
        </View>
      ) : null}

      {raceData && (
        <View style={[styles.infoSection, { backgroundColor: theme.surface }]}>
          <View style={styles.infoRow}>
            <Text allowFontScaling={false} style={[styles.infoLabel, { color: theme.textSecondary }]}>
              Race Name:
            </Text>
            <Text allowFontScaling={false} style={[styles.infoValue, { color: theme.text }]}>
              {raceData.name || 'Unknown'}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text allowFontScaling={false} style={[styles.infoLabel, { color: theme.textSecondary }]}>
              Start Date:
            </Text>
            <Text allowFontScaling={false} style={[styles.infoValue, { color: theme.text }]}>
              {raceData.date ? formatRaceDate(raceData.date) : 'TBD'}
            </Text>
          </View>
        </View>
      )}
      
      {/* Circuit details in its own section/card */}
      {circuitInfo ? (
        <View style={[styles.infoSection, { backgroundColor: theme.surface }]}>
          <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text, marginBottom: 8 }]}>Circuit Details</Text>

          <View style={styles.circuitGrid}>
            <View style={styles.circuitCell}>
              <Text allowFontScaling={false} style={[styles.cellLabel, { color: theme.textSecondary }]}>Type</Text>
              <Text allowFontScaling={false} style={[styles.cellValueSmall, { color: theme.text }]}>{circuitInfo.type || '-'}</Text>
            </View>
            <View style={styles.circuitCell}>
              <Text allowFontScaling={false} style={[styles.cellLabel, { color: theme.textSecondary }]}>Length</Text>
              <Text allowFontScaling={false} style={[styles.cellValueSmall, { color: theme.text }]}>{circuitInfo.length || '-'}</Text>
            </View>

            <View style={styles.circuitCell}>
              <Text allowFontScaling={false} style={[styles.cellLabel, { color: theme.textSecondary }]}>Distance</Text>
              <Text allowFontScaling={false} style={[styles.cellValueSmall, { color: theme.text }]}>{circuitInfo.distance || '-'}</Text>
            </View>
            <View style={styles.circuitCell}>
              <Text allowFontScaling={false} style={[styles.cellLabel, { color: theme.textSecondary }]}>Laps</Text>
              <Text allowFontScaling={false} style={[styles.cellValueSmall, { color: theme.text }]}>{circuitInfo.laps || '-'}</Text>
            </View>

            <View style={styles.circuitCell}>
              <Text allowFontScaling={false} style={[styles.cellLabel, { color: theme.textSecondary }]}>Turns</Text>
              <Text allowFontScaling={false} style={[styles.cellValueSmall, { color: theme.text }]}>{circuitInfo.turns || '-'}</Text>
            </View>
            <View style={styles.circuitCell}>
              <Text allowFontScaling={false} style={[styles.cellLabel, { color: theme.textSecondary }]}>Direction</Text>
              <Text allowFontScaling={false} style={[styles.cellValueSmall, { color: theme.text }]}>{circuitInfo.direction || '-'}</Text>
            </View>

            <View style={styles.circuitCell}>
              <Text allowFontScaling={false} style={[styles.cellLabel, { color: theme.textSecondary }]}>Established</Text>
              <Text allowFontScaling={false} style={[styles.cellValueSmall, { color: theme.text }]}>{circuitInfo.established || '-'}</Text>
            </View>
            <View style={styles.circuitCell} />
          </View>

          <View style={[styles.fastestRow, { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', marginTop: 12, paddingTop: 12 }]}>
            <View style={styles.fastestLeft}>
              <Text allowFontScaling={false} style={[styles.cellLabel, { color: theme.textSecondary }]}>Fastest Lap</Text>
              <Text allowFontScaling={false} style={[styles.fastestDriverName, { color: theme.text }]}>{circuitInfo.fastestDriverName || '-'}</Text>
              {circuitInfo.fastestLapTime ? (
                <Text allowFontScaling={false} style={[styles.fastestLapTime, { color: theme.textSecondary }]}>{circuitInfo.fastestLapTime}</Text>
              ) : null}
            </View>
            <View style={styles.fastestRight}>
              <Text allowFontScaling={false} style={[styles.cellLabel, { color: theme.textSecondary, textAlign: 'right' }]}>Year</Text>
              <Text allowFontScaling={false} style={[styles.fastestYear, { color: theme.text, textAlign: 'right' }]}>{circuitInfo.fastestLapYear || ''}</Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );

  const renderResultsTab = () => (
    <View style={styles.tabContent}>
      <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>
        Race Results
      </Text>
      {(!competitionResults || Object.keys(competitionResults).length === 0) ? (
        <Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.textSecondary }]}>Loading results...</Text>
      ) : (
        <>
          {/* Horizontal sliding competition buttons */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ paddingHorizontal: 8 }}>
            {(competitionOrder && competitionOrder.length ? competitionOrder : Object.keys(competitionResults)).map((compId) => {
              const comp = competitionResults[compId];
              if (!comp) return null;
              const pillLabel = comp.type?.abbreviation || comp.type?.displayName || comp.name || '';
              return (
                <TouchableOpacity
                  key={comp.id}
                  onPress={() => setSelectedCompetitionId(comp.id)}
                  style={[
                    styles.compPill,
                    selectedCompetitionId === comp.id ? { backgroundColor: colors.primary } : { backgroundColor: theme.surface }
                  ]}
                >
                  <Text allowFontScaling={false} style={[styles.compPillText, selectedCompetitionId === comp.id ? { color: '#fff' } : { color: theme.text }]}>
                    {pillLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Competitors list for selected competition */}
          {selectedCompetitionId && competitionResults[selectedCompetitionId] ? (
            <View style={{ marginTop: 8 }}>
              {sortedCompetitors.map((r) => {
                const compType = competitionResults[selectedCompetitionId]?.type || {};
                const isQual = ((compType.abbreviation || '') + ' ' + (compType.text || '') + ' ' + (compType.displayName || '')).toString().toLowerCase().includes('qual');
                return (
                <View key={r.id} style={[styles.racerRow, { borderLeftColor: r.teamColor || '#000000', backgroundColor: r.fastestLap ? '#7c3aed5b' : theme.surface }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View style={{ alignItems: 'center', marginRight: 10, width: 40 }}>
                      <View style={[styles.positionBadge, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
                        <Text allowFontScaling={false} style={[styles.positionText, { color: theme.text }]}>{isLiveRace ? getLivePosition(r) : (r.order || '-')}</Text>
                      </View>
                      {/* Position delta: show only when we have startOrder and order and competition is a race */}
                      {(() => {
                        const compTypeLocal = compType || {};
                        const isRace = ((compTypeLocal.abbreviation || '') + ' ' + (compTypeLocal.text || '') + ' ' + (compTypeLocal.displayName || '')).toString().toLowerCase().includes('race');
                        const hasOrder = typeof r.order === 'number' || (r.order && !isNaN(Number(r.order)));
                        const hasStart = typeof r.startOrder === 'number' || (r.startOrder && !isNaN(Number(r.startOrder)));
                        if (!isRace || !hasOrder || !hasStart) return null;
                        const delta = Number(r.startOrder) - Number(r.order);
                        if (!delta) return null;
                        const absDelta = Math.abs(delta);
                        const arrow = delta > 0 ? '▲' : '▼';
                        const color = delta > 0 ? theme.success : theme.error;
                        return (
                          <Text allowFontScaling={false} style={[styles.positionDelta, { color, marginTop: 6 }]}>{arrow} {absDelta}</Text>
                        );
                      })()}
                    </View>
                    <View style={styles.racerLeft}> 
                      <Text allowFontScaling={false} style={[styles.racerName, { color: theme.text }]} numberOfLines={1}>{r.name || 'Unknown'}</Text>
                      <View style={styles.racerManufacturerRow}>
                        {isFavorite(getF1TeamId(r.manufacturer)) && (
                          <TouchableOpacity
                            onPress={() => handleTeamFavoriteToggle(r.manufacturer, r.teamColor)}
                            activeOpacity={0.7}
                            style={styles.racerManufacturerFav}
                          >
                            <Text allowFontScaling={false} style={[styles.racerManufacturerFavIcon, { color: colors.primary }]}>
                              ★
                            </Text>
                          </TouchableOpacity>
                        )}
                        <Text allowFontScaling={false} style={[styles.racerSub, { color: isFavorite(getF1TeamId(r.manufacturer)) ? colors.primary : theme.textSecondary }]} numberOfLines={1}>{r.manufacturer || ''}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.racerRight}>
                    {r.winner ? <Text allowFontScaling={false} style={[styles.winnerBadge, { backgroundColor: colors.primary }]}>WIN</Text> : null}
                    {isQual ? (
                      <View style={{ alignItems: 'flex-end' }}>
                        {r.qual1 ? <Text allowFontScaling={false} style={[styles.totalTime, { color: theme.text }]}>Q1: {r.qual1}</Text> : null}
                        {r.qual2 ? <Text allowFontScaling={false} style={[styles.totalTime, { color: theme.text }]}>Q2: {r.qual2}</Text> : null}
                        {r.qual3 ? <Text allowFontScaling={false} style={[styles.totalTime, { color: theme.text }]}>Q3: {r.qual3}</Text> : null}
                        {r.behindTime ? <Text allowFontScaling={false} style={[styles.lapsText, { color: theme.textSecondary }]}>Behind: {r.behindTime}</Text> : null}
                      </View>
                    ) : (
                      <>
                        {/* Show live gap to leader when race is live, otherwise show total time */}
                        <Text allowFontScaling={false} style={[styles.totalTime, { color: theme.text }]} numberOfLines={1}>
                          {isLiveRace ? 
                            getLiveGapToLeader(r) :
                            (r.totalTime || `+${r.behindLaps} Laps`)
                          }
                        </Text>
                        <Text allowFontScaling={false} style={[styles.lapsText, { color: theme.textSecondary }]} numberOfLines={1}>{r.laps ? `${r.laps} laps` : ''}</Text>
                      </>
                    )}
                  </View>
                </View>
                );
              })}
            </View>
          ) : (
            <Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.textSecondary }]}>Select a competition to view competitors</Text>
          )}
        </>
      )}
    </View>
  );

  const renderGridTab = () => (
    <View style={styles.tabContent}>
      <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>
        Grid
      </Text>

      {/* Race status (period/flag/type) */}
      {raceStatus ? (
        <View style={[styles.raceStatusContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.raceStatusLeft}>
            <Text allowFontScaling={false} style={[styles.raceStatusValue, { color: theme.text }]}>Lap: {raceStatus.period ?? '-'}</Text>
            {raceStatus.flag ? (
              <Text allowFontScaling={false} style={[styles.raceFlag, { color: theme.textSecondary }]}>Flag: {raceStatus.flag}</Text>
            ) : null}
          </View>
          <View style={styles.raceStatusRight}>
            <Text allowFontScaling={false} style={[styles.raceTypeDescription, { color: theme.text }]} numberOfLines={2}>{raceStatus.type?.description || raceStatus.type?.detail || ''}</Text>
          </View>
        </View>
      ) : null}

      {/* Checkered finish line header */}
      <View style={styles.checkeredHeaderContainer}>
        <View style={styles.checkeredBar}>
          {Array.from({ length: 20 }, (_, i) => (
            <View
              key={i}
              style={[
                styles.checkeredSquare,
                { backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#000000' }
              ]}
            />
          ))}
        </View>
        <View style={styles.checkeredBar}>
          {Array.from({ length: 20 }, (_, i) => (
            <View
              key={`second-${i}`}
              style={[
                styles.checkeredSquare,
                { backgroundColor: i % 2 === 0 ? '#000000' : '#FFFFFF' }
              ]}
            />
          ))}
        </View>
      </View>

      {selectedCompetitionId && competitionResults[selectedCompetitionId] ? (
        <View style={[styles.gridContainer, { backgroundColor: theme.surface }]}>
          <ScrollView style={{ marginTop: 16 }} showsVerticalScrollIndicator={false}>
            {(() => {
              // Build grid sorted by live position when race is live, otherwise by order/startOrder
              const comps = sortedGridCompetitors;

              // Group into rows of 2 (left and right positions)
              const gridRows = [];
              for (let i = 0; i < comps.length; i += 2) {
                const leftDriver = comps[i];
                const rightDriver = comps[i + 1] || null;
                gridRows.push({ left: leftDriver, right: rightDriver });
              }

              return gridRows.map((row, rowIndex) => (
                <View key={`grid-row-${rowIndex}`} style={styles.gridRowContainer}>
                  {/* Left position */}
                  <View style={[styles.gridPositionSlot, styles.gridPositionLeft]}>
                    {row.left && (
                      <>
                        <Text allowFontScaling={false} style={[styles.gridSlotNumber, { color: theme.text }]}>
                          {isLiveRace ? getLivePosition(row.left) : (row.left.order ?? row.left.startOrder ?? (rowIndex * 2 + 1))}
                        </Text>
                        {(() => {
                          const athleteRef = row.left.raw?.athlete?.$ref;
                          const athlete = athleteRef ? (athleteCache[athleteRef] || null) : null;
                          const headshot = athlete?.headshot || buildESPNHeadshotUrl(row.left.id);
                          
                          return (
                            <TouchableOpacity onPress={async () => {
                              const statsJson = await fetchDriverStats(row.left);
                              setSelectedDriverDetails({ competitor: row.left, athlete, stats: statsJson });
                              setDriverModalVisible(true);
                            }}>
                              <GridDriverImage
                                headshot={headshot}
                                athlete={athlete}
                                driverName={row.left.name}
                                teamColor={row.left.teamColor}
                                theme={theme}
                                styles={styles}
                              />
                            </TouchableOpacity>
                          );
                        })()}
                        <Text allowFontScaling={false} style={[styles.gridDriverTime, { color: theme.text }]} numberOfLines={1}>
                          {isLiveRace ? 
                            getLiveGapToLeader(row.left) :
                            (row.left.behindTime || (row.left.behindLaps != null ? `+${row.left.behindLaps} Laps` : row.left.totalTime) || '')
                          }
                        </Text>
                        <Text allowFontScaling={false} style={[styles.gridDriverLaps, { color: theme.textSecondary }]}>
                          {row.left.laps ? `${row.left.laps} laps` : ''}
                        </Text>
                      </>
                    )}
                  </View>

                  {/* Right position */}
                  <View style={[styles.gridPositionSlot, styles.gridPositionRight]}>
                    {row.right && (
                      <>
                        <Text allowFontScaling={false} style={[styles.gridSlotNumber, { color: theme.text }]}>
                          {isLiveRace ? getLivePosition(row.right) : (row.right.order ?? row.right.startOrder ?? (rowIndex * 2 + 2))}
                        </Text>
                        {(() => {
                          const athleteRef = row.right.raw?.athlete?.$ref;
                          const athlete = athleteRef ? (athleteCache[athleteRef] || null) : null;
                          const headshot = athlete?.headshot || buildESPNHeadshotUrl(row.right.id);
                          
                          return (
                            <TouchableOpacity onPress={async () => {
                              const statsJson = await fetchDriverStats(row.right);
                              setSelectedDriverDetails({ competitor: row.right, athlete, stats: statsJson });
                              setDriverModalVisible(true);
                            }}>
                              <GridDriverImage
                                headshot={headshot}
                                athlete={athlete}
                                driverName={row.right.name}
                                teamColor={row.right.teamColor}
                                theme={theme}
                                styles={styles}
                              />
                            </TouchableOpacity>
                          );
                        })()}
                        <Text allowFontScaling={false} style={[styles.gridDriverTime, { color: theme.text }]} numberOfLines={1}>
                          {isLiveRace ? 
                            getLiveGapToLeader(row.right) :
                            (row.right.behindTime || (row.right.behindLaps != null ? `+${row.right.behindLaps} Laps` : row.right.totalTime) || '')
                          }
                        </Text>
                        <Text allowFontScaling={false} style={[styles.gridDriverLaps, { color: theme.textSecondary }]}>
                          {row.right.laps ? `${row.right.laps} laps` : ''}
                        </Text>
                      </>
                    )}
                  </View>
                </View>
              ));
            })()}
          </ScrollView>
        </View>
      ) : (
        <Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.textSecondary }]}>Select a competition to view the starting grid</Text>
      )}
    </View>
  );

  const renderTabContent = () => {
    switch (selectedTab) {
      case 'INFO':
        return renderInfoTab();
      case 'RESULTS':
        return renderResultsTab();
      case 'GRID':
        return renderGridTab();
      case 'EVENTS':
        return renderEventsTab();
      default:
        return renderInfoTab();
    }
  };

  const formatEventTime = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString('en-US', { 
        timeZone: 'America/New_York', // EST timezone
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });
    } catch (error) {
      return dateString || '';
    }
  };

  const formatElapsedTime = (elapsedTimeString) => {
    if (!elapsedTimeString) return '';
    // Format like "00:57:27.534000" to readable time
    const parts = elapsedTimeString.split(':');
    if (parts.length >= 3) {
      const hours = parseInt(parts[0]);
      const minutes = parseInt(parts[1]);
      const seconds = parseFloat(parts[2]);
      
      if (hours > 0) {
        return `${hours}h ${minutes}m ${Math.floor(seconds)}s`;
      } else if (minutes > 0) {
        return `${minutes}m ${Math.floor(seconds)}s`;
      } else {
        return `${Math.floor(seconds)}s`;
      }
    }
    return elapsedTimeString;
  };

  // Helper functions for driver lookups and team colors
  const getDriverByNumber = (driverNumber) => {
    return openF1Data.drivers[driverNumber] || null;
  };

  const getDriverTeamColor = (driverNumber) => {
    const driver = getDriverByNumber(driverNumber);
    if (!driver || !driver.team_colour) return theme.textSecondary;
    return `#${driver.team_colour}`;
  };

  const formatCauseName = (cause) => {
    return cause.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const getEventBorderColor = (event) => {
    const { category, cause, details } = event;
    const key = `${category}:${cause}`;
    
    switch (key) {
      // Yellow flag events
      case 'sector-notification:yellow-flag':
      case 'sector-notification:double-yellow-flag':
        return theme.warning || '#FF9800';
      
      // Green flag and chequered flag events
      case 'track-notification:green-flag':
      case 'sector-notification:green-flag':
      case 'track-notification:chequered-flag':
      case 'session-notification:race-end':
        return theme.success || '#4CAF50';
      
      // Safety car and incident events
      case 'track-notification:safety-car-deployed':
      case 'track-notification:safety-car-ending':
        return theme.error || '#F44336';
      
      // Race control and info events
      case 'other:race-control-message':
        return theme.info || colors.primary;
      
      // Red flag events
      case 'track-notification:red-flag':
        return theme.error || '#F44336';
      
      // Session control events
      case 'session-notification:session-stop':
      case 'session-notification:session-resume':
      case 'session-notification:practice-end':
      case 'session-notification:q1-start':
      case 'session-notification:q2-start':
      case 'session-notification:q3-start':
      case 'session-notification:q1-end':
      case 'session-notification:q2-end':
      case 'session-notification:q3-end':
        return theme.text;
      
      // Driver-specific events use driver's team color
      case 'driver-action:overtake':
      case 'driver-notification:overtake':
      case 'driver-action:out':
      case 'driver-action:pit':
      case 'driver-action:incident':
      case 'driver-action:track-limits':
      case 'driver-action:personal-best-lap':
      case 'driver-notification:blue-flag':
      case 'driver-notification:incident-verdict':
      case 'driver-notification:provisional-classification':
      case 'driver-notification:qualifying-stage-classification':
        if (details?.driver_roles) {
          const driverNumber = Object.keys(details.driver_roles).find(num => 
            details.driver_roles[num] === 'initiator'
          );
          if (driverNumber) {
            return getDriverTeamColor(driverNumber);
          }
        }
        return theme.textSecondary;
      
      default:
        return theme.textSecondary;
    }
  };

  const getEventSectionName = (event) => {
    const { category, cause } = event;
    const key = `${category}:${cause}`;
    
    switch (key) {
      case 'sector-notification:yellow-flag':
      case 'sector-notification:double-yellow-flag':
      case 'track-notification:green-flag':
      case 'sector-notification:green-flag':
      case 'track-notification:chequered-flag':
      case 'track-notification:safety-car-deployed':
      case 'track-notification:safety-car-ending':
      case 'other:race-control-message':
        return formatCauseName(cause);
      
      case 'driver-action:overtake':
      case 'driver-notification:overtake':
        return 'Overtake';
      
      case 'session-notification:session-start':
        return 'Session Start';
      
      case 'session-notification:race-start':
        return 'Race Start';
      
      case 'driver-action:out':
        return 'Driver Out';
      
      case 'driver-action:pit':
        return 'Driver Pit';
      
      case 'driver-action:incident':
        return 'Driver Incident';
      
      case 'driver-notification:incident-verdict':
        return 'Driver Incident Verdict';
      
      case 'driver-action:track-limits':
        return 'Track Limits';
      
      case 'driver-notification:blue-flag':
        return 'Blue Flag';
      
      case 'session-notification:race-end':
        return 'Race End';
      
      case 'driver-notification:provisional-classification':
        return 'Driver Finish';
      
      case 'session-notification:session-end':
        return 'Session End';
      
      case 'driver-action:personal-best-lap':
        return 'Personal Best';
      
      case 'session-notification:session-stop':
        return 'Session Stop';
      
      case 'track-notification:red-flag':
        return formatCauseName(cause);
      
      case 'session-notification:session-resume':
        return 'Session Resume';
      
      case 'session-notification:practice-end':
        return 'Practice End';
      
      case 'session-notification:q1-start':
        return 'Qualifying 1 Starts';
      
      case 'session-notification:q2-start':
        return 'Qualifying 2 Starts';
      
      case 'session-notification:q3-start':
        return 'Qualifying 3 Starts';
      
      case 'driver-notification:qualifying-stage-classification':
        return 'Qualifying Stage Finish';
      
      case 'session-notification:q1-end':
        return 'Qualifying 1 Ends';
      
      case 'session-notification:q2-end':
        return 'Qualifying 2 Ends';
      
      case 'session-notification:q3-end':
        return 'Qualifying 3 Ends';
      
      default:
        return formatCauseName(cause);
    }
  };

  const formatEventDescription = (event) => {
    const { category, cause, details } = event;
    const key = `${category}:${cause}`;
    
    // Helper to get driver names
    const getDriverName = (driverNumber) => {
      const driver = getDriverByNumber(driverNumber);
      return driver ? driver.broadcast_name : `#${driverNumber}`;
    };
    
    switch (key) {
      case 'sector-notification:yellow-flag':
      case 'sector-notification:double-yellow-flag':
      case 'track-notification:green-flag':
      case 'sector-notification:green-flag':
      case 'track-notification:chequered-flag':
      case 'track-notification:safety-car-deployed':
      case 'track-notification:safety-car-ending':
      case 'other:race-control-message':
        return details?.message || formatCauseName(cause);
      
      case 'driver-action:overtake':
      case 'driver-notification:overtake':
        if (details?.driver_roles) {
          const initiatorNum = Object.keys(details.driver_roles).find(num => 
            details.driver_roles[num] === 'initiator'
          );
          const participantNum = Object.keys(details.driver_roles).find(num => 
            details.driver_roles[num] === 'participant'
          );
          
          if (initiatorNum && participantNum) {
            const initiator = getDriverName(initiatorNum);
            const participant = getDriverName(participantNum);
            return `${initiator} OVERTAKES ${participant} FOR P${details.position || '?'}`;
          }
        }
        return 'Overtake';
      
      case 'session-notification:session-start':
        return `${raceData?.name || 'Session'} has officially started`;
      
      case 'session-notification:race-start':
        return `${raceData?.name || 'Event'} race has officially started`;
      
      case 'driver-action:out':
        if (details?.driver_roles) {
          const initiatorNum = Object.keys(details.driver_roles).find(num => 
            details.driver_roles[num] === 'initiator'
          );
          if (initiatorNum) {
            const initiator = getDriverName(initiatorNum);
            return `${initiator} OUT OF THE SESSION`;
          }
        }
        return 'Driver out of session';
      
      case 'driver-action:pit':
        if (details?.driver_roles) {
          const initiatorNum = Object.keys(details.driver_roles).find(num => 
            details.driver_roles[num] === 'initiator'
          );
          if (initiatorNum) {
            const initiator = getDriverName(initiatorNum);
            const duration = (details.pit_stop_duration !== null ? ` ${details.pit_stop_duration}S` : '') || '';
            const tyreType = details.tyre_age_at_start === 0 ? 'NEW' : 'USED';
            const compound = details.compound || 'Unknown';
            return `${initiator}:${duration} PIT FOR ${tyreType} ${compound.toUpperCase()} TIRES`;
          }
        }
        return 'Pit stop';
      
      case 'driver-action:incident':
        if (details?.driver_roles) {
          const initiatorNum = Object.keys(details.driver_roles).find(num => 
            details.driver_roles[num] === 'initiator'
          );
          const participantNum = Object.keys(details.driver_roles).find(num => 
            details.driver_roles[num] === 'participant'
          );
          
          if (initiatorNum) {
            const initiator = getDriverName(initiatorNum);
            const reason = details.reason || 'Incident';
            
            if (participantNum) {
              const participant = getDriverName(participantNum);
              const marker = details.marker ? ` AT ${details.marker}` : '';
              return `${initiator}: ${reason} WITH ${participant}${marker}`;
            } else {
              return `${initiator}: ${reason}`;
            }
          }
        }
        return details?.reason || 'Incident';
      
      case 'driver-notification:incident-verdict':
        if (details?.driver_roles) {
          const initiatorNum = Object.keys(details.driver_roles).find(num => 
            details.driver_roles[num] === 'initiator'
          );
          const participantNum = Object.keys(details.driver_roles).find(num => 
            details.driver_roles[num] === 'participant'
          );
          
          if (initiatorNum) {
            const initiator = getDriverName(initiatorNum);
            const verdict = details.verdict || 'Verdict';
            const reason = details.reason || '';
            
            if (participantNum) {
              const participant = getDriverName(participantNum);
              const marker = details.marker || 'Incident';
              return `${marker} INCIDENT INVOLVING ${initiator} AND ${participant} ${verdict} - ${reason}`;
            } else {
              return `${verdict} FOR ${initiator} - ${reason}`;
            }
          }
        }
        return details?.verdict || 'Incident verdict';
      
      case 'driver-action:track-limits':
        if (details?.driver_roles) {
          const initiatorNum = Object.keys(details.driver_roles).find(num => 
            details.driver_roles[num] === 'initiator'
          );
          if (initiatorNum) {
            const initiator = getDriverName(initiatorNum);
            const marker = details.marker || 'track limits';
            return `${initiator} EXCEEDED THE TRACK LIMITS ON ${marker}`;
          }
        }
        return 'Track limits exceeded';
      
      case 'driver-notification:blue-flag':
        if (details?.driver_roles) {
          const initiatorNum = Object.keys(details.driver_roles).find(num => 
            details.driver_roles[num] === 'initiator'
          );
          if (initiatorNum) {
            const initiator = getDriverName(initiatorNum);
            return `WAVED BLUE FLAG FOR ${initiator}`;
          }
        }
        return 'Blue flag waved';
      
      case 'session-notification:race-end':
        return 'Race has ended';
      
      case 'driver-notification:provisional-classification':
        if (details?.driver_roles) {
          const initiatorNum = Object.keys(details.driver_roles).find(num => 
            details.driver_roles[num] === 'initiator'
          );
          if (initiatorNum) {
            const initiator = getDriverName(initiatorNum);
            const position = details.position || '?';
            return `${initiator} FINISHES THE SESSION IN P${position}`;
          }
        }
        return 'Driver finished session';
      
      case 'session-notification:session-end':
        return 'Session has ended';
      
      case 'driver-action:personal-best-lap':
        if (details?.driver_roles) {
          const initiatorNum = Object.keys(details.driver_roles).find(num => 
            details.driver_roles[num] === 'initiator'
          );
          if (initiatorNum) {
            const initiator = getDriverName(initiatorNum);
            const compound = details.compound || 'Unknown';
            const position = details.position ? ` FOR P${details.position}` : '';
            
            // Convert lap_duration from seconds (like 107.422) to M:S.MS format (1:47.422)
            let lapTimeFormatted = details.lap_duration || '0.000';
            if (typeof details.lap_duration === 'number' || typeof details.lap_duration === 'string') {
              const totalSeconds = parseFloat(details.lap_duration);
              const minutes = Math.floor(totalSeconds / 60);
              const seconds = (totalSeconds % 60).toFixed(3);
              lapTimeFormatted = `${minutes}:${seconds.padStart(6, '0')}`;
            }
            
            return `${initiator} ACHIEVES PERSONAL BEST ON ${compound.toUpperCase()} TIRES${position}: ${lapTimeFormatted}`;
          }
        }
        return 'Personal best lap achieved';
      
      case 'session-notification:session-stop':
        return 'Session has been stopped';
      
      case 'track-notification:red-flag':
        return details?.message || 'Red flag deployed';
      
      case 'session-notification:session-resume':
        return 'Session has resumed';
      
      case 'session-notification:practice-end':
        return 'Practice session has ended';
      
      case 'session-notification:q1-start':
        return 'Qualifying 1 has started';
      
      case 'session-notification:q2-start':
        return 'Qualifying 2 has started';
      
      case 'session-notification:q3-start':
        return 'Qualifying 3 has started';
      
      case 'driver-notification:qualifying-stage-classification':
        if (details?.driver_roles) {
          const initiatorNum = Object.keys(details.driver_roles).find(num => 
            details.driver_roles[num] === 'initiator'
          );
          if (initiatorNum) {
            const initiator = getDriverName(initiatorNum);
            const stage = details.qualifying_stage_number || '?';
            const position = details.position || '?';
            return `${initiator} FINISHES QUALIFYING ${stage} IN P${position}`;
          }
        }
        return 'Qualifying stage finished';
      
      case 'session-notification:q1-end':
        return 'Qualifying 1 has ended';
      
      case 'session-notification:q2-end':
        return 'Qualifying 2 has ended';
      
      case 'session-notification:q3-end':
        return 'Qualifying 3 has ended';
      
      default:
        return details?.message || formatCauseName(cause);
    }
  };



  const renderDriverFilter = () => {
    if (!openF1Data.drivers || Object.keys(openF1Data.drivers).length === 0) return null;

    // Get sorted list of drivers by full_name
    const driversList = Object.values(openF1Data.drivers)
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

    return (
      <View style={[styles.driverFilterContainer, { backgroundColor: theme.surface }]}>
        <Text allowFontScaling={false} style={[styles.driverFilterLabel, { color: theme.textSecondary }]}>
          Driver Filter:
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.driverFilterScrollView}>
          {/* "Show All" option */}
          <TouchableOpacity
            style={[
              styles.driverFilterButton,
              { borderColor: theme.border },
              openF1Data.selectedDriverFilter === null && [
                styles.selectedDriverFilterButton,
                { backgroundColor: colors.primary, borderColor: colors.primary }
              ]
            ]}
            onPress={() => {
              setOpenF1Data(prev => ({
                ...prev,
                selectedDriverFilter: null
              }));
            }}
          >
            <Text
              allowFontScaling={false}
              style={[
                styles.driverFilterButtonText,
                { color: theme.text },
                openF1Data.selectedDriverFilter === null && { color: '#FFFFFF' }
              ]}
            >
              --
            </Text>
          </TouchableOpacity>

          {/* Driver options */}
          {driversList.map((driver) => (
            <TouchableOpacity
              key={driver.driver_number}
              style={[
                styles.driverFilterButton,
                { borderColor: theme.border },
                openF1Data.selectedDriverFilter === driver.driver_number && [
                  styles.selectedDriverFilterButton,
                  { backgroundColor: colors.primary, borderColor: colors.primary }
                ]
              ]}
              onPress={() => {
                setOpenF1Data(prev => ({
                  ...prev,
                  selectedDriverFilter: driver.driver_number
                }));
              }}
            >
              <Text
                allowFontScaling={false}
                style={[
                  styles.driverFilterButtonText,
                  { color: theme.text },
                  openF1Data.selectedDriverFilter === driver.driver_number && { color: '#FFFFFF' }
                ]}
                numberOfLines={1}
              >
                {driver.full_name} ({driver.driver_number})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderEventsTab = () => {
    // Filter events based on selected driver
    const filteredEvents = openF1Data.selectedDriverFilter 
      ? openF1Data.events.filter(event => {
          // Check if the event involves the selected driver
          if (event.details?.driver_roles) {
            return Object.keys(event.details.driver_roles).includes(openF1Data.selectedDriverFilter.toString());
          }
          return false;
        })
      : openF1Data.events;

    return (
      <View style={styles.tabContent}>
        <Text allowFontScaling={false} style={[styles.sectionTitle, { color: theme.text }]}>
          Event Timeline
        </Text>
        
        {renderDriverFilter()}
      
      {openF1Data.eventsLoading && (
        <View style={styles.loadingContainer}>
          <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading events...
          </Text>
        </View>
      )}
      
      {openF1Data.eventsError && (
        <View style={[styles.errorContainer, { backgroundColor: theme.surface }]}>
          <Text allowFontScaling={false} style={[styles.errorText, { color: colors.error || '#F44336' }]}>
            {openF1Data.eventsError}
          </Text>
          <Text allowFontScaling={false} style={[styles.errorSubtext, { color: theme.textSecondary }]}>
            {openF1Data.eventsError.includes('not yet ready') 
              ? 'Events data becomes available approximately 20 minutes after a session ends.'
              : 'Please try again later or select a different session.'}
          </Text>
        </View>
      )}
      
      {!openF1Data.eventsLoading && !openF1Data.eventsError && filteredEvents.length === 0 && openF1Data.events.length > 0 && (
        <View style={[styles.noDataContainer, { backgroundColor: theme.surface }]}>
          <Text allowFontScaling={false} style={[styles.noDataText, { color: theme.textSecondary }]}>
            No events found for the selected driver.
          </Text>
        </View>
      )}
      
      {!openF1Data.eventsLoading && !openF1Data.eventsError && openF1Data.events.length === 0 && (
        <View style={[styles.noDataContainer, { backgroundColor: theme.surface }]}>
          <Text allowFontScaling={false} style={[styles.noDataText, { color: theme.textSecondary }]}>
            No events data available for this session.
          </Text>
        </View>
      )}
      
      {!openF1Data.eventsLoading && !openF1Data.eventsError && filteredEvents.length > 0 && (
        <ScrollView style={styles.eventsScrollView} showsVerticalScrollIndicator={false}>
          {filteredEvents.map((event, index) => {
            const isSessionEnd = event.category === 'session-notification' && event.cause === 'session-end';
            
            return (
              <View 
                key={`event-${event.session_key}-${index}`} 
                style={[
                  styles.eventItem,
                  { 
                    backgroundColor: isSessionEnd ? 'transparent' : theme.surface,
                    borderLeftColor: getEventBorderColor(event),
                    borderColor: theme.border
                  }
                ]}
              >
                {/* Striped pattern background for session-end */}
                {isSessionEnd && (
                  <View style={styles.stripedBackground}>
                    {Array.from({ length: 10 }, (_, index) => (
                      <View
                        key={index}
                        style={[
                          styles.stripe,
                          { 
                            backgroundColor: index % 2 === 0 ? 'rgba(255, 255, 255, 0.44)' : 'rgba(0,0,0,0.1)' 
                          }
                        ]}
                      />
                    ))}
                  </View>
                )}
                <View style={styles.eventHeader}>
                  <View style={styles.eventTimeInfo}>
                    <Text allowFontScaling={false} style={[styles.eventSectionName, { color: theme.text }]}>
                      {getEventSectionName(event)}
                    </Text>
                    {/* For provisional-classification, we do NOT show the date/time in the body; it will be shown in the top-right badge */}
                    {!(event.category === 'driver-notification' && event.cause === 'provisional-classification') && (
                      <>
                        <Text allowFontScaling={false} style={[styles.eventTime, { color: theme.textSecondary }]}> 
                          {formatEventTime(event.date)}
                        </Text>
                        {event.elapsed_time && (
                          <Text allowFontScaling={false} style={[styles.eventElapsed, { color: theme.textSecondary }]}> 
                            +{formatElapsedTime(event.elapsed_time)}
                          </Text>
                        )}
                      </>
                    )}
                  </View>
                  
                  {
                    // For provisional classification show the event time (date) in the top-right circle
                    event.category === 'driver-notification' && event.cause === 'provisional-classification' ? (
                      <View style={[styles.lapNumberCircle, { backgroundColor: getEventBorderColor(event) }]}> 
                        <Text allowFontScaling={false} style={[styles.lapNumberText, { color: '#FFFFFF', fontSize: 10 }]}>
                          {formatEventTime(event.date)}
                        </Text>
                      </View>
                    ) : (
                      event.details?.lap_number && (
                        <View style={[styles.lapNumberCircle, { backgroundColor: getEventBorderColor(event) }]}> 
                          <Text allowFontScaling={false} style={[styles.lapNumberText, { color: '#FFFFFF' }]}>
                            Lap {event.details.lap_number}
                          </Text>
                        </View>
                      )
                    )
                  }
                </View>
                
                <Text allowFontScaling={false} style={[styles.eventDescription, { color: theme.text }]}>
                  {formatEventDescription(event)}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
    );
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      paddingTop: 0,
      paddingBottom: 0,
      paddingHorizontal: 0,
    },
    raceName: {
      fontSize: 24,
    eventRow: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      marginBottom: 8,
      borderRadius: 8,
    },
    eventTime: {
      fontSize: 12,
      marginBottom: 4,
    },
    eventText: {
      fontSize: 14,
    },
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 8,
    },
    raceDate: {
      fontSize: 14,
      textAlign: 'center',
      opacity: 0.9,
      marginBottom: 4,
    },
    circuitInfo: {
      fontSize: 12,
      textAlign: 'center',
      opacity: 0.8,
    },
    headerContainer: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
      alignItems: 'center'
    },
    headerCard: {
      width: '100%',
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      // shadow for iOS
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      // elevation for Android
      elevation: 6,
    },
    headerCardContent: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    headerCardLeft: {
      flex: 1,
    },
    headerCardRight: {
      marginLeft: 16,
    },
    nextCompContainer: {
      position: 'absolute',
      right: 16,
      top: 72,
      maxWidth: 160,
      alignItems: 'flex-end'
    },
    racerManufacturerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
    },
    racerManufacturerFav: {
      paddingHorizontal: 6,
      paddingVertical: 0,
      marginRight: 6,
    },
    racerManufacturerFavIcon: {
      fontSize: 14,
      fontWeight: '700',
    },
    nextCompText: {
      fontSize: 12,
      fontStyle: 'italic'
    },
    headerCardTop: {
      marginBottom: 6,
      alignItems: 'center'
    },
    headerCardMiddle: {
      marginBottom: 8,
      alignItems: 'center'
    },
    headerCardBottom: {
      alignItems: 'flex-start',
      marginTop: 8,
    },
    competitionTypeText: {
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
      marginHorizontal: 16,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700'
    },
    headerMeta: {
      fontSize: 13,
    },
    circuitName: {
      fontSize: 14,
      fontWeight: '600'
    },
    circuitLocation: {
      fontSize: 12,
      marginTop: 2
    },
    headerCircuitRow: {
      flexDirection: 'row',
      alignItems: 'center'
    },
    headerCountryFlag: {
      width: 20,
      height: 14,
      marginRight: 8,
      borderRadius: 2,
      backgroundColor: '#fff'
    },
    winnerContainer: {
      alignItems: 'center',
    },
    winnerImage: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: theme.border,
    },
    winnerImagePlaceholder: {
      width: 50,
      height: 50,
      borderRadius: 25,
      justifyContent: 'center',
      alignItems: 'center',
    },
    winnerInitials: {
      fontSize: 16,
      fontWeight: 'bold',
      color: '#fff',
    },
    winnerName: {
      fontSize: 14,
      fontWeight: '600',
      marginTop: 6,
      textAlign: 'center',
    },
    winnerLabel: {
      fontSize: 10,
      fontWeight: '500',
      marginTop: 2,
      textAlign: 'center',
    },
    tabContainer: {
      flexDirection: 'row',
      marginHorizontal: 20,
      marginVertical: 15,
      borderRadius: 8,
      padding: 4,
    },
    tabButton: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      borderRadius: 6,
    },
    activeTab: {
      // backgroundColor set dynamically
    },
    tabText: {
      fontSize: 14,
      fontWeight: '600',
    },
    /* Grid styles */
    checkeredHeaderContainer: {
      marginTop: 16,
      alignItems: 'center',
    },
    checkeredBar: {
      width: '90%',
      height: 12,
      flexDirection: 'row',
      borderRadius: 2,
      overflow: 'hidden',
      marginBottom: 2,
    },
    checkeredSquare: {
      flex: 1,
      height: '100%',
    },
    gridContainer: {
      marginTop: 16,
      borderRadius: 12,
      paddingVertical: 20,
      marginHorizontal: 10,
    },
    gridRowContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 25,
      paddingHorizontal: 20,
      minHeight: 120,
    },
    gridPositionSlot: {
      width: '45%',
      alignItems: 'center',
      backgroundColor: 'transparent',
    },
    gridPositionLeft: {
      marginTop: 0,
    },
    gridPositionRight: {
      marginTop: 15,
    },
    gridSlotNumber: {
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 8,
    },
    gridDriverAvatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 3,
      marginBottom: 8,
    },
    gridDriverAvatarEmpty: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 3,
      backgroundColor: 'transparent',
      marginBottom: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    gridDriverInitials: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },
    gridDriverTime: {
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
      marginBottom: 2,
    },
    gridDriverLaps: {
      fontSize: 10,
      textAlign: 'center',
    },
    raceStatusContainer: {
      width: '100%',
      borderRadius: 10,
      padding: 12,
      marginTop: 12,
      marginBottom: 8,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderWidth: 1,
    },
    raceStatusLeft: {
      flex: 1,
      paddingRight: 8,
    },
    raceStatusRight: {
      width: '40%'
    },
    raceStatusLabel: {
      fontSize: 12,
      fontWeight: '600'
    },
    raceStatusValue: {
      fontSize: 16,
      fontWeight: '700',
      marginTop: 4
    },
    raceFlag: {
      fontSize: 12,
      marginTop: 6
    },
    raceTypeDescription: {
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'right'
    },
    activeTabText: {
      color: '#fff',
    },
    content: {
      flex: 1,
    },
    tabContent: {
      flex: 1,
      paddingHorizontal: 20,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 16,
    },
    infoSection: {
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    mapContainer: {
      borderRadius: 12,
      padding: 8,
      marginBottom: 12,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center'
    },
    circuitMap: {
      borderRadius: 8,
      backgroundColor: 'transparent'
    },
    circuitSection: {
      marginTop: 8,
    },
    circuitGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between'
    },
    circuitCell: {
      width: '48%',
      marginBottom: 10
    },
    cellLabel: {
      fontSize: 12,
      fontWeight: '600'
    },
    cellValueSmall: {
      fontSize: 14,
      marginTop: 2
    },
    fastestRow: {
      flexDirection: 'row',
      alignItems: 'center'
    },
    fastestLeft: {
      flex: 1
    },
    fastestRight: {
      width: 80
    },
    fastestDriverName: {
      fontSize: 16,
      fontWeight: '700',
      marginTop: 4
    },
    fastestLapTime: {
      fontSize: 13,
      marginTop: 2
    },
    fastestYear: {
      fontSize: 16,
      fontWeight: '700'
    },
    compPill: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 20,
      marginRight: 8,
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.06)'
    },
    compPillText: {
      fontSize: 13,
      fontWeight: '600'
    },
    racerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 12,
      marginBottom: 8,
      borderRadius: 8,
      borderLeftWidth: 6,
      backgroundColor: 'transparent'
    },
    racerLeft: {
      flex: 1,
      paddingRight: 8
    },
    racerRight: {
      alignItems: 'flex-end',
      minWidth: 56
    },
    positionBadge: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1
    },
    positionText: {
      fontSize: 14,
      fontWeight: '700'
    },
    positionDelta: {
      fontSize: 11,
      marginTop: 2,
      fontWeight: '700',
      textAlign: 'center'
    },
    totalTime: {
      fontSize: 13,
      fontWeight: '600'
    },
    lapsText: {
      fontSize: 12,
      marginTop: 2
    },
    racerName: {
      fontSize: 15,
      fontWeight: '700'
    },
    racerSub: {
      fontSize: 12,
      marginTop: 3
    },
    winnerBadge: {
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 12,
      color: '#fff',
      fontWeight: '700',
      fontSize: 12
    },
    orderText: {
      fontSize: 13,
      fontWeight: '600'
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(0,0,0,0.1)',
    },
    infoLabel: {
      fontSize: 14,
      fontWeight: '600',
      flex: 1,
    },
    infoValue: {
      fontSize: 14,
      flex: 2,
      textAlign: 'right',
    },
    placeholderText: {
      fontSize: 14,
      textAlign: 'center',
      fontStyle: 'italic',
      marginTop: 20,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 10,
      fontSize: 16,
      color: theme.textSecondary,
    },
    modalOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.5)'
    },
    modalCard: {
      width: '90%',
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
    },
    modalTopRow: {
      flexDirection: 'row',
      alignItems: 'center'
    },
    modalFirstName: {
      fontSize: 14,
      fontWeight: '600'
    },
    modalLastName: {
      fontSize: 18,
      fontWeight: '800'
    },
    modalStatsGrid: {
      marginTop: 8
    },
    modalStatRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(0,0,0,0.06)'
    },
    modalStatLabel: {
      fontSize: 13,
      fontWeight: '600'
    },
    modalStatValue: {
      fontSize: 13,
      fontWeight: '700'
    },
    modalCloseButton: {
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 8,
      marginTop: 8
    },
    // Events tab styles
    // Driver filter styles
    driverFilterContainer: {
      padding: 16,
      marginBottom: 16,
      borderRadius: 12,
      borderWidth: 1,
      backgroundColor: 'transparent',
    },
    driverFilterLabel: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 8,
    },
    driverFilterScrollView: {
      flexDirection: 'row',
    },
    driverFilterButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      marginRight: 8,
      minWidth: 50,
      alignItems: 'center',
    },
    selectedDriverFilterButton: {
      borderWidth: 1,
    },
    driverFilterButtonText: {
      fontSize: 13,
      fontWeight: '600',
    },
    loadingContainer: {
      padding: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      fontSize: 16,
    },
    errorContainer: {
      padding: 20,
      borderRadius: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: '#F44336',
    },
    errorText: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 8,
    },
    errorSubtext: {
      fontSize: 14,
      lineHeight: 20,
    },
    noDataContainer: {
      padding: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      borderWidth: 1,
    },
    noDataText: {
      fontSize: 16,
      textAlign: 'center',
    },
    eventsScrollView: {
      flex: 1,
    },
    eventItem: {
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderLeftWidth: 4,
    },
    eventHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    eventTimeInfo: {
      flex: 1,
    },
    eventSectionName: {
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 4,
    },
    eventTime: {
      fontSize: 12,
      fontWeight: '500',
    },
    eventElapsed: {
      fontSize: 12,
      marginTop: 2,
    },
    lapNumberCircle: {
      width: 55,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: 12,
    },
    lapNumberText: {
      fontSize: 12,
      fontWeight: '700',
    },
    eventDescription: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
    },
    stripedBackground: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
    },
    stripe: {
      flex: 1,
    },
    // Stream Modal Styles
    streamModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    streamModalContainer: {
      backgroundColor: '#fff',
      borderRadius: 12,
      width: '95%',
      maxWidth: 800,
      height: '85%',
      maxHeight: 600,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 10,
      },
      shadowOpacity: 0.5,
      shadowRadius: 20,
      elevation: 20,
    },
    streamModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 15,
      backgroundColor: '#f8f9fa',
      borderBottomWidth: 1,
      borderBottomColor: '#dee2e6',
    },
    streamModalTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: '#FF1E00',
    },
    streamCloseButton: {
      width: 35,
      height: 35,
      borderRadius: 17.5,
      backgroundColor: '#e9ecef',
      justifyContent: 'center',
      alignItems: 'center',
    },
    streamCloseText: {
      fontSize: 20,
      color: '#FF1E00',
      fontWeight: 'bold',
    },
    streamContent: {
      flex: 1,
      position: 'relative',
    },
    streamLoadingContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
    },
    streamLoadingText: {
      color: '#fff',
      marginTop: 10,
      fontSize: 16,
    },
    streamWebView: {
      flex: 1,
    },
    streamSelectorContainer: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 12,
      justifyContent: 'center',
      borderBottomWidth: 1,
    },
    streamSelectorButton: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 8,
      marginHorizontal: 8,
      minWidth: 80,
      alignItems: 'center',
    },
    streamSelectorText: {
      fontSize: 14,
      fontWeight: '600',
    },
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <RaceDetailsHeader />
        {renderTabButtons()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.text }]}>Loading race details...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <RaceDetailsHeader />
      {renderTabButtons()}
      
      <ScrollView
        style={styles.content}
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
        {renderTabContent()}
      </ScrollView>
      {/* Driver details modal */}
      <Modal
        visible={driverModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDriverModalVisible(false)}
      >
        <View style={[styles.modalOverlay]}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {selectedDriverDetails ? (
              <View>
                <View style={styles.modalTopRow}>
                  <View style={{ marginRight: 12 }}>
                    <GridDriverImage
                      headshot={selectedDriverDetails.athlete?.headshot || buildESPNHeadshotUrl(selectedDriverDetails.competitor?.id)}
                      athlete={selectedDriverDetails.athlete}
                      driverName={selectedDriverDetails.competitor?.name}
                      teamColor={selectedDriverDetails.competitor?.teamColor}
                      theme={theme}
                      styles={styles}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text allowFontScaling={false} style={[styles.modalFirstName, { color: theme.text }]} numberOfLines={1}>{selectedDriverDetails.athlete?.firstName || (selectedDriverDetails.competitor?.name || '').split(' ')[0] || ''}</Text>
                    <Text allowFontScaling={false} style={[styles.modalLastName, { color: theme.text }]} numberOfLines={1}>{selectedDriverDetails.athlete?.lastName || ((selectedDriverDetails.competitor?.name || '').split(' ').slice(1).join(' ') || '')}</Text>
                  </View>
                </View>

                <View style={{ height: 12 }} />

                <View style={styles.modalStatsGrid}>
                  {/* helper to read stat by name from stats JSON */}
                  {(() => {
                    const statsJson = selectedDriverDetails.stats || null;
                    const extractStat = (nameCandidates = []) => {
                      if (!statsJson || !statsJson.splits || !Array.isArray(statsJson.splits.categories)) return null;
                      for (const cat of statsJson.splits.categories) {
                        if (!cat || !Array.isArray(cat.stats)) continue;
                        for (const s of cat.stats) {
                          const key = (s.name || s.displayName || s.abbreviation || '').toString().toLowerCase();
                          for (const cand of nameCandidates) {
                            if (key.includes(cand.toLowerCase()) || (s.abbreviation && s.abbreviation.toLowerCase() === cand.toLowerCase())) {
                              return s.displayValue ?? s.value ?? s.text ?? s.rank ?? null;
                            }
                          }
                        }
                      }
                      return null;
                    };

                    const place = selectedDriverDetails.competitor?.order ?? extractStat(['place','p']);
                    const lapsCompleted = selectedDriverDetails.competitor?.laps ?? extractStat(['lapsCompleted','lc','laps']);
                    const totalTime = selectedDriverDetails.competitor?.totalTime ?? extractStat(['totalTime','tot']);
                    const behindTime = selectedDriverDetails.competitor?.behindTime ?? extractStat(['behindtime']);
                    const behindLaps = selectedDriverDetails.competitor?.behindLaps ?? extractStat(['behindlaps','lh']);
                    const championshipPts = extractStat(['championshipPts','cp']);
                    const pitsTaken = extractStat(['pitsTaken']);
                    const fastestLapTime = extractStat(['fastestLap']);
                    const fastestLapNum = extractStat(['fastestLapNum']);

                    return (
                      <>
                        <View style={styles.modalStatRow}>
                          <Text allowFontScaling={false} style={[styles.modalStatLabel, { color: theme.textSecondary }]}>Place</Text>
                          <Text allowFontScaling={false} style={[styles.modalStatValue, { color: theme.text }]}>{place ?? '-'}</Text>
                        </View>
                        <View style={styles.modalStatRow}>
                          <Text allowFontScaling={false} style={[styles.modalStatLabel, { color: theme.textSecondary }]}>Laps</Text>
                          <Text allowFontScaling={false} style={[styles.modalStatValue, { color: theme.text }]}>{lapsCompleted ?? '-'}</Text>
                        </View>
                        {/* Tires section under Laps */}
                        {(() => {
                          // try to find driver number from multiple sources
                          const athlete = selectedDriverDetails.athlete;
                          const competitor = selectedDriverDetails.competitor;
                          const raw = competitor?.raw;
                          
                          // Try various fields that might contain the driver number
                          let driverNumber = null;
                          const candidates = [
                            athlete?.number,
                            athlete?.jerseyNumber,
                            // prefer vehicle number where available (this is the actual F1 number)
                            competitor?.vehicle?.number,
                            raw?.vehicle?.number,
                            raw?.number,
                            raw?.driver_number,
                            raw?.driverNumber,
                            competitor?.id,
                            competitor?.number,
                            // Sometimes ESPN uses specific F1 driver numbers - common ones
                            athlete?.displayName === 'Max Verstappen' ? 1 : null,
                            athlete?.displayName === 'Sergio Perez' ? 11 : null,
                            athlete?.displayName === 'Lewis Hamilton' ? 44 : null,
                            athlete?.displayName === 'George Russell' ? 63 : null,
                            athlete?.displayName === 'Charles Leclerc' ? 16 : null,
                            athlete?.displayName === 'Carlos Sainz Jr.' ? 55 : null,
                          ];
                          
                          for (const candidate of candidates) {
                            if (candidate != null && !isNaN(Number(candidate))) {
                              driverNumber = Number(candidate);
                              break;
                            }
                          }
                          
                          console.log('Driver number detection:', {
                            athleteName: athlete?.displayName || athlete?.shortName,
                            athleteNumber: athlete?.number,
                            competitorRawNumber: raw?.number,
                            competitorVehicleNumber: competitor?.vehicle?.number,
                            competitorId: competitor?.id,
                            finalDriverNumber: driverNumber,
                            allCandidates: candidates,
                            selectedDriverDetails: selectedDriverDetails
                          });

                          // Render as a standard modalStatRow: label on left, value on right
                          return (
                            <View style={styles.modalStatRow}>
                              <Text allowFontScaling={false} style={[styles.modalStatLabel, { color: theme.textSecondary }]}>Tires</Text>
                              {renderTiresInlineForDriver(driverNumber) || (
                                <Text allowFontScaling={false} style={[styles.modalStatValue, { color: theme.text }]}>-</Text>
                              )}
                            </View>
                          );
                        })()}
                        <View style={styles.modalStatRow}>
                          <Text allowFontScaling={false} style={[styles.modalStatLabel, { color: theme.textSecondary }]}>Total Time</Text>
                          <Text allowFontScaling={false} style={[styles.modalStatValue, { color: theme.text }]}>{totalTime ?? (behindLaps != null ? `+${behindLaps} Laps` : '-')}</Text>
                        </View>
                        <View style={styles.modalStatRow}>
                          <Text allowFontScaling={false} style={[styles.modalStatLabel, { color: theme.textSecondary }]}>Gap</Text>
                          <Text allowFontScaling={false} style={[styles.modalStatValue, { color: theme.text }]}>
                            {isLiveRace ? getLiveGapToLeader(selectedDriverDetails.competitor) : (behindTime ?? (behindLaps != null ? `+${behindLaps} Laps` : (selectedDriverDetails.competitor?.totalTime || '-')))}
                          </Text>
                        </View>
                        <View style={styles.modalStatRow}>
                          <Text allowFontScaling={false} style={[styles.modalStatLabel, { color: theme.textSecondary }]}>Champ Pts</Text>
                          <Text allowFontScaling={false} style={[styles.modalStatValue, { color: theme.text }]}>{championshipPts ?? '-'}</Text>
                        </View>
                        <View style={styles.modalStatRow}>
                          <Text allowFontScaling={false} style={[styles.modalStatLabel, { color: theme.textSecondary }]}>Pits</Text>
                          <Text allowFontScaling={false} style={[styles.modalStatValue, { color: theme.text }]}>{pitsTaken ?? '-'}</Text>
                        </View>
                        {fastestLapTime ? (
                          <>
                        <View style={styles.modalStatRow}>
                          <Text allowFontScaling={false} style={[styles.modalStatLabel, { color: theme.textSecondary }]}>Fastest Lap</Text>
                          <Text allowFontScaling={false} style={[styles.modalStatValue, { color: theme.text }]}>{fastestLapTime} - Lap: {fastestLapNum}</Text>
                        </View>
                        </>
                        ) : null }
                      </>
                    );
                  })()}
                </View>

                <View style={{ height: 12 }} />
                <TouchableOpacity onPress={() => setDriverModalVisible(false)} style={[styles.modalCloseButton, { backgroundColor: colors.primary }]}> 
                  <Text allowFontScaling={false} style={{ color: '#fff', fontWeight: '700' }}>Close</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Stream Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={streamModalVisible}
        onRequestClose={closeStreamModal}
      >
        <View style={styles.streamModalOverlay}>
          <View style={[styles.streamModalContainer, { backgroundColor: theme.surface }]}>
            {/* Modal Header */}
            <View style={[styles.streamModalHeader, { backgroundColor: theme.surfaceSecondary, borderBottomColor: theme.border }]}>
              <Text allowFontScaling={false} style={[styles.streamModalTitle, { color: colors.primary }]}>F1 Live Stream</Text>
              <TouchableOpacity style={[styles.streamCloseButton, { backgroundColor: theme.surfaceSecondary }]} onPress={closeStreamModal}>
                <Text allowFontScaling={false} style={[styles.streamCloseText, { color: colors.primary }]}>×</Text>
              </TouchableOpacity>
            </View>

            {/* Stream Selection Buttons */}
            <View style={[styles.streamSelectorContainer, { backgroundColor: theme.surfaceSecondary, borderBottomColor: theme.border }]}>
              <TouchableOpacity 
                style={[
                  styles.streamSelectorButton, 
                  { backgroundColor: selectedStream === 1 ? colors.primary : theme.surface }
                ]} 
                onPress={() => setSelectedStream(1)}
              >
                <Text allowFontScaling={false} style={[
                  styles.streamSelectorText, 
                  { color: selectedStream === 1 ? '#fff' : theme.text }
                ]}>
                  Test 1
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[
                  styles.streamSelectorButton, 
                  { backgroundColor: selectedStream === 2 ? colors.primary : theme.surface }
                ]} 
                onPress={() => setSelectedStream(2)}
              >
                <Text allowFontScaling={false} style={[
                  styles.streamSelectorText, 
                  { color: selectedStream === 2 ? '#fff' : theme.text }
                ]}>
                  Test 2
                </Text>
              </TouchableOpacity>
            </View>

            {/* Stream Content */}
            <View style={styles.streamContent}>
              {isStreamLoading && (
                <View style={styles.streamLoadingContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text allowFontScaling={false} style={[styles.streamLoadingText, { color: theme.text }]}>
                    Loading F1 Stream...
                  </Text>
                </View>
              )}

              {/* F1 Stream WebView - Using NBA's proven approach */}
              <WebView
                source={{ uri: `https://embedsports.top/embed/alpha/sky-sports-f1-sky-f1/${selectedStream}` }}
                style={[styles.streamWebView, { opacity: isStreamLoading ? 0 : 1 }]}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                scalesPageToFit={true}
                mixedContentMode="compatibility"
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                onLoadStart={() => setIsStreamLoading(true)}
                onLoadEnd={() => setIsStreamLoading(false)}
                onError={(error) => {
                  console.error('F1 WebView error:', error);
                  setIsStreamLoading(false);
                }}
                userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1"
                injectedJavaScript={`
                  (function() {
                    console.log('F1 stream ad blocker initializing...');
                    
                    // Block all popup methods
                    const originalOpen = window.open;
                    window.open = function() {
                      console.log('Blocked F1 window.open popup');
                      return null;
                    };
                    
                    // Block alert, confirm, prompt
                    window.alert = function() { console.log('Blocked F1 alert'); };
                    window.confirm = function() { console.log('Blocked F1 confirm'); return false; };
                    window.prompt = function() { console.log('Blocked F1 prompt'); return null; };
                    
                    // Override addEventListener to block popup events
                    const originalAddEventListener = EventTarget.prototype.addEventListener;
                    EventTarget.prototype.addEventListener = function(type, listener, options) {
                      const blockedEvents = ['beforeunload', 'unload', 'popstate'];
                      if (blockedEvents.includes(type)) {
                        console.log('Blocked F1 event listener for:', type);
                        return;
                      }
                      return originalAddEventListener.call(this, type, listener, options);
                    };
                    
                    // Block navigation attempts
                    const originalAssign = Location.prototype.assign;
                    const originalReplace = Location.prototype.replace;
                    
                    Location.prototype.assign = function(url) {
                      console.log('Blocked F1 location.assign to:', url);
                    };
                    
                    Location.prototype.replace = function(url) {
                      console.log('Blocked F1 location.replace to:', url);
                    };
                    
                    // Block href changes
                    Object.defineProperty(Location.prototype, 'href', {
                      set: function(url) {
                        console.log('Blocked F1 href change to:', url);
                      },
                      get: function() {
                        return window.location.href;
                      }
                    });
                    
                    // Remove ads and overlays
                    const removeAds = () => {
                      const selectors = [
                        'iframe[src*="ads"]',
                        'div[class*="ad"]',
                        'div[id*="ad"]',
                        'div[class*="popup"]',
                        'div[id*="popup"]',
                        '[onclick*="window.open"]',
                        '[onclick*="popup"]',
                        '.overlay',
                        '.modal'
                      ];
                      
                      selectors.forEach(selector => {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(el => {
                          el.remove();
                        });
                      });
                    };
                    
                    // Run ad removal on load and periodically
                    document.addEventListener('DOMContentLoaded', removeAds);
                    setInterval(removeAds, 2000);
                    
                    console.log('F1 stream ad blocker fully loaded');
                    true;
                  })();
                `}
                onMessage={(event) => {
                  // Handle messages from injected JavaScript if needed
                  console.log('F1 WebView message:', event.nativeEvent.data);
                }}
                // Block popup navigation within the WebView
                onShouldStartLoadWithRequest={(request) => {
                  console.log('F1 WebView navigation request:', request.url);
                  
                  // Allow the initial stream URL to load
                  const streamUrl = `https://embedsports.top/embed/alpha/sky-sports-f1-sky-f1/${selectedStream}`;
                  if (request.url === streamUrl) {
                    return true;
                  }
                  
                  // Block navigation to obvious popup/ad URLs
                  const popupKeywords = ['popup', 'ad', 'ads', 'click', 'redirect', 'promo'];
                  const hasPopupKeywords = popupKeywords.some(keyword => 
                    request.url.toLowerCase().includes(keyword)
                  );
                  
                  // Block external navigation attempts (popups trying to navigate within WebView)
                  const currentDomain = new URL(streamUrl).hostname;
                  let requestDomain = '';
                  try {
                    requestDomain = new URL(request.url).hostname;
                  } catch (e) {
                    console.log('Invalid F1 URL:', request.url);
                    return false;
                  }
                  
                  // Allow same-domain navigation but block cross-domain (likely popups)
                  if (requestDomain !== currentDomain || hasPopupKeywords) {
                    console.log('Blocked F1 popup/cross-domain navigation:', request.url);
                    return false;
                  }
                  
                  return true;
                }}
                // Handle when WebView tries to open a new window (popup)
                onOpenWindow={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.log('Blocked F1 popup window:', nativeEvent.targetUrl);
                  // Don't open the popup - just log it
                  return false;
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};



export default RaceDetailsScreen;
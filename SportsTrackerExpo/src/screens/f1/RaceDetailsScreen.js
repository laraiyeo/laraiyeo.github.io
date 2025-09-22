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
  Alert,
  Platform,
  Modal
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';
import { useWindowDimensions } from 'react-native';

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

  const tabs = [
    { key: 'INFO', name: 'Info' },
    { key: 'RESULTS', name: 'Results' },
    { key: 'GRID', name: 'Grid' }
  ];

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

  useEffect(() => {
    fetchRaceDetails();
  }, [raceId]);

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
          for (let i = order.length - 1; i >= 0; i--) {
            const r = res[order[i]];
            if (r && Array.isArray(r.competitors) && r.competitors.some(c => c.winner || c.order)) {
              preferred = order[i];
              break;
            }
          }
        }

        if (!preferred) preferred = order[order.length - 1];
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

  const DRIVERS_STANDINGS_URL = "https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2025/types/2/standings/0";

  // Function to fetch driver standings (needed to get event log)
  const fetchDriverStandings = async () => {
    try {
      const response = await fetch(DRIVERS_STANDINGS_URL);
      const data = await response.json();
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
              const parsed = { totalTime: null, laps: null, qual1: null, qual2: null, qual3: null, behindTime: null };
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
      
      // Get venue details for country flag and venue name
      if (eventData.venues && eventData.venues.length > 0) {
        try {
          const venueResponse = await fetch(convertToHttps(eventData.venues[0].$ref));
          const venueData = await venueResponse.json();
          
          setCircuitInfo({
            name: venueData.fullName || 'Unknown Circuit',
            city: venueData.address?.city || '',
            country: venueData.address?.country || '',
            countryFlag: venueData.countryFlag?.href || ''
          });

          // Also try to fetch the circuit resource to obtain diagrams/map images
          try {
            const circuitRef = eventData.circuit?.$ref || eventData.circuit;
            if (circuitRef && typeof circuitRef === 'string') {
              const circuitResp = await fetch(convertToHttps(circuitRef));
              const circuitData = await circuitResp.json();
              const mapHref = getCircuitMapHref(circuitData.diagrams, isDarkMode);
              // collect circuit fields we care about
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

              // if there's a fastestLapDriver ref, fetch the athlete to get displayName
              try {
                const fastestRef = circuitData.fastestLapDriver?.$ref || circuitData.fastestLapDriver;
                if (fastestRef && typeof fastestRef === 'string') {
                  const athlete = await fetchAthleteData(fastestRef);
                  if (athlete) {
                    circuitFields.fastestDriverName = athlete.displayName || athlete.shortName || athlete.fullName || '';
                  }
                }
              } catch (fdErr) {
                // ignore fastest driver fetch errors
              }

              setCircuitInfo(prev => ({ ...(prev || {}), ...circuitFields }));
            }
          } catch (cErr) {
            // ignore circuit fetch errors, map is optional
          }
        } catch (error) {
          console.error('Error fetching venue data:', error);
        }
      }
      
      // Fetch race winner if the race has finished or if winner is present
      const winner = await fetchRaceWinner(eventData);
      if (winner) {
        setWinnerDriver(winner);
      }

      // Determine current/next competition label, but only when the event is in-progress
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
                const isScheduled = statusData && (statusData.type?.name === 'STATUS_SCHEDULED' || statusData.type?.state === 'pre' || (statusData.type?.name && statusData.type?.name.toString().toLowerCase().includes('scheduled')));
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

  const RaceDetailsHeader = () => (
    <View style={styles.headerContainer}>
      <View style={[styles.headerCard, { backgroundColor: theme.surface, borderColor: 'transparent' }]}>
        <View style={styles.headerCardContent}>
          <View style={styles.headerCardLeft}>
            <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
              {raceName || 'F1 Race'}
            </Text>

            {raceDate ? (
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
              <Text allowFontScaling={false} style={[styles.nextCompText, { color: theme.textSecondary }]} numberOfLines={1}>
                {nextCompetitionLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );

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
              {competitionResults[selectedCompetitionId].competitors.map((r) => {
                const compType = competitionResults[selectedCompetitionId]?.type || {};
                const isQual = ((compType.abbreviation || '') + ' ' + (compType.text || '') + ' ' + (compType.displayName || '')).toString().toLowerCase().includes('qual');
                return (
                <View key={r.id} style={[styles.racerRow, { borderLeftColor: r.teamColor || '#000000', backgroundColor: theme.surface }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View style={{ alignItems: 'center', marginRight: 10, width: 40 }}>
                      <View style={[styles.positionBadge, { borderColor: theme.border, backgroundColor: theme.surface }]}> 
                        <Text allowFontScaling={false} style={[styles.positionText, { color: theme.text }]}>{r.order || '-'}</Text>
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
                        <Text allowFontScaling={false} style={[styles.totalTime, { color: theme.text }]} numberOfLines={1}>{r.totalTime || ''}</Text>
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
              // Build grid sorted by place/order from statistics if available (authoritative), otherwise by startOrder
              const comps = (competitionResults[selectedCompetitionId].competitors || []).slice().sort((a,b) => {
                const aOrder = (a.order != null ? Number(a.order) : (a.startOrder != null ? Number(a.startOrder) : Number(a.startPosition ?? 0)) ) || 0;
                const bOrder = (b.order != null ? Number(b.order) : (b.startOrder != null ? Number(b.startOrder) : Number(b.startPosition ?? 0)) ) || 0;
                return aOrder - bOrder;
              });

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
                          {row.left.order ?? row.left.startOrder ?? (rowIndex * 2 + 1)}
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
                          {row.left.behindTime || (row.left.behindLaps != null ? `+${row.left.behindLaps} Laps` : row.left.totalTime) || ''}
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
                          {row.right.order ?? row.right.startOrder ?? (rowIndex * 2 + 2)}
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
                          {row.right.behindTime || (row.right.behindLaps != null ? `+${row.right.behindLaps} Laps` : row.right.totalTime) || ''}
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
      default:
        return renderInfoTab();
    }
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
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <RaceDetailsHeader />
        {renderTabButtons()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text allowFontScaling={false} style={styles.loadingText}>Loading race details...</Text>
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
                    const behindTime = selectedDriverDetails.competitor?.behindTime ?? extractStat(['behind','behindtime']);
                    const behindLaps = selectedDriverDetails.competitor?.behindLaps ?? extractStat(['behindlaps','lh']);
                    const championshipPts = extractStat(['championshipPts','cp']);
                    const pitsTaken = extractStat(['pitsTaken']);

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
                        <View style={styles.modalStatRow}>
                          <Text allowFontScaling={false} style={[styles.modalStatLabel, { color: theme.textSecondary }]}>Total Time</Text>
                          <Text allowFontScaling={false} style={[styles.modalStatValue, { color: theme.text }]}>{totalTime ?? '-'}</Text>
                        </View>
                        <View style={styles.modalStatRow}>
                          <Text allowFontScaling={false} style={[styles.modalStatLabel, { color: theme.textSecondary }]}>Gap</Text>
                          <Text allowFontScaling={false} style={[styles.modalStatValue, { color: theme.text }]}>{behindTime || (behindLaps != null ? `+${behindLaps} Laps` : '-')}</Text>
                        </View>
                        <View style={styles.modalStatRow}>
                          <Text allowFontScaling={false} style={[styles.modalStatLabel, { color: theme.textSecondary }]}>Champ Pts</Text>
                          <Text allowFontScaling={false} style={[styles.modalStatValue, { color: theme.text }]}>{championshipPts ?? '-'}</Text>
                        </View>
                        <View style={styles.modalStatRow}>
                          <Text allowFontScaling={false} style={[styles.modalStatLabel, { color: theme.textSecondary }]}>Pits</Text>
                          <Text allowFontScaling={false} style={[styles.modalStatValue, { color: theme.text }]}>{pitsTaken ?? '-'}</Text>
                        </View>
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
    </View>
  );
};

export default RaceDetailsScreen;
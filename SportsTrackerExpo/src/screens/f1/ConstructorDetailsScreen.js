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
  FlatList
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';
import { useWindowDimensions } from 'react-native';

const ConstructorDetailsScreen = ({ route }) => {
  const { constructorId, constructorName, constructorColor } = route.params || {};
  const { theme, colors, isDarkMode } = useTheme();
  const { isFavorite, toggleFavorite } = useFavorites();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();

  const [selectedTab, setSelectedTab] = useState('STATS');
  const [constructorData, setConstructorData] = useState(null);
  const [raceLog, setRaceLog] = useState([]);
  const [racers, setRacers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const tabs = [
    { key: 'STATS', name: 'Stats' },
    { key: 'RACE_LOG', name: 'Race Log' },
    { key: 'RACERS', name: 'Racers' }
  ];

  useEffect(() => {
    navigation.setOptions({
      title: constructorName || 'Constructor Details',
      headerStyle: {
        backgroundColor: colors.primary,
      },
      headerTintColor: '#fff',
      headerTitleStyle: {
        fontWeight: 'bold',
      },
    });
  }, [navigation, constructorName, colors.primary]);

  useEffect(() => {
    fetchConstructorDetails();
  }, [constructorId]);

  // Normalize/convert various ESPN URLs to HTTPS absolute URLs
  const normalizeUrl = (url) => {
    if (!url) return url;
    if (typeof url !== 'string') return url;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return `https://a.espncdn.com${url}`;
    if (url.startsWith('http://')) return url.replace('http://', 'https://');
    return url;
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

  // Helper: ordinal suffix for positions (1st, 2nd, 3rd, 4th...)
  const ordinalSuffix = (n) => {
    const num = Number(n);
    if (isNaN(num)) return n;
    const tens = num % 100;
    if (tens >= 11 && tens <= 13) return `${num}th`;
    switch (num % 10) {
      case 1: return `${num}st`;
      case 2: return `${num}nd`;
      case 3: return `${num}rd`;
      default: return `${num}th`;
    }
  };

  // Helper: format event date like 'Sat, Sep 20, 08:00 AM'
  const formatEventDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return '';
    const weekday = d.toLocaleString('en-US', { weekday: 'short' });
    const month = d.toLocaleString('en-US', { month: 'short' });
    const day = d.getDate();
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    const pad = (v) => String(v).padStart(2, '0');
    return `${weekday}, ${month} ${day}, ${pad(hour12)}:${pad(minutes)} ${ampm}`;
  };

  // Helper to get F1 team ID for favorites (use team name as ID for F1)
  const getF1TeamId = (teamName) => {
    if (!teamName) return null;
    // Use team name as ID for F1 since there's no consistent numeric ID
    return `f1_${teamName.toLowerCase().replace(/\s+/g, '_')}`;
  };

  // Helper to handle team favorite toggle
  const handleTeamFavoriteToggle = async (teamName, teamColor) => {
    if (!teamName) return;
    
    const teamId = getF1TeamId(teamName);
    try {
      await toggleFavorite({
        teamId: teamId,
        teamName: teamName,
        sport: 'f1',
        leagueCode: 'f1',
        teamColor: teamColor
      });
    } catch (error) {
      console.error('Error toggling F1 team favorite:', error);
    }
  };

  const fetchConstructorDetails = async () => {
    try {
      setLoading(true);
      
      // Fetch constructor statistics and information
      await Promise.all([
        fetchConstructorStats(),
        fetchConstructorRaceLog(),
        fetchConstructorRacers()
      ]);
      
    } catch (error) {
      console.error('Error fetching constructor details:', error);
      Alert.alert('Error', 'Failed to fetch constructor details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchConstructorStats = async () => {
    try {
      console.log('=== FETCH CONSTRUCTOR STATS START ===');
      console.log('Constructor ID:', constructorId);
      console.log('Constructor Name:', constructorName);
      console.log('Constructor Color:', constructorColor);
      
      // If we have a constructorId, try the manufacturer records endpoint (preferred)
      if (constructorId) {
        try {
          const year = new Date().getFullYear();
          let manufUrl = `https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/${year}/types/2/manufacturers/${constructorId}/records/1?lang=en&region=us`;
          let manufResp = await fetch(manufUrl);
          if (!manufResp.ok) {
            // try 2024 as fallback
            manufUrl = `https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2024/types/2/manufacturers/${constructorId}/records/1?lang=en&region=us`;
            manufResp = await fetch(manufUrl);
          }

          if (manufResp.ok) {
            const manufData = await manufResp.json();
            console.log('Manufacturer records response:', JSON.stringify(manufData, null, 2));

            // manufData has a stats array (see c1.txt)
            const statsArr = manufData.stats || manufData?.records?.[0]?.stats || [];
            const statsMap = {};
            statsArr.forEach(s => {
              statsMap[s.name] = s;
            });

            const statsData = {
              name: constructorName || manufData.displayName || manufData.name,
              color: constructorColor,
              logo: getConstructorLogo(constructorName || manufData.displayName || manufData.name),
              points: statsMap.points?.displayValue || statsMap.championshipPts?.displayValue || '0',
              wins: statsMap.wins?.displayValue || '0',
              polePositions: statsMap.poles?.displayValue || statsMap.polePositions?.displayValue || '0',
              rank: statsMap.rank?.displayValue || statsMap.rank?.value || null,
              starts: statsMap.starts?.displayValue || statsMap.starts?.value || null,
              topFinish: statsMap.topFinish?.displayValue || statsMap.topFinish?.value || null,
              rawStats: statsArr
            };

            console.log('=== SETTING CONSTRUCTOR DATA FROM MANUFACTURER RECORDS ===');
            console.log(JSON.stringify(statsData, null, 2));
            setConstructorData(statsData);
            return;
          }
        } catch (manErr) {
          console.warn('Manufacturer records fetch failed, falling back to standings:', manErr);
        }
      }

      // Try the current season standings as a fallback
      const currentYear = new Date().getFullYear();
      let response = await fetch(`https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/${currentYear}/types/2/standings/1`);
      
      if (!response.ok) {
        console.log(`Current year (${currentYear}) failed, trying 2024...`);
        response = await fetch('https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2024/types/2/standings/1');
      }
      
      const data = await response.json();
      console.log('=== CONSTRUCTOR STANDINGS RESPONSE ===');
      console.log(JSON.stringify(data, null, 2));

      if (data?.standings) {
        console.log(`Found ${data.standings.length} standings entries`);
        
        // Check each standing entry
        for (let i = 0; i < data.standings.length; i++) {
          const standing = data.standings[i];
          console.log(`\n--- Standing ${i} ---`);
          console.log('Full standing:', JSON.stringify(standing, null, 2));
          
          const teamName = standing.team?.displayName || standing.team?.name || '';
          console.log(`Team name: "${teamName}"`);
          console.log(`Looking for: "${constructorName}"`);
          
          // More flexible matching
          const matches = teamName && (
            teamName.toLowerCase() === (constructorName || '').toLowerCase() ||
            teamName.toLowerCase().includes((constructorName || '').toLowerCase()) ||
            (constructorName || '').toLowerCase().includes(teamName.toLowerCase())
          );
          
          console.log(`Match result: ${matches}`);
          
          if (matches) {
            console.log('=== FOUND MATCHING CONSTRUCTOR ===');
            console.log('Matched standing:', JSON.stringify(standing, null, 2));
            
            const records = standing.records || [];
            console.log('Records:', records);
            
            let points = '0', wins = '0', poles = '0', rank = null, starts = null, topFinish = null;
            
            if (records.length > 0) {
              const stats = records[0].stats || [];
              console.log('Stats:', stats);
              
              stats.forEach(stat => {
                console.log(`Stat: ${stat.name} = ${stat.displayValue}`);
                switch (stat.name) {
                  case 'championshipPts':
                  case 'points':
                    points = stat.displayValue || '0';
                    break;
                  case 'wins':
                    wins = stat.displayValue || '0';
                    break;
                  case 'poles':
                  case 'polePositions':
                    poles = stat.displayValue || '0';
                    break;
                  case 'rank':
                    rank = stat.displayValue || stat.value || null;
                    break;
                  case 'starts':
                    starts = stat.displayValue || stat.value || null;
                    break;
                  case 'topFinish':
                    topFinish = stat.displayValue || stat.value || null;
                    break;
                }
              });
            }
            
            const logo = getConstructorLogo(constructorName);
            console.log('Generated logo URL:', logo);
            
            const statsData = {
              name: constructorName,
              color: constructorColor,
              logo: logo,
              points: points,
              wins: wins,
              polePositions: poles,
              rank: rank,
              starts: starts,
              topFinish: topFinish
            };
            
            console.log('=== SETTING CONSTRUCTOR DATA ===');
            console.log(JSON.stringify(statsData, null, 2));
            setConstructorData(statsData);
            return;
          }
        }
        
        console.log('=== NO MATCHING CONSTRUCTOR FOUND ===');
        // Set basic data even if not found in standings
        const fallbackData = {
          name: constructorName,
          color: constructorColor,
          logo: getConstructorLogo(constructorName),
          points: '0',
          wins: '0',
          polePositions: '0'
        };
        
        console.log('Setting fallback data:', fallbackData);
        setConstructorData(fallbackData);
      } else {
        console.log('No standings found in response');
        throw new Error('No standings data found');
      }
    } catch (error) {
      console.error('Error fetching constructor stats:', error);
      // Set basic data on error
      setConstructorData({
        name: constructorName,
        color: constructorColor,
        logo: getConstructorLogo(constructorName),
        points: '0',
        wins: '0',
        polePositions: '0'
      });
    }
  };

  const fetchConstructorRaceLog = async () => {
    try {
      const nowMs = Date.now();

      // Fetch calendar first (same approach as ResultsScreen)
      const calUrl = 'https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/calendar/ondays?lang=en&region=us';
      const calResp = await fetch(calUrl);
      const calJson = await calResp.json();

      if (!calJson || !Array.isArray(calJson.sections)) {
        console.log('Invalid calendar data for race log');
        setRaceLog([]);
        return;
      }

      // Simple ref cache and URL normalizer
      const refCache = new Map();
      const convertToHttps = (url) => {
        if (!url) return url;
        if (url.startsWith('//')) return `https:${url}`;
        if (url.startsWith('/')) return `https://a.espncdn.com${url}`;
        if (url.startsWith('http://')) return url.replace('http://', 'https://');
        return url;
      };

      const fetchRef = async (refUrl) => {
        if (!refUrl) return null;
        const normalized = convertToHttps(refUrl);
        if (refCache.has(normalized)) return refCache.get(normalized);
        try {
          const resp = await fetch(normalized);
          const json = await resp.json();
          refCache.set(normalized, json);
          return json;
        } catch (err) {
          console.warn('Failed to fetch ref', normalized, err);
          refCache.set(normalized, null);
          return null;
        }
      };

      const events = [];

      // Process calendar sections
      for (const section of calJson.sections) {
        try {
          const evName = section.label || section.title || 'Event';
          const startDate = section.startDate || section.event?.startDate || section.event?.date;
          const endDate = section.endDate || section.event?.endDate || section.event?.date;
          const eventRef = section.event?.$ref;

          if (!eventRef) continue;

          const eventData = await fetchRef(eventRef);
          if (!eventData) continue;

          // Determine event status
          const startMs = startDate ? Date.parse(startDate) : (eventData.date ? Date.parse(eventData.date) : null);
          const endMs = endDate ? Date.parse(endDate) : (eventData.endDate ? Date.parse(eventData.endDate) : null);
          const endPlusOne = endMs ? (endMs + 24 * 60 * 60 * 1000) : null;

          const isCompleted = endPlusOne ? nowMs > endPlusOne : false;
          const isUpcoming = startMs ? nowMs < startMs : false;
          const isInProgress = !isCompleted && !isUpcoming;

          // Only keep finished & in-progress races per request
          if (!isCompleted && !isInProgress) continue;

          // Get venue name and country flag
          let venueName = '';
          let countryFlag = '';
          if (eventData.venues && eventData.venues.length > 0 && eventData.venues[0].$ref) {
            try {
              const venueData = await fetchRef(eventData.venues[0].$ref);
              venueName = venueData?.fullName || '';
              // Try to get country flag from venue
              if (venueData?.address?.country) {
                countryFlag = venueData.countryFlag.href || '';
              }
            } catch (venueErr) {
              console.warn('Failed to fetch venue info for race log event', eventData.id, venueErr);
            }
          }

          // Get constructor drivers' competition data
          const driverResults = [];
          // ensure usedCompetition is available outside the inner try/catch
          let usedCompetition = null;
          try {
            // Find the main race competition (not sprint)
            const raceCompetition = (eventData.competitions || []).find(comp => {
              const type = comp.type || {};
              const name = (type.name || type.displayName || type.abbreviation || type.text || '').toString().toLowerCase();
              return name.includes('race') && !name.includes('sprint');
            });

            // For in-progress races or races without timing data, use the most recent completed competition (like teams.js)
            usedCompetition = raceCompetition;
            
            // If race is in progress OR the race competition lacks competitor data, find fallback
            if ((isInProgress || !usedCompetition || !usedCompetition.competitors || usedCompetition.competitors.length === 0) && Array.isArray(eventData.competitions)) {
              // Search competitions in reverse for most recent completed one with timing data
              for (let i = eventData.competitions.length - 1; i >= 0; i--) {
                const c = eventData.competitions[i];
                const type = c.type || {};
                const name = (type.name || type.displayName || type.abbreviation || type.text || '').toString().toLowerCase();
                
                // Skip sprints when looking for fallback results
                if (name.includes('sprint')) continue;
                
                // For in-progress races, skip the main race competition itself and look for qualifying/practice
                if (isInProgress && name.includes('race')) continue;
                
                // Check if this competition has competitor data with timing
                if (c.competitors && c.competitors.length > 0) {
                  // Verify it has actual timing data by checking if any competitor has stats
                  const hasTimingData = c.competitors.some(comp => 
                    comp.statistics || comp.result || (comp.athlete && comp.athlete.$ref)
                  );
                  
                  if (hasTimingData) {
                    usedCompetition = c;
                    console.log(`Using fallback competition for ${eventData.name}:`, type.abbreviation || type.name);
                    break;
                  }
                }
              }
            }

            if (usedCompetition && usedCompetition.competitors) {
              // Filter competitors by constructor - normalize names and also check vehicle.manufacturer
              const constructorDrivers = usedCompetition.competitors.filter(comp => {
                const teamNameRaw = comp.team?.displayName || comp.team?.name || '';
                const vehicleManufacturer = comp.vehicle?.manufacturer || '';
                const teamName = (teamNameRaw || vehicleManufacturer || '').toString().trim().toLowerCase();
                const ctorName = (constructorName || '').toString().trim().toLowerCase();
                return teamName === ctorName || vehicleManufacturer.toString().trim().toLowerCase() === ctorName;
              });

              for (const driver of constructorDrivers) {
                try {
                  // competitor may have athlete as a ref or embedded
                  let athlete = driver.athlete;
                  if (athlete && athlete.$ref) {
                    const refData = await fetchRef(athlete.$ref);
                    if (refData) athlete = refData;
                  }

                  // driver display name fallbacks
                  const driverName = driver.displayName || driver.name || athlete?.displayName || athlete?.shortName || 'Unknown Driver';

                  // Try embedded result fields first
                  let totalTime = null;
                  let laps = null;
                  if (driver.result) {
                    if (driver.result.time) totalTime = driver.result.time.displayValue || driver.result.time.text || (driver.result.time.value ? String(driver.result.time.value) : null);
                    if (driver.result.laps != null) laps = driver.result.laps;
                  }

                  // Try competitor statistics array
                  if ((!totalTime || !laps) && Array.isArray(driver.statistics)) {
                    for (const s of driver.statistics) {
                      const key = (s.name || s.displayName || '').toString().toLowerCase();
                      const val = s.value ?? s.displayValue ?? s.text ?? s.rank ?? null;
                      if (!totalTime && key === 'totaltime') totalTime = val;
                      if (!laps && key === 'lapscompleted') laps = val;
                    }
                  }

                  // If still missing, try athlete-level statistics
                  if ((!totalTime || !laps) && athlete) {
                    const aStats = athlete.statistics || athlete.stats || [];
                    if (Array.isArray(aStats)) {
                      for (const s of aStats) {
                        const key = (s.name || s.displayName || '').toString().toLowerCase();
                        const val = s.value ?? s.displayValue ?? s.text ?? s.rank ?? null;
                        if (!totalTime && key === 'totaltime') totalTime = val;
                        if (!laps && key === 'lapscompleted') laps = val;
                      }
                    }
                  }

                  // As a last resort, fetch competitor statistics endpoint (like RaceDetailsScreen does)
                  if ((!totalTime || !laps) && usedCompetition.$ref && (driver.id || driver.uid)) {
                    try {
                      const baseComp = ('' + usedCompetition.$ref).split('?')[0];
                      const compId = driver.id || driver.uid;
                      const statRef = `${baseComp}/competitors/${compId}/statistics?lang=en&region=us`;
                      const statsResp = await fetch(normalizeUrl(statRef));
                      if (statsResp && statsResp.ok) {
                        const statsJson = await statsResp.json();
                        console.log(`Fetched competitor stats for ${driverName}:`, statsJson);
                        // parse statsJson categories if present
                        const parsed = { totalTime: null, laps: null };
                        const splits = statsJson?.splits;
                        if (splits && Array.isArray(splits.categories)) {
                          for (const cat of splits.categories) {
                            if (!cat || !Array.isArray(cat.stats)) continue;
                            for (const s of cat.stats) {
                              const key = (s.name || s.displayName || s.abbreviation || '').toString().toLowerCase();
                              const val = s.displayValue ?? s.value ?? s.text ?? s.rank ?? null;
                              if (!parsed.laps && key === 'lapscompleted') parsed.laps = val;
                              if (!parsed.totalTime && key === 'totaltime') parsed.totalTime = val;
                              // Check abbreviations too
                              const ab = (s.abbreviation || '').toString().toLowerCase();
                              if (!parsed.totalTime && ab === 'totaltime') parsed.totalTime = val;
                              if (!parsed.laps && ab === 'lapscompleted') parsed.laps = val;
                            }
                          }
                        }
                        if (!totalTime && parsed.totalTime) totalTime = parsed.totalTime;
                        if (!laps && parsed.laps) laps = parsed.laps;
                        // fallback: direct fields
                        if (!totalTime && statsJson?.totalTime) totalTime = statsJson.totalTime.displayValue ?? statsJson.totalTime;
                        if (!laps && statsJson?.lapsCompleted) laps = statsJson.lapsCompleted.displayValue ?? statsJson.lapsCompleted;
                        
                        console.log(`Parsed stats for ${driverName}: time=${totalTime}, laps=${laps}`);
                      }
                    } catch (e) {
                      console.warn('Error fetching competitor stats:', e);
                    }
                  }

                  // normalize time if numeric
                  if (typeof totalTime === 'number') totalTime = formatMs(totalTime);

                  // If race has completed and no totalTime, mark as DNF
                  if (isCompleted && (!totalTime || totalTime === '--:--:---')) {
                    totalTime = 'DNF';
                  }

                  if (laps == null) laps = '0';

                  // format position with ordinal suffix when available
                  const rawPos = driver.order || driver.rank;
                  const positionText = rawPos != null && rawPos !== '--' ? ordinalSuffix(rawPos) : '--';

                  driverResults.push({
                    name: `${driverName} - ${positionText}`,
                    totalTime: totalTime,
                    laps: laps,
                    position: rawPos || '--'
                  });
                } catch (driverErr) {
                  console.warn('Error processing driver data:', driverErr);
                }
              }
            }
          } catch (compErr) {
            console.warn('Error fetching competition data for race:', eventData.name, compErr);
          }

          // Determine the display date: for completed events use the event start date; for in-progress use the most recent completed competition's date (usedCompetition)
          let displayDateRaw = eventData.startDate || eventData.date || startDate || null;
          if (isInProgress && usedCompetition) {
            // try competition date fields
            displayDateRaw = usedCompetition.startDate || usedCompetition.date || usedCompetition.competitionDate || displayDateRaw;
          }

          // Determine competition type and status
          const status = isCompleted ? 'Final' : (isInProgress ? 'In Progress' : 'Scheduled');
          const competitionType = usedCompetition?.type?.text || usedCompetition?.type?.abbreviation || 'Race';

          events.push({
            id: eventData.id || eventData.uid || `${eventData.name}_${eventData.date}`,
            name: eventData.name || eventData.shortName || evName,
            date: eventData.date || eventData.startDate || startDate || null,
            displayDateRaw,
            displayDate: displayDateRaw ? formatEventDate(displayDateRaw) : '',
            venue: venueName || eventData.venue?.fullName || 'Unknown Venue',
            countryFlag,
            status,
            competitionType,
            isCompleted,
            isInProgress,
            drivers: driverResults
          });
        } catch (secErr) {
          console.warn('Failed to process calendar section for race log', secErr);
        }
      }

      // Sort newest first (reverse chronological order)
      const sorted = events
        .filter(e => e.date)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      console.log('Constructor race log events count:', sorted.length);
      setRaceLog(sorted);
    } catch (error) {
      console.error('Error fetching race log:', error);
      setRaceLog([]);
    }
  };

  const fetchConstructorRacers = async () => {
    try {
      // Fetch current driver standings and filter by constructor
      const response = await fetch('https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2025/types/2/standings/0');
      const data = await response.json();
      
      console.log('Driver standings data:', data);
      
      if (data?.standings) {
        const constructorDrivers = [];
        
        for (const standing of data.standings) {
          try {
            const athleteUrl = normalizeUrl(standing.athlete.$ref);
            const athleteResponse = await fetch(athleteUrl);
            const athleteData = await athleteResponse.json();

            console.log('Checking driver:', athleteData.displayName);

            // Get team information from event log or vehicles array (robust like StandingsScreen)
            let driverTeam = 'Unknown Team';
            try {
              if (athleteData.eventLog && athleteData.eventLog.$ref) {
                const eventLogUrl = normalizeUrl(athleteData.eventLog.$ref);
                const eventLogResponse = await fetch(eventLogUrl);
                const eventLogData = await eventLogResponse.json();

                if (eventLogData.events?.items?.length > 0) {
                  const firstEvent = eventLogData.events.items[0];
                  if (firstEvent.team) {
                    driverTeam = firstEvent.team.displayName || firstEvent.team.name || driverTeam;
                  } else if (firstEvent.competitor && firstEvent.competitor.$ref) {
                    // Try competitor ref to get vehicle/manufacturer
                    const compUrl = normalizeUrl(firstEvent.competitor.$ref);
                    try {
                      const compResp = await fetch(compUrl);
                      const compData = await compResp.json();
                      if (compData.vehicle?.manufacturer) {
                        driverTeam = compData.vehicle.manufacturer;
                      }
                    } catch (compErr) {
                      // ignore
                    }
                  }
                }
              }

              // Fallback to vehicles array
              if ((driverTeam === 'Unknown Team' || !driverTeam) && athleteData.vehicles && athleteData.vehicles.length > 0) {
                driverTeam = athleteData.vehicles[0].team || athleteData.vehicles[0].manufacturer || driverTeam;
              }
            } catch (teamError) {
              console.error('Could not fetch team data for driver:', athleteData.displayName, teamError);
              if (athleteData.vehicles && athleteData.vehicles.length > 0) {
                driverTeam = athleteData.vehicles[0].team || athleteData.vehicles[0].manufacturer || driverTeam;
              }
            }

            console.log('Driver team:', driverTeam, 'vs constructor:', constructorName);

            const normalizedDriverTeam = (driverTeam || '').toString().trim().toLowerCase();
            const normalizedConstructor = (constructorName || '').toString().trim().toLowerCase();

            if (normalizedDriverTeam === normalizedConstructor) {
              console.log('Found driver for constructor:', athleteData.displayName);
              constructorDrivers.push({
                id: athleteData.id,
                name: athleteData.displayName || athleteData.name,
                firstName: athleteData.firstName || '',
                lastName: athleteData.lastName || '',
                nationality: athleteData.citizenship || '',
                headshot: buildESPNHeadshotUrl(athleteData.id) || athleteData.headshot?.href || null,
                points: (Array.isArray(standing.records?.[0]?.stats) ? standing.records[0].stats.find(stat => stat.name === 'championshipPts')?.displayValue : standing.records?.[0]?.stats?.championshipPts?.displayValue) || '0',
                wins: (Array.isArray(standing.records?.[0]?.stats) ? standing.records[0].stats.find(stat => stat.name === 'wins')?.displayValue : standing.records?.[0]?.stats?.wins?.displayValue) || '0',
                position: constructorDrivers.length + 1
              });
            }
          } catch (error) {
            console.error('Error processing driver:', error);
          }
        }
        
        console.log('Final constructor drivers:', constructorDrivers);
        setRacers(constructorDrivers);
      }
    } catch (error) {
      console.error('Error fetching constructor racers:', error);
    }
  };

  // Build constructor logo URL
  const getConstructorLogo = (constructorName, forceWhite = false) => {
    // Mirror the logic used in f1/teams.js to ensure consistent logo selection
    if (!constructorName) return '';

    const nameMap = {
      'McLaren': 'mclaren',
      'Ferrari': 'ferrari',
      'Red Bull': 'redbullracing',
      'Mercedes': 'mercedes',
      'Aston Martin': 'astonmartin',
      'Alpine': 'alpine',
      'Williams': 'williams',
      'RB': 'rb',
      'Haas': 'haas',
      'Sauber': 'kicksauber'
    };

    const blackLogoConstructors = ['Williams', 'Alpine', 'Mercedes', 'Sauber'];
    const logoColor = (forceWhite || !blackLogoConstructors.includes(constructorName)) ? 'logowhite' : 'logoblack';

    const logoName = nameMap[constructorName] || constructorName.toLowerCase().replace(/\s+/g, '');
    return `https://media.formula1.com/image/upload/c_fit,h_1080/q_auto/v1740000000/common/f1/2025/${logoName}/2025${logoName}${logoColor}.webp`;
  };

  // Build ESPN headshot URL
  const buildESPNHeadshotUrl = (athleteId) => {
    if (!athleteId) return null;
    return `https://a.espncdn.com/i/headshots/rpm/players/full/${athleteId}.png`;
  };

  // Helper to get initials
  const getInitials = (firstName = '', lastName = '') => {
    const first = firstName?.trim()?.[0] || '';
    const last = lastName?.trim()?.[0] || '';
    return (first + last).toUpperCase() || '--';
  };

  // Component for racer image with fallback to initials
  const RacerImage = ({ racer, constructorColor }) => {
    const [imageError, setImageError] = useState(false);
    
    if (!racer.headshot || imageError) {
      return (
        <View style={[
          styles.racerImagePlaceholder, 
          { backgroundColor: constructorColor || theme.border }
        ]}>
          <Text allowFontScaling={false} style={[styles.racerInitials, { color: '#fff' }]}>
            {getInitials(racer.firstName, racer.lastName)}
          </Text>
        </View>
      );
    }
    
    return (
      <Image
        source={{ uri: racer.headshot }}
        style={[styles.racerImage, { borderColor: constructorColor }]}
        onError={() => setImageError(true)}
      />
    );
  };

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetchConstructorDetails();
  }, []);

  const renderStatsTab = () => (
    <View style={styles.tabContent}>
      {constructorData ? (
        <>
          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text allowFontScaling={false} style={[styles.statValue, { color: theme.text }]}>
                {constructorData.points}
              </Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>
                Championship Points
              </Text>
            </View>
            
            <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text allowFontScaling={false} style={[styles.statValue, { color: theme.text }]}>
                {constructorData.wins}
              </Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>
                Wins
              </Text>
            </View>
            
            <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text allowFontScaling={false} style={[styles.statValue, { color: theme.text }]}>
                {constructorData.polePositions}
              </Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>
                Pole Positions
              </Text>
            </View>
            
            <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text allowFontScaling={false} style={[styles.statValue, { color: theme.text }]}>
                {constructorData.rank ?? '-'}
              </Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>
                Rank
              </Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text allowFontScaling={false} style={[styles.statValue, { color: theme.text }]}>
                {constructorData.starts ?? '-'}
              </Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>
                Starts
              </Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text allowFontScaling={false} style={[styles.statValue, { color: theme.text }]}>
                {constructorData.topFinish ?? '-'}
              </Text>
              <Text allowFontScaling={false} style={[styles.statLabel, { color: theme.textSecondary }]}>
                Top Finish
              </Text>
            </View>
          </View>
        </>
      ) : (
        <Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.textSecondary }]}>
          No constructor data available
        </Text>
      )}
    </View>
  );

  const renderRaceLogTab = () => (
    <View style={styles.tabContent}>
      {raceLog.length > 0 ? (
        <FlatList
          data={raceLog}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            // Outline in-progress cards with constructor color
            const borderColor = item.isInProgress ? (constructorColor || colors.primary) : theme.border;
            const borderWidth = item.isInProgress ? 2 : 1;
            
            return (
              <View style={[styles.raceLogItem, { backgroundColor: theme.surface, borderColor, borderWidth }]}>
                {/* NFL-style header stripe with event name */}
                <View style={[styles.cardHeader, { backgroundColor: theme.surfaceSecondary }]}>
                  <Text allowFontScaling={false} style={[styles.cardHeaderText, { color: theme.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                </View>

                {/* Circuit and Date row */}
                <View style={styles.circuitDateRow}>
                  <View style={styles.circuitInfo}>
                    {item.countryFlag && (
                      <Image
                        source={{ uri: item.countryFlag }}
                        style={styles.countryFlag}
                        onError={() => {/* fail silently */}}
                      />
                    )}
                    <Text allowFontScaling={false} style={[styles.circuitName, { color: theme.textSecondary }]} numberOfLines={1}>
                      {item.venue}
                    </Text>
                  </View>
                  <Text allowFontScaling={false} style={[styles.raceDate, { color: theme.textSecondary }]}>
                    {item.displayDate || (item.date ? formatEventDate(item.date) : '')}
                  </Text>
                </View>

                {/* Constructor name with logo */}
                <View style={styles.constructorHeader}>
                  {isFavorite(getF1TeamId(constructorName)) && (
                    <TouchableOpacity 
                      onPress={() => handleTeamFavoriteToggle(constructorName, constructorColor)}
                      activeOpacity={0.7}
                      style={styles.raceCardFavoriteButton}
                    >
                      <Text allowFontScaling={false} style={[styles.raceCardFavoriteIcon, { color: colors.primary }]}>
                        ★
                      </Text>
                    </TouchableOpacity>
                  )}
                  {constructorData?.logo && !logoError ? (
                    <View style={[styles.constructorLogoContainer, { backgroundColor: constructorColor || theme.border }]}>
                      <Image 
                        source={{ uri: constructorData.logo }} 
                        style={styles.constructorLogo}
                        resizeMode="contain"
                        onError={() => setLogoError(true)}
                      />
                    </View>
                  ) : (
                    <View style={[styles.constructorLogoPlaceholder, { backgroundColor: constructorColor || theme.border }]}>
                      <Text allowFontScaling={false} style={styles.constructorInitials}>
                        {constructorName ? constructorName.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase() : 'CT'}
                      </Text>
                    </View>
                  )}
                    <Text allowFontScaling={false} style={[styles.constructorName, { color: isFavorite(getF1TeamId(constructorName)) ? colors.primary : theme.text }]} numberOfLines={1}>
                      {constructorName}
                    </Text>
                </View>

                {/* Driver Results Side by Side */}
                {item.drivers && item.drivers.length > 0 && (
                  <View style={styles.driversContainer}>
                    <View style={styles.driversRow}>
                      {/* Left Driver */}
                      <View style={styles.driverColumn}>
                        {item.drivers[0] && (
                          <>
                            <Text allowFontScaling={false} style={[styles.driverName, { color: theme.text }]} numberOfLines={1}>
                              {item.drivers[0].name}
                            </Text>
                            <Text allowFontScaling={false} style={[styles.driverTime, { color: theme.text }]}>
                              {item.drivers[0].totalTime}
                            </Text>
                            <Text allowFontScaling={false} style={[styles.driverLaps, { color: theme.textSecondary }]}>
                              Laps: {item.drivers[0].laps}
                            </Text>
                          </>
                        )}
                      </View>

                      {/* Divider Line */}
                      <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />

                      {/* Right Driver */}
                      <View style={styles.driverColumn}>
                        {item.drivers[1] && (
                          <>
                            <Text allowFontScaling={false} style={[styles.driverName, { color: theme.text }]} numberOfLines={1}>
                              {item.drivers[1].name}
                            </Text>
                            <Text allowFontScaling={false} style={[styles.driverTime, { color: theme.text }]}>
                              {item.drivers[1].totalTime}
                            </Text>
                            <Text allowFontScaling={false} style={[styles.driverLaps, { color: theme.textSecondary }]}>
                              Laps: {item.drivers[1].laps}
                            </Text>
                          </>
                        )}
                      </View>
                    </View>
                  </View>
                )}

                {/* Status Footer */}
                <View style={[styles.statusFooter, { borderTopColor: theme.border, backgroundColor: theme.surfaceSecondary }]}>
                  <Text allowFontScaling={false} style={[styles.statusText, { color: theme.textSecondary }]}>
                    {item.status} - {item.competitionType}
                  </Text>
                </View>
              </View>
            );
          }}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.textSecondary }]}>
          No race log data available
        </Text>
      )}
    </View>
  );

  const renderRacersTab = () => (
    <View style={styles.tabContent}>
      {racers.length > 0 ? (
        <FlatList
          data={racers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.racerItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => {
                navigation.navigate('RacerDetailsScreen', {
                  racerId: item.id,
                  racerName: item.name,
                  teamColor: constructorColor
                });
              }}
            >
              <View style={styles.racerInfo}>
                <RacerImage racer={item} constructorColor={constructorColor} />
                
                <View style={styles.racerDetails}>
                  <Text allowFontScaling={false} style={[styles.racerName, { color: theme.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.racerNationality, { color: theme.textSecondary }]} numberOfLines={1}>
                    {item.nationality}
                  </Text>
                </View>
              </View>
              
              <View style={styles.racerStats}>
                <View style={styles.racerStatItem}>
                  <Text allowFontScaling={false} style={[styles.racerStatValue, { color: theme.text }]}>
                    {item.points}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.racerStatLabel, { color: theme.textSecondary }]}>
                    PTS
                  </Text>
                </View>
                
                <View style={styles.racerStatItem}>
                  <Text allowFontScaling={false} style={[styles.racerStatValue, { color: theme.text }]}>
                    {item.wins}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.racerStatLabel, { color: theme.textSecondary }]}>
                    WINS
                  </Text>
                </View>
                
                {/* podiums removed */}
              </View>
            </TouchableOpacity>
          )}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <Text allowFontScaling={false} style={[styles.placeholderText, { color: theme.textSecondary }]}>
          No racers data available
        </Text>
      )}
    </View>
  );

  const renderTabContent = () => {
    switch (selectedTab) {
      case 'STATS':
        return renderStatsTab();
      case 'RACE_LOG':
        return renderRaceLogTab();
      case 'RACERS':
        return renderRacersTab();
      default:
        return renderStatsTab();
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    constructorHeaderSection: {
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 3.84,
      elevation: 5,
    },
    constructorHeaderContent: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 20,
    },
    constructorHeaderLogoContainer: {
      marginRight: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    constructorHeaderLogo: {
      width: 80,
      height: 80,
    },
    constructorHeaderLogoCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden'
    },
    constructorHeaderLogoInCircle: {
      width: 60,
      height: 60,
    },
    constructorHeaderInitials: {
      width: 80,
      height: 80,
      borderRadius: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    constructorHeaderInitialsText: {
      fontSize: 24,
      fontWeight: 'bold',
      color: '#fff',
    },
    constructorHeaderInfo: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    constructorHeaderNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerFavoriteButton: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginRight: 8,
    },
    headerFavoriteIcon: {
      fontSize: 25,
      fontWeight: '700',
      marginTop: -10,
    },
    raceCardFavoriteButton: {
      paddingHorizontal: 4,
      paddingVertical: 2,
      marginRight: 8,
    },
    raceCardFavoriteIcon: {
      fontSize: 16,
      fontWeight: '700',
    },
    constructorHeaderName: {
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 8,
    },
    constructorHeaderColorBar: {
      height: 4,
      width: 120,
      borderRadius: 2,
    },
    constructorHeaderPoints: {
      alignItems: 'center',
      paddingLeft: 16,
    },
    constructorHeaderPointsNumber: {
      fontSize: 32,
      fontWeight: 'bold',
    },
    constructorHeaderPointsLabel: {
      fontSize: 12,
      marginTop: 4,
    },
    constructorRank: {
      fontSize: 12,
      opacity: 0.9,
    },
    mainFavoriteButton: {
      position: 'absolute',
      left: -20,
      top: 0,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    mainFavoriteIcon: {
      fontSize: 20,
      fontWeight: 'bold',
    },
    tabContainer: {
      flexDirection: 'row',
      backgroundColor: theme.surface,
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
    activeTabButton: {
      backgroundColor: colors.primary,
    },
    tabButtonText: {
      fontSize: 14,
      fontWeight: '600',
    },
    activeTabButtonText: {
      color: '#fff',
    },
    inactiveTabButtonText: {
      color: theme.textSecondary,
    },
    tabContent: {
      flex: 1,
      paddingHorizontal: 20,
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
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    statCard: {
      width: (width - 60) / 2,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      alignItems: 'center',
    },
    statValue: {
      fontSize: 28,
      fontWeight: 'bold',
      marginBottom: 4,
    },
    statLabel: {
      fontSize: 12,
      textAlign: 'center',
    },
    raceLogItem: {
      borderRadius: 12,
      padding: 0,
      marginBottom: 12,
      borderWidth: 1,
      overflow: 'hidden',
    },
    // NFL-style header stripe
    cardHeader: {
      backgroundColor: theme.surface,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    cardHeaderText: {
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'center',
    },
    // Race info section
    raceInfo: {
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    // Circuit and date row
    circuitDateRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    circuitInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    countryFlag: {
      width: 16,
      height: 12,
      marginRight: 6,
      borderRadius: 2,
    },
    circuitName: {
      fontSize: 13,
      flex: 1,
    },
    // Constructor header
    constructorHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      // removed bottom border to eliminate extra underline under constructor name
    },
    constructorLogo: {
      width: 22,
      height: 22,
      marginRight: 0,
    },
    constructorLogoContainer: {
      width: 24,
      height: 24,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 8,
      padding: 2,
    },
    constructorLogoPlaceholder: {
      width: 24,
      height: 24,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 8,
    },
    constructorInitials: {
      fontSize: 10,
      fontWeight: 'bold',
      color: '#fff',
    },
    constructorName: {
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
    // Status footer
    statusFooter: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderTopWidth: 1,
      alignItems: 'center',
    },
    statusText: {
      fontSize: 12,
      fontWeight: '500',
    },
    raceHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    raceName: {
      fontSize: 16,
      fontWeight: 'bold',
      flex: 1,
    },
    raceDate: {
      fontSize: 12,
    },
    raceVenue: {
      fontSize: 14,
      marginBottom: 12,
    },
    raceStatusContainer: {
      alignItems: 'flex-start',
      marginTop: 8,
    },
    raceStatus: {
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
      overflow: 'hidden',
    },
    driversContainer: {
      marginTop: 8,
      paddingTop: 8,
      paddingHorizontal: 12,
      paddingBottom: 8,
      borderTopWidth: 1,
      borderTopColor: 'rgba(255, 255, 255, 0.1)',
    },
    driversRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    driverColumn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
    },
    driverName: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 4,
      textAlign: 'center',
    },
    driverTime: {
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 2,
      textAlign: 'center',
    },
    driverLaps: {
      fontSize: 12,
      textAlign: 'center',
    },
    dividerLine: {
      width: 2,
      height: 40,
      marginHorizontal: 8,
    },
    driverResult: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 4,
    },
    driverName: {
      fontSize: 14,
      flex: 1,
    },
    resultInfo: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    position: {
      fontSize: 14,
      fontWeight: 'bold',
      marginRight: 8,
    },
    points: {
      fontSize: 12,
    },
    racerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
    },
    racerInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    racerImage: {
      width: 50,
      height: 50,
      borderRadius: 25,
      borderWidth: 2,
    },
    racerImagePlaceholder: {
      width: 50,
      height: 50,
      borderRadius: 25,
      justifyContent: 'center',
      alignItems: 'center',
    },
    racerInitials: {
      fontSize: 16,
      fontWeight: 'bold',
      color: '#fff',
    },
    racerDetails: {
      flex: 1,
      marginLeft: 12,
    },
    racerName: {
      fontSize: 16,
      fontWeight: 'bold',
    },
    racerNationality: {
      fontSize: 12,
      marginTop: 2,
    },
    racerStats: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    racerStatItem: {
      alignItems: 'center',
      marginLeft: 12,
      minWidth: 35,
    },
    racerStatValue: {
      fontSize: 14,
      fontWeight: 'bold',
    },
    racerStatLabel: {
      fontSize: 10,
      marginTop: 2,
    },
    placeholderText: {
      fontSize: 16,
      textAlign: 'center',
      marginTop: 40,
    },
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.tabContainer}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tabButton,
                selectedTab === tab.key && styles.activeTabButton,
              ]}
              onPress={() => setSelectedTab(tab.key)}
            >
              <Text allowFontScaling={false}
                style={[
                  styles.tabButtonText,
                  selectedTab === tab.key
                    ? styles.activeTabButtonText
                    : styles.inactiveTabButtonText,
                ]}
              >
                {tab.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text allowFontScaling={false} style={styles.loadingText}>Loading Constructor Details...</Text>
        </View>
      </View>
    );
  }

  const renderConstructorHeader = () => (
    <View style={[styles.constructorHeaderSection, { backgroundColor: theme.surface }]}>
      <View style={styles.constructorHeaderContent}>
        <View style={styles.constructorHeaderLogoContainer}>
          {constructorData?.logo && !logoError ? (
            <View style={[styles.constructorHeaderLogoCircle, { backgroundColor: constructorColor || theme.border }]}> 
              <Image 
                source={{ uri: constructorData.logo }} 
                style={styles.constructorHeaderLogoInCircle}
                resizeMode="contain"
                onError={() => {
                  console.log('Logo failed to load:', constructorData.logo);
                  setLogoError(true);
                }}
              />
            </View>
          ) : (
            <View style={[styles.constructorHeaderInitials, { backgroundColor: constructorColor || theme.border }]}>
              <Text allowFontScaling={false} style={styles.constructorHeaderInitialsText}>
                {constructorName ? constructorName.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase() : 'CT'}
              </Text>
            </View>
          )}
        </View>
        
        <View style={styles.constructorHeaderInfo}>
          <View style={styles.constructorHeaderNameRow}>
            <TouchableOpacity
              onPress={() => handleTeamFavoriteToggle(constructorData?.name || constructorName, constructorColor)}
              activeOpacity={0.7}
              style={styles.headerFavoriteButton}
            >
              <Text allowFontScaling={false} style={[styles.headerFavoriteIcon, { color: isFavorite(getF1TeamId(constructorData?.name || constructorName)) ? colors.primary : theme.textSecondary }]}>
                {isFavorite(getF1TeamId(constructorData?.name || constructorName)) ? '\u2605' : '\u2606'}
              </Text>
            </TouchableOpacity>

            <Text allowFontScaling={false} style={[styles.constructorHeaderName, { color: isFavorite(getF1TeamId(constructorData?.name || constructorName)) ? colors.primary : theme.text }]}>
              {constructorData?.name || constructorName || 'Constructor'}
            </Text>
          </View>
          {constructorColor && (
            <View style={[styles.constructorHeaderColorBar, { backgroundColor: constructorColor }]} />
          )}
          {/* Show rank under the name if available */}
          {constructorData?.rank && (
            <Text allowFontScaling={false} style={[styles.constructorRank, { color: theme.textSecondary, marginTop: 6 }]}>
              Rank: {constructorData.rank}
            </Text>
          )}
        </View>
        
        {constructorData?.points && (
          <View style={styles.constructorHeaderPoints}>
            <Text allowFontScaling={false} style={[styles.constructorHeaderPointsNumber, { color: theme.text }]}>
              {constructorData.points}
            </Text>
            <Text allowFontScaling={false} style={[styles.constructorHeaderPointsLabel, { color: theme.textSecondary }]}>
              POINTS
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {renderConstructorHeader()}
      
      <View style={styles.tabContainer}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tabButton,
              selectedTab === tab.key && styles.activeTabButton,
            ]}
            onPress={() => setSelectedTab(tab.key)}
          >
            <Text allowFontScaling={false}
              style={[
                styles.tabButtonText,
                selectedTab === tab.key
                  ? styles.activeTabButtonText
                  : styles.inactiveTabButtonText,
              ]}
            >
              {tab.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      
      <ScrollView
        style={{ flex: 1 }}
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
    </View>
  );
};

export default ConstructorDetailsScreen;
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ActivityIndicator, ScrollView, Image, StyleSheet, TouchableOpacity, Modal, Animated } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { WebView } from 'react-native-webview';
import { useTheme } from '../../context/ThemeContext';
import { NHLService } from '../../services/NHLService';

const NHLGameDetailsScreen = ({ route }) => {
  const { gameId } = route.params || {};
  const { theme, colors, getTeamLogoUrl } = useTheme();
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState(null);
  const [activeTab, setActiveTab] = useState('stats');
  const [playsData, setPlaysData] = useState(null);
  const [openPlays, setOpenPlays] = useState(new Set());
  const [awayScorers, setAwayScorers] = useState([]);
  const [homeScorers, setHomeScorers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const lastPlaysHash = useRef(null);
  
  // Stream-related state variables
  const [streamModalVisible, setStreamModalVisible] = useState(false);
  const [currentStreamType, setCurrentStreamType] = useState('alpha');
  const [availableStreams, setAvailableStreams] = useState({});
  const [streamUrl, setStreamUrl] = useState('');
  const [isStreamLoading, setIsStreamLoading] = useState(true);

  // Stream API functions (adapted from NFL)
  const STREAM_API_BASE = 'https://streamed.pk/api';
  let liveMatchesCache = null;
  let cacheTimestamp = 0;
  const CACHE_DURATION = 30000; // 30 seconds cache

  const fetchLiveMatches = async () => {
    try {
      const now = Date.now();
      if (liveMatchesCache && (now - cacheTimestamp) < CACHE_DURATION) {
        return liveMatchesCache;
      }

      const response = await fetch(`${STREAM_API_BASE}/matches/live`);
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }

      const allMatches = await response.json();
      console.log(`Found ${allMatches.length} total live matches`);

      // Filter matches by hockey / nhl
      const matches = allMatches.filter(match => {
        const matchSport = match.sport || match.category;
        return matchSport === 'hockey' || matchSport === 'nhl' || 
               (match.title && (match.title.toLowerCase().includes('nhl') || match.title.toLowerCase().includes('hockey')));
      });
      console.log(`Filtered to ${matches.length} hockey matches`);
      
      liveMatchesCache = matches;
      cacheTimestamp = now;
      
      return matches;
    } catch (error) {
      console.error('Error fetching live matches:', error);
      return [];
    }
  };

  const fetchStreamsForSource = async (source, sourceId) => {
    try {
      const response = await fetch(`${STREAM_API_BASE}/stream/${source}/${sourceId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch streams: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error fetching streams for ${source}:`, error);
      return [];
    }
  };

  // Team name normalization for NHL
  const normalizeNHLTeamName = (teamName) => {
    if (!teamName) return '';
    
    const nhlMappings = {
      'New York Rangers': 'new-york-rangers',
      'New York Islanders': 'new-york-islanders',
      'Los Angeles Kings': 'los-angeles-kings',
      'Tampa Bay Lightning': 'tampa-bay-lightning',
      'Vegas Golden Knights': 'vegas-golden-knights',
      'Montreal Canadiens': 'montreal-canadiens',
      'Toronto Maple Leafs': 'toronto-maple-leafs',
      'Chicago Blackhawks': 'chicago-blackhawks',
      'Minnesota Wild': 'minnesota-wild',
      'San Jose Sharks': 'san-jose-sharks'
    };

    if (nhlMappings[teamName]) return nhlMappings[teamName];

    return teamName.toLowerCase()
      .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u')
      .replace(/ü/g, 'u').replace(/ñ/g, 'n').replace(/ç/g, 'c').replace(/ß/g, 'ss')
      .replace(/ë/g, 'e').replace(/ï/g, 'i').replace(/ö/g, 'o').replace(/ä/g, 'a')
      .replace(/å/g, 'a').replace(/ø/g, 'o')
      .replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  };

  const findNHLMatchStreams = async (homeTeamName, awayTeamName) => {
    try {
      console.log(`Finding NHL streams for: ${awayTeamName} vs ${homeTeamName}`);

      const liveMatches = await fetchLiveMatches();
      if (!liveMatches || !Array.isArray(liveMatches) || liveMatches.length === 0) {
        console.log('No live NHL matches data available');
        return {};
      }

      const homeNormalized = normalizeNHLTeamName(homeTeamName).toLowerCase();
      const awayNormalized = normalizeNHLTeamName(awayTeamName).toLowerCase();

      console.log(`Normalized NHL team names: {homeNormalized: '${homeNormalized}', awayNormalized: '${awayNormalized}'}`);

      let bestMatch = null;
      let bestScore = 0;

      for (let i = 0; i < Math.min(liveMatches.length, 200); i++) {
        const match = liveMatches[i];
        if (!match.sources || match.sources.length === 0) continue;

        const matchTitle = (match.title || '').toLowerCase();
        let totalScore = 0;

        const strategies = [
          () => {
            let score = 0;
            if (matchTitle.includes(homeNormalized) && matchTitle.includes(awayNormalized)) {
              score += 1.0;
            } else {
              const homeParts = homeNormalized.split('-').filter(w => w.length > 2);
              const awayParts = awayNormalized.split('-').filter(w => w.length > 2);
              let homeMatches = 0; let awayMatches = 0;
              homeParts.forEach(part => { if (matchTitle.includes(part)) homeMatches++; });
              awayParts.forEach(part => { if (matchTitle.includes(part)) awayMatches++; });
              if (homeMatches >= 1 && awayMatches >= 1) score += 0.8;
            }
            return score;
          },
          () => {
            let score = 0;
            if (match.teams) {
              const homeTeamMatch = (match.teams.home?.name || match.teams.home?.title || '').toLowerCase();
              const awayTeamMatch = (match.teams.away?.name || match.teams.away?.title || '').toLowerCase();
              if (homeTeamMatch && awayTeamMatch) {
                if (homeTeamMatch.includes(homeNormalized.split('-')[0]) && awayTeamMatch.includes(awayNormalized.split('-')[0])) {
                  score += 0.9;
                }
              }
            }
            return score;
          }
        ];

        strategies.forEach(s => { totalScore += s(); });

        if (totalScore > bestScore) {
          bestScore = totalScore; bestMatch = match; if (bestScore >= 1.0) break;
        }
      }

      if (!bestMatch || bestScore < 0.25) {
        console.log(`No good matching NHL live match found (best score: ${bestScore})`);
        return {};
      }

      console.log(`Found matching NHL match: ${bestMatch.title || bestMatch.id} (score: ${bestScore})`);

      const allStreams = {};
      for (const source of bestMatch.sources) {
        try {
          const sourceStreams = await fetchStreamsForSource(source.source, source.id);
          if (sourceStreams && sourceStreams.length > 0) {
            const firstStream = sourceStreams[0];
            const sourceKey = source.source;
            allStreams[sourceKey] = {
              url: firstStream.embedUrl || firstStream.url || firstStream.embed_url || firstStream.embed,
              embedUrl: firstStream.embedUrl || firstStream.url || firstStream.embed_url || firstStream.embed,
              source: source.source,
              title: `${source.source.charAt(0).toUpperCase() + source.source.slice(1)} Stream`
            };
            console.log(`Added NHL stream for ${source.source}:`, allStreams[sourceKey]);
          }
        } catch (error) {
          console.error(`Error fetching NHL streams for ${source.source}:`, error);
        }
      }

      console.log('Final NHL streams found:', allStreams);
      return allStreams;
    } catch (error) {
      console.error('Error in findNHLMatchStreams:', error);
      return {};
    }
  };

  const generateNHLStreamUrl = (awayTeamName, homeTeamName, streamType = 'alpha') => {
    const normalizedAway = normalizeNHLTeamName(awayTeamName);
    const normalizedHome = normalizeNHLTeamName(homeTeamName);
    const streamUrls = {
      alpha: `https://weakstreams.com/nhl-live-streams/${normalizedAway}-vs-${normalizedHome}-live-stream`,
      bravo: `https://sportsurge.club/nhl/${normalizedAway}-vs-${normalizedHome}`,
      charlie: `https://sportshd.me/nhl/${normalizedAway}-${normalizedHome}`
    };
    return streamUrls[streamType] || streamUrls.alpha;
  };

  // Stream modal functions
  const openStreamModal = async () => {
    try {
      console.log('openStreamModal: invoked');

      const competition = details?.header?.competitions?.[0] || details?.competitions?.[0] || details?.game?.competitions?.[0];
      if (!competition) {
        console.warn('openStreamModal: competition not found on details');
        return;
      }

      const competitors = competition?.competitors || competition?.teams || [];

      let homeComp = competitors.find(c => c.homeAway === 'home' || c.side === 'home' || c.isHome) || null;
      let awayComp = competitors.find(c => c.homeAway === 'away' || c.side === 'away' || (!c.homeAway && !c.side && !c.isHome)) || null;

      if (!homeComp && competitors.length === 2) {
        homeComp = competitors[0]?.homeAway === 'home' ? competitors[0] : competitors[1];
      }
      if (!awayComp && competitors.length === 2) {
        awayComp = competitors[0] === homeComp ? competitors[1] : competitors[0];
      }

      const homeTeam = homeComp?.team || homeComp?.team?.team || homeComp?.home || homeComp?.teamData || null;
      const awayTeam = awayComp?.team || awayComp?.team?.team || awayComp?.away || awayComp?.teamData || null;

      if (!awayTeam || !homeTeam) {
        console.warn('openStreamModal: team info missing after fallbacks');
        return;
      }

      // Show modal immediately so user sees something while we fetch
      setAvailableStreams({});
      setStreamUrl('');
      setCurrentStreamType('alpha');
      setStreamModalVisible(true);
      setIsStreamLoading(true);

      const homeName = homeTeam.displayName || homeTeam.name || homeTeam.fullName || homeTeam.abbreviation || '';
      const awayName = awayTeam.displayName || awayTeam.name || awayTeam.fullName || awayTeam.abbreviation || '';

      const streams = await findNHLMatchStreams(homeName, awayName);
      console.log('openStreamModal: streams result =', streams);
      setAvailableStreams(streams || {});

      let initialUrl = '';
      let initialStreamType = '';

      const streamKeys = Object.keys(streams || {});
      if (streamKeys.length > 0) {
        const preferredOrder = ['admin', 'alpha', 'bravo', 'charlie', 'delta'];
        initialStreamType = preferredOrder.find(type => streamKeys.includes(type)) || streamKeys[0];

        const streamData = streams[initialStreamType];
        initialUrl = streamData?.embedUrl || streamData?.url || streamData;
        setCurrentStreamType(initialStreamType);
      } else {
        initialStreamType = 'alpha';
        initialUrl = generateNHLStreamUrl(awayName, homeName, initialStreamType);
        setCurrentStreamType(initialStreamType);
      }

      console.log('openStreamModal: initialStreamType =', initialStreamType, 'initialUrl =', initialUrl);
      setStreamUrl(initialUrl);
      setIsStreamLoading(false);
    } catch (err) {
      console.error('openStreamModal: caught error', err);
      setIsStreamLoading(false);
    }
  };

  const switchStream = (streamType) => {
    setCurrentStreamType(streamType);
    setIsStreamLoading(true);
    let newUrl = '';
    if (availableStreams[streamType]) {
      const streamData = availableStreams[streamType];
      newUrl = streamData.embedUrl || streamData.url || streamData;
    } else {
      const awayTeam = details?.competitions?.[0]?.competitors?.find(comp => !comp.homeAway || comp.homeAway === 'away')?.team;
      const homeTeam = details?.competitions?.[0]?.competitors?.find(comp => comp.homeAway === 'home')?.team;
      newUrl = generateNHLStreamUrl(awayTeam?.displayName || awayTeam?.name, homeTeam?.displayName || homeTeam?.name, streamType);
    }
    setStreamUrl(newUrl);
    setTimeout(() => setIsStreamLoading(false), 1000);
  };

  const closeStreamModal = () => {
    setStreamModalVisible(false);
    setStreamUrl('');
    setIsStreamLoading(true);
  };

  // helper: convert hex to rgba for subtle tinting (hoisted so render paths can use it)
    

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await NHLService.getGameDetails(gameId);
        if (mounted) setDetails(data);
      } catch (e) {
        console.error('Failed to load NHL game details', e);
      } finally { if (mounted) setLoading(false); }
    };
    load();
    return () => { mounted = false; };
  }, [gameId]);

  // Auto-refresh game details every 4 seconds for live updates (stop when game is completed)
  useEffect(() => {
    if (!gameId || !details) return;
    
    // Check if game is completed to stop auto-refresh
    const competition = details?.header?.competitions?.[0] || details?.boxscore?.game || details?.game || null;
    const statusType = competition?.status?.type || details?.game?.status?.type || {};
    const isGameCompleted = !!(statusType?.state === 'post' || (statusType?.description || '').toLowerCase().includes('final') || statusType?.completed);
    
    // Don't auto-refresh if game is completed
    if (isGameCompleted) {
      console.log('Game completed, stopping auto-refresh');
      return;
    }
    
    const intervalId = setInterval(async () => {
      try {
        const data = await NHLService.getGameDetails(gameId);
        setDetails(data);
        
        // Check if game just completed and stop future refreshes
        const newCompetition = data?.header?.competitions?.[0] || data?.boxscore?.game || data?.game || null;
        const newStatusType = newCompetition?.status?.type || data?.game?.status?.type || {};
        const newIsGameCompleted = !!(newStatusType?.state === 'post' || (newStatusType?.description || '').toLowerCase().includes('final') || newStatusType?.completed);
        
        if (newIsGameCompleted) {
          console.log('Game just completed, stopping auto-refresh');
          clearInterval(intervalId);
        }
      } catch (e) {
        console.error('Failed to refresh NHL game details', e);
        // Don't show loading or reset details on refresh errors - keep current data
      }
    }, 4000);

    return () => clearInterval(intervalId);
  }, [gameId, details]);

  // Precompute normalized plays for immediate rendering when user clicks the Plays tab
  useEffect(() => {
    if (!details) {
      setPlaysData(null);
      lastPlaysHash.current = null;
      return;
    }

    // Eager lightweight summary: map to minimal fields synchronously so UI can render immediately.
    const rawPlaysSource = details?.plays || details?.boxscore?.playByPlay || [];
    let playsArray = [];
    if (Array.isArray(rawPlaysSource)) playsArray = rawPlaysSource.slice();
    else if (rawPlaysSource?.items && Array.isArray(rawPlaysSource.items)) playsArray = rawPlaysSource.items.slice();
    else playsArray = [];

    // Create a hash of plays content to detect actual changes
    const playsHash = JSON.stringify(playsArray.map(p => ({ 
      id: p?.id, 
      text: p?.text || p?.description || p?.displayText,
      period: p?.period?.displayValue || p?.period,
      clock: p?.clock?.displayValue || p?.clock || p?.time,
      scoring: !!p?.scoringPlay
    })));

    // Only process plays if content has actually changed
    if (playsHash === lastPlaysHash.current && playsData) {
      return;
    }
    
    lastPlaysHash.current = playsHash;

    playsArray.sort((a, b) => {
      const aSeq = parseInt(a?.sequenceNumber || a?.id || '0', 10) || 0;
      const bSeq = parseInt(b?.sequenceNumber || b?.id || '0', 10) || 0;
      if (aSeq !== bSeq) return bSeq - aSeq;
      const aTime = new Date(a?.modified || a?.wallclock || 0).getTime() || 0;
      const bTime = new Date(b?.modified || b?.wallclock || 0).getTime() || 0;
      return bTime - aTime;
    });

    // Process plays synchronously to avoid flickering
    // Only show loading state if we don't have any plays data yet
    if (!playsData) {
      setPlaysData([]);
    }

    const processPlays = async () => {
      try {
        // Use setTimeout to defer heavy computation and avoid blocking the UI
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // Recompute with full normalization
        const competitionObjLocal = details?.header?.competitions?.[0] || details?.game?.competitions?.[0] || details?.competition || null;
        let awayLocal = null;
        let homeLocal = null;
        if (competitionObjLocal && Array.isArray(competitionObjLocal.competitors)) {
          const comps = competitionObjLocal.competitors;
          awayLocal = comps.find(c => c.homeAway === 'away') || comps[0] || null;
          homeLocal = comps.find(c => c.homeAway === 'home') || comps[1] || null;
        } else {
          const teams = details?.boxscore?.teams ? Object.values(details.boxscore.teams) : [];
          awayLocal = teams.find(t => t.team?.homeAway === 'away') || teams[0] || null;
          homeLocal = teams.find(t => t.team?.homeAway === 'home') || teams[1] || null;
        }

        const awayScoreNumLocal = parseInt(awayLocal?.score ?? awayLocal?.team?.score ?? '0', 10) || 0;
        const homeScoreNumLocal = parseInt(homeLocal?.score ?? homeLocal?.team?.score ?? '0', 10) || 0;

        const getTeamIdFromPlayTeam = (teamObj) => {
          if (!teamObj) return null;
          if (teamObj.id) return String(teamObj.id);
          if (typeof teamObj === 'string') {
            const m = teamObj.match(/teams\/(\d+)/);
            return m ? m[1] : null;
          }
          if (teamObj.$ref && typeof teamObj.$ref === 'string') {
            const m = teamObj.$ref.match(/teams\/(\d+)/);
            return m ? m[1] : null;
          }
          return null;
        };

        const getLogoUriForTeam = (teamObj, preferDark = false) => {
          if (!teamObj) return null;
          if (preferDark) {
            if (teamObj?.team?.logoDark) return teamObj.team.logoDark;
            if (teamObj?.team?.darkLogo) return teamObj.team.darkLogo;
            if (teamObj?.logoDark) return teamObj.logoDark;
            if (teamObj?.darkLogo) return teamObj.darkLogo;
            if (Array.isArray(teamObj?.team?.logos)) {
              const dark = teamObj.team.logos.find(l => {
                let relVal = '';
                if (typeof l?.rel === 'string') relVal = l.rel.toLowerCase();
                else if (Array.isArray(l?.rel)) relVal = l.rel.join(' ').toLowerCase();
                let nameVal = '';
                if (typeof l?.name === 'string') nameVal = l.name.toLowerCase();
                return (relVal.includes('dark') || nameVal.includes('dark'));
              });
              if (dark?.href) return dark.href;
            }
          }
          if (teamObj?.team?.logo || teamObj?.logo) return teamObj.team?.logo || teamObj.logo;
          const abbr = teamObj?.team?.abbreviation || teamObj?.abbreviation;
          if (abbr) return getTeamLogoUrl('nhl', abbr);
          return null;
        };

        // Process plays in smaller chunks to avoid blocking the UI
        const fully = [];
        const chunkSize = 10; // Process 10 plays at a time
        
        for (let i = 0; i < playsArray.length; i += chunkSize) {
          const chunk = playsArray.slice(i, i + chunkSize);
          
          const processedChunk = chunk.map(play => {
            const playText = play?.text || play?.description || play?.displayText || '';
            const period = play?.period?.displayValue || play?.period || '';
            const clock = play?.clock?.displayValue || play?.clock || play?.time || '';
            const awayScore = (typeof play?.awayScore !== 'undefined') ? play.awayScore : awayScoreNumLocal;
            const homeScore = (typeof play?.homeScore !== 'undefined') ? play.homeScore : homeScoreNumLocal;
            const playTeamId = getTeamIdFromPlayTeam(play.team);
            let playTeamSummary = null;
            if (playTeamId && competitionObjLocal?.competitors) {
              playTeamSummary = competitionObjLocal.competitors.find(c => String(c.team?.id || c.id) === String(playTeamId) || String(c.id) === String(playTeamId));
            }
            const playTeamColorRaw = playTeamSummary?.team?.color || playTeamSummary?.color || null;
            const playTeamColor = playTeamColorRaw ? (playTeamColorRaw.startsWith('#') ? playTeamColorRaw : `#${playTeamColorRaw}`) : null;
            const isScoring = !!play?.scoringPlay;
            const coordXRaw = play?.coordinate?.x ?? play?.x ?? null;
            const coordYRaw = play?.coordinate?.y ?? play?.y ?? null;
            const coordX = (typeof coordXRaw === 'number') ? coordXRaw : (coordXRaw ? parseFloat(coordXRaw) : null);
            const coordY = (typeof coordYRaw === 'number') ? coordYRaw : (coordYRaw ? parseFloat(coordYRaw) : null);
            const textColor = isScoring ? '#FFFFFF' : theme.text;
            const borderLeftWidth = playTeamColor ? 6 : 0;
            const borderLeftColor = playTeamColor || 'transparent';
            const awayLogoUri = getLogoUriForTeam(awayLocal, isScoring) || getTeamLogoUrl('nhl', awayLocal?.team?.abbreviation || awayLocal?.abbreviation);
            const homeLogoUri = getLogoUriForTeam(homeLocal, isScoring) || getTeamLogoUrl('nhl', homeLocal?.team?.abbreviation || homeLocal?.abbreviation);

            return {
              id: play?.id,
              playText,
              period,
              clock,
              awayScore,
              homeScore,
              playTeamColor,
              isScoring,
              textColor,
              borderLeftWidth,
              borderLeftColor,
              awayLogoUri,
              homeLogoUri,
              coordX,
              coordY,
            };
          });
          
          fully.push(...processedChunk);
          
          // Yield to the event loop after each chunk
          if (i + chunkSize < playsArray.length) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }        // Extract goal scorers from the raw plays.
        try {
          const awayTeamId = String(awayLocal?.team?.id || awayLocal?.id || '');
          const homeTeamId = String(homeLocal?.team?.id || homeLocal?.id || '');

          const foundAway = {};
          const foundHome = {};

          const getPeriodNumber = (p) => {
            if (!p) return null;
            if (typeof p === 'number') return p;
            if (p.number) return Number(p.number);
            if (p.periodNumber) return Number(p.periodNumber);
            return null;
          };

          const getShortNameFromParticipant = (part) => {
            if (!part) return null;
            // common shapes: participant.player or participant.athlete or participant.person
            const candidate = part.player || part.athlete || part.person || part;
            return (candidate && (candidate.shortName || candidate.displayName || candidate.fullName || candidate.name)) || null;
          };

          const findScorerName = (play) => {
            const parts = play?.participants || play?.players || [];
            if (!Array.isArray(parts)) return null;
            // Prefer participants that indicate scorer role
            let scorer = parts.find(p => {
              const role = (p?.type || p?.role || p?.participantType || '').toString().toLowerCase();
              return role.includes('scor') || role.includes('goal');
            });
            if (!scorer) {
              // fallback: any participant that has a player/athlete object
              scorer = parts.find(p => !!(p?.player || p?.athlete || p?.person || p?.shortName || p?.displayName));
            }
            return getShortNameFromParticipant(scorer);
          };

          for (const rawPlay of playsArray) {
            const isScoring = !!rawPlay?.scoringPlay;
            if (!isScoring) continue;
            const periodNum = getPeriodNumber(rawPlay?.period || rawPlay?.periodNumber || rawPlay?.period?.number);
            if (periodNum !== null && periodNum >= 5) continue; // skip shootouts/long overtime

            const teamId = (function () {
              const t = rawPlay?.team || rawPlay?.teamId || rawPlay?.team?.id || rawPlay?.competitor || null;
              if (!t) return null;
              if (typeof t === 'string') return (t.match(/(\d+)/) || [null,null])[1];
              if (typeof t === 'number') return String(t);
              if (t.id) return String(t.id);
              if (t.$ref) return (t.$ref.match(/teams\/(\d+)/) || [null,null])[1];
              return null;
            })();

            const shortName = findScorerName(rawPlay) || rawPlay?.scorer || rawPlay?.scorers?.[0]?.athlete?.shortName || rawPlay?.scorers?.[0]?.player?.shortName || null;
            if (!shortName) continue;

            const periodDisplay = rawPlay?.period?.displayValue || (rawPlay?.period ? String(rawPlay.period) : '');
            const clockDisplay = rawPlay?.clock?.displayValue || rawPlay?.clock || rawPlay?.time || '';
            const label = `(${periodDisplay} - ${clockDisplay})`;

            if (teamId && String(teamId) === awayTeamId) {
              if (!foundAway[shortName]) foundAway[shortName] = [];
              foundAway[shortName].push(label);
            } else if (teamId && String(teamId) === homeTeamId) {
              if (!foundHome[shortName]) foundHome[shortName] = [];
              foundHome[shortName].push(label);
            } else {
              // if team couldn't be determined, skip
            }
          }

          // Helper function to sort timestamps by period then time
          const sortTimestamps = (timestamps) => {
            return timestamps.sort((a, b) => {
              // Extract period and time from format "(3rd - 5:57)"
              const parseStamp = (stamp) => {
                const match = stamp.match(/\((\d+)(?:st|nd|rd|th)?\s*-\s*(\d+):(\d+)\)/);
                if (!match) return { period: 0, minutes: 0, seconds: 0 };
                return {
                  period: parseInt(match[1]),
                  minutes: parseInt(match[2]),
                  seconds: parseInt(match[3])
                };
              };
              
              const stampA = parseStamp(a);
              const stampB = parseStamp(b);
              
              // Sort by period first
              if (stampA.period !== stampB.period) {
                return stampA.period - stampB.period;
              }
              
              // Then by time (descending - later times first within same period)
              const timeA = stampA.minutes * 60 + stampA.seconds;
              const timeB = stampB.minutes * 60 + stampB.seconds;
              return timeB - timeA;
            });
          };

          const awayList = Object.keys(foundAway).map(name => {
            const stamps = Array.isArray(foundAway[name]) ? sortTimestamps(foundAway[name].slice()) : [];
            return `${name} ${stamps.join(', ')}`;
          });
          const homeList = Object.keys(foundHome).map(name => {
            const stamps = Array.isArray(foundHome[name]) ? sortTimestamps(foundHome[name].slice()) : [];
            return `${name} ${stamps.join(', ')}`;
          });
          setAwayScorers(awayList);
          setHomeScorers(homeList);
        } catch (e) {
          // non-fatal
          console.error('Error extracting scorers:', e);
        }

        setPlaysData(fully);
      } catch (e) {
        console.error('Error processing plays:', e);
        setPlaysData([]);
      }
    };

    // Process plays asynchronously to avoid blocking the UI
    processPlays();
  }, [details]);

  if (loading) return (<View style={[styles.loading, { backgroundColor: theme.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>);

  if (!details) return (<View style={[styles.container, { backgroundColor: theme.background }]}><Text style={{ color: theme.text }}>No details available</Text></View>);

  // Prefer the header competition (soccer-style canonical) first, then fall back to other shapes
  const competition = details?.header?.competitions?.[0] || details?.boxscore?.game || details?.game || null;
  const statusDesc = competition?.status?.type?.description || details?.game?.status?.type?.description || details?.status?.type?.description || '';
  const gameDate = competition?.date || details?.game?.date || details?.date || '';

  // Prefer competition competitors (header/competition) if available, otherwise fall back to boxscore structure
  const competitionObj = details?.header?.competitions?.[0] || details?.game?.competitions?.[0] || details?.competition || null;
  let away = null;
  let home = null;

  if (competitionObj && Array.isArray(competitionObj.competitors)) {
    const comps = competitionObj.competitors;
    away = comps.find(c => c.homeAway === 'away') || comps[0] || null;
    home = comps.find(c => c.homeAway === 'home') || comps[1] || null;
  } else {
    const teams = details?.boxscore?.teams ? Object.values(details.boxscore.teams) : [];
    away = teams.find(t => t.team?.homeAway === 'away') || teams[0] || null;
    home = teams.find(t => t.team?.homeAway === 'home') || teams[1] || null;
  }

  // Debug logs removed - ready for visual verification

  // Determine winner/loser so we can apply "loser" styling to name/logo/score
  const awayScoreNum = parseInt(away?.score ?? away?.team?.score ?? '0', 10) || 0;
  const homeScoreNum = parseInt(home?.score ?? home?.team?.score ?? '0', 10) || 0;
  const statusType = competition?.status?.type || details?.game?.status?.type || {};
  const isGameFinal = !!(statusType?.state === 'post' || (statusType?.description || '').toLowerCase().includes('final') || statusType?.completed);

  let homeIsWinner = false;
  let awayIsWinner = false;
  let isDraw = false;
  if (isGameFinal) {
    if (homeScoreNum > awayScoreNum) homeIsWinner = true;
    else if (awayScoreNum > homeScoreNum) awayIsWinner = true;
    else isDraw = true;
  }
  const homeIsLoser = isGameFinal && !isDraw && !homeIsWinner;
  const awayIsLoser = isGameFinal && !isDraw && !awayIsWinner;

  // helper: convert hex to rgba for subtle tinting (hoisted so render path can use it)
  const hexToRgba = (hex, alpha = 0.12) => {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    const h = hex.replace('#', '');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Get NHL game status like soccer's getMatchStatus
  const getGameStatus = () => {
    if (!details) return { text: 'FT', detail: 'Full Time', isLive: false, isPre: false, isPost: true };
    
    const status = competition?.status || details?.game?.status || details?.status;
    const state = status?.type?.state;
    const clock = status?.clock || status?.displayClock || '0:00';
    const period = status?.period || 1;
    
    if (state === 'pre') {
      // Game not started - show date and time
      const date = new Date(gameDate || Date.now());
      const timeText = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const today = new Date();
      const isToday = date.toDateString() === today.toDateString();
      
      return {
        text: timeText,
        detail: isToday ? 'Today' : date.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        isLive: false,
        isPre: true,
        isPost: false
      };
    } else if (state === 'in') {
      // Game in progress - show period and clock
      const statusDesc = status?.type?.description || '';
      
      // Check for intermission
      if (statusDesc.toLowerCase().includes('intermission')) {
        return {
          text: 'INT',
          detail: `${statusDesc}`,
          isLive: true,
          isPre: false,
          isPost: false
        };
      }
      
      // Regular play - show period
      let periodText = '';
      if (period === 1) periodText = '1st';
      else if (period === 2) periodText = '2nd'; 
      else if (period === 3) periodText = '3rd';
      else if (period > 3) periodText = 'OT';
      
      return {
        text: clock || '0:00',
        detail: `${periodText} Period`,
        isLive: true,
        isPre: false,
        isPost: false
      };
    } else {
      // Game finished
      return {
        text: 'FT',
        detail: 'Final',
        isLive: false,
        isPre: false,
        isPost: true
      };
    }
  };

  // Toggle function for plays
  const togglePlay = (playKey) => {
    setOpenPlays(prevOpen => {
      const newOpen = new Set(prevOpen);
      if (newOpen.has(playKey)) {
        newOpen.delete(playKey);
      } else {
        newOpen.add(playKey);
      }
      return newOpen;
    });
  };

  // Normalize ESPN coords (x: -99..99 => left..right, y: -42..42 => top..bottom)
  // Use fixed dimensions for the mini rink (180x120 from miniField style)
  const normalizeCoord = (x, y) => {
    const rinkWidth = 180;
    const rinkHeight = 120;
    
    // Clamp inputs
    const clampedX = Math.max(-99, Math.min(99, Number(x)));
    const clampedY = Math.max(-42, Math.min(42, Number(y)));
    
    // rink interior is inset by 4px (rinkOutline uses top/left/right/bottom = 4)
    const inset = 4;
    const innerW = rinkWidth - inset * 2;
    const innerH = rinkHeight - inset * 2;
    
    // ESPN origin: 0,0 is center. x:-99..99, y:-42..42
    const px = (clampedX + 99) / (99 + 99) * innerW; // map to 0..innerW
    // y: positive is up in ESPN (user said 42 is up), but in screen coords y increases downward
    const py = (1 - ((clampedY + 42) / (42 + 42))) * innerH; // flip y
    
    // Add inset offset and center the marker (subtract half marker size)
    return { 
      left: inset + px - 6, // 6 = half of marker width (12px)
      top: inset + py - 6   // 6 = half of marker height (12px)
    };
  };

  // Find stat metadata for a player (labels/keys) from details.boxscore.players
  const findPlayerStatsMeta = (playerObj) => {
    try {
      const playersBox = details?.boxscore?.players || [];
      const athleteId = String(playerObj?.athlete?.id || playerObj?.athlete?.athleteId || playerObj?.athlete?.athleteid || '');
      for (const teamBox of playersBox) {
        if (!teamBox || !Array.isArray(teamBox.statistics)) continue;
        for (const group of teamBox.statistics) {
          if (!Array.isArray(group.athletes)) continue;
          const found = group.athletes.find(a => String(a?.athlete?.id || a?.athlete?.athleteId || a?.athlete?.athleteid) === athleteId);
          if (found) {
            return {
              labels: Array.isArray(group.labels) ? group.labels.slice() : (Array.isArray(group.keys) ? group.keys.slice() : []),
              keys: Array.isArray(group.keys) ? group.keys.slice() : null,
              groupName: group.name || ''
            };
          }
        }
      }
    } catch (e) {
      // ignore
    }
    return { labels: null, keys: null, groupName: null };
  };

  // Percent-based normalizer (matches soccer approach which places dots using percent offsets)
  // Returns leftPercent (0..100) and bottomPercent (0..100) 
  // Adjusted for NHL rink proportions and ESPN coordinate system
  const normalizeCoordPercent = (x, y) => {
    const clampedX = Math.max(-99, Math.min(99, Number(x)));
    const clampedY = Math.max(-42, Math.min(42, Number(y)));
    
    // ESPN coordinates: x=-99 (left) to x=99 (right), y=-42 (bottom) to y=42 (top)
    // Map to percentages with some adjustment for better visual match
    // Add a small margin to keep dots away from the very edges
    const margin = 10; // 5% margin on each side
    const leftPercent = margin + ((clampedX + 99) / (99 + 99)) * (100 - 2 * margin);
    const bottomPercent = margin + ((clampedY + 42) / (42 + 42)) * (100 - 2 * margin);
    
    return { leftPercent, bottomPercent };
  };

  const ensureHexColor = (raw) => {
    if (!raw) return null;
    if (typeof raw !== 'string') return null;
    const v = raw.trim();
    if (v.startsWith('#')) return v;
    // short 3 or 6 char hex without #
    if (/^[0-9A-Fa-f]{3}$/.test(v) || /^[0-9A-Fa-f]{6}$/.test(v)) return `#${v}`;
    return null;
  };

  // Render hockey rink with proper markings. Accept optional marker props {x,y,color}
  const renderHockeyRink = (marker) => {
    return (
      <View style={styles.hockeyRink}>
        {/* Rink outline */}
        <View style={styles.rinkOutline} />
        
        {/* Center line */}
        <View style={styles.centerLine} />
        
        {/* Center circle */}
        <View style={styles.centerCircle} />
        <View style={styles.centerDot} />
        
        {/* Left zone */}
        <View style={styles.leftGoalLine} />
        <View style={styles.leftGoalLineBehindCrease} />
        <View style={styles.leftFaceoffCircleTop} />
        <View style={styles.leftFaceoffCircleBottom} />
        <View style={styles.leftFaceoffDotTop} />
        <View style={styles.leftFaceoffDotBottom} />
        <View style={styles.leftGoalCrease} />
        <View style={styles.leftGoalCreaseOutline} />
        
        {/* Right zone */}
        <View style={styles.rightGoalLine} />
        <View style={styles.rightGoalLineBehindCrease} />
        <View style={styles.rightFaceoffCircleTop} />
        <View style={styles.rightFaceoffCircleBottom} />
        <View style={styles.rightFaceoffDotTop} />
        <View style={styles.rightFaceoffDotBottom} />
        <View style={styles.rightGoalCrease} />
        <View style={styles.rightGoalCreaseOutline} />
        
        {/* Neutral zone face-off dots */}
        <View style={styles.neutralZoneDotTopLeft} />
        <View style={styles.neutralZoneDotTopRight} />
        <View style={styles.neutralZoneDotBottomLeft} />
        <View style={styles.neutralZoneDotBottomRight} />
        {/* Play marker (mapped from ESPN coords) - use percent placement like soccer to ensure consistent rendering */}
        {marker && typeof marker.x === 'number' && typeof marker.y === 'number' && (() => {
          const pct = normalizeCoordPercent(marker.x, marker.y);
          // Use top percent (flip bottom -> top like soccer does with 100 - bottom)
          const topStyle = `${100 - pct.bottomPercent}%`;
          const leftStyle = `${pct.leftPercent}%`;
          return (
            <View
              style={[
                styles.playMarker,
                {
                  position: 'absolute',
                  top: topStyle,
                  left: leftStyle,
                  // center like soccer player dots
                  transform: [{ translateX: '-50%' }, { translateY: '-50%' }],
                  backgroundColor: marker.color || '#999'
                }
              ]}
            />
          );
        })()}
      </View>
    );
  };

  // Function to render faceoff percentage circle
  const renderFaceoffCircle = () => {
    if (!details?.boxscore?.teams) return null;
    
    const teams = details.boxscore.teams;
    const awayTeam = teams.find(t => t.homeAway === 'away') || teams[0];
    const homeTeam = teams.find(t => t.homeAway === 'home') || teams[1];
    
    const awayFaceoffPct = parseFloat(awayTeam?.statistics?.find(s => s.name === 'faceoffPercent')?.displayValue || '0');
    const homeFaceoffPct = parseFloat(homeTeam?.statistics?.find(s => s.name === 'faceoffPercent')?.displayValue || '0');
    
    if (awayFaceoffPct === 0 && homeFaceoffPct === 0) return null;

    // Colors
    const awayColor = ensureHexColor(awayTeam?.team?.color) || colors.primary;
    const homeColor = ensureHexColor(homeTeam?.team?.color) || '#666';

    return (
      <View style={styles.faceoffContainer}>
        <Text style={[styles.faceoffTitle, { color: theme.text }]}>Faceoff Win %</Text>
        <View style={styles.faceoffSection}>
          <View style={styles.faceoffCircleContainer}>
            <View style={styles.faceoffCircle}>
              <Svg width={120} height={120} style={styles.faceoffSvg}>
                <Defs>
                  <LinearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <Stop offset="0%" stopColor={awayColor} stopOpacity="1" />
                    <Stop offset={`${awayFaceoffPct}%`} stopColor={awayColor} stopOpacity="1" />
                    <Stop offset={`${awayFaceoffPct}%`} stopColor={homeColor} stopOpacity="1" />
                    <Stop offset="100%" stopColor={homeColor} stopOpacity="1" />
                  </LinearGradient>
                </Defs>
                
                {/* Background circle */}
                <Circle
                  cx="60"
                  cy="60"
                  r="50"
                  stroke="#ddd"
                  strokeWidth="20"
                  fill="transparent"
                />
                
                {/* Home team arc */}
                <Circle
                  cx="60"
                  cy="60"
                  r="50"
                  stroke={homeColor}
                  strokeWidth="20"
                  fill="transparent"
                  strokeDasharray={`${(homeFaceoffPct / 100) * 314.159} 314.159`}
                  strokeDashoffset="0"
                  transform="rotate(-90 60 60)"
                />
                
                {/* Away team arc */}
                <Circle
                  cx="60"
                  cy="60"
                  r="50"
                  stroke={awayColor}
                  strokeWidth="20"
                  fill="transparent"
                  strokeDasharray={`${(awayFaceoffPct / 100) * 314.159} 314.159`}
                  strokeDashoffset="0"
                  transform={`rotate(${(homeFaceoffPct / 100) * 360 - 90} 60 60)`}
                />
              </Svg>
              
              <View style={[styles.faceoffCenter, { backgroundColor: theme.surface }]}>
                <Text style={[styles.faceoffCenterText, { color: theme.text }]}>
                  Faceoff
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.faceoffValues}>
            <View style={styles.faceoffTeam}>
              <View style={[styles.faceoffColor, { backgroundColor: awayColor }]} />
              <Text style={[styles.faceoffTeamText, { color: theme.text }]}>
                {awayTeam?.team?.abbreviation} {awayFaceoffPct.toFixed(1)}%
              </Text>
            </View>
            <View style={styles.faceoffTeam}>
              <Text style={[styles.faceoffTeamText, { color: theme.text }]}>
                {homeFaceoffPct.toFixed(1)}% {homeTeam?.team?.abbreviation}
              </Text>
              <View style={[styles.faceoffColor, { backgroundColor: homeColor }]} />
            </View>
          </View>
        </View>
      </View>
    );
  };

  // Function to render team statistics
  // Helper function to render stats row with bar fills (like soccer)
  const renderStatsRow = (label, homeValue, awayValue, homeColor, awayColor) => {
    const homeNum = typeof homeValue === 'number' ? homeValue : parseFloat(homeValue) || 0;
    const awayNum = typeof awayValue === 'number' ? awayValue : parseFloat(awayValue) || 0;
    const total = homeNum + awayNum;
    const homePercent = total > 0 ? (homeNum / total) * 100 : 50;
    const awayPercent = total > 0 ? (awayNum / total) * 100 : 50;

    return (
      <View key={label} style={styles.statsRow}>
        <Text style={[styles.statsValue, styles.statsValueAway, { color: theme.text }]}>
          {awayValue}
        </Text>
        <View style={styles.statsBarContainer}>
          <View style={[styles.statsBar, { backgroundColor: theme.border }]}>
            <View 
              style={[
                styles.statsBarFill, 
                styles.statsBarFillAway,
                { width: `${awayPercent}%`, backgroundColor: awayColor }
              ]} 
            />
            <View 
              style={[
                styles.statsBarFill, 
                styles.statsBarFillHome,
                { width: `${homePercent}%`, backgroundColor: homeColor }
              ]} 
            />
          </View>
          <Text style={[styles.statsLabel, { color: theme.textSecondary }]}>{label}</Text>
        </View>
        <Text style={[styles.statsValue, styles.statsValueHome, { color: theme.text }]}>
          {homeValue}
        </Text>
      </View>
    );
  };

  const renderTeamStats = () => {
    if (!details?.boxscore?.teams) return null;
    
    const teams = details.boxscore.teams;
    const awayTeam = teams.find(t => t.homeAway === 'away') || teams[0];
    const homeTeam = teams.find(t => t.homeAway === 'home') || teams[1];
    
    const keyStats = [
      'shotsTotal',
      'hits', 
      'blockedShots',
      'powerPlayGoals',
      'powerPlayOpportunities',
      'faceoffsWon',
      'penalties',
      'penaltyMinutes'
    ];
    
    // Get team colors
    const homeColor = homeTeam?.team?.color ? `#${homeTeam.team.color}` : colors.primary;
    const awayColor = awayTeam?.team?.color ? `#${awayTeam.team.color}` : colors.secondary || '#666';
    
    return (
      <View style={styles.teamStatsContainer}>
        <Text style={[styles.statsSectionTitle, { color: theme.text }]}>Team Statistics</Text>
        <View style={styles.statsHeader}>
          <View style={styles.teamHeaderLeft}>
            <Image source={{ uri: awayTeam?.team?.logo || getTeamLogoUrl('nhl', awayTeam?.team?.abbreviation) }} style={styles.teamSmallLogo} />
            <Text style={[styles.teamStatsTeamName, { color: theme.text }]}>{awayTeam?.team?.abbreviation}</Text>
          </View>
          <View style={styles.teamHeaderRight}>
            <Text style={[styles.teamStatsTeamName, { color: theme.text }]}>{homeTeam?.team?.abbreviation}</Text>
            <Image source={{ uri: homeTeam?.team?.logo || getTeamLogoUrl('nhl', homeTeam?.team?.abbreviation) }} style={[styles.teamSmallLogo, {marginLeft: 8}]} />
          </View>
        </View>
      
        {keyStats.map(statName => {
          const awayStat = awayTeam?.statistics?.find(s => s.name === statName);
          const homeStat = homeTeam?.statistics?.find(s => s.name === statName);
          
          if (!awayStat && !homeStat) return null;
          
          const homeValue = homeStat?.displayValue || '0';
          const awayValue = awayStat?.displayValue || '0';
          const label = awayStat?.label || homeStat?.label || statName;
          
          return renderStatsRow(label, homeValue, awayValue, homeColor, awayColor);
        })}
      </View>
    );
  };

  // Function to render leaders section (enhanced layout)
  const renderLeaders = () => {
    if (!details?.leaders || !Array.isArray(details.leaders)) return null;

    return (
      <View style={[styles.leadersContainer, { backgroundColor: theme.surface, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 12, marginVertical: 12 }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Leaders</Text>
        {details.leaders.map((teamLeaders, teamIdx) => (
          <View key={teamIdx} style={styles.teamLeadersContainer}>
            <View style={styles.teamLeadersHeader}>
              <Image 
                source={{ uri: teamLeaders.team?.logo || getTeamLogoUrl('nhl', teamLeaders.team?.abbreviation) }} 
                style={styles.teamLeadersLogo} 
              />
              <Text style={[styles.teamLeadersName, { color: theme.text }]}>
                {teamLeaders.team?.displayName}
              </Text>
            </View>

            {teamLeaders.leaders?.map((category, catIdx) => (
              <View key={catIdx} style={styles.leaderCategory}>
                <Text style={[styles.leaderCategoryTitle, { color: theme.textSecondary }]}>
                  {category.displayName}
                </Text>

                {category.leaders?.slice(0, 5).map((leader, leaderIdx) => {
                  const athlete = leader.athlete || {};
                  const fullName = athlete.fullName || athlete.displayName || '';
                  const parts = fullName.trim().split(' ');
                  const lastName = parts.length > 1 ? parts.pop() : parts[0] || '';
                  const firstPart = parts.join(' ') || '';
                  const jerseyNumber = athlete.jersey || athlete.jerseyNumber || athlete.number || null;
                  const position = athlete.position?.abbreviation || athlete.position?.name || '';
                  const headshot = athlete.headshot?.href || athlete.headshot || athlete.photo || athlete.headshotUrl || null;

                  return (
                    <View key={leaderIdx} style={[styles.enhancedLeaderItem, { backgroundColor: theme.surfaceSecondary || theme.surface }]}>
                      <View style={styles.leaderHeadshotContainer}>
                        {headshot ? (
                          <Image source={{ uri: headshot }} style={styles.leaderHeadshot} />
                        ) : (
                          <View style={[styles.leaderHeadshot, styles.leaderHeadshotPlaceholder, { backgroundColor: theme.surface }]}>
                            <Text style={[styles.leaderInitials, { color: theme.textSecondary }]}>
                              {(firstPart.charAt(0) + lastName.charAt(0)).toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.leaderNameContainer}>
                        <Text style={[styles.leaderFullName, { color: theme.text }]} numberOfLines={1}>
                          {athlete.displayName || athlete.shortName || fullName}
                        </Text>
                        <Text style={[styles.leaderJerseyPosition, { color: theme.textSecondary }]} numberOfLines={1}>
                          {jerseyNumber && position ? `#${jerseyNumber} • ${position}` : 
                           jerseyNumber ? `#${jerseyNumber}` : 
                           position ? position : ''}
                        </Text>
                      </View>

                      <View style={styles.leaderValueContainer}>
                        <Text style={[styles.leaderBigValue, { color: colors.primary }]}>{leader.displayValue}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  };

  // Function to render roster section (home or away)
  const renderRosterSection = (teamType) => {
    if (!details?.boxscore?.teams) return null;
    
    const teams = details.boxscore.teams;
    const team = teams.find(t => t.homeAway === teamType);
    if (!team) return null;
    
    // Check if game is finished - if so, always show full boxscore
    const competition = details?.header?.competitions?.[0] || details?.boxscore?.game || details?.game || null;
    const statusType = competition?.status?.type || details?.game?.status?.type || {};
    const isGameFinished = !!(statusType?.state === 'post' || (statusType?.description || '').toLowerCase().includes('final') || statusType?.completed);
    
    // Check if we have onIce data (only use if game is not finished)
    const hasOnIceData = !isGameFinished && details?.onIce && Array.isArray(details.onIce) && details.onIce.length > 0;
    
    // Get players on ice for this team (from onIce array) if available and game not finished
    const onIceData = hasOnIceData ? details.onIce.find(ice => ice.teamId === team.team.id) : null;
    const onIcePlayers = onIceData?.entries || [];

    // Find the detailed player lists for this team under boxscore.players
    const playersBox = details.boxscore.players || [];
    const teamBox = playersBox.find(pb => pb.team?.id === team.team.id || pb.team?.abbreviation === team.team.abbreviation);
    const teamPlayers = teamBox?.statistics || [];
    const allPlayers = [];

    // Collect all players from different position groups in the teamBox structure
    teamPlayers.forEach(positionGroup => {
      if (positionGroup.athletes) {
        positionGroup.athletes.forEach(athlete => {
          // athlete here is typically an object with an 'athlete' sub-object and 'stats'
          allPlayers.push({
            ...athlete,
            position: positionGroup.name,
            isOnIce: hasOnIceData ? onIcePlayers.some(onIce => String(onIce.athleteid) === String(athlete.athlete?.id)) : false
          });
        });
      }
    });
    
    if (!hasOnIceData) {
      // No onIce data OR game is finished - show all players in one section
      const skaters = allPlayers.filter(p => p.position !== 'goalies');
      const goalies = allPlayers.filter(p => p.position === 'goalies');
      
      // Determine the section title and icon based on game state
      const sectionTitle = isGameFinished ? 'Final Stats' : 'Players';
      const iconName = isGameFinished ? 'chart-line' : 'people-group';
      
      return (
        <View style={styles.rosterContainer}>
          <View style={styles.rosterHeader}>
            <Image 
              source={{ uri: team?.team?.logo || getTeamLogoUrl('nhl', team.team?.abbreviation) }} 
              style={styles.rosterTeamLogo} 
            />
            <Text style={[styles.rosterTeamName, { color: theme.text }]}>
              {team.team?.displayName}
            </Text>
          </View>
          
          <View style={[styles.modernRosterSection, { backgroundColor: theme.surface }]}>
            <View style={styles.modernSectionHeader}>
              <FontAwesome6 name={iconName} size={16} color={theme.text} />
              <Text style={[styles.modernSectionTitle, { color: theme.text }]}>
                {sectionTitle} ({allPlayers.length})
              </Text>
            </View>
            
            {renderStatHeaders(['G','A','TOI'])}
            
            {skaters.map((player, idx) => renderPlayerRow(player, idx, 'all-skater', [9,11,4]))}
            
            {skaters.length > 0 && goalies.length > 0 && renderDivider()}
            
            {goalies.length > 0 && renderStatHeaders(['GA','SA','SV%'], false)}
            {goalies.map((player, idx) => renderPlayerRow(player, idx, 'all-goalie', [0,1,5]))}
          </View>
        </View>
      );
    }
    
    // Has onIce data - show on ice and bench sections
    const playersOnIce = allPlayers.filter(p => p.isOnIce);
    const playersOnBench = allPlayers.filter(p => !p.isOnIce);
    
    const skatersOnIce = playersOnIce.filter(p => p.position !== 'goalies');
    const goaliesOnIce = playersOnIce.filter(p => p.position === 'goalies');
    const skatersOnBench = playersOnBench.filter(p => p.position !== 'goalies');
    const goaliesOnBench = playersOnBench.filter(p => p.position === 'goalies');

    // Helper function to render stat headers (custom labels)
    // Added isSkater param so callers can indicate whether the left column is "Player" or "Goalie"
    function renderStatHeaders(labels = ['G', 'A', 'PTS'], isSkater = true) {
      return (
        <View style={styles.statHeaderRow}>
          <View style={styles.playerInfo}>
            <Text style={[styles.statHeaderText, { color: theme.textSecondary }]}>{isSkater ? 'Player' : 'Goalie'}</Text>
          </View>
          <View style={styles.playerStatsSection}>
            {labels.map((lbl, i) => (
              <Text key={i} style={[styles.statHeaderColumn, { color: theme.textSecondary }]}>{lbl}</Text>
            ))}
          </View>
        </View>
      );
    }

    // Helper function to render a divider line
    function renderDivider() {
      return <View style={[styles.sectionDivider, { borderBottomColor: theme.textSecondary }]} />;
    }

    // Helper function to render a player row with improved styling
    // statIndices: array of indices into player.stats to display (in order)
    function renderPlayerRow(player, idx, keyPrefix, statIndices = [9, 11, 4]) {
      const jerseyNum = player.athlete?.jersey || '';
      const position = player.position === 'goalies' ? 'G' : 
                      player.position === 'forwards' ? 'F' : 
                      player.position === 'defenses' ? 'D' : '';
      
      // pull the stat strings safely by index
      const statValues = statIndices.map(si => (player.stats && player.stats[si] != null) ? player.stats[si] : '0');

      const displayName = player.athlete?.shortName || player.athlete?.displayName || player.athlete?.fullName || '';

      const openPlayer = () => {
        // Attach the stat metadata so the modal can render labels
        const meta = findPlayerStatsMeta(player);
        setSelectedPlayer({ player, meta, displayName });
      };

      return (
        <TouchableOpacity key={`${keyPrefix}-${idx}`} onPress={openPlayer} activeOpacity={0.8}>
          <View style={[styles.modernPlayerRow, { backgroundColor: theme.surfaceSecondary || theme.surface }]}>
            <View style={styles.playerInfo}>
              <View style={styles.playerNameSection}>
                <Text style={[styles.modernPlayerName, { color: theme.text }]} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={[styles.playerDetails, { color: theme.textSecondary }]} numberOfLines={1}>
                  {jerseyNum && position ? `#${jerseyNum} • ${position}` : 
                   jerseyNum ? `#${jerseyNum}` : 
                   position ? position : ''}
                </Text>
              </View>
            </View>
            <View style={styles.playerStatsSection}>
              {statValues.map((stat, statIdx) => (
                <Text key={statIdx} style={[styles.modernPlayerStat, { color: theme.textSecondary }]}>
                  {stat}
                </Text>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    const totalOnIce = skatersOnIce.length + goaliesOnIce.length;
    const totalOnBench = skatersOnBench.length + goaliesOnBench.length;
    
    return (
      <View style={styles.rosterContainer}>
        <View style={styles.rosterHeader}>
          <Image 
            source={{ uri: team?.team?.logo || getTeamLogoUrl('nhl', team.team?.abbreviation) }} 
            style={styles.rosterTeamLogo} 
          />
          <Text style={[styles.rosterTeamName, { color: theme.text }]}>
            {team.team?.displayName}
          </Text>
        </View>
        
        {/* On Ice Section - Combined */}
        {totalOnIce > 0 && (
          <View style={[styles.modernRosterSection, { backgroundColor: theme.surface }]}>
            <View style={styles.modernSectionHeader}>
              <FontAwesome6 name="hockey-puck" size={16} color={theme.text} />
              <Text style={[styles.modernSectionTitle, { color: theme.text }]}>
                On Ice ({totalOnIce})
              </Text>
            </View>
            
            {renderStatHeaders(['G','A','TOI'])}
            
            {skatersOnIce.map((player, idx) => renderPlayerRow(player, idx, 'onice-skater', [9,11,4]))}
            
            {skatersOnIce.length > 0 && goaliesOnIce.length > 0 && renderDivider()}
            
            {/* Goalies use different stat indices and header */}
            {goaliesOnIce.length > 0 && renderStatHeaders(['GA','SA','SV%'])}
            {goaliesOnIce.map((player, idx) => renderPlayerRow(player, idx, 'onice-goalie', [0,1,5]))}
          </View>
        )}
        
        {/* Bench Section - Combined */}
        {totalOnBench > 0 && (
          <View style={[styles.modernRosterSection, { backgroundColor: theme.surface }]}>
            <View style={styles.modernSectionHeader}>
              <FontAwesome6 name="chair" size={16} color={theme.text} />
              <Text style={[styles.modernSectionTitle, { color: theme.text }]}>
                Bench ({totalOnBench})
              </Text>
            </View>
            
            {renderStatHeaders(['G','A','TOI'])}
            
            {skatersOnBench.map((player, idx) => renderPlayerRow(player, idx, 'bench-skater', [9,11,4]))}
            
            {skatersOnBench.length > 0 && goaliesOnBench.length > 0 && renderDivider()}
            
            {goaliesOnBench.length > 0 && renderStatHeaders(['GA','SA','SV%'])}
            {goaliesOnBench.map((player, idx) => renderPlayerRow(player, idx, 'bench-goalie', [0,1,5]))}
          </View>
        )}
      </View>
    );
  };

  // Function to render plays in soccer-style containers
  const renderPlays = () => {
    // Use precomputed playsData when available (fast path). If not, fall back to computing inline.
    if (playsData && Array.isArray(playsData)) {
      if (playsData.length === 0) {
        return (
          <View style={styles.noPlaysContainer}>
            <Text style={[styles.noPlaysText, { color: theme.textSecondary }]}>No plays available</Text>
          </View>
        );
      }

      return playsData.map((p, index) => {
        const playKey = p.id ?? index;
        const isOpen = openPlays.has(playKey);
        
        return (
          <View key={playKey} style={[
            styles.playContainer, 
            { backgroundColor: p.isScoring ? (p.playTeamColor ? hexToRgba(p.playTeamColor, 0.12) : theme.surface) : theme.surface },
            p.borderLeftColor ? { borderLeftWidth: p.borderLeftWidth, borderLeftColor: p.borderLeftColor } : null
          ]}> 
            <TouchableOpacity 
              style={styles.playHeader}
              onPress={() => togglePlay(playKey)}
              activeOpacity={0.7}
            >
              <View style={styles.playMainInfo}>
                <View style={styles.playTeamsScore}>
                  <View style={styles.teamScoreDisplay}>
                    {p.awayLogoUri ? <Image source={{ uri: p.awayLogoUri }} style={[styles.teamLogoSmall, p.isScoring && styles.logoDarkOverride]} /> : null}
                    <Text style={[styles.scoreSmall, { color: p.textColor }]}>{p.awayScore}</Text>
                  </View>
                  <Text style={[styles.scoreSeparator, { color: theme.text }]}>-</Text>
                  <View style={styles.teamScoreDisplay}>
                    <Text style={[styles.scoreSmall, { color: p.textColor }]}>{p.homeScore}</Text>
                    {p.homeLogoUri ? <Image source={{ uri: p.homeLogoUri }} style={[styles.teamLogoSmall, p.isScoring && styles.logoDarkOverride]} /> : null}
                  </View>
                </View>
                <View style={styles.playSummary}>
                  <Text style={[styles.playDescription, { color: p.textColor }]}>{p.playText}</Text>
                  {p.isScoring && (
                    <View style={[styles.scoreIndicator, { backgroundColor: p.playTeamColor || colors.primary }]}>
                      <Text style={[styles.scoreIndicatorText, { color: `#fff` }]}>GOAL</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.playRightSection}>
                <View style={styles.playTimePeriod}>
                  <Text style={[styles.playPeriod, { color: theme.textSecondary }]}>{p.period}</Text>
                  <Text style={[styles.playClock, { color: theme.textSecondary }]}>{p.clock}</Text>
                </View>
                <TouchableOpacity style={styles.playToggle} onPress={() => togglePlay(playKey)}>
                  <Text style={[styles.toggleIcon, { color: theme.text }]}>
                    {isOpen ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>

            {isOpen && (
              <View style={styles.playDetails}>
                <View style={styles.playDetailsContent}>
                  <View style={styles.playDetailsRow}>
                    <View style={styles.miniFieldContainer}>
                      {/* Hockey rink with proper markings */}
                      <View style={styles.miniField}>
                        {renderHockeyRink(
                          (p.coordX != null && p.coordY != null) ? { x: p.coordX, y: p.coordY, color: ensureHexColor(p.playTeamColor) || '#999' } : null
                        )}
                      </View>
                    </View>

                    <View style={[styles.playEventInfo, { backgroundColor: p.isScoring ? 'rgba(255,255,255,0.12)' : theme.background, flex: 1 }]}> 
                      <Text style={[styles.playDescription, { color: p.isScoring ? '#FFFFFF' : theme.text }]}> 
                        {p.playText}
                      </Text>
                      {(p.clock || p.period) && (
                        <Text style={[styles.playClock, { color: theme.textSecondary, marginTop: 8 }]}> 
                          {p.period ? `${p.period} - ${p.clock}` : p.clock}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            )}
          </View>
        );
      });
    }

    // fallback (previous inline computation) — keep for safety but should rarely run now
    return (
      <View style={styles.noPlaysContainer}>
        <Text style={[styles.noPlaysText, { color: theme.textSecondary }]}>No plays available</Text>
      </View>
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={{ padding: 12 }}>
      {/* Top header card (matches soccer layout) */}
      <View style={[styles.headerCard, { backgroundColor: theme.surface, borderColor: 'rgba(0,0,0,0.08)' }]}>
        <Text style={[styles.competitionText, { color: theme.textSecondary }]} numberOfLines={1}>
          {competition?.name || details?.league || 'NHL'}{details?.gameInfo?.venue?.fullName ? ` - ${details.gameInfo.venue.fullName}` : ''}
        </Text>

        <View style={styles.soccerMainRow}>
          {/* Away team section (left) */}
          <View style={styles.soccerTeamSection}>
            {away?.team?.logo || away?.logo ? (
              <Image source={{ uri: away.team?.logo || away.logo }} style={[styles.soccerTeamLogo, awayIsLoser && styles.losingTeamLogo]} />
            ) : (
              <Image source={{ uri: getTeamLogoUrl('nhl', away?.team?.abbreviation || away?.abbreviation) }} style={[styles.soccerTeamLogo, awayIsLoser && styles.losingTeamLogo]} />
            )}
            <Text style={[styles.soccerTeamName, { color: awayIsLoser ? '#999' : theme.text }]} numberOfLines={2}>
              {away?.team?.abbreviation || away?.team?.name || away?.team?.displayName || ''}
            </Text>
          </View>

          {/* Score section (center) */}
          <View style={styles.soccerScoreSection}>
            <View style={styles.soccerScoreRow}>
              <Text style={[styles.soccerScore, { color: isGameFinal ? (awayIsWinner ? colors.primary : (awayIsLoser ? '#999' : theme.text)) : theme.text }]}>
                {away?.score ?? away?.team?.score ?? '0'}
              </Text>
              <View style={[
                styles.soccerStatusBadge,
                (() => {
                  const gameStatus = getGameStatus();
                  if (gameStatus.isLive) return { backgroundColor: colors.primary };
                  if (gameStatus.isPre) return { backgroundColor: '#4CAF50' };
                  return { backgroundColor: '#9E9E9E' };
                })()
              ]}>
                <Text style={styles.soccerStatusText}>{getGameStatus().text}</Text>
                <Text style={[styles.soccerFullTimeText, { color: '#FFFFFF', marginTop: 4 }]}>
                  {getGameStatus().detail}
                </Text>
              </View>
              <Text style={[styles.soccerScore, { color: isGameFinal ? (homeIsWinner ? colors.primary : (homeIsLoser ? '#999' : theme.text)) : theme.text }]}>
                {home?.score ?? home?.team?.score ?? '0'}
              </Text>
            </View>
          </View>

          {/* Home team section (right) */}
          <View style={styles.soccerTeamSection}>
            {home?.team?.logo || home?.logo ? (
              <Image source={{ uri: home.team?.logo || home.logo }} style={[styles.soccerTeamLogo, homeIsLoser && styles.losingTeamLogo]} />
            ) : (
              <Image source={{ uri: getTeamLogoUrl('nhl', home?.team?.abbreviation || home?.abbreviation) }} style={[styles.soccerTeamLogo, homeIsLoser && styles.losingTeamLogo]} />
            )}
            <Text style={[styles.soccerTeamName, { color: homeIsLoser ? '#999' : theme.text }]} numberOfLines={2}>
              {home?.team?.abbreviation || home?.team?.name || home?.team?.displayName || ''}
            </Text>
          </View>
        </View>

        {/* Scorers section - soccer style: left away, center puck, right home */}
        {((awayScorers && awayScorers.length > 0) || (homeScorers && homeScorers.length > 0)) && (
          <View style={styles.scorersSectionRow}>
            <View style={styles.scorersColumn}>
              {awayScorers && awayScorers.length > 0 && awayScorers.map((scorer, idx) => (
                <Text key={`a-${idx}`} style={[styles.scorerText, { color: theme.text, textAlign: 'left' }]}>{scorer}</Text>
              ))}
            </View>

            <View style={styles.scorersCenter}>
              <FontAwesome6 name="hockey-puck" size={18} color={theme.text} />
            </View>

            <View style={[styles.scorersColumn, { alignItems: 'flex-end' }]}>
              {homeScorers && homeScorers.length > 0 && homeScorers.map((scorer, idx) => (
                <Text key={`h-${idx}`} style={[styles.scorerText, { color: theme.text, textAlign: 'right' }]}>{scorer}</Text>
              ))}
            </View>
          </View>
        )}

        <Text style={[styles.dateText, { color: theme.textSecondary }]}>
          {new Date(gameDate).toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </Text>
      </View>

      {/* Stream Button - only show for live games */}
      {(() => {
        const competition = details?.header?.competitions?.[0] || details?.boxscore?.game || details?.game || null;
        const statusType = competition?.status?.type || details?.game?.status?.type || {};
        const state = statusType?.state;
        const isLive = state === 'in';
        
        return isLive ? (
          <TouchableOpacity 
            style={[styles.streamButton, { backgroundColor: colors.primary }]}
            onPress={openStreamModal}
          >
            <FontAwesome6 name="play" size={16} color="white" style={{ marginRight: 8 }} />
            <Text style={styles.streamButtonText}>Watch Live Stream</Text>
          </TouchableOpacity>
        ) : null;
      })()}

      {/* Tab Container */}
      <View style={[styles.tabContainer, { backgroundColor: theme.surface }]}>
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[
              styles.tab,
              { backgroundColor: activeTab === 'stats' ? colors.primary : 'transparent' }
            ]}
            onPress={() => setActiveTab('stats')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'stats' ? '#fff' : theme.text }]}>
              Stats
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              { backgroundColor: activeTab === 'away' ? colors.primary : 'transparent' }
            ]}
            onPress={() => setActiveTab('away')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'away' ? '#fff' : theme.text }]}>
              Away
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              { backgroundColor: activeTab === 'home' ? colors.primary : 'transparent' }
            ]}
            onPress={() => setActiveTab('home')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'home' ? '#fff' : theme.text }]}>
              Home
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              styles.lastTab,
              { backgroundColor: activeTab === 'plays' ? colors.primary : 'transparent' }
            ]}
            onPress={() => setActiveTab('plays')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'plays' ? '#fff' : theme.text }]}>
              Plays
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab Content */}
      <View style={styles.tabContent}>
        {activeTab === 'stats' && (
          <View>
            {/* Single card container for all match stats to match soccer layout */}
            <View style={[styles.matchStatsCard, { backgroundColor: theme.surface }]}> 
              <Text style={[styles.matchStatsTitle, { color: theme.text }]}>Match Stats</Text>

              <View style={styles.statsSectionInner}>
                {renderFaceoffCircle()}
              </View>

              <View style={styles.statsSectionInner}>
                {renderTeamStats()}
              </View>
            </View>

            {/* Leaders section as separate card */}
            {renderLeaders()}
          </View>
        )}

        {activeTab === 'home' && (
          <View>
            {renderRosterSection('home')}
          </View>
        )}

        {activeTab === 'away' && (
          <View>
            {renderRosterSection('away')}
          </View>
        )}

        {activeTab === 'plays' && (
          <View>
            {renderPlays()}
          </View>
        )}
      </View>

      {/* Player Details Modal */}
      <Modal visible={!!selectedPlayer} animationType="slide" transparent onRequestClose={() => setSelectedPlayer(null)}>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            {selectedPlayer && (() => {
              const player = selectedPlayer.player;
              const athlete = player?.athlete;
              const meta = selectedPlayer.meta || {};
              const labels = meta.labels || [];
              const keys = meta.keys || [];
              const stats = player?.stats || [];
              const groupName = meta.groupName || '';
              
              // Player info
              const headshot = athlete?.headshot?.href;
              const fullName = athlete?.displayName || athlete?.fullName || '';
              const shortName = athlete?.shortName || '';
              const jersey = athlete?.jersey;
              const position = athlete?.position?.abbreviation || athlete?.position?.name || '';
              
              // Team info - get from the team box that contains this player
              const playersBox = details?.boxscore?.players || [];
              let team = null;
              for (const teamBox of playersBox) {
                if (teamBox?.statistics) {
                  for (const group of teamBox.statistics) {
                    if (group?.athletes) {
                      const found = group.athletes.find(a => String(a?.athlete?.id) === String(athlete?.id));
                      if (found) {
                        team = teamBox.team;
                        break;
                      }
                    }
                  }
                  if (team) break;
                }
              }
              const teamName = team?.displayName || team?.name || '';
              const teamLogo = team?.logo || (team?.abbreviation ? getTeamLogoUrl('nhl', team.abbreviation) : null);
              
              // Define most important stats by position
              const isGoalie = groupName === 'goalies' || position === 'G';
              
              let importantStatIndices = [];
              let importantLabels = [];
              
              if (isGoalie) {
                // Goalies: GA, SA, Saves, SV%, TOI, PPSV, SHSV, ESSV, PIM
                const goalieStats = ['goalsAgainst', 'shotsAgainst', 'saves', 'savePct', 'timeOnIce', 'powerPlaySaves', 'shortHandedSaves', 'evenStrengthSaves', 'penaltyMinutes'];
                goalieStats.forEach(statKey => {
                  const idx = keys.indexOf(statKey);
                  if (idx >= 0) {
                    importantStatIndices.push(idx);
                    importantLabels.push(labels[idx] || statKey);
                  }
                });
              } else {
                // Skaters: G, A, +/-, S, TOI, PPTOI, Hits, BS, PIM
                const skaterStats = ['goals', 'assists', 'plusMinus', 'shotsTotal', 'timeOnIce', 'powerPlayTimeOnIce', 'hits', 'blockedShots', 'penaltyMinutes'];
                skaterStats.forEach(statKey => {
                  const idx = keys.indexOf(statKey);
                  if (idx >= 0) {
                    importantStatIndices.push(idx);
                    importantLabels.push(labels[idx] || statKey);
                  }
                });
              }

              return (
                <>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalPlayerInfo}>
                      {headshot ? (
                        <Image source={{ uri: headshot }} style={styles.modalHeadshot} />
                      ) : (
                        <View style={[styles.modalHeadshotPlaceholder, { backgroundColor: theme.surface }]}>
                          <Text style={[styles.modalInitials, { color: theme.textSecondary }]}>
                            {fullName.split(' ').map(n => n.charAt(0)).join('').toUpperCase().slice(0, 2)}
                          </Text>
                        </View>
                      )}
                      <View style={styles.modalPlayerDetails}>
                        <Text style={[styles.modalName, { color: theme.text }]} numberOfLines={1}>{fullName}</Text>
                        <Text style={[styles.modalPlayerMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                          {jersey && position ? `#${jersey} • ${position}` : jersey ? `#${jersey}` : position ? position : ''}
                        </Text>
                        <View style={styles.modalTeamRow}>
                          {teamLogo && <Image source={{ uri: teamLogo }} style={styles.modalTeamLogo} />}
                          <Text style={[styles.modalTeam, { color: theme.textSecondary }]} numberOfLines={1}>{teamName}</Text>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setSelectedPlayer(null)} style={styles.modalClose}>
                      <Text style={{ fontSize: 18, color: theme.text }}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.modalStatsHeader}>
                    <Text style={[styles.modalStatsTitle, { color: theme.text }]}>Game Statistics</Text>
                    <Text style={[styles.modalStatsDate, { color: theme.textSecondary }]}>
                      {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  </View>

                  <ScrollView style={styles.modalStatsContainer} contentContainerStyle={{ padding: 12 }}>
                    {importantStatIndices.length > 0 ? (
                      <View style={styles.modalStatsGrid}>
                        {importantStatIndices.map((statIdx, i) => (
                          <View key={i} style={[styles.modalStatBox, { backgroundColor: theme.surfaceSecondary || theme.surface }]}>
                            <Text style={[styles.modalStatBoxValue, { color: theme.text }]}>{stats[statIdx] ?? '-'}</Text>
                            <Text style={[styles.modalStatBoxLabel, { color: theme.textSecondary }]}>{importantLabels[i]}</Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 20 }}>No stats available</Text>
                    )}
                  </ScrollView>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Stream Modal */}
      <Modal
        visible={streamModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeStreamModal}
      >
        <View style={[styles.streamModalContainer, { backgroundColor: theme.background }]}>
          {/* Modal Header */}
          <View style={[styles.streamModalHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <Text style={[styles.streamModalTitle, { color: theme.text }]}>Live Stream</Text>
            <TouchableOpacity onPress={closeStreamModal} style={styles.streamModalCloseButton}>
              <FontAwesome6 name="xmark" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>

          {/* Stream Type Selector */}
          {Object.keys(availableStreams).length > 1 && (
            <View style={[styles.streamTypeContainer, { backgroundColor: theme.surface }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.streamTypeScrollView}>
                {Object.keys(availableStreams).map((streamType) => (
                  <TouchableOpacity
                    key={streamType}
                    style={[
                      styles.streamTypeButton,
                      {
                        backgroundColor: currentStreamType === streamType ? colors.primary : theme.surface,
                        borderColor: currentStreamType === streamType ? colors.primary : theme.border,
                      }
                    ]}
                    onPress={() => switchStream(streamType)}
                  >
                    <Text style={[
                      styles.streamTypeButtonText,
                      { color: currentStreamType === streamType ? 'white' : theme.text }
                    ]}>
                      {streamType.toUpperCase()}
                    </Text>
                    {availableStreams[streamType]?.quality && (
                      <Text style={[
                        styles.streamQualityText,
                        { color: currentStreamType === streamType ? 'white' : theme.textSecondary }
                      ]}>
                        {availableStreams[streamType].quality}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Stream Content */}
          <View style={styles.streamContent}>
            {isStreamLoading && (
              <View style={styles.streamLoadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.streamLoadingText, { color: theme.text }]}>Loading stream...</Text>
              </View>
            )}
            
{streamUrl ? (
              <WebView
                source={{ uri: streamUrl }}
                style={styles.streamWebView}
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
                  console.error('WebView error:', error);
                  setIsStreamLoading(false);
                }}
                userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1"
                injectedJavaScript={`
                  (function() {
                    console.log('Advanced ad blocker initializing...');
                    
                    // Block all popup methods
                    const originalOpen = window.open;
                    window.open = function() {
                      console.log('Blocked window.open popup');
                      return null;
                    };
                    
                    // Block alert, confirm, prompt
                    window.alert = function() { console.log('Blocked alert'); };
                    window.confirm = function() { console.log('Blocked confirm'); return false; };
                    window.prompt = function() { console.log('Blocked prompt'); return null; };
                    
                    // Override addEventListener to block popup events
                    const originalAddEventListener = EventTarget.prototype.addEventListener;
                    EventTarget.prototype.addEventListener = function(type, listener, options) {
                      const blockedEvents = ['beforeunload', 'unload', 'popstate'];
                      if (blockedEvents.includes(type)) {
                        console.log('Blocked event listener for:', type);
                        return;
                      }
                      return originalAddEventListener.call(this, type, listener, options);
                    };
                    
                    // Block navigation attempts
                    const originalAssign = Location.prototype.assign;
                    const originalReplace = Location.prototype.replace;
                    
                    Location.prototype.assign = function(url) {
                      console.log('Blocked location.assign to:', url);
                    };
                    
                    Location.prototype.replace = function(url) {
                      console.log('Blocked location.replace to:', url);
                    };
                    
                    // Block href changes
                    Object.defineProperty(Location.prototype, 'href', {
                      set: function(url) {
                        console.log('Blocked href change to:', url);
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
                    
                    console.log('Advanced ad blocker fully loaded');
                    true;
                  })();
                `}
                onMessage={(event) => {
                  // Handle messages from injected JavaScript if needed
                  console.log('WebView message:', event.nativeEvent.data);
                }}
                // Block popup navigation within the WebView
                onShouldStartLoadWithRequest={(request) => {
                  console.log('NHL WebView navigation request:', request.url);
                  
                  // Allow the initial stream URL to load
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
                    console.log('Invalid URL:', request.url);
                    return false;
                  }
                  
                  // Allow same-domain navigation but block cross-domain (likely popups)
                  if (requestDomain !== currentDomain || hasPopupKeywords) {
                    console.log('Blocked NHL popup/cross-domain navigation:', request.url);
                    return false;
                  }
                  
                  return true;
                }}
                // Handle when WebView tries to open a new window (popup)
                onOpenWindow={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.log('Blocked NHL popup window:', nativeEvent.targetUrl);
                  // Don't open the popup - just log it
                  return false;
                }}
              />
            ) : (
              <View style={styles.noStreamContainer}>
                <Text style={[styles.noStreamText, { color: theme.text }]}>No stream URL available</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
};

// Insert modal component outside main return so it can be referenced by styles if needed
// (We'll render it conditionally inside the component below)


const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  teamRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  logo: { width: 48, height: 48, marginRight: 12 }
  ,
  /* Soccer-like header card styles */
  headerCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  competitionText: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center'
  },
  headerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  teamBlock: {
    flex: 1,
    alignItems: 'center'
  },
  teamLogoLarge: {
    width: 56,
    height: 56,
    marginBottom: 8
  },
  teamNameLarge: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center'
  },
  scorerText: {
    fontSize: 12,
    marginTop: 4
  },
  scoreBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  scoreLarge: {
    fontSize: 36,
    fontWeight: '800'
  },
  statusBadge: {
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20
  },
  statusBadgeText: {
    color: '#fff',
    fontWeight: '700'
  },
  dateText: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 12
  },
  
  /* Scorers section styles */
  scorersSection: {
    marginTop: 12,
    marginBottom: 8,
  },
  scorersList: {
    marginBottom: 8,
  },
  scorerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    justifyContent: 'center',
  },
  scorerIcon: {
    marginRight: 6,
  },
  scorerText: {
    fontSize: 13,
    fontWeight: '500',
  },
  scorersSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 8,
  },
  scorersColumn: {
    flex: 1,
    paddingHorizontal: 8,
  },
  scorersCenter: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  /* Faceoff bar styles */
  faceoffContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  faceoffTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  faceoffBarContainer: {
    alignItems: 'center',
    width: '80%',
  },
  faceoffBar: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  faceoffBarSegment: {
    height: '100%',
  },
  faceoffLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 16,
  },
  faceoffLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  faceoffColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  faceoffLabelText: {
    fontSize: 14,
    fontWeight: '500',
  },
  
  /* Team stats styles */
  teamStatsContainer: {
    marginVertical: 12,
    paddingHorizontal: 4,
    width: '100%',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  teamStatsTeamName: {
    fontSize: 16,
    fontWeight: '600',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  statValue: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  statLabel: {
    flex: 2,
    fontSize: 14,
    textAlign: 'center',
  },
  
  /* Leaders styles */
  leadersContainer: {
    marginVertical: 20,
    paddingHorizontal: 0,
  },
  teamLeadersContainer: {
    marginBottom: 24,
    paddingHorizontal: 0,
  },
  teamLeadersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  teamLeadersLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  teamLeadersName: {
    fontSize: 16,
    fontWeight: '600',
  },
  leaderCategory: {
    marginBottom: 16,
    paddingLeft: 0,
  },
  leaderCategoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  leaderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  leaderName: {
    fontSize: 14,
  },
  leaderValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  
  /* Roster styles */
  rosterContainer: {
    marginVertical: 20,
  },
  rosterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    justifyContent: 'center',
  },
  rosterTeamLogo: {
    width: 32,
    height: 32,
    marginRight: 12,
  },
  rosterTeamName: {
    fontSize: 18,
    fontWeight: '700',
  },
  rosterSection: {
    marginBottom: 24,
  },
  rosterSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  rosterSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 12,
    borderRadius: 6,
    backgroundColor: '#999',
    borderWidth: 1,
    borderColor: '#fff',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },

  /* Modern roster styles */
  modernRosterSection: {
    marginBottom: 16,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  modernSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modernSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  modernPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 4,
    borderRadius: 8,
    minHeight: 40,
  },
  playerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerNameSection: {
    flex: 1,
  },
  modernPlayerName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  playerDetails: {
    fontSize: 12,
    fontWeight: '400',
  },
  playerStatsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 150,
    justifyContent: 'flex-end',
  },
  modernPlayerStat: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 18,
    minWidth: 36,
    textAlign: 'right',
  },
  statHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  statHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  statHeaderColumn: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 18,
    minWidth: 36,
    textAlign: 'right',
    textTransform: 'uppercase',
  },
  sectionDivider: {
    height: 1,
    borderBottomWidth: 1,
    marginVertical: 8,
    marginHorizontal: 12,
    opacity: 0.3,
  },

  /* Faceoff circle styles (matching soccer exactly) */
  faceoffContainer: {
    marginVertical: 12,
    alignItems: 'center',
  },
  faceoffTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  faceoffSection: {
    alignItems: 'center',
    marginBottom: 8,
  },
  faceoffCircleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  faceoffCircle: {
    width: 120,
    height: 120,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  faceoffSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  faceoffCenter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    zIndex: 10,
    backgroundColor: '#fff',
  },
  faceoffCenterText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  faceoffValues: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    gap: 50,
  },
  faceoffTeam: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  faceoffColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  faceoffTeamText: {
    fontSize: 14,
    fontWeight: '600',
  },

  /* Match stats card to visually match soccer layout */
  matchStatsCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
  },
  matchStatsTitle: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: '#fff'
  },
  teamSmallLogo: {
    width: 22,
    height: 22,
    resizeMode: 'contain',
    marginRight: 8,
  },
  teamHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  teamHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center'
  }
  ,
  playerStats: {
    flex: 2,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  playerStat: {
    fontSize: 12,
    marginLeft: 8,
  },
  
  /* Soccer-exact layout styles */
  soccerMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  soccerTeamSection: {
    flex: 1,
    alignItems: 'center',
  },
  soccerTeamLogo: {
    width: 56,
    height: 56,
    marginBottom: 8,
  },
  soccerTeamName: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 2,
  },
  soccerScorerText: {
    fontSize: 12.5,
    textAlign: 'center',
  },
  soccerScoreSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  soccerScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  soccerScore: {
    fontSize: 36,
    fontWeight: '800',
    marginHorizontal: 12,
  },
  soccerStatusBadge: {
    backgroundColor: '#9E9E9E',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soccerStatusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  soccerFullTimeText: {
    fontSize: 11,
    textAlign: 'center',
  }
  ,
  losingTeamLogo: {
    opacity: 0.5,
  },
  
  /* Tab styles */
  tabContainer: {
    marginHorizontal: 0,
    marginTop: 4,
    borderRadius: 12,
    padding: 4,
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tab: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    alignItems: 'center',
  },
  lastTab: {
    marginRight: 0,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabContent: {
    margin: 0,
    paddingTop: 12,
    minHeight: 200,
  },
  
  /* Plays styles (matching soccer) */
  playContainer: {
    marginVertical: 6,
    marginHorizontal: 0,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    alignSelf: 'stretch',
  },
  playHeader: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playMainInfo: {
    flex: 1,
    marginRight: 16,
  },
  playTeamsScore: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamScoreDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamLogoSmall: {
    width: 20,
    height: 20,
    marginHorizontal: 4,
  },
  scoreSmall: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  scoreSeparator: {
    fontSize: 14,
    fontWeight: 'bold',
    marginHorizontal: 8,
  },
  playSummary: {
    flex: 1,
  },
  playTimePeriod: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  playPeriod: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: 8,
  },
  playClock: {
    fontSize: 12,
    fontWeight: '600',
  },
  playDescription: {
    fontSize: 14,
    marginBottom: 4,
  },
  goalBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  goalBadgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  logoDarkOverride: {
    // prevent any tint from theming and ensure proper sizing for dark logos
    tintColor: undefined,
  },
  noPlaysContainer: {
    alignItems: 'center',
    padding: 24,
  },
  noPlaysText: {
    fontSize: 16,
    textAlign: 'center',
  },
  playRightSection: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: 60,
  },
  scoreIndicator: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ff6b35',
    backgroundColor: '#ff6b351a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  scoreIndicatorText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ff6b35',
  },
  playToggle: {
    padding: 8,
  },
  toggleIcon: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  playDetails: {
    padding: 16,
    paddingTop: 0,
  },
  playDetailsContent: {
    alignItems: 'center',
  },
  playDetailsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  miniFieldContainer: {
    marginRight: 16,
    alignItems: 'center',
  },
  miniField: {
    width: 180,
    height: 120,
    marginVertical: 16,
    alignSelf: 'center',
  },
  hockeyRink: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  rinkOutline: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderWidth: 2,
    borderColor: '#4A90E2',
    borderRadius: 8,
  },
  centerLine: {
    position: 'absolute',
    left: '50%',
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: '#E74C3C',
    marginLeft: -1,
  },
  centerCircle: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 40,
    height: 40,
    borderWidth: 2,
    borderColor: '#4A90E2',
    borderRadius: 20,
    marginLeft: -20,
    marginTop: -20,
  },
  centerDot: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 4,
    height: 4,
    backgroundColor: '#4A90E2',
    borderRadius: 2,
    marginLeft: -2,
    marginTop: -2,
  },
  leftGoalLine: {
    position: 'absolute',
    left: '30%',
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: '#4A90E2',
  },
  rightGoalLine: {
    position: 'absolute',
    right: '30%',
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: '#4A90E2',
  },
  leftFaceoffCircleTop: {
    position: 'absolute',
    left: '12.5%',
    top: '10%',
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#E74C3C',
    borderRadius: 12,
  },
  leftFaceoffCircleBottom: {
    position: 'absolute',
    left: '12.5%',
    bottom: '20%',
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#E74C3C',
    borderRadius: 12,
    marginBottom: -12,
  },
  leftFaceoffDotTop: {
    position: 'absolute',
    left: '12.5%',
    top: '10%',
    width: 3,
    height: 3,
    backgroundColor: '#E74C3C',
    borderRadius: 1.5,
    marginLeft: 10.5,
    marginTop: 10.5,
  },
  leftFaceoffDotBottom: {
    position: 'absolute',
    left: '12.5%',
    bottom: '0%',
    width: 3,
    height: 3,
    backgroundColor: '#E74C3C',
    borderRadius: 1.5,
    marginLeft: 10.5,
    marginBottom: 22.5,
  },
  rightFaceoffCircleTop: {
    position: 'absolute',
    right: '12.5%',
    top: '10%',
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#E74C3C',
    borderRadius: 12,
  },
  rightFaceoffCircleBottom: {
    position: 'absolute',
    right: '12.5%',
    bottom: '20%',
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#E74C3C',
    borderRadius: 12,
    marginBottom: -12,
  },
  rightFaceoffDotTop: {
    position: 'absolute',
    right: '12.5%',
    top: '10%',
    width: 3,
    height: 3,
    backgroundColor: '#E74C3C',
    borderRadius: 1.5,
    marginRight: 10.5,
    marginTop: 10.5,
  },
  rightFaceoffDotBottom: {
    position: 'absolute',
    right: '12.5%',
    bottom: '0%',
    width: 3,
    height: 3,
    backgroundColor: '#E74C3C',
    borderRadius: 1.5,
    marginRight: 10.5,
    marginBottom: 22.5,
  },
  leftGoalCrease: {
    position: 'absolute',
    left: 15,
    top: '47.5%',
    width: 20,
    height: 30,
    backgroundColor: '#87CEEB',
    opacity: 0.3,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    marginTop: -11,
  },
  leftGoalCreaseOutline: {
    position: 'absolute',
    left: 15,
    top: '47.5%',
    width: 20,
    height: 30,
    borderRightWidth: 2,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#4A90E2',
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    marginTop: -11,
  },
  rightGoalCrease: {
    position: 'absolute',
    right: 15,
    top: '47.5%',
    width: 20,
    height: 30,
    backgroundColor: '#87CEEB',
    opacity: 0.3,
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
    marginTop: -11,
  },
  rightGoalCreaseOutline: {
    position: 'absolute',
    right: 15,
    top: '47.5%',
    width: 20,
    height: 30,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#4A90E2',
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
    marginTop: -11,
  },
  neutralZoneDotTopLeft: {
    position: 'absolute',
    left: '35%',
    top: '25%',
    width: 3,
    height: 3,
    backgroundColor: '#E74C3C',
    borderRadius: 1.5,
    marginTop: 10.5,
  },
  neutralZoneDotTopRight: {
    position: 'absolute',
    right: '35%',
    top: '25%',
    width: 3,
    height: 3,
    backgroundColor: '#E74C3C',
    borderRadius: 1.5,
    marginTop: 10.5,
  },
  neutralZoneDotBottomLeft: {
    position: 'absolute',
    left: '35%',
    bottom: '25%',
    width: 3,
    height: 3,
    backgroundColor: '#E74C3C',
    borderRadius: 1.5,
    marginBottom: 10.5,
  },
  neutralZoneDotBottomRight: {
    position: 'absolute',
    right: '35%',
    bottom: '25%',
    width: 3,
    height: 3,
    backgroundColor: '#E74C3C',
    borderRadius: 1.5,
    marginBottom: 10.5,
  },
  leftGoalLineBehindCrease: {
    position: 'absolute',
    left: 13,
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: '#E74C3C',
  },
  rightGoalLineBehindCrease: {
    position: 'absolute',
    right: 13,
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: '#E74C3C',
  },
  playEventInfo: {
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    marginBottom: 12,
  }
  ,
  playMarker: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#999',
    borderWidth: 1,
    borderColor: '#fff',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  }
  ,
  /* Player modal styles */
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxHeight: '80%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)'
  },
  modalPlayerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modalHeadshot: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
  },
  modalHeadshotPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ddd',
  },
  modalInitials: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalPlayerDetails: {
    flex: 1,
  },
  modalName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalPlayerMeta: {
    fontSize: 13,
    marginBottom: 4,
  },
  modalTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTeamLogo: {
    width: 16,
    height: 16,
    marginRight: 6,
  },
  modalTeam: {
    fontSize: 12,
  },
  modalClose: {
    paddingLeft: 12,
    paddingRight: 4,
    justifyContent: 'center'
  },
  modalStatsHeader: {
    padding: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)'
  },
  modalStatsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  modalStatsDate: {
    fontSize: 12,
  },
  modalStatsContainer: {
    maxHeight: '100%'
  },
  modalStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  modalStatBox: {
    width: '30%',
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalStatBoxValue: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalStatBoxLabel: {
    fontSize: 11,
    textAlign: 'center',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  modalStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)'
  },
  modalStatLabel: {
    fontSize: 14,
    flex: 1,
  },
  modalStatValue: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  /* Additional leader / stats section styles (enhanced leaders layout) */
  leaderHeadshotContainer: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  leaderHeadshot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#ddd',
  },
  leaderHeadshotPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderNameContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  leaderFullName: {
    fontSize: 14,
    fontWeight: '600',
  },
  leaderJerseyPosition: {
    fontSize: 12,
    marginTop: 2,
  },
  leaderFirstName: {
    fontSize: 13,
    fontWeight: '600',
  },
  leaderLastName: {
    fontSize: 13,
    fontWeight: '700',
  },
  leaderJerseyContainer: {
    width: 56,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 8,
  },
  leaderJerseyNumber: {
    fontSize: 12,
    fontWeight: '700',
  },
  leaderPosition: {
    fontSize: 11,
    marginTop: 4,
  },
  leaderValueContainer: {
    width: 72,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 12,
  },
  leaderBigValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  statsSectionInner: {
    marginBottom: 12,
    alignItems: 'center',
  },
  leaderInitials: {
    fontSize: 14,
    fontWeight: '600',
  },
  enhancedLeaderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  /* Soccer-style stats row with bar fills */
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  statsValue: {
    fontSize: 14,
    fontWeight: 'bold',
    minWidth: 30,
    textAlign: 'center',
  },
  statsValueAway: {
    // Away team value on left
  },
  statsValueHome: {
    // Home team value on right
  },
  statsBarContainer: {
    flex: 1,
    marginHorizontal: 12,
    alignItems: 'center',
  },
  statsBar: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: 4,
  },
  statsBarFill: {
    height: '100%',
  },
  statsBarFillAway: {
    // Away team fill (left side)
  },
  statsBarFillHome: {
    // Home team fill (right side)
  },
  statsSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  
  // Stream Modal Styles
  streamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    marginVertical: 8,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  streamButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  streamModalContainer: {
    flex: 1,
  },
  streamModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  streamModalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  streamModalCloseButton: {
    padding: 8,
  },
  streamTypeContainer: {
    paddingVertical: 12,
  },
  streamTypeScrollView: {
    paddingHorizontal: 16,
  },
  streamTypeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
  },
  streamTypeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  streamQualityText: {
    fontSize: 12,
    marginTop: 2,
  },
  streamContent: {
    flex: 1,
  },
  streamLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  streamLoadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  streamWebView: {
    flex: 1,
  },
  noStreamContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noStreamText: {
    fontSize: 16,
    textAlign: 'center',
  },
});

export default NHLGameDetailsScreen;

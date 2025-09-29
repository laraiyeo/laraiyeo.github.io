import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, ScrollView } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';
import { NHLService } from '../../services/NHLService';

// Normalize abbreviations for logo lookup consistency
const normalizeAbbreviation = (abbrev) => {
  if (!abbrev) return abbrev;
  const lowerAbbrev = String(abbrev).toLowerCase();
  const normalizationMap = {
    'lak': 'la',    // Los Angeles Kings
    'sjs': 'sj',    // San Jose Sharks  
    'tbl': 'tb'     // Tampa Bay Lightning
  };
  return normalizationMap[lowerAbbrev] || lowerAbbrev;
};

// Temporary abbreviation -> id map for cases where callers provide only an
// abbreviation (e.g. { abbreviation: 'TOR' }) without a numeric id. Add more
// entries here as needed; this avoids undefined teamId navigation errors.
const abbrToIdMap = {
    'tor': '21', 'mtl': '10', 'cgy': '3', 'edm': '6', 'van': '22', 'wpg': '28',
    'bos': '1', 'nyr': '13', 'phi': '15', 'pit': '16', 'tbl': '20', 'car': '7',
    'chi': '4', 'det': '5', 'nsh': '27', 'stl': '19', 'wsh': '23',
    'ana': '25', 'lak': '8', 'sjs': '18', 'cbj': '29', 'min': '30', 'ott': '14',
    'fla': '26', 'buf': '2', 'njd': '11', 'nyi': '12', 'dal': '9', 'col': '17',
    'uta': '129764', 'sea': '124292', 'vgk': '37',
};

const mapAbbrToId = (abbr) => {
  if (!abbr) return null;
  return abbrToIdMap[String(abbr).toLowerCase()] || null;
};

const TeamPageScreen = ({ route, navigation }) => {
  const { teamId: rawTeamId, sport = 'nhl' } = route.params || {};
  // Some callers pass the full team object as `team`, others pass `teamId`.
  // Prefer the explicit teamId param, then the `team` object, then the whole params
  // object as a last resort. This makes navigation resilient to different
  // shapes coming from various standings implementations.
  const incomingParam = rawTeamId ?? route.params?.team ?? route.params ?? null;
  // Debug log to help trace navigation shapes when something still goes wrong
  // (will appear in console when navigating to the Team page).
  // Example: TeamPage navigation - sport: nhl params: {teamId: undefined, team: {...}, sport: 'nhl'}
  // Keep this log lightweight; remove or gate by env/dev later if noisy.
  // eslint-disable-next-line no-console
  console.log('NHL TeamPage navigation - sport:', sport, 'params:', route.params);
  // Resolve incoming team identifier which may be:
  // - a plain ESPN-style id (string/number)
  // - an object containing { id, teamId, team: { id }, abbreviation }
  // - an abbreviation string like 'NYR' or 'nyr'
  const resolveTeamParam = (input) => {
    if (input == null) return { id: null, abbreviation: null };
    if (typeof input === 'object') {
      const id = input.teamId ?? input.id ?? input.team?.id ?? input.team?.teamId ?? null;
      const abbreviation = input.abbreviation ?? input.tricode ?? input.team?.abbreviation ?? input.team?.abbrev ?? null;
      return { id: id != null ? String(id) : null, abbreviation: abbreviation != null ? String(abbreviation) : null };
    }
    // primitive
    const s = String(input);
    // if looks like a number, prefer id
    if (/^\d+$/.test(s)) return { id: s, abbreviation: null };
    // otherwise treat as abbreviation
    return { id: null, abbreviation: s };
  };
  const resolvedParam = resolveTeamParam(incomingParam);
  const { theme, colors, isDarkMode, getTeamLogoUrl } = useTheme();
  const { isFavorite, toggleFavorite, updateTeamCurrentGame } = useFavorites();

  const [activeTab, setActiveTab] = useState('Games');
  const [loading, setLoading] = useState(true);
  const [teamData, setTeamData] = useState(null);

  // Derive a stable numeric teamId when available. Prefer the resolved param id,
  // otherwise fall back to any already-loaded teamData id. This ensures any
  // references to `teamId` below are defined during render.
  const teamId = resolvedParam.id ?? (teamData?.id ? String(teamData.id) : null);
  const [teamRecord, setTeamRecord] = useState(null);
  const [currentGame, setCurrentGame] = useState(null);
  const [lastMatches, setLastMatches] = useState([]);
  const [nextMatches, setNextMatches] = useState([]);
  const [lastMatchesCollapsed, setLastMatchesCollapsed] = useState(true);
  const [nextMatchesCollapsed, setNextMatchesCollapsed] = useState(true);
  const [roster, setRoster] = useState(null);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [collapsedRosterSections, setCollapsedRosterSections] = useState({
    forwards: true,
    defensemen: true,
    goalies: true,
    others: true
  });
  const [teamStats, setTeamStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const liveUpdateInterval = useRef(null);
  // Simple in-memory cache for this screen instance
  const cachedStandings = useRef(null);
  const cachedEvents = useRef(null);

  useEffect(() => {
    fetchTeamData();
    
    // Cleanup interval on unmount
    return () => {
      if (liveUpdateInterval.current) {
        clearInterval(liveUpdateInterval.current);
      }
    };
  }, [teamId]);

  // Convert HTTP to HTTPS helper (from NFL)
  const convertToHttps = (url) => {
    if (url && url.startsWith('http://')) return url.replace('http://', 'https://');
    return url;
  };

  // Derive sanitized header stats preferring values from teamData (/teams) then falling back to computed teamRecord
  const deriveHeaderStats = () => {
    // Extract stats from /teams payload record.items array (where all the numeric data lives)
    const totalRecord = teamData?.record?.items?.find(item => item.type === 'total' || item.description?.includes('Overall'));
    
    // Helper to find stat by name from the stats array
    const getStat = (name) => {
      if (!totalRecord?.stats) return null;
      const stat = totalRecord.stats.find(s => s.name === name);
      return stat?.value ?? null;
    };

    // Get record display - prefer the summary from total record, then fallback to constructed
    let recordDisplay = totalRecord?.summary;
    if (!recordDisplay) {
      recordDisplay = teamData?.recordSummary || teamData?.record?.displayValue || teamData?.record?.display;
    }
    if (!recordDisplay && teamRecord) {
      recordDisplay = `${teamRecord.wins}-${teamRecord.losses}-${teamRecord.otLosses || 0}`;
    }

    // Get points - prefer from /teams stats, then fallback to teamRecord
    let points = getStat('points');
    if (points === null && teamData?.points !== undefined) points = teamData.points;
    if (points === null && teamData?.team?.points !== undefined) points = teamData.team.points;
    if (points === null && teamRecord?.points !== undefined) points = teamRecord.points;

    // Get streak - prefer from /teams stats, then other locations
    let rawStreak = getStat('streak');
    if (rawStreak === null) rawStreak = teamData?.streak ?? teamData?.streak?.displayValue ?? null;
    if (rawStreak === null && teamData?.team?.streak) rawStreak = teamData.team.streak;

    let streakDisplay = '--';
    let streakKind = null;
    if (rawStreak !== null && rawStreak !== undefined) {
      const s = String(rawStreak).trim();
      if (s === '') {
        streakDisplay = '--';
      } else {
        const first = s.charAt(0);
        if (first === '-') { streakDisplay = 'L' + s.substring(1); streakKind = 'L'; }
        else if (first === '+') { streakDisplay = 'W' + s.substring(1); streakKind = 'W'; }
        else if (!isNaN(Number(s))) { streakDisplay = 'W' + s; streakKind = 'W'; }
        else { streakDisplay = s; }
      }
    }

    const standingSummary = teamData?.standingSummary || teamData?.standing?.summary || teamData?.team?.standingSummary || null;
    
    // Debug: log the exact values extracted for header
    console.log('NHL deriveHeaderStats extracted:', {
      recordDisplay,
      points,
      streakDisplay,
      streakKind,
      standingSummary,
      totalRecordFound: !!totalRecord,
      totalRecordSummary: totalRecord?.summary,
      extractedStats: {
        points: getStat('points'),
        wins: getStat('wins'),
        losses: getStat('losses'),
        otLosses: getStat('otLosses'),
        streak: getStat('streak')
      }
    });
    
    return { recordDisplay, points, streakDisplay, streakKind, standingSummary };
  };

  // Debug: log the exact teams link and the header stats used for display whenever relevant data changes
  useEffect(() => {
    try {
      const teamsUrl = `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams/${teamId}`;
      const headerStats = (typeof deriveHeaderStats === 'function') ? deriveHeaderStats() : null;
      console.log('NHL TeamHeader debug:', { teamsUrl, headerStats, teamDataLoaded: !!teamData, teamRecordLoaded: !!teamRecord });
      console.log('NHL TeamHeader teamData record structure:', {
        hasRecord: !!teamData?.record,
        recordItems: teamData?.record?.items?.length || 0,
        firstItemSummary: teamData?.record?.items?.[0]?.summary,
        firstItemStatsCount: teamData?.record?.items?.[0]?.stats?.length || 0
      });
      console.log('NHL TeamHeader teamRecord fallback:', teamRecord);
    } catch (e) {
      console.warn('NHL TeamHeader debug log failed', e);
    }
  }, [teamData, teamRecord, teamId]);

  // Normalize an ESPN event into the UI-friendly shape expected by render code
  const normalizeEventForUI = (ev) => {
    if (!ev) return ev;
    const comp = (Array.isArray(ev.competitions) && ev.competitions.length > 0) ? ev.competitions[0] : null;
    const status = ev.status || comp?.status || {};
    const competitors = comp?.competitors || ev.competitors || [];

    const parseScore = (raw) => {
      if (raw == null) return null;
      // If it's an object like { value, displayValue, shootoutScore }
      if (typeof raw === 'object') {
        if (raw.value !== undefined && raw.value !== null) {
          const n = Number(raw.value);
          return Number.isFinite(n) ? n : null;
        }
        if (raw.displayValue !== undefined && raw.displayValue !== null) {
          const n = Number(String(raw.displayValue).replace(/[^0-9-]/g, ''));
          return Number.isFinite(n) ? n : String(raw.displayValue);
        }
        // shootoutScore may be present
        if (raw.shootoutScore !== undefined && raw.shootoutScore !== null) {
          const n = Number(raw.shootoutScore);
          return Number.isFinite(n) ? n : null;
        }
        return null;
      }

      // primitive (string/number)
      const n = Number(raw);
      return Number.isFinite(n) ? n : String(raw);
    };

    const findTeam = (home) => {
      const c = competitors.find(x => (x.homeAway === (home ? 'home' : 'away')) || (x.team && x.team.homeAway === (home ? 'home' : 'away')));
      if (!c) return { id: null, abbreviation: 'TBD', score: null, record: null, team: null };
      return {
        id: c.team?.id ?? c.id ?? null,
        abbreviation: c.team?.abbreviation || c.team?.abbrev || c.team?.shortDisplayName || c.team?.displayName || c.abbreviation || c.team?.tricode || 'UNK',
        // parse score robustly (handle object or primitive shapes); keep null when missing
        score: parseScore(c.score != null ? c.score : (c.curatedScore != null ? c.curatedScore : null)),
        record: c.team?.record?.displayValue || c.team?.record || null,
        team: c.team || c
      };
    };

    const homeTeam = findTeam(true);
    const awayTeam = findTeam(false);

    return {
      ...ev,
      status,
      date: ev.date,
      isCompleted: status?.type?.state === 'post' || status?.type?.state === 'final' || (status?.type?.completed === true),
      displayClock: status?.displayClock || status?.type?.shortDetail || status?.type?.summary || null,
      venue: comp?.venue?.fullName || comp?.venue?.name || ev.venue || ev.location || null,
      homeTeam,
      awayTeam,
    };
  };

  const fetchTeamData = async () => {
    try {
      // Use ESPN core API for NHL team info
      const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams/${teamId}`;
      console.log('Fetching NHL team data from:', espnUrl);
      const res = await fetch(espnUrl);
      const data = await res.json();
      // Debug: print the exact places we look for header numbers so we can trace where
      // values like points, record, and streak are coming from in the teams payload.
      try {
        console.log('NHL /teams payload debug:', {
          raw: data,
          teamTopLevel: data?.team,
          points_direct: data?.team?.points,
          recordSummary: data?.team?.recordSummary,
          record_obj: data?.team?.record,
          nested_team_obj: data?.team?.team,
          standingSummary: data?.team?.standingSummary,
          standing_obj: data?.team?.standing,
          streak: data?.team?.streak
        });
      } catch (e) { /* ignore stringify issues */ }
      if (data && data.team) {
        setTeamData(data.team);
        // try to fetch standings/record and season schedules (seasontype 1,2,3)
        const year = new Date().getFullYear();
        const recordPromise = fetchTeamRecord(data.team.id);

        // Fetch schedule types 1,2,3 and pick the last non-empty type for updates
        const typeList = [1,2,3];
        const schedulePromises = typeList.map(type => {
          const scheduleUrl = `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams/${teamId}/schedule?seasontype=${type}`;
          return fetch(scheduleUrl)
            .then(r => r.json())
            .then(j => {
              const events = j?.events || j?.schedule || [];
              try {
                // Log a small sample for debugging (first 3 events)
                console.log('NHL TeamPage: schedule response', { type, scheduleUrl, eventsCount: Array.isArray(events) ? events.length : 0, sample: Array.isArray(events) ? events.slice(0, 3) : events });
              } catch (e) { /* ignore stringify issues */ }
              return { type, events };
            })
            .catch((err) => {
              console.log('NHL TeamPage: schedule fetch failed for type', type, 'url', scheduleUrl, err);
              return { type, events: [] };
            });
        });

        const [ , ...typeResults] = await Promise.all([recordPromise, ...schedulePromises]);

        // Determine the last non-empty type (highest type number with events)
        let chosenType = null;
        let chosenEvents = [];
        for (let i = typeResults.length - 1; i >= 0; i--) {
          const res = typeResults[i];
          if (res && Array.isArray(res.events) && res.events.length > 0) {
            chosenType = res.type;
            chosenEvents = res.events;
            break;
          }
        }
        // If all empty, fallback to type 1 combined results
        if (!chosenType) {
          chosenType = 1;
          chosenEvents = typeResults[0]?.events || [];
        }

  // cache the chosen events and the season type to use for future updates
        const normalizedEvents = Array.isArray(chosenEvents) ? chosenEvents.map(normalizeEventForUI) : [];
        cachedEvents.current = normalizedEvents;
        cachedEvents.selectedSeasonType = chosenType;
        // also cache per-type results so we can build unified lists later
        const byType = {};
        typeResults.forEach(r => { try { byType[r.type] = Array.isArray(r.events) ? r.events : []; } catch(e) { byType[r.type] = []; } });
        cachedEvents.byType = byType;

        // debug: show chosen type/events sample before processing
        try {
          console.log('NHL TeamPage: chosen season type and events', { chosenType, chosenEventsCount: Array.isArray(normalizedEvents) ? normalizedEvents.length : 0, sample: Array.isArray(normalizedEvents) ? normalizedEvents.slice(0, 3) : normalizedEvents });
        } catch (e) {}

        // Process current game using ALL season types (not just chosen type) to find live games
        // but use chosen events for matches display
        const allEvents = [];
        Object.values(byType).forEach(arr => { if (Array.isArray(arr)) allEvents.push(...arr); });
  const allNormalizedEvents = allEvents.map(normalizeEventForUI);

  // Ensure currentGame is determined first so fetchAllMatches can reliably
  // filter it out of the upcoming list. Running sequentially here is cheap
  // compared to the UI correctness benefit.
  await fetchCurrentGame(allNormalizedEvents);
  await fetchAllMatches(normalizedEvents);
      }
    } catch (error) {
      console.error('Error fetching NHL team data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentGame = async (eventsParam) => {
    try {
      // Use ESPN scoreboard API to find today's game for team
      // Accept pre-fetched events to avoid duplicate network requests
      let events = eventsParam || cachedEvents.current;
      if (!events) {
        // Use the previously selected season type if available, otherwise default to type=1
        const chosenType = cachedEvents.selectedSeasonType || 1;
        const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams/${teamId}/schedule?seasontype=${chosenType}`;
        const res = await fetch(scoreboardUrl);
        const json = await res.json();
        events = json?.events || json?.schedule || [];
        cachedEvents.current = events;
      }
      if (events && events.length > 0) {
        // Determine current-window: today (local) through 2:00 AM next day
        const nowLocal = new Date();
        const startOfTodayLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 0, 0, 0, 0);
        const endOfWindowLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate() + 1, 2, 0, 0, 0); // next day 2:00 AM

        // prefer live if present
        const liveEvent = events.find(ev => {
          const state = ev.status?.type?.state;
          return state === 'in' || state === 'live';
        });
        if (liveEvent) {
          console.log('NHL fetchCurrentGame: selected live game as current:', {
            gameId: liveEvent.id,
            gameDate: liveEvent.date,
            gameStatus: liveEvent.status?.type?.state,
            reason: 'live game found'
          });
          // Normalize the live event to ensure scores are parsed properly
          const normalizedLive = liveEvent.homeTeam ? liveEvent : normalizeEventForUI(liveEvent);
          setCurrentGame(normalizedLive);
          if (isFavorite(teamId, 'nhl')) {
            try {
              await updateTeamCurrentGame(teamId, { eventId: liveEvent.id, eventLink: liveEvent.links?.website?.href || liveEvent.link, gameDate: liveEvent.date, competition: 'nhl', updatedAt: new Date().toISOString() });
            } catch (e) {}
          }
          return;
        }

        // Next, prefer any event that falls within today's current window (today through 2AM next day).
        const inWindowEvent = events.find(ev => {
          try {
            const evDate = new Date(ev.date);
            return evDate >= startOfTodayLocal && evDate <= endOfWindowLocal;
          } catch (e) {
            return false;
          }
        });
        if (inWindowEvent) {
          console.log('NHL fetchCurrentGame: selected in-window game as current:', {
            gameId: inWindowEvent.id,
            gameDate: inWindowEvent.date,
            gameStatus: inWindowEvent.status?.type?.state,
            todayWindow: { start: startOfTodayLocal.toISOString(), end: endOfWindowLocal.toISOString() },
            reason: 'game falls within today window'
          });
          const normalizedInWindow = inWindowEvent.homeTeam ? inWindowEvent : normalizeEventForUI(inWindowEvent);
          setCurrentGame(normalizedInWindow);
          if (isFavorite(teamId, 'nhl')) {
            try {
              await updateTeamCurrentGame(teamId, { eventId: inWindowEvent.id, eventLink: inWindowEvent.links?.website?.href || inWindowEvent.link, gameDate: inWindowEvent.date, competition: 'nhl', updatedAt: new Date().toISOString() });
            } catch (e) {}
          }
          return;
        }

        // If none in-window or live, fallback to next scheduled/pre-game
        const upcoming = events.find(ev => {
          const state = ev.status?.type?.state;
          return state === 'pre' || state === 'preview' || state === 'pre-game' || state === 'scheduled';
        });
        if (upcoming) {
          console.log('NHL fetchCurrentGame: selected upcoming game as current:', {
            gameId: upcoming.id,
            gameDate: upcoming.date,
            gameStatus: upcoming.status?.type?.state,
            currentDate: new Date().toISOString(),
            reason: 'fallback to next scheduled/pre-game'
          });
          const normalizedUpcoming = upcoming.homeTeam ? upcoming : normalizeEventForUI(upcoming);
          setCurrentGame(normalizedUpcoming);
          if (isFavorite(teamId, 'nhl')) {
            try {
              await updateTeamCurrentGame(teamId, { eventId: upcoming.id, eventLink: upcoming.links?.website?.href || upcoming.link, gameDate: upcoming.date, competition: 'nhl', updatedAt: new Date().toISOString() });
            } catch (e) {}
          }
          return;
        }
      }
    } catch (error) {
      console.error('Error fetching current NHL game:', error);
    }
  };

  const fetchAllMatches = async (eventsParam) => {
    try {
      // Fetch season schedule via ESPN site API
      // Accept pre-fetched events to avoid duplicate network requests
      let events = eventsParam || cachedEvents.current;
      console.log('NHL fetchAllMatches: eventsParam length:', Array.isArray(eventsParam) ? eventsParam.length : 'not array', 'cachedEvents.current length:', Array.isArray(cachedEvents.current) ? cachedEvents.current.length : 'not array');
      
      // If we have cached per-type results, combine them so Last Matches shows games from all types
      if (cachedEvents.byType) {
        try {
          const allEventsArr = [];
          Object.values(cachedEvents.byType).forEach(arr => { if (Array.isArray(arr)) allEventsArr.push(...arr); });
          // Deduplicate by event id, prefer first occurrence
          const map = new Map();
          for (const ev of allEventsArr) {
            if (ev && ev.id) {
              if (!map.has(ev.id)) map.set(ev.id, ev);
            }
          }
          events = Array.from(map.values());
          cachedEvents.current = events;
          console.log('NHL fetchAllMatches: combined events from byType, total:', events.length);
        } catch (e) {
          // Fallback to fetching chosen type if combining fails
          const chosenType = cachedEvents.selectedSeasonType || 1;
          const url = `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams/${teamId}/schedule?seasontype=${chosenType}`;
          const res = await fetch(url);
          const json = await res.json();
          events = json?.events || [];
          cachedEvents.current = events;
          console.log('NHL fetchAllMatches: fallback fetch for type', chosenType, 'events:', events.length);
        }
      } else if (!events) {
        // Use the previously selected season type if available, otherwise default to type=1
        const chosenType = cachedEvents.selectedSeasonType || 1;
        const url = `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams/${teamId}/schedule?seasontype=${chosenType}`;
        const res = await fetch(url);
        const json = await res.json();
        events = json?.events || [];
        cachedEvents.current = events;
        console.log('NHL fetchAllMatches: fresh fetch for type', chosenType, 'events:', events.length);
      }
      // Determine today's window: today local midnight -> next day 2:00 AM
      const nowLocal = new Date();
      const startOfTodayLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 0, 0, 0, 0);
      const endOfWindowLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate() + 1, 2, 0, 0, 0);

      const past = [];
      const future = [];

      // Ensure events are normalized into UI-friendly shape (homeTeam/awayTeam)
      try {
        if (Array.isArray(events) && events.length > 0 && !events[0].homeTeam) {
          events = events.map(ev => normalizeEventForUI(ev));
          cachedEvents.current = events;
          console.log('NHL fetchAllMatches: normalized events for rendering, total:', events.length);
        }
      } catch (e) {
        console.log('NHL fetchAllMatches: error normalizing events', e);
      }

      console.log('NHL fetchAllMatches: processing', events.length, 'events for past/future classification');
      console.log('NHL fetchAllMatches: today window', { startOfTodayLocal, endOfWindowLocal });

  for (const ev of events) {
        // parse event date
        let evDate;
        try {
          evDate = new Date(ev.date);
        } catch (e) {
          evDate = null;
        }

        // If event falls within today's window, skip it here (it's handled by currentGame)
        if (evDate && evDate >= startOfTodayLocal && evDate <= endOfWindowLocal) {
          console.log('NHL fetchAllMatches: skipping event in today window:', { id: ev.id, date: ev.date, evDate });
          continue;
        }

        // Additionally, if we already selected a currentGame, don't include that same
        // event in the Upcoming/future list so it doesn't appear twice.
        if (currentGame && currentGame.id && ev && ev.id && String(ev.id) === String(currentGame.id)) {
          console.log('NHL fetchAllMatches: filtering out currentGame from future list:', ev.id);
          continue;
        }

        const state = ev.status?.type?.state;
        const desc = (ev.status?.type?.description || ev.status?.type?.shortDetail || ev.status?.description || '').toLowerCase();

        // Classify by date instead of relying on status state (which is often undefined)
        if (evDate && evDate < nowLocal) {
          // Game is in the past
          past.push(ev);
        } else if (evDate && evDate >= nowLocal) {
          // Game is in the future
          future.push(ev);
        } else {
        }
      }

      // Sort by date
      past.sort((a, b) => new Date(b.date) - new Date(a.date));
      future.sort((a, b) => new Date(a.date) - new Date(b.date));

      console.log('NHL fetchAllMatches: final results - past:', past.length, 'future:', future.length);
      console.log('NHL fetchAllMatches: past sample:', past.slice(0, 2));
      console.log('NHL fetchAllMatches: future sample:', future.slice(0, 2));

      setLastMatches(past);
      setNextMatches(future);
    } catch (e) {
      console.error('Error fetching NHL matches:', e);
    }
  };

  const fetchTeamRecord = async () => {
    try {
      const standingsData = await NHLService.getStandings();
      
      if (standingsData?.standings || standingsData?.conferences) {
        let teamRecord = null;
        
        // Handle different standings data formats
        const teams = standingsData.standings || 
          (standingsData.conferences && standingsData.conferences.flatMap(conf => 
            conf.divisions ? conf.divisions.flatMap(div => div.teams || []) : []
          ));

        if (teams) {
          teamRecord = teams.find(team => 
            String(team.id) === String(teamId) || 
            String(team.team?.id) === String(teamId) ||
            normalizeAbbreviation(team.abbreviation) === normalizeAbbreviation(teamData?.abbreviation)
          );
        }

        if (teamRecord) {
          setTeamRecord({
            wins: teamRecord.wins || teamRecord.gamesPlayed - teamRecord.losses - teamRecord.otLosses || 0,
            losses: teamRecord.losses || 0,
            otLosses: teamRecord.otLosses || 0,
            points: teamRecord.points || 0
          });
        }
      }
    } catch (error) {
      console.error('Error fetching team record:', error);
    }
  };

  const fetchRoster = async () => {
    if (roster || loadingRoster) return;
    
    setLoadingRoster(true);
    try {
      const currentTeamId = teamData?.id || resolvedParam.id;
      if (!currentTeamId) {
        console.log('NHL TeamPage: no team id available for roster fetch');
        setRoster([]);
        return;
      }

      console.log('NHL TeamPage: fetching roster for team id:', currentTeamId);
      const rosterUrl = `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams/${currentTeamId}/roster`;
      const response = await fetch(rosterUrl);
      
      if (response.ok) {
        const data = await response.json();
        console.log('NHL TeamPage: roster API response:', data);
        
        if (data.athletes) {
          const players = data.athletes.flatMap(group => 
            (group.items || []).map(athlete => ({
              id: athlete.id,
              name: athlete.displayName || athlete.fullName || 'Unknown Player',
              position: athlete.position?.abbreviation || 'N/A',
              number: athlete.jersey || 'N/A',
              headshot: athlete.headshot?.href
            }))
          );
          console.log('NHL TeamPage: processed roster players:', players.length);
          setRoster(players);
        } else {
          console.log('NHL TeamPage: no athletes in roster response');
          setRoster([]);
        }
      } else {
        console.log('NHL TeamPage: roster API failed, status:', response.status);
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
    if (teamStats || loadingStats) return;
    
    setLoadingStats(true);
    try {
      const currentTeamId = teamData?.id || resolvedParam.id;
      if (!currentTeamId) {
        console.log('NHL TeamPage: no team id available for stats fetch');
        setTeamStats({});
        return;
      }
      console.log('NHL TeamPage: fetching stats for team id (v2):', currentTeamId);
      console.log('NHL TeamPage: teamData:', teamData);
      console.log('NHL TeamPage: resolvedParam:', resolvedParam);

      // Try types 3, then 2, then 1
      const typesToTry = [3, 2, 1];
      let v2data = null;
      for (const t of typesToTry) {
        try {
          const statsUrl = `https://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl/seasons/2026/types/${t}/teams/${currentTeamId}/statistics?lang=en&region=us`;
          // eslint-disable-next-line no-console
          console.log('NHL TeamPage: trying stats type', t, statsUrl);
          const resp = await fetch(statsUrl);
          if (!resp.ok) {
            console.log('NHL TeamPage: stats v2 request failed for type', t, 'status', resp.status);
            continue;
          }
          const json = await resp.json();
          // Check for presence of meaningful data - v2 typically contains groups/categories/splits
          const hasGroups = Array.isArray(json.groups) && json.groups.length > 0;
          const hasCategories = Array.isArray(json.categories) && json.categories.length > 0;
          const hasStatistics = json.statistics && Object.keys(json.statistics).length > 0;
          const hasResultsCategories = json.results && json.results.stats && Array.isArray(json.results.stats.categories) && json.results.stats.categories.length > 0;
          const hasSplitsCategories = json.splits && ((Array.isArray(json.splits) && json.splits.some(s => Array.isArray(s.categories) && s.categories.length > 0)) || (json.splits.categories && Array.isArray(json.splits.categories) && json.splits.categories.length > 0));
          if (json && (hasGroups || hasCategories || hasStatistics || hasResultsCategories || hasSplitsCategories)) {
            v2data = json;
            console.log('NHL TeamPage: got v2 stats for type', t);
            break;
          } else {
            console.log('NHL TeamPage: v2 type', t, 'returned HTTP 200 but no usable data. keys:', Object.keys(json), 'hasGroups:', hasGroups, 'hasCategories:', hasCategories, 'hasStatistics:', hasStatistics, 'hasResultsCategories:', hasResultsCategories, 'hasSplitsCategories:', hasSplitsCategories);
            // for debugging, log a small sample if there is content
            try { console.log('NHL TeamPage: v2 sample:', JSON.stringify(json && (json.groups || json.categories || json.results || json.statistics || json.splits) || json).slice(0, 2000)); } catch (e) { /* ignore */ }
          }
        } catch (e) {
          // don't fail fast; try next type
          // eslint-disable-next-line no-console
          console.log('NHL TeamPage: error fetching v2 stats for type', t, e);
        }
      }

      if (v2data) {
        // Normalize possible shapes into teamStats.categories where each category has displayName and stats array
        const categories = [];

        // v2: may have groups -> categories -> stats/items
        if (Array.isArray(v2data.groups) && v2data.groups.length) {
          v2data.groups.forEach((g) => {
            if (Array.isArray(g.categories)) {
              g.categories.forEach((c) => {
                const items = c.statistics || c.stats || c.values || c.items || [];
                categories.push({ displayName: c.displayName || c.name || g.displayName || g.name || 'Category', stats: items });
              });
            } else if (Array.isArray(g.statistics) || Array.isArray(g.stats)) {
              const items = g.statistics || g.stats || [];
              categories.push({ displayName: g.displayName || g.name || 'Category', stats: items });
            }
          });
        }

        // v2: may include 'splits' (object or array) that contain categories
        // Example payload (c2.txt) uses splits: { categories: [...] }
        if (!categories.length && v2data.splits) {
          try {
            const splitsArr = Array.isArray(v2data.splits) ? v2data.splits : [v2data.splits];
            splitsArr.forEach((split) => {
              if (split && Array.isArray(split.categories)) {
                split.categories.forEach((c) => {
                  const items = c.statistics || c.stats || c.items || c.values || [];
                  categories.push({ displayName: c.displayName || c.name || 'Category', stats: items });
                });
              }
            });
          } catch (e) {
            // ignore and continue
          }
        }

        // v2: may have categories at top-level
        if (Array.isArray(v2data.categories) && v2data.categories.length) {
          v2data.categories.forEach((c) => {
            const items = c.statistics || c.stats || c.values || c.items || [];
            categories.push({ displayName: c.displayName || c.name || 'Category', stats: items });
          });
        }

        // some v2 shapes may expose statistics as an object map
        if (!categories.length && v2data.statistics && typeof v2data.statistics === 'object') {
          // convert map into a single category
          const items = Object.keys(v2data.statistics).map(key => ({ name: key, displayName: v2data.statistics[key].displayName || key, value: v2data.statistics[key].value, displayValue: v2data.statistics[key].displayValue }));
          categories.push({ displayName: 'Team Stats', stats: items });
        }

        // If still empty but v2data has a top-level stats array (older site api fallback)
        if (!categories.length && Array.isArray(v2data.stats)) {
          v2data.stats.forEach((c) => {
            const items = c.statistics || c.stats || c.items || [];
            categories.push({ displayName: c.displayName || c.name || 'Category', stats: items });
          });
        }

        if (categories.length) {
          console.log('NHL TeamPage: normalized categories count:', categories.length);
          console.log('NHL TeamPage: sample categories:', categories.slice(0, 2));
          // Provide both shapes so existing render code (which checks multiple paths) finds them
          const finalStats = { categories, results: { stats: { categories } }, groups: v2data.groups || [] };
          console.log('NHL TeamPage: setting teamStats with structure:', Object.keys(finalStats));
          setTeamStats(finalStats);
        } else {
          console.log('NHL TeamPage: no categories could be normalized from v2 stats response');
          setTeamStats({});
        }
      } else {
        console.log('NHL TeamPage: no v2 stats found for any type; falling back to site API (match NFL behavior)');
        // Fallback to previous site API endpoint and set raw JSON (like NFL implementation)
        try {
          const statsUrl = `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams/${currentTeamId}/statistics`;
          console.log('NHL TeamPage: trying site API fallback:', statsUrl);
          const response = await fetch(statsUrl);
          if (response.ok) {
            const data = await response.json();
            console.log('NHL TeamPage: fallback stats API response (site) keys:', Object.keys(data));
            console.log('NHL TeamPage: fallback stats API response (site) structure:', data);
            // Try to normalize common shapes from the site API into the categories/groups
            // shape our renderer prefers (so UI shows stats like NFL). If we can't
            // find any usable categories, fall back to the raw JSON (preserve
            // existing behavior).
            try {
              const fallbackCategories = [];

              // 1) site API may include results.stats.categories (ESPN site shape)
              const resultsCats = data?.results?.stats?.categories;
              if (Array.isArray(resultsCats) && resultsCats.length) {
                resultsCats.forEach((c) => {
                  const items = c.statistics || c.stats || c.items || c.values || [];
                  fallbackCategories.push({ displayName: c.displayName || c.name || 'Category', stats: items });
                });
              }

              // 2) site API may include groups under results or top-level
              const groupsArr = data?.results?.groups || data?.groups;
              if (Array.isArray(groupsArr) && groupsArr.length) {
                groupsArr.forEach((g) => {
                  if (Array.isArray(g.categories)) {
                    g.categories.forEach((c) => {
                      const items = c.statistics || c.stats || c.items || c.values || [];
                      fallbackCategories.push({ displayName: c.displayName || c.name || g.displayName || g.name || 'Category', stats: items });
                    });
                  } else if (Array.isArray(g.statistics) || Array.isArray(g.stats)) {
                    const items = g.statistics || g.stats || [];
                    fallbackCategories.push({ displayName: g.displayName || g.name || 'Category', stats: items });
                  }
                });
              }

              // 3) some payloads may include a top-level categories array
              if (Array.isArray(data?.categories) && data.categories.length) {
                data.categories.forEach((c) => {
                  const items = c.statistics || c.stats || c.items || c.values || [];
                  fallbackCategories.push({ displayName: c.displayName || c.name || 'Category', stats: items });
                });
              }

              // 4) some shapes expose a statistics map
              if (!fallbackCategories.length && data?.statistics && typeof data.statistics === 'object') {
                const items = Object.keys(data.statistics).map(key => ({ name: key, displayName: data.statistics[key].displayName || key, value: data.statistics[key].value, displayValue: data.statistics[key].displayValue }));
                fallbackCategories.push({ displayName: 'Team Stats', stats: items });
              }

              if (fallbackCategories.length) {
                const finalStats = { categories: fallbackCategories, results: { stats: { categories: fallbackCategories } }, groups: (data?.results?.groups || data?.groups || []) };
                console.log('NHL TeamPage: normalized fallback categories count:', fallbackCategories.length);
                setTeamStats(finalStats);
              } else {
                // couldn't normalize; keep the raw shape so existing callers can
                // still inspect other fields if needed
                console.log('NHL TeamPage: could not normalize fallback stats; using raw site response');
                setTeamStats(data);
              }
            } catch (e) {
              console.log('NHL TeamPage: error normalizing fallback stats response', e);
              setTeamStats(data);
            }
          } else {
            console.log('NHL TeamPage: fallback stats API failed, status:', response.status);
            setTeamStats({});
          }
        } catch (e) {
          console.log('NHL TeamPage: fallback stats fetch error', e);
          setTeamStats({});
        }
      }
    } catch (error) {
      console.error('Error fetching team stats:', error);
      setTeamStats({});
    } finally {
      setLoadingStats(false);
    }
  };

  // Handle game click navigation
  const handleGamePress = (game) => {
    navigation.navigate('GameDetails', { gameId: game.id, sport: 'nhl' });
  };

  const isGameLive = (game) => {
    if (!game || !game.status) return false;
    const state = game.status.type?.state;
    return state === 'in' || state === 'live' || state === 'post' && !!game.status?.type?.completed === false;
  };

  // Safe status text renderer - ESPN uses nested status objects; UI expects a string
  const getStatusText = (game) => {
    if (!game) return '';
    const s = game.status;
    if (!s) return '';
    if (typeof s === 'string') return s;
    // prefer displayClock if provided
    if (s.displayClock && typeof s.displayClock === 'string') return s.displayClock;
    // fallback to type.shortDetail / description / state
    if (s.type) {
      return s.type.shortDetail || s.type.description || s.type.state || '';
    }
    // other simple fields
    if (s.clock) return String(s.clock);
    if (s.summary) return String(s.summary);
    return '';
  };

  // Effect to load roster when Roster tab is selected
  useEffect(() => {
    if (activeTab === 'Roster') {
      fetchRoster();
    }
  }, [activeTab]);

  // Effect to load stats when Stats tab is selected
  useEffect(() => {
    if (activeTab === 'Stats') {
      fetchTeamStats();
    }
  }, [activeTab]);

  // Helper to build a safe player headshot URL with placeholders
  const getPlayerHeadshotUrl = (player) => {
    if (!player) return 'https://via.placeholder.com/88x88?text=Player';
    if (player.headshot) return player.headshot;
    if (player.athlete && player.athlete.headshot) return player.athlete.headshot;
    const id = player.id || player.athlete?.id;
    if (id) return `https://a.espncdn.com/combiner/i?img=/i/headshots/nhl/players/${id}.png&w=88&h=88`;
    return 'https://via.placeholder.com/88x88?text=Player';
  };

  // TeamLogoImage component with dark mode and fallback support (improved to avoid flicker)
  const TeamLogoImage = ({ team, teamId, style }) => {
    // Accept either a team object (with logos) or a simple id/abbr via teamId
    const resolveCandidate = () => {
      if (team) return team;
      if (teamId) return teamId;
      return null;
    };

    // Compute initial logo synchronously so re-mounts/re-renders don't show the placeholder briefly
    const computeInitialLogo = () => {
      const cand = resolveCandidate();
      if (!cand) return null;

      if (team && Array.isArray(team.logos) && team.logos.length > 0) {
        const preferredIndex = isDarkMode ? 1 : 0;
        const fallbackIndex = isDarkMode ? 0 : 1;
        const logoUrl = team.logos[preferredIndex]?.href || team.logos[fallbackIndex]?.href || team.logos[0]?.href;
        if (logoUrl) return { uri: logoUrl };
      }

      const { primaryUrl } = getTeamLogoUrls(cand, isDarkMode);
      if (primaryUrl) return { uri: primaryUrl };
      return null;
    };

    const [logoSource, setLogoSource] = useState(() => computeInitialLogo());
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
      const cand = resolveCandidate();
      if (!cand) return;

      // Recompute and update only if different to avoid unnecessary state churn
      let newUrl = null;
      if (team && Array.isArray(team.logos) && team.logos.length > 0) {
        const preferredIndex = isDarkMode ? 1 : 0;
        const fallbackIndex = isDarkMode ? 0 : 1;
        newUrl = team.logos[preferredIndex]?.href || team.logos[fallbackIndex]?.href || team.logos[0]?.href;
      }
      if (!newUrl) {
        newUrl = getTeamLogoUrls(cand, isDarkMode).primaryUrl;
      }

      if (newUrl) {
        const candidateSource = { uri: newUrl };
        // Only update state if the URL actually changed
        if (!logoSource || logoSource.uri !== candidateSource.uri) setLogoSource(candidateSource);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [team, teamId, isDarkMode]);

    const handleError = () => {
      if (retryCount === 0) {
        setRetryCount(1);

        // Try fallback logo from logos array first
        if (team && Array.isArray(team.logos) && team.logos.length > 0) {
          const fallbackIndex = isDarkMode ? 0 : 1;
          const fallbackUrl = team.logos[fallbackIndex]?.href;
          if (fallbackUrl) {
            setLogoSource({ uri: fallbackUrl });
            return;
          }
        }

        // Then try getTeamLogoUrls fallback
        const cand = resolveCandidate();
        if (cand) {
          const { fallbackUrl } = getTeamLogoUrls(cand, isDarkMode);
          if (fallbackUrl) {
            setLogoSource({ uri: fallbackUrl });
            return;
          }
        }
      }
    };

    const placeholder = require('../../../assets/nhl.png');
    return (
      <Image
        style={style}
        source={logoSource || placeholder}
        onError={handleError}
        resizeMode="contain"
      />
    );
  };

  // Enhanced logo function with dark mode support and fallbacks
  const pickLogoFromLogos = (logos, preferDark) => {
    if (!Array.isArray(logos) || logos.length === 0) return null;

    // Normalize: map to objects with href and lowercased rel array
    const relSets = logos.map(l => ({ href: l.href || l.url || l.href || l.href, rel: (l.rel || []).map(r => String(r).toLowerCase()) }));

    const findByAll = (want) => relSets.find(r => want.every(w => r.rel.includes(w)));
    const findByAny = (want) => relSets.find(r => r.rel.some(x => want.includes(x)));

    if (preferDark) {
      // prefer dark+full, then full+default, then full, then default, then first
      return findByAll(['dark', 'full'])?.href || findByAll(['full', 'default'])?.href || findByAny(['full'])?.href || findByAny(['default'])?.href || relSets[0].href;
    }

    // light mode: prefer full+default, then full, then dark+full, then default, then first
    return findByAll(['full', 'default'])?.href || findByAny(['full'])?.href || findByAll(['dark', 'full'])?.href || findByAny(['default'])?.href || relSets[0].href;
  };

  const getTeamLogoUrls = (teamParam, isDarkMode) => {
    // teamParam may be an object (with logos), abbreviation, or id. Prefer schedule-provided logos when available.
    // If teamParam is an object with a `logos` array, use that array to select hrefs honoring rels.
    if (teamParam && typeof teamParam === 'object' && Array.isArray(teamParam.logos) && teamParam.logos.length > 0) {
      // Prefer the index-based hrefs: logos[1] for dark mode, logos[0] for light mode.
      const logosArr = teamParam.logos;
      const primaryIndex = isDarkMode ? 1 : 0;
      const altIndex = isDarkMode ? 0 : 1;
      const primary = logosArr[primaryIndex]?.href || logosArr[altIndex]?.href || pickLogoFromLogos(logosArr, isDarkMode);
      const fallback = logosArr[altIndex]?.href || pickLogoFromLogos(logosArr, !isDarkMode) || primary;
      if (primary) return { primaryUrl: primary, fallbackUrl: fallback };
    }

    // If caller passed an object with nested `team.logos` (e.g., competitor object), try that too
    if (teamParam && typeof teamParam === 'object' && teamParam.team && Array.isArray(teamParam.team.logos) && teamParam.team.logos.length > 0) {
      const logosArr = teamParam.team.logos;
      const primaryIndex = isDarkMode ? 1 : 0;
      const altIndex = isDarkMode ? 0 : 1;
      const primary = logosArr[primaryIndex]?.href || logosArr[altIndex]?.href || pickLogoFromLogos(logosArr, isDarkMode);
      const fallback = logosArr[altIndex]?.href || pickLogoFromLogos(logosArr, !isDarkMode) || primary;
      if (primary) return { primaryUrl: primary, fallbackUrl: fallback };
    }

    // Fallback to CDN style URLs based on abbreviation or id
    const idRaw = (teamParam && typeof teamParam === 'object') ? (teamParam.abbreviation || teamParam.id || (teamParam.team && (teamParam.team.abbreviation || teamParam.team.id))) : teamParam;
    const normalized = String(idRaw || '').toLowerCase();
    const primaryUrl = isDarkMode
      ? `https://a.espncdn.com/i/teamlogos/nhl/500-dark/${normalized}.png`
      : `https://a.espncdn.com/i/teamlogos/nhl/500/${normalized}.png`;

    const fallbackUrl = isDarkMode
      ? `https://a.espncdn.com/i/teamlogos/nhl/500/${normalized}.png`
      : `https://a.espncdn.com/i/teamlogos/nhl/500-dark/${normalized}.png`;

    return { primaryUrl, fallbackUrl };
  };

  const getCompetitionName = (leagueCode) => {
    if (!leagueCode) return null;
    // Minimal mapping; expand if needed
    const code = String(leagueCode).toLowerCase();
    switch (code) {
      case 'nhl': return 'NHL';
      default: return leagueCode;
    }
  };

  const getTeamLogoUrl_NHL = (abbreviation) => {
    return getTeamLogoUrl('nhl', normalizeAbbreviation(abbreviation));
  };

  const getThemeTeamLogoUrlHelper = (abbrOrId) => {
    if (!abbrOrId) return null;
    return getTeamLogoUrl('nhl', String(abbrOrId));
  };

  const getTeamColor = (team) => {
    // Simple fallback to primary color from theme
    return colors.primary;
  };

  // Helper functions for determining losing team styles (from MLB implementation)
  const getTeamScoreStyle = (game, isAwayTeam) => {
    const isCompleted = game?.isCompleted || game?.status?.type?.state === 'post';
    if (!isCompleted) return styles.gameTeamScore;
    
    const isLosing = isAwayTeam ? 
      (game.awayTeam.score < game.homeTeam.score) : 
      (game.homeTeam.score < game.awayTeam.score);
    
    return isLosing ? [styles.gameTeamScore, styles.losingTeamScore] : styles.gameTeamScore;
  };

  // Safe display for score values: return empty string when null/undefined to avoid showing 0 for missing scores
  const displayScore = (s) => {
    if (s === null || s === undefined) return '';
    return String(s);
  };

  // Format period display for live games (e.g., "1st Period", "2nd Period", "3rd Period", "OT")
  const formatPeriodDisplay = (game) => {
    if (!game || !game.status) return '';
    
    const status = game.status;
    const period = status.period;
    const clock = status.displayClock || status.clock || getStatusText(game);
    
    if (!period && !clock) return 'In Progress';
    
    // Handle overtime periods
    if (period > 3) {
      return period === 4 ? 'OT' : `${period - 3}OT`;
    }
    
    // Handle regular periods with ordinal suffix
    const ordinals = ['', '1st', '2nd', '3rd'];
    const periodText = ordinals[period] || `${period}th`;
    
    return periodText ? `${periodText} Period` : clock || 'In Progress';
  };

  const getTeamNameStyle = (game, isAwayTeam) => {
    const isCompleted = game?.isCompleted || game?.status?.type?.state === 'post';
    if (!isCompleted) return styles.gameTeamName;
    
    const isLosing = isAwayTeam ? 
      (game.awayTeam.score < game.homeTeam.score) : 
      (game.homeTeam.score < game.awayTeam.score);
    
    return isLosing ? [styles.gameTeamName, styles.losingTeamName] : styles.gameTeamName;
  };

  const getTeamLogoStyle = (game, isAwayTeam) => {
    const isCompleted = game?.isCompleted || game?.status?.type?.state === 'post';
    if (!isCompleted) return styles.gameTeamLogo;
    
    const isLosing = isAwayTeam ? 
      (game.awayTeam.score < game.homeTeam.score) : 
      (game.homeTeam.score < game.awayTeam.score);
    
    return isLosing ? [styles.gameTeamLogo, styles.losingTeamLogo] : styles.gameTeamLogo;
  };

  const renderTeamHeader = () => {
    const headerStats = deriveHeaderStats();
    
    return (
      <View style={[styles.teamHeader, { backgroundColor: theme.surface }]}>
        <Image 
          source={{ uri: getTeamLogoUrl_NHL(teamData?.abbreviation) }} 
          style={styles.headTeamLogo}
          onError={() => console.log('Failed to load team logo')}
        />
        <View style={styles.teamInfo}>
          <Text style={[styles.teamName, { color: teamData?.color ? `#${teamData.color}` : theme.text }]}> 
            {teamData?.displayName || 'NHL Team'}
          </Text>
          <Text style={[styles.teamDivision, { color: theme.textSecondary }]}> 
            {headerStats.standingSummary || 'Loading record...'}
          </Text>
          {/* Header summary row: record, points, streak */}
          {(headerStats.recordDisplay || headerStats.points || headerStats.streakDisplay !== '--') && (
            <View style={styles.recordContainer}>
              <View style={styles.recordRow}>
                <Text style={[styles.recordValue, { color: theme.text }]}>
                  {headerStats.recordDisplay || '--'}
                </Text>
                <Text style={[styles.recordValue, { color: theme.text }]}>
                  {headerStats.points || '--'}
                </Text>
                <Text style={[styles.recordValue, { color: (() => {
                  if (headerStats.streakKind === 'L') return theme.error;
                  if (headerStats.streakKind === 'W') return theme.success;
                  return theme.text;
                })() }]}>
                  {headerStats.streakDisplay}
                </Text>
              </View>
              <View style={styles.recordRow}>
                <Text style={[styles.recordLabel, { color: theme.textSecondary }]}>Record</Text>
                <Text style={[styles.recordLabel, { color: theme.textSecondary }]}>Points</Text>
                <Text style={[styles.recordLabel, { color: theme.textSecondary }]}>Streak</Text>
              </View>
            </View>
          )}
        </View>
        <TouchableOpacity 
          style={styles.favoriteButton} 
          onPress={async () => {
            try {
              await toggleFavorite(
                teamId,
                {
                  id: teamId,
                  displayName: teamData?.displayName || teamData?.abbreviation,
                  abbreviation: teamData?.abbreviation,
                  sport 
                },
                currentGame ? {
                  eventId: currentGame.id,
                  eventLink: `/nhl/game/${currentGame.id}`,
                  gameDate: currentGame.date.toISOString(),
                  competition: 'nhl'
                } : null
              );
            } catch (error) {
              console.error('Error toggling favorite:', error);
            }
          }}
        >
          <Text style={[
            styles.favoriteIcon, 
            { color: isFavorite(teamId, sport) ? colors.primary : theme.textSecondary }
          ]}>
            {isFavorite(teamId, sport) ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderCurrentGame = () => {
    if (!currentGame) {
      return (
        <View style={[styles.gameSectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.contentText, { color: theme.textSecondary }]}>
            No current or upcoming games found
          </Text>
        </View>
      );
    }

    return renderMatchCard(currentGame);
  };

  const renderTabButtons = () => (
    <View style={[styles.fixedTabContainer, { backgroundColor: theme.surface }]}>
      {['Games', 'Stats', 'Roster'].map((tab) => (
        <TouchableOpacity
          key={tab}
          style={[
            styles.tabButton,
            activeTab === tab && [styles.activeTabButton, { borderBottomColor: colors.primary }]
          ]}
          onPress={() => setActiveTab(tab)}
        >
          <Text style={[
            styles.tabText,
            { color: activeTab === tab ? colors.primary : theme.textSecondary },
            activeTab === tab && styles.activeTabText
          ]}>
            {tab}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderMatchCard = (game) => {
    const competition = getCompetitionName(game.competition?.id || 'nhl') || 'NHL';
    const gameDate = new Date(game.date);
    
    // Debug: log raw date and parsed values to troubleshoot date display (e.g., Oct 8, 2025)
    console.log('renderMatchCard date debug:', {
      gameId: game.id,
      rawDate: game.date,
      parsedGameDate: gameDate.toISOString(),
      localDateString: gameDate.toLocaleDateString(),
      currentDate: new Date().toISOString(),
      timezoneOffset: gameDate.getTimezoneOffset()
    });
    
    const formattedDate = gameDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
    const formattedTime = gameDate.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });

    const awayTeam = game.awayTeam || {};
    const homeTeam = game.homeTeam || {};
    const isCompleted = game.isCompleted || game.status?.type?.state === 'post';
    const isLive = isGameLive(game);

    // Debug: log score values for live games to troubleshoot missing scores
    if (isLive) {
      console.log('Live game scores debug:', {
        gameId: game.id,
        awayTeam: {
          abbreviation: awayTeam.abbreviation,
          score: awayTeam.score,
          scoreType: typeof awayTeam.score
        },
        homeTeam: {
          abbreviation: homeTeam.abbreviation,
          score: homeTeam.score,
          scoreType: typeof homeTeam.score
        },
        status: game.status,
        isCompleted,
        isLive
      });
    }

    return (
      <TouchableOpacity 
        key={game.id}
        style={[styles.gameCard, { backgroundColor: theme.surface }]}
        onPress={() => handleGamePress(game)}
      >
        {/* League Header */}
        <View style={[styles.leagueHeader, { backgroundColor: theme.surfaceSecondary }]}>
          <Text style={[styles.leagueText, { color: colors.primary }]}>
            {competition}
          </Text>
        </View>

        {/* Match Content */}
        <View style={styles.matchContent}>
          {/* Away Team */}
          <View style={styles.teamSection}>
            <View style={styles.teamLogoRow}>
              <TeamLogoImage 
                team={awayTeam.team}
                teamId={awayTeam.abbreviation || awayTeam.id}
                style={[
                  styles.teamLogo,
                  isCompleted && awayTeam.score < homeTeam.score && styles.losingTeamLogo
                ]}
              />
              {(isCompleted || isLive) && (
                <View style={styles.scoreContainer}>
                  <Text style={[
                    styles.teamScore, 
                    { color: (awayTeam.score !== null && homeTeam.score !== null && awayTeam.score >= homeTeam.score) ? colors.primary : theme.textSecondary }
                  ]}>
                    {displayScore(awayTeam.score)}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[
              styles.teamAbbreviation, 
              { color: isCompleted && awayTeam.score < homeTeam.score ? theme.textSecondary : theme.text }
            ]}>
              {awayTeam.abbreviation || 'TBD'}
            </Text>
          </View>

          {/* Status Section */}
          <View style={styles.statusSection}>
            {isCompleted ? (
              <>
                <Text style={[styles.gameStatus, { color: colors.primary }]}>Final</Text>
                <Text style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                  {formattedDate}
                </Text>
              </>
            ) : isLive ? (
              <>
                <Text style={[styles.gameStatus, { color: colors.primary }]}>
                  {getStatusText(game) || 'LIVE'}
                </Text>
                <Text style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                  {formatPeriodDisplay(game)}
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.gameStatus, { color: colors.primary }]}>
                  {formattedTime}
                </Text>
                <Text style={[styles.gameDateTime, { color: theme.textSecondary }]}>
                  {formattedDate}
                </Text>
              </>
            )}
          </View>

          {/* Home Team */}
          <View style={styles.teamSection}>
            <View style={styles.teamLogoRow}>
              {(isCompleted || isLive) && (
                <View style={styles.scoreContainer}>
                  <Text style={[
                    styles.teamScore, 
                    { color: (homeTeam.score !== null && awayTeam.score !== null && homeTeam.score >= awayTeam.score) ? colors.primary : theme.textSecondary }
                  ]}>
                    {displayScore(homeTeam.score)}
                  </Text>
                </View>
              )}
              <TeamLogoImage 
                team={homeTeam.team}
                teamId={homeTeam.abbreviation || homeTeam.id}
                style={[
                  styles.teamLogo,
                  isCompleted && homeTeam.score < awayTeam.score && styles.losingTeamLogo
                ]}
              />
            </View>
            <Text style={[
              styles.teamAbbreviation, 
              { color: isCompleted && homeTeam.score < awayTeam.score ? theme.textSecondary : theme.text }
            ]}>
              {homeTeam.abbreviation || 'TBD'}
            </Text>
          </View>
        </View>

        {/* Venue Section */}
        {game.venue && (
          <View style={[styles.venueSection, { borderTopColor: theme.border }]}>
            <Text style={[styles.venueText, { color: theme.textTertiary }]}>
              {game.venue}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderGamesTab = () => (
    <ScrollView style={styles.gamesContainer}>
      <View style={styles.gameSection}>
        <Text style={[styles.gameSectionTitle, { color: colors.primary }]}>Current Game</Text>
        {renderCurrentGame()}
      </View>

      <View style={styles.gameSection}>
        <TouchableOpacity 
          style={styles.sectionHeader}
          onPress={() => setLastMatchesCollapsed(!lastMatchesCollapsed)}
        >
          <Text style={[styles.gameSectionTitle, { color: colors.primary }]}>
            Recent Games
          </Text>
          <Text style={[styles.collapseArrow, { color: theme.textSecondary }]}>
            {lastMatchesCollapsed ? '▼' : '▲'}
          </Text>
        </TouchableOpacity>
        
        {!lastMatchesCollapsed && (
          <View>
            {lastMatches.length === 0 ? (
              <Text style={[styles.contentText, { color: theme.textSecondary }]}>
                No recent games
              </Text>
            ) : (
              lastMatches.map((game) => renderMatchCard(game))
            )}
          </View>
        )}
      </View>

      <View style={styles.gameSection}>
        <TouchableOpacity 
          style={styles.sectionHeader}
          onPress={() => setNextMatchesCollapsed(!nextMatchesCollapsed)}
        >
          <Text style={[styles.gameSectionTitle, { color: colors.primary }]}>
            Upcoming Games
          </Text>
          <Text style={[styles.collapseArrow, { color: theme.textSecondary }]}>
            {nextMatchesCollapsed ? '▼' : '▲'}
          </Text>
        </TouchableOpacity>
        
        {!nextMatchesCollapsed && (
          <View>
            {nextMatches.length === 0 ? (
              <Text style={[styles.contentText, { color: theme.textSecondary }]}>
                No upcoming games
              </Text>
            ) : (
              nextMatches.map((game) => renderMatchCard(game))
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );

  // Group NHL roster into MLB-like sections: Forwards, Defensemen, Goalies, Others


  const renderRosterSection = (title, players, sectionKey) => {
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
              <Text allowFontScaling={false} style={[styles.rosterTableHeaderStatus, { color: theme.text }]}>Status</Text>
            </View>
            {players.map((player) => (
              <TouchableOpacity 
                key={player.id || player.name} 
                style={[styles.rosterTableRow, { borderBottomColor: theme.border, backgroundColor: theme.surfaceSecondary }]}
                onPress={() => {
                  console.log('Navigating to player page:', player.id, player.name);
                  // Add navigation to player page if needed
                }}
                activeOpacity={0.7}
              >
                <View style={styles.rosterTablePlayerCell}>
                  <View style={styles.rosterPlayerRow}>
                    <Image 
                      source={{ 
                        uri: player.headshot || 'https://via.placeholder.com/40x40?text=NHL' 
                      }}
                      style={styles.playerHeadshot}
                      defaultSource={{ uri: 'https://via.placeholder.com/40x40?text=NHL' }}
                    />
                    <View style={styles.rosterPlayerInfo}>
                      <Text allowFontScaling={false} style={[styles.rosterTablePlayerName, { color: theme.text }]}>
                        {player.name}
                      </Text>
                      <Text allowFontScaling={false} style={[styles.rosterTablePlayerDetails, { color: theme.textTertiary }]}>
                        <Text allowFontScaling={false} style={[styles.rosterTablePlayerNumber, { color: theme.textTertiary }]}>#{player.number || '--'}</Text>
                        {' • '}
                        {player.position || 'N/A'}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.rosterTableStatusCell}>
                  <Text allowFontScaling={false} style={[
                    styles.rosterTableStatusText,
                    styles.activeStatus // For now, all NHL players are active
                  ]}>
                    Active
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderRosterTab = () => {
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

    // Group players by position
    const forwards = roster.filter(player => {
      const pos = (player.position || '').toString().toUpperCase();
      return pos.includes('C') || pos.includes('LW') || pos.includes('RW') || pos.includes('FORWARD') || pos.includes('WING') || pos.includes('CENTER');
    });
    const defensemen = roster.filter(player => {
      const pos = (player.position || '').toString().toUpperCase();
      return pos.includes('D') && !pos.includes('FORWARD') && !pos.includes('WING');
    });
    const goalies = roster.filter(player => {
      const pos = (player.position || '').toString().toUpperCase();
      return pos.includes('G') || pos.includes('GOALIE') || pos.includes('GOALTENDER');
    });
    const others = roster.filter(player => {
      const pos = (player.position || '').toString().toUpperCase();
      return !forwards.includes(player) && !defensemen.includes(player) && !goalies.includes(player);
    });

    return (
      <ScrollView style={[styles.rosterContainer, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
        {renderRosterSection('Forwards', forwards, 'forwards')}
        {renderRosterSection('Defensemen', defensemen, 'defensemen')}
        {renderRosterSection('Goalies', goalies, 'goalies')}
        {others.length > 0 && renderRosterSection('Others', others, 'others')}
      </ScrollView>
    );
  };

  const renderStatsContent = () => {
    if (loadingStats) return (
      <View style={styles.statsLoadingContainer}><ActivityIndicator size="large" color={colors.primary} /><Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>Loading team statistics...</Text></View>
    );

    if (!teamStats) return (
      <View style={styles.statsLoadingContainer}><Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>Team statistics not available</Text></View>
    );

    // We'll render every category but only the top 6 stats per category (by presence order)
    const categories = teamStats?.results?.stats?.categories || teamStats?.categories || teamStats?.groups || [];

    const pickTopStats = (statsArr, limit = 6) => {
      if (!Array.isArray(statsArr)) return [];
      // Prefer stats that have a numeric value; keep original order, take first `limit`
      const filtered = statsArr.filter(s => s && (s.value !== undefined || s.displayValue !== undefined));
      return filtered.slice(0, limit);
    };

    // Small card renderer for a stat (MLB style)
    const StatCard = ({ stat }) => {
      const label = stat.displayName || stat.name || stat.abbreviation || '';
      const value = (stat.displayValue !== undefined && stat.displayValue !== null) ? String(stat.displayValue) : (stat.value !== undefined ? String(stat.value) : '--');
      const rank = stat.rankDisplayValue || stat.rank?.displayValue || null;
      return (
        <View style={[styles.statBox, { backgroundColor: theme.surface }]}> 
          <Text allowFontScaling={false} style={[styles.statBoxValue, { color: colors.primary }]} numberOfLines={1}>{value}</Text>
          <Text allowFontScaling={false} style={[styles.statBoxLabel, { color: theme.textSecondary }]} numberOfLines={2}>{label}</Text>
          {rank ? <Text allowFontScaling={false} style={[styles.statBoxLabel, { color: theme.textTertiary, marginTop: 6 }]} numberOfLines={1}>{rank}</Text> : null}
        </View>
      );
    };

    const renderStatRows = (statCards) => {
      const rows = [];
      for (let i = 0; i < statCards.length; i += 3) {
        rows.push(statCards.slice(i, i + 3));
      }
      return rows.map((row, idx) => (
        <View key={`row-${idx}`} style={styles.statsRow}>
          {row}
        </View>
      ));
    };

    return (
      <ScrollView style={[styles.statsContainer, { backgroundColor: theme.background }]} contentContainerStyle={styles.statsContent} showsVerticalScrollIndicator={false}>
        <Text allowFontScaling={false} style={[styles.statsSectionTitle, { color: theme.text }]}>Team Statistics</Text>
        {/* Render each category */}
        {categories.map((cat, idx) => {
          const statsArr = cat.stats || cat.items || cat.values || [];
          const top = pickTopStats(statsArr, 6);
          const statCards = top.map((s, si) => <StatCard key={`${s.name || s.displayName || si}`} stat={s} />);
          return (
            <View key={`${cat.name || cat.displayName || idx}`} style={styles.statsSection}>
              <Text allowFontScaling={false} style={[styles.statsSectionTitle, { color: theme.text }]}>{cat.displayName || cat.name || `Category ${idx + 1}`}</Text>
              {statCards.length === 0 ? (
                <View style={[styles.statBox, { backgroundColor: theme.surface }]}><Text allowFontScaling={false} style={[styles.statBoxLabel, { color: theme.textSecondary }]}>No stats</Text></View>
              ) : (
                renderStatRows(statCards)
              )}
            </View>
          );
        })}
      </ScrollView>
    );
  };

  const renderStatsTab = () => renderStatsContent();

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.text }]}>Loading team data...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {renderTeamHeader()}
      {renderTabButtons()}
      <ScrollView style={[styles.contentScrollView, { backgroundColor: theme.background }]}>
        <View style={styles.matchesSection}>
          {activeTab === 'Games' && renderGamesTab()}
          {activeTab === 'Roster' && renderRosterTab()}
          {activeTab === 'Stats' && renderStatsTab()}
        </View>
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
  headTeamLogo: {
    width: 80,
    height: 80,
    marginRight: 20,
  },
  teamInfo: {
    flex: 1,
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
    marginTop: 4,
    marginLeft: 0,
  },
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 180,
  },
  recordValue: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    flex: 1,
  },
  recordLabel: {
    fontSize: 12,
    textAlign: 'center',
    flex: 1,
    marginTop: 2,
  },
  favoriteButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    padding: 10,
    zIndex: 1,
  },
  favoriteIcon: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
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
  contentContainer: {
    flex: 1,
    padding: 15,
  },
  gamesContainer: {
    flex: 1,
    paddingTop: 5,
  },
  gameSection: {
    marginBottom: 20,
  },
  gameSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
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
  teamRecord: {
    fontSize: 12,
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
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
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
  losingTeamScore: {
    color: '#999',
  },
  losingTeamName: {
    color: '#999',
  },
  losingTeamLogo: {
    opacity: 0.6,
  },
  gameDescriptionBanner: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    marginBottom: 10,
    marginHorizontal: -15,
    marginTop: -15,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  gameDescriptionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  contentText: {
    fontSize: 16,
    textAlign: 'center',
    fontStyle: 'italic',
    padding: 20,
  },
  // Roster styles (matching MLB)
  rosterContainer: {
    flex: 1,
    padding: 1,
  },
  matchesSection: {
    paddingHorizontal: 15,
    paddingVertical: 5,
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
  activeStatus: {
    backgroundColor: '#d4edda',
    color: '#155724',
  },
  inactiveStatus: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
  },
  // Stats styles (matching NFL)
  statsContainer: {
    flex: 1,
  },
  statsContent: {
    padding: 0,
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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    gap: 10,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    padding: 15,
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
  // NFL-style match card styles
  fixedTabContainer: {
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
  },
  contentScrollView: {
    flex: 1,
  },
  matchesSection: {
    paddingHorizontal: 15,
    paddingVertical: 5,
  },
  gameSectionCard: {
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
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

export default TeamPageScreen;

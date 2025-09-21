import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, ScrollView } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';

const TeamPageScreen = ({ route, navigation }) => {
  const { teamId, sport = 'nfl' } = route.params;
  const { theme, colors, isDarkMode, getTeamLogoUrl: getThemeTeamLogoUrl } = useTheme();
  const { isFavorite, toggleFavorite, updateTeamCurrentGame } = useFavorites();

  const [isUpdatingFavorites, setIsUpdatingFavorites] = useState(false);
  const [activeTab, setActiveTab] = useState('Games');
  const [teamData, setTeamData] = useState(null);
  const [teamRecord, setTeamRecord] = useState(null);
  const [currentGame, setCurrentGame] = useState(null);
  const [lastMatches, setLastMatches] = useState([]);
  const [nextMatches, setNextMatches] = useState([]);
  const [lastMatchesCollapsed, setLastMatchesCollapsed] = useState(true);
  const [nextMatchesCollapsed, setNextMatchesCollapsed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState(null);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [teamStats, setTeamStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const liveUpdateInterval = useRef(null);
  // Simple in-memory cache for this screen instance
  const cachedStandings = useRef(null);
  const cachedEvents = useRef(null);

  useEffect(() => {
    console.log('NFL TeamPageScreen received - teamId:', teamId);
    fetchTeamData();

    return () => {
      if (liveUpdateInterval.current) clearInterval(liveUpdateInterval.current);
    };
  }, [teamId]);

  // Convert HTTP to HTTPS helper (from other files)
  const convertToHttps = (url) => {
    if (url && url.startsWith('http://')) return url.replace('http://', 'https://');
    return url;
  };

  const fetchTeamData = async () => {
    try {
      // Use ESPN core API for NFL team info
      const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}`;
      console.log('Fetching NFL team data from:', espnUrl);
      const res = await fetch(espnUrl);
      const data = await res.json();
      if (data && data.team) {
        setTeamData(data.team);
        // try to fetch standings/record and season schedules (seasontype 1,2,3)
        const year = new Date().getFullYear();
        const recordPromise = fetchTeamRecord(data.team.id);

        // Fetch schedule types 1,2,3 and pick the last non-empty type for updates
        const typeList = [1,2,3];
        const schedulePromises = typeList.map(type => {
          const scheduleUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/schedule?seasontype=${type}`;
          return fetch(scheduleUrl).then(r => r.json()).then(j => ({ type, events: j?.events || j?.schedule || [] })).catch(() => ({ type, events: [] }));
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
  cachedEvents.current = chosenEvents;
  cachedEvents.selectedSeasonType = chosenType;
  // also cache per-type results so we can build unified lists later
  const byType = {};
  typeResults.forEach(r => { try { byType[r.type] = Array.isArray(r.events) ? r.events : []; } catch(e) { byType[r.type] = []; } });
  cachedEvents.byType = byType;

        // Process current game and all matches using the chosen events list in parallel
        await Promise.all([fetchCurrentGame(chosenEvents), fetchAllMatches(chosenEvents)]);
      }
    } catch (error) {
      console.error('Error fetching NFL team data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamRecord = async (teamIdParam) => {
    try {
      if (cachedStandings.current) {
        const json = cachedStandings.current;
        const groups = json?.content?.standings?.groups || [];
        for (const group of groups) {
          for (const division of group.groups || []) {
            const entry = (division.standings?.entries || []).find(e => e.team?.id?.toString() === teamIdParam?.toString());
            if (entry) {
              const wins = entry.stats.find(s => s.name === 'wins')?.displayValue || '0';
              const losses = entry.stats.find(s => s.name === 'losses')?.displayValue || '0';
              const streak = entry.stats.find(s => s.name === 'streak')?.displayValue || 'N/A';
              const differential = entry.stats.find(s => s.name === 'differential')?.displayValue || '0';
              setTeamRecord({ wins, losses, streak, differential });
              return;
            }
          }
        }
        return;
      }
      const url = 'https://cdn.espn.com/core/nfl/standings?xhr=1';
      const res = await fetch(url);
      if (!res.ok) {
        console.error('Standings response not OK', res.status, res.statusText);
        return;
      }
      const json = await res.json();
      cachedStandings.current = json;
      // search for team entry
      const groups = json?.content?.standings?.groups || [];
      for (const group of groups) {
        for (const division of group.groups || []) {
          const entry = (division.standings?.entries || []).find(e => e.team?.id?.toString() === teamIdParam?.toString());
          if (entry) {
            const wins = entry.stats.find(s => s.name === 'wins')?.displayValue || '0';
            const losses = entry.stats.find(s => s.name === 'losses')?.displayValue || '0';
            const streak = entry.stats.find(s => s.name === 'streak')?.displayValue || 'N/A';
            const differential = entry.stats.find(s => s.name === 'differential')?.displayValue || '0';
            setTeamRecord({ wins, losses, streak, differential });
            return;
          }
        }
      }
    } catch (e) {
      console.error('Error fetching NFL standings:', e);
    }
  };

  // Helper to build a safe player headshot URL with placeholders
  const getPlayerHeadshotUrl = (player) => {
    if (!player) return 'https://via.placeholder.com/88x88?text=Player';
    if (player.headshot) return player.headshot;
    if (player.athlete && player.athlete.headshot) return player.athlete.headshot;
    const id = player.id || player.athlete?.id;
    if (id) return `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/${id}.png&w=88&h=88`;
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

    const placeholder = require('../../../assets/nfl.png');
    return (
      <Image
        style={style}
        source={logoSource || placeholder}
        onError={handleError}
        resizeMode="contain"
      />
    );
  };

  // Enhanced logo function with dark mode support and fallbacks (from England)
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
      ? `https://a.espncdn.com/i/teamlogos/nfl/500-dark/${normalized}.png`
      : `https://a.espncdn.com/i/teamlogos/nfl/500/${normalized}.png`;

    const fallbackUrl = isDarkMode
      ? `https://a.espncdn.com/i/teamlogos/nfl/500/${normalized}.png`
      : `https://a.espncdn.com/i/teamlogos/nfl/500-dark/${normalized}.png`;

    return { primaryUrl, fallbackUrl };
  };

  const getCompetitionName = (leagueCode) => {
    if (!leagueCode) return null;
    // Minimal mapping; expand if needed
    const code = String(leagueCode).toLowerCase();
    switch (code) {
      case 'nfl': return 'NFL';
      default: return leagueCode;
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
        const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/schedule?seasontype=${chosenType}`;
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
          setCurrentGame(liveEvent);
          if (isFavorite(teamId)) {
            try {
              await updateTeamCurrentGame(teamId, { eventId: liveEvent.id, eventLink: liveEvent.links?.website?.href || liveEvent.link, gameDate: liveEvent.date, competition: 'nfl', updatedAt: new Date().toISOString() });
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
          setCurrentGame(inWindowEvent);
          if (isFavorite(teamId)) {
            try {
              await updateTeamCurrentGame(teamId, { eventId: inWindowEvent.id, eventLink: inWindowEvent.links?.website?.href || inWindowEvent.link, gameDate: inWindowEvent.date, competition: 'nfl', updatedAt: new Date().toISOString() });
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
          setCurrentGame(upcoming);
          if (isFavorite(teamId)) {
            try {
              await updateTeamCurrentGame(teamId, { eventId: upcoming.id, eventLink: upcoming.links?.website?.href || upcoming.link, gameDate: upcoming.date, competition: 'nfl', updatedAt: new Date().toISOString() });
            } catch (e) {}
          }
          return;
        }
      }
    } catch (error) {
      console.error('Error fetching current NFL game:', error);
    }
  };

  const fetchAllMatches = async (eventsParam) => {
    try {
      // Fetch season schedule via ESPN site API
      // Accept pre-fetched events to avoid duplicate network requests
      let events = eventsParam || cachedEvents.current;
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
        } catch (e) {
          // Fallback to fetching chosen type if combining fails
          const chosenType = cachedEvents.selectedSeasonType || 1;
          const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/schedule?seasontype=${chosenType}`;
          const res = await fetch(url);
          const json = await res.json();
          events = json?.events || [];
          cachedEvents.current = events;
        }
      } else if (!events) {
        // Use the previously selected season type if available, otherwise default to type=1
        const chosenType = cachedEvents.selectedSeasonType || 1;
        const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/schedule?seasontype=${chosenType}`;
        const res = await fetch(url);
        const json = await res.json();
        events = json?.events || [];
        cachedEvents.current = events;
      }
      // Determine today's window: today local midnight -> next day 2:00 AM
      const nowLocal = new Date();
      const startOfTodayLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 0, 0, 0, 0);
      const endOfWindowLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate() + 1, 2, 0, 0, 0);

      const past = [];
      const future = [];

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
          continue;
        }

        const state = ev.status?.type?.state;
        const desc = (ev.status?.type?.description || ev.status?.type?.shortDetail || ev.status?.description || '').toLowerCase();

        // Final / completed games (and not today) => past
        const isFinal = state === 'post' || state === 'complete' || !!ev.status?.type?.completed || desc.includes('final');
        // Scheduled / pre-game and not today => future
        const isScheduled = state === 'pre' || state === 'preview' || state === 'pre-game' || desc.includes('scheduled') || state === 'scheduled';

        if (isFinal) past.push(ev);
        else if (isScheduled) future.push(ev);
        else {
          // Fallback based on date: past if event date < now, otherwise future
          if (evDate && evDate < new Date()) past.push(ev);
          else future.push(ev);
        }
      }

      // sort past descending, future ascending
      past.sort((a, b) => new Date(b.date) - new Date(a.date));
      future.sort((a, b) => new Date(a.date) - new Date(b.date));

      setLastMatches(past);
      setNextMatches(future);
    } catch (e) {
      console.error('Error fetching NFL matches:', e);
    }
  };

  const fetchRoster = async () => {
    if (!teamData) return;
    setLoadingRoster(true);
    try {
      // Try ESPN roster endpoint
      const rosterUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/roster`;
      const res = await fetch(rosterUrl);
      const json = await res.json();
      const athletes = json?.athletes || json?.items || json?.roster || [];
      setRoster(athletes);
    } catch (e) {
      console.error('Error fetching NFL roster:', e);
    } finally {
      setLoadingRoster(false);
    }
  };

  const fetchTeamStats = async () => {
    if (!teamData) return;
    setLoadingStats(true);
    try {
      // ESPN stats endpoint - season summary if available
      const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/statistics`;
      const res = await fetch(url);
      const json = await res.json();
      setTeamStats(json);
    } catch (e) {
      console.error('Error fetching NFL stats:', e);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleGamePress = (game) => {
    console.log('Navigating to game:', game.id || game.eventId || game.gameId);
    navigation.navigate('GameDetails', { gameId: game.id || game.eventId || game.gameId, sport: 'nfl' });
  };

  const isGameLive = (game) => {
    if (!game || !game.status) return false;
    const state = game.status.type?.state;
    return state === 'in' || state === 'live' || state === 'post' && !!game.status?.type?.completed === false;
  };

  useEffect(() => {
    if (activeTab === 'Roster' && teamData && !roster && !loadingRoster) fetchRoster();
  }, [activeTab, teamData, roster, loadingRoster]);

  useEffect(() => {
    if (activeTab === 'Stats' && teamData && !teamStats && !loadingStats) fetchTeamStats();
  }, [activeTab, teamData, teamStats, loadingStats]);

  const getTeamLogoUrl = (abbrOrId) => {
    if (!abbrOrId) return 'https://via.placeholder.com/40x40?text=NFL';
    return getThemeTeamLogoUrl('nfl', String(abbrOrId));
  };

  const getTeamColor = (team) => {
    // Simple fallback to primary color from theme
    return colors.primary;
  };

  const renderTeamHeader = () => {
    if (!teamData) return null;

    const isTeamFavorite = isFavorite(teamId?.toString());

    const handleToggleFavorite = async () => {
      const teamPayload = {
        teamId: teamId,
        teamName: teamData.displayName || teamData.name || teamData.shortDisplayName,
        sport: 'NFL',
        abbreviation: teamData.abbreviation || teamData.shortDisplayName
      };

      try {
        setIsUpdatingFavorites(true);
        await fetchCurrentGame();
        let sourceGame = currentGame;
        if (!sourceGame) {
          if (nextMatches && nextMatches.length > 0) sourceGame = nextMatches[0];
          else if (lastMatches && lastMatches.length > 0) sourceGame = lastMatches[0];
        }
        const currentGameData = sourceGame ? { eventId: sourceGame.id, eventLink: sourceGame.links?.website?.href || sourceGame.link, gameDate: sourceGame.date, competition: 'nfl' } : null;
        await toggleFavorite(teamPayload, currentGameData);
      } catch (e) {
        console.log('Error toggling favorite:', e);
      } finally {
        setTimeout(() => setIsUpdatingFavorites(false), 300);
      }
    };

    return (
      <View style={[styles.teamHeader, { backgroundColor: theme.surface }]}>
          <TeamLogoImage team={teamData} style={styles.teamLogoHead} />
        <View style={styles.teamInfo}>
          <Text allowFontScaling={false} style={[styles.teamName, { color: `#${teamData.color}` }]}>{teamData.displayName || teamData.name || teamData.abbreviation}</Text>
          <Text allowFontScaling={false} style={[styles.teamDivision, { color: theme.textSecondary }]}>{teamData.standingSummary || teamData.conference?.name || ''}</Text>
          {teamRecord && (
            <View style={styles.recordContainer}>
              <View style={styles.recordRow}>
                <Text allowFontScaling={false} style={[styles.recordValue, { color: `#${teamData.color}` }]}>{teamRecord.wins}-{teamRecord.losses}</Text>
                <Text allowFontScaling={false} style={[styles.recordValue, { color: teamRecord.streak.slice(0, 1) === 'L' ? 'red' : 'green' }]}>{teamRecord.streak}</Text>
                <Text allowFontScaling={false} style={[styles.recordValue, { color: teamRecord.differential.slice(0, 1) === '-' ? 'red' : 'green' }]}>{teamRecord.differential}</Text>
              </View>
              <View style={styles.recordRow}>
                <Text allowFontScaling={false} style={[styles.recordLabel, { color: theme.textSecondary }]}>RECORD</Text>
                <Text allowFontScaling={false} style={[styles.recordLabel, { color: theme.textSecondary }]}>STRK</Text>
                <Text allowFontScaling={false} style={[styles.recordLabel, { color: theme.textSecondary }]}>DIFF</Text>
              </View>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.favoriteButton} onPress={handleToggleFavorite} activeOpacity={0.7}>
          <Text allowFontScaling={false} style={[styles.favoriteIcon, { color: isTeamFavorite ? colors.primary : theme.textSecondary }]}>{isTeamFavorite ? '★' : '☆'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderTabButtons = () => {
    const tabs = ['Games', 'Stats', 'Roster'];
    return (
      <>
        {tabs.map(tab => (
          <TouchableOpacity key={tab} style={[styles.tabButton, activeTab === tab && styles.activeTabButton, { borderBottomColor: activeTab === tab ? colors.primary : 'transparent' }]} onPress={() => setActiveTab(tab)}>
            <Text allowFontScaling={false} style={[styles.tabText, activeTab === tab && styles.activeTabText, { color: activeTab === tab ? colors.primary : theme.textSecondary }]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </>
    );
  };

  const renderCurrentGame = () => {
    if (!currentGame) return (
      <View style={styles.matchesSection}>
        <Text allowFontScaling={false} style={[styles.gameSectionTitle, { color: colors.primary }]}>Current Game</Text>
        <View style={[styles.noGameContainer, {backgroundColor: theme.surface}]}><Text allowFontScaling={false} style={[styles.noGameText, { color: theme.textSecondary }]}>No current or upcoming games found</Text></View>
      </View>
    );

    const home = currentGame.competitions ? currentGame.competitions[0].competitors.find(c => c.homeAway === 'home') : currentGame.home;
    const away = currentGame.competitions ? currentGame.competitions[0].competitors.find(c => c.homeAway === 'away') : currentGame.away;
    const gameDate = new Date(currentGame.date || currentGame.gameDate || currentGame.eventDate);

    const formatGameTime = (date) => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const formatGameDate = (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const statusText = currentGame.status?.type?.description || currentGame.status?.type?.shortDetail || currentGame.status?.description || '';

  // build competition header text: handled below in detailed rendering

    // Use the more detailed England-style rendering with scores and shootouts
    const competition = currentGame.competitions ? currentGame.competitions[0] : currentGame.competition || {};
    const competitors = competition.competitors || [];
    const homeTeam = competitors.find(c => c.homeAway === 'home') || home;
    const awayTeam = competitors.find(c => c.homeAway === 'away') || away;

    // Debug: log first two logo entries returned by the API for each team (if present)
    try {
      console.log('Current game logos - home:', homeTeam?.team?.logos?.[0], homeTeam?.team?.logos?.[1]);
      console.log('Current game logos - away:', awayTeam?.team?.logos?.[0], awayTeam?.team?.logos?.[1]);
    } catch (e) {
      console.warn('Error logging logos for current game', e);
    }

    const gameDateObj = new Date(currentGame.date || currentGame.eventDate || currentGame.gameDate);

    // convert to EST strings
    const estDate = new Date(gameDateObj.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const formatGameTimeEst = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' });
    const formatGameDateEst = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });

    const getScoreValue = (scoreData) => {
      if (!scoreData) return '0';
      if (scoreData.displayValue) return scoreData.displayValue;
      if (scoreData.value !== undefined) return String(scoreData.value);
      return '0';
    };

    const getShootoutScore = (scoreData) => {
      if (!scoreData || typeof scoreData !== 'object') return null;
      if (scoreData.shootoutScore !== undefined && scoreData.shootoutScore !== null) return String(scoreData.shootoutScore);
      return null;
    };

    const homeScore = getScoreValue(homeTeam.score);
    const awayScore = getScoreValue(awayTeam.score);
    const homeShootout = getShootoutScore(homeTeam.score);
    const awayShootout = getShootoutScore(awayTeam.score);

    const now = new Date();
    const threeHoursAgo = new Date(now.getTime() - (3 * 60 * 60 * 1000));
    const gameStatus = (gameDateObj < threeHoursAgo) ? 'Final' : (gameDateObj <= now ? 'Current' : 'Scheduled');

    const determineWinner = () => {
      if (gameStatus !== 'Final') return { homeIsWinner: false, awayIsWinner: false, isDraw: false };
      if (homeShootout !== null && awayShootout !== null) {
        const h = parseInt(homeShootout || '0');
        const a = parseInt(awayShootout || '0');
        if (h > a) return { homeIsWinner: true, awayIsWinner: false, isDraw: false };
        if (a > h) return { homeIsWinner: false, awayIsWinner: true, isDraw: false };
        return { homeIsWinner: false, awayIsWinner: false, isDraw: true };
      }
      const h = parseInt(homeScore || '0');
      const a = parseInt(awayScore || '0');
      if (h > a) return { homeIsWinner: true, awayIsWinner: false, isDraw: false };
      if (a > h) return { homeIsWinner: false, awayIsWinner: true, isDraw: false };
      return { homeIsWinner: false, awayIsWinner: false, isDraw: true };
    };

    const { homeIsWinner, awayIsWinner, isDraw } = determineWinner();
    const homeIsLoser = gameStatus === 'Final' && !isDraw && !homeIsWinner;
    const awayIsLoser = gameStatus === 'Final' && !isDraw && !awayIsWinner;
    const compHeadline = (competition.notes && competition.notes.length > 0 && competition.notes[0].headline) ? competition.notes[0].headline : (currentGame.week?.text || competition.week?.text || '');
    const venueName = competition.venue?.fullName || competition.venue?.name || '';

    return (
      <View style={styles.matchesSection}>
        <Text allowFontScaling={false} style={[styles.gameSectionTitle, { color: colors.primary }]}>Current Game</Text>
        <TouchableOpacity style={[styles.gameCard, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => handleGamePress(currentGame)} activeOpacity={0.8}>
          <View style={[styles.leagueHeader, { backgroundColor: theme.surfaceSecondary }]}>
            <Text allowFontScaling={false} style={[styles.leagueText, { color: colors.primary }]}>
              {competition.notes?.[0]?.headline ? '' : `${currentGame.seasonType?.name || ''}${currentGame.seasonType?.name ? ' - ' : ''}`}
              {getCompetitionName(currentGame.leagueCode) || competition?.name || competition?.league?.name || (competition.notes?.[0]?.headline) || (currentGame.week?.text) || 'NFL'}
            </Text>
          </View>

          <View style={styles.matchContent}>
            <View style={styles.teamSection}>
              <View style={styles.teamLogoRow}>
                <TeamLogoImage team={homeTeam.team || homeTeam} style={[styles.teamLogo, homeIsLoser && styles.losingTeamLogo]} />
                {gameStatus !== 'Scheduled' && (
                  <View style={styles.scoreContainer}>
                    <Text allowFontScaling={false} style={[styles.teamScore, { color: (gameStatus === 'Final' && homeIsWinner) ? colors.primary : (homeIsLoser ? '#999' : theme.text) }]}>{homeScore}</Text>
                    {homeShootout && <Text allowFontScaling={false} style={[styles.shootoutScore, { color: homeIsLoser ? '#999' : colors.primary }]}>{`(${homeShootout})`}</Text>}
                  </View>
                )}
              </View>
              <Text allowFontScaling={false} style={[styles.teamAbbreviation, { color: isFavorite(homeTeam.team?.id) ? colors.primary : (homeIsLoser ? '#999' : theme.text) }]}>{isFavorite(homeTeam.team?.id) ? '★ ' : ''}{homeTeam.team?.abbreviation || homeTeam.team?.shortDisplayName || 'TBD'}</Text>
            </View>

            <View style={styles.statusSection}>
              <Text allowFontScaling={false} style={[styles.gameStatus, { color: gameStatus === 'Current' ? '#ff4444' : colors.primary }]}>{gameStatus}</Text>
              <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary }]}>{formatGameDateEst(estDate)}</Text>
              <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary }]}>{formatGameTimeEst(estDate)} EST</Text>
            </View>

            <View style={styles.teamSection}>
              <View style={styles.teamLogoRow}>
                {gameStatus !== 'Scheduled' && (
                  <View style={styles.scoreContainer}>
                    {awayShootout && <Text allowFontScaling={false} style={[styles.shootoutScore, { color: awayIsLoser ? '#999' : colors.primary }]}>{`(${awayShootout})`}</Text>}
                    <Text allowFontScaling={false} style={[styles.teamScore, { color: (gameStatus === 'Final' && awayIsWinner) ? colors.primary : (awayIsLoser ? '#999' : theme.text) }]}>{awayScore}</Text>
                  </View>
                )}
                <TeamLogoImage team={awayTeam.team || awayTeam} style={[styles.teamLogo, awayIsLoser && styles.losingTeamLogo]} />
              </View>
              <Text allowFontScaling={false} style={[styles.teamAbbreviation, { color: isFavorite(awayTeam.team?.id) ? colors.primary : (awayIsLoser ? '#999' : theme.text) }]}>{isFavorite(awayTeam.team?.id) ? '★ ' : ''}{awayTeam.team?.abbreviation || awayTeam.team?.shortDisplayName || 'TBD'}</Text>
            </View>
          </View>

          {venueName ? <View style={[styles.venueSection, { borderTopColor: theme.border }]}> <Text allowFontScaling={false} style={[styles.venueText, { color: theme.textSecondary }]}> {venueName}</Text></View> : null}
        </TouchableOpacity>
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

    // Debug: log first two logo entries returned by the API for each team (if present)
    try {
      console.log('Match logos - home:', homeTeam?.team?.logos?.[0], homeTeam?.team?.logos?.[1]);
      console.log('Match logos - away:', awayTeam?.team?.logos?.[0], awayTeam?.team?.logos?.[1]);
    } catch (e) {
      console.warn('Error logging logos for match card', e);
    }

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

    // Get scores using the actual score data structure
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
            {competition.notes?.[0]?.headline || game.seasonType.name === 'Preseason' ? '' : `${game.seasonType.name} - `} {getCompetitionName(game.leagueCode) || competition?.name || competition?.league?.name || (competition.notes?.[0]?.headline) || (game.week?.text) || 'NFL'}
          </Text>
        </View>
        
        {/* Main Match Content */}
        <View style={styles.matchContent}>
          {/* Away Team */}
          <View style={styles.teamSection}>
            <View style={styles.teamLogoRow}>
              <TeamLogoImage
                teamId={awayTeam.team?.abbreviation}
                style={[styles.teamLogo, awayIsLoser && styles.losingTeamLogo]}
              />
              {gameStatus !== 'Scheduled' && (
                <View style={styles.scoreContainer}>
                  <Text allowFontScaling={false} style={[styles.teamScore, { 
                    color: gameStatus === 'Final' && awayIsWinner ? colors.primary : 
                           awayIsLoser ? '#999' : theme.text 
                  }]}>
                    {awayScore}
                  </Text>
                  {awayShootoutScore && (
                    <Text allowFontScaling={false} style={[
                      styles.shootoutScore, 
                      { color: awayIsLoser ? '#999' : colors.primary }
                    ]}>
                      ({awayShootoutScore})
                    </Text>
                  )}
                </View>
              )}
            </View>
            <Text allowFontScaling={false} style={[styles.teamAbbreviation, { 
              color: isFavorite(awayTeam.team?.id) ? colors.primary : (awayIsLoser ? '#999' : theme.text)
            }]}>
              {isFavorite(awayTeam.team?.id) ? '★ ' : ''}{awayTeam.team?.abbreviation || awayTeam.team?.shortDisplayName || 'TBD'}
            </Text>
          </View>
          
          {/* Status Section */}
          <View style={styles.statusSection}>
            <Text allowFontScaling={false} style={[styles.gameStatus, { color: gameStatus === 'Current' ? '#ff4444' : colors.primary }]}>
              {gameStatus}
            </Text>
            <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary }]}>
              {formatGameDate(gameDate)}
            </Text>
            <Text allowFontScaling={false} style={[styles.gameDateTime, { color: theme.textSecondary }]}>
              {formatGameTime(gameDate)} EST
            </Text>
          </View>
          
          {/* Home Team */}
          <View style={styles.teamSection}>
            <View style={styles.teamLogoRow}>
              {gameStatus !== 'Scheduled' && (
                <View style={styles.scoreContainer}>
                  {homeShootoutScore && (
                    <Text allowFontScaling={false} style={[
                      styles.shootoutScore, 
                      { color: homeIsLoser ? '#999' : colors.primary }
                    ]}>
                      ({homeShootoutScore})
                    </Text>
                  )}
                  <Text allowFontScaling={false} style={[styles.teamScore, { 
                    color: gameStatus === 'Final' && homeIsWinner ? colors.primary : 
                           homeIsLoser ? '#999' : theme.text 
                  }]}>
                    {homeScore}
                  </Text>
                </View>
              )}
              <TeamLogoImage
                teamId={homeTeam.team?.abbreviation}
                style={[styles.teamLogo, homeIsLoser && styles.losingTeamLogo]}
              />
            </View>
            <Text allowFontScaling={false} style={[styles.teamAbbreviation, { 
              color: isFavorite(homeTeam.team?.id) ? colors.primary : (homeIsLoser ? '#999' : theme.text)
            }]}>
              {isFavorite(homeTeam.team?.id) ? '★ ' : ''}{homeTeam.team?.abbreviation || homeTeam.team?.shortDisplayName || 'TBD'}
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
    if (loadingStats) return (
      <View style={styles.statsLoadingContainer}><ActivityIndicator size="large" color={colors.primary} /><Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>Loading team statistics...</Text></View>
    );

    if (!teamStats) return (
      <View style={styles.statsLoadingContainer}><Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>Team statistics not available</Text></View>
    );

    // teamStats is expected to follow ESPN site API structure with categories and stats
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

  // Collapsible roster sections grouped by position (based on ESPN site API shape - see c1.txt)
  const [collapsedRosterSections, setCollapsedRosterSectionsState] = useState({});

  const toggleRosterSection = (sectionKey) => {
    // Treat undefined as collapsed (true). First toggle should open (false).
    setCollapsedRosterSectionsState(prev => ({ ...prev, [sectionKey]: !(prev[sectionKey] ?? true) }));
  };

  const formatSectionTitle = (raw) => {
    if (!raw) return '';
    // Replace underscores/dashes with spaces and split camelCase by inserting spaces before caps
    const spaced = String(raw).replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    // Capitalize first letter of each word
    return spaced.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const renderRosterContent = () => {
    if (loadingRoster) return (
      <View style={styles.matchesSection}><ActivityIndicator size="large" color={colors.primary} /><Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>Loading roster...</Text></View>
    );

    if (!roster || (Array.isArray(roster) && roster.length === 0)) return (
      <View style={styles.matchesSection}><Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>Roster data not available</Text></View>
    );

    // `roster` may be an object with position buckets (as in c1.txt) or a flat array
    // If it's an object with `athletes` or `position` groups, use that
    const groups = Array.isArray(roster) && roster.length > 0 && roster[0].position ? roster : (roster.athletes || roster.positions || roster.groups || roster);

    // Normalize groups to an array of { title, items }
    const normalized = Array.isArray(groups) ? groups.map(g => ({ title: g.position || g.displayName || g.name || g.title || (g.position && g.position.displayName), items: g.items || g.athletes || g.players || g.people || g.values || (g.items === undefined ? g : []) })) : [];

    const renderPlayerSection = (title, players, sectionKey) => {
      if (!players || players.length === 0) return null;

      const isCollapsed = (collapsedRosterSections[sectionKey] !== undefined) ? collapsedRosterSections[sectionKey] : true;

      const toggleSection = () => {
        // Treat undefined as collapsed (true). First toggle should open (false).
        setCollapsedRosterSectionsState(prev => ({ ...prev, [sectionKey]: !(prev[sectionKey] ?? true) }));
      };

      return (
        <View style={styles.rosterSection} key={sectionKey}>
          <TouchableOpacity style={styles.rosterSectionHeader} onPress={toggleSection} activeOpacity={0.7}>
            <Text allowFontScaling={false} style={[styles.rosterSectionTitle, { color: theme.text }]}>{formatSectionTitle(title)} ({players.length})</Text>
            <Text allowFontScaling={false} style={[styles.rosterSectionArrow, { color: theme.text }]}>{isCollapsed ? '▶' : '▼'}</Text>
          </TouchableOpacity>

          {!isCollapsed && (
            <View style={styles.rosterTableContainer}>
              <View style={[styles.rosterTableHeader, { backgroundColor: theme.surface }]}>
                <Text allowFontScaling={false} style={[styles.rosterTableHeaderPlayer, { color: theme.text }]}>Player</Text>
                <Text allowFontScaling={false} style={[styles.rosterTableHeaderStatus, { color: theme.text }]}>Status</Text>
              </View>

              {players.map((player, idx) => {
                const p = player.athlete || player.person || player.player || player;
                // Robustly derive a numeric/string player id from several possible shapes.
                // Some roster payloads nest the real athlete under additional keys, so check common locations.
                const playerId =
                  p?.id ||
                  p?.uid ||
                  // sometimes the item is wrapped: player.athlete.athlete or player.athlete.id
                  (player?.athlete && (player.athlete.id || player.athlete.uid)) ||
                  p?.athlete?.id ||
                  p?.person?.id ||
                  p?.player?.id ||
                  // fall back to a stable placeholder if nothing else is found
                  `${sectionKey}-${idx}`;
                const displayName = p?.fullName || p?.displayName || p?.shortName || p?.name || 'Unknown';
                const jersey = p?.jersey || p?.number || p?.uniformNumber || p?.jerseyNumber || '--';
                const pos = (p?.position && (p.position.abbreviation || p.position.displayName)) || player.position || player.position?.abbreviation || 'N/A';
                const headshotUrl = p?.headshot?.href || p?.headshot || getPlayerHeadshotUrl(p);
                const statusText = p?.status?.name || player?.status?.name || p?.status || null;
                const isActive = statusText ? String(statusText).toLowerCase().includes('active') : false;

                return (
                  <TouchableOpacity
                    key={playerId}
                    style={[styles.rosterTableRow, { borderBottomColor: theme.border, backgroundColor: theme.surfaceSecondary }]}
                    onPress={() => navigation.navigate('PlayerPage', { playerId, playerName: displayName, teamId, sport })}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rosterTablePlayerCell}>
                      <View style={styles.rosterPlayerRow}>
                        <Image
                          source={{ uri: headshotUrl }}
                          style={styles.playerHeadshot}
                        />
                        <View style={styles.rosterPlayerInfo}>
                          <Text allowFontScaling={false} style={[styles.rosterTablePlayerName, { color: theme.text }]}>{displayName}</Text>
                          <Text allowFontScaling={false} style={[styles.rosterTablePlayerDetails, { color: theme.textTertiary }]}>
                            <Text allowFontScaling={false} style={[styles.rosterTablePlayerNumber, { color: theme.textTertiary }]}>{`#${jersey}`}</Text>
                            {' • '}
                            {pos}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.rosterTableStatusCell}>
                      <View style={[styles.statusPill, isActive ? styles.activeStatus : styles.inactiveStatus]}>
                        <Text allowFontScaling={false} style={[styles.rosterTableStatusText, isActive ? styles.statusTextActive : styles.statusTextInactive]}>{isActive ? 'Active' : (statusText || 'Inactive')}</Text>
                      </View>
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
        {normalized.map((group, gi) => {
          const items = Array.isArray(group.items) ? group.items : [];
          if (!items || items.length === 0) return null;
          return renderPlayerSection(group.title || group.displayName || `Section ${gi + 1}`, items, group.title || `section-${gi}`);
        })}
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
              <TouchableOpacity style={styles.sectionHeader} onPress={() => setLastMatchesCollapsed(!lastMatchesCollapsed)}>
                <Text allowFontScaling={false} style={[styles.gameSectionTitle, { color: colors.primary }]}>Last Matches</Text>
                <Text allowFontScaling={false} style={[styles.collapseArrow, { color: colors.primary }]}>{lastMatchesCollapsed ? '▶' : '▼'}</Text>
              </TouchableOpacity>
              {lastMatches.length > 0 ? (lastMatchesCollapsed ? lastMatches.slice(0,1).map(m => <View key={m.id}>{renderMatchCard(m)}</View>) : lastMatches.map(m => <View key={m.id}>{renderMatchCard(m)}</View>)) : (<View style={[styles.gameSectionCard, { backgroundColor: theme.surface }]}><Text allowFontScaling={false} style={[styles.noGameText, { color: theme.textSecondary }]}>No previous games found</Text></View>)}
            </View>

            <View style={styles.matchesSection}>
              <TouchableOpacity style={styles.sectionHeader} onPress={() => setNextMatchesCollapsed(!nextMatchesCollapsed)}>
                <Text allowFontScaling={false} style={[styles.gameSectionTitle, { color: colors.primary }]}>Next Matches</Text>
                <Text allowFontScaling={false} style={[styles.collapseArrow, { color: colors.primary }]}>{nextMatchesCollapsed ? '▶' : '▼'}</Text>
              </TouchableOpacity>
              {nextMatches.length > 0 ? (nextMatchesCollapsed ? nextMatches.slice(0,1).map(m => <View key={m.id}>{renderMatchCard(m)}</View>) : nextMatches.map(m => <View key={m.id}>{renderMatchCard(m)}</View>)) : (<View style={[styles.gameSectionCard, { backgroundColor: theme.surface }]}><Text allowFontScaling={false} style={[styles.noGameText, { color: theme.textSecondary }]}>No upcoming games found</Text></View>)}
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

  if (loading) return (<View style={[styles.loadingContainer, { backgroundColor: theme.background }]}><ActivityIndicator size="large" color={colors.primary} /><Text allowFontScaling={false} style={[styles.loadingText, { color: theme.text }]}>Loading team information...</Text></View>);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      {renderTeamHeader()}
      <View style={[styles.fixedTabContainer, { backgroundColor: theme.surface }]}>{renderTabButtons()}</View>
      <ScrollView style={[styles.contentScrollView, { backgroundColor: theme.background }]}>{renderContent()}</ScrollView>
    </View>
  );
};

// Reuse MLB styles for consistent look
const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16 },
  teamHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3.84, elevation: 5 },
  teamLogoHead: { width: 80, height: 80, marginRight: 20 },
  teamInfo: { flex: 1 },
  favoriteButton: { position: 'absolute', top: 15, right: 15, padding: 10, zIndex: 1 },
  favoriteIcon: { fontSize: 24, fontWeight: 'bold' },
  teamName: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  teamDivision: { fontSize: 16, marginBottom: 8 },
  recordContainer: { marginTop: 4, marginLeft: 0 },
  recordRow: { flexDirection: 'row', justifyContent: 'space-between', width: 180 },
  recordValue: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', flex: 1 },
  recordLabel: { fontSize: 12, textAlign: 'center', flex: 1, marginTop: 2 },
  fixedTabContainer: { flexDirection: 'row', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3.84, elevation: 5, zIndex: 1000 },
  contentScrollView: { flex: 1 },
  tabButton: { flex: 1, paddingVertical: 15, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  activeTabButton: { borderBottomWidth: 3 },
  tabText: { fontSize: 16, fontWeight: '500' },
  activeTabText: { fontWeight: 'bold' },
  gamesContainer: { flex: 1, paddingTop: 5 },
  matchesSection: { paddingHorizontal: 15, paddingVertical: 5 },
  contentText: { fontSize: 16, textAlign: 'center', fontStyle: 'italic' },
  gameSectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  gameSectionCard: { borderRadius: 8, padding: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3.84, elevation: 5, borderWidth: 1, borderColor: '#e0e0e0', borderStyle: 'dashed' },
  gameCard: { borderRadius: 8, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3.84, elevation: 5, overflow: 'hidden' },
  gameTeams: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  teamContainer: { flex: 1, alignItems: 'center' },
  gameTeamLogo: { width: 40, height: 40, marginBottom: 5 },
  gameTeamName: { fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
  versus: { fontSize: 14, fontWeight: 'bold', marginTop: 5 },
  gameInfo: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  gameStatus: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  gameTime: { fontSize: 12 },
  noGameContainer: { backgroundColor: '#f8f8f8', borderRadius: 8, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#e0e0e0', borderStyle: 'dashed' },
  noGameText: { fontSize: 14, fontStyle: 'italic' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  collapseArrow: { fontSize: 16, fontWeight: 'bold' },
  teamLogoContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  gameTeamScore: { fontSize: 30, fontWeight: 'bold', marginHorizontal: 8 },
  rosterContainer: { flex: 1, padding: 15 },
  rosterSection: { marginBottom: 20 },
  rosterSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4 },
  rosterSectionTitle: { fontSize: 16, fontWeight: 'bold', flex: 1 },
  rosterSectionArrow: { fontSize: 14, fontWeight: 'bold', marginLeft: 8 },
  rosterTableContainer: { backgroundColor: 'white', borderRadius: 6, overflow: 'hidden' },
  rosterTableHeader: { flexDirection: 'row', backgroundColor: '#e9ecef', paddingVertical: 8, paddingHorizontal: 12 },
  rosterTableHeaderPlayer: { flex: 3, fontSize: 12, fontWeight: 'bold', color: '#495057' },
  rosterTableHeaderStatus: { flex: 1, fontSize: 12, fontWeight: 'bold', color: '#495057', textAlign: 'center' },
  rosterTableRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', alignItems: 'center' },
  rosterTablePlayerCell: { flex: 3 },
  rosterPlayerRow: { flexDirection: 'row', alignItems: 'center' },
  playerHeadshot: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  rosterPlayerInfo: { flex: 1 },
  rosterTablePlayerName: { fontSize: 14, fontWeight: 'bold', marginBottom: 2 },
  rosterTablePlayerDetails: { fontSize: 12 },
  rosterTablePlayerNumber: { fontWeight: '500' },
  rosterTableStatusCell: { flex: 1, alignItems: 'center' },
  rosterTableStatusText: { fontSize: 12, fontWeight: '500', textAlign: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-end' },
  statusTextActive: { color: '#155724' },
  statusTextInactive: { color: '#721c24' },
  activeStatus: { backgroundColor: '#d4edda' },
  inactiveStatus: { backgroundColor: '#f8d7da' },
  statsContainer: { flex: 1 },
  statsContent: { padding: 15 },
  statsLoadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  statsSection: { marginBottom: 25 },
  statsSectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, gap: 10 },
  statBox: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8, padding: 15, minHeight: 70, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3.84, elevation: 5 },
  statBoxValue: { fontSize: 20, fontWeight: 'bold', marginBottom: 5 },
  statBoxLabel: { fontSize: 12, textAlign: 'center', fontWeight: '500' },
  // New match card styles from England
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

export default TeamPageScreen;

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { NFLService } from '../../services/NFLService';

// Convert HTTP URLs to HTTPS to avoid mixed content issues
const convertToHttps = (url) => {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
};

const NFLPlayerPageScreen = ({ route, navigation }) => {
  const { playerId, playerName, teamId, sport } = route.params;
  const { theme, colors, isDarkMode } = useTheme();
  const [activeTab, setActiveTab] = useState('Stats');
  const [playerData, setPlayerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [playerStats, setPlayerStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [gameLogData, setGameLogData] = useState(null);
  const [gameLog, setGameLog] = useState([]);
  const [loadingGameLog, setLoadingGameLog] = useState(false);
  const [selectedGameStats, setSelectedGameStats] = useState(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [selectedGameStatsDetails, setSelectedGameStatsDetails] = useState(null);
  const [loadingSelectedGameStats, setLoadingSelectedGameStats] = useState(false);
  const [careerData, setCareerData] = useState(null);
  const [loadingCareer, setLoadingCareer] = useState(false);
  // New: store simple eventlog teams per season for the last 6 years
  const [eventlogTeamsBySeason, setEventlogTeamsBySeason] = useState({});
  const [selectedSeasonStats, setSelectedSeasonStats] = useState(null);
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  // Splits state and UI
  const [playerSplits, setPlayerSplits] = useState(null);
  const [selectedSplitCategory, setSelectedSplitCategory] = useState(null);
  const [selectedSplitDetail, setSelectedSplitDetail] = useState(null);
  const [failedLogos, setFailedLogos] = useState(new Set());
  const [leagueNames, setLeagueNames] = useState(new Map());
  const [headshotFailed, setHeadshotFailed] = useState(false);

  const getHeadshotSource = (p) => {
    try {
      if (headshotFailed) return require('../../../assets/nfl.png');
      if (!p) return require('../../../assets/nfl.png');
      // Prefer provided headshot fields (could be string or object)
      if (p.headshot) return typeof p.headshot === 'string' ? { uri: convertToHttps(p.headshot) } : { uri: convertToHttps(p.headshot.href || p.headshot.uri || p.headshot.url) };
      if (p.athlete && p.athlete.headshot) return typeof p.athlete.headshot === 'string' ? { uri: convertToHttps(p.athlete.headshot) } : { uri: convertToHttps(p.athlete.headshot.href || p.athlete.headshot.uri || p.athlete.headshot.url) };

      // Try common alternate locations
      if (p.profile && p.profile.headshot) return { uri: convertToHttps(p.profile.headshot) };
      if (p.profile && p.profile.image) return { uri: convertToHttps(p.profile.image) };

      // Build combiner 88x88 ESPN headshot by id (same as TeamPage helper)
      const id = p.id || p.athlete?.id || (typeof route?.params?.playerId !== 'undefined' ? route.params.playerId : null);
      if (id) return { uri: convertToHttps(`https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/${id}.png&w=88&h=88`) };
    } catch (e) {
      // fall through
    }
    return require('../../../assets/nfl.png');
  };

  // Convert ESPN numeric team id to NFL abbreviation (same mapping used in ScoreboardScreen)
  const convertTeamIdToAbbr = (teamId) => {
    if (!teamId) return null;
    const idStr = String(teamId);
    const teamMapping = {
      '2': 'BUF', '15': 'MIA', '17': 'NE', '20': 'NYJ',
      '33': 'BAL', '4': 'CIN', '5': 'CLE', '23': 'PIT',
      '34': 'HOU', '11': 'IND', '30': 'JAX', '10': 'TEN',
      '7': 'DEN', '12': 'KC', '13': 'LV', '24': 'LAC',
      '6': 'DAL', '19': 'NYG', '21': 'PHI', '28': 'WAS',
      '3': 'CHI', '8': 'DET', '9': 'GB', '16': 'MIN',
      '1': 'ATL', '29': 'CAR', '18': 'NO', '27': 'TB',
      '22': 'ARI', '14': 'LAR', '25': 'SF', '26': 'SEA'
    };
    return teamMapping[idStr] || null;
  };

  // Convert ESPN numeric team id to full NFL team name
  const convertTeamIdToFullName = (teamId) => {
    if (!teamId) return null;
    const idStr = String(teamId);
    const nameMap = {
      '1': 'Atlanta Falcons','2': 'Buffalo Bills','3': 'Chicago Bears','4': 'Cincinnati Bengals','5': 'Cleveland Browns',
      '6': 'Dallas Cowboys','7': 'Denver Broncos','8': 'Detroit Lions','9': 'Green Bay Packers','10': 'Tennessee Titans',
      '11': 'Indianapolis Colts','12': 'Kansas City Chiefs','13': 'Las Vegas Raiders','14': 'Los Angeles Rams','15': 'Miami Dolphins',
      '16': 'Minnesota Vikings','17': 'New England Patriots','18': 'New Orleans Saints','19': 'New York Giants','20': 'New York Jets',
      '21': 'Philadelphia Eagles','22': 'Arizona Cardinals','23': 'Pittsburgh Steelers','24': 'Los Angeles Chargers','25': 'San Francisco 49ers',
      '26': 'Seattle Seahawks','27': 'Tampa Bay Buccaneers','28': 'Washington Commanders','29': 'Carolina Panthers','30': 'Jacksonville Jaguars',
      '33': 'Baltimore Ravens','34': 'Houston Texans'
    };
    return nameMap[idStr] || null;
  };

  // Helper function to get team logo URL with fallback. Prefer abbreviation over numeric id.
  const getTeamLogoUrl = (teamParam, useDarkMode = isDarkMode) => {
    if (!teamParam) return null;

    // Accept either a team object or a string (abbr or id)
    let token = null;
    if (typeof teamParam === 'object') {
      token = teamParam.abbreviation || teamParam.abbr || teamParam.id || teamParam.team?.abbreviation || teamParam.team?.abbr;
    } else {
      token = teamParam;
    }

    if (!token) return null;

    // If token appears numeric, convert to abbreviation first
    let normalizedToken = token;
    if (/^\d+$/.test(String(token))) {
      const abbr = convertTeamIdToAbbr(token);
      if (abbr) normalizedToken = abbr;
    }
    const normalized = String(normalizedToken).toLowerCase();
    const primaryKey = `${normalized}-${useDarkMode ? '500-dark' : '500'}`;
    const fallbackKey = `${normalized}-${useDarkMode ? '500' : '500-dark'}`;
    if (failedLogos.has(primaryKey) && failedLogos.has(fallbackKey)) return null;
    if (failedLogos.has(primaryKey)) {
      return `https://a.espncdn.com/i/teamlogos/nfl/${useDarkMode ? '500' : '500-dark'}/${normalized}.png`;
    }
    return `https://a.espncdn.com/i/teamlogos/nfl/${useDarkMode ? '500-dark' : '500'}/${normalized}.png`;
  };

  const handleLogoError = useCallback((teamParam, useDarkMode) => {
    // Derive the same normalized key as getTeamLogoUrl
    let token = null;
    if (typeof teamParam === 'object') {
      token = teamParam.abbreviation || teamParam.abbr || teamParam.id || teamParam.team?.abbreviation || teamParam.team?.abbr;
    } else {
      token = teamParam;
    }
    if (!token) return;
    let normalizedToken = token;
    if (/^\d+$/.test(String(token))) {
      const abbr = convertTeamIdToAbbr(token);
      if (abbr) normalizedToken = abbr;
    }
    const normalized = String(normalizedToken).toLowerCase();
    const logoKey = `${normalized}-${useDarkMode ? '500-dark' : '500'}`;
    setFailedLogos(prev => new Set([...prev, logoKey]));
  }, []);

  const getTeamLogoFallbackUrl = (teamParam, useDarkMode = isDarkMode) => {
    if (!teamParam) return require('../../../assets/nfl.png');
    let token = null;
    if (typeof teamParam === 'object') {
      token = teamParam.abbreviation || teamParam.abbr || teamParam.id;
    } else {
      token = teamParam;
    }
    if (!token) return require('../../../assets/nfl.png');
    let normalizedToken = token;
    if (/^\d+$/.test(String(token))) {
      const abbr = convertTeamIdToAbbr(token);
      if (abbr) normalizedToken = abbr;
    }
    const normalized = String(normalizedToken).toLowerCase();
    return { uri: `https://a.espncdn.com/i/teamlogos/nfl/500/${normalized}.png` };
  };

  // Find per-event stats array in the gamelog/seasonTypes structure by eventId
  const findEventStatsByEventId = (eventId) => {
    if (!gameLogData || !Array.isArray(gameLogData.seasonTypes)) return null;
    for (const season of gameLogData.seasonTypes) {
      if (!season || !Array.isArray(season.categories)) continue;
      for (const cat of season.categories) {
        if (!cat || !Array.isArray(cat.events)) continue;
        const ev = cat.events.find(e => String(e.eventId) === String(eventId));
        if (ev && Array.isArray(ev.stats)) return ev.stats;
      }
    }
    return null;
  };

  // Map various position display names to a simplified category
  const positionCategoryFromDisplay = (posDisplay) => {
    if (!posDisplay) return null;
    const p = String(posDisplay).toLowerCase();
    if (p.includes('quarter') || p.includes('qb')) return 'QB';
    if (p.includes('running') || p === 'rb' || p.includes('running back')) return 'RB';
    if (p.includes('wide') || p.includes('receiver') || p === 'wr' || p.includes('wing')) return 'WR';
    if (p.includes('tight') || p === 'te') return 'WR';
    if (p.includes('kicker') || p === 'k' || p.includes('pk')) return 'PK';
    if (p.includes('punt') || p === 'p' || p.includes('punter')) return 'P';
    if (p.includes('safety') || p.includes('corner') || p.includes('db') || p.includes('defensive back')) return 'DB';
    if (p.includes('lineback') || p.includes('lb') || p.includes('tackle') || p.includes('end') || p.includes('defensive')) return 'DL';
    return null;
  };

  // Format the concise stat string to show on the game card according to position rules (see c5.txt mapping)
  const getGameCardStatsString = (game) => {
    try {
      if (!game || !game.id) return '';
      const statsArr = findEventStatsByEventId(game.id);
      if (!statsArr || !Array.isArray(statsArr) || statsArr.length === 0) return '';
      const posCat = positionCategoryFromDisplay(playerData?.position?.displayName || playerData?.position?.name || '');
      // Helper to safely read index
      const s = (i) => (typeof statsArr[i] !== 'undefined' && statsArr[i] !== null ? statsArr[i] : '');
      switch (posCat) {
        case 'QB':
          // C/ATT | PYDS | PTD
          return `${s(0)}/${s(1)} • ${s(2)} YDS • ${s(5)} TD`;
        case 'RB':
          // CAR | YDS | TD
          return `${s(0)} CAR • ${s(1)} YDS • ${s(3)} TD`;
        case 'WR':
          // REC | YDS | TD
          return `${s(0)} REC • ${s(2)} YDS • ${s(4)} TD`;
        case 'PK':
          // FG | XP | PTS
          return `FG: ${s(7)} • XP: ${s(9)} • PTS: ${s(10)}`;
        case 'P':
          // PUNTS | AVG | LNG
          return `PUNTS: ${s(0)} • AVG: ${s(1)} • LNG: ${s(2)}`;
        case 'DB':
          // TOT | SACK | PD
          return `${s(0)} TOT • SACK: ${s(3)} • PD: ${s(14)}`;
        case 'DL':
          // TOT | SACK | FF
          return `${s(0)} TOT • SACK: ${s(3)} • FF: ${s(6)}`;
        default:
          return '';
      }
    } catch (e) {
      return '';
    }
  };

  // Normalize category/stat names: split camelCase, underscores, dashes, and title-case each word
  const formatDisplayName = (raw) => {
    if (!raw && raw !== 0) return '';
    let s = String(raw);
    // If already has spaces and uppercase letters, still normalize spacing and trim
    s = s.replace(/[_\-]+/g, ' ');
    // Insert spaces before capital letters (camelCase -> camel Case)
    s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
    // Collapse multiple spaces
    s = s.replace(/\s+/g, ' ').trim();
    // Title-case each word
    s = s.split(' ').map(w => w.length > 0 ? (w.charAt(0).toUpperCase() + w.slice(1)) : '').join(' ');
    return s;
  };

  // Choose up to 3 representative stats for a season item using position-aware rules (used by career tiles)
  const getTileStatsForSeason = (item) => {
    try {
      const statsResp = item && item.raw ? item.raw : null;
      if (!statsResp || !statsResp.splits || !Array.isArray(statsResp.splits.categories)) return [];

      const findStatByNames = (candidateNames = []) => {
        const cats = statsResp.splits.categories || [];
        for (const cat of cats) {
          if (!cat || !Array.isArray(cat.stats)) continue;
          for (const s of cat.stats) {
            if (!s) continue;
            const lname = (s.name || '').toLowerCase();
            const labbr = (s.abbreviation || s.shortDisplayName || '').toLowerCase();
            const ldisp = (s.displayName || '').toLowerCase();
            for (const c of candidateNames) {
              const cc = String(c).toLowerCase();
              // prefer exact matches on name/abbreviation, but allow displayName contains as fallback
              if (lname === cc || labbr === cc || ldisp === cc || lname.includes(cc)) {
                return s;
              }
            }
          }
        }
        return null;
      };

      // Search for a stat within categories whose name/abbr/displayName matches any of the provided categoryNames
      const findStatInCategories = (categoryNames = [], candidateNames = []) => {
        const cats = statsResp.splits.categories || [];
        const loweredCategoryNames = categoryNames.map(cn => String(cn).toLowerCase());
        for (const cat of cats) {
          if (!cat || !Array.isArray(cat.stats)) continue;
          const catName = (cat.name || cat.displayName || cat.abbreviation || '').toLowerCase();
          if (!loweredCategoryNames.some(cn => catName.includes(cn))) continue;
          // search this category first for exact/abbr matches
          for (const s of cat.stats) {
            if (!s) continue;
            const lname = (s.name || '').toLowerCase();
            const labbr = (s.abbreviation || s.shortDisplayName || '').toLowerCase();
            const ldisp = (s.displayName || '').toLowerCase();
            for (const c of candidateNames) {
              const cc = String(c).toLowerCase();
              if (lname === cc || labbr === cc || ldisp === cc || lname.includes(cc)) return s;
            }
          }
        }
        return null;
      };

      const posCat = positionCategoryFromDisplay(playerData?.position?.displayName || playerData?.position?.name || '');
      const makeStatEntry = (s) => {
        if (!s) return null;
        const label = s.displayName || s.name || s.shortDisplayName || s.abbreviation || '';
        const value = (s.displayValue != null ? s.displayValue : (s.value != null ? s.value : '0'));
        const rank = s.rankDisplayValue || null;
        return { label, value, rank };
      };

      let tileStats = [];
      switch (posCat) {
        case 'QB': {
          const c = findStatByNames(['completions']);
          const y = findStatByNames(['netPassingYards']);
          const t = findStatByNames(['passingTouchdowns']);
          tileStats = [makeStatEntry(c), makeStatEntry(y), makeStatEntry(t)].filter(Boolean);
          break;
        }
        case 'RB': {
          const att = findStatByNames(['rushingAttempts']);
          const y = findStatByNames(['rushingYards']);
          const t = findStatByNames(['rushingTouchdowns']);
          tileStats = [makeStatEntry(att), makeStatEntry(y), makeStatEntry(t)].filter(Boolean);
          break;
        }
        case 'WR': {
          const rec = findStatByNames(['receptions']);
          const y = findStatByNames(['receivingYards']);
          const t = findStatByNames(['receivingTouchdowns']);
          tileStats = [makeStatEntry(rec), makeStatEntry(y), makeStatEntry(t)].filter(Boolean);
          break;
        }
        case 'PK': {
          const fg = findStatByNames(['FG']);
          const xp = findStatByNames(['XPM']);
          const pts = findStatByNames(['KB']);
          tileStats = [makeStatEntry(fg), makeStatEntry(xp), makeStatEntry(pts)].filter(Boolean);
          break;
        }
        case 'P': {
          const punts = findStatByNames(['punts', 'punts']);
          const avg = findStatByNames(['avgPuntReturnYards']);
          const lng = findStatByNames(['longPunt']);
          tileStats = [makeStatEntry(punts), makeStatEntry(avg), makeStatEntry(lng)].filter(Boolean);
          break;
        }
        case 'DB': {
          const tot = findStatByNames(['totalTackles']);
          const sack = findStatByNames(['sacks']);
          const pd = findStatByNames(['passesDefended']);
          tileStats = [makeStatEntry(tot), makeStatEntry(sack), makeStatEntry(pd)].filter(Boolean);
          break;
        }
        case 'DL': {
          const tot = findStatByNames(['totalTackles']);
          const sack = findStatByNames(['sacks']);
          const ff = findStatByNames(['fumblesForced']);
          tileStats = [makeStatEntry(tot), makeStatEntry(sack), makeStatEntry(ff)].filter(Boolean);
          break;
        }
        default: {
          // fallback: first category's first 3 stats
          const firstCat = statsResp.splits.categories[0];
          if (Array.isArray(firstCat.stats) && firstCat.stats.length > 0) {
            tileStats = firstCat.stats.slice(0, 3).map(s => makeStatEntry(s)).filter(Boolean);
          }
        }
      }

      return tileStats;
    } catch (e) {
      return [];
    }
  };

  // Memoize frequently used logo URLs to prevent flickering
  const playerTeamLogoUrl = useMemo(() => {
    if (!playerData?.team?.id) return null;
    return getTeamLogoUrl(playerData.team.id, isDarkMode);
  }, [playerData?.team?.id, isDarkMode, failedLogos]);

  const playerTeamFallbackUrl = useMemo(() => {
    if (!playerData?.team?.id) return require('../../../assets/nfl.png');
    return getTeamLogoFallbackUrl(playerData.team.id, isDarkMode);
  }, [playerData?.team?.id, isDarkMode]);

  // Helper function to get memoized logo URLs for teams to prevent flickering
  const getStableTeamLogoUrl = useCallback((teamParam) => {
    if (!teamParam) return null;
    return getTeamLogoUrl(teamParam, isDarkMode);
  }, [isDarkMode, failedLogos]);

  const getStableTeamFallbackUrl = useCallback((teamParam) => {
    if (!teamParam) return require('../../../assets/nfl.png');
    return getTeamLogoFallbackUrl(teamParam, isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    let mounted = true;
    // Reset headshot failure state so new player attempts their headshot URL
    setHeadshotFailed(false);
    
    (async () => {
      try {
        await fetchPlayerData();
        // Load career after playerData/gamelog are available
        if (mounted) {
          await loadCareerData();
        }
      } catch (e) {
        console.error('Error in mount effect:', e);
      }
    })();
    
    return () => { mounted = false; };
  }, [playerId]);

  // When the Career tab is opened, load career data if we don't have it yet
  useEffect(() => {
    if (activeTab === 'Career' && !careerData && !loadingCareer) {
      loadCareerData();
    }
    // Also fetch simple eventlog teams for past 6 years (non-invasive)
    if (activeTab === 'Career') {
      fetchEventlogTeams();
    }
  }, [activeTab]);

  // Fetch eventlog teams for the past 6 seasons (simple, limited) and store them
  const fetchEventlogTeams = async () => {
    try {
      const thisYear = new Date().getFullYear();
      const seasons = [];
      for (let i = 0; i < 6; i++) seasons.push(String(thisYear - i));

      const results = {};
      await Promise.all(seasons.map(async (season) => {
        try {
          const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${season}/athletes/${playerId}/eventlog?lang=en&region=us&limit=1`;
          const res = await fetch(convertToHttps(url));
          if (!res.ok) {
            results[season] = null;
            return;
          }
          const json = await res.json();
          if (json && json.teams && typeof json.teams === 'object') {
            const teamList = Object.values(json.teams).map(t => ({ id: t.id, abbreviation: convertTeamIdToAbbr(t.id) || String(t.id) }));
            results[season] = teamList;
          } else {
            results[season] = [];
          }
        } catch (e) {
          results[season] = null;
        }
      }));
      setEventlogTeamsBySeason(results);
    } catch (e) {
      // ignore
    }
  };

  // Load per-season career statistics using seasons discovered in gamelog or fallback years
  const loadCareerData = async () => {
    try {
      setLoadingCareer(true);
      // Determine seasons to load. Prefer seasonTypes from gamelog if available
      let seasons = [];
      if (gameLogData && Array.isArray(gameLogData.seasonTypes) && gameLogData.seasonTypes.length > 0) {
        seasons = gameLogData.seasonTypes.map(s => s.season || s.seasonYear || s.name || s.label).filter(Boolean);
      }
      // If no seasons found, generate a recent seasons list (last 6 years)
      if (seasons.length === 0) {
        const thisYear = new Date().getFullYear();
        for (let i = 0; i < 6; i++) seasons.push(String(thisYear - i));
      }

      // Limit to the most recent 8 seasons to avoid too many network calls
      seasons = seasons.slice(0, 8);

      const fetches = seasons.map(season => {
        const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${season}/types/2/athletes/${playerId}/statistics?lang=en&region=us`;
        return fetch(convertToHttps(url)).then(r => r.ok ? r.json().catch(() => null) : null).catch(() => null);
      });

      const settled = await Promise.allSettled(fetches);
      const seasonResults = settled.map((s, idx) => ({ season: seasons[idx], data: s.status === 'fulfilled' ? s.value : null }));

      const careerItems = seasonResults.map(sr => {
        const statsResp = sr.data;
        // teams: try to extract from response (teams or team) or fallback to playerData.team
        let teams = [];
        if (statsResp) {
          if (Array.isArray(statsResp.teams) && statsResp.teams.length > 0) {
            teams = statsResp.teams.map(t => {
              // t may be a $ref or object
              let id = null; let abbr = null; let name = null;
              if (typeof t === 'string') {
                const m = t.match(/teams\/(\d+)/);
                if (m) id = m[1];
              } else if (t && (t['$ref'] || t.href)) {
                const ref = t['$ref'] || t.href;
                const m = ref && ref.match(/teams\/(\d+)/);
                if (m) id = m[1];
                abbr = t.abbreviation || t.abbr || t.alias || null;
                name = t.displayName || t.name || null;
              } else if (t && typeof t === 'object') {
                id = t.id || null;
                abbr = t.abbreviation || t.abbr || t.alias || null;
                name = t.displayName || t.name || null;
              }
              return { id, abbreviation: abbr, displayName: name };
            }).filter(Boolean);
          } else if (statsResp.team) {
            const t = statsResp.team;
            let id = t && (t['$ref'] || t.href) ? (String(t['$ref'] || t.href).match(/teams\/(\d+)/) || [])[1] : (t && t.id ? t.id : null);
            const abbr = t && (t.abbreviation || t.abbr || t.alias) ? (t.abbreviation || t.abbr || t.alias) : null;
            const name = t && (t.displayName || t.name) ? (t.displayName || t.name) : null;
            teams = [{ id, abbreviation: abbr, displayName: name }];
          }
        }
        if ((!teams || teams.length === 0) && playerData && playerData.team) {
          teams = [{ id: playerData.team.id, abbreviation: playerData.team.abbreviation || playerData.team.abbr || null, displayName: playerData.team.displayName || playerData.team.name || null }];
        }

        // Choose up to 3 representative stats for the tile using position-aware rules (mirror getGameCardStatsString).
        let tileStats = [];
        if (statsResp && statsResp.splits && Array.isArray(statsResp.splits.categories) && statsResp.splits.categories.length > 0) {
          // helper: search all categories for a stat by possible candidate names
          const findStatByNames = (candidateNames = []) => {
            const cats = statsResp.splits.categories || [];
            for (const cat of cats) {
              if (!cat || !Array.isArray(cat.stats)) continue;
              for (const s of cat.stats) {
                if (!s) continue;
                const lname = (s.name || '').toLowerCase();
                const labbr = (s.abbreviation || s.shortDisplayName || '').toLowerCase();
                const ldisp = (s.displayName || '').toLowerCase();
                for (const c of candidateNames) {
                  const cc = String(c).toLowerCase();
                  if (lname === cc || labbr === cc || ldisp.includes(cc) || lname.includes(cc)) {
                    return s;
                  }
                }
              }
            }
            return null;
          };

          const posCat = positionCategoryFromDisplay(playerData?.position?.displayName || playerData?.position?.name || '');

          const makeStatEntry = (s) => {
            if (!s) return null;
            const label = s.displayName || s.name || s.shortDisplayName || s.abbreviation || '';
            const value = (s.displayValue != null ? s.displayValue : (s.value != null ? s.value : '0'));
            const rank = s.rankDisplayValue || null;
            return { label, value, rank };
          };

          // Select stats per position. Try common stat keys; fall back to first-category first 3 if nothing found.
          switch (posCat) {
            case 'QB': {
              // Prefer completions, passing yards, passing TDs
              const c = findStatByNames(['completions', 'completions']);
              const y = findStatByNames(['netpassingyards', 'netPassingYards', 'passingYards', 'netTotalYards', 'netTotalYards']);
              const t = findStatByNames(['passingtouchdowns', 'passingTouchdowns', 'passingTd', 'passingTd']);
              tileStats = [makeStatEntry(c), makeStatEntry(y), makeStatEntry(t)].filter(Boolean);
              break;
            }
            case 'RB': {
              // Prefer searching the 'rushing' category first and avoid generic 'attempts' which can match passingAttempts
              const att = findStatInCategories(['rushing', 'rush'], ['rushingAttempts', 'rushAttempts', 'rushingAttempts', 'car', 'carries']);
              const attFallback = att || findStatByNames(['rushingAttempts', 'rushAttempts', 'car', 'carries']);
              const y = findStatByNames(['rushingyards', 'rushingYards', 'netRushingYards', 'netTotalYards']);
              const t = findStatByNames(['rushingtouchdowns', 'rushingTouchdowns', 'rushingTd']);
              tileStats = [makeStatEntry(attFallback), makeStatEntry(y), makeStatEntry(t)].filter(Boolean);
              break;
            }
            case 'WR': {
              // Prefer 'receiving' category
              const rec = findStatInCategories(['receiv', 'rec', 'receiving'], ['receptions', 'rec', 'targets']);
              const recFallback = rec || findStatByNames(['receptions', 'rec', 'targets']);
              const y = findStatByNames(['receivingyards', 'receivingYards', 'netTotalYards']);
              const t = findStatByNames(['receivingtouchdowns', 'receivingTouchdowns', 'receivingTd']);
              tileStats = [makeStatEntry(recFallback), makeStatEntry(y), makeStatEntry(t)].filter(Boolean);
              break;
            }
            case 'PK': {
              const fg = findStatByNames(['fieldgoals', 'fieldGoals', 'fieldGoalsMade', 'fgmade']);
              const xp = findStatByNames(['extrapoints', 'extraPoints', 'extraPointsMade', 'pat']);
              const pts = findStatByNames(['points', 'pts']);
              tileStats = [makeStatEntry(fg), makeStatEntry(xp), makeStatEntry(pts)].filter(Boolean);
              break;
            }
            case 'P': {
              const punts = findStatByNames(['punts', 'punts']);
              const avg = findStatByNames(['puntingaverage', 'avg', 'average']);
              const lng = findStatByNames(['longestpunt', 'long', 'longest']);
              tileStats = [makeStatEntry(punts), makeStatEntry(avg), makeStatEntry(lng)].filter(Boolean);
              break;
            }
            case 'DB': {
              const tot = findStatByNames(['tackles', 'totaltackles', 'totalTackles']);
              const sack = findStatByNames(['sacks', 'sack']);
              const pd = findStatByNames(['passdeflections', 'passesdefended', 'pd', 'passdefense', 'passDeflections']);
              tileStats = [makeStatEntry(tot), makeStatEntry(sack), makeStatEntry(pd)].filter(Boolean);
              break;
            }
            case 'DL': {
              const tot = findStatByNames(['tackles', 'totaltackles', 'totalTackles']);
              const sack = findStatByNames(['sacks', 'sack']);
              const ff = findStatByNames(['fumblesforced', 'forcedfumbles', 'forcedFumbles']);
              tileStats = [makeStatEntry(tot), makeStatEntry(sack), makeStatEntry(ff)].filter(Boolean);
              break;
            }
            default: {
              // Fallback: first category's first 3 stats as before
              const firstCat = statsResp.splits.categories[0];
              if (Array.isArray(firstCat.stats) && firstCat.stats.length > 0) {
                tileStats = firstCat.stats.slice(0, 3).map(s => makeStatEntry(s)).filter(Boolean);
              }
            }
          }
        }

        return {
          season: sr.season,
          teams,
          stats: tileStats,
          raw: statsResp
        };
      });

      // Simple approach: just show recent seasons 2020-2025 regardless of team data
      // Let the UI handle missing data by showing "-" for missing stats
      const currentYear = new Date().getFullYear();
      const fixedSeasons = [];
      for (let year = currentYear; year >= 2020; year--) {
        fixedSeasons.push(String(year));
      }
      
      const simpleCareerItems = fixedSeasons.map(season => {
        // Find matching season data if it exists
        const matchingSeason = seasonResults.find(sr => sr.season === season);
        const statsResp = matchingSeason ? matchingSeason.data : null;
        
        // Try to get teams from eventlog or stats response, fallback to empty
        let teams = [];
        if (statsResp) {
          if (Array.isArray(statsResp.teams) && statsResp.teams.length > 0) {
            teams = statsResp.teams.map(t => {
              let id = null; let abbr = null; let name = null;
              if (typeof t === 'string') {
                const m = t.match(/teams\/(\d+)/);
                if (m) id = m[1];
              } else if (t && (t['$ref'] || t.href)) {
                const ref = t['$ref'] || t.href;
                const m = ref && ref.match(/teams\/(\d+)/);
                if (m) id = m[1];
                abbr = t.abbreviation || t.abbr || t.alias || null;
                name = t.displayName || t.name || null;
              } else if (t && typeof t === 'object') {
                id = t.id || null;
                abbr = t.abbreviation || t.abbr || t.alias || null;
                name = t.displayName || t.name || null;
              }
              return { id, abbreviation: abbr, displayName: name };
            }).filter(Boolean);
          } else if (statsResp.team) {
            const t = statsResp.team;
            let id = t && (t['$ref'] || t.href) ? (String(t['$ref'] || t.href).match(/teams\/(\d+)/) || [])[1] : (t && t.id ? t.id : null);
            const abbr = t && (t.abbreviation || t.abbr || t.alias) ? (t.abbreviation || t.abbr || t.alias) : null;
            const name = t && (t.displayName || t.name) ? (t.displayName || t.name) : null;
            teams = [{ id, abbreviation: abbr, displayName: name }];
          }
        }
        
        // Try eventlog teams for this season
        const evTeams = eventlogTeamsBySeason && eventlogTeamsBySeason[season];
        if ((!teams || teams.length === 0) && Array.isArray(evTeams) && evTeams.length > 0) {
          teams = evTeams.map(t => ({ id: t.id, abbreviation: t.abbreviation || convertTeamIdToAbbr(t.id), displayName: t.displayName || t.name }));
        }
        
        // Generate stats using getTileStatsForSeason if we have raw data
        let tileStats = [];
        if (statsResp) {
          const tempItem = { raw: statsResp };
          tileStats = getTileStatsForSeason(tempItem) || [];
        }
        
        return {
          season,
          teams,
          stats: tileStats,
          raw: statsResp
        };
      });
      
      console.log(`Career data simplified: showing seasons 2020-${currentYear}`, simpleCareerItems);
      setCareerData(simpleCareerItems);
    } catch (e) {
      console.warn('Error loading career data:', e?.message || e);
      setCareerData(null);
    } finally {
      setLoadingCareer(false);
    }
  };

  const fetchPlayerData = async () => {
    try {
      setLoading(true);
      setLoadingStats(true);
      setLoadingGameLog(true);

      const maybeAbbr = (typeof teamId === 'string' && /^[A-Za-z]{2,5}$/.test(teamId)) ? teamId : null;
      const basicPlayerData = {
        id: playerId,
        displayName: playerName,
        fullName: playerName,
        jersey: '',
        position: { displayName: 'Player' },
        team: { id: teamId, abbreviation: maybeAbbr, displayName: '' },
        headshot: { href: `https://a.espncdn.com/i/headshots/nfl/players/full/${playerId}.png` }
      };

      const seasonYear = new Date().getFullYear();
      const siteUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/athletes/${playerId}`;
      const splitsUrl = `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${playerId}/splits`;
      const statsUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${seasonYear}/types/2/athletes/${playerId}/statistics?lang=en&region=us`;
      const gamelogUrl = `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${playerId}/gamelog`;
      const coreUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${seasonYear}/athletes/${playerId}`;

      const [siteRes, splitsRes, glRes, coreRes, statsRes] = await Promise.allSettled([
        fetch(convertToHttps(siteUrl)),
        fetch(convertToHttps(splitsUrl)),
        fetch(convertToHttps(gamelogUrl)),
        fetch(convertToHttps(coreUrl)),
        fetch(convertToHttps(statsUrl))
      ]);

      let siteData = null;
      if (siteRes.status === 'fulfilled' && siteRes.value && siteRes.value.ok) {
        try { siteData = await siteRes.value.json(); } catch(e) { siteData = null; }
      }

      let splitsData = null;
      if (splitsRes.status === 'fulfilled' && splitsRes.value && splitsRes.value.ok) {
        try { splitsData = await splitsRes.value.json(); } catch(e) { splitsData = null; }
      }

      let gamelogData = null;
      if (glRes.status === 'fulfilled' && glRes.value && glRes.value.ok) {
        try { gamelogData = await glRes.value.json(); } catch(e) { gamelogData = null; }
      }

      let coreData = null;
      if (coreRes.status === 'fulfilled' && coreRes.value && coreRes.value.ok) {
        try { coreData = await coreRes.value.json(); } catch(e) { coreData = null; }
      }

      let statsData = null;
      if (statsRes && statsRes.status === 'fulfilled' && statsRes.value && statsRes.value.ok) {
        try { statsData = await statsRes.value.json(); } catch(e) { statsData = null; }
      }

      // Build player data preferring site API athlete info, then core API, then fallback
      if (siteData && siteData.athlete) {
        const athlete = siteData.athlete;
        const position = athlete.position || athlete.positions?.[0] || { displayName: 'N/A' };
        const team = athlete.team ? {
          id: athlete.team.id,
          abbreviation: athlete.team.abbreviation || athlete.team.abbr || athlete.team.alias || athlete.team.shortDisplayName || convertTeamIdToAbbr(athlete.team.id),
          displayName: athlete.team.displayName || athlete.team.name
        } : basicPlayerData.team;
        const enhanced = {
          ...basicPlayerData,
          ...athlete,
          displayName: athlete.displayName || playerName,
          fullName: athlete.fullName || playerName,
          position,
          team,
          jersey: athlete.jersey || athlete.uniformNumber || ''
        };
        setPlayerData(enhanced);
      } else if (coreData) {
        // coreData may contain minimal athlete info and teams refs
        const teamFromCore = coreData.team || null;
        let teamObj = basicPlayerData.team;
        if (teamFromCore && typeof teamFromCore === 'object') {
          // teamFromCore could be a $ref url - try to extract id
          const ref = teamFromCore['$ref'] || teamFromCore.href || null;
          if (ref) {
            const m = ref.match(/teams\/(\d+)/);
            if (m) {
              const id = m[1];
              teamObj = { id, abbreviation: convertTeamIdToAbbr(id) || undefined, displayName: convertTeamIdToFullName(id) || '' };
            }
          }
        } else if (coreData.teams && Array.isArray(coreData.teams) && coreData.teams.length > 0) {
          // teams array of $ref objects
          const first = coreData.teams[0];
          const ref = first['$ref'] || first.href || null;
          if (ref) {
            const m = ref.match(/teams\/(\d+)/);
            if (m) {
              const id = m[1];
              teamObj = { id, abbreviation: convertTeamIdToAbbr(id) || undefined, displayName: convertTeamIdToFullName(id) || '' };
            }
          }
        }
        const corePlayer = {
          ...basicPlayerData,
          displayName: coreData.displayName || playerName,
          fullName: coreData.fullName || playerName,
          position: coreData.position || basicPlayerData.position,
          team: teamObj,
          jersey: coreData.jersey || basicPlayerData.jersey
        };
        setPlayerData(corePlayer);
      } else {
        setPlayerData(basicPlayerData);
      }

      // Save splits data for "Splits" tab
      if (splitsData) {
        try {
          setPlayerSplits(splitsData);
        } catch (e) {
          console.warn('Error parsing splits data:', e?.message || e);
          setPlayerSplits(null);
        }
      } else {
        setPlayerSplits(null);
      }

      // Parse statistics endpoint into categories and take up to 6 important stats per category
      if (statsData && statsData.splits && Array.isArray(statsData.splits.categories)) {
        try {
          // Priority lists per category (based on c4.txt sample and common ESPN stat names).
          // Each array lists preferred stat.name keys in order of importance for that category.
          const preferredByCategory = {
            passing: [
              'completions', 'passingAttempts', 'netPassingYards', 'touchdowns', 'interceptions', 'completionPct'
            ],
            rushing: [
              'rushingAttempts', 'rushAttempts', 'rushYards', 'rushingYards', 'rushingTouchdowns', 'yardsPerCarry'
            ],
            receiving: [
              'receptions', 'targets', 'receivingYards', 'receivingTouchdowns', 'yardsPerReception', 'longReceiving'
            ],
            general: [
              'gamesPlayed', 'fumbles', 'fumblesLost', 'snapPercent', 'plays', 'penalties'
            ],
            defensive: [
              'totalTackles', 'sacks', 'stuffs', 'passesDefended', 'interceptions', 'forcedFumbles'
            ],
            scoring: [
              'points', 'touchdowns', 'twoPointConversions', 'fieldGoals', 'extraPoints', 'safeties'
            ],
            defint: [ 'interceptions', 'returnYards', 'returnTouchdowns', 'interceptionPct', 'longInterception' ],
            def: [ 'totalTackles', 'sacks', 'tacklesForLoss', 'passesDefended', 'interceptions', 'forcedFumbles' ],
            // fallback generic order
            default: []
          };

          const chooseStatsForCategory = (cat) => {
            const allStats = Array.isArray(cat.stats) ? cat.stats.slice() : [];
            const chosen = [];
            const usedNames = new Set();

            const prefList = preferredByCategory[cat.name] || preferredByCategory[cat.abbreviation] || preferredByCategory.default;

            // Helper to push a stat object into chosen array transformed to { label, value, rank }
            const pushStat = (s) => {
              const label = s.displayName || s.name || s.label || s.statName || '';
              const value = s.displayValue != null ? s.displayValue : (s.perGameDisplayValue != null ? s.perGameDisplayValue : (s.value != null ? s.value : '0'));
              const rank = s.rankDisplayValue || null;
              chosen.push({ label, value, rank });
            };

            // First, pick stats that match preferred names (in order)
            if (prefList && prefList.length > 0) {
              for (const pname of prefList) {
                if (chosen.length >= 6) break;
                const found = allStats.find(s => (s.name && s.name.toLowerCase() === pname.toLowerCase()) || (s.abbreviation && s.abbreviation.toLowerCase() === pname.toLowerCase()));
                if (found && !usedNames.has(found.name)) {
                  pushStat(found);
                  usedNames.add(found.name);
                }
              }
            }

            // If we still need more, take stats that include the keyword in their name/displayName
            if (chosen.length < 6) {
              for (const s of allStats) {
                if (chosen.length >= 6) break;
                if (!s || !s.name) continue;
                if (usedNames.has(s.name)) continue;
                // simple heuristic: pick stats containing category keywords or common stat words
                const lname = s.name.toLowerCase();
                if (lname.includes('yards') || lname.includes('att') || lname.includes('td') || lname.includes('comp') || lname.includes('rec') || lname.includes('int') || lname.includes('tackle') || lname.includes('sack') || lname.includes('points') || lname.includes('games')) {
                  pushStat(s);
                  usedNames.add(s.name);
                }
              }
            }

            // Finally, if still short, append the remaining stats in original order
            if (chosen.length < 6) {
              for (const s of allStats) {
                if (chosen.length >= 6) break;
                if (!s) continue;
                if (usedNames.has(s.name)) continue;
                pushStat(s);
                usedNames.add(s.name);
              }
            }

            return chosen.slice(0, 6);
          };

          const categories = statsData.splits.categories.map(cat => {
            const mappedStats = chooseStatsForCategory(cat);
            return { name: cat.name, displayName: cat.displayName || cat.shortDisplayName || cat.name, stats: mappedStats };
          });
          setPlayerStats({ raw: statsData, categories });
        } catch (e) {
          console.warn('Error parsing statistics data:', e.message);
          setPlayerStats(null);
        }
      } else {
        setPlayerStats(null);
      }

      // Parse gamelog
      if (gamelogData) {
        const eventsObj = gamelogData.events || {};
        const eventsArr = Object.keys(eventsObj).map(k => eventsObj[k]);
        // Sort by gameDate descending
        eventsArr.sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));
        setGameLogData(gamelogData);
        setGameLog(eventsArr);
      } else {
        setGameLogData(null);
        setGameLog([]);
      }

    } catch (error) {
      console.error('Error in fetchPlayerData (NFL):', error);
      setPlayerData({ id: playerId, displayName: playerName });
      setPlayerStats(null);
      setGameLog([]);
    } finally {
      setLoading(false);
      setLoadingStats(false);
      setLoadingGameLog(false);
    }
  };

  const renderPlayerHeader = () => {
    if (!playerData) return null;
    const teamColor = colors.primary;
  // derive a friendly team label with sensible fallbacks when displayName is missing
  const teamObj = playerData.team || {};
  const teamLabel = teamObj.displayName || teamObj.display_name || teamObj.name || teamObj.shortDisplayName || teamObj.alias || teamObj.abbreviation || convertTeamIdToFullName(teamObj.id) || (teamObj.id ? String(teamObj.id) : '');

    return (
      <View style={[styles.playerHeader, { backgroundColor: theme.surface }]}> 
        <Image
          source={getHeadshotSource(playerData)}
          style={styles.headshotLarge}
          onError={() => setHeadshotFailed(true)}
          resizeMode="cover"
        />
        <View style={styles.playerInfo}>
          <Text allowFontScaling={false} style={[styles.playerName, { color: theme.text }]}>{playerData.displayName || playerName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text allowFontScaling={false} style={[styles.playerDetails, { color: theme.textSecondary, marginRight: 8 }]}>#{playerData.jersey || ''}</Text>
            <Text allowFontScaling={false} style={[styles.playerDetails, { color: theme.textSecondary }]}>• {playerData.position?.displayName || 'N/A'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {playerData.team && (playerData.team.abbreviation || playerData.team.id) && (
              <View style={[styles.teamContainer, { marginRight: 8 }]}>
                <Image 
                  key={`nfl-player-team-logo-${playerData.team.id}`}
                  source={playerTeamLogoUrl ? { uri: playerTeamLogoUrl } : require('../../../assets/nfl.png')}
                  style={[styles.teamLogo, { width: 22, height: 22 }]}
                  defaultSource={playerTeamFallbackUrl}
                  onError={() => handleLogoError(playerData.team, isDarkMode)}
                />
              </View>
            )}
            {teamLabel ? (
              <Text allowFontScaling={false} style={[styles.teamName, { color: theme.textSecondary, fontWeight: 'bold' }]}>{teamLabel}</Text>
            ) : (
              <Text allowFontScaling={false} style={[styles.teamName, { color: theme.textSecondary, fontWeight: 'bold' }]}></Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderTabButtons = () => {
    const tabs = ['Stats', 'Game Log', 'Career', 'Splits'];
    return (
      <>
        {tabs.map((tab) => (
          <TouchableOpacity key={tab} style={[styles.tabButton, activeTab === tab && styles.activeTabButton, { borderBottomColor: activeTab === tab ? colors.primary : 'transparent' }]} onPress={() => setActiveTab(tab)}>
            <Text allowFontScaling={false} style={[styles.tabText, activeTab === tab && styles.activeTabText, { color: activeTab === tab ? colors.primary : theme.textSecondary }]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'Stats': return renderStatsContent();
      case 'Game Log': return renderGameLogContent();
      case 'Career': return renderCareerContent();
      case 'Splits': return renderSplitsContent();
      default: return renderStatsContent();
    }
  };

  const renderStatsContent = () => {
  if (loadingStats) return (<View style={[styles.statsLoadingContainer, { backgroundColor: theme.background }]}><ActivityIndicator size="large" color={colors.primary} /><Text allowFontScaling={false} style={[styles.loadingText, { color: theme.text }]}>Loading stats...</Text></View>);

    // New approach: playerStats.categories -> each category shows up to 6 stats
    if (!playerStats || !playerStats.categories) return (<View style={[styles.statsContainer, { backgroundColor: theme.background }]}><Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>No stats available</Text></View>);

    const renderStatBox = (stat, idx) => (
      <View key={`${stat.label}-${idx}`} style={[styles.statBoxSmall, { backgroundColor: theme.surface }]}> 
        <Text allowFontScaling={false} style={[styles.statBoxValueSmall, { color: theme.text }]}>{stat.value}</Text>
        <Text allowFontScaling={false} style={[styles.statBoxLabelSmall, { color: theme.textSecondary }]}>{stat.label}</Text>
        {stat.rank ? <Text allowFontScaling={false} style={[styles.statRank, { color: colors.secondary }]}>{stat.rank}</Text> : null}
      </View>
    );

    return (
      <ScrollView style={[styles.statsContainer, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
        <View style={styles.statsContent}>
          {playerStats.categories.map((cat, cidx) => (
            <View key={`cat-${cidx}`} style={styles.statsCategory}>
              <Text allowFontScaling={false} style={[styles.statsCategoryTitle, { color: colors.primary }]}>{cat.displayName}</Text>
              <View style={styles.statsGridRows}>
                {cat.stats.map((s, idx) => renderStatBox(s, idx))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  // Render Splits tab content: list all split categories from playerSplits
  const openSplitCategory = (cat) => {
    setSelectedSplitCategory(cat);
    setSelectedSplitDetail(null); // Reset split detail when selecting new category
  };

  const openSplitDetail = (detail) => {
    setSelectedSplitDetail(detail);
  };

  const renderSplitsContent = () => {
    if (!playerSplits || !Array.isArray(playerSplits.splitCategories)) {
      return (
        <View style={[styles.statsContainer, { backgroundColor: theme.background }]}>
          <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>No splits available</Text>
        </View>
      );
    }

    // If no category selected, show list of categories
    if (!selectedSplitCategory) {
      return (
        <ScrollView style={[styles.statsContainer, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
          <View style={styles.statsContent}>
            {playerSplits.splitCategories
              .filter(cat => cat.splits && cat.splits.length > 0) // Only show categories with items
              .map((cat, idx) => {
                const displayName = cat.displayName || cat.name || '';
                const capitalizedName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
                
                return (
                  <TouchableOpacity key={`split-${idx}`} style={[styles.careerTile, { backgroundColor: theme.surface }]} onPress={() => openSplitCategory(cat)}>
                    <View style={styles.careerTileHeader}>
                      <Text allowFontScaling={false} style={[styles.careerSeasonLabel, { color: theme.text }]}>{capitalizedName}</Text>
                      <Text allowFontScaling={false} style={[styles.careerTeamsText, { color: theme.textSecondary }]}>{cat.splits.length} items</Text>
                    </View>
                    {cat.description ? <Text allowFontScaling={false} style={[styles.careerTeamsText, { color: theme.textSecondary }]}>{cat.description}</Text> : null}
                  </TouchableOpacity>
                );
              })}
          </View>
        </ScrollView>
      );
    }

    // If category selected but no detail, show splits within category
    if (selectedSplitCategory && !selectedSplitDetail) {
      const cat = selectedSplitCategory;
      const items = Array.isArray(cat.splits) ? cat.splits : [];

      return (
        <ScrollView style={[styles.statsContainer, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
          <View style={styles.statsContent}>
            {/* Header with back button */}
            <View style={[styles.careerTile, { backgroundColor: theme.surface, marginBottom: 15 }]}>
              <View style={styles.careerTileHeader}>
                <TouchableOpacity onPress={() => setSelectedSplitCategory(null)} style={[styles.changeTeamButton, { backgroundColor: colors.primary }]}>
                  <Text allowFontScaling={false} style={[styles.changeTeamText, { color: 'white' }]}>← Back</Text>
                </TouchableOpacity>
                <Text allowFontScaling={false} style={[styles.careerSeasonLabel, { color: theme.text }]}>{formatDisplayName(cat.displayName || cat.name)}</Text>
              </View>
            </View>

            {cat.name === 'byOpponent' ? (
              // Show team logos grid for byOpponent - styled like MLB team cards
              <View style={styles.teamGrid}>
                {items.map((it, idx) => {
                  const label = it.displayName || it.abbreviation || '';
                  const teamAbbr = label.replace('vs ', '').trim();
                  return (
                    <TouchableOpacity key={`opp-${idx}`} style={[styles.teamCard, { backgroundColor: theme.surface }]} onPress={() => openSplitDetail(it)}>
                      <Image 
                        key={`nfl-splits-team-logo-${teamAbbr}`}
                        source={getStableTeamLogoUrl({ abbreviation: teamAbbr }) ? { uri: getStableTeamLogoUrl({ abbreviation: teamAbbr }) } : require('../../../assets/nfl.png')} 
                        style={styles.teamCardLogo} 
                        defaultSource={getStableTeamFallbackUrl({ abbreviation: teamAbbr })} 
                      />
                      <Text allowFontScaling={false} style={[styles.teamCardName, { color: theme.text }]}>{teamAbbr}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              // List of split rows for other categories
              items.map((it, idx) => (
                <TouchableOpacity key={`splititem-${idx}`} style={[styles.careerTile, { backgroundColor: theme.surface }]} onPress={() => openSplitDetail(it)}>
                  <View style={styles.careerTileHeader}>
                    <Text allowFontScaling={false} style={[styles.careerSeasonLabel, { color: theme.text }]}>{it.displayName || it.abbreviation || `Split ${idx+1}`}</Text>
                    <Text allowFontScaling={false} style={[styles.careerTeamsText, { color: theme.textSecondary }]}>{Array.isArray(it.stats) ? `${it.stats.length} stats` : ''}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      );
    }

    // If split detail selected, show the stats
    if (selectedSplitDetail) {
      const detail = selectedSplitDetail;
      const stats = Array.isArray(detail.stats) ? detail.stats : [];
      const labels = Array.isArray(playerSplits.labels) ? playerSplits.labels : [];

      return (
        <ScrollView style={[styles.statsContainer, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
          <View style={styles.statsContent}>
            {/* Header with back button */}
            <View style={[styles.careerTile, { backgroundColor: theme.surface, marginBottom: 15 }]}>
              <View style={styles.careerTileHeader}>
                <TouchableOpacity onPress={() => setSelectedSplitDetail(null)} style={[styles.changeTeamButton, { backgroundColor: colors.primary }]}>
                  <Text allowFontScaling={false} style={[styles.changeTeamText, { color: 'white' }]}>← Back</Text>
                </TouchableOpacity>
                <Text allowFontScaling={false} style={[styles.careerSeasonLabel, { color: theme.text }]}>{detail.displayName || detail.abbreviation || 'Split Detail'}</Text>
              </View>
            </View>

            {stats.length === 0 ? (
              <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>No stats available for this split.</Text>
            ) : (
              <View style={styles.statsGridRows}>
                {stats.map((statValue, idx) => (
                  <View key={`dstat-${idx}`} style={[styles.statBoxSmall, { backgroundColor: theme.surface }]}>
                    <Text allowFontScaling={false} style={[styles.statBoxValueSmall, { color: theme.text }]}>{statValue}</Text>
                    <Text allowFontScaling={false} style={[styles.statBoxLabelSmall, { color: theme.textSecondary }]}>{labels[idx] || `Stat ${idx + 1}`}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      );
    }

    return null;
  };

  const renderGameLogContent = () => {
    if (loadingGameLog) {
      return (
        <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.textSecondary }]}>Loading game log...</Text>
        </View>
      );
    }

    return (
      <ScrollView style={[styles.statsContainer, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
        <View style={styles.statsContent}>
          {gameLog.length === 0 ? (
            <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>
              No recent games available
            </Text>
          ) : (
            gameLog.map((game, index) => (
              <TouchableOpacity
                key={game.id || index}
                style={[styles.mlbGameCard, { backgroundColor: theme.surface }]}
                onPress={() => openGameModal(game)}
              >
                {/* Date Header */}
                <View style={[styles.mlbGameHeader, {backgroundColor: theme.surfaceSecondary}]}>
                  <Text allowFontScaling={false} style={[styles.mlbGameDate, { color: theme.text }]}>
                    {new Date(game.gameDate).toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                  </Text>
                </View>

                {/* Player Info Row */}
                <View style={styles.mlbPlayerRow}>
                  {/* Player Headshot */}
                  <Image
                    source={getHeadshotSource(playerData)}
                    style={[styles.headshotSmall, { width: 40, height: 40, borderRadius: 20 }]}
                    onError={() => setHeadshotFailed(true)}
                    resizeMode="cover"
                  />

                  {/* Player Name and Stats */}
                  <View style={styles.mlbPlayerInfo}>
                    <Text allowFontScaling={false} style={[styles.mlbPlayerName, { color: theme.text }]}>
                      {playerData?.displayName || playerData?.fullName || 'Player'}
                    </Text>
                    <Text allowFontScaling={false} style={[styles.mlbPlayerStats, { color: theme.textSecondary }]}>
                      {getGameCardStatsString(game)}
                    </Text>
                  </View>

                  {/* Win Indicator */}
                  <View style={[styles.mlbWinIndicator, { 
                    backgroundColor: game.gameResult === 'W' ? colors.success || '#28a745' : 
                                    game.gameResult === 'L' ? colors.error || '#dc3545' :
                                    colors.primary
                  }]}>
                    <Text allowFontScaling={false} style={[styles.mlbWinText, { color: 'white' }]}>
                      {game.gameResult || 'N/A'}
                    </Text>
                  </View>
                </View>

                {/* Match Info Row */}
                <View style={[styles.mlbMatchRow, { borderTopColor: theme.surfaceSecondary }]}>
                  <View style={styles.mlbTeamLogos}>
                    <Image 
                      key={`nfl-game-player-team-${game.id}-${(playerData?.team?.id || game.team?.id)}`}
                      source={getStableTeamLogoUrl(playerData?.team || game.team) ? 
                        { uri: getStableTeamLogoUrl(playerData?.team || game.team) } : 
                        require('../../../assets/nfl.png')}
                      style={styles.mlbTeamLogo}
                      defaultSource={getStableTeamFallbackUrl(playerData?.team || game.team)}
                      onError={() => handleLogoError(playerData?.team || game.team, isDarkMode)}
                    />
                    <Text allowFontScaling={false} style={[styles.mlbVersus, { color: theme.textSecondary }]}>
                      {game.atVs === '@' ? '@' : 'vs'}
                    </Text>
                    <Image 
                      key={`nfl-game-opponent-${game.id}-${game.opponent?.id}`}
                      source={getStableTeamLogoUrl(game.opponent) ? 
                        { uri: getStableTeamLogoUrl(game.opponent) } : 
                        require('../../../assets/nfl.png')}
                      style={styles.mlbTeamLogo}
                      defaultSource={getStableTeamFallbackUrl(game.opponent)}
                      onError={() => handleLogoError(game.opponent, isDarkMode)}
                    />
                  </View>
                  <Text allowFontScaling={false} style={[styles.mlbOpponentName, { color: theme.text }]}>
                    {game.leagueName || game.leagueShortName || 'NFL'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    );
  };

  const openGameModal = async (game) => {
    try {
      setSelectedGameStats(game);
      setShowStatsModal(true);
      setLoadingSelectedGameStats(true);
      setSelectedGameStatsDetails(null);
      // game.id should be the ESPN gameId; fetch player boxscore stats
      if (game && game.id) {
        try {
          const stats = await NFLService.getPlayerGameStats(game.id, playerId);
          setSelectedGameStatsDetails(stats);
        } catch (e) {
          console.warn('Unable to fetch game stats for player:', e?.message || e);
          setSelectedGameStatsDetails(null);
        }
      }
    } finally {
      setLoadingSelectedGameStats(false);
    }
  };

  const renderGameStatsModal = () => {
    if (!selectedGameStats) return null;

    const g = selectedGameStats;
    const details = selectedGameStatsDetails;

    return (
      <Modal
        animationType="slide"
        presentationStyle="pageSheet"
        visible={showStatsModal}
        onRequestClose={() => setShowStatsModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: theme.surface }]}>
            <TouchableOpacity 
              onPress={() => setShowStatsModal(false)}
              style={styles.modalCloseButton}
            >
              <Text allowFontScaling={false} style={[styles.modalCloseText, { color: colors.primary }]}>Close</Text>
            </TouchableOpacity>
            <Text allowFontScaling={false} style={[styles.modalTitle, { color: theme.text }]}>
              Game Statistics
            </Text>
            <View style={styles.modalPlaceholder} />
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {/* Player Header */}
            <View style={[styles.playerHeaderLog, { backgroundColor: theme.surface, marginBottom: 15 }]}>
              <Image
                source={getHeadshotSource(playerData)}
                style={[styles.headshotSmall, { width: 40, height: 40, borderRadius: 20, marginRight: 12 }]}
                onError={() => setHeadshotFailed(true)}
                resizeMode="cover"
              />
              <View style={styles.playerInfo}>
                <Text allowFontScaling={false} style={[styles.playerName, { color: theme.text }]}>
                  {playerData?.displayName || playerName}
                </Text>
                <View style={styles.playerDetailsRow}>
                  {playerData?.team && playerData.team.id && (
                    <View style={styles.teamContainer}>
                      <Image 
                        key={`nfl-modal-player-team-logo-${playerData.team.id}`}
                        source={playerTeamLogoUrl ? 
                          { uri: playerTeamLogoUrl } : 
                          require('../../../assets/nfl.png')}
                        style={styles.teamLogo}
                        defaultSource={playerTeamFallbackUrl}
                        onError={() => handleLogoError(playerData.team.id, isDarkMode)}
                      />
                      <Text allowFontScaling={false} style={[styles.teamName, { color: theme.textSecondary, fontWeight: 'bold' }]}>
                        {playerData.team.displayName || playerData.team.name || ''}
                      </Text>
                    </View>
                  )}
                  <Text allowFontScaling={false} style={[styles.playerDetails, { color: theme.textSecondary }]}>
                  • {playerData?.position?.displayName || 'N/A'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Game Header - Date and League Only */}
            <View style={[styles.modalSeasonHeader, { backgroundColor: theme.surface }]}>
              <View style={styles.modalSeasonTopRow}>
                <View style={[styles.modalSeasonInfo, { alignItems: 'center', flex: 1 }]}>
                  <Text allowFontScaling={false} style={[styles.modalSeasonYear, { color: theme.text }]}>
                    {new Date(g.gameDate).toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      month: 'long', 
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.modalLeagueName, { color: theme.textSecondary }]}>
                    {g.leagueName || g.leagueShortName || 'NFL'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Game Statistics */}
            <View style={styles.modalStatsSection}>
              <Text allowFontScaling={false} style={[styles.modalSectionTitle, { color: colors.primary, marginBottom: 20 }]}>Game Statistics</Text>
              
              {loadingSelectedGameStats ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.textSecondary }]}>Loading game stats...</Text>
                </View>
              ) : (
                details && details.splits && Array.isArray(details.splits.categories) ? (
                  details.splits.categories.map((cat, idx) => (
                    <View key={`catmodal-${idx}`}>
                      <Text allowFontScaling={false} style={[styles.modalCategoryTitle, { color: theme.text }]}>
                        {formatDisplayName(cat.displayName || cat.name)}
                      </Text>
                      <View style={styles.modalStatsGrid}>
                        {Array.isArray(cat.stats) && cat.stats.length > 0 ? (() => {
                          const isSingle = cat.stats.length === 1;
                          return cat.stats.map((s, i) => (
                            <View key={`${s.displayName || s.name}-${i}`} style={[styles.modalStatCard, isSingle && styles.modalStatCardFull, { backgroundColor: theme.surface }]}> 
                              <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>
                                {typeof s.displayValue !== 'undefined' && s.displayValue !== null ? s.displayValue : (typeof s.display !== 'undefined' && s.display !== null ? s.display : (typeof s.value !== 'undefined' && s.value !== null ? s.value : '0'))}
                              </Text>
                              <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>
                                {formatDisplayName(s.displayName || s.name)}
                              </Text>
                            </View>
                          ));
                        })() : (
                          <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>No stats available for this category</Text>
                        )}
                      </View>
                    </View>
                  ))
                ) : (
                  <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary, marginTop: 12 }]}>No player game statistics available</Text>
                )
              )}
            </View>

            {/* Team Matchup - Moved to bottom (clickable to open GameDetails) */}
            <TouchableOpacity onPress={() => {
              // Close the modal first so it doesn't remain visible after navigation
              setShowStatsModal(false);
              // Slight delay to allow modal closing animation to start, then navigate
              setTimeout(() => navigation.navigate('GameDetails', { gameId: g.id || g.eventId || g.gameId, sport: 'nfl' }), 150);
            }}>
              <View style={[styles.modalSeasonHeader, { backgroundColor: theme.surface, marginTop: -5 }]}>
                <View style={[styles.modalSeasonTopRow, { justifyContent: 'center' }]}>
                  <View style={styles.modalTeamContainer}>
                    <View style={styles.mlbTeamLogos}>
                      <Image 
                        key={`nfl-modal-game-player-team-${g.id}-${(playerData?.team?.id || g.team?.id)}`}
                        source={getStableTeamLogoUrl(playerData?.team || g.team) ? 
                          { uri: getStableTeamLogoUrl(playerData?.team || g.team) } : 
                          require('../../../assets/nfl.png')}
                        style={styles.modalSeasonTeamLogo}
                        defaultSource={getStableTeamFallbackUrl(playerData?.team || g.team)}
                        onError={() => handleLogoError(playerData?.team || g.team, isDarkMode)}
                      />
                      <Text allowFontScaling={false} style={[styles.mlbVersus, { color: theme.textSecondary, fontSize: 16, marginHorizontal: 12 }]}>
                        {g.atVs === '@' ? '@' : 'vs'}
                      </Text>
                      <Image 
                        key={`nfl-modal-game-opponent-${g.id}-${g.opponent?.id}`}
                        source={getStableTeamLogoUrl(g.opponent) ? 
                          { uri: getStableTeamLogoUrl(g.opponent) } : 
                          require('../../../assets/nfl.png')}
                        style={styles.modalSeasonTeamLogo}
                        defaultSource={getStableTeamFallbackUrl(g.opponent)}
                        onError={() => handleLogoError(g.opponent, isDarkMode)}
                      />
                    </View>
                    <Text allowFontScaling={false} style={[styles.modalTeamName, { color: theme.text, marginTop: 8 }]}>
                      {playerData?.team?.displayName || 'Team'} {g.atVs === '@' ? '@' : 'vs'} {g.opponent?.displayName || g.opponent?.abbreviation || 'Opponent'}
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    );
  };

  const renderCareerContent = () => {
    if (loadingCareer) return (<View style={[styles.loadingContainer, { backgroundColor: theme.background }]}><ActivityIndicator size="large" color={colors.primary} /><Text allowFontScaling={false} style={[styles.loadingText, { color: theme.textSecondary }]}>Loading career statistics...</Text></View>);
    if (!careerData) return (<View style={[styles.contentContainer, { backgroundColor: theme.background }]}><Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>No career data available</Text></View>);
    return (
      <ScrollView style={[styles.statsContainer, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
        <View style={styles.careerContainer}>
          <Text allowFontScaling={false} style={[styles.careerSectionTitle, { color: colors.primary }]}>NFL Career</Text>

          {/* removed debug Year|Teams listing */}

          {careerData.map((item, idx) => {
            // Prefer eventlog-derived teams for this season if available
            let teams = [];
            const evTeams = eventlogTeamsBySeason && eventlogTeamsBySeason[item.season];
            if (Array.isArray(evTeams) && evTeams.length > 0) {
              // evTeams may be simple objects with id and optional abbreviation/displayName
              teams = evTeams.map(t => ({ id: t.id, abbreviation: t.abbreviation || (t.id ? convertTeamIdToAbbr(t.id) : null), displayName: t.displayName || t.name || null }));
            } else {
              teams = Array.isArray(item.teams) ? item.teams.filter(Boolean).map(t => ({ id: t.id || t, abbreviation: t.abbreviation || t.abbr || (t.id ? convertTeamIdToAbbr(t.id) : null), displayName: t.displayName || t.name || null })) : [];
            }
            // If there are no teams for this season, skip rendering the card
            if (!teams || teams.length === 0) return null;
            const lastFirst = teams.slice().reverse();
            // For display: if single team, show full name; if multiple teams, show abbreviations
            const displayLabel = (lastFirst.length === 1)
              ? (lastFirst[0].displayName || convertTeamIdToFullName(lastFirst[0].id) || lastFirst[0].abbreviation || convertTeamIdToAbbr(lastFirst[0].id) || '')
              : lastFirst.map(t => t.abbreviation || convertTeamIdToAbbr(t.id) || '').filter(Boolean).join(' / ');
            const logos = lastFirst.map(t => t.abbreviation || t.id).slice(0, 3);
            return (
              <TouchableOpacity key={`career-${item.season}-${idx}`} style={[styles.careerTile, { backgroundColor: theme.surface }]} onPress={() => { setSelectedSeasonStats(item); setShowSeasonModal(true); }}>
                <View style={styles.careerTileHeader}>
                  <View style={styles.careerLogosRow}>
                    {logos.map((l, li) => (
                      <Image key={`nfl-career-logo-${item.season}-${li}-${l}`} source={getStableTeamLogoUrl(l) ? { uri: getStableTeamLogoUrl(l) } : require('../../../assets/nfl.png')} style={styles.careerLogo} defaultSource={getStableTeamFallbackUrl(l)} onError={() => handleLogoError(l, isDarkMode)} />
                    ))}
                  </View>
                  <Text allowFontScaling={false} style={[styles.careerTeamsText, { color: theme.textSecondary }]}>{displayLabel}</Text>
                  <Text allowFontScaling={false} style={[styles.careerSeasonLabel, { color: theme.text }]}>{item.season}</Text>
                </View>
                <View style={styles.careerTileBody}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                    {/* MLB-style three columns: value (big) above label (small) */}
                    {(() => {
                      const computed = getTileStatsForSeason(item);
                      const sourceStats = (Array.isArray(computed) && computed.length > 0) ? computed : (item.stats || []);
                      return Array.from({ length: 3 }).map((_, i) => {
                        const s = sourceStats && sourceStats[i] ? sourceStats[i] : null;
                      return (
                        <View key={`statcol-${i}`} style={{ flex: 1, alignItems: 'center' }}>
                          <Text allowFontScaling={false} style={[styles.careerStatValue, { color: theme.text }]}>{s ? s.value : '-'}</Text>
                          <Text allowFontScaling={false} style={[styles.careerStatLabel, { color: theme.textSecondary }]}>{s ? s.label : ''}</Text>
                          {s && s.rank ? <Text allowFontScaling={false} style={[styles.statRank, { color: colors.secondary }]}>{s.rank}</Text> : null}
                        </View>
                      );
                      });
                    })()}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    );
  };

  const renderSeasonModal = () => {
    if (!selectedSeasonStats) return null;
    const item = selectedSeasonStats;
    const details = item.raw;
    return (
      <Modal animationType="slide" presentationStyle="pageSheet" visible={showSeasonModal} onRequestClose={() => setShowSeasonModal(false)}>
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: theme.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
            <TouchableOpacity onPress={() => setShowSeasonModal(false)} style={styles.modalCloseButton}><Text allowFontScaling={false} style={[styles.modalCloseText, { color: colors.primary }]}>Close</Text></TouchableOpacity>
            <Text allowFontScaling={false} style={[styles.modalTitle, { color: theme.text }]}>{item.season} Season</Text>
            <View style={styles.modalPlaceholder} />
          </View>

          {/* MLB-style team section below header */}
          {(() => {
            const ev = eventlogTeamsBySeason && eventlogTeamsBySeason[item.season];
            let teams = [];
            if (Array.isArray(ev) && ev.length > 0) teams = ev;
            else if (Array.isArray(item.teams) && item.teams.length > 0) teams = item.teams;
            if (!teams || teams.length === 0) return null;
            
            return (
              <View style={[styles.modalSeasonHeader, { backgroundColor: theme.surface, marginHorizontal: 15, marginTop: 10 }]}>
                <View style={styles.modalSeasonInfo}>
                  <Text allowFontScaling={false} style={[styles.modalSeasonYear, { color: theme.text }]}>{item.season}</Text>
                  <Text allowFontScaling={false} style={[styles.modalLeagueName, { color: theme.textSecondary }]}>NFL</Text>
                </View>
                <View style={styles.modalTeamContainer}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                    {teams.map((teamObj, index) => {
                      const token = teamObj.abbreviation || teamObj.id || convertTeamIdToAbbr(teamObj.id);
                      return (
                        <Image 
                          key={`nfl-modal-season-team-logo-${selectedSeasonStats?.season}-${index}-${token}`}
                          source={getStableTeamLogoUrl(token) ? { uri: getStableTeamLogoUrl(token) } : require('../../../assets/nfl.png')} 
                          style={[styles.modalSeasonTeamLogo, { width: 40, height: 40, marginHorizontal: 4 }]} 
                          defaultSource={getStableTeamFallbackUrl(token)} 
                          onError={() => handleLogoError(token, isDarkMode)} 
                        />
                      );
                    })}
                  </View>
                  <Text allowFontScaling={false} style={[styles.modalTeamName, { color: theme.text, textAlign: 'center' }]}>
                    {teams.length === 1 
                      ? (teams[0].displayName || convertTeamIdToFullName(teams[0].id) || (teams[0].abbreviation || teams[0].id))
                      : teams.map(t => t.abbreviation || convertTeamIdToAbbr(t.id) || t.id).join(' / ')
                    }
                  </Text>
                </View>
              </View>
            );
          })()}

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={{ padding: 8 }}>
              <Text allowFontScaling={false} style={[styles.modalSectionTitle, { color: colors.primary }]}>{item.season} Statistics</Text>
              {details && details.splits && Array.isArray(details.splits.categories) ? details.splits.categories.map((cat, cidx) => (
                <View key={`season-cat-${cidx}`} style={{ marginBottom: 14 }}>
                  <Text allowFontScaling={false} style={[styles.modalCategoryTitle, { color: theme.text }]}>{formatDisplayName(cat.displayName || cat.name)}</Text>
                  <View style={styles.modalStatsGrid}>
                    {Array.isArray(cat.stats) && cat.stats.length > 0 ? cat.stats.map((s, si) => (
                      <View key={`${s.displayName || s.name}-${si}`} style={[styles.modalStatCard, { backgroundColor: theme.surface }]}>
                        <Text allowFontScaling={false} style={[styles.modalStatCardValue, { color: theme.text }]}>{s.displayValue != null ? s.displayValue : (s.value != null ? s.value : '0')}</Text>
                        <Text allowFontScaling={false} style={[styles.modalStatCardLabel, { color: theme.textSecondary }]}>{formatDisplayName(s.displayName || s.name)}</Text>
                        {s.rankDisplayValue ? <Text allowFontScaling={false} style={[styles.statRank, { color: colors.secondary }]}>{s.rankDisplayValue}</Text> : null}
                      </View>
                    )) : <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>No stats</Text>}
                  </View>
                </View>
              )) : <Text allowFontScaling={false} style={[styles.contentText, { color: theme.textSecondary }]}>No season statistics available</Text>}
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  };

  if (loading) return (<View style={[styles.loadingContainer, { backgroundColor: theme.background }]}><ActivityIndicator size="large" color={colors.primary} /><Text allowFontScaling={false} style={[styles.loadingText, { color: theme.text }]}>Loading player...</Text></View>);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      {renderPlayerHeader()}
      <View style={[styles.fixedTabContainer, { backgroundColor: theme.surface }]}>{renderTabButtons()}</View>
      <ScrollView style={[styles.contentScrollView, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>{renderContent()}</ScrollView>
      {renderGameStatsModal()}
      {renderSeasonModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16 },
  playerHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3.84, elevation: 5 },
  playerHeaderLog: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 10 },
  playerInfo: { flex: 1, marginLeft: 10 },
  playerDetailsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  playerName: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  playerDetails: { fontSize: 16, marginBottom: 0, marginLeft: 5 },
  teamContainer: { flexDirection: 'row', alignItems: 'center', marginLeft: -2 },
  teamLogo: { width: 20, height: 20, marginRight: 6 },
  teamName: { fontSize: 16, fontWeight: '500' },
  headshotLarge: { width: 72, height: 72, borderRadius: 36, marginRight: 12 },
  headshotSmall: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  fixedTabContainer: { flexDirection: 'row', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3.84, elevation: 5, zIndex: 1000 },
  contentScrollView: { flex: 1 },
  tabButton: { flex: 1, paddingVertical: 15, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  activeTabButton: { borderBottomWidth: 3 },
  tabText: { fontSize: 16, fontWeight: '500' },
  activeTabText: { fontWeight: 'bold' },
  statsContainer: { flex: 1 },
  statsContent: { padding: 15 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gameLogRow: { padding: 12, borderRadius: 8, marginBottom: 10 },
  gameLogOpponent: { fontSize: 16, fontWeight: '600' },
  gameLogDate: { fontSize: 12 },
  gameLogScore: { fontSize: 16, fontWeight: '700' },
  gameLogRecord: { fontSize: 12 },
  contentText: { fontSize: 16, textAlign: 'center', fontStyle: 'italic' },
  statsLoadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  statsSection: { marginBottom: 25 },
  statsSectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  // Small stat boxes layout: 3 columns using space-between so items align without trailing gap
  statsGridRows: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statBoxSmall: { width: '32%', marginBottom: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 8, padding: 12, minHeight: 80, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 3.84, elevation: 3 },
  statBoxValueSmall: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  statBoxLabelSmall: { fontSize: 12, textAlign: 'center', fontWeight: '600' },
  statRank: { fontSize: 11, marginTop: 6, fontStyle: 'italic' },
  statsCategory: { marginBottom: 18 },
  statsCategoryTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  jerseyCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  jerseyNumber: { fontSize: 16, fontWeight: 'bold' },
  careerContainer: { padding: 15 },
  careerSectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
  // England-style Game Log Styles
  mlbGameCard: {
    marginBottom: 12,
    borderRadius: 8,
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
  mlbGameHeader: {
    backgroundColor: '#f8f9fa',
    paddingVertical: 8,
    paddingHorizontal: 15,
    alignItems: 'center',
  },
  mlbGameDate: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  mlbPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
  },
  mlbPlayerInfo: {
    flex: 1,
  },
  mlbPlayerName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  mlbPlayerStats: {
    fontSize: 12,
    fontWeight: '500',
  },
  mlbWinIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mlbWinText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  mlbMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  mlbTeamLogos: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mlbTeamLogo: {
    width: 24,
    height: 24,
  },
  mlbVersus: {
    fontSize: 12,
    fontWeight: 'bold',
    marginHorizontal: 8,
  },
  mlbOpponentName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    padding: 8,
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  modalPlaceholder: {
    width: 60,
  },
  modalSeasonHeader: {
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
  },
  modalSeasonTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalSeasonInfo: {
    alignItems: 'flex-start',
  },
  modalSeasonYear: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  modalLeagueName: {
    fontSize: 14,
  },
  modalTeamContainer: {
    alignItems: 'center',
  },
  modalSeasonTeamLogo: {
    width: 50,
    height: 50,
  },
  modalTeamName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalStatsSection: {
    marginBottom: 24,
  },
  modalSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalCategoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    marginTop: 8,
  },
  modalStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginBottom: 16,
  },
  modalStatCard: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    padding: 12,
  width: '30%',
  minHeight: 70,
  margin: 6,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalStatCardValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  modalStatCardLabel: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  modalStatCardFull: {
    width: '100%',
    marginHorizontal: 0,
  },
  careerTile: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3.84,
    elevation: 3,
  },
  careerTileHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  careerLogosRow: { flexDirection: 'row', alignItems: 'center' },
  careerLogo: { width: 36, height: 36, marginRight: 6 },
  careerSeasonLabel: { fontSize: 16, fontWeight: '700' },
  careerTileBody: { marginTop: 6 },
  careerTeamsText: { fontSize: 14, marginBottom: 8 },
  careerStatsRow: { flexDirection: 'row', justifyContent: 'flex-start', flexWrap: 'wrap' },
  careerStatBox: { padding: 8, borderRadius: 8, marginRight: 8, marginBottom: 8, minWidth: 90, alignItems: 'center' },
  careerStatValue: { fontSize: 16, fontWeight: '700' },
  careerStatLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  changeTeamButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeTeamText: {
    fontSize: 14,
    fontWeight: '600',
  },
  teamGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  teamCard: {
    width: '48%',
    padding: 15,
    marginBottom: 10,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  teamCardLogo: {
    width: 40,
    height: 40,
    marginBottom: 8,
  },
  teamCardName: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});

export default NFLPlayerPageScreen;

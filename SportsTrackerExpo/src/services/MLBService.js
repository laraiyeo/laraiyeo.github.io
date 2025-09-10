// MLB API Service for Mobile App
// Adapted from MLB scoreboard.js and live.js

export class MLBService {
  static BASE_URL = "https://statsapi.mlb.com";
  static SCHEDULE_URL = `${this.BASE_URL}/api/v1/schedule/games/?sportId=1`;
  
  // Cache for API responses
  static cache = new Map();
  static cacheTimestamps = new Map();
  static CACHE_DURATION = 2000; // 2 seconds cache duration for better responsiveness during live games

  // Team abbreviation mapping for ESPN logos
  static teamAbbrMap = {
    "Arizona Diamondbacks": "ari", "Atlanta Braves": "atl", "Baltimore Orioles": "bal", "Boston Red Sox": "bos",
    "Chicago White Sox": "cws", "Chicago Cubs": "chc", "Cincinnati Reds": "cin", "Cleveland Guardians": "cle",
    "Colorado Rockies": "col", "Detroit Tigers": "det", "Houston Astros": "hou", "Kansas City Royals": "kc",
    "Los Angeles Angels": "laa", "Los Angeles Dodgers": "lad", "Miami Marlins": "mia", "Milwaukee Brewers": "mil",
    "Minnesota Twins": "min", "New York Yankees": "nyy", "New York Mets": "nym", "Athletics": "oak",
    "Philadelphia Phillies": "phi", "Pittsburgh Pirates": "pit", "San Diego Padres": "sd", "San Francisco Giants": "sf",
    "Seattle Mariners": "sea", "St. Louis Cardinals": "stl", "Tampa Bay Rays": "tb", "Texas Rangers": "tex",
    "Toronto Blue Jays": "tor", "Washington Nationals": "wsh"
  };

  // Team colors mapping
  static teamColors = {
    "Arizona Diamondbacks": "#A71930", "Atlanta Braves": "#CE1141", "Baltimore Orioles": "#DF4601", "Boston Red Sox": "#BD3039",
    "Chicago White Sox": "#27251F", "Chicago Cubs": "#0E3386", "Cincinnati Reds": "#C6011F", "Cleveland Guardians": "#E50022",
    "Colorado Rockies": "#333366", "Detroit Tigers": "#0C2340", "Houston Astros": "#002D62", "Kansas City Royals": "#004687",
    "Los Angeles Angels": "#BA0021", "Los Angeles Dodgers": "#005A9C", "Miami Marlins": "#00A3E0", "Milwaukee Brewers": "#FFC52F",
    "Minnesota Twins": "#002B5C", "New York Yankees": "#003087", "New York Mets": "#FF5910", "Athletics": "#EFB21E",
    "Philadelphia Phillies": "#E81828", "Pittsburgh Pirates": "#FDB827", "San Diego Padres": "#2F241D", "San Francisco Giants": "#FD5A1E",
    "Seattle Mariners": "#005C5C", "St. Louis Cardinals": "#C41E3A", "Tampa Bay Rays": "#092C5C", "Texas Rangers": "#003278",
    "Toronto Blue Jays": "#134A8E", "Washington Nationals": "#AB0003"
  };

  // Generic cache method
  static async getCachedData(key, fetchFunction) {
    const now = Date.now();
    const lastFetch = this.cacheTimestamps.get(key);
    
    // Return cached data if it's fresh
    if (lastFetch && (now - lastFetch) < this.CACHE_DURATION && this.cache.has(key)) {
      return this.cache.get(key);
    }
    
    // Fetch fresh data
    try {
      const data = await fetchFunction();
      this.cache.set(key, data);
      this.cacheTimestamps.set(key, now);
      return data;
    } catch (error) {
      // Return cached data if available, even if stale
      if (this.cache.has(key)) {
        return this.cache.get(key);
      }
      throw error;
    }
  }

  // Get logo URL for team using ESPN CDN
  static getLogoUrl(teamName, teamAbbr = null, variant = 'light') {
    // First try to get abbreviation from our mapping
    let abbr = this.teamAbbrMap[teamName];
    
    // If not found in mapping, use the provided abbreviation (from API)
    if (!abbr && teamAbbr) {
      abbr = teamAbbr.toLowerCase();
    }
    
    if (!abbr) return "";
    
    // Use different URL based on variant
    if (variant === 'dark') {
      return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/mlb/500-dark/${abbr}.png`;
    } else {
      return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/mlb/500/${abbr}.png`;
    }
  }

  // Get adjusted date for MLB (accounting for games that end after midnight)
  static getAdjustedDateForMLB() {
    const now = new Date();
    const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    
    // If it's before 2 AM EST, use previous day's schedule
    if (estNow.getHours() < 2) {
      estNow.setDate(estNow.getDate() - 1);
    }

    const adjustedDate = estNow.getFullYear() + "-" +
                        String(estNow.getMonth() + 1).padStart(2, "0") + "-" +
                        String(estNow.getDate()).padStart(2, "0");

    return adjustedDate;
  }

  // Format date for MLB API
  static formatDateForAPI(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Fetch MLB scoreboard (games for date range)
  static async getScoreboard(startDate = null, endDate = null) {
    const cacheKey = `scoreboard_${startDate || 'today'}_${endDate || startDate || 'today'}`;
    
    return this.getCachedData(cacheKey, async () => {
      let url = this.SCHEDULE_URL;
      console.log('MLBService.getScoreboard called with:', { startDate, endDate });
      
      if (startDate) {
        if (endDate && endDate !== startDate) {
          // Date range format
          url += `&startDate=${startDate}&endDate=${endDate}`;
          console.log('MLBService: Using date range format:', `${startDate} to ${endDate}`);
        } else {
          // Single date format
          url += `&startDate=${startDate}&endDate=${startDate}`;
          console.log('MLBService: Using single date format:', startDate);
        }
      } else {
        // Use adjusted date for "today"
        const today = this.getAdjustedDateForMLB();
        url += `&startDate=${today}&endDate=${today}`;
        console.log('MLBService: Using adjusted today date:', today);
      }
      
      console.log('MLBService: Final API URL:', url);
      const response = await fetch(url);
      const data = await response.json();
      
      // Process and return the data in a consistent format
      const processedData = {
        events: []
      };

      if (data.dates && data.dates.length > 0) {
        data.dates.forEach(dateObj => {
          if (dateObj.games && dateObj.games.length > 0) {
            dateObj.games.forEach(game => {
              const processedGame = this.processGameData(game);
              processedData.events.push(processedGame);
            });
          }
        });
      }

      return processedData;
    });
  }

  // Process game data to match our expected format
  static processGameData(game) {
    const awayTeam = game.teams?.away;
    const homeTeam = game.teams?.home;
    
    return {
      id: game.gamePk?.toString(),
      date: game.gameDate,
      status: game.status?.detailedState || 'Unknown',
      statusType: game.status?.statusCode || 'U',
      isCompleted: game.status?.statusCode === 'F',
      isLive: game.status?.statusCode === 'I' || game.status?.detailedState === 'In Progress',
      displayClock: this.getGameTimeDisplay(game),
      venue: game.venue?.name || '',
      broadcasts: this.getBroadcasts(game),
      awayTeam: {
        id: awayTeam?.team?.id?.toString(),
        displayName: awayTeam?.team?.name || '',
        abbreviation: awayTeam?.team?.abbreviation || '',
        score: awayTeam?.score?.toString() || '0',
        record: this.formatRecord(awayTeam?.leagueRecord),
        logo: this.getLogoUrl(awayTeam?.team?.name || '', awayTeam?.team?.abbreviation),
        color: this.teamColors[awayTeam?.team?.name] || '#333333'
      },
      homeTeam: {
        id: homeTeam?.team?.id?.toString(),
        displayName: homeTeam?.team?.name || '',
        abbreviation: homeTeam?.team?.abbreviation || '',
        score: homeTeam?.score?.toString() || '0',
        record: this.formatRecord(homeTeam?.leagueRecord),
        logo: this.getLogoUrl(homeTeam?.team?.name || '', homeTeam?.team?.abbreviation),
        color: this.teamColors[homeTeam?.team?.name] || '#333333'
      },
      // MLB-specific data
      inning: game.linescore?.currentInning || 0,
      inningState: game.linescore?.inningState || '',
      situation: this.getGameSituation(game)
    };
  }

  // Get game time display
  static getGameTimeDisplay(game) {
    if (game.status?.statusCode === 'F') {
      return 'Final';
    }
    
    if (game.status?.statusCode === 'I') {
      // In progress - show inning
      const inning = game.linescore?.currentInning || 0;
      const inningState = game.linescore?.inningState || '';
      const ordinal = this.getOrdinalSuffix(inning);
      return inningState === 'Top' ? `Top ${ordinal}` : `Bot ${ordinal}`;
    }
    
    if (game.status?.statusCode === 'S' || game.status?.statusCode === 'P') {
      // Scheduled - show game time
      const gameDate = new Date(game.gameDate);
      return gameDate.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        timeZone: 'America/New_York'
      });
    }
    
    return game.status?.detailedState || 'Unknown';
  }

  // Get ordinal suffix for inning numbers
  static getOrdinalSuffix(num) {
    if (num % 100 >= 11 && num % 100 <= 13) return `${num}th`;
    switch (num % 10) {
      case 1: return `${num}st`;
      case 2: return `${num}nd`;
      case 3: return `${num}rd`;
      default: return `${num}th`;
    }
  }

  // Format team record
  static formatRecord(record) {
    if (!record) return '';
    return `${record.wins}-${record.losses}`;
  }

  // Get broadcasts
  static getBroadcasts(game) {
    if (!game.broadcasts) return [];
    return game.broadcasts.map(broadcast => broadcast.name || '').filter(name => name);
  }

  // Get game situation (bases, count, etc.)
  static getGameSituation(game) {
    if (!game.linescore) return {};
    
    return {
      balls: game.linescore.balls || 0,
      strikes: game.linescore.strikes || 0,
      outs: game.linescore.outs || 0,
      bases: {
        first: !!game.linescore.offense?.first,
        second: !!game.linescore.offense?.second,
        third: !!game.linescore.offense?.third
      }
    };
  }

  // Fetch game details with caching
  static async getGameDetails(gameId) {
    const cacheKey = `gameDetails_${gameId}`;
    
    return this.getCachedData(cacheKey, async () => {
      const url = `${this.BASE_URL}/api/v1.1/game/${gameId}/feed/live`;
      console.log('MLBService.getGameDetails called with gameId:', gameId);
      console.log('MLBService.getGameDetails: Using feed endpoint:', url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      return data;
    });
  }

  // Get team standings
  static async getStandings() {
    const cacheKey = 'mlb_standings';
    
    return this.getCachedData(cacheKey, async () => {
      const url = `${this.BASE_URL}/api/v1/standings?leagueId=103,104&season=2024&standingsTypes=regularSeason`;
      console.log('MLBService.getStandings called');
      console.log('MLBService.getStandings: Using standings endpoint:', url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      return data;
    });
  }

  // Get play-by-play data
  static async getPlayByPlay(gameId) {
    const cacheKey = `playByPlay_${gameId}`;
    
    return this.getCachedData(cacheKey, async () => {
      const response = await fetch(`${this.BASE_URL}/api/v1.1/game/${gameId}/feed/live`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.liveData?.plays || null;
    });
  }

  // Get team stats for a game
  static async getTeamStats(gameId) {
    const cacheKey = `teamStats_${gameId}`;
    
    return this.getCachedData(cacheKey, async () => {
      const response = await fetch(`${this.BASE_URL}/api/v1.1/game/${gameId}/feed/live`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return {
        away: data.liveData?.boxscore?.teams?.away || null,
        home: data.liveData?.boxscore?.teams?.home || null,
        gameData: data.gameData || null
      };
    });
  }

  // Get team color by team name
  static getTeamColor(teamName) {
    return this.teamColors[teamName] || '#666666';
  }

  // Get player headshot URL
  static getHeadshotUrl(playerId) {
    if (!playerId) return 'https://via.placeholder.com/80x80?text=Player';
    return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${playerId}/headshot/67/current`;
  }

  // Get player game stats
  static async getPlayerGameStats(gameId, playerId) {
    if (!gameId || !playerId) return null;
    
    const cacheKey = `playerGameStats_${gameId}_${playerId}`;
    
    return this.getCachedData(cacheKey, async () => {
      try {
        const response = await fetch(`${this.BASE_URL}/api/v1.1/game/${gameId}/feed/live`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const boxscore = data.liveData?.boxscore;
        
        if (!boxscore) return null;

        // Check both teams for the player
        const awayPlayers = boxscore.teams?.away?.players || {};
        const homePlayers = boxscore.teams?.home?.players || {};
        
        const playerKey = `ID${playerId}`;
        const playerData = awayPlayers[playerKey] || homePlayers[playerKey];
        
        if (!playerData || !playerData.stats) return null;

        return playerData.stats;
      } catch (error) {
        console.error('Error fetching player game stats:', error);
        return null;
      }
    });
  }

  // Get team roster
  static async getTeamRoster(teamId) {
    if (!teamId) return null;
    
    const cacheKey = `teamRoster_${teamId}`;
    
    return this.getCachedData(cacheKey, async () => {
      try {
        const response = await fetch(`${this.BASE_URL}/api/v1/teams/${teamId}/roster/fullRoster`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data.roster || [];
      } catch (error) {
        console.error('Error fetching team roster:', error);
        return [];
      }
    });
  }

  // Get team season stats
  static async getTeamSeasonStats(teamId, season = new Date().getFullYear()) {
    if (!teamId) return null;
    
    const cacheKey = `teamSeasonStats_${teamId}_${season}`;
    
    return this.getCachedData(cacheKey, async () => {
      try {
        const [hittingResponse, pitchingResponse] = await Promise.all([
          fetch(`${this.BASE_URL}/api/v1/teams/${teamId}/stats?stats=season&group=hitting&season=${season}`),
          fetch(`${this.BASE_URL}/api/v1/teams/${teamId}/stats?stats=season&group=pitching&season=${season}`)
        ]);

        if (!hittingResponse.ok || !pitchingResponse.ok) {
          throw new Error(`HTTP error! hitting: ${hittingResponse.status}, pitching: ${pitchingResponse.status}`);
        }

        const [hittingData, pitchingData] = await Promise.all([
          hittingResponse.json(),
          pitchingResponse.json()
        ]);

        return {
          hitting: hittingData.stats?.[0]?.splits?.[0]?.stat || {},
          pitching: pitchingData.stats?.[0]?.splits?.[0]?.stat || {}
        };
      } catch (error) {
        console.error('Error fetching team season stats:', error);
        return { hitting: {}, pitching: {} };
      }
    });
  }

  // Get top team hitters
  static async getTopTeamHitters(teamId, season = new Date().getFullYear()) {
    if (!teamId) return [];
    
    const cacheKey = `topHittersAVG_${teamId}_${season}`; // Changed cache key to force refresh
    
    return this.getCachedData(cacheKey, async () => {
      try {
        const response = await fetch(`${this.BASE_URL}/api/v1/stats?stats=season&group=hitting&season=${season}&teamId=${teamId}&sportId=1`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const players = data.stats?.[0]?.splits || [];
        
        // Take top 3 players (already sorted by rank from API)
        return players.slice(0, 3);
      } catch (error) {
        console.error('Error fetching top hitters:', error);
        return [];
      }
    });
  }

  // Get player season stats
  static async getPlayerSeasonStats(playerId, season = new Date().getFullYear()) {
    if (!playerId) return null;
    
    const cacheKey = `playerSeasonStats_${playerId}_${season}`;
    
    return this.getCachedData(cacheKey, async () => {
      try {
        const [hittingResponse, pitchingResponse] = await Promise.all([
          fetch(`${this.BASE_URL}/api/v1/people/${playerId}/stats?stats=season&group=hitting&season=${season}`),
          fetch(`${this.BASE_URL}/api/v1/people/${playerId}/stats?stats=season&group=pitching&season=${season}`)
        ]);

        const hittingData = hittingResponse.ok ? await hittingResponse.json() : null;
        const pitchingData = pitchingResponse.ok ? await pitchingResponse.json() : null;

        return {
          hitting: hittingData?.stats?.[0]?.splits?.[0]?.stat || {},
          pitching: pitchingData?.stats?.[0]?.splits?.[0]?.stat || {}
        };
      } catch (error) {
        console.error('Error fetching player season stats:', error);
        return { hitting: {}, pitching: {} };
      }
    });
  }

  // Clear cache method
  static clearCache() {
    this.cache.clear();
    this.cacheTimestamps.clear();
  }
}

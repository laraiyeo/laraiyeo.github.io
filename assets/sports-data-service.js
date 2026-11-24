/**
 * SportsHeart Web - Sports Data Service
 * Centralized data fetching for all sports
 * Mirrors the mobile app's service pattern
 */

const SportsDataService = {
  // ============================================
  // CONFIG
  // ============================================
  ESPN_BASE: 'https://site.api.espn.com/apis/site/v2/sports',
  ESPN_CORE: 'https://cdn.espn.com/core',
  ESPN_SUMMARY_BASE: 'https://site.api.espn.com/apis/site/v2/sports',
  MLB_BASE: 'https://statsapi.mlb.com/api/v1',
  NHL_BACKEND: 'https://sportsheart-hockey.up.railway.app',

  // Cache
  _cache: new Map(),
  _cacheTimestamps: new Map(),
  CACHE_SHORT: 2000,
  CACHE_MEDIUM: 30000,
  CACHE_LONG: 300000,

  // ============================================
  // SPORT CONFIG
  // ============================================
  SPORTS: {
    nba: { sport: 'basketball', league: 'nba', mlbApi: false, nhlBackend: false },
    wnba: { sport: 'basketball', league: 'wnba', mlbApi: false, nhlBackend: false },
    nfl: { sport: 'football', league: 'nfl', mlbApi: false, nhlBackend: false },
    mlb: { sport: 'baseball', league: 'mlb', mlbApi: true, nhlBackend: false },
    nhl: { sport: 'hockey', league: 'nhl', mlbApi: false, nhlBackend: true },
  },

  getConfig(sport) {
    return this.SPORTS[sport] || this.SPORTS.nba;
  },

  // ============================================
  // CACHE HELPERS
  // ============================================
  _cacheKey(...parts) {
    return parts.join('_');
  },

  async _cached(key, fetchFn, ttl = 2000) {
    const now = Date.now();
    const cached = this._cache.get(key);
    const ts = this._cacheTimestamps.get(key);
    if (cached && ts && (now - ts) < ttl) return cached;
    
    const data = await fetchFn();
    this._cache.set(key, data);
    this._cacheTimestamps.set(key, now);
    return data;
  },

  // ============================================
  // FETCH HELPERS
  // ============================================
  async _fetch(url, options = {}) {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        ...options.headers
      },
      ...options
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.json();
  },

  convertToHttps(url) {
    if (typeof url !== 'string') return url;
    return url.replace(/^http:\/\//i, 'https://');
  },

  // ============================================
  // SCOREBOARD / GAMES
  // ============================================
  async getScoreboard(sport, startDate = null, endDate = null) {
    const cfg = this.getConfig(sport);
    const cacheKey = this._cacheKey(sport, 'scoreboard', startDate || 'today', endDate || '');
    const isLive = !startDate || startDate === this._getTodayStr();

    return this._cached(cacheKey, async () => {
      if (cfg.mlbApi) {
        return this._fetchMLBScoreboard(startDate);
      }
      if (cfg.nhlBackend) {
        return this._fetchNHLScoreboard(startDate);
      }
      return this._fetchESPNScoreboard(cfg.sport, cfg.league, startDate, endDate);
    }, isLive ? this.CACHE_SHORT : this.CACHE_MEDIUM);
  },

  async _fetchESPNScoreboard(sport, league, startDate, endDate) {
    let url = `${this.ESPN_BASE}/${sport}/${league}/scoreboard`;
    if (startDate) {
      if (endDate && endDate !== startDate) {
        url += `?dates=${startDate}-${endDate}`;
      } else {
        url += `?dates=${startDate}`;
      }
    }
    return this._fetch(url);
  },

  async _fetchMLBScoreboard(date) {
    const d = date || this._getMLBAdjustedDate();
    const url = `${this.MLB_BASE}/schedule/games/?sportId=1&date=${d}`;
    const data = await this._fetch(url);
    // Transform to ESPN-like format
    return this._transformMLBToESPN(data);
  },

  async _fetchNHLScoreboard(date) {
    const d = date || this._getTodayStr();
    const url = `${this.NHL_BACKEND}/nhl/scoreboard?date=${d}`;
    return this._fetch(url);
  },

  // ============================================
  // GAME DETAILS
  // ============================================
  async getGameDetails(sport, gameId) {
    const cfg = this.getConfig(sport);
    const cacheKey = this._cacheKey(sport, 'game', gameId);

    return this._cached(cacheKey, async () => {
      if (cfg.mlbApi) {
        return this._fetchMLBGameDetails(gameId);
      }
      if (cfg.nhlBackend) {
        return this._fetchNHLGameDetails(gameId);
      }
      const url = `${this.ESPN_SUMMARY_BASE}/${cfg.sport}/${cfg.league}/summary?event=${gameId}`;
      return this._fetch(url);
    }, this.CACHE_SHORT);
  },

  async _fetchMLBGameDetails(gameId) {
    const url = `${this.MLB_BASE}/game/${gameId}/feed/live`;
    return this._fetch(url);
  },

  async _fetchNHLGameDetails(gameId) {
    const url = `${this.NHL_BACKEND}/nhl/game/${gameId}`;
    return this._fetch(url);
  },

  // ============================================
  // TEAMS
  // ============================================
  async getTeams(sport) {
    const cfg = this.getConfig(sport);
    const cacheKey = this._cacheKey(sport, 'teams');

    return this._cached(cacheKey, async () => {
      if (cfg.mlbApi) {
        return this._fetchMLBTeams();
      }
      if (cfg.nhlBackend) {
        return this._fetch(`${this.NHL_BACKEND}/nhl/teams`);
      }
      const url = `${this.ESPN_BASE}/${cfg.sport}/${cfg.league}/teams`;
      const data = await this._fetch(url);
      return data.sports?.[0]?.leagues?.[0]?.teams || [];
    }, this.CACHE_LONG);
  },

  async _fetchMLBTeams() {
    const url = `${this.MLB_BASE}/teams?sportId=1`;
    const data = await this._fetch(url);
    return data.teams || [];
  },

  // ============================================
  // TEAM DETAILS
  // ============================================
  async getTeamDetails(sport, teamId) {
    const cfg = this.getConfig(sport);
    const cacheKey = this._cacheKey(sport, 'team', teamId);

    return this._cached(cacheKey, async () => {
      if (cfg.mlbApi) {
        const url = `${this.MLB_BASE}/teams/${teamId}`;
        const data = await this._fetch(url);
        return data.teams?.[0] || null;
      }
      if (cfg.nhlBackend) {
        return this._fetch(`${this.NHL_BACKEND}/nhl/team/${teamId}`);
      }
      const url = `${this.ESPN_BASE}/${cfg.sport}/${cfg.league}/teams/${teamId}`;
      const data = await this._fetch(url);
      return data.team || null;
    }, this.CACHE_MEDIUM);
  },

  // ============================================
  // TEAM ROSTER
  // ============================================
  async getTeamRoster(sport, teamId) {
    const cfg = this.getConfig(sport);
    const cacheKey = this._cacheKey(sport, 'roster', teamId);

    return this._cached(cacheKey, async () => {
      if (cfg.mlbApi) {
        return this._fetchMLBRoster(teamId);
      }
      if (cfg.nhlBackend) {
        return this._fetch(`${this.NHL_BACKEND}/nhl/team/${teamId}/roster`);
      }
      const url = `${this.ESPN_BASE}/${cfg.sport}/${cfg.league}/teams/${teamId}/roster`;
      return this._fetch(url);
    }, this.CACHE_MEDIUM);
  },

  async _fetchMLBRoster(teamId) {
    const url = `${this.MLB_BASE}/teams/${teamId}/roster?season=${new Date().getFullYear()}`;
    return this._fetch(url);
  },

  // ============================================
  // PLAYER / ATHLETE DETAILS
  // ============================================
  async getAthleteDetails(sport, athleteId) {
    const cfg = this.getConfig(sport);
    const cacheKey = this._cacheKey(sport, 'athlete', athleteId);

    return this._cached(cacheKey, async () => {
      if (cfg.mlbApi) {
        return this._fetchMLBPlayer(athleteId);
      }
      if (cfg.nhlBackend) {
        return this._fetch(`${this.NHL_BACKEND}/nhl/player/${athleteId}`);
      }
      const url = `${this.ESPN_BASE}/${cfg.sport}/${cfg.league}/athletes/${athleteId}`;
      return this._fetch(url);
    }, this.CACHE_MEDIUM);
  },

  async _fetchMLBPlayer(playerId) {
    const url = `${this.MLB_BASE}/people/${playerId}`;
    return this._fetch(url);
  },

  // ============================================
  // PLAYER STATS
  // ============================================
  async getAthleteStats(sport, athleteId, seasonYear = null) {
    const cfg = this.getConfig(sport);
    const year = seasonYear || new Date().getFullYear();
    const cacheKey = this._cacheKey(sport, 'athleteStats', athleteId, year);

    return this._cached(cacheKey, async () => {
      if (cfg.mlbApi) {
        return this._fetchMLBPlayerStats(athleteId, year);
      }
      // ESPN stats - try types/2 first, fallback to types/1
      const baseUrl = `https://sports.core.api.espn.com/v2/sports/${cfg.sport}/leagues/${cfg.league}/seasons/${year}`;
      try {
        const url = `${baseUrl}/types/2/athletes/${athleteId}/statistics?lang=en&region=us`;
        return await this._fetch(url);
      } catch (e) {
        const url = `${baseUrl}/types/1/athletes/${athleteId}/statistics?lang=en&region=us`;
        return await this._fetch(url);
      }
    }, this.CACHE_MEDIUM);
  },

  async _fetchMLBPlayerStats(playerId, year) {
    const hittingUrl = `${this.MLB_BASE}/people/${playerId}/stats?stats=season&group=hitting&season=${year}`;
    const pitchingUrl = `${this.MLB_BASE}/people/${playerId}/stats?stats=season&group=pitching&season=${year}`;
    const [hitting, pitching] = await Promise.all([
      this._fetch(hittingUrl).catch(() => null),
      this._fetch(pitchingUrl).catch(() => null)
    ]);
    return { hitting, pitching };
  },

  // ============================================
  // STANDINGS
  // ============================================
  async getStandings(sport) {
    const cfg = this.getConfig(sport);
    const cacheKey = this._cacheKey(sport, 'standings');

    return this._cached(cacheKey, async () => {
      if (cfg.mlbApi) {
        return this._fetchMLBStandings();
      }
      if (cfg.nhlBackend) {
        return this._fetch(`${this.NHL_BACKEND}/nhl/standings`);
      }
      const url = `https://cdn.espn.com/core/${cfg.league}/standings?xhr=1`;
      return this._fetch(url);
    }, this.CACHE_LONG);
  },

  async _fetchMLBStandings() {
    const url = `${this.MLB_BASE}/standings?leagueId=103,104&season=${new Date().getFullYear()}`;
    return this._fetch(url);
  },

  // ============================================
  // TEAM STATS
  // ============================================
  async getTeamStats(sport, teamId, seasonYear = null) {
    const cfg = this.getConfig(sport);
    const year = seasonYear || new Date().getFullYear();
    const cacheKey = this._cacheKey(sport, 'teamStats', teamId, year);

    return this._cached(cacheKey, async () => {
      if (cfg.mlbApi) {
        return this._fetchMLBTeamStats(teamId, year);
      }
      const url = `https://sports.core.api.espn.com/v2/sports/${cfg.sport}/leagues/${cfg.league}/seasons/${year}/types/2/teams/${teamId}/statistics?lang=en&region=us`;
      return this._fetch(url);
    }, this.CACHE_MEDIUM);
  },

  async _fetchMLBTeamStats(teamId, year) {
    const hittingUrl = `${this.MLB_BASE}/teams/${teamId}/stats?season=${year}&group=hitting&stats=season&gameType=R`;
    const pitchingUrl = `${this.MLB_BASE}/teams/${teamId}/stats?season=${year}&group=pitching&stats=season&gameType=R`;
    const [hitting, pitching] = await Promise.all([
      this._fetch(hittingUrl).catch(() => null),
      this._fetch(pitchingUrl).catch(() => null)
    ]);
    return { hitting, pitching };
  },

  // ============================================
  // TEAM SCHEDULE (for team page)
  // ============================================
  async getTeamSchedule(sport, teamId, startDate, endDate) {
    const cfg = this.getConfig(sport);
    const cacheKey = this._cacheKey(sport, 'teamSchedule', teamId, startDate, endDate);

    return this._cached(cacheKey, async () => {
      if (cfg.mlbApi) {
        return this._fetchMLBTeamSchedule(teamId, startDate, endDate);
      }
      // For ESPN sports, fetch scoreboard and filter
      const data = await this._fetchESPNScoreboard(cfg.sport, cfg.league, startDate, endDate);
      const events = data.events || [];
      return events.filter(e => {
        const comp = e.competitions?.[0];
        if (!comp) return false;
        const teams = comp.competitors || [];
        return teams.some(t => String(t.team?.id) === String(teamId));
      });
    }, this.CACHE_SHORT);
  },

  async _fetchMLBTeamSchedule(teamId, startDate, endDate) {
    const url = `${this.MLB_BASE}/schedule/games/?sportId=1&teamId=${teamId}&startDate=${startDate}&endDate=${endDate}`;
    return this._fetch(url);
  },

  // ============================================
  // PLAYER GAME LOG
  // ============================================
  async getAthleteGameLog(sport, athleteId, seasonYear = null) {
    const cfg = this.getConfig(sport);
    const year = seasonYear || new Date().getFullYear();
    const cacheKey = this._cacheKey(sport, 'gameLog', athleteId, year);

    return this._cached(cacheKey, async () => {
      if (cfg.mlbApi) {
        return this._fetchMLBPlayerGameLog(athleteId, year);
      }
      const url = `https://sports.core.api.espn.com/v2/sports/${cfg.sport}/leagues/${cfg.league}/seasons/${year}/types/2/athletes/${athleteId}/statistics?lang=en&region=us`;
      return this._fetch(url);
    }, this.CACHE_MEDIUM);
  },

  async _fetchMLBPlayerGameLog(playerId, year) {
    const url = `${this.MLB_BASE}/people/${playerId}/stats?stats=gameLog&group=hitting&season=${year}`;
    return this._fetch(url);
  },

  // ============================================
  // DATE HELPERS
  // ============================================
  _getTodayStr() {
    const now = new Date();
    return now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
  },

  _getMLBAdjustedDate() {
    const now = new Date();
    const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    if (estNow.getHours() < 2) estNow.setDate(estNow.getDate() - 1);
    return estNow.getFullYear() + '-' + String(estNow.getMonth() + 1).padStart(2, '0') + '-' + String(estNow.getDate()).padStart(2, '0');
  },

  getAdjustedDate(sport) {
    if (sport === 'mlb') return this._getMLBAdjustedDate();
    return this._getTodayStr();
  },

  // ============================================
  // TRANSFORM HELPERS
  // ============================================
  _transformMLBToESPN(data) {
    const games = data.dates?.[0]?.games || [];
    return {
      events: games.map(g => ({
        id: String(g.gamePk),
        date: g.gameDate,
        status: {
          type: {
            state: g.status?.abstractGameState === 'Live' ? 'in' : 
                   g.status?.abstractGameState === 'Final' ? 'post' : 'pre',
            description: g.status?.detailedState || 'Scheduled',
            completed: g.status?.abstractGameState === 'Final'
          }
        },
        competitions: [{
          competitors: [
            {
              homeAway: 'home',
              team: {
                id: String(g.teams?.home?.team?.id),
                displayName: g.teams?.home?.team?.name,
                abbreviation: g.teams?.home?.team?.abbreviation,
                logo: `https://a.espncdn.com/combiner/i?img=/i/teamlogos/mlb/500/${g.teams?.home?.team?.abbreviation?.toLowerCase()}.png`
              },
              score: String(g.teams?.home?.score || 0)
            },
            {
              homeAway: 'away',
              team: {
                id: String(g.teams?.away?.team?.id),
                displayName: g.teams?.away?.team?.name,
                abbreviation: g.teams?.away?.team?.abbreviation,
                logo: `https://a.espncdn.com/combiner/i?img=/i/teamlogos/mlb/500/${g.teams?.away?.team?.abbreviation?.toLowerCase()}.png`
              },
              score: String(g.teams?.away?.score || 0)
            }
          ]
        }]
      }))
    };
  },

  // ============================================
  // LOGO HELPERS
  // ============================================
  getTeamLogoUrl(sport, teamAbbreviation) {
    const abbr = (teamAbbreviation || '').toLowerCase();
    const sportPaths = {
      nba: `nba/500/scoreboard/${abbr}`,
      wnba: `wnba/500/${abbr}`,
      nfl: `nfl/500/scoreboard/${abbr}`,
      mlb: `mlb/500/${abbr}`,
      nhl: `nhl/500/scoreboard/${abbr}`,
    };
    const path = sportPaths[sport] || sportPaths.nba;
    return `https://a.espncdn.com/i/teamlogos/${path}.png`;
  },

  getTeamLogoDarkUrl(sport, teamAbbreviation) {
    const abbr = (teamAbbreviation || '').toLowerCase();
    const sportPaths = {
      nba: `nba/500-dark/scoreboard/${abbr}`,
      wnba: `wnba/500-dark/${abbr}`,
      nfl: `nfl/500-dark/scoreboard/${abbr}`,
      mlb: `mlb/500-dark/${abbr}`,
      nhl: `nhl/500-dark/scoreboard/${abbr}`,
    };
    const path = sportPaths[sport] || sportPaths.nba;
    return `https://a.espncdn.com/i/teamlogos/${path}.png`;
  },

  getAthleteHeadshotUrl(sport, athleteId) {
    const cfg = this.getConfig(sport);
    return `https://a.espncdn.com/i/headshots/${cfg.sport}/players/full/${athleteId}.png`;
  },

  // ============================================
  // GAME STATUS HELPERS
  // ============================================
  isLive(game) {
    if (!game) return false;
    const status = game.status?.type;
    if (!status) return false;
    return status.state === 'in' || 
           status.description === 'In Progress' ||
           status.description === 'Halftime' ||
           status.description === 'End of Period' ||
           (status.completed === false && status.state !== 'pre');
  },

  isFinal(game) {
    if (!game) return false;
    const status = game.status?.type;
    if (!status) return false;
    return status.completed === true || 
           status.description === 'Final' ||
           status.state === 'post';
  },

  isScheduled(game) {
    if (!game) return false;
    const status = game.status?.type;
    if (!status) return false;
    return status.state === 'pre' || status.description === 'Scheduled';
  },

  getGameStatus(game) {
    if (this.isLive(game)) return 'live';
    if (this.isFinal(game)) return 'final';
    return 'scheduled';
  },

  // ============================================
  // TEAM COLOR HELPERS
  // ============================================
  getTeamColor(team) {
    if (!team) return '#333333';
    if (team.color) return team.color.startsWith('#') ? team.color : `#${team.color}`;
    return '#333333';
  },

  getTextOnColor(hex) {
    if (!hex) return '#FFFFFF';
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.5 ? '#000000' : '#FFFFFF';
  }
};
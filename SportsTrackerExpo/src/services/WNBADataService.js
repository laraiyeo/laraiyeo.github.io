// Shared WNBA data service for caching teams and players across screens

import { BaseCacheService } from './BaseCacheService';

class WNBADataService extends BaseCacheService {
  constructor() {
    super();
    this.teamsCache = null;
    this.playersCache = null;
    this.isInitializing = false;
    this.initPromise = null;
    this.listeners = new Set();
  }

  // Add listener for data updates
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // Notify all listeners of data changes
  notifyListeners() {
    this.listeners.forEach(callback => callback({
      teamsCache: this.teamsCache,
      playersCache: this.playersCache,
      isInitializing: this.isInitializing
    }));
  }

  // Get cached data
  getData() {
    return {
      teamsCache: this.teamsCache,
      playersCache: this.playersCache,
      isInitializing: this.isInitializing
    };
  }

  // Initialize data if not already cached
  async initializeData() {
    // If already initialized, return cached data
    if (this.teamsCache && this.playersCache) {
      console.log('WNBADataService: Data already cached, returning existing data');
      return this.getData();
    }

    // If already initializing, wait for that to complete
    if (this.isInitializing && this.initPromise) {
      console.log('WNBADataService: Already initializing, waiting for completion');
      return await this.initPromise;
    }

    console.log('WNBADataService: Starting data initialization...');

    // Start initialization
    this.isInitializing = true;
    this.notifyListeners();

    this.initPromise = this._fetchData();
    
    try {
      await this.initPromise;
      return this.getData();
    } finally {
      this.isInitializing = false;
      this.notifyListeners();
    }
  }

  async _fetchData() {
    try {
      // Fetch teams first
      const headers = this.constructor.getBrowserHeaders();
      const teamsResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams`, { headers });
      const teamsData = await teamsResponse.json();
      
      if (!teamsData.sports?.[0]?.leagues?.[0]?.teams) {
        console.error('No teams data found');
        return;
      }
      
      const teams = teamsData.sports[0].leagues[0].teams.map(teamWrapper => teamWrapper.team);
      this.teamsCache = teams;
      this.notifyListeners();
      
      // Fetch all rosters in parallel
      const rosterPromises = teams.map(async (team) => {
        try {
          const rosterUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams/${team.id}/roster`;
          const rosterResponse = await fetch(rosterUrl, { headers });
          const roster = await rosterResponse.json();
          
          if (roster.athletes) {
            // WNBA roster structure is a flat array, not grouped by position
            const teamPlayers = roster.athletes.map(player => ({
              ...player,
              team: team
            }));
            return teamPlayers;
          }
          return [];
        } catch (error) {
          console.error(`Error fetching team ${team.id} roster:`, error);
          return [];
        }
      });
      
      // Wait for all roster fetches to complete
      const allRosters = await Promise.all(rosterPromises);
      const allPlayers = allRosters.flat();
      
      this.playersCache = allPlayers;
      console.log(`WNBA Data Service: Loaded ${teams.length} teams and ${allPlayers.length} players`);
      
    } catch (error) {
      console.error('Error initializing WNBA data:', error);
      throw error;
    }
  }

  // Search teams
  searchTeams(query) {
    if (!this.teamsCache) return [];
    
    return this.teamsCache.filter(team => 
      team.displayName && 
      team.displayName.toLowerCase().includes(query.toLowerCase())
    );
  }

  // Search players
  searchPlayers(query) {
    if (!this.playersCache) return [];
    
    return this.playersCache.filter(player =>
      player.displayName && 
      player.displayName.toLowerCase().includes(query.toLowerCase())
    );
  }

  // Get all players (for compare screen)
  getAllPlayers() {
    return this.playersCache || [];
  }

  // Get all teams
  getAllTeams() {
    return this.teamsCache || [];
  }

  // Check if data is fully loaded
  isDataFullyLoaded() {
    return this.teamsCache && this.playersCache && !this.isInitializing;
  }

  // Clear cache (for testing or refresh)
  clearCache() {
    this.teamsCache = null;
    this.playersCache = null;
    this.isInitializing = false;
    this.initPromise = null;
    this.notifyListeners();
    // Also clear parent cache
    super.clearCache();
  }

  // WNBA-specific position grouping - all positions can compare with each other
  getPositionGroup(position) {
    if (!position) return 'player';
    
    const pos = position.toLowerCase();
    
    // Guards
    if (pos.includes('point guard') || pos === 'pg') return 'player';
    if (pos.includes('shooting guard') || pos === 'sg') return 'player';
    if (pos.includes('guard')) return 'player';
    
    // Forwards
    if (pos.includes('small forward') || pos === 'sf') return 'player';
    if (pos.includes('power forward') || pos === 'pf') return 'player';
    if (pos.includes('forward')) return 'player';
    
    // Centers
    if (pos.includes('center') || pos === 'c') return 'player';
    
    return 'player';
  }

  // Check if two players can be compared - WNBA allows all positions to compare
  canCompare(player1, player2) {
    if (!player1 || !player2) return false;
    
    // In basketball, all positions can be compared since stats are similar
    return true;
  }
}

// Export singleton instance
export default new WNBADataService();
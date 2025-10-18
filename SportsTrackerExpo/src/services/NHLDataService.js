// Shared NHL data service for caching teams and players across screens

import { BaseCacheService } from './BaseCacheService';

class NHLDataService extends BaseCacheService {
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
      console.log('NHLDataService: Data already cached, returning existing data');
      return this.getData();
    }

    // If already initializing, wait for that to complete
    if (this.isInitializing && this.initPromise) {
      console.log('NHLDataService: Already initializing, waiting for completion');
      return await this.initPromise;
    }

    console.log('NHLDataService: Starting data initialization...');

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
      const headers = this.getBrowserHeaders();
      const teamsResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams`, { headers });
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
          const rosterUrl = `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams/${team.id}/roster`;
          const rosterResponse = await fetch(rosterUrl, { headers });
          const roster = await rosterResponse.json();
          
          if (roster.athletes) {
            // Flatten all position groups into one array
            const teamPlayers = [];
            for (const positionGroup of roster.athletes) {
              if (positionGroup.items) {
                for (const player of positionGroup.items) {
                  teamPlayers.push({
                    ...player,
                    team: team
                  });
                }
              }
            }
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
      console.log(`NHL Data Service: Loaded ${teams.length} teams and ${allPlayers.length} players`);
      
    } catch (error) {
      console.error('Error initializing NHL data:', error);
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

  // NHL-specific position grouping
  getPositionGroup(position) {
    if (!position) return 'unknown';
    
    const pos = position.toLowerCase();
    
    // Forwards
    if (pos.includes('center') || pos === 'c') return 'forward';
    if (pos.includes('left wing') || pos === 'lw') return 'forward';
    if (pos.includes('right wing') || pos === 'rw') return 'forward';
    if (pos.includes('wing')) return 'forward';
    if (pos.includes('forward')) return 'forward';
    
    // Defensemen
    if (pos.includes('defense') || pos === 'd') return 'defenseman';
    if (pos.includes('defenseman')) return 'defenseman';
    
    // Goalies
    if (pos.includes('goalie') || pos === 'g') return 'goalie';
    if (pos.includes('goaltender')) return 'goalie';
    
    return 'unknown';
  }

  // Check if two players can be compared (same position group)
  canCompare(player1, player2) {
    if (!player1 || !player2) return false;
    
    const pos1 = this.getPositionGroup(player1.position?.displayName || player1.position?.name);
    const pos2 = this.getPositionGroup(player2.position?.displayName || player2.position?.name);
    
    return pos1 === pos2 && pos1 !== 'unknown';
  }
}

// Export singleton instance
export default new NHLDataService();
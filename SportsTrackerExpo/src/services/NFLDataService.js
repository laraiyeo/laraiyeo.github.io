// Shared NFL data service for caching teams and players across screens
import { BaseCacheService } from './BaseCacheService';

class NFLDataService extends BaseCacheService {
  constructor() {
    super(); // Call parent constructor first
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
      console.log('NFLDataService: Data already cached, returning existing data');
      return this.getData();
    }

    // If already initializing, wait for that to complete
    if (this.isInitializing && this.initPromise) {
      console.log('NFLDataService: Already initializing, waiting for completion');
      return await this.initPromise;
    }

    console.log('NFLDataService: Starting data initialization...');

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
      const teamsResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams`, { headers });
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
          const rosterUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.id}/roster`;
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
      console.log(`NFL Data Service: Loaded ${teams.length} teams and ${allPlayers.length} players`);
      
    } catch (error) {
      console.error('Error initializing NFL data:', error);
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
    return super.clearCache();
  }
}

// Export singleton instance
export default new NFLDataService();
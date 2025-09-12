// Champions League Soccer Service
// Handles API calls for UEFA Champions League

const CHAMPIONS_LEAGUE_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions';

export const ChampionsLeagueService = {
  // Fetch current matches/scoreboard
  async getScoreboard() {
    try {
      const response = await fetch(`${CHAMPIONS_LEAGUE_BASE_URL}/scoreboard`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching Champions League scoreboard:', error);
      throw error;
    }
  },

  // Fetch league standings
  async getStandings() {
    try {
      const response = await fetch(`${CHAMPIONS_LEAGUE_BASE_URL}/standings`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching Champions League standings:', error);
      throw error;
    }
  },

  // Fetch team information
  async getTeam(teamId) {
    try {
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/teams/${teamId}`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching Champions League team:', error);
      throw error;
    }
  },

  // Fetch player information
  async getPlayer(playerId) {
    try {
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/players/${playerId}`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching Champions League player:', error);
      throw error;
    }
  },

  // Fetch league statistics
  async getStats() {
    try {
      const response = await fetch(`${CHAMPIONS_LEAGUE_BASE_URL}/statistics`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching Champions League stats:', error);
      throw error;
    }
  },

  // Search for teams
  async searchTeams(query) {
    try {
      const response = await fetch(`${CHAMPIONS_LEAGUE_BASE_URL}/teams?limit=50`);
      const data = await response.json();

      if (data.sports && data.sports[0] && data.sports[0].leagues && data.sports[0].leagues[0]) {
        const teams = data.sports[0].leagues[0].teams;
        return teams.filter(team =>
          team.team.displayName.toLowerCase().includes(query.toLowerCase())
        );
      }
      return [];
    } catch (error) {
      console.error('Error searching Champions League teams:', error);
      throw error;
    }
  },

  // Search for players
  async searchPlayers(query) {
    try {
      const response = await fetch(`${CHAMPIONS_LEAGUE_BASE_URL}/athletes?limit=50`);
      const data = await response.json();

      if (data.sports && data.sports[0] && data.sports[0].leagues && data.sports[0].leagues[0]) {
        const athletes = data.sports[0].leagues[0].athletes;
        return athletes.filter(player =>
          player.athlete.displayName.toLowerCase().includes(query.toLowerCase())
        );
      }
      return [];
    } catch (error) {
      console.error('Error searching Champions League players:', error);
      throw error;
    }
  },

  // Get league information
  getLeagueInfo() {
    return {
      id: 'champions-league',
      name: 'Champions League',
      fullName: 'UEFA Champions League',
      country: 'Europe',
      flag: null, // No flag for competitions
      apiCode: 'uefa.champions',
      type: 'competition'
    };
  }
};
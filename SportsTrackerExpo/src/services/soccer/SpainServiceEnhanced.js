// Enhanced Spain Soccer Service
// Handles API calls for Spanish football leagues (La Liga, Copa del Rey, Spanish Supercopa)
// Combines soccer web logic with React Native patterns

const SPAIN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1';

// Competition configurations
const SPAIN_COMPETITIONS = {
  'esp.1': { name: 'La Liga', logo: '15', isPrimary: true },
  'esp.copa_del_rey': { name: 'Copa del Rey', logo: '80', isPrimary: false },
  'esp.super_cup': { name: 'Spanish Supercopa', logo: '431', isPrimary: false }
};

export const SpainServiceEnhanced = {
  // Logo cache to prevent repeated fetches
  logoCache: new Map(),

  // Function to get team logo with fallback and caching (from soccer web logic)
  async getTeamLogoWithFallback(teamId) {
    // Check cache first
    if (this.logoCache.has(teamId)) {
      return Promise.resolve(this.logoCache.get(teamId));
    }

    return new Promise((resolve) => {
      const primaryUrl = `https://a.espncdn.com/i/teamlogos/soccer/500-dark/${teamId}.png`;
      const fallbackUrl = `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`;
      
      // Try primary URL first
      fetch(primaryUrl, { method: 'HEAD' })
        .then(response => {
          if (response.ok) {
            this.logoCache.set(teamId, primaryUrl);
            resolve(primaryUrl);
          } else {
            throw new Error('Primary logo not found');
          }
        })
        .catch(() => {
          // Try fallback URL
          fetch(fallbackUrl, { method: 'HEAD' })
            .then(response => {
              if (response.ok) {
                this.logoCache.set(teamId, fallbackUrl);
                resolve(fallbackUrl);
              } else {
                throw new Error('Fallback logo not found');
              }
            })
            .catch(() => {
              // Use default soccer ball
              const defaultLogo = 'https://a.espncdn.com/i/teamlogos/soccer/500/default-team.png';
              this.logoCache.set(teamId, defaultLogo);
              resolve(defaultLogo);
            });
        });
    });
  },

  // Helper function to get team color using alternate color logic (from soccer web logic)
  getTeamColorWithAlternateLogic(team) {
    if (!team || !team.color) return '007bff'; // Default fallback
    
    const isUsingAlternateColor = ["ffffff", "ffee00", "ffff00", "81f733", "000000"].includes(team.color);
    
    if (isUsingAlternateColor && team.alternateColor) {
      return team.alternateColor;
    } else {
      return team.color;
    }
  },

  // Helper function to format date for API (from soccer web logic)
  getAdjustedDateForSoccer() {
    const now = new Date();
    const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    if (estNow.getHours() < 2) {
      estNow.setDate(estNow.getDate() - 1);
    }
    const adjustedDate = estNow.getFullYear() +
                         String(estNow.getMonth() + 1).padStart(2, "0") +
                         String(estNow.getDate()).padStart(2, "0");
    return adjustedDate;
  },

  // Format date range for API calls (like MLB service)
  formatDateForAPI(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  },

  // Get date ranges for different filters (like MLB service)
  getDateRange(dateFilter) {
    const today = new Date();
    
    switch (dateFilter) {
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return {
          startDate: yesterday,
          endDate: yesterday
        };
      case 'today':
        return {
          startDate: today,
          endDate: today
        };
      case 'upcoming':
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const endDate = new Date(tomorrow);
        endDate.setDate(endDate.getDate() + 6); // +7 days total from tomorrow
        return {
          startDate: tomorrow,
          endDate: endDate
        };
      default:
        return {
          startDate: today,
          endDate: today
        };
    }
  },

  // Create date range string for API
  createDateRangeString(startDate, endDate) {
    const start = this.formatDateForAPI(startDate);
    const end = this.formatDateForAPI(endDate);
    return start === end ? start : `${start}-${end}`;
  },

  // Fetch games from all Spanish competitions (main league + domestic cups)
  async fetchGamesFromAllCompetitions(dateRange) {
    const allGames = [];
    
    // Get competitions for Spain
    const allCompetitionsToCheck = [
      { code: 'esp.copa_del_rey', name: 'Copa del Rey' }, // Domestic cups FIRST (prioritized)
      { code: 'esp.super_cup', name: 'Spanish Supercopa' },
      { code: 'esp.1', name: 'La Liga' } // Main league LAST
    ];
    
    console.log(`Fetching Spain games from ${allCompetitionsToCheck.length} competitions:`, allCompetitionsToCheck.map(c => c.code));
    
    // Create all fetch promises in parallel
    const fetchPromises = allCompetitionsToCheck.map(async (competition) => {
      try {
        console.log(`Starting fetch for ${competition.code}...`);
        const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${competition.code}/scoreboard?dates=${dateRange}`);
        
        if (response.ok) {
          const data = await response.json();
          const competitionGames = data.events || [];
          
          // Add competition information to each game
          competitionGames.forEach(game => {
            game.competitionCode = competition.code;
            game.competitionName = SPAIN_COMPETITIONS[competition.code]?.name || competition.name;
            game.isDomesticCup = competition.code !== 'esp.1';
            game.priority = competition.code !== 'esp.1' ? 1 : 2; // Competition = 1, League = 2
            // Add leagues data for round information
            game.leaguesData = data.leagues?.[0];
          });
          
          console.log(`Found ${competitionGames.length} games in ${competition.code}`);
          return competitionGames;
        } else {
          console.log(`No data for ${competition.code} (${response.status})`);
          return [];
        }
      } catch (error) {
        console.error(`Error fetching ${competition.code}:`, error);
        return [];
      }
    });
    
    // Wait for all promises to complete
    const allResults = await Promise.all(fetchPromises);
    
    // Flatten and combine all games
    allResults.forEach(games => {
      allGames.push(...games);
    });
    
    // Sort by priority (competitions first), then by date
    allGames.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority; // Lower priority number = higher importance
      }
      return new Date(a.date) - new Date(b.date);
    });
    
    console.log(`Total Spain games found: ${allGames.length}`);
    return allGames;
  },

  // Fetch current matches/scoreboard with date filter (like MLB service)
  async getScoreboard(dateFilter = 'today') {
    try {
      const { startDate, endDate } = this.getDateRange(dateFilter);
      const dateRange = this.createDateRangeString(startDate, endDate);
      
      console.log(`Fetching Spain scoreboard for ${dateFilter}:`, dateRange);
      
      // Fetch from all competitions
      const games = await this.fetchGamesFromAllCompetitions(dateRange);
      
      return {
        events: games,
        leagues: games.length > 0 ? [games[0].leaguesData] : []
      };
    } catch (error) {
      console.error('Error fetching Spain scoreboard:', error);
      throw error;
    }
  },

  // Fetch game details
  async getGameDetails(gameId) {
    try {
      // Try each competition to find the game
      for (const competition of Object.keys(SPAIN_COMPETITIONS)) {
        try {
          const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${competition}/summary?event=${gameId}`);
          if (response.ok) {
            const data = await response.json();
            // Add competition info
            data.competitionCode = competition;
            data.competitionName = SPAIN_COMPETITIONS[competition].name;
            return data;
          }
        } catch (err) {
          console.log(`Game ${gameId} not found in ${competition}`);
        }
      }
      throw new Error(`Game ${gameId} not found in any Spanish competition`);
    } catch (error) {
      console.error('Error fetching Spain game details:', error);
      throw error;
    }
  },

  // Fetch league standings using the same CDN endpoint as soccer web app
  async getStandings() {
    try {
      const currentSeason = new Date().getFullYear().toString();
      const leagueCode = 'esp.1'; // La Liga
      
      // Use the same CDN endpoint that works in soccer web app
      const STANDINGS_URL = `https://cdn.espn.com/core/soccer/table?xhr=1&league=${leagueCode}&season=${currentSeason}`;
      
      console.log('Fetching standings from:', STANDINGS_URL);
      const response = await fetch(STANDINGS_URL);
      const standingsText = await response.text();
      
      console.log('Raw standings response:', standingsText.substring(0, 200) + '...');
      
      const data = JSON.parse(standingsText);
      
      // Check if we have the expected structure
      if (data.content && data.content.standings && data.content.standings.groups && data.content.standings.groups[0]) {
        const standings = data.content.standings.groups[0].standings.entries;
        console.log('Found standings entries:', standings.length);
        
        // Log the first few entries to see the structure including note data
        console.log('First 3 standings entries with full structure:');
        standings.slice(0, 3).forEach((entry, index) => {
          console.log(`Entry ${index + 1}:`, {
            team: entry.team.displayName,
            note: entry.note,
            fullEntry: entry
          });
        });
        
        // Return in the exact format that soccer web app uses - no transformation
        return {
          standings: {
            entries: standings // Keep the exact same structure as CDN provides
          }
        };
      } else {
        console.log('Unexpected standings structure');
        throw new Error('Unexpected standings structure');
      }
    } catch (error) {
      console.error('Error fetching Spain standings:', error);
      throw error;
    }
  },

  // Fetch team information
  async getTeam(teamId) {
    try {
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/teams/${teamId}`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching Spain team:', error);
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
      console.error('Error fetching Spain player:', error);
      throw error;
    }
  },

  // Search for teams
  async searchTeams(query) {
    try {
      const response = await fetch(`${SPAIN_BASE_URL}/teams?limit=50`);
      const data = await response.json();

      if (data.sports && data.sports[0] && data.sports[0].leagues && data.sports[0].leagues[0]) {
        const teams = data.sports[0].leagues[0].teams;
        return teams.filter(team =>
          team.team.displayName.toLowerCase().includes(query.toLowerCase())
        );
      }
      return [];
    } catch (error) {
      console.error('Error searching Spain teams:', error);
      throw error;
    }
  },

  // Search for players
  async searchPlayers(query) {
    try {
      const response = await fetch(`${SPAIN_BASE_URL}/athletes?limit=50`);
      const data = await response.json();

      if (data.sports && data.sports[0] && data.sports[0].leagues && data.sports[0].leagues[0]) {
        const athletes = data.sports[0].leagues[0].athletes;
        return athletes.filter(player =>
          player.athlete.displayName.toLowerCase().includes(query.toLowerCase())
        );
      }
      return [];
    } catch (error) {
      console.error('Error searching Spain players:', error);
      throw error;
    }
  },

  // Get competition details
  getCompetitionInfo() {
    return {
      leagues: SPAIN_COMPETITIONS,
      apiCode: 'esp.1'
    };
  },

  // Get league information
  getLeagueInfo() {
    return {
      id: 'spain',
      name: 'Spain',
      fullName: 'La Liga',
      country: 'Spain',
      flag: 'https://a.espncdn.com/i/teamlogos/countries/500/esp.png',
      apiCode: 'esp.1'
    };
  }
};
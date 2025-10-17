// Enhanced France Soccer Service
// Handles API calls for French football leagues (Ligue 1, Coupe de France, Trophée des Champions)
// Combines soccer web logic with React Native patterns

import React from 'react';
import { normalizeLeagueCodeForStorage } from '../../utils/TeamIdMapping';

const FRANCE_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1';

// Helper function for general soccer year logic
// For domestic leagues: July-December uses current year, else previous year
const getSoccerYear = () => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // getMonth() returns 0-11
  return (currentMonth >= 7 && currentMonth <= 12) ? now.getFullYear() : now.getFullYear() - 1;
};

// Competition configurations
const FRANCE_COMPETITIONS = {
  'fra.1': { name: 'Ligue 1', logo: '9', isPrimary: true },
  'fra.coupe_de_france': { name: 'Coupe de France', logo: '182', isPrimary: false },
  'fra.super_cup': { name: 'Trophée des Champions', logo: '2345', isPrimary: false }
};

export const FranceServiceEnhanced = {
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

  // Fetch games from all French competitions (main league + domestic cups)
  async fetchGamesFromAllCompetitions(dateRange) {
    const allGames = [];
    
    // Get competitions for France
    const allCompetitionsToCheck = [
      { code: 'fra.coupe_de_france', name: 'Coupe de France' }, // Domestic cups FIRST (prioritized)
      { code: 'fra.super_cup', name: 'Trophée des Champions' },
      { code: 'fra.1', name: 'Ligue 1' } // Main league LAST
    ];
    
    console.log(`Fetching France games from ${allCompetitionsToCheck.length} competitions:`, allCompetitionsToCheck.map(c => c.code));
    
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
            game.competitionName = FRANCE_COMPETITIONS[competition.code]?.name || competition.name;
            game.isDomesticCup = competition.code !== 'fra.1';
            game.priority = competition.code !== 'fra.1' ? 1 : 2; // Competition = 1, League = 2
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
    
    console.log(`Total France games found: ${allGames.length}`);
    return allGames;
  },

  // Fetch current matches/scoreboard with date filter (like MLB service)
  async getScoreboard(dateFilter = 'today') {
    try {
      const { startDate, endDate } = this.getDateRange(dateFilter);
      const dateRange = this.createDateRangeString(startDate, endDate);
      
      console.log(`Fetching France scoreboard for ${dateFilter}:`, dateRange);
      
      // Fetch from all competitions
      const games = await this.fetchGamesFromAllCompetitions(dateRange);
      
      return {
        events: games,
        leagues: games.length > 0 ? [games[0].leaguesData] : []
      };
    } catch (error) {
      console.error('Error fetching France scoreboard:', error);
      throw error;
    }
  },

  // Fetch game details
  async getGameDetails(gameId, competitionHint = null) {
    try {
      // First, if we don't already have a strong hint, query the sports core API
      // event resource which includes a season.$ref that identifies the league code
      // (e.g. fra.coupe_de_france). Using that is the most reliable way to determine
      // the actual competition for the event.
      let detectedHint = null;
      if (!competitionHint) {
        try {
          // Try each France competition to find the right one
          for (const comp of ['fra.1', 'fra.coupe_de_france', 'fra.super_cup']) {
            const coreResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${comp}/events/${gameId}?lang=en&region=us`);
            if (coreResponse.ok) {
              const coreData = await coreResponse.json();
              // Try to read season.$ref or seasonType.$ref which include the league code
              const seasonRef = coreData?.season?.$ref || coreData?.seasonType?.$ref || coreData?.$ref;
              if (seasonRef && typeof seasonRef === 'string') {
                // seasonRef example: http://sports.core.api.espn.com/v2/sports/soccer/leagues/fra.coupe_de_france/seasons/2024?lang=en&region=us
                const match = seasonRef.match(/leagues\/([^\/]+)\/seasons/);
                if (match && match[1]) {
                  detectedHint = match[1];
                  break; // Found the right competition
                }
              }
            }
          }
        } catch (coreErr) {
          // Ignore core API errors and continue with existing heuristics
          console.log('Could not fetch core event resource for hint:', coreErr);
        }
      }

      // Build competition order. If we have a hint (from params or core API),
      // put it first to prefer that endpoint. Otherwise use cup-first order.
      let competitionOrder = ['fra.coupe_de_france', 'fra.super_cup', 'fra.1'];
      const effectiveHint = competitionHint || detectedHint;
      if (effectiveHint) {
        // Normalize hint to a key if it matches one of our known codes
        const normalized = Object.keys(FRANCE_COMPETITIONS).find(k => k === effectiveHint || FRANCE_COMPETITIONS[k].name.toLowerCase() === String(effectiveHint).toLowerCase() || k === String(effectiveHint));
        if (normalized) {
          // Place the hinted competition at the front
          competitionOrder = [normalized, ...competitionOrder.filter(c => c !== normalized)];
        }
      }

      for (const competition of competitionOrder) {
        try {
          const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${competition}/summary?event=${gameId}`);
          if (response.ok) {
            const data = await response.json();
            // For France competitions, always use our mapping instead of API-provided names
            // to avoid getting French/foreign competition names in France games
            data.competitionCode = competition;
            data.competitionName = FRANCE_COMPETITIONS[competition].name;
            return data;
          }
        } catch (err) {
          console.log(`Game ${gameId} not found in ${competition}`, err);
        }
      }
      throw new Error(`Game ${gameId} not found in any French competition`);
    } catch (error) {
      console.error('Error fetching France game details:', error);
      throw error;
    }
  },

  // Fetch league standings using the same CDN endpoint as soccer web app
  async getStandings() {
    try {
      const currentSeason = new Date().getFullYear().toString();
      const leagueCode = 'fra.1'; // Ligue 1
      
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
      console.error('Error fetching France standings:', error);
      throw error;
    }
  },

  // Fetch team information
  async getTeam(teamId) {
    try {
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/teams/${teamId}`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching France team:', error);
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
      console.error('Error fetching France player:', error);
      throw error;
    }
  },

  // Search for teams
  async searchTeams(query) {
    try {
      const response = await fetch(`${FRANCE_BASE_URL}/teams?limit=50`);
      const data = await response.json();

      if (data.sports && data.sports[0] && data.sports[0].leagues && data.sports[0].leagues[0]) {
        const teams = data.sports[0].leagues[0].teams;
        return teams.filter(team =>
          team.team.displayName.toLowerCase().includes(query.toLowerCase())
        );
      }
      return [];
    } catch (error) {
      console.error('Error searching France teams:', error);
      throw error;
    }
  },

  // Search for players (using same approach as team-page.js)
  async searchPlayers(query) {
    try {
      // Get all teams first
      const response = await fetch(`${FRANCE_BASE_URL}/teams`);
      const data = await response.json();
      
      if (!data.sports || !data.sports[0] || !data.sports[0].leagues || !data.sports[0].leagues[0]) {
        return [];
      }

      const teams = data.sports[0].leagues[0].teams;
      const allPlayers = [];
      
      // Fetch rosters for ALL teams (removed the slice limit)
      const teamPromises = teams.map(async (team) => {
        try {
          const teamId = team.team.id;
          const rosterResponse = await fetch(`${FRANCE_BASE_URL}/teams/${teamId}/roster?season=${getSoccerYear()}`);
          const rosterData = await rosterResponse.json();
          
          if (rosterData.athletes) {
            return rosterData.athletes.map(athlete => {
              const player = athlete.athlete || athlete;
              let firstName, lastName;

              // Handle name splitting like in team-page.js
              if (player.firstName && player.firstName.includes(' ')) {
                const nameParts = player.firstName.split(' ');
                firstName = nameParts[0];
                lastName = nameParts.slice(1).join(' ');
              } else {
                firstName = player.firstName || "Unknown";
                lastName = (player.lastName && player.lastName !== player.firstName) ? player.lastName : "";
              }

              const displayName = lastName ? `${firstName} ${lastName}`.trim() : firstName;
              
              return {
                id: player.id,
                firstName: firstName,
                lastName: lastName,
                displayName: displayName,
                fullName: player.fullName || displayName,
                position: player.position?.abbreviation || player.position?.name || 'N/A',
                team: team.team.displayName,
                teamAbbr: team.team.abbreviation || team.team.displayName.substring(0, 3).toUpperCase(),
                teamId: team.team.id,
                jersey: player.jersey || 'N/A',
                athlete: player // Keep original data
              };
            });
          }
          return [];
        } catch (teamError) {
          console.error(`Error fetching team ${team.team.displayName}:`, teamError);
          return [];
        }
      });
      
      // Use Promise.allSettled to continue even if some teams fail
      const teamRosters = await Promise.allSettled(teamPromises);
      
      // Extract successful results and flatten
      teamRosters.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          allPlayers.push(...result.value);
        }
      });
      
      // Filter players based on query (improved search)
      // If query is empty, return all players (for comparison screen)
      if (!query || query.trim() === '') {
        return allPlayers;
      }
      
      return allPlayers.filter(player => {
        const fullName = `${player.firstName || ''} ${player.lastName || ''}`.toLowerCase();
        const displayName = (player.displayName || '').toLowerCase();
        const teamName = (player.team || '').toLowerCase();
        const queryLower = query.toLowerCase();
        
        return fullName.includes(queryLower) || 
               displayName.includes(queryLower) || 
               teamName.includes(queryLower) ||
               (player.firstName && player.firstName.toLowerCase().includes(queryLower)) ||
               (player.lastName && player.lastName.toLowerCase().includes(queryLower));
      }); // Removed the .slice(0, 50) limit to allow all matching players
      
    } catch (error) {
      console.error('Error searching France players:', error);
      // Return empty array instead of throwing to prevent crashes
      return [];
    }
  },

  // Get competition details
  getCompetitionInfo() {
    return {
      leagues: FRANCE_COMPETITIONS,
      apiCode: 'fra.1'
    };
  },

  // Get league information
  getLeagueInfo() {
    return {
      id: 'france',
      name: 'France',
      fullName: 'Ligue 1',
      country: 'France',
      flag: 'https://a.espncdn.com/i/teamlogos/countries/500/fra.png',
      apiCode: 'fra.1'
    };
  }
};
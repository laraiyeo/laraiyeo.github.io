// NFL API Service for Mobile App
// Adapted from your existing scoreboard.js

export class NFLService {
  static TEAMS_API_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams";
  static SCOREBOARD_API_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
  
  // Cache for API responses
  static cache = new Map();
  static cacheTimestamps = new Map();
  static CACHE_DURATION = 2000; // 2 seconds cache duration for better responsiveness during live games

  // Convert any URL to HTTPS (reused from your existing code)
  static convertToHttps(url) {
    if (typeof url !== 'string') return url;
    return url.replace(/^http:\/\//i, 'https://');
  }

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

  // Get NFL Position Group (reused from your existing code)
  static getPositionGroup(position) {
    const positionGroups = {
      'QB': 'QB',
      'RB': 'RB', 'FB': 'RB',
      'WR': 'WR/TE', 'TE': 'WR/TE',
      'OT': 'OL', 'G': 'OL', 'C': 'OL', 'OL': 'OL',
      'DE': 'DL/LB', 'DT': 'DL/LB', 'LB': 'DL/LB', 'OLB': 'DL/LB', 'MLB': 'DL/LB', 'ILB': 'DL/LB',
      'CB': 'DB', 'S': 'DB', 'FS': 'DB', 'SS': 'DB', 'DB': 'DB',
      'K': 'K/P', 'P': 'K/P', 'PK': 'K/P',
      'LS': 'LS'
    };
    
    return positionGroups[position] || 'OTHER';
  }

  // Fetch NFL teams
  static async getTeams() {
    try {
      const response = await fetch(this.TEAMS_API_URL);
      const data = await response.json();
      return data.sports[0].leagues[0].teams;
    } catch (error) {
      console.error('Error fetching NFL teams:', error);
      throw error;
    }
  }

  // Fetch NFL scoreboard
  static async getScoreboard(startDate = null, endDate = null) {
    const cacheKey = `scoreboard_${startDate || 'today'}_${endDate || startDate || 'today'}`;
    
    return this.getCachedData(cacheKey, async () => {
      let url = this.SCOREBOARD_API_URL;
      console.log('NFLService.getScoreboard called with:', { startDate, endDate });
      
      if (startDate) {
        if (endDate && endDate !== startDate) {
          // Date range format: dates=20250910-20250917
          url += `?dates=${startDate}-${endDate}`;
          console.log('NFLService: Using date range format:', `${startDate}-${endDate}`);
        } else {
          // Single date format: dates=20250910
          url += `?dates=${startDate}`;
          console.log('NFLService: Using single date format:', startDate);
        }
      }
      
      console.log('NFLService: Final API URL:', url);
      const response = await fetch(url);
      const data = await response.json();
      return data;
    });
  }

  // Fetch game details with caching
  static async getGameDetails(gameId) {
    const cacheKey = `gameDetails_${gameId}`;
    
    return this.getCachedData(cacheKey, async () => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gameId}`;
      console.log('NFLService.getGameDetails called with gameId:', gameId);
      console.log('NFLService.getGameDetails: Using summary endpoint:', url);
      
      const response = await fetch(this.convertToHttps(url));
      const data = await response.json();
      
      return data;
    });
  }

  // Get boxscore data for team stats
  static async getBoxScore(gameId) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gameId}`;
      const response = await fetch(url);
      const data = await response.json();
      return data.boxscore || null;
    } catch (error) {
      console.error('Error fetching boxscore:', error);
      return null;
    }
  }

  // Get leaders data
  static async getLeaders(gameId) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gameId}`;
      const response = await fetch(url);
      const data = await response.json();
      return data.leaders || null;
    } catch (error) {
      console.error('Error fetching leaders:', error);
      return null;
    }
  }

  // Get position stats for card (simplified version of your existing function)
  static getPositionStatsForCard(positionGroup, boxScoreData, playerName, preferredStatCategory = null) {
    if (!boxScoreData || !boxScoreData.gamepackageJSON?.boxscore?.players) {
      return [];
    }

    const players = boxScoreData.gamepackageJSON.boxscore.players;
    let playerStats = {};

    // Search for player in box score data
    for (const team of players) {
      for (const statCategory of team.statistics || []) {
        for (const athlete of statCategory.athletes || []) {
          const athleteName = athlete.athlete?.displayName || '';
          
          if (athleteName === playerName) {
            const stats = athlete.stats || [];
            for (let i = 0; i < stats.length; i++) {
              const statName = statCategory.labels?.[i];
              if (statName) {
                playerStats[statName] = stats[i];
              }
            }
            break;
          }
        }
      }
    }

    return Object.entries(playerStats).map(([key, value]) => ({
      name: key,
      value: value
    }));
  }

  // Format team data for mobile display
  static formatTeamForMobile(team) {
    return {
      id: team.team.id,
      displayName: team.team.displayName,
      shortDisplayName: team.team.shortDisplayName,
      abbreviation: team.team.abbreviation,
      logo: this.convertToHttps(team.team.logo),
      color: team.team.color,
      alternateColor: team.team.alternateColor,
      record: team.team.record?.items?.[0]?.summary || '0-0'
    };
  }

  // Format game data for mobile display
  static formatGameForMobile(game) {
    const competition = game.competitions[0];
    const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
    const awayTeam = competition.competitors.find(c => c.homeAway === 'away');

    // Format status for better display
    let formattedStatus = game.status.type.description;
    if (game.status.type.description === 'Halftime') {
      formattedStatus = 'Halftime';
    } else if (game.status.period && game.status.period > 0 && !game.status.type.completed) {
      // Game is in progress, show quarter information
      const quarters = ['1st Quarter', '2nd Quarter', '3rd Quarter', '4th Quarter'];
      if (game.status.period <= 4) {
        formattedStatus = quarters[game.status.period - 1];
      } else {
        formattedStatus = `Overtime ${game.status.period - 4}`;
      }
    }

    // Get situation data if available
    const situation = competition.situation;
    let formattedSituation = null;
    if (situation) {
      // Format possession text like web version
      let possessionText = situation.possessionText || "";
      if (situation.possession) {
        if (situation.possession === homeTeam.id) {
          possessionText = possessionText + " ▶";
        } else if (situation.possession === awayTeam.id) {
          possessionText = "◀ " + possessionText;
        }
      }
      
      formattedSituation = {
        possession: situation.possession,
        possessionText: possessionText,
        down: situation.down,
        distance: situation.distance,
        yardLine: situation.yardLine,
        shortDownDistanceText: situation.shortDownDistanceText,
        downDistanceText: situation.downDistanceText,
        isRedZone: situation.isRedZone
      };
    }

    return {
      id: game.id,
      status: formattedStatus,
      displayClock: game.status.displayClock,
      period: game.status.period,
      isCompleted: game.status.type.completed,
      situation: formattedSituation,
      homeTeam: {
        id: homeTeam.id,
        displayName: homeTeam.team.displayName,
        abbreviation: homeTeam.team.abbreviation,
        logo: this.convertToHttps(homeTeam.team.logo),
        score: homeTeam.score,
        record: homeTeam.records?.[0]?.summary || '0-0'
      },
      awayTeam: {
        id: awayTeam.id,
        displayName: awayTeam.team.displayName,
        abbreviation: awayTeam.team.abbreviation,
        logo: this.convertToHttps(awayTeam.team.logo),
        score: awayTeam.score,
        record: awayTeam.records?.[0]?.summary || '0-0'
      },
      venue: competition.venue?.fullName || '',
      date: new Date(game.date),
      broadcasts: competition.broadcasts?.[0]?.names || []
    };
  }

  // Get drives for a specific game (optimized version with caching)
  static async getDrives(gameId) {
    const cacheKey = `drives_${gameId}`;
    
    return this.getCachedData(cacheKey, async () => {
      const drivesUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${gameId}/competitions/${gameId}/drives?lang=en&region=us`;
      
      const response = await fetch(this.convertToHttps(drivesUrl));
      const drivesData = await response.json();
      
      const drives = drivesData.items || [];
      
      // Fetch detailed information for each drive with limited concurrent requests
      const batchSize = 5; // Process 5 drives at a time
      const detailedDrives = [];
      
      for (let i = 0; i < drives.length; i += batchSize) {
        const batch = drives.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(async (drive) => {
          try {
            // Get team information (only if needed)
            let teamInfo = null;
            if (drive.team && drive.team.$ref) {
              try {
                const teamResponse = await fetch(this.convertToHttps(drive.team.$ref));
                teamInfo = await teamResponse.json();
              } catch (error) {
                console.warn('Error fetching team info:', error);
              }
            }

            // Get plays information if available (but don't fetch individual play details)
            let playsData = [];
            if (drive.plays && drive.plays.$ref) {
              try {
                const playsResponse = await fetch(this.convertToHttps(drive.plays.$ref));
                const playsResult = await playsResponse.json();
                playsData = playsResult.items || [];
                
                // Don't fetch detailed play information upfront - fetch on demand
                // This saves hundreds of API calls
              } catch (error) {
                console.warn('Error fetching plays for drive:', error);
              }
            }

            return {
              ...drive,
              team: teamInfo ? {
                ...teamInfo,
                logo: teamInfo.logos?.[1]?.href || teamInfo.logos?.[0]?.href
              } : null,
              plays: playsData
            };
          } catch (error) {
            console.error('Error processing drive:', error);
            return drive;
          }
        }));
        
        detailedDrives.push(...batchResults);
      }

      return detailedDrives;
    });
  }

  // Get detailed player statistics
  static async getPlayerStats(playerId) {
    try {
      const currentYear = new Date().getFullYear();
      const previousYear = currentYear - 1;

      // Helper function to try fetching stats
      const tryFetchStats = async (year, type) => {
        const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${year}/types/${type}/athletes/${playerId}/statistics?lang=en&region=us`;
        console.log('Fetching player stats from:', url);
        
        const response = await fetch(this.convertToHttps(url));
        
        if (response.ok) {
          const data = await response.json();
          
          // Check if the response contains the error message about no stats found
          if (data.error && data.error.code === 404 && data.error.message === "No stats found.") {
            console.log(`No stats found for types/${type}, year ${year}`);
            return null;
          } else if (data.splits && data.splits.categories && data.splits.categories.length > 0) {
            console.log(`Successfully fetched types/${type} stats for athlete ${playerId}, year ${year}`);
            return data;
          }
        } else if (response.status === 404) {
          console.log(`404 error for types/${type}, year ${year}`);
          return null;
        }
        return null;
      };

      // Try current year, types/2 first
      let data = await tryFetchStats(currentYear, 2);
      if (data) return data;

      // Try current year, types/1
      data = await tryFetchStats(currentYear, 1);
      if (data) return data;

      // Try previous year, types/2
      data = await tryFetchStats(previousYear, 2);
      if (data) return data;

      // Try previous year, types/1
      data = await tryFetchStats(previousYear, 1);
      if (data) return data;

      console.log('No player stats found for any year/type combination');
      return null;
      
    } catch (error) {
      console.error('Error fetching player stats:', error);
      throw error;
    }
  }

  // Get player stats for a specific game (from box score)
  static async getPlayerGameStats(gameId, playerId) {
    try {
      const url = `https://cdn.espn.com/core/nfl/boxscore?xhr=1&gameId=${gameId}`;
      console.log('Fetching game box score from:', url);
      
      const response = await fetch(this.convertToHttps(url));
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const gameData = await response.json();
      console.log('Game box score data received:', gameData);
      
      // Use the exact same structure as team-page.js
      const players = gameData.gamepackageJSON?.boxscore?.players || [];
      console.log("Players data:", players);

      if (players.length === 0) {
        console.log('No box score data available for this game');
        return null;
      }

      // Find the player in the game stats
      let playerStats = {};
      let foundPlayer = false;

      for (const team of players) {
        if (!team.statistics || team.statistics.length === 0) continue;

        // Search through all statistics categories for this team
        for (const statCategory of team.statistics) {
          const athletes = statCategory.athletes || [];
          
          // Try different ID matching approaches
          const foundPlayerInCategory = athletes.find(athlete => 
            athlete.athlete.id === playerId.toString() ||
            athlete.athlete.id === playerId
          );

          if (foundPlayerInCategory) {
            foundPlayer = true;
            playerStats[statCategory.name] = {
              name: statCategory.name,
              displayName: statCategory.displayName || statCategory.name,
              stats: foundPlayerInCategory.stats || []
            };
            console.log(`Player found in ${statCategory.name}:`, foundPlayerInCategory.stats);
          }
        }

        if (foundPlayer) break;
      }

      if (!foundPlayer) {
        console.log('Player not found in game statistics');
        return null;
      }

      // Convert to the format expected by the mobile app
      const formattedStats = {
        splits: {
          categories: Object.values(playerStats).map(category => ({
            name: category.name,
            displayName: category.displayName,
            stats: category.stats.map((statValue, index) => {
              // Map common stat names based on category and index
              let statName = `Stat ${index + 1}`;
              let displayName = statName;
              
              if (category.name === 'passing') {
                const passingStats = ['C/ATT', 'Passing Yards', 'Avg', 'Passing TDs', 'INTs', 'Sacks', 'QBR', 'Rating'];
                displayName = passingStats[index] || statName;
              } else if (category.name === 'rushing') {
                const rushingStats = ['Attempts', 'Rushing Yards', 'Avg', 'Rushing TDs', 'Long'];
                displayName = rushingStats[index] || statName;
              } else if (category.name === 'receiving') {
                const receivingStats = ['Receptions', 'Receiving Yards', 'Avg', 'Receiving TDs', 'Long', 'Targets'];
                displayName = receivingStats[index] || statName;
              } else if (category.name === 'defensive') {
                const defensiveStats = ['Tackles', 'Solo', 'Sacks', 'TFL', 'QB Hits', 'PD'];
                displayName = defensiveStats[index] || statName;
              }
              
              return {
                name: statName,
                displayName: displayName,
                value: statValue,
                displayValue: statValue.toString()
              };
            })
          }))
        }
      };

      return formattedStats;
      
    } catch (error) {
      console.error('Error fetching player game stats:', error);
      throw error;
    }
  }

  // Get current game situation (possession, down, distance, field position)
  static async getGameSituation(gameId, gameDate = null) {
    try {
      console.log('NFLService.getGameSituation called with gameId:', gameId);
      
      // Use the game summary endpoint directly instead of searching through scoreboard
      const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gameId}`;
      console.log('NFLService.getGameSituation: Using summary endpoint:', summaryUrl);
      
      const response = await fetch(this.convertToHttps(summaryUrl));
      const data = await response.json();
      
      // Extract game situation from summary data
      const event = data.header || data;
      if (event && event.competitions && event.competitions[0]) {
        return this.extractGameSituation({ ...event, competitions: event.competitions });
      }
      
      return null;
    } catch (error) {
      console.error('Error getting game situation:', error);
      return null;
    }
  }

  // Extract game situation from a game object (helper method)
  static extractGameSituation(selectedGame) {
    // Get situation data from the game (like web version)
    const situation = selectedGame.competitions?.[0]?.situation;
    if (situation) {
      
      // Calculate proper ball position for field display
      // ESPN yardLine is from 0-100, where 0 is one team's goal line and 100 is the other
      let ballPosition = situation.yardLine !== undefined && situation.yardLine !== null ? situation.yardLine : null;
      
      // Only return data if we have valid down and distance info
      if (situation.down && situation.down > 0 && situation.distance !== undefined) {
        return {
          possession: situation.possession,
          possessionText: situation.possessionText,
          down: situation.down,
          distance: situation.distance,
          yardLine: ballPosition,
          shortDownDistanceText: situation.shortDownDistanceText,
          downDistanceText: situation.downDistanceText,
          isRedZone: situation.isRedZone,
          timeouts: {
            home: situation.homeTimeouts,
            away: situation.awayTimeouts
          }
        };
      }
    }
    // If no situation but game found, return basic info
    return {
      possession: null,
      down: null,
      distance: null,
      yardLine: 50,
      possessionText: null
    };
  }

  // Get game summary data
  static async getSummary(gameId) {
    const cacheKey = `summary_${gameId}`;
    
    return this.getCachedData(cacheKey, async () => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gameId}`;
      const response = await fetch(this.convertToHttps(url));
      const data = await response.json();
      
      // Extract summary-specific data (news, highlights, recap, etc.)
      return {
        recap: data.recap || null,
        news: data.news || null,
        highlights: data.highlights || null,
        articles: data.articles || null,
        winprobability: data.winprobability || null,
        pickcenter: data.pickcenter || null
      };
    });
  }

  // Get play-by-play data
  static async getPlays(gameId) {
    const cacheKey = `plays_${gameId}`;
    
    return this.getCachedData(cacheKey, async () => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gameId}`;
      const response = await fetch(this.convertToHttps(url));
      const data = await response.json();
      
      // Extract plays data from drives or separate plays endpoint
      let plays = [];
      
      // Try to get plays from gamepackageJSON first
      if (data.gamepackageJSON?.drives) {
        data.gamepackageJSON.drives.forEach(drive => {
          if (drive.plays) {
            plays.push(...drive.plays);
          }
        });
      }
      
      // If no plays found, try alternate structure
      if (plays.length === 0 && data.drives) {
        data.drives.forEach(drive => {
          if (drive.plays && Array.isArray(drive.plays)) {
            plays.push(...drive.plays);
          }
        });
      }
      
      // Sort plays by sequence if available
      return plays.sort((a, b) => {
        const seqA = parseInt(a.sequenceNumber) || 0;
        const seqB = parseInt(b.sequenceNumber) || 0;
        return seqA - seqB;
      });
    });
  }
}
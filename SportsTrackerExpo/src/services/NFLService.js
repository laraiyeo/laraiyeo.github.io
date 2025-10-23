// NFL API Service for Mobile App
// Uses ESPN NFL endpoints with AsyncStorage persistent caching

import { BaseCacheService } from './BaseCacheService';

export class NFLService extends BaseCacheService {
  static TEAMS_API_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams";
  static SCOREBOARD_API_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
  
  // Override to detect NFL live games
  static hasLiveEvents(data) {
    if (!data || !data.events) return false;
    return data.events.some(game => 
      game.status && (
        game.status.type?.state === 'in' || 
        game.status.type?.completed === false ||
        game.competitions?.[0]?.status?.type?.state === 'in'
      )
    );
  }

  // Override to determine NFL data type
  static getDataType(data) {
    if (!data || !data.events) return 'static';
    
    const hasLive = this.hasLiveEvents(data);
    if (hasLive) return 'live';
    
    const hasScheduled = data.events.some(game => 
      game.status?.type?.state === 'pre' || 
      game.competitions?.[0]?.status?.type?.state === 'pre'
    );
    if (hasScheduled) return 'scheduled';
    
    return 'finished';
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

  // Global team cache to prevent duplicate team API calls
  static teamCache = new Map();
  
  // Get team data with global caching
  static async getTeamData(teamUrl) {
    if (this.teamCache.has(teamUrl)) {
      return this.teamCache.get(teamUrl);
    }
    
    try {
      const response = await fetch(this.convertToHttps(teamUrl));
      const teamInfo = await response.json();
      this.teamCache.set(teamUrl, teamInfo);
      return teamInfo;
    } catch (error) {
      console.warn('Error fetching team info:', error);
      return null;
    }
  }

  // Fetch NFL teams
  // Convert any URL to HTTPS (for compatibility)
  static convertToHttps(url) {
    if (typeof url !== 'string') return url;
    return url.replace(/^http:\/\//i, 'https://');
  }

  // Fetch NFL teams with caching
  static async getTeams() {
    const cacheKey = 'nfl_teams';
    return this.getCachedData(cacheKey, async () => {
      const response = await fetch(this.TEAMS_API_URL, { headers: this.getBrowserHeaders() });
      const data = await response.json();
      return data.sports[0].leagues[0].teams;
    }, 'teams');
  }

  // Fetch NFL scoreboard with smart caching
  static async getScoreboard(startDate = null, endDate = null) {
    const cacheKey = `nfl_scoreboard_${startDate || 'today'}_${endDate || startDate || 'today'}`;
    
    return this.getCachedData(cacheKey, async () => {
      let url = this.SCOREBOARD_API_URL;
      
      if (startDate) {
        if (endDate && endDate !== startDate) {
          // Date range format: dates=20250910-20250917
          url += `?dates=${startDate}-${endDate}`;
        } else {
          // Single date format: dates=20250910
          url += `?dates=${startDate}`;
        }
      }
      const response = await fetch(url, { headers: this.getBrowserHeaders() });
      const data = await response.json();
      return data;
    }, 'scoreboard');
  }

  // Fetch game details with caching
  static async getGameDetails(gameId) {
    const cacheKey = `nfl_gameDetails_${gameId}`;
    
    return this.getCachedData(cacheKey, async () => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gameId}`;
      const response = await fetch(url, { headers: this.getBrowserHeaders() });
      const data = await response.json();
      return data;
    }, 'game_details');
  }

  // Get boxscore data for team stats - use cached game details to avoid duplicate API call
  static async getBoxScore(gameId) {
    const gameDetails = await this.getGameDetails(gameId);
    return gameDetails.boxscore || null;
  }

  // Get leaders data - use cached game details to avoid duplicate API call
  static async getLeaders(gameId) {
    const gameDetails = await this.getGameDetails(gameId);
    return gameDetails.leaders || null;
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
      
      const response = await fetch(this.convertToHttps(drivesUrl), { headers: this.getBrowserHeaders() });
      const drivesData = await response.json();
      
      const drives = drivesData.items || [];
      
      // Cache for team data to avoid redundant fetches within the same request
      const teamCache = new Map();
      
      // For performance optimization, distinguish between recent drives that need plays data
      // and older drives that only need team info (for FavoritesScreen and general use)
      const isLiveUpdate = drives.length > 5;
      const recentDriveCount = 2; // Only fetch plays for the most recent 2 drives
      
      // Process all drives in batches to get team information for all drives
      const batchSize = 10; // Process 10 drives at a time
      const detailedDrives = [];
      
      for (let i = 0; i < drives.length; i += batchSize) {
        const batch = drives.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(async (drive, driveIndex) => {
          try {
            // Get team information (always fetch for all drives to show proper team names)
            let teamInfo = null;
            if (drive.team && drive.team.$ref) {
              const teamUrl = drive.team.$ref;
              if (teamCache.has(teamUrl)) {
                teamInfo = teamCache.get(teamUrl);
              } else {
                try {
                  const teamResponse = await fetch(this.convertToHttps(teamUrl));
                  teamInfo = await teamResponse.json();
                  teamCache.set(teamUrl, teamInfo);
                } catch (error) {
                  console.warn('Error fetching team info:', error);
                }
              }
            }

            // Only fetch plays data for recent drives or if not a live update (optimized for performance)
            let playsData = [];
            const actualDriveIndex = i + driveIndex; // Actual position in the full drives array
            const driveIndexFromEnd = drives.length - actualDriveIndex - 1; // Distance from the end
            const shouldFetchPlays = !isLiveUpdate || driveIndexFromEnd < recentDriveCount;
            
            console.log(`Drive ${actualDriveIndex + 1}/${drives.length}: indexFromEnd=${driveIndexFromEnd}, shouldFetch=${shouldFetchPlays}, isLiveUpdate=${isLiveUpdate}`);
            
            const playsRef = drive.plays?.$ref || drive.plays?.href;
            if (shouldFetchPlays && playsRef) {
              try {
                console.log(`Fetching plays for drive ${actualDriveIndex + 1} during initial load`);
                const playsResponse = await fetch(this.convertToHttps(playsRef));
                const playsResult = await playsResponse.json();
                playsData = playsResult.items || [];
                console.log(`Loaded ${playsData.length} plays for drive ${actualDriveIndex + 1}`);
              } catch (error) {
                console.warn('Error fetching plays for drive:', error);
              }
            } else {
              console.log(`Skipping plays for drive ${actualDriveIndex + 1} (will load on demand). PlaysRef: ${playsRef}, shouldFetch: ${shouldFetchPlays}`);
            }

            return {
              ...drive,
              team: teamInfo ? {
                ...teamInfo,
                logo: teamInfo.logos?.[1]?.href || teamInfo.logos?.[0]?.href
              } : null,
              plays: playsData,
              hasPlaysData: shouldFetchPlays // Flag to indicate if plays were fetched
            };
          } catch (error) {
            console.error('Error processing drive:', error);
            return {
              ...drive,
              team: null,
              plays: [],
              hasPlaysData: false
            };
          }
        }));
        
        detailedDrives.push(...batchResults);
      }

      return detailedDrives;
    });
  }

  // Get drives for game details screen with complete data (all drives, all plays)
  static async getDrivesComplete(gameId) {
    const cacheKey = `drives_complete_${gameId}`;
    
    return this.getCachedData(cacheKey, async () => {
      const drivesUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${gameId}/competitions/${gameId}/drives?lang=en&region=us`;
      
      const response = await fetch(this.convertToHttps(drivesUrl));
      const drivesData = await response.json();
      
      const drives = drivesData.items || [];
      
      // Process all drives in batches to get team information
      const batchSize = 10; // Process 10 drives at a time
      const detailedDrives = [];
      
      for (let i = 0; i < drives.length; i += batchSize) {
        const batch = drives.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(async (drive, driveIndex) => {
          try {
            // Get team information using global cache to prevent duplicate API calls
            let teamInfo = null;
            if (drive.team && drive.team.$ref) {
              teamInfo = await this.getTeamData(drive.team.$ref);
            }

            // Use the inline plays data that's already included in the drives response
            // No need to make additional API calls - the plays.items array is already there!
            let playsData = [];
            const actualDriveIndex = i + driveIndex;
            
            if (drive.plays && drive.plays.items) {
              playsData = drive.plays.items;
              console.log(`[Complete] Drive ${actualDriveIndex + 1}/${drives.length}: Using inline plays data (${playsData.length} plays)`);
            } else {
              console.log(`[Complete] Drive ${actualDriveIndex + 1}/${drives.length}: No inline plays data available`);
            }

            return {
              ...drive,
              team: teamInfo ? {
                ...teamInfo,
                logo: teamInfo.logos?.[1]?.href || teamInfo.logos?.[0]?.href
              } : null,
              plays: playsData,
              hasPlaysData: playsData.length > 0
            };
          } catch (error) {
            console.error('Error processing drive:', error);
            return {
              ...drive,
              team: null,
              plays: [],
              hasPlaysData: false
            };
          }
        }));
        
        detailedDrives.push(...batchResults);
      }

      return detailedDrives;
    });
  }

  // Get plays for a specific drive (fetch on demand)
  static async getDrivePlays(drive) {
    try {
      // Check if drive has plays reference
      const playsRef = drive.plays?.$ref || drive.plays?.href;
      if (!playsRef) {
        console.warn('No plays reference found for drive:', drive.id);
        console.log('Drive object structure:', JSON.stringify(drive, null, 2));
        return [];
      }

      console.log('Fetching plays for drive:', drive.id, 'from URL:', playsRef);
      const playsResponse = await fetch(this.convertToHttps(playsRef));
      
      if (!playsResponse.ok) {
        console.error('Failed to fetch plays, status:', playsResponse.status);
        return [];
      }
      
      const playsResult = await playsResponse.json();
      const plays = playsResult.items || [];
      console.log('Successfully fetched', plays.length, 'plays for drive:', drive.id);
      return plays;
    } catch (error) {
      console.error('Error fetching drive plays:', error);
      return [];
    }
  }

  // Get detailed player statistics
  static async getPlayerStats(playerId) {
    try {
      const currentYear = new Date().getFullYear();
      const previousYear = currentYear - 1;

      // Helper function to try fetching stats
      const tryFetchStats = async (year, type) => {
        const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${year}/types/${type}/athletes/${playerId}/statistics?lang=en&region=us`;
        
        const response = await fetch(this.convertToHttps(url));
        
        if (response.ok) {
          const data = await response.json();
          
          // Check if the response contains the error message about no stats found
          if (data.error && data.error.code === 404 && data.error.message === "No stats found.") {
            return null;
          } else if (data.splits && data.splits.categories && data.splits.categories.length > 0) {
            return data;
          }
        } else if (response.status === 404) {
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
      
      const response = await fetch(this.convertToHttps(url));
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const gameData = await response.json();
      
      // Use the exact same structure as team-page.js
      const players = gameData.gamepackageJSON?.boxscore?.players || [];

      if (players.length === 0) {
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
          }
        }

        if (foundPlayer) break;
      }

      if (!foundPlayer) {
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

  // Get current game situation (possession, down, distance, field position) - use cached game details
  static async getGameSituation(gameId, gameDate = null) {
    try {
      // Use cached game details instead of making another API call
      const gameDetails = await this.getGameDetails(gameId);
      
      // Extract game situation from cached summary data
      const event = gameDetails.header || gameDetails;
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

  static clearCache() {
    return super.clearCache();
  }
}
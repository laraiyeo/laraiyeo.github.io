// NHL API Service for Mobile App
// Combines ESPN NHL endpoints with nhl api fallback for additional data

import { BaseCacheService } from './BaseCacheService';

export class NHLService extends BaseCacheService {
  static SCOREBOARD_API_URL = "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard";
  static TEAMS_API_URL = "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams";
  static NHL_API_BASE = "https://api-web.nhle.com/v1";

  // Smart live game detection for NHL
  static hasLiveEvents(data) {
    try {
      const events = data?.events || [];
      return events.some(event => {
        const status = event?.status?.type?.name;
        const description = event?.status?.type?.description;
        
        // NHL live statuses
        return status === 'STATUS_IN_PROGRESS' || 
               description?.toLowerCase().includes('period') ||
               description?.toLowerCase().includes('overtime') ||
               description?.toLowerCase().includes('intermission');
      });
    } catch (error) {
      console.error('NHLService: Error detecting live events', error);
      return false;
    }
  }

  static getDataType(data, context) {
    try {
      if (this.hasLiveEvents(data)) {
        return 'live';
      }
      
      if (context?.includes('standings') || context?.includes('teams')) {
        return 'static';
      }
      
      // Check if events are scheduled or finished
      const events = data?.events || [];
      const hasScheduled = events.some(event => 
        event?.status?.type?.name === 'STATUS_SCHEDULED'
      );
      const hasFinished = events.some(event => 
        event?.status?.type?.completed === true
      );
      
      if (hasScheduled && !hasFinished) return 'scheduled';
      if (hasFinished && !hasScheduled) return 'finished';
      
      return 'scheduled'; // Default for mixed or unknown
    } catch (error) {
      console.error('NHLService: Error determining data type', error);
      return 'scheduled';
    }
  }

  // Convert ESPN/HTTP urls to HTTPS
  static convertToHttps(url) {
    if (typeof url !== 'string') return url;
    return url.replace(/^http:\/\//i, 'https://');
  }

  // Fetch scoreboard from ESPN (primary)
  static async getScoreboard(startDate = null, endDate = null) {
    const cacheKey = `nhl_scoreboard_${startDate || 'today'}_${endDate || startDate || 'today'}`;
    return this.getCachedData(cacheKey, async () => {
      let url = this.SCOREBOARD_API_URL;
      if (startDate) {
        if (endDate && endDate !== startDate) {
          url += `?dates=${startDate}-${endDate}`;
        } else {
          url += `?dates=${startDate}`;
        }
      }
      const headers = this.getBrowserHeaders();
      const res = await fetch(url, { headers });
      const data = await res.json();
      return data;
    }, 'scoreboard');
  }

  // Fetch game details using ESPN summary as primary
  static async getGameDetails(gameId) {
    const cacheKey = `nhl_game_details_${gameId}`;
    return this.getCachedData(cacheKey, async () => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/summary?event=${gameId}`;
      const headers = this.getBrowserHeaders();
      const res = await fetch(this.convertToHttps(url), { headers });
      const data = await res.json();
      return data;
    }, 'game_details');
  }

  // Try NHL official API as fallback to convert or enrich data
  static async fetchNhlScheduleForDate(nhlDate) {
    try {
      const url = `${this.NHL_API_BASE}/schedule/${nhlDate}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('NHL API fetch failed');
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  // Format ESPN game structure into mobile-friendly shape similar to NFLService.formatGameForMobile
  static formatGameForMobile(game) {
    try {
      const competition = game.competitions?.[0] || {};
      const home = (competition.competitors || []).find(c => c.homeAway === 'home') || {};
      const away = (competition.competitors || []).find(c => c.homeAway === 'away') || {};

      return {
        id: game.id,
        status: game.status?.type?.description || '',
        displayClock: game.status?.displayClock || '',
        period: game.status?.period || 0,
        isCompleted: !!game.status?.type?.completed,
        situation: competition.situation || null,
        homeTeam: {
          id: home.id,
          displayName: home.team?.displayName || '',
          abbreviation: home.team?.abbreviation || '',
          logo: this.convertToHttps(home.team?.logo),
          score: home.score,
          record: home.records?.[0]?.summary || ''
        },
        awayTeam: {
          id: away.id,
          displayName: away.team?.displayName || '',
          abbreviation: away.team?.abbreviation || '',
          logo: this.convertToHttps(away.team?.logo),
          score: away.score,
          record: away.records?.[0]?.summary || ''
        },
        venue: competition.venue?.fullName || '',
        date: new Date(game.date),
        broadcasts: competition.broadcasts?.[0]?.names || []
      };
    } catch (e) {
      console.error('NHLService.formatGameForMobile error', e);
      return null;
    }
  }

  // Simple standings fetch via ESPN scoreboard endpoint (site api provides standings url elsewhere)
  static async getStandings() {
    const cacheKey = 'nhl_standings';
    return this.getCachedData(cacheKey, async () => {
      // Prefer NHL official API which returns a flat standings array
      const headers = this.getBrowserHeaders();

      try {
        const nhlUrl = `https://corsproxy.io/?url=${this.NHL_API_BASE}/standings/now`;
        // Try direct fetch first
        try {
          const res = await fetch(nhlUrl, { headers });
          if (res.ok) {
            const data = await res.json();
            return data;
          }
        } catch (directErr) {
          // Direct fetch failed (possibly CORS) - try via a public CORS proxy
          try {
            const proxy = `https://corsproxy.io/?url=${encodeURIComponent(nhlUrl)}`;
            const pres = await fetch(proxy, { headers });
            if (pres.ok) {
              const pdata = await pres.json();
              return pdata;
            }
          } catch (proxyErr) {
            // proxy failed too - will fallback to ESPN below
            console.warn('NHLService: NHL API direct and proxy fetch failed, falling back to ESPN', directErr, proxyErr);
          }
        }
      } catch (e) {
        // swallow and fallback to ESPN
      }

      // ESPN fallback
      try {
        const url = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/standings';
        const res2 = await fetch(url, { headers });
        const data2 = await res2.json();
        return data2;
      } catch (err) {
        throw err;
      }
    }, 'standings');
  }

  static async getPlayerGameStats(gameId, playerId) {
    const cacheKey = `nhl_player_stats_${gameId}_${playerId}`;
    return this.getCachedData(cacheKey, async () => {
      const url = `https://cdn.espn.com/core/nhl/boxscore?xhr=1&gameId=${gameId}`;
      const headers = this.getBrowserHeaders();
      
      const response = await fetch(this.convertToHttps(url), { headers });
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
              // Map common stat names based on category and index for NHL
              let statName = `Stat ${index + 1}`;
              let displayName = statName;
              
              if (category.name === 'skaters' || category.name === 'forwards' || category.name === 'defensemen') {
                const skaterStats = ['Goals', 'Assists', 'Time on Ice', 'Shots', 'Hits', 'Blocked Shots', 'Plus/Minus'];
                displayName = skaterStats[index] || statName;
              } else if (category.name === 'goalies' || category.name === 'goaltending') {
                const goalieStats = ['Goals Against', 'Shots Against', 'Save Pct', 'Saves', 'Minutes'];
                displayName = goalieStats[index] || statName;
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
      
    }, 'player_stats');
  }

  static clearCache() {
    return super.clearCache();
  }
}

export default NHLService;

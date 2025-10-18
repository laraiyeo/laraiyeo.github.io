// CS2 Match Service - handles individual match/series data
import { BaseCacheService } from './BaseCacheService';

const CS2_API_BASE = 'https://corsproxy.io/?url=https://api.bo3.gg';

class CS2MatchService extends BaseCacheService {
  // Smart live match detection for CS2 matches
  static hasLiveEvents(data) {
    try {
      // Check if match details contain live status
      if (data?.status && (
        data.status.toLowerCase() === 'live' ||
        data.status.toLowerCase() === 'ongoing'
      )) {
        return true;
      }
      
      // Check games for live status
      if (data?.games) {
        return data.games.some(game => 
          game?.status?.toLowerCase() === 'live' ||
          game?.status?.toLowerCase() === 'ongoing'
        );
      }
      
      // Check match results structure
      if (data?.results) {
        return data.results.some(match =>
          match?.status?.toLowerCase() === 'live' ||
          match?.status?.toLowerCase() === 'ongoing'
        );
      }
      
      return false;
    } catch (error) {
      console.error('CS2MatchService: Error detecting live events', error);
      return false;
    }
  }

  static getDataType(data, context) {
    try {
      if (this.hasLiveEvents(data)) {
        return 'live';
      }
      
      // Team/player data is generally static
      if (context?.includes('team') || context?.includes('player') || context?.includes('lineup')) {
        return 'static';
      }
      
      // Check match status for finished/upcoming
      const hasFinished = data?.status?.toLowerCase() === 'finished' ||
                         data?.results?.some(match => match?.status?.toLowerCase() === 'finished');
      const hasScheduled = data?.status?.toLowerCase() === 'upcoming' ||
                          data?.results?.some(match => match?.status?.toLowerCase() === 'upcoming');
      
      if (hasFinished && !hasScheduled) return 'finished';
      if (hasScheduled && !hasFinished) return 'scheduled';
      
      return 'scheduled'; // Default
    } catch (error) {
      console.error('CS2MatchService: Error determining data type', error);
      return 'scheduled';
    }
  }
}

/**
 * Get detailed match data including games/maps - fetches all 6 endpoints as shown in txt files
 * @param {number} matchId - The match ID
 * @param {number} team1Id - Team 1 ID
 * @param {number} team2Id - Team 2 ID
 * @param {string} team1Slug - Team 1 slug
 * @param {string} team2Slug - Team 2 slug
 * @param {string} matchStartDate - Match start date for filtering (e.g., "2025-10-11T13:45:00.000+00:00")
 * @param {string} matchSlug - The match slug for detailed match info (e.g., "falcons-esports-vs-vitality-12-10-2025")
 * @returns {Promise<Object>} - Complete formatted match data
 */
export const getMatchDetails = async (matchId, team1Id, team2Id, team1Slug, team2Slug, matchStartDate, matchSlug) => {
  const cacheKey = `cs2_match_details_${matchId}_${team1Id}_${team2Id}`;
  return CS2MatchService.getCachedData(cacheKey, async () => {
    try {
      // Validate required parameters
      if (!matchId || !team1Id || !team2Id) {
        throw new Error(`Missing required parameters: matchId=${matchId}, team1Id=${team1Id}, team2Id=${team2Id}`);
      }
      
      // Use match start date for filtering, fallback to current date if not provided
      const filterDate = matchStartDate ? new Date(matchStartDate).toISOString().split('T')[0] : '2025-10-12';

      const currentYear = new Date().getFullYear();
      const headers = CS2MatchService.getBrowserHeaders();
      
      // First, fetch basic data to get team information
      const [
        // 1.txt - Head to head matches between teams
        headToHeadResponse,
        // 2.txt - Recent matches for team1 analysis
        team1RecentMatchesResponse,
        // 2.txt - Recent matches for team2 analysis (fetch for both teams)
        team2RecentMatchesResponse,
        // 4.txt - Team1 players/lineup
        team1PlayersResponse,
        // 4.txt - Team2 players/lineup (fetch for both teams)
        team2PlayersResponse,
        // 5.txt - Detailed game data for this match
        gameDetailsResponse,
        // 6.txt - Detailed match info using match slug
        matchDetailsResponse
      ] = await Promise.all([
      // 1. Head to head between the two teams (1.txt)
      fetch(`${CS2_API_BASE}/api/v1/matches?page[offset]=0&page[limit]=10&sort=-start_date&filter[matches.status][in]=finished&filter[matches.team_ids][contains]=${team1Id},${team2Id}&filter[matches.start_date][lt]=${filterDate}&filter[matches.start_date][gt]=${currentYear}-01-01&filter[matches.discipline_id][eq]=1&with=teams,tournament`, { headers }),
      // 2. Recent matches for team1 (2.txt)
      fetch(`${CS2_API_BASE}/api/v1/matches?scope=show-match-team-last-maps&page[offset]=0&page[limit]=5&sort=-start_date&filter[matches.status][in]=finished&filter[matches.team_ids][overlap]=${team1Id}&filter[matches.start_date][lt]=${filterDate}&filter[matches.start_date][gt]=${currentYear}-01-01&filter[matches.discipline_id][eq]=1&with=teams,tournament,games`, { headers }),
      // 2. Recent matches for team2 (2.txt with team2 ID)
      fetch(`${CS2_API_BASE}/api/v1/matches?scope=show-match-team-last-maps&page[offset]=0&page[limit]=5&sort=-start_date&filter[matches.status][in]=finished&filter[matches.team_ids][overlap]=${team2Id}&filter[matches.start_date][lt]=${filterDate}&filter[matches.start_date][gt]=${currentYear}-01-01&filter[matches.discipline_id][eq]=1&with=teams,tournament,games`, { headers }),
      // 4. Team1 players (4.txt)
      fetch(`${CS2_API_BASE}/api/v1/players?scope=show-match-lineup&page[offset]=0&page[limit]=7&filter[team_id][eq]=${team1Id}`, { headers }),
      // 4. Team2 players (4.txt with team2 ID)
      fetch(`${CS2_API_BASE}/api/v1/players?scope=show-match-lineup&page[offset]=0&page[limit]=7&filter[team_id][eq]=${team2Id}`, { headers }),
      // 5. Game details for this specific match (5.txt)
      fetch(`${CS2_API_BASE}/api/v1/games?sort=number&filter[games.match_id][eq]=${matchId}&with=winner_team_clan,loser_team_clan,game_side_results,game_rounds`, { headers }),
      // 6. Detailed match info using match slug (6.txt)
      matchSlug ? fetch(`${CS2_API_BASE}/api/v1/matches/${matchSlug}?scope=show-match&stream_language=en&with=teams,tournament_deep,stage`, { headers }) : null
    ]);

    const [
      headToHeadData, 
      team1RecentMatchesData, 
      team2RecentMatchesData, 
      team1PlayersData, 
      team2PlayersData, 
      gameDetailsData,
      matchDetailsData
    ] = await Promise.all([
      headToHeadResponse.json(),
      team1RecentMatchesResponse.json(),
      team2RecentMatchesResponse.json(),
      team1PlayersResponse.json(),
      team2PlayersResponse.json(),
      gameDetailsResponse.json(),
      matchDetailsResponse ? matchDetailsResponse.json() : null
    ]);

    // Extract team slugs from available data sources
    let extractedTeam1Slug = team1Slug;
    let extractedTeam2Slug = team2Slug;

    // Try to get team slugs from match details first (most reliable)
    if (matchDetailsData && matchDetailsData.team1 && matchDetailsData.team2) {
      extractedTeam1Slug = extractedTeam1Slug || matchDetailsData.team1.slug;
      extractedTeam2Slug = extractedTeam2Slug || matchDetailsData.team2.slug;
    }

    // Fallback to recent matches data for team slugs
    if (!extractedTeam1Slug && team1RecentMatchesData?.results?.length > 0) {
      const team1Match = team1RecentMatchesData.results[0];
      const team1InMatch = team1Match.team1_id === team1Id ? team1Match.team1 : team1Match.team2;
      extractedTeam1Slug = team1InMatch?.slug;
    }

    if (!extractedTeam2Slug && team2RecentMatchesData?.results?.length > 0) {
      const team2Match = team2RecentMatchesData.results[0];
      const team2InMatch = team2Match.team1_id === team2Id ? team2Match.team1 : team2Match.team2;
      extractedTeam2Slug = team2InMatch?.slug;
    }

    // Fallback to head-to-head data for team slugs
    if ((!extractedTeam1Slug || !extractedTeam2Slug) && headToHeadData?.results?.length > 0) {
      const h2hMatch = headToHeadData.results[0];
      if (!extractedTeam1Slug) {
        const team1InH2H = h2hMatch.team1_id === team1Id ? h2hMatch.team1 : h2hMatch.team2;
        extractedTeam1Slug = team1InH2H?.slug;
      }
      if (!extractedTeam2Slug) {
        const team2InH2H = h2hMatch.team1_id === team2Id ? h2hMatch.team1 : h2hMatch.team2;
        extractedTeam2Slug = team2InH2H?.slug;
      }
    }

    // Now fetch map pool data with extracted slugs
    const [team1MapPoolData, team2MapPoolData] = await Promise.all([
      // 3. Team1 map pool data (3.txt)
      extractedTeam1Slug ? 
        fetch(`${CS2_API_BASE}/api/v1/teams/${extractedTeam1Slug}/map_pool?scope=show-match-team-map-pool&filter[begin_at_from]=${currentYear}-01-01&filter[begin_at_to]=${filterDate}`)
          .then(res => res.json())
          .catch(err => {
            console.warn(`Failed to fetch team1 map pool for slug ${extractedTeam1Slug}:`, err);
            return null;
          }) : null,
      // 3. Team2 map pool data (3.txt with team2 slug)
      extractedTeam2Slug ? 
        fetch(`${CS2_API_BASE}/api/v1/teams/${extractedTeam2Slug}/map_pool?scope=show-match-team-map-pool&filter[begin_at_from]=${currentYear}-01-01&filter[begin_at_to]=${filterDate}`)
          .then(res => res.json())
          .catch(err => {
            console.warn(`Failed to fetch team2 map pool for slug ${extractedTeam2Slug}:`, err);
            return null;
          }) : null
    ]);
    
    return formatCompleteMatchData({
      headToHead: headToHeadData,
      team1RecentMatches: team1RecentMatchesData,
      team2RecentMatches: team2RecentMatchesData,
      team1MapPool: team1MapPoolData,
      team2MapPool: team2MapPoolData,
      team1Players: team1PlayersData,
      team2Players: team2PlayersData,
      gameDetails: gameDetailsData,
      matchDetails: matchDetailsData,
      matchId
    });
    } catch (error) {
      console.error('Error fetching match details:', error);
      throw error;
    }
  }, 'match_details');
};

/**
 * Get team recent matches for head-to-head comparison
 * @param {number} teamId - The team ID
 * @param {string} matchStartDate - Match start date for filtering
 * @returns {Promise<Object>} - Recent matches data
 */
export const getTeamRecentMatches = async (teamId, matchStartDate) => {
  const cacheKey = `cs2_team_recent_matches_${teamId}_${matchStartDate}`;
  return CS2MatchService.getCachedData(cacheKey, async () => {
    try {
      const filterDate = matchStartDate ? new Date(matchStartDate).toISOString().split('T')[0] : '2025-10-12';
      const currentYear = new Date().getFullYear();
      const headers = CS2MatchService.getBrowserHeaders();
      const response = await fetch(`${CS2_API_BASE}/api/v1/matches?scope=show-match-team-last-maps&page[offset]=0&page[limit]=5&sort=-start_date&filter[matches.status][in]=finished&filter[matches.team_ids][overlap]=${teamId}&filter[matches.start_date][lt]=${filterDate}&filter[matches.start_date][gt]=${currentYear}-01-01&filter[matches.discipline_id][eq]=1&with=teams,tournament,games`, { headers });
      const data = await response.json();
      
      return data;
    } catch (error) {
      console.error('Error fetching team recent matches:', error);
      throw error;
    }
  }, 'team_matches');
};

/**
 * Get team map pool statistics
 * @param {string} teamSlug - The team slug
 * @param {string} matchStartDate - Match start date for filtering
 * @returns {Promise<Object>} - Map pool data
 */
export const getTeamMapPool = async (teamSlug, matchStartDate) => {
  try {
    const filterDate = matchStartDate ? new Date(matchStartDate).toISOString().split('T')[0] : '2025-10-12';
    const currentYear = new Date().getFullYear();
    const response = await fetch(`${CS2_API_BASE}/api/v1/teams/${teamSlug}/map_pool?scope=show-match-team-map-pool&filter[begin_at_from]=${currentYear}-01-01&filter[begin_at_to]=${filterDate}`);
    const data = await response.json();
    
    return data;
  } catch (error) {
    console.error('Error fetching team map pool:', error);
    throw error;
  }
};

/**
 * Get team lineup/players
 * @param {number} teamId - The team ID
 * @returns {Promise<Object>} - Team players data
 */
export const getTeamPlayers = async (teamId) => {
  const cacheKey = `cs2_team_players_${teamId}`;
  return CS2MatchService.getCachedData(cacheKey, async () => {
    try {
      const headers = CS2MatchService.getBrowserHeaders();
      const response = await fetch(`${CS2_API_BASE}/api/v1/players?scope=show-match-lineup&page[offset]=0&page[limit]=7&filter[team_id][eq]=${teamId}`, { headers });
      const data = await response.json();
      
      return data;
    } catch (error) {
      console.error('Error fetching team players:', error);
      throw error;
    }
  }, 'team_players');
};

/**
 * Format complete match data from all API endpoints (both teams)
 * @param {Object} combinedData - Combined data from all endpoints
 * @returns {Object} - Complete formatted match data
 */
export const formatCompleteMatchData = (combinedData) => {
  const { 
    headToHead, 
    team1RecentMatches, 
    team2RecentMatches, 
    team1MapPool, 
    team2MapPool, 
    team1Players, 
    team2Players, 
    gameDetails, 
    matchDetails,
    matchId 
  } = combinedData;
  
  if (!gameDetails || !gameDetails.results || gameDetails.results.length === 0) {
    return null;
  }

  const games = gameDetails.results;
  const firstGame = games[0];
  
  // Get team info - prioritize match details (6.txt), then head to head, then game details
  let team1Data, team2Data;
  
  if (matchDetails && matchDetails.team1 && matchDetails.team2) {
    // Use detailed match data from 6.txt endpoint (most comprehensive)
    team1Data = {
      id: matchDetails.team1.id,
      name: matchDetails.team1.name,
      shortName: matchDetails.team1.name,
      logoUrl: matchDetails.team1.image_url || 'https://via.placeholder.com/64'
    };
    team2Data = {
      id: matchDetails.team2.id,
      name: matchDetails.team2.name,
      shortName: matchDetails.team2.name,
      logoUrl: matchDetails.team2.image_url || 'https://via.placeholder.com/64'
    };
  } else if (headToHead && headToHead.results && headToHead.results.length > 0) {
    // Fallback to head to head data
    const matchData = headToHead.results[0];
    team1Data = {
      id: matchData.team1_id,
      name: matchData.team1?.name || matchData.team1?.slug,
      shortName: matchData.team1?.name || matchData.team1?.slug,
      logoUrl: matchData.team1?.image_url || 'https://via.placeholder.com/64'
    };
    team2Data = {
      id: matchData.team2_id,
      name: matchData.team2?.name || matchData.team2?.slug,
      shortName: matchData.team2?.name || matchData.team2?.slug,
      logoUrl: matchData.team2?.image_url || 'https://via.placeholder.com/64'
    };
  } else {
    // Final fallback to game details
    team1Data = {
      id: firstGame.winner_team_clan?.team?.id || firstGame.loser_team_clan?.team?.id,
      name: firstGame.winner_team_clan?.clan_name || firstGame.loser_team_clan?.clan_name,
      shortName: firstGame.winner_team_clan?.clan_name || firstGame.loser_team_clan?.clan_name,
      logoUrl: firstGame.winner_team_clan?.team?.image_url || firstGame.loser_team_clan?.team?.image_url || 'https://via.placeholder.com/64'
    };
    team2Data = {
      id: firstGame.loser_team_clan?.team?.id || firstGame.winner_team_clan?.team?.id,
      name: firstGame.loser_team_clan?.clan_name || firstGame.winner_team_clan?.clan_name,
      shortName: firstGame.loser_team_clan?.clan_name || firstGame.winner_team_clan?.clan_name,
      logoUrl: firstGame.loser_team_clan?.team?.image_url || firstGame.winner_team_clan?.team?.image_url || 'https://via.placeholder.com/64'
    };
  }

  return {
    id: matchId,
    eventName: matchDetails?.stage?.title || matchDetails?.tournament?.name || team1RecentMatches?.results?.[0]?.tournament?.name || team2RecentMatches?.results?.[0]?.tournament?.name || 'CS2 Match',
    team1: team1Data,
    team2: team2Data,
    team1Score: calculateTeamScore(games, team1Data.id),
    team2Score: calculateTeamScore(games, team2Data.id),
    completed: firstGame.status === 'finished',
    startDate: firstGame.begin_at,
    maps: games.map(game => ({
      id: game.id,
      name: game.map_name,
      displayName: getMapDisplayName(game.map_name),
      team1Score: getTeamScoreForGame(game, team1Data.id),
      team2Score: getTeamScoreForGame(game, team2Data.id),
      winner: game.winner_team_clan?.team?.id,
      completed: game.status === 'finished',
      duration: game.duration
    })),
    format: games.length <= 1 ? 'BO1' : games.length <= 3 ? 'BO3' : 'BO5',
    // Pick/ban data from match details (6.txt endpoint)
    pickban: matchDetails?.match_maps ? formatPickBanData(matchDetails.match_maps, team1Data, team2Data) : [],
    // Additional data from all endpoints for both teams
    headToHeadData: headToHead,
    team1RecentMatches: team1RecentMatches,
    team2RecentMatches: team2RecentMatches,
    team1MapPool: team1MapPool,
    team2MapPool: team2MapPool,
    team1Players: team1Players,
    team2Players: team2Players,
    gameDetails: gameDetails,
    matchDetails: matchDetails
  };
};

/**
 * Format match data to match the VAL series structure (fallback for simple cases)
 * @param {Object} rawData - Raw API response
 * @returns {Object} - Formatted match data
 */
export const formatMatchData = (rawData) => {
  if (!rawData || !rawData.results || rawData.results.length === 0) {
    return null;
  }

  const games = rawData.results;
  
  // Get match info from first game (all games belong to same match)
  const firstGame = games[0];
  
  return {
    id: firstGame.match_id,
    eventName: firstGame.tournament?.name || 'CS2 Match',
    team1: {
      id: firstGame.winner_team_clan?.team?.id || firstGame.loser_team_clan?.team?.id,
      name: firstGame.winner_team_clan?.clan_name || firstGame.loser_team_clan?.clan_name,
      shortName: firstGame.winner_team_clan?.clan_name || firstGame.loser_team_clan?.clan_name,
      logoUrl: firstGame.winner_team_clan?.team?.image_url || firstGame.loser_team_clan?.team?.image_url || 'https://via.placeholder.com/48'
    },
    team2: {
      id: firstGame.loser_team_clan?.team?.id || firstGame.winner_team_clan?.team?.id,
      name: firstGame.loser_team_clan?.clan_name || firstGame.winner_team_clan?.clan_name,
      shortName: firstGame.loser_team_clan?.clan_name || firstGame.winner_team_clan?.clan_name,
      logoUrl: firstGame.loser_team_clan?.team?.image_url || firstGame.winner_team_clan?.team?.image_url || 'https://via.placeholder.com/48'
    },
    team1Score: calculateTeamScore(games, firstGame.winner_team_clan?.team?.id),
    team2Score: calculateTeamScore(games, firstGame.loser_team_clan?.team?.id),
    completed: firstGame.status === 'finished',
    startDate: firstGame.begin_at,
    maps: games.map(game => ({
      id: game.id,
      name: game.map_name,
      displayName: getMapDisplayName(game.map_name),
      team1Score: getTeamScoreForGame(game, firstGame.winner_team_clan?.team?.id),
      team2Score: getTeamScoreForGame(game, firstGame.loser_team_clan?.team?.id),
      winner: game.winner_team_clan?.team?.id,
      completed: game.status === 'finished',
      duration: game.duration
    })),
    format: games.length <= 1 ? 'BO1' : games.length <= 3 ? 'BO3' : 'BO5'
  };
};

/**
 * Calculate total series score for a team
 * @param {Array} games - Array of games
 * @param {number} teamId - Team ID
 * @returns {number} - Total wins
 */
const calculateTeamScore = (games, teamId) => {
  if (!teamId) return 0;
  return games.filter(game => game.winner_team_clan?.team?.id === teamId).length;
};

/**
 * Get team score for a specific game
 * @param {Object} game - Game object
 * @param {number} teamId - Team ID
 * @returns {number} - Team score for this game
 */
const getTeamScoreForGame = (game, teamId) => {
  if (game.winner_team_clan?.team?.id === teamId) {
    return game.winner_clan_score;
  } else {
    return game.loser_clan_score;
  }
};

/**
 * Format pick/ban data from match_maps array (6.txt endpoint)
 * @param {Array} matchMaps - Array of match_maps from API
 * @param {Object} team1Data - Team 1 data
 * @param {Object} team2Data - Team 2 data
 * @returns {Array} - Formatted pick/ban array
 */
const formatPickBanData = (matchMaps, team1Data, team2Data) => {
  if (!matchMaps || !Array.isArray(matchMaps)) return [];
  
  return matchMaps.map(mapData => {
    const mapSlug = mapData.maps?.slug;
    const mapName = mapData.maps?.name;
    const teamId = mapData.team_id;
    const choiceType = mapData.choice_type; // 1=pick, 2=ban, 3=decider
    const order = mapData.order;
    
    // Determine type and if it's leftover/decider
    let type = 'pick';
    let isLeftover = false;
    
    if (choiceType === 2) {
      type = 'ban';
    } else if (choiceType === 3) {
      type = 'pick';
      isLeftover = true; // Decider map
    } else if (choiceType === 1) {
      type = 'pick';
    }
    
    return {
      mapId: mapData.map_id,
      mapName: mapName,
      mapSlug: mapSlug,
      teamId: teamId,
      type: type,
      isLeftover: isLeftover,
      order: order
    };
  }).sort((a, b) => a.order - b.order); // Sort by order
};

/**
 * Get CS2 map image URL from bo3.gg
 * @param {string} mapSlug - Map slug (e.g., "dust2", "inferno")
 * @returns {string} - Map image URL
 */
export const getCS2MapImageUrl = (mapSlug) => {
  if (!mapSlug) return 'https://via.placeholder.com/300x120';
  
  // Remove any numbers from slug (e.g., "dust2" -> "dust")
  const cleanSlug = mapSlug.replace(/\d+$/, '');
  
  return `https://bo3.gg/img/maps/backgrounds/${cleanSlug}.webp`;
};

/**
 * Get display name for CS2 maps
 * @param {string} mapName - Technical map name (e.g., "de_inferno")
 * @returns {string} - Display name (e.g., "Inferno")
 */
export const getMapDisplayName = (mapName) => {
  // Handle null or undefined map names
  if (!mapName || typeof mapName !== 'string') {
    return 'TBD';
  }

  const mapNames = {
    'de_inferno': 'Inferno',
    'de_mirage': 'Mirage',
    'de_dust2': 'Dust2',
    'de_cache': 'Cache',
    'de_overpass': 'Overpass',
    'de_train': 'Train',
    'de_cobblestone': 'Cobblestone',
    'de_nuke': 'Nuke',
    'de_vertigo': 'Vertigo',
    'de_ancient': 'Ancient',
    'de_anubis': 'Anubis'
  };
  
  return mapNames[mapName] || mapName.replace('de_', '').charAt(0).toUpperCase() + mapName.replace('de_', '').slice(1);
};

/**
 * Format series data for display (similar to VAL)
 * @param {Object} matchData - Raw match data from API
 * @returns {Object} - Formatted series data
 */
export const formatSeriesData = (matchData) => {
  // Handle both tournament screen format and home screen format
  const team1Data = matchData.team1 || matchData.teams?.[0];
  const team2Data = matchData.team2 || matchData.teams?.[1];
  
  return {
    id: matchData.id,
    seriesId: matchData.id,
    eventName: matchData.tournament?.name || matchData.tournament?.nameShortened || 'CS2 Match',
    team1: {
      id: matchData.team1_id || team1Data?.id,
      name: team1Data?.name || team1Data?.baseInfo?.name,
      shortName: team1Data?.name || team1Data?.baseInfo?.name,
      logoUrl: team1Data?.image_url || team1Data?.baseInfo?.logoUrl || 'https://via.placeholder.com/48'
    },
    team2: {
      id: matchData.team2_id || team2Data?.id,
      name: team2Data?.name || team2Data?.baseInfo?.name,
      shortName: team2Data?.name || team2Data?.baseInfo?.name,
      logoUrl: team2Data?.image_url || team2Data?.baseInfo?.logoUrl || 'https://via.placeholder.com/48'
    },
    team1Score: matchData.team1_score || matchData.team1Score || 0,
    team2Score: matchData.team2_score || matchData.team2Score || 0,
    completed: matchData.status === 'finished',
    startDate: matchData.start_date || matchData.startDate || matchData.startTime,
    format: matchData.bo_type ? `BO${matchData.bo_type}` : 'BO3',
    maps: [] // Will be populated by getMatchDetails
  };
};

/**
 * Get specific match details for individual match screen (4 endpoints from specific match folder)
 * @param {number} gameId - The game ID (e.g., 142513)
 * @param {string} seriesSlug - The series slug (e.g., "falcons-esports-vs-vitality-12-10-2025")
 * @param {string} mapName - The map name (e.g., "de_inferno")
 * @returns {Promise<Object>} - Complete match data with detailed stats
 */
export const getSpecificMatchDetails = async (gameId, seriesSlug, mapName) => {
  try {
    if (!gameId) {
      throw new Error('Game ID is required');
    }
    
    // Fetch basic match data and player stats (not round-specific)
    const [playerStatsResponse, gameDetailsResponse] = await Promise.all([
      fetch(`${CS2_API_BASE}/api/v1/games/${gameId}/players_stats`),
      seriesSlug && mapName ? 
        fetch(`${CS2_API_BASE}/api/v1/matches/${seriesSlug}/games/${mapName}`) :
        fetch(`${CS2_API_BASE}/api/v1/games/${gameId}?with=winner_team_clan,loser_team_clan,game_side_results,game_rounds`)
    ]);
    
    const [playerStatsData, gameDetailsData] = await Promise.all([
      playerStatsResponse.json(),
      gameDetailsResponse.json()
    ]);
    
    // Debug log the data structure
    console.log('🔍 Game Details Data Structure:', JSON.stringify(gameDetailsData, null, 2));
    console.log('🔍 Has team1?', !!gameDetailsData?.team1);
    console.log('🔍 Has team2?', !!gameDetailsData?.team2);
    
    return formatSpecificMatchData({
      playerStats: playerStatsData,
      gameDetails: gameDetailsData,
      gameId
    });
  } catch (error) {
    console.error('Error fetching specific match details:', error);
    throw error;
  }
};

/**
 * Format specific match data for the match details screen
 * @param {Object} combinedData - Combined data from all 4 endpoints
 * @returns {Object} - Formatted match data
 */
const formatSpecificMatchData = (combinedData) => {
  const { playerStats, gameDetails, gameId } = combinedData;
  
  if (!gameDetails) {
    return null;
  }

  // Check if this is the detailed match endpoint response or fallback
  let matchInfo, team1Data, team2Data, team1Score, team2Score;
  
  if (gameDetails.team1 && gameDetails.team2) {
    // This is from the detailed endpoint: /matches/${seriesSlug}/games/${mapName}
    matchInfo = gameDetails;
    team1Data = {
      id: matchInfo.team1.id,
      name: matchInfo.team1.name,
      logoUrl: matchInfo.team1.image_url || 'https://via.placeholder.com/48'
    };
    team2Data = {
      id: matchInfo.team2.id,
      name: matchInfo.team2.name,
      logoUrl: matchInfo.team2.image_url || 'https://via.placeholder.com/48'
    };
    team1Score = matchInfo.team1_score || 0;
    team2Score = matchInfo.team2_score || 0;
  } else {
    // This is from the fallback endpoint - use winner/loser clan data
    matchInfo = gameDetails;
    const winnerClan = matchInfo.winner_team_clan;
    const loserClan = matchInfo.loser_team_clan;
    
    team1Data = {
      id: winnerClan?.team?.id,
      name: winnerClan?.clan_name || winnerClan?.team?.name || 'Team 1',
      logoUrl: winnerClan?.team?.image_url || 'https://via.placeholder.com/48'
    };
    team2Data = {
      id: loserClan?.team?.id,
      name: loserClan?.clan_name || loserClan?.team?.name || 'Team 2',
      logoUrl: loserClan?.team?.image_url || 'https://via.placeholder.com/48'
    };
    team1Score = matchInfo.winner_clan_score || 0;
    team2Score = matchInfo.loser_clan_score || 0;
  }

  const matchData = {
    id: gameId,
    gameId: gameId,
    matchId: matchInfo.match_id,
    mapName: matchInfo.map_name,
    displayName: getMapDisplayName(matchInfo.map_name),
    status: matchInfo.status,
    startTime: matchInfo.begin_at,
    endTime: matchInfo.end_at,
    duration: matchInfo.duration,
    
    // Team data
    team1: team1Data,
    team2: team2Data,
    
    // Scores
    team1Score: team1Score,
    team2Score: team2Score,
    
    // Match info
    eventName: matchInfo.tournament?.name || 'CS2 Match',
    format: 'Single Map',
    completed: matchInfo.status === 'finished',
    
    // Raw data for detailed analysis
    playerStats: playerStats,
    rounds: matchInfo.game_rounds || []
  };

  return matchData;
};

/**
 * Get round-specific data (hit group stats and kills matrix)
 * @param {number} gameId - The game ID
 * @param {number} roundNumber - The round number
 * @returns {Promise<Object>} - Round-specific data
 */
export const getRoundData = async (gameId, roundNumber) => {
  const cacheKey = `cs2_round_data_${gameId}_${roundNumber}`;
  return CS2MatchService.getCachedData(cacheKey, async () => {
    try {
      if (!gameId || !roundNumber) {
        throw new Error('Game ID and round number are required');
      }
      
      const headers = CS2MatchService.getBrowserHeaders();
      const [hitGroupStatsResponse, killsMatrixResponse] = await Promise.all([
        fetch(`${CS2_API_BASE}/api/v1/games/${gameId}/rounds/${roundNumber}/hit_group_stats`, { headers }),
        fetch(`${CS2_API_BASE}/api/v1/games/${gameId}/rounds/${roundNumber}/kills_matrix`, { headers })
      ]);
      
      const [hitGroupStatsData, killsMatrixData] = await Promise.all([
        hitGroupStatsResponse.json(),
        killsMatrixResponse.json()
      ]);
      
      return {
        roundNumber,
        hitGroupStats: hitGroupStatsData,
        killsMatrix: killsMatrixData
      };
    } catch (error) {
      console.error(`Error fetching round ${roundNumber} data:`, error);
      throw error;
    }
  }, 'round_data');
};

/**
 * Get weapon stats for all players in the match
 * @param {number} gameId - The game ID
 * @returns {Promise<Object>} - Weapon stats data
 */
export const getWeaponStats = async (gameId) => {
  try {
    if (!gameId) {
      throw new Error('Game ID is required');
    }
    
    const response = await fetch(`${CS2_API_BASE}/api/v1/games/${gameId}/weapons_stats`);
    const data = await response.json();
    
    return data;
  } catch (error) {
    console.error('Error fetching weapon stats:', error);
    throw error;
  }
};

/**
 * Get hit group stats for all players in the match
 * @param {number} gameId - The game ID
 * @returns {Promise<Object>} - Hit group stats data
 */
export const getHitGroupStats = async (gameId) => {
  try {
    if (!gameId) {
      throw new Error('Game ID is required');
    }
    
    const headers = CS2MatchService.getBrowserHeaders();
    const response = await fetch(`${CS2_API_BASE}/api/v1/games/${gameId}/hit_group_stats`, { headers });
    const data = await response.json();
    
    return data;
  } catch (error) {
    console.error('Error fetching hit group stats:', error);
    throw error;
  }
};

// Export CS2MatchService for cache management
export { CS2MatchService };

// Add clearCache as standalone export for compatibility
export const clearCache = () => CS2MatchService.clearCache();
// CS2 Service for fetching data from bo3.gg API
// Uses corsproxy.io for CORS handling

const BASE_URL = 'https://corsproxy.io/?url=https://api.bo3.gg';

// Helper function to format date for API calls
const formatDateForAPI = (date) => {
  // Use local date instead of UTC to avoid timezone shifting
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`; // YYYY-MM-DD format
};

// Helper function to get UTC offset in seconds
const getUTCOffset = () => {
  const offset = new Date().getTimezoneOffset() * 60; // Convert minutes to seconds
  return -offset; // API expects negative of getTimezoneOffset
};

// Helper function to make API requests
const makeRequest = async (url) => {
  try {
    console.log('Making request to:', url);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
};

// MATCHES API FUNCTIONS (for CS2HomeScreen)

/**
 * Get live CS2 matches
 */
const getLiveMatches = async () => {
  const today = new Date();
  const dateString = formatDateForAPI(today);
  const utcOffset = getUTCOffset();
  
  const url = `${BASE_URL}/api/v2/matches/live?date=${dateString}&utc_offset=${utcOffset}&filter[tier][in]=s,a&filter[discipline_id][eq]=1`;
  
  try {
    const response = await makeRequest(url);
    
    // Transform the data to match expected format
    const matches = response.data || [];
    const teams = response.included?.teams || {};
    const tournaments = response.included?.tournaments || {};
    
    return {
      edges: matches.map(match => {
        const team1Data = teams[match.team1_id] || {};
        const team2Data = teams[match.team2_id] || {};
        const tournamentData = tournaments[match.tournament] || {};
        
        return {
          node: {
            id: match.id.toString(),
            slug: match.slug,
            status: match.status,
            teams: [
              {
                id: match.team1_id?.toString() || '',
                baseInfo: {
                  name: team1Data.name || 'Team 1',
                  logoUrl: team1Data.image_url || null
                },
                score: match.team1_score || 0
              },
              {
                id: match.team2_id?.toString() || '',
                baseInfo: {
                  name: team2Data.name || 'Team 2',
                  logoUrl: team2Data.image_url || null
                },
                score: match.team2_score || 0
              }
            ],
            tournament: {
              id: match.tournament,
              name: tournamentData.name || 'Tournament',
              nameShortened: tournamentData.name || 'Tournament',
              logoUrl: tournamentData.image_url || null,
              slug: tournamentData.slug || null
            },
            format: {
              nameShortened: match.tier?.toUpperCase() || 'S' // Use tier instead of format
            },
            startTime: match.start_date,
            state: match.parsed_status || 'live',
            bestOf: match.bo_type || 3,
            liveUpdates: match.live_updates || null,
            // Add team scores at the top level like VAL does
            team1Score: match.team1_score || 0,
            team2Score: match.team2_score || 0
          }
        };
      })
    };
  } catch (error) {
    console.error('Error fetching live matches:', error);
    return { edges: [] };
  }
};

/**
 * Get upcoming CS2 matches for a specific date
 */
const getUpcomingMatches = async (dateFilter = 'today') => {
  let targetDate = new Date();
  
  switch (dateFilter) {
    case 'yesterday':
      targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - 1);
      break;
    case 'tomorrow':
      targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 1);
      break;
    case 'today':
    default:
      targetDate = new Date();
      // Keep current date
      break;
  }
  
  const dateString = formatDateForAPI(targetDate);
  const utcOffset = getUTCOffset();
  
  const url = `${BASE_URL}/api/v2/matches/upcoming?date=${dateString}&utc_offset=${utcOffset}&filter[tier][in]=s,a&filter[discipline_id][eq]=1`;
  
  try {
    const response = await makeRequest(url);
    
    // Handle both possible response formats
    let matches = [];
    let teams = {};
    let tournaments = {};
    
    if (response.data && response.data.tiers) {
      // Extract matches from all tiers
      Object.values(response.data.tiers).forEach(tier => {
        if (tier.matches) {
          matches = matches.concat(tier.matches);
        }
      });
      teams = response.included?.teams || {};
      tournaments = response.included?.tournaments || {};
    } else if (response.data && Array.isArray(response.data)) {
      matches = response.data;
      teams = response.included?.teams || {};
      tournaments = response.included?.tournaments || {};
    }
    
    return {
      edges: matches.map(match => {
        const team1Data = teams[match.team1_id || match.team1] || {};
        const team2Data = teams[match.team2_id || match.team2] || {};
        const tournamentData = tournaments[match.tournament] || {};
        
        return {
          node: {
            id: match.id.toString(),
            slug: match.slug,
            status: match.status,
            teams: [
              {
                id: (match.team1_id || match.team1)?.toString() || '',
                baseInfo: {
                  name: team1Data.name || 'Team 1',
                  logoUrl: team1Data.image_url || null
                }
              },
              {
                id: (match.team2_id || match.team2)?.toString() || '',
                baseInfo: {
                  name: team2Data.name || 'Team 2',
                  logoUrl: team2Data.image_url || null
                }
              }
            ],
            tournament: {
              id: match.tournament,
              name: tournamentData.name || 'Tournament',
              nameShortened: tournamentData.name || 'Tournament',
              logoUrl: tournamentData.image_url || null,
              slug: tournamentData.slug || null
            },
            format: {
              nameShortened: match.tier?.toUpperCase() || 'S' // Use tier instead of format
            },
            startTime: match.start_date,
            state: match.parsed_status || 'scheduled',
            bestOf: match.bo_type || 3
          }
        };
      })
    };
  } catch (error) {
    console.error('Error fetching upcoming matches:', error);
    return { edges: [] };
  }
};

/**
 * Get completed CS2 matches for a specific date
 */
const getCompletedMatchesForDate = async (dateFilter = 'today', limit = 100) => {
  let targetDate = new Date();
  
  switch (dateFilter) {
    case 'yesterday':
      targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - 1);
      break;
    case 'tomorrow':
      targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 1);
      break;
    case 'today':
    default:
      targetDate = new Date();
      break;
  }
  
  const dateString = formatDateForAPI(targetDate);
  const utcOffset = getUTCOffset();
  
  const url = `${BASE_URL}/api/v2/matches/finished?date=${dateString}&utc_offset=${utcOffset}&filter[tier][in]=s,a&filter[discipline_id][eq]=1`;
  
  try {
    const response = await makeRequest(url);
    
    // Handle both possible response formats
    let matches = [];
    let teams = {};
    let tournaments = {};
    
    if (response.data && response.data.tiers) {
      // Extract matches from all tiers
      Object.values(response.data.tiers).forEach(tier => {
        if (tier.matches) {
          matches = matches.concat(tier.matches);
        }
      });
      teams = response.included?.teams || {};
      tournaments = response.included?.tournaments || {};
    } else if (response.data && Array.isArray(response.data)) {
      matches = response.data;
      teams = response.included?.teams || {};
      tournaments = response.included?.tournaments || {};
    }
    
    // Sort by end_date descending and limit results
    matches.sort((a, b) => new Date(b.end_date || b.start_date) - new Date(a.end_date || a.start_date));
    matches = matches.slice(0, limit);
    
    return {
      edges: matches.map(match => {
        const team1Data = teams[match.team1_id || match.team1] || {};
        const team2Data = teams[match.team2_id || match.team2] || {};
        const tournamentData = tournaments[match.tournament] || {};
        
        return {
          node: {
            id: match.id.toString(),
            slug: match.slug,
            status: match.status,
            teams: [
              {
                id: (match.team1_id || match.team1)?.toString() || '',
                baseInfo: {
                  name: team1Data.name || 'Team 1',
                  logoUrl: team1Data.image_url || null
                },
                score: match.team1_score || 0
              },
              {
                id: (match.team2_id || match.team2)?.toString() || '',
                baseInfo: {
                  name: team2Data.name || 'Team 2',
                  logoUrl: team2Data.image_url || null
                },
                score: match.team2_score || 0
              }
            ],
            tournament: {
              id: match.tournament,
              name: tournamentData.name || 'Tournament',
              nameShortened: tournamentData.name || 'Tournament',
              logoUrl: tournamentData.image_url || null,
              slug: tournamentData.slug || null
            },
            format: {
              nameShortened: match.tier?.toUpperCase() || 'S' // Use tier instead of format
            },
            startTime: match.start_date,
            endTime: match.end_date,
            state: match.parsed_status || 'completed',
            bestOf: match.bo_type || 3,
            winnerTeamId: match.winner_team_id?.toString(),
            // Add team scores at the top level like VAL does
            team1Score: match.team1_score || 0,
            team2Score: match.team2_score || 0
          }
        };
      })
    };
  } catch (error) {
    console.error('Error fetching completed matches for date:', error);
    return { edges: [] };
  }
};

/**
 * Get completed CS2 matches (default to today)
 */
const getCompletedMatches = async (limit = 100) => {
  return getCompletedMatchesForDate('today', limit);
};

// TOURNAMENTS API FUNCTIONS (for CS2DiscoverScreen)

/**
 * Get current and upcoming tournaments (for featured section)
 */
const getCurrentAndUpcomingTournaments = async (limit = 100) => {
  const currentYear = new Date().getFullYear();
  const url = `${BASE_URL}/api/v1/tournaments?scope=index-current-tournaments&page[offset]=0&page[limit]=${limit}&sort=start_date&filter[tournaments.status][in]=current,upcoming&filter[tournaments.end_date][gte]=${currentYear}-01-01&filter[tournaments.start_date][lte]=${currentYear}-12-31&filter[tournaments.tier][in]=s,a&filter[tournaments.discipline_id][eq]=1`;

  try {
    const response = await makeRequest(url);
    
    const tournaments = response.results || [];
    
    return {
      edges: tournaments.map(tournament => ({
        node: {
          id: tournament.id.toString(),
          name: tournament.name,
          slug: tournament.slug,
          nameShortened: tournament.slug.replace(/-/g, ' ').toUpperCase(),
          status: tournament.status,
          startDate: tournament.start_date,
          endDate: tournament.end_date,
          prize: tournament.prize,
          tier: tournament.tier,
          image: tournament.image_url,
          teams: tournament.teams || []
        }
      }))
    };
  } catch (error) {
    console.error('Error fetching current/upcoming tournaments:', error);
    return { edges: [] };
  }
};

/**
 * Get upcoming tournaments (separate from current)
 */
const getUpcomingTournaments = async (limit = 100) => {
  const currentYear = new Date().getFullYear();
  const url = `${BASE_URL}/api/v1/tournaments?scope=index-upcoming-tournaments&page[offset]=0&page[limit]=${limit}&sort=start_date&filter[tournaments.status][in]=upcoming&filter[tournaments.end_date][gte]=${currentYear}-01-01&filter[tournaments.start_date][lte]=${currentYear}-12-31&filter[tournaments.tier][in]=s,a&filter[tournaments.discipline_id][eq]=1`;

  try {
    const response = await makeRequest(url);
    
    const tournaments = response.results || [];
    
    return {
      edges: tournaments.map(tournament => ({
        node: {
          id: tournament.id.toString(),
          name: tournament.name,
          slug: tournament.slug,
          nameShortened: tournament.slug.replace(/-/g, ' ').toUpperCase(),
          status: tournament.status,
          startDate: tournament.start_date,
          endDate: tournament.end_date,
          prize: tournament.prize,
          tier: tournament.tier,
          image: tournament.image_url,
          teams: tournament.teams || [],
          tournamentPrizes: tournament.tournament_prizes || []
        }
      }))
    };
  } catch (error) {
    console.error('Error fetching upcoming tournaments:', error);
    return { edges: [] };
  }
};

/**
 * Get recent tournaments (for trending section)
 */
const getRecentTournaments = async (limit = 100) => {
  const currentYear = new Date().getFullYear();
  const url = `${BASE_URL}/api/v1/tournaments?scope=index-finished-tournaments&page[offset]=0&page[limit]=${limit}&sort=-end_date&filter[tournaments.status][in]=finished&filter[tournaments.end_date][gte]=${currentYear}-01-01&filter[tournaments.start_date][lte]=${currentYear}-12-31&filter[tournaments.tier][in]=s,a&filter[tournaments.discipline_id][eq]=1`;

  try {
    const response = await makeRequest(url);
    
    const tournaments = response.results || [];
    
    return {
      edges: tournaments.map(tournament => ({
        node: {
          id: tournament.id.toString(),
          name: tournament.name,
          slug: tournament.slug,
          nameShortened: tournament.slug.replace(/-/g, ' ').toUpperCase(),
          status: tournament.status,
          startDate: tournament.start_date,
          endDate: tournament.end_date,
          prize: tournament.prize,
          tier: tournament.tier,
          image: tournament.image_url,
          teams: tournament.teams || [],
          tournamentPrizes: tournament.tournament_prizes || []
        }
      }))
    };
  } catch (error) {
    console.error('Error fetching recent tournaments:', error);
    return { edges: [] };
  }
};

/**
 * Get all tournaments (general function)
 */
const getTournaments = async (status = 'current', limit = 100) => {
  let scope = 'index-current-tournaments';
  let statusFilter = 'current,upcoming';
  
  if (status === 'finished') {
    scope = 'index-finished-tournaments';
    statusFilter = 'finished';
  } else if (status === 'upcoming') {
    scope = 'index-upcoming-tournaments';
    statusFilter = 'upcoming';
  }
  const currentYear = new Date().getFullYear();
  const url = `${BASE_URL}/api/v1/tournaments?scope=${scope}&page[offset]=0&page[limit]=${limit}&sort=start_date&filter[tournaments.status][in]=${statusFilter}&filter[tournaments.end_date][gte]=${currentYear}-01-01&filter[tournaments.start_date][lte]=${currentYear}-12-31&filter[tournaments.tier][in]=s,a&filter[tournaments.discipline_id][eq]=1`;

  try {
    const response = await makeRequest(url);
    
    const tournaments = response.results || [];
    
    return {
      edges: tournaments.map(tournament => ({
        node: {
          id: tournament.id.toString(),
          name: tournament.name,
          slug: tournament.slug,
          nameShortened: tournament.slug.replace(/-/g, ' ').toUpperCase(),
          status: tournament.status,
          startDate: tournament.start_date,
          endDate: tournament.end_date,
          prize: tournament.prize,
          tier: tournament.tier,
          image: tournament.image_url,
          teams: tournament.teams || []
        }
      }))
    };
  } catch (error) {
    console.error('Error fetching tournaments:', error);
    return { edges: [] };
  }
};

/**
 * Get tournament series/matches (if needed for tournament details)
 */
const getTournamentSeries = async (tournamentId) => {
  // This would need a specific endpoint for tournament matches
  // For now, return empty as the bo3.gg API structure isn't fully clear for this
  console.log('getTournamentSeries called with:', tournamentId);
  return { edges: [] };
};

// LEGACY SUPPORT FUNCTIONS (to maintain compatibility)

/**
 * Get series data (legacy function)
 */
const getSeries = async (dateFilter = 'today') => {
  // This function combines live, upcoming, and completed matches
  // to match the original structure expected by the home screen
  
  try {
    const [liveMatches, upcomingMatches, completedMatches] = await Promise.all([
      getLiveMatches(),
      getUpcomingMatches(dateFilter),
      getCompletedMatches(10)
    ]);
    
    return {
      live: liveMatches.edges,
      upcoming: upcomingMatches.edges,
      completed: completedMatches.edges,
      // Include raw data for debugging if needed
      rawData: {
        live: liveMatches,
        upcoming: upcomingMatches,
        completed: completedMatches
      }
    };
  } catch (error) {
    console.error('Error fetching series data:', error);
    return {
      live: [],
      upcoming: [],
      completed: [],
      rawData: null
    };
  }
};

// TOURNAMENT DETAIL API FUNCTIONS (for CS2TournamentScreen)

/**
 * Helper function to get tournament slug from ID
 */
const getTournamentSlugFromId = async (tournamentId) => {
  try {
    // Search for tournament by ID in current tournaments
    const currentTournaments = await getCurrentAndUpcomingTournaments(500);
    const tournament = currentTournaments.edges.find(edge => edge.node.id === tournamentId.toString());
    
    if (tournament) {
      return tournament.node.slug;
    }
    
    // If not found in current, try recent tournaments
    const recentTournaments = await getRecentTournaments(500);
    const recentTournament = recentTournaments.edges.find(edge => edge.node.id === tournamentId.toString());
    
    if (recentTournament) {
      return recentTournament.node.slug;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting tournament slug from ID:', error);
    return null;
  }
};

/**
 * Get specific tournament details by slug or ID
 */
const getTournamentDetails = async (tournamentSlug, tournamentId = null) => {
  let slugToUse = tournamentSlug;
  
  // Only do expensive lookup if no slug is provided
  if (!tournamentSlug) {
    if (tournamentId && /^\d+$/.test(tournamentId.toString())) {
      const slug = await getTournamentSlugFromId(tournamentId);
      if (slug) {
        slugToUse = slug;
      } else {
        slugToUse = tournamentId; // Fallback to ID if slug lookup fails
      }
    } else if (tournamentId) {
      slugToUse = tournamentId; // Use ID if no slug and ID doesn't look numeric
    }
  }
  
  const url = `${BASE_URL}/api/v1/tournaments/${slugToUse}?prefer_locale=en`;
  
  try {
    const response = await makeRequest(url);
    
    console.log('Raw tournament API response:', JSON.stringify(response, null, 2));
    
    return {
      id: response.id,
      name: response.name,
      slug: response.slug,
      description: response.description,
      imageUrl: response.image_url,
      startDate: response.start_date,
      endDate: response.end_date,
      prize: response.prize,
      playersPrize: response.players_prize,
      teamsPrize: response.teams_prize,
      eventType: response.event_type,
      tier: response.tier,
      status: response.status,
      country: response.country,
      region: response.region,
      city: response.city,
      bannerImageUrl: response.banner_image_url,
      liveUpdates: response.live_updates || null,
      stages: response.stages || []
    };
  } catch (error) {
    console.error('Error fetching tournament details:', error);
    return null;
  }
};

/**
 * Get tournament teams/participants
 */
const getTournamentTeams = async (tournamentSlug, tournamentId = null) => {
  let slugToUse = tournamentSlug;
  
  // Only do expensive lookup if no slug is provided
  if (!tournamentSlug) {
    if (tournamentId && /^\d+$/.test(tournamentId.toString())) {
      const slug = await getTournamentSlugFromId(tournamentId);
      if (slug) {
        slugToUse = slug;
      } else {
        slugToUse = tournamentId; // Fallback to ID if slug lookup fails
      }
    } else if (tournamentId) {
      slugToUse = tournamentId; // Use ID if no slug and ID doesn't look numeric
    }
  }
  
  const url = `${BASE_URL}/api/v1/tournaments/${slugToUse}/redefined_teams_squad`;
  
  try {
    const response = await makeRequest(url);
    
    return response.map(team => ({
      id: team.team_id,
      name: team.team_name,
      slug: team.team_slug,
      logoUrl: team.team_image_url,
      country: team.country,
      players: team.players || []
    }));
  } catch (error) {
    console.error('Error fetching tournament teams:', error);
    return [];
  }
};

/**
 * Get tournament matches/results
 */
const getTournamentMatches = async (tournamentId) => {
  const url = `${BASE_URL}/api/v1/matches?page[offset]=0&page[limit]=100&sort=start_date&filter[matches.status][in]=current,upcoming,finished&filter[matches.tournament_id][eq]=${tournamentId}&filter[matches.discipline_id][eq]=1&with=teams,stage,tournament_deep`;
  
  try {
    const response = await makeRequest(url);
    
    const matches = response.results || [];
    
    return matches.map(match => ({
      id: match.id,
      slug: match.slug,
      team1Id: match.team1_id,
      team2Id: match.team2_id,
      team1Score: match.team1_score,
      team2Score: match.team2_score,
      winnerTeamId: match.winner_team_id,
      status: match.status,
      parsedStatus: match.parsed_status,
      boType: match.bo_type,
      startDate: match.start_date,
      endDate: match.end_date,
      tier: match.tier,
      stars: match.stars,
      stage: match.stage,
      teams: match.teams || [],
      mapsScore: match.maps_score || [],
      liveUpdates: match.live_updates || null
    }));
  } catch (error) {
    console.error('Error fetching tournament matches:', error);
    return [];
  }
};

/**
 * Helper functions for tournament screen
 */
const formatEventDateRange = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const options = { month: 'short', day: 'numeric' };
  
  if (start.toDateString() === end.toDateString()) {
    return start.toLocaleDateString('en-US', options);
  }
  
  return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
};

const formatPrizePool = (amount, currency = 'USD') => {
  if (!amount) return null;
  
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return `$${amount.toLocaleString()}`;
};

// Export all functions
export {
  // Matches functions
  getLiveMatches,
  getUpcomingMatches, 
  getCompletedMatches,
  getCompletedMatchesForDate,
  
  // Tournaments functions
  getCurrentAndUpcomingTournaments,
  getUpcomingTournaments,
  getRecentTournaments,
  getTournaments,
  getTournamentSeries,
  
  // Tournament Details functions (for CS2TournamentScreen)
  getTournamentSlugFromId,
  getTournamentDetails,
  getTournamentTeams,
  getTournamentMatches,
  formatEventDateRange,
  formatPrizePool,
  
  // Legacy support
  getSeries
};

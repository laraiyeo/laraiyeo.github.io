// Service for handling Valorant series API calls
// Based on the API structure from specific series.txt

const API_BASE_URL = 'https://corsproxy.io/?url=https://www.rib.gg';
const API_V1_BASE_URL = 'https://corsproxy.io/?url=https://be-prod.rib.gg/v1';

export const getSeriesDetails = async (seriesId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/_next/data/2glECPS_a3VR_3n_l25P6/en/series/${seriesId}.json?seriesId=${seriesId}`);
    const data = await response.json();
    
    if (data.pageProps && data.pageProps.series) {
      return data.pageProps.series;
    }
    
    throw new Error('Series not found');
  } catch (error) {
    console.error('Error fetching series details:', error);
    throw error;
  }
};

export const getTeamsHeadToHead = async (team1Id, team2Id) => {
  try {
    const response = await fetch(`${API_V1_BASE_URL}/series/head-to-head?team1Id=${team1Id}&team2Id=${team2Id}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching teams head-to-head:', error);
    throw error;
  }
};

export const formatSeriesData = (rawSeriesData) => {
  if (!rawSeriesData) return null;

  return {
    id: rawSeriesData.id,
    eventId: rawSeriesData.eventId,
    eventName: rawSeriesData.eventName,
    eventChildLabel: rawSeriesData.eventChildLabel,
    eventLogoUrl: rawSeriesData.eventLogoUrl,
    team1: rawSeriesData.team1,
    team2: rawSeriesData.team2,
    team1Score: rawSeriesData.team1Score,
    team2Score: rawSeriesData.team2Score,
    startDate: rawSeriesData.startDate,
    bestOf: rawSeriesData.bestOf,
    stage: rawSeriesData.stage,
    bracket: rawSeriesData.bracket,
    completed: rawSeriesData.completed,
    live: rawSeriesData.live,
    matches: rawSeriesData.matches || [],
    pickban: rawSeriesData.pickban || [],
    stats: rawSeriesData.stats || {},
    playerStats: rawSeriesData.playerStats || []
  };
};

// Agent name mapping based on agent ID from id info.txt
export const getAgentDisplayName = (agentId) => {
  const agentMap = {
    1: 'Breach',
    2: 'Raze', 
    3: 'Cypher',
    4: 'Sova',
    5: 'Killjoy',
    6: 'Viper',
    7: 'Phoenix',
    8: 'Brimstone',
    9: 'Sage',
    10: 'Reyna',
    11: 'Omen',
    12: 'Jett',
    13: 'Skye',
    14: 'Yoru',
    15: 'Astra',
    16: 'KAY/O',
    17: 'Chamber',
    18: 'Neon',
    19: 'Fade',
    20: 'Harbor',
    21: 'Gekko',
    22: 'Deadlock',
    23: 'Iso',
    25: 'Clove',
    26: 'Vyse',
    27: 'Tejo',
    28: 'Waylay'
  };
  return agentMap[agentId] || 'Unknown';
};

// Map name mapping based on map ID from id info.txt
export const getMapNameById = (mapId) => {
  const mapMap = {
    1: 'Ascent',
    7: 'Haven', 
    2: 'Split',
    3: 'Bind',
    4: 'Icebox',
    8: 'Breeze',
    9: 'Fracture',
    10: 'Pearl',
    11: 'Lotus',
    12: 'Sunset',
    13: 'Abyss',
    14: 'Corrode'
  };
  return mapMap[mapId] || 'Unknown';
};

// Map name mapping based on owName from id info.txt
export const getMapDisplayName = (mapName) => {
  // If it's already a display name, return it
  if (mapName && typeof mapName === 'string') {
    // Common map names that don't need translation
    const commonMaps = ['Bind', 'Haven', 'Split', 'Ascent', 'Icebox', 'Breeze', 'Fracture', 'Pearl', 'Lotus', 'Sunset', 'Abyss'];
    if (commonMaps.includes(mapName)) {
      return mapName;
    }
  }
  
  // Handle owName mappings
  const mapMap = {
    'Infinity': 'Abyss',
    'Ascent': 'Ascent',
    'Duality': 'Haven',
    'Foxtrot': 'Split',
    'Rook': 'Corrode', // This matches the API data
    'Canyon': 'Breeze',
    'Triad': 'Fracture',
    'Port': 'Pearl',
    'Jam': 'Lotus',
    'Pitt': 'Sunset',
    'Bonsai': 'Bind'
  };
  return mapMap[mapName] || mapName || 'Unknown';
};

// Get image URLs based on images.txt pattern
export const getAgentImageUrl = (agentName) => {
  // Normalize agent name for URL - remove special characters and spaces
  const normalizedName = agentName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ''); // Remove all non-alphanumeric characters
  
  return `https://www.rib.gg/assets/agents/${normalizedName}.webp`;
};

export const getMapImageUrl = (mapName) => {
  return `https://www.rib.gg/assets/maps/${mapName.toLowerCase()}.png`;
};

export const getMapSampleUrl = (mapName) => {
  return `https://www.rib.gg/assets/map-samples/${mapName.toLowerCase()}.webp`;
};

export const getWeaponImageUrl = (weaponName) => {
  return `https://www.rib.gg/assets/weapons/${weaponName.toLowerCase()}.png`;
};

// Format match data for display
export const formatMatchData = (match, mapId) => {
  if (!match) return null;

  return {
    id: match.id,
    mapId: mapId,
    mapName: match.mapName,
    team1Score: match.team1Score,
    team2Score: match.team2Score,
    completed: match.completed,
    startedAt: match.startedAt,
    endedAt: match.endedAt,
    rounds: match.rounds || [],
    players: match.players || []
  };
};

// Process round data for visualization
export const processRoundData = (rounds) => {
  if (!rounds || !Array.isArray(rounds)) return [];

  return rounds.map((round, index) => ({
    roundNumber: index + 1,
    winner: round.winner,
    winType: round.winType,
    events: round.events || [],
    playerStats: round.playerStats || {}
  }));
};

// Calculate attack and defense rounds won for each team
export const calculateAttackDefenseStats = (rounds, matchId) => {
  if (!rounds || !Array.isArray(rounds)) return { team1: { attack: 0, defense: 0 }, team2: { attack: 0, defense: 0 } };

  // Filter rounds for this specific match
  const matchRounds = rounds.filter(round => round.matchId === matchId);
  
  const stats = { 
    team1: { attack: 0, defense: 0 }, 
    team2: { attack: 0, defense: 0 } 
  };

  matchRounds.forEach(round => {
    const { winningTeamNumber, attackingTeamNumber } = round;
    
    if (winningTeamNumber === attackingTeamNumber) {
      // Attacking team won - add to attack stats
      if (winningTeamNumber === 1) {
        stats.team1.attack++;
      } else {
        stats.team2.attack++;
      }
    } else {
      // Defending team won - add to defense stats
      if (winningTeamNumber === 1) {
        stats.team1.defense++;
      } else {
        stats.team2.defense++;
      }
    }
  });

  return stats;
};

// Organize rounds by halves and overtime
export const organizeRoundsByHalves = (rounds, matchId) => {
  if (!rounds || !Array.isArray(rounds)) return { firstHalf: [], secondHalf: [], overtime: [] };

  // Filter rounds for this specific match
  const matchRounds = rounds
    .filter(round => round.matchId === matchId)
    .sort((a, b) => a.number - b.number);

  const firstHalf = matchRounds.filter(round => round.number <= 12);
  const secondHalf = matchRounds.filter(round => round.number > 12 && round.number <= 24);
  const overtime = matchRounds.filter(round => round.number > 24);

  return { firstHalf, secondHalf, overtime };
};

// Get icon name for win condition
export const getWinConditionIcon = (winCondition) => {
  const iconMap = {
    'kills': 'skull',
    'defuse': 'wrench', 
    'bomb': 'bomb',
    'time': 'clock'
  };
  return iconMap[winCondition] || 'question';
};

// Get icon name for attack/defense
export const getAttackDefenseIcon = (isAttacking) => {
  return isAttacking ? 'gun' : 'shield-halved';
};

export default {
  getSeriesDetails,
  formatSeriesData,
  getAgentDisplayName,
  getMapNameById,
  getMapDisplayName,
  getAgentImageUrl,
  getMapImageUrl,
  getMapSampleUrl,
  getWeaponImageUrl,
  formatMatchData,
  processRoundData
};
// Service for handling Valorant series API calls
// Based on the API structure from specific series.txt

import { RibBuildIdService } from "./RibBuildIdService";

const API_BASE_URL = "https://www.rib.gg";
const API_V1_BASE_URL = "https://be-prod.rib.gg/v1";

export const getSeriesDetails = async (seriesId) => {
  try {
    const url = await RibBuildIdService.getNextDataUrl(
      `/en/series/${seriesId}.json?seriesId=${seriesId}`
    );
    const response = await fetch(url);
    const data = await response.json();

    if (data.pageProps && data.pageProps.series) {
      return data.pageProps.series;
    }

    throw new Error("Series not found");
  } catch (error) {
    console.error("Error fetching series details:", error);
    throw error;
  }
};

export const getTeamsHeadToHead = async (team1Id, team2Id) => {
  try {
    const response = await fetch(
      `${API_V1_BASE_URL}/series/head-to-head?team1Id=${team1Id}&team2Id=${team2Id}`
    );
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching teams head-to-head:", error);
    throw error;
  }
};

// Event Stats API endpoints
export const getTopAgentsByRole = async (eventId) => {
  try {
    const response = await fetch(
      `${API_V1_BASE_URL}/x/events/top-agents-by-role?eventId=${eventId}`
    );
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching top agents by role:", error);
    throw error;
  }
};

export const getBasicStatsByAgent = async (eventId) => {
  try {
    const response = await fetch(
      `${API_V1_BASE_URL}/x/events/basic-stats-by-agent?eventId=${eventId}`
    );
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching basic stats by agent:", error);
    throw error;
  }
};

export const getMapTopComps = async (eventId) => {
  try {
    const response = await fetch(
      `${API_V1_BASE_URL}/x/events/map-top-comps?eventId=${eventId}`
    );
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching map top comps:", error);
    throw error;
  }
};

export const getTopPlayers = async (eventId) => {
  try {
    const response = await fetch(
      `${API_V1_BASE_URL}/x/events/top-players?eventId=${eventId}`
    );
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching top players:", error);
    throw error;
  }
};

export const getTopPlayersByMultikills = async (eventId) => {
  try {
    const response = await fetch(
      `${API_V1_BASE_URL}/x/events/top-players-by-multikills?eventId=${eventId}`
    );
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching top players by multikills:", error);
    throw error;
  }
};

export const getTopPlayersByWeaponsKills = async (eventId) => {
  try {
    const response = await fetch(
      `${API_V1_BASE_URL}/x/events/top-players-by-weapons-kills?eventId=${eventId}`
    );
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching top players by weapons kills:", error);
    throw error;
  }
};

export const formatSeriesData = (rawSeriesData) => {
  if (!rawSeriesData) return null;

  return {
    id: rawSeriesData.id,
    parentEventId: rawSeriesData.parentEventId || rawSeriesData.eventId,
    eventId: rawSeriesData.eventId,
    eventName: rawSeriesData.eventName,
    eventLivestreamLink: rawSeriesData.eventLivestreamLink || rawSeriesData.parentEventLivestreamLink || null,
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
    playerStats: rawSeriesData.playerStats || [],
  };
};

// Agent name mapping based on agent ID from id info.txt
export const getAgentDisplayName = (agentId) => {
  const agentMap = {
    1: "Breach",
    2: "Raze",
    3: "Cypher",
    4: "Sova",
    5: "Killjoy",
    6: "Viper",
    7: "Phoenix",
    8: "Brimstone",
    9: "Sage",
    10: "Reyna",
    11: "Omen",
    12: "Jett",
    13: "Skye",
    14: "Yoru",
    15: "Astra",
    16: "KAY/O",
    17: "Chamber",
    18: "Neon",
    19: "Fade",
    20: "Harbor",
    21: "Gekko",
    22: "Deadlock",
    23: "Iso",
    25: "Clove",
    26: "Vyse",
    27: "Tejo",
    28: "Waylay",
    29: "Veto",
    33: "Miks"
  };
  return agentMap[agentId] || "Unknown";
};

export const getAgentUuidById = (agentId) => {
  const agentMap = {
    1: "5f8d3a7f-467b-97f3-062c-13acf203c006",
    2: "f94c3b30-42be-e959-889c-5aa313dba261",
    3: "117ed9e3-49f3-6512-3ccf-0cada7e3823b",
    4: "320b2a48-4d9b-a075-30f1-1f93a9b638fa",
    5: "1e58de9c-4950-5125-93e9-a0aee9f98746",
    6: "707eab51-4836-f488-046a-cda6bf494859",
    7: "eb93336a-449b-9c1b-0a54-a891f7921d69",
    8: "9f0d8ba9-4140-b941-57d3-a7ad57c6b417",
    9: "569fdd95-4d10-43ab-ca70-79becc718b46",
    10: "a3bfb853-43b2-7238-a4f1-ad90e9e46bcc",
    11: "8e253930-4c05-31dd-1b6c-968525494517",
    12: "add6443a-41bd-e414-f6ad-e58d267f4e95",
    13: "6f2a04ca-43e0-be17-7f36-b3908627744d",
    14: "7f94d92c-4234-0a36-9646-3a87eb8b5c89",
    15: "41fb69c1-4189-7b37-f117-bcaf1e96f1bf",
    16: "601dbbe7-43ce-be57-2a40-4abd24953621",
    17: "22697a3d-45bf-8dd7-4fec-84a9e28c69d7",
    18: "bb2a4828-46eb-8cd1-e765-15848195d751",
    19: "dade69b4-4f5a-8528-247b-219e5a1facd6",
    20: "95b78ed7-4637-86d9-7e41-71ba8c293152",
    21: "e370fa57-4757-3604-3648-499e1f642d3f",
    22: "cc8b64c8-4b25-4ff9-6e7f-37b4da43d235",
    23: "0e38b510-41a8-5780-5e8f-568b2a4f2d6c",
    25: "1dbf2edd-4729-0984-3115-daa5eed44993",
    26: "efba5359-4016-a1e5-7626-b1ae76895940",
    27: "b444168c-4e35-8076-db47-ef9bf368f384",
    28: "df1cb487-4902-002e-5c17-d28e83e78588",
    29: "92eeef5d-43b5-1d4a-8d03-b3927a09034b",
    33: "7c8a4701-4de6-9355-b254-e09bc2a34b72",
  };
  return agentMap[agentId] || "Unknown";
};

export const getAgentUuidByName = (agentId) => {
  const agentMap = {
    "Breach": "5f8d3a7f-467b-97f3-062c-13acf203c006",
    "Raze": "f94c3b30-42be-e959-889c-5aa313dba261",
    "Cypher": "117ed9e3-49f3-6512-3ccf-0cada7e3823b",
    "Sova": "320b2a48-4d9b-a075-30f1-1f93a9b638fa",
    "Killjoy": "1e58de9c-4950-5125-93e9-a0aee9f98746",
    "Viper": "707eab51-4836-f488-046a-cda6bf494859",
    "Phoenix": "eb93336a-449b-9c1b-0a54-a891f7921d69",
    "Brimstone": "9f0d8ba9-4140-b941-57d3-a7ad57c6b417",
    "Sage": "569fdd95-4d10-43ab-ca70-79becc718b46",
    "Reyna": "a3bfb853-43b2-7238-a4f1-ad90e9e46bcc",
    "Omen": "8e253930-4c05-31dd-1b6c-968525494517",
    "Jett": "add6443a-41bd-e414-f6ad-e58d267f4e95",
    "Skye": "6f2a04ca-43e0-be17-7f36-b3908627744d",
    "Yoru": "7f94d92c-4234-0a36-9646-3a87eb8b5c89",
    "Astra": "41fb69c1-4189-7b37-f117-bcaf1e96f1bf",
    "KAY/O": "601dbbe7-43ce-be57-2a40-4abd24953621",
    "Chamber": "22697a3d-45bf-8dd7-4fec-84a9e28c69d7",
    "Neon": "bb2a4828-46eb-8cd1-e765-15848195d751",
    "Fade": "dade69b4-4f5a-8528-247b-219e5a1facd6",
    "Harbor": "95b78ed7-4637-86d9-7e41-71ba8c293152",
    "Gekko": "e370fa57-4757-3604-3648-499e1f642d3f",
    "Deadlock": "cc8b64c8-4b25-4ff9-6e7f-37b4da43d235",
    "Iso": "0e38b510-41a8-5780-5e8f-568b2a4f2d6c",
    "Clove": "1dbf2edd-4729-0984-3115-daa5eed44993",
    "Vyse": "efba5359-4016-a1e5-7626-b1ae76895940",
    "Tejo": "b444168c-4e35-8076-db47-ef9bf368f384",
    "Waylay": "df1cb487-4902-002e-5c17-d28e83e78588",
    "Veto": "92eeef5d-43b5-1d4a-8d03-b3927a09034b",
    "Miks": "7c8a4701-4de6-9355-b254-e09bc2a34b72",
  };
  return agentMap[agentId] || "Unknown";
};

export const getIdByMapName = (mapName) => {
  const mapMap = {
    abyss: "224b0a95-48b9-f703-1bd8-67aca101a61f",
    ascent: "7eaecc1b-4337-bbf6-6ab9-04b8f06b3319",
    bind: "2c9d57ec-4431-9c5e-2939-8f9ef6dd5cba",
    breeze: "2fb9a4fd-47b8-4e7d-a969-74b4046ebd53",
    corrode: "1c18ab1f-420d-0d8b-71d0-77ad3c439115",
    fracture: "b529448b-4d60-346e-e89e-00a4c527a405",
    haven: "2bee0dc9-4ffe-519b-1cbd-7fbe763a6047",
    icebox: "e2ad5c54-4114-a870-9641-8ea21279579a",
    lotus: "2fe4ed3a-450a-948b-6d6b-e89a78e680a9",
    pearl: "fd267378-4d1d-484f-ff52-77821ed10dc2",
    split: "d960549e-485c-e861-8d71-aa9d1aed12a2",
    sunset: "92584fbe-486a-b1b2-9faa-39b0f486b498",
  };
  return mapMap[mapName] || null;
};

// Map name mapping based on map ID from id info.txt
export const getMapNameById = (mapId) => {
  const mapMap = {
    1: "Ascent",
    7: "Haven",
    2: "Split",
    3: "Bind",
    4: "Icebox",
    8: "Breeze",
    9: "Fracture",
    10: "Pearl",
    11: "Lotus",
    12: "Sunset",
    13: "Abyss",
    14: "Corrode",
  };
  return mapMap[mapId] || "Unknown";
};

// Map name mapping based on owName from id info.txt
export const getMapDisplayName = (mapName) => {
  // If it's already a display name, return it
  if (mapName && typeof mapName === "string") {
    // Common map names that don't need translation
    const commonMaps = [
      "Bind",
      "Haven",
      "Split",
      "Ascent",
      "Icebox",
      "Breeze",
      "Fracture",
      "Pearl",
      "Lotus",
      "Sunset",
      "Abyss",
    ];
    if (commonMaps.includes(mapName)) {
      return mapName;
    }
  }

  // Handle owName mappings
  const mapMap = {
    Infinity: "Abyss",
    Ascent: "Ascent",
    Duality: "Haven",
    Foxtrot: "Split",
    Rook: "Corrode", // This matches the API data
    Canyon: "Breeze",
    Triad: "Fracture",
    Port: "Pearl",
    Jam: "Lotus",
    Pitt: "Sunset",
    Bonsai: "Bind",
  };
  return mapMap[mapName] || mapName || "Unknown";
};

// Get image URLs based on images.txt pattern
export const getAgentImageUrl = (agentName) => {
  // Accept either agent name (string) or agent id (number). Normalize to string for URL.
  if (agentName === undefined || agentName === null)
    return `https://www.rib.gg/assets/agents/unknown.webp`;

  const nameStr = typeof agentName !== "string" ? getAgentUuidById(agentName) : getAgentUuidByName(agentName);

  return `https://media.valorant-api.com/agents/${nameStr}/displayicon.png`;
};

export const getMapImageUrl = (mapName) => {
  return `https://www.rib.gg/assets/maps/${mapName.toLowerCase()}.png`;
};

export const getMapSampleUrl = (mapName) => {
  return `https://media.valorant-api.com/maps/${getIdByMapName(mapName.toLowerCase())}/listviewicon.png`;
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
    players: match.players || [],
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
    playerStats: round.playerStats || {},
  }));
};

// Calculate attack and defense rounds won for each team
export const calculateAttackDefenseStats = (rounds, matchId) => {
  if (!rounds || !Array.isArray(rounds))
    return {
      team1: { attack: 0, defense: 0 },
      team2: { attack: 0, defense: 0 },
    };

  // Filter rounds for this specific match
  const matchRounds = rounds.filter((round) => round.matchId === matchId);

  const stats = {
    team1: { attack: 0, defense: 0 },
    team2: { attack: 0, defense: 0 },
  };

  matchRounds.forEach((round) => {
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
  if (!rounds || !Array.isArray(rounds))
    return { firstHalf: [], secondHalf: [], overtime: [] };

  // Filter rounds for this specific match
  const matchRounds = rounds
    .filter((round) => round.matchId === matchId)
    .sort((a, b) => a.number - b.number);

  const firstHalf = matchRounds.filter((round) => round.number <= 12);
  const secondHalf = matchRounds.filter(
    (round) => round.number > 12 && round.number <= 24
  );
  const overtime = matchRounds.filter((round) => round.number > 24);

  return { firstHalf, secondHalf, overtime };
};

// Get icon name for win condition
export const getWinConditionIcon = (winCondition) => {
  const iconMap = {
    kills: "skull",
    defuse: "wrench",
    bomb: "bomb",
    time: "clock",
  };
  return iconMap[winCondition] || "question";
};

// Get icon name for attack/defense
export const getAttackDefenseIcon = (isAttacking) => {
  return isAttacking ? "gun" : "shield-halved";
};

export default {
  getSeriesDetails,
  getTeamsHeadToHead,
  formatSeriesData,
  getAgentDisplayName,
  getMapNameById,
  getMapDisplayName,
  getAgentImageUrl,
  getMapImageUrl,
  getMapSampleUrl,
  getWeaponImageUrl,
  formatMatchData,
  processRoundData,
  getTopAgentsByRole,
  getBasicStatsByAgent,
  getMapTopComps,
  getTopPlayers,
  getTopPlayersByMultikills,
  getTopPlayersByWeaponsKills,
};

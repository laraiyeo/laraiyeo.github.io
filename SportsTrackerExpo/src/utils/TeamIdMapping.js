// Team ID mapping utilities to handle conversions between MLB IDs and ESPN IDs
// This solves the problem where MLB teams use MLB API IDs while other sports use ESPN IDs,
// which can cause conflicts in the favorites system when IDs overlap.

// Complete mapping: MLB Team ID -> ESPN Team ID
export const MLB_TO_ESPN_ID_MAPPING = {
  // American League East
  '110': '1',   // Baltimore Orioles
  '111': '2',   // Boston Red Sox
  '147': '10',  // New York Yankees
  '139': '30',  // Tampa Bay Rays
  '141': '14',  // Toronto Blue Jays
  
  // American League Central
  '145': '4',   // Chicago White Sox
  '114': '5',   // Cleveland Guardians (formerly Indians)
  '116': '6',   // Detroit Tigers
  '118': '7',   // Kansas City Royals
  '142': '9',   // Minnesota Twins
  
  // American League West
  '117': '18',  // Houston Astros
  '108': '3',   // Los Angeles Angels
  '133': '11',  // Oakland Athletics
  '136': '12',  // Seattle Mariners
  '140': '13',  // Texas Rangers
  
  // National League East
  '144': '15',  // Atlanta Braves
  '146': '28',  // Miami Marlins
  '121': '21',  // New York Mets
  '143': '22',  // Philadelphia Phillies
  '120': '20',  // Washington Nationals
  
  // National League Central
  '112': '16',  // Chicago Cubs
  '113': '17',  // Cincinnati Reds
  '158': '8',   // Milwaukee Brewers
  '134': '23',  // Pittsburgh Pirates
  '138': '24',  // St. Louis Cardinals
  
  // National League West
  '109': '29',  // Arizona Diamondbacks
  '115': '27',  // Colorado Rockies
  '119': '19',  // Los Angeles Dodgers
  '135': '25',  // San Diego Padres
  '137': '26'   // San Francisco Giants
};

// Reverse mapping: ESPN Team ID -> MLB Team ID
export const ESPN_TO_MLB_ID_MAPPING = Object.fromEntries(
  Object.entries(MLB_TO_ESPN_ID_MAPPING).map(([mlbId, espnId]) => [espnId, mlbId])
);

// Team abbreviation mappings for reference
export const ESPN_ABBREVIATION_TO_MLB_ID = {
  'LAA': '108', 'HOU': '117', 'ATH': '133', 'TOR': '141', 'ATL': '144',
  'MIL': '158', 'STL': '138', 'CHC': '112', 'ARI': '109', 'LAD': '119',
  'SF': '137', 'CLE': '114', 'SEA': '136', 'MIA': '146', 'NYM': '121',
  'WSH': '120', 'BAL': '110', 'SD': '135', 'PHI': '143', 'PIT': '134',
  'TEX': '140', 'TB': '139', 'BOS': '111', 'CIN': '113', 'COL': '115',
  'KC': '118', 'DET': '116', 'MIN': '142', 'CWS': '145', 'NYY': '147',
  // Alternative abbreviations
  'A': '133',   // Sometimes Athletics use just 'A'
  'AS': '133'   // Alternative Athletics abbreviation
};

export const ESPN_ABBREVIATION_TO_ESPN_ID = {
  'LAA': '3', 'HOU': '18', 'ATH': '11', 'TOR': '14', 'ATL': '15',
  'MIL': '8', 'STL': '24', 'CHC': '16', 'ARI': '29', 'LAD': '19',
  'SF': '26', 'CLE': '5', 'SEA': '12', 'MIA': '28', 'NYM': '21',
  'WSH': '20', 'BAL': '1', 'SD': '25', 'PHI': '22', 'PIT': '23',
  'TEX': '13', 'TB': '30', 'BOS': '2', 'CIN': '17', 'COL': '27',
  'KC': '7', 'DET': '6', 'MIN': '9', 'CWS': '4', 'NYY': '10',
  // Alternative abbreviations
  'A': '11',   // Athletics
  'AS': '11'   // Alternative Athletics abbreviation
};

/**
 * Convert MLB team ID to ESPN team ID
 * @param {string|number} mlbId - The MLB team ID
 * @returns {string|null} - The corresponding ESPN team ID, or null if not found
 */
export const convertMLBIdToESPNId = (mlbId) => {
  if (!mlbId) return null;
  const mlbIdString = String(mlbId);
  return MLB_TO_ESPN_ID_MAPPING[mlbIdString] || null;
};

/**
 * Convert ESPN team ID to MLB team ID
 * @param {string|number} espnId - The ESPN team ID
 * @returns {string|null} - The corresponding MLB team ID, or null if not found
 */
export const convertESPNIdToMLBId = (espnId) => {
  if (!espnId) return null;
  const espnIdString = String(espnId);
  return ESPN_TO_MLB_ID_MAPPING[espnIdString] || null;
};

/**
 * Determine if a team ID is a MLB ID (exists in our MLB mapping)
 * @param {string|number} teamId - The team ID to check
 * @returns {boolean} - True if it's a MLB ID, false otherwise
 */
export const isMLBId = (teamId) => {
  if (!teamId) return false;
  return MLB_TO_ESPN_ID_MAPPING.hasOwnProperty(String(teamId));
};

/**
 * Determine if a team ID is an ESPN ID for MLB (exists in our ESPN mapping)
 * @param {string|number} teamId - The team ID to check
 * @returns {boolean} - True if it's an ESPN MLB ID, false otherwise
 */
export const isESPNMLBId = (teamId) => {
  if (!teamId) return false;
  return ESPN_TO_MLB_ID_MAPPING.hasOwnProperty(String(teamId));
};

/**
 * Normalize a team ID for favorites storage (convert MLB IDs to ESPN IDs)
 * This ensures all team IDs are stored consistently as ESPN IDs in favorites
 * @param {string|number} teamId - The team ID to normalize
 * @param {string} sport - The sport context ('mlb', 'nfl', 'soccer', etc.)
 * @returns {string} - The normalized team ID (ESPN ID format)
 */
export const normalizeTeamIdForStorage = (teamId, sport) => {
  if (!teamId) return teamId;
  
  const teamIdString = String(teamId);
  
  // For MLB teams, convert MLB ID to ESPN ID if it's a MLB ID
  if (sport === 'mlb' && isMLBId(teamIdString)) {
    const espnId = convertMLBIdToESPNId(teamIdString);
    console.log(`[TEAM ID MAPPING] Normalizing MLB ID ${teamIdString} -> ESPN ID ${espnId} for storage`);
    // Append sport suffix for storage
    return addSportSuffix(espnId || teamIdString, sport);
  }
  
  // For other sports, return as-is (already ESPN IDs)
  return addSportSuffix(teamIdString, sportMapNormalize(sport));
};

/**
 * Get the API-specific team ID for making requests
 * This converts ESPN IDs back to MLB IDs when needed for MLB API calls
 * @param {string|number} teamId - The stored team ID (should be ESPN format)
 * @param {string} sport - The sport context ('mlb', 'nfl', 'soccer', etc.)
 * @returns {string} - The API-specific team ID
 */
export const getAPITeamId = (teamId, sport) => {
  if (!teamId) return teamId;
  
  let teamIdString = String(teamId);

  // If the stored teamId includes a sport suffix (e.g. "1_mlb"), strip it for API use
  const { id: baseId, sport: suffixSport } = stripSportSuffix(teamIdString);
  const effectiveSport = (sport || suffixSport || '').toLowerCase();

  // For MLB API calls, convert ESPN ID back to MLB ID if it's an ESPN MLB ID
  if (effectiveSport === 'mlb') {
    // baseId may already be an ESPN ID; convert to MLB ID if possible
    if (isESPNMLBId(baseId)) {
      const mlbId = convertESPNIdToMLBId(baseId);
      console.log(`[TEAM ID MAPPING] Converting ESPN ID ${baseId} -> MLB ID ${mlbId} for API call`);
      return mlbId || baseId;
    }
    return baseId;
  }

  // Other sports: return base id (ESPN ID)
  // If we failed to strip a suffix but the effective sport is soccer (or a UEFA variant),
  // try a defensive fallback: extract a leading numeric id (many soccer team ids are numeric)
  if (effectiveSport && effectiveSport.includes('soccer') || effectiveSport.includes('uefa') || effectiveSport.includes('champions') || effectiveSport.includes('europa')) {
    const m = String(baseId).match(/^(\d+)/);
    if (m) {
      console.log(`[TEAM ID MAPPING] Fallback: extracted numeric API id ${m[1]} from ${baseId}`);
      return m[1];
    }
  }

  return baseId;
};

// NHL team abbreviation to team ID mapping for reference
export const NHL_ABBREVIATION_TO_ID = {
  'TOR': '21', 'MTL': '10', 'CGY': '3', 'EDM': '6', 'VAN': '22', 'WPG': '28',
  'BOS': '1', 'NYR': '13', 'PHI': '15', 'PIT': '16', 'TBL': '20', 'CAR': '7',
  'CHI': '4', 'DET': '5', 'NSH': '27', 'STL': '19', 'WSH': '23',
  'ANA': '25', 'LAK': '8', 'SJS': '18', 'CBJ': '29', 'MIN': '30', 'OTT': '14',
  'FLA': '26', 'BUF': '2', 'NJD': '11', 'NYI': '12', 'DAL': '9', 'COL': '17',
  'UTA': '129764', 'SEA': '124292', 'VGK': '37',
  // Alternate abbreviations
  'TB': '20', 'CAR': '7', 'VEG': '37', 'LV': '37', 'VGS': '37', 'LA': '8', 'SJ': '18'
};

// NHL team ID to abbreviation mapping (reverse lookup)
export const NHL_ID_TO_ABBREVIATION = Object.fromEntries(
  Object.entries(NHL_ABBREVIATION_TO_ID).map(([abbr, id]) => [id, abbr])
);

/**
 * Get NHL team ID from abbreviation
 * @param {string} abbreviation - The NHL team abbreviation
 * @returns {string|null} - The corresponding team ID, or null if not found
 */
export const getNHLTeamIdFromAbbreviation = (abbreviation) => {
  if (!abbreviation) return null;
  return NHL_ABBREVIATION_TO_ID[String(abbreviation).toUpperCase()] || null;
};

/**
 * Get NHL team abbreviation from team ID
 * @param {string|number} teamId - The NHL team ID
 * @returns {string|null} - The corresponding abbreviation, or null if not found
 */
export const getNHLAbbreviationFromId = (teamId) => {
  if (!teamId) return null;
  return NHL_ID_TO_ABBREVIATION[String(teamId)] || null;
};

// Known sport suffixes to prevent over-aggressive stripping
// Keep these normalized to space-separated, lower-case forms. We will normalize incoming
// sport strings (dots -> spaces) so both 'uefa.champions' and 'uefa champions' match.
const KNOWN_SPORT_SUFFIXES = ['mlb', 'nfl', 'nba', 'nhl', 'soccer', 'wnba', 'f1', 'premier league', 'la liga', 'serie a', 'bundesliga', 'ligue 1', 'uefa champions', 'uefa europa', 'uefa europa conf'];

/**
 * Return whether a teamId already has a sport suffix and strip it.
 * Returns { id, sport }
 * Only strips known sport suffixes to prevent issues with legitimate underscores in IDs
 */
export const stripSportSuffix = (teamId) => {
  if (!teamId) return { id: '', sport: '' };
  const s = String(teamId);
  const parts = s.split('_');
  if (parts.length >= 2) {
    // Join the tail parts to preserve multi-word sports and normalize separators
    let possibleSport = parts.slice(1).join('_').toLowerCase();
    // Remove any trailing parenthetical display name like " (Champions League)"
    // e.g. "champions league (Champions League)" -> "champions league"
    possibleSport = possibleSport.replace(/\s*\([^)]*\)\s*$/, '').trim();
    // Normalize '.' to spaces and underscores to spaces, trim
    possibleSport = possibleSport.replace(/\./g, ' ').replace(/_/g, ' ').trim();
    // Map aliases to canonical sport suffixes (e.g., 'champions league' -> 'uefa champions')
    const normalizedSport = sportMapNormalize(possibleSport);
    // Only treat as sport suffix if it matches a known sport (normalized list)
    if (KNOWN_SPORT_SUFFIXES.includes(normalizedSport)) {
      return { id: parts[0], sport: normalizedSport };
    }
  }
  return { id: s, sport: '' };
};

export const isSuffixed = (teamId) => {
  if (!teamId) return false;
  return String(teamId).includes('_');
};

export const addSportSuffix = (teamId, sport) => {
  if (!teamId) return teamId;
  if (!sport) return String(teamId);
  const s = String(teamId);
  if (isSuffixed(s)) return s;
  // Normalize sport string: convert dots/underscores to spaces and lowercase
  const normalized = sportMapNormalize(sport);
  return `${s}_${normalized}`;
};

// Map incoming sport strings to canonical normalized suffix used in storage
const SPORT_ALIAS_MAP = {
  'champions league': 'uefa champions',
  'uefa.champions': 'uefa champions',
  'uefa champions': 'uefa champions',
  'uefa.champions_qual': 'uefa champions',
  'europa league': 'uefa europa',
  'uefa.europa': 'uefa europa',
  'uefa europa': 'uefa europa',
  'europa conference': 'uefa europa conf',
  'uefa.europa.conf': 'uefa europa conf',
  'uefa.europa.conf': 'uefa europa conf',
  'premier league': 'premier league',
  'la liga': 'la liga',
  'serie a': 'serie a',
  'bundesliga': 'bundesliga',
  'ligue 1': 'ligue 1'
};

const sportMapNormalize = (sport) => {
  if (!sport) return '';
  const s = String(sport).toLowerCase().replace(/\./g, ' ').replace(/_/g, ' ').trim();
  return SPORT_ALIAS_MAP[s] || s;
};

/**
 * Helper function to migrate existing favorites from MLB IDs to ESPN IDs
 * This can be used to update existing stored favorites
 * @param {Array} favorites - Array of favorite team objects
 * @returns {Array} - Updated favorites with normalized team IDs
 */
export const migrateFavoritesToESPNIds = (favorites) => {
  if (!Array.isArray(favorites)) return favorites;
  
  return favorites.map(favorite => {
    const { teamId, sport } = favorite;
    const normalizedId = normalizeTeamIdForStorage(teamId, sport);
    const normalizedSport = sport || stripSportSuffix(teamId).sport || null;

    if (normalizedId !== teamId || favorite.sport == null) {
      console.log(`[TEAM ID MAPPING] Migrating favorite: ${teamId} -> ${normalizedId} (${normalizedSport})`);
      return { ...favorite, teamId: normalizedId, sport: normalizedSport };
    }

    return favorite;
  });
};
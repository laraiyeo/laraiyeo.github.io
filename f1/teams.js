const CONSTRUCTORS_API_URL = "https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2025/types/2/standings/1";

let allConstructors = [];
let lastConstructorsHash = null;

// Add cache for race event data
let raceEventCache = null;
let raceEventCacheExpiry = 0;
const RACE_EVENT_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Add cache for race card data to detect changes
let raceCardCache = new Map();

// Add proper caching like race-info.js
let competitionResultsCache = {};
let cacheExpiry = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Add proper hash checking like MLB teams.js
let lastRaceCardHash = new Map();

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

function convertToHttps(url) {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}

async function getConstructorDrivers(constructorName) {
  try {
    // Use cached drivers data if available
    if (window.cachedDriversData) {
      return window.cachedDriversData[constructorName] || [];
    }
    
    // Step 1: Get all drivers from standings once
    const driversResponse = await fetch('https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2025/types/2/standings/0');
    const driversData = await driversResponse.json();
    
    // Initialize cache object
    const driversByConstructor = {};
    
    // Process drivers in parallel with limited concurrency
    const batchSize = 5; // Process 5 drivers at a time to avoid overwhelming the API
    const standings = driversData.standings || [];
    
    for (let i = 0; i < standings.length; i += batchSize) {
      const batch = standings.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (standing) => {
        try {
          // Get athlete details
          const athleteResponse = await fetch(convertToHttps(standing.athlete.$ref));
          const athleteData = await athleteResponse.json();
          
          // Get event log
          const eventLogResponse = await fetch(convertToHttps(athleteData.eventLog.$ref));
          const eventLogData = await eventLogResponse.json();
          
          // Get first event item if it exists
          if (eventLogData.events?.items?.length > 0) {
            const firstEvent = eventLogData.events.items[0];
            
            if (firstEvent.competitor?.$ref) {
              const competitorResponse = await fetch(convertToHttps(firstEvent.competitor.$ref));
              const competitorData = await competitorResponse.json();
              
              const manufacturer = competitorData.vehicle?.manufacturer;
              if (manufacturer) {
                if (!driversByConstructor[manufacturer]) {
                  driversByConstructor[manufacturer] = [];
                }
                driversByConstructor[manufacturer].push(athleteData.fullName);
              }
            }
          }
        } catch (error) {
          console.error('Error processing athlete:', error);
        }
      }));
    }
    
    // Cache the results for subsequent calls
    window.cachedDriversData = driversByConstructor;
    
    return driversByConstructor[constructorName]?.slice(0, 2) || [];
  } catch (error) {
    console.error('Error fetching drivers for constructor:', error);
    return [];
  }
}

async function buildConstructorCard(constructor) {
  const logoUrl = getConstructorLogo(constructor.displayName);
  const carUrl = getConstructorCar(constructor.displayName);
  
  // Get drivers asynchronously but don't block the card creation
  let driversPromise = getConstructorDrivers(constructor.displayName);
  
  const points = constructor.points || 0;
  const wins = constructor.wins || 0;
  const rank = constructor.rank || '-';
  
  // Define constructors that need black text
  const blackTextConstructors = ['Williams', 'Alpine', 'Mercedes', 'Sauber', 'Haas'];
  const needsBlackText = blackTextConstructors.includes(constructor.displayName);
  const nameColor = needsBlackText ? 'color: black;' : '';
  const rankColor = needsBlackText ? 'color: #333;' : '';
  const driversColor = needsBlackText ? 'color: #222;' : 'color: #ccc;';
  const statsLabelColor = needsBlackText ? '#333;' : '#ccc';
  const statsValueColor = needsBlackText ? 'black;' : 'white';
  
  // Create card with placeholder drivers text
  const cardHtml = `
    <div class="constructor-card-wrapper">
      <div class="constructor-car">
        <img src="${carUrl}" alt="${constructor.displayName} car" class="car-image">
      </div>
      <div class="constructor-card">
        <div class="constructor-header">
          <img src="${logoUrl}" alt="${constructor.displayName}" class="constructor-logo">
          <h2 class="constructor-name" style="${nameColor}">${constructor.displayName}</h2>
          <div class="constructor-rank" style="${rankColor}">Championship Position: #${rank}</div><br>
          <div class="constructor-drivers" style="${driversColor}">Loading drivers...</div>
        </div>
        <div class="constructor-stats">
          <div class="stat-item">
            <div class="stat-label" style="color: ${statsLabelColor};">Points</div>
            <div class="stat-value" style="color: ${statsValueColor};">${points}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label" style="color: ${statsLabelColor};">Wins</div>
            <div class="stat-value" style="color: ${statsValueColor};">${wins}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label" style="color: ${statsLabelColor};">P. Behind</div>
            <div class="stat-value" style="color: ${statsValueColor};">${constructor.pointsBehind || 0}</div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Return both the HTML and the drivers promise
  return {
    html: cardHtml,
    driversPromise: driversPromise,
    driversColor: driversColor
  };
}

function getConstructorLogo(constructorName, forceWhite = false) {
  // Add safety check for constructorName
  if (!constructorName) {
    console.error('Constructor name is undefined in getConstructorLogo');
    return '';
  }
  
  // Convert constructor name to lowercase and handle special cases
  const nameMap = {
    'McLaren': 'mclaren',
    'Ferrari': 'ferrari', 
    'Red Bull': 'redbullracing',
    'Mercedes': 'mercedes',
    'Aston Martin': 'astonmartin',
    'Alpine': 'alpine',
    'Williams': 'williams',
    'RB': 'rb',
    'Haas': 'haas',
    'Sauber': 'kicksauber'
  };
  
  // Define constructors that need black logos (only for constructor cards, not race cards)
  const blackLogoConstructors = ['Williams', 'Alpine', 'Mercedes', 'Sauber'];
  const logoColor = (forceWhite || !blackLogoConstructors.includes(constructorName)) ? 'logowhite' : 'logoblack';
  
  const logoName = nameMap[constructorName] || constructorName.toLowerCase().replace(/\s+/g, '');
  return `https://media.formula1.com/image/upload/c_fit,h_1080/q_auto/v1740000000/common/f1/2025/${logoName}/2025${logoName}${logoColor}.webp`;
}

function getConstructorCar(constructorName) {
  // Add safety check for constructorName
  if (!constructorName) {
    console.error('Constructor name is undefined in getConstructorCar');
    return '';
  }
  
  // Convert constructor name to lowercase and handle special cases
  const nameMap = {
    'McLaren': 'mclaren',
    'Ferrari': 'ferrari', 
    'Red Bull': 'redbullracing',
    'Mercedes': 'mercedes',
    'Aston Martin': 'astonmartin',
    'Alpine': 'alpine',
    'Williams': 'williams',
    'RB': 'rb',
    'Haas': 'haas',
    'Sauber': 'kicksauber'
  };
  
  const carName = nameMap[constructorName] || constructorName.toLowerCase().replace(/\s+/g, '');
  return `https://media.formula1.com/image/upload/c_lfill,w_3392/q_auto/v1740000000/common/f1/2025/${carName}/2025${carName}carright.webp`;
}

function calculatePointsBehind(rank, points, leaderPoints) {
  return rank === 1 ? 0 : Math.max(0, leaderPoints - points);
}

function getTeamColor(constructorName) {
  const colorMap = {
    'Mercedes': '27F4D2',
    'Red Bull': '3671C6',
    'Ferrari': 'E8002D',
    'McLaren': 'FF8000',
    'Alpine': 'FF87BC',
    'Racing Bulls': '6692FF',
    'Aston Martin': '229971',
    'Williams': '64C4FF',
    'Sauber': '52E252',
    'Haas': 'B6BABD'
  };
  
  return colorMap[constructorName] || '000000';
}

async function getCurrentRaceEvent() {
  const now = Date.now();
  
  // Check cache first
  if (raceEventCache && now < raceEventCacheExpiry) {
    return raceEventCache;
  }
  
  try {
    // Get driver standings to access event log
    const response = await fetch('https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2025/types/2/standings/0');
    const data = await response.json();
    
    if (!data.standings || data.standings.length === 0) {
      return null;
    }

    // Get event log from first driver
    const firstDriverResponse = await fetch(convertToHttps(data.standings[0].athlete.$ref));
    const firstDriverData = await firstDriverResponse.json();
    
    if (!firstDriverData.eventLog?.$ref) {
      return null;
    }

    const eventLogResponse = await fetch(convertToHttps(firstDriverData.eventLog.$ref));
    const eventLogData = await eventLogResponse.json();
    
    // Find current or most recent race
    const currentTime = new Date();
    let targetEvent = null;
    
    // First, look for in-progress events (between start and end date)
    for (const event of eventLogData.events?.items || []) {
      const eventResponse = await fetch(convertToHttps(event.event.$ref));
      const eventData = await eventResponse.json();
      
      const startDate = new Date(eventData.date);
      const endDate = eventData.endDate ? new Date(eventData.endDate) : null;
      
      // Check if event is in progress
      if (endDate && currentTime >= startDate && currentTime <= endDate) {
        targetEvent = { event, eventData, isInProgress: true };
        break;
      }
    }
    
    // If no in-progress event, find most recent completed event within 24 hours
    if (!targetEvent) {
      const oneDayAgo = new Date(currentTime.getTime() - (24 * 60 * 60 * 1000));
      
      for (const event of eventLogData.events?.items || []) {
        if (event.played) {
          const eventResponse = await fetch(convertToHttps(event.event.$ref));
          const eventData = await eventResponse.json();
          
          const endDate = eventData.endDate ? new Date(eventData.endDate) : new Date(eventData.date);
          
          // Show recent result if ended within last 24 hours
          if (endDate >= oneDayAgo) {
            targetEvent = { event, eventData, isInProgress: false };
            break; // Take the first recent event (most recent)
          }
        }
      }
    }
    
    if (targetEvent) {
      // Get current or most recent competition info
      let currentCompetition = null;
      const competitions = targetEvent.eventData.competitions || [];
      
      // Look for in-progress competition first
      for (const competition of competitions) {
        if (competition.status?.$ref) {
          try {
            const statusResponse = await fetch(convertToHttps(competition.status.$ref));
            const statusData = await statusResponse.json();
            
            if (statusData.type?.state === 'in') {
              const compResponse = await fetch(convertToHttps(competition.$ref));
              const compData = await compResponse.json();
              currentCompetition = { competition, compData, statusData };
              break;
            }
          } catch (error) {
            console.error('Error fetching competition status:', error);
          }
        }
      }
      
      // If no in-progress competition, find most recent completed one
      if (!currentCompetition) {
        for (const competition of competitions.reverse()) { // Reverse to get most recent
          if (competition.status?.$ref) {
            try {
              const statusResponse = await fetch(convertToHttps(competition.status.$ref));
              const statusData = await statusResponse.json();
              
              if (statusData.type?.state === 'post') {
                const compResponse = await fetch(convertToHttps(competition.$ref));
                const compData = await compResponse.json();
                currentCompetition = { competition, compData, statusData };
                break;
              }
            } catch (error) {
              console.error('Error fetching competition status:', error);
            }
          }
        }
      }
      
      const result = {
        ...targetEvent,
        currentCompetition
      };
      
      // Cache the result
      raceEventCache = result;
      raceEventCacheExpiry = now + RACE_EVENT_CACHE_DURATION;
      
      return result;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching current race event:', error);
    return null;
  }
}

function ordinalSuffix(n) {
  if (n > 3 && n < 21) return n + "th";
  switch (n % 10) {
    case 1: return n + "st";
    case 2: return n + "nd";
    case 3: return n + "rd";
    default: return n + "th";
  }
}

async function getDriverStatsForCompetition(competitionData, driverId) {
  try {
    const competitor = competitionData.competitors?.find(c => c.id === driverId);
    if (!competitor?.statistics?.$ref) {
      return { time: 'N/A', laps: 'N/A', position: 'N/A' };
    }
    
    const statsResponse = await fetch(convertToHttps(competitor.statistics.$ref));
    const statsData = await statsResponse.json();
    
    const generalStats = statsData.splits?.categories?.find(cat => cat.name === 'general');
    if (!generalStats?.stats) {
      return { time: 'N/A', laps: 'N/A', position: 'N/A' };
    }
    
    const statMap = {};
    generalStats.stats.forEach(stat => {
      statMap[stat.name] = stat.displayValue || stat.value;
    });
    
    return {
      time: statMap.behindTime || statMap.totalTime || statMap.qual1TimeMS || statMap.qual2TimeMS || statMap.qual3TimeMS || 'N/A',
      laps: statMap.lapsCompleted || 'N/A',
      position: statMap.place || statMap.position || competitor.order || 'N/A'
    };
  } catch (error) {
    console.error('Error fetching driver stats:', error);
    return { time: 'N/A', laps: 'N/A', position: 'N/A' };
  }
}

async function buildRaceCard(constructor, raceEvent) {
  // Handle both string (constructor name) and object (constructor data) inputs
  let constructorName;
  let constructorData;
  
  if (typeof constructor === 'string') {
    constructorName = constructor;
    constructorData = {
      displayName: constructor,
      color: getTeamColor(constructor)
    };
  } else if (constructor && constructor.displayName) {
    constructorName = constructor.displayName;
    constructorData = constructor;
  } else {
    console.error('Invalid constructor parameter:', constructor);
    return '<div class="race-game-card">Error: Constructor information not available</div>';
  }
  
  // For race cards, always use white logos
  const logoUrl = getConstructorLogo(constructorName, true);
  const drivers = await getConstructorDrivers(constructorName);
  
  // If no race event or no current competition, show championship stats
  if (!raceEvent || !raceEvent.currentCompetition) {
    return `
      <div class="race-game-card">
        <div class="race-event-header">
          <div class="event-name">Championship Standings</div>
          <div class="competition-name">2025 Season</div>
        </div>
        
        <div class="team-championship-container">
          <div class="championship-team-header">
            <div class="championship-team-name">${constructorName}</div>
            <div class="championship-position">Championship Position: #${constructorData.rank || 'N/A'}</div>
          </div>
          <br>
          <div class="championship-stats-grid">
            <div class="championship-stat">
              <div class="stat-label">POINTS</div>
              <div class="stat-value">${constructorData.points || 0}</div>
            </div>
            <div class="championship-stat">
              <div class="stat-label">WINS</div>
              <div class="stat-value">${constructorData.wins || 0}</div>
            </div>
            <div class="championship-stat">
              <div class="stat-label">P. BEHIND</div>
              <div class="stat-value">${constructorData.pointsBehind || 0}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  // Get competition name and determine if it's live
  const compType = raceEvent.currentCompetition?.compData?.type || {};
  const typeMap = {
    'FP1': 'Free Practice 1',
    'FP2': 'Free Practice 2',
    'FP3': 'Free Practice 3',
    'Qual': 'Qualifying',
    'Race': 'Race'
  };
  
  const competitionName = typeMap[compType.abbreviation] || 
                         compType.text || 
                         compType.displayName || 
                         compType.name || 
                         'Unknown Competition';
  
  // Determine if this competition should use Gap To Leader for live timing
  const useGapToLeader = raceEvent.currentCompetition?.statusData?.type?.state === 'in' && 
    (compType.abbreviation === 'FP1' || compType.abbreviation === 'FP2' || 
     compType.abbreviation === 'FP3' || compType.abbreviation === 'Race');
  
  // Get race name and date
  const raceName = raceEvent.eventData.name?.replace('Pirelli ', '').replace('Louis Vuitton ', '') || 'Unknown Grand Prix';
  const competitionDate = new Date(raceEvent.currentCompetition?.competition?.date || raceEvent.eventData.date);
  
  // Get driver stats with Gap To Leader support - use caching properly like race-info.js
  let driverStats = [];
  if (raceEvent.currentCompetition?.compData && drivers.length > 0) {
    // Create cache key for this specific race and constructor
    const cacheKey = `race_${raceEvent.currentCompetition.competition.id}_${constructorName}_${useGapToLeader ? 'live' : 'static'}`;
    const now = Date.now();
    
    // For live sessions, check if we have recent cached data (within 2 seconds)
    if (useGapToLeader && competitionResultsCache[cacheKey] && 
        cacheExpiry[cacheKey] && (now - cacheExpiry[cacheKey]) < 2000) {
      console.log(`Using cached live data for ${constructorName}`);
      driverStats = competitionResultsCache[cacheKey];
    } else {
      // Fetch fresh data - same logic as race-info.js
      console.log(`Fetching fresh data for ${constructorName} (live: ${useGapToLeader})`);
      
      // Process competitors in parallel
      const competitorPromises = (raceEvent.currentCompetition.compData.competitors || []).map(async (competitor) => {
        try {
          // Get team info from competitor
          const team = competitor.vehicle?.manufacturer || 'Unknown Team';
          
          // Check if this driver belongs to the current constructor
          if (team !== constructorName) {
            return null;
          }
          
          // Fetch athlete and statistics in parallel - NO timestamp parameter like race-info.js
          const [athleteResponse, statsResponse] = await Promise.all([
            competitor.athlete?.$ref ? fetch(convertToHttps(competitor.athlete.$ref)) : Promise.resolve(null),
            competitor.statistics?.$ref ? fetch(convertToHttps(competitor.statistics.$ref)) : Promise.resolve(null)
          ]);
          
          // Get athlete info
          let driverName = 'Unknown';
          if (athleteResponse) {
            const athleteData = await athleteResponse.json();
            driverName = athleteData.fullName || athleteData.displayName || athleteData.shortName || 'Unknown';
          }
          
          // Get statistics with Gap To Leader support
          let stats = {
            position: 'N/A',
            time: 'N/A',
            laps: 'N/A'
          };
          
          if (statsResponse) {
            const statsData = await statsResponse.json();
            
            // Check for Gap To Leader data first if it's a live session
            if (useGapToLeader && statsData.splits?.categories) {
              const gapToLeaderStats = statsData.splits.categories.find(cat => cat.name === 'gapToLeader');
              if (gapToLeaderStats && gapToLeaderStats.stats) {
                const gapStatMap = {};
                gapToLeaderStats.stats.forEach(stat => {
                  gapStatMap[stat.name] = stat.displayValue || stat.value;
                });
                
                // Use Gap To Leader position and timing for live sessions
                if (gapStatMap.position) {
                  stats.position = gapStatMap.position;
                }
                if (gapStatMap.gapToLeader) {
                  // Format gap time - leader shows interval, others show gap
                  stats.time = stats.position === '1' || stats.position === 1 ? 
                    'LEADER' : gapStatMap.gapToLeader;
                }
              }
            }
            
            // Fall back to general stats
            const generalStats = statsData.splits?.categories?.find(cat => cat.name === 'general');
            
            if (generalStats && generalStats.stats) {
              const statMap = {};
              generalStats.stats.forEach(stat => {
                statMap[stat.name] = stat.displayValue || stat.value;
              });
              
              // Only override if we didn't get Gap To Leader data
              if (stats.position === 'N/A') {
                stats.position = statMap.place || statMap.position || competitor.order || 'N/A';
              }
              
              if (stats.time === 'N/A') {
                stats.time = statMap.totalTime || statMap.qual3TimeMS || statMap.qual2TimeMS || statMap.qual1TimeMS || 'N/A';
              }
              
              // Always get laps from general
              stats.laps = statMap.lapsCompleted || 'N/A';
              
              // For qualifying, set the best time as the main time
              if (competitionName.toLowerCase().includes('qualifying')) {
                if (statMap.qual3TimeMS && statMap.qual3TimeMS !== '0.000') {
                  stats.time = statMap.qual3TimeMS;
                } else if (statMap.qual2TimeMS && statMap.qual2TimeMS !== '0.000') {
                  stats.time = statMap.qual2TimeMS;
                } else if (statMap.qual1TimeMS && statMap.qual1TimeMS !== '0.000') {
                  stats.time = statMap.qual1TimeMS;
                }
              }
            }
          }
          
          return {
            name: driverName,
            ...stats
          };
          
        } catch (error) {
          console.error('Error processing competitor:', error);
          return null;
        }
      });
      
      const allDriverStats = (await Promise.all(competitorPromises)).filter(data => data !== null);
      
      // Sort by position for live timing
      if (useGapToLeader) {
        allDriverStats.sort((a, b) => {
          const posA = parseInt(a.position) || 999;
          const posB = parseInt(b.position) || 999;
          return posA - posB;
        });
      }
      
      driverStats = allDriverStats.slice(0, 2);
      
      // Cache the results with appropriate expiry
      competitionResultsCache[cacheKey] = driverStats;
      cacheExpiry[cacheKey] = now + (useGapToLeader ? 2000 : CACHE_DURATION);
    }
  }
  
  // If no stats available, use driver names without stats
  if (driverStats.length === 0) {
    driverStats = drivers.map(name => ({
      name: name,
      time: 'N/A',
      laps: 'N/A',
      position: 'N/A'
    }));
  }
  
  // Ensure we have exactly 2 drivers (pad with TBD if needed)
  while (driverStats.length < 2) {
    driverStats.push({
      name: 'TBD',
      time: 'N/A',
      laps: 'N/A',
      position: 'N/A'
    });
  }
  
  return `
    <div class="race-game-card">
      <div class="race-event-header">
        <div class="event-name">${raceName}</div>
        <div class="competition-name">${competitionName}${useGapToLeader ? ' (LIVE)' : ''}</div>
      </div>
      
      <div class="team-drivers-container">
        ${driverStats.slice(0, 2).map(driver => `
          <div class="driver-entry">
            <div class="team-logo-section">
              <img src="${logoUrl}" alt="${constructorName}" class="driver-team-logo">
            </div>
            <div class="driver-name-section">
              <div class="driver-full-name">${driver.name} - ${ordinalSuffix(driver.position)}</div>
              <div class="driver-position">${useGapToLeader ? 'Gap' : 'Lap Time'}: ${driver.time}</div>
            </div>
            <div class="driver-stats-section">
              <div class="driver-time">Laps</div>
              <div class="driver-laps">${driver.laps}</div>
            </div>
          </div>
        `).join('')}
      </div>
      
      <div class="competition-date-time">
        ${competitionDate.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}
      </div>
    </div>
  `;
}

// Add interval for race card updates - like race-info.js
let raceCardUpdateInterval = null;

async function updateRaceCards() {
  try {
    const raceEvent = await getCurrentRaceEvent();
    
    if (!raceEvent || !raceEvent.currentCompetition) {
      return false;
    }
    
    // Check if this is a live session that should update
    const compType = raceEvent.currentCompetition?.compData?.type || {};
    const useGapToLeader = raceEvent.currentCompetition?.statusData?.type?.state === 'in' && 
      (compType.abbreviation === 'FP1' || compType.abbreviation === 'FP2' || 
       compType.abbreviation === 'FP3' || compType.abbreviation === 'Race');
    
    if (!useGapToLeader) {
      return false;
    }
    
    // Update all race cards with hash checking like MLB teams.js
    const raceCards = document.querySelectorAll('.constructor-race-content .race-game-card');
    let updatedAny = false;
    
    for (const raceCard of raceCards) {
      const constructorCard = raceCard.closest('.constructor-card-wrapper');
      if (!constructorCard) continue;
      
      const constructorName = constructorCard.querySelector('.constructor-name')?.textContent;
      if (!constructorName) continue;
      
      // Build fresh race card content
      const newRaceCardHtml = await buildRaceCard(constructorName, raceEvent);
      
      // Hash-based change detection like MLB teams.js
      const hashKey = `race_card_${constructorName}`;
      const newHash = hashString(newRaceCardHtml);
      const oldHash = lastRaceCardHash.get(hashKey);
      
      if (oldHash !== newHash) {
        const raceContentContainer = constructorCard.querySelector('.constructor-race-content');
        if (raceContentContainer) {
          raceContentContainer.innerHTML = newRaceCardHtml;
          lastRaceCardHash.set(hashKey, newHash);
          updatedAny = true;
          console.log(`Updated race card for ${constructorName}`);
        }
      }
    }
    
    if (updatedAny) {
      console.log('Race cards updated with fresh data');
    }
    
    return true;
  } catch (error) {
    console.error('Error updating race cards:', error);
    return false;
  }
}

async function fetchAndDisplayConstructors() {
  try {
    const response = await fetch(CONSTRUCTORS_API_URL);
    const responseText = await response.text();
    const newHash = hashString(responseText);

    // Hash-based change detection like MLB teams.js - ONLY for main constructor data
    if (newHash === lastConstructorsHash) {
      console.log("No changes detected in constructors data.");
      return;
    }
    lastConstructorsHash = newHash;

    const data = JSON.parse(responseText);
    
    if (!data.standings || data.standings.length === 0) {
      console.error("No standings data found");
      return;
    }

    // Show loading state
    const container = document.getElementById("teamsContainer");
    if (!container) {
      console.error("Error: Element with ID 'teamsContainer' not found.");
      return;
    }
    
    container.innerHTML = '<div style="text-align: center; padding: 40px; color: white;">Loading teams...</div>';

    // Check for current race event
    const raceEvent = await getCurrentRaceEvent();
    
    // Process constructor data in parallel
    const constructorsData = await Promise.all(
      data.standings.map(async (standing) => {
        try {
          // Fetch manufacturer details
          const manufacturerResponse = await fetch(convertToHttps(standing.manufacturer.$ref));
          const manufacturerData = await manufacturerResponse.json();
          
          // Extract stats from records
          const record = standing.records[0];
          const stats = {};
          record.stats.forEach(stat => {
            stats[stat.name] = stat.value;
          });
          
          return {
            rank: stats.rank || 0,
            displayName: manufacturerData.displayName || 'Unknown',
            color: getTeamColor(manufacturerData.displayName),
            points: stats.points || 0,
            wins: stats.wins || 0,
            poles: stats.poles || 0
          };
        } catch (error) {
          console.error('Error fetching manufacturer data:', error);
          return null;
        }
      })
    );

    // Filter and sort constructors
    allConstructors = constructorsData
      .filter(constructor => constructor !== null)
      .sort((a, b) => a.rank - b.rank);

    // Calculate points behind leader
    const leaderPoints = allConstructors[0]?.points || 0;
    allConstructors.forEach(constructor => {
      constructor.pointsBehind = calculatePointsBehind(constructor.rank, constructor.points, leaderPoints);
    });

    container.innerHTML = ""; // Clear loading message

    // Check if there's an active race event to determine display mode
    if (raceEvent && raceEvent.currentCompetition) {
      // Show constructor cards with race cards inside for active races
      const cardPromises = allConstructors.map(async (constructor) => {
        const cardData = await buildConstructorCard(constructor);
        
        const constructorCard = document.createElement("div");
        constructorCard.innerHTML = cardData.html;
        
        // Set background color and styling
        const cardElement = constructorCard.querySelector('.constructor-card');
        if (cardElement) {
          cardElement.style.backgroundColor = `#${constructor.color}`;
          cardElement.style.border = `2px solid #${constructor.color}`;
          
          // Remove background from logo image
          const logoImg = cardElement.querySelector('.constructor-logo');
          if (logoImg) {
            logoImg.style.background = 'transparent';
            logoImg.style.filter = 'drop-shadow(0 0 4px rgba(0,0,0,0.5))';
          }

          // Style car image
          const carImg = constructorCard.querySelector('.car-image');
          if (carImg) {
            carImg.style.background = 'transparent';
            carImg.style.filter = 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))';
          }
        }

        // Replace the constructor stats section with race card
        const statsSection = constructorCard.querySelector('.constructor-stats');
        if (statsSection) {
          const raceCardHtml = await buildRaceCard(constructor, raceEvent);
          statsSection.innerHTML = raceCardHtml;
          statsSection.className = 'constructor-race-content';
        }

        // Add OBS link click handler
        constructorCard.addEventListener("click", async () => {
          const url = `https://laraiyeo.github.io/f1/team.html?team=${encodeURIComponent(constructor.displayName)}`;
          
          try {
            await navigator.clipboard.writeText(url);
            alert(`OBS link copied for ${constructor.displayName}: ${url}`);
          } catch (err) {
            console.error("Failed to copy OBS link:", err);
            alert(`OBS link for ${constructor.displayName}: ${url}`);
          }
        });

        // Add hover effects
        const wrapperElement = constructorCard.querySelector('.constructor-card-wrapper');
        if (wrapperElement) {
          wrapperElement.style.cursor = 'pointer';
          
          wrapperElement.addEventListener("mouseenter", () => {
            const card = wrapperElement.querySelector('.constructor-card');
            const car = wrapperElement.querySelector('.constructor-car');
            if (card && car) {
              card.style.transform = 'scale(1.05)';
              car.style.transform = 'translateX(-50%) scale(1.05)';
              card.style.boxShadow = '0 6px 10px rgba(255, 255, 255, 0.5)';
            }
          });

          wrapperElement.addEventListener("mouseleave", () => {
            const card = wrapperElement.querySelector('.constructor-card');
            const car = wrapperElement.querySelector('.constructor-car');
            if (card && car) {
              card.style.transform = '';
              car.style.transform = 'translateX(-50%)';
              card.style.boxShadow = '';
            }
          });
        }

        container.appendChild(constructorCard);
        
        // Update drivers asynchronously
        cardData.driversPromise.then(drivers => {
          const driversElement = constructorCard.querySelector('.constructor-drivers');
          if (driversElement) {
            const driversText = drivers.length > 0 ? drivers.join(' | ') : 'TBD | TBD';
            driversElement.textContent = driversText;
          }
        }).catch(error => {
          console.error(`Error loading drivers for ${constructor.displayName}:`, error);
          const driversElement = constructorCard.querySelector('.constructor-drivers');
          if (driversElement) {
            driversElement.textContent = 'TBD | TBD';
          }
        });
        
        return constructorCard;
      });

      // Wait for all cards to be created and added
      await Promise.all(cardPromises);
      
      // Set up live updating for race cards EXACTLY like race-info.js
      const compType = raceEvent.currentCompetition?.compData?.type || {};
      const useGapToLeader = raceEvent.currentCompetition?.statusData?.type?.state === 'in' && 
        (compType.abbreviation === 'FP1' || compType.abbreviation === 'FP2' || 
         compType.abbreviation === 'FP3' || compType.abbreviation === 'Race');
      
      if (useGapToLeader) {
        // Clear any existing interval - same as race-info.js
        if (raceCardUpdateInterval) {
          clearInterval(raceCardUpdateInterval);
          raceCardUpdateInterval = null;
        }
        
        // Start live updating every 2 seconds - EXACTLY like race-info.js
        raceCardUpdateInterval = setInterval(async () => {
          const shouldContinue = await updateRaceCards();
          if (!shouldContinue) {
            clearInterval(raceCardUpdateInterval);
            raceCardUpdateInterval = null;
            console.log("Stopped live race card updates");
          }
        }, 2000);
        
        console.log("Started live race card updates every 2 seconds");
      } else {
        // Stop updates when not live - same as race-info.js
        if (raceCardUpdateInterval) {
          clearInterval(raceCardUpdateInterval);
          raceCardUpdateInterval = null;
          console.log("Stopped race card updates - not a live session");
        }
      }
    } else {
      // Stop updates when no active race - same as race-info.js
      if (raceCardUpdateInterval) {
        clearInterval(raceCardUpdateInterval);
        raceCardUpdateInterval = null;
        console.log("Stopped race card updates - no active race");
      }
      
      // Show regular constructor cards when no race event
      const cardPromises = allConstructors.map(async (constructor) => {
        const cardData = await buildConstructorCard(constructor);
        
        const constructorCard = document.createElement("div");
        constructorCard.innerHTML = cardData.html;
        
        // Set background color and styling
        const cardElement = constructorCard.querySelector('.constructor-card');
        if (cardElement) {
          cardElement.style.backgroundColor = `#${constructor.color}`;
          cardElement.style.border = `2px solid #${constructor.color}`;
          
          // Remove background from logo image
          const logoImg = cardElement.querySelector('.constructor-logo');
          if (logoImg) {
            logoImg.style.background = 'transparent';
            logoImg.style.filter = 'drop-shadow(0 0 4px rgba(0,0,0,0.5))';
          }

          // Style car image
          const carImg = constructorCard.querySelector('.car-image');
          if (carImg) {
            carImg.style.background = 'transparent';
            carImg.style.filter = 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))';
          }
        }

        // Replace the constructor stats section with championship race card
        const statsSection = constructorCard.querySelector('.constructor-stats');
        if (statsSection) {
          const raceCardHtml = await buildRaceCard(constructor, null); // Pass null for no race event
          statsSection.innerHTML = raceCardHtml;
          statsSection.className = 'constructor-race-content';
        }

        // Add OBS link click handler
        constructorCard.addEventListener("click", async () => {
          const url = `https://laraiyeo.github.io/f1/team.html?team=${encodeURIComponent(constructor.displayName)}`;

          try {
            await navigator.clipboard.writeText(url);
            alert(`OBS link copied for ${constructor.displayName}: ${url}`);
          } catch (err) {
            console.error("Failed to copy OBS link:", err);
            alert(`OBS link for ${constructor.displayName}: ${url}`);
          }
        });

        // Add hover effects
        const wrapperElement = constructorCard.querySelector('.constructor-card-wrapper');
        if (wrapperElement) {
          wrapperElement.style.cursor = 'pointer';
          
          wrapperElement.addEventListener("mouseenter", () => {
            const card = wrapperElement.querySelector('.constructor-card');
            const car = wrapperElement.querySelector('.constructor-car');
            if (card && car) {
              card.style.transform = 'scale(1.05)';
              car.style.transform = 'translateX(-50%) scale(1.05)';
              card.style.boxShadow = '0 6px 10px rgba(255, 255, 255, 0.5)';
            }
          });

          wrapperElement.addEventListener("mouseleave", () => {
            const card = wrapperElement.querySelector('.constructor-card');
            const car = wrapperElement.querySelector('.constructor-car');
            if (card && car) {
              card.style.transform = '';
              car.style.transform = 'translateX(-50%)';
              card.style.boxShadow = '';
            }
          });
        }

        container.appendChild(constructorCard);

        // Update drivers asynchronously
        cardData.driversPromise.then(drivers => {
          const driversElement = constructorCard.querySelector('.constructor-drivers');
          if (driversElement) {
            const driversText = drivers.length > 0 ? drivers.join(' | ') : 'TBD | TBD';
            driversElement.textContent = driversText;
          }
        }).catch(error => {
          console.error(`Error loading drivers for ${constructor.displayName}:`, error);
          const driversElement = constructorCard.querySelector('.constructor-drivers');
          if (driversElement) {
            driversElement.textContent = 'TBD | TBD';
          }
        });
        
        return constructorCard;
      });

      // Wait for all cards to be created and added
      await Promise.all(cardPromises);
      
      console.log("Constructor cards loaded, drivers loading in background...");
    }

    // Make allConstructors globally accessible for the OBS page
    window.allConstructors = allConstructors;

  } catch (error) {
    console.error("Error fetching F1 constructors:", error);
    const container = document.getElementById("teamsContainer");
    if (container) {
      container.innerHTML = '<div style="text-align: center; padding: 40px; color: red;">Error loading teams. Please refresh the page.</div>';
    }
  }
}

// Clear cache when page reloads - EXACTLY like race-info.js
window.addEventListener('beforeunload', () => {
  delete window.cachedDriversData;
  raceCardCache.clear();
  lastRaceCardHash.clear();
  
  if (raceCardUpdateInterval) {
    clearInterval(raceCardUpdateInterval);
    raceCardUpdateInterval = null;
  }
  
  // Clear competition cache like race-info.js
  competitionResultsCache = {};
  cacheExpiry = {};
});

// Initialize and set up polling - EXACTLY like MLB teams.js
fetchAndDisplayConstructors();
setInterval(() => {
  console.log("Main constructor data update triggered");
  fetchAndDisplayConstructors();
}, 30000); // Poll every 30 seconds for main data
fetchAndDisplayConstructors();
setInterval(() => {
  console.log("Main constructor data update triggered");
  fetchAndDisplayConstructors();
}, 30000); // Poll every 30 seconds for main data

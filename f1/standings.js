const DRIVERS_STANDINGS_URL = "https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2025/types/2/standings/0";

let allDrivers = [];
let circuitResults = {};
let lastStandingsHash = null;

// Enhanced caching system
const driverTeamCache = new Map();
const eventLogCache = new Map();
const raceStructureCache = new Map();
const competitionDataCache = new Map();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

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
    // Step 1: Get all drivers from standings
    const driversResponse = await fetch('https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2025/types/2/standings/0');
    const driversData = await driversResponse.json();
    
    const drivers = [];
    
    // Process each driver standing
    for (const standing of driversData.standings) {
      try {
        // Step 2: Get athlete details
        const athleteResponse = await fetch(convertToHttps(standing.athlete.$ref));
        const athleteData = await athleteResponse.json();
        
        // Step 3: Get event log
        const eventLogResponse = await fetch(convertToHttps(athleteData.eventLog.$ref));
        const eventLogData = await eventLogResponse.json();
        
        // Get first event item if it exists
        if (eventLogData.events?.items?.length > 0) {
          const firstEvent = eventLogData.events.items[0];
          
          // Step 4: Get competitor details
          if (firstEvent.competitor?.$ref) {
            const competitorResponse = await fetch(convertToHttps(firstEvent.competitor.$ref));
            const competitorData = await competitorResponse.json();
            
            // Check if this driver belongs to the constructor we're looking for
            if (competitorData.vehicle?.manufacturer === constructorName) {
              drivers.push(athleteData.fullName);
            }
          }
        }
      } catch (error) {
        console.error('Error processing athlete:', error);
      }
    }
    
    return drivers.slice(0, 2); // Return only first 2 drivers
  } catch (error) {
    console.error('Error fetching drivers for constructor:', error);
    return [];
  }
}

async function getDriverTeam(driverId) {
  // Check cache first
  if (driverTeamCache.has(driverId)) {
    return driverTeamCache.get(driverId);
  }

  try {
    // Get from event log cache if available
    let eventLogData = eventLogCache.get(driverId);
    
    if (!eventLogData) {
      const driverResponse = await fetch(convertToHttps(`https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2025/athletes/${driverId}`));
      const driverData = await driverResponse.json();
      
      if (driverData.eventLog?.$ref) {
        const eventLogResponse = await fetch(convertToHttps(driverData.eventLog.$ref));
        eventLogData = await eventLogResponse.json();
        eventLogCache.set(driverId, eventLogData);
      }
    }
    
    if (eventLogData?.events?.items?.length > 0) {
      const firstEvent = eventLogData.events.items[0];
      
      if (firstEvent.competitor?.$ref) {
        const competitorResponse = await fetch(convertToHttps(firstEvent.competitor.$ref));
        const competitorData = await competitorResponse.json();
        
        const team = competitorData.vehicle?.manufacturer || 'Unknown';
        driverTeamCache.set(driverId, team);
        return team;
      }
    }
    
    driverTeamCache.set(driverId, 'Unknown');
    return 'Unknown';
  } catch (error) {
    console.error('Error fetching driver team:', error);
    driverTeamCache.set(driverId, 'Unknown');
    return 'Unknown';
  }
}

async function fetchStandings() {
  try {
    // Show loading indicator
    const container = document.getElementById("standingsContainer");
    if (container) {
      container.innerHTML = '<div style="color: black; text-align: center; padding: 40px;">Loading F1 standings...</div>';
    }

    const response = await fetch(DRIVERS_STANDINGS_URL);
    const responseText = await response.text();
    const newHash = hashString(responseText);

    if (newHash === lastStandingsHash && allDrivers.length > 0) {
      console.log("No changes detected in standings data.");
      renderStandings();
      return;
    }
    lastStandingsHash = newHash;

    const data = JSON.parse(responseText);
    
    if (!data.standings || data.standings.length === 0) {
      console.error("No standings data found");
      if (container) {
        container.innerHTML = '<div style="color: red; text-align: center; padding: 40px;">No standings data available.</div>';
      }
      return;
    }

    // Process drivers in batches to avoid overwhelming the API
    const batchSize = 5;
    const driversBasicData = [];
    
    for (let i = 0; i < data.standings.length; i += batchSize) {
      const batch = data.standings.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async (standing) => {
          try {
            const athleteResponse = await fetch(convertToHttps(standing.athlete.$ref));
            const athleteData = await athleteResponse.json();
            
            const record = standing.records[0];
            const stats = {};
            record.stats.forEach(stat => {
              stats[stat.name] = stat.value;
            });
            
            return {
              rank: stats.rank || 0,
              driver: {
                id: athleteData.id,
                name: athleteData.fullName,
                flag: athleteData.flag?.href || ''
              },
              points: stats.championshipPts || stats.points || 0,
              wins: stats.wins || 0,
              eventLogRef: athleteData.eventLog?.$ref
            };
          } catch (error) {
            console.error('Error fetching basic driver data:', error);
            return null;
          }
        })
      );
      
      driversBasicData.push(...batchResults.filter(driver => driver !== null));
      
      // Update progress
      const progress = Math.round(((i + batchSize) / data.standings.length) * 30);
      if (container) {
        container.innerHTML = `<div style="color: black; text-align: center; padding: 40px;">Loading drivers... ${progress}%</div>`;
      }
    }

    // Sort and store basic driver data
    allDrivers = driversBasicData.sort((a, b) => a.rank - b.rank);

    // Show basic table immediately
    renderBasicStandings();

    // Load race structure from cache or fetch once
    let raceStructure = raceStructureCache.get('main');
    if (!raceStructure) {
      if (container) {
        container.innerHTML = `<div style="color: black; text-align: center; padding: 40px;">Loading race structure...</div>`;
      }
      
      raceStructure = await loadRaceStructure();
      raceStructureCache.set('main', raceStructure);
    }

    // Load detailed data efficiently
    await loadDriverPointsOptimized(raceStructure);

  } catch (error) {
    console.error("Error fetching F1 standings:", error);
    const container = document.getElementById("standingsContainer");
    if (container) {
      container.innerHTML = '<div style="color: red; text-align: center; padding: 40px;">Error loading standings. Please refresh the page.</div>';
    }
  }
}

async function loadRaceStructure() {
  const firstDriver = allDrivers[0];
  if (!firstDriver?.eventLogRef) return [];
  
  const eventLogResponse = await fetch(convertToHttps(firstDriver.eventLogRef));
  const eventLogData = await eventLogResponse.json();
  
  // Process races in parallel with limited concurrency
  const racePromises = (eventLogData.events?.items || [])
    .filter(event => event.played)
    .map(async (event) => {
      try {
        const eventResponse = await fetch(convertToHttps(event.event.$ref));
        const eventData = await eventResponse.json();
        
        const raceName = eventData.name || 'Unknown Grand Prix';
        const raceAbbreviation = eventData.abbreviation || 'F1';
        
        // Get venue details in parallel if needed
        let countryFlag = '';
        if (eventData.venues && eventData.venues.length > 0) {
          try {
            const venueResponse = await fetch(convertToHttps(eventData.venues[0].$ref));
            const venueData = await venueResponse.json();
            countryFlag = venueData.countryFlag?.href || '';
          } catch (error) {
            console.error('Error fetching venue data:', error);
          }
        }
        
        return {
          competitionId: parseInt(event.competitionId),
          countryCode: raceAbbreviation,
          countryFlag: countryFlag,
          raceName: raceName.replace(' Race', '').replace('Louis Vuitton ', '').replace('Pirelli ', ''),
          date: new Date(eventData.date),
          competitionRef: event.competition.$ref
        };
      } catch (error) {
        console.error('Error fetching race structure:', error);
        return null;
      }
    });
  
  const races = (await Promise.all(racePromises)).filter(race => race !== null);
  return races.sort((a, b) => a.competitionId - b.competitionId);
}

async function loadDriverPointsOptimized(raceStructure) {
  const container = document.getElementById("standingsContainer");
  
  // Load races in smaller batches for better performance
  const batchSize = 3;
  
  for (let i = 0; i < raceStructure.length; i += batchSize) {
    const batch = raceStructure.slice(i, i + batchSize);
    
    // Update progress
    const progress = Math.round(30 + ((i / raceStructure.length) * 70));
    if (container) {
      container.innerHTML = `<div style="color: black; text-align: center; padding: 40px;">Loading race data... ${progress}%</div>`;
    }
    
    // Process batch in parallel
    await Promise.all(batch.map(async (race) => {
      try {
        // Check cache first
        const cacheKey = `comp_${race.competitionId}`;
        let competitionData = competitionDataCache.get(cacheKey);
        
        if (!competitionData) {
          const competitionResponse = await fetch(convertToHttps(race.competitionRef));
          competitionData = await competitionResponse.json();
          competitionDataCache.set(cacheKey, competitionData);
        }
        
        // Extract points more efficiently
        const racePoints = {};
        if (competitionData.competitors) {
          // Process competitors in smaller batches
          const competitorBatches = [];
          for (let j = 0; j < competitionData.competitors.length; j += 5) {
            competitorBatches.push(competitionData.competitors.slice(j, j + 5));
          }
          
          for (const competitorBatch of competitorBatches) {
            await Promise.all(competitorBatch.map(async (competitor) => {
              const driverId = competitor.id;
              const points = competitor.statistics?.$ref ? 
                await getDriverPointsForRace(convertToHttps(competitor.statistics.$ref)) : 0;
              racePoints[driverId] = points;
            }));
          }
        }
        
        // Update driver data
        allDrivers.forEach(driver => {
          if (!driver.circuitPoints) driver.circuitPoints = {};
          const uniqueKey = `${race.countryCode}_${race.competitionId}`;
          const points = racePoints[driver.driver.id] || 0;
          
          driver.circuitPoints[uniqueKey] = {
            points: points,
            raceName: race.raceName,
            date: race.date,
            competitionId: race.competitionId,
            played: true,
            countryCode: race.countryCode,
            countryFlag: race.countryFlag
          };
        });
        
        // Add team info from first race
        if (i === 0 && batch.indexOf(race) === 0) {
          await addTeamInfoOptimized(competitionData);
        }
        
      } catch (error) {
        console.error(`Error loading race ${race.raceName}:`, error);
      }
    }));
    
    // Update display after each batch
    renderStandings();
  }
}

async function addTeamInfoOptimized(competitionData) {
  // Extract team info directly from competitors
  const teamMap = {};
  if (competitionData.competitors) {
    competitionData.competitors.forEach(competitor => {
      if (competitor.vehicle?.manufacturer) {
        teamMap[competitor.id] = competitor.vehicle.manufacturer;
      }
    });
  }
  
  // Update drivers with team info
  allDrivers.forEach(driver => {
    driver.team = teamMap[driver.driver.id] || 'Unknown';
  });
}

// Cache the statistics API calls
const statisticsCache = new Map();

async function getDriverPointsForRace(statisticsRef) {
  // Check cache first
  if (statisticsCache.has(statisticsRef)) {
    return statisticsCache.get(statisticsRef);
  }
  
  try {
    const statisticsResponse = await fetch(statisticsRef);
    const statisticsData = await statisticsResponse.json();
    
    const cpStat = statisticsData.splits?.categories?.[0]?.stats?.find(stat => stat.abbreviation === 'CP');
    const points = cpStat ? parseInt(cpStat.value) : 0;
    
    // Cache the result
    statisticsCache.set(statisticsRef, points);
    return points;
  } catch (error) {
    statisticsCache.set(statisticsRef, 0);
    return 0;
  }
}

function renderBasicStandings() {
  const container = document.getElementById("standingsContainer");
  if (!container) return;

  const table = document.createElement("table");
  table.className = "standings-table";

  const header = document.createElement("thead");
  const headerRow = document.createElement("tr");
  headerRow.innerHTML = `
    <th class="pos-header">POS</th>
    <th class="driver-header">DRIVER</th>
  `;
  header.appendChild(headerRow);
  table.appendChild(header);

  const tbody = document.createElement("tbody");
  allDrivers.forEach((driver) => {
    const row = document.createElement("tr");
    row.className = "driver-row";
    row.innerHTML = `
      <td class="pos-cell">${driver.rank}</td>
      <td class="driver-cell">
        <div class="driver-info">
          <img src="${driver.driver.flag}" alt="${driver.driver.name}" class="driver-flag" onerror="this.src='https://flagcdn.com/w20/xx.png'">
          <div class="driver-details">
            <div class="driver-name">${driver.driver.name}</div>
            <div class="driver-points">${driver.points} PTS</div>
          </div>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);
}

function renderStandings() {
  const container = document.getElementById("standingsContainer");
  if (!container) {
    console.error("Error: Element with ID 'standingsContainer' not found.");
    return;
  }

  if (!allDrivers || allDrivers.length === 0) {
    console.error("No drivers data to render");
    return;
  }

  console.log(`Rendering standings for ${allDrivers.length} drivers`);

  // Get all unique circuits from all drivers and sort by competitionId
  const allCircuitData = [];
  const completedRaceNames = new Set();
  
  allDrivers.forEach(driver => {
    if (driver.circuitPoints) {
      Object.entries(driver.circuitPoints).forEach(([uniqueKey, data]) => {
        if (data.played) {
          completedRaceNames.add(`${data.countryCode} - ${data.raceName}`);
        }
        if (!allCircuitData.find(c => c.uniqueKey === uniqueKey)) {
          allCircuitData.push({
            uniqueKey: uniqueKey,
            countryCode: data.countryCode,
            countryFlag: data.countryFlag,
            date: data.date,
            raceName: data.raceName,
            competitionId: data.competitionId,
            played: data.played
          });
        }
      });
    }
  });
  
  // Filter to only show completed races
  const completedCircuits = allCircuitData
    .filter(circuit => circuit.played)
    .sort((a, b) => a.competitionId - b.competitionId)
    .map(circuit => circuit.uniqueKey);

  // Use DocumentFragment for better performance
  const fragment = document.createDocumentFragment();
  
  const table = document.createElement("table");
  table.className = "standings-table";

  // Create header
  const header = document.createElement("thead");
  const headerRow = document.createElement("tr");
  
  headerRow.innerHTML = `
    <th class="pos-header">POS</th>
    <th class="driver-header">DRIVER</th>
    ${completedCircuits.map(uniqueKey => {
      const circuit = allCircuitData.find(c => c.uniqueKey === uniqueKey);
      return `<th class="circuit-header" title="${circuit.raceName}">
        <img src="${circuit.countryFlag || ''}" alt="${circuit.countryCode}" class="circuit-flag" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
        <span class="circuit-code-fallback" style="display: none; font-size: 0.6rem;">${circuit.countryCode}</span>
      </th>`;
    }).join('')}
  `;
  
  header.appendChild(headerRow);
  table.appendChild(header);

  // Create body more efficiently
  const tbody = document.createElement("tbody");
  
  allDrivers.forEach((driver) => {
    const row = document.createElement("tr");
    row.className = "driver-row";
    
    const circuitCells = completedCircuits.map(uniqueKey => {
      const circuitData = driver.circuitPoints?.[uniqueKey];
      if (circuitData && circuitData.played) {
        if (circuitData.points > 0) {
          return `<td class="circuit-cell has-points" title="${circuitData.raceName}">${circuitData.points}</td>`;
        } else {
          return `<td class="circuit-cell no-points" title="${circuitData.raceName}">0</td>`;
        }
      } else {
        return `<td class="circuit-cell no-points">-</td>`;
      }
    }).join('');
    
    row.innerHTML = `
      <td class="pos-cell">${driver.rank}</td>
      <td class="driver-cell">
        <div class="driver-info">
          <img src="${driver.driver.flag}" alt="${driver.driver.name}" class="driver-flag" onerror="this.src='https://flagcdn.com/w20/xx.png'">
          <div class="driver-details">
            <div class="driver-name">${driver.driver.name}</div>
            <div class="driver-team">${driver.team || 'Unknown'}</div>
            <div class="driver-points">${driver.points} PTS</div>
          </div>
        </div>
      </td>
      ${circuitCells}
    `;
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  fragment.appendChild(table);
  
  // Update DOM once
  container.innerHTML = "";
  container.appendChild(fragment);
  
  console.log("Standings rendered successfully");
}

// Clear caches periodically to prevent memory issues
setInterval(() => {
  if (statisticsCache.size > 100) {
    statisticsCache.clear();
  }
  if (competitionDataCache.size > 50) {
    competitionDataCache.clear();
  }
}, 5 * 60 * 1000); // Clear every 5 minutes

// Initialize - only call once
document.addEventListener('DOMContentLoaded', () => {
  fetchStandings();
  // Increase polling interval to reduce API load
  setInterval(fetchStandings, 60000); // Poll every 60 seconds instead of 30
});

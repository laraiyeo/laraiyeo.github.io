const DRIVERS_STANDINGS_URL = "https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2025/types/2/standings/0";

let allDrivers = [];
let circuitResults = {};
let lastStandingsHash = null;

// Cache to avoid duplicate API calls
const driverTeamCache = new Map();
const eventLogCache = new Map();

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
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
        const athleteResponse = await fetch(standing.athlete.$ref);
        const athleteData = await athleteResponse.json();
        
        // Step 3: Get event log
        const eventLogResponse = await fetch(athleteData.eventLog.$ref);
        const eventLogData = await eventLogResponse.json();
        
        // Get first event item if it exists
        if (eventLogData.events?.items?.length > 0) {
          const firstEvent = eventLogData.events.items[0];
          
          // Step 4: Get competitor details
          if (firstEvent.competitor?.$ref) {
            const competitorResponse = await fetch(firstEvent.competitor.$ref);
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
      const driverResponse = await fetch(`https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2025/athletes/${driverId}`);
      const driverData = await driverResponse.json();
      
      if (driverData.eventLog?.$ref) {
        const eventLogResponse = await fetch(driverData.eventLog.$ref);
        eventLogData = await eventLogResponse.json();
        eventLogCache.set(driverId, eventLogData);
      }
    }
    
    if (eventLogData?.events?.items?.length > 0) {
      const firstEvent = eventLogData.events.items[0];
      
      if (firstEvent.competitor?.$ref) {
        const competitorResponse = await fetch(firstEvent.competitor.$ref);
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

    if (newHash === lastStandingsHash) {
      console.log("No changes detected in standings data.");
      if (allDrivers.length > 0) {
        renderStandings();
      }
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

    // Get basic driver info first (fast)
    const driversBasicData = await Promise.all(
      data.standings.map(async (standing) => {
        try {
          const athleteResponse = await fetch(standing.athlete.$ref);
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

    // Render basic table first
    allDrivers = driversBasicData
      .filter(driver => driver !== null)
      .sort((a, b) => a.rank - b.rank);

    // Show basic table immediately
    renderBasicStandings();

    // Then load detailed circuit data for just one driver to get race structure
    const firstDriver = allDrivers[0];
    if (firstDriver?.eventLogRef) {
      const eventLogResponse = await fetch(firstDriver.eventLogRef);
      const eventLogData = await eventLogResponse.json();
      
      // Get all race info from first driver
      const raceStructure = [];
      for (const event of eventLogData.events?.items || []) {
        if (event.played) { // Only get completed races
          try {
            // Get event details for proper race name and abbreviation
            const eventResponse = await fetch(event.event.$ref);
            const eventData = await eventResponse.json();
            
            const raceName = eventData.name || 'Unknown Grand Prix';
            const raceAbbreviation = eventData.abbreviation || 'F1';
            
            // Get venue details for country flag
            let countryFlag = '';
            if (eventData.venues && eventData.venues.length > 0) {
              try {
                const venueResponse = await fetch(eventData.venues[0].$ref);
                const venueData = await venueResponse.json();
                countryFlag = venueData.countryFlag?.href || '';
              } catch (error) {
                console.error('Error fetching venue data:', error);
              }
            }
            
            raceStructure.push({
              competitionId: parseInt(event.competitionId),
              countryCode: raceAbbreviation,
              countryFlag: countryFlag,
              raceName: raceName.replace(' Race', '').replace('Louis Vuitton ', '').replace('Pirelli ', ''),
              date: new Date(eventData.date),
              competitionRef: event.competition.$ref
            });
          } catch (error) {
            console.error('Error fetching race structure:', error);
          }
        }
      }
      
      // Sort races by competition ID
      raceStructure.sort((a, b) => a.competitionId - b.competitionId);
      
      // Now get points for all drivers for these specific races only
      await loadDriverPointsForRaces(raceStructure);
    }

  } catch (error) {
    console.error("Error fetching F1 standings:", error);
    const container = document.getElementById("standingsContainer");
    if (container) {
      container.innerHTML = '<div style="color: red; text-align: center; padding: 40px;">Error loading standings. Please refresh the page.</div>';
    }
  }
}

async function loadDriverPointsForRaces(raceStructure) {
  const container = document.getElementById("standingsContainer");
  
  // Process each race one at a time to get all driver points
  for (let raceIndex = 0; raceIndex < raceStructure.length; raceIndex++) {
    const race = raceStructure[raceIndex];
    
    // Update progress
    if (container) {
      const progress = Math.round(((raceIndex + 1) / raceStructure.length) * 100);
      container.innerHTML = `<div style="color: black; text-align: center; padding: 40px;">Loading race data... ${progress}% (${race.raceName})</div>`;
    }
    
    try {
      // Get competition data to find all competitors for this race
      const competitionResponse = await fetch(race.competitionRef);
      const competitionData = await competitionResponse.json();
      
      // Process all competitors in this race
      const racePoints = {};
      if (competitionData.competitors) {
        for (const competitor of competitionData.competitors) {
          const driverId = competitor.id;
          const points = competitor.statistics?.$ref ? await getDriverPointsForRace(competitor.statistics.$ref) : 0;
          racePoints[driverId] = points;
        }
      }
      
      // Update driver data with this race's points
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
          countryCode: race.countryCode
        };
      });
      
      // Add team info on first race
      if (raceIndex === 0) {
        await addTeamInfo(competitionData);
      }
      
      // Re-render with updated data
      renderStandings();
      
    } catch (error) {
      console.error(`Error loading race ${race.raceName}:`, error);
    }
  }
}

async function getDriverPointsForRace(statisticsRef) {
  try {
    const statisticsResponse = await fetch(statisticsRef);
    const statisticsData = await statisticsResponse.json();
    
    const cpStat = statisticsData.splits?.categories?.[0]?.stats?.find(stat => stat.abbreviation === 'CP');
    return cpStat ? parseInt(cpStat.value) : 0;
  } catch (error) {
    return 0;
  }
}

async function addTeamInfo(competitionData) {
  // Get team info from first race competitors
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
  const completedRaceNames = new Set(); // For glossary - only completed races
  
  allDrivers.forEach(driver => {
    if (driver.circuitPoints) {
      Object.entries(driver.circuitPoints).forEach(([uniqueKey, data]) => {
        // Only add to glossary if race has been played
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
  
  // Filter to only show races that have been played (completed races)
  const completedCircuits = allCircuitData
    .filter(circuit => circuit.played)
    .sort((a, b) => a.competitionId - b.competitionId)
    .map(circuit => circuit.uniqueKey);

  const table = document.createElement("table");
  table.className = "standings-table";

  // Create header - use country flags instead of codes
  const header = document.createElement("thead");
  const headerRow = document.createElement("tr");
  
  headerRow.innerHTML = `
    <th class="pos-header">POS</th>
    <th class="driver-header">DRIVER</th>
    ${completedCircuits.map(uniqueKey => {
      const circuit = allCircuitData.find(c => c.uniqueKey === uniqueKey);
      return `<th class="circuit-header" title="${circuit.raceName}">
        <img src="${circuit.countryFlag}" alt="${circuit.countryCode}" class="circuit-flag" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
        <span class="circuit-code-fallback" style="display: none; font-size: 0.6rem;">${circuit.countryCode}</span>
      </th>`;
    }).join('')}
  `;
  
  header.appendChild(headerRow);
  table.appendChild(header);

  // Create body
  const tbody = document.createElement("tbody");
  
  allDrivers.forEach((driver) => {
    const row = document.createElement("tr");
    row.className = "driver-row";
    
    const driverCell = `
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
    `;
    
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
    
    row.innerHTML = driverCell + circuitCells;
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  
  // Create race glossary with country codes and full names, only completed races
  const glossaryDiv = document.createElement("div");
  glossaryDiv.innerHTML = `
    <h3 style="color: black; margin-top: 20px;">Race Glossary (Completed Races):</h3>
    <ul style="color: black; text-align: left; columns: 2; font-size: 0.9rem;">
      ${Array.from(completedRaceNames).sort().map(name => `<li>${name}</li>`).join('')}
    </ul>
  `;
  
  container.innerHTML = "";
  container.appendChild(table);
  container.appendChild(glossaryDiv);
  
  console.log("Standings rendered successfully");
}

// Initialize - only call once
document.addEventListener('DOMContentLoaded', () => {
  fetchStandings();
  // Increase polling interval to reduce API load
  setInterval(fetchStandings, 60000); // Poll every 60 seconds instead of 30
});

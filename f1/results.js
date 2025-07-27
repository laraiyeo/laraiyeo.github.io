const DRIVERS_STANDINGS_URL = "https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2025/types/2/standings/0";

let completedRaces = [];
let lastResultsHash = null;

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

function formatDateWithTimezone(date) {
  // Get user's timezone
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: userTimezone,
    timeZoneName: 'short'
  };
  
  return date.toLocaleDateString('en-US', options);
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

async function calculateRaceWeekendEndDate(eventData) {
  try {
    if (!eventData.competitions || eventData.competitions.length === 0) {
      return null;
    }

    // Get all competition dates
    let latestDate = null;
    
    for (const competition of eventData.competitions) {
      try {
        const compResponse = await fetch(convertToHttps(competition.$ref));
        const compData = await compResponse.json();
        
        const competitionDate = new Date(competition.date || compData.date);
        
        if (!latestDate || competitionDate > latestDate) {
          latestDate = competitionDate;
        }
      } catch (error) {
        console.error('Error fetching competition date:', error);
        // Fall back to competition.date if available
        if (competition.date) {
          const competitionDate = new Date(competition.date);
          if (!latestDate || competitionDate > latestDate) {
            latestDate = competitionDate;
          }
        }
      }
    }
    
    if (latestDate) {
      // Set end time to 11:59 PM EST of the latest competition date
      const endDate = new Date(latestDate);
      endDate.setHours(23, 59, 59, 999); // Set to 11:59:59.999 PM
      
      // Convert to EST (UTC-5) - note: this is a simplified conversion
      // In a production app, you'd want to use a proper timezone library
      const estOffset = -5 * 60; // EST is UTC-5
      const utc = endDate.getTime() + (endDate.getTimezoneOffset() * 60000);
      const estTime = new Date(utc + (estOffset * 60000));
      
      return estTime;
    }
    
    return null;
  } catch (error) {
    console.error('Error calculating race weekend end date:', error);
    return null;
  }
}

function convertToHttps(url) {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}

async function fetchRaceResults() {
  try {
    const container = document.getElementById("resultsContainer");
    if (container) {
      container.innerHTML = '<div style="color: black; text-align: center; padding: 40px;">Loading race results...</div>';
    }

    // Get driver standings to access event log
    const response = await fetch(DRIVERS_STANDINGS_URL);
    const responseText = await response.text();
    const newHash = hashString(responseText);

    if (newHash === lastResultsHash) {
      console.log("No changes detected in results data.");
      if (completedRaces.length > 0) {
        renderRaceResults();
      }
      return;
    }
    lastResultsHash = newHash;

    const data = JSON.parse(responseText);
    
    if (!data.standings || data.standings.length === 0) {
      console.error("No standings data found");
      if (container) {
        container.innerHTML = '<div style="color: red; text-align: center; padding: 40px;">No results data available.</div>';
      }
      return;
    }

    // Get event log from first driver to extract race results
    const firstDriverResponse = await fetch(convertToHttps(data.standings[0].athlete.$ref));
    const firstDriverData = await firstDriverResponse.json();
    
    if (!firstDriverData.eventLog?.$ref) {
      console.error("No event log found");
      return;
    }

    const eventLogResponse = await fetch(convertToHttps(firstDriverData.eventLog.$ref));
    const eventLogData = await eventLogResponse.json();
    
    // Process all races - both completed and in-progress
    const racePromises = eventLogData.events?.items
      ?.map(async (event) => {
        try {
          // Get event details for proper race name and abbreviation
          const eventResponse = await fetch(convertToHttps(event.event.$ref));
          const eventData = await eventResponse.json();
          
          const raceName = eventData.name || 'Unknown Grand Prix';
          const raceAbbreviation = eventData.abbreviation || 'F1';
          const raceDate = new Date(eventData.date);
          const raceEndDate = await calculateRaceWeekendEndDate(eventData) || raceDate;
          const now = new Date();
          
          return {
            eventData,
            event,
            raceName,
            raceAbbreviation,
            raceDate,
            raceEndDate,
            now
          };
        } catch (error) {
          console.error('Error fetching race data:', error);
          return null;
        }
      }) || [];

    const raceDataArray = (await Promise.all(racePromises)).filter(data => data !== null);
    
    // Process races with status determination
    const processedRaces = await Promise.all(raceDataArray.map(async (raceData) => {
      const { eventData, event, raceName, raceAbbreviation, raceDate, raceEndDate, now } = raceData;
      
      // Determine race status
      let status = 'upcoming';
      
      if (raceDate <= now && raceEndDate >= now) {
        status = 'in-progress';
      } else if (event.played) {
        status = 'completed';
      }
      
      // Get venue details for country flag
      let countryFlag = '';
      let venueName = '';
      if (eventData.venues && eventData.venues.length > 0) {
        try {
          const venueResponse = await fetch(convertToHttps(eventData.venues[0].$ref));
          const venueData = await venueResponse.json();
          countryFlag = venueData.countryFlag?.href || '';
          venueName = venueData.fullName || '';
        } catch (error) {
          console.error('Error fetching venue data:', error);
        }
      }

      // For in-progress races (including forced most recent), get competition winners
      let competitionWinners = {};
      if (status === 'in-progress') {
        competitionWinners = await fetchCompetitionWinners(eventData);
      }

      // For both completed and in-progress races, try to get race winner info
      let winner = 'TBD';
      let winnerTeam = '';
      let teamColor = '#333333';
      
      if (status === 'completed' || status === 'in-progress') {
        try {
          // Look for the main Race competition (not sprint race) in the competitions array
          const raceCompetition = eventData.competitions?.find(comp => 
            (comp.type?.name?.toLowerCase() === 'race' || 
             comp.type?.displayName?.toLowerCase() === 'race' ||
             comp.type?.abbreviation?.toLowerCase() === 'race') &&
            !comp.type?.name?.toLowerCase().includes('sprint') &&
            !comp.type?.displayName?.toLowerCase().includes('sprint')
          );
          
          if (raceCompetition && raceCompetition.competitors) {
            // Find the winner (winner: true)
            const winnerCompetitor = raceCompetition.competitors.find(c => c.winner === true);
            
            if (winnerCompetitor) {
              // Get manufacturer info
              winnerTeam = winnerCompetitor.vehicle?.manufacturer || 'Unknown Team';
              teamColor = `#${getTeamColor(winnerTeam)}`;
              
              // Get driver info
              if (winnerCompetitor.athlete?.$ref) {
                try {
                  const athleteResponse = await fetch(convertToHttps(winnerCompetitor.athlete.$ref));
                  const athleteData = await athleteResponse.json();
                  winner = athleteData.shortName || athleteData.displayName || athleteData.fullName || 'Unknown';
                } catch (error) {
                  console.error('Error fetching race winner athlete data:', error);
                  winner = winnerCompetitor.athlete?.shortName || 
                          winnerCompetitor.athlete?.displayName || 
                          winnerCompetitor.athlete?.fullName || 'Unknown';
                }
              } else if (winnerCompetitor.athlete) {
                winner = winnerCompetitor.athlete.shortName || 
                        winnerCompetitor.athlete.displayName || 
                        winnerCompetitor.athlete.fullName || 'Unknown';
              }
              
              // For in-progress races, only update if this is actually a completed race
              // Don't override competition winners from fetchCompetitionWinners
              if (status === 'completed' && winner !== 'TBD') {
                // Find the proper competition name for this race
                const properRaceName = 'Race'; // This should match what fetchCompetitionWinners uses
                competitionWinners[properRaceName] = winner;
              }
            }
          }
        } catch (error) {
          console.error('Error fetching race winner:', error);
        }
      }
      
      return {
        competitionId: parseInt(event.competitionId),
        countryCode: raceAbbreviation,
        countryFlag: countryFlag,
        raceName: raceName.replace(' Race', '').replace('Louis Vuitton ', '').replace('Pirelli ', ''),
        date: raceDate,
        endDate: raceEndDate,
        formattedDate: formatDateWithTimezone(raceEndDate),
        formattedStartDate: formatDateWithTimezone(raceDate),
        winner: winner,
        winnerTeam: winnerTeam,
        teamColor: teamColor,
        status: status,
        venue: venueName,
        competitionWinners: competitionWinners
      };
    }));
    
    // Filter out failed requests and separate by status
    const validRaces = processedRaces.filter(race => race !== null);
    
    // Separate races by status
    const inProgressRaces = validRaces.filter(race => race.status === 'in-progress')
      .sort((a, b) => a.date - b.date); // Sort by start date for in-progress
    
    completedRaces = validRaces.filter(race => race.status === 'completed')
      .sort((a, b) => b.endDate - a.endDate); // Sort by end date (most recent first) for completed

    // Store both arrays globally
    window.inProgressRaces = inProgressRaces;
    window.completedRaces = completedRaces;

    renderRaceResults();
  } catch (error) {
    console.error("Error fetching F1 results:", error);
    const container = document.getElementById("resultsContainer");
    if (container) {
      container.innerHTML = '<div style="color: red; text-align: center; padding: 40px;">Error loading results. Please refresh the page.</div>';
    }
  }
}

async function fetchCompetitionWinners(eventData) {
  const winners = {};

  try {
    // Process each competition to find winners - ONLY INCLUDE COMPETITIONS THAT ACTUALLY EXIST
    const competitionPromises = (eventData.competitions || []).map(async (competition, index) => {
      try {
        // Check competition status first - only include 'in' (in progress) or 'post' (completed) competitions
        let shouldInclude = false;
        let isInProgress = false;
        
        if (competition.status?.$ref) {
          try {
            const statusResponse = await fetch(convertToHttps(competition.status.$ref));
            const statusData = await statusResponse.json();
            
            // Only include competitions that are "in" (in progress) or "post" (completed) - SAME AS RACE-INFO.JS
            if (statusData.type?.state === 'in') {
              shouldInclude = true;
              isInProgress = true;
            } else if (statusData.type?.state === 'post') {
              shouldInclude = true;
              isInProgress = false;
            }
          } catch (error) {
            console.error('Error fetching competition status:', error);
            shouldInclude = true; // Fallback to include if status check fails
          }
        } else {
          shouldInclude = true; // Include if no status reference
        }
        
        if (!shouldInclude) {
          return null; // Skip this competition entirely
        }

        const compResponse = await fetch(convertToHttps(competition.$ref));
        const compData = await compResponse.json();
        
        // Get competition type and create display name - SAME AS RACE-INFO.JS
        const compType = compData.type || {};
        let competitionName = compType.text || compType.displayName || compType.name || 'Unknown';
        let competitionKey = competitionName.toLowerCase().replace(/\s+/g, '_');
        
        // Map abbreviations to full names for better display - SAME AS RACE-INFO.JS
        const typeMap = {
          'FP1': 'Free Practice 1',
          'FP2': 'Free Practice 2', 
          'FP3': 'Free Practice 3',
          'SS': 'Sprint Shootout',
          'SR': 'Sprint Race',
          'Qual': 'Qualifying',
          'Race': 'Race'
        };
        
        if (compType.abbreviation && typeMap[compType.abbreviation]) {
          competitionName = typeMap[compType.abbreviation];
          competitionKey = compType.abbreviation.toLowerCase();
        }
        
        console.log(`Processing competition: ${competitionName} (key: ${competitionKey})`);
        console.log(`Competition type details:`, compType);
        
        // Initialize this competition as TBD first
        winners[competitionName] = 'TBD';
        
        // If competition is still in progress, keep as TBD
        if (isInProgress) {
          return null; // Keep as TBD, don't process further
        }
        
        // Only process completed competitions for winner determination
        if (compData.competitors && compData.competitors.length > 0) {
          console.log(`Processing ${competitionName} with ${compData.competitors.length} competitors`);
          
          // Process competitors exactly like race-info.js does
          const competitorPromises = (compData.competitors || []).map(async (competitor, compIndex) => {
            try {
              // Fetch athlete and statistics in parallel (same as race-info.js)
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
              
              // Get position from statistics (same logic as race-info.js)
              let position = competitor.order || 999;
              
              if (statsResponse) {
                const statsData = await statsResponse.json();
                
                const generalStats = statsData.splits?.categories?.find(cat => cat.name === 'general');
                
                if (generalStats && generalStats.stats) {
                  const statMap = {};
                  generalStats.stats.forEach(stat => {
                    statMap[stat.name] = stat.displayValue || stat.value;
                  });
                  
                  // Get position from stats (same as race-info.js)
                  const statsPosition = parseInt(statMap.place || statMap.position) || competitor.order || 999;
                  position = statsPosition;
                }
              }
              
              return {
                driverName,
                position,
                winner: competitor.winner || false
              };
              
            } catch (error) {
              console.error(`Error processing competitor ${compIndex}:`, error);
              return null;
            }
          });
          
          const competitorData = (await Promise.all(competitorPromises)).filter(data => data !== null);
          
          // Only update from TBD if we have actual meaningful results
          if (competitorData.length > 0) {
            // For Race and Sprint Race, only declare a winner if someone actually won
            if (competitionName === 'Race' || competitionName === 'Sprint Race') {
              // For races, only show winner if someone actually has winner: true
              const actualWinner = competitorData.find(competitor => competitor.winner === true);
              if (actualWinner) {
                winners[competitionName] = actualWinner.driverName;
              }
              // Otherwise, leave as 'TBD' (already set above)
            } else {
              // For practice sessions, qualifying, etc., only update if we have valid position data
              // Check if any competitor has a meaningful position (not just default 999)
              const validResults = competitorData.filter(comp => comp.position < 999);
              if (validResults.length > 0) {
                validResults.sort((a, b) => a.position - b.position);
                winners[competitionName] = validResults[0].driverName;
              }
              // Otherwise, leave as 'TBD'
            }
          }
        } else {
          console.log(`No competitors found for ${competitionName}, keeping as TBD`);
        }
        
        return null; // Return null since we're updating winners object directly
        
      } catch (error) {
        console.error(`Error fetching competition ${index}:`, error);
        return null;
      }
    });
    
    await Promise.all(competitionPromises);
  } catch (error) {
    console.error('Error fetching competition winners:', error);
  }
  
  return winners;
}

function renderRaceResults() {
  const container = document.getElementById("resultsContainer");
  if (!container) {
    console.error("Error: Element with ID 'resultsContainer' not found.");
    return;
  }

  const inProgressRaces = window.inProgressRaces || [];
  const completedRaces = window.completedRaces || [];

  if (inProgressRaces.length === 0 && completedRaces.length === 0) {
    container.innerHTML = '<div style="color: black; text-align: center; padding: 40px;">No races found.</div>';
    return;
  }

  let html = '';

  // Render in-progress races first with section structure
  if (inProgressRaces.length > 0) {
    html += `
      <div class="in-progress-section">
        <div class="section-header">
          <h2 class="section-title">Race Weekend In Progress</h2>
        </div>
    `;
    
    const inProgressHtml = inProgressRaces.map((race, index) => `
      <div class="in-progress-card" data-race-index="${index}" data-race-type="in-progress">
        <div class="in-progress-left">
          <div class="race-header-in-progress">
            <img src="${race.countryFlag}" alt="${race.countryCode}" class="country-flag-img-large" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
            <span class="country-code-fallback-large" style="display: none;">${race.countryCode}</span>
            <div class="race-name-large">${race.raceName}</div>
          </div>
          <div class="circuit-name">${race.venue}</div>
          <div class="race-dates">
            <div class="start-date">Start: ${race.formattedStartDate}</div>
            <div class="date-divider">|</div>
            <div class="end-date">End: ${race.formattedDate}</div>
          </div>
        </div>
        <div class="in-progress-right">
          <div class="competition-winners">
            ${(() => {
              // Sort competitions in logical race weekend order
              const competitionOrder = [
                'Free Practice 1', 'FP1',
                'Free Practice 2', 'FP2', 
                'Free Practice 3', 'FP3',
                'Sprint Shootout',
                'Sprint Race',
                'Qualifying', 'Qual',
                'Race'
              ];
              
              const sortedEntries = Object.entries(race.competitionWinners || {})
                .sort(([a], [b]) => {
                  const indexA = competitionOrder.findIndex(comp => comp === a);
                  const indexB = competitionOrder.findIndex(comp => comp === b);
                  
                  // If not found in order, put at end
                  const finalIndexA = indexA === -1 ? competitionOrder.length : indexA;
                  const finalIndexB = indexB === -1 ? competitionOrder.length : indexB;
                  
                  return finalIndexA - finalIndexB;
                });
              
              return sortedEntries.map(([competitionName, winner]) => `
                <div class="competition-result">
                  <span class="comp-label">${competitionName}:</span>
                  <span class="comp-winner">${winner}</span>
                </div>
              `).join('');
            })()}
          </div>
        </div>
      </div>
    `).join('');
    
    html += inProgressHtml;
    html += `
      </div>
      <div class="section-divider"></div>
    `;
  }

  // Render completed races with section wrapper and grid layout
  if (completedRaces.length > 0) {
    html += `
      <div class="completed-section">
        <div class="section-header">
          <h2 class="section-title">Recent Results</h2>
        </div>
        <div class="completed-races">
    `;
    
    const completedHtml = completedRaces.map((race, index) => `
      <div class="result-card" data-race-index="${index}" data-race-type="completed" style="border-left: 5px solid ${race.teamColor};">
        <div class="race-header">
          <div class="race-country-flag">
            <img src="${race.countryFlag}" alt="${race.countryCode}" class="country-flag-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
            <span class="country-code-fallback" style="display: none;">${race.countryCode}</span>
          </div>
          <div class="race-name">${race.raceName}</div>
        </div>
        <div class="race-result-info">
          <div class="race-winner">
            <span class="winner-label">Winner:</span>
            <span class="winner-name" style="color: ${race.teamColor}; text-shadow: 1px 1px 2px black;">${race.winner} - <span class="winner-team" style="color: ${race.teamColor}; text-shadow: 1px 1px 2px black;">${race.winnerTeam}</span></span>
          </div>
          <div class="race-date">${race.formattedDate}</div>
        </div>
      </div>
    `).join('');
    
    html += completedHtml;
    html += `
        </div>
      </div>
    `;
  }

  container.innerHTML = html;

  // Add click event listeners to each result card
  const resultCards = container.querySelectorAll('.result-card, .in-progress-card');
  resultCards.forEach((card) => {
    card.addEventListener('click', () => {
      const raceIndex = parseInt(card.dataset.raceIndex);
      const raceType = card.dataset.raceType;
      
      // Get the appropriate race data
      let race;
      if (raceType === 'in-progress') {
        race = inProgressRaces[raceIndex];
      } else {
        race = completedRaces[raceIndex];
      }
      
      // Navigate to race info page with race details as query parameters
      const queryParams = new URLSearchParams({
        raceId: race.competitionId,
        raceName: race.raceName,
        countryCode: race.countryCode,
        raceDate: race.date.toISOString()
      });
      
      window.location.href = `race-info.html?${queryParams.toString()}`;
    });

    // Add hover effect for better UX
    card.style.cursor = 'pointer';
  });

  console.log("Race results rendered successfully");
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  fetchRaceResults();
  // Poll every 60 seconds for updates
  setInterval(fetchRaceResults, 60000);
});

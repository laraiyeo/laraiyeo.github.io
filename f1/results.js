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
    
    // Process completed races (played: true)
    const racePromises = eventLogData.events?.items
      ?.filter(event => event.played) // Only completed races
      ?.map(async (event) => {
        try {
          // Get event details for proper race name and abbreviation
          const eventResponse = await fetch(convertToHttps(event.event.$ref));
          const eventData = await eventResponse.json();
          
          const raceName = eventData.name || 'Unknown Grand Prix';
          const raceAbbreviation = eventData.abbreviation || 'F1';
          const raceDate = new Date(eventData.date);
          const raceEndDate = eventData.endDate ? new Date(eventData.endDate) : raceDate; // Use end date if available, fallback to start date
          
          // Get venue details for country flag
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

          // Get race winner info from events competitions
          let winner = 'TBD';
          let winnerTeam = '';
          let teamColor = '#333333';
          
          try {
            // Look for the Race competition in the competitions array
            const raceCompetition = eventData.competitions?.find(comp => 
              comp.type?.name?.toLowerCase().includes('race') || 
              comp.type?.displayName?.toLowerCase().includes('race') ||
              comp.type?.abbreviation?.toLowerCase().includes('race')
            );
            
            if (raceCompetition && raceCompetition.competitors) {
              // Find the winner (winner: true)
              const winnerCompetitor = raceCompetition.competitors.find(c => c.winner === true);
              
              if (winnerCompetitor) {
                // Get manufacturer info
                winnerTeam = winnerCompetitor.vehicle.manufacturer || 'Unknown Team';
                teamColor = `#${getTeamColor(winnerTeam)}`;
                
                // Get driver info
                if (winnerCompetitor.athlete?.$ref) {
                  const athleteResponse = await fetch(convertToHttps(winnerCompetitor.athlete.$ref));
                  const athleteData = await athleteResponse.json();
                  winner = athleteData.shortName || athleteData.displayName || athleteData.fullName || 'Unknown';
                }
              }
            }
          } catch (error) {
            console.error('Error fetching race winner:', error);
          }
          
          return {
            competitionId: parseInt(event.competitionId),
            countryCode: raceAbbreviation,
            countryFlag: countryFlag,
            raceName: raceName.replace(' Race', '').replace('Louis Vuitton ', '').replace('Pirelli ', ''),
            date: raceDate,
            endDate: raceEndDate,
            formattedDate: formatDateWithTimezone(raceEndDate), // Use end date for display
            winner: winner,
            winnerTeam: winnerTeam,
            teamColor: teamColor
          };
        } catch (error) {
          console.error('Error fetching race data:', error);
          return null;
        }
      }) || [];

    const raceResults = await Promise.all(racePromises);
    
    // Filter out failed requests and sort by end date (most recent first)
    completedRaces = raceResults
      .filter(race => race !== null)
      .sort((a, b) => b.endDate - a.endDate);

    renderRaceResults();
  } catch (error) {
    console.error("Error fetching F1 results:", error);
    const container = document.getElementById("resultsContainer");
    if (container) {
      container.innerHTML = '<div style="color: red; text-align: center; padding: 40px;">Error loading results. Please refresh the page.</div>';
    }
  }
}

function renderRaceResults() {
  const container = document.getElementById("resultsContainer");
  if (!container) {
    console.error("Error: Element with ID 'resultsContainer' not found.");
    return;
  }

  if (!completedRaces || completedRaces.length === 0) {
    container.innerHTML = '<div style="color: black; text-align: center; padding: 40px;">No completed races found.</div>';
    return;
  }

  console.log(`Rendering ${completedRaces.length} completed races`);

  const racesHtml = completedRaces.map((race, index) => `
    <div class="result-card" data-race-index="${index}" style="border-left: 5px solid ${race.teamColor};">
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

  container.innerHTML = racesHtml;

  // Add click event listeners to each result card
  const resultCards = container.querySelectorAll('.result-card');
  resultCards.forEach((card, index) => {
    card.addEventListener('click', () => {
      // Navigate to race info page with race details as query parameters
      const race = completedRaces[index];
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

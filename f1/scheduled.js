const DRIVERS_STANDINGS_URL = "https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2025/types/2/standings/0";

let upcomingRaces = [];
let lastScheduleHash = null;

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

function formatDate(date) {
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  };
  
  // Convert to user's local timezone
  const localDate = new Date(date.getTime());
  return localDate.toLocaleDateString('en-US', options);
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

function convertToHttps(url) {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}

async function fetchScheduledRaces() {
  try {
    const container = document.getElementById("scheduledContainer");
    if (container) {
      container.innerHTML = '<div style="color: black; text-align: center; padding: 40px;">Loading upcoming races...</div>';
    }

    // Get driver standings to access event log
    const response = await fetch(DRIVERS_STANDINGS_URL);
    const responseText = await response.text();
    const newHash = hashString(responseText);

    if (newHash === lastScheduleHash) {
      console.log("No changes detected in schedule data.");
      if (upcomingRaces.length > 0) {
        renderScheduledRaces();
      }
      return;
    }
    lastScheduleHash = newHash;

    const data = JSON.parse(responseText);
    
    if (!data.standings || data.standings.length === 0) {
      console.error("No standings data found");
      if (container) {
        container.innerHTML = '<div style="color: red; text-align: center; padding: 40px;">No schedule data available.</div>';
      }
      return;
    }

    // Get event log from first driver to extract race schedule
    const firstDriverResponse = await fetch(convertToHttps(data.standings[0].athlete.$ref));
    const firstDriverData = await firstDriverResponse.json();
    
    if (!firstDriverData.eventLog?.$ref) {
      console.error("No event log found");
      return;
    }

    const eventLogResponse = await fetch(convertToHttps(firstDriverData.eventLog.$ref));
    const eventLogData = await eventLogResponse.json();
    
    // Process upcoming races (not played and not in progress)
    const racePromises = eventLogData.events?.items
      ?.filter(event => !event.played) // Only unplayed races
      ?.map(async (event) => {
        try {
          // Get event details for proper race name and abbreviation
          const eventResponse = await fetch(convertToHttps(event.event.$ref));
          const eventData = await eventResponse.json();
          
          const raceName = eventData.name || 'Unknown Grand Prix';
          const raceAbbreviation = eventData.abbreviation || 'F1';
          const raceDate = new Date(eventData.date);
          const raceEndDate = eventData.endDate ? new Date(eventData.endDate) : raceDate;
          const now = new Date();
          
          // Check if race is currently in progress
          const isInProgress = raceDate <= now && raceEndDate >= now;
          
          // Only include truly upcoming races (not in progress)
          if (isInProgress) {
            return null; // Skip in-progress races
          }
          
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
          
          return {
            competitionId: parseInt(event.competitionId),
            countryCode: raceAbbreviation,
            countryFlag: countryFlag,
            raceName: raceName.replace(' Race', '').replace('Louis Vuitton ', '').replace('Pirelli ', ''),
            date: raceDate,
            formattedDate: formatDateWithTimezone(raceDate) // Use timezone-aware formatting
          };
        } catch (error) {
          console.error('Error fetching race data:', error);
          return null;
        }
      }) || [];

    const raceResults = await Promise.all(racePromises);
    
    // Filter out failed requests and in-progress races, then sort by date
    upcomingRaces = raceResults
      .filter(race => race !== null)
      .sort((a, b) => a.date - b.date);

    renderScheduledRaces();
  } catch (error) {
    console.error("Error fetching F1 schedule:", error);
    const container = document.getElementById("scheduledContainer");
    if (container) {
      container.innerHTML = '<div style="color: red; text-align: center; padding: 40px;">Error loading schedule. Please refresh the page.</div>';
    }
  }
}

function renderScheduledRaces() {
  const container = document.getElementById("scheduledContainer");
  if (!container) {
    console.error("Error: Element with ID 'scheduledContainer' not found.");
    return;
  }

  if (!upcomingRaces || upcomingRaces.length === 0) {
    container.innerHTML = '<div style="color: black; text-align: center; padding: 40px;">No upcoming races found.</div>';
    return;
  }

  console.log(`Rendering ${upcomingRaces.length} upcoming races`);

  const racesHtml = upcomingRaces.map((race, index) => `
    <div class="race-card" data-race-index="${index}">
      <div class="race-header">
        <div class="race-country-flag">
          <img src="${race.countryFlag}" alt="${race.countryCode}" class="country-flag-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
          <span class="country-code-fallback" style="display: none;">${race.countryCode}</span>
        </div>
        <div class="race-name">${race.raceName}</div>
      </div>
      <div class="race-date">${race.formattedDate}</div>
    </div>
  `).join('');

  container.innerHTML = racesHtml;

  // Add click event listeners to each race card
  const raceCards = container.querySelectorAll('.race-card');
  raceCards.forEach((card, index) => {
    card.addEventListener('click', () => {
      // Navigate to race info page with race details as query parameters
      const race = upcomingRaces[index];
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

  console.log("Scheduled races rendered successfully");
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  fetchScheduledRaces();
  // Poll every 60 seconds for updates
  setInterval(fetchScheduledRaces, 60000);
});

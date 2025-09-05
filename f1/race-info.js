const DRIVERS_STANDINGS_URL = "https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2025/types/2/standings/0";

let selectedRace = null;
let circuitInfo = null;
let countdownInterval = null;
let currentCompetitionInfo = null;

// Add caching for competition results
let competitionResultsCache = {};
let cacheExpiry = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Add caching for athlete information (driver details)
let athleteCache = {};
let athleteCacheExpiry = {};
const ATHLETE_CACHE_DURATION = 60 * 60 * 1000; // 1 hour - athlete info changes less frequently

// Add caching for event log data (should only be fetched once per race)
let eventLogCache = {};
let eventLogCacheExpiry = {};
const EVENT_LOG_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours - event log rarely changes

// Add caching for competition information (structure, not live stats)
let competitionInfoCache = {};
let competitionInfoCacheExpiry = {};
const COMPETITION_INFO_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes - competition structure changes infrequently

// Add caching for driver standings (should be fetched less frequently)
let driverStandingsCache = null;
let driverStandingsCacheExpiry = 0;
const DRIVER_STANDINGS_CACHE_DURATION = 15 * 60 * 1000; // 15 minutes - standings don't change rapidly

// Function to fetch driver standings with caching
async function fetchDriverStandings() {
  const now = Date.now();
  
  // Check if we have cached data and it's still valid
  if (driverStandingsCache && driverStandingsCacheExpiry > now) {
    return driverStandingsCache;
  }

  try {
    const response = await fetch(DRIVERS_STANDINGS_URL);
    const data = await response.json();
    
    // Cache the standings data
    driverStandingsCache = data;
    driverStandingsCacheExpiry = now + DRIVER_STANDINGS_CACHE_DURATION;
    
    return data;
  } catch (error) {
    console.error('Error fetching driver standings:', error);
    return null;
  }
}

// Function to fetch event log data with caching
async function fetchEventLogData(raceId) {
  const cacheKey = `eventlog_${raceId}`;
  const now = Date.now();
  
  // Check if we have cached data and it's still valid
  if (eventLogCache[cacheKey] && eventLogCacheExpiry[cacheKey] && now < eventLogCacheExpiry[cacheKey]) {
    return eventLogCache[cacheKey];
  }

  try {
    
    // Get driver standings (cached)
    const standingsData = await fetchDriverStandings();
    if (!standingsData || !standingsData.standings || standingsData.standings.length === 0) {
      return null;
    }

    // Get event log from first driver (using cached athlete data)
    const firstDriverData = await fetchAthleteData(standingsData.standings[0].athlete.$ref);
    
    if (!firstDriverData || !firstDriverData.eventLog?.$ref) {
      return null;
    }

    const eventLogResponse = await fetch(convertToHttps(firstDriverData.eventLog.$ref));
    const eventLogData = await eventLogResponse.json();
    
    // Cache the event log data
    eventLogCache[cacheKey] = eventLogData;
    eventLogCacheExpiry[cacheKey] = now + EVENT_LOG_CACHE_DURATION;
    
    return eventLogData;
  } catch (error) {
    console.error('Error fetching event log data:', error);
    return null;
  }
}

// Function to fetch competition information with caching
async function fetchCompetitionInfo(raceId) {
  const cacheKey = `competition_info_${raceId}`;
  const now = Date.now();
  
  // Check if we have cached data and it's still valid
  if (competitionInfoCache[cacheKey] && competitionInfoCacheExpiry[cacheKey] && now < competitionInfoCacheExpiry[cacheKey]) {
    return competitionInfoCache[cacheKey];
  }

  try {
    
    // Get event log data (cached)
    const eventLogData = await fetchEventLogData(raceId);
    if (!eventLogData) {
      return null;
    }
    
    // Find the specific race by competition ID
    const raceEvent = eventLogData.events?.items?.find(event => 
      event.competitionId === raceId
    );
    
    if (!raceEvent) {
      return null;
    }

    // Get event details
    const eventResponse = await fetch(convertToHttps(raceEvent.event.$ref));
    const eventData = await eventResponse.json();
    
    const competitionInfo = {
      eventData: eventData,
      raceEvent: raceEvent,
      competitions: []
    };
    
    // Process competitions and cache their basic info
    for (const competition of (eventData.competitions || [])) {
      try {
        const compResponse = await fetch(convertToHttps(competition.$ref));
        const compData = await compResponse.json();
        
        // Get competition type and create display name
        const compType = compData.type || {};
        let competitionName = compType.text || compType.displayName || compType.name || 'Unknown';
        let competitionKey = competitionName.toLowerCase().replace(/\s+/g, '_');
        
        // Map abbreviations to full names for better display
        const typeMap = {
          'FP1': 'Free Practice 1',
          'FP2': 'Free Practice 2', 
          'FP3': 'Free Practice 3',
          'Qual': 'Qualifying',
          'Race': 'Race'
        };
        
        if (compType.abbreviation && typeMap[compType.abbreviation]) {
          competitionName = typeMap[compType.abbreviation];
          competitionKey = compType.abbreviation.toLowerCase();
        }
        
        competitionInfo.competitions.push({
          key: competitionKey,
          name: competitionName,
          ref: competition.$ref,
          compData: compData,
          competitors: compData.competitors || []
        });
        
      } catch (error) {
        console.error('Error fetching competition data:', error);
      }
    }
    
    // Cache the competition info
    competitionInfoCache[cacheKey] = competitionInfo;
    competitionInfoCacheExpiry[cacheKey] = now + COMPETITION_INFO_CACHE_DURATION;
    
    return competitionInfo;
  } catch (error) {
    console.error('Error fetching competition info:', error);
    return null;
  }
}

// Function to fetch only live statistics for active competitions
async function fetchLiveStatistics(raceId) {
  try {
    // Get cached competition info
    const competitionInfo = await fetchCompetitionInfo(raceId);
    if (!competitionInfo) {
      return null;
    }
    
    const competitions = {};
    
    // Only process competitions that are in progress
    for (const compInfo of competitionInfo.competitions) {
      try {
        const competition = compInfo.compData;
        const competitionKey = compInfo.key;
        const competitionName = compInfo.name;
        
        // Check competition status first
        let shouldInclude = false;
        let isInProgress = false;
        
        if (competition.status?.$ref) {
          try {
            const statusResponse = await fetch(convertToHttps(competition.status.$ref));
            const statusData = await statusResponse.json();
            
            // Only include competitions that are "in" (in progress)
            if (statusData.type?.state === 'in') {
              shouldInclude = true;
              isInProgress = true;
            }
          } catch (error) {
            console.error('Error fetching competition status:', error);
            // If we can't get status, assume it's not active
            shouldInclude = false;
          }
        }
        
        if (!shouldInclude) {
          continue; // Skip this competition
        }
        
        // Determine if this is a session that should use Gap To Leader for live timing
        const useGapToLeader = isInProgress && 
          (competitionKey === 'fp1' || competitionKey === 'fp2' || competitionKey === 'fp3' || competitionKey === 'race');
        
        let maxLaps = 0;
        
        // Process competitors and fetch only their statistics
        const competitorPromises = (compInfo.competitors || []).map(async (competitor) => {
          try {
            // Only fetch statistics (athlete data is cached)
            const statsResponse = competitor.statistics?.$ref ? 
              await fetch(convertToHttps(competitor.statistics.$ref)) : null;
            
            // Get athlete info from cached data
            const athleteData = competitor.athlete?.$ref ? 
              await fetchAthleteData(competitor.athlete.$ref) : null;
            
            let driverName = 'Unknown';
            if (athleteData) {
              driverName = athleteData.fullName || athleteData.displayName || athleteData.shortName || 'Unknown';
            }
            
            // Get team info
            const team = competitor.vehicle?.manufacturer || 'Unknown Team';
            const teamColor = `#${getTeamColor(team)}`;
            
            // Get statistics with Gap To Leader support
            let stats = {
              position: 'N/A',
              time: 'N/A',
              laps: 'N/A',
              pits: 'N/A',
              fastestLap: 'N/A',
              fastestLapNumber: 'N/A'
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
              
              // Fall back to general stats if no Gap To Leader data or not a live session
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
                  stats.time = statMap.behindTime || statMap.totalTime || 'N/A';
                }
                
                // Always get other stats from general
                stats.laps = statMap.lapsCompleted || 'N/A';
                stats.pits = statMap.pitsTaken || '0';
                stats.fastestLap = statMap.fastestLap || '-';
                stats.fastestLapNumber = statMap.fastestLapNum || '-';
                stats.q1Time = statMap.qual1TimeMS && statMap.qual1TimeMS !== '0.000' ? statMap.qual1TimeMS : null;
                stats.q2Time = statMap.qual2TimeMS && statMap.qual2TimeMS !== '0.000' ? statMap.qual2TimeMS : null;
                stats.q3Time = statMap.qual3TimeMS && statMap.qual3TimeMS !== '0.000' ? statMap.qual3TimeMS : null;
                
                // Track max laps for race competitions
                if ((competitionKey === 'race' || competitionName.toLowerCase().includes('race')) && 
                    stats.laps !== 'N/A' && !isNaN(parseInt(stats.laps))) {
                  maxLaps = Math.max(maxLaps, parseInt(stats.laps));
                }
                
                // For qualifying, set the best time as the main time
                if (competitionKey === 'qual' || competitionName.toLowerCase().includes('qualifying')) {
                  if (stats.q3Time) {
                    stats.time = stats.q3Time;
                  } else if (stats.q2Time) {
                    stats.time = stats.q2Time;
                  } else if (stats.q1Time) {
                    stats.time = stats.q1Time;
                  }
                }
              }
            }
            
            return {
              driverName,
              team,
              teamColor,
              stats,
              position: parseInt(stats.position) || competitor.order || 999,
              winner: competitor.winner || false
            };
            
          } catch (error) {
            console.error('Error processing competitor:', error);
            return null;
          }
        });
        
        const competitorData = (await Promise.all(competitorPromises)).filter(data => data !== null);
        
        // Process times and calculate laps behind for race competitions
        const results = competitorData.map(data => {
          let finalTime = data.stats.time;
          
          // For race competitions, if no time and has lap data, calculate laps behind
          if ((competitionKey === 'race' || competitionName.toLowerCase().includes('race')) && 
              (finalTime === 'N/A' || finalTime === '' || finalTime === null) && 
              data.stats.laps !== 'N/A' && !isNaN(parseInt(data.stats.laps))) {
            
            const driverLaps = parseInt(data.stats.laps);
            const lapsBehind = maxLaps - driverLaps;
            
            if (lapsBehind > 0) {
              finalTime = `+${lapsBehind} Lap${lapsBehind > 1 ? 's' : ''}`;
            }
          }
          
          return {
            position: data.position,
            driverName: data.driverName,
            team: data.team,
            teamColor: data.teamColor,
            time: finalTime,
            laps: data.stats.laps,
            pits: data.stats.pits,
            fastestLap: data.stats.fastestLap,
            fastestLapNumber: data.stats.fastestLapNumber,
            q1Time: data.stats.q1Time,
            q2Time: data.stats.q2Time,
            q3Time: data.stats.q3Time,
            winner: data.winner
          };
        });
        
        // Sort by position
        results.sort((a, b) => a.position - b.position);
        
        competitions[competitionKey] = {
          name: competitionName,
          results: results,
          isLive: isInProgress
        };
        
      } catch (error) {
        console.error('Error processing competition:', error);
      }
    }
    
    return competitions;
  } catch (error) {
    console.error('Error fetching live statistics:', error);
    return null;
  }
}

// Function to fetch athlete data with caching
async function fetchAthleteData(athleteRef) {
  if (!athleteRef) {
    return null;
  }

  const now = Date.now();
  
  // Check if we have cached data and it's still valid
  if (athleteCache[athleteRef] && athleteCacheExpiry[athleteRef] && now < athleteCacheExpiry[athleteRef]) {
    return athleteCache[athleteRef];
  }

  try {
    const response = await fetch(convertToHttps(athleteRef));
    const athleteData = await response.json();
    
    // Cache the athlete data
    athleteCache[athleteRef] = athleteData;
    athleteCacheExpiry[athleteRef] = now + ATHLETE_CACHE_DURATION;
    
    return athleteData;
  } catch (error) {
    console.error('Error fetching athlete data:', error);
    return null;
  }
}

// Global variables for stream testing
let streamUrls = [];
let currentStreamIndex = 0;
let streamTestTimeout = null;
let isMuted = true; // Start muted to prevent autoplay issues
let streamInitialized = false; // Flag to prevent unnecessary stream re-renders

// Add interval for updating race results
let resultsUpdateInterval = null;

function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

function convertToHttps(url) {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
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

async function fetchRaceInfo() {
  try {
    // Check if specific race parameters are provided
    const raceId = getQueryParam('raceId');
    const raceName = getQueryParam('raceName');
    const countryCode = getQueryParam('countryCode');
    const raceDate = getQueryParam('raceDate');

    if (raceId && raceName && raceDate) {
      // Use provided race data
      selectedRace = {
        name: raceName,
        shortName: raceName,
        abbreviation: countryCode || 'F1',
        date: new Date(raceDate),
        countryFlag: '', // Will be fetched separately if needed
        venue: 'Circuit TBD'
      };

      // Try to fetch additional details
      await fetchAdditionalRaceDetails(raceId);
      return selectedRace;
    } else {
      // Fall back to fetching next race
      return await fetchNextRace();
    }
  } catch (error) {
    console.error('Error fetching race info:', error);
    throw error;
  }
}

async function processSVGContent(svgUrl) {
  try {
    // Fetch the SVG content
    const response = await fetch(svgUrl);
    const svgText = await response.text();
    
    // Parse the SVG content
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;
    
    // Only remove elements that are clearly elevation charts
    // Be very conservative - only remove elements with "elevation" in the ID
    const elevationElements = svgDoc.querySelectorAll('[id*="elevation"]');
    elevationElements.forEach(element => element.remove());
    
    // Remove elements positioned very far at the bottom (clear elevation charts only)
    // Use a much higher threshold to avoid removing circuit elements
    const transformElements = svgDoc.querySelectorAll('[transform*="translate"]');
    transformElements.forEach(element => {
      const transform = element.getAttribute('transform');
      const translateMatch = transform.match(/translate\([^,]+,\s*([0-9.]+)\)/);
      // Only remove elements that are very clearly at the bottom (y > 600)
      if (translateMatch && parseFloat(translateMatch[1]) > 600) {
        element.remove();
      }
    });
    
    // Add CSS to make F1 cars white
    const style = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = `
      /* Force F1 car colors to white */
      
      /* Target F1-car group specifically */
      #F1-car path,
      #F1-car polygon,
      #F1-car circle {
        fill: white !important;
        stroke: white !important;
      }
    `;
    
    // Insert the style at the beginning of the SVG
    svgElement.insertBefore(style, svgElement.firstChild);
    
    // Convert back to string and create a blob URL
    const serializer = new XMLSerializer();
    const processedSvg = serializer.serializeToString(svgDoc);
    
    // Create a blob URL for the processed SVG
    const blob = new Blob([processedSvg], { type: 'image/svg+xml' });
    return URL.createObjectURL(blob);
    
  } catch (error) {
    console.error('Error processing SVG:', error);
    return svgUrl; // Return original URL if processing fails
  }
}

function formatCountdown(targetDate, endDate = null, nextSessionDate = null) {
  const now = new Date();
  const startTime = targetDate.getTime();
  const endTime = endDate ? endDate.getTime() : null;
  const currentTime = now.getTime();
  
  // Check if race has finished
  if (endTime && currentTime > endTime) {
    return {
      display: "RACE FINISHED",
      units: [],
      expired: true,
      status: "finished"
    };
  }
  
  // Check if race is in progress
  if (endTime && currentTime >= startTime && currentTime <= endTime) {
    // If we have a next session date, show countdown to that
    if (nextSessionDate) {
      const nextSessionTime = nextSessionDate.getTime();
      const timeDiffToNext = nextSessionTime - currentTime;
      
      if (timeDiffToNext > 0) {
        const hours = Math.floor(timeDiffToNext / (1000 * 60 * 60));
        const minutes = Math.floor((timeDiffToNext % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeDiffToNext % (1000 * 60)) / 1000);
        
        let display = "";
        let units = [];
        
        if (hours > 0) {
          display = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
          units = ['HOURS', 'MINS', 'SECS'];
        } else {
          display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
          units = ['MINS', 'SECS'];
        }
        
        return { display, units, expired: false, status: "in-progress", nextSession: true };
      }
    }
    
    return {
      display: "RACE IN PROGRESS",
      units: [],
      expired: false,
      status: "in-progress"
    };
  }
  
  // Check if race has started but no end date
  if (!endTime && currentTime >= startTime) {
    return {
      display: "RACE STARTED!",
      units: [],
      expired: true,
      status: "started"
    };
  }
  
  // Race is upcoming - show countdown
  const timeDiff = startTime - currentTime;
  
  if (timeDiff <= 0) {
    return {
      display: "RACE STARTING!",
      units: [],
      expired: true,
      status: "starting"
    };
  }
  
  const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
  
  let display = "";
  let units = [];
  
  if (days > 0) {
    display = `${days.toString().padStart(2, '0')}:${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    units = ['DAYS', 'HOURS', 'MINS', 'SECS'];
  } else if (hours > 0) {
    display = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    units = ['HOURS', 'MINS', 'SECS'];
  } else {
    display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    units = ['MINS', 'SECS'];
  }
  
  return { display, units, expired: false, status: "upcoming" };
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

async function fetchRaceWinner(raceId) {
  try {
    // Get event log data (cached)
    const eventLogData = await fetchEventLogData(raceId);
    if (!eventLogData) {
      return null;
    }
    
    // Find the specific race by competition ID
    const raceEvent = eventLogData.events?.items?.find(event => 
      event.competitionId === raceId
    );
    
    if (raceEvent) {
      // Get event details
      const eventResponse = await fetch(convertToHttps(raceEvent.event.$ref));
      const eventData = await eventResponse.json();
      
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
          // Get manufacturer and team color info
          const winnerTeam = winnerCompetitor.vehicle?.manufacturer || 'Unknown Team';
          const teamColor = `#${getTeamColor(winnerTeam)}`;
          
          // Get driver info
          let winner = 'Unknown';
          let winnerTime = 'TBD';
          
          if (winnerCompetitor.athlete?.$ref) {
            const athleteData = await fetchAthleteData(winnerCompetitor.athlete.$ref);
            winner = athleteData ? (athleteData.shortName || athleteData.displayName || athleteData.fullName || 'Unknown') : 'Unknown';
          }
          
          // Get winner time from statistics
          if (winnerCompetitor.statistics?.$ref) {
            try {
              const statsResponse = await fetch(convertToHttps(winnerCompetitor.statistics.$ref));
              const statsData = await statsResponse.json();
              
              // Find the totalTime stat in the general category
              const generalStats = statsData.splits?.categories?.find(cat => cat.name === 'general');
              if (generalStats && generalStats.stats) {
                const totalTimeStat = generalStats.stats.find(stat => stat.name === 'totalTime');
                if (totalTimeStat && totalTimeStat.displayValue) {
                  winnerTime = totalTimeStat.displayValue;
                }
              }
            } catch (error) {
              console.error('Error fetching winner statistics:', error);
            }
          }
          
          return { winner, winnerTeam, winnerTime, teamColor };
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching race winner:', error);
    return null;
  }
}

async function fetchAdditionalRaceDetails(raceId) {
  try {
    // Get event log data (cached)
    const eventLogData = await fetchEventLogData(raceId);
    if (!eventLogData) {
      return;
    }
    
    // Find the specific race by competition ID
    const raceEvent = eventLogData.events?.items?.find(event => 
      event.competitionId === raceId
    );
    
    if (raceEvent) {
      // Get event details
      const eventResponse = await fetch(convertToHttps(raceEvent.event.$ref));
      const eventData = await eventResponse.json();
      
      // Get venue details for country flag and venue name
      if (eventData.venues && eventData.venues.length > 0) {
        try {
          const venueResponse = await fetch(convertToHttps(eventData.venues[0].$ref));
          const venueData = await venueResponse.json();
          
          selectedRace.countryFlag = venueData.countryFlag?.href || '';
          selectedRace.venue = venueData.fullName || 'Circuit TBD';
        } catch (error) {
          console.error('Error fetching venue data:', error);
        }
      }
      
      // Store calculated end date for race weekend
      const calculatedEndDate = await calculateRaceWeekendEndDate(eventData);
      selectedRace.endDate = calculatedEndDate;
      
      // Get circuit information
      if (eventData.circuit && eventData.circuit.$ref) {
        try {
          const circuitResponse = await fetch(convertToHttps(eventData.circuit.$ref));
          const circuitData = await circuitResponse.json();
          
          // Find the day SVG diagram
          const dayDiagram = circuitData.diagrams?.find(diagram => 
            diagram.rel.includes('full') && diagram.rel.includes('day') && diagram.href.endsWith('.svg')
          );
          
          // Process the SVG to remove elevation info
          let processedDiagramUrl = '';
          if (dayDiagram?.href) {
            processedDiagramUrl = await processSVGContent(dayDiagram.href);
          }
          
          circuitInfo = {
            name: circuitData.fullName || 'Unknown Circuit',
            type: circuitData.type || 'Unknown',
            length: circuitData.length || 'Unknown',
            distance: circuitData.distance || 'Unknown',
            laps: circuitData.laps || 'Unknown',
            turns: circuitData.turns || 'Unknown',
            direction: circuitData.direction || 'Unknown',
            established: circuitData.established || 'Unknown',
            diagramUrl: processedDiagramUrl
          };
        } catch (error) {
          console.error('Error fetching circuit data:', error);
        }
      }
      
      // Update race details with full information
      selectedRace.name = eventData.name || selectedRace.name;
      selectedRace.shortName = eventData.shortName || selectedRace.shortName;
      selectedRace.abbreviation = eventData.abbreviation || selectedRace.abbreviation;
    }
  } catch (error) {
    console.error('Error fetching additional race details:', error);
  }
}

async function fetchNextRace() {
  try {
    // Get event log data (cached) - use a dummy raceId to get general event log
    const eventLogData = await fetchEventLogData('next_race');
    if (!eventLogData) {
      throw new Error("No event log found");
    }
    
    // Find the next upcoming race
    const upcomingEvents = eventLogData.events?.items?.filter(event => !event.played) || [];
    
    if (upcomingEvents.length === 0) {
      throw new Error("No upcoming races found");
    }

    // Get the first upcoming race
    const nextEvent = upcomingEvents[0];
    
    // Get event details
    const eventResponse = await fetch(convertToHttps(nextEvent.event.$ref));
    const eventData = await eventResponse.json();
    
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
    
    // Get circuit information
    if (eventData.circuit && eventData.circuit.$ref) {
      try {
        const circuitResponse = await fetch(convertToHttps(eventData.circuit.$ref));
        const circuitData = await circuitResponse.json();
        
        // Find the day SVG diagram
        const dayDiagram = circuitData.diagrams?.find(diagram => 
          diagram.rel.includes('full') && diagram.rel.includes('day') && diagram.href.endsWith('.svg')
        );
        
        // Process the SVG to remove elevation info
        let processedDiagramUrl = '';
        if (dayDiagram?.href) {
          processedDiagramUrl = await processSVGContent(dayDiagram.href);
        }
        
        circuitInfo = {
          name: circuitData.fullName || 'Unknown Circuit',
          type: circuitData.type || 'Unknown',
          length: circuitData.length || 'Unknown',
          distance: circuitData.distance || 'Unknown',
          laps: circuitData.laps || 'Unknown',
          turns: circuitData.turns || 'Unknown',
          direction: circuitData.direction || 'Unknown',
          established: circuitData.established || 'Unknown',
          diagramUrl: processedDiagramUrl
        };
      } catch (error) {
        console.error('Error fetching circuit data:', error);
      }
    }
    
    // Get calculated end date for race weekend
    const calculatedEndDate = await calculateRaceWeekendEndDate(eventData);
    
    selectedRace = {
      name: eventData.name || 'Unknown Grand Prix',
      shortName: eventData.shortName || eventData.name || 'Unknown GP',
      abbreviation: eventData.abbreviation || 'F1',
      date: new Date(eventData.date),
      endDate: calculatedEndDate,
      countryFlag: countryFlag,
      venue: venueName
    };

    return selectedRace;
  } catch (error) {
    console.error('Error fetching next race:', error);
    throw error;
  }
}

function formatRaceDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

function updateCountdown() {
  if (!selectedRace) return;
  
  const nextSessionDate = currentCompetitionInfo?.next?.date ? new Date(currentCompetitionInfo.next.date) : null;
  const countdown = formatCountdown(selectedRace.date, selectedRace.endDate, nextSessionDate);
  const countdownEl = document.querySelector('.countdown-timer');
  const unitsEl = document.querySelector('.countdown-units');
  const titleEl = document.querySelector('.countdown-title');
  
  if (countdownEl && titleEl) {
    countdownEl.textContent = countdown.display;
    
    // Update title and styling based on race status
    switch (countdown.status) {
      case "upcoming":
        titleEl.textContent = "RACE STARTS IN";
        countdownEl.style.color = 'white';
        if (unitsEl && countdown.units.length > 0) {
          unitsEl.innerHTML = countdown.units.map(unit => 
            `<div class="countdown-unit">${unit}</div>`
          ).join('');
        }
        break;
        
      case "in-progress":
        if (countdown.nextSession) {
          titleEl.textContent = "NEXT SESSION IN";
          countdownEl.style.color = 'white';
          if (unitsEl && countdown.units.length > 0) {
            unitsEl.innerHTML = countdown.units.map(unit => 
              `<div class="countdown-unit">${unit}</div>`
            ).join('');
          }
        } else {
          titleEl.textContent = "";
          countdownEl.style.color = '#f39c12';
          countdownEl.style.fontSize = '2.5rem';
          if (unitsEl) unitsEl.innerHTML = '';
        }
        break;
        
      case "finished":
      case "started":
      case "starting":
        titleEl.textContent = "";
        countdownEl.style.color = '#e74c3c';
        countdownEl.style.fontSize = '2.5rem';
        if (unitsEl) unitsEl.innerHTML = '';
        
        // Stop the countdown interval
        if (countdownInterval) {
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
        break;
    }
  }
}

function renderCircuitInfo() {
  const container = document.getElementById("raceDetails");
  if (!container) {
    console.error("Error: Element with ID 'raceDetails' not found.");
    return;
  }

  if (!circuitInfo) {
    container.innerHTML = '<div class="loading">Circuit information not available</div>';
    return;
  }

  container.innerHTML = `
    <div class="section-title">Circuit Information</div>
    <div class="circuit-container">
      <div class="circuit-image-container">
        ${circuitInfo.diagramUrl ? 
          `<img src="${circuitInfo.diagramUrl}" alt="Circuit Diagram" class="circuit-diagram" style="background: none !important; max-width: 100%; height: auto;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="no-circuit-image" style="display: none;">Circuit diagram not available</div>` : 
          '<div class="no-circuit-image">Circuit diagram not available</div>'
        }
      </div>
      <div class="circuit-info-container">
        <h3 class="circuit-name">${circuitInfo.name}</h3>
        <div class="circuit-details">
          <div class="circuit-detail">
            <span class="detail-label">Type:</span>
            <span class="detail-value">${circuitInfo.type}</span>
          </div>
          <div class="circuit-detail">
            <span class="detail-label">Length:</span>
            <span class="detail-value">${circuitInfo.length}</span>
          </div>
          <div class="circuit-detail">
            <span class="detail-label">Distance:</span>
            <span class="detail-value">${circuitInfo.distance}</span>
          </div>
          <div class="circuit-detail">
            <span class="detail-label">Laps:</span>
            <span class="detail-value">${circuitInfo.laps}</span>
          </div>
          <div class="circuit-detail">
            <span class="detail-label">Turns:</span>
            <span class="detail-value">${circuitInfo.turns}</span>
          </div>
          <div class="circuit-detail">
            <span class="detail-label">Direction:</span>
            <span class="detail-value">${circuitInfo.direction}</span>
          </div>
          <div class="circuit-detail">
            <span class="detail-label">Established:</span>
            <span class="detail-value">${circuitInfo.established}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function fetchCompetitionResults(raceId) {
  try {
    // Check cache first
    const cacheKey = `results_${raceId}`;
    const now = Date.now();
    
    if (competitionResultsCache[cacheKey] && 
        cacheExpiry[cacheKey] && 
        now < cacheExpiry[cacheKey]) {
      return competitionResultsCache[cacheKey];
    }

    // Get competition info (cached)
    const competitionInfo = await fetchCompetitionInfo(raceId);
    if (!competitionInfo) {
      return null;
    }
    
    const competitions = {};
    
    // Process competitions in parallel for better performance
    const competitionPromises = competitionInfo.competitions.map(async (compInfo) => {
      try {
        const competition = compInfo.compData;
        const competitionKey = compInfo.key;
        const competitionName = compInfo.name;
        let shouldInclude = false;
        let isInProgress = false;
          
          if (competition.status?.$ref) {
            try {
              const statusResponse = await fetch(convertToHttps(competition.status.$ref));
              const statusData = await statusResponse.json();
              
              // Only include competitions that are "in" (in progress) or "post" (completed)
              if (statusData.type?.state === 'in') {
                shouldInclude = true;
                isInProgress = true;
              } else if (statusData.type?.state === 'post') {
                shouldInclude = true;
                isInProgress = false;
              }
            } catch (error) {
              console.error('Error fetching competition status:', error);
              shouldInclude = true;
            }
          } else {
            shouldInclude = true;
          }
          
          if (!shouldInclude) {
            return null;
          }

          // Get competition data (already cached in compInfo.compData)
          const compData = competition;
          
          // Determine if this is a session that should use Gap To Leader for live timing
          const useGapToLeader = isInProgress && 
            (competitionKey === 'fp1' || competitionKey === 'fp2' || competitionKey === 'fp3' || competitionKey === 'race');
          
          let maxLaps = 0;
          
          // Process competitors in parallel
          const competitorPromises = (compData.competitors || []).map(async (competitor) => {
            try {
              // Fetch athlete data (cached) and statistics (always fresh) in parallel
              const [athleteData, statsResponse] = await Promise.all([
                competitor.athlete?.$ref ? fetchAthleteData(competitor.athlete.$ref) : Promise.resolve(null),
                competitor.statistics?.$ref ? fetch(convertToHttps(competitor.statistics.$ref)) : Promise.resolve(null)
              ]);
              
              // Get athlete info from cached data
              let driverName = 'Unknown';
              if (athleteData) {
                driverName = athleteData.fullName || athleteData.displayName || athleteData.shortName || 'Unknown';
              }
              
              // Get team info
              const team = competitor.vehicle?.manufacturer || 'Unknown Team';
              const teamColor = `#${getTeamColor(team)}`;
              
              // Get statistics with Gap To Leader support
              let stats = {
                position: 'N/A',
                time: 'N/A',
                laps: 'N/A',
                pits: 'N/A',
                fastestLap: 'N/A',
                fastestLapNumber: 'N/A'
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
                
                // Fall back to general stats if no Gap To Leader data or not a live session
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
                    stats.time = statMap.behindTime || statMap.totalTime || 'N/A';
                  }
                  
                  // Always get other stats from general
                  stats.laps = statMap.lapsCompleted || 'N/A';
                  stats.pits = statMap.pitsTaken || '0';
                  stats.fastestLap = statMap.fastestLap || '-';
                  stats.fastestLapNumber = statMap.fastestLapNum || '-';
                  stats.q1Time = statMap.qual1TimeMS && statMap.qual1TimeMS !== '0.000' ? statMap.qual1TimeMS : null;
                  stats.q2Time = statMap.qual2TimeMS && statMap.qual2TimeMS !== '0.000' ? statMap.qual2TimeMS : null;
                  stats.q3Time = statMap.qual3TimeMS && statMap.qual3TimeMS !== '0.000' ? statMap.qual3TimeMS : null;
                  
                  // Track max laps for race competitions
                  if ((competitionKey === 'race' || competitionName.toLowerCase().includes('race')) && 
                      stats.laps !== 'N/A' && !isNaN(parseInt(stats.laps))) {
                    maxLaps = Math.max(maxLaps, parseInt(stats.laps));
                  }
                  
                  // For qualifying, set the best time as the main time
                  if (competitionKey === 'qual' || competitionName.toLowerCase().includes('qualifying')) {
                    if (stats.q3Time) {
                      stats.time = stats.q3Time;
                    } else if (stats.q2Time) {
                      stats.time = stats.q2Time;
                    } else if (stats.q1Time) {
                      stats.time = stats.q1Time;
                    }
                  }
                }
              }
              
              return {
                driverName,
                team,
                teamColor,
                stats,
                position: parseInt(stats.position) || competitor.order || 999,
                winner: competitor.winner || false
              };
              
            } catch (error) {
              console.error('Error processing competitor:', error);
              return null;
            }
          });
          
          const competitorData = (await Promise.all(competitorPromises)).filter(data => data !== null);
          
          // Process times and calculate laps behind for race competitions
          const results = competitorData.map(data => {
            let finalTime = data.stats.time;
            
            // For race competitions, if no time and has lap data, calculate laps behind
            if ((competitionKey === 'race' || competitionName.toLowerCase().includes('race')) && 
                (finalTime === 'N/A' || finalTime === '' || finalTime === null) && 
                data.stats.laps !== 'N/A' && !isNaN(parseInt(data.stats.laps))) {
              
              const driverLaps = parseInt(data.stats.laps);
              const lapsBehind = maxLaps - driverLaps;
              
              if (lapsBehind > 0) {
                finalTime = `+${lapsBehind} Lap${lapsBehind > 1 ? 's' : ''}`;
              }
            }
            
            return {
              position: data.position,
              driverName: data.driverName,
              team: data.team,
              teamColor: data.teamColor,
              time: finalTime,
              laps: data.stats.laps,
              pits: data.stats.pits,
              fastestLap: data.stats.fastestLap,
              fastestLapNumber: data.stats.fastestLapNumber,
              q1Time: data.stats.q1Time,
              q2Time: data.stats.q2Time,
              q3Time: data.stats.q3Time,
              winner: data.winner
            };
          });
          
          // Sort by position
          results.sort((a, b) => a.position - b.position);
          
          return {
            key: competitionKey,
            data: {
              name: competitionName,
              results: results,
              isLive: useGapToLeader
            }
          };
          
        } catch (error) {
          console.error('Error fetching competition data:', error);
          return null;
        }
      });
      
      const competitionResults = (await Promise.all(competitionPromises)).filter(result => result !== null);
      
      // Build competitions object
      competitionResults.forEach(result => {
        competitions[result.key] = result.data;
      });
      
      console.log('F1 fetchCompetitionResults: Found competitions:', Object.keys(competitions));
      
      // Cache the results
      competitionResultsCache[cacheKey] = competitions;
      cacheExpiry[cacheKey] = now + CACHE_DURATION;
      
      return competitions;
      
  } catch (error) {
    console.error('Error fetching competition results:', error);
    return null;
  }
}

function renderCompetitionResults(competitions) {
  console.log('F1 renderCompetitionResults called with:', competitions);
  
  if (!competitions || Object.keys(competitions).length === 0) {
    console.log('F1 renderCompetitionResults: No competitions data available');
    return '<div class="loading">No competition results available</div>';
  }
  
  const competitionKeys = Object.keys(competitions);
  
  // Determine which tab should be active by default
  let defaultKey = competitionKeys[0];
  
  // Get race status
  const countdown = formatCountdown(selectedRace.date, selectedRace.endDate);
  
  // Find the most recent session with actual meaningful results
  const sessionPriorityOrder = ['race', 'qual', 'fp3', 'fp2', 'fp1'];
  
  for (const sessionType of sessionPriorityOrder) {
    const sessionKey = competitionKeys.find(key => {
      const keyLower = key.toLowerCase();
      const nameLower = competitions[key].name.toLowerCase();
      
      // More specific matching
      if (sessionType === 'race') {
        return (keyLower === 'race' || nameLower.includes('race')) && 
               !nameLower.includes('sprint');
      } else if (sessionType === 'qual') {
        return keyLower === 'qual' || nameLower.includes('qualifying');
      } else if (sessionType === 'fp3') {
        return keyLower === 'fp3' || nameLower.includes('practice 3') || nameLower.includes('free practice 3');
      } else if (sessionType === 'fp2') {
        return keyLower === 'fp2' || nameLower.includes('practice 2') || nameLower.includes('free practice 2');
      } else if (sessionType === 'fp1') {
        return keyLower === 'fp1' || nameLower.includes('practice 1') || nameLower.includes('free practice 1');
      }
      return false;
    });
    
    if (sessionKey && competitions[sessionKey].results && competitions[sessionKey].results.length > 0) {
      // Check if this session has actual meaningful results
      const hasResults = competitions[sessionKey].results.some(result => 
        (result.time && result.time !== 'N/A' && result.time !== 'TBD' && result.time !== '') ||
        (result.position && result.position !== 'N/A' && result.position !== 'TBD')
      );
      
      if (hasResults) {
        defaultKey = sessionKey;
        break;
      }
    }
  }
  
  // Create tab buttons
  const tabButtons = competitionKeys.map(key => {
    const comp = competitions[key];
    return `<button class="competition-tab ${key === defaultKey ? 'active' : ''}" data-competition="${key}">
      ${comp.name}
    </button>`;
  }).join('');
  
  // Create content for each competition
  const tabContents = competitionKeys.map(key => {
    const comp = competitions[key];
    const isVisible = key === defaultKey ? 'block' : 'none';
    
    // Determine table structure based on competition type
    let tableHeaders = '';
    let resultsRows = '';
    
    if (key === 'Race' || comp.name.toLowerCase().includes('race')) {
      // Race: POS, Driver, Time, Laps, Pits, Fastest Time
      tableHeaders = `
        <th class="pos-header">POS</th>
        <th class="driver-header">DRIVER</th>
        <th class="time-header">TIME</th>
        <th class="laps-header">LAPS</th>
        <th class="pits-header">PITS</th>
        <th class="fastest-header">FASTEST TIME</th>
      `;
      
      resultsRows = comp.results.map(result => `
        <tr>
          <td class="pos-cell">${result.position}</td>
          <td class="driver-cell">
            <div class="driver-name">${result.driverName}</div>
            <div class="driver-team" style="color: ${result.teamColor};">${result.team}</div>
          </td>
          <td class="time-cell">${result.time}</td>
          <td class="laps-cell">${result.laps}</td>
          <td class="pits-cell">${result.pits}</td>
          <td class="fastest-cell">
            ${result.fastestLap !== '-' ? `${result.fastestLap}<br><small>Lap ${result.fastestLapNumber}</small>` : '-'}
          </td>
        </tr>
      `).join('');
      
    } else if (key === 'Qual' || comp.name.toLowerCase().includes('qualifying')) {
      // Qualifying: POS, Driver, Q1, Q2, Q3, Laps
      tableHeaders = `
        <th class="pos-header">POS</th>
        <th class="driver-header">DRIVER</th>
        <th class="Qual-header">Q1</th>
        <th class="Qual-header">Q2</th>
        <th class="Qual-header">Q3</th>
        <th class="laps-header">LAPS</th>
      `;
      
      resultsRows = comp.results.map(result => `
        <tr>
          <td class="pos-cell">${result.position}</td>
          <td class="driver-cell">
            <div class="driver-name">${result.driverName}</div>
            <div class="driver-team" style="color: ${result.teamColor};">${result.team}</div>
          </td>
          <td class="time-cell">${result.q1Time || '-'}</td>
          <td class="time-cell">${result.q2Time || '-'}</td>
          <td class="time-cell">${result.q3Time || '-'}</td>
          <td class="laps-cell">${result.laps}</td>
        </tr>
      `).join('');
      
    } else {
      // Practice: POS, Driver, Time, Laps
      tableHeaders = `
        <th class="pos-header">POS</th>
        <th class="driver-header">DRIVER</th>
        <th class="time-header">TIME</th>
        <th class="laps-header">LAPS</th>
      `;
      
      resultsRows = comp.results.map(result => `
        <tr>
          <td class="pos-cell">${result.position}</td>
          <td class="driver-cell">
            <div class="driver-name">${result.driverName}</div>
            <div class="driver-team" style="color: ${result.teamColor};">${result.team}</div>
          </td>
          <td class="time-cell">${result.time}</td>
          <td class="laps-cell">${result.laps}</td>
        </tr>
      `).join('');
    }
    
    return `
      <div class="competition-content" data-competition="${key}" style="display: ${isVisible};">
        <div class="results-table-container">
          <table class="results-table">
            <thead>
              <tr>
                ${tableHeaders}
              </tr>
            </thead>
            <tbody>
              ${resultsRows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');
  
  return `
    <div class="section-title">Race Results</div>
    <div class="competition-tabs">
      ${tabButtons}
    </div>
    ${tabContents}
  `;
}

async function getCurrentCompetitionInfo(raceId) {
  try {
    // Get event log data (cached)
    const eventLogData = await fetchEventLogData(raceId);
    if (!eventLogData) {
      return null;
    }
    
    // Find the specific race by competition ID
    const raceEvent = eventLogData.events?.items?.find(event => 
      event.competitionId === raceId
    );
    
    if (raceEvent) {
      // Get event details
      const eventResponse = await fetch(convertToHttps(raceEvent.event.$ref));
      const eventData = await eventResponse.json();
      
      // Find the competition that's currently "in" progress or the next upcoming one
      let currentCompetition = null;
      let nextCompetition = null;
      const now = new Date();
      
      for (const competition of eventData.competitions || []) {
        const competitionDate = new Date(competition.date);
        
        if (competition.status?.$ref) {
          try {
            const statusResponse = await fetch(convertToHttps(competition.status.$ref));
            const statusData = await statusResponse.json();
            
            if (statusData.type?.state === 'in') {
              // Get competition details
              const compResponse = await fetch(convertToHttps(competition.$ref));
              const compData = await compResponse.json();
              
              const compType = compData.type || {};
              
              // Map abbreviations to full names
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
              
              currentCompetition = {
                name: competitionName,
                date: new Date(competition.date || compData.date)
              };
              break; // Found current session, use it
            }
          } catch (error) {
            console.error('Error fetching competition status:', error);
          }
        }
        
        // Also check for next upcoming session within this race weekend
        if (competitionDate > now && (!nextCompetition || competitionDate < nextCompetition.date)) {
          try {
            const compResponse = await fetch(convertToHttps(competition.$ref));
            const compData = await compResponse.json();
            
            const compType = compData.type || {};
            
            // Map abbreviations to full names
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
            
            nextCompetition = {
              name: competitionName,
              date: new Date(competition.date || compData.date)
            };
          } catch (error) {
            console.error('Error fetching next competition details:', error);
          }
        }
      }
      
      // Return current session if in progress, otherwise return next session
      return currentCompetition || nextCompetition;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching current competition info:', error);
    return null;
  }
}

function normalizeRaceName(raceName) {
  // Convert race names to the format used in the streaming site URLs
  const nameMap = {
    "Bahrain Grand Prix": "bahrain-gp",
    "Saudi Arabian Grand Prix": "saudi-arabia-gp", 
    "Australian Grand Prix": "australia-gp",
    "Japanese Grand Prix": "japan-gp",
    "Chinese Grand Prix": "china-gp",
    "Miami Grand Prix": "miami-gp",
    "Emilia Romagna Grand Prix": "emilia-romagna-gp",
    "Monaco Grand Prix": "monaco-gp",
    "Spanish Grand Prix": "spain-gp",
    "Canadian Grand Prix": "canada-gp",
    "Austrian Grand Prix": "austria-gp",
    "British Grand Prix": "great-britain-gp",
    "Hungarian Grand Prix": "hungary-gp",
    "Belgian Grand Prix": "belgium-gp",
    "Dutch Grand Prix": "netherlands-gp",
    "Italian Grand Prix": "italy-gp",
    "Azerbaijan Grand Prix": "azerbaijan-gp",
    "Singapore Grand Prix": "singapore-gp",
    "United States Grand Prix": "usa-gp",
    "Mexican Grand Prix": "mexico-gp",
    "Brazilian Grand Prix": "brazil-gp",
    "Las Vegas Grand Prix": "las-vegas-gp",
    "Qatar Grand Prix": "qatar-gp",
    "Abu Dhabi Grand Prix": "abu-dhabi-gp",
    "Pirelli Canadian Grand Prix": "canada-gp",
    "Canadian Grand Prix": "canada-gp",
    "Qatar Airways British Grand Prix": "great-britain-gp",
    "British Grand Prix": "great-britain-gp"
  };
  
  // Try exact match first
  if (nameMap[raceName]) {
    return nameMap[raceName];
  }
  
  // Check for partial matches (handle cases like "Pirelli Canadian Grand Prix")
  for (const [fullName, shortName] of Object.entries(nameMap)) {
    if (raceName.includes(fullName.replace(' Grand Prix', '')) || 
        fullName.includes(raceName.replace(' Grand Prix', ''))) {
      return shortName;
    }
  }
  
  // Fallback: normalize the race name
  return raceName.toLowerCase()
    .replace(/pirelli /gi, '')
    .replace(/louis vuitton /gi, '')
    .replace(/qatar airways /gi, '')
    .replace(/ grand prix/gi, '-gp')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
}

// Video extraction function removed - using direct iframe embed

// Stream control functions removed - using direct iframe embed

// Fullscreen function removed - using direct iframe embed

// Stream functions removed - using direct iframe embed

// Stream load handler removed - using direct iframe embed

function checkStreamContent(iframe) {
  const connectingDiv = document.getElementById('streamConnecting');
  
  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    
    const hasVideo = iframeDoc.querySelector('video') || 
                    iframeDoc.querySelector('.video-js') || 
                    iframeDoc.querySelector('[id*="video"]') ||
                    iframeDoc.querySelector('[class*="player"]');
    
    if (hasVideo) {
      iframe.style.display = 'block';
      if (connectingDiv) {
        connectingDiv.style.display = 'none';
      }
      streamUrls = [];
      return;
    }
  } catch (e) {
    console.log('Cannot access iframe content (cross-origin), assuming external stream');
    iframe.style.display = 'block';
    if (connectingDiv) {
      connectingDiv.style.display = 'none';
    }
  }
  
  // Reduced delay from 2 seconds to 1 second
  setTimeout(() => {
    if (streamUrls.length > 0) {
      tryNextStream();
    } else {
      iframe.style.display = 'block';
      if (connectingDiv) {
        connectingDiv.style.display = 'none';
      }
    }
  }, 1000);
}

// Stream functions removed - using direct iframe embed

// Stream testing function removed - using direct iframe embed

function renderStreamEmbed(raceName) {
  console.log('F1 renderStreamEmbed called with raceName:', raceName);
  
  const isSmallScreen = window.innerWidth < 525;
  const screenHeight = isSmallScreen ? 250 : 700;

  console.log('F1 Stream rendering with screen height:', screenHeight);

  return `
    <div style="background: #1a1a1a; border-radius: 1rem; padding: 1rem; margin-bottom: 2rem;">
      <div style="margin-bottom: 10px; text-align: center;">
        <h3 style="color: white; margin: 0;">F1 Live Stream</h3>
        <div style="margin-top: 10px;">
          <button onclick="toggleFullscreen()" style="padding: 8px 16px; margin: 0 5px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">⛶ Fullscreen</button>
        </div>
      </div>
      <div style="position: relative; width: 100%; margin: 0 auto; overflow: hidden; isolation: isolate;">
        <iframe
          title="Sky Sports F1 | Sky F1 Player"
          marginheight="0"
          marginwidth="0"
          src="https://embedsports.top/embed/alpha/sky-sports-f1-sky-f1/1"
          scrolling="no"
          allowfullscreen="yes"
          allow="encrypted-media; picture-in-picture; autoplay; fullscreen"
          width="100%"
          height="${screenHeight}"
          frameborder="0"
          style="aspect-ratio: 16/9; background: #000; border-radius: 8px; isolation: isolate; will-change: auto; backface-visibility: hidden; transform: translateZ(0);">
        </iframe>
      </div>
    </div>
  `;
}

window.toggleFullscreen = function() {
  const iframe = document.querySelector('#streamEmbed iframe');

  if (iframe) {
    try {
      // For iOS Safari and other WebKit browsers
      if (iframe.webkitEnterFullscreen) {
        iframe.webkitEnterFullscreen();
        console.log('iOS/WebKit fullscreen requested');
      }
      // Standard fullscreen API
      else if (iframe.requestFullscreen) {
        iframe.requestFullscreen();
        console.log('Standard fullscreen requested');
      }
      // Chrome/Safari prefixed version
      else if (iframe.webkitRequestFullscreen) {
        iframe.webkitRequestFullscreen();
        console.log('WebKit fullscreen requested');
      }
      // IE/Edge prefixed version
      else if (iframe.msRequestFullscreen) {
        iframe.msRequestFullscreen();
        console.log('MS fullscreen requested');
      }
      // Mozilla prefixed version
      else if (iframe.mozRequestFullScreen) {
        iframe.mozRequestFullScreen();
        console.log('Mozilla fullscreen requested');
      }
      else {
        console.log('Fullscreen API not supported on this device');
        // Fallback: try to make the iframe larger on unsupported devices
        if (iframe.style.position !== 'fixed') {
          iframe.style.position = 'fixed';
          iframe.style.top = '0';
          iframe.style.left = '0';
          iframe.style.width = '100vw';
          iframe.style.height = '100vh';
          iframe.style.zIndex = '9999';
          iframe.style.backgroundColor = '#000';
        } else {
          // Exit fullscreen-like mode
          const isSmallScreen = window.innerWidth < 525;
          const screenHeight = isSmallScreen ? 250 : 700;
          iframe.style.position = '';
          iframe.style.top = '';
          iframe.style.left = '';
          iframe.style.width = '100%';
          iframe.style.height = screenHeight + 'px';
          iframe.style.zIndex = '';
          iframe.style.backgroundColor = '';
        }
      }
    } catch (e) {
      console.log('Fullscreen request failed:', e);
      // Additional fallback for cases where even the API calls fail
      alert('Fullscreen not supported on this device. Try rotating your device to landscape mode for a better viewing experience.');
    }
  }
};

async function renderRaceInfo() {
  const container = document.getElementById("topRaceInfo");
  if (!container) {
    console.error("Error: Element with ID 'topRaceInfo' not found.");
    return;
  }

  if (!selectedRace) {
    container.innerHTML = '<div class="error">Unable to load race information</div>';
    return;
  }

  const countdown = formatCountdown(selectedRace.date, selectedRace.endDate);
  
  // For in-progress races, get current competition info
  let localCompetitionInfo = null;
  if (countdown.status === "in-progress") {
    const raceId = getQueryParam('raceId');
    if (raceId) {
      localCompetitionInfo = await getCurrentCompetitionInfo(raceId);
      currentCompetitionInfo = localCompetitionInfo; // Set global variable
    }
  }
  
  // Recalculate countdown with next session info if available
  const nextSessionDate = localCompetitionInfo?.next?.date ? new Date(localCompetitionInfo.next.date) : null;
  const finalCountdown = formatCountdown(selectedRace.date, selectedRace.endDate, nextSessionDate);
  
  // Determine which date to show based on race status
  let displayDate;
  let dateLabel = "";
  
  if (finalCountdown.status === "finished" && selectedRace.endDate) {
    displayDate = formatRaceDate(selectedRace.endDate);
    dateLabel = "Race Concluded:";
  } else if (finalCountdown.status === "in-progress") {
    if (localCompetitionInfo?.date) {
      displayDate = formatRaceDate(localCompetitionInfo.date);
      // Check if this is current or next session
      const now = new Date();
      const sessionTime = new Date(localCompetitionInfo.date);
      const sessionEndTime = new Date(sessionTime.getTime() + 2 * 60 * 60 * 1000); // Assume 2 hour sessions
      
      if (now >= sessionTime && now <= sessionEndTime) {
        dateLabel = "Current Session:";
      } else if (sessionTime > now) {
        dateLabel = "Next Session:";
      } else {
        dateLabel = "Session:";
      }
    } else {
      displayDate = formatRaceDate(selectedRace.date);
      dateLabel = "Race Weekend:";
    }
  } else {
    displayDate = formatRaceDate(selectedRace.date);
    dateLabel = "";
  }
  
  // Base race info
  let raceInfoHtml = `
    <div class="race-info-block">
      <div class="race-name">${selectedRace.shortName}</div>
      <div class="race-circuit">${selectedRace.venue || 'Circuit TBD'}</div>
      ${dateLabel ? `<div class="race-date-label" style="font-size: 0.9rem; color: #ccc; margin-bottom: 5px;">${dateLabel}</div>` : ''}
      <div class="race-date">${displayDate}</div>
    </div>
    <div class="countdown-center">
      <div class="countdown-title">${finalCountdown.status === "upcoming" ? "RACE STARTS IN" : finalCountdown.nextSession ? "NEXT SESSION IN" : ""}</div>
      <div class="countdown-timer">${finalCountdown.display}</div>
      ${finalCountdown.status === "in-progress" && localCompetitionInfo ? 
        `<div class="current-competition">${localCompetitionInfo.name}</div>` : 
        ''
      }
      <div class="countdown-units">
        ${finalCountdown.units.length > 0 ? finalCountdown.units.map(unit => `<div class="countdown-unit">${unit}</div>`).join('') : ''}
      </div>
    </div>
    <div class="race-info-block">
      ${selectedRace.countryFlag ? `<img src="${selectedRace.countryFlag}" alt="Country Flag" class="race-flag">` : ''}
      <div style="margin-top: 10px; font-size: 1.2rem; font-weight: bold;">${selectedRace.abbreviation}</div>
    </div>
  `;
  
  // If race is finished, add winner information
  if (countdown.status === "finished") {
    const raceId = getQueryParam('raceId');
    if (raceId) {
      const winnerInfo = await fetchRaceWinner(raceId);
      if (winnerInfo) {
        raceInfoHtml = raceInfoHtml.replace(
          '<div class="countdown-units">',
          `<div class="race-winner-info" style="margin-top: 15px;">
            <div style="color: ${winnerInfo.teamColor}; font-size: 1.4rem; font-weight: bold; text-shadow: 1px 1px 3px white;">
              ${winnerInfo.winner} - ${winnerInfo.winnerTime} <br> ${winnerInfo.winnerTeam}
            </div>
          </div>
          <div class="countdown-units">`
        );
      }
    }
  }
  
  container.innerHTML = raceInfoHtml;

  // Add stream embed after topRaceInfo - F1 has 24/7 stream so always show it
  const streamContainer = document.getElementById("streamEmbed");
  console.log('F1 Stream check:', { streamContainer: !!streamContainer, streamInitialized, raceName: selectedRace.name || selectedRace.shortName });
  
  if (!streamContainer && !streamInitialized) {
    console.log('F1 Creating stream container and initializing stream...');
    const raceDetailsDiv = document.getElementById("raceDetails");
    if (raceDetailsDiv) {
      const streamDiv = document.createElement("div");
      streamDiv.id = "streamEmbed";
      streamDiv.innerHTML = renderStreamEmbed(selectedRace.name || selectedRace.shortName);
      raceDetailsDiv.parentNode.insertBefore(streamDiv, raceDetailsDiv);
      streamInitialized = true; // Set flag after successful initialization
      console.log('F1 Stream initialized successfully');
    } else {
      console.error('F1 raceDetails div not found!');
    }
  } else {
    console.log('F1 Stream container exists or already initialized');
  }

  // Start countdown timer only for upcoming races
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
  
  if (countdown.status === "upcoming") {
    countdownInterval = setInterval(updateCountdown, 1000);
  }

  // Render circuit information
  renderCircuitInfo();
  
  // Render competition results for in-progress or finished races in raceStats section
  if (countdown.status === "in-progress" || countdown.status === "finished") {
    const raceId = getQueryParam('raceId');
    if (raceId) {
      await updateRaceResults(raceId);
      
      // Set up automatic updates using MLB-style approach
      if (resultsUpdateInterval) {
        clearInterval(resultsUpdateInterval);
      }
      
      if (countdown.status === "in-progress") {
        // Update every 2 seconds for live timing (same as MLB)
        resultsUpdateInterval = setInterval(() => {
          updateRaceResults(raceId);
        }, 2000);
      } else if (countdown.status === "finished") {
        // Update every 30 seconds for finished races
        resultsUpdateInterval = setInterval(() => {
          updateRaceResults(raceId);
        }, 30000);
      }
    }
  } else {
    // For upcoming races, stop any existing updates and hide the stats section
    if (resultsUpdateInterval) {
      clearInterval(resultsUpdateInterval);
      resultsUpdateInterval = null;
    }
    const statsContainer = document.getElementById("raceStats");
    if (statsContainer) {
      statsContainer.innerHTML = '';
      statsContainer.style.display = 'none';
    }
  }
}

async function updateRaceResults(raceId) {
  try {
    const statsContainer = document.getElementById("raceStats");
    if (!statsContainer) {
      console.error("Error: Element with ID 'raceStats' not found.");
      return;
    }

    // Show loading on first load only
    if (!statsContainer.innerHTML || statsContainer.innerHTML.includes('Loading')) {
      statsContainer.innerHTML = '<div class="loading">Loading race results...</div>';
      statsContainer.style.display = 'block';
    }
    
    // Clear cache for live updates to ensure fresh data (like MLB approach)
    const cacheKey = `results_${raceId}`;
    delete competitionResultsCache[cacheKey];
    delete cacheExpiry[cacheKey];
    
    // Use fetchCompetitionResults instead of fetchLiveStatistics to get all available results
    const competitions = await fetchCompetitionResults(raceId);
    if (competitions) {
      const newResultsHtml = renderCompetitionResults(competitions);
      
      // Only update if content has changed to avoid flickering (like MLB)
      if (statsContainer.innerHTML !== newResultsHtml) {
        // Store current active tab and scroll position before updating
        const activeTab = statsContainer.querySelector('.competition-tab.active');
        const activeCompetition = activeTab ? activeTab.dataset.competition : null;

        // Store scroll position of the results table container
        const resultsTableContainer = statsContainer.querySelector('.results-table-container');
        const scrollLeft = resultsTableContainer ? resultsTableContainer.scrollLeft : 0;

        statsContainer.innerHTML = newResultsHtml;

        // Restore scroll position after updating (use requestAnimationFrame for better reliability)
        if (resultsTableContainer && scrollLeft > 0) {
          requestAnimationFrame(() => {
            const newResultsTableContainer = statsContainer.querySelector('.results-table-container');
            if (newResultsTableContainer) {
              newResultsTableContainer.scrollLeft = scrollLeft;
            }
          });
        }

        // Restore active tab if it still exists
        if (activeCompetition) {
          const newActiveTab = statsContainer.querySelector(`[data-competition="${activeCompetition}"]`);
          const newActiveContent = statsContainer.querySelector(`[data-competition="${activeCompetition}"].competition-content`);
          
          if (newActiveTab && newActiveContent) {
            // Remove active class from all tabs and contents
            statsContainer.querySelectorAll('.competition-tab').forEach(tab => tab.classList.remove('active'));
            statsContainer.querySelectorAll('.competition-content').forEach(content => content.style.display = 'none');
            
            // Set the previously active tab as active
            newActiveTab.classList.add('active');
            newActiveContent.style.display = 'block';
          }
        }
        
        // Re-add event listeners for competition tabs
        const tabButtons = statsContainer.querySelectorAll('.competition-tab');
        const tabContents = statsContainer.querySelectorAll('.competition-content');
        
        tabButtons.forEach(button => {
          button.addEventListener('click', () => {
            const targetCompetition = button.dataset.competition;
            
            // Update button states
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Update content visibility
            tabContents.forEach(content => {
              if (content.dataset.competition === targetCompetition) {
                content.style.display = 'block';
              } else {
                content.style.display = 'none';
              }
            });
          });
        });
      }
    } else {
      // If no competitions data, show appropriate message
      if (statsContainer.innerHTML.includes('Loading')) {
        statsContainer.innerHTML = '<div class="loading">No race results available yet</div>';
      }
    }
  } catch (error) {
    console.error('Error updating race results:', error);
    // Don't replace content on error to avoid clearing valid data (like MLB approach)
  }
}

async function initializeRaceInfo() {
  try {
    const container = document.getElementById("topRaceInfo");
    if (container) {
      container.innerHTML = '<div class="loading">Loading race information...</div>';
    }

    await fetchRaceInfo();
    await renderRaceInfo(); // Make sure this completes before setting up intervals
  } catch (error) {
    console.error("Error initializing race info:", error);
    const container = document.getElementById("topRaceInfo");
    if (container) {
      container.innerHTML = '<div class="error">Error loading race information. Please try again later.</div>';
    }
  }
}

// Initialize when page loads - exactly like MLB
document.addEventListener('DOMContentLoaded', initializeRaceInfo);

// Clean up intervals when page unloads - exactly like MLB
window.addEventListener('beforeunload', () => {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
  
  if (resultsUpdateInterval) {
    clearInterval(resultsUpdateInterval);
  }
  
  // Clean up any blob URLs we created
  if (circuitInfo?.diagramUrl && circuitInfo.diagramUrl.startsWith('blob:')) {
    URL.revokeObjectURL(circuitInfo.diagramUrl);
  }
  
  // Clear cache
  competitionResultsCache = {};
  cacheExpiry = {};
});
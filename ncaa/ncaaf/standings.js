const CONFERENCES = {
  "AP 25": { groupId: "T25", name: "TOP 25" },
  "American": { groupId: "151", name: "American Athletic Conference", code: "american" },
  "ACC": { groupId: "1", name: "ACC", code: "acc" },
  "Big 12": { groupId: "4", name: "Big 12 Conference", code: "big_12" },
  "Big Ten": { groupId: "5", name: "Big Ten Conference", code: "big_ten" },
  "CUSA": { groupId: "12", name: "Conference USA", code: "conference_usa" },
  "Independents": { groupId: "18", name: "FBS Independents", code: "fbs_independents" },
  "MAC": { groupId: "15", name: "Mid-American Conference", code: "mid_american" },
  "Mountain West": { groupId: "17", name: "Mountain West Conference", code: "mountain_west" },
  "PAC-12": { groupId: "9", name: "Pac-12 Conference", code: "pac_12" },
  "SEC": { groupId: "8", name: "Southeastern Conference", code: "sec" },
  "Sun Belt": { groupId: "37", name: "Sun Belt Conference", code: "sun_belt" }
};

let currentConference = localStorage.getItem("currentConference") || "T25"; // Default to T25
let currentSeason = localStorage.getItem("currentSeason") || "2025"; // Default to 2025
let currentWeek = "1"; // Will be determined dynamically
let lastStandingsHash = null;
let rankingsCache = {}; // Cache for team rankings: {teamId: rank}
let championshipWinners = {}; // Cache for conference championship winners: {conferenceGroupId: winnerId}

// Function to determine the current week based on date
async function determineCurrentWeek() {
  try {
    // Convert current time to EST for proper comparison with API dates
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    
    // Check cache first
    const cacheKey = `current_week_${currentSeason}`;
    const cachedWeek = localStorage.getItem(cacheKey);
    const cacheTimestamp = localStorage.getItem(`${cacheKey}_timestamp`);
    
    // Use cached week if it's less than 1 hour old
    if (cachedWeek && cacheTimestamp) {
      const hoursSinceCache = (Date.now() - parseInt(cacheTimestamp)) / (1000 * 60 * 60);
      if (hoursSinceCache < 1) {
        return cachedWeek;
      }
    }
    
    // Fetch all weeks for the current season
    const weeksUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${currentSeason}/types/2/weeks?lang=en&region=us`;
    const weeksResponse = await fetch(convertToHttps(weeksUrl));
    const weeksData = await weeksResponse.json();
    
    if (!weeksData.items) {
      return "1"; // fallback
    }
    
    // Fetch date ranges for each week and find current week
    let currentWeekNum = "1";
    let latestWeekWithData = "1";
    
    for (const weekRef of weeksData.items) {
      try {
        const weekUrl = weekRef.$ref;
        const weekResponse = await fetch(convertToHttps(weekUrl));
        const weekData = await weekResponse.json();
        
        if (weekData.startDate && weekData.endDate) {
          // Convert API dates to EST for proper comparison
          const startDate = new Date(new Date(weekData.startDate).toLocaleString("en-US", { timeZone: "America/New_York" }));
          const endDate = new Date(new Date(weekData.endDate).toLocaleString("en-US", { timeZone: "America/New_York" }));
          const weekNumber = weekData.number.toString();
          
          // Track the latest week that has started (for fallback)
          if (now >= startDate) {
            latestWeekWithData = weekNumber;
          }
          
          // Check if current date falls within this week
          if (now >= startDate && now <= endDate) {
            currentWeekNum = weekNumber;
            break;
          }
        }
      } catch (error) {
        console.log(`Could not fetch data for week: ${weekRef.$ref}`, error);
      }
    }
    
    // If we're past all regular season weeks, use the latest week
    if (currentWeekNum === "1" && latestWeekWithData !== "1") {
      currentWeekNum = latestWeekWithData;
    }
    
    // Cache the result
    localStorage.setItem(cacheKey, currentWeekNum);
    localStorage.setItem(`${cacheKey}_timestamp`, Date.now().toString());
    
    console.log(`Determined current week: ${currentWeekNum} for season ${currentSeason}`);
    return currentWeekNum;
    
  } catch (error) {
    console.error("Error determining current week:", error);
    return "1"; // fallback
  }
}

// Initialize current week
async function initializeCurrentWeek() {
  const determinedWeek = await determineCurrentWeek();
  const storedWeek = localStorage.getItem("currentWeek");
  
  // Use stored week if user has manually selected one, otherwise use determined week
  currentWeek = storedWeek || determinedWeek;
  
  console.log(`Initialized current week: ${currentWeek} (determined: ${determinedWeek}, stored: ${storedWeek})`);
}

// Convert HTTP URLs to HTTPS to avoid mixed content issues
function convertToHttps(url) {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

async function cacheCurrentRankings() {
  try {
    // Check if we already have cached rankings for the current week/season
    const cacheKey = `rankings_${currentSeason}_${currentWeek}`;
    const cachedData = localStorage.getItem(cacheKey);
    const cacheTimestamp = localStorage.getItem(`${cacheKey}_timestamp`);
    
    // Use cached data if it's less than 5 minutes old
    if (cachedData && cacheTimestamp) {
      const age = Date.now() - parseInt(cacheTimestamp);
      if (age < 5 * 60 * 1000) { // 5 minutes
        rankingsCache = JSON.parse(cachedData);
        console.log(`Using cached rankings for ${Object.keys(rankingsCache).length} teams`);
        return;
      }
    }

    // Always fetch the latest T25 rankings to cache them
    let seasonType = "2"; // Default to regular season
    let weekNum = currentWeek;
    
    // For Week 1, check if it's preseason
    if (currentWeek === "1") {
      seasonType = "1";
    } else if (currentWeek === "17") {
      seasonType = "3";
      weekNum = "1";
    }

    let RANKINGS_URL = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${currentSeason}/types/${seasonType}/weeks/${weekNum}/rankings/1?lang=en&region=us`;
    
    let response = await fetch(convertToHttps(RANKINGS_URL));
    
    // If preseason fails for week 1, try regular season
    if (!response.ok && seasonType === "1") {
      seasonType = "2";
      RANKINGS_URL = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${currentSeason}/types/${seasonType}/weeks/${weekNum}/rankings/1?lang=en&region=us`;
      response = await fetch(convertToHttps(RANKINGS_URL));
    }
    
    if (response.ok) {
      const data = await response.json();
      
      if (data && data.ranks) {
        // Clear previous cache
        rankingsCache = {};
        
        // Cache team rankings
        for (const rank of data.ranks) {
          if (rank.team && rank.team.$ref) {
            // Extract team ID from the $ref URL
            const teamIdMatch = rank.team.$ref.match(/teams\/(\d+)/);
            if (teamIdMatch) {
              const teamId = teamIdMatch[1];
              rankingsCache[teamId] = rank.current;
            }
          }
        }
        
        console.log(`Cached rankings for ${Object.keys(rankingsCache).length} teams`);
        
        // Save to localStorage with timestamp
        const cacheKey = `rankings_${currentSeason}_${currentWeek}`;
        localStorage.setItem(cacheKey, JSON.stringify(rankingsCache));
        localStorage.setItem(`${cacheKey}_timestamp`, Date.now().toString());
      }
    }
  } catch (error) {
    console.error("Error caching rankings:", error);
  }
}

async function cacheChampionshipWinners() {
  try {
    // Check if we already have cached championship winners for the current season
    const cacheKey = `championship_winners_${currentSeason}`;
    const cachedData = localStorage.getItem(cacheKey);
    const cacheTimestamp = localStorage.getItem(`${cacheKey}_timestamp`);
    
    // Use cached data if it's less than 5 minutes old
    if (cachedData && cacheTimestamp) {
      const age = Date.now() - parseInt(cacheTimestamp);
      if (age < 5 * 60 * 1000) { // 5 minutes
        championshipWinners = JSON.parse(cachedData);
        console.log(`✅ Using cached championship winners for ${Object.keys(championshipWinners).length} conferences`);
        console.log(`📋 Loaded championship winners from cache:`, JSON.stringify(championshipWinners, null, 2));
        return;
      } else {
        console.log(`⏰ Cache expired (age: ${Math.round(age/1000)}s), fetching fresh data`);
      }
    } else {
      console.log(`💾 No valid cache found, fetching fresh championship data`);
    }

    // Clear previous cache
    championshipWinners = {};

    // Get Week 15 date range from calendar - use SEC (group 8) as reference since it's reliable
    const calendarResponse = await fetch(convertToHttps(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=8&dates=${currentSeason}0801`));
    const calendarData = await calendarResponse.json();
    
    let week15StartDate = null;
    let week15EndDate = null;
    
    if (calendarData.leagues && calendarData.leagues[0] && calendarData.leagues[0].calendar) {
      const calendar = calendarData.leagues[0].calendar;
      const regularSeason = calendar.find(season => season.value === "2");
      
      if (regularSeason && regularSeason.entries) {
        const week15 = regularSeason.entries.find(week => week.value === "15");
        if (week15) {
          // Extract date in YYYYMMDD format from "2024-12-02T08:00Z"
          week15StartDate = week15.startDate.substring(0, 10).replace(/-/g, '');
          week15EndDate = week15.endDate.substring(0, 10).replace(/-/g, '');
          console.log(`Found Week 15 dates from calendar: ${week15StartDate} to ${week15EndDate}`);
        }
      }
    }

    if (!week15StartDate || !week15EndDate) {
      console.log("Could not find Week 15 dates, using default range for 2024 season");
      // Use previous season championship dates as fallback
      week15StartDate = "20241202";
      week15EndDate = "20241209";
    }

    console.log(`Checking for championship games in Week 15: ${week15StartDate}-${week15EndDate}`);

    // Check each conference for championship games (excluding T25, Independents, and PAC-12)
    const conferencesToCheck = Object.entries(CONFERENCES).filter(([name, conf]) => 
      !["AP 25", "Independents", "PAC-12"].includes(name)
    );

    console.log(`Conferences to check for championships:`, conferencesToCheck.map(([name, conf]) => `${name} (${conf.groupId})`));

    for (const [confName, confData] of conferencesToCheck) {
      try {
        const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=${confData.groupId}&dates=${week15StartDate}-${week15EndDate}`;
        console.log(`🔍 Checking ${confName} (${confData.groupId}) championship: ${scoreboardUrl}`);
        const scoreboardResponse = await fetch(convertToHttps(scoreboardUrl));
        const scoreboardData = await scoreboardResponse.json();
        
        // Special debugging for CUSA (group 12)
        if (confData.groupId === "12") {
          console.log(`🔬 SPECIAL DEBUG for CUSA (group 12):`, {
            url: scoreboardUrl,
            responseStatus: scoreboardResponse.status,
            responseOk: scoreboardResponse.ok,
            fullData: scoreboardData,
            eventsFound: scoreboardData.events?.length || 0
          });
        }

        console.log(`📊 ${confName} scoreboard data:`, {
          events: scoreboardData.events?.length || 0,
          eventDetails: scoreboardData.events?.map(e => ({
            name: e.name,
            week: e.week?.number,
            hasCompetitors: e.competitions?.[0]?.competitors?.length
          })) || []
        });

        if (scoreboardData.events && scoreboardData.events.length > 0) {
          // Week 15 only has one game per conference and it's always the championship
          // So just use the first (and only) game
          const event = scoreboardData.events[0];
          const competition = event.competitions[0];
          
          console.log(`🏈 ${confName} - Week 15 Game: ${event.name}, Week: ${event.week?.number}, Type: ${competition.type?.abbreviation}`);
          
          // Verify this has competitors (don't require Week 15 check since not all conferences use it)
          if (competition.competitors && competition.competitors.length >= 2) {
            
            // Find the winner
            const winner = competition.competitors.find(competitor => competitor.winner === true);
            
            if (winner && winner.team) {
              championshipWinners[confData.groupId] = winner.team.id;
              console.log(`🏆 ${confName} Championship Winner: ${winner.team.displayName} (ID: ${winner.team.id})`);
              console.log(`📝 Cached to group ${confData.groupId}:`, {
                conferenceGroup: confData.groupId,
                winnerTeamId: winner.team.id,
                currentChampionshipWinners: JSON.stringify(championshipWinners)
              });
            } else {
              console.log(`⏳ ${confName} championship game found but no winner determined yet`);
              console.log(`   Competitors:`, competition.competitors.map(c => ({
                team: c.team?.displayName,
                score: c.score,
                winner: c.winner
              })));
            }
          } else {
            console.log(`❌ ${confName} - Game found but missing competitors`);
          }
        } else {
          console.log(`📅 No Week 15 championship game found for ${confName}`);
          
          // For conferences without championship games, try to get the current standings leader
          console.log(`   ${confName} likely doesn't have a championship game - attempting to get standings leader`);
          
          try {
            const standingsUrl = `https://site.api.espn.com/apis/v2/sports/football/college-football/standings?group=${confData.groupId}&season=${currentSeason}`;
            console.log(`📊 Fetching ${confName} standings: ${standingsUrl}`);
            
            const standingsResponse = await fetch(convertToHttps(standingsUrl));
            const standingsData = await standingsResponse.json();
            
            if (standingsData.standings && standingsData.standings.length > 0) {
              // Look for conference standings
              const conferenceStandings = standingsData.standings.find(s => 
                s.type === "conference" || s.name?.toLowerCase().includes("conference")
              ) || standingsData.standings[0]; // Fallback to first standings
              
              if (conferenceStandings.entries && conferenceStandings.entries.length > 0) {
                const leader = conferenceStandings.entries[0]; // First team = leader
                if (leader.team) {
                  championshipWinners[confData.groupId] = leader.team.id;
                  console.log(`🏆 ${confName} Regular Season Winner: ${leader.team.displayName} (ID: ${leader.team.id})`);
                }
              }
            }
          } catch (standingsError) {
            console.error(`❌ Error fetching ${confName} standings:`, standingsError);
          }
        }
      } catch (error) {
        console.error(`Error checking championship for ${confName}:`, error);
      }
    }

    console.log(`Cached championship winners for ${Object.keys(championshipWinners).length} conferences`);
    console.log(`Final championship winners object before caching:`, JSON.stringify(championshipWinners, null, 2));
    
    // Save to localStorage with timestamp
    localStorage.setItem(cacheKey, JSON.stringify(championshipWinners));
    localStorage.setItem(`${cacheKey}_timestamp`, Date.now().toString());
    
    console.log(`✅ Saved championship winners to localStorage:`, {
      cacheKey,
      savedData: localStorage.getItem(cacheKey),
      timestamp: localStorage.getItem(`${cacheKey}_timestamp`)
    });
    
  } catch (error) {
    console.error("Error caching championship winners:", error);
  }
}

async function fetchStandings() {
  try {
    // Start caching operations in background but don't wait for them to complete before showing standings
    const cachingPromise = Promise.all([
      cacheCurrentRankings(),
      cacheChampionshipWinners()
    ]);
    
    if (currentConference === "T25") {
      await fetchRankings();
      // Cache in background without blocking
      cachingPromise.catch(error => console.error("Background caching failed:", error));
      return;
    }

    // Try postseason standings first (types/3/), fallback to regular season (types/2/)
    let STANDINGS_URL = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${currentSeason}/types/3/groups/${currentConference}/standings/1?lang=en&region=us`;
    let response = await fetch(convertToHttps(STANDINGS_URL));
    let standingsText = await response.text();
    let data = JSON.parse(standingsText);

    // If postseason has no standings data, try regular season
    if (!data.standings) {
      STANDINGS_URL = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${currentSeason}/types/2/groups/${currentConference}/standings/1?lang=en&region=us`;
      response = await fetch(convertToHttps(STANDINGS_URL));
      standingsText = await response.text();
      data = JSON.parse(standingsText);
    }
    
    const newHash = hashString(standingsText);

    if (newHash === lastStandingsHash) {
      return; // No changes, skip update
    }
    lastStandingsHash = newHash;

    // Show loading indicator only when we have new data to process
    const container = document.getElementById("standingsContainer");
    if (container) {
      container.innerHTML = '<div style="text-align: center; padding: 20px; color: #777;">Loading standings...</div>';
    }
    
    if (data && data.standings) {
      await renderStandings(data.standings);
      
      // Update the header to reflect the current conference and season
      const header = document.querySelector("#standings h2");
      const currentConferenceName = Object.keys(CONFERENCES).find(
        confName => CONFERENCES[confName].groupId === currentConference
      );
      if (header) {
        header.textContent = `${CONFERENCES[currentConferenceName]?.name || "NCAA Football"} Standings - ${currentSeason}`;
      }
    }

    // Save the current conference and season to localStorage
    localStorage.setItem("currentConference", currentConference);
    localStorage.setItem("currentSeason", currentSeason);
    if (currentConference === "T25") {
      localStorage.setItem("currentWeek", currentWeek);
    }

    // Finish caching operations in background
    await cachingPromise.catch(error => console.error("Background caching failed:", error));
  } catch (error) {
    console.error(`Error fetching standings for conference ${currentConference} season ${currentSeason}:`, error);
  }
}

async function fetchRankings() {
  try {
    // Determine the season type (1 for preseason, 2 for regular season, 3 for postseason)
    let seasonType = "2"; // Default to regular season
    let weekNum = currentWeek;
    
    // For Week 1, check if it's preseason
    if (currentWeek === "1") {
      // Try preseason first
      seasonType = "1";
    } else if (currentWeek === "17") {
      // Final Rankings use postseason
      seasonType = "3";
      weekNum = "1";
    }

    let RANKINGS_URL = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${currentSeason}/types/${seasonType}/weeks/${weekNum}/rankings/1?lang=en&region=us`;
    
    let response = await fetch(convertToHttps(RANKINGS_URL));
    
    // If preseason fails for week 1, try regular season
    if (!response.ok && seasonType === "1") {
      seasonType = "2";
      RANKINGS_URL = `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${currentSeason}/types/${seasonType}/weeks/${weekNum}/rankings/1?lang=en&region=us`;
      response = await fetch(convertToHttps(RANKINGS_URL));
    }
    
    const rankingsText = await response.text();
    const newHash = hashString(rankingsText);

    if (newHash === lastStandingsHash) {
      return; // No changes, skip update
    }
    lastStandingsHash = newHash;

    // Show loading indicator only when we have new data to process
    const container = document.getElementById("standingsContainer");
    if (container) {
      container.innerHTML = '<div style="text-align: center; padding: 20px; color: #777;">Loading rankings...</div>';
    }

    const data = JSON.parse(rankingsText);
    
    if (data && data.ranks) {
      // Cache the rankings when viewing T25
      rankingsCache = {};
      for (const rank of data.ranks) {
        if (rank.team && rank.team.$ref) {
          const teamIdMatch = rank.team.$ref.match(/teams\/(\d+)/);
          if (teamIdMatch) {
            const teamId = teamIdMatch[1];
            rankingsCache[teamId] = rank.current;
          }
        }
      }
      
      await renderRankings(data.ranks, data);
      
      // Update the header to reflect the current rankings
      const header = document.querySelector("#standings h2");
      if (header) {
        const weekDisplay = getWeekDisplayName(currentWeek);
        header.textContent = `${data.name || "AP TOP 25"} - ${currentSeason} ${weekDisplay}`;
      }
    }

    // Save the current week to localStorage
    localStorage.setItem("currentWeek", currentWeek);
  } catch (error) {
    console.error(`Error fetching rankings for week ${currentWeek} season ${currentSeason}:`, error);
  }
}

function getWeekDisplayName(week) {
  if (week === "1") return "Preseason";
  if (week === "17") return "Final Rankings";
  return `Week ${week}`;
}

async function renderStandings(standings) {
  const container = document.getElementById("standingsContainer");
  if (!container) {
    console.error("Container with ID 'standingsContainer' not found.");
    return;
  }

  container.innerHTML = ""; // Clear previous content

  const isSmallScreen = window.innerWidth < 525;

  const table = document.createElement("table");
  table.className = "division-table";

  // Add table headers
  const headers = `
    <thead>
      <tr>
        <th>Team</th>
        <th>CONF</th>
        <th>W-L</th>
        <th>${isSmallScreen ? "S" : "Streak"}</th>
        <th>PCT</th> 
        <th>${isSmallScreen ? "vs AP" : "vs. AP Top 25"}</th>
      </tr>
    </thead>
  `;
  table.innerHTML = headers;

  // Add table body
  const tbody = document.createElement("tbody");

  // Fetch all team data in parallel with timeout and error handling for better performance
  const FETCH_TIMEOUT = 2000; // 2 second timeout per request
  
  const teamDataPromises = standings.map(async (standing, index) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      
      const teamResponse = await fetch(convertToHttps(standing.team.$ref), { 
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      
      if (!teamResponse.ok) {
        throw new Error(`HTTP ${teamResponse.status}`);
      }
      
      const teamData = await teamResponse.json();
      return { standing, teamData, index };
    } catch (error) {
      console.warn(`Failed to fetch team data for standing ${index}:`, error);
      // Return basic data from the standing itself as fallback
      return { 
        standing, 
        teamData: {
          id: standing.team.id || `fallback_${index}`,
          displayName: standing.team.displayName || "Unknown Team",
          abbreviation: standing.team.abbreviation || "UNK"
        }, 
        index,
        fallback: true 
      };
    }
  });

  // Wait for all team data with a global timeout
  const teamResults = await Promise.all(teamDataPromises);

  // Sort teams by conference record first, then by overall record
  teamResults.sort((a, b) => {
    if (!a || !b) return 0;
    
    // Get records for both teams
    const aOverall = a.standing.records.find(record => record.name === "overall");
    const bOverall = b.standing.records.find(record => record.name === "overall");
    const aConf = a.standing.records.find(record => record.name === "vs. Conf.");
    const bConf = b.standing.records.find(record => record.name === "vs. Conf.");
    
    // Helper function to parse record string (e.g., "3-1" -> {wins: 3, losses: 1})
    const parseRecord = (recordStr) => {
      if (!recordStr || recordStr === "0-0" || recordStr === "--") return { wins: 0, losses: 0, total: 0 };
      const parts = recordStr.split('-');
      const wins = parseInt(parts[0]) || 0;
      const losses = parseInt(parts[1]) || 0;
      return { wins, losses, total: wins + losses };
    };
    
    // Parse conference records
    const aConfRecord = parseRecord(aConf?.summary);
    const bConfRecord = parseRecord(bConf?.summary);
    const aOverallRecord = parseRecord(aOverall?.summary);
    const bOverallRecord = parseRecord(bOverall?.summary);
    
    // Check if both teams have conference games played
    const aHasConfGames = aConfRecord.total > 0;
    const bHasConfGames = bConfRecord.total > 0;
    
    // If both have conference records, sort by conference record
    if (aHasConfGames && bHasConfGames) {
      // First by conference win percentage
      const aConfPct = aConfRecord.total > 0 ? aConfRecord.wins / aConfRecord.total : 0;
      const bConfPct = bConfRecord.total > 0 ? bConfRecord.wins / bConfRecord.total : 0;
      
      if (aConfPct !== bConfPct) {
        return bConfPct - aConfPct; // Higher percentage first
      }
      
      // If conference percentages are equal, sort by conference wins
      if (aConfRecord.wins !== bConfRecord.wins) {
        return bConfRecord.wins - aConfRecord.wins; // More wins first
      }
      
      // If conference records are identical, fall back to overall record
      const aOverallPct = aOverallRecord.total > 0 ? aOverallRecord.wins / aOverallRecord.total : 0;
      const bOverallPct = bOverallRecord.total > 0 ? bOverallRecord.wins / bOverallRecord.total : 0;
      
      if (aOverallPct !== bOverallPct) {
        return bOverallPct - aOverallPct; // Higher overall percentage first
      }
      
      return bOverallRecord.wins - aOverallRecord.wins; // More overall wins first
    }
    
    // If only one has conference games, prioritize that team
    if (aHasConfGames && !bHasConfGames) return -1;
    if (!aHasConfGames && bHasConfGames) return 1;
    
    // If neither has conference games, sort by overall record
    const aOverallPct = aOverallRecord.total > 0 ? aOverallRecord.wins / aOverallRecord.total : 0;
    const bOverallPct = bOverallRecord.total > 0 ? bOverallRecord.wins / bOverallRecord.total : 0;
    
    if (aOverallPct !== bOverallPct) {
      return bOverallPct - aOverallPct; // Higher percentage first
    }
    
    return bOverallRecord.wins - aOverallRecord.wins; // More wins first
  });

  // Process each team result
  for (const result of teamResults) {
    if (!result) continue;
    
    const { standing, teamData, fallback } = result;
    try {
      
      // Get overall record from records array
      const overallRecord = standing.records.find(record => record.name === "overall");
      const conferenceRecord = standing.records.find(record => record.name === "vs. Conf.");
      const apRecord = standing.records.find(record => record.name === "vs AP Top 25");
      if (!overallRecord) continue;

      const row = document.createElement("tr");

      const teamName = isSmallScreen ? teamData.abbreviation : teamData.displayName;
      // Use fallback logo URL if team data fetch failed
      const logoUrl = fallback ? 
        'football.png' : 
        convertToHttps(`https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${teamData.id}.png`);
      
      // Check if team is ranked in TOP 25 (only if we have cached rankings)
      const teamRank = rankingsCache[teamData.id];
      
      // Check if team is a conference championship winner (only if we have cached data)
      const isChampionshipWinner = Object.values(championshipWinners).includes(teamData.id) || 
                                   Object.values(championshipWinners).includes(teamData.id.toString()) ||
                                   Object.values(championshipWinners).includes(parseInt(teamData.id));
      
      const displayName = teamRank ? 
        `<span style="color: gold; font-weight: normal;">(${teamRank})</span> <span style="color: ${isChampionshipWinner ? "#ffd140" : "#ffffff"};">${teamName}</span>` : 
        `<span style="color: ${isChampionshipWinner ? "#ffd140" : "#ffffff"};">${teamName}</span>`;

      // Extract stats from the overall record
      const conf = conferenceRecord?.displayValue || "0-0";
      const record = overallRecord.displayValue || "0-0";
      const losses = overallRecord.stats.find(stat => stat.name === "losses")?.displayValue || "0";
      const ties = overallRecord.stats.find(stat => stat.name === "ties")?.displayValue || "0";
      const winPercent = overallRecord.stats.find(stat => stat.name === "winPercent")?.displayValue || ".000";
      const pointsFor = overallRecord.stats.find(stat => stat.name === "pointsFor")?.displayValue || "0";
      const pointsAgainst = overallRecord.stats.find(stat => stat.name === "pointsAgainst")?.displayValue || "0";
      const streak = overallRecord.stats.find(stat => stat.name === "streak")?.displayValue || "N/A";
      const ap = apRecord?.displayValue || "0-0";

      row.innerHTML = `
        <td class="team-name" data-team-hover>
          <img src="${logoUrl}" alt="${teamName} logo" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle;" onerror="this.src='football.png';">
          ${displayName}
        </td>
        <td>${conf}</td>
        <td>${record}</td>
        <td style="color: ${streak.startsWith("W") ? "green" : streak.startsWith("L") ? "red" : "grey"};">${streak}</td>
        <td>${winPercent}</td>
        <td>${ap}</td>
      `;

      // Create hover card
      const hoverCard = document.createElement("div");
      hoverCard.className = "team-hover-card";
      hoverCard.innerHTML = `
        <img src="${logoUrl}" alt="${teamName} logo" style="width: 50px; height: 50px; margin-bottom: 8px;" onerror="this.src='football.png';">
        <div style="font-weight: bold; color: ${isChampionshipWinner ? "#ffd140" : "#ffffff"};">
          ${teamData.displayName}
          ${isChampionshipWinner ? '<div style="color: #ffd140; font-size: 12px; font-weight: bold;">🏆 CONFERENCE CHAMPION</div>' : ''}
        </div>
        ${teamRank ? `<div style="color: gold; font-weight: bold;">AP Rank: #${teamRank}</div>` : ""}
        <br><div>Record: ${record}</div>
        <div>Points: ${pointsFor} - ${pointsAgainst}</div>
        <div>
          <span style="color: ${streak.startsWith("W") ? "green" : streak.startsWith("L") ? "red" : "grey"};">Streak: ${streak}</span>
        </div>
      `;

      // Append hover card to the body
      document.body.appendChild(hoverCard);

      // Add hover event listeners
      const teamNameCell = row.querySelector(".team-name");
      teamNameCell.addEventListener("mouseenter", () => {
        hoverCard.style.display = "block";
        const rect = teamNameCell.getBoundingClientRect();
        hoverCard.style.top = `${rect.top + window.scrollY-50}px`;
        hoverCard.style.left = `${rect.left + window.scrollX + teamNameCell.offsetWidth}px`;
      });

      teamNameCell.addEventListener("mouseleave", () => {
        hoverCard.style.display = "none";
      });

      // Add click handler to navigate to team page (if needed later)
      teamNameCell.style.cursor = 'pointer';
      teamNameCell.addEventListener('click', () => {
        console.log(`Team clicked: ${teamData.displayName}`);
      });

      tbody.appendChild(row);
    } catch (error) {
      console.error("Error fetching team data:", error);
    }
  }

  table.appendChild(tbody);
  container.appendChild(table);
}

async function renderRankings(ranks, rankingData) {
  const container = document.getElementById("standingsContainer");
  if (!container) {
    console.error("Container with ID 'standingsContainer' not found.");
    return;
  }

  container.innerHTML = ""; // Clear previous content

  const isSmallScreen = window.innerWidth < 525;

  const table = document.createElement("table");
  table.className = "division-table";

  // Add table headers for rankings
  const headers = `
    <thead>
      <tr>
        <th>Rank</th>
        <th>Team</th>
        <th>Record</th>
        <th>Points</th>
        ${!isSmallScreen ? "<th>FPV</th>" : ""}
        <th>Trend</th>
      </tr>
    </thead>
  `;
  table.innerHTML = headers;

  // Add table body
  const tbody = document.createElement("tbody");

  // Fetch all team data in parallel for better performance
  const teamDataPromises = ranks.map(async (rank) => {
    try {
      const teamResponse = await fetch(convertToHttps(rank.team.$ref));
      const teamData = await teamResponse.json();
      return { rank, teamData };
    } catch (error) {
      console.error("Error fetching team data for rankings:", error);
      return null;
    }
  });

  const teamResults = await Promise.all(teamDataPromises);

  // Process each ranking entry
  for (const result of teamResults) {
    if (!result) continue;
    
    const { rank, teamData } = result;
    try {

      const row = document.createElement("tr");

      const teamName = isSmallScreen ? teamData.abbreviation : teamData.displayName;
      const logoUrl = convertToHttps(`https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${teamData.id}.png`);

      // Check if team is a conference championship winner
      const isChampionshipWinner = Object.values(championshipWinners).includes(teamData.id) || 
                                   Object.values(championshipWinners).includes(teamData.id.toString()) ||
                                   Object.values(championshipWinners).includes(parseInt(teamData.id));
      
      console.log(`Rankings - Team: ${teamData.displayName} (ID: ${teamData.id}), Championship Winner: ${isChampionshipWinner}`);

      // Extract ranking data
      const ranking = rank.current;
      const record = rank.record?.summary || "0-0";
      const points = rank.points || 0;
      const firstPlaceVotes = rank.firstPlaceVotes || 0;
      const trend = rank.trend || "-";

      // Determine trend color
      let trendColor = "white";
      if (trend.startsWith("+")) {
        trendColor = "green";
      } else if (trend.startsWith("-") && trend !== "-") {
        trendColor = "red";
      }

      row.innerHTML = `
        <td style="font-weight: bold; color: white;">${ranking}</td>
        <td class="team-name" data-team-hover>
          <img src="${logoUrl}" alt="${teamName} logo" style="width: 20px; height: 20px; margin-right: 8px; vertical-align: middle;" onerror="this.src='football.png';">
          <span style="color: ${isChampionshipWinner ? "#ffd140" : "#ffffff"};">${teamName}</span>
        </td>
        <td>${record}</td>
        <td>${points}</td>
        ${!isSmallScreen ? `<td>${firstPlaceVotes > 0 ? `(${firstPlaceVotes})` : ""}</td>` : ""}
        <td style="color: ${trendColor}; font-weight: bold;">${trend}</td>
      `;

      // Create hover card
      const hoverCard = document.createElement("div");
      hoverCard.className = "team-hover-card";
      hoverCard.innerHTML = `
        <img src="${logoUrl}" alt="${teamName} logo" style="width: 50px; height: 50px; margin-bottom: 8px;" onerror="this.src='football.png';">
        <div style="font-weight: bold; color: ${isChampionshipWinner ? "#ffd140" : "#ffffff"};">
          ${teamData.displayName}
          ${isChampionshipWinner ? '<div style="color: #ffd140; font-size: 12px; font-weight: bold;">🏆 CONFERENCE CHAMPION</div>' : ''}
        </div>
        <br><div>Rank: #${ranking}</div>
        <div>Record: ${record}</div>
        <div>Points: ${points}</div>
        ${firstPlaceVotes > 0 ? `<div>First Place Votes: ${firstPlaceVotes}</div>` : ""}
        <div>Previous: ${rank.previous > 0 ? `#${rank.previous}` : "NR"}</div>
      `;

      // Append hover card to the body
      document.body.appendChild(hoverCard);

      // Add hover event listeners
      const teamNameCell = row.querySelector(".team-name");
      teamNameCell.addEventListener("mouseenter", () => {
        hoverCard.style.display = "block";
        const rect = teamNameCell.getBoundingClientRect();
        hoverCard.style.top = `${rect.top + window.scrollY-50}px`;
        hoverCard.style.left = `${rect.left + window.scrollX + teamNameCell.offsetWidth}px`;
      });

      teamNameCell.addEventListener("mouseleave", () => {
        hoverCard.style.display = "none";
      });

      // Add click handler to navigate to team page (if needed later)
      teamNameCell.style.cursor = 'pointer';
      teamNameCell.addEventListener('click', () => {
        console.log(`Team clicked: ${teamData.displayName}`);
      });

      tbody.appendChild(row);
    } catch (error) {
      console.error("Error fetching team data for rankings:", error);
    }
  }

  table.appendChild(tbody);
  container.appendChild(table);
}

function setupMobileScrolling(container) {
  // Remove any existing mobile styles first
  const existingStyle = document.getElementById("mobile-scroll-style");
  if (existingStyle) {
    existingStyle.remove();
  }

  // Add horizontal scroll styling for mobile devices
  if (window.innerWidth < 768) {
    // Hide scrollbar for webkit browsers and add mobile-specific styles
    const style = document.createElement("style");
    style.textContent = `
      .conference-buttons::-webkit-scrollbar {
        display: none;
      }
      @media (max-width: 767px) {
        .conference-buttons {
          overflow-x: auto !important;
          overflow-y: hidden !important;
          justify-content: flex-start !important;
          scroll-behavior: smooth;
          padding: 0 10px;
          -webkit-overflow-scrolling: touch;
          min-height: 50px;
        }
        .conference-button {
          flex-shrink: 0 !important;
          white-space: nowrap;
        }
      }
    `;
    style.id = "mobile-scroll-style";
    document.head.appendChild(style);
    
    // Apply container styles directly
    container.style.scrollbarWidth = "none"; // Firefox
    container.style.msOverflowStyle = "none"; // IE/Edge
  }
}

function setupConferenceButtons() {
  const conferenceContainer = document.getElementById("conferenceButtons");
  if (!conferenceContainer) {
    console.error("Error: Element with ID 'conferenceButtons' not found.");
    return;
  }

  conferenceContainer.innerHTML = ""; // Clear any existing content
  
  // Add horizontal scroll styling for mobile
  setupMobileScrolling(conferenceContainer);

  for (const [confName, confData] of Object.entries(CONFERENCES)) {
    const button = document.createElement("button");
    button.className = `conference-button ${currentConference === confData.groupId ? "active" : ""}`;
    
    // Create button content with both text and logo (similar to soccer)
    if (confName === "AP 25") {
      // T25 stays as text only
      button.innerHTML = `<span class="conference-text" style="font-weight: bold;">AP25</span>`;
    } else {
      // Other conferences get both text and logo
      const logoUrl = convertToHttps(`https://a.espncdn.com/i/teamlogos/ncaa_conf/500/${confData.code}.png`);
      button.innerHTML = `
        <span class="conference-text">${confName}</span>
        <img class="conference-logo" src="${logoUrl}" alt="${confName}" style="display: none;" onerror="this.style.display='none'; this.parentElement.querySelector('.conference-text').style.display='inline';">
      `;
    }
    
    button.addEventListener("click", () => {
      currentConference = confData.groupId;
      
      // Update button states immediately
      updateConferenceButtonDisplay();
      
      // For T25, use the determined current week instead of defaulting to 1
      if (confData.groupId === "T25") {
        // Re-determine the current week for rankings
        determineCurrentWeek().then(week => {
          currentWeek = localStorage.getItem("currentWeek") || week;
          setupSeasonSelector();
          fetchStandings();
        });
        return; // Exit early to avoid duplicate calls
      }
      
      // Update selectors to show/hide week selector
      setupSeasonSelector();
      
      fetchStandings();
    });
    
    conferenceContainer.appendChild(button);
  }

  updateConferenceButtonDisplay(); // Adjust button display based on screen size
}

function setupSeasonSelector() {
  const seasonContainer = document.getElementById("seasonSelector");
  if (!seasonContainer) {
    return; // Season selector is optional
  }

  seasonContainer.innerHTML = "";

  if (currentConference === "T25") {
    // Create both season and week selectors for TOP 25
    const seasonSelect = document.createElement("select");
    seasonSelect.className = "season-select";
    
    // Add seasons from 2020 to 2025
    for (let year = 2025; year >= 2020; year--) {
      const option = document.createElement("option");
      option.value = year.toString();
      option.textContent = year.toString();
      if (year.toString() === currentSeason) {
        option.selected = true;
      }
      seasonSelect.appendChild(option);
    }
    
    seasonSelect.addEventListener("change", (event) => {
      currentSeason = event.target.value;
      fetchStandings();
    });

    // Create week selector
    const weekSelect = document.createElement("select");
    weekSelect.className = "week-select";
    
    // Add Preseason (Week 1)
    const preseasonOption = document.createElement("option");
    preseasonOption.value = "1";
    preseasonOption.textContent = "Preseason";
    if (currentWeek === "1") preseasonOption.selected = true;
    weekSelect.appendChild(preseasonOption);
    
    // Add Weeks 2-16
    for (let week = 2; week <= 16; week++) {
      const option = document.createElement("option");
      option.value = week.toString();
      option.textContent = `Week ${week}`;
      if (week.toString() === currentWeek) {
        option.selected = true;
      }
      weekSelect.appendChild(option);
    }
    
    // Add Final Rankings (Week 17)
    const finalOption = document.createElement("option");
    finalOption.value = "17";
    finalOption.textContent = "Final Rankings";
    if (currentWeek === "17") finalOption.selected = true;
    weekSelect.appendChild(finalOption);
    
    weekSelect.addEventListener("change", (event) => {
      currentWeek = event.target.value;
      fetchStandings();
    });

    const seasonLabel = document.createElement("label");
    seasonLabel.textContent = "Season: ";
    seasonLabel.appendChild(seasonSelect);
    
    const weekLabel = document.createElement("label");
    weekLabel.textContent = " Week: ";
    weekLabel.appendChild(weekSelect);
    
    seasonContainer.appendChild(seasonLabel);
    seasonContainer.appendChild(weekLabel);
  } else {
    // Regular season selector for conferences
    const seasonSelect = document.createElement("select");
    seasonSelect.className = "season-select";
    
    // Add seasons from 2020 to 2025
    for (let year = 2025; year >= 2020; year--) {
      const option = document.createElement("option");
      option.value = year.toString();
      option.textContent = year.toString();
      if (year.toString() === currentSeason) {
        option.selected = true;
      }
      seasonSelect.appendChild(option);
    }
    
    seasonSelect.addEventListener("change", (event) => {
      currentSeason = event.target.value;
      fetchStandings();
    });
    
    const label = document.createElement("label");
    label.textContent = "Season: ";
    label.appendChild(seasonSelect);
    
    seasonContainer.appendChild(label);
  }
}

function updateConferenceButtonDisplay() {
  const isSmallScreen = window.innerWidth < 525;
  const conferenceContainer = document.getElementById("conferenceButtons");
  
  // Update mobile scrolling styles
  if (conferenceContainer) {
    setupMobileScrolling(conferenceContainer);
  }
  
  document.querySelectorAll(".conference-button").forEach(button => {
    const text = button.querySelector(".conference-text");
    const logo = button.querySelector(".conference-logo");
    
    // Toggle between text and logo based on screen size
    if (isSmallScreen && logo) {
      text.style.display = "none";
      logo.style.display = "inline";
    } else if (text) {
      text.style.display = "inline";
      if (logo) logo.style.display = "none";
    }
    
    // Update active state - find matching conference by groupId
    let isActive = false;
    for (const [confName, confData] of Object.entries(CONFERENCES)) {
      if (confData.groupId === currentConference) {
        // Check if this button matches the current conference
        const buttonText = text ? text.textContent : button.textContent;
        // Handle AP25 special case where button shows "AP25" but conference is "AP 25"
        if ((confName === "AP 25" && buttonText === "AP25") || buttonText === confName) {
          isActive = true;
          break;
        }
      }
    }
    
    if (isActive) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  });
}

window.addEventListener("resize", updateConferenceButtonDisplay);

// Initialize the app
async function initializeApp() {
  await initializeCurrentWeek();
  setupConferenceButtons();
  setupSeasonSelector();
  fetchStandings();
}

initializeApp();
setInterval(fetchStandings, 30000); // Poll every 30 seconds

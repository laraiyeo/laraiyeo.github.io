const CONFERENCES = {
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

let currentConference = localStorage.getItem("currentConference") || "151";

// Cache for team rankings: {teamId: rank}
let rankingsCache = {};

// Convert HTTP URLs to HTTPS to avoid mixed content issues
function convertToHttps(url) {
  if (url && url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
}

// Function to determine the current week based on date
async function determineCurrentWeek() {
  try {
    const currentSeason = new Date().getFullYear();
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
          // Convert UTC dates to EST for proper comparison
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

// Fetch and cache current AP25 rankings
async function cacheCurrentRankings() {
  try {
    const currentSeason = new Date().getFullYear();
    const currentWeek = await determineCurrentWeek(); // Use dynamic week determination
    
    // Check if we already have cached rankings
    const cacheKey = `rankings_${currentSeason}_${currentWeek}`;
    const cachedData = localStorage.getItem(cacheKey);
    const cacheTimestamp = localStorage.getItem(`${cacheKey}_timestamp`);
    
    // Use cached data if it's less than 5 minutes old
    if (cachedData && cacheTimestamp) {
      const age = Date.now() - parseInt(cacheTimestamp);
      if (age < 5 * 60 * 1000) { // 5 minutes
        rankingsCache = JSON.parse(cachedData);
        return;
      }
    }

    // Determine the season type
    let seasonType = "2"; // Default to regular season
    let weekNum = currentWeek;
    
    if (currentWeek === "1") {
      seasonType = "1"; // Try preseason first
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
            const teamIdMatch = rank.team.$ref.match(/teams\/(\d+)/);
            if (teamIdMatch) {
              const teamId = teamIdMatch[1];
              rankingsCache[teamId] = rank.current;
            }
          }
        }
        
        // Save to localStorage
        localStorage.setItem(cacheKey, JSON.stringify(rankingsCache));
        localStorage.setItem(`${cacheKey}_timestamp`, Date.now().toString());
      }
    }
  } catch (error) {
    console.error("Error caching rankings:", error);
  }
}

// Get formatted team name with ranking
function getTeamNameWithRanking(team) {
  const teamRank = rankingsCache[team.id];
  const baseName = team.shortDisplayName || team.displayName || "Unknown";
  
  if (teamRank) {
    return `<span style="color: #777;">${teamRank}</span> ${baseName}`;
  }
  
  return baseName;
}

function getScoreboardUrl() {
  const adjustedDate = getAdjustedDateForNCAA();
  return `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=${currentConference}&dates=${adjustedDate}`;
}

function getAdjustedDateForNCAA() {
  const now = new Date();
  // For college football, games typically start in the afternoon/evening
  // Adjust cutoff to 6 AM EST to handle late night games
  const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  
  if (estNow.getHours() < 6) {
    estNow.setDate(estNow.getDate() - 1);
  }
  
  const adjustedDate = estNow.getFullYear() +
                       String(estNow.getMonth() + 1).padStart(2, "0") +
                       String(estNow.getDate()).padStart(2, "0");
  return adjustedDate;
}

function setupConferenceButtons() {
  const conferenceContainer = document.getElementById("conferenceButtons");
  if (!conferenceContainer) return;

  conferenceContainer.innerHTML = "";
  
  // Add horizontal scroll styling for mobile
  setupMobileScrolling(conferenceContainer);

  for (const [confName, confData] of Object.entries(CONFERENCES)) {
    const button = document.createElement("button");
    button.className = `conference-button ${currentConference === confData.groupId ? "active" : ""}`;
    
    // Create button content with both text and logo (similar to search.js)
    const logoUrl = convertToHttps(`https://a.espncdn.com/i/teamlogos/ncaa_conf/500/${confData.code}.png`);
    button.innerHTML = `
      <span class="conference-text">${confName}</span>
      <img class="conference-logo" src="${logoUrl}" alt="${confName}" style="display: none;" onerror="this.style.display='none'; this.parentElement.querySelector('.conference-text').style.display='inline';">
    `;
    
    button.addEventListener("click", () => {
      if (currentConference !== confData.groupId) {
        currentConference = confData.groupId;
        localStorage.setItem("currentConference", currentConference);
        
        // Update button styles
        document.querySelectorAll(".conference-button").forEach(btn => {
          btn.classList.remove("active");
        });
        button.classList.add("active");
        
        fetchScheduledGames();
      }
    });
    
    conferenceContainer.appendChild(button);
  }

  updateConferenceButtonDisplay();
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
      logo.style.display = "inline-block";
    } else if (text && logo) {
      text.style.display = "inline";
      logo.style.display = "none";
    }
    
    // Update active state - need to check by button content since textContent changed
    const confName = text ? text.textContent : button.textContent;
    const confData = CONFERENCES[confName];
    if (confData && confData.groupId === currentConference) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
    
    if (isSmallScreen) {
      button.style.fontSize = "11px";
      button.style.padding = "6px 12px";
    } else {
      button.style.fontSize = "14px";
      button.style.padding = "10px 20px";
    }
  });
}

function switchConference(conferenceId) {
  currentConference = conferenceId;
  localStorage.setItem("currentConference", conferenceId);
  
  // Update button states
  document.querySelectorAll(".conference-button").forEach(button => {
    button.classList.remove("active");
  });
  event.target.classList.add("active");
  
  // Reload games for new conference
  fetchScheduledGames();
}

async function fetchScheduledGames() {
  try {
    const conferenceName = Object.keys(CONFERENCES).find(key => CONFERENCES[key].groupId === currentConference) || 'Conference';
    console.log(`Fetching scheduled games for conference: ${conferenceName} (ID: ${currentConference})`);
    const response = await fetch(convertToHttps(getScoreboardUrl()));
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('NCAA scheduled games data:', data);
    
    if (data.events && Array.isArray(data.events)) {
      const scheduledGames = data.events.filter(game => {
        const status = game.status?.type?.state?.toLowerCase();
        return status === 'scheduled' || status === 'pre';
      });
      
      console.log(`Found ${scheduledGames.length} scheduled games`);
      renderScheduledGames(scheduledGames);
    } else {
      console.log('No events found in API response');
      renderScheduledGames([]);
    }
  } catch (error) {
    console.error('Error fetching scheduled games:', error);
    document.getElementById('gamesContainer').innerHTML = 
      '<div class="error-message">Unable to load scheduled games. Please try again later.</div>';
  }
}

function renderScheduledGames(games) {
  const container = document.getElementById('gamesContainer');
  
  // Get current conference name
  const conferenceName = Object.keys(CONFERENCES).find(key => CONFERENCES[key].groupId === currentConference) || 'Conference';
  
  if (games.length === 0) {
    container.innerHTML = `<div class="no-games">No scheduled games found for ${conferenceName}</div>`;
    return;
  }

  container.innerHTML = games.map(game => {
    const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home");
  const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away");

  const slug = game.season?.slug || "regular-season";

  const homeRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "home")?.record || (game.competitions[0].competitors.find(c => c.homeAway === "home")?.record.split("-").reverse().join("-") || "0-0")
      : game.competitions[0].competitors.find(c => c.homeAway === "home")?.records?.find(r => r.type === "total")?.summary || "0-0";

  const awayRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "away")?.record || (game.competitions[0].competitors.find(c => c.homeAway === "away")?.record.split("-").reverse().join("-") || "0-0")
      : game.competitions[0].competitors.find(c => c.homeAway === "away")?.records?.find(r => r.type === "total")?.summary || "0-0";

  const startTime = new Date(game.date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

  return `
    <div class="game-card" style="margin-top: -20px; margin-bottom: 20px;">
      <div class="game-headline">${headline}</div>
      <div class="game-content">
        <div class="team away-team">
          <img src="${convertToHttps(awayTeam.team.id === '349' ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${awayTeam.team.id}.png` : `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${awayTeam.team.id}.png`)}" alt="${awayTeam?.displayName || "Unknown"}" class="card-team-logo">
          <div class="card-team-name">${getTeamNameWithRanking(awayTeam.team)}</div>
          <div class="card-team-record">${awayRecord}</div>
        </div>
        <div class="game-info">
          <div class="game-status">Scheduled</div>
          <div class="game-time">${startTime}</div>
        </div>
        <div class="team home-team">
          <img src="${convertToHttps(homeTeam.team.id === '349' ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${homeTeam.team.id}.png` : `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${homeTeam.team.id}.png`)}" alt="${homeTeam?.displayName || "Unknown"}" class="card-team-logo">
          <div class="card-team-name">${getTeamNameWithRanking(homeTeam.team)}</div>
          <div class="card-team-record">${homeRecord}</div>
        </div>
      </div>
    </div>
  `;;
  }).join('');
}

// Initialize the page
document.addEventListener('DOMContentLoaded', async function() {
  await cacheCurrentRankings(); // Cache rankings first
  setupConferenceButtons();
  fetchScheduledGames();
});

// Handle window resize for responsive design
window.addEventListener("resize", updateConferenceButtonDisplay);

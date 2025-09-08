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
        
        loadLiveGames();
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

async function getLogoUrl(teamAbbreviation) {
  return convertToHttps(`https://a.espncdn.com/i/teamlogos/ncaa/500/${teamAbbreviation}.png`);
}

function getOrdinalSuffix(num) {
  if (num % 100 >= 11 && num % 100 <= 13) return `${num}th`;
  switch (num % 10) {
    case 1: return `${num}st`;
    case 2: return `${num}nd`;
    case 3: return `${num}rd`;
    default: return `${num}th`;
  }
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

const liveGameElements = new Map();

async function loadLiveGames() {
  try {
    const adjustedDate = getAdjustedDateForNCAA();
    const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=${currentConference}&dates=${adjustedDate}`;
    const res = await fetch(convertToHttps(SCOREBOARD_API_URL));
    const data = await res.json();
    const games = data.events || [];

    const liveGames = games.filter(game => 
      game.status.type.description === "In Progress" || game.status.type.description === "Halftime" || game.status.type.description === "End of Period"
    );
    const container = document.getElementById("gamesContainer");

    if (liveGames.length === 0) {
      container.innerHTML = `<div class="live-game-block no-games"><p>No live games in progress.</p></div>`;
      liveGameElements.clear();
      return;
    }

    // Clear any existing no-games message
    const noGamesElement = document.querySelector(".no-games");
    if (noGamesElement) {
      noGamesElement.remove();
    }

    const currentGameIds = new Set();

    for (const game of liveGames) {
      const { id: gameId, competitions } = game;
      const homeTeam = competitions[0].competitors.find(c => c.homeAway === "home").team;
      const awayTeam = competitions[0].competitors.find(c => c.homeAway === "away").team;
      const distance = competitions[0]?.situation?.distance || "N/A";
      const possession = competitions[0]?.situation?.possession || "N/A";
      const yardLine = competitions[0]?.situation?.yardLine || "N/A";
      const kickoff = competitions[0]?.situation?.shortDownDistanceText === "1st & 10" && distance === 10 && (yardLine === 65 || yardLine === 35) ? "Kickoff" : competitions[0]?.situation?.shortDownDistanceText || "";

      const possessionColor = possession === homeTeam.id ? `#${homeTeam.color}` : possession === awayTeam.id ? `#${awayTeam.color}` : "grey";

      const text = competitions[0]?.situation?.possessionText || "";

      const isSmallScreen = window.innerWidth < 525;

      currentGameIds.add(gameId);

      const awayLogo = await getLogoUrl(awayTeam.id);
      const homeLogo = await getLogoUrl(homeTeam.id);

      let gameDiv = liveGameElements.get(gameId);
      if (!gameDiv) {
        gameDiv = document.createElement("div");
        gameDiv.className = "live-game-block";
        gameDiv.style.cursor = "pointer";
        gameDiv.onclick = () => window.location.href = `scoreboard.html?gameId=${gameId}`;

        gameDiv.innerHTML = `
          <div style="display: flex; flex-direction: column; justify-content: space-between; align-items: center; height: 100%; padding: 10px;">
            <div id="period-${gameId}" style="font-size: 1.5rem; font-weight: bold; text-align: center; color: black;"></div>
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 15px;">
              <div style="text-align: center; flex: 1;">
                <img src="${awayLogo}" alt="${awayTeam.displayName}" style="${isSmallScreen ? "width: 120px; height: 80px;" : "width: 140px; height: 100px;"}">
                <div id="awayScore-${gameId}" style="font-size: ${isSmallScreen ? "3rem" : "3.5rem"}; font-weight: normal; color: black;">0</div>
                <div style="margin-top: 8px; font-weight: bold; color: black; font-size: ${isSmallScreen ? "1rem" : "1.1rem"};">${getTeamNameWithRanking(awayTeam)}</div>
              </div>
              <div style="text-align: center; ${isSmallScreen ? "" : "flex: 1; min-width: 120px;"}">
                <div id="status-${gameId}" style="font-size: ${isSmallScreen ? "1.75rem" : "2.2rem"}; font-weight: bold; color: black; text-align: center;"></div>
                <div id="periodStatus-${gameId}" style="font-size: ${isSmallScreen ? "0.9rem" : "1.3rem"}; color: grey; text-align: center; margin-top: 15px;">${kickoff}</div>
                <div id="periodStatus-${gameId}" style="font-size: ${isSmallScreen ? "0.75rem" : "1rem"}; color: ${possessionColor}; text-align: center; margin-top: 5px;">${text ? (possession === homeTeam.id ? `${text} ▶` : `◀ ${text}`) : ""}</div>
              </div>
              <div style="text-align: center; flex: 1;">
                <img src="${homeLogo}" alt="${homeTeam.displayName}" style="${isSmallScreen ? "width: 120px; height: 80px;" : "width: 140px; height: 100px;"}">
                <div id="homeScore-${gameId}" style="font-size: ${isSmallScreen ? "3rem" : "3.5rem"}; font-weight: normal; color: black;">0</div>
                <div style="margin-top: 8px; font-weight: bold; color: black; font-size: ${isSmallScreen ? "1rem" : "1.1rem"};">${getTeamNameWithRanking(homeTeam)}</div>
              </div>
            </div>
          </div>
        `;

        liveGameElements.set(gameId, gameDiv);
        container.appendChild(gameDiv);
      }

      fetchGameDetails(gameId, competitions[0]);
    }

    for (const [gameId, element] of liveGameElements.entries()) {
      if (!currentGameIds.has(gameId)) {
        element.remove();
        liveGameElements.delete(gameId);
      }
    }
  } catch (err) {
    console.error("Error loading live games:", err);
  }
}

async function fetchGameDetails(gameId, competition) {
  try {
    const homeTeam = competition.competitors.find(c => c.homeAway === "home");
    const awayTeam = competition.competitors.find(c => c.homeAway === "away");

    // Update scores
    const awayScoreEl = document.getElementById(`awayScore-${gameId}`);
    const homeScoreEl = document.getElementById(`homeScore-${gameId}`);
    if (awayScoreEl && homeScoreEl) {
      const awayScore = parseInt(awayTeam.score, 10);
      const homeScore = parseInt(homeTeam.score, 10);

      awayScoreEl.textContent = awayScore;
      homeScoreEl.textContent = homeScore;

      // Reset font weight
      awayScoreEl.style.fontWeight = "normal";
      homeScoreEl.style.fontWeight = "normal";

      // Bold the score for the leading team
      if (awayScore > homeScore) {
        awayScoreEl.style.fontWeight = "bold";
      } else if (homeScore > awayScore) {
        homeScoreEl.style.fontWeight = "bold";
      }
    }

    // Update period and intermission status
    const periodEl = document.getElementById(`period-${gameId}`);
    const periodStatusEl = document.getElementById(`periodStatus-${gameId}`);
    const statusEl = document.getElementById(`status-${gameId}`);
    if (periodEl && periodStatusEl && statusEl) {
      const isHalftime = competition.status.type.description === "Halftime";
      const isEndOfPeriod = competition.status.type.description === "End of Period";
      const periodText = isHalftime
        ? ""
        : isEndOfPeriod
        ? `End of ${getOrdinalSuffix(competition.status.period)} Quarter`
        : `${getOrdinalSuffix(competition.status.period)} Quarter`;
      periodEl.textContent = periodText;

      const isMobile = window.innerWidth < 525;

      statusEl.textContent = isHalftime ? (isMobile ? "Half" : "Halftime") : isEndOfPeriod ? "End" : competition.status.displayClock;
    }
  } catch (err) {
    console.error(`Error fetching details for game ${gameId}:`, err);
  }
}

// Initialize conference buttons and load games
document.addEventListener("DOMContentLoaded", async () => {
  await cacheCurrentRankings(); // Cache rankings first
  setupConferenceButtons();
  loadLiveGames();
});

// Handle window resize for responsive design
window.addEventListener("resize", updateConferenceButtonDisplay);

loadLiveGames();
setInterval(loadLiveGames, 2000);

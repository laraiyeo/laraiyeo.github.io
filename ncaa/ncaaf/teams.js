const CONFERENCES = {"American": { groupId: "151", name: "American Athletic Conference", code: "american" },
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

// Convert hex color to rgba with opacity
function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function getAdjustedDateForNFL() {
  const now = new Date();
  const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  if (estNow.getHours() < 2) {
    estNow.setDate(estNow.getDate() - 1);
  }
  const adjustedDate = estNow.getFullYear() +
                       String(estNow.getMonth() + 1).padStart(2, "0") +
                       String(estNow.getDate()).padStart(2, "0");
  return adjustedDate;
}

function adjustTeamShortName(shortName) {
  if (shortName === "Timberwolves") return "T. Wolves";
  if (shortName === "Trail Blazers") return "T. Blazers";
  return shortName;
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
  const baseName = adjustTeamShortName(team.shortDisplayName || team.displayName || "Unknown");
  
  if (teamRank) {
    return `<span style="color: #777;">${teamRank}</span> ${baseName}`;
  }
  
  return baseName;
}

let lastScheduleHash = null;

async function buildGameCard(game, team) {
  const logoUrl = team.logos?.find(logo =>
        logo.rel.includes(
          ["349", "20"].includes(team.id) ? 'default' : 'dark'
        )
      )?.href || `https://a.espncdn.com/i/teamlogos/ncaa/500/${team.abbreviation}.png`;


  function getOrdinalSuffix(num) {
    if (num % 100 >= 11 && num % 100 <= 13) return `${num}th`;
    switch (num % 10) {
      case 1: return `${num}st`;
      case 2: return `${num}nd`;
      case 3: return `${num}rd`;
      default: return `${num}th`;
    }
  }

  const currentPeriod = game?.competitions[0]?.status?.period
    ? `${getOrdinalSuffix(game.competitions[0].status.period)} Quarter`
    : "Unknown Period";

  if (game && game.status.type.description === "Scheduled") {
    const startTime = new Date(game.date).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

    const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home")?.team || {};
    const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away")?.team || {};
    const slug = game.season?.slug || "regular-season";

    const homeTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "home")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "home")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "away")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "away")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamShortName = adjustTeamShortName(awayTeam.shortDisplayName || "Unknown");
    const homeTeamShortName = adjustTeamShortName(homeTeam.shortDisplayName || "Unknown");

    return `
      <div class="game-card scheduled-game-card">
        <div class="game-headline">${headline}</div>
        <div class="game-content">
          <div class="team away-team">
            <img src="${`https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${awayTeam?.id}.png` || ""}" alt="${awayTeam.displayName || "Unknown"}" class="card-team-logo">
            <div class="card-team-name">${getTeamNameWithRanking(awayTeam)}</div>
            <div class="card-team-record">${awayTeamRecord}</div>
          </div>
          <div class="game-info">
            <div class="game-status">Scheduled</div>
            <div class="game-time">${startTime}</div>
          </div>
          <div class="team home-team">
            <img src="${`https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${homeTeam?.id}.png` || ""}" alt="${homeTeam.displayName || "Unknown"}" class="card-team-logo">
            <div class="card-team-name">${getTeamNameWithRanking(homeTeam)}</div>
            <div class="card-team-record">${homeTeamRecord}</div>
          </div>
        </div>
      </div>
    `;
  } else if (game && game.status.type.description === "Final") {
    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

    const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home")?.team;
    const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away")?.team;
    const homeTeamScore = game.competitions[0].competitors.find(c => c.homeAway === "home")?.score || "0";
    const awayTeamScore = game.competitions[0].competitors.find(c => c.homeAway === "away")?.score || "0";
    const slug = game.season?.slug || "regular-season";

    const homeTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "home")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "home")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "away")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "away")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamShortName = adjustTeamShortName(awayTeam?.shortDisplayName || "Unknown");
    const homeTeamShortName = adjustTeamShortName(homeTeam?.shortDisplayName || "Unknown");

    let winningTeam = null;

    if (parseInt(homeTeamScore) > parseInt(awayTeamScore) && parseInt(homeTeamScore) > 0) {
      winningTeam = homeTeam;
    } else if (parseInt(awayTeamScore) > parseInt(homeTeamScore) && parseInt(awayTeamScore) > 0) {
      winningTeam = awayTeam;
    }

    return `
      <div class="game-card final-game-card">
        <div class="game-headline">${headline}</div>
        <div class="game-content">
          <div class="team away-team">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${`https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${awayTeam?.id}.png` || ""}" alt="${awayTeam?.displayName || "Unknown"}" class="card-team-logo">
              <span class="card-team-score" style="color: ${winningTeam === awayTeam ? '#fff' : '#777'}">${awayTeamScore}</span>
            </div>
            <div class="card-team-name">${getTeamNameWithRanking(awayTeam)}</div>
            <div class="card-team-record">${awayTeamRecord}</div>
          </div>
          <div class="game-info">
            <div class="line"></div>
            <div class="game-status">Final</div>
          </div>
          <div class="team home-team">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="card-team-score" style="color: ${winningTeam === homeTeam ? '#fff' : '#777'}">${homeTeamScore}</span>
              <img src="${`https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${homeTeam?.id}.png` || ""}" alt="${homeTeam?.displayName || "Unknown"}" class="card-team-logo">
            </div>
            <div class="card-team-name">${getTeamNameWithRanking(homeTeam)}</div>
            <div class="card-team-record">${homeTeamRecord}</div>
          </div>
        </div>
      </div>
    `;
  } else if (game && (game.status.type.description === "In Progress" || game.status.type.description === "Halftime" || game.status.type.description === "End of Period")) {
    const headline = game.competitions[0].notes?.find(note => note.type === "event")?.headline || "";

    const homeTeam = game.competitions[0].competitors.find(c => c.homeAway === "home")?.team;
    const awayTeam = game.competitions[0].competitors.find(c => c.homeAway === "away")?.team;
    const homeTeamScore = game.competitions[0].competitors.find(c => c.homeAway === "home")?.score || "0";
    const awayTeamScore = game.competitions[0].competitors.find(c => c.homeAway === "away")?.score || "0";
    const slug = game.season?.slug || "regular-season";

    const homeTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "home")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "home")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamRecord = slug === "post-season"
      ? game.competitions[0].competitors.find(c => c.homeAway === "away")?.record || "0-0"
      : game.competitions[0].competitors.find(c => c.homeAway === "away")?.records?.find(r => r.type === "total")?.summary || "0-0";

    const awayTeamShortName = adjustTeamShortName(awayTeam?.shortDisplayName || "Unknown");
    const homeTeamShortName = adjustTeamShortName(homeTeam?.shortDisplayName || "Unknown");

    const clockTime = game?.competitions[0]?.status?.displayClock;
    const isHalftime = game?.competitions[0]?.status?.type?.description === "Halftime";
    const isEndOfPeriod = game?.competitions[0]?.status?.type?.description === "End of Period";
    const periodDescription = isHalftime
      ? "Halftime"
      : isEndOfPeriod
      ? `End of ${currentPeriod}`
      : currentPeriod;
    const possession = game?.competitions[0]?.situation?.possession;
    const text = game?.competitions[0]?.situation?.possessionText || "";
    const distance = game?.competitions[0]?.situation?.distance || "N/A";
    const yardLine = game?.competitions[0]?.situation?.yardLine || "N/A";
    const kickoff = game?.competitions[0]?.situation?.shortDownDistanceText === "1st & 10" && distance === 10 && (yardLine === 65 || yardLine === 35) ? "Kickoff" : game?.competitions[0]?.situation?.shortDownDistanceText || "";

    let winningTeam = null;

    if (parseInt(homeTeamScore) > parseInt(awayTeamScore) && parseInt(homeTeamScore) > 0) {
      winningTeam = homeTeam;
    } else if (parseInt(awayTeamScore) > parseInt(homeTeamScore) && parseInt(awayTeamScore) > 0) {
      winningTeam = awayTeam;
    }


    return `
      <div class="game-card in-progress-game-card">
        <div class="game-headline">${headline}</div>
        <div class="game-content">
          <div class="team away-team">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${`https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${awayTeam?.id}.png` || ""}" alt="${awayTeam?.displayName || "Unknown"}" class="card-team-logo">
              <span class="card-team-score" style ="color: ${winningTeam === awayTeam ? '#fff' : '#777'}">${awayTeamScore}</span>
            </div>
            <div class="card-team-name">${getTeamNameWithRanking(awayTeam)}</div>
            <div class="card-team-record">${awayTeamRecord}</div>
          </div>
          <div class="game-info">
            <div class="game-period" style="margin-top: ${isHalftime ? "-20px" : "-10px"}; font-size: 0.9rem;">${periodDescription}</div>
            <div class="line" style="margin-top: ${isHalftime ? "5px" : "35px"}"></div>
            ${isHalftime || isEndOfPeriod ? "" : `<div class="game-status">${clockTime}</div>`}
            <div class="game-status" style="margin-top: 0px; font-size: 0.9rem;">${kickoff}</div>
            <div class="game-period" style="color: white; margin-top: -15px;">${text ? (possession === homeTeam.id ? `${text} ▶` : `◀ ${text}`) : ""}</div>
          </div>
          <div class="team home-team">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="card-team-score" style ="color: ${winningTeam === homeTeam ? '#fff' : '#777'}">${homeTeamScore}</span>
              <img src="${`https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${homeTeam?.id}.png` || ""}" alt="${homeTeam?.displayName || "Unknown"}" class="card-team-logo">
            </div>
            <div class="card-team-name">${getTeamNameWithRanking(homeTeam)}</div>
            <div class="card-team-record">${homeTeamRecord}</div>
          </div>
        </div>
      </div>
    `;
  } else {
    return `
      <div class="game-card no-game-card">
        <img src="${logoUrl}" alt="${team?.displayName || "Unknown"} logo" class="card-team-logo">
        <div class="no-game-text">No game scheduled <br> for today</div>
      </div>
    `;
  }
}

// NCAA Football Teams API URLs
function getConferenceTeamsURL(conferenceId) {
  if (conferenceId === "T25") {
    // For TOP 25, we'll need to get ranked teams differently
    return null; // Will handle separately
  }
  return `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/2025/types/2/groups/${conferenceId}/teams?lang=en&region=us`;
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
    
    // Create button content with both text and logo (similar to standings)
    if (confName === "AP 25") {
      // T25 stays as text only
      button.innerHTML = `<span class="conference-text" style="font-weight: bold;">TOP 25</span>`;
    } else {
      const logoUrl = convertToHttps(`https://a.espncdn.com/i/teamlogos/ncaa_conf/500/${confData.code}.png`);
      button.innerHTML = `
        <span class="conference-text">${confName}</span>
        <img class="conference-logo" src="${logoUrl}" alt="${confName}" style="display: none;" onerror="this.style.display='none'; this.parentElement.querySelector('.conference-text').style.display='inline';">
      `;
    }
    
    button.addEventListener("click", () => {
      currentConference = confData.groupId;
      localStorage.setItem("currentConference", currentConference);
      
      // Update button styles
      document.querySelectorAll(".conference-button").forEach(btn => {
        btn.classList.remove("active");
      });
      button.classList.add("active");
      
      // Load new conference data
      fetchAndDisplayTeams();
    });
    
    conferenceContainer.appendChild(button);
  }

  updateConferenceButtonDisplay(); // Adjust button display based on screen size
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
  });
}
// Function to fetch team details from the reference URL
async function fetchTeamDetails(teamRef) {
  try {
    const httpsRef = convertToHttps(teamRef);
    const response = await fetch(httpsRef);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const teamData = await response.json();
    return teamData;
  } catch (error) {
    console.error("Error fetching team details for:", teamRef, error);
    return null;
  }
}

// Function to create a team container like NFL
function createTeamContainer(team) {
  const teamCard = document.createElement("div");
  teamCard.className = "team-card";
  
  // Get the team logo - prefer dark logo
  const logoUrl = team.logos?.find(logo => 
    logo.rel.includes('dark')
  )?.href || team.logos?.[1]?.href || `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${team.abbreviation}.png`;

  // Create team colors for styling
  const primaryColor = team.color ? `#${team.color}` : '#333';
  const alternateColor = team.alternateColor ? `#${team.alternateColor}` : '#777';
  
  // Check if the primary color is white or very light, then use black text
  // Handle various white color formats
  const teamColor = team.color ? team.color.toLowerCase().replace('#', '') : '';
  const isLightColor = teamColor === 'ffffff' || teamColor === 'white' || teamColor === 'fefefe' || teamColor === 'f8f8f8';
  const textColor = isLightColor ? '#000000' : '#ffffff';

  teamCard.innerHTML = `
    <div class="team-header">
      <img src="${logoUrl}" alt="${team.displayName} logo" class="team-logo">
      <h2 class="team-name" style="color: ${textColor} !important">${team.displayName}</h2>
    </div>
    <div class="team-games">
      <div class="no-game-card">
        <img src="${logoUrl}" alt="${team.displayName} logo" class="card-team-logo">
        <div class="no-game-text" style="color: ${textColor}">No game scheduled<br>for today</div>
      </div>
    </div>
  `;

  // Apply team colors - background should be the team's primary color
  teamCard.style.backgroundColor = primaryColor;
  teamCard.style.borderColor = primaryColor;
  
  return teamCard;
}

// Function to fetch and display all teams
let teamsData = [];

async function fetchAndDisplayTeams() {
  try {
    const container = document.getElementById("teamsContainer");
    container.innerHTML = '<div class="loading">Loading teams...</div>';

    const apiUrl = getConferenceTeamsURL(currentConference);
    
    if (!apiUrl) {
      // Handle TOP 25 differently if needed
      container.innerHTML = '<div class="error">TOP 25 rankings not available yet</div>';
      return;
    }

    console.log("Fetching teams from:", apiUrl);

    // Fetch the conference teams list
    const response = await fetch(convertToHttps(apiUrl));
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("Conference teams data:", data);
    
    if (!data.items || data.items.length === 0) {
      container.innerHTML = '<div class="no-teams">No teams found for this conference.</div>';
      return;
    }

    console.log(`Found ${data.items.length} teams, fetching details...`);

    // Fetch details for each team
    const teamPromises = data.items.map(item => {
      return fetchTeamDetails(convertToHttps(item.$ref));
    });
    
    const teams = await Promise.all(teamPromises);
    console.log("Team details fetched:", teams);

    // Filter out any failed requests
    const validTeams = teams.filter(team => team !== null);

    if (validTeams.length === 0) {
      container.innerHTML = '<div class="no-teams">No team details could be loaded.</div>';
      return;
    }

    console.log(`Successfully loaded ${validTeams.length} teams`);

    // Store teams data globally
    teamsData = validTeams.sort((a, b) => a.displayName.localeCompare(b.displayName));

    // Initial display with games
    await updateGamesDisplay();

  } catch (error) {
    console.error("Error fetching teams:", error);
    const container = document.getElementById("teamsContainer");
    container.innerHTML = `<div class="error">Error loading teams: ${error.message}<br>Please check the console for details.</div>`;
  }
}

async function updateGamesDisplay() {
  try {
    if (teamsData.length === 0) return;

    const adjustedDate = getAdjustedDateForNFL();
    const container = document.getElementById("teamsContainer");

    // Fetch games for the current conference
    const SCOREBOARD_API_URL = `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=${currentConference}&dates=${adjustedDate}`;
    const scoreboardResponse = await fetch(convertToHttps(SCOREBOARD_API_URL));
    const scoreboardText = await scoreboardResponse.text();
    const newHash = hashString(scoreboardText);

    if (newHash === lastScheduleHash) {
      console.log("No changes detected in the schedule.");
      return;
    }
    lastScheduleHash = newHash;

    const scoreboardData = JSON.parse(scoreboardText);
    const games = scoreboardData.events || [];

    // Clear the container
    container.innerHTML = '';

    // Create and append team containers with game cards
    for (const team of teamsData) {
      const logoUrl = team.logos?.find(logo =>
        logo.rel.includes(
          ["349", "20"].includes(team.id) ? 'default' : 'dark'
        )
      )?.href || `https://a.espncdn.com/i/teamlogos/ncaa/500-dark/${team.abbreviation}.png`;

      const teamCard = document.createElement("div");
      teamCard.className = "team-card";
      teamCard.style.backgroundColor = `#${team.color}`;

      // Check if the primary color is white or very light, then use black text
      // Handle various white color formats
      const teamColor = team.color ? team.color.toLowerCase().replace('#', '') : '';
      const isLightColor = teamColor === 'ffffff' || teamColor === 'white' || teamColor === 'fefefe' || teamColor === 'f8f8f8';
      const textColor = isLightColor ? '#000000' : '#ffffff';

      const teamGames = games.filter(game =>
        game.competitions[0].competitors.some(competitor => competitor.team.id === team.id)
      );

      const gameCardHtml = teamGames.length > 0
        ? await buildGameCard(teamGames[0], team)
        : await buildGameCard(null, team);

      teamCard.innerHTML = `
        <div class="team-header">
          <img src="${logoUrl}" alt="${team.displayName}" class="team-logo">
          <h2 class="team-name" style="color: ${textColor} !important">${team.displayName}</h2>
        </div>
        <div class="team-games">${gameCardHtml}</div>
      `;

      // Add OBS link copying functionality
      teamCard.addEventListener("click", async () => {
        const url = `https://laraiyeo.github.io/ncaa/ncaaf/team.html?team=${team.id}`;
        try {
          await navigator.clipboard.writeText(url);
          alert(`OBS link copied for ${team.displayName}: ${url}`);
        } catch (err) {
          console.error("Failed to copy OBS link:", err);
        }
      });

      container.appendChild(teamCard);
    }

  } catch (error) {
    console.error("Error updating games:", error);
  }
}

// Initialize the page
(async () => {
  await cacheCurrentRankings(); // Cache rankings first
  setupConferenceButtons();
  fetchAndDisplayTeams();
  setInterval(updateGamesDisplay, 2000);
})();
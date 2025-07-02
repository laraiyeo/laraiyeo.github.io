const CONSTRUCTORS_API_URL = "https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2025/types/2/standings/1";

let allConstructors = [];
let lastConstructorsHash = null;

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
    // Step 1: Get all drivers from standings (context.txt equivalent)
    const driversResponse = await fetch('https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2025/types/2/standings/0');
    const driversData = await driversResponse.json();
    
    const drivers = [];
    
    // Process each driver standing
    for (const standing of driversData.standings) {
      try {
        // Step 2: Get athlete details (2.txt equivalent)
        const athleteResponse = await fetch(convertToHttps(standing.athlete.$ref));
        const athleteData = await athleteResponse.json();
        
        // Step 3: Get event log (3.txt equivalent)
        const eventLogResponse = await fetch(convertToHttps(athleteData.eventLog.$ref));
        const eventLogData = await eventLogResponse.json();
        
        // Get first event item if it exists
        if (eventLogData.events?.items?.length > 0) {
          const firstEvent = eventLogData.events.items[0];
          
          // Step 4: Get competitor details (4.txt equivalent)
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

async function buildConstructorCard(constructor) {
  const logoUrl = getConstructorLogo(constructor.displayName);
  const carUrl = getConstructorCar(constructor.displayName);
  const drivers = await getConstructorDrivers(constructor.displayName);
  const points = constructor.points || 0;
  const wins = constructor.wins || 0;
  const rank = constructor.rank || '-';
  
  // Define constructors that need black text
  const blackTextConstructors = ['Williams', 'Alpine', 'Mercedes', 'Sauber', 'Haas'];
  const needsBlackText = blackTextConstructors.includes(constructor.displayName);
  const nameColor = needsBlackText ? 'color: black;' : '';
  const rankColor = needsBlackText ? 'color: #333;' : '';
  const driversColor = needsBlackText ? 'color: #222;' : 'color: #ccc;';
  const statsLabelColor = needsBlackText ? '#333;' : '#ccc';
  const statsValueColor = needsBlackText ? 'black;' : 'white';
  
  const driversText = drivers.length > 0 ? drivers.join(' | ') : 'TBD | TBD';
  
  return `
    <div class="constructor-card-wrapper">
      <div class="constructor-car">
        <img src="${carUrl}" alt="${constructor.displayName} car" class="car-image">
      </div>
      <div class="constructor-card">
        <div class="constructor-header">
          <img src="${logoUrl}" alt="${constructor.displayName}" class="constructor-logo">
          <h2 class="constructor-name" style="${nameColor}">${constructor.displayName}</h2>
          <div class="constructor-rank" style="${rankColor}">Championship Position: #${rank}</div><br>
          <div class="constructor-drivers" style="${driversColor}">${driversText}</div>
        </div>
        <div class="constructor-stats">
          <div class="stat-item">
            <div class="stat-label" style="color: ${statsLabelColor};">Points</div>
            <div class="stat-value" style="color: ${statsValueColor};">${points}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label" style="color: ${statsLabelColor};">Wins</div>
            <div class="stat-value" style="color: ${statsValueColor};">${wins}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label" style="color: ${statsLabelColor};">P. Behind</div>
            <div class="stat-value" style="color: ${statsValueColor};">${constructor.pointsBehind || 0}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function getConstructorLogo(constructorName) {
  // Convert constructor name to lowercase and handle special cases
  const nameMap = {
    'McLaren': 'mclaren',
    'Ferrari': 'ferrari', 
    'Red Bull': 'redbullracing',
    'Mercedes': 'mercedes',
    'Aston Martin': 'astonmartin',
    'Alpine': 'alpine',
    'Williams': 'williams',
    'RB': 'rb',
    'Haas': 'haas',
    'Sauber': 'kicksauber'
  };
  
  // Define constructors that need black logos
  const blackLogoConstructors = ['Williams', 'Alpine', 'Mercedes', 'Sauber'];
  const logoColor = blackLogoConstructors.includes(constructorName) ? 'logoblack' : 'logowhite';
  
  const logoName = nameMap[constructorName] || constructorName.toLowerCase().replace(/\s+/g, '');
  return `https://media.formula1.com/image/upload/c_fit,h_1080/q_auto/v1740000000/common/f1/2025/${logoName}/2025${logoName}${logoColor}.webp`;
}

function getConstructorCar(constructorName) {
  // Convert constructor name to lowercase and handle special cases
  const nameMap = {
    'McLaren': 'mclaren',
    'Ferrari': 'ferrari', 
    'Red Bull': 'redbullracing',
    'Mercedes': 'mercedes',
    'Aston Martin': 'astonmartin',
    'Alpine': 'alpine',
    'Williams': 'williams',
    'RB': 'rb',
    'Haas': 'haas',
    'Sauber': 'kicksauber'
  };
  
  const carName = nameMap[constructorName] || constructorName.toLowerCase().replace(/\s+/g, '');
  return `https://media.formula1.com/image/upload/c_lfill,w_3392/q_auto/v1740000000/common/f1/2025/${carName}/2025${carName}carright.webp`;
}

function calculatePointsBehind(rank, points, leaderPoints) {
  return rank === 1 ? 0 : Math.max(0, leaderPoints - points);
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

async function fetchAndDisplayConstructors() {
  try {
    const response = await fetch(CONSTRUCTORS_API_URL);
    const responseText = await response.text();
    const newHash = hashString(responseText);

    if (newHash === lastConstructorsHash) {
      console.log("No changes detected in constructors data.");
      return;
    }
    lastConstructorsHash = newHash;

    const data = JSON.parse(responseText);
    
    if (!data.standings || data.standings.length === 0) {
      console.error("No standings data found");
      return;
    }

    // Process constructor data
    const constructorsData = await Promise.all(
      data.standings.map(async (standing) => {
        try {
          // Fetch manufacturer details
          const manufacturerResponse = await fetch(convertToHttps(standing.manufacturer.$ref));
          const manufacturerData = await manufacturerResponse.json();
          
          // Extract stats from records
          const record = standing.records[0];
          const stats = {};
          record.stats.forEach(stat => {
            stats[stat.name] = stat.value;
          });
          
          return {
            rank: stats.rank || 0,
            displayName: manufacturerData.displayName || 'Unknown',
            color: getTeamColor(manufacturerData.displayName), // Use custom colors instead of API color
            points: stats.points || 0,
            wins: stats.wins || 0,
            poles: stats.poles || 0
          };
        } catch (error) {
          console.error('Error fetching manufacturer data:', error);
          return null;
        }
      })
    );

    // Filter and sort constructors
    allConstructors = constructorsData
      .filter(constructor => constructor !== null)
      .sort((a, b) => a.rank - b.rank);

    // Calculate points behind leader
    const leaderPoints = allConstructors[0]?.points || 0;
    allConstructors.forEach(constructor => {
      constructor.pointsBehind = calculatePointsBehind(constructor.rank, constructor.points, leaderPoints);
    });

    const container = document.getElementById("teamsContainer");
    if (!container) {
      console.error("Error: Element with ID 'teamsContainer' not found.");
      return;
    }

    container.innerHTML = ""; // Clear any existing content

    for (const constructor of allConstructors) {
      const constructorCardHtml = await buildConstructorCard(constructor);
      const constructorCard = document.createElement("div");
      constructorCard.innerHTML = constructorCardHtml;
      
      // Set background color and remove image background
      const cardElement = constructorCard.querySelector('.constructor-card');
      if (cardElement) {
        cardElement.style.backgroundColor = `#${constructor.color}`;
        cardElement.style.border = `2px solid #${constructor.color}`;
        
        // Remove background from logo image
        const logoImg = cardElement.querySelector('.constructor-logo');
        if (logoImg) {
          logoImg.style.background = 'transparent';
          logoImg.style.filter = 'drop-shadow(0 0 4px rgba(0,0,0,0.5))';
        }

        // Style car image
        const carImg = constructorCard.querySelector('.car-image');
        if (carImg) {
          carImg.style.background = 'transparent';
          carImg.style.filter = 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))';
        }
      }

      // Add click handler for future features (like detailed constructor page)
      constructorCard.addEventListener("click", () => {
        console.log(`Clicked on ${constructor.displayName}`);
        // Future: Navigate to constructor detail page
        // window.location.href = `constructor.html?team=${encodeURIComponent(constructor.displayName)}`;
      });

      // Add hover effects for both card and car
      const wrapperElement = constructorCard.querySelector('.constructor-card-wrapper');
      if (wrapperElement) {
        wrapperElement.addEventListener("mouseenter", () => {
          const card = wrapperElement.querySelector('.constructor-card');
          const car = wrapperElement.querySelector('.constructor-car');
          if (card && car) {
            card.style.transform = 'scale(1.05)';
            car.style.transform = 'translateX(-50%) scale(1.05)';
            card.style.boxShadow = '0 6px 10px rgba(255, 255, 255, 0.5)';
          }
        });

        wrapperElement.addEventListener("mouseleave", () => {
          const card = wrapperElement.querySelector('.constructor-card');
          const car = wrapperElement.querySelector('.constructor-car');
          if (card && car) {
            card.style.transform = '';
            car.style.transform = 'translateX(-50%)';
            card.style.boxShadow = '';
          }
        });
      }

      container.appendChild(constructorCard);
    }
  } catch (error) {
    console.error("Error fetching F1 constructors:", error);
  }
}

// Initialize and set up polling
fetchAndDisplayConstructors();
setInterval(fetchAndDisplayConstructors, 30000); // Poll every 30 seconds (less frequent than NBA)

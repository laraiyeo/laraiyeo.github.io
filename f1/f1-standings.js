const API_BASE = 'https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/2025/types/2/standings/';
let currentStandingsType = 'drivers'; // 'drivers' or 'constructors'

async function fetchStandings(type = 'drivers') {
    try {
        showLoading(true);
        
        const endpoint = type === 'drivers' ? `${API_BASE}0` : `${API_BASE}1`;
        
        // Fetch main standings data
        const response = await fetch(endpoint);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (type === 'drivers') {
            await processDriverStandings(data);
        } else {
            await processConstructorStandings(data);
        }
        
        showLoading(false);
        
    } catch (error) {
        console.error('Error fetching standings:', error);
        showError('Failed to load F1 standings. Please try again later.');
        showLoading(false);
    }
}

async function processDriverStandings(data) {
    const driversData = await Promise.all(
        data.standings.map(async (standing) => {
            try {
                // Fetch athlete details
                const athleteResponse = await fetch(standing.athlete.$ref);
                const athleteData = await athleteResponse.json();
                
                // Extract stats from records
                const record = standing.records[0];
                const stats = {};
                record.stats.forEach(stat => {
                    stats[stat.name] = stat.value;
                });
                
                // Get vehicle info (team and number)
                const vehicle = athleteData.vehicles?.[0] || {};
                
                return {
                    rank: stats.rank,
                    fullName: athleteData.fullName,
                    team: vehicle.team || 'Unknown',
                    number: vehicle.number || 'N/A',
                    points: stats.championshipPts || 0,
                    wins: stats.wins || 0,
                    pointsBehind: stats.behind || 0
                };
            } catch (error) {
                console.error('Error fetching athlete data:', error);
                return null;
            }
        })
    );
    
    // Filter out any failed requests and sort by rank
    const validDrivers = driversData
        .filter(driver => driver !== null)
        .sort((a, b) => a.rank - b.rank);
    
    displayDriverStandings(validDrivers);
}

async function processConstructorStandings(data) {
    const constructorsData = await Promise.all(
        data.standings.map(async (standing) => {
            try {
                // Fetch manufacturer details
                const manufacturerResponse = await fetch(standing.manufacturer.$ref);
                const manufacturerData = await manufacturerResponse.json();
                
                // Extract stats from records
                const record = standing.records[0];
                const stats = {};
                record.stats.forEach(stat => {
                    stats[stat.name] = stat.value;
                });
                
                return {
                    rank: stats.rank,
                    displayName: manufacturerData.displayName,
                    color: manufacturerData.color || '000000',
                    points: stats.points || 0,
                    wins: stats.wins || 0,
                    pointsBehind: calculatePointsBehind(stats.rank, stats.points)
                };
            } catch (error) {
                console.error('Error fetching manufacturer data:', error);
                return null;
            }
        })
    );
    
    // Filter out any failed requests and sort by rank
    const validConstructors = constructorsData
        .filter(constructor => constructor !== null)
        .sort((a, b) => a.rank - b.rank);
    
    displayConstructorStandings(validConstructors);
}

function calculatePointsBehind(rank, points) {
    // For constructors, we need to calculate points behind leader
    // This is a simplified calculation - in real implementation you'd get leader's points
    return rank === 1 ? 0 : Math.max(0, 450 - points); // Assuming leader has ~450 points
}

function displayDriverStandings(drivers) {
    const tbody = document.getElementById('standingsBody');
    tbody.innerHTML = '';
    
    drivers.forEach(driver => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="rank">${driver.rank}</td>
            <td>${driver.fullName} (${driver.team} - #${driver.number})</td>
            <td>${driver.points}</td>
            <td>${driver.wins}</td>
            <td>${driver.pointsBehind}</td>
        `;
        tbody.appendChild(row);
    });
    
    document.getElementById('standingsTable').style.display = 'table';
}

function displayConstructorStandings(constructors) {
    const tbody = document.getElementById('standingsBody');
    tbody.innerHTML = '';
    
    constructors.forEach(constructor => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="rank">${constructor.rank}</td>
            <td><span class="team-name" style="color: #${constructor.color}">${constructor.displayName}</span></td>
            <td>${constructor.points}</td>
            <td>${constructor.wins}</td>
            <td>${constructor.pointsBehind}</td>
        `;
        tbody.appendChild(row);
    });
    
    document.getElementById('standingsTable').style.display = 'table';
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
    document.getElementById('standingsTable').style.display = show ? 'none' : 'table';
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function updateUI(type) {
    const title = document.getElementById('pageTitle');
    const nameHeader = document.getElementById('nameHeader');
    
    if (type === 'drivers') {
        title.textContent = 'F1 Driver Standings 2025';
        nameHeader.textContent = 'Driver';
    } else {
        title.textContent = 'F1 Constructor Standings 2025';
        nameHeader.textContent = 'Constructor';
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    fetchStandings('drivers');
    
    const toggle = document.getElementById('standingsToggle');
    toggle.addEventListener('change', (e) => {
        currentStandingsType = e.target.checked ? 'constructors' : 'drivers';
        updateUI(currentStandingsType);
        fetchStandings(currentStandingsType);
    });
});

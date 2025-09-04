// NFL Ticker JavaScript
// This file contains additional functionality for the NFL ticker

// Configuration
const TICKER_CONFIG = {
  width: 1920,
  height: 200,
  slideDuration: 5000, // 5 seconds
  refreshInterval: 30000, // 30 seconds
  animationDuration: 800 // milliseconds
};

// Utility functions
function formatTime(dateString) {
  return new Date(dateString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York"
  });
}

function getRandomStat(awayScore, homeScore) {
  const margin = Math.abs(awayScore - homeScore);
  const totalPoints = awayScore + homeScore;

  const stats = [
    margin === 0 ? "Shutout!" : null,
    totalPoints >= 50 ? `${totalPoints} Points Scored!` : null,
    margin >= 14 ? `${margin} Point Margin!` : null,
    margin <= 3 ? "Close Game!" : null,
    totalPoints <= 10 ? "Defensive Battle!" : null,
    "Game Complete!",
    "Final Score!",
    margin >= 17 ? "Blowout Win!" : null
  ].filter(stat => stat !== null);

  return stats[Math.floor(Math.random() * stats.length)] || "Game Complete!";
}

// Enhanced error handling
function handleTickerError(error, context) {
  console.error(`Ticker Error (${context}):`, error);

  const container = document.querySelector('.ticker-container');
  if (container) {
    container.innerHTML = `
      <div class="loading" style="color: #ff6b6b;">
        Error loading ticker: ${error.message}
        <br><small>Check console for details</small>
      </div>
    `;
  }
}

// Performance monitoring
let lastUpdateTime = Date.now();
let frameCount = 0;

function monitorPerformance() {
  frameCount++;
  const now = Date.now();

  if (now - lastUpdateTime >= 60000) { // Log every minute
    console.log(`Ticker Performance: ${frameCount} updates in ${(now - lastUpdateTime) / 1000}s`);
    frameCount = 0;
    lastUpdateTime = now;
  }
}

// Export for potential use in other files
window.NFL_TICKER_CONFIG = TICKER_CONFIG;
window.formatTickerTime = formatTime;
window.getRandomTickerStat = getRandomStat;

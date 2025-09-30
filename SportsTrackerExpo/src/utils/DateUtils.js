// Unified date/time utilities for consistent 2 AM cutoff logic across the app
// This ensures FavoritesScreen and TeamPageUtils use the same "game day" definition

/**
 * Get current "game day" based on 2 AM America/New_York cutoff
 * Games are considered part of the previous day until 2 AM NY time
 * @returns {string} Game day in YYYY-MM-DD format
 */
export const getCurrentGameDay = () => {
  const now = new Date();
  
  // Get current time in America/New_York timezone (handles EST/EDT automatically)
  const nyTimeString = now.toLocaleString('en-US', { 
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse the formatted string manually to avoid Date constructor issues
  const [datePart, timePart] = nyTimeString.split(', ');
  const [month, day, year] = datePart.split('/');
  const [hour, minute, second] = timePart.split(':');
  
  const nyTime = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute), parseInt(second));
  const currentHourNY = nyTime.getHours();
  
  // If it's before 2 AM NY time, use yesterday's date as the game day
  let gameDay = new Date(nyTime);
  if (currentHourNY < 2) {
    gameDay = new Date(nyTime.getTime() - 24 * 60 * 60 * 1000); // Yesterday
  }
  
  // Return as YYYY-MM-DD format for easy comparison
  return gameDay.getFullYear() + '-' + 
         String(gameDay.getMonth() + 1).padStart(2, '0') + '-' + 
         String(gameDay.getDate()).padStart(2, '0');
};

/**
 * Get "today's" date range with 2 AM America/New_York cutoff for API queries
 * Games are considered "today's" until 2 AM America/New_York time of the next day
 * @returns {object} { todayStart: Date, todayEnd: Date, gameDay: string }
 */
export const getTodayDateRange = () => {
  const now = new Date();
  
  // Get current time in America/New_York timezone (handles EST/EDT automatically)
  const nyTimeString = now.toLocaleString('en-US', { 
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse the formatted string manually to avoid Date constructor issues
  const [datePart, timePart] = nyTimeString.split(', ');
  const [month, day, year] = datePart.split('/');
  const [hour, minute, second] = timePart.split(':');
  
  const nyTime = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute), parseInt(second));
  const currentHourNY = nyTime.getHours();
  
  console.log(`[DATE UTILS] Current time: ${now.toISOString()}, NY time: ${nyTime.toISOString()}, NY hour: ${currentHourNY}`);
  
  // If it's before 2 AM NY time, use yesterday's date as "today"
  let gameDay = new Date(nyTime);
  if (currentHourNY < 2) {
    gameDay = new Date(nyTime.getTime() - 24 * 60 * 60 * 1000); // Yesterday
    console.log(`[DATE UTILS] Before 2 AM NY, using yesterday as game day: ${gameDay.toLocaleDateString()}`);
  } else {
    console.log(`[DATE UTILS] After 2 AM NY, using today as game day: ${gameDay.toLocaleDateString()}`);
  }
  
  // Create 2 AM EST/EDT times and convert to UTC properly
  // Use a more reliable method: create the time string and parse it explicitly
  const todayDateStr = gameDay.getFullYear() + '-' + 
                       String(gameDay.getMonth() + 1).padStart(2, '0') + '-' + 
                       String(gameDay.getDate()).padStart(2, '0');
  const tomorrowDateStr = gameDay.getFullYear() + '-' + 
                          String(gameDay.getMonth() + 1).padStart(2, '0') + '-' + 
                          String(gameDay.getDate() + 1).padStart(2, '0');
  
  // Determine if we're currently in daylight saving time by checking a date in America/New_York timezone
  const checkDST = (date) => {
    const tempDate = new Date(date);
    const testString = tempDate.toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      timeZoneName: 'short'
    });
    // EST during standard time, EDT during daylight time
    return testString.includes('EDT');
  };
  
  // Create proper timezone strings based on whether we're in DST
  const todayIsDST = checkDST(new Date(todayDateStr + 'T12:00:00'));
  const tomorrowIsDST = checkDST(new Date(tomorrowDateStr + 'T12:00:00'));
  
  // Create Date objects representing 2 AM in NY timezone
  const todayStart = todayIsDST ? 
    new Date(`${todayDateStr}T02:00:00-04:00`) : // EDT (daylight saving)
    new Date(`${todayDateStr}T02:00:00-05:00`);  // EST (standard time)
    
  const todayEnd = tomorrowIsDST ? 
    new Date(`${tomorrowDateStr}T02:00:00-04:00`) : // EDT (daylight saving)
    new Date(`${tomorrowDateStr}T02:00:00-05:00`);  // EST (standard time)
  
  const gameDayStr = gameDay.getFullYear() + '-' + 
                     String(gameDay.getMonth() + 1).padStart(2, '0') + '-' + 
                     String(gameDay.getDate()).padStart(2, '0');
  
  console.log(`[DATE UTILS] Date range calculation: Current time: ${now.toISOString()}, NY Hour: ${currentHourNY}, Game day: ${gameDay.toDateString()}, Range: ${todayStart.toISOString()} to ${todayEnd.toISOString()}`);
  
  return { 
    todayStart: todayStart, 
    todayEnd: todayEnd, 
    gameDay: gameDayStr 
  };
};

/**
 * Get MLB-specific date range using the unified 2 AM NY cutoff
 * This replaces the UTC-based logic in TeamPageUtils
 * @returns {object} { today: string, tomorrow: string } in YYYY-MM-DD format
 */
export const getMLBDateRange = () => {
  const { gameDay } = getTodayDateRange();
  
  // Also check tomorrow for games that might start after midnight
  const gameDayDate = new Date(gameDay + 'T00:00:00');
  const tomorrow = new Date(gameDayDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.getFullYear() + "-" +
                     String(tomorrow.getMonth() + 1).padStart(2, "0") + "-" +
                     String(tomorrow.getDate()).padStart(2, "0");
  
  console.log(`[DATE UTILS] MLB date range: ${gameDay} to ${tomorrowStr}`);
  return { today: gameDay, tomorrow: tomorrowStr };
};
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
  
  // Create 2 AM cutoff for the game day in NY timezone
  const todayStart2AMNY = new Date(gameDay.getFullYear(), gameDay.getMonth(), gameDay.getDate(), 2, 0, 0);
  const tomorrowStart2AMNY = new Date(gameDay.getFullYear(), gameDay.getMonth(), gameDay.getDate() + 1, 2, 0, 0);
  
  // Convert NY times to UTC for API queries
  const todayStartUTC = new Date(todayStart2AMNY.getTime() - (todayStart2AMNY.getTimezoneOffset() * 60000));
  const todayEndUTC = new Date(tomorrowStart2AMNY.getTime() - (tomorrowStart2AMNY.getTimezoneOffset() * 60000));
  
  const gameDayStr = gameDay.getFullYear() + '-' + 
                     String(gameDay.getMonth() + 1).padStart(2, '0') + '-' + 
                     String(gameDay.getDate()).padStart(2, '0');
  
  console.log(`[DATE UTILS] Date range calculation: Current time: ${now.toISOString()}, NY Hour: ${currentHourNY}, Game day: ${gameDay.toDateString()}, Range: ${todayStartUTC.toISOString()} to ${todayEndUTC.toISOString()}`);
  
  return { 
    todayStart: todayStartUTC, 
    todayEnd: todayEndUTC, 
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
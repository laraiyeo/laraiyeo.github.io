import { collection, query, where, getDocs, deleteDoc, Timestamp, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Platform } from 'react-native';

/**
 * Chat utility functions for managing game-based chat restrictions and cleanup
 */
export class ChatUtils {
  
  // Configuration for cleanup functionality
  static CLEANUP_ENABLED = __DEV__ ?? false; // Only enable cleanup in development mode
  
  /**
   * Get current date in Eastern Time
   * @returns {Date} - Current date in Eastern Time
   */
  static getCurrentDateET() {
    try {
      const now = new Date();
      
      // Try modern Intl API first (more reliable)
      if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
        try {
          const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          });
          
          const parts = formatter.formatToParts(now);
          const partsObj = parts.reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
          
          const easternDate = new Date(
            parseInt(partsObj.year),
            parseInt(partsObj.month) - 1, // Month is 0-indexed
            parseInt(partsObj.day),
            parseInt(partsObj.hour),
            parseInt(partsObj.minute),
            parseInt(partsObj.second)
          );
          
          if (!isNaN(easternDate.getTime())) {
            return easternDate;
          }
        } catch (intlError) {
          console.warn('Intl API failed, falling back to toLocaleString:', intlError);
        }
      }
      
      // Fallback to toLocaleString
      const easternDate = new Date(now.toLocaleString("en-US", {
        timeZone: "America/New_York"
      }));
      
      if (!isNaN(easternDate.getTime())) {
        return easternDate;
      }
      
      throw new Error('Both methods failed');
    } catch (error) {
      console.warn('Error converting to ET, using local time with UTC offset approximation:', error);
      // Fallback: approximate EST/EDT offset
      const now = new Date();
      const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
      // EST is UTC-5, EDT is UTC-4. Use -5 as conservative estimate
      const estOffset = -5;
      return new Date(utcTime + (estOffset * 3600000));
    }
  }
  
  /**
   * Convert any date to Eastern Time
   * @param {string|Date} date - Date to convert
   * @returns {Date} - Date in Eastern Time
   */
  static convertToET(date) {
    try {
      if (!date) return this.getCurrentDateET();
      
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        console.warn('Invalid date provided, using current date:', date);
        return this.getCurrentDateET();
      }
      
      // Try modern Intl API first (more reliable)
      if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
        try {
          const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          });
          
          const parts = formatter.formatToParts(parsedDate);
          const partsObj = parts.reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
          
          const easternDate = new Date(
            parseInt(partsObj.year),
            parseInt(partsObj.month) - 1, // Month is 0-indexed
            parseInt(partsObj.day),
            parseInt(partsObj.hour),
            parseInt(partsObj.minute),
            parseInt(partsObj.second)
          );
          
          if (!isNaN(easternDate.getTime())) {
            return easternDate;
          }
        } catch (intlError) {
          console.warn('Intl API failed for date conversion, falling back:', intlError);
        }
      }
      
      // Fallback to toLocaleString
      const easternDateString = parsedDate.toLocaleString("en-US", {
        timeZone: "America/New_York"
      });
      
      const easternDate = new Date(easternDateString);
      if (!isNaN(easternDate.getTime())) {
        return easternDate;
      }
      
      throw new Error('Both conversion methods failed');
    } catch (error) {
      console.warn('Error converting date to ET:', error, 'Original date:', date);
      // Fallback: approximate EST/EDT offset from UTC
      try {
        const parsedDate = new Date(date);
        if (!isNaN(parsedDate.getTime())) {
          const utcTime = parsedDate.getTime();
          // EST is UTC-5, EDT is UTC-4. Use -5 as conservative estimate
          const estOffset = -5;
          return new Date(utcTime + (estOffset * 3600000));
        }
      } catch (fallbackError) {
        console.warn('Fallback date conversion also failed:', fallbackError);
      }
      
      return this.getCurrentDateET();
    }
  }

  /**
   * Normalize various date representations to a JavaScript Date
   * Supports: Date, ISO string, numeric epoch (ms or seconds), Firestore Timestamp-like objects
   * @param {*} value
   * @returns {Date|null}
   */
  static normalizeDate(value) {
    try {
      if (!value && value !== 0) return null;

      // If it's already a Date
      if (value instanceof Date) return value;

      // Firestore Timestamp object has toDate()
      if (typeof value === 'object') {
        if (typeof value.toDate === 'function') {
          return value.toDate();
        }
        // Some objects may have seconds/nanos
        if (typeof value.seconds === 'number') {
          // seconds may be in seconds since epoch
          return new Date(value.seconds * 1000);
        }
        if (typeof value._seconds === 'number') {
          return new Date(value._seconds * 1000);
        }
      }

      // If it's numeric (could be milliseconds or seconds)
      if (typeof value === 'number') {
        // Heuristic: if value is 10 digits -> seconds
        if (String(value).length === 10) return new Date(value * 1000);
        return new Date(value);
      }

      // If it's a string, try Date parsing
      if (typeof value === 'string') {
        // Trim and attempt ISO parse
        const s = value.trim();
        // Handle plain date like YYYY-MM-DD by adding time to avoid timezone shenanigans
        const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/;
        if (isoDateOnly.test(s)) {
          // Treat as local date (Midnight) then convert to ET in later steps
          return new Date(s + 'T00:00:00');
        }

        const parsed = new Date(s);
        if (!isNaN(parsed.getTime())) return parsed;
      }

      return null;
    } catch (e) {
      console.warn('normalizeDate error for value:', value, e);
      return null;
    }
  }
  
  /**
   * Check if a game date is today (using Eastern Time with 2am extension)
   * Games that started today are available for chat until 2am EST the next day
   * @param {string|Date} gameDate - The game date to check
   * @returns {boolean} - True if the game is today or within 2am extension
   */
  static isGameToday(gameDate) {
    try {
      if (!gameDate) return false;
      
      // Get current date and time in Eastern Time
      const nowET = this.getCurrentDateET();
      
      // Convert game date to Eastern Time
      const gameDateET = this.convertToET(gameDate);
      
      // Validate that the conversion worked
      if (isNaN(gameDateET.getTime())) {
        console.warn('Invalid game date after conversion to ET:', gameDate);
        return false;
      }
      
      // Get the game's calendar date (ignore time)
      const gameYear = gameDateET.getFullYear();
      const gameMonth = gameDateET.getMonth();
      const gameDay = gameDateET.getDate();
      
      // Current time components
      const nowYear = nowET.getFullYear();
      const nowMonth = nowET.getMonth();
      const nowDay = nowET.getDate();
      const nowHour = nowET.getHours();
      
      // Check if game is today
      const isToday = nowYear === gameYear && nowMonth === gameMonth && nowDay === gameDay;
      
      if (isToday) {
        return true;
      }
      
      // Check if we're in the 2am extension period (next day, before 2am)
      // If current time is before 2am, check if game was yesterday
      if (nowHour < 2) {
        const yesterday = new Date(nowET);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const yesterdayYear = yesterday.getFullYear();
        const yesterdayMonth = yesterday.getMonth();
        const yesterdayDay = yesterday.getDate();
        
        return yesterdayYear === gameYear && yesterdayMonth === gameMonth && yesterdayDay === gameDay;
      }
      
      return false;
    } catch (error) {
      console.warn('Error checking if game is today:', error);
      return false;
    }
  }
  
  /**
   * Check if chat should be available for a game
   * @param {Object} gameData - Game data object with date information
   * @returns {boolean} - True if chat should be available
   */
  static isChatAvailable(gameData) {
    if (!gameData) return false;

    // Check various possible date fields in game data and log them for debugging
    const possibleDateFields = [
      // Common fields
      { key: 'gameDate', value: gameData.gameDate },
      { key: 'date', value: gameData.date },
      { key: 'startTime', value: gameData.startTime },
      { key: 'datetime.originalDate', value: gameData.datetime?.originalDate },
      { key: 'gameData.datetime.originalDate', value: gameData.gameData?.datetime?.originalDate },
      { key: 'competitions[0].date', value: gameData.competitions?.[0]?.date },
      { key: 'competitions[0].startDate', value: gameData.competitions?.[0]?.startDate },
      // ESPN-specific fields (often nested under header)
      { key: 'header.competitions[0].date', value: gameData.header?.competitions?.[0]?.date },
      { key: 'header.competitions[0].startDate', value: gameData.header?.competitions?.[0]?.startDate },
      { key: 'event_date', value: gameData.event_date || gameData.eventDate },
      { key: 'start_date', value: gameData.start_date || gameData.startDate },
      { key: 'start', value: gameData.start },
      { key: 'scheduled', value: gameData.scheduled },
      { key: 'kickoff', value: gameData.kickoff },
      { key: 'awayTeam.gameDate || homeTeam.gameDate', value: gameData.awayTeam?.gameDate || gameData.homeTeam?.gameDate }
    ];

    // Debug log each candidate field and the parsed results
    for (const field of possibleDateFields) {
      if (!field || field.value == null) {
        console.debug(`[ChatUtils] candidate ${field?.key} = <empty>`);
        continue;
      }

      try {
        const normalized = this.normalizeDate(field.value);
        const parsedValid = normalized !== null && !isNaN(normalized.getTime());
        const parsedET = parsedValid ? this.convertToET(normalized) : null;
        console.debug(`[ChatUtils] candidate ${field.key} => raw: ${String(field.value)}, normalizedValid: ${parsedValid}, normalizedUTC: ${normalized ? normalized.toISOString() : '<invalid>'}, parsedET: ${parsedET ? parsedET.toString() : '<invalid>'}`);

        if (parsedValid && this.isGameToday(normalized)) {
          console.info(`[ChatUtils] Chat available: matched field ${field.key} => ${parsedET ? parsedET.toDateString() : normalized.toDateString()}`);
          return true;
        }
      } catch (e) {
        console.warn(`[ChatUtils] Error parsing candidate ${field.key}:`, e);
      }
    }

    console.info('[ChatUtils] No matching game date found for today');
    return false;
  }
  
  /**
   * Get a formatted date string for Firebase collection naming (using Eastern Time)
   * @param {string|Date} gameDate - The game date
   * @returns {string} - Formatted date string (YYYY-MM-DD)
   */
  static getDateString(gameDate) {
    try {
      let dateET;
      
      if (!gameDate || isNaN(new Date(gameDate).getTime())) {
        // Use current date in Eastern Time as fallback
        dateET = this.getCurrentDateET();
      } else {
        // Convert to Eastern Time before formatting
        dateET = this.convertToET(gameDate);
      }
      
      // Format date safely
      const year = dateET.getFullYear();
      const month = String(dateET.getMonth() + 1).padStart(2, '0');
      const day = String(dateET.getDate()).padStart(2, '0');
      
      return `${year}-${month}-${day}`;
    } catch (error) {
      console.warn('Error formatting date string:', error);
      // Fallback to current date
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  
  /**
   * Clean up chat messages older than specified days
   * Note: This requires appropriate Firebase security rules or admin privileges
   * @param {number} daysOld - Number of days old to consider for cleanup (default: 2)
   * @returns {Promise<number>} - Number of messages deleted
   */
  static async cleanupOldMessages(daysOld = 2) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      const cutoffTimestamp = Timestamp.fromDate(cutoffDate);
      
      console.log(`Starting cleanup of messages older than ${daysOld} days (before ${cutoffDate.toISOString()})`);
      
      let totalDeleted = 0;
      const chatCollections = ['game-chats']; // Add more collections if needed
      
      for (const collectionName of chatCollections) {
        const q = query(
          collection(db, collectionName),
          where('timestamp', '<', cutoffTimestamp),
          limit(50) // Limit batch size to avoid overwhelming the database
        );
        
        const snapshot = await getDocs(q);
        console.log(`Found ${snapshot.size} old messages in ${collectionName}`);
        
        if (snapshot.size === 0) continue;
        
        // Process deletions in smaller batches to avoid permission issues
        const batchSize = 10;
        for (let i = 0; i < snapshot.docs.length; i += batchSize) {
          const batch = snapshot.docs.slice(i, i + batchSize);
          try {
            const deletePromises = batch.map(doc => deleteDoc(doc.ref));
            await Promise.all(deletePromises);
            totalDeleted += batch.length;
          } catch (batchError) {
            console.warn(`Failed to delete batch of ${batch.length} messages:`, batchError.message);
            // Continue with next batch instead of failing completely
          }
        }
      }
      
      console.log(`Cleanup completed. Deleted ${totalDeleted} old messages.`);
      return totalDeleted;
      
    } catch (error) {
      // If this is a permission error, log as info (expected in production)
      if (error && (error.code === 'permission-denied' || (error.message && String(error.message).toLowerCase().includes('insufficient permissions')))) {
        console.info('Chat cleanup skipped due to insufficient permissions:', error.message || error);
      } else {
        console.error('Error during chat cleanup:', error);
      }
      // Don't throw error to prevent app crashes from cleanup failures
      return 0;
    }
  }
  
  /**
   * Schedule automatic cleanup to run periodically
   * Note: Cleanup is disabled in production due to Firebase security rules
   * @param {number} intervalHours - Hours between cleanup runs (default: 24)
   * @param {number} daysOld - Days old to clean up (default: 2)
   */
  static scheduleCleanup(intervalHours = 24, daysOld = 2) {
    if (!this.CLEANUP_ENABLED) {
      console.info('Chat cleanup disabled in production environment');
      return;
    }
    
    // Run cleanup immediately (with graceful error handling)
    this.cleanupOldMessages(daysOld).catch(error => {
      if (error.code === 'permission-denied' || error.message.includes('insufficient permissions')) {
        console.info('Chat cleanup skipped: Insufficient permissions (disabling future cleanups)');
        this.CLEANUP_ENABLED = false;
      } else {
        console.error('Initial cleanup failed:', error.message);
      }
    });
    
    // Schedule recurring cleanup
    const intervalMs = intervalHours * 60 * 60 * 1000;
    const cleanupInterval = setInterval(() => {
      if (!this.CLEANUP_ENABLED) {
        clearInterval(cleanupInterval);
        return;
      }
      
      this.cleanupOldMessages(daysOld).catch(error => {
        if (error.code === 'permission-denied' || error.message.includes('insufficient permissions')) {
          console.info('Scheduled cleanup skipped: Insufficient permissions (disabling future cleanups)');
          this.CLEANUP_ENABLED = false;
          clearInterval(cleanupInterval);
        } else {
          console.error('Scheduled cleanup failed:', error.message);
        }
      });
    }, intervalMs);
    
    console.log(`Scheduled automatic chat cleanup every ${intervalHours} hours for messages older than ${daysOld} days (dev mode only)`);
  }
  
  /**
   * Check if automatic cleanup is enabled
   * @returns {boolean} - True if cleanup is enabled
   */
  static isCleanupEnabled() {
    return this.CLEANUP_ENABLED;
  }
  
  /**
   * Manually trigger cleanup (useful for testing or admin functions)
   * @param {number} daysOld - Days old to clean up
   * @returns {Promise<number>} - Number of messages deleted
   */
  static async manualCleanup(daysOld = 2) {
    console.log('Manual cleanup triggered');
    return await this.cleanupOldMessages(daysOld);
  }
  
  /**
   * Get a user-friendly message for when chat is not available
   * @param {Object} gameData - Game data object
   * @returns {string} - Message to display to user
   */
  static getChatUnavailableMessage(gameData) {
    try {
      if (!gameData) {
        return "Chat is only available for today's games (until 2am EST the next day).";
      }
      
      const gameDate = this.getGameDateFromData(gameData);
      if (gameDate) {
        try {
          // Convert to Eastern Time for display using our safe method
          const gameDateET = this.convertToET(gameDate);
          
          // Validate the date conversion worked
          if (isNaN(gameDateET.getTime())) {
            console.warn('Invalid game date after ET conversion:', gameDate);
            return "Chat is only available for today's games (until 2am EST the next day).";
          }
          
          // Safely format the date with validation
          const month = gameDateET.getMonth() + 1;
          const day = gameDateET.getDate();
          const year = gameDateET.getFullYear();
          
          if (isNaN(month) || isNaN(day) || isNaN(year)) {
            console.warn('NaN values in date formatting:', { month, day, year, gameDateET });
            return "Chat is only available for today's games (until 2am EST the next day).";
          }
          
          const formattedDate = `${month}/${day}/${year}`;
          return `Chat is only available for today's games (until 2am EST the next day). This game was on ${formattedDate}.`;
        } catch (dateError) {
          console.warn('Error formatting game date:', dateError, 'Original game date:', gameDate);
          return "Chat is only available for today's games (until 2am EST the next day).";
        }
      }
      
      return "Chat is only available for today's games (until 2am EST the next day).";
    } catch (error) {
      console.warn('Error getting chat unavailable message:', error);
      return "Chat is only available for today's games (until 2am EST the next day).";
    }
  }
  
  /**
   * Extract game date from various possible game data structures
   * @param {Object} gameData - Game data object
   * @returns {string|null} - Game date string or null
   */
  static getGameDateFromData(gameData) {
    const candidates = [
      { key: 'gameDate', value: gameData.gameDate },
      { key: 'date', value: gameData.date },
      { key: 'startTime', value: gameData.startTime },
      { key: 'datetime.originalDate', value: gameData.datetime?.originalDate },
      { key: 'gameData.datetime.originalDate', value: gameData.gameData?.datetime?.originalDate },
      { key: 'competitions[0].date', value: gameData.competitions?.[0]?.date },
      { key: 'competitions[0].startDate', value: gameData.competitions?.[0]?.startDate },
      { key: 'header.competitions[0].date', value: gameData.header?.competitions?.[0]?.date },
      { key: 'header.competitions[0].startDate', value: gameData.header?.competitions?.[0]?.startDate },
      { key: 'event_date', value: gameData.event_date || gameData.eventDate },
      { key: 'start_date', value: gameData.start_date || gameData.startDate },
      { key: 'start', value: gameData.start },
      { key: 'scheduled', value: gameData.scheduled },
      { key: 'kickoff', value: gameData.kickoff },
      { key: 'awayTeam.gameDate || homeTeam.gameDate', value: gameData.awayTeam?.gameDate || gameData.homeTeam?.gameDate }
    ];

    for (const c of candidates) {
      if (c.value != null) {
        const normalized = this.normalizeDate(c.value);
        console.debug(`[ChatUtils] Candidate ${c.key} raw=${String(c.value)} normalized=${normalized ? normalized.toISOString() : '<invalid>'}`);
        if (normalized) return normalized;
      } else {
        console.debug(`[ChatUtils] Candidate ${c.key} is empty`);
      }
    }

    console.debug('[ChatUtils] No game date found in gameData');
    return null;
  }
  
  /**
   * Debug helper to log timezone information and chat availability
   * @param {string|Date} gameDate - Game date to debug
   * @param {Object} gameData - Full game data object
   */
  static debugTimezone(gameDate, gameData = null) {
    console.log('=== ChatUtils Debug ===');
    console.log('Platform:', Platform?.OS || 'unknown');
    console.log('Current UTC time:', new Date().toISOString());
    
    try {
      const currentET = this.getCurrentDateET();
      console.log('Current ET time:', currentET.toString());
      console.log('Current ET valid:', !isNaN(currentET.getTime()));
      console.log('Current ET hour:', currentET.getHours());
    } catch (etError) {
      console.log('Error getting current ET:', etError);
    }
    
    if (gameDate) {
      console.log('Game date (original):', gameDate);
      try {
        const parsedUTC = new Date(gameDate);
        console.log('Game date (parsed UTC):', parsedUTC.toISOString());
        console.log('Game date UTC valid:', !isNaN(parsedUTC.getTime()));
        
        const convertedET = this.convertToET(gameDate);
        console.log('Game date (converted to ET):', convertedET.toString());
        console.log('Game date ET valid:', !isNaN(convertedET.getTime()));
        
        console.log('Is game today (with 2am extension)?', this.isGameToday(gameDate));
      } catch (gameError) {
        console.log('Error processing game date:', gameError);
      }
    }
    
    if (gameData) {
      console.log('Chat available?', this.isChatAvailable(gameData));
      console.log('Chat message:', this.getChatUnavailableMessage(gameData));
    }
    
    console.log('=======================');
  }
}

export default ChatUtils;
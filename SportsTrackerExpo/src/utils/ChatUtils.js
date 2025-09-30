import { collection, query, where, getDocs, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Chat utility functions for managing game-based chat restrictions and cleanup
 */
export class ChatUtils {
  
  /**
   * Check if a game date is today
   * @param {string|Date} gameDate - The game date to check
   * @returns {boolean} - True if the game is today
   */
  static isGameToday(gameDate) {
    if (!gameDate) return false;
    
    const today = new Date();
    const game = new Date(gameDate);
    
    // Reset time to midnight for accurate date comparison
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const gameMidnight = new Date(game.getFullYear(), game.getMonth(), game.getDate());
    
    return todayMidnight.getTime() === gameMidnight.getTime();
  }
  
  /**
   * Check if chat should be available for a game
   * @param {Object} gameData - Game data object with date information
   * @returns {boolean} - True if chat should be available
   */
  static isChatAvailable(gameData) {
    if (!gameData) return false;
    
    // Check various possible date fields in game data
    const possibleDateFields = [
      gameData.gameDate,
      gameData.date,
      gameData.startTime,
      gameData.datetime?.originalDate,
      gameData.gameData?.datetime?.originalDate,
      gameData.competitions?.[0]?.date,
      gameData.awayTeam?.gameDate || gameData.homeTeam?.gameDate
    ];
    
    for (const dateField of possibleDateFields) {
      if (dateField && this.isGameToday(dateField)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Get a formatted date string for Firebase collection naming
   * @param {string|Date} gameDate - The game date
   * @returns {string} - Formatted date string (YYYY-MM-DD)
   */
  static getDateString(gameDate) {
    const date = new Date(gameDate);
    if (isNaN(date.getTime())) {
      return new Date().toISOString().split('T')[0];
    }
    return date.toISOString().split('T')[0];
  }
  
  /**
   * Clean up chat messages older than specified days
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
          where('timestamp', '<', cutoffTimestamp)
        );
        
        const snapshot = await getDocs(q);
        console.log(`Found ${snapshot.size} old messages in ${collectionName}`);
        
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        
        totalDeleted += snapshot.size;
      }
      
      console.log(`Cleanup completed. Deleted ${totalDeleted} old messages.`);
      return totalDeleted;
      
    } catch (error) {
      console.error('Error during chat cleanup:', error);
      throw error;
    }
  }
  
  /**
   * Schedule automatic cleanup to run periodically
   * @param {number} intervalHours - Hours between cleanup runs (default: 24)
   * @param {number} daysOld - Days old to clean up (default: 2)
   */
  static scheduleCleanup(intervalHours = 24, daysOld = 2) {
    // Run cleanup immediately
    this.cleanupOldMessages(daysOld).catch(error => {
      console.error('Initial cleanup failed:', error);
    });
    
    // Schedule recurring cleanup
    const intervalMs = intervalHours * 60 * 60 * 1000;
    setInterval(() => {
      this.cleanupOldMessages(daysOld).catch(error => {
        console.error('Scheduled cleanup failed:', error);
      });
    }, intervalMs);
    
    console.log(`Scheduled automatic chat cleanup every ${intervalHours} hours for messages older than ${daysOld} days`);
  }
  
  /**
   * Get a user-friendly message for when chat is not available
   * @param {Object} gameData - Game data object
   * @returns {string} - Message to display to user
   */
  static getChatUnavailableMessage(gameData) {
    if (!gameData) {
      return "Chat is only available for today's games.";
    }
    
    const gameDate = this.getGameDateFromData(gameData);
    if (gameDate) {
      const dateStr = new Date(gameDate).toLocaleDateString();
      return `Chat is only available for today's games. This game was on ${dateStr}.`;
    }
    
    return "Chat is only available for today's games.";
  }
  
  /**
   * Extract game date from various possible game data structures
   * @param {Object} gameData - Game data object
   * @returns {string|null} - Game date string or null
   */
  static getGameDateFromData(gameData) {
    const possibleDateFields = [
      gameData.gameDate,
      gameData.date,
      gameData.startTime,
      gameData.datetime?.originalDate,
      gameData.gameData?.datetime?.originalDate,
      gameData.competitions?.[0]?.date,
      gameData.awayTeam?.gameDate || gameData.homeTeam?.gameDate
    ];
    
    for (const dateField of possibleDateFields) {
      if (dateField) {
        return dateField;
      }
    }
    
    return null;
  }
}

export default ChatUtils;
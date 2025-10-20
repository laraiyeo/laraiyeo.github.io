import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Utility functions for managing streaming access across the app
 */

/**
 * Check if streaming is unlocked
 * @returns {Promise<boolean>} True if streaming is unlocked, false otherwise
 */
export const isStreamingUnlocked = async () => {
  try {
    const unlocked = await AsyncStorage.getItem('streamingUnlocked');
    return unlocked === 'true';
  } catch (error) {
    console.error('Error checking streaming unlock status:', error);
    return false;
  }
};

/**
 * Set streaming unlock status
 * @param {boolean} unlocked - Whether streaming should be unlocked
 * @returns {Promise<void>}
 */
export const setStreamingUnlocked = async (unlocked) => {
  try {
    if (unlocked) {
      await AsyncStorage.setItem('streamingUnlocked', 'true');
    } else {
      await AsyncStorage.removeItem('streamingUnlocked');
    }
  } catch (error) {
    console.error('Error setting streaming unlock status:', error);
    throw error;
  }
};

/**
 * React hook to use streaming unlock status
 * @returns {Object} Object containing isUnlocked state and checkStatus function
 */
import { useState, useEffect } from 'react';

export const useStreamingAccess = () => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkStatus = async () => {
    setIsLoading(true);
    try {
      const unlocked = await isStreamingUnlocked();
      setIsUnlocked(unlocked);
    } catch (error) {
      console.error('Error checking streaming access:', error);
      setIsUnlocked(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  return {
    isUnlocked,
    isLoading,
    checkStatus
  };
};
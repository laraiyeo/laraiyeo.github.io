import { useState, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { PresenceService } from "../services/PresenceService";

export const useGamePresence = (gameId) => {
  const [viewerData, setViewerData] = useState({ count: 0, viewers: [] });
  const [isJoined, setIsJoined] = useState(false);
  const unsubscribeRef = useRef(null);
  const isJoinedRef = useRef(false); // Track isJoined state with ref to avoid stale closure

  useEffect(() => {
    isJoinedRef.current = isJoined;
  }, [isJoined]);

  useEffect(() => {
    if (!gameId) return;

    console.log('🎮 useGamePresence - Starting for gameId:', gameId);

    // Join the game presence tracking
    const joinGame = async () => {
      try {
        console.log('🔗 useGamePresence - Attempting to join game:', gameId);
        const success = await PresenceService.joinGame(gameId);
        console.log('🔗 useGamePresence - Join result:', { gameId, success });
        setIsJoined(success);
        isJoinedRef.current = success;
      } catch (error) {
        console.error("❌ useGamePresence - Error joining game presence:", error);
      }
    };

    // Subscribe to viewer updates
    const subscribeToViewers = () => {
      try {
        console.log('📡 useGamePresence - Subscribing to viewers for:', gameId);
        const unsubscribe = PresenceService.subscribeToGameViewers(
          gameId,
          (data) => {
            console.log('📊 useGamePresence - Received viewer data:', { gameId, data });
            console.log('📊 useGamePresence - Raw count from data:', data.count);
            console.log('📊 useGamePresence - Current viewerData state before update:', viewerData);
            setViewerData(data);
            console.log('📊 useGamePresence - Updated viewerData state:', data);
          }
        );
        unsubscribeRef.current = unsubscribe;
      } catch (error) {
        console.error("Error subscribing to viewers:", error);
      }
    };

    joinGame();
    subscribeToViewers();

    // Cleanup on unmount or gameId change
    return () => {
      console.log('🧹 useGamePresence - Cleanup triggered for gameId:', gameId);
      console.log('🧹 useGamePresence - isJoined state during cleanup:', isJoined);
      console.log('🧹 useGamePresence - isJoinedRef.current during cleanup:', isJoinedRef.current);
      
      if (unsubscribeRef.current) {
        console.log('🧹 useGamePresence - Unsubscribing from Firebase for gameId:', gameId);
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      // Use the ref value to avoid stale closure
      if (gameId && isJoinedRef.current) {
        console.log('🧹 useGamePresence - About to call PresenceService.leaveGame for gameId:', gameId);
        try {
          PresenceService.leaveGame(gameId);
          console.log('🧹 useGamePresence - Successfully called PresenceService.leaveGame for gameId:', gameId);
        } catch (error) {
          console.error('🧹 useGamePresence - Error calling leaveGame:', error);
        }
        setIsJoined(false);
        isJoinedRef.current = false;
        console.log('🧹 useGamePresence - Set isJoined to false and isJoinedRef to false');
      } else {
        console.log('🧹 useGamePresence - NOT leaving game. Conditions:', {
          gameId: gameId,
          'isJoinedRef.current': isJoinedRef.current,
          'gameId truthy': !!gameId,
          'isJoinedRef truthy': !!isJoinedRef.current
        });
      }
      
      console.log('🧹 useGamePresence - Cleanup completed for gameId:', gameId);
    };
  }, [gameId]);

  // Also cleanup when component unmounts
  useEffect(() => {
    return () => {
      if (gameId && isJoined) {
        PresenceService.leaveGame(gameId);
      }
    };
  }, []);

  return {
    viewerCount: viewerData.count,
    viewers: viewerData.viewers,
    isJoined,
  };
};

// Read-only hook for displaying viewer counts without joining
export const useGamePresenceReadOnly = (gameId) => {
  const [viewerData, setViewerData] = useState({ count: 0, viewers: [] });
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    if (!gameId) return;

    console.log('👁️ useGamePresenceReadOnly - Setting up read-only subscription for gameId:', gameId);
    console.log('👁️ useGamePresenceReadOnly - Platform:', Platform.OS);

    // Only subscribe to viewer updates, don't join
    const subscribeToViewers = () => {
      try {
        console.log('📡 useGamePresenceReadOnly - Subscribing to viewers for:', gameId);
        const unsubscribe = PresenceService.subscribeToGameViewers(
          gameId,
          (data) => {
            console.log('📊 useGamePresenceReadOnly - Received viewer data:', { gameId, data });
            console.log('📊 useGamePresenceReadOnly - Platform:', Platform.OS, 'Count:', data.count);
            setViewerData(data);
          }
        );
        unsubscribeRef.current = unsubscribe;
      } catch (error) {
        console.error("❌ useGamePresenceReadOnly - Error subscribing to viewers:", error);
        console.error("❌ useGamePresenceReadOnly - Platform:", Platform.OS);
      }
    };

    subscribeToViewers();

    // Cleanup on unmount or gameId change
    return () => {
      if (unsubscribeRef.current) {
        console.log('🧹 useGamePresenceReadOnly - Cleaning up subscription for:', gameId);
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [gameId]);

  return {
    viewerCount: viewerData.count,
    viewers: viewerData.viewers,
  };
};

export const useMultipleGamePresence = (gameIds) => {
  const [gameViewers, setGameViewers] = useState({});
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    if (!gameIds || gameIds.length === 0) {
      setGameViewers({});
      return;
    }

    const unsubscribe = PresenceService.subscribeToMultipleGames(
      gameIds,
      (allGameData) => {
        setGameViewers(allGameData);
      }
    );

    unsubscribeRef.current = unsubscribe;

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [gameIds]);

  return gameViewers;
};

export default useGamePresence;

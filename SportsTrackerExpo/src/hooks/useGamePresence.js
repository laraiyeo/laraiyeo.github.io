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

    // Join the game presence tracking
    const joinGame = async () => {
      try {
        const success = await PresenceService.joinGame(gameId);
        setIsJoined(success);
        isJoinedRef.current = success;
      } catch (error) {
        console.error(
          "❌ useGamePresence - Error joining game presence:",
          error,
        );
      }
    };

    // Subscribe to viewer updates
    const subscribeToViewers = () => {
      try {
        const unsubscribe = PresenceService.subscribeToGameViewers(
          gameId,
          (data) => {
            setViewerData(data);
          },
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
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      // Use the ref value to avoid stale closure
      if (gameId && isJoinedRef.current) {
        try {
          PresenceService.leaveGame(gameId);
        } catch (error) {
          console.error("🧹 useGamePresence - Error calling leaveGame:", error);
        }
        setIsJoined(false);
        isJoinedRef.current = false;
      } else {
      }
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
    peak: viewerData.peak || null,
  };
};

// Read-only hook for displaying viewer counts without joining
export const useGamePresenceReadOnly = (gameId) => {
  const [viewerData, setViewerData] = useState({ count: 0, viewers: [] });
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    if (!gameId) return;

    // Only subscribe to viewer updates, don't join
    const subscribeToViewers = () => {
      try {
        const unsubscribe = PresenceService.subscribeToGameViewers(
          gameId,
          (data) => {
            setViewerData(data);
          },
        );
        unsubscribeRef.current = unsubscribe;
      } catch (error) {
        console.error(
          "❌ useGamePresenceReadOnly - Error subscribing to viewers:",
          error,
        );
        console.error("❌ useGamePresenceReadOnly - Platform:", Platform.OS);
      }
    };

    subscribeToViewers();

    // Cleanup on unmount or gameId change
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [gameId]);

  return {
    viewerCount: viewerData.count,
    viewers: viewerData.viewers,
    peak: viewerData.peak || null,
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
      },
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

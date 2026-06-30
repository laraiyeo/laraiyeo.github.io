import { useState, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { PresenceService } from "../services/PresenceService";

export const useGamePresence = (gameId) => {
  const [viewerData, setViewerData] = useState({ count: 0, viewers: [] });
  const [isRecorded, setIsRecorded] = useState(false);
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    if (!gameId) return;

    // Record the game view
    const recordGameView = async () => {
      try {
        const success = await PresenceService.recordGameView(gameId);
        setIsRecorded(success);
      } catch (error) {
        console.error(
          "❌ useGamePresence - Error recording game view:",
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

    recordGameView();
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
    isRecorded,
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
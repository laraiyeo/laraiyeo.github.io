import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BetDataContext = createContext();

const API_BASE_URL =
  "https://laraiyeogithubio-production-f5af.up.railway.app/api";

export const BetDataProvider = ({ children }) => {
  const [scoreboardData, setScoreboardData] = useState({});
  const [rostersData, setRostersData] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState({});
  const [currentPollingMode, setCurrentPollingMode] = useState({});
  const pollingIntervalRef = useRef({});
  const fetchCounterRef = useRef(0);
  const [currentSport, setCurrentSport] = useState("NBA");

  // Helper functions
  const getTimeDifferenceInMinutes = (date1, date2) => {
    return Math.abs(date2 - date1) / (1000 * 60);
  };

  const isGameLive = (status) => {
    return status?.type?.state === "in";
  };

  const isGameScheduled = (status) => {
    return status?.type?.state === "pre";
  };

  const findNextGameStart = (events) => {
    const now = new Date();
    const upcomingGames = events
      .filter((event) => {
        const gameDate = new Date(event.date);
        const status = event.competitions?.[0]?.status;
        return gameDate > now && isGameScheduled(status);
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    return upcomingGames.length > 0 ? new Date(upcomingGames[0].date) : null;
  };

  // Determine polling mode based on game states
  const determinePollingMode = (events) => {
    if (!events || !Array.isArray(events)) return "slow";

    let hasLiveGames = false;
    let hasScheduledGames = false;
    const now = new Date();

    // Check if any games are live or scheduled
    for (const event of events) {
      const status = event.competitions?.[0]?.status;
      if (isGameLive(status)) {
        hasLiveGames = true;
        break;
      }
      if (isGameScheduled(status)) {
        hasScheduledGames = true;
      }
    }

    // Find next game start time
    const nextGameTime = findNextGameStart(events);

    // Determine polling mode
    if (hasLiveGames) {
      return "fast"; // Games are live
    } else if (nextGameTime) {
      const minutesUntilStart = getTimeDifferenceInMinutes(now, nextGameTime);
      if (minutesUntilStart <= 5) {
        return "fast"; // Game starting within 5 minutes
      } else if (hasScheduledGames) {
        return "moderate"; // Games scheduled today but not imminent
      }
    }

    return "slow"; // No games scheduled
  };

  // Start polling with appropriate interval
  const startPolling = (mode, sport = "NBA") => {
    // Clear existing interval for this sport
    if (pollingIntervalRef.current[sport]) {
      clearInterval(pollingIntervalRef.current[sport]);
      pollingIntervalRef.current[sport] = null;
    }

    let interval;
    switch (mode) {
      case "fast":
        interval = 2000; // 2 seconds
        console.log(`[BetData ${sport}] Starting FAST polling (2 seconds)`);
        break;
      case "moderate":
        interval = 90000; // 90 seconds
        console.log(
          `[BetData ${sport}] Starting MODERATE polling (90 seconds)`
        );
        break;
      default:
        interval = 30 * 60 * 1000; // 30 minutes
        console.log(`[BetData ${sport}] Starting SLOW polling (30 minutes)`);
    }

    pollingIntervalRef.current[sport] = setInterval(() => {
      fetchScoreboard(sport);
    }, interval);

    setCurrentPollingMode((prev) => ({ ...prev, [sport]: mode }));
  };

  // Fetch scoreboard data
  const fetchScoreboard = useCallback(
    async (sport = "NBA") => {
      // Debug instrumentation: count calls and print short stack to identify callers
      try {
        fetchCounterRef.current = (fetchCounterRef.current || 0) + 1;
        const shortStack = (new Error().stack || "")
          .split("\n")
          .slice(2, 6)
          .join(" | ");
      } catch (dbgErr) {
        /* ignore debug failures */
      }
      try {
        const sportLower = sport.toLowerCase();
        const response = await fetch(
          `${API_BASE_URL}/scoreboard/${sportLower}`
        );
        const data = await response.json();
        setScoreboardData((prev) => ({ ...prev, [sport]: data }));
        setLastFetchTime((prev) => ({
          ...prev,
          [sport]: new Date().toISOString(),
        }));

        // Cache scoreboard data (best-effort). Handle quota errors gracefully.
        try {
          await AsyncStorage.setItem(
            `bet_scoreboard_data_${sport}`,
            JSON.stringify(data)
          );
          await AsyncStorage.setItem(
            `bet_scoreboard_time_${sport}`,
            new Date().toISOString()
          );
          console.log(`[BetData ${sport}] Cached scoreboard data`);
        } catch (cacheErr) {
          // AsyncStorage quota exceeded or other storage error — warn but don't fail the fetch
          console.warn(
            `[BetData ${sport}] Warning: failed to cache scoreboard data (ignored):`,
            cacheErr
          );
        }

        // Update polling mode based on new data
        const newMode = determinePollingMode(data?.events);
        if (newMode !== currentPollingMode[sport]) {
          startPolling(newMode, sport);
        }

        return data;
      } catch (error) {
        console.error(`Error fetching scoreboard for ${sport}:`, error);
        // Try to load from cache on error
        const cachedData = await AsyncStorage.getItem(
          `bet_scoreboard_data_${sport}`
        );
        if (cachedData) {
          setScoreboardData((prev) => ({
            ...prev,
            [sport]: JSON.parse(cachedData),
          }));
        }
        return null;
      }
    },
    [currentPollingMode]
  );

  // Fetch rosters data
  const fetchRosters = async (sport = "NBA") => {
    try {
      const sportLower = sport.toLowerCase();
      const response = await fetch(`${API_BASE_URL}/rosters/${sportLower}`);
      const data = await response.json();
      setRostersData((prev) => ({ ...prev, [sport]: data }));
      // Note: Rosters data is too large for AsyncStorage, so we don't cache it
      return data;
    } catch (error) {
      console.error(`Error fetching rosters for ${sport}:`, error);
      return null;
    }
  };

  // Initial fetch on login - fetch scoreboard first, rosters in background
  const fetchInitialData = async (sport = "NBA") => {
    setIsLoading(true);
    try {
      // Fetch scoreboard first (blocking)
      const data = await fetchScoreboard(sport);

      // Start polling based on initial data
      const initialMode = determinePollingMode(data?.events);
      startPolling(initialMode, sport);

      // Fetch rosters in background (non-blocking)
      fetchRosters(sport).catch((error) => {
        console.error("Background roster fetch failed:", error);
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load cached data on mount
  useEffect(() => {
    const loadCachedData = async () => {
      const sports = ["NBA", "NFL", "NHL", "UEFA"];
      try {
        // Load cached data for each sport
        for (const sport of sports) {
          const cachedScoreboard = await AsyncStorage.getItem(
            `bet_scoreboard_data_${sport}`
          );
          const cachedTime = await AsyncStorage.getItem(
            `bet_scoreboard_time_${sport}`
          );

          if (cachedScoreboard) {
            const data = JSON.parse(cachedScoreboard);
            setScoreboardData((prev) => ({ ...prev, [sport]: data }));

            // Start polling based on cached data
            const initialMode = determinePollingMode(data?.events);
            startPolling(initialMode, sport);
          } else {
            // No cached data — fetch scoreboard immediately, then start polling.
            try {
              const data = await fetchScoreboard(sport);
              const initialMode = determinePollingMode(data?.events);
              startPolling(initialMode || "slow", sport);
            } catch (e) {
              console.error(`[BetData ${sport}] Initial fetch failed:`, e);
              // fallback to slow polling
              startPolling("slow", sport);
            }
          }

          if (cachedTime) {
            setLastFetchTime((prev) => ({ ...prev, [sport]: cachedTime }));
          }
        }
      } catch (error) {
        console.error("Error loading cached data:", error);
        // Start slow polling for all sports even on error
        sports.forEach((sport) => startPolling("slow", sport));
      }
    };

    loadCachedData();

    // Cleanup on unmount
    return () => {
      // Clear all sport-specific polling intervals
      Object.keys(pollingIntervalRef.current).forEach((sport) => {
        if (pollingIntervalRef.current[sport]) {
          clearInterval(pollingIntervalRef.current[sport]);
          pollingIntervalRef.current[sport] = null;
          console.log(`[BetData ${sport}] Polling stopped`);
        }
      });
    };
  }, []);

  const value = {
    scoreboardData,
    rostersData,
    isLoading,
    lastFetchTime,
    currentPollingMode,
    currentSport,
    setCurrentSport,
    fetchScoreboard,
    fetchRosters,
    fetchInitialData,
  };

  return (
    <BetDataContext.Provider value={value}>{children}</BetDataContext.Provider>
  );
};

export const useBetData = () => {
  const context = useContext(BetDataContext);
  if (!context) {
    throw new Error("useBetData must be used within BetDataProvider");
  }
  return context;
};

import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BetDataContext = createContext();

const API_BASE_URL =
  "https://laraiyeogithubio-production-f5af.up.railway.app/api";

export const BetDataProvider = ({ children }) => {
  const [scoreboardData, setScoreboardData] = useState(null);
  const [rostersData, setRostersData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(null);

  // Fetch scoreboard data
  const fetchScoreboard = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/scoreboard`);
      const data = await response.json();
      setScoreboardData(data);
      setLastFetchTime(new Date().toISOString());

      // Cache scoreboard data
      await AsyncStorage.setItem("bet_scoreboard_data", JSON.stringify(data));
      await AsyncStorage.setItem(
        "bet_scoreboard_time",
        new Date().toISOString()
      );

      return data;
    } catch (error) {
      console.error("Error fetching scoreboard:", error);
      // Try to load from cache on error
      const cachedData = await AsyncStorage.getItem("bet_scoreboard_data");
      if (cachedData) {
        setScoreboardData(JSON.parse(cachedData));
      }
      return null;
    }
  };

  // Fetch rosters data
  const fetchRosters = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/rosters`);
      const data = await response.json();
      setRostersData(data);
      // Note: Rosters data is too large for AsyncStorage, so we don't cache it
      return data;
    } catch (error) {
      console.error("Error fetching rosters:", error);
      return null;
    }
  };

  // Initial fetch on login - fetch scoreboard first, rosters in background
  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      // Fetch scoreboard first (blocking)
      await fetchScoreboard();

      // Fetch rosters in background (non-blocking)
      fetchRosters().catch((error) => {
        console.error("Background roster fetch failed:", error);
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load cached data on mount
  useEffect(() => {
    const loadCachedData = async () => {
      try {
        const cachedScoreboard = await AsyncStorage.getItem(
          "bet_scoreboard_data"
        );
        const cachedRosters = await AsyncStorage.getItem("bet_rosters_data");
        const cachedTime = await AsyncStorage.getItem("bet_scoreboard_time");

        if (cachedScoreboard) {
          setScoreboardData(JSON.parse(cachedScoreboard));
        }
        if (cachedRosters) {
          setRostersData(JSON.parse(cachedRosters));
        }
        if (cachedTime) {
          setLastFetchTime(cachedTime);
        }
      } catch (error) {
        console.error("Error loading cached data:", error);
      }
    };

    loadCachedData();
  }, []);

  const value = {
    scoreboardData,
    rostersData,
    isLoading,
    lastFetchTime,
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

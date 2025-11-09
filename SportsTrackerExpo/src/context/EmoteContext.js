import React, { createContext, useContext, useState, useEffect } from "react";
import EmoteService from "../services/EmoteService";

const EmoteContext = createContext();

export const EmoteProvider = ({ children }) => {
  const [emotes, setEmotes] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [lastFetchTime, setLastFetchTime] = useState(0);

  // Cache duration: 24 hours
  const CACHE_DURATION = 24 * 60 * 60 * 1000;

  useEffect(() => {
    loadEmotes();
  }, []);

  const loadEmotes = async (forceRefresh = false) => {
    try {
      // Check if we need to refresh cache
      const now = Date.now();
      const cacheExpired = now - lastFetchTime > CACHE_DURATION;

      if (!forceRefresh && !cacheExpired && Object.keys(emotes).length > 0) {
        console.log("🎭 Using cached emotes");
        return emotes;
      }

      console.log("🎭 Loading fresh emotes...");
      setIsLoading(true);

      const emotesData = await EmoteService.getAllEmotesWithCache();
      setEmotes(emotesData);
      setLastFetchTime(now);

      console.log(`🎭 Loaded ${emotesData.all?.length || 0} emotes`);
    } catch (error) {
      console.error("🎭 Error loading emotes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getEmoteByName = (emoteName) => {
    if (!emotes.all) return null;
    return emotes.all.find((emote) => emote.name === emoteName);
  };

  const parseMessageForEmotes = (messageText) => {
    if (!messageText || !emotes?.all) {
      return [{ type: "text", content: messageText }];
    }

    return EmoteService.parseMessageForEmotes(messageText, emotes);
  };

  const parseMessageForEmotesWithCache = async (messageText) => {
    if (!messageText || !emotes?.all) {
      return [{ type: "text", content: messageText }];
    }

    return EmoteService.parseMessageForEmotesWithCache(messageText, emotes);
  };

  const value = {
    emotes,
    isLoading,
    loadEmotes,
    getEmoteByName,
    parseMessageForEmotes,
    parseMessageForEmotesWithCache,
    refreshEmotes: () => loadEmotes(true),
  };

  return (
    <EmoteContext.Provider value={value}>{children}</EmoteContext.Provider>
  );
};

export const useEmotes = () => {
  const context = useContext(EmoteContext);
  if (!context) {
    throw new Error("useEmotes must be used within an EmoteProvider");
  }
  return context;
};

export default EmoteContext;

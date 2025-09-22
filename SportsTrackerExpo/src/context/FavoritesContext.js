import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchAllFavoriteTeamCurrentGames } from '../utils/TeamPageUtils';

const FavoritesContext = createContext();

export const useFavorites = () => {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
};

export const FavoritesProvider = ({ children }) => {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoPopulating, setAutoPopulating] = useState(false);

  // Load favorites from AsyncStorage on app start
  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    try {
      const storedFavorites = await AsyncStorage.getItem('favorites');
      if (storedFavorites) {
        // Normalize loaded favorites to ensure teamId is always a string and keep currentGame shape
        const parsed = JSON.parse(storedFavorites);
        const normalized = parsed.map(fav => {
          try {
            // Support legacy shapes where the id was stored as `id` instead of `teamId`.
            const rawId = fav?.teamId ?? fav?.id ?? (fav?.team && (fav.team.teamId ?? fav.team.id));
            const id = rawId != null ? String(rawId) : rawId;
            // Ensure we always expose a teamId field for lookups
            return { ...fav, teamId: id };
          } catch (e) {
            return fav;
          }
        });
        // Persist normalization back to storage so future loads are consistent
        await AsyncStorage.setItem('favorites', JSON.stringify(normalized));
        console.log('FavoritesContext: normalized and loaded favorites', normalized.map(f => f.teamId));
        setFavorites(normalized);
        
        // AUTOMATICALLY POPULATE MISSING CURRENT GAMES ON APP LOAD
        // Use the global team page utility functions
        populateMissingCurrentGames(normalized).catch(err => 
          console.error('FavoritesContext: Auto-population failed:', err)
        );
      }
    } catch (error) {
      console.error('Error loading favorites:', error);
    } finally {
      setLoading(false);
    }
  };

  // AUTOMATIC CURRENT GAME POPULATION ON APP LOAD
  const populateMissingCurrentGames = async (favoriteTeams) => {
    setAutoPopulating(true);
    console.log('FavoritesContext: Auto-populating missing currentGame data using team page utils...');
    
    try {
      // Use the global utility function that extracts team page logic
      const results = await fetchAllFavoriteTeamCurrentGames(favoriteTeams, updateTeamCurrentGame);
      
      console.log('FavoritesContext: Auto-population completed with results:', results);
      
      // Refresh the favorites state to trigger FavoritesScreen update
      const updatedFavorites = await AsyncStorage.getItem('favorites');
      if (updatedFavorites) {
        const parsed = JSON.parse(updatedFavorites);
        setFavorites(parsed);
        console.log('FavoritesContext: Refreshed favorites state after auto-population');
      }
    } catch (error) {
      console.error('FavoritesContext: Auto-population error:', error);
    }
    
    setAutoPopulating(false);
  };

  // Helper to resolve an id from either an object or primitive; accepts team objects with different shapes
  const resolveId = (teamOrId) => {
    if (teamOrId == null) return null;
    if (typeof teamOrId === 'string' || typeof teamOrId === 'number') return String(teamOrId);
    // teamOrId is an object
    return String(teamOrId.teamId ?? teamOrId.id ?? teamOrId.team?.teamId ?? teamOrId.team?.id ?? teamOrId.espnId ?? teamOrId.uid ?? '');
  };

  const saveFavorites = async (newFavorites) => {
    try {
      await AsyncStorage.setItem('favorites', JSON.stringify(newFavorites));
    } catch (error) {
      console.error('Error saving favorites:', error);
    }
  };

  const addFavorite = async (team) => {
    const id = resolveId(team) || null;
    const normalizedTeam = { ...team, teamId: id };

    // Prevent adding duplicates with the same teamId
    // Use functional updater to avoid races with concurrent updates
    let result = null;
    setFavorites(prev => {
      const exists = id && prev.some(fav => String(fav.teamId) === id);
      if (exists) {
        console.log(`FavoritesContext: addFavorite skipped duplicate teamId=${id}`);
        result = prev;
        return prev;
      }
      const newFavorites = [...prev, normalizedTeam];
      result = newFavorites;
      return newFavorites;
    });
    try {
      await saveFavorites(result || []);
    } catch (e) {
      console.error('FavoritesContext: saveFavorites failed after addFavorite', e);
    }
    return result || favorites;
  };

  const removeFavorite = async (teamId) => {
    const id = resolveId(teamId) || null;
    if (!id) {
      console.log('FavoritesContext: removeFavorite called with empty id, skipping');
      return favorites;
    }

    // Use functional updater to avoid races; remove only the first matching occurrence
    let newFavorites = null;
    setFavorites(prev => {
      const index = prev.findIndex(fav => String(fav.teamId) === id);
      if (index === -1) {
        console.log(`FavoritesContext: removeFavorite did not find teamId=${id}`);
        newFavorites = prev;
        return prev;
      }
      const copy = [...prev];
      copy.splice(index, 1);
      newFavorites = copy;
      console.log(`FavoritesContext: removed favorite teamId=${id} at index=${index} (before count=${prev.length}, after count=${copy.length})`);
      return copy;
    });
    try {
      await saveFavorites(newFavorites || []);
    } catch (e) {
      console.error('FavoritesContext: saveFavorites failed after removeFavorite', e);
    }
    return newFavorites || favorites;
  };

  const toggleFavorite = async (team, currentGameData = null) => {
    const id = resolveId(team) || null;
    const isAlreadyFavorite = favorites.some(fav => String(fav.teamId) === id);

    if (isAlreadyFavorite) {
      return await removeFavorite(id);
    } else {
      // Add current game data if provided
      const teamWithGame = currentGameData ? {
        ...team,
        teamId: id,
        currentGame: {
          eventId: currentGameData.eventId,
          eventLink: currentGameData.eventLink,
          gameDate: currentGameData.gameDate,
          competition: currentGameData.competition,
          updatedAt: new Date().toISOString()
        }
      } : { ...team, teamId: id };

      const added = await addFavorite(teamWithGame);
      // If we added a favorite but no currentGame was provided, try to resolve one in the background
      if (!teamWithGame.currentGame) {
        // Fire-and-forget: resolve and persist if a UEFA match exists today
        resolveCurrentGameForTeam(id).catch(err => console.log('resolveCurrentGameForTeam failed:', err));
      }
      return added;
    }
  };

  // Background resolver: if a team is favorited without currentGame info, try to resolve
  // whether the team has a UEFA competition game today (UCL, UEL, UECL) and persist it.
  const resolveCurrentGameForTeam = async (teamId) => {
    try {
      if (!teamId) return null;
      const id = resolveId(teamId);
      // Helper to check a single competition
      const checkCompetition = async (leagueCode) => {
        try {
          const eventsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}/seasons/2025/teams/${id}/events?lang=en&region=us&limit=10`;
          const resp = await fetch(eventsUrl);
          if (!resp.ok) return null;
          const data = await resp.json();
          if (!data.items || data.items.length === 0) return null;

          // Today's range using same 2 AM cutoff logic as FavoritesScreen
          const now = new Date();
          const currentHour = now.getHours();
          const today = currentHour < 2 ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : new Date();
          const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

          for (const item of data.items) {
            try {
              const eventRef = item.$ref;
              const eventResp = await fetch(eventRef);
              if (!eventResp.ok) continue;
              const eventData = await eventResp.json();
              const eventDate = new Date(eventData.date);
              if (eventDate >= todayStart && eventDate < todayEnd) {
                // Found today's event for this competition
                return {
                  eventId: eventData.id ? String(eventData.id) : null,
                  eventLink: eventRef || null,
                  gameDate: eventData.date || null,
                  competition: leagueCode
                };
              }
            } catch (e) {
              // ignore individual event errors
            }
          }
        } catch (e) {
          // ignore competition-level errors
        }
        return null;
      };

      const competitions = ['uefa.champions', 'uefa.europa', 'uefa.europa.conf'];
      for (const comp of competitions) {
        const found = await checkCompetition(comp);
        if (found) {
          // Persist to favorites
          await updateTeamCurrentGame(id, found);
          return found;
        }
      }
    } catch (e) {
      console.log('resolveCurrentGameForTeam error:', e);
    }
    return null;
  };

  const updateTeamCurrentGame = async (teamId, currentGameData) => {
    const id = resolveId(teamId) || null;
    try {
      // Read persisted favorites to avoid races with recent adds that haven't flushed to state
      const stored = await AsyncStorage.getItem('favorites');
      const parsed = stored ? JSON.parse(stored) : favorites;

      // Normalize parsed favorites to ensure teamId exists
      const baseFavorites = Array.isArray(parsed) ? parsed.map(f => ({ ...f, teamId: f.teamId != null ? String(f.teamId) : f.teamId })) : [];

      let found = false;
      const updatedFavorites = baseFavorites.map(fav => {
        if (String(fav.teamId) === id) {
          found = true;
          return {
            ...fav,
            currentGame: {
              eventId: currentGameData.eventId,
              eventLink: currentGameData.eventLink,
              gameDate: currentGameData.gameDate,
              competition: currentGameData.competition,
              updatedAt: new Date().toISOString()
            }
          };
        }
        return fav;
      });

      // If the favorite wasn't present in storage, append it to avoid accidentally removing it
      if (!found) {
        const newFav = {
          teamId: id,
          teamName: null,
          sport: null,
          leagueCode: null,
          currentGame: {
            eventId: currentGameData.eventId,
            eventLink: currentGameData.eventLink,
            gameDate: currentGameData.gameDate,
            competition: currentGameData.competition,
            updatedAt: new Date().toISOString()
          }
        };
        updatedFavorites.push(newFav);
      }

      console.log(`FavoritesContext: updateTeamCurrentGame for teamId=${id}, eventId=${currentGameData?.eventId}`);
      // Use functional updater to avoid races with concurrent modifications
      setFavorites(prev => {
        try {
          const prevLength = (prev || []).length;
          console.log(`FavoritesContext: updateTeamCurrentGame merging (prevCount=${prevLength})`);
        } catch (e) {}
        return updatedFavorites;
      });
      await saveFavorites(updatedFavorites);
      console.log('FavoritesContext: favorite after updateTeamCurrentGame ->', updatedFavorites.find(f => String(f.teamId) === id));
      return updatedFavorites;
    } catch (e) {
      console.error('FavoritesContext: updateTeamCurrentGame error:', e);
      // Fallback: try the previous in-memory update
      const fallback = favorites.map(fav => {
        if (String(fav.teamId) === id) {
          return {
            ...fav,
            currentGame: {
              eventId: currentGameData.eventId,
              eventLink: currentGameData.eventLink,
              gameDate: currentGameData.gameDate,
              competition: currentGameData.competition,
              updatedAt: new Date().toISOString()
            }
          };
        }
        return fav;
      });
      setFavorites(fallback);
      await saveFavorites(fallback);
      return fallback;
    }
  };

  const getTeamCurrentGame = (teamId) => {
    const id = resolveId(teamId) || null;
    const team = favorites.find(fav => String(fav.teamId) === id);
    return team?.currentGame || null;
  };

  const clearTeamCurrentGame = async (teamId) => {
    const id = resolveId(teamId) || null;
    setFavorites(prev => {
      const updatedFavorites = (prev || []).map(fav => {
        if (String(fav.teamId) === id) {
          const { currentGame, ...teamWithoutGame } = fav;
          return teamWithoutGame;
        }
        return fav;
      });
      (async () => {
        try { await saveFavorites(updatedFavorites); } catch (e) { console.error('FavoritesContext: saveFavorites failed in clearTeamCurrentGame', e); }
      })();
      return updatedFavorites;
    });
    return favorites;
  };

  const clearAllFavorites = async () => {
    try {
      setFavorites([]);
      await AsyncStorage.removeItem('favorites');
    } catch (error) {
      console.error('Error clearing all favorites:', error);
    }
  };

  const isFavorite = (teamId) => {
    const id = resolveId(teamId) || null;
    return favorites.some(fav => String(fav.teamId) === id);
  };

  const getFavoriteTeams = () => {
    return favorites;
  };

  // Manual function to refresh current games for all favorites (can be called from UI)
  const refreshAllCurrentGames = async () => {
    console.log('FavoritesContext: Manual refresh of all current games requested');
    return await populateMissingCurrentGames(favorites);
  };

  const value = {
    favorites,
    loading,
    autoPopulating,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
    getFavoriteTeams,
    updateTeamCurrentGame,
    getTeamCurrentGame,
    clearTeamCurrentGame,
    clearAllFavorites,
    refreshAllCurrentGames,
  };

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
};
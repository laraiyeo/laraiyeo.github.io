import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchAllFavoriteTeamCurrentGames } from '../utils/TeamPageUtils';
import { normalizeTeamIdForStorage, migrateFavoritesToESPNIds, stripSportSuffix, addSportSuffix } from '../utils/TeamIdMapping';
import YearFallbackUtils from '../utils/YearFallbackUtils';

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
        let normalized = parsed.map(fav => {
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
        
        // Migrate MLB IDs to ESPN IDs for consistent storage
        const migrated = migrateFavoritesToESPNIds(normalized);
        const needsMigration = JSON.stringify(normalized) !== JSON.stringify(migrated);
        
        if (needsMigration) {
          console.log('FavoritesContext: Migrating MLB team IDs to ESPN IDs for consistency');
          console.log('FavoritesContext: Before migration:', normalized.filter(f => f.sport === 'mlb').map(f => `${f.teamName} (${f.teamId})`));
          console.log('FavoritesContext: After migration:', migrated.filter(f => f.sport === 'mlb').map(f => `${f.teamName} (${f.teamId})`));
          normalized = migrated;
        }
        
        // Persist normalization back to storage so future loads are consistent
        await AsyncStorage.setItem('favorites', JSON.stringify(normalized));
        console.log('FavoritesContext: normalized and loaded favorites', normalized.map(f => `${f.teamId} (${f.sport})`));
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

  // Helper to get stored-format id (with sport suffix) from an input team or id
  const resolveStoredId = (teamOrId, sportHint = null) => {
    const raw = resolveId(teamOrId);
    if (!raw) return null;
    // If already suffixed, return as-is
    const { id: baseId, sport: suffixSport } = stripSportSuffix(raw);
    const sport = (suffixSport || sportHint || (typeof teamOrId === 'object' && teamOrId?.sport) || null);
    return normalizeTeamIdForStorage(baseId, sport);
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
    // Normalize team ID for consistent storage (convert MLB IDs to ESPN IDs)
    const normalizedId = normalizeTeamIdForStorage(id, team.sport);
    const normalizedTeam = { ...team, teamId: normalizedId, sport: team.sport || stripSportSuffix(id).sport || null };

    // Prevent adding duplicates with the same teamId
    // Use functional updater to avoid races with concurrent updates
    let result = null;
    setFavorites(prev => {
      const exists = normalizedId && prev.some(fav => String(fav.teamId) === normalizedId);
      if (exists) {
        console.log(`FavoritesContext: addFavorite skipped duplicate teamId=${normalizedId} (original: ${id})`);
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
    const id = resolveStoredId(teamId) || null;
    if (!id) {
      console.log('FavoritesContext: removeFavorite called with empty id, skipping');
      return favorites;
    }
    
    // Note: We search by the provided ID since we don't know the sport context here
    // The stored favorites should already be normalized to ESPN IDs

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
    const normalizedId = resolveStoredId(team, team?.sport) || null;
    const isAlreadyFavorite = normalizedId && favorites.some(fav => String(fav.teamId) === normalizedId);

    if (isAlreadyFavorite) {
      return await removeFavorite(normalizedId);
    } else {
      // Add current game data if provided
      const teamWithGame = currentGameData ? {
        ...team,
        teamId: normalizedId,
        sport: team.sport || stripSportSuffix(normalizedId).sport || null,
        currentGame: {
          eventId: currentGameData.eventId,
          eventLink: currentGameData.eventLink,
          gameDate: currentGameData.gameDate,
          competition: currentGameData.competition,
          updatedAt: new Date().toISOString()
        }
      } : { ...team, teamId: normalizedId, sport: team.sport || stripSportSuffix(normalizedId).sport || null };

      const added = await addFavorite(teamWithGame);
      // If we added a favorite but no currentGame was provided, try to resolve one in the background
      if (!teamWithGame.currentGame) {
        // Fire-and-forget: resolve and persist if a UEFA match exists today
        resolveCurrentGameForTeam(normalizedId).catch(err => console.log('resolveCurrentGameForTeam failed:', err));
      }
      return added;
    }
  };

  // Background resolver: if a team is favorited without currentGame info, try to resolve
  // whether the team has a game today and persist it.
  const resolveCurrentGameForTeam = async (teamId) => {
    try {
      if (!teamId) return null;
      // Accept either raw/team object or stored suffixed id; get base id for API calls
      const raw = resolveId(teamId);
      const { id: baseId, sport: suffix } = stripSportSuffix(raw);
      const id = baseId;
      
      // Only resolve current games for soccer teams - other sports (NBA, WNBA, etc.) 
      // should use their respective team page logic, not this generic resolver
      const soccerSports = ['la liga', 'serie a', 'bundesliga', 'premier league', 'ligue 1', 'uefa champions', 'uefa europa', 'uefa europa conf'];
      const isSoccerTeam = suffix && soccerSports.includes(suffix.toLowerCase());
      
      if (!isSoccerTeam) {
        console.log(`FavoritesContext: Skipping resolveCurrentGameForTeam for non-soccer sport: ${suffix}`);
        return null;
      }
      
      // Helper to check a single soccer competition
      const checkCompetition = async (leagueCode) => {
        try {
          const eventsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueCode}/seasons/${YearFallbackUtils.getPreferredYear()}/teams/${id}/events?lang=en&region=us&limit=10`;
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

      // For soccer teams, check domestic competitions first (based on common leagues),
      // then fall back to UEFA competitions so domestic favorites are discovered.
      const domesticById = ['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1'];
      const uefaComps = ['uefa.champions', 'uefa.europa', 'uefa.europa.conf'];

      // If the stored id includes a sport hint, try to infer domestic competition from it
      const sportHint = suffix || '';
      const sportToDomestic = {
        'premier league': ['eng.1'],
        'la liga': ['esp.1'],
        'serie a': ['ita.1'],
        'bundesliga': ['ger.1'],
        'ligue 1': ['fra.1']
      };

      let checkOrder = [];
      if (sportToDomestic[sportHint]) checkOrder.push(...sportToDomestic[sportHint]);
      // default domestic list (covers teams without a specific sport hint)
      checkOrder.push(...domesticById);
      // finally check UEFA competitions
      checkOrder.push(...uefaComps);

      for (const comp of checkOrder) {
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
    const id = resolveStoredId(teamId) || null;
    try {
      // Read persisted favorites to avoid races with recent adds that haven't flushed to state
      const stored = await AsyncStorage.getItem('favorites');
      const parsed = stored ? JSON.parse(stored) : favorites;

      // Normalize parsed favorites to ensure teamId exists
  const baseFavorites = Array.isArray(parsed) ? parsed.map(f => ({ ...f, teamId: f.teamId != null ? String(f.teamId) : f.teamId })) : [];

      let found = false;
      const updatedFavorites = baseFavorites.map(fav => {
        // Compare normalized stored ids - strict matching to prevent cross-sport contamination
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
          sport: stripSportSuffix(id).sport || null,
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
    const id = resolveStoredId(teamId) || null;
    const team = favorites.find(fav => String(fav.teamId) === id);
    return team?.currentGame || null;
  };

  const clearTeamCurrentGame = async (teamId) => {
    const id = resolveStoredId(teamId) || null;
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

  const isFavorite = (teamId, sport = null) => {
    const storedId = resolveStoredId(teamId, sport) || null;
    if (!storedId) return false;

    // Soccer competitions should share favorites (teams play in multiple competitions)
    const soccerSports = ['la liga', 'serie a', 'bundesliga', 'premier league', 'ligue 1', 'uefa champions', 'uefa europa', 'uefa europa conf'];
    const isSoccerSport = sport && soccerSports.includes(sport.toLowerCase());

    if (sport) {
      // First check for exact match
      if (favorites.some(fav => String(fav.teamId) === storedId)) {
        return true;
      }

      // For soccer teams, check across all soccer competitions
      if (isSoccerSport) {
        const baseTeamId = stripSportSuffix(storedId).id;
        return favorites.some(fav => {
          const favSuffix = stripSportSuffix(fav.teamId);
          const favSport = favSuffix.sport;
          // Match if it's the same base team ID and the favorite is from any soccer competition
          return favSuffix.id === baseTeamId && favSport && soccerSports.includes(favSport.toLowerCase());
        });
      }

      // For non-soccer sports, require exact match to prevent cross-sport issues
      return false;
    }

    // If no sport provided, prefer exact stored id match first
    const exactMatch = favorites.find(fav => String(fav.teamId) === storedId);
    if (exactMatch) return true;

    // Only fallback to base id matching if the stored favorite has no sport suffix
    // This prevents cross-sport matching when favorites have explicit suffixes
    const base = stripSportSuffix(storedId).id;
    return favorites.some(fav => {
      const favSuffix = stripSportSuffix(fav.teamId);
      // Only match by base id if the favorite has no sport suffix
      return !favSuffix.sport && favSuffix.id === base;
    });
  };

  const getFavoriteTeams = () => {
    return favorites;
  };

  // Manual function to refresh current games for all favorites (can be called from UI)
  const refreshAllCurrentGames = async () => {
    console.log('FavoritesContext: Manual refresh of all current games requested');
    return await populateMissingCurrentGames(favorites);
  };

  // Function to clear corrupted currentGame data for specific sports (e.g., NBA/WNBA teams with NHL data)
  const clearCorruptedCurrentGames = async (targetSports = ['nba', 'wnba']) => {
    console.log(`FavoritesContext: Clearing corrupted currentGame data for sports: ${targetSports.join(', ')}`);
    
    setFavorites(prev => {
      const updatedFavorites = (prev || []).map(fav => {
        const favSport = String(fav.sport || '').toLowerCase();
        
        // If this is a target sport team with currentGame data
        if (targetSports.includes(favSport) && fav.currentGame) {
          const gameCompetition = String(fav.currentGame.competition || '').toLowerCase();
          
          // Check if the currentGame data doesn't match the team's sport
          if (!targetSports.includes(gameCompetition)) {
            console.log(`FavoritesContext: Clearing corrupted ${gameCompetition} data from ${favSport} team ${fav.teamId}`);
            const { currentGame, ...teamWithoutGame } = fav;
            return teamWithoutGame;
          }
        }
        
        return fav;
      });
      
      return updatedFavorites;
    });
    
    // Persist the cleaned data
    const cleanedFavorites = favorites.map(fav => {
      const favSport = String(fav.sport || '').toLowerCase();
      
      if (targetSports.includes(favSport) && fav.currentGame) {
        const gameCompetition = String(fav.currentGame.competition || '').toLowerCase();
        
        if (!targetSports.includes(gameCompetition)) {
          const { currentGame, ...teamWithoutGame } = fav;
          return teamWithoutGame;
        }
      }
      
      return fav;
    });
    
    await saveFavorites(cleanedFavorites);
    console.log('FavoritesContext: Corrupted currentGame data cleared and persisted');
    
    // Now refresh with correct data
    return await populateMissingCurrentGames(cleanedFavorites);
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
    clearCorruptedCurrentGames,
  };

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
};
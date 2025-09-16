import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

  // Load favorites from AsyncStorage on app start
  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    try {
      const storedFavorites = await AsyncStorage.getItem('favorites');
      if (storedFavorites) {
        setFavorites(JSON.parse(storedFavorites));
      }
    } catch (error) {
      console.error('Error loading favorites:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveFavorites = async (newFavorites) => {
    try {
      await AsyncStorage.setItem('favorites', JSON.stringify(newFavorites));
    } catch (error) {
      console.error('Error saving favorites:', error);
    }
  };

  const addFavorite = async (team) => {
    const newFavorites = [...favorites, team];
    setFavorites(newFavorites);
    await saveFavorites(newFavorites);
  };

  const removeFavorite = async (teamId) => {
    const newFavorites = favorites.filter(fav => fav.teamId !== teamId);
    setFavorites(newFavorites);
    await saveFavorites(newFavorites);
  };

  const toggleFavorite = async (team, currentGameData = null) => {
    const isAlreadyFavorite = favorites.some(fav => fav.teamId === team.teamId);
    
    if (isAlreadyFavorite) {
      await removeFavorite(team.teamId);
    } else {
      // Add current game data if provided
      const teamWithGame = currentGameData ? {
        ...team,
        currentGame: {
          eventId: currentGameData.eventId,
          eventLink: currentGameData.eventLink,
          gameDate: currentGameData.gameDate,
          competition: currentGameData.competition,
          updatedAt: new Date().toISOString()
        }
      } : team;
      
      await addFavorite(teamWithGame);
    }
  };

  const updateTeamCurrentGame = async (teamId, currentGameData) => {
    const updatedFavorites = favorites.map(fav => {
      if (fav.teamId === teamId) {
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
    
    setFavorites(updatedFavorites);
    await saveFavorites(updatedFavorites);
  };

  const getTeamCurrentGame = (teamId) => {
    const team = favorites.find(fav => fav.teamId === teamId);
    return team?.currentGame || null;
  };

  const clearTeamCurrentGame = async (teamId) => {
    const updatedFavorites = favorites.map(fav => {
      if (fav.teamId === teamId) {
        const { currentGame, ...teamWithoutGame } = fav;
        return teamWithoutGame;
      }
      return fav;
    });
    
    setFavorites(updatedFavorites);
    await saveFavorites(updatedFavorites);
  };

  const isFavorite = (teamId) => {
    return favorites.some(fav => fav.teamId === teamId);
  };

  const getFavoriteTeams = () => {
    return favorites;
  };

  const value = {
    favorites,
    loading,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
    getFavoriteTeams,
    updateTeamCurrentGame,
    getTeamCurrentGame,
    clearTeamCurrentGame,
  };

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
};
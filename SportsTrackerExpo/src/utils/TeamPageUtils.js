// Global utility functions extracted from team pages to fetch current games
// These can be called directly without navigating to team pages

/**
 * Fetch current game for MLB team using exact same logic as MLBTeamPageScreen
 */
export const fetchMLBTeamCurrentGame = async (teamId, updateTeamCurrentGameFunc) => {
  try {
    console.log(`[TEAM PAGE UTILS] Fetching MLB current game for team ${teamId}`);
    
    // Use the same date range logic as FavoritesScreen (12am today -> 2am tomorrow)
    const getMLBDateRange = () => {
      const now = new Date();
      const currentHour = now.getHours();
      
      let gameDay;
      if (currentHour < 2) {
        // Before 2 AM: use previous day (games from 12am today are "yesterday's" games)
        gameDay = new Date(now);
        gameDay.setDate(gameDay.getDate() - 1);
      } else {
        // After 2 AM: use current day 
        gameDay = new Date(now);
      }
      
      const today = gameDay.getFullYear() + "-" +
                   String(gameDay.getMonth() + 1).padStart(2, "0") + "-" +
                   String(gameDay.getDate()).padStart(2, "0");
      
      // Also check tomorrow for games that might start after midnight
      const tomorrow = new Date(gameDay);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.getFullYear() + "-" +
                         String(tomorrow.getMonth() + 1).padStart(2, "0") + "-" +
                         String(tomorrow.getDate()).padStart(2, "0");
      
      return { today, tomorrow: tomorrowStr };
    };

    const { today, tomorrow } = getMLBDateRange();
    console.log(`[TEAM PAGE UTILS] MLB date range: ${today} to ${tomorrow}`);
    
    // Fetch both today and tomorrow to cover the 12am->2am range
    const todayResponse = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&teamId=${teamId}&startDate=${today}&endDate=${tomorrow}&hydrate=team,linescore,decisions`
    );
    const todayData = await todayResponse.json();

    // Check if there's a game today - prioritize live games (exact same logic as team page)
    if (todayData.dates && todayData.dates.length > 0 && todayData.dates[0].games.length > 0) {
      const games = todayData.dates[0].games;
      
      // Helper function from team page
      const isGameLive = (game) => {
        if (!game || !game.status) return false;
        const state = game.status.abstractGameState;
        const detailedState = game.status.detailedState;
        return state === 'Live' || 
               (state === 'Preview' && detailedState === 'In Progress') ||
               detailedState === 'Manager challenge' ||
               game.status.codedGameState === 'M';
      };
      
      // First, look for any live games
      const liveGame = games.find(game => isGameLive(game));
      if (liveGame) {
        console.log(`[TEAM PAGE UTILS] Found live MLB game: ${liveGame.gamePk}`);
        
        // Store using the exact same format as team page
        await updateTeamCurrentGameFunc(teamId, {
          eventId: liveGame.gamePk,
          eventLink: liveGame.link || `/api/v1.1/game/${liveGame.gamePk}/feed/live`,
          gameDate: liveGame.gameDate,
          competition: 'mlb',
          updatedAt: new Date().toISOString()
        });
        return { success: true, game: liveGame, type: 'live' };
      }
      
      // If no live games, look for scheduled games
      const scheduledGame = games.find(game => 
        game.status.abstractGameState === 'Preview' || 
        game.status.detailedState.includes('Scheduled')
      );
      if (scheduledGame) {
        console.log(`[TEAM PAGE UTILS] Found scheduled MLB game: ${scheduledGame.gamePk}`);
        
        await updateTeamCurrentGameFunc(teamId, {
          eventId: scheduledGame.gamePk,
          eventLink: scheduledGame.link || `/api/v1.1/game/${scheduledGame.gamePk}/feed/live`,
          gameDate: scheduledGame.gameDate,
          competition: 'mlb',
          updatedAt: new Date().toISOString()
        });
        return { success: true, game: scheduledGame, type: 'scheduled' };
      }
      
      console.log(`[TEAM PAGE UTILS] MLB games found but none are live/scheduled:`, games.map(g => ({ 
        gamePk: g.gamePk, 
        status: g.status.detailedState,
        abstractState: g.status.abstractGameState 
      })));
    } else {
      console.log(`[TEAM PAGE UTILS] No MLB games found for team ${teamId} in date range ${today} to ${tomorrow}`);
      
      // Try looking ahead a few days for the next game (only if no games in current range)
      const nextDay = new Date(tomorrow);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = nextDay.toISOString().split('T')[0];
      
      console.log(`[TEAM PAGE UTILS] Checking next few days for MLB team ${teamId}...`);
      const futureResponse = await fetch(
        `https://statsapi.mlb.com/api/v1/schedule/games/?sportId=1&teamId=${teamId}&startDate=${tomorrow}&endDate=${nextDayStr}&hydrate=team,linescore,decisions`
      );
      const futureData = await futureResponse.json();
      
      if (futureData.dates && futureData.dates.length > 0) {
        for (const dateEntry of futureData.dates) {
          if (dateEntry.games && dateEntry.games.length > 0) {
            const nextGame = dateEntry.games[0];
            console.log(`[TEAM PAGE UTILS] Found future MLB game: ${nextGame.gamePk} on ${nextGame.gameDate}`);
            
            await updateTeamCurrentGameFunc(teamId, {
              eventId: nextGame.gamePk,
              eventLink: nextGame.link || `/api/v1.1/game/${nextGame.gamePk}/feed/live`,
              gameDate: nextGame.gameDate,
              competition: 'mlb',
              updatedAt: new Date().toISOString()
            });
            return { success: true, game: nextGame, type: 'future' };
          }
        }
      }
    }
    
    return { success: false, reason: 'No games found' };
  } catch (error) {
    console.error(`[TEAM PAGE UTILS] Error fetching MLB game for team ${teamId}:`, error);
    return { success: false, reason: error.message };
  }
};

/**
 * Fetch current game for NFL team using exact same logic as NFLTeamPageScreen
 */
export const fetchNFLTeamCurrentGame = async (teamId, updateTeamCurrentGameFunc) => {
  try {
    console.log(`[TEAM PAGE UTILS] Fetching NFL current game for team ${teamId}`);
    
    // Use exact same ESPN API as NFL team page
    const response = await fetch(`https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/${teamId}/events?lang=en&region=us`);
    const eventsData = await response.json();
    
    if (eventsData?.items) {
      console.log(`[TEAM PAGE UTILS] Found ${eventsData.items.length} NFL events for team ${teamId}`);
      
      // Look for current week games (same logic as NFL team page)
      const currentTime = new Date();
      let bestGame = null;
      
      for (const eventRef of eventsData.items) {
        try {
          const eventResponse = await fetch(eventRef.$ref);
          const eventData = await eventResponse.json();
          const gameDate = new Date(eventData.date);
          
          console.log(`[TEAM PAGE UTILS] NFL event ${eventData.id}: ${eventData.status?.type?.name} on ${eventData.date}`);
          
          // Check if game is live, scheduled for today, or upcoming
          if (eventData.status?.type?.name === 'STATUS_IN_PROGRESS' || 
              eventData.status?.type?.name === 'STATUS_HALFTIME') {
            console.log(`[TEAM PAGE UTILS] Found live NFL game: ${eventData.id}`);
            
            await updateTeamCurrentGameFunc(teamId, {
              eventId: eventData.id,
              eventLink: eventRef.$ref,
              gameDate: eventData.date,
              competition: 'nfl',
              updatedAt: new Date().toISOString()
            });
            return { success: true, game: eventData, type: 'live' };
          }
          
          if (eventData.status?.type?.name === 'STATUS_SCHEDULED' && gameDate >= currentTime) {
            if (!bestGame || gameDate < new Date(bestGame.date)) {
              bestGame = eventData;
              bestGame.eventLink = eventRef.$ref;
            }
          }
        } catch (e) {
          console.log(`[TEAM PAGE UTILS] Error processing NFL event: ${e.message}`);
        }
      }
      
      if (bestGame) {
        console.log(`[TEAM PAGE UTILS] Found scheduled NFL game: ${bestGame.id} on ${bestGame.date}`);
        
        await updateTeamCurrentGameFunc(teamId, {
          eventId: bestGame.id,
          eventLink: bestGame.eventLink,
          gameDate: bestGame.date,
          competition: 'nfl',
          updatedAt: new Date().toISOString()
        });
        return { success: true, game: bestGame, type: 'scheduled' };
      }
    }
    
    console.log(`[TEAM PAGE UTILS] No NFL games found for team ${teamId}`);
    return { success: false, reason: 'No games found' };
  } catch (error) {
    console.error(`[TEAM PAGE UTILS] Error fetching NFL game for team ${teamId}:`, error);
    return { success: false, reason: error.message };
  }
};

/**
 * Fetch current game for soccer team using exact same logic as UCLTeamPageScreen
 */
export const fetchSoccerTeamCurrentGame = async (teamId, updateTeamCurrentGameFunc) => {
  try {
    console.log(`[TEAM PAGE UTILS] Fetching soccer current game for team ${teamId}`);
    
    // Try multiple competitions (same as soccer team pages)
    const competitions = ['uefa.champions', 'uefa.europa', 'uefa.europa.conf'];
    
    for (const competition of competitions) {
      try {
        console.log(`[TEAM PAGE UTILS] Checking ${competition} for team ${teamId}`);
        
        const response = await fetch(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${competition}/teams/${teamId}/events?lang=en&region=us`);
        const eventsData = await response.json();
        
        if (eventsData?.items && eventsData.items.length > 0) {
          console.log(`[TEAM PAGE UTILS] Found ${eventsData.items.length} ${competition} events for team ${teamId}`);
          
          // Same logic as UCL team page - check recent events
          for (const eventRef of eventsData.items.slice(0, 5)) {
            try {
              const eventResponse = await fetch(eventRef.$ref);
              const eventData = await eventResponse.json();
              const gameDate = new Date(eventData.date);
              
              console.log(`[TEAM PAGE UTILS] ${competition} event ${eventData.id}: ${eventData.status?.type?.name} on ${eventData.date}`);
              
              // Check if game is live
              if (eventData.status?.type?.name === 'STATUS_IN_PROGRESS' || 
                  eventData.status?.type?.name === 'STATUS_HALFTIME') {
                console.log(`[TEAM PAGE UTILS] Found live ${competition} game: ${eventData.id}`);
                
                await updateTeamCurrentGameFunc(teamId, {
                  eventId: eventData.id,
                  eventLink: eventRef.$ref,
                  gameDate: eventData.date,
                  competition: competition,
                  updatedAt: new Date().toISOString()
                });
                return { success: true, game: eventData, type: 'live', competition };
              }
              
              // Check if game is scheduled for soon
              if (eventData.status?.type?.name === 'STATUS_SCHEDULED') {
                const timeDiff = gameDate.getTime() - new Date().getTime();
                if (timeDiff > 0 && timeDiff < 7 * 24 * 60 * 60 * 1000) { // Within a week
                  console.log(`[TEAM PAGE UTILS] Found scheduled ${competition} game: ${eventData.id} on ${eventData.date}`);
                  
                  await updateTeamCurrentGameFunc(teamId, {
                    eventId: eventData.id,
                    eventLink: eventRef.$ref,
                    gameDate: eventData.date,
                    competition: competition,
                    updatedAt: new Date().toISOString()
                  });
                  return { success: true, game: eventData, type: 'scheduled', competition };
                }
              }
            } catch (e) {
              console.log(`[TEAM PAGE UTILS] Error processing ${competition} event: ${e.message}`);
            }
          }
        } else {
          console.log(`[TEAM PAGE UTILS] No ${competition} events found for team ${teamId}`);
        }
      } catch (e) {
        console.log(`[TEAM PAGE UTILS] Error fetching ${competition} for team ${teamId}: ${e.message}`);
      }
    }
    
    console.log(`[TEAM PAGE UTILS] No soccer games found for team ${teamId} in any competition`);
    return { success: false, reason: 'No games found in any competition' };
  } catch (error) {
    console.error(`[TEAM PAGE UTILS] Error fetching soccer game for team ${teamId}:`, error);
    return { success: false, reason: error.message };
  }
};

/**
 * Master function to fetch current game for any team based on sport
 */
export const fetchTeamCurrentGame = async (teamId, sport, updateTeamCurrentGameFunc) => {
  const sportLower = String(sport || '').toLowerCase();
  
  if (sportLower === 'mlb' || sportLower === 'baseball') {
    return await fetchMLBTeamCurrentGame(teamId, updateTeamCurrentGameFunc);
  }
  
  if (sportLower === 'nfl' || sportLower === 'football') {
    return await fetchNFLTeamCurrentGame(teamId, updateTeamCurrentGameFunc);
  }
  
  if (sportLower === 'soccer' || 
      sportLower === 'premier league' || 
      sportLower === 'la liga' || 
      sportLower === 'serie a' || 
      sportLower === 'bundesliga' || 
      sportLower === 'ligue 1' ||
      sportLower.includes('uefa') ||
      sportLower.includes('champions') ||
      sportLower.includes('europa')) {
    return await fetchSoccerTeamCurrentGame(teamId, updateTeamCurrentGameFunc);
  }
  
  console.log(`[TEAM PAGE UTILS] Unsupported sport: ${sport}`);
  return { success: false, reason: `Unsupported sport: ${sport}` };
};

/**
 * Global function to fetch current games for all favorited teams IN PARALLEL
 */
export const fetchAllFavoriteTeamCurrentGames = async (favoriteTeams, updateTeamCurrentGameFunc) => {
  console.log(`[TEAM PAGE UTILS] Fetching current games for ${favoriteTeams.length} favorite teams in parallel`);
  
  // Filter out teams that already have currentGame
  const teamsToFetch = favoriteTeams.filter(team => {
    const teamName = team.teamName || team.displayName || 'Unknown Team';
    const teamId = team.teamId;
    const sport = team.sport;
    
    if (!teamId || !sport) {
      console.log(`[TEAM PAGE UTILS] Skipping ${teamName}: missing teamId or sport`);
      return false;
    }
    
    if (team.currentGame) {
      console.log(`[TEAM PAGE UTILS] Skipping ${teamName}: already has currentGame`);
      return false;
    }
    
    return true;
  });
  
  console.log(`[TEAM PAGE UTILS] Processing ${teamsToFetch.length} teams that need currentGame data`);
  
  if (teamsToFetch.length === 0) {
    console.log(`[TEAM PAGE UTILS] All teams already have currentGame data`);
    return [];
  }
  
  // Fetch all teams in parallel for much faster loading
  const fetchPromises = teamsToFetch.map(async (team) => {
    const teamName = team.teamName || team.displayName || 'Unknown Team';
    const teamId = team.teamId;
    const sport = team.sport;
    
    try {
      console.log(`[TEAM PAGE UTILS] Processing ${teamName} (${teamId}, ${sport})`);
      const result = await fetchTeamCurrentGame(teamId, sport, updateTeamCurrentGameFunc);
      return { team: teamName, ...result };
    } catch (error) {
      console.error(`[TEAM PAGE UTILS] Error processing ${teamName}:`, error);
      return { team: teamName, success: false, reason: error.message };
    }
  });
  
  // Wait for all fetches to complete
  const results = await Promise.all(fetchPromises);
  
  console.log(`[TEAM PAGE UTILS] Completed processing all favorite teams in parallel:`, results);
  return results;
};
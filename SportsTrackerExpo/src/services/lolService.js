// LoL Esports API Service using lolesports.com API
const LOL_API_BASE_URL = 'https://esports-api.lolesports.com/persisted/gw';
const LOL_LIVESTATS_BASE_URL = 'https://feed.lolesports.com/livestats/v1';

// API configuration
const API_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';

// Generic API call helper for LoL esports
export const lolApiCall = async (endpoint, options = {}) => {
    try {
        const url = `${LOL_API_BASE_URL}${endpoint}`;
        console.log(`LoL API Call: ${url}`);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY,
            },
            ...options
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`LoL API Error ${response.status}: ${errorText}`);
            throw new Error(`HTTP error! status: ${response.status}, response: ${errorText}`);
        }

        const data = await response.json();
        console.log(`LoL API Success: ${endpoint}`, data.data ? 'Data received' : 'No data');
        return data;
    } catch (error) {
        console.error('LoL API Error:', error);
        throw error;
    }
};

// Generic API call helper for LoL livestats
export const lolLivestatsCall = async (endpoint, options = {}) => {
    try {
        const url = `${LOL_LIVESTATS_BASE_URL}${endpoint}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY,
            },
            ...options
        });

        if (!response.ok) {
            // For livestats, we want to capture error messages for time discovery
            const errorText = await response.text();
            const error = new Error(`HTTP error! status: ${response.status}`);
            error.response = { status: response.status, text: errorText };
            throw error;
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('LoL Livestats API Error:', error);
        throw error;
    }
};

// Normalize timestamp to be divisible by 10 seconds (required by livestats API)
const normalizeStartingTime = (timestamp) => {
    const date = new Date(timestamp);
    const seconds = date.getSeconds();
    const normalizedSeconds = Math.floor(seconds / 10) * 10;
    date.setSeconds(normalizedSeconds, 0);
    return date.toISOString();
};

// Extract current broadcast time from API error messages
const extractCurrentTimeFromError = (errorText) => {
    try {
        // Try to parse as JSON first
        const errorData = JSON.parse(errorText);
        if (errorData.message) {
            const timeMatch = errorData.message.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
            if (timeMatch) {
                return timeMatch[1];
            }
        }
    } catch (e) {
        // If not JSON, try direct string matching
        const timeMatch = errorText.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
        if (timeMatch) {
            return timeMatch[1];
        }
    }
    return null;
};

// Get live matches/events
export const getLiveMatches = async () => {
    try {
        // Try getLive first, fallback to getSchedule if it doesn't exist
        let endpoint = '/getLive?hl=en-US';
        let data;
        
        try {
            data = await lolApiCall(endpoint);
            if (data.data && data.data.schedule && data.data.schedule.events) {
                return data.data.schedule.events.filter(event => 
                    event.state === 'inProgress'
                );
            }
        } catch (error) {
            // If getLive doesn't exist, use getSchedule and filter for live matches
            console.log('getLive not available, using getSchedule for live matches');
            const allMatches = await getScheduledMatches();
            return allMatches.filter(event => event.state === 'inProgress');
        }
        
        return [];
    } catch (error) {
        console.error('Error fetching live matches:', error);
        return [];
    }
};

// Get completed matches for a specific date
export const getCompletedMatches = async (date = new Date()) => {
    try {
        const allMatches = await getScheduledMatches();
        const targetDate = date.toISOString().split('T')[0];
        
        return allMatches.filter(event => {
            const eventDate = new Date(event.startTime).toISOString().split('T')[0];
            return event.state === 'completed' && eventDate === targetDate;
        });
    } catch (error) {
        console.error('Error fetching completed matches:', error);
        return [];
    }
};

// Get all scheduled matches (both completed and upcoming)
export const getScheduledMatches = async () => {
    try {
        const endpoint = '/getSchedule?hl=en-US';
        const data = await lolApiCall(endpoint);
        
        if (data.data && data.data.schedule && data.data.schedule.events) {
            return data.data.schedule.events;
        }
        
        return [];
    } catch (error) {
        console.error('Error fetching scheduled matches:', error);
        return [];
    }
};

// Get upcoming matches
export const getUpcomingMatches = async () => {
    try {
        const allMatches = await getScheduledMatches();
        const now = new Date();
        
        return allMatches.filter(event => 
            event.state === 'unstarted' && 
            new Date(event.startTime) > now
        );
    } catch (error) {
        console.error('Error fetching upcoming matches:', error);
        return [];
    }
};

// Get tournaments/leagues
export const getTournaments = async () => {
    try {
        const endpoint = '/getTournamentsForLeague?hl=en-US&leagueId=98767991299243165';
        const data = await lolApiCall(endpoint);
        
        if (data.data && data.data.leagues && data.data.leagues.length > 0) {
            return data.data.leagues[0].tournaments || [];
        }
        
        return [];
    } catch (error) {
        console.error('Error fetching tournaments:', error);
        return [];
    }
};

// Get teams
export const getTeams = async (tournamentId) => {
    try {
        const endpoint = `/getTeams?hl=en-US&tournamentId=${tournamentId}`;
        const data = await lolApiCall(endpoint);
        
        if (data.data && data.data.teams) {
            return data.data.teams;
        }
        
        return [];
    } catch (error) {
        console.error('Error fetching teams:', error);
        return [];
    }
};

// Get match details
export const getMatchDetails = async (matchId) => {
    try {
        const endpoint = `/getEventDetails?hl=en-US&id=${matchId}`;
        const data = await lolApiCall(endpoint);
        
        if (data.data && data.data.event) {
            return data.data.event;
        }
        
        return null;
    } catch (error) {
        console.error('Error fetching match details:', error);
        return null;
    }
};

// Get match window data (livestats)
export const getMatchWindow = async (gameId, startingTime) => {
    try {
        const normalizedTime = normalizeStartingTime(startingTime);
        const endpoint = `/window/${gameId}?startingTime=${normalizedTime}`;
        return await lolLivestatsCall(endpoint);
    } catch (error) {
        console.error('Error fetching match window:', error);
        throw error;
    }
};

// Get match details from livestats
export const getMatchLiveDetails = async (gameId, startingTime) => {
    try {
        const normalizedTime = normalizeStartingTime(startingTime);
        const endpoint = `/details/${gameId}?startingTime=${normalizedTime}`;
        return await lolLivestatsCall(endpoint);
    } catch (error) {
        console.error('Error fetching match live details:', error);
        throw error;
    }
};

// Get endgame statistics using optimized approach
export const getEndgameStats = async (gameId, gameDate) => {
    try {
        // Direct game date candidates - test multiple times around the provided date
        const baseDateStr = gameDate.split('T')[0]; // Extract date part
        const gameDateCandidates = [
            `${baseDateStr}T19:05:10.000Z`,
            `${baseDateStr}T18:05:10.000Z`,
            `${baseDateStr}T17:05:10.000Z`,
            `${baseDateStr}T20:05:10.000Z`,
        ];
        
        // Try direct game date approach first
        for (const candidate of gameDateCandidates) {
            try {
                console.log(`Trying direct game date: ${candidate}`);
                const windowData = await getMatchWindow(gameId, candidate);
                const detailsData = await getMatchLiveDetails(gameId, candidate);
                
                if (windowData && detailsData) {
                    console.log(`Success with game date: ${candidate}`);
                    return {
                        window: windowData,
                        details: detailsData,
                        timestamp: candidate
                    };
                }
            } catch (error) {
                console.log(`Game date ${candidate} failed:`, error.message);
                continue;
            }
        }
        
        // Fallback to discovery method if direct approach fails
        console.log('Direct approach failed, using discovery method...');
        return await discoverEndgameStats(gameId);
        
    } catch (error) {
        console.error('Error in getEndgameStats:', error);
        return null;
    }
};

// Fallback method: Discover current broadcast time using future date errors
const discoverEndgameStats = async (gameId) => {
    try {
        // Use a future date to get current broadcast time from error
        const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        
        try {
            await getMatchWindow(gameId, futureDate);
        } catch (error) {
            if (error.response) {
                const currentTime = extractCurrentTimeFromError(error.response.text);
                if (currentTime) {
                    console.log(`Discovered current broadcast time: ${currentTime}`);
                    
                    // Try to get data from discovered time
                    const windowData = await getMatchWindow(gameId, currentTime);
                    const detailsData = await getMatchLiveDetails(gameId, currentTime);
                    
                    return {
                        window: windowData,
                        details: detailsData,
                        timestamp: currentTime
                    };
                }
            }
        }
        
        throw new Error('Could not discover current broadcast time');
        
    } catch (error) {
        console.error('Error in discoverEndgameStats:', error);
        return null;
    }
};

// Format match data for consistent display
export const formatMatchData = (match) => {
    if (!match) return null;
    
    const teams = match.match?.teams || [];
    const teamNames = teams
        .filter(team => team && (team.name || team.code))
        .map(team => team.name || team.code);
    
    return {
        id: match.match?.id || match.id,
        name: teamNames.length > 0 ? teamNames.join(' vs ') : 'TBD',
        teams: teams,
        startTime: match.startTime,
        state: match.state,
        tournament: match.league?.name || '',
        series: match.match?.strategy?.type === 'bestOf' 
            ? `Best of ${match.match.strategy.count}` 
            : match.match?.strategy?.type || '',
        games: match.match?.games || [],
        blockName: match.blockName || '',
        flags: match.match?.flags || []
    };
};

// Get all leagues
export const getLeagues = async () => {
    try {
        const endpoint = '/getLeagues?hl=en-US';
        const data = await lolApiCall(endpoint);
        
        if (data.data && data.data.leagues) {
            return data.data.leagues;
        }
        
        return [];
    } catch (error) {
        console.error('Error fetching leagues:', error);
        return [];
    }
};

// Get tournaments for a specific league
export const getTournamentsForLeague = async (leagueId) => {
    try {
        const endpoint = `/getTournamentsForLeague?hl=en-US&leagueId=${leagueId}`;
        const data = await lolApiCall(endpoint);
        
        if (data.data && data.data.leagues && data.data.leagues.length > 0) {
            return data.data.leagues[0].tournaments || [];
        }
        
        return [];
    } catch (error) {
        console.error('Error fetching tournaments for league:', error);
        return [];
    }
};

// Get league standings (if available)
export const getStandings = async (tournamentId) => {
    try {
        const endpoint = `/getStandings?hl=en-US&tournamentId=${tournamentId}`;
        const data = await lolApiCall(endpoint);
        
        if (data.data && data.data.standings) {
            return data.data.standings;
        }
        
        return [];
    } catch (error) {
        console.error('Error fetching standings:', error);
        return [];
    }
};

// Get completed events for a tournament
export const getCompletedEvents = async (tournamentId) => {
    try {
        const endpoint = `/getCompletedEvents?hl=en-US&tournamentId=${tournamentId}`;
        const data = await lolApiCall(endpoint);
        
        if (data.data && data.data.schedule && data.data.schedule.events) {
            return data.data.schedule.events;
        }
        
        return [];
    } catch (error) {
        console.error('Error fetching completed events:', error);
        return [];
    }
};
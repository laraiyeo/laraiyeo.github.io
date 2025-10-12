// Valorant Match Service for individual match details
import { ribApiCall } from './valorantService';

// Fetch detailed match information including player stats, events, and economies
export const fetchMatchDetails = async (matchId) => {
    try {
        const data = await ribApiCall(`/matches/${matchId}/details`);
        return data;
    } catch (error) {
        console.error('Error fetching match details:', error);
        throw error;
    }
};

// Fetch series information for a match to get team data
export const fetchMatchSeries = async (matchId) => {
    try {
        const data = await ribApiCall(`/matches/${matchId}/series`);
        return data;
    } catch (error) {
        console.error('Error fetching match series:', error);
        throw error;
    }
};

// Process player stats to make them more UI-friendly
export const processPlayerStats = (playerStats) => {
    if (!playerStats || !Array.isArray(playerStats)) {
        return [];
    }

    return playerStats.map(player => ({
        ...player,
        // Calculate KDA ratio
        kdaRatio: player.deaths > 0 ? ((player.kills + player.assists) / player.deaths).toFixed(2) : 'Perfect',
        // Convert rating to percentage for display
        ratingPercentage: (parseFloat(player.rating) * 100).toFixed(1),
        // Parse defending rating
        defendingRatingFloat: parseFloat(player.defendingRating),
        // Format ACS (Average Combat Score)
        acsFormatted: Math.round(player.averageCombatScore || 0),
    }));
};

// Process events to extract round information
export const processRoundEvents = (events) => {
    if (!events || !Array.isArray(events)) {
        return [];
    }

    // Group events by round
    const roundsMap = new Map();
    
    events.forEach(event => {
        if (!event.roundNumber) return;
        
        if (!roundsMap.has(event.roundNumber)) {
            roundsMap.set(event.roundNumber, {
                roundNumber: event.roundNumber,
                events: [],
                attackingTeam: event.attackingTeamNumber,
                winner: null,
                winType: null,
                roundEndTime: null
            });
        }
        
        const round = roundsMap.get(event.roundNumber);
        round.events.push(event);
        
        // Check if this is a round end event
        if (event.eventType === 'round-end' || event.eventType === 'roundEnd') {
            round.winner = event.winningTeam || event.winnerTeamNumber;
            round.winType = event.winType || event.roundEndReason;
            round.roundEndTime = event.eventTime;
        }
    });

    return Array.from(roundsMap.values()).sort((a, b) => a.roundNumber - b.roundNumber);
};

// Process economy data for buy phases
export const processEconomyData = (economies) => {
    if (!economies || !Array.isArray(economies)) {
        return [];
    }

    return economies.map(economy => ({
        ...economy,
        // Add formatted credits
        creditsFormatted: economy.credits?.toLocaleString() || '0',
        // Process weapon purchases
        weaponsPurchased: economy.weapons || [],
        // Process ability purchases
        abilitiesPurchased: economy.abilities || [],
    }));
};

// Get team statistics from player stats
export const getTeamStats = (playerStats, teamNumber) => {
    if (!playerStats || !Array.isArray(playerStats)) {
        return null;
    }

    const teamPlayers = playerStats.filter(player => player.teamNumber === teamNumber);
    
    if (teamPlayers.length === 0) {
        return null;
    }

    const totalKills = teamPlayers.reduce((sum, player) => sum + (player.kills || 0), 0);
    const totalDeaths = teamPlayers.reduce((sum, player) => sum + (player.deaths || 0), 0);
    const totalAssists = teamPlayers.reduce((sum, player) => sum + (player.assists || 0), 0);
    const totalACS = teamPlayers.reduce((sum, player) => sum + (player.averageCombatScore || 0), 0);
    const avgRating = teamPlayers.reduce((sum, player) => sum + (parseFloat(player.rating) || 0), 0) / teamPlayers.length;

    return {
        teamNumber,
        players: teamPlayers,
        totalKills,
        totalDeaths,
        totalAssists,
        totalACS: Math.round(totalACS),
        avgACS: Math.round(totalACS / teamPlayers.length),
        avgRating: avgRating.toFixed(3),
        kdRatio: totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : 'Perfect'
    };
};

// Get half-time statistics
export const getHalfTimeStats = (rounds) => {
    if (!rounds || !Array.isArray(rounds)) {
        return { firstHalf: null, secondHalf: null };
    }

    const firstHalf = rounds.filter(round => round.roundNumber <= 12);
    const secondHalf = rounds.filter(round => round.roundNumber > 12);

    const getHalfStats = (halfRounds, teamNumber) => {
        const teamWins = halfRounds.filter(round => round.winner === teamNumber).length;
        const totalRounds = halfRounds.length;
        return { wins: teamWins, total: totalRounds };
    };

    return {
        firstHalf: {
            team1: getHalfStats(firstHalf, 1),
            team2: getHalfStats(firstHalf, 2),
            rounds: firstHalf
        },
        secondHalf: {
            team1: getHalfStats(secondHalf, 1),
            team2: getHalfStats(secondHalf, 2),
            rounds: secondHalf
        }
    };
};

// Calculate win probability based on current state
export const calculateWinProbability = (team1Score, team2Score, totalRounds = 25) => {
    const remaining = totalRounds - (team1Score + team2Score);
    const team1Need = 13 - team1Score;
    const team2Need = 13 - team2Score;
    
    // Simple probability calculation (can be enhanced with more sophisticated algorithms)
    if (team1Need <= 0) return [100, 0];
    if (team2Need <= 0) return [0, 100];
    if (remaining <= 0) return [50, 50];
    
    const team1Prob = Math.min(100, Math.max(0, (remaining - team2Need + 1) / remaining * 100));
    const team2Prob = 100 - team1Prob;
    
    return [Math.round(team1Prob), Math.round(team2Prob)];
};

export default {
    fetchMatchDetails,
    processPlayerStats,
    processRoundEvents,
    processEconomyData,
    getTeamStats,
    getHalfTimeStats,
    calculateWinProbability
};
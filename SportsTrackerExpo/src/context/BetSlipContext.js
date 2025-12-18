import React, { createContext, useContext, useState, useCallback } from 'react';

const BetSlipContext = createContext();

export const useBetSlip = () => {
  const context = useContext(BetSlipContext);
  if (!context) {
    throw new Error('useBetSlip must be used within a BetSlipProvider');
  }
  return context;
};

export const BetSlipProvider = ({ children }) => {
  const [bets, setBets] = useState([]);
  const [isSlipOpen, setIsSlipOpen] = useState(false);
  const [submittedBets, setSubmittedBets] = useState([]); // Store submitted bets

  // Add or remove bet from slip
  const toggleBet = useCallback((bet) => {
    console.log('toggleBet called with:', bet);
    setBets((prevBets) => {
      console.log('Previous bets:', prevBets);
      
      // If bet is just an ID string, find and remove it
      if (typeof bet === 'string') {
        const filteredBets = prevBets.filter(b => b.id !== bet);
        console.log('Removing bet with ID:', bet);
        console.log('New bets array:', filteredBets);
        return filteredBets;
      }
      
      // Otherwise bet is an object
      const existingIndex = prevBets.findIndex(
        (b) => b.id === bet.id
      );
      console.log('Existing bet index:', existingIndex);

      if (existingIndex >= 0) {
        // Bet already exists, remove it
        const filteredBets = prevBets.filter(b => b.id !== bet.id);
        console.log('Removing existing bet:', bet.id);
        console.log('New bets array:', filteredBets);
        return filteredBets;
      } else {
        // Check max pick limit (10 bets)
        if (prevBets.length >= 10) {
          console.log('Max pick limit reached (10)');
          return prevBets;
        }

        // Find conflicting bets to remove
        let betsToRemove = [];

        // PLAYER PROP RESTRICTIONS (same player, same stat)
        if (bet.playerId && bet.statType) {
          prevBets.forEach(existingBet => {
            if (existingBet.playerId === bet.playerId && 
                existingBet.statType === bet.statType) {
              
              // Can't have multiple milestones for same player/stat
              if (bet.type === 'milestone' && existingBet.type === 'milestone') {
                betsToRemove.push(existingBet.id);
              }
              
              // Can't have both over and under for same player/stat
              if ((bet.type === 'over' && existingBet.type === 'under') ||
                  (bet.type === 'under' && existingBet.type === 'over')) {
                betsToRemove.push(existingBet.id);
              }
              
              // Can't have milestone and over/under for same player/stat
              if ((bet.type === 'milestone' && (existingBet.type === 'over' || existingBet.type === 'under')) ||
                  ((bet.type === 'over' || bet.type === 'under') && existingBet.type === 'milestone')) {
                betsToRemove.push(existingBet.id);
              }
            }
          });
        }

        // GAME LINE RESTRICTIONS
        if (bet.gameId && (bet.type === 'Spread' || bet.type === 'Total' || bet.type === 'Moneyline')) {
          prevBets.forEach(existingBet => {
            if (existingBet.gameId === bet.gameId) {
              
              // Can't select both moneylines (both teams)
              if (bet.type === 'Moneyline' && existingBet.type === 'Moneyline') {
                betsToRemove.push(existingBet.id);
              }
              
              // Can't select both game totals (over and under)
              if (bet.type === 'Total' && existingBet.type === 'Total') {
                betsToRemove.push(existingBet.id);
              }
              
              // Can't select both spreads (both teams)
              if (bet.type === 'Spread' && existingBet.type === 'Spread') {
                betsToRemove.push(existingBet.id);
              }
              
              // Can't select spread and moneyline for same team
              if ((bet.type === 'Spread' && existingBet.type === 'Moneyline' && bet.team === existingBet.team) ||
                  (bet.type === 'Moneyline' && existingBet.type === 'Spread' && bet.team === existingBet.team)) {
                betsToRemove.push(existingBet.id);
              }
            }
          });
        }

        // Remove conflicting bets
        const filteredBets = prevBets.filter(b => !betsToRemove.includes(b.id));
        
        // Add the new bet
        console.log('Adding bet:', bet);
        if (betsToRemove.length > 0) {
          console.log('Removed conflicting bets:', betsToRemove);
        }
        const newBets = [...filteredBets, bet];
        console.log('New bets array:', newBets);
        return newBets;
      }
    });
  }, []);

  // Check if a bet is selected
  const isBetSelected = useCallback((betId) => {
    return bets.some((b) => b.id === betId);
  }, [bets]);

  // Remove bet by ID
  const removeBet = useCallback((betId) => {
    setBets((prevBets) => prevBets.filter((b) => b.id !== betId));
  }, []);

  // Clear all bets
  const clearBets = useCallback(() => {
    setBets([]);
  }, []);

  // Calculate parlay odds (American odds to decimal conversion)
  const calculateParlayOdds = useCallback(() => {
    if (bets.length === 0) return 0;
    if (bets.length === 1) return bets[0].odds;

    // Convert American odds to decimal, multiply, convert back
    const decimalOdds = bets.map((bet) => {
      const odds = parseInt(bet.odds);
      if (odds > 0) {
        return (odds / 100) + 1;
      } else {
        return (100 / Math.abs(odds)) + 1;
      }
    });

    const totalDecimal = decimalOdds.reduce((acc, odd) => acc * odd, 1);
    
    // Convert back to American odds
    if (totalDecimal >= 2) {
      return '+' + Math.round((totalDecimal - 1) * 100);
    } else {
      return '-' + Math.round(100 / (totalDecimal - 1));
    }
  }, [bets]);

  // Calculate potential payout
  const calculatePayout = useCallback((stake) => {
    if (bets.length === 0 || !stake) return 0;

    const decimalOdds = bets.map((bet) => {
      const odds = parseInt(bet.odds);
      if (odds > 0) {
        return (odds / 100) + 1;
      } else {
        return (100 / Math.abs(odds)) + 1;
      }
    });

    const totalDecimal = decimalOdds.reduce((acc, odd) => acc * odd, 1);
    return (stake * totalDecimal).toFixed(2);
  }, [bets]);

  // Group bets by game
  const groupedBets = useCallback(() => {
    const groups = {};
    bets.forEach((bet) => {
      const key = bet.gameId || 'other';
      if (!groups[key]) {
        groups[key] = {
          gameInfo: bet.gameInfo,
          bets: [],
        };
      }
      groups[key].bets.push(bet);
    });
    return groups;
  }, [bets]);

  // Submit bet slip and store it
  const submitBetSlip = useCallback(async (amount, betslipData = null) => {
    if (bets.length === 0) return null;

    // Create bet slip object
    const betSlip = {
      id: Date.now().toString(),
      bets: [...bets],
      amount: parseFloat(amount),
      timestamp: new Date().toISOString(),
      status: 'open', // open, won, lost
      betslipData, // API response with events and bet results
    };

    // Add to submitted bets
    setSubmittedBets(prev => [betSlip, ...prev]);

    // Clear current bets
    setBets([]);

    return betSlip;
  }, [bets]);

  const value = {
    bets,
    toggleBet,
    isBetSelected,
    removeBet,
    clearBets,
    calculateParlayOdds,
    calculatePayout,
    groupedBets,
    isSlipOpen,
    setIsSlipOpen,
    submittedBets,
    submitBetSlip,
  };

  return (
    <BetSlipContext.Provider value={value}>
      {children}
    </BetSlipContext.Provider>
  );
};

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

  // Add or remove bet from slip
  const toggleBet = useCallback((bet) => {
    console.log('toggleBet called with:', bet);
    setBets((prevBets) => {
      console.log('Previous bets:', prevBets);
      const existingIndex = prevBets.findIndex(
        (b) => b.id === bet.id
      );
      console.log('Existing bet index:', existingIndex);

      if (existingIndex >= 0) {
        // Remove bet if already selected
        console.log('Removing bet:', bet.id);
        return prevBets.filter((_, index) => index !== existingIndex);
      } else {
        // Add bet
        console.log('Adding bet:', bet);
        const newBets = [...prevBets, bet];
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
  };

  return (
    <BetSlipContext.Provider value={value}>
      {children}
    </BetSlipContext.Provider>
  );
};

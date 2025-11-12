// Shared state management for FIFA World Cup competition selection
// This allows competition selection to persist across different FIFA screens

let currentCompetition = "fifa.world"; // Default competition
const listeners = new Set();

export const FIFACompetitionState = {
  // Get current competition
  getCurrentCompetition() {
    return currentCompetition;
  },

  // Set current competition and notify listeners
  setCurrentCompetition(competitionId) {
    if (currentCompetition !== competitionId) {
      const previousCompetition = currentCompetition;
      currentCompetition = competitionId;
      console.log(
        `FIFACompetitionState: Competition changed from ${previousCompetition} to: ${competitionId}`
      );

      // Log call stack to see who's calling this
      if (
        competitionId === "fifa.world" &&
        previousCompetition !== "fifa.world"
      ) {
        console.log(
          "FIFACompetitionState: WARNING - Competition reset to fifa.world:",
          new Error().stack
        );
      }

      // Notify all listeners
      listeners.forEach((listener) => {
        try {
          listener(competitionId);
        } catch (error) {
          console.error("FIFACompetitionState: Error in listener:", error);
        }
      });
    }
  },

  // Subscribe to competition changes
  subscribe(listener) {
    listeners.add(listener);

    // Return unsubscribe function
    return () => {
      listeners.delete(listener);
    };
  },

  // Clear all listeners (useful for cleanup)
  clearListeners() {
    listeners.clear();
  },
};

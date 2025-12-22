import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createBetslip,
  getUserBetslips,
  getUserProfile,
  placeBet,
} from "../services/betService";

const BetSlipContext = createContext();

export const useBetSlip = () => {
  const context = useContext(BetSlipContext);
  if (!context) {
    throw new Error("useBetSlip must be used within a BetSlipProvider");
  }
  return context;
};

export const BetSlipProvider = ({ children }) => {
  const [bets, setBets] = useState([]);
  const [isSlipOpen, setIsSlipOpen] = useState(false);
  const [submittedBets, setSubmittedBets] = useState([]); // Store submitted bets
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const v = await AsyncStorage.getItem("@is_pro");
        if (v === "1") {
          if (mounted) setIsPro(true);
          return;
        }
      } catch (e) {}

      try {
        const prof = await getUserProfile();
        if (prof && prof.success && prof.profile && prof.profile.is_pro) {
          if (mounted) setIsPro(true);
        } else {
          if (mounted) setIsPro(false);
        }
      } catch (e) {
        if (mounted) setIsPro(false);
      }
    })();
    return () => (mounted = false);
  }, []);

  // Add or remove bet from slip
  const toggleBet = useCallback((bet) => {
    console.log("toggleBet called with:", bet);
    setBets((prevBets) => {
      console.log("Previous bets:", prevBets);

      // If bet is just an ID string, find and remove it
      if (typeof bet === "string") {
        const filteredBets = prevBets.filter((b) => b.id !== bet);
        console.log("Removing bet with ID:", bet);
        console.log("New bets array:", filteredBets);
        return filteredBets;
      }

      // Otherwise bet is an object
      const existingIndex = prevBets.findIndex((b) => b.id === bet.id);
      console.log("Existing bet index:", existingIndex);

      if (existingIndex >= 0) {
        // Bet already exists, remove it
        const filteredBets = prevBets.filter((b) => b.id !== bet.id);
        console.log("Removing existing bet:", bet.id);
        console.log("New bets array:", filteredBets);
        return filteredBets;
      } else {
        // Check max pick limit (10 bets)
        if (prevBets.length >= 10) {
          console.log("Max pick limit reached (10)");
          return prevBets;
        }

        // Find conflicting bets to remove
        let betsToRemove = [];

        // PLAYER PROP RESTRICTIONS (same player, same stat)
        if (bet.playerId && bet.statType) {
          prevBets.forEach((existingBet) => {
            if (
              existingBet.playerId === bet.playerId &&
              existingBet.statType === bet.statType
            ) {
              // Can't have multiple milestones for same player/stat
              if (
                bet.type === "milestone" &&
                existingBet.type === "milestone"
              ) {
                betsToRemove.push(existingBet.id);
              }

              // Can't have both over and under for same player/stat
              if (
                (bet.type === "over" && existingBet.type === "under") ||
                (bet.type === "under" && existingBet.type === "over")
              ) {
                betsToRemove.push(existingBet.id);
              }

              // Can't have milestone and over/under for same player/stat
              if (
                (bet.type === "milestone" &&
                  (existingBet.type === "over" ||
                    existingBet.type === "under")) ||
                ((bet.type === "over" || bet.type === "under") &&
                  existingBet.type === "milestone")
              ) {
                betsToRemove.push(existingBet.id);
              }
            }
          });
        }

        // GAME LINE RESTRICTIONS
        if (
          bet.gameId &&
          (bet.type === "Spread" ||
            bet.type === "Total" ||
            bet.type === "Moneyline")
        ) {
          prevBets.forEach((existingBet) => {
            if (existingBet.gameId === bet.gameId) {
              // Can't select both moneylines (both teams)
              if (
                bet.type === "Moneyline" &&
                existingBet.type === "Moneyline"
              ) {
                betsToRemove.push(existingBet.id);
              }

              // Can't select both game totals (over and under)
              if (bet.type === "Total" && existingBet.type === "Total") {
                betsToRemove.push(existingBet.id);
              }

              // Can't select both spreads (both teams)
              if (bet.type === "Spread" && existingBet.type === "Spread") {
                betsToRemove.push(existingBet.id);
              }

              // Can't select spread and moneyline for same team
              if (
                (bet.type === "Spread" &&
                  existingBet.type === "Moneyline" &&
                  bet.team === existingBet.team) ||
                (bet.type === "Moneyline" &&
                  existingBet.type === "Spread" &&
                  bet.team === existingBet.team)
              ) {
                betsToRemove.push(existingBet.id);
              }

              // NEW RULE: Can't select a negative spread for one team and the
              // moneyline for the opposing team. For example, you shouldn't be
              // able to back LAL -3.5 and also take LAC moneyline.
              try {
                const newIsSpreadFav =
                  bet.type === "Spread" && Number(bet.line) < 0;
                const existingIsSpreadFav =
                  existingBet.type === "Spread" && Number(existingBet.line) < 0;

                // If adding a negative spread, remove opposing moneyline
                if (
                  newIsSpreadFav &&
                  existingBet.type === "Moneyline" &&
                  existingBet.team !== bet.team
                ) {
                  betsToRemove.push(existingBet.id);
                }

                // If adding a moneyline, remove any negative spread on the opponent
                if (
                  bet.type === "Moneyline" &&
                  existingIsSpreadFav &&
                  existingBet.team !== bet.team
                ) {
                  betsToRemove.push(existingBet.id);
                }
              } catch (e) {
                // ignore parse errors
              }
            }
          });
        }

        // Remove conflicting bets
        const filteredBets = prevBets.filter(
          (b) => !betsToRemove.includes(b.id)
        );

        // Add the new bet
        console.log("Adding bet:", bet);
        if (betsToRemove.length > 0) {
          console.log("Removed conflicting bets:", betsToRemove);
        }
        const newBets = [...filteredBets, bet];
        console.log("New bets array:", newBets);
        return newBets;
      }
    });
  }, []);

  // Check if a bet is selected
  const isBetSelected = useCallback(
    (betId) => {
      return bets.some((b) => b.id === betId);
    },
    [bets]
  );

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
        return odds / 100 + 1;
      } else {
        return 100 / Math.abs(odds) + 1;
      }
    });

    const totalDecimal = decimalOdds.reduce((acc, odd) => acc * odd, 1);

    // Convert back to American odds
    if (totalDecimal >= 2) {
      return "+" + Math.round((totalDecimal - 1) * 100);
    } else {
      return "-" + Math.round(100 / (totalDecimal - 1));
    }
  }, [bets]);

  // Calculate potential payout
  const calculatePayout = useCallback(
    (stake) => {
      if (bets.length === 0 || !stake) return 0;

      const decimalOdds = bets.map((bet) => {
        const odds = parseInt(bet.odds);
        if (odds > 0) {
          return odds / 100 + 1;
        } else {
          return 100 / Math.abs(odds) + 1;
        }
      });

      const totalDecimal = decimalOdds.reduce((acc, odd) => acc * odd, 1);
      const mult = isPro ? 2 : 1;
      return (stake * totalDecimal * mult).toFixed(2);
    },
    [bets, isPro]
  );

  // Group bets by game
  const groupedBets = useCallback(() => {
    const groups = {};
    bets.forEach((bet) => {
      const key = bet.gameId || "other";
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
  const submitBetSlip = useCallback(
    async (amount, betslipData = null) => {
      if (bets.length === 0) return null;

      // Create bet slip object
      const betSlip = {
        id: Date.now().toString(),
        bets: [...bets],
        amount: parseFloat(amount),
        timestamp: new Date().toISOString(),
        status: "open", // open, won, lost
        betslipData, // API response with events and bet results
      };

      // Persist to backend (prefer server endpoint which enforces credits)
      const totalStake = betSlip.amount || 0;
      let potentialPayout = betSlip.bets
        ? betSlip.bets.reduce((acc, b) => {
            const o = parseInt(b.odds) || 0;
            const dec = o > 0 ? o / 100 + 1 : 100 / Math.abs(o) + 1;
            return acc + dec * (betSlip.amount || 0);
          }, 0)
        : 0;
      // If user is Pro, double the potential payout
      if (isPro) {
        potentialPayout = potentialPayout * 2;
      }

      // If this is a single-leg bet, prefer the DB RPC `place_bet` which
      // atomically deducts credits and creates the betslip server-side.
      let res = null;
      if (betSlip.bets.length === 1) {
        const single = betSlip.bets[0];
        try {
          const rpc = await placeBet(
            single.gameId || single.game_id || single.game || null,
            single.selection || single.team || single.description || null,
            totalStake,
            // pass original odds string so the RPC/client can preserve display format
            single.odds || null,
            // pass aggregated betslip_url when present so RPC can persist it
            (betslipData && betslipData.betslip_url) || null,
            // pass the original bet object so single-leg bets match multi-leg shape
            single
          );
          if (rpc && rpc.success) {
            // RPC returned created betslip id; refresh profile to reflect deduction
            try {
              const profileResp = await getUserProfile();
              if (profileResp && profileResp.success && profileResp.profile) {
                console.log(
                  "Profile refreshed after RPC bet; credits:",
                  profileResp.profile.credits
                );
              }
            } catch (e) {
              console.warn(
                "Failed to refresh profile after RPC bet:",
                e?.message || e
              );
            }
            // Build local ticket and return
            betSlip.remoteId = rpc.betslipId || rpc;
            setSubmittedBets((prev) => [betSlip, ...prev]);
            setBets([]);
            Alert.alert("Bet placed", "Bet placed. Your balance was updated.");
            return betSlip;
          }
          // If RPC failed, fall through to createBetslip fallback below
          console.warn(
            "placeBet RPC failed, falling back to createBetslip:",
            rpc?.error || rpc
          );
        } catch (e) {
          console.warn(
            "placeBet RPC exception, falling back to createBetslip:",
            e?.message || e
          );
        }
      }

      // Fallback: aggregated insert path
      res = await createBetslip(
        {
          bets: betSlip.bets,
          meta: { timestamp: betSlip.timestamp, amount: betSlip.amount },
          betslipData,
        },
        totalStake,
        potentialPayout
      );

      if (!res || !res.success) {
        const errMsg = res?.error || "Failed to create betslip";
        console.error("submitBetSlip error:", errMsg);
        throw new Error(errMsg);
      }

      // If server returned creditsRemaining then the server handled deduction.
      if (res.creditsRemaining != null) {
        try {
          // Refresh local profile to reflect server-side deduction
          const profileResp = await getUserProfile();
          if (profileResp && profileResp.success && profileResp.profile) {
            console.log(
              "Profile refreshed after server bet; credits:",
              profileResp.profile.credits
            );
          }
        } catch (e) {
          console.warn("Failed to refresh profile after bet:", e?.message || e);
        }
        Alert.alert(
          "Bet placed",
          `Bet placed. Credits remaining: ${Number(res.creditsRemaining).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`
        );
      } else if (res && res.success && res.serverCalled && res.serverFallback) {
        // Server was contacted but rejected/errored; we fell back to local DB insert
        console.warn(
          "Bet saved locally after server rejection:",
          res.error || "server rejected request"
        );
        Alert.alert(
          "Bet saved locally",
          "Server rejected the create request; ticket saved locally. Credits were NOT deducted. Please retry or contact support."
        );
      } else if (res && res.success && res.serverFallback) {
        // No server token available; local DB insert used
        console.warn(
          "Bet saved locally (no server token):",
          res.error || "no server token"
        );
        Alert.alert(
          "Bet saved locally",
          "Could not reach the server; ticket saved locally. Credits were NOT deducted."
        );
      } else if (res && !res.success) {
        console.error("submitBetSlip failed:", res.error);
        Alert.alert("Bet failed", res.error || "Failed to place bet");
      } else {
        Alert.alert(
          "Bet placed",
          "Your bet was saved but we did not receive confirmation from the server about credits."
        );
      }

      if (res.betslipId) {
        betSlip.remoteId = res.betslipId;
      }

      // Add to submitted bets (local cache)
      setSubmittedBets((prev) => [betSlip, ...prev]);

      // Try to refresh persisted betslips from Supabase so newly-created
      // tickets appear with the authoritative DB id/updated_at when available.
      try {
        if (typeof getUserBetslips === "function") {
          const fresh = await getUserBetslips();
          if (fresh && fresh.success) {
            // Let the load routine handle mapping; reuse the same mapping
            // by calling the shared loader below (if available).
            try {
              await loadSubmittedBets();
            } catch (e) {
              // fallback: set raw rows if loader unavailable
              // noop
            }
          }
        }
      } catch (e) {
        // ignore loader errors and continue using local cache
      }

      // Clear current bets
      setBets([]);

      return betSlip;
    },
    [bets]
  );

  // Load user's persisted betslips on auth/session start
  // Shared loader: fetch persisted betslips from Supabase and map to UI tickets.
  const loadSubmittedBets = useCallback(async () => {
    let mounted = true;
    try {
      const res = await getUserBetslips();
      if (res.success && mounted) {
        // Map DB rows to local format if necessary
        const rows = res.betslips || [];

        // Group all rows (legacy and modern) by a shared ticket timestamp so
        // multiple per-bet rows inserted with the same `created_at` become one ticket.
        const groups = {};
        rows.forEach((row) => {
          // Determine grouping key: prefer created_at, fall back to betslip_data.createdAt, else id
          const key =
            row.created_at ||
            (row.betslip_data && row.betslip_data.createdAt) ||
            row.id;
          if (!groups[key]) groups[key] = [];
          groups[key].push(row);
        });

        const mapped = Object.values(groups).map((groupRows) => {
          const bets = [];
          let timestamp = null;
          let status = "pending";

          // Prefer aggregated row if available
          const aggregatedRow = groupRows.find((r) => r.betslip_data);

          // build bets list
          if (aggregatedRow) {
            // Use only the aggregated row's bets to avoid duplicating per-bet rows
            timestamp =
              aggregatedRow.created_at ||
              (aggregatedRow.betslip_data &&
                aggregatedRow.betslip_data.createdAt) ||
              timestamp;
            status = aggregatedRow.status || status;
            if (Array.isArray(aggregatedRow.betslip_data?.bets)) {
              aggregatedRow.betslip_data.bets.forEach((b) => bets.push(b));
            } else if (
              aggregatedRow.betslip_data &&
              aggregatedRow.betslip_data.id
            ) {
              bets.push(aggregatedRow.betslip_data);
            }
          } else {
            groupRows.forEach((row) => {
              if (!timestamp)
                timestamp =
                  row.created_at ||
                  (row.betslip_data && row.betslip_data.createdAt) ||
                  null;
              if (!status || status === "pending")
                status = row.status || status;

              bets.push({
                id: row.id,
                gameId: row.game_id || null,
                description: row.selection || null,
                amount: row.amount || 0,
                odds: row.odds || 0,
              });
            });
          }

          // Determine ticket-level totals without summing duplicate per-row ticket totals
          // totalStake: prefer explicit ticket total on aggregated row or first non-null total_stake
          let totalStake = null;
          if (aggregatedRow && aggregatedRow.total_stake)
            totalStake = parseFloat(aggregatedRow.total_stake);
          if (totalStake == null) {
            const firstRowTotal = groupRows
              .map((r) =>
                r.total_stake != null ? parseFloat(r.total_stake) : null
              )
              .find((v) => v != null);
            if (firstRowTotal != null) totalStake = firstRowTotal;
          }
          // If still null, fall back to summing per-bet amounts (legacy rows without ticket totals)
          if (totalStake == null) {
            totalStake = bets.reduce(
              (s, b) => s + (parseFloat(b.amount) || 0),
              0
            );
          }

          // totalOdds: prefer explicit ticket total_odds, else compute from bets
          let totalOdds = null;
          if (aggregatedRow && aggregatedRow.total_odds)
            totalOdds = parseFloat(aggregatedRow.total_odds);
          if (totalOdds == null) {
            const firstRowOdds = groupRows
              .map((r) =>
                r.total_odds != null ? parseFloat(r.total_odds) : null
              )
              .find((v) => v != null);
            if (firstRowOdds != null) totalOdds = firstRowOdds;
          }
          if (totalOdds == null) {
            const decs = bets.map((b) => {
              const o = parseInt(b.odds);
              if (isNaN(o)) return 1;
              return o > 0 ? o / 100 + 1 : 100 / Math.abs(o) + 1;
            });
            totalOdds = decs.reduce((acc, v) => acc * v, 1);
          }

          // potential payout: prefer explicit, else compute
          let potentialPayout = null;
          if (aggregatedRow && aggregatedRow.potential_payout != null)
            potentialPayout = parseFloat(aggregatedRow.potential_payout);
          if (potentialPayout == null) {
            const firstRowPayout = groupRows
              .map((r) =>
                r.potential_payout != null
                  ? parseFloat(r.potential_payout)
                  : null
              )
              .find((v) => v != null);
            if (firstRowPayout != null) potentialPayout = firstRowPayout;
          }
          if (potentialPayout == null)
            potentialPayout =
              totalStake && totalOdds
                ? +(totalStake * totalOdds).toFixed(2)
                : 0;

          // Determine a stable ticket id. Prefer the aggregated DB row's
          // actual `id` (UUID) when present so UI and logs reference the
          // persisted Supabase record. Fall back to a ticket-<created_at>
          // string for legacy grouped rows.
          const ticketId =
            aggregatedRow && aggregatedRow.id
              ? aggregatedRow.id
              : groupRows[0].created_at
              ? `ticket-${groupRows[0].created_at}`
              : `ticket-${groupRows[0].id}`;

          // Expose created_at/updated_at and underlying remote row ids for
          // callers that need to reference the Supabase rows directly.
          const createdAtField =
            aggregatedRow && aggregatedRow.created_at
              ? aggregatedRow.created_at
              : timestamp;
          const updatedAtField =
            aggregatedRow && aggregatedRow.updated_at
              ? aggregatedRow.updated_at
              : null;

          return {
            id: ticketId,
            remoteId: groupRows.map((r) => r.id),
            bets,
            amount: totalStake || 0,
            total_odds: totalOdds,
            potential_payout: potentialPayout,
            timestamp,
            created_at: createdAtField,
            updated_at: updatedAtField,
            status: status === "pending" ? "open" : status,
            betslipData: aggregatedRow ? aggregatedRow.betslip_data : null,
          };
        });

        setSubmittedBets(mapped);
      }
    } catch (err) {
      console.error("Failed to load user betslips:", err?.message || err);
    }
    return () => {
      mounted = false;
    };
  }, []);

  // Load once on mount
  useEffect(() => {
    loadSubmittedBets();
  }, [loadSubmittedBets]);

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
    loadSubmittedBets,
    submitBetSlip,
    isPro,
  };

  return (
    <BetSlipContext.Provider value={value}>{children}</BetSlipContext.Provider>
  );
};

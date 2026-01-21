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
          if (mounted) {
            setIsPro(true);
            console.log("BetSlipContext: isPro set from AsyncStorage -> true");
          }
          return;
        }
      } catch (e) {}

      try {
        const prof = await getUserProfile();
        if (prof && prof.success && prof.profile && prof.profile.is_pro) {
          if (mounted) {
            setIsPro(true);
            console.log("BetSlipContext: isPro set from profile -> true");
          }
        } else {
          if (mounted) {
            setIsPro(false);
            console.log("BetSlipContext: isPro set from profile -> false");
          }
        }
      } catch (e) {
        if (mounted) {
          setIsPro(false);
          console.log("BetSlipContext: isPro set -> false (error)");
        }
      }
    })();
    return () => (mounted = false);
  }, []);

  // Helper: derive sport suffix and append to gameId when possible
  const getSportSuffixFromString = (s) => {
    if (!s) return null;
    const t = String(s).toLowerCase();
    if (t.includes("nba")) return "nba";
    if (t.includes("nfl")) return "nfl";
    if (t.includes("nhl")) return "nhl";
    if (t.includes("uefa") || t.includes("soccer") || t.includes("football"))
      return "uefa";
    return null;
  };

  const appendSportSuffixToGameId = (gameId, sportHint) => {
    if (!gameId) return gameId;
    // Already suffixed?
    try {
      const s = String(gameId);
      if (s.includes("_")) return s; // assume already has suffix
      const suffix = getSportSuffixFromString(sportHint);
      return suffix ? `${s}_${suffix}` : s;
    } catch (e) {
      return gameId;
    }
  };

  // Add or remove bet from slip
  const toggleBet = useCallback((bet) => {
    // Helper: attempt to infer a canonical bet key when not provided
    const inferBetKey = (b) => {
      try {
        // Combine multiple fields into the detection string so ids/names
        // containing keywords (e.g., "cards", "corner") are considered.
        const s = [
          b?.propType,
          b?.statType,
          b?.type,
          b?.description,
          b?.prop,
          b?.id,
          b?.name,
          b?.selection,
        ]
          .filter(Boolean)
          .join(" ")
          .toString()
          .toLowerCase();
        let base = null;

        // Helper to detect home/away from gameInfo.teams (format: "AWAY @ HOME")
        const detectSide = () => {
          try {
            const teamHint = (b?.team || b?.teamId || b?.selection || "")
              .toString()
              .toLowerCase();
            const teamsStr = (b?.gameInfo?.teams || "")
              .toString()
              .toLowerCase();
            if (!teamHint) return null;
            if (teamsStr.includes("@")) {
              const parts = teamsStr.split("@").map((p) => p.trim());
              const awayPart = parts[0].toLowerCase();
              const homePart = parts[1].toLowerCase();
              if (
                awayPart &&
                (awayPart.includes(teamHint) ||
                  teamHint.includes(awayPart) ||
                  awayPart.split(" ")[0] === teamHint.split(" ")[0])
              )
                return "away";
              if (
                homePart &&
                (homePart.includes(teamHint) ||
                  teamHint.includes(homePart) ||
                  homePart.split(" ")[0] === teamHint.split(" ")[0])
              )
                return "home";
            }
            // fallback to keywords in description
            if (s.includes("home")) return "home";
            if (s.includes("away")) return "away";
            return null;
          } catch (e) {
            return null;
          }
        };

        // Primary base detection
        // Map explicit both-teams/BTTS tokens to `bothScore` only. Generic
        // `yes/no` tokens are too ambiguous (they apply to many player props)
        // and should not be mapped here.
        if (/\bboth\s+teams\b|\bbtts\b/.test(s)) base = "bothScore";
        else if (/corner/.test(s) && /total|over|under/.test(s))
          base = "totalCorner";
        else if (/card|cards/.test(s) && /total|over|under/.test(s))
          base = "totalCards";
        else if (/corner/.test(s) && /spread/.test(s)) base = "cornerSpread";
        else if (/card|cards/.test(s) && /spread/.test(s)) base = "cardSpread";
        else if (
          /over\/under|over under|total points|total\b|total\s*$/i.test(s)
        )
          base = "totalPoints";
        else if (/moneyline|ml|3-way|3 way|draw/.test(s)) base = "moneyline";
        else if (/_points|points|goals/.test(s)) {
          // prefer explicit home/away detection when team present
          const side = detectSide();
          if (side === "home") base = "homePoints";
          else if (side === "away") base = "awayPoints";
          else if (/goals/.test(s)) base = "totalPoints";
        } else if (/spread/.test(s) || /-\d|\+\d/.test(String(b?.line || "")))
          base = "spread";

        if (!base) return null;

        // If the base is one of the generic game-level types but the bet
        // is team-specific, map to a team-scoped key (home/away)
        try {
          const teamSide = detectSide();
          if (
            teamSide &&
            ["totalPoints", "spread", "moneyline"].includes(base)
          ) {
            if (base === "totalPoints")
              base = teamSide === "home" ? "homePoints" : "awayPoints";
            else if (base === "spread")
              base = teamSide === "home" ? "homeSpread" : "awaySpread";
            else if (base === "moneyline")
              base = teamSide === "home" ? "homeMoneyline" : "awayMoneyline";
          }
        } catch (e) {}

        // Normalize and append period suffix when present (e.g., reg -> Reg, 1q -> 1Q)
        let rawPeriod = (b?.period || b?.periodId || "")
          .toString()
          .toLowerCase();
        // If no explicit period field, detect common keywords in type/description
        if (!rawPeriod || rawPeriod.length === 0) {
          const typeDesc = ((b?.type || "") + " " + (b?.description || ""))
            .toString()
            .toLowerCase();
          // Halves
          if (/(?:1st|first)\s*(?:half)|\b1h\b/.test(typeDesc))
            rawPeriod = "1h";
          else if (/(?:2nd|second)\s*(?:half)|\b2h\b/.test(typeDesc))
            rawPeriod = "2h";
          // Quarters
          else if (/(?:1st|first)\s*(?:quarter)|\b1q\b/.test(typeDesc))
            rawPeriod = "1q";
          else if (/(?:2nd|second)\s*(?:quarter)|\b2q\b/.test(typeDesc))
            rawPeriod = "2q";
          else if (/(?:3rd|third)\s*(?:quarter)|\b3q\b/.test(typeDesc))
            rawPeriod = "3q";
          else if (/(?:4th|fourth)\s*(?:quarter)|\b4q\b/.test(typeDesc))
            rawPeriod = "4q";
          // Periods (hockey etc.)
          else if (/(?:1st|first)\s*(?:period)|\b1p\b/.test(typeDesc))
            rawPeriod = "1p";
          else if (/(?:2nd|second)\s*(?:period)|\b2p\b/.test(typeDesc))
            rawPeriod = "2p";
          else if (/(?:3rd|third)\s*(?:period)|\b3p\b/.test(typeDesc))
            rawPeriod = "3p";
          // Regulation keyword
          else if (
            typeDesc.includes("regulation") ||
            typeDesc.includes("(regulation)") ||
            /\breg\b/.test(typeDesc)
          ) {
            rawPeriod = "reg";
          }
        }
        if (rawPeriod) {
          // keep only alphanumerics for suffix
          const normalized = rawPeriod.replace(/[^a-z0-9]/g, "");
          if (normalized) {
            // camel-case the suffix: digits preserved, alpha part capitalized
            const m = normalized.match(/^(\d+)?([a-z]*)$/);
            let suffix = normalized;
            if (m) {
              const num = m[1] || "";
              const alpha = m[2] || "";
              suffix =
                num +
                (alpha ? alpha.charAt(0).toUpperCase() + alpha.slice(1) : "");
            }
            return `${base}${suffix}`;
          }
        }

        return base;
      } catch (e) {}
      return null;
    };
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
      // Normalize incoming bet's game id to include sport suffix when possible
      const betToUse = { ...bet };
      const providedGameId = bet.gameId || bet.game_id || bet.game || null;
      const sportHint =
        bet.sport ||
        bet.league ||
        bet.sportName ||
        bet.gameSport ||
        bet.sport_id ||
        null;
      if (providedGameId) {
        betToUse.gameId = appendSportSuffixToGameId(providedGameId, sportHint);
      }

      const existingIndex = prevBets.findIndex((b) => b.id === betToUse.id);
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

        // Ensure canonical `key` exists on the bet so downstream consumers
        // (e.g., ticket renderers) can resolve betslip payloads reliably.
        if (!betToUse.key) {
          const inferred = inferBetKey(betToUse);
          if (inferred) betToUse.key = inferred;
        }

        // Find conflicting bets to remove
        let betsToRemove = [];

        // PLAYER PROP RESTRICTIONS (same player, same stat)
        if (bet.playerId && bet.statType) {
          prevBets.forEach((existingBet) => {
            // Normalize statType to lowercase for comparison to handle case inconsistencies
            const betStatType = (bet.statType || "").toLowerCase();
            const existingStatType = (existingBet.statType || "").toLowerCase();

            if (
              existingBet.playerId === bet.playerId &&
              existingStatType === betStatType
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

            // Can't have both anytime goals (points_yn) and goals (points_ou) for same player
            // This applies to NHL and UEFA where points_yn = anytime goals, points_ou = goals
            if (existingBet.playerId === bet.playerId) {
              const betSport = (bet.sport || "").toUpperCase();
              const existingSport = (existingBet.sport || "").toUpperCase();

              // Only enforce this rule for NHL and UEFA
              if (
                (betSport === "NHL" || betSport === "UEFA") &&
                (existingSport === "NHL" || existingSport === "UEFA")
              ) {
                const betStatLower = (bet.statType || "").toLowerCase();
                const existingStatLower = (
                  existingBet.statType || ""
                ).toLowerCase();

                // If adding points_yn, remove points_ou (and vice versa)
                if (
                  (betStatLower === "points_yn" &&
                    existingStatLower === "points_ou") ||
                  (betStatLower === "points_ou" &&
                    existingStatLower === "points_yn")
                ) {
                  betsToRemove.push(existingBet.id);
                }
              }
            }
          });
        }

        // GAME LINE RESTRICTIONS
        if (
          bet.gameId &&
          (bet.type === "Spread" ||
            bet.type === "Spread (Alt)" ||
            bet.type === "Total" ||
            bet.type === "Moneyline" ||
            bet.type === "Regulation Moneyline" ||
            bet.type === "Regulation 3-Way Moneyline" ||
            bet.type?.includes("Spread") ||
            bet.type?.includes("Moneyline") ||
            bet.type?.includes("Over/Under") ||
            bet.type?.includes("Goals") ||
            bet.type?.includes("Total"))
        ) {
          prevBets.forEach((existingBet) => {
            if (existingBet.gameId === bet.gameId) {
              // Helper to extract period from bet (from period field or type name)
              const extractPeriod = (b) => {
                if (b.period) return b.period;

                // Extract period from type name
                const type = b.type || "";
                if (type.includes("1st Quarter") || type.includes("1Q"))
                  return "1q";
                if (type.includes("2nd Quarter") || type.includes("2Q"))
                  return "2q";
                if (type.includes("3rd Quarter") || type.includes("3Q"))
                  return "3q";
                if (type.includes("4th Quarter") || type.includes("4Q"))
                  return "4q";
                if (type.includes("1st Half") || type.includes("1H"))
                  return "1h";
                if (type.includes("2nd Half") || type.includes("2H"))
                  return "2h";
                if (type.includes("1st Period") || type.includes("P1"))
                  return "1p";
                if (type.includes("2nd Period") || type.includes("P2"))
                  return "2p";
                if (type.includes("3rd Period") || type.includes("P3"))
                  return "3p";
                if (type.includes("Regulation") || type.includes("regulation"))
                  return "reg";

                return null; // Full game
              };

              // Extract period info from both bets
              const newPeriod = extractPeriod(bet);
              const existingPeriod = extractPeriod(existingBet);
              const samePeriod = newPeriod === existingPeriod;

              // Helper: Check bet types (including variations)
              const isSpread = (b) =>
                b.type === "Spread" ||
                b.type === "Spread (Alt)" ||
                b.type?.includes("Spread"); // Catch period-specific spreads like "1st Period Spread"

              // Special-case: in UEFA, card spreads and corner-kicks spreads
              // are not treated as normal game spreads for spread vs moneyline
              // exclusivity. We still want to prevent selecting the same
              // special spread for both teams though.
              // Distinguish UEFA special spreads by type (cards vs corner)
              const getSpecialUefaSpreadType = (b) => {
                if (!b || !b.type) return null;
                const sport = (b.sport || bet.sport || "")
                  .toString()
                  .toUpperCase();
                if (sport !== "UEFA") return null;
                const t = b.type.toLowerCase();
                if (t.includes("cards")) return "cards";
                if (t.includes("corner")) return "corner";
                return null;
              };

              const isSpecialUefaSpread = (b) => !!getSpecialUefaSpreadType(b);

              // Real spreads are spreads that should be mutually exclusive
              // with moneylines etc. Exclude UEFA special spreads from this.
              const isRealSpread = (b) =>
                isSpread(b) && !isSpecialUefaSpread(b);

              const isTotal = (b) =>
                b.type === "Total" ||
                b.type?.includes("Over/Under") ||
                b.type?.includes("Goals") ||
                b.type?.includes("Total"); // Catch variations

              // Detect UEFA special total types (corner vs cards) using several fields
              const getSpecialUefaTotalType = (b) => {
                if (!b) return null;
                const sport = (b.sport || bet.sport || "")
                  .toString()
                  .toUpperCase();
                if (sport !== "UEFA") return null;
                const combined = (
                  (b.type || "") +
                  " " +
                  (b.description || "") +
                  " " +
                  (b.id || "")
                )
                  .toString()
                  .toLowerCase();
                if (combined.includes("corner")) return "corner";
                if (combined.includes("card") || combined.includes("cards"))
                  return "cards";
                return null;
              };

              const isMoneyline = (b) =>
                b.type === "Moneyline" ||
                b.type === "Regulation Moneyline" ||
                b.type === "Regulation 3-Way Moneyline" ||
                b.type?.includes("Moneyline"); // Catch period-specific moneylines like "1st Period Moneyline"

              // MONEYLINE RESTRICTIONS (all types)
              if (isMoneyline(bet)) {
                // Can't select ANY moneyline with another moneyline for same period
                // This includes regular, regulation, and 3-way
                if (isMoneyline(existingBet) && samePeriod) {
                  betsToRemove.push(existingBet.id);
                }

                // Can't select with any REAL spread (regular or alt) for same team
                // Note: UEFA card/corner spreads are excluded from "real" spreads
                if (
                  isRealSpread(existingBet) &&
                  existingBet.team === bet.team
                ) {
                  betsToRemove.push(existingBet.id);
                }
              }

              // SPREAD RESTRICTIONS (including alt spreads)
              if (isRealSpread(bet)) {
                // Can't select with ANY moneyline type for same team
                if (isMoneyline(existingBet) && bet.team === existingBet.team) {
                  betsToRemove.push(existingBet.id);
                }

                // Can't select multiple REAL spreads (regular or alt) for same period
                if (isRealSpread(existingBet) && samePeriod) {
                  betsToRemove.push(existingBet.id);
                }
              }

              // Special UEFA rule: card spreads and corner-kicks spreads
              // should not behave like regular spreads (i.e. they can coexist
              // with moneylines). However, you should not be able to select
              // the same special spread for BOTH teams. Enforce that here.
              if (
                (bet.type || "").toString().toLowerCase().includes("cards") ||
                (bet.type || "").toString().toLowerCase().includes("corner")
              ) {
                // Only apply for UEFA-sport bets
                const betSport = (bet.sport || "").toString().toUpperCase();
                if (betSport === "UEFA") {
                  const newSpecialType = getSpecialUefaSpreadType(bet);
                  const existingSpecialType =
                    getSpecialUefaSpreadType(existingBet);

                  // Only conflict when both are the same special type (cards vs corner)
                  if (
                    existingBet.gameId === bet.gameId &&
                    existingSpecialType &&
                    newSpecialType &&
                    existingSpecialType === newSpecialType &&
                    samePeriod
                  ) {
                    // If existing is the opposite team's same special spread, remove it
                    if (
                      existingBet.team &&
                      bet.team &&
                      existingBet.team !== bet.team
                    ) {
                      betsToRemove.push(existingBet.id);
                    }
                    // Also disallow duplicate same-team special spreads
                    if (existingBet.team === bet.team) {
                      betsToRemove.push(existingBet.id);
                    }
                  }
                }
              }

              // POINTS/TOTAL RESTRICTIONS (including alt points and team-specific goals)
              if (isTotal(bet)) {
                const newIsTeamTotal = !!bet.team;
                const existingIsTeamTotal = !!existingBet.team;

                if (isTotal(existingBet) && samePeriod) {
                  // Can't select multiple game totals (over/under) for same period
                  if (!newIsTeamTotal && !existingIsTeamTotal) {
                    // Allow corner total and cards total to both be selected in UEFA
                    const newSpecialTotal = getSpecialUefaTotalType(bet);
                    const existingSpecialTotal =
                      getSpecialUefaTotalType(existingBet);

                    // If both are UEFA special totals and they are different (corner vs cards), allow both
                    const bothDifferentUefaSpecials =
                      newSpecialTotal &&
                      existingSpecialTotal &&
                      newSpecialTotal !== existingSpecialTotal;

                    if (!bothDifferentUefaSpecials) {
                      betsToRemove.push(existingBet.id);
                    }
                  }

                  // Can't select multiple team-specific points/goals for same team/period
                  // This includes regular and alt versions
                  if (
                    newIsTeamTotal &&
                    existingIsTeamTotal &&
                    bet.team === existingBet.team
                  ) {
                    betsToRemove.push(existingBet.id);
                  }

                  // Special rule: If both teams' points are selected for a period,
                  // can't select game total for that period
                  if (newIsTeamTotal && !existingIsTeamTotal) {
                    // Check if opposite team's points already selected
                    const oppositeTeamPointsExists = prevBets.some(
                      (b) =>
                        b.gameId === bet.gameId &&
                        isTotal(b) &&
                        b.team &&
                        b.team !== bet.team &&
                        (b.period || null) === newPeriod,
                    );

                    if (oppositeTeamPointsExists) {
                      // Remove game total for this period
                      betsToRemove.push(existingBet.id);
                    }
                  }

                  // If adding game total, check if both team points exist
                  if (!newIsTeamTotal && existingIsTeamTotal) {
                    const team1Points = prevBets.find(
                      (b) =>
                        b.gameId === bet.gameId &&
                        isTotal(b) &&
                        b.team === existingBet.team &&
                        (b.period || null) === newPeriod,
                    );

                    const team2Points = prevBets.find(
                      (b) =>
                        b.gameId === bet.gameId &&
                        isTotal(b) &&
                        b.team &&
                        b.team !== existingBet.team &&
                        (b.period || null) === newPeriod,
                    );

                    if (team1Points && team2Points) {
                      // Can't add game total if both team points exist
                      // Remove one team point (the existing one being checked)
                      betsToRemove.push(existingBet.id);
                    }
                  }
                }
              }

              // NEW RULE: Can't select a negative spread for one team and the
              // moneyline for the opposing team. For example, you shouldn't be
              // able to back LAL -3.5 and also take LAC moneyline.
              try {
                const newIsSpreadFav = isSpread(bet) && Number(bet.line) < 0;
                const existingIsSpreadFav =
                  isSpread(existingBet) && Number(existingBet.line) < 0;

                // If adding a negative spread, remove opposing moneyline
                if (
                  newIsSpreadFav &&
                  isMoneyline(existingBet) &&
                  existingBet.team !== bet.team
                ) {
                  betsToRemove.push(existingBet.id);
                }

                // If adding a moneyline, remove any negative spread on the opponent
                if (
                  isMoneyline(bet) &&
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
          (b) => !betsToRemove.includes(b.id),
        );

        // Add the new bet (use normalized betToUse)
        console.log("Adding bet:", betToUse);
        if (betsToRemove.length > 0) {
          console.log("Removed conflicting bets:", betsToRemove);
        }
        const newBets = [...filteredBets, betToUse];
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
    [bets],
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
    [bets, isPro],
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
      try {
        console.log(
          "submitBetSlip: creating local betSlip with id:",
          betSlip.id,
          "betsCount:",
          betSlip.bets.length,
          "betslipDataPresent:",
          !!betslipData,
        );
        if (betslipData && betslipData.events)
          console.log(
            "submitBetSlip: betslipData events ids:",
            betslipData.events.map((e) => e.eventId),
          );
      } catch (e) {}

      // Persist to backend (prefer server endpoint which enforces credits)
      const totalStake = betSlip.amount || 0;
      // Compute potential payout by multiplying decimal odds, then apply stake.
      let potentialPayout = 0;
      if (betSlip.bets && betSlip.bets.length > 0) {
        try {
          const totalDecimal = betSlip.bets.reduce((acc, b) => {
            const o = parseInt(b.odds) || 0;
            const dec = o > 0 ? o / 100 + 1 : 100 / Math.abs(o) + 1;
            return acc * dec;
          }, 1);
          potentialPayout = Number(((totalDecimal || 1) * (betSlip.amount || 0)).toFixed(2));
        } catch (e) {
          potentialPayout = 0;
        }
      }
      // If user is Pro, double the potential payout
      if (isPro) potentialPayout = Number((potentialPayout * 2).toFixed(2));

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
            single,
          );
          if (rpc && rpc.success) {
            // RPC returned created betslip id; refresh profile to reflect deduction
            try {
              const profileResp = await getUserProfile();
              if (profileResp && profileResp.success && profileResp.profile) {
                console.log(
                  "Profile refreshed after RPC bet; credits:",
                  profileResp.profile.credits,
                );
              }
            } catch (e) {
              console.warn(
                "Failed to refresh profile after RPC bet:",
                e?.message || e,
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
            rpc?.error || rpc,
          );
        } catch (e) {
          console.warn(
            "placeBet RPC exception, falling back to createBetslip:",
            e?.message || e,
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
        potentialPayout,
      );

      try {
        console.log("createBetslip response:", res);
      } catch (e) {}

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
              profileResp.profile.credits,
            );
          }
        } catch (e) {
          console.warn("Failed to refresh profile after bet:", e?.message || e);
        }
        Alert.alert(
          "Bet placed",
          `Bet placed. Credits remaining: ${Number(
            res.creditsRemaining,
          ).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`,
        );
      } else if (res && res.success && res.serverCalled && res.serverFallback) {
        // Server was contacted but rejected/errored; we fell back to local DB insert
        console.warn(
          "Bet saved locally after server rejection:",
          res.error || "server rejected request",
        );
        Alert.alert(
          "Bet saved locally",
          "Server rejected the create request; ticket saved locally. Credits were NOT deducted. Please retry or contact support.",
        );
      } else if (res && res.success && res.serverFallback) {
        // No server token available; local DB insert used
        console.warn(
          "Bet saved locally (no server token):",
          res.error || "no server token",
        );
        Alert.alert(
          "Bet saved locally",
          "Could not reach the server; ticket saved locally. Credits were NOT deducted.",
        );
      } else if (res && !res.success) {
        console.error("submitBetSlip failed:", res.error);
        Alert.alert("Bet failed", res.error || "Failed to place bet");
      } else {
        Alert.alert(
          "Bet placed",
          "Your bet was saved but we did not receive confirmation from the server about credits.",
        );
      }

      if (res.betslipId) {
        betSlip.remoteId = res.betslipId;
      }

      // Add to submitted bets (local cache)
      try {
        console.log(
          "Adding to submittedBets local cache, betSlip id:",
          betSlip.id,
          "betslipDataPresent:",
          !!betSlip.betslipData,
        );
      } catch (e) {}
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
    [bets],
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
          let aggregatedRow = groupRows.find((r) => r.betslip_data);

          // build bets list
          if (aggregatedRow) {
            // Parse aggregatedRow.betslip_data if it's stringified JSON (some DB rows store as text)
            let parsedBetslipData = aggregatedRow.betslip_data;
            if (typeof parsedBetslipData === "string") {
              try {
                parsedBetslipData = JSON.parse(parsedBetslipData);
              } catch (e) {
                // leave as string if parse fails
              }
            }

            // Use only the aggregated row's bets to avoid duplicating per-bet rows
            timestamp =
              aggregatedRow.created_at ||
              (parsedBetslipData && parsedBetslipData.createdAt) ||
              timestamp;
            status = aggregatedRow.status || status;
            if (Array.isArray(parsedBetslipData?.bets)) {
              parsedBetslipData.bets.forEach((b) => bets.push(b));
            } else if (parsedBetslipData && parsedBetslipData.id) {
              bets.push(parsedBetslipData);
            }
            // Replace aggregatedRow.betslip_data with parsed object for downstream use
            aggregatedRow = {
              ...aggregatedRow,
              betslip_data: parsedBetslipData,
            };
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

          // Normalize loaded bets' gameId to include sport suffix when possible
          try {
            bets.forEach((b) => {
              const providedGameId = b.gameId || b.game_id || b.game || null;
              // attempt to extract sport hint from the aggregatedRow or group rows if available
              const sampleRow = aggregatedRow || groupRows[0] || {};
              const sportHint =
                b.sport ||
                sampleRow.sport ||
                sampleRow.league ||
                sampleRow.sportName ||
                null;
              if (
                providedGameId &&
                (!b.gameId || !String(b.gameId).includes("_"))
              ) {
                b.gameId = appendSportSuffixToGameId(providedGameId, sportHint);
              }
            });
          } catch (e) {
            // ignore normalization errors
          }

          // Determine ticket-level totals without summing duplicate per-row ticket totals
          // totalStake: prefer explicit ticket total on aggregated row or first non-null total_stake
          let totalStake = null;
          if (aggregatedRow && aggregatedRow.total_stake)
            totalStake = parseFloat(aggregatedRow.total_stake);
          if (totalStake == null) {
            const firstRowTotal = groupRows
              .map((r) =>
                r.total_stake != null ? parseFloat(r.total_stake) : null,
              )
              .find((v) => v != null);
            if (firstRowTotal != null) totalStake = firstRowTotal;
          }
          // If still null, fall back to summing per-bet amounts (legacy rows without ticket totals)
          if (totalStake == null) {
            totalStake = bets.reduce(
              (s, b) => s + (parseFloat(b.amount) || 0),
              0,
            );
          }

          // totalOdds: prefer explicit ticket total_odds, else compute from bets
          let totalOdds = null;
          if (aggregatedRow && aggregatedRow.total_odds)
            totalOdds = parseFloat(aggregatedRow.total_odds);
          if (totalOdds == null) {
            const firstRowOdds = groupRows
              .map((r) =>
                r.total_odds != null ? parseFloat(r.total_odds) : null,
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
                  : null,
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
    setIsPro,
  };

  return (
    <BetSlipContext.Provider value={value}>{children}</BetSlipContext.Provider>
  );
};

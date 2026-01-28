import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Animated,
  Dimensions,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useNavigation,
  useRoute,
  useIsFocused,
} from "@react-navigation/native";
import { useTheme } from "../context/ThemeContext";
import { useBetSlip } from "../context/BetSlipContext";
import { useBetData } from "../context/BetDataContext";
import { useContext } from "react";
import OddsDisplayContext from "../context/OddsDisplayContext";
import { formatOddsForDisplay } from "../utils/odds";
import { getUserProfile } from "../services/betService";

const { height } = Dimensions.get("window");

const BetSlip = ({ isGameDetail = false, scoreboardGames = [] }) => {
  const navigation = useNavigation();
  const { colors, theme } = useTheme();
  const {
    bets,
    removeBet,
    clearBets,
    calculateParlayOdds,
    calculatePayout,
    groupedBets,
    isSlipOpen,
    setIsSlipOpen,
    submitBetSlip,
    isPro,
  } = useBetSlip();

  const { fetchScoreboard } = useBetData();

  const oddsContext = useContext(OddsDisplayContext);
  const oddsDisplay = oddsContext ? oddsContext.oddsDisplay : "american";

  const [betAmount, setBetAmount] = useState("");
  const [showNumpad, setShowNumpad] = useState(false);
  const [credits, setCredits] = useState(0);
  const [placingBet, setPlacingBet] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchProfile = async () => {
      try {
        const resp = await getUserProfile();
        if (!mounted) return;
        if (resp && resp.success && resp.profile) {
          setCredits(Number(resp.profile.credits || 0));
        }
      } catch (e) {
        console.warn(
          "Failed to fetch profile for credits display:",
          e?.message || e,
        );
      }
    };
    if (isSlipOpen) fetchProfile();
    return () => {
      mounted = false;
    };
  }, [isSlipOpen]);

  const route = useRoute();
  const isFocused = useIsFocused();

  useEffect(() => {
    console.log(
      `[BetSlip] isFocused changed => ${isFocused} (route=${route?.name || "unknown"})`,
    );
  }, [isFocused, route?.name]);

  useEffect(() => {
    console.log(`[BetSlip] mounted (route=${route?.name || "unknown"})`);
    return () =>
      console.log(`[BetSlip] unmounted (route=${route?.name || "unknown"})`);
  }, []);

  useEffect(() => {
    console.log(
      `[BetSlip] isSlipOpen changed => ${isSlipOpen} (route=${route?.name || "unknown"})`,
    );
  }, [isSlipOpen, route?.name]);

  const openSlip = () => {
    console.log(
      `[BetSlip] openSlip called (route=${route?.name || "unknown"})`,
    );
    setIsSlipOpen(true);
  };

  // Detect Alt-style bets (explicit alt in type or '+'/'-' shorthand in line/description)
  const isAltBet = (bet) => {
    if (!bet) return false;
    const t = String(bet.type || "").toLowerCase();
    const line = String(bet.line || "");
    const desc = String(bet.description || "");
    if (t.includes("(alt)") || t.includes(" alt)")) return true;
    if (line.includes("+") || line.includes("-")) return true;
    if (desc.includes("+") || desc.includes("-")) return true;
    return false;
  };

  const closeSlip = () => {
    console.log(
      `[BetSlip] closeSlip called (route=${route?.name || "unknown"})`,
    );
    setIsSlipOpen(false);
    setShowNumpad(false);
  };

  const handleQuickAdd = (amount) => {
    const currentAmount = parseFloat(betAmount) || 0;
    const newAmount = currentAmount + amount;
    setBetAmount(newAmount.toString());
  };

  const handleNumpadPress = (value) => {
    if (value === "backspace") {
      setBetAmount(betAmount.slice(0, -1));
    } else if (value === ".") {
      if (!betAmount.includes(".")) {
        setBetAmount(betAmount + value);
      }
    } else {
      const newAmount = betAmount + value;
      setBetAmount(newAmount);
    }
  };

  // Detect UEFA special total type for a bet: 'corner', 'cards', or null
  const getSpecialUefaTotalType = (bet) => {
    if (!bet) return null;
    const t = String(bet.type || "").toLowerCase();
    const id = String(bet.id || "").toLowerCase();
    const desc = String(bet.description || "").toLowerCase();
    if (
      t.includes("corner") ||
      id.includes("corner") ||
      desc.includes("corner")
    )
      return "corner";
    if (
      t.includes("card") ||
      id.includes("card") ||
      desc.includes("card") ||
      desc.includes("cards")
    )
      return "cards";
    return null;
  };

  const handleConfirmBet = async () => {
    const amount = parseFloat(betAmount) || 200;
    console.log("handleConfirmBet invoked", {
      amount,
      betsCount: bets.length,
      showNumpad,
      betAmount,
    });

    // Check user balance before attempting to place the bet
    try {
      const profileResp = await getUserProfile();
      if (profileResp && profileResp.success && profileResp.profile) {
        const balance = Number(profileResp.profile.credits || 0);
        if (amount > balance) {
          Alert.alert(
            "Insufficient Credits",
            `You only have ${Number(balance).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} Credits available.`,
          );
          return;
        }
        console.log("Balance check OK", { balance });
      }
    } catch (e) {
      // If checking balance failed, continue and let server validate
      console.warn(
        "Failed to load profile for balance check:",
        e?.message || e,
      );
    }
    try {
      // Build API query from bets
      const gameIds = [...new Set(bets.map((bet) => bet.gameId))].filter(
        Boolean,
      );
      console.log("Computed gameIds:", gameIds);
      // Fetch scoreboard(s) for the sport(s) represented in the slip and
      // determine live games from the fetched payloads. This handles
      // multi-sport slips by fetching in parallel.
      const getSportFromGameId = (gameId) => {
        try {
          const m = String(gameId).match(
            /_(nba|nfl|nhl|mlb|soccer|ncaa|wnba)$/i,
          );
          return m ? m[1].toUpperCase() : null;
        } catch (e) {
          return null;
        }
      };

      let sports = [
        ...new Set(gameIds.map(getSportFromGameId).filter(Boolean)),
      ];
      if (sports.length === 0) {
        // fallback: try to read sport from bet objects
        const fromBets = [
          ...new Set(bets.map((b) => b.sport).filter(Boolean)),
        ].map((s) => String(s).toUpperCase());
        if (fromBets.length) sports = fromBets;
      }

      // If still unknown, avoid blocking by treating as single-sport (NBA) fetch
      if (sports.length === 0) sports = ["NBA"];

      console.log("BetSlip: fetching scoreboards for sports", sports);
      const fetchPromises = sports.map((s) =>
        fetchScoreboard(s)
          .then((d) => ({ sport: s, data: d }))
          .catch((err) => ({ sport: s, data: null, err })),
      );

      const fetchResults = await Promise.all(fetchPromises);
      const effectiveScoreboardGames = [];
      fetchResults.forEach((res) => {
        try {
          if (res && res.data) {
            const events = Array.isArray(res.data.events)
              ? res.data.events
              : res.data.events || [];
            effectiveScoreboardGames.push(...events);
            console.log(
              `BetSlip: fetched ${events.length} events for ${res.sport}`,
            );
            try {
              const summary = events.map((ev) => ({
                id:
                  ev.eventId ||
                  ev.id ||
                  ev.gameId ||
                  ev.gamePk ||
                  (ev.header &&
                    ev.header.competitions &&
                    ev.header.competitions[0] &&
                    ev.header.competitions[0].id) ||
                  null,
                state:
                  ev.header?.competitions?.[0]?.status?.type?.state ||
                  ev.status?.type?.state ||
                  ev.event?.status?.state ||
                  null,
              }));
              console.log(
                `BetSlip: fetched events summary for ${res.sport}:`,
                summary,
              );
            } catch (e) {
              console.log(
                `BetSlip: fetched events (unable to summarize) for ${res.sport}`,
                events,
              );
            }
          } else {
            console.warn(`BetSlip: no scoreboard data for ${res.sport}`);
          }
        } catch (e) {
          console.warn(
            "BetSlip: error processing fetched scoreboard",
            e?.message || e,
          );
        }
      });

      // Determine live games using fetched events
      const liveGameIds = [];
      gameIds.forEach((gid) => {
        // Strip trailing sport suffix (e.g. _uefa) when comparing to fetched event ids
        const gidClean = String(gid).replace(
          /_(nba|nfl|nhl|mlb|soccer|ncaa|wnba|uefa)$/i,
          "",
        );
        const sg =
          Array.isArray(effectiveScoreboardGames) &&
          typeof effectiveScoreboardGames.find === "function"
            ? effectiveScoreboardGames.find((g) => {
                try {
                  const candidates = [
                    g.id,
                    g.gameId,
                    g.gamePk,
                    g.event?.id,
                    g.header?.competitions?.[0]?.id,
                  ].map((v) => (v != null ? String(v) : null));
                  return candidates.some(
                    (c) => c === String(gid) || c === String(gidClean),
                  );
                } catch (e) {
                  return false;
                }
              })
            : undefined;
        console.log(
          "BetSlip live-check: gid, fetchedGames length, matched sg:",
          gid,
          Array.isArray(effectiveScoreboardGames)
            ? effectiveScoreboardGames.length
            : 0,
          Boolean(sg),
        );
        if (!sg) return;
        const state =
          sg.header?.competitions?.[0]?.status?.type?.state ||
          sg.status?.type?.state ||
          sg.status?.state ||
          sg.status;
        console.log("BetSlip live-check: gid state:", gid, state);
        if (state && state !== "pre" && state !== "scheduled") {
          liveGameIds.push(gid);
        }
      });

      console.log("BetSlip liveGameIds computed:", liveGameIds);

      if (liveGameIds.length > 0) {
        console.log("liveGameIds > 0, will remove bets:", liveGameIds);
        const removedBetIds = bets
          .filter((b) => liveGameIds.includes(b.gameId))
          .map((b) => b.id);

        Alert.alert(
          "Can't place bets",
          "Can't place bets once a game goes live. Removing selections for live games.",
          [
            {
              text: "OK",
              onPress: () => {
                removedBetIds.forEach((id) => removeBet(id));
              },
            },
          ],
        );

        return;
      }
      const playerBets = {};
      // query built after grouping so we can include normalized gameId suffixes
      let query = "";

      // Group player bets and capture sport hint (from gameId suffix or statType)
      try {
        const inferSportFromStat = (stat) => {
          if (!stat) return null;
          const s = String(stat).toLowerCase();
          if (s.includes("pass") || s.includes("pyds") || s.includes("passing"))
            return "nfl";
          if (s.includes("rush") || s.includes("ryds") || s.includes("rushing"))
            return "nfl";
          if (s.includes("rec") && s.includes("yd")) return "nfl";
          if (
            s.includes("pts") ||
            s.includes("points") ||
            s.includes("3pm") ||
            s.includes("ast")
          )
            return "nba";
          if (
            s.includes("gsv") ||
            s.includes("hgl") ||
            s.includes("shot") ||
            s.includes("shots") ||
            s.includes("save") ||
            s.includes("saves")
          )
            return "nhl";
          if (
            s.includes("goals") ||
            s.includes("ugl") ||
            s.includes("yc") ||
            s.includes("card")
          )
            return "uefa";
          return null;
        };

        bets.forEach((bet) => {
          if (!bet) return;
          if (bet.playerId && bet.statType) {
            if (!playerBets[bet.playerId])
              playerBets[bet.playerId] = { sport: null, stats: {} };

            // Prefer bet.sport field if available
            if (bet.sport) {
              playerBets[bet.playerId].sport = bet.sport.toLowerCase();
            } else {
              // Fallback: try to derive sport from bet.gameId suffix (e.g., 401772916_nfl)
              try {
                const gid = bet.gameId || bet.game_id || bet.game || "";
                if (typeof gid === "string" && gid.includes("_")) {
                  const parts = gid.split("_");
                  const suf = parts[parts.length - 1].toLowerCase();
                  if (["nba", "nfl", "nhl", "uefa"].includes(suf)) {
                    playerBets[bet.playerId].sport = suf;
                  }
                }
              } catch (e) {}

              // if still unknown, infer from statType name
              if (!playerBets[bet.playerId].sport) {
                const inferred = inferSportFromStat(bet.statType);
                if (inferred) playerBets[bet.playerId].sport = inferred;
              }
            }

            // If gameId exists but lacks suffix, and we have sport, append it to the bet's gameId
            try {
              const gid = bet.gameId || bet.game_id || bet.game || null;
              const suf = playerBets[bet.playerId].sport;
              if (gid && suf && typeof gid === "string" && !gid.includes("_")) {
                // mutate bet.gameId so later code uses suffixed id
                bet.gameId = `${gid}_${suf}`;
              }
            } catch (e) {}

            playerBets[bet.playerId].stats[bet.statType] = bet.betValue;
          }
        });
      } catch (groupErr) {
        console.error("Error grouping player bets:", groupErr);
        throw groupErr;
      }

      console.log("Player bets:", playerBets);

      // Helper: Extract period suffix from bet object (checks bet.period field first, then bet.type)
      const getPeriodSuffix = (bet) => {
        // Check if period is directly stored in bet object (from game lines section)
        if (bet.period) {
          const p = bet.period.toLowerCase();
          // Handle ESPN periodID format like "1", "2", "3" for periods or "reg" for regulation
          if (p === "1") return "1P";
          if (p === "2") return "2P";
          if (p === "3") return "3P";
          if (p === "4") return "4Q"; // 4th quarter in some sports
          // Handle already-formatted periods like "1P", "2Q", "1H"
          if (/^[1-4](P|Q|H)$/i.test(p)) return p.toUpperCase();
        }

        // Fallback: Extract from bet.type text (for team bets created with period in type name)
        const betType = bet.type;
        if (!betType) return "";
        const type = betType.toLowerCase();
        // Match patterns like "1st period", "2nd period", "1st quarter", "1st half"
        const periodMatch = type.match(/(1st|2nd|3rd)\s*period/);
        const quarterMatch = type.match(/(1st|2nd|3rd|4th)\s*quarter/);
        const halfMatch = type.match(/(1st|2nd)\s*half/);

        if (periodMatch) {
          const num =
            periodMatch[1] === "1st"
              ? "1"
              : periodMatch[1] === "2nd"
                ? "2"
                : "3";
          return num + "P";
        }
        if (quarterMatch) {
          const num =
            quarterMatch[1] === "1st"
              ? "1"
              : quarterMatch[1] === "2nd"
                ? "2"
                : quarterMatch[1] === "3rd"
                  ? "3"
                  : "4";
          return num + "Q";
        }
        if (halfMatch) {
          const num = halfMatch[1] === "1st" ? "1" : "2";
          return num + "H";
        }
        return "";
      };

      // Recompute gameIds after grouping (some bets may have been normalized to include sport suffix)
      const finalGameIds = [...new Set(bets.map((bet) => bet.gameId))].filter(
        Boolean,
      );
      const isMultiSport = sports.length > 1;

      // Build query string now using normalized game ids
      query = `gameId=${finalGameIds.join(",")}`;

      // Group gameIds by sport for multi-sport betslips
      const gameIdsBySport = {};
      if (isMultiSport) {
        finalGameIds.forEach((gid) => {
          const sport = getSportFromGameId(gid);
          if (sport) {
            if (!gameIdsBySport[sport]) gameIdsBySport[sport] = [];
            gameIdsBySport[sport].push(gid);
          }
        });
      }

      // Helper to build array of values aligned with gameIds (or sport-specific gameIds)
      const buildAlignedArray = (paramName, periodSuffix = "") => {
        if (isMultiSport) {
          // For multi-sport, create separate arrays per sport
          Object.entries(gameIdsBySport).forEach(([sport, sportGameIds]) => {
            const values = sportGameIds.map((gid) => {
              const bet = bets.find(
                (b) =>
                  b.gameId === gid &&
                  getPeriodSuffix(b) === periodSuffix &&
                  matchesBetType(b, paramName),
              );
              return bet ? formatBetValue(bet, paramName) : "";
            });

            if (values.some((v) => v)) {
              const sportSuffix = `_${sport}`;
              query += `&${paramName}${periodSuffix}${sportSuffix}=${values
                .map(encodeURIComponent)
                .join(",")
                .replace(/%2B/g, "+")
                .replace(/%2D/g, "-")}`;
            }
          });
        } else {
          // Single sport: use simple aligned array
          const values = finalGameIds.map((gid) => {
            const bet = bets.find(
              (b) =>
                b.gameId === gid &&
                getPeriodSuffix(b) === periodSuffix &&
                matchesBetType(b, paramName),
            );
            return bet ? formatBetValue(bet, paramName) : "";
          });

          if (values.some((v) => v)) {
            query += `&${paramName}${periodSuffix}=${values
              .map(encodeURIComponent)
              .join(",")
              .replace(/%2B/g, "+")
              .replace(/%2D/g, "-")}`;
          }
        }
      };

      // Helper to check if bet matches the parameter type
      const matchesBetType = (bet, paramName) => {
        const betType = bet.type?.toLowerCase() || "";
        switch (paramName) {
          case "moneyline":
            return (
              (bet.type === "Moneyline" || betType.includes("moneyline")) &&
              !betType.includes("regulation")
            );
          case "moneylineReg":
            return (
              bet.type === "Regulation 3-Way Moneyline" ||
              bet.type === "3-Way Moneyline (Regulation)"
            );
          case "spread":
            return (
              bet.type === "Spread" ||
              (bet.type?.includes("(Alt)") && bet.type?.includes("Spread"))
            );
          // UEFA special spreads (cards/corner) - use unified param (cardSpread/cornerSpread)
          case "cardSpread":
            if (!bet.team) return false;
            return betType.includes("card") && betType.includes("spread");
          case "cornerSpread":
            if (!bet.team) return false;
            return betType.includes("corner") && betType.includes("spread");
          case "total": {
            const special = getSpecialUefaTotalType(bet);
            return (
              !bet.team &&
              (betType.includes("over/under") ||
                betType.includes("total") ||
                bet.type === "Milestone") &&
              !special
            );
          }
          // UEFA special totals
          case "totalCorner":
            return (
              !bet.team &&
              (betType.includes("corner") ||
                (bet.id || "").toLowerCase().includes("corner") ||
                (bet.description || "").toLowerCase().includes("corner"))
            );
          case "totalCards":
            return (
              !bet.team &&
              (betType.includes("card") ||
                (bet.id || "").toLowerCase().includes("card") ||
                (bet.description || "").toLowerCase().includes("card"))
            );
          case "bothScore":
            return (
              !bet.team &&
              (betType.includes("both teams") ||
                (bet.description || "")
                  .toLowerCase()
                  .includes("both teams to score") ||
                (bet.id || "").toLowerCase().includes("both"))
            );
          case "homePoints":
          case "homeGoals":
            return (
              bet.team &&
              (betType.includes("over/under") ||
                betType.includes("total") ||
                betType.includes("goals") ||
                (bet.type?.includes("(Alt)") &&
                  (bet.statType === "points" || bet.statType === "goals")))
            );
          case "awayPoints":
          case "awayGoals":
            return (
              bet.team &&
              (betType.includes("over/under") ||
                betType.includes("total") ||
                betType.includes("goals") ||
                (bet.type?.includes("(Alt)") &&
                  (bet.statType === "points" || bet.statType === "goals")))
            );
          default:
            return false;
        }
      };

      // Helper to format bet value for the parameter
      const formatBetValue = (bet, paramName) => {
        const teamsStr = bet.gameInfo?.teams || "";
        const awayTeam = teamsStr.split(" @ ")[0];
        const homeTeam = teamsStr.split(" @ ")[1];

        switch (paramName) {
          case "moneyline":
          case "moneylineReg":
            return bet.team || bet.line || "";

          case "spread":
            return `${bet.team}${bet.line}`;

          case "total":
          case "homePoints":
          case "awayPoints":
          case "homeGoals":
          case "awayGoals": {
            // Extract number with +/- from line
            let lineValue = String(bet.line || "").replace(/^[OU]\s+/, "");
            if (
              bet.description?.includes("+") ||
              bet.description?.toLowerCase().includes("over")
            ) {
              if (!lineValue.includes("+")) lineValue += "+";
            } else if (
              bet.description?.includes("-") ||
              bet.description?.toLowerCase().includes("under")
            ) {
              if (!lineValue.includes("-")) lineValue += "-";
            }

            // For team totals, check if this bet matches home/away
            if (
              (paramName === "homePoints" || paramName === "homeGoals") &&
              bet.team !== homeTeam
            )
              return "";
            if (
              (paramName === "awayPoints" || paramName === "awayGoals") &&
              bet.team !== awayTeam
            )
              return "";

            return lineValue;
          }

          case "totalCorner":
          case "totalCards": {
            // Prefer explicit O/U prefix in line if present, otherwise use description
            let num = String(bet.line || "").replace(/^[OU]\s+/i, "");
            num = num.replace(/[^0-9.]/g, "");
            if (!num) return "";
            const isOver =
              /\bover\b/i.test(bet.description || "") ||
              /\bO\b/i.test(bet.line || "");
            // If this is an Alt-style line (like "7+"), return signed number (+7/-7)
            if (isAltBet(bet)) {
              const hasPlus =
                /\+/i.test(bet.line || "") || /\+/i.test(bet.description || "");
              const hasMinus =
                /-/i.test(bet.line || "") || /-/i.test(bet.description || "");
              const sign = hasPlus ? "+" : hasMinus ? "-" : isOver ? "+" : "+";
              return `${sign}${num}`;
            }
            const prefix = isOver ? "o" : "u";
            return `${prefix}${num}`;
          }

          case "cardSpread":
          case "cornerSpread": {
            // Return team-prefixed spread (e.g. BRU+0.5 or TOT-1.5)
            let raw = String(bet.line || "");
            raw = raw.replace(/[OoUu]\s*/i, "");
            // Ensure a sign is present
            if (!raw.match(/^[-+]/)) {
              if (/over|\+/i.test(bet.description || "")) raw = `+${raw}`;
              else if (/under|\-/i.test(bet.description || "")) raw = `-${raw}`;
            }
            const team = bet.team || "";
            return `${team}${raw}`;
          }

          case "bothScore": {
            const raw = String(bet.line || bet.description || "").toLowerCase();
            if (raw.includes("yes")) return "yes";
            if (raw.includes("no")) return "no";
            return raw || "";
          }

          default:
            return "";
        }
      };

      // Build all bet type parameters
      buildAlignedArray("moneyline");
      buildAlignedArray("moneylineReg");
      buildAlignedArray("spread");
      buildAlignedArray("total");
      // UEFA-specific totals
      buildAlignedArray("totalCorner");
      buildAlignedArray("totalCards");
      // Both Teams To Score (yes/no)
      buildAlignedArray("bothScore");

      // UEFA-specific spreads (team-prefixed)
      buildAlignedArray("cardSpread");
      buildAlignedArray("cornerSpread");

      // For NHL use Goals, for NBA/NFL use Points
      if (isMultiSport) {
        // Multi-sport: build both and let buildAlignedArray filter by sport
        buildAlignedArray("homePoints");
        buildAlignedArray("awayPoints");
        buildAlignedArray("homeGoals");
        buildAlignedArray("awayGoals");
      } else {
        // Single sport: use appropriate parameter name
        const sport = getSportFromGameId(finalGameIds[0]);
        if (sport === "nhl") {
          buildAlignedArray("homeGoals");
          buildAlignedArray("awayGoals");
        } else {
          buildAlignedArray("homePoints");
          buildAlignedArray("awayPoints");
        }
      }

      // Period-specific bets
      ["1P", "2P", "3P", "1Q", "2Q", "3Q", "4Q", "1H", "2H"].forEach(
        (suffix) => {
          buildAlignedArray("moneyline", suffix);
          buildAlignedArray("spread", suffix);
          buildAlignedArray("total", suffix);
          // period-specific UEFA params
          buildAlignedArray("totalCorner", suffix);
          buildAlignedArray("totalCards", suffix);
          // Period-specific both teams to score
          buildAlignedArray("bothScore", suffix);
          // Period-specific UEFA spreads
          buildAlignedArray("cardSpread", suffix);
          buildAlignedArray("cornerSpread", suffix);

          if (isMultiSport) {
            buildAlignedArray("homePoints", suffix);
            buildAlignedArray("awayPoints", suffix);
            buildAlignedArray("homeGoals", suffix);
            buildAlignedArray("awayGoals", suffix);
          } else {
            const sport = getSportFromGameId(finalGameIds[0]);
            if (sport === "nhl") {
              buildAlignedArray("homeGoals", suffix);
              buildAlignedArray("awayGoals", suffix);
            } else {
              buildAlignedArray("homePoints", suffix);
              buildAlignedArray("awayPoints", suffix);
            }
          }
        },
      );

      // Player bets remain unchanged
      Object.entries(playerBets).forEach(([playerId, playerObj], index) => {
        const playerNum = index + 1;
        query += `&p${playerNum}=${playerId}`;
        const stats = playerObj.stats || {};
        const sport = playerObj.sport || null;

        // Helper: normalize stat key (strip _ou/_o/_u/_yn and other suffixes) and map to short stat code based on sport
        const normalizeStatKey = (statType) => {
          if (!statType) return "";
          let s = String(statType).toLowerCase();
          // strip common suffixes like _ou, _o, _u, _yn, _ml and trailing -/+ forms BEFORE replacing special chars
          s = s.replace(/[_-](o|u|ou|yn|ml)$/i, "");
          s = s.replace(/_ou$/i, "");
          s = s.replace(/_yn$/i, "");
          s = s.replace(/_ml$/i, "");
          s = s.replace(/_over$|_under$/i, "");
          // Now replace special characters but keep + for combined stats
          s = s.replace(/[^a-z0-9+]/g, "_");
          return s;
        };

        // Helper: map a statType to short stat code based on sport
        const getShortStat = (statType, sportHint) => {
          if (!statType) return "pts";

          // Keep original stat type (lowercase) for checking maps with suffixes like _yn, _ou
          const statOriginal = String(statType).toLowerCase();

          // Normalized version (suffixes stripped) for fallback checks
          const sRaw = normalizeStatKey(statType);
          const s = sRaw;

          // NBA defaults
          const nbaMap = {
            points: "pts",
            pts: "pts",
            rebounds: "reb",
            reb: "reb",
            assists: "ast",
            ast: "ast",
            blocks: "blk",
            blk: "blk",
            steals: "stl",
            stl: "stl",
            turnovers: "to",
            to: "to",
            threes: "3pm",
            "3pt": "3pm",
            "threePointersMade": "3pm",
            "points+rebounds+assists": "pra",
            "points+assists": "pa",
            "points+rebounds": "pr",
            "rebounds+assists": "ra",
            pra_total: "pra",
            "1qpts": "1qpts",
            "1q_points": "1qpts",
            "1qreb": "1qreb",
            "1q_rebounds": "1qreb",
            "1qast": "1qast",
            "1q_assists": "1qast",
            doubledouble: "2dbl",
            "2dbl": "2dbl",
            tripledouble: "3dbl",
            "3dbl": "3dbl",
            firstbasket: "firstBasket",
            first_basket: "firstBasket",
            blocks_steals: "bs",
            "blocks+steals": "bs",
          };

          // NFL mappings (common patterns)
          const nflMap = {
            passing_yards: "pyds",
            pyds: "pyds",
            pass_yards: "pyds",
            passing_attempts: "patt",
            patt: "patt",
            passing_completions: "pcmp",
            pcmp: "pcmp",
            passing_interceptions: "pint",
            pint: "pint",
            passing_longestCompletion: "plng",
            plng: "plng",
            passing_tds: "ptd",
            ptd: "ptd",
            // combined stat variants
            "passing+ rushing": "pryds",
            "passing+rushing": "pryds",
            "passing+rushing_yards": "pryds",
            pryds: "pryds",
            rushing_yards: "ryds",
            ryds: "ryds",
            rushing_longestRush: "rlng",
            rlng: "rlng",
            rushing_attempts: "ratt",
            ratt: "ratt",
            receiving_yards: "recyds",
            receiving_longestReception: "reclong",
            recyds: "recyds",
            receiving_receptions: "rrec",
            rrec: "rrec",
            rec_longest: "reclong",
            reclong: "reclong",
            "rushing+receiving": "rryds",
            "rushing+receiving_yards": "rryds",
            rryds: "rryds",
            tds: "tds",
            // normalize plural -> singular for yes/no mappings
            touchdowns: "touchdowns",
            // added defensive and kicking mappings
            defense_sacks: "dsac",
            dsac: "dsac",
            fieldgoals_made: "kfg",
            kfg: "kfg",
            extrapoints_kicksmade: "kxp",
            kxp: "kxp",
            firsttouchdown: "firsttouchdown",
            lasttouchdown: "lasttouchdown",
            kpts: "kpts",
          };

          // NHL mappings
          const nhlMap = {
            "goals+assists": "ga",
            goals_assists: "ga",
            "powerplay_goals+assists": "ppp",
            powerplay_goals_assists: "ppp",
            goal: "hgl",
            goals: "hgl",
            hgl: "hgl",
            points_yn: "hgl",
            points_ou: "hgl",
            points: "hgl",
            pts: "hgl",
            shots_on_goal: "sht",
            shots_ongoal: "sht",
            sht: "sht",
            shots: "sht",
            shot: "sht",
            assists: "ast",
            ast: "ast",
            blocked: "bs",
            blocks: "bs",
            bs: "bs",
            ppp: "ppp",
            saves: "gsv",
            goalie_saves: "gsv",
            save: "gsv",
            gsv: "gsv",
            firsttoscore: "firstgoal",
            first_to_score: "firstgoal",
            lasttoscore: "lastgoal",
            last_to_score: "lastgoal",
          };

          const uefaMap = {
            goals_yn: "goals",
            goals_ou: "ugl",
            points_ou: "ugl",
            points_yn: "goals",
            combinedcards: "cards",
            redcards: "rc",
            assists_ou: "uast",
            firsttoscore: "firstgoal",
            first_to_score: "firstgoal",
            lasttoscore: "lastgoal",
            last_to_score: "lastgoal",
            shots_ou: "usht",
            shots_ongoal_ou: "usog",
          };

          // choose mapping table based on sportHint
          if (sportHint === "nfl") {
            // try exact matches then substring heuristics

            const isYesNo = statOriginal.endsWith("_yn");

            if (nflMap[s]) return nflMap[s];
            if (s.includes("pass") && s.includes("yd")) return "pyds";
            if (
              s.includes("pass") &&
              (s.includes("att") || s.includes("attempt"))
            )
              return "patt";
            if (s.includes("comp")) return "pcmp";
            if (s.includes("int")) return "pint";
            if (s.includes("ptd") || s.includes("td") || s.includes("touch"))
              return "ptd";
            if (s.includes("rush") && s.includes("yd")) return "ryds";
            if (s.includes("rec") && s.includes("yd")) return "recyds";
            if (s.includes("kick") || s.includes("kxp") || s.includes("kfg")) {
              if (s.includes("xp") || s.includes("kxp")) return "kxp";
              if (s.includes("fg") || s.includes("kfg")) return "kfg";
              return "kpts";
            }
            if (s.includes("touchdown")) return isYesNo ? "touchdowns" : "tds";
            // Special handling: touchdowns_yn -> touchdowns, touchdowns_ou -> tds
            if (s.includes("touchdown") || s.includes("tds")) {
              return isYesNo ? "touchdowns" : "tds";
            }
            return s.replace(/[^a-z0-9]/g, "_");
          }

          if (sportHint === "nhl") {
            // Check original stat type FIRST (with suffixes intact) for exact matches
            if (nhlMap[statOriginal]) return nhlMap[statOriginal];

            // Then check normalized version
            if (nhlMap[s]) return nhlMap[s];

            // Check if the original statType ends with _yn to determine yes/no vs over/under
            const isYesNo = statOriginal.endsWith("_yn");

            if (s.includes("shot") || s.includes("shots") || s.includes("sht"))
              return "sht";
            if (s.includes("save")) return "gsv";
            if (s.includes("firsttoscore") || s.includes("first_to_score"))
              return "firstgoal";
            if (s.includes("lasttoscore") || s.includes("last_to_score"))
              return "lastgoal";
            if (s.includes("goal")) return isYesNo ? "hgl" : "hgl";
            // Special handling: points_yn -> goals, points_ou -> hgl
            if (s.includes("point") || s.includes("pts")) {
              return isYesNo ? "hgl" : "hgl";
            }
            return s.replace(/[^a-z0-9]/g, "_");
          }

          if (sportHint === "uefa") {
            // Check original stat type FIRST (with suffixes intact) for exact matches
            if (uefaMap[statOriginal]) return uefaMap[statOriginal];

            // Then check normalized version
            if (uefaMap[s]) return uefaMap[s];

            // Check if the original statType ends with _yn to determine yes/no vs over/under
            const isYesNo = statOriginal.endsWith("_yn");

            if (s.includes("shot") || s.includes("shots") || s.includes("sht"))
              return "usog";
            if (s.includes("save")) return "gsv";
            if (s.includes("firsttoscore") || s.includes("first_to_score"))
              return "firstgoal";
            if (s.includes("lasttoscore") || s.includes("last_to_score"))
              return "lastgoal";
            if (s.includes("goal")) return isYesNo ? "hgl" : "hgl";
            // Special handling: points_yn -> goals, points_ou -> hgl
            if (s.includes("point") || s.includes("pts")) {
              return isYesNo ? "hgl" : "hgl";
            }
            return s.replace(/[^a-z0-9]/g, "_");
          }

          // default to NBA mapping
          if (nbaMap[s]) return nbaMap[s];
          if (s.includes("pts") || s.includes("point")) return "pts";
          if (s.includes("reb")) return "reb";
          if (s.includes("ast")) return "ast";
          if (s.includes("blk")) return "blk";
          if (s.includes("stl")) return "stl";
          if (s.includes("3pt") || s.includes("three")) return "3pm";
          return s.replace(/[^a-z0-9]/g, "_");
        };

        Object.entries(stats).forEach(([statType, betValue]) => {
          const shortStat = getShortStat(statType, sport);
          query += `&p${playerNum}_${shortStat}=${betValue}`;
        });
      });

      console.log("Built query:", query);
      const apiUrl = `https://laraiyeogithubio-production-f5af.up.railway.app/api/betslip?${query}`;
      console.log("Fetching betslip:", apiUrl);

      try {
        console.log("Fetching aggregated betslip URL:", apiUrl);
        // Fetch betslip data
        const response = await fetch(apiUrl);
        let betslipData = await response.json();
        console.log("Betslip response:", betslipData);

        // Attach the generated apiUrl into the betslip payload so the server
        // can persist it into the `betslip_url` column and background workers
        // can fetch the aggregated payload.
        if (!betslipData || typeof betslipData !== "object") {
          betslipData = { events: [], metadata: {} };
        }
        betslipData.betslip_url = apiUrl;

        // Submit bet slip with betslip data (includes `betslip_url`)
        try {
          await submitBetSlip(amount, betslipData);
        } catch (e) {
          console.error("submitBetSlip failed:", e?.message || e);
          Alert.alert("Bet failed", e?.message || "Failed to place bet");
          return;
        }

        // Close slip and reset
        setBetAmount("");
        setShowNumpad(false);
        closeSlip();
      } catch (error) {
        console.error("Error fetching betslip:", error);
        // Still submit even if fetch fails; include the URL so server can try
        // fetching the aggregated payload later.
        try {
          await submitBetSlip(amount, { bets: bets, betslip_url: apiUrl });
        } catch (e) {
          console.error("submitBetSlip failed (fallback):", e?.message || e);
          Alert.alert("Bet failed", e?.message || "Failed to place bet");
          return;
        }

        setBetAmount("");
        setShowNumpad(false);
        closeSlip();
      }
    } catch (err) {
      console.error("handleConfirmBet unexpected error:", err);
      Alert.alert("Bet failed", err?.message || String(err));
      return;
    }
  };

  const handleConfirmBetOld = () => {
    // Build API query from bets
    const betsByGame = {};

    // Group bets by game
    bets.forEach((bet) => {
      if (!betsByGame[bet.gameId]) {
        betsByGame[bet.gameId] = {
          gameId: bet.gameId,
          players: [],
        };
      }

      // Add player bet if not already added
      const existingPlayer = betsByGame[bet.gameId].players.find(
        (p) => p.playerId === bet.playerId,
      );
      if (existingPlayer) {
        // Add additional stat for this player
        existingPlayer.stats[bet.statType] = bet.betValue;
      } else {
        // New player
        betsByGame[bet.gameId].players.push({
          playerId: bet.playerId,
          stats: {
            [bet.statType]: bet.betValue,
          },
        });
      }
    });

    // Build query string for each game
    const queryStrings = Object.values(betsByGame).map((game) => {
      let query = `gameId=${game.gameId}`;

      game.players.forEach((player, index) => {
        const playerNum = index + 1;
        query += `&p${playerNum}=${player.playerId}`;

        Object.entries(player.stats).forEach(([statType, betValue]) => {
          query += `&p${playerNum}_${statType}=${betValue}`;
        });
      });

      return query;
    });

    // Log the query strings (in production, you'd make the API call here)
    console.log("Bet Query Strings:");
    queryStrings.forEach((qs) => {
      console.log(`/api/betslip?${qs}`);
    });

    // TODO: Make actual API call to /api/betslip
    // For now, just close the numpad
    setShowNumpad(false);
  };

  const parlayOdds = calculateParlayOdds();
  const betAmountNum = parseFloat(betAmount) || 200; // Default to 200

  // Calculate To Win: (betAmount * totalDecimalOdds) - betAmount
  const calculateToWin = () => {
    const amount = parseFloat(betAmount) || 200; // Default to 200
    if (bets.length === 0) return "0.00";

    const decimalOdds = bets.map((bet) => {
      const odds = parseInt(bet.odds);
      if (odds > 0) {
        return odds / 100 + 1;
      } else {
        return 100 / Math.abs(odds) + 1;
      }
    });

    const totalDecimal = decimalOdds.reduce((acc, odd) => acc * odd, 1);
    const toWin = amount * totalDecimal - amount;
    return toWin.toFixed(2);
  };

  // Calculate Payout: betAmount + toWin
  const calculatePayoutTotal = () => {
    const amount = parseFloat(betAmount) || 200; // Default to 200
    if (bets.length === 0) return "0.00";
    const toWin = parseFloat(calculateToWin());
    return (amount + toWin).toFixed(2);
  };

  const toWin = calculateToWin();
  const payout = calculatePayoutTotal();
  const grouped = groupedBets();

  // Don't render if no bets
  if (bets.length === 0) {
    return null;
  }

  return (
    <>
      {/* Bottom Bar */}
      <TouchableOpacity
        style={[
          styles.bottomBar,
          { backgroundColor: colors.primary },
          !isPro
            ? { marginBottom: 65, height: 60 }
            : isGameDetail && { height: 90 },
        ]}
        onPress={openSlip}
        activeOpacity={0.9}
      >
        <View
          style={[
            styles.bottomBarLeft,
            !isPro ? { marginBottom: 0 } : isGameDetail && { marginBottom: 30 },
          ]}
        >
          <View style={styles.betCountBadge}>
            <Text style={styles.betCountText}>{bets.length}</Text>
          </View>
          <Text style={styles.bottomBarText}>Betslip</Text>
        </View>
        <View
          style={[
            styles.bottomBarRight,
            !isPro ? { marginBottom: 0 } : isGameDetail && { marginBottom: 30 },
          ]}
        >
          {bets.length > 1 && (
            <View style={styles.parlayBadge}>
              <Text style={styles.parlayText}>
                {formatOddsForDisplay(parlayOdds, oddsDisplay)}
              </Text>
            </View>
          )}
          {bets.length === 1 && (
            <View style={styles.parlayBadge}>
              <Text style={styles.parlayText}>
                {formatOddsForDisplay(bets[0].odds, oddsDisplay)}
              </Text>
            </View>
          )}
          <Ionicons name="chevron-up" size={24} color="white" />
        </View>
      </TouchableOpacity>

      {/* Full Screen Modal */}
      <Modal
        visible={isSlipOpen && isFocused}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          console.log(
            `[BetSlip] Modal onRequestClose (route=${route?.name || "unknown"})`,
          );
          closeSlip();
        }}
        onDismiss={() =>
          console.log(
            `[BetSlip] Modal onDismiss (route=${route?.name || "unknown"})`,
          )
        }
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: theme.background,
              },
            ]}
          >
            {/* Header */}
            <View
              style={[styles.modalHeader, { borderBottomColor: theme.border }]}
            >
              <View style={styles.modalHeaderLeft}>
                <View
                  style={[
                    styles.betCountBadge,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text style={styles.betCountText}>{bets.length}</Text>
                </View>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  Betslip
                </Text>
              </View>
              <View style={styles.modalHeaderRight}>
                <TouchableOpacity
                  onPress={clearBets}
                  style={styles.clearButton}
                >
                  <Text
                    style={[styles.clearButtonText, { color: theme.error }]}
                  >
                    Clear All
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={closeSlip}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={28} color={theme.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Tabs */}
            <View
              style={[styles.tabsContainer, { backgroundColor: theme.surface }]}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TouchableOpacity
                  style={[
                    styles.tab,
                    styles.activeTab,
                    { borderBottomColor: colors.primary },
                  ]}
                >
                  <Text style={[styles.tabText, { color: colors.primary }]}>
                    {bets.length === 1 ? "SINGLE" : "PARLAY"}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.creditsContainer}>
                <Text style={[styles.creditsText, { color: theme.text }]}>
                  {Number(credits || 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  C
                </Text>
              </View>
            </View>

            {/* Bets List */}
            <ScrollView
              style={styles.betsList}
              showsVerticalScrollIndicator={false}
            >
              {Object.entries(grouped).map(([gameId, group]) => {
                // Find game data from scoreboard
                let gameData = scoreboardGames.find((g) => g.id === gameId);

                // Format game header info
                let gameHeaderInfo;

                if (gameData) {
                  // Check if it's a raw ESPN event or parsed game object
                  if (gameData.competitions) {
                    // Raw ESPN event format
                    const competition = gameData.competitions[0];
                    const competitors = competition?.competitors || [];
                    const awayTeam = competitors.find(
                      (c) => c.homeAway === "away",
                    );
                    const homeTeam = competitors.find(
                      (c) => c.homeAway === "home",
                    );

                    gameHeaderInfo = {
                      teams: gameData.shortName || "TBD",
                      time: competition?.status?.type?.shortDetail || "TBD",
                      period: null,
                    };
                  } else {
                    // Parsed game object format (from BetHomeScreen)
                    gameHeaderInfo = {
                      teams: `${gameData.team1Abbr} vs ${gameData.team2Abbr}`,
                      time: gameData.time,
                      period: gameData.period,
                    };
                  }
                } else {
                  gameHeaderInfo = group.gameInfo || {
                    teams: "TBD",
                    time: "TBD",
                  };
                }

                // Use full gameInfo.time if available (for scheduled games)
                const displayTime =
                  group.gameInfo?.time || gameHeaderInfo?.time || "TBD";

                return (
                  <View key={gameId} style={styles.gameGroup}>
                    {/* Game Header */}
                    {gameHeaderInfo && (
                      <TouchableOpacity
                        style={[
                          styles.gameHeader,
                          { backgroundColor: theme.surface },
                        ]}
                        onPress={() => {
                          // Close slip first, then navigate
                          closeSlip();

                          // Extract sport from gameId suffix (e.g., "401810365_nba" -> sport: "NBA", gameId: "401810365")
                          const sportMatch = gameId.match(
                            /_(nba|nfl|nhl|mlb|uefa|ncaa|wnba)$/i,
                          );
                          const sport = sportMatch
                            ? sportMatch[1].toUpperCase()
                            : null;
                          const cleanGameId = gameId.replace(
                            /_(nba|nfl|nhl|mlb|uefa|ncaa|wnba)$/i,
                            "",
                          );

                          // Navigate even if gameData is not found - BetGameDetailScreen will handle it
                          navigation.navigate("BetGameDetail", {
                            gameId: cleanGameId,
                            game: gameData || { id: cleanGameId },
                            sport: sport, // Pass sport so it uses correct logic
                          });
                        }}
                      >
                        <View>
                          <Text
                            style={[
                              styles.gameHeaderTeams,
                              { color: theme.text },
                            ]}
                          >
                            {gameHeaderInfo.teams}
                          </Text>
                          <Text
                            style={[
                              styles.gameHeaderTime,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {gameHeaderInfo.period
                              ? `${gameHeaderInfo.period} • `
                              : ""}
                            {displayTime}
                          </Text>
                        </View>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          {group.bets.length >= 2 && (
                            <View
                              style={[
                                styles.sgpBadge,
                                { backgroundColor: colors.primary },
                              ]}
                            >
                              <Text style={styles.sgpBadgeText}>SGP</Text>
                            </View>
                          )}
                          <Ionicons
                            name="chevron-forward"
                            size={16}
                            color={theme.textSecondary}
                          />
                        </View>
                      </TouchableOpacity>
                    )}

                    {/* Bets in this game */}
                    {group.bets.map((bet, index) => {
                      // Helper to convert stat type based on sport BEFORE normalization
                      const convertStatTypeForSport = (statType, sport) => {
                        if (!statType || !sport) return statType;
                        const sportUpper = String(sport).toUpperCase();
                        const statLower = String(statType).toLowerCase();

                        // Only convert for NHL or UEFA
                        if (sportUpper === "NHL" || sportUpper === "UEFA") {
                          // points_yn -> anytime_goals for yes/no bets
                          if (statLower === "points_yn") {
                            return "anytime_goal";
                          }
                          // points_ou -> goals for over/under bets
                          if (statLower === "points_ou") {
                            return "goals";
                          }
                          if (statLower === "combinedcards_yn") {
                            return "anytime_card";
                          }

                          if (statLower === "redcards_yn") {
                            return "anytime_red_card";
                          }
                        }
                        if (sportUpper === "NFL") {
                          // touchdowns_yn -> anytime_touchdowns for yes/no bets
                          if (statLower === "touchdowns_yn") {
                            return "anytime_touchdown";
                          }
                        }

                        return statType;
                      };

                      // Helper to normalize stat type display (remove suffixes and format nicely)
                      const normalizeStatTypeDisplay = (statType, sport) => {
                        if (!statType) return "";

                        // Convert stat type based on sport FIRST
                        let converted = convertStatTypeForSport(
                          statType,
                          sport,
                        );

                        let normalized = converted
                          .replace(/_ou$/i, "")
                          .replace(/_yn$/i, "")
                          .replace(/_ml$/i, "")
                          .replace(/_o$/i, "")
                          .replace(/_u$/i, "");

                        // Convert underscores to spaces and capitalize each word
                        normalized = normalized
                          .replace(/_/g, " ")
                          .split(" ")
                          .map(
                            (word) =>
                              word.charAt(0).toUpperCase() + word.slice(1),
                          )
                          .join(" ");

                        return normalized;
                      };

                      // Format bet type display
                      const getBetTypeDisplay = () => {
                        if (!bet.type) return "BET";

                        if (
                          bet.type === "milestone" ||
                          bet.type === "Milestone"
                        ) {
                          const statType = bet.statType
                            ? normalizeStatTypeDisplay(bet.statType, bet.sport)
                            : bet.prop?.split(" ")[0] || "";
                          return `Milestone ${statType}`;
                        }

                        // For alternate lines, show "Alt" with the stat type
                        if (bet.type === "alt") {
                          const statType = bet.statType
                            ? normalizeStatTypeDisplay(bet.statType, bet.sport)
                            : "";
                          return `Alt ${statType}`;
                        }

                        // For yes/no bets, show the normalized stat type
                        if (bet.type === "yesno") {
                          const statType = bet.statType
                            ? normalizeStatTypeDisplay(bet.statType, bet.sport)
                            : "";
                          return statType || "Yes/No";
                        }

                        // For over/under player props, include stat type
                        if (
                          (bet.type === "over" || bet.type === "under") &&
                          bet.statType
                        ) {
                          const capitalizedType =
                            bet.type.charAt(0).toUpperCase() +
                            bet.type.slice(1);
                          return `${capitalizedType} ${normalizeStatTypeDisplay(
                            bet.statType,
                            bet.sport,
                          )}`;
                        }
                        // For game lines (Spread, Total, Moneyline), just return the type
                        let typeCap =
                          bet.type.charAt(0).toUpperCase() + bet.type.slice(1);
                        // If this is a total with UEFA special type, show specific label
                        const special = getSpecialUefaTotalType(bet);
                        if (
                          (typeCap === "Total" ||
                            typeCap === "Over/under" ||
                            typeCap.toLowerCase().includes("total")) &&
                          special
                        ) {
                          if (special === "corner")
                            typeCap =
                              "TOTAL CORNER KICKS OVER/UNDER (FULL MATCH)";
                          if (special === "cards")
                            typeCap =
                              "TOTAL CARDS (WEIGHTED) OVER/UNDER (FULL MATCH)";
                        }
                        // Append ALT marker when appropriate
                        if (isAltBet(bet)) return `${typeCap} (ALT)`;
                        return typeCap;
                      };

                      return (
                        <TouchableOpacity
                          key={bet.id}
                          activeOpacity={0.85}
                          onPress={() => {
                            try {
                              const scoreboardForGame = Array.isArray(
                                scoreboardGames,
                              )
                                ? scoreboardGames.find(
                                    (g) =>
                                      String(g.id) === String(bet.gameId) ||
                                      String(g.gameId) === String(bet.gameId) ||
                                      g.header?.competitions?.[0]?.id ===
                                        bet.gameId,
                                  )
                                : undefined;
                              console.log("Bet clicked", {
                                betId: bet.id,
                                gameId: bet.gameId,
                                bet,
                                scoreboardForGame,
                                scoreboardGamesCount: Array.isArray(
                                  scoreboardGames,
                                )
                                  ? scoreboardGames.length
                                  : 0,
                              });
                            } catch (e) {
                              console.error("Error logging bet click:", e);
                            }
                          }}
                          style={[
                            styles.betItem,
                            { backgroundColor: theme.surfaceSecondary },
                            index === group.bets.length - 1 &&
                              styles.lastBetItem,
                          ]}
                        >
                          {/* X button on left */}
                          <TouchableOpacity
                            style={styles.removeBetButton}
                            onPress={() => removeBet(bet.id)}
                          >
                            <Ionicons
                              name="close"
                              size={24}
                              color={theme.textSecondary}
                            />
                          </TouchableOpacity>

                          {/* Player/Team info in center */}
                          <View style={styles.betItemContent}>
                            <Text
                              style={[
                                styles.betDescription,
                                { color: theme.text },
                              ]}
                            >
                              {/* For team bets, show team/game and bet line */}
                              {bet.type.includes("Total") ||
                              bet.type.includes("Over/Under") ||
                              bet.type.includes("Yes/No")
                                ? bet.team
                                  ? `${bet.team} • ${bet.line}`
                                  : `${
                                      bet.period
                                        ? bet.period.toUpperCase()
                                        : "GAME"
                                    } • ${bet.line}`
                                : bet.type.includes("Moneyline")
                                  ? bet.team || bet.line || "DRAW"
                                  : bet.type.includes("Spread")
                                    ? `${bet.team} • ${bet.line}`
                                    : bet.type === "Milestone"
                                      ? `${
                                          bet.team ||
                                          (bet.period
                                            ? bet.period.toUpperCase()
                                            : "GAME")
                                        } • ${bet.line || bet.betValue || ""}`
                                      : bet.type === "alt" ||
                                          (bet.type &&
                                            bet.type.includes("(Alt)"))
                                        ? `${bet.team || "TEAM"} • ${
                                            bet.line || bet.betValue || ""
                                          }`
                                        : `${bet.player} • ${
                                            bet.type === "yesno" && bet.betValue
                                              ? bet.betValue
                                                  .charAt(0)
                                                  .toUpperCase() +
                                                bet.betValue.slice(1)
                                              : bet.betValue
                                          }`}
                            </Text>
                            <Text
                              style={[
                                styles.betType,
                                { color: theme.textSecondary },
                              ]}
                            >
                              {getBetTypeDisplay()}
                            </Text>
                          </View>

                          {/* Odds on right */}
                          <View style={styles.betOddsContainer}>
                            <Text
                              style={[
                                styles.betOdds,
                                { color: colors.primary },
                              ]}
                            >
                              {formatOddsForDisplay(bet.odds, oddsDisplay)}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
            </ScrollView>

            {/* Bottom Section - Bet Input */}
            <View
              style={[
                styles.bottomSection,
                {
                  backgroundColor: theme.surface,
                  borderTopColor: theme.border,
                },
              ]}
            >
              {/* Parlay Odds Display */}
              <View style={styles.oddsRow}>
                <View
                  style={[
                    styles.oddsDisplayContainer,
                    { backgroundColor: theme.surfaceSecondary },
                  ]}
                >
                  <View style={styles.oddsDisplayLeft}>
                    <Text
                      style={[
                        styles.oddsDisplayLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {bets.length > 1 ? "PARLAY" : "ODDS"}
                    </Text>
                    {bets.length > 1 && (
                      <Text
                        style={[
                          styles.oddsDisplaySubtext,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {bets.length} legs
                      </Text>
                    )}
                  </View>
                  <Text
                    style={[styles.oddsDisplayValue, { color: colors.primary }]}
                  >
                    {formatOddsForDisplay(parlayOdds, oddsDisplay)}
                  </Text>
                </View>
              </View>

              {/* Quick Add Buttons + Amount Display */}
              <View style={styles.quickAddAndAmountRow}>
                {[10, 50, 200].map((amount) => (
                  <TouchableOpacity
                    key={amount}
                    style={[
                      styles.quickAddButton,
                      { backgroundColor: "rgba(76, 175, 80, 0.15)" },
                    ]}
                    onPress={() => handleQuickAdd(amount)}
                  >
                    <Text style={[styles.quickAddText, { color: "#4CAF50" }]}>
                      +{amount} C
                    </Text>
                  </TouchableOpacity>
                ))}

                {/* Amount Display Box */}
                <TouchableOpacity
                  style={[
                    styles.amountDisplayBox,
                    {
                      backgroundColor: theme.surfaceSecondary,
                      borderColor: theme.border,
                    },
                  ]}
                  onPress={() => setShowNumpad(true)}
                >
                  <Text
                    style={[
                      styles.amountDisplayText,
                      { color: betAmount ? theme.text : theme.textSecondary },
                    ]}
                  >
                    {betAmount || "200"} C
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Numpad (appears here when open) */}
              {showNumpad && (
                <View style={styles.numpadContainer}>
                  <View style={styles.numpadRow}>
                    {["1", "2", "3"].map((num) => (
                      <TouchableOpacity
                        key={num}
                        style={[
                          styles.numpadButton,
                          {
                            backgroundColor: theme.surfaceSecondary,
                            borderColor: theme.border,
                          },
                        ]}
                        onPress={() => handleNumpadPress(num)}
                      >
                        <Text
                          style={[
                            styles.numpadButtonText,
                            { color: theme.text },
                          ]}
                        >
                          {num}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.numpadRow}>
                    {["4", "5", "6"].map((num) => (
                      <TouchableOpacity
                        key={num}
                        style={[
                          styles.numpadButton,
                          {
                            backgroundColor: theme.surfaceSecondary,
                            borderColor: theme.border,
                          },
                        ]}
                        onPress={() => handleNumpadPress(num)}
                      >
                        <Text
                          style={[
                            styles.numpadButtonText,
                            { color: theme.text },
                          ]}
                        >
                          {num}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.numpadRow}>
                    {["7", "8", "9"].map((num) => (
                      <TouchableOpacity
                        key={num}
                        style={[
                          styles.numpadButton,
                          {
                            backgroundColor: theme.surfaceSecondary,
                            borderColor: theme.border,
                          },
                        ]}
                        onPress={() => handleNumpadPress(num)}
                      >
                        <Text
                          style={[
                            styles.numpadButtonText,
                            { color: theme.text },
                          ]}
                        >
                          {num}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.numpadRow}>
                    <TouchableOpacity
                      style={[
                        styles.numpadButton,
                        {
                          backgroundColor: theme.surfaceSecondary,
                          borderColor: theme.border,
                        },
                      ]}
                      onPress={() => handleNumpadPress(".")}
                    >
                      <Text
                        style={[styles.numpadButtonText, { color: theme.text }]}
                      >
                        .
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.numpadButton,
                        {
                          backgroundColor: theme.surfaceSecondary,
                          borderColor: theme.border,
                        },
                      ]}
                      onPress={() => handleNumpadPress("0")}
                    >
                      <Text
                        style={[styles.numpadButtonText, { color: theme.text }]}
                      >
                        0
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.numpadButton,
                        {
                          backgroundColor: theme.surfaceSecondary,
                          borderColor: theme.border,
                        },
                      ]}
                      onPress={() => handleNumpadPress("backspace")}
                    >
                      <Text
                        style={[styles.numpadButtonText, { color: theme.text }]}
                      >
                        ⌫
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Main Bet Button */}
              <TouchableOpacity
                disabled={placingBet || !(showNumpad && betAmount)}
                style={[
                  styles.mainBetButton,
                  {
                    backgroundColor: placingBet
                      ? "#dcdcdc"
                      : showNumpad && betAmount
                        ? colors.primary
                        : theme.surface,
                    borderColor: placingBet ? colors.primary : theme.border,
                    opacity: placingBet ? 0.95 : 1,
                  },
                ]}
                onPress={async () => {
                  if (placingBet) return;
                  if (showNumpad && betAmount) {
                    try {
                      setPlacingBet(true);
                      await handleConfirmBet();
                    } catch (e) {
                      console.warn("handleConfirmBet error", e?.message || e);
                      Alert.alert(
                        "Bet failed",
                        e?.message || "Failed to place bet",
                      );
                    } finally {
                      setPlacingBet(false);
                    }
                  } else {
                    setShowNumpad(true);
                  }
                }}
              >
                {placingBet ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text
                      style={[styles.mainBetButtonLabel, { color: theme.text }]}
                    >
                      Processing...
                    </Text>
                  </View>
                ) : !showNumpad || !betAmount ? (
                  <>
                    <Text
                      style={[
                        styles.mainBetButtonLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Enter Wager Amount
                    </Text>
                    <Text
                      style={[styles.mainBetButtonValue, { color: theme.text }]}
                    >
                      {Number(betAmount || 200).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      C pays{" "}
                      {Number(payout).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      C
                    </Text>
                  </>
                ) : (
                  <>
                    <Text
                      style={[styles.mainBetButtonLabel, { color: "#FFF" }]}
                    >
                      Confirm Bet
                    </Text>
                    <Text
                      style={[styles.mainBetButtonValue, { color: "#FFF" }]}
                    >
                      Total Payout:{" "}
                      {Number(payout).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      C
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  bottomBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bottomBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  betCountBadge: {
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  betCountText: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
  },
  bottomBarText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  parlayBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  parlayText: {
    color: "white",
    fontSize: 11,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
  },
  modalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: height * 0.9,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
  },
  modalHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modalHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  clearButton: {
    paddingHorizontal: 8,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  closeButton: {
    padding: 4,
  },
  tabsContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
  },
  tab: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "700",
  },
  creditsContainer: {
    marginLeft: "auto",
    justifyContent: "center",
    alignItems: "flex-end",
    paddingHorizontal: 8,
  },
  creditsText: {
    fontSize: 16,
    fontWeight: "700",
  },
  betsList: {
    flex: 1,
  },
  gameGroup: {
    marginBottom: 16,
  },
  gameHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  gameHeaderTeams: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  gameHeaderTime: {
    fontSize: 12,
    fontWeight: "600",
  },
  sgpBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  sgpBadgeText: {
    color: "white",
    fontSize: 11,
    fontWeight: "700",
  },
  betItem: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  lastBetItem: {
    marginBottom: 8,
  },
  removeBetButton: {
    padding: 4,
  },
  betItemContent: {
    flex: 1,
  },
  betType: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  betDescription: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  betOddsContainer: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 60,
  },
  betLine: {
    fontSize: 14,
    fontWeight: "600",
  },
  betOdds: {
    fontSize: 20,
    fontWeight: "bold",
  },
  parlayInfo: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
  },
  parlayInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  parlayInfoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  parlayInfoTitle: {
    fontSize: 14,
    fontWeight: "bold",
  },
  parlayInfoOdds: {
    fontSize: 16,
    fontWeight: "bold",
  },
  parlayInfoSubtext: {
    fontSize: 12,
    marginTop: 4,
  },
  bottomSection: {
    padding: 16,
    borderTopWidth: 1,
    paddingBottom: 30,
  },
  oddsRow: {
    marginBottom: 16,
  },
  oddsDisplayContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  oddsDisplayLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  oddsDisplayLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  oddsDisplayValue: {
    fontSize: 24,
    fontWeight: "bold",
  },
  oddsDisplaySubtext: {
    fontSize: 11,
  },
  quickAddAndAmountRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  quickAddButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  quickAddText: {
    fontSize: 16,
    fontWeight: "700",
  },
  amountDisplayBox: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
  },
  amountDisplayText: {
    fontSize: 16,
    fontWeight: "700",
  },
  mainBetButton: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    marginBottom: 12,
  },
  mainBetButtonLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  mainBetButtonValue: {
    fontSize: 16,
    fontWeight: "bold",
  },
  numpadContainer: {
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 12,
  },
  numpadRow: {
    flexDirection: "row",
  },
  numpadButton: {
    flex: 1,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderRightWidth: 1,
  },
  numpadButtonText: {
    fontSize: 24,
    fontWeight: "600",
  },
});

export default BetSlip;

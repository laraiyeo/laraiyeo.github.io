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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../context/ThemeContext";
import { useBetSlip } from "../context/BetSlipContext";
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

  const oddsContext = useContext(OddsDisplayContext);
  const oddsDisplay = oddsContext ? oddsContext.oddsDisplay : "american";

  const [betAmount, setBetAmount] = useState("");
  const [showNumpad, setShowNumpad] = useState(false);
  const [credits, setCredits] = useState(0);

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
          e?.message || e
        );
      }
    };
    if (isSlipOpen) fetchProfile();
    return () => {
      mounted = false;
    };
  }, [isSlipOpen]);

  const openSlip = () => {
    setIsSlipOpen(true);
  };

  const closeSlip = () => {
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
            })} Credits available.`
          );
          return;
        }
        console.log("Balance check OK", { balance });
      }
    } catch (e) {
      // If checking balance failed, continue and let server validate
      console.warn(
        "Failed to load profile for balance check:",
        e?.message || e
      );
    }
    try {
      // Build API query from bets
      const gameIds = [...new Set(bets.map((bet) => bet.gameId))].filter(
        Boolean
      );
      console.log("Computed gameIds:", gameIds);
      // Prevent placing bets on games that are not pre-game according to stored scoreboard
      const liveGameIds = [];
      gameIds.forEach((gid) => {
        const sg =
          scoreboardGames && typeof scoreboardGames.find === "function"
            ? scoreboardGames.find(
                (g) =>
                  String(g.id) === String(gid) ||
                  String(g.gameId) === String(gid) ||
                  g.header?.competitions?.[0]?.id === gid
              )
            : undefined;
        console.log(
          "live-check: gid, scoreboardGames length, matched sg:",
          gid,
          Array.isArray(scoreboardGames) ? scoreboardGames.length : 0,
          sg
        );
        if (!sg) return;
        const state =
          sg.header?.competitions?.[0]?.status?.type?.state ||
          sg.status?.type?.state ||
          sg.status?.state ||
          sg.status;
        console.log("live-check: gid state:", gid, state);
        if (state && state !== "pre" && state !== "scheduled") {
          liveGameIds.push(gid);
        }
      });

      console.log("liveGameIds computed:", liveGameIds);

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
          ]
        );

        return;
      }
      const playerBets = {};
      const gameLineBets = { moneyline: null, total: null, spread: null };

      // Group player bets and game line bets
      try {
        bets.forEach((bet) => {
          // small guard to avoid throwing when fields missing
          if (!bet) return;
          // Game line bets (Spread, Total, Moneyline)
          if (bet.type === "Spread") {
            gameLineBets.spread = `${bet.team}${bet.line}`;
          } else if (bet.type === "Total") {
            // Extract o/u from description (e.g., "OVER" or "UNDER")
            const overUnder = bet.description?.toLowerCase().includes("over")
              ? "o"
              : "u";
            // Extract just the number from bet.line (e.g., "U 242.5" -> "242.5")
            const lineNumber = bet.line.replace(/^[OU]\s+/, "");
            gameLineBets.total = `${overUnder}${lineNumber}`;
          } else if (bet.type === "Moneyline") {
            gameLineBets.moneyline = bet.team;
          }
          // Player prop bets
          else if (bet.playerId && bet.statType) {
            if (!playerBets[bet.playerId]) {
              playerBets[bet.playerId] = {};
            }
            playerBets[bet.playerId][bet.statType] = bet.betValue;
          }
        });
      } catch (groupErr) {
        console.error("Error grouping bets:", groupErr);
        throw groupErr;
      }

      // Build query string
      let query = `gameId=${gameIds.join(",")}`;
      console.log("Player bets:", playerBets, "gameLineBets:", gameLineBets);

      if (gameLineBets.moneyline)
        query += `&moneyline=${gameLineBets.moneyline}`;
      if (gameLineBets.total) query += `&total=${gameLineBets.total}`;
      if (gameLineBets.spread) query += `&spread=${gameLineBets.spread}`;

      Object.entries(playerBets).forEach(([playerId, stats], index) => {
        const playerNum = index + 1;
        query += `&p${playerNum}=${playerId}`;
        Object.entries(stats).forEach(([statType, betValue]) => {
          // Convert statType to short form for API
          const statTypeMap = {
            points: "pts",
            rebounds: "reb",
            assists: "ast",
            blocks: "blk",
            steals: "stl",
            turnovers: "to",
            threes: "3pt",
            pra: "pra",
          };
          const shortStat = statTypeMap[statType.toLowerCase()] || "pts";
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
        (p) => p.playerId === bet.playerId
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
          !isPro ? {bottom: 65, height: 60} : isGameDetail && { height: 90 },
        ]}
        onPress={openSlip}
        activeOpacity={0.9}
      >
        <View
          style={[styles.bottomBarLeft, !isPro ? { marginBottom: 0 } : isGameDetail && { marginBottom: 30 }]}
        >
          <View style={styles.betCountBadge}>
            <Text style={styles.betCountText}>{bets.length}</Text>
          </View>
          <Text style={styles.bottomBarText}>Betslip</Text>
        </View>
        <View
          style={[styles.bottomBarRight, !isPro ? { marginBottom: 0 } : isGameDetail && { marginBottom: 30 }]}
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
        visible={isSlipOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={closeSlip}
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
                    {bets.length === 1 ? "STRAIGHT" : "PARLAY"}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.creditsContainer}>
                <Text style={[styles.creditsText, { color: theme.text }]}>
                  {Number(credits || 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} C
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
                      (c) => c.homeAway === "away"
                    );
                    const homeTeam = competitors.find(
                      (c) => c.homeAway === "home"
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

                          // Navigate even if gameData is not found - BetGameDetailScreen will handle it
                          navigation.navigate("BetGameDetail", {
                            gameId: gameId,
                            game: gameData || { id: gameId },
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
                      // Format bet type display
                      const getBetTypeDisplay = () => {
                        if (!bet.type) return "BET";

                        if (bet.type === "milestone") {
                          // Capitalize first letter and add stat type (e.g., "Milestone Points")
                          const statType = bet.statType
                            ? bet.statType.toUpperCase()
                            : bet.prop?.split(" ")[0] || "";
                          return `Milestone ${statType}`;
                        }
                        // For over/under player props, include stat type
                        if (
                          (bet.type === "over" || bet.type === "under") &&
                          bet.statType
                        ) {
                          const capitalizedType =
                            bet.type.charAt(0).toUpperCase() +
                            bet.type.slice(1);
                          return `${capitalizedType} ${bet.statType.toUpperCase()}`;
                        }
                        // For game lines (Spread, Total, Moneyline), just return the type
                        return (
                          bet.type.charAt(0).toUpperCase() + bet.type.slice(1)
                        );
                      };

                      return (
                        <TouchableOpacity
                          key={bet.id}
                          activeOpacity={0.85}
                          onPress={() => {
                            try {
                              const scoreboardForGame = Array.isArray(
                                scoreboardGames
                              )
                                ? scoreboardGames.find(
                                    (g) =>
                                      String(g.id) === String(bet.gameId) ||
                                      String(g.gameId) === String(bet.gameId) ||
                                      g.header?.competitions?.[0]?.id ===
                                        bet.gameId
                                  )
                                : undefined;
                              console.log("Bet clicked", {
                                betId: bet.id,
                                gameId: bet.gameId,
                                bet,
                                scoreboardForGame,
                                scoreboardGamesCount: Array.isArray(
                                  scoreboardGames
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
                              {bet.type === "Total"
                                ? `GAME • ${bet.line}`
                                : bet.type === "Moneyline"
                                ? bet.team
                                : bet.type === "Spread"
                                ? `${bet.team} • ${bet.line}`
                                : `${bet.player} • ${bet.betValue}`}
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
                style={[
                  styles.mainBetButton,
                  {
                    backgroundColor:
                      showNumpad && betAmount
                        ? colors.primary
                        : theme.surfaceSecondary,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => {
                  if (showNumpad && betAmount) {
                    handleConfirmBet();
                  } else {
                    setShowNumpad(true);
                  }
                }}
              >
                {!showNumpad || !betAmount ? (
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
                      })} C pays{" "}
                      {Number(payout).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} C
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
                      Total Payout: {Number(payout).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} C
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

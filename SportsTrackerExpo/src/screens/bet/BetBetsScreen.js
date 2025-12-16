import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import BetSlip from "../../components/BetSlip";

const BetBetsScreen = () => {
  const { colors, theme } = useTheme();
  const [selectedTab, setSelectedTab] = useState("open"); // open, settled, saved
  const [expandedParlays, setExpandedParlays] = useState(new Set([1])); // Default first parlay expanded

  // Mock data - replace with actual bet history
  const mockBets = {
    open: [
      {
        id: 1,
        type: "parlay",
        picks: [
          {
            id: "p1",
            playerName: "Jaylen Brown",
            team: "BOS",
            propType: "points",
            line: 20,
            type: "over",
            currentValue: 34,
            status: "winning", // winning, losing, pending
            gameInfo: "Toronto Raptors vs Miami Heat",
            gameStatus: "4th - 0:35",
            odds: "+919",
          },
          {
            id: "p2",
            playerName: "Immanuel Quickley",
            team: "TOR",
            propType: "threes",
            line: 2.5,
            type: "over",
            currentValue: 3,
            status: "winning",
            gameInfo: "Toronto Raptors vs Miami Heat",
            gameStatus: "4th - 0:35",
            odds: "+919",
          },
          {
            id: "p3",
            playerName: "Immanuel Quickley",
            team: "TOR",
            propType: "rebounds",
            line: 3.5,
            type: "over",
            currentValue: 4,
            status: "winning",
            gameInfo: "Toronto Raptors vs Miami Heat",
            gameStatus: "4th - 0:35",
            odds: "+919",
          },
          {
            id: "p4",
            playerName: "Norman Powell",
            team: "LAC",
            propType: "rebounds",
            line: 3.5,
            type: "over",
            currentValue: 2,
            status: "losing",
            gameInfo: "Toronto Raptors vs Miami Heat",
            gameStatus: "4th - 0:35",
            odds: "+919",
          },
          {
            id: "p5",
            playerName: "Jaime Jaquez Jr.",
            team: "MIA",
            propType: "rebounds",
            line: 4,
            type: "milestone",
            milestone: "4+",
            currentValue: 4,
            status: "winning",
            gameInfo: "Toronto Raptors vs Miami Heat",
            gameStatus: "4th - 0:35",
            odds: "+919",
          },
          {
            id: "p6",
            playerName: "Scottie Barnes",
            team: "TOR",
            propType: "assists",
            line: 4,
            type: "milestone",
            milestone: "4+",
            currentValue: 5,
            status: "winning",
            gameInfo: "Toronto Raptors vs Miami Heat",
            gameStatus: "4th - 0:35",
            odds: "+919",
          },
        ],
        wager: 10,
        potentialPayout: 1110.22,
        cashOutValue: 104.94,
        odds: "+919",
        gameInfo: "Toronto Raptors vs Miami Heat",
        scores: { team1: 104, team2: 96 },
        gameStatus: "4th - 0:35",
      },
      {
        id: 2,
        type: "parlay",
        picks: [
          {
            id: "p7",
            playerName: "Cooper Flagg",
            team: "DAL",
            propType: "points",
            line: 15,
            type: "milestone",
            milestone: "15+",
            currentValue: null,
            status: "pending",
            gameInfo: "Dallas Mavericks vs Utah Jazz",
            gameStatus: "2nd - 04:49",
            odds: "-308",
          },
        ],
        wager: 10,
        potentialPayout: 1110.22,
        cashOutValue: null,
        odds: "-308",
        gameInfo: "Dallas Mavericks vs Utah Jazz",
        scores: { team1: 46, team2: 43 },
        gameStatus: "2nd - 04:49",
      },
      {
        id: 3,
        type: "single",
        teamName: "Pittsburgh Steelers",
        betType: "moneyline",
        odds: "-180",
        currentValue: 14,
        status: "winning",
        gameInfo: "Miami Dolphins vs Pittsburgh Steelers",
        scores: { team1: 3, team2: 14 },
        gameStatus: "3rd - 05:06",
        quarter: "3rd & 12, MIA 28",
        wager: 10,
        potentialPayout: 15.56,
      },
      {
        id: 4,
        type: "single",
        teamName: "Dallas Mavericks",
        betType: "moneyline",
        odds: "-118",
        currentValue: 56,
        status: "winning",
        gameInfo: "Dallas Mavericks vs Utah Jazz",
        scores: { team1: 56, team2: 54 },
        gameStatus: "2nd - 04:49",
        wager: 10,
        potentialPayout: 18.47,
      },
      {
        id: 5,
        type: "single",
        teamName: "Denver Nuggets",
        betType: "moneyline",
        odds: "-104",
        currentValue: 21,
        status: "losing",
        gameInfo: "Houston Rockets vs Denver Nuggets",
        scores: { team1: 30, team2: 21 },
        gameStatus: "1st - 0:45",
        wager: 10,
        potentialPayout: 19.62,
      },
      {
        id: 6,
        type: "single",
        playerName: "Norman Powell",
        team: "LAC",
        propType: "points",
        line: 20,
        type: "milestone",
        milestone: "20+",
        currentValue: null,
        status: "pending",
        gameInfo: "Memphis Grizzlies @ Los Angeles Clippers",
        gameStatus: "10:40PM ET",
        odds: "-174",
        wager: 10,
        potentialPayout: 15.75,
      },
    ],
    settled: [
      {
        id: 7,
        type: "single",
        teamName: "Detroit Pistons",
        betType: "moneyline",
        odds: "+130",
        status: "won",
        gameInfo: "Detroit Pistons vs Boston Celtics",
        scores: { team1: 112, team2: 105 },
        gameStatus: "Finished",
        wager: 10,
        payout: 23.0,
      },
    ],
    saved: [],
  };

  const bets = mockBets[selectedTab] || [];

  const toggleParlay = (parlayId) => {
    setExpandedParlays((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(parlayId)) {
        newSet.delete(parlayId);
      } else {
        newSet.add(parlayId);
      }
      return newSet;
    });
  };

  const getStatusIcon = (status) => {
    if (status === "winning" || status === "won") {
      return (
        <View style={[styles.statusIcon, { backgroundColor: "#22C55E" }]}>
          <Ionicons name="checkmark" size={12} color="#FFF" />
        </View>
      );
    } else if (status === "losing" || status === "lost") {
      return (
        <View
          style={[
            styles.statusIcon,
            { backgroundColor: theme.cardBackground, borderWidth: 1, borderColor: theme.border },
          ]}
        />
      );
    } else {
      return (
        <View
          style={[
            styles.statusIcon,
            { backgroundColor: theme.cardBackground, borderWidth: 1, borderColor: theme.border },
          ]}
        />
      );
    }
  };

  const renderProgressBar = (pick) => {
    const progress = pick.currentValue ? Math.min((pick.currentValue / pick.line) * 100, 100) : 0;
    const isOver = pick.currentValue >= pick.line;

    return (
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${progress}%`,
                backgroundColor: isOver ? "#22C55E" : theme.textTertiary,
              },
            ]}
          />
        </View>
        <View style={styles.progressLabels}>
          <Text style={[styles.progressValue, { color: theme.text }]}>{pick.line}</Text>
          {pick.currentValue !== null && (
            <View
              style={[
                styles.progressIndicator,
                {
                  left: `${Math.min(progress, 95)}%`,
                  backgroundColor: isOver ? "#22C55E" : theme.text,
                },
              ]}
            >
              <Text style={styles.progressIndicatorText}>{pick.currentValue}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderPlayerPick = (pick, isInParlay = false) => (
    <View key={pick.id} style={[styles.pickCard, { backgroundColor: theme.cardBackground }]}>
      <View style={styles.pickHeader}>
        {getStatusIcon(pick.status)}
        <View style={styles.pickPlayerInfo}>
          <Text style={[styles.pickPlayerName, { color: theme.text }]}>{pick.playerName}</Text>
          <Text style={[styles.pickPlayerProp, { color: theme.textSecondary }]}>
            {pick.propType.toUpperCase()}{" "}
            {pick.type === "milestone" ? pick.milestone : `${pick.type.toUpperCase()} ${pick.line}`}
          </Text>
        </View>
      </View>
      {renderProgressBar(pick)}
      {!isInParlay && (
        <View style={styles.pickFooter}>
          <Text style={[styles.pickGameInfo, { color: theme.textSecondary }]}>{pick.gameInfo}</Text>
          <Text style={[styles.pickGameStatus, { color: theme.textTertiary }]}>
            {pick.gameStatus}
          </Text>
        </View>
      )}
    </View>
  );

  const renderTeamBet = (bet) => (
    <TouchableOpacity
      key={bet.id}
      style={[styles.betCard, { backgroundColor: theme.cardBackground }]}
    >
      <View style={styles.teamBetHeader}>
        {getStatusIcon(bet.status)}
        <View style={styles.teamBetInfo}>
          <View style={styles.teamBetTeam}>
            <View style={[styles.teamLogo, { backgroundColor: colors.primary }]}>
              <Ionicons name="basketball" size={20} color="#FFF" />
            </View>
            <View>
              <Text style={[styles.teamBetName, { color: theme.text }]}>{bet.teamName}</Text>
              <Text style={[styles.teamBetType, { color: theme.textSecondary }]}>
                {bet.betType?.toUpperCase() || 'MONEYLINE'}
              </Text>
            </View>
          </View>
          <Text style={[styles.teamBetOdds, { color: theme.text }]}>{bet.odds}</Text>
        </View>
      </View>

      <View style={styles.teamBetGame}>
        <View style={styles.teamBetScore}>
          <Text style={[styles.teamBetGameInfo, { color: theme.textSecondary }]}>
            {bet.gameInfo}
          </Text>
          {bet.scores && (
            <View style={styles.scoreRow}>
              <Text style={[styles.scoreText, { color: theme.text }]}>
                {bet.scores.team1} - {bet.scores.team2}
              </Text>
              {bet.status === "winning" || bet.status === "losing" ? (
                <View style={[styles.liveIndicator, { backgroundColor: "#EF4444", marginLeft: 8 }]}>
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              ) : null}
            </View>
          )}
        </View>
        <Text style={[styles.teamBetGameStatus, { color: theme.textTertiary }]}>
          {bet.gameStatus}
        </Text>
        {bet.quarter && (
          <Text style={[styles.teamBetQuarter, { color: theme.textTertiary }]}>{bet.quarter}</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderParlay = (parlay) => {
    const isExpanded = expandedParlays.has(parlay.id);
    const isSinglePick = parlay.picks.length === 1;

    // If single pick, always show expanded
    if (isSinglePick) {
      return (
        <View key={parlay.id} style={[styles.betCard, { backgroundColor: theme.cardBackground }]}>
          <View style={styles.parlayExpandedHeader}>
            <View style={styles.parlayBadge}>
              <Text style={styles.parlayBadgeText}>SGP</Text>
            </View>
            <Text style={[styles.parlayTitle, { color: theme.text }]}>Same Game Parlay</Text>
            <Text style={[styles.parlayOdds, { color: theme.text }]}>{parlay.odds}</Text>
          </View>

          <View style={styles.parlayGameInfo}>
            <View style={styles.parlayGameScore}>
              <Text style={[styles.parlayGameText, { color: theme.textSecondary }]}>
                {parlay.gameInfo}
              </Text>
              <Text style={[styles.scoreText, { color: theme.text }]}>
                {parlay.scores.team1} - {parlay.scores.team2}
              </Text>
            </View>
            <View style={styles.parlayGameStatusRow}>
              <View style={[styles.liveIndicator, { backgroundColor: "#EF4444" }]}>
                <Text style={styles.liveText}>LIVE</Text>
              </View>
              <Text style={[styles.parlayGameStatus, { color: theme.textTertiary, marginLeft: 8 }]}>
                {parlay.gameStatus}
              </Text>
            </View>
          </View>

          <View style={styles.parlayPicks}>{parlay.picks.map((pick) => renderPlayerPick(pick, true))}</View>
        </View>
      );
    }

    // Multiple picks - collapsible
    if (!isExpanded) {
      return (
        <TouchableOpacity
          key={parlay.id}
          style={[styles.betCard, { backgroundColor: theme.cardBackground }]}
          onPress={() => toggleParlay(parlay.id)}
        >
          <View style={styles.parlayCollapsedHeader}>
            <View style={styles.parlayBadge}>
              <Text style={styles.parlayBadgeText}>SGP</Text>
            </View>
            <Text style={[styles.parlayTitle, { color: theme.text }]}>Same Game Parlay</Text>
            <Text style={[styles.parlayOdds, { color: theme.text }]}>{parlay.odds}</Text>
          </View>

          <View style={styles.parlayGameInfo}>
            <View style={styles.parlayGameScore}>
              <Text style={[styles.parlayGameText, { color: theme.textSecondary }]}>
                {parlay.gameInfo}
              </Text>
              <Text style={[styles.scoreText, { color: theme.text }]}>
                {parlay.scores.team1} - {parlay.scores.team2}
              </Text>
            </View>
            <View style={styles.parlayGameStatusRow}>
              <View style={[styles.liveIndicator, { backgroundColor: "#EF4444" }]}>
                <Text style={styles.liveText}>LIVE</Text>
              </View>
              <Text style={[styles.parlayGameStatus, { color: theme.textTertiary, marginLeft: 8 }]}>
                {parlay.gameStatus}
              </Text>
            </View>
          </View>

          <View style={[styles.parlaySummary, { borderTopColor: theme.border }]}>
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                {parlay.picks.length} Picks
              </Text>
            </View>
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                ${parlay.wager.toFixed(2)}
              </Text>
              <Text style={[styles.parlaySummarySubLabel, { color: theme.textTertiary }]}>
                TOTAL WAGER
              </Text>
            </View>
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                ${parlay.potentialPayout.toFixed(2)}
              </Text>
              <Text style={[styles.parlaySummarySubLabel, { color: theme.textTertiary }]}>
                TOTAL PAYOUT
              </Text>
            </View>
          </View>

          {parlay.cashOutValue && (
            <TouchableOpacity style={[styles.cashOutButton, { backgroundColor: "#22C55E" }]}>
              <Text style={styles.cashOutButtonText}>Cash out ${parlay.cashOutValue.toFixed(2)}</Text>
              <Text style={styles.cashOutSubtext}>BONUS BET STAKE NOT INCLUDED</Text>
            </TouchableOpacity>
          )}

          <View style={styles.expandIndicator}>
            <Ionicons name="chevron-down" size={20} color={theme.textSecondary} />
          </View>
        </TouchableOpacity>
      );
    }

    // Expanded view
    return (
      <View key={parlay.id} style={[styles.betCard, { backgroundColor: theme.cardBackground }]}>
        <View style={styles.parlayExpandedHeader}>
          <View style={styles.parlayBadge}>
            <Text style={styles.parlayBadgeText}>SGP</Text>
          </View>
          <Text style={[styles.parlayTitle, { color: theme.text }]}>Same Game Parlay</Text>
          <Text style={[styles.parlayOdds, { color: theme.text }]}>{parlay.odds}</Text>
        </View>

        <View style={styles.parlayGameInfo}>
          <View style={styles.parlayGameScore}>
            <Text style={[styles.parlayGameText, { color: theme.textSecondary }]}>
              {parlay.gameInfo}
            </Text>
            <Text style={[styles.scoreText, { color: theme.text }]}>
              {parlay.scores.team1} - {parlay.scores.team2}
            </Text>
          </View>
          <View style={styles.parlayGameStatusRow}>
            <View style={[styles.liveIndicator, { backgroundColor: "#EF4444" }]}>
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <Text style={[styles.parlayGameStatus, { color: theme.textTertiary, marginLeft: 8 }]}>
              {parlay.gameStatus}
            </Text>
          </View>
        </View>

        <View style={styles.parlayPicks}>{parlay.picks.map((pick) => renderPlayerPick(pick, true))}</View>

        <TouchableOpacity style={styles.collapseButton} onPress={() => toggleParlay(parlay.id)}>
          <Ionicons name="chevron-up" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Tabs */}
      <View
        style={[
          styles.tabBar,
          { backgroundColor: theme.background, borderBottomColor: theme.border },
        ]}
      >
        <TouchableOpacity
          style={[styles.tab, selectedTab === "open" && styles.tabActive]}
          onPress={() => setSelectedTab("open")}
        >
          <Text
            style={[
              styles.tabText,
              { color: selectedTab === "open" ? colors.primary : theme.textSecondary },
            ]}
          >
            Open
          </Text>
          {selectedTab === "open" && (
            <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, selectedTab === "settled" && styles.tabActive]}
          onPress={() => setSelectedTab("settled")}
        >
          <Text
            style={[
              styles.tabText,
              { color: selectedTab === "settled" ? colors.primary : theme.textSecondary },
            ]}
          >
            Settled
          </Text>
          {selectedTab === "settled" && (
            <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, selectedTab === "saved" && styles.tabActive]}
          onPress={() => setSelectedTab("saved")}
        >
          <Text
            style={[
              styles.tabText,
              { color: selectedTab === "saved" ? colors.primary : theme.textSecondary },
            ]}
          >
            Saved
          </Text>
          {selectedTab === "saved" && (
            <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {bets.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={64} color={theme.textTertiary} />
            <Text style={[styles.emptyStateTitle, { color: theme.text }]}>
              No {selectedTab} bets
            </Text>
            <Text style={[styles.emptyStateSubtitle, { color: theme.textSecondary }]}>
              {selectedTab === "open" && "Place a bet to get started"}
              {selectedTab === "settled" && "Your settled bets will appear here"}
              {selectedTab === "saved" && "Save bets to view them later"}
            </Text>
          </View>
        ) : (
          <View style={styles.betsContainer}>
            {bets.map((bet) => {
              if (bet.type === "parlay") {
                return renderParlay(bet);
              } else if (bet.type === "single" && bet.playerName) {
                return renderPlayerPick(bet, false);
              } else {
                return renderTeamBet(bet);
              }
            })}
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>

      <BetSlip />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    position: "relative",
  },
  tabActive: {},
  tabText: {
    fontSize: 16,
    fontWeight: "600",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  scrollView: {
    flex: 1,
  },
  betsContainer: {
    padding: 12,
  },
  betCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  // Player Pick Styles
  pickCard: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  pickHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  statusIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  pickPlayerInfo: {
    flex: 1,
  },
  pickPlayerName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  pickPlayerProp: {
    fontSize: 13,
    textTransform: "uppercase",
  },
  progressContainer: {
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    position: "relative",
  },
  progressValue: {
    fontSize: 12,
    fontWeight: "600",
  },
  progressIndicator: {
    position: "absolute",
    top: -20,
    transform: [{ translateX: -12 }],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 24,
    alignItems: "center",
  },
  progressIndicatorText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
  },
  pickFooter: {
    marginTop: 8,
  },
  pickGameInfo: {
    fontSize: 13,
    marginBottom: 4,
  },
  pickGameStatus: {
    fontSize: 12,
  },
  // Team Bet Styles
  teamBetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  teamBetInfo: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  teamBetTeam: {
    flexDirection: "row",
    alignItems: "center",
  },
  teamLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  teamBetName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  teamBetType: {
    fontSize: 13,
  },
  teamBetOdds: {
    fontSize: 16,
    fontWeight: "700",
  },
  teamBetGame: {
    marginTop: 8,
  },
  teamBetScore: {
    marginBottom: 4,
  },
  teamBetGameInfo: {
    fontSize: 13,
    marginBottom: 4,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  scoreText: {
    fontSize: 14,
    fontWeight: "600",
  },
  liveIndicator: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700",
  },
  teamBetGameStatus: {
    fontSize: 12,
  },
  teamBetQuarter: {
    fontSize: 12,
    marginTop: 2,
  },
  // Parlay Styles
  parlayCollapsedHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  parlayExpandedHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  parlayBadge: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
  },
  parlayBadgeText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
  },
  parlayTitle: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  parlayOdds: {
    fontSize: 16,
    fontWeight: "700",
  },
  parlayGameInfo: {
    marginBottom: 12,
  },
  parlayGameText: {
    fontSize: 13,
    marginBottom: 4,
  },
  parlayGameScore: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  parlayGameStatusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  parlayGameStatus: {
    fontSize: 12,
  },
  parlaySummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: 1,
    marginBottom: 12,
  },
  parlaySummaryItem: {
    alignItems: "center",
  },
  parlaySummaryLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  parlaySummarySubLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  cashOutButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 8,
  },
  cashOutButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
  cashOutSubtext: {
    color: "#FFF",
    fontSize: 10,
    marginTop: 2,
    opacity: 0.8,
  },
  expandIndicator: {
    alignItems: "center",
    paddingVertical: 4,
  },
  parlayPicks: {
    marginTop: 8,
  },
  collapseButton: {
    alignItems: "center",
    paddingVertical: 8,
    marginTop: 8,
  },
  // Empty State
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 80,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  bottomPadding: {
    height: 100,
  },
});

export default BetBetsScreen;

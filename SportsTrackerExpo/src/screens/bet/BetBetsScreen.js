import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { useBetSlip } from "../../context/BetSlipContext";
import BetSlip from "../../components/BetSlip";

const BetBetsScreen = () => {
  const { colors, theme, isDarkMode } = useTheme();
  const { submittedBets } = useBetSlip();
  const [selectedTab, setSelectedTab] = useState("open"); // open, settled
  const [expandedParlays, setExpandedParlays] = useState(new Set([1])); // Default first parlay expanded
  const [scoreboardData, setScoreboardData] = useState([]);

  // Fetch scoreboard data for live updates
  useEffect(() => {
    const fetchScoreboard = async () => {
      try {
        const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
        const data = await response.json();
        setScoreboardData(data.events || []);
      } catch (error) {
        console.error('Error fetching scoreboard:', error);
      }
    };

    fetchScoreboard();
    const interval = setInterval(fetchScoreboard, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Get live game data for a specific event ID
  const getLiveGameData = (eventId) => {
    return scoreboardData.find(event => event.id === eventId);
  };

  // Filter bets by tab
  const bets = submittedBets.filter(bet => {
    if (selectedTab === 'open') {
      return bet.status === 'open';
    } else if (selectedTab === 'settled') {
      return bet.status === 'won' || bet.status === 'lost';
    }
    return false;
  });

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
    <View key={pick.id} style={[styles.pickCard, { backgroundColor: theme.surface }]}>
      <View style={styles.pickHeader}>
        {pick.headshot && (
          <Image 
            source={{ uri: pick.headshot }} 
            style={styles.playerHeadshot}
          />
        )}
        <View style={styles.pickPlayerInfo}>
          <Text style={[styles.pickPlayerName, { color: theme.text }]}>{pick.playerName}</Text>
          <Text style={[styles.pickPlayerProp, { color: theme.textSecondary }]}>{pick.prop}</Text>
        </View>
        {getStatusIcon(pick.status)}
      </View>
      {pick.currentValue !== null && pick.currentValue !== undefined && renderProgressBar(pick)}
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

  const renderTeamPick = (pick, isInParlay = false) => (
    <View key={pick.id} style={[styles.pickCard, { backgroundColor: theme.surface }]}>
      <View style={styles.pickHeader}>
        {pick.isTotal && pick.homeTeamLogo && pick.awayTeamLogo ? (
          <View style={styles.overlappingLogos}>
            <Image 
              source={{ uri: pick.homeTeamLogo }} 
              style={styles.homeTeamLogo}
            />
            <Image 
              source={{ uri: pick.awayTeamLogo }} 
              style={styles.awayTeamLogo}
            />
          </View>
        ) : (
          pick.teamLogo && (
            <Image 
              source={{ uri: pick.teamLogo }} 
              style={styles.playerHeadshot}
            />
          )
        )}
        <View style={styles.pickPlayerInfo}>
          <Text style={[styles.pickPlayerName, { color: theme.text }]}>{pick.displayName || pick.team || 'GAME'}</Text>
          <Text style={[styles.pickPlayerProp, { color: theme.textSecondary }]}>
            {pick.prop}
          </Text>
        </View>
        {getStatusIcon(pick.status)}
      </View>
      {pick.currentValue !== null && pick.currentValue !== undefined && renderProgressBar(pick)}
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

  const renderPick = (pick, isInParlay = false) => {
    if (pick.playerName) {
      return renderPlayerPick(pick, isInParlay);
    } else if (pick.team || pick.isTotal) {
      return renderTeamPick(pick, isInParlay);
    }
    return null;
  };

  const renderTeamBet = (bet) => (
    <TouchableOpacity
      key={bet.id}
      style={[styles.betCard, { backgroundColor: theme.surface }]}
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
        <View key={parlay.id} style={[styles.betCard, { backgroundColor: theme.surface }]}>
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

          <View style={styles.parlayPicks}>{parlay.picks.map((pick) => renderPick(pick, true))}</View>
        </View>
      );
    }

    // Multiple picks - collapsible
    if (!isExpanded) {
      return (
        <TouchableOpacity
          key={parlay.id}
          style={[styles.betCard, { backgroundColor: theme.surface }]}
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
      <View key={parlay.id} style={[styles.betCard, { backgroundColor: theme.surface }]}>
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

        <View style={styles.parlayPicks}>{parlay.picks.map((pick) => renderPick(pick, true))}</View>

        <TouchableOpacity style={styles.collapseButton} onPress={() => toggleParlay(parlay.id)}>
          <Ionicons name="chevron-up" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>
    );
  };

  // Render a submitted bet slip
  const renderSubmittedBet = (betSlip) => {
    const { betslipData, bets: originalBets, amount } = betSlip;
    
    // Determine badge type
    const gameIds = [...new Set(originalBets.map(bet => bet.gameId))];
    const gamesCount = gameIds.length;
    let badgeType = 'SINGLE';
    let badgeColor = '#3B82F6';
    
    if (originalBets.length === 1) {
      badgeType = 'SINGLE';
      badgeColor = '#10B981';
    } else if (gamesCount === 1) {
      badgeType = 'SGP';
      badgeColor = '#3B82F6';
    } else if (gamesCount > 1) {
      // Check if any game has 2+ picks (SGP+)
      const picksByGame = {};
      originalBets.forEach(bet => {
        picksByGame[bet.gameId] = (picksByGame[bet.gameId] || 0) + 1;
      });
      const hasSGP = Object.values(picksByGame).some(count => count >= 2);
      if (hasSGP) {
        badgeType = 'SGP+';
        badgeColor = '#8B5CF6';
      } else {
        badgeType = 'PARLAY';
        badgeColor = '#F59E0B';
      }
    }

    // Build picks from originalBets with betslipData if available
    const allPicks = originalBets.map(bet => {
      const pick = {
        id: bet.id,
        gameId: bet.gameId,
      };

      // Get live game data
      const liveGame = getLiveGameData(bet.gameId);
      pick.gameInfo = liveGame?.shortName || bet.gameInfo?.teams || 'Game';
      pick.gameStatus = liveGame?.status?.type?.shortDetail || bet.gameInfo?.time || 'Scheduled';

      // Player props
      if (bet.playerId) {
        pick.playerName = bet.player;
        pick.headshot = `https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/${bet.playerId}.png&w=200`;
        pick.prop = bet.prop;
        pick.propType = bet.statType;
        pick.line = bet.line;
        pick.type = bet.type;
        pick.betValue = bet.betValue;
        
        // Try to get current value from betslipData
        if (betslipData?.events) {
          const eventData = betslipData.events.find(e => e.eventId === bet.gameId);
          if (eventData?.bets?.players) {
            const playerData = eventData.bets.players.find(p => p.id === bet.playerId);
            if (playerData) {
              const statUpper = bet.statType.toUpperCase().substring(0, 3);
              const statMap = {
                'POI': 'PTS', 'REB': 'REB', 'ASS': 'AST',
                'BLO': 'BLK', 'STE': 'STL', 'TUR': 'TO'
              };
              const statKey = statMap[statUpper] || 'PTS';
              
              if (bet.type === 'milestone' && playerData.milestones?.[statKey]) {
                pick.currentValue = playerData.milestones[statKey].current;
                pick.status = playerData.milestones[statKey].won ? 'winning' : 'losing';
              } else if (playerData.overUnder?.[statKey]) {
                pick.currentValue = playerData.overUnder[statKey].current;
                pick.status = playerData.overUnder[statKey].won ? 'winning' : 'losing';
              } else {
                pick.status = 'pending';
              }
            }
          }
        } else {
          pick.status = 'pending';
        }
      }
      // Game line bets
      else if (bet.type === 'Spread' || bet.type === 'Total' || bet.type === 'Moneyline') {
        pick.betType = bet.type.toLowerCase();
        pick.team = bet.team;
        pick.line = bet.line;
        
        // Construct prop text based on bet type
        if (bet.type === 'Spread') {
          pick.prop = `${bet.team} ${bet.line}`;
        } else if (bet.type === 'Moneyline') {
          pick.prop = `${bet.team} ${bet.type}`;
        } else if (bet.type === 'Total') {
          // For Total bets: displayName = type (OVER/UNDER), prop = line
          pick.displayName = bet.description?.toUpperCase() || bet.type;
          pick.prop = bet.line;
        }
        
        // For Total bets, get both team logos
        if (bet.type === 'Total') {
          // Use team abbreviations from bet if available, otherwise extract from gameInfo
          let awayTeam = bet.awayTeam;
          let homeTeam = bet.homeTeam;
          
          if (!awayTeam || !homeTeam) {
            if (liveGame?.competitions?.[0]?.competitors) {
              const competitors = liveGame.competitions[0].competitors;
              awayTeam = competitors.find(c => c.homeAway === 'away')?.team?.abbreviation;
              homeTeam = competitors.find(c => c.homeAway === 'home')?.team?.abbreviation;
            } else if (bet.gameInfo?.teams) {
              // Parse from "MEM @ MIN" format
              const teams = bet.gameInfo.teams.split(' @ ');
              awayTeam = teams[0]?.trim();
              homeTeam = teams[1]?.trim();
            }
          }
          
          pick.awayTeamLogo = awayTeam ? `https://a.espncdn.com/i/teamlogos/nba/500${isDarkMode ? "-dark" : ""}/${awayTeam.toLowerCase()}.png` : null;
          pick.homeTeamLogo = homeTeam ? `https://a.espncdn.com/i/teamlogos/nba/500${isDarkMode ? "-dark" : ""}/${homeTeam.toLowerCase()}.png` : null;
          pick.isTotal = true;
        } else {
          pick.teamLogo = `https://a.espncdn.com/i/teamlogos/nba/500${isDarkMode ? "-dark" : ""}/${bet.team?.toLowerCase()}.png`;
        }
        
        // Try to get current value from betslipData
        if (betslipData?.events) {
          const eventData = betslipData.events.find(e => e.eventId === bet.gameId);
          if (eventData?.bets) {
            if (bet.type === 'Moneyline' && eventData.bets.moneyline) {
              pick.currentValue = eventData.bets.moneyline.current?.score;
              pick.status = eventData.bets.moneyline.current?.won ? 'winning' : 'losing';
            } else if (bet.type === 'Spread' && eventData.bets.spread) {
              pick.currentValue = eventData.bets.spread.current?.adjustedScore;
              pick.status = eventData.bets.spread.current?.won ? 'winning' : 'losing';
            } else if (bet.type === 'Total' && eventData.bets.totalPoints) {
              pick.currentValue = eventData.bets.totalPoints.current;
              pick.status = eventData.bets.totalPoints.won ? 'winning' : 'losing';
            } else {
              pick.status = 'pending';
            }
          }
        } else {
          pick.status = 'pending';
        }
      }

      return pick;
      return pick;
    });

    // Calculate total odds and payout
    const calculateOdds = () => {
      const decimalOdds = originalBets.map((bet) => {
        const odds = parseInt(bet.odds);
        if (odds > 0) {
          return odds / 100 + 1;
        } else {
          return 100 / Math.abs(odds) + 1;
        }
      });
      const totalDecimal = decimalOdds.reduce((acc, odd) => acc * odd, 1);
      const americanOdds = totalDecimal >= 2 
        ? `+${Math.round((totalDecimal - 1) * 100)}`
        : `-${Math.round(100 / (totalDecimal - 1))}`;
      return americanOdds;
    };

    const calculatePayout = () => {
      const decimalOdds = originalBets.map((bet) => {
        const odds = parseInt(bet.odds);
        if (odds > 0) {
          return odds / 100 + 1;
        } else {
          return 100 / Math.abs(odds) + 1;
        }
      });
      const totalDecimal = decimalOdds.reduce((acc, odd) => acc * odd, 1);
      return (amount * totalDecimal).toFixed(2);
    };

    const odds = calculateOdds();
    const potentialPayout = calculatePayout();
    const isExpanded = expandedParlays.has(betSlip.id);

    // Single pick - always expanded
    if (allPicks.length === 1) {
      const pick = allPicks[0];
      const liveGame = getLiveGameData(pick.gameId);
      const scores = liveGame?.competitions?.[0]?.competitors;
      
      return (
        <View key={betSlip.id} style={[styles.betCard, { backgroundColor: theme.surface }]}>
          <View style={styles.parlayExpandedHeader}>
            <View style={[styles.parlayBadge, { backgroundColor: badgeColor }]}>
              <Text style={styles.parlayBadgeText}>{badgeType}</Text>
            </View>
            <Text style={[styles.parlayTitle, { color: theme.text }]}>
              Single Bet
            </Text>
            <Text style={[styles.parlayOdds, { color: theme.text }]}>{odds}</Text>
          </View>

          <View style={styles.parlayGameInfo}>
            <View style={styles.parlayGameScore}>
              <Text style={[styles.parlayGameText, { color: theme.textSecondary }]}>
                {liveGame?.shortName || pick.gameInfo}
              </Text>
              {scores && (
                <Text style={[styles.scoreText, { color: theme.text }]}>
                  {scores[1]?.score || 0} - {scores[0]?.score || 0}
                </Text>
              )}
            </View>
            <View style={styles.parlayGameStatusRow}>
              {liveGame?.status?.type?.state === 'in' && (
                <View style={[styles.liveIndicator, { backgroundColor: "#EF4444" }]}>
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              )}
              <Text style={[styles.parlayGameStatus, { color: theme.textTertiary, marginLeft: 8 }]}>
                {liveGame?.status?.type?.shortDetail || pick.gameStatus}
              </Text>
            </View>
          </View>

          <View style={styles.parlayPicks}>
            {renderPick(pick, true)}
          </View>

          <View style={[styles.parlaySummary, { borderTopColor: theme.border }]}>
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                ${amount.toFixed(2)}
              </Text>
              <Text style={[styles.parlaySummarySubLabel, { color: theme.textTertiary }]}>
                WAGER
              </Text>
            </View>
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                ${potentialPayout}
              </Text>
              <Text style={[styles.parlaySummarySubLabel, { color: theme.textTertiary }]}>
                PAYOUT
              </Text>
            </View>
          </View>
        </View>
      );
    }

    // Multiple picks - SGP (all same game)
    if (gamesCount === 1) {
      const firstPick = allPicks[0];
      const liveGame = getLiveGameData(firstPick.gameId);
      const scores = liveGame?.competitions?.[0]?.competitors;
      
      return (
        <View key={betSlip.id} style={[styles.betCard, { backgroundColor: theme.surface }]}>
          <View style={styles.parlayExpandedHeader}>
            <View style={[styles.parlayBadge, { backgroundColor: badgeColor }]}>
              <Text style={styles.parlayBadgeText}>{badgeType}</Text>
            </View>
            <Text style={[styles.parlayTitle, { color: theme.text }]}>
              Same Game Parlay
            </Text>
            <Text style={[styles.parlayOdds, { color: theme.text }]}>{odds}</Text>
          </View>

          <View style={styles.parlayGameInfo}>
            <View style={styles.parlayGameScore}>
              <Text style={[styles.parlayGameText, { color: theme.textSecondary }]}>
                {liveGame?.shortName || firstPick.gameInfo}
              </Text>
              {scores && (
                <Text style={[styles.scoreText, { color: theme.text }]}>
                  {scores[1]?.score || 0} - {scores[0]?.score || 0}
                </Text>
              )}
            </View>
            <View style={styles.parlayGameStatusRow}>
              {liveGame?.status?.type?.state === 'in' && (
                <View style={[styles.liveIndicator, { backgroundColor: "#EF4444" }]}>
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              )}
              <Text style={[styles.parlayGameStatus, { color: theme.textTertiary, marginLeft: 8 }]}>
                {liveGame?.status?.type?.shortDetail || firstPick.gameStatus}
              </Text>
            </View>
          </View>

          <View style={styles.parlayPicks}>
            {allPicks.map((pick) => renderPick(pick, true))}
          </View>

          <View style={[styles.parlaySummary, { borderTopColor: theme.border }]}>
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                {allPicks.length} Picks
              </Text>
            </View>
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                ${amount.toFixed(2)}
              </Text>
              <Text style={[styles.parlaySummarySubLabel, { color: theme.textTertiary }]}>
                WAGER
              </Text>
            </View>
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                ${potentialPayout}
              </Text>
              <Text style={[styles.parlaySummarySubLabel, { color: theme.textTertiary }]}>
                PAYOUT
              </Text>
            </View>
          </View>
        </View>
      );
    }

    // Multiple games - Parlay/SGP+ (collapsed/expanded)
    if (!isExpanded) {
      return (
        <TouchableOpacity
          key={betSlip.id}
          style={[styles.betCard, { backgroundColor: theme.surface }]}
          onPress={() => toggleParlay(betSlip.id)}
        >
          <View style={styles.parlayCollapsedHeader}>
            <View style={[styles.parlayBadge, { backgroundColor: badgeColor }]}>
              <Text style={styles.parlayBadgeText}>{badgeType}</Text>
            </View>
            <Text style={[styles.parlayTitle, { color: theme.text }]}>
              {gamesCount} Games
            </Text>
            <Text style={[styles.parlayOdds, { color: theme.text }]}>{odds}</Text>
          </View>

          <View style={[styles.parlaySummary, { borderTopColor: theme.border }]}>
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                {allPicks.length} Picks
              </Text>
            </View>
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                ${amount.toFixed(2)}
              </Text>
              <Text style={[styles.parlaySummarySubLabel, { color: theme.textTertiary }]}>
                WAGER
              </Text>
            </View>
            <View style={styles.parlaySummaryItem}>
              <Text style={[styles.parlaySummaryLabel, { color: theme.text }]}>
                ${potentialPayout}
              </Text>
              <Text style={[styles.parlaySummarySubLabel, { color: theme.textTertiary }]}>
                PAYOUT
              </Text>
            </View>
          </View>

          <View style={styles.expandIndicator}>
            <Ionicons name="chevron-down" size={20} color={theme.textSecondary} />
          </View>
        </TouchableOpacity>
      );
    }

    // Expanded multi-game view
    // Group picks by game
    const picksByGame = {};
    allPicks.forEach(pick => {
      if (!picksByGame[pick.gameId]) {
        picksByGame[pick.gameId] = [];
      }
      picksByGame[pick.gameId].push(pick);
    });

    return (
      <View key={betSlip.id} style={[styles.betCard, { backgroundColor: theme.surface }]}>
        <View style={styles.parlayExpandedHeader}>
          <View style={[styles.parlayBadge, { backgroundColor: badgeColor }]}>
            <Text style={styles.parlayBadgeText}>{badgeType}</Text>
          </View>
          <Text style={[styles.parlayTitle, { color: theme.text }]}>
            {gamesCount} Games
          </Text>
          <Text style={[styles.parlayOdds, { color: theme.text }]}>{odds}</Text>
        </View>

        {Object.entries(picksByGame).map(([gameId, picks]) => {
          const liveGame = getLiveGameData(gameId);
          const scores = liveGame?.competitions?.[0]?.competitors;
          
          return (
            <View key={gameId} style={{ marginBottom: 16 }}>
              <View style={styles.parlayGameInfo}>
                <View style={styles.parlayGameScore}>
                  <Text style={[styles.parlayGameText, { color: theme.textSecondary }]}>
                    {liveGame?.shortName || picks[0].gameInfo}
                  </Text>
                  {scores && (
                    <Text style={[styles.scoreText, { color: theme.text }]}>
                      {scores[1]?.score || 0} - {scores[0]?.score || 0}
                    </Text>
                  )}
                </View>
                <View style={styles.parlayGameStatusRow}>
                  {liveGame?.status?.type?.state === 'in' && (
                    <View style={[styles.liveIndicator, { backgroundColor: "#EF4444" }]}>
                      <Text style={styles.liveText}>LIVE</Text>
                    </View>
                  )}
                  <Text style={[styles.parlayGameStatus, { color: theme.textTertiary, marginLeft: 8 }]}>
                    {liveGame?.status?.type?.shortDetail || picks[0].gameStatus}
                  </Text>
                </View>
              </View>

              <View style={styles.parlayPicks}>
                {picks.map((pick) => renderPick(pick, true))}
              </View>
            </View>
          );
        })}

        <TouchableOpacity style={styles.collapseButton} onPress={() => toggleParlay(betSlip.id)}>
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
            {bets.map((betSlip) => renderSubmittedBet(betSlip))}
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
  pickBetValue: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },
  playerHeadshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  overlappingLogos: {
    width: 50,
    height: 50,
    marginRight: 12,
    position: 'relative',
  },
  homeTeamLogo: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  awayTeamLogo: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    zIndex: 1,
    width: 32,
    height: 32,
    borderRadius: 16,
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

import React, { useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  FlatList,
} from "react-native";
import { Ionicons, FontAwesome6 } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { useBetSlip } from "../../context/BetSlipContext";
import BetSlip from "../../components/BetSlip";
import PlayerStatsPopup from "../../components/PlayerStatsPopup";

const { width } = Dimensions.get("window");

// Get sport-specific icon
const getSportIcon = (sport) => {
  switch (sport) {
    case "NBA":
      return "basketball";
    case "NFL":
      return "football";
    case "SOCCER":
      return "futbol";
    default:
      return "basketball";
  }
};

// Get random venue
const getRandomVenue = (sport) => {
  const venues = {
    NBA: [
      "Staples Center",
      "Madison Square Garden",
      "TD Garden",
      "Chase Center",
      "American Airlines Center",
      "United Center",
    ],
    NFL: [
      "Arrowhead Stadium",
      "Levi's Stadium",
      "AT&T Stadium",
      "Mercedes-Benz Stadium",
      "Lambeau Field",
      "SoFi Stadium",
    ],
    SOCCER: [
      "Santiago Bernabéu",
      "Camp Nou",
      "Old Trafford",
      "Etihad Stadium",
      "Allianz Arena",
      "Parc des Princes",
    ],
  };
  
  const sportVenues = venues[sport] || venues.NBA;
  return sportVenues[Math.floor(Math.random() * sportVenues.length)];
};

// Calculate responsive font size for tabs
const getTabFontSize = () => {
  if (width < 350) return 11;
  if (width < 380) return 12;
  if (width < 420) return 13;
  return 14;
};

// Player Props Tab Component - DraftKings Style
const PropTabContent = ({ gameData, theme, colors, propTypes, gameId }) => {
  const { toggleBet, isBetSelected, removeBet } = useBetSlip();
  const [selectedPropType, setSelectedPropType] = useState(propTypes[0]);
  const [selectedPlayerForStats, setSelectedPlayerForStats] = useState(null);
  const [statsPopupVisible, setStatsPopupVisible] = useState(false);
  const [currentLine, setCurrentLine] = useState(null);
  const scrollViewRef = useRef(null);

  // Generate player data
  const players = [
    { id: 'p1', name: 'Nikola Jokic', ppg: 29.5, rpg: 13.7, apg: 9.7, tpg: 1.1, team: gameData.team2 },
    { id: 'p2', name: 'Jamal Murray', ppg: 24.4, rpg: 4.1, apg: 6.5, tpg: 2.8, team: gameData.team2 },
    { id: 'p3', name: 'Kevin Durant', ppg: 24.8, rpg: 6.6, apg: 5.0, tpg: 2.5, team: gameData.team1 },
    { id: 'p4', name: 'Alperen Sengun', ppg: 23.0, rpg: 10.3, apg: 5.0, tpg: 1.2, team: gameData.team1 },
    { id: 'p5', name: 'Amen Thompson', ppg: 17.5, rpg: 8.9, apg: 3.6, tpg: 1.5, team: gameData.team1 },
  ];

  const openPlayerStats = (player, line) => {
    setSelectedPlayerForStats(player);
    setCurrentLine(line);
    setStatsPopupVisible(true);
  };

  // Get stat value based on prop type
  const getPlayerStat = (player, propType) => {
    switch(propType) {
      case 'Points': return player.ppg;
      case 'Rebounds': return player.rpg;
      case 'Assists': return player.apg;
      case '3-Pointers': return player.tpg;
      default: return player.ppg;
    }
  };

  // Generate milestone options (10+, 15+, 20+, etc)
  const getMilestoneOptions = (propType) => {
    switch(propType) {
      case 'Points':
        return [10, 15, 20, 25, 30, 35];
      case 'Rebounds':
        return [5, 8, 10, 12, 15];
      case 'Assists':
        return [5, 8, 10, 12, 15];
      case '3-Pointers':
        return [1, 2, 3, 4, 5];
      default:
        return [10, 15, 20, 25, 30];
    }
  };

  // Render milestone section (10+, 15+, 20+, etc)
  const renderMilestoneSection = () => {
    const milestones = getMilestoneOptions(selectedPropType);
    
    return (
      <View style={styles.propSection}>
        <Text style={[styles.propSectionTitle, { color: theme.text }]}>
          {selectedPropType}
        </Text>
        
        {players.map((player) => {
          const baseStat = getPlayerStat(player, selectedPropType);
          
          return (
            <View key={`milestone-${player.id}`} style={styles.propRow}>
              {/* Player Info */}
              <TouchableOpacity
                style={styles.propPlayerInfo}
                onPress={() => openPlayerStats(player, baseStat)}
              >
                <View style={[styles.propPlayerIcon, { backgroundColor: colors.primary }]}>
                  <Ionicons name="person" size={20} color="white" />
                </View>
                <View style={styles.propPlayerDetails}>
                  <Text style={[styles.propPlayerName, { color: theme.text }]}>
                    {player.name}
                  </Text>
                  <Text style={[styles.propPlayerPPG, { color: theme.textSecondary }]}>
                    {selectedPropType === 'Points' ? 'PPG' : selectedPropType === 'Rebounds' ? 'RPG' : selectedPropType === 'Assists' ? 'APG' : '3PG'}: {baseStat}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Milestone buttons */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.propOddsScroll}
                contentContainerStyle={styles.propMilestoneContent}
                snapToInterval={78}
                decelerationRate="fast"
                snapToAlignment="center"
                pagingEnabled={false}
              >
                {milestones.map((milestone, index) => {
                  const odds = milestone < baseStat ? '-150' : milestone === Math.round(baseStat) ? '-110' : '+120';
                  const betId = `${player.id}-${selectedPropType}-${milestone}+`;
                  
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.milestoneButton,
                        {
                          backgroundColor: isBetSelected(betId)
                            ? colors.primary
                            : theme.surfaceSecondary,
                          borderColor: isBetSelected(betId)
                            ? colors.primary
                            : theme.border,
                        },
                      ]}
                      onPress={() => {
                        console.log('Milestone button pressed:', milestone);
                        // Remove any existing milestone bets for this player and prop type
                        const existingMilestoneBets = milestones
                          .map(m => `${player.id}-${selectedPropType}-${m}+`)
                          .filter(id => id !== betId && isBetSelected(id));
                        
                        console.log('Existing milestone bets to remove:', existingMilestoneBets);
                        existingMilestoneBets.forEach(id => {
                          removeBet(id); // Remove old bet
                        });

                        const betObject = {
                          id: betId,
                          gameId: gameId,
                          gameInfo: {
                            time: gameData.time || 'TBD',
                            teams: `${gameData.team1} @ ${gameData.team2}`,
                          },
                          type: selectedPropType,
                          description: `${player.name} ${milestone}+`,
                          line: `${milestone}+`,
                          odds: odds,
                        };
                        console.log('Adding bet:', betObject);
                        
                        // Toggle the new bet
                        toggleBet(betObject);
                      }}
                    >
                      <Text style={[styles.milestoneValue, { color: isBetSelected(betId) ? 'white' : theme.text }]}>
                        {milestone}+
                      </Text>
                      <Text style={[styles.milestoneOdds, { color: isBetSelected(betId) ? 'white' : colors.primary }]}>
                        {odds}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          );
        })}

        <TouchableOpacity style={styles.viewMoreButton}>
          <Text style={[styles.viewMoreText, { color: theme.text }]}>View More</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Render O/U section
  const renderOUSection = () => {
    return (
      <View style={styles.propSection}>
        <Text style={[styles.propSectionTitle, { color: theme.text }]}>
          {selectedPropType} O/U
        </Text>
        
        {players.map((player) => {
          const baseStat = getPlayerStat(player, selectedPropType);
          const line = baseStat;
          
          return (
            <View key={`ou-${player.id}`} style={styles.propRow}>
              {/* Player Info */}
              <TouchableOpacity
                style={styles.propPlayerInfo}
                onPress={() => openPlayerStats(player, line)}
              >
                <View style={[styles.propPlayerIcon, { backgroundColor: colors.primary }]}>
                  <Ionicons name="person" size={20} color="white" />
                </View>
                <View style={styles.propPlayerDetails}>
                  <Text style={[styles.propPlayerName, { color: theme.text }]}>
                    {player.name}
                  </Text>
                  <Text style={[styles.propPlayerPPG, { color: theme.textSecondary }]}>
                    {selectedPropType === 'Points' ? 'PPG' : selectedPropType === 'Rebounds' ? 'RPG' : selectedPropType === 'Assists' ? 'APG' : '3PG'}: {baseStat}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* O/U Buttons */}
              <View style={styles.ouButtonsContainer}>
                {/* Over button */}
                <TouchableOpacity
                  style={[
                    styles.ouButton,
                    {
                      backgroundColor: isBetSelected(`${player.id}-${selectedPropType}-${line}-over`)
                        ? colors.primary
                        : theme.surfaceSecondary,
                      borderColor: isBetSelected(`${player.id}-${selectedPropType}-${line}-over`)
                        ? colors.primary
                        : theme.border,
                    },
                  ]}
                  onPress={() => {
                    // If under is selected, remove it first
                    const underId = `${player.id}-${selectedPropType}-${line}-under`;
                    if (isBetSelected(underId)) {
                      removeBet(underId);
                    }

                    toggleBet({
                      id: `${player.id}-${selectedPropType}-${line}-over`,
                      gameId: gameId,
                      gameInfo: {
                        time: gameData.time || 'TBD',
                        teams: `${gameData.team1} @ ${gameData.team2}`,
                      },
                      type: `${selectedPropType} - Over`,
                      description: `${player.name}`,
                      line: `O ${line}`,
                      odds: '-115',
                    });
                  }}
                >
                  <Text style={[styles.ouLabel, { color: isBetSelected(`${player.id}-${selectedPropType}-${line}-over`) ? 'white' : theme.textSecondary }]}>
                    O
                  </Text>
                  <Text style={[styles.ouLine, { color: isBetSelected(`${player.id}-${selectedPropType}-${line}-over`) ? 'white' : theme.text }]}>
                    {line}
                  </Text>
                  <Text style={[styles.ouOdds, { color: isBetSelected(`${player.id}-${selectedPropType}-${line}-over`) ? 'white' : colors.primary }]}>
                    -115
                  </Text>
                </TouchableOpacity>

                {/* Under button */}
                <TouchableOpacity
                  style={[
                    styles.ouButton,
                    {
                      backgroundColor: isBetSelected(`${player.id}-${selectedPropType}-${line}-under`)
                        ? colors.primary
                        : theme.surfaceSecondary,
                      borderColor: isBetSelected(`${player.id}-${selectedPropType}-${line}-under`)
                        ? colors.primary
                        : theme.border,
                    },
                  ]}
                  onPress={() => {
                    // If over is selected, remove it first
                    const overId = `${player.id}-${selectedPropType}-${line}-over`;
                    if (isBetSelected(overId)) {
                      removeBet(overId);
                    }

                    toggleBet({
                      id: `${player.id}-${selectedPropType}-${line}-under`,
                      gameId: gameId,
                      gameInfo: {
                        time: gameData.time || 'TBD',
                        teams: `${gameData.team1} @ ${gameData.team2}`,
                      },
                      type: `${selectedPropType} - Under`,
                      description: `${player.name}`,
                      line: `U ${line}`,
                      odds: '-105',
                    });
                  }}
                >
                  <Text style={[styles.ouLabel, { color: isBetSelected(`${player.id}-${selectedPropType}-${line}-under`) ? 'white' : theme.textSecondary }]}>
                    U
                  </Text>
                  <Text style={[styles.ouLine, { color: isBetSelected(`${player.id}-${selectedPropType}-${line}-under`) ? 'white' : theme.text }]}>
                    {line}
                  </Text>
                  <Text style={[styles.ouOdds, { color: isBetSelected(`${player.id}-${selectedPropType}-${line}-under`) ? 'white' : colors.primary }]}>
                    -105
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        <TouchableOpacity style={styles.viewMoreButton}>
          <Text style={[styles.viewMoreText, { color: theme.text }]}>View More</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.tabContent}>
      {/* Prop Type Selector */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        style={styles.propTypeSelector}
        contentContainerStyle={styles.propTypeSelectorContent}
      >
        {propTypes.map((type) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.propTypeButton,
              {
                backgroundColor: selectedPropType === type ? colors.primary : theme.surface,
                borderColor: colors.primary,
              }
            ]}
            onPress={() => setSelectedPropType(type)}
          >
            <Text style={[
              styles.propTypeText,
              { color: selectedPropType === type ? 'white' : theme.text }
            ]}>{type}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Render both milestone and O/U sections */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {renderMilestoneSection()}
        {renderOUSection()}
      </ScrollView>

      <PlayerStatsPopup
        visible={statsPopupVisible}
        onClose={() => setStatsPopupVisible(false)}
        player={selectedPlayerForStats}
        propType={selectedPropType}
        currentLine={currentLine}
      />
    </View>
  );
};

// Alternate Spread Section Component with Magnetic Slider
const AlternateSpreadSection = ({ gameData, theme, colors }) => {
  const [selectedSpreadIndex, setSelectedSpreadIndex] = useState(4); // Middle option (2.5)
  const scrollViewRef = useRef(null);
  
  const spreadOptions = [-6.5, -5.5, -4.5, -3.5, -2.5, -1.5, 1.5, 2.5, 3.5, 4.5, 5.5];
  const ITEM_WIDTH = 60;

  const handleScroll = (event) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / ITEM_WIDTH);
    setSelectedSpreadIndex(Math.max(0, Math.min(index, spreadOptions.length - 1)));
  };

  const selectedSpread = spreadOptions[selectedSpreadIndex];
  const team1Spread = selectedSpread > 0 ? -selectedSpread : selectedSpread;
  const team2Spread = selectedSpread > 0 ? selectedSpread : -selectedSpread;
  const team1Odds = selectedSpread === 2.5 ? '2.01' : selectedSpread < 2.5 ? '1.75' : '2.25';
  const team2Odds = selectedSpread === 2.5 ? '1.80' : selectedSpread < 2.5 ? '2.10' : '1.65';

  return (
    <View style={styles.gameLineSection}>
      <View style={styles.alternateHeader}>
        <Text style={[styles.gameLineSectionTitle, { color: theme.text }]}>
          Alternate Spread
        </Text>
      </View>
      
      <View style={styles.alternateSpreadContainer}>
        <View style={[styles.alternateSpreadCard, { backgroundColor: theme.surfaceSecondary }]}>
          <Text style={[styles.alternateSpreadTeam, { color: theme.text }]}>
            HOU Rockets
          </Text>
          <Text style={[styles.alternateSpreadLine, { color: theme.text }]}>
            {team1Spread > 0 ? '+' : ''}{team1Spread}
          </Text>
          <Text style={[styles.alternateSpreadOdds, { color: colors.primary }]}>
            {team1Odds}
          </Text>
        </View>

        <View style={[styles.alternateSpreadCard, { backgroundColor: theme.surfaceSecondary }]}>
          <Text style={[styles.alternateSpreadTeam, { color: theme.text }]}>
            DEN Nuggets
          </Text>
          <Text style={[styles.alternateSpreadLine, { color: theme.text }]}>
            {team2Spread > 0 ? '+' : ''}{team2Spread}
          </Text>
          <Text style={[styles.alternateSpreadOdds, { color: colors.primary }]}>
            {team2Odds}
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.alternateSpreadSliderScroll}
        contentContainerStyle={styles.alternateSpreadSliderContent}
        onMomentumScrollEnd={handleScroll}
        snapToInterval={ITEM_WIDTH}
        decelerationRate="fast"
        snapToAlignment="center"
        pagingEnabled={false}
      >
        {spreadOptions.map((spread, index) => (
          <TouchableOpacity
            key={index}
            style={styles.spreadOption}
            onPress={() => {
              setSelectedSpreadIndex(index);
              scrollViewRef.current?.scrollTo({ x: index * ITEM_WIDTH, animated: true });
            }}
          >
            <Text
              style={[
                styles.sliderValue,
                {
                  color: index === selectedSpreadIndex ? theme.text : theme.textSecondary,
                  fontWeight: index === selectedSpreadIndex ? 'bold' : 'normal',
                  fontSize: index === selectedSpreadIndex ? 16 : 13,
                },
              ]}
            >
              {spread}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.viewMoreButton}>
        <Text style={[styles.viewMoreText, { color: theme.text }]}>View More</Text>
      </TouchableOpacity>
    </View>
  );
};

const BetGameDetailScreen = ({ navigation, route }) => {
  const { colors, theme } = useTheme();
  const { toggleBet, isBetSelected } = useBetSlip();
  const { game } = route.params || {};
  const [selectedTab, setSelectedTab] = useState("stats");

  // Placeholder game data if not provided
  const gameData = game || {
    id: "game1",
    team1: "Houston Rockets",
    team2: "Denver Nuggets",
    score1: 77,
    score2: 104,
    status: "live",
    time: "Q2 • 6:32",
    period: "Q2",
    sport: "NBA",
  };

  const venue = useMemo(() => getRandomVenue(gameData.sport || "NBA"), [gameData.sport]);
  const tabFontSize = getTabFontSize();

  // Generate linescore data
  const generateLinescore = (sport) => {
    const periods = sport === "NFL" ? 4 : sport === "SOCCER" ? 2 : 4;
    const team1Scores = [];
    const team2Scores = [];
    
    for (let i = 0; i < periods; i++) {
      if (sport === "SOCCER") {
        team1Scores.push(Math.floor(Math.random() * 2));
        team2Scores.push(Math.floor(Math.random() * 2));
      } else if (sport === "NFL") {
        team1Scores.push(Math.floor(Math.random() * 14) + 3);
        team2Scores.push(Math.floor(Math.random() * 14) + 3);
      } else {
        team1Scores.push(Math.floor(Math.random() * 30) + 20);
        team2Scores.push(Math.floor(Math.random() * 30) + 20);
      }
    }
    
    return { team1Scores, team2Scores };
  };

  // Generate box score data
  const generateBoxScore = (sport, teamName) => {
    if (sport === "NBA") {
      return [
        // Starters
        { name: "Player A", pts: 24, reb: 8, ast: 5, isStarter: true },
        { name: "Player B", pts: 18, reb: 12, ast: 2, isStarter: true },
        { name: "Player C", pts: 15, reb: 4, ast: 7, isStarter: true },
        { name: "Player D", pts: 12, reb: 3, ast: 3, isStarter: true },
        { name: "Player E", pts: 10, reb: 2, ast: 4, isStarter: true },
        // Bench
        { name: "Player F", pts: 8, reb: 5, ast: 1, isStarter: false },
        { name: "Player G", pts: 6, reb: 2, ast: 2, isStarter: false },
        { name: "Player H", pts: 4, reb: 1, ast: 1, isStarter: false },
      ];
    } else if (sport === "NFL") {
      return [
        { name: "QB Player", pos: "QB", yds: 285, td: 2, int: 1 },
        { name: "RB Player A", pos: "RB", yds: 95, td: 1, rec: 3 },
        { name: "RB Player B", pos: "RB", yds: 42, td: 0, rec: 2 },
        { name: "WR Player A", pos: "WR", yds: 112, td: 1, rec: 7 },
        { name: "WR Player B", pos: "WR", yds: 68, td: 0, rec: 5 },
      ];
    } else {
      return [
        // On field
        { name: "Player A", goals: 1, assists: 0, shots: 3, isStarter: true },
        { name: "Player B", goals: 0, assists: 1, shots: 2, isStarter: true },
        { name: "Player C", goals: 0, assists: 0, shots: 1, isStarter: true },
        { name: "Player D", goals: 0, assists: 1, shots: 0, isStarter: true },
        { name: "Player E", goals: 0, assists: 0, shots: 2, isStarter: true },
        // Bench
        { name: "Player F", goals: 0, assists: 0, shots: 1, isStarter: false },
        { name: "Player G", goals: 0, assists: 0, shots: 0, isStarter: false },
        { name: "Player H", goals: 0, assists: 0, shots: 1, isStarter: false },
      ];
    }
  };

  // Generate win probability data
  const generateWinProbability = () => {
    const data = [];
    let prob = 50;
    for (let i = 0; i <= 100; i += 10) {
      prob += (Math.random() - 0.5) * 20;
      prob = Math.max(0, Math.min(100, prob));
      data.push({ x: i, y: prob });
    }
    return data;
  };

  const linescore = useMemo(() => generateLinescore(gameData.sport || "NBA"), [gameData.sport]);
  const team1BoxScore = useMemo(() => generateBoxScore(gameData.sport || "NBA", gameData.team1), [gameData.sport, gameData.team1]);
  const team2BoxScore = useMemo(() => generateBoxScore(gameData.sport || "NBA", gameData.team2), [gameData.sport, gameData.team2]);
  const winProbData = useMemo(() => generateWinProbability(), []);

  const tabs = [
    {
      id: "stats",
      icon: "stats-chart",
      label: "Game Stats",
    },
    {
      id: "quick",
      icon: "flash",
      label: "Flash Props",
    },
    {
      id: "props",
      icon: "person",
      label: "Player Props",
    },
    {
      id: "lines",
      icon: "list",
      label: "Game Lines",
    },
  ];

  const renderTabContent = () => {
    switch (selectedTab) {
      case "stats":
        return (
          <View style={styles.tabContent}>
            {/* Linescore */}
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Linescore
            </Text>
            <View style={[styles.linescoreTable, { backgroundColor: theme.surfaceSecondary }]}>
              <View style={styles.linescoreHeader}>
                <View style={styles.linescoreTeamCell}>
                  <Text style={[styles.linescoreHeaderCell, { color: theme.textSecondary }]}>Team</Text>
                </View>
                {linescore.team1Scores.map((_, i) => (
                  <Text key={i} style={[styles.linescoreHeaderCell, { color: theme.textSecondary }]}>
                    {gameData.sport === "SOCCER" ? (i === 0 ? "1H" : "2H") : i + 1}
                  </Text>
                ))}
                <Text style={[styles.linescoreHeaderCell, { color: theme.textSecondary }]}>T</Text>
              </View>
              <View style={styles.linescoreRow}>
                <View style={styles.linescoreTeamCell}>
                  <View style={[styles.linescoreTeamLogo, { backgroundColor: colors.primary }]}>
                    <FontAwesome6 
                      name={getSportIcon(gameData.sport || "NBA")} 
                      size={14} 
                      color="white" 
                    />
                  </View>
                  <Text style={[styles.linescoreTeamText, { color: theme.text }]}>{gameData.team1}</Text>
                </View>
                {linescore.team1Scores.map((score, i) => (
                  <Text key={i} style={[styles.linescoreCell, { color: theme.text }]}>{score}</Text>
                ))}
                <Text style={[styles.linescoreTotalCell, { color: theme.text }]}>
                  {linescore.team1Scores.reduce((a, b) => a + b, 0)}
                </Text>
              </View>
              <View style={styles.linescoreRow}>
                <View style={styles.linescoreTeamCell}>
                  <View style={[styles.linescoreTeamLogo, { backgroundColor: theme.textSecondary }]}>
                    <FontAwesome6 
                      name={getSportIcon(gameData.sport || "NBA")} 
                      size={14} 
                      color="white" 
                    />
                  </View>
                  <Text style={[styles.linescoreTeamText, { color: theme.text }]}>{gameData.team2}</Text>
                </View>
                {linescore.team2Scores.map((score, i) => (
                  <Text key={i} style={[styles.linescoreCell, { color: theme.text }]}>{score}</Text>
                ))}
                <Text style={[styles.linescoreTotalCell, { color: theme.text }]}>
                  {linescore.team2Scores.reduce((a, b) => a + b, 0)}
                </Text>
              </View>
            </View>

            {/* Box Score - Team 1 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 12 }}>
              <View style={[styles.boxScoreTeamLogo, { backgroundColor: colors.primary }]}>
                <FontAwesome6 
                  name={getSportIcon(gameData.sport || "NBA")} 
                  size={16} 
                  color="white" 
                />
              </View>
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                {gameData.team1} Box Score
              </Text>
            </View>
            <View style={[styles.boxScoreTable, { backgroundColor: theme.surfaceSecondary }]}>
              <View style={styles.boxScoreHeader}>
                <Text style={[styles.boxScoreHeaderCell, { color: theme.textSecondary, flex: 2 }]}>Player</Text>
                {gameData.sport === "NBA" ? (
                  <>
                    <Text style={[styles.boxScoreHeaderCell, { color: theme.textSecondary }]}>PTS</Text>
                    <Text style={[styles.boxScoreHeaderCell, { color: theme.textSecondary }]}>REB</Text>
                    <Text style={[styles.boxScoreHeaderCell, { color: theme.textSecondary }]}>AST</Text>
                  </>
                ) : gameData.sport === "NFL" ? (
                  <>
                    <Text style={[styles.boxScoreHeaderCell, { color: theme.textSecondary }]}>YDS</Text>
                    <Text style={[styles.boxScoreHeaderCell, { color: theme.textSecondary }]}>TD</Text>
                    <Text style={[styles.boxScoreHeaderCell, { color: theme.textSecondary }]}>REC</Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.boxScoreHeaderCell, { color: theme.textSecondary }]}>G</Text>
                    <Text style={[styles.boxScoreHeaderCell, { color: theme.textSecondary }]}>A</Text>
                    <Text style={[styles.boxScoreHeaderCell, { color: theme.textSecondary }]}>SH</Text>
                  </>
                )}
              </View>
              {gameData.sport === "NBA" || gameData.sport === "SOCCER" ? (
                <>
                  <Text style={[styles.boxScoreSectionLabel, { color: theme.textTertiary }]}>
                    {gameData.sport === "NBA" ? "STARTERS" : "ON FIELD"}
                  </Text>
                  {team1BoxScore.filter(p => p.isStarter).map((player, i) => (
                    <View key={i} style={styles.boxScoreRow}>
                      <Text style={[styles.boxScoreCell, { color: theme.text, flex: 2 }]}>{player.name}</Text>
                      {gameData.sport === "NBA" ? (
                        <>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.pts}</Text>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.reb}</Text>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.ast}</Text>
                        </>
                      ) : (
                        <>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.goals}</Text>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.assists}</Text>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.shots}</Text>
                        </>
                      )}
                    </View>
                  ))}
                  <Text style={[styles.boxScoreSectionLabel, { color: theme.textTertiary }]}>BENCH</Text>
                  {team1BoxScore.filter(p => !p.isStarter).map((player, i) => (
                    <View key={i} style={styles.boxScoreRow}>
                      <Text style={[styles.boxScoreCell, { color: theme.text, flex: 2 }]}>{player.name}</Text>
                      {gameData.sport === "NBA" ? (
                        <>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.pts}</Text>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.reb}</Text>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.ast}</Text>
                        </>
                      ) : (
                        <>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.goals}</Text>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.assists}</Text>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.shots}</Text>
                        </>
                      )}
                    </View>
                  ))}
                </>
              ) : (
                team1BoxScore.map((player, i) => (
                  <View key={i} style={styles.boxScoreRow}>
                    <Text style={[styles.boxScoreCell, { color: theme.text, flex: 2 }]}>
                      {player.name} ({player.pos})
                    </Text>
                    <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.yds}</Text>
                    <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.td}</Text>
                    <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.rec || player.int}</Text>
                  </View>
                ))
              )}
            </View>

            {/* Box Score - Team 2 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 12 }}>
              <View style={[styles.boxScoreTeamLogo, { backgroundColor: theme.textSecondary }]}>
                <FontAwesome6 
                  name={getSportIcon(gameData.sport || "NBA")} 
                  size={16} 
                  color="white" 
                />
              </View>
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                {gameData.team2} Box Score
              </Text>
            </View>
            <View style={[styles.boxScoreTable, { backgroundColor: theme.surfaceSecondary }]}>
              <View style={styles.boxScoreHeader}>
                <Text style={[styles.boxScoreHeaderCell, { color: theme.textSecondary, flex: 2 }]}>Player</Text>
                {gameData.sport === "NBA" ? (
                  <>
                    <Text style={[styles.boxScoreHeaderCell, { color: theme.textSecondary }]}>PTS</Text>
                    <Text style={[styles.boxScoreHeaderCell, { color: theme.textSecondary }]}>REB</Text>
                    <Text style={[styles.boxScoreHeaderCell, { color: theme.textSecondary }]}>AST</Text>
                  </>
                ) : gameData.sport === "NFL" ? (
                  <>
                    <Text style={[styles.boxScoreHeaderCell, { color: theme.textSecondary }]}>YDS</Text>
                    <Text style={[styles.boxScoreHeaderCell, { color: theme.textSecondary }]}>TD</Text>
                    <Text style={[styles.boxScoreHeaderCell, { color: theme.textSecondary }]}>REC</Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.boxScoreHeaderCell, { color: theme.textSecondary }]}>G</Text>
                    <Text style={[styles.boxScoreHeaderCell, { color: theme.textSecondary }]}>A</Text>
                    <Text style={[styles.boxScoreHeaderCell, { color: theme.textSecondary }]}>SH</Text>
                  </>
                )}
              </View>
              {gameData.sport === "NBA" || gameData.sport === "SOCCER" ? (
                <>
                  <Text style={[styles.boxScoreSectionLabel, { color: theme.textTertiary }]}>
                    {gameData.sport === "NBA" ? "STARTERS" : "ON FIELD"}
                  </Text>
                  {team2BoxScore.filter(p => p.isStarter).map((player, i) => (
                    <View key={i} style={styles.boxScoreRow}>
                      <Text style={[styles.boxScoreCell, { color: theme.text, flex: 2 }]}>{player.name}</Text>
                      {gameData.sport === "NBA" ? (
                        <>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.pts}</Text>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.reb}</Text>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.ast}</Text>
                        </>
                      ) : (
                        <>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.goals}</Text>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.assists}</Text>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.shots}</Text>
                        </>
                      )}
                    </View>
                  ))}
                  <Text style={[styles.boxScoreSectionLabel, { color: theme.textTertiary }]}>BENCH</Text>
                  {team2BoxScore.filter(p => !p.isStarter).map((player, i) => (
                    <View key={i} style={styles.boxScoreRow}>
                      <Text style={[styles.boxScoreCell, { color: theme.text, flex: 2 }]}>{player.name}</Text>
                      {gameData.sport === "NBA" ? (
                        <>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.pts}</Text>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.reb}</Text>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.ast}</Text>
                        </>
                      ) : (
                        <>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.goals}</Text>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.assists}</Text>
                          <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.shots}</Text>
                        </>
                      )}
                    </View>
                  ))}
                </>
              ) : (
                team2BoxScore.map((player, i) => (
                  <View key={i} style={styles.boxScoreRow}>
                    <Text style={[styles.boxScoreCell, { color: theme.text, flex: 2 }]}>
                      {player.name} ({player.pos})
                    </Text>
                    <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.yds}</Text>
                    <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.td}</Text>
                    <Text style={[styles.boxScoreCell, { color: theme.text }]}>{player.rec || player.int}</Text>
                  </View>
                ))
              )}
            </View>

            {/* Win Probability Chart */}
            <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 24 }]}>
              Win Probability
            </Text>
            <View style={[styles.chartContainer, { backgroundColor: theme.surfaceSecondary }]}>
              <View style={styles.chart}>
                <View style={styles.chartYAxis}>
                  <Text style={[styles.chartAxisLabel, { color: theme.textTertiary }]}>100%</Text>
                  <Text style={[styles.chartAxisLabel, { color: theme.textTertiary }]}>50%</Text>
                  <Text style={[styles.chartAxisLabel, { color: theme.textTertiary }]}>0%</Text>
                </View>
                <View style={styles.chartContent}>
                  <View style={[styles.chartMidLine, { backgroundColor: theme.border }]} />
                  <View style={styles.chartLine}>
                    {winProbData.map((point, i) => {
                      if (i === 0) return null;
                      const prevPoint = winProbData[i - 1];
                      const x1 = (prevPoint.x / 100) * 100;
                      const y1 = 100 - prevPoint.y;
                      const x2 = (point.x / 100) * 100;
                      const y2 = 100 - point.y;
                      
                      return (
                        <View
                          key={i}
                          style={[
                            styles.chartSegment,
                            {
                              left: `${x1}%`,
                              top: `${y1}%`,
                              width: Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)),
                              transform: [
                                { rotate: `${Math.atan2(y2 - y1, x2 - x1)}rad` }
                              ],
                              backgroundColor: colors.primary,
                            },
                          ]}
                        />
                      );
                    })}
                  </View>
                </View>
              </View>
              <View style={styles.chartLegend}>
                <View style={styles.chartLegendItem}>
                  <View style={[styles.chartLegendColor, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.chartLegendText, { color: theme.text }]}>{gameData.team1}</Text>
                </View>
              </View>
            </View>
          </View>
        );
      case "quick":
        return (
          <View style={styles.tabContent}>
            <Text style={[styles.contentTitle, { color: theme.text }]}>
              Flash Props
            </Text>

            {/* Next Field Goal */}
            <View style={[styles.flashPropCard, { backgroundColor: theme.surfaceSecondary }]}>
              <View style={styles.flashPropHeader}>
                <Ionicons name="basketball" size={20} color={colors.primary} />
                <Text style={[styles.flashPropTitle, { color: theme.text }]}>
                  Next basket will be ...?
                </Text>
              </View>
              <Text style={[styles.flashPropSubtitle, { color: theme.textSecondary }]}>
                Next Field Goal Exact Type (after Score 85-81)
              </Text>
              
              <View style={styles.flashPropGrid}>
                <TouchableOpacity
                  style={[
                    styles.flashPropOption,
                    {
                      backgroundColor: isBetSelected('flash-1')
                        ? colors.primary
                        : theme.surface,
                    },
                  ]}
                  onPress={() => {
                    toggleBet({
                      id: 'flash-1',
                      gameId: gameData.id,
                      gameInfo: {
                        time: gameData.time || 'TBD',
                        teams: `${gameData.team1} @ ${gameData.team2}`,
                      },
                      type: 'Flash Prop',
                      description: 'Next basket - TOR Two Points',
                      line: '',
                      odds: '+240',
                    });
                  }}
                >
                  <Text style={[styles.flashPropOptionText, { color: isBetSelected('flash-1') ? 'white' : theme.text }]}>
                    TOR Raptors Two Points
                  </Text>
                  <Text style={[styles.flashPropOptionOdds, { color: isBetSelected('flash-1') ? 'white' : colors.primary }]}>
                    2.40
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.flashPropOption,
                    {
                      backgroundColor: isBetSelected('flash-2')
                        ? colors.primary
                        : theme.surface,
                    },
                  ]}
                  onPress={() => {
                    toggleBet({
                      id: 'flash-2',
                      gameId: gameData.id,
                      gameInfo: {
                        time: gameData.time || 'TBD',
                        teams: `${gameData.team1} @ ${gameData.team2}`,
                      },
                      type: 'Flash Prop',
                      description: 'Next basket - TOR Three Points',
                      line: '',
                      odds: '+430',
                    });
                  }}
                >
                  <Text style={[styles.flashPropOptionText, { color: isBetSelected('flash-2') ? 'white' : theme.text }]}>
                    TOR Raptors Three Points
                  </Text>
                  <Text style={[styles.flashPropOptionOdds, { color: isBetSelected('flash-2') ? 'white' : colors.primary }]}>
                    4.30
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.flashPropOption,
                    {
                      backgroundColor: isBetSelected('flash-3')
                        ? colors.primary
                        : theme.surface,
                    },
                  ]}
                  onPress={() => {
                    toggleBet({
                      id: 'flash-3',
                      gameId: gameData.id,
                      gameInfo: {
                        time: gameData.time || 'TBD',
                        teams: `${gameData.team1} @ ${gameData.team2}`,
                      },
                      type: 'Flash Prop',
                      description: 'Next basket - MIA Two Points',
                      line: '',
                      odds: '+295',
                    });
                  }}
                >
                  <Text style={[styles.flashPropOptionText, { color: isBetSelected('flash-3') ? 'white' : theme.text }]}>
                    MIA Heat Two Points
                  </Text>
                  <Text style={[styles.flashPropOptionOdds, { color: isBetSelected('flash-3') ? 'white' : colors.primary }]}>
                    2.95
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.flashPropOption,
                    {
                      backgroundColor: isBetSelected('flash-4')
                        ? colors.primary
                        : theme.surface,
                    },
                  ]}
                  onPress={() => {
                    toggleBet({
                      id: 'flash-4',
                      gameId: gameData.id,
                      gameInfo: {
                        time: gameData.time || 'TBD',
                        teams: `${gameData.team1} @ ${gameData.team2}`,
                      },
                      type: 'Flash Prop',
                      description: 'Next basket - MIA Three Points',
                      line: '',
                      odds: '+650',
                    });
                  }}
                >
                  <Text style={[styles.flashPropOptionText, { color: isBetSelected('flash-4') ? 'white' : theme.text }]}>
                    MIA Heat Three Points
                  </Text>
                  <Text style={[styles.flashPropOptionOdds, { color: isBetSelected('flash-4') ? 'white' : colors.primary }]}>
                    6.50
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Next Team to Score */}
            <View style={[styles.flashPropCard, { backgroundColor: theme.surfaceSecondary }]}>
              <View style={styles.flashPropHeader}>
                <Ionicons name="basketball" size={20} color={colors.primary} />
                <Text style={[styles.flashPropTitle, { color: theme.text }]}>
                  Next basket will be scored by the...?
                </Text>
              </View>
              <Text style={[styles.flashPropSubtitle, { color: theme.textSecondary }]}>
                Team to Score the Next Field Goal (after Score 85-81)
              </Text>
              
              <View style={styles.flashPropRow}>
                <TouchableOpacity
                  style={[
                    styles.flashPropChoiceButton,
                    {
                      backgroundColor: isBetSelected('team-score-1')
                        ? colors.primary
                        : theme.surface,
                    },
                  ]}
                  onPress={() => {
                    toggleBet({
                      id: 'team-score-1',
                      gameId: gameData.id,
                      gameInfo: {
                        time: gameData.time || 'TBD',
                        teams: `${gameData.team1} @ ${gameData.team2}`,
                      },
                      type: 'Flash Prop',
                      description: 'Next team to score - TOR Raptors',
                      line: '',
                      odds: '+164',
                    });
                  }}
                >
                  <Text style={[styles.flashPropChoiceText, { color: isBetSelected('team-score-1') ? 'white' : theme.text }]}>
                    TOR Raptors
                  </Text>
                  <Text style={[styles.flashPropChoiceOdds, { color: isBetSelected('team-score-1') ? 'white' : colors.primary }]}>
                    1.64
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.flashPropChoiceButton,
                    {
                      backgroundColor: isBetSelected('team-score-2')
                        ? colors.primary
                        : theme.surface,
                    },
                  ]}
                  onPress={() => {
                    toggleBet({
                      id: 'team-score-2',
                      gameId: gameData.id,
                      gameInfo: {
                        time: gameData.time || 'TBD',
                        teams: `${gameData.team1} @ ${gameData.team2}`,
                      },
                      type: 'Flash Prop',
                      description: 'Next team to score - MIA Heat',
                      line: '',
                      odds: '+225',
                    });
                  }}
                >
                  <Text style={[styles.flashPropChoiceText, { color: isBetSelected('team-score-2') ? 'white' : theme.text }]}>
                    MIA Heat
                  </Text>
                  <Text style={[styles.flashPropChoiceOdds, { color: isBetSelected('team-score-2') ? 'white' : colors.primary }]}>
                    2.25
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      case "props":
        const propTypes = gameData.sport === "NBA" 
          ? ["Points", "Rebounds", "Assists", "3-Pointers"]
          : gameData.sport === "NFL"
          ? ["Passing Yards", "Rushing Yards", "Receptions", "Touchdowns"]
          : ["Goals", "Assists", "Shots on Target", "Saves"];
        
        return (
          <PropTabContent 
            gameData={gameData}
            theme={theme}
            colors={colors}
            propTypes={propTypes}
            gameId={gameData.id}
          />
        );
      case "lines":
        return (
          <View style={styles.tabContent}>
            <Text style={[styles.contentTitle, { color: theme.text }]}>
              Game Lines
            </Text>

            {/* Game Section */}
            <View style={styles.gameLineSection}>
              <Text style={[styles.gameLineSectionTitle, { color: theme.text }]}>Game</Text>
              <Text style={[styles.gameLineSectionSubtitle, { color: theme.textSecondary }]}>Today</Text>
              
              <View style={[styles.gameLineTable, { backgroundColor: theme.surfaceSecondary }]}>
                {/* Header */}
                <View style={styles.gameLineHeader}>
                  <Text style={[styles.gameLineHeaderCell, { color: theme.textSecondary }]}></Text>
                  <Text style={[styles.gameLineHeaderCell, { color: theme.textSecondary }]}>Spread</Text>
                  <Text style={[styles.gameLineHeaderCell, { color: theme.textSecondary }]}>Total</Text>
                  <Text style={[styles.gameLineHeaderCell, { color: theme.textSecondary }]}>Moneyline</Text>
                </View>

                {/* Team 1 Row */}
                <View style={styles.gameLineRow}>
                  <View style={styles.gameLineTeamCell}>
                    <Text style={[styles.gameLineTeamName, { color: theme.text }]}>
                      {gameData.team1.split(' ').pop()}
                    </Text>
                  </View>
                  
                  <TouchableOpacity
                    style={[
                      styles.gameLineCell,
                      {
                        backgroundColor: isBetSelected('spread-team1')
                          ? colors.primary
                          : theme.surface,
                      },
                    ]}
                    onPress={() => {
                      toggleBet({
                        id: 'spread-team1',
                        gameId: gameData.id,
                        gameInfo: {
                          time: gameData.time || 'TBD',
                          teams: `${gameData.team1} @ ${gameData.team2}`,
                        },
                        type: 'Spread',
                        description: `${gameData.team1}`,
                        line: '-1.5',
                        odds: '+190',
                      });
                    }}
                  >
                    <Text style={[styles.gameLineCellLine, { color: isBetSelected('spread-team1') ? 'white' : theme.text }]}>
                      -1.5
                    </Text>
                    <Text style={[styles.gameLineCellOdds, { color: isBetSelected('spread-team1') ? 'white' : colors.primary }]}>
                      1.90
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.gameLineCell,
                      {
                        backgroundColor: isBetSelected('over-team1')
                          ? colors.primary
                          : theme.surface,
                      },
                    ]}
                    onPress={() => {
                      toggleBet({
                        id: 'over-team1',
                        gameId: gameData.id,
                        gameInfo: {
                          time: gameData.time || 'TBD',
                          teams: `${gameData.team1} @ ${gameData.team2}`,
                        },
                        type: 'Total',
                        description: 'Over',
                        line: 'O 236.5',
                        odds: '+189',
                      });
                    }}
                  >
                    <Text style={[styles.gameLineCellLine, { color: isBetSelected('over-team1') ? 'white' : theme.text }]}>
                      O 236.5
                    </Text>
                    <Text style={[styles.gameLineCellOdds, { color: isBetSelected('over-team1') ? 'white' : colors.primary }]}>
                      1.89
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.gameLineCell,
                      {
                        backgroundColor: isBetSelected('money-team1')
                          ? colors.primary
                          : theme.surface,
                      },
                    ]}
                    onPress={() => {
                      toggleBet({
                        id: 'money-team1',
                        gameId: gameData.id,
                        gameInfo: {
                          time: gameData.time || 'TBD',
                          teams: `${gameData.team1} @ ${gameData.team2}`,
                        },
                        type: 'Moneyline',
                        description: gameData.team1,
                        line: '',
                        odds: '+186',
                      });
                    }}
                  >
                    <Text style={[styles.gameLineCellOdds, { color: isBetSelected('money-team1') ? 'white' : colors.primary }]}>
                      1.86
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Team 2 Row */}
                <View style={styles.gameLineRow}>
                  <View style={styles.gameLineTeamCell}>
                    <Text style={[styles.gameLineTeamName, { color: theme.text }]}>
                      {gameData.team2.split(' ').pop()}
                    </Text>
                  </View>
                  
                  <TouchableOpacity
                    style={[
                      styles.gameLineCell,
                      {
                        backgroundColor: isBetSelected('spread-team2')
                          ? colors.primary
                          : theme.surface,
                      },
                    ]}
                    onPress={() => {
                      toggleBet({
                        id: 'spread-team2',
                        gameId: gameData.id,
                        gameInfo: {
                          time: gameData.time || 'TBD',
                          teams: `${gameData.team1} @ ${gameData.team2}`,
                        },
                        type: 'Spread',
                        description: gameData.team2,
                        line: '+1.5',
                        odds: '+190',
                      });
                    }}
                  >
                    <Text style={[styles.gameLineCellLine, { color: isBetSelected('spread-team2') ? 'white' : theme.text }]}>
                      +1.5
                    </Text>
                    <Text style={[styles.gameLineCellOdds, { color: isBetSelected('spread-team2') ? 'white' : colors.primary }]}>
                      1.90
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.gameLineCell,
                      {
                        backgroundColor: isBetSelected('under-team2')
                          ? colors.primary
                          : theme.surface,
                      },
                    ]}
                    onPress={() => {
                      toggleBet({
                        id: 'under-team2',
                        gameId: gameData.id,
                        gameInfo: {
                          time: gameData.time || 'TBD',
                          teams: `${gameData.team1} @ ${gameData.team2}`,
                        },
                        type: 'Total',
                        description: 'Under',
                        line: 'U 236.5',
                        odds: '+192',
                      });
                    }}
                  >
                    <Text style={[styles.gameLineCellLine, { color: isBetSelected('under-team2') ? 'white' : theme.text }]}>
                      U 236.5
                    </Text>
                    <Text style={[styles.gameLineCellOdds, { color: isBetSelected('under-team2') ? 'white' : colors.primary }]}>
                      1.92
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.gameLineCell,
                      {
                        backgroundColor: isBetSelected('money-team2')
                          ? colors.primary
                          : theme.surface,
                      },
                    ]}
                    onPress={() => {
                      toggleBet({
                        id: 'money-team2',
                        gameId: gameData.id,
                        gameInfo: {
                          time: gameData.time || 'TBD',
                          teams: `${gameData.team1} @ ${gameData.team2}`,
                        },
                        type: 'Moneyline',
                        description: gameData.team2,
                        line: '',
                        odds: '+195',
                      });
                    }}
                  >
                    <Text style={[styles.gameLineCellOdds, { color: isBetSelected('money-team2') ? 'white' : colors.primary }]}>
                      1.95
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Betting Percentage */}
                <View style={styles.bettingPercentage}>
                  <View style={styles.bettingPercentageBar}>
                    <View
                      style={[
                        styles.bettingPercentageFill,
                        { width: '37%', backgroundColor: colors.primary },
                      ]}
                    />
                  </View>
                  <View style={styles.bettingPercentageLabels}>
                    <Text style={[styles.bettingPercentageLabel, { color: theme.text }]}>
                      HOU 37%
                    </Text>
                    <Text style={[styles.bettingPercentageLabel, { color: theme.textSecondary }]}>
                      % of bets placed
                    </Text>
                    <Text style={[styles.bettingPercentageLabel, { color: theme.text }]}>
                      63% DEN
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Alternate Spread */}
            <AlternateSpreadSection 
              gameData={gameData}
              theme={theme}
              colors={colors}
            />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        contentContainerStyle={{ paddingBottom: 80 }}
      >
        {/* Header with Teams and Scores */}
        <View style={[styles.header, { backgroundColor: theme.surface }]}>
          <View style={styles.headerContent}>
            {/* Venue */}
            <Text style={[styles.venueText, { color: theme.textSecondary }]}>
              {venue}
            </Text>

            <View style={styles.scoresRow}>
              <View style={styles.teamSection}>
                <View style={[styles.teamLogo, { backgroundColor: colors.primary }]}>
                  <FontAwesome6 
                    name={getSportIcon(gameData.sport || "NBA")} 
                    size={24} 
                    color="white" 
                  />
                </View>
                <Text style={[styles.teamName, { color: theme.text }]}>
                  {gameData.team1}
                </Text>
              </View>
              
              <View style={styles.scoreSection}>
                <Text style={[styles.scoreText, { color: theme.text }]}>
                  {gameData.score1 || "-"}
                </Text>
                <Text style={[styles.scoreDivider, { color: theme.textSecondary }]}>-</Text>
                <Text style={[styles.scoreText, { color: theme.text }]}>
                  {gameData.score2 || "-"}
                </Text>
              </View>

              <View style={styles.teamSection}>
                <View style={[styles.teamLogo, { backgroundColor: theme.textSecondary }]}>
                  <FontAwesome6 
                    name={getSportIcon(gameData.sport || "NBA")} 
                    size={24} 
                    color="white" 
                  />
                </View>
                <Text style={[styles.teamName, { color: theme.text }]}>
                  {gameData.team2}
                </Text>
              </View>
            </View>

            <View style={[styles.gameStatusBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.gameStatusText}>
                {gameData.period || gameData.status?.toUpperCase() || "LIVE"}
                {gameData.period && ` • ${gameData.time}`}
              </Text>
            </View>

            <Text style={[styles.gameDate, { color: theme.textSecondary }]}>
              {new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </Text>
          </View>
        </View>

        {/* Sticky Tab Buttons */}
        <View style={[styles.tabsContainer, { backgroundColor: theme.surface }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsScroll}
          >
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.tabButton,
                  {
                    backgroundColor:
                      selectedTab === tab.id ? colors.primary : "transparent",
                  },
                ]}
                onPress={() => setSelectedTab(tab.id)}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color: selectedTab === tab.id ? "white" : theme.textSecondary,
                      fontWeight: selectedTab === tab.id ? "bold" : "600",
                      fontSize: tabFontSize,
                    },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Tab Content */}
        <View style={styles.contentContainer}>
          {renderTabContent()}
        </View>
      </ScrollView>

      {/* Bet Slip Bottom Bar */}
      <BetSlip isGameDetail={true} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  headerContent: {
    alignItems: "center",
  },
  venueText: {
    fontSize: 12,
    marginBottom: 12,
    fontWeight: "500",
  },
  scoresRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 12,
  },
  teamSection: {
    flex: 1,
    alignItems: "center",
  },
  teamLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  teamName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  scoreSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 20,
  },
  scoreText: {
    fontSize: 36,
    fontWeight: "bold",
  },
  scoreDivider: {
    fontSize: 24,
    fontWeight: "normal",
  },
  gameStatusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 8,
  },
  gameStatusText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  gameDate: {
    fontSize: 12,
  },
  tabsContainer: {
    flexDirection: "row",
    paddingVertical: 0,
  },
  tabsScroll: {
    flexDirection: "row",
    flex: 1,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 0,
  },
  tabLabel: {
    // fontSize set dynamically
  },
  contentContainer: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  
  // Linescore Styles
  linescoreTable: {
    borderRadius: 12,
    padding: 12,
  },
  linescoreHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    paddingBottom: 8,
    marginBottom: 8,
    alignItems: "center",
  },
  linescoreHeaderCell: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
  },
  linescoreRow: {
    flexDirection: "row",
    paddingVertical: 6,
    alignItems: "center",
  },
  linescoreTeamCell: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
  },
  linescoreTeamLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  linescoreTeamText: {
    fontSize: 14,
    fontWeight: "600",
  },
  linescoreCell: {
    flex: 1,
    textAlign: "center",
    fontSize: 14,
  },
  linescoreTotalCell: {
    flex: 1,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "bold",
  },
  
  // Box Score Team Logo
  boxScoreTeamLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  
  // Box Score Styles
  boxScoreTable: {
    borderRadius: 12,
    padding: 12,
  },
  boxScoreHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    paddingBottom: 8,
    marginBottom: 8,
  },
  boxScoreHeaderCell: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  boxScoreSectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 8,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  boxScoreRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  boxScoreCell: {
    flex: 1,
    fontSize: 14,
    textAlign: "center",
  },
  
  // Win Probability Chart Styles
  chartContainer: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  chart: {
    flexDirection: "row",
    height: 200,
  },
  chartYAxis: {
    width: 40,
    justifyContent: "space-between",
    paddingRight: 8,
  },
  chartAxisLabel: {
    fontSize: 10,
    textAlign: "right",
  },
  chartContent: {
    flex: 1,
    position: "relative",
  },
  chartMidLine: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    height: 1,
    opacity: 0.3,
  },
  chartLine: {
    flex: 1,
    position: "relative",
  },
  chartSegment: {
    position: "absolute",
    height: 2,
  },
  chartLegend: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 12,
  },
  chartLegendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  chartLegendColor: {
    width: 16,
    height: 3,
    marginRight: 6,
  },
  chartLegendText: {
    fontSize: 12,
  },
  
  contentTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
  },
  statCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
  },
  betOption: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  betOptionHeader: {
    marginBottom: 12,
  },
  betOptionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  betChoices: {
    flexDirection: "row",
    gap: 12,
  },
  betChoice: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  betChoiceText: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 4,
  },
  betOdds: {
    fontSize: 16,
    fontWeight: "bold",
  },
  propTypeSelector: {
    marginBottom: 16,
  },
  propTypeSelectorContent: {
    gap: 8,
  },
  propTypeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  propTypeText: {
    fontSize: 14,
    fontWeight: "600",
  },
  
  // New Player Props Styles (DraftKings Style)
  propSection: {
    marginBottom: 24,
  },
  propSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  propRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  propPlayerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 140,
    marginRight: 12,
  },
  propPlayerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  propPlayerDetails: {
    flex: 1,
  },
  propPlayerName: {
    fontSize: 13,
    fontWeight: '600',
  },
  propPlayerPPG: {
    fontSize: 11,
    marginTop: 2,
  },
  propOddsScroll: {
    flex: 1,
  },
  propMilestoneContent: {
    paddingRight: 16,
    alignItems: 'center',
  },
  milestoneButton: {
    width: 70,
    marginHorizontal: 4,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  milestoneValue: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  milestoneOdds: {
    fontSize: 13,
    fontWeight: '600',
  },
  ouButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
  },
  ouButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  ouLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
  },
  ouLine: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  ouOdds: {
    fontSize: 13,
    fontWeight: '600',
  },
  viewMoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  viewMoreText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Flash Props Styles
  flashPropCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  flashPropHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  flashPropTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  flashPropSubtitle: {
    fontSize: 12,
    marginBottom: 16,
  },
  flashPropGrid: {
    gap: 12,
  },
  flashPropOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
  },
  flashPropOptionText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  flashPropOptionOdds: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  flashPropRow: {
    flexDirection: 'row',
    gap: 12,
  },
  flashPropChoiceButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  flashPropChoiceText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  flashPropChoiceOdds: {
    fontSize: 18,
    fontWeight: 'bold',
  },

  // Game Lines Styles
  gameLineSection: {
    marginBottom: 24,
  },
  gameLineSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  gameLineSectionSubtitle: {
    fontSize: 13,
    marginBottom: 12,
  },
  gameLineTable: {
    borderRadius: 12,
    padding: 12,
  },
  gameLineHeader: {
    flexDirection: 'row',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  gameLineHeaderCell: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  gameLineRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  gameLineTeamCell: {
    flex: 1,
    justifyContent: 'center',
  },
  gameLineTeamName: {
    fontSize: 14,
    fontWeight: '600',
  },
  gameLineCell: {
    flex: 1,
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  gameLineCellLine: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  gameLineCellOdds: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  bettingPercentage: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  bettingPercentageBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    marginBottom: 8,
    overflow: 'hidden',
  },
  bettingPercentageFill: {
    height: '100%',
    borderRadius: 3,
  },
  bettingPercentageLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bettingPercentageLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  alternateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sgpBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  sgpText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  alternateSpreadContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  alternateSpreadCard: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  alternateSpreadTeam: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  alternateSpreadLine: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  alternateSpreadOdds: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  alternateSpreadSliderScroll: {
    marginHorizontal: 0,
  },
  alternateSpreadSliderContent: {
    paddingHorizontal: width / 2 - 30,
  },
  spreadOption: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  sliderValue: {
    fontSize: 13,
  },
  
  propsList: {
    gap: 12,
  },
  propCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  propCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  propTypeBadge: {
    fontSize: 12,
  },
  propChoices: {
    flexDirection: "row",
    gap: 12,
  },
  propChoice: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  propChoiceLabel: {
    fontSize: 11,
    marginBottom: 4,
    fontWeight: "600",
  },
  propChoiceLine: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  propChoiceOdds: {
    fontSize: 14,
    fontWeight: "600",
  },
  placeholderText: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 24,
    fontStyle: "italic",
  },
});

export default BetGameDetailScreen;

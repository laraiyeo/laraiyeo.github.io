import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Image,
  ActivityIndicator,
  PanResponder,
} from "react-native";
import { Ionicons, FontAwesome6 } from "@expo/vector-icons";
import Svg, {
  Path,
  G,
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Circle,
  Line,
} from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";
import { useBetSlip } from "../../context/BetSlipContext";
import { useBetData } from "../../context/BetDataContext";
import BetSlip from "../../components/BetSlip";
import PlayerStatsPopup from "../../components/PlayerStatsPopup";
import { useGamePresence } from "../../hooks/useGamePresence";
import LiveTrackerEmbed from "../../components/LiveTrackerEmbed";
import LiveTrackerService from "../../services/liveTrackerService";

const { width } = Dimensions.get("window");

// Memoized Team Logo Component to prevent re-fetching images
const TeamLogo = React.memo(
  ({ uri, style, resizeMode = "contain" }) => {
    return <Image source={{ uri }} style={style} resizeMode={resizeMode} />;
  },
  (prevProps, nextProps) => {
    // Only re-render if URI actually changes
    return prevProps.uri === nextProps.uri;
  }
);

// Color similarity detection utility
const calculateColorSimilarity = (color1, color2) => {
  // Convert hex colors to RGB
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  };
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  if (!rgb1 || !rgb2) return false;

  // Calculate Euclidean distance in RGB space
  const distance = Math.sqrt(
    Math.pow(rgb1.r - rgb2.r, 2) +
      Math.pow(rgb1.g - rgb2.g, 2) +
      Math.pow(rgb1.b - rgb2.b, 2)
  );

  // Normalize distance (max distance is sqrt(3 * 255^2) ≈ 441)
  const normalizedDistance = distance / 441;

  // Consider colors similar if distance is less than 0.3 (30% of max distance)
  return normalizedDistance < 0.3;
};

// Smart color selection utility - returns appropriate colors for teams
const getSmartTeamColors = (team1Data, team2Data, colors) => {
  // team1 is away, team2 is home (matching NBA pattern)
  let team1Color = team1Data?.team1Color || colors.primary;
  let team2Color = team2Data?.team2Color || colors.secondary || "#666";

  // Check if colors are similar
  if (calculateColorSimilarity(team1Color, team2Color)) {
    // Use alternate color for away team (team1) if available
    const team1Alternate = team1Data?.team1AlternateColor;
    if (team1Alternate) {
      team1Color = team1Alternate.startsWith("#")
        ? team1Alternate
        : `#${team1Alternate}`;

      // If alternate is still similar, try home team's alternate
      if (calculateColorSimilarity(team1Color, team2Color)) {
        const team2Alternate = team2Data?.team2AlternateColor;
        if (team2Alternate) {
          team2Color = team2Alternate.startsWith("#")
            ? team2Alternate
            : `#${team2Alternate}`;
        }
      }
    }
  }

  return { team1Color, team2Color };
};

// Render stats row with bar fills (NBA pattern)
const renderStatsRow = (
  label,
  team1Value,
  team2Value,
  team1Color,
  team2Color,
  theme
) => {
  const team1Num =
    typeof team1Value === "number" ? team1Value : parseFloat(team1Value) || 0;
  const team2Num =
    typeof team2Value === "number" ? team2Value : parseFloat(team2Value) || 0;
  const total = team1Num + team2Num;
  const team1Percent = total > 0 ? (team1Num / total) * 100 : 50;
  const team2Percent = total > 0 ? (team2Num / total) * 100 : 50;

  return (
    <View key={label} style={styles.statsRow}>
      <Text
        style={[
          styles.statsValue,
          styles.statsValueAway,
          { color: theme.text },
        ]}
      >
        {team1Value}
      </Text>
      <View style={styles.statsBarContainer}>
        <View style={[styles.statsBar, { backgroundColor: theme.border }]}>
          <View
            style={[
              styles.statsBarFill,
              styles.statsBarFillAway,
              { width: `${team1Percent}%`, backgroundColor: team1Color },
            ]}
          />
          <View
            style={[
              styles.statsBarFill,
              styles.statsBarFillHome,
              { width: `${team2Percent}%`, backgroundColor: team2Color },
            ]}
          />
        </View>
        <Text style={[styles.statsLabel, { color: theme.textSecondary }]}>
          {label}
        </Text>
      </View>
      <Text
        style={[
          styles.statsValue,
          styles.statsValueHome,
          { color: theme.text },
        ]}
      >
        {team2Value}
      </Text>
    </View>
  );
};

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

// Basketball Court Component for Live Play
const BasketballCourt = React.memo(
  ({ coordinate, isScoring, teamSide, teamColor, styles }) => {
    // Base court without coordinate
    const baseCourt = (
      <View style={styles.miniCourtContainer}>
        <View style={styles.courtContainer}>
          {/* Court outline */}
          <View style={styles.courtOutline} />
          {/* Half court line */}
          <View style={styles.courtOutlineCenterLine} />
          {/* Free throw circles */}
          <View style={styles.freeThrowCircleTop} />
          <View style={styles.freeThrowCircleBottom} />
          {/* Free throw lanes (paint areas) */}
          <View style={styles.freeThrowLaneTop} />
          <View style={styles.freeThrowLaneBottom} />
          {/* Free throw lines */}
          <View style={styles.freeThrowLineTop} />
          <View style={styles.freeThrowLineBottom} />
          {/* Free throw semicircles */}
          <View style={styles.freeThrowSemicircleTop} />
          <View style={styles.freeThrowSemicircleBottom} />
          {/* 3 point semicircles */}
          <View style={styles.threePointSemicircleTop} />
          <View style={styles.threePointSemicircleBottom} />
          {/* Center circle */}
          <View style={styles.centerCircle} />
          {/* Baskets */}
          <View style={styles.basketTop} />
          <View style={styles.basketBottom} />
        </View>
      </View>
    );

    if (
      !coordinate ||
      coordinate.x === undefined ||
      coordinate.y === undefined
    ) {
      return baseCourt;
    }

    const espnX = coordinate.x;
    const espnY = coordinate.y;

    let leftPercent, topPercent;

    // IMPORTANT: Court is 150x200 (vertical) but ROTATED 90deg via transform
    // After rotation: left becomes vertical position, top becomes horizontal position
    // So we use the VERTICAL court logic but swap which variable gets which axis

    if (teamSide === "home") {
      // Home on right side AFTER rotation - use away's formula with Math.min
      topPercent = espnY * 2 - 6;
      leftPercent = espnX * 2;
    } else {
      // Away on left side AFTER rotation - use home's formula with Math.max
      topPercent = (52 - espnY) * 2;
      leftPercent = (50 - espnX) * 2;
    }

    const finalLeftPercent = Math.max(2, Math.min(98, leftPercent));
    const finalTopPercent = Math.max(1.5, Math.min(98.5, topPercent));
    const finalTeamColor = teamColor.startsWith("#")
      ? teamColor
      : `#${teamColor}`;

    // Clamp to respective sides (top controls horizontal after 90deg rotation)
    // Boundaries: away 49.5-98.5%, home 1.5-50.5%
    let clampedTop = finalTopPercent;
    if (teamSide === "home") {
      clampedTop = Math.min(clampedTop, 50.5); // Home stays on right (≤50.5% top)
    } else {
      clampedTop = Math.max(clampedTop, 49.5); // Away stays on left (≥49.5% top)
    }

    // Log coordinates for debugging
    console.log("[Court] API coords:", { x: espnX, y: espnY, teamSide });
    console.log("[Court] Calculated %:", { leftPercent, topPercent });
    console.log("[Court] Final placement:", {
      left: finalLeftPercent,
      top: clampedTop,
    });

    return (
      <View style={styles.miniCourtContainer}>
        <View style={styles.courtContainer}>
          {/* Court outline */}
          <View style={styles.courtOutline} />
          {/* Half court line */}
          <View style={styles.courtOutlineCenterLine} />
          {/* Free throw circles */}
          <View style={styles.freeThrowCircleTop} />
          <View style={styles.freeThrowCircleBottom} />
          {/* Free throw lanes (paint areas) */}
          <View style={styles.freeThrowLaneTop} />
          <View style={styles.freeThrowLaneBottom} />
          {/* Free throw lines */}
          <View style={styles.freeThrowLineTop} />
          <View style={styles.freeThrowLineBottom} />
          {/* Free throw semicircles */}
          <View style={styles.freeThrowSemicircleTop} />
          <View style={styles.freeThrowSemicircleBottom} />
          {/* 3 point semicircles */}
          <View style={styles.threePointSemicircleTop} />
          <View style={styles.threePointSemicircleBottom} />
          {/* Center circle */}
          <View style={styles.centerCircle} />
          {/* Baskets */}
          <View style={styles.basketTop} />
          <View style={styles.basketBottom} />

          {/* Team side indicator */}
          <Text
            style={[
              styles.teamSideIndicator,
              teamSide === "home" ? styles.teamSideHome : styles.teamSideAway,
              { color: finalTeamColor },
            ]}
          >
            {teamSide.toUpperCase()}
          </Text>
          {/* Shot location */}
          <View
            style={[
              styles.shotMarker,
              isScoring ? styles.madeShotMarker : styles.missedShotMarker,
              {
                position: "absolute",
                left: `${finalLeftPercent}%`,
                top: `${clampedTop}%`,
                backgroundColor: isScoring ? finalTeamColor : "white",
                borderColor: isScoring ? "white" : finalTeamColor,
                marginLeft: -5,
                marginTop: -5,
              },
            ]}
          />
        </View>
      </View>
    );
  }
);

// Player Props Tab Component - DraftKings Style
const PropTabContent = ({ gameData, theme, colors, propTypes, gameId }) => {
  const { toggleBet, isBetSelected, removeBet } = useBetSlip();
  const { rostersData } = useBetData();
  const [selectedPropType, setSelectedPropType] = useState(propTypes[0]);
  const [selectedPlayerForStats, setSelectedPlayerForStats] = useState(null);
  const [selectedPlayerTeamColor, setSelectedPlayerTeamColor] = useState(null);
  const [statsPopupVisible, setStatsPopupVisible] = useState(false);
  const [currentLine, setCurrentLine] = useState(null);
  const [showAllMilestone, setShowAllMilestone] = useState(false);
  const [showAllOU, setShowAllOU] = useState(false);
  const scrollViewRef = useRef(null);

  // Map prop type to stat key
  const getStatKey = (propType) => {
    switch (propType) {
      case "Points":
        return "PTS";
      case "Rebounds":
        return "REB";
      case "Assists":
        return "AST";
      case "Blocks":
        return "BLK";
      case "Turnovers":
        return "TO";
      case "PRA":
        return "PRA";
      default:
        return "PTS";
    }
  };

  // Get players from roster data for both teams
  const players = useMemo(() => {
    if (!rostersData?.teams || !gameData) return [];

    const team1Abbr = gameData.team1Abbr;
    const team2Abbr = gameData.team2Abbr;

    // Find both teams in roster data
    const team1Data = rostersData.teams.find(
      (t) => t.abbreviation === team1Abbr
    );
    const team2Data = rostersData.teams.find(
      (t) => t.abbreviation === team2Abbr
    );

    const allPlayers = [];
    const statKey = getStatKey(selectedPropType);

    // Add team 1 players
    if (team1Data?.athletes) {
      team1Data.athletes.forEach((athlete) => {
        if (athlete.averages && athlete.averages[statKey]) {
          allPlayers.push({
            ...athlete,
            team: team1Data.displayName,
            teamAbbr: team1Data.abbreviation,
            statValue: parseFloat(athlete.averages[statKey]) || 0,
          });
        }
      });
    }

    // Add team 2 players
    if (team2Data?.athletes) {
      team2Data.athletes.forEach((athlete) => {
        if (athlete.averages && athlete.averages[statKey]) {
          allPlayers.push({
            ...athlete,
            team: team2Data.displayName,
            teamAbbr: team2Data.abbreviation,
            statValue: parseFloat(athlete.averages[statKey]) || 0,
          });
        }
      });
    }

    // Sort by stat value descending
    return allPlayers.sort((a, b) => b.statValue - a.statValue);
  }, [rostersData, gameData, selectedPropType]);

  const openPlayerStats = (player, line, playerTeamColor) => {
    setSelectedPlayerForStats(player);
    setCurrentLine(line);
    setSelectedPlayerTeamColor(playerTeamColor);
    setStatsPopupVisible(true);
  };

  // Render milestone section (10+, 15+, 20+, etc)
  const renderMilestoneSection = () => {
    const statKey = getStatKey(selectedPropType);
    const displayPlayers = showAllMilestone ? players : players.slice(0, 5);

    if (displayPlayers.length === 0) {
      return (
        <View style={styles.propSection}>
          <Text style={[styles.propSectionTitle, { color: theme.text }]}>
            Milestones
          </Text>
          <Text
            style={[styles.placeholderText, { color: theme.textSecondary }]}
          >
            No player data available
          </Text>
        </View>
      );
    }

    // Get smart colors for both teams using gameData (same as header)
    const { team1Color, team2Color } = getSmartTeamColors(
      {
        team1Color: gameData.team1Color,
        team1AlternateColor: gameData.team1AlternateColor,
      },
      {
        team2Color: gameData.team2Color,
        team2AlternateColor: gameData.team2AlternateColor,
      },
      colors
    );

    return (
      <View style={styles.propSection}>
        <Text style={[styles.propSectionTitle, { color: theme.text }]}>
          Milestones
        </Text>

        {displayPlayers.map((player) => {
          // Recalculate statKey to ensure it's current
          const currentStatKey = getStatKey(selectedPropType);
          const milestones = player.odds?.milestones?.[currentStatKey];
          if (!milestones) return null;

          // Parse milestones string (e.g., "5+:-900, 10+:-400, 15+:122")
          const milestoneOptions = milestones
            .split(", ")
            .map((m) => {
              const [label, odds] = m.split(":");
              return { label, odds };
            })
            .filter((m) => m.label && m.odds);

          if (milestoneOptions.length === 0) return null;

          // Get smart color for player based on their team
          const playerTeamColor =
            player.teamAbbr === gameData.team1Abbr ? team1Color : team2Color;

          return (
            <View key={player.id} style={styles.propRow}>
              <View style={styles.propPlayerInfo}>
                <View
                  style={[
                    styles.propPlayerIcon,
                    { backgroundColor: playerTeamColor },
                  ]}
                >
                  <Image
                    source={{
                      uri: `https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/${player.id}.png&w=200`,
                    }}
                    style={styles.propPlayerIconImage}
                  />
                </View>
                <View style={styles.propPlayerDetails}>
                  <Text style={[styles.propPlayerName, { color: theme.text }]}>
                    {player.shortName}
                  </Text>
                  <Text
                    style={[
                      styles.propPlayerPPG,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {player.position?.abbreviation} • {player.teamAbbr} •{" "}
                    {player.statValue.toFixed(1)} AVG
                  </Text>
                </View>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.propOddsScroll}
                contentContainerStyle={styles.propMilestoneContent}
              >
                {milestoneOptions.map((milestone, idx) => {
                  const betId = `${player.id}-${selectedPropType}-${milestone.label}`;
                  const isSelected = isBetSelected(betId);

                  // Format odds with + if positive and no sign
                  const formattedOdds = milestone.odds.match(/^[+-]/)
                    ? milestone.odds
                    : `+${milestone.odds}`;

                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.milestoneButton,
                        {
                          backgroundColor: isSelected
                            ? colors.primary
                            : theme.surface,
                          borderColor: colors.primary,
                        },
                      ]}
                      onPress={() => {
                        if (isSelected) {
                          removeBet(betId);
                        } else {
                          toggleBet({
                            id: betId,
                            gameId: gameId,
                            gameInfo: {
                              time: gameData.statusDetail || "TBD",
                              teams: `${gameData.team1Abbr} @ ${gameData.team2Abbr}`,
                            },
                            playerId: player.id,
                            player: player.shortName,
                            team: player.teamAbbr,
                            prop: `${selectedPropType} ${milestone.label}`,
                            statType: selectedPropType.toLowerCase(),
                            betValue: milestone.label, // e.g., "10+", "20+"
                            type: "milestone",
                            line: milestone.label,
                            odds: formattedOdds,
                            description: `${player.shortName} ${selectedPropType} ${milestone.label}`,
                          });
                        }
                      }}
                    >
                      <Text
                        style={[
                          styles.milestoneValue,
                          { color: isSelected ? "white" : theme.text },
                        ]}
                      >
                        {milestone.label}
                      </Text>
                      <Text
                        style={[
                          styles.milestoneOdds,
                          { color: isSelected ? "white" : colors.primary },
                        ]}
                      >
                        {formattedOdds}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          );
        })}

        {players.length > 5 && (
          <TouchableOpacity
            style={styles.viewMoreButton}
            onPress={() => setShowAllMilestone(!showAllMilestone)}
          >
            <Text style={[styles.viewMoreText, { color: theme.text }]}>
              {showAllMilestone
                ? "View Less"
                : `View More (${players.length - 5} more)`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Render Over/Under section
  const renderOUSection = () => {
    const statKey = getStatKey(selectedPropType);
    const displayPlayers = showAllOU ? players : players.slice(0, 5);

    if (displayPlayers.length === 0) {
      return null;
    }

    // Get smart colors for both teams using gameData (same as header)
    const { team1Color, team2Color } = getSmartTeamColors(
      {
        team1Color: gameData.team1Color,
        team1AlternateColor: gameData.team1AlternateColor,
      },
      {
        team2Color: gameData.team2Color,
        team2AlternateColor: gameData.team2AlternateColor,
      },
      colors
    );

    return (
      <View style={styles.propSection}>
        <Text style={[styles.propSectionTitle, { color: theme.text }]}>
          Over/Under
        </Text>

        {displayPlayers.map((player) => {
          // Recalculate statKey to ensure it's current
          const currentStatKey = getStatKey(selectedPropType);
          const ouData = player.odds?.overUnder?.[currentStatKey];
          if (!ouData || ouData.line === undefined) return null;

          const line = ouData.line;
          const overOdds = ouData.over;
          const underOdds = ouData.under;
          const overBetId = `${player.id}-${selectedPropType}-${line}-over`;
          const underBetId = `${player.id}-${selectedPropType}-${line}-under`;

          // Format odds with + if positive (odds are numbers like -100, 150, 233, etc.)
          const formattedOverOdds =
            overOdds > 0 ? `+${overOdds}` : String(overOdds);
          const formattedUnderOdds =
            underOdds > 0 ? `+${underOdds}` : String(underOdds);

          // Get smart color for player based on their team
          const playerTeamColor =
            player.teamAbbr === gameData.team1Abbr ? team1Color : team2Color;

          return (
            <View key={player.id} style={styles.propRow}>
              <TouchableOpacity
                style={styles.propPlayerInfo}
                onPress={() => openPlayerStats(player, line, playerTeamColor)}
              >
                <View
                  style={[
                    styles.propPlayerIcon,
                    { backgroundColor: playerTeamColor },
                  ]}
                >
                  <Image
                    source={{
                      uri: `https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/${player.id}.png&w=200`,
                    }}
                    style={styles.propPlayerIconImage}
                  />
                </View>
                <View style={styles.propPlayerDetails}>
                  <Text style={[styles.propPlayerName, { color: theme.text }]}>
                    {player.shortName}
                  </Text>
                  <Text
                    style={[
                      styles.propPlayerPPG,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {player.position?.abbreviation} • {player.teamAbbr} •{" "}
                    {player.statValue.toFixed(1)} AVG
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.ouButtonsContainer}>
                <TouchableOpacity
                  style={[
                    styles.ouButton,
                    {
                      backgroundColor: isBetSelected(overBetId)
                        ? colors.primary
                        : theme.surface,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => {
                    if (isBetSelected(overBetId)) {
                      removeBet(overBetId);
                    } else {
                      toggleBet({
                        id: overBetId,
                        gameId: gameId,
                        gameInfo: {
                          time: gameData.statusDetail || "TBD",
                          teams: `${gameData.team1Abbr} @ ${gameData.team2Abbr}`,
                        },
                        playerId: player.id,
                        player: player.shortName,
                        team: player.teamAbbr,
                        prop: `${selectedPropType} O${line}`,
                        statType: selectedPropType.toLowerCase(),
                        betValue: `o${line}`,
                        type: "over",
                        line: line.toString(),
                        odds: formattedOverOdds,
                        description: `${player.shortName} ${selectedPropType} O${line}`,
                      });
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.ouLabel,
                      {
                        color: isBetSelected(overBetId)
                          ? "white"
                          : theme.textSecondary,
                      },
                    ]}
                  >
                    OVER
                  </Text>
                  <Text
                    style={[
                      styles.ouLine,
                      {
                        color: isBetSelected(overBetId) ? "white" : theme.text,
                      },
                    ]}
                  >
                    {line}
                  </Text>
                  <Text
                    style={[
                      styles.ouOdds,
                      {
                        color: isBetSelected(overBetId)
                          ? "white"
                          : colors.primary,
                      },
                    ]}
                  >
                    {formattedOverOdds}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.ouButton,
                    {
                      backgroundColor: isBetSelected(underBetId)
                        ? colors.primary
                        : theme.surface,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => {
                    if (isBetSelected(underBetId)) {
                      removeBet(underBetId);
                    } else {
                      toggleBet({
                        id: underBetId,
                        gameId: gameId,
                        gameInfo: {
                          time: gameData.statusDetail || "TBD",
                          teams: `${gameData.team1Abbr} @ ${gameData.team2Abbr}`,
                        },
                        playerId: player.id,
                        player: player.shortName,
                        team: player.teamAbbr,
                        prop: `${selectedPropType} U${line}`,
                        statType: selectedPropType.toLowerCase(),
                        betValue: `u${line}`,
                        type: "under",
                        line: line.toString(),
                        odds: formattedUnderOdds,
                        description: `${player.shortName} ${selectedPropType} U${line}`,
                      });
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.ouLabel,
                      {
                        color: isBetSelected(underBetId)
                          ? "white"
                          : theme.textSecondary,
                      },
                    ]}
                  >
                    UNDER
                  </Text>
                  <Text
                    style={[
                      styles.ouLine,
                      {
                        color: isBetSelected(underBetId) ? "white" : theme.text,
                      },
                    ]}
                  >
                    {line}
                  </Text>
                  <Text
                    style={[
                      styles.ouOdds,
                      {
                        color: isBetSelected(underBetId)
                          ? "white"
                          : colors.primary,
                      },
                    ]}
                  >
                    {formattedUnderOdds}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {players.length > 5 && (
          <TouchableOpacity
            style={styles.viewMoreButton}
            onPress={() => setShowAllOU(!showAllOU)}
          >
            <Text style={[styles.viewMoreText, { color: theme.text }]}>
              {showAllOU
                ? "View Less"
                : `View More (${players.length - 5} more)`}
            </Text>
          </TouchableOpacity>
        )}
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
                backgroundColor:
                  selectedPropType === type ? colors.primary : theme.surface,
                borderColor: colors.primary,
              },
            ]}
            onPress={() => {
              setSelectedPropType(type);
              setShowAllMilestone(false);
              setShowAllOU(false);
            }}
          >
            <Text
              style={[
                styles.propTypeText,
                { color: selectedPropType === type ? "white" : theme.text },
              ]}
            >
              {type}
            </Text>
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
        gameData={gameData}
        playerTeamColor={selectedPlayerTeamColor}
      />
    </View>
  );
};

// Alternate Spread Section Component with Magnetic Slider
const AlternateSpreadSection = ({ gameData, theme, colors }) => {
  const [selectedSpreadIndex, setSelectedSpreadIndex] = useState(4); // Middle option (2.5)
  const scrollViewRef = useRef(null);

  const spreadOptions = [
    -6.5, -5.5, -4.5, -3.5, -2.5, -1.5, 1.5, 2.5, 3.5, 4.5, 5.5,
  ];
  const ITEM_WIDTH = 60;

  const handleScroll = (event) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / ITEM_WIDTH);
    setSelectedSpreadIndex(
      Math.max(0, Math.min(index, spreadOptions.length - 1))
    );
  };

  const selectedSpread = spreadOptions[selectedSpreadIndex];
  const team1Spread = selectedSpread > 0 ? -selectedSpread : selectedSpread;
  const team2Spread = selectedSpread > 0 ? selectedSpread : -selectedSpread;
  const team1Odds =
    selectedSpread === 2.5 ? "2.01" : selectedSpread < 2.5 ? "1.75" : "2.25";
  const team2Odds =
    selectedSpread === 2.5 ? "1.80" : selectedSpread < 2.5 ? "2.10" : "1.65";

  return (
    <View style={styles.gameLineSection}>
      <View style={styles.alternateHeader}>
        <Text style={[styles.gameLineSectionTitle, { color: theme.text }]}>
          Alternate Spread
        </Text>
      </View>

      <View style={styles.alternateSpreadContainer}>
        <View
          style={[
            styles.alternateSpreadCard,
            { backgroundColor: theme.surfaceSecondary },
          ]}
        >
          <Text style={[styles.alternateSpreadTeam, { color: theme.text }]}>
            HOU Rockets
          </Text>
          <Text style={[styles.alternateSpreadLine, { color: theme.text }]}>
            {team1Spread > 0 ? "+" : ""}
            {team1Spread}
          </Text>
          <Text style={[styles.alternateSpreadOdds, { color: colors.primary }]}>
            {team1Odds}
          </Text>
        </View>

        <View
          style={[
            styles.alternateSpreadCard,
            { backgroundColor: theme.surfaceSecondary },
          ]}
        >
          <Text style={[styles.alternateSpreadTeam, { color: theme.text }]}>
            DEN Nuggets
          </Text>
          <Text style={[styles.alternateSpreadLine, { color: theme.text }]}>
            {team2Spread > 0 ? "+" : ""}
            {team2Spread}
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
              scrollViewRef.current?.scrollTo({
                x: index * ITEM_WIDTH,
                animated: true,
              });
            }}
          >
            <Text
              style={[
                styles.sliderValue,
                {
                  color:
                    index === selectedSpreadIndex
                      ? theme.text
                      : theme.textSecondary,
                  fontWeight: index === selectedSpreadIndex ? "bold" : "normal",
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
        <Text style={[styles.viewMoreText, { color: theme.text }]}>
          View More
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const BetGameDetailScreen = ({ navigation, route }) => {
  const { colors, theme, isDarkMode } = useTheme();
  const { toggleBet, isBetSelected } = useBetSlip();
  const { scoreboardData } = useBetData();
  const { game } = route.params || {};
  const [selectedTab, setSelectedTab] = useState("stats");
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [boxScoreRowHeights, setBoxScoreRowHeights] = useState({});
  const [courtScale, setCourtScale] = useState(1.67);
  const [courtContainerHeight, setCourtContainerHeight] = useState(200);
  const [courtContainerWidth, setCourtContainerWidth] = useState(300);

  // Live tracker state
  const [liveTrackerVisible, setLiveTrackerVisible] = useState(false);
  const [liveTrackerUuid, setLiveTrackerUuid] = useState(null);

  // Refs for synchronized scrolling in box score
  const boxScoreScrollRefs = useRef({});
  const isBoxScoreScrolling = useRef(false);

  const tabFontSize = getTabFontSize();

  // Game presence tracking
  const { viewerData, isJoined } = useGamePresence(game?.id);

  // Live tracker resolver effect
  useEffect(() => {
    let cancelled = false;
    const resolveTracker = async () => {
      // Prefer explicit id passed via route params
      const provided = route?.params?.liveTrackerMatchId;
      if (provided) {
        setLiveTrackerUuid(provided);
        return;
      }

      // Prefer a diary URL passed from the scoreboard; fallback to basketball diary
      const diaryUrl =
        route?.params?.liveTrackerDiaryUrl ||
        LiveTrackerService.buildDiaryUrl("basketball");

      // Derive team names from summaryData
      const competition =
        summaryData?.header?.competitions?.[0] ||
        summaryData?.competitions?.[0] ||
        null;

      const homeName =
        competition?.competitors?.find((c) => c.homeAway === "home")?.team
          ?.displayName || "";
      const awayName =
        competition?.competitors?.find((c) => c.homeAway === "away")?.team
          ?.displayName || "";

      if (!diaryUrl || !homeName || !awayName) return;

      try {
        await LiveTrackerService.initDiary(diaryUrl);
        const id = await LiveTrackerService.findMatchIdByTeams(
          homeName,
          awayName,
          "basketball"
        );
        if (!cancelled && id) setLiveTrackerUuid(id);
      } catch (e) {
        // ignore
      }
    };

    resolveTracker();
    return () => {
      cancelled = true;
    };
  }, [
    summaryData,
    route?.params?.liveTrackerMatchId,
    route?.params?.liveTrackerDiaryUrl,
  ]);

  // Fetch game summary data (initial load)
  useEffect(() => {
    const fetchGameSummary = async () => {
      if (!game?.id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(
          `https://laraiyeogithubio-production-f5af.up.railway.app/api/summary/${game.id}`
        );
        const data = await response.json();
        setSummaryData(data);
      } catch (error) {
        console.error("Error fetching game summary:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchGameSummary();
  }, [game?.id]);

  // Auto-refresh game details every 2 seconds for live updates (with 5-min pre/post window)
  useEffect(() => {
    if (!game?.id || !summaryData) return;

    const competition = summaryData?.header?.competitions?.[0];
    const statusType = competition?.status?.type || {};
    const gameState = statusType?.state;
    const now = new Date();

    // Get game date/time
    const gameDate = summaryData?.header?.date
      ? new Date(summaryData.header.date)
      : null;

    // Helper to get time difference in minutes
    const getTimeDifferenceInMinutes = (date1, date2) => {
      return Math.abs(date2 - date1) / (1000 * 60);
    };

    // Determine if we should poll
    let shouldPoll = false;

    if (gameState === "in") {
      // Always poll during live games
      shouldPoll = true;
    } else if (gameState === "pre" && gameDate) {
      // Poll if within 5 minutes before game start
      const minutesUntilStart = getTimeDifferenceInMinutes(now, gameDate);
      if (minutesUntilStart <= 5 && now < gameDate) {
        shouldPoll = true;
      }
    } else if (gameState === "post" && gameDate) {
      // Poll for 5 minutes after game ends
      // Estimate end time (game started + 2.5 hours average NBA game)
      const estimatedEndTime = new Date(
        gameDate.getTime() + 2.5 * 60 * 60 * 1000
      );
      const minutesSinceEnd = getTimeDifferenceInMinutes(estimatedEndTime, now);
      if (minutesSinceEnd <= 5 && now >= estimatedEndTime) {
        shouldPoll = true;
      }
    }

    if (!shouldPoll) {
      console.log(
        "[BetGameDetail] Outside polling window, not auto-refreshing"
      );
      return;
    }

    console.log("[BetGameDetail] Starting auto-refresh (2s interval)");
    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(
          `https://laraiyeogithubio-production-f5af.up.railway.app/api/summary/${game.id}`
        );
        const data = await response.json();
        setSummaryData(data);

        // Check if we should stop polling
        const newCompetition = data?.header?.competitions?.[0];
        const newStatusType = newCompetition?.status?.type || {};
        const newGameState = newStatusType?.state;
        const newNow = new Date();
        const newGameDate = data?.header?.date
          ? new Date(data.header.date)
          : null;

        let shouldContinue = false;
        if (newGameState === "in") {
          shouldContinue = true;
        } else if (newGameState === "pre" && newGameDate) {
          const minutesUntilStart = getTimeDifferenceInMinutes(
            newNow,
            newGameDate
          );
          shouldContinue = minutesUntilStart <= 5 && newNow < newGameDate;
        } else if (newGameState === "post" && newGameDate) {
          const estimatedEndTime = new Date(
            newGameDate.getTime() + 2.5 * 60 * 60 * 1000
          );
          const minutesSinceEnd = getTimeDifferenceInMinutes(
            estimatedEndTime,
            newNow
          );
          shouldContinue = minutesSinceEnd <= 5 && newNow >= estimatedEndTime;
        }

        if (!shouldContinue) {
          console.log(
            "[BetGameDetail] Exiting polling window, stopping auto-refresh"
          );
          clearInterval(intervalId);
        }
      } catch (error) {
        console.error("[BetGameDetail] Failed to refresh game data:", error);
        // Keep current data on refresh errors
      }
    }, 2000);

    return () => clearInterval(intervalId);
  }, [game?.id, summaryData]);

  // Debug logging: Log play coordinates every 2 seconds
  useEffect(() => {
    const logInterval = setInterval(() => {
      if (
        summaryData?.plays?.coordinate &&
        summaryData?.header?.competitions?.[0]
      ) {
        const play = summaryData.plays;
        const { x: espnX, y: espnY } = play.coordinate;
        const period = play.period?.number || 1;
        const playTeam = play.team;

        // Get team abbreviations from summary data
        const competition = summaryData.header.competitions[0];
        const competitors = competition.competitors;
        const homeTeam = competitors.find((c) => c.homeAway === "home");
        const isHomeTeam = playTeam === homeTeam?.team?.abbreviation;

        // Determine which side teams are on based on period
        let isHomeOnRight = true;
        if (period === 3 || period === 4) {
          isHomeOnRight = false;
        }

        const isTeamOnRight =
          (isHomeTeam && isHomeOnRight) || (!isHomeTeam && !isHomeOnRight);
        const teamSide = isTeamOnRight ? "home" : "away";

        // Calculate our coordinate system (same as BasketballCourt component)
        let leftPercent, bottomPercent;
        if (teamSide === "home") {
          // Home shoots on right side (50% to 100%)
          leftPercent = 50 + espnX * 1.25; // 0->50%, 40->100%
          bottomPercent = (52 - espnY) * 2;
        } else {
          // Away shoots on left side (0% to 50%)
          leftPercent = 50 - espnX * 1.25; // 0->50%, 40->0%
          bottomPercent = espnY * 2 - 6;
        }
      }
    }, 2000);

    return () => clearInterval(logInterval);
  }, [summaryData]);

  // Parse game data from summary
  const gameData = useMemo(() => {
    if (!summaryData?.header?.competitions?.[0]) {
      return (
        game || {
          id: "game1",
          team1: "Houston Rockets",
          team2: "Denver Nuggets",
          score1: 77,
          score2: 104,
          status: "live",
          time: "Q2 • 6:32",
          period: "Q2",
          sport: "NBA",
        }
      );
    }

    const competition = summaryData.header.competitions[0];
    const competitors = competition.competitors;
    const awayTeam = competitors.find((c) => c.homeAway === "away");
    const homeTeam = competitors.find((c) => c.homeAway === "home");
    const status = competition.status;

    const darkSuffix = isDarkMode ? "-dark" : "";
    const team1Abbr = awayTeam.team.abbreviation.toLowerCase();
    const team2Abbr = homeTeam.team.abbreviation.toLowerCase();

    return {
      id: summaryData.header.id,
      team1: awayTeam.team.displayName,
      team1Abbr: awayTeam.team.abbreviation,
      team1Logo: `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500${darkSuffix}/${team1Abbr}.png&h=200&w=200`,
      team1Color: `#${awayTeam.team.color}`,
      team1AlternateColor: awayTeam.team.alternateColor
        ? `#${awayTeam.team.alternateColor}`
        : null,
      team1Record: awayTeam.record,
      score1: awayTeam.score,
      linescores1: awayTeam.linescores,
      team2: homeTeam.team.displayName,
      team2Abbr: homeTeam.team.abbreviation,
      team2Logo: `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500${darkSuffix}/${team2Abbr}.png&h=200&w=200`,
      team2Color: `#${homeTeam.team.color}`,
      team2AlternateColor: homeTeam.team.alternateColor
        ? `#${homeTeam.team.alternateColor}`
        : null,
      team2Record: homeTeam.record,
      score2: homeTeam.score,
      linescores2: homeTeam.linescores,
      status: status.type.state,
      statusDetail: status.type.shortDetail,
      completed: status.type.completed,
      sport: "NBA",
    };
  }, [summaryData, game, isDarkMode]);

  const venue = useMemo(() => {
    return summaryData?.gameInfo?.venue || getRandomVenue("NBA");
  }, [summaryData]);

  // Parse linescore data from API
  const linescore = useMemo(() => {
    if (!gameData.linescores1 || !gameData.linescores2) {
      return { team1Scores: [], team2Scores: [] };
    }

    const team1Scores = Object.values(gameData.linescores1).map((score) =>
      parseInt(score)
    );
    const team2Scores = Object.values(gameData.linescores2).map((score) =>
      parseInt(score)
    );

    return { team1Scores, team2Scores };
  }, [gameData.linescores1, gameData.linescores2]);

  // Parse box score data from API
  const parseBoxScore = (teamAbbr, isPre = false) => {
    if (!summaryData?.boxscore?.teams) return [];

    const teamData = summaryData.boxscore.teams.find(
      (t) => t.team.abbreviation === teamAbbr
    );

    if (!teamData?.statistics) return [];

    const stats = teamData.statistics;

    if (isPre) {
      // Pre-game: Show all stats except streak
      return [
        {
          label: "Field Goal %",
          value: stats["Field Goal %"] || stats["FG%"] || "-",
        },
        {
          label: "Three Point %",
          value: stats["Three Point %"] || stats["3P%"] || "-",
        },
        { label: "Points Per Game", value: stats["Points Per Game"] || "-" },
        {
          label: "Rebounds Per Game",
          value: stats["Rebounds Per Game"] || "-",
        },
        { label: "Assists Per Game", value: stats["Assists Per Game"] || "-" },
        { label: "Steals Per Game", value: stats["Steals Per Game"] || "-" },
        { label: "Blocks Per Game", value: stats["Blocks Per Game"] || "-" },
        {
          label: "Total Turnovers Per Game",
          value: stats["Total Turnovers Per Game"] || "-",
        },
      ];
    } else {
      // Live/Completed: Show specific in-game stats
      return [
        { label: "Field Goal", value: stats["FG"] || stats["FG"] || "-" },
        { label: "Field Goal %", value: stats["Field Goal %"] || "-" },
        { label: "Three Point", value: stats["3PT"] || stats["3P%"] || "-" },
        { label: "Free Throw", value: stats["FT"] || "-" },
        { label: "Rebounds", value: stats["Rebounds"] || "-" },
        {
          label: "Offensive Rebounds",
          value: stats["Offensive Rebounds"] || "-",
        },
        {
          label: "Defensive Rebounds",
          value: stats["Defensive Rebounds"] || "-",
        },
        { label: "Assists", value: stats["Assists"] || "-" },
        { label: "Steals", value: stats["Steals"] || "-" },
        { label: "Blocks", value: stats["Blocks"] || "-" },
        { label: "Turnovers", value: stats["Turnovers"] || "-" },
        {
          label: "Points Off Turnovers",
          value: stats["Points Conceded Off Turnovers"] || "-",
        },
        {
          label: "Largest Lead",
          value: stats["Largest Lead"] || stats.LL || "-",
        },
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

  const team1BoxScore = useMemo(
    () => parseBoxScore(gameData.team1Abbr, gameData.status === "pre"),
    [summaryData, gameData.team1Abbr, gameData.status]
  );
  const team2BoxScore = useMemo(
    () => parseBoxScore(gameData.team2Abbr, gameData.status === "pre"),
    [summaryData, gameData.team2Abbr, gameData.status]
  );
  const winProbData = useMemo(
    () => summaryData?.winprobability || generateWinProbability(),
    [summaryData]
  );

  // Dynamic tabs based on game state
  const tabs = useMemo(() => {
    const gameState = gameData.status; // 'pre', 'in', 'post'

    if (gameState === "pre") {
      // Pre-game: Game Stats, Player Props, Game Lines
      return [
        {
          id: "stats",
          icon: "stats-chart",
          label: "Game Stats",
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
    } else if (gameState === "in") {
      // In-game: Game Stats, Live Play
      return [
        {
          id: "stats",
          icon: "stats-chart",
          label: "Game Stats",
        },
        {
          id: "quick",
          icon: "flash",
          label: "Live Play",
        },
      ];
    } else {
      // Post-game: Only Game Stats
      return [
        {
          id: "stats",
          icon: "stats-chart",
          label: "Game Stats",
        },
      ];
    }
  }, [gameData.status]);

  // Ensure selected tab is valid for current game state
  useEffect(() => {
    const validTabIds = tabs.map((tab) => tab.id);
    if (!validTabIds.includes(selectedTab)) {
      setSelectedTab("stats"); // Default to stats if current tab is not available
    }
  }, [tabs, selectedTab]);

  const renderTabContent = () => {
    switch (selectedTab) {
      case "stats":
        return (
          <View style={styles.tabContent}>
            {/* Linescore - only show if not scheduled */}
            {gameData.status !== "pre" && (
              <>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Linescore
                </Text>
                <View
                  style={[
                    styles.linescoreTable,
                    { backgroundColor: theme.surfaceSecondary },
                  ]}
                >
                  <View style={styles.linescoreHeader}>
                    <View style={styles.linescoreTeamCell}>
                      <Text
                        style={[
                          styles.linescoreHeaderCell,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Team
                      </Text>
                    </View>
                    {linescore.team1Scores.map((_, i) => (
                      <Text
                        key={i}
                        style={[
                          styles.linescoreHeaderCell,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {gameData.sport === "SOCCER"
                          ? i === 0
                            ? "1H"
                            : "2H"
                          : i + 1}
                      </Text>
                    ))}
                    <Text
                      style={[
                        styles.linescoreHeaderCell,
                        { color: theme.textSecondary },
                      ]}
                    >
                      T
                    </Text>
                  </View>
                  <View style={styles.linescoreRow}>
                    <View style={styles.linescoreTeamCell}>
                      <TeamLogo
                        uri={gameData.team1Logo}
                        style={styles.linescoreTeamLogoImage}
                      />
                      <Text
                        style={[
                          styles.linescoreTeamText,
                          { color: theme.text },
                        ]}
                      >
                        {gameData.team1Abbr}
                      </Text>
                    </View>
                    {linescore.team1Scores.map((score, i) => (
                      <Text
                        key={i}
                        style={[styles.linescoreCell, { color: theme.text }]}
                      >
                        {score}
                      </Text>
                    ))}
                    <Text
                      style={[styles.linescoreTotalCell, { color: theme.text }]}
                    >
                      {gameData.score1}
                    </Text>
                  </View>
                  <View style={styles.linescoreRow}>
                    <View style={styles.linescoreTeamCell}>
                      <TeamLogo
                        uri={gameData.team2Logo}
                        style={styles.linescoreTeamLogoImage}
                      />
                      <Text
                        style={[
                          styles.linescoreTeamText,
                          { color: theme.text },
                        ]}
                      >
                        {gameData.team2Abbr}
                      </Text>
                    </View>
                    {linescore.team2Scores.map((score, i) => (
                      <Text
                        key={i}
                        style={[styles.linescoreCell, { color: theme.text }]}
                      >
                        {score}
                      </Text>
                    ))}
                    <Text
                      style={[styles.linescoreTotalCell, { color: theme.text }]}
                    >
                      {gameData.score2}
                    </Text>
                  </View>
                </View>
              </>
            )}

            {/* Box Score Section - Only show for in progress or completed games */}
            {(gameData.status === "in" || gameData.status === "post") &&
              summaryData?.boxscore?.players && (
                <>
                  {summaryData.boxscore.players.map((teamData, teamIndex) => {
                    const team = teamData.team;
                    const athletes = teamData.statistics?.athletes || [];

                    // Determine if game is live or completed
                    const isLive = gameData.status === "in";

                    // Group players based on game state
                    let primaryGroup, secondaryGroup;
                    let primaryLabel, secondaryLabel;

                    if (isLive) {
                      // Live game: On Court vs Bench
                      primaryGroup = athletes.filter((p) => p.active === true);
                      secondaryGroup = athletes.filter(
                        (p) => p.active === false
                      );
                      primaryLabel = "On Court";
                      secondaryLabel = "Bench";
                    } else {
                      // Completed game: Starters vs Bench (sorted by MIN)
                      primaryGroup = athletes.filter((p) => p.starter === true);
                      secondaryGroup = athletes
                        .filter((p) => p.starter === false)
                        .sort((a, b) => {
                          const minA = parseInt(a.stats?.MIN || "0");
                          const minB = parseInt(b.stats?.MIN || "0");
                          return minB - minA; // Sort descending
                        });
                      primaryLabel = "Starters";
                      secondaryLabel = "Bench";
                    }

                    // Get all stat keys from first player with stats
                    const statKeys =
                      primaryGroup.length > 0 && primaryGroup[0].stats
                        ? Object.keys(primaryGroup[0].stats)
                        : [];

                    // Get team logo based on team abbreviation
                    const teamLogo =
                      team.abbreviation === gameData.team1Abbr
                        ? gameData.team1Logo
                        : gameData.team2Logo;

                    // Combine all players with group labels
                    const allPlayers = [];
                    if (primaryGroup.length > 0) {
                      allPlayers.push({ type: "header", label: primaryLabel });
                      primaryGroup.forEach((player) =>
                        allPlayers.push({ type: "player", data: player })
                      );
                    }
                    if (secondaryGroup.length > 0) {
                      allPlayers.push({
                        type: "header",
                        label: secondaryLabel,
                      });
                      secondaryGroup.forEach((player) =>
                        allPlayers.push({ type: "player", data: player })
                      );
                    }

                    return (
                      <View key={team.id} style={{ marginTop: 24 }}>
                        <View style={styles.boxScoreTitleContainer}>
                          <Image
                            source={{ uri: teamLogo }}
                            style={styles.boxScoreTitleLogo}
                            resizeMode="contain"
                          />
                          <Text
                            style={[styles.sectionTitle, { color: theme.text }]}
                          >
                            {team.displayName} Box Score
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.boxScoreContainer,
                            { backgroundColor: theme.surfaceSecondary },
                          ]}
                        >
                          {/* Two-Column Layout */}
                          <View style={styles.boxScoreTwoColumnLayout}>
                            {/* Left Column: Fixed Player Names */}
                            <View style={styles.boxScoreLeftColumn}>
                              {/* Header */}
                              <View
                                onLayout={(event) => {
                                  const { height } = event.nativeEvent.layout;
                                  setBoxScoreRowHeights((prev) => ({
                                    ...prev,
                                    [`${team.id}-header`]: height,
                                  }));
                                }}
                                style={[
                                  styles.boxScorePlayerCell,
                                  styles.boxScoreHeaderCell,
                                  {
                                    backgroundColor: theme.surfaceSecondary,
                                    borderBottomColor: theme.border,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.boxScoreHeaderText,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  Player
                                </Text>
                              </View>

                              {/* All Players */}
                              {allPlayers.map((item, idx) => {
                                if (item.type === "header") {
                                  const groupKey = `${team.id}-group-${idx}`;
                                  return (
                                    <View
                                      key={`header-${idx}`}
                                      onLayout={(event) => {
                                        const { height } =
                                          event.nativeEvent.layout;
                                        setBoxScoreRowHeights((prev) => ({
                                          ...prev,
                                          [groupKey]: height,
                                        }));
                                      }}
                                      style={[
                                        styles.boxScoreGroupHeader,
                                        { backgroundColor: theme.surface },
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.boxScoreGroupLabel,
                                          { color: theme.text },
                                        ]}
                                      >
                                        {item.label}
                                      </Text>
                                    </View>
                                  );
                                }

                                const player = item.data;
                                if (
                                  !player.athlete ||
                                  !player.stats ||
                                  Object.keys(player.stats).length === 0
                                ) {
                                  return null;
                                }

                                const headshotUrl = `https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/${player.athlete.id}.png&w=200`;
                                const positionAbbr =
                                  player.athlete.position?.abbreviation || "";
                                const jersey = player.athlete.jersey || "";
                                const rowKey = `${team.id}-${player.athlete.id}`;

                                return (
                                  <View
                                    key={player.athlete.id}
                                    onLayout={(event) => {
                                      const { height } =
                                        event.nativeEvent.layout;
                                      setBoxScoreRowHeights((prev) => ({
                                        ...prev,
                                        [rowKey]: height,
                                      }));
                                    }}
                                    style={[
                                      styles.boxScorePlayerCell,
                                      styles.boxScoreDataCell,
                                      {
                                        backgroundColor: theme.surfaceSecondary,
                                        borderBottomColor: theme.border,
                                      },
                                    ]}
                                  >
                                    <Image
                                      source={{ uri: headshotUrl }}
                                      style={styles.boxScorePlayerImage}
                                    />
                                    <View style={styles.boxScorePlayerInfo}>
                                      <Text
                                        style={[
                                          styles.boxScorePlayerName,
                                          { color: theme.text },
                                        ]}
                                      >
                                        {player.athlete.shortName}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.boxScorePlayerDetails,
                                          { color: theme.textSecondary },
                                        ]}
                                      >
                                        {positionAbbr} • #{jersey}
                                      </Text>
                                    </View>
                                  </View>
                                );
                              })}
                            </View>

                            {/* Right Column: Single Scrollable Stats */}
                            <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                              style={styles.boxScoreRightColumn}
                            >
                              <View>
                                {/* Header Row */}
                                <View
                                  style={[
                                    styles.boxScoreStatsRow,
                                    styles.boxScoreHeaderCell,
                                    {
                                      borderBottomColor: theme.border,
                                      height:
                                        boxScoreRowHeights[
                                          `${team.id}-header`
                                        ] || undefined,
                                    },
                                  ]}
                                >
                                  {statKeys.map((statKey) => (
                                    <View
                                      key={statKey}
                                      style={styles.boxScoreStatCell}
                                    >
                                      <Text
                                        style={[
                                          styles.boxScoreHeaderText,
                                          { color: theme.textSecondary },
                                        ]}
                                      >
                                        {statKey}
                                      </Text>
                                    </View>
                                  ))}
                                </View>

                                {/* All Player Stats */}
                                {allPlayers.map((item, idx) => {
                                  if (item.type === "header") {
                                    const groupKey = `${team.id}-group-${idx}`;
                                    const groupHeight =
                                      boxScoreRowHeights[groupKey];
                                    return (
                                      <View
                                        key={`header-${idx}`}
                                        style={[
                                          styles.boxScoreGroupHeader,
                                          {
                                            backgroundColor: theme.surface,
                                            height: groupHeight || undefined,
                                          },
                                        ]}
                                      >
                                        <Text
                                          style={[
                                            styles.boxScoreGroupLabel,
                                            { color: "transparent" },
                                          ]}
                                        >
                                          {item.label}
                                        </Text>
                                      </View>
                                    );
                                  }

                                  const player = item.data;
                                  if (
                                    !player.athlete ||
                                    !player.stats ||
                                    Object.keys(player.stats).length === 0
                                  ) {
                                    return null;
                                  }

                                  const rowKey = `${team.id}-${player.athlete.id}`;
                                  const rowHeight = boxScoreRowHeights[rowKey];

                                  return (
                                    <View
                                      key={player.athlete.id}
                                      style={[
                                        styles.boxScoreStatsRow,
                                        styles.boxScoreDataCell,
                                        {
                                          borderBottomColor: theme.border,
                                          height: rowHeight || undefined,
                                        },
                                      ]}
                                    >
                                      {statKeys.map((statKey) => (
                                        <View
                                          key={statKey}
                                          style={styles.boxScoreStatCell}
                                        >
                                          <Text
                                            style={[
                                              styles.boxScoreStatText,
                                              { color: theme.text },
                                            ]}
                                          >
                                            {player.stats[statKey] || "-"}
                                          </Text>
                                        </View>
                                      ))}
                                    </View>
                                  );
                                })}
                              </View>
                            </ScrollView>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}

            {/* Team Statistics with Bar Fills */}
            <Text
              style={[
                styles.sectionTitle,
                { color: theme.text, marginTop: 24 },
              ]}
            >
              {gameData.status === "pre"
                ? "Season Averages"
                : "Team Statistics"}
            </Text>
            <View
              style={[
                styles.teamStatsContainer,
                {
                  backgroundColor: theme.surfaceSecondary,
                  borderRadius: 12,
                  padding: 12,
                },
              ]}
            >
              <View style={styles.statsHeader}>
                <View style={styles.teamHeaderLeft}>
                  <TeamLogo
                    uri={gameData.team1Logo}
                    style={styles.teamSmallLogo}
                  />
                  <Text
                    style={[styles.teamStatsTeamName, { color: theme.text }]}
                  >
                    {gameData.team1Abbr}
                  </Text>
                </View>
                <View style={styles.teamHeaderRight}>
                  <Text
                    style={[styles.teamStatsTeamName, { color: theme.text }]}
                  >
                    {gameData.team2Abbr}
                  </Text>
                  <TeamLogo
                    uri={gameData.team2Logo}
                    style={[styles.teamSmallLogo, { marginLeft: 8 }]}
                  />
                </View>
              </View>

              {(() => {
                // Get smart team colors
                const { team1Color, team2Color } = getSmartTeamColors(
                  {
                    team1Color: gameData.team1Color,
                    team1AlternateColor: gameData.team1AlternateColor,
                  },
                  {
                    team2Color: gameData.team2Color,
                    team2AlternateColor: gameData.team2AlternateColor,
                  }
                );

                // Create a map of stats for easier comparison
                const statsMap = {};
                team1BoxScore.forEach((stat) => {
                  statsMap[stat.label] = { team1: stat.value };
                });
                team2BoxScore.forEach((stat) => {
                  if (statsMap[stat.label]) {
                    statsMap[stat.label].team2 = stat.value;
                  } else {
                    statsMap[stat.label] = { team2: stat.value };
                  }
                });

                // Render stats rows
                return Object.keys(statsMap).map((label) => {
                  const team1Value = statsMap[label].team1 || "-";
                  const team2Value = statsMap[label].team2 || "-";
                  return renderStatsRow(
                    label,
                    team1Value,
                    team2Value,
                    team1Color,
                    team2Color,
                    theme
                  );
                });
              })()}
            </View>

            {/* Win Probability Chart */}
            {(() => {
              // Check if we have win probability data - should be array of numbers
              if (
                !summaryData?.winprobability ||
                !Array.isArray(summaryData.winprobability)
              )
                return null;
              if (summaryData.winprobability.length === 0) return null;

              const winProbArray = summaryData.winprobability;

              // Get smart team colors
              const { team1Color, team2Color } = getSmartTeamColors(
                {
                  team1Color: gameData.team1Color,
                  team1AlternateColor: gameData.team1AlternateColor,
                },
                {
                  team2Color: gameData.team2Color,
                  team2AlternateColor: gameData.team2AlternateColor,
                }
              );

              // Parse win probability data
              // Format from API: array of numbers (0.0-1.0) representing home team (team2) win percentage
              let graphData = [];

              if (typeof winProbArray[0] === "number") {
                // API format: array of numbers representing home team win percentage
                graphData = winProbArray.map((homeWinPercent, index) => {
                  const homeWinPct = parseFloat(homeWinPercent) * 100 || 0;
                  return {
                    x: index,
                    team2WinPercentage: homeWinPct,
                    team1WinPercentage: 100 - homeWinPct,
                  };
                });
              } else {
                // Should not reach here with proper data format
                return null;
              }

              // Sample data if too many points
              const maxDataPoints = Math.min(graphData.length, 100);
              let sampledData;
              if (graphData.length <= maxDataPoints) {
                sampledData = graphData;
              } else {
                const step = graphData.length / maxDataPoints;
                sampledData = [];
                for (let i = 0; i < maxDataPoints; i++) {
                  const index = Math.floor(i * step);
                  sampledData.push(graphData[index]);
                }
                if (
                  sampledData[sampledData.length - 1] !==
                  graphData[graphData.length - 1]
                ) {
                  sampledData.push(graphData[graphData.length - 1]);
                }
              }

              return (
                <>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: theme.text, marginTop: 24 },
                    ]}
                  >
                    Win Probability
                  </Text>
                  <View
                    style={[
                      styles.winProbabilityContainer,
                      {
                        backgroundColor: theme.surfaceSecondary,
                        borderRadius: 12,
                        padding: 12,
                      },
                    ]}
                  >
                    <View style={styles.winProbabilityLegend}>
                      <View style={styles.legendItem}>
                        <View
                          style={[
                            styles.legendColor,
                            { backgroundColor: team1Color },
                          ]}
                        />
                        <Text
                          style={[styles.legendText, { color: theme.text }]}
                        >
                          {gameData.team1Abbr}
                        </Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View
                          style={[
                            styles.legendColor,
                            { backgroundColor: team2Color },
                          ]}
                        />
                        <Text
                          style={[styles.legendText, { color: theme.text }]}
                        >
                          {gameData.team2Abbr}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.graphContainer}>
                      <View style={styles.yAxisLabels}>
                        <Text
                          style={[
                            styles.yAxisLabel,
                            { color: theme.textSecondary },
                          ]}
                        >
                          100%
                        </Text>
                        <Text
                          style={[
                            styles.yAxisLabel,
                            { color: theme.textSecondary },
                          ]}
                        >
                          75%
                        </Text>
                        <Text
                          style={[
                            styles.yAxisLabel,
                            { color: theme.textSecondary },
                          ]}
                        >
                          50%
                        </Text>
                        <Text
                          style={[
                            styles.yAxisLabel,
                            { color: theme.textSecondary },
                          ]}
                        >
                          25%
                        </Text>
                        <Text
                          style={[
                            styles.yAxisLabel,
                            { color: theme.textSecondary },
                          ]}
                        >
                          0%
                        </Text>
                      </View>

                      <View style={styles.graphArea}>
                        {/* Background grid lines */}
                        <View style={styles.gridLines}>
                          {[0, 25, 50, 75, 100].map((percentage) => (
                            <View
                              key={percentage}
                              style={[
                                styles.gridLine,
                                {
                                  bottom: `${percentage}%`,
                                  borderBottomColor: theme.textSecondary + "20",
                                },
                              ]}
                            />
                          ))}
                        </View>

                        {/* 50% center line */}
                        <View
                          style={[
                            styles.centerLine,
                            { borderBottomColor: theme.textSecondary + "40" },
                          ]}
                        />

                        {/* Win probability lines using SVG */}
                        <View style={styles.svgContainer}>
                          <Svg
                            style={StyleSheet.absoluteFillObject}
                            width="100%"
                            height="100%"
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                          >
                            {sampledData.length > 1 &&
                              sampledData.map((point, index) => {
                                if (index === 0) return null;

                                const prevPoint = sampledData[index - 1];
                                const x1 =
                                  ((index - 1) / (sampledData.length - 1)) *
                                  100;
                                const x2 =
                                  (index / (sampledData.length - 1)) * 100;

                                const team2Y1 =
                                  100 - prevPoint.team2WinPercentage;
                                const team2Y2 = 100 - point.team2WinPercentage;
                                const team1Y1 =
                                  100 - prevPoint.team1WinPercentage;
                                const team1Y2 = 100 - point.team1WinPercentage;

                                return (
                                  <G key={index}>
                                    {team1Y1 < team2Y1 ? (
                                      <>
                                        {/* Team 2 fill (bottom → team2 line) */}
                                        <Path
                                          d={`M${x1},100 L${x1},${team2Y1} L${x2},${team2Y2} L${x2},100 Z`}
                                          fill={team2Color}
                                          fillOpacity="0.3"
                                        />
                                        {/* Team 1 fill (team2 line → team1 line) */}
                                        <Path
                                          d={`M${x1},${team2Y1} L${x1},${team1Y1} L${x2},${team1Y2} L${x2},${team2Y2} Z`}
                                          fill={team1Color}
                                          fillOpacity="0.3"
                                        />
                                      </>
                                    ) : (
                                      <>
                                        {/* Team 1 fill (bottom → team1 line) */}
                                        <Path
                                          d={`M${x1},100 L${x1},${team1Y1} L${x2},${team1Y2} L${x2},100 Z`}
                                          fill={team1Color}
                                          fillOpacity="0.3"
                                        />
                                        {/* Team 2 fill (team1 line → team2 line) */}
                                        <Path
                                          d={`M${x1},${team1Y1} L${x1},${team2Y1} L${x2},${team2Y2} L${x2},${team1Y2} Z`}
                                          fill={team2Color}
                                          fillOpacity="0.3"
                                        />
                                      </>
                                    )}
                                  </G>
                                );
                              })}

                            {/* Draw the actual lines */}
                            {sampledData.length > 1 && (
                              <>
                                {/* Team 2 line */}
                                <Path
                                  d={sampledData.reduce(
                                    (path, point, index) => {
                                      const x =
                                        (index / (sampledData.length - 1)) *
                                        100;
                                      const y = 100 - point.team2WinPercentage;
                                      return (
                                        path +
                                        (index === 0
                                          ? `M${x},${y}`
                                          : ` L${x},${y}`)
                                      );
                                    },
                                    ""
                                  )}
                                  fill="none"
                                  stroke={team2Color}
                                  strokeWidth="0.5"
                                />
                                {/* Team 1 line */}
                                <Path
                                  d={sampledData.reduce(
                                    (path, point, index) => {
                                      const x =
                                        (index / (sampledData.length - 1)) *
                                        100;
                                      const y = 100 - point.team1WinPercentage;
                                      return (
                                        path +
                                        (index === 0
                                          ? `M${x},${y}`
                                          : ` L${x},${y}`)
                                      );
                                    },
                                    ""
                                  )}
                                  fill="none"
                                  stroke={team1Color}
                                  strokeWidth="0.5"
                                />
                              </>
                            )}
                          </Svg>
                        </View>
                      </View>
                    </View>
                  </View>
                </>
              );
            })()}
          </View>
        );
      case "quick":
        return (
          <View style={styles.tabContent}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingRight: 16,
                marginBottom: 8,
              }}
            >
              <Text style={[styles.contentTitle, { color: theme.text }]}>
                Live Play
              </Text>
            </View>

            {/* Basketball Court Visualization */}
            {(() => {
              // Get smart team colors for proper color handling
              const { team1Color, team2Color } = getSmartTeamColors(
                {
                  team1Color: gameData.team1Color,
                  team1AlternateColor: gameData.team1AlternateColor,
                },
                {
                  team2Color: gameData.team2Color,
                  team2AlternateColor: gameData.team2AlternateColor,
                }
              );

              return (
                <View
                  style={[
                    styles.miniCourtContainer,
                    { height: courtContainerHeight },
                  ]}
                  onLayout={(event) => {
                    const { width } = event.nativeEvent.layout;
                    // Court is 200px wide when rotated (original height)
                    // Calculate scale to fit the container width
                    const scale = width / 200;
                    // When rotated, the height becomes 150 * scale
                    const height = 150 * scale;
                    setCourtScale(scale);
                    setCourtContainerHeight(height);
                    setCourtContainerWidth(width);
                  }}
                >
                  <View
                    style={{
                      position: "relative",
                      width: courtContainerWidth,
                      height: courtContainerHeight,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <BasketballCourt
                      coordinate={undefined}
                      isScoring={false}
                      teamSide="home"
                      teamColor="#000000"
                      styles={{
                        ...styles,
                        courtContainer: {
                          ...styles.courtContainer,
                          transform: [
                            { rotate: "90deg" },
                            { scale: courtScale },
                          ],
                        },
                      }}
                    />
                    {/* Home Team Logo in Center */}
                    <Image
                      source={{ uri: gameData.team2Logo }}
                      style={{
                        position: "absolute",
                        width: 50 * courtScale,
                        height: 50 * courtScale,
                        opacity: 0.6,
                        top: "50%",
                        left: "50%",
                        transform: [
                          { translateX: -25 * courtScale },
                          { translateY: -25 * courtScale },
                        ],
                      }}
                      resizeMode="contain"
                    />

                    {/* Overlay with exact court dimensions for positioning circles */}
                    <View
                      style={{
                        position: "absolute",
                        width: 200 * courtScale,
                        height: 150 * courtScale,
                        top: "50%",
                        left: "50%",
                        marginLeft: (-200 * courtScale) / 2,
                        marginTop: (-150 * courtScale) / 2,
                      }}
                    >
                      {/* ESPN Play Coordinate Visualization */}
                      {summaryData?.plays?.coordinate &&
                        (() => {
                          const { x: espnX, y: espnY } =
                            summaryData.plays.coordinate;
                          const period = summaryData.plays.period?.number || 1;
                          const playTeam = summaryData.plays.team;

                          // Determine which side teams are on based on period
                          // Periods 1 & 2: home on right, away on left
                          // Periods 3 & 4: home on left, away on right
                          // Overtime: home on right, away on left
                          let isHomeOnRight = true;
                          if (period === 3 || period === 4) {
                            isHomeOnRight = false;
                          }

                          // Determine if this play's team is home or away
                          const isHomeTeam = playTeam === gameData.team2Abbr;

                          // Determine if this team is shooting at the right basket
                          const isTeamOnRight =
                            (isHomeTeam && isHomeOnRight) ||
                            (!isHomeTeam && !isHomeOnRight);

                          // Check for special positioning cases
                          const pointsAttempted =
                            summaryData.plays.pointsAttempted;
                          let ourYPercent, ourXPercent;

                          // Case 1: Free throw (pointsAttempted = 1)
                          if (pointsAttempted === 1) {
                            // Free throws: positioned at free throw line
                            // Away team in periods 1&2 and home team in periods 3&4: X = 28%
                            // Home team in periods 1&2 and away team in periods 3&4: X = 72%
                            ourXPercent = isTeamOnRight ? 28 : 72;
                            ourYPercent = 50; // Center of court width
                          }
                          // Case 2: No coordinates provided (both 0)
                          else if (espnX === 0 && espnY === 0) {
                            // Position at center
                            ourXPercent = 50;
                            ourYPercent = 50;
                          }
                          // Case 3: Normal field goal with coordinates
                          else {
                            // Convert ESPN coordinates to our coordinate system
                            // ESPN: x (0-50) is court length, y (0-40) is court width
                            // Our horizontal court: x is width (0-40), y is length (0-50)
                            // So ESPN x → our y, ESPN y → our x

                            // For teams on the right: ESPN x=0 is their basket (our y=100%), x=50 is opponent's basket (our y=0%)
                            // For teams on the left: ESPN x=0 is their basket (our y=0%), x=50 is opponent's basket (our y=100%)
                            if (isTeamOnRight) {
                              // Right side: reverse the y-axis
                              ourYPercent = 100 - (espnX / 50) * 100;
                            } else {
                              // Left side: direct mapping
                              ourYPercent = (espnX / 50) * 100;
                            }

                            // X-axis (width) is always direct mapping
                            ourXPercent = (espnY / 40) * 100;
                          }

                          // Convert percentages to actual pixel positions
                          const padding = 4 * courtScale;
                          const courtWidth = 200 * courtScale - padding * 2;
                          const courtHeight = 150 * courtScale - padding * 2;

                          const actualX =
                            padding + (ourXPercent / 100) * courtWidth;
                          const actualY =
                            padding + (ourYPercent / 100) * courtHeight;

                          // Get team color using same pattern as other sections
                          const teamColor =
                            playTeam === gameData.team1Abbr
                              ? team1Color
                              : team2Color;

                          // Determine styling based on scoring vs non-scoring
                          const isScoring = summaryData.plays.scoringPlay;

                          return (
                            <View
                              style={{
                                position: "absolute",
                                width: 7.5 * courtScale,
                                height: 7.5 * courtScale,
                                borderRadius: 3.75 * courtScale,
                                backgroundColor: isScoring
                                  ? teamColor
                                  : "white",
                                borderWidth: 2,
                                borderColor: isScoring ? "white" : teamColor,
                                left: actualX - 3.75 * courtScale,
                                top: actualY - 3.75 * courtScale,
                                zIndex: 50,
                              }}
                            />
                          );
                        })()}
                    </View>
                  </View>
                </View>
              );
            })()}

            {summaryData?.plays &&
              (() => {
                // Get smart team colors for proper color handling
                const { team1Color, team2Color } = getSmartTeamColors(
                  {
                    team1Color: gameData.team1Color,
                    team1AlternateColor: gameData.team1AlternateColor,
                  },
                  {
                    team2Color: gameData.team2Color,
                    team2AlternateColor: gameData.team2AlternateColor,
                  }
                );

                return (
                  <View style={styles.playTextWrapper}>
                    <View
                      style={[
                        styles.playTextContainer,
                        {
                          backgroundColor: theme.surface,
                          borderWidth: 2,
                          borderColor: summaryData.plays.team
                            ? summaryData.plays.team === gameData.team1Abbr
                              ? team1Color
                              : team2Color
                            : theme.border,
                        },
                      ]}
                    >
                      <Text style={[styles.playText, { color: theme.text }]}>
                        {summaryData.plays.text || "Waiting for next play..."}
                      </Text>
                      <View style={styles.playMetaContainer}>
                        <Text
                          style={[
                            styles.playMeta,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {summaryData.plays.period?.displayValue} •{" "}
                          {summaryData.plays.clock}
                        </Text>
                        {summaryData.plays.scoringPlay &&
                          summaryData.plays.shortDescription &&
                          (() => {
                            const bgColor = summaryData.plays.team
                              ? summaryData.plays.team === gameData.team1Abbr
                                ? team1Color
                                : team2Color
                              : colors.primary;
                            const textColor =
                              bgColor?.toLowerCase() === "#ffffff"
                                ? "black"
                                : "white";

                            return (
                              <View
                                style={[
                                  styles.scoringBadge,
                                  {
                                    backgroundColor: bgColor,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.scoringBadgeText,
                                    { color: textColor },
                                  ]}
                                >
                                  {summaryData.plays.shortDescription}
                                </Text>
                              </View>
                            );
                          })()}
                      </View>
                    </View>
                  </View>
                );
              })()}
          </View>
        );
      case "props":
        const propTypes =
          gameData.sport === "NBA"
            ? ["Points", "Rebounds", "Assists", "Blocks", "Turnovers", "PRA"]
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
        const pickcenter = summaryData?.pickcenter;
        const predictor = summaryData?.predictor;
        const lastFiveGames = summaryData?.lastFiveGames || [];

        if (!pickcenter) {
          return (
            <View style={styles.tabContent}>
              <Text style={[styles.contentTitle, { color: theme.text }]}>
                Game Lines
              </Text>
              <Text style={[styles.noDataText, { color: theme.textSecondary }]}>
                No game lines data available
              </Text>
            </View>
          );
        }

        // Format odds for display
        const formatOdds = (odds) => {
          if (!odds) return "-";
          const num = parseFloat(odds);
          return num > 0 ? `+${num}` : String(num);
        };

        // Convert odds to American format
        const decimalToAmerican = (decimal) => {
          if (!decimal) return "-";
          const num = parseFloat(decimal);
          if (num >= 2.0) {
            return `+${Math.round((num - 1) * 100)}`;
          } else {
            return `-${Math.round(100 / (num - 1))}`;
          }
        };

        // Get team data
        const awayTeam = gameData.team1Abbr;
        const homeTeam = gameData.team2Abbr;

        // Get spread data
        const awaySpread = pickcenter.pointSpread?.away;
        const homeSpread = pickcenter.pointSpread?.home;

        // Get total data
        const overData = pickcenter.total?.over?.away;
        const underData = pickcenter.total?.under?.away;

        // Get moneyline data
        const awayML = pickcenter.moneyline?.away;
        const homeML = pickcenter.moneyline?.home;

        // Get predictor percentages
        const homeWinPct = predictor?.homeTeam?.WIN || "50";
        const awayWinPct = String((100 - parseFloat(homeWinPct)).toFixed(1));

        // Format date helper
        const formatGameDate = (dateString) => {
          const date = new Date(dateString);
          const months = [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
          ];
          return `${
            months[date.getMonth()]
          } ${date.getDate()}, ${date.getFullYear()}`;
        };

        // Get last 5 games for each team
        const awayTeamGames =
          lastFiveGames.find((g) => g.team?.abbreviation === awayTeam)
            ?.events || [];
        const homeTeamGames =
          lastFiveGames.find((g) => g.team?.abbreviation === homeTeam)
            ?.events || [];

        return (
          <View style={styles.tabContent}>
            <Text style={[styles.contentTitle, { color: theme.text }]}>
              Game Lines
            </Text>

            {/* Game Section */}
            <View style={styles.gameLineSection}>
              <View
                style={[
                  styles.gameLineTable,
                  { backgroundColor: theme.surfaceSecondary },
                ]}
              >
                {/* Header */}
                <View style={styles.gameLineHeader}>
                  <Text
                    style={[
                      styles.gameLineHeaderCell,
                      { color: theme.textSecondary },
                    ]}
                  ></Text>
                  <Text
                    style={[
                      styles.gameLineHeaderCell,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Spread
                  </Text>
                  <Text
                    style={[
                      styles.gameLineHeaderCell,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Game Total
                  </Text>
                  <Text
                    style={[
                      styles.gameLineHeaderCell,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Moneyline
                  </Text>
                </View>

                {/* Away Team Row */}
                <View style={styles.gameLineRow}>
                  <View style={styles.gameLineTeamCell}>
                    <Text
                      style={[styles.gameLineTeamName, { color: theme.text }]}
                    >
                      {awayTeam}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.gameLineCell,
                      {
                        backgroundColor: isBetSelected(`spread-${awayTeam}`)
                          ? colors.primary
                          : theme.surface,
                      },
                    ]}
                    onPress={() => {
                      const betId = `spread-${awayTeam}`;
                      if (isBetSelected(betId)) {
                        toggleBet(betId);
                      } else {
                        toggleBet({
                          id: betId,
                          gameId: gameData.id,
                          gameInfo: {
                            time: gameData.statusDetail || "TBD",
                            teams: `${awayTeam} @ ${homeTeam}`,
                          },
                          team: awayTeam,
                          type: "Spread",
                          description: awayTeam,
                          line: formatOdds(awaySpread?.line),
                          odds: formatOdds(awaySpread?.odds),
                        });
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.gameLineCellLine,
                        {
                          color: isBetSelected(`spread-${awayTeam}`)
                            ? "white"
                            : theme.text,
                        },
                      ]}
                    >
                      {formatOdds(awaySpread?.line)}
                    </Text>
                    <Text
                      style={[
                        styles.gameLineCellOdds,
                        {
                          color: isBetSelected(`spread-${awayTeam}`)
                            ? "white"
                            : colors.primary,
                        },
                      ]}
                    >
                      {formatOdds(awaySpread?.odds)}
                    </Text>
                  </TouchableOpacity>

                  {(() => {
                    const overBetId = `total-${gameData.id}-over`;
                    return (
                      <TouchableOpacity
                        style={[
                          styles.gameLineCell,
                          {
                            backgroundColor: isBetSelected(overBetId)
                              ? colors.primary
                              : theme.surface,
                          },
                        ]}
                        onPress={() => {
                          const betId = overBetId;
                          if (isBetSelected(betId)) {
                            toggleBet(betId);
                          } else {
                            toggleBet({
                              id: betId,
                              gameId: gameData.id,
                              gameInfo: {
                                time: gameData.statusDetail || "TBD",
                                teams: `${awayTeam} @ ${homeTeam}`,
                              },
                              type: "Total",
                              description: "Over",
                              line: `O ${overData?.line}`,
                              odds: formatOdds(overData?.odds),
                              awayTeam,
                              homeTeam,
                            });
                          }
                        }}
                      >
                        <Text
                          style={[
                            styles.gameLineCellLine,
                            {
                              color: isBetSelected(overBetId)
                                ? "white"
                                : theme.text,
                            },
                          ]}
                        >
                          O {overData?.line}
                        </Text>
                        <Text
                          style={[
                            styles.gameLineCellOdds,
                            {
                              color: isBetSelected(overBetId)
                                ? "white"
                                : colors.primary,
                            },
                          ]}
                        >
                          {formatOdds(overData?.odds)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })()}

                  <TouchableOpacity
                    style={[
                      styles.gameLineMLCell,
                      {
                        backgroundColor: isBetSelected(`ml-${awayTeam}`)
                          ? colors.primary
                          : theme.surface,
                      },
                    ]}
                    onPress={() => {
                      const betId = `ml-${awayTeam}`;
                      if (isBetSelected(betId)) {
                        toggleBet(betId);
                      } else {
                        toggleBet({
                          id: betId,
                          gameId: gameData.id,
                          gameInfo: {
                            time: gameData.statusDetail || "TBD",
                            teams: `${awayTeam} @ ${homeTeam}`,
                          },
                          team: awayTeam,
                          type: "Moneyline",
                          description: awayTeam,
                          line: "",
                          odds: formatOdds(awayML?.odds),
                        });
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.gameLineMLOdds,
                        {
                          color: isBetSelected(`ml-${awayTeam}`)
                            ? "white"
                            : colors.primary,
                        },
                      ]}
                    >
                      {formatOdds(awayML?.odds)}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Home Team Row */}
                <View style={styles.gameLineRow}>
                  <View style={styles.gameLineTeamCell}>
                    <Text
                      style={[styles.gameLineTeamName, { color: theme.text }]}
                    >
                      {homeTeam}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.gameLineCell,
                      {
                        backgroundColor: isBetSelected(`spread-${homeTeam}`)
                          ? colors.primary
                          : theme.surface,
                      },
                    ]}
                    onPress={() => {
                      const betId = `spread-${homeTeam}`;
                      if (isBetSelected(betId)) {
                        toggleBet(betId);
                      } else {
                        toggleBet({
                          id: betId,
                          gameId: gameData.id,
                          gameInfo: {
                            time: gameData.statusDetail || "TBD",
                            teams: `${awayTeam} @ ${homeTeam}`,
                          },
                          team: homeTeam,
                          type: "Spread",
                          description: homeTeam,
                          line: formatOdds(homeSpread?.line),
                          odds: formatOdds(homeSpread?.odds),
                        });
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.gameLineCellLine,
                        {
                          color: isBetSelected(`spread-${homeTeam}`)
                            ? "white"
                            : theme.text,
                        },
                      ]}
                    >
                      {formatOdds(homeSpread?.line)}
                    </Text>
                    <Text
                      style={[
                        styles.gameLineCellOdds,
                        {
                          color: isBetSelected(`spread-${homeTeam}`)
                            ? "white"
                            : colors.primary,
                        },
                      ]}
                    >
                      {formatOdds(homeSpread?.odds)}
                    </Text>
                  </TouchableOpacity>

                  {(() => {
                    const underBetId = `total-${gameData.id}-under`;
                    return (
                      <TouchableOpacity
                        style={[
                          styles.gameLineCell,
                          {
                            backgroundColor: isBetSelected(underBetId)
                              ? colors.primary
                              : theme.surface,
                          },
                        ]}
                        onPress={() => {
                          const betId = underBetId;
                          if (isBetSelected(betId)) {
                            toggleBet(betId);
                          } else {
                            toggleBet({
                              id: betId,
                              gameId: gameData.id,
                              gameInfo: {
                                time: gameData.statusDetail || "TBD",
                                teams: `${awayTeam} @ ${homeTeam}`,
                              },
                              type: "Total",
                              description: "Under",
                              line: `U ${underData?.line}`,
                              odds: formatOdds(underData?.odds),
                              awayTeam,
                              homeTeam,
                            });
                          }
                        }}
                      >
                        <Text
                          style={[
                            styles.gameLineCellLine,
                            {
                              color: isBetSelected(underBetId)
                                ? "white"
                                : theme.text,
                            },
                          ]}
                        >
                          U {underData?.line}
                        </Text>
                        <Text
                          style={[
                            styles.gameLineCellOdds,
                            {
                              color: isBetSelected(underBetId)
                                ? "white"
                                : colors.primary,
                            },
                          ]}
                        >
                          {formatOdds(underData?.odds)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })()}

                  <TouchableOpacity
                    style={[
                      styles.gameLineMLCell,
                      {
                        backgroundColor: isBetSelected(`ml-${homeTeam}`)
                          ? colors.primary
                          : theme.surface,
                      },
                    ]}
                    onPress={() => {
                      const betId = `ml-${homeTeam}`;
                      if (isBetSelected(betId)) {
                        toggleBet(betId);
                      } else {
                        toggleBet({
                          id: betId,
                          gameId: gameData.id,
                          gameInfo: {
                            time: gameData.statusDetail || "TBD",
                            teams: `${awayTeam} @ ${homeTeam}`,
                          },
                          team: homeTeam,
                          type: "Moneyline",
                          description: homeTeam,
                          line: "",
                          odds: formatOdds(homeML?.odds),
                        });
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.gameLineMLOdds,
                        {
                          color: isBetSelected(`ml-${homeTeam}`)
                            ? "white"
                            : colors.primary,
                        },
                      ]}
                    >
                      {formatOdds(homeML?.odds)}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Win Percentage */}
                <View style={styles.bettingPercentage}>
                  <View style={styles.bettingPercentageBar}>
                    <View
                      style={[
                        styles.bettingPercentageFill,
                        {
                          width: `${awayWinPct}%`,
                          backgroundColor: colors.primary,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.bettingPercentageLabels}>
                    <Text
                      style={[
                        styles.bettingPercentageLabel,
                        { color: theme.text },
                      ]}
                    >
                      {awayTeam} {awayWinPct}%
                    </Text>
                    <Text
                      style={[
                        styles.bettingPercentageLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Predicted Win %
                    </Text>
                    <Text
                      style={[
                        styles.bettingPercentageLabel,
                        { color: theme.text },
                      ]}
                    >
                      {homeWinPct}% {homeTeam}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Last 5 Games Section */}
            <View style={styles.lastFiveGamesSection}>
              <Text
                style={[styles.gameLineSectionTitle, { color: theme.text }]}
              >
                Last 5 Games
              </Text>

              <View style={styles.lastFiveGamesContainer}>
                {/* Away Team Games */}
                <View style={styles.lastFiveGamesColumn}>
                  <Text
                    style={[
                      styles.lastFiveGamesTeamTitle,
                      { color: theme.text },
                    ]}
                  >
                    {awayTeam}
                  </Text>
                  {[...awayTeamGames].reverse().map((game, index) => {
                    const isWin = game.result === "W";
                    const borderColor = isWin ? theme.success : theme.error;

                    // Format date
                    const gameDate = new Date(game.date);
                    const months = [
                      "Jan",
                      "Feb",
                      "Mar",
                      "Apr",
                      "May",
                      "Jun",
                      "Jul",
                      "Aug",
                      "Sep",
                      "Oct",
                      "Nov",
                      "Dec",
                    ];
                    const formattedDate = `${
                      months[gameDate.getMonth()]
                    } ${gameDate.getDate()}`;

                    return (
                      <View
                        key={game.id || index}
                        style={[
                          styles.lastFiveGameCard,
                          {
                            backgroundColor: theme.surface,
                            borderLeftWidth: 3,
                            borderLeftColor: borderColor,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.lastFiveGameCardDate,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {formattedDate}
                        </Text>
                        <View style={styles.lastFiveGameCardContent}>
                          <Image
                            source={{
                              uri: `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500${
                                isDarkMode ? "-dark" : ""
                              }/${game.opponentAbbreviation?.toLowerCase()}.png&h=40&w=40`,
                            }}
                            style={styles.lastFiveGameLogo}
                          />
                          <View style={styles.lastFiveGameInfo}>
                            <Text
                              style={[
                                styles.lastFiveGameScore,
                                { color: theme.text },
                              ]}
                            >
                              {game.score}
                            </Text>
                            <Text
                              style={[
                                styles.lastFiveGameOpponent,
                                { color: theme.textSecondary },
                              ]}
                            >
                              {game.atVs} {game.opponentAbbreviation}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>

                {/* Home Team Games */}
                <View style={styles.lastFiveGamesColumn}>
                  <Text
                    style={[
                      styles.lastFiveGamesTeamTitle,
                      { color: theme.text },
                    ]}
                  >
                    {homeTeam}
                  </Text>
                  {[...homeTeamGames].reverse().map((game, index) => {
                    const isWin = game.result === "W";
                    const borderColor = isWin ? theme.success : theme.error;

                    // Format date
                    const gameDate = new Date(game.date);
                    const months = [
                      "Jan",
                      "Feb",
                      "Mar",
                      "Apr",
                      "May",
                      "Jun",
                      "Jul",
                      "Aug",
                      "Sep",
                      "Oct",
                      "Nov",
                      "Dec",
                    ];
                    const formattedDate = `${
                      months[gameDate.getMonth()]
                    } ${gameDate.getDate()}`;

                    return (
                      <View
                        key={game.id || index}
                        style={[
                          styles.lastFiveGameCard,
                          {
                            backgroundColor: theme.surface,
                            borderRightWidth: 3,
                            borderRightColor: borderColor,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.lastFiveGameCardDate,
                            { color: theme.textSecondary, textAlign: "right" },
                          ]}
                        >
                          {formattedDate}
                        </Text>
                        <View
                          style={[
                            styles.lastFiveGameCardContent,
                            { flexDirection: "row-reverse" },
                          ]}
                        >
                          <Image
                            source={{
                              uri: `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500${
                                isDarkMode ? "-dark" : ""
                              }/${game.opponentAbbreviation?.toLowerCase()}.png&h=40&w=40`,
                            }}
                            style={[
                              styles.lastFiveGameLogo,
                              { marginRight: 0, marginLeft: 10 },
                            ]}
                          />
                          <View style={styles.lastFiveGameInfo}>
                            <Text
                              style={[
                                styles.lastFiveGameScore,
                                { color: theme.text, textAlign: "right" },
                              ]}
                            >
                              {game.score}
                            </Text>
                            <Text
                              style={[
                                styles.lastFiveGameOpponent,
                                {
                                  color: theme.textSecondary,
                                  textAlign: "right",
                                },
                              ]}
                            >
                              {game.atVs} {game.opponentAbbreviation}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.background,
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.text }]}>
          Loading game details...
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.background,
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.text }]}>
          Loading game details...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={liveTrackerVisible ? [] : [1]}
        contentContainerStyle={
          liveTrackerVisible
            ? { paddingBottom: 80, marginTop: -6 }
            : { paddingBottom: 80 }
        }
      >
        {/* Live Tracker Embed */}
        {liveTrackerVisible
          ? (() => {
              const deviceWidth = Dimensions.get("window").width;
              const formulaO = 0;
              const homeLogo = gameData?.team2Logo;
              const awayLogo = gameData?.team1Logo;
              const wrapperUrl = `https://laraiye.github.io/live-sports-tracker/livetracker-test.html?uuid=${liveTrackerUuid}${
                homeLogo ? `&home_logo=${awayLogo}` : ""
              }${awayLogo ? `&away_logo=${homeLogo}` : ""}&reverse=1`;
              const ratio = 0.505;
              const initialEmbedHeight =
                Math.round(deviceWidth * ratio) + formulaO;

              return (
                <LiveTrackerEmbed
                  uuid={liveTrackerUuid}
                  visible={true}
                  inline={true}
                  wrapperUrl={wrapperUrl}
                  initialHeight={initialEmbedHeight}
                  formulaO={formulaO}
                  showHeader={false}
                  onClose={() => setLiveTrackerVisible(false)}
                />
              );
            })()
          : null}

        {/* Header with Teams and Scores */}
        {(() => {
          // Get smart team colors for proper color handling
          const { team1Color, team2Color } = getSmartTeamColors(
            {
              team1Color: gameData.team1Color,
              team1AlternateColor: gameData.team1AlternateColor,
            },
            {
              team2Color: gameData.team2Color,
              team2AlternateColor: gameData.team2AlternateColor,
            }
          );

          return (
            <View style={[styles.header, { backgroundColor: theme.surface }]}>
              <View style={styles.headerContent}>
                {/* Venue */}
                <Text
                  style={[styles.venueText, { color: theme.textSecondary }]}
                >
                  {venue}
                </Text>

                <View style={styles.scoresRow}>
                  <View
                    style={[
                      styles.teamSection,
                      {
                        backgroundColor: `${team1Color}15`,
                        borderRadius: 12,
                        padding: 12,
                      },
                    ]}
                  >
                    <TeamLogo
                      uri={gameData.team1Logo}
                      style={styles.teamLogoImage}
                    />
                    <Text style={[styles.teamName, { color: theme.text }]}>
                      {gameData.team1Abbr}
                    </Text>
                    {gameData.team1Record && (
                      <Text
                        style={[
                          styles.teamRecord,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {gameData.team1Record}
                      </Text>
                    )}
                  </View>

                  <View style={styles.scoreSection}>
                    <Text style={[styles.scoreText, { color: theme.text }]}>
                      {gameData.score1 || "-"}
                    </Text>
                    <Text
                      style={[
                        styles.scoreDivider,
                        { color: theme.textSecondary },
                      ]}
                    >
                      -
                    </Text>
                    <Text style={[styles.scoreText, { color: theme.text }]}>
                      {gameData.score2 || "-"}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.teamSection,
                      {
                        backgroundColor: `${team2Color}15`,
                        borderRadius: 12,
                        padding: 12,
                      },
                    ]}
                  >
                    <TeamLogo
                      uri={gameData.team2Logo}
                      style={styles.teamLogoImage}
                    />
                    <Text style={[styles.teamName, { color: theme.text }]}>
                      {gameData.team2Abbr}
                    </Text>
                    {gameData.team2Record && (
                      <Text
                        style={[
                          styles.teamRecord,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {gameData.team2Record}
                      </Text>
                    )}
                  </View>
                </View>

                <View
                  style={[
                    styles.gameStatusBadge,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text style={styles.gameStatusText}>
                    {gameData.statusDetail || "LIVE"}
                  </Text>
                </View>

                <Text style={[styles.gameDate, { color: theme.textSecondary }]}>
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </Text>
              </View>
            </View>
          );
        })()}

        {/* Tracker Button - show if we resolved a liveTracker UUID */}
        {liveTrackerUuid && !liveTrackerVisible && (
          <View style={{ paddingHorizontal: 16, marginVertical: 12 }}>
            <TouchableOpacity
              style={[
                {
                  backgroundColor: colors.secondary,
                  paddingVertical: 14,
                  paddingHorizontal: 20,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                },
              ]}
              onPress={() => {
                setLiveTrackerVisible(true);
              }}
            >
              <Text
                allowFontScaling={false}
                style={{ color: "white", fontSize: 16, fontWeight: "bold" }}
              >
                Tracker
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Sticky Tab Buttons */}
        <View
          style={[styles.tabsContainer, { backgroundColor: theme.surface }]}
        >
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
                      color:
                        selectedTab === tab.id ? "white" : theme.textSecondary,
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
        <View style={styles.contentContainer}>{renderTabContent()}</View>
      </ScrollView>

      {/* Bet Slip Bottom Bar */}
      <BetSlip
        isGameDetail={true}
        scoreboardGames={scoreboardData?.events || []}
      />
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
  teamLogoImage: {
    width: 60,
    height: 60,
    marginBottom: 8,
  },
  teamName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  teamRecord: {
    fontSize: 12,
    marginTop: 4,
  },
  loadingText: {
    fontSize: 16,
    marginTop: 16,
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
  linescoreTeamLogoImage: {
    width: 24,
    height: 24,
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
    marginTop: -40,
  },
  boxScoreTeamLogoImage: {
    width: 28,
    height: 28,
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

  // Horizontally Scrollable Box Score Styles
  boxScoreTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  boxScoreTitleLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  boxScoreContainer: {
    borderRadius: 12,
    overflow: "hidden",
  },
  boxScoreTwoColumnLayout: {
    flexDirection: "row",
  },
  boxScoreLeftColumn: {
    width: 180,
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.1)",
  },
  boxScoreRightColumn: {
    flex: 1,
  },
  boxScoreHeaderCell: {
    borderBottomWidth: 2,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  boxScoreDataCell: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  boxScoreStatsRow: {
    flexDirection: "row",
    minHeight: 56,
  },
  boxScorePlayerCell: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 56,
  },
  boxScorePlayerImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  boxScorePlayerInfo: {
    marginLeft: 10,
    flex: 1,
  },
  boxScorePlayerName: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },
  boxScorePlayerDetails: {
    fontSize: 11,
  },
  boxScoreStatCell: {
    width: 60,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 8,
    minHeight: 56,
  },
  boxScoreStatText: {
    fontSize: 13,
    fontWeight: "500",
  },
  boxScoreHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  boxScoreGroupHeader: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 36,
  },
  boxScoreGroupLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  boxScoreTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  boxScoreTitleLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
    marginTop: -8,
  },

  // Team Statistics Styles
  teamStatsContainer: {
    marginTop: 12,
  },
  statsSectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
  statsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  teamHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  teamHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  teamSmallLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  teamStatsTeamName: {
    fontSize: 14,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  statsValue: {
    fontSize: 14,
    fontWeight: "600",
    width: 50,
  },
  statsValueAway: {
    textAlign: "left",
  },
  statsValueHome: {
    textAlign: "right",
  },
  statsBarContainer: {
    flex: 1,
    marginHorizontal: 12,
  },
  statsBar: {
    height: 24,
    borderRadius: 4,
    flexDirection: "row",
    overflow: "hidden",
    marginBottom: 4,
  },
  statsBarFill: {
    height: "100%",
  },
  statsBarFillAway: {
    alignSelf: "flex-start",
  },
  statsBarFillHome: {
    alignSelf: "flex-end",
  },
  statsLabel: {
    fontSize: 11,
    textAlign: "center",
  },

  // Win Probability Chart Styles
  winProbabilityContainer: {
    marginTop: 12,
  },
  winProbabilityLegend: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 16,
    gap: 24,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendColor: {
    width: 16,
    height: 3,
    marginRight: 6,
    borderRadius: 1.5,
  },
  legendText: {
    fontSize: 12,
    fontWeight: "500",
  },
  graphContainer: {
    flexDirection: "row",
    height: 200,
  },
  yAxisLabels: {
    width: 40,
    justifyContent: "space-between",
    paddingRight: 8,
  },
  yAxisLabel: {
    fontSize: 10,
    textAlign: "right",
  },
  graphArea: {
    flex: 1,
    position: "relative",
  },
  gridLines: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    borderBottomWidth: 1,
  },
  centerLine: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    borderBottomWidth: 2,
  },
  svgContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  // Old chart styles (deprecated, kept for compatibility)
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
    fontWeight: "bold",
    marginBottom: 16,
  },
  propRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  propPlayerInfo: {
    flexDirection: "row",
    alignItems: "center",
    width: 140,
    marginRight: 12,
  },
  propPlayerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    overflow: "hidden",
  },
  propPlayerIconImage: {
    width: 40,
    height: 40,
  },
  propPlayerDetails: {
    flex: 1,
  },
  propPlayerName: {
    fontSize: 13,
    fontWeight: "600",
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
    alignItems: "center",
  },
  milestoneButton: {
    width: 70,
    marginHorizontal: 4,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
  },
  milestoneValue: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  milestoneOdds: {
    fontSize: 13,
    fontWeight: "600",
  },
  ouButtonsContainer: {
    flexDirection: "row",
    gap: 8,
    flex: 1,
  },
  ouButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
  },
  ouLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginBottom: 2,
  },
  ouLine: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 2,
  },
  ouOdds: {
    fontSize: 13,
    fontWeight: "600",
  },
  viewMoreButton: {
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  viewMoreText: {
    fontSize: 15,
    fontWeight: "600",
  },

  // Live Play Styles
  miniCourtContainer: {
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 16,
    overflow: "visible",
  },
  courtContainer: {
    width: 150,
    height: 200,
    position: "relative",
    backgroundColor: "#D2691E",
    borderWidth: 2,
    borderColor: "#8B4513",
    borderRadius: 4,
  },
  courtOutline: {
    position: "absolute",
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    borderWidth: 2,
    borderColor: "white",
    borderRadius: 2,
  },
  courtOutlineCenterLine: {
    position: "absolute",
    top: "50%",
    left: 2,
    right: 2,
    height: 2,
    backgroundColor: "white",
    marginTop: -1,
  },
  freeThrowCircleTop: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
    left: "50%",
    top: 32,
    marginLeft: -15,
  },
  freeThrowCircleBottom: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
    left: "50%",
    bottom: 32,
    marginLeft: -15,
  },
  freeThrowSemicircleTop: {
    position: "absolute",
    width: 40,
    height: 20,
    borderWidth: 2,
    borderColor: "white",
    borderTopWidth: 0,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    left: "50%",
    bottom: 130,
    marginLeft: -20,
    backgroundColor: "transparent",
  },
  freeThrowSemicircleBottom: {
    position: "absolute",
    width: 40,
    height: 20,
    borderWidth: 2,
    borderColor: "white",
    borderBottomWidth: 0,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    left: "50%",
    top: 130,
    marginLeft: -20,
    backgroundColor: "transparent",
  },
  threePointSemicircleTop: {
    position: "absolute",
    width: 120,
    height: 75,
    borderWidth: 2,
    borderColor: "white",
    borderTopWidth: 0,
    borderBottomLeftRadius: 60,
    borderBottomRightRadius: 60,
    left: "50%",
    bottom: 118,
    marginLeft: -60,
    backgroundColor: "transparent",
  },
  threePointSemicircleBottom: {
    position: "absolute",
    width: 120,
    height: 75,
    borderWidth: 2,
    borderColor: "white",
    borderBottomWidth: 0,
    borderTopLeftRadius: 60,
    borderTopRightRadius: 60,
    left: "50%",
    top: 118,
    marginLeft: -60,
    backgroundColor: "transparent",
  },
  centerCircle: {
    position: "absolute",
    width: 30,
    height: 30,
    borderWidth: 2,
    borderColor: "white",
    borderRadius: 15,
    top: "50%",
    left: "50%",
    marginTop: -15,
    marginLeft: -15,
  },
  basketTop: {
    position: "absolute",
    width: 12,
    height: 3,
    backgroundColor: "#FF4500",
    left: "50%",
    top: 10,
    marginLeft: -6,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "#8B0000",
  },
  basketBottom: {
    position: "absolute",
    width: 12,
    height: 3,
    backgroundColor: "#FF4500",
    left: "50%",
    bottom: 10,
    marginLeft: -6,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "#8B0000",
  },
  teamSideIndicator: {
    position: "absolute",
    fontSize: 8,
    fontWeight: "bold",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
    zIndex: 10,
  },
  teamSideHome: {
    top: 2,
    left: 2,
  },
  teamSideAway: {
    bottom: 2,
    right: 2,
  },
  shotMarker: {
    width: 12,
    height: 12,
    borderRadius: 8,
    zIndex: 10,
    borderWidth: 2,
  },
  madeShotMarker: {
    borderColor: "white",
  },
  missedShotMarker: {
    backgroundColor: "white",
  },
  freeThrowLaneTop: {
    position: "absolute",
    width: 40,
    height: 45,
    borderWidth: 2,
    borderColor: "white",
    borderBottomWidth: 0,
    borderRadius: 0,
    top: 2,
    left: "50%",
    marginLeft: -20,
    backgroundColor: "transparent",
  },
  freeThrowLaneBottom: {
    position: "absolute",
    width: 40,
    height: 45,
    borderWidth: 2,
    borderColor: "white",
    borderTopWidth: 0,
    borderRadius: 0,
    bottom: 2,
    left: "50%",
    marginLeft: -20,
    backgroundColor: "transparent",
  },
  freeThrowLineTop: {
    position: "absolute",
    width: 40,
    height: 2,
    backgroundColor: "white",
    top: 47,
    left: "50%",
    marginLeft: -20,
  },
  freeThrowLineBottom: {
    position: "absolute",
    width: 40,
    height: 2,
    backgroundColor: "white",
    bottom: 47,
    left: "50%",
    marginLeft: -20,
  },
  playTextWrapper: {
    marginBottom: 16,
  },
  playTextContainer: {
    padding: 16,
    borderRadius: 12,
  },
  playText: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 8,
    lineHeight: 22,
  },
  playMetaContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playMeta: {
    fontSize: 13,
    fontWeight: "500",
  },
  scoringBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  scoringBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "white",
  },
  draggableButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  draggableButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
  // Last Five Games Styles
  lastFiveGamesSection: {
    marginBottom: 24,
  },
  lastFiveGamesContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  lastFiveGamesColumn: {
    flex: 1,
  },
  lastFiveGamesTeamTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  lastFiveGameCard: {
    flexDirection: "column",
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  lastFiveGameCardDate: {
    fontSize: 10,
    fontWeight: "600",
    marginBottom: 6,
  },
  lastFiveGameCardContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  lastFiveGameLogo: {
    width: 32,
    height: 32,
    marginRight: 10,
  },
  lastFiveGameInfo: {
    flex: 1,
  },
  lastFiveGameScore: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },
  lastFiveGameOpponent: {
    fontSize: 11,
  },
  noDataText: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 20,
  },
  flashPropCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  flashPropHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  flashPropTitle: {
    fontSize: 16,
    fontWeight: "600",
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
  },
  flashPropOptionText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  flashPropOptionOdds: {
    fontSize: 16,
    fontWeight: "bold",
  },
  flashPropRow: {
    flexDirection: "row",
    gap: 12,
  },
  flashPropChoiceButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  flashPropChoiceText: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  flashPropChoiceOdds: {
    fontSize: 18,
    fontWeight: "bold",
  },

  // Game Lines Styles
  gameLineSection: {
    marginBottom: 24,
  },
  gameLineSectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
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
    flexDirection: "row",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  gameLineHeaderCell: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  gameLineRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  gameLineTeamCell: {
    flex: 1,
    justifyContent: "center",
  },
  gameLineTeamName: {
    fontSize: 14,
    fontWeight: "600",
  },
  gameLineCell: {
    flex: 1,
    padding: 10,
    borderRadius: 6,
    alignItems: "center",
    marginHorizontal: 4,
  },
  gameLineMLCell: {
    flex: 1,
    padding: 12,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
  },
  gameLineCellLine: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },
  gameLineCellOdds: {
    fontSize: 14,
    fontWeight: "bold",
  },
  gameLineMLOdds: {
    fontSize: 18,
    fontWeight: "bold",
  },
  bettingPercentage: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  bettingPercentageBar: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 3,
    marginBottom: 8,
    overflow: "hidden",
  },
  bettingPercentageFill: {
    height: "100%",
    borderRadius: 3,
  },
  bettingPercentageLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bettingPercentageLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  alternateHeader: {
    flexDirection: "row",
    alignItems: "center",
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
    fontWeight: "bold",
  },
  alternateSpreadContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  alternateSpreadCard: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  alternateSpreadTeam: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  alternateSpreadLine: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 4,
  },
  alternateSpreadOdds: {
    fontSize: 16,
    fontWeight: "bold",
  },
  alternateSpreadSliderScroll: {
    marginHorizontal: 0,
  },
  alternateSpreadSliderContent: {
    paddingHorizontal: width / 2 - 30,
  },
  spreadOption: {
    width: 60,
    alignItems: "center",
    justifyContent: "center",
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

import React, { useState, useMemo, useRef, useEffect, useContext } from "react";
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
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
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
import OddsDisplayContext from "../../context/OddsDisplayContext";
import { formatOddsForDisplay } from "../../utils/odds";
import { useBetData } from "../../context/BetDataContext";
import BetSlip from "../../components/BetSlip";
import PlayerStatsPopup from "../../components/PlayerStatsPopup";
import { useGamePresence } from "../../hooks/useGamePresence";
import LiveTrackerEmbed from "../../components/LiveTrackerEmbed";
import LiveTrackerService from "../../services/liveTrackerService";
import { BannerAdWrapper, DEV_BANNER_ID } from "../../services/ads";

const { width } = Dimensions.get("window");

// Map sport name to ESPN path
const getSportPath = (sport) => {
  switch ((sport || "").toUpperCase()) {
    case "NBA":
      return "nba";
    case "NFL":
      return "nfl";
    case "NHL":
      return "nhl";
    case "UEFA":
      return "uefa.champions";
    default:
      return "nba";
  }
};

// Debug for play overlay markers: set to an object to render test play markers
// Example: { home: { x:25, y:25 }, away: { x:25, y:25 } }
// Set to null to disable.
const BASKETBALL_PLAY_TEST_COORDS = null;

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
const getSmartTeamColors = (
  team1Data,
  team2Data,
  colors = { primary: "#666", secondary: "#999" }
) => {
  // team1 is away, team2 is home (matching NBA pattern)
  const safeColors = colors || { primary: "#666", secondary: "#999" };
  let team1Color = team1Data?.team1Color || safeColors.primary;
  let team2Color = team2Data?.team2Color || safeColors.secondary || "#666";

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
  // Helper to parse stat values
  const parseStatValue = (value) => {
    if (typeof value === "number") return value;
    if (!value || value === "-") return 0;

    const strValue = String(value).trim();

    if (strValue.includes("W")) {
      const num = parseFloat(strValue.replace(/[^\d.-]/g, ""));
      return Math.abs(num); // wins are positive
    }

    if (strValue.includes("L")) {
      const num = parseFloat(strValue.replace(/[^\d.-]/g, ""));
      return -Math.abs(num); // losses are negative
    }

    if (strValue.includes("-") && /^\d+-\d+$/.test(strValue)) {
      const [numerator, denominator] = strValue.split("-").map(Number);
      if (denominator !== 0) {
        return numerator / denominator;
      }
    }

    return parseFloat(strValue) || 0;
  };

  const team1Num = parseStatValue(team1Value);
  const team2Num = parseStatValue(team2Value);

  let team1Percent;
  let team2Percent;

  // 🔑 CASE 1: Win vs Loss → Win always wins
  if (team1Num > 0 && team2Num < 0) {
    team1Percent = 100;
    team2Percent = 0;
  } else if (team1Num < 0 && team2Num > 0) {
    team1Percent = 0;
    team2Percent = 100;
  }
  // 🔑 CASE 2: Loss vs Loss → smaller loss is better
  else if (team1Num < 0 && team2Num < 0) {
    const inv1 = 1 / Math.abs(team1Num || 1);
    const inv2 = 1 / Math.abs(team2Num || 1);
    const totalInv = inv1 + inv2;

    team1Percent = (inv1 / totalInv) * 100;
    team2Percent = (inv2 / totalInv) * 100;
  }

  // 🔑 CASE 3: Win vs Win or anything else → normal magnitude
  else {
    const total = Math.abs(team1Num) + Math.abs(team2Num);
    team1Percent = total > 0 ? (Math.abs(team1Num) / total) * 100 : 50;
    team2Percent = total > 0 ? (Math.abs(team2Num) / total) * 100 : 50;
  }

  // Colors
  const team1FillColor = team1Color;
  const team2FillColor = team2Color;

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
              { width: `${team1Percent}%`, backgroundColor: team1FillColor },
            ]}
          />
          <View
            style={[
              styles.statsBarFill,
              styles.statsBarFillHome,
              { width: `${team2Percent}%`, backgroundColor: team2FillColor },
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

// Basketball Court Component for NBA
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

// Hockey Rink Component for NHL
const HockeyRink = React.memo(
  ({ coordinate, isScoring, teamSide, teamColor, styles }) => {
    // Percent-based normalizer (matches GameDetails approach for NHL)
    // Returns leftPercent (0..100) and bottomPercent (0..100)
    // Adjusted for NHL rink proportions and ESPN coordinate system
    const normalizeCoordPercent = (x, y) => {
      const clampedX = Math.max(-99, Math.min(99, Number(x)));
      const clampedY = Math.max(-42, Math.min(42, Number(y)));

      // ESPN coordinates: x=-99 (left) to x=99 (right), y=-42 (bottom) to y=42 (top)
      // Map to percentages with a small margin to keep markers away from edges
      const margin = 10; // percent margin on each side
      const leftPercent =
        margin + ((clampedX + 99) / (99 + 99)) * (100 - 2 * margin);
      const bottomPercent =
        margin + ((clampedY + 42) / (42 + 42)) * (100 - 2 * margin);

      return { leftPercent, bottomPercent };
    };

    return (
      <View style={styles.rinkContainer}>
        {/* Rink outline */}
        <View style={styles.rinkOutline} />

        {/* Center line */}
        <View style={styles.centerLine} />

        {/* Center circle */}
        <View style={styles.centerCircleNHL} />
        <View style={styles.centerDot} />

        {/* Left zone */}
        <View style={styles.leftGoalLine} />
        <View style={styles.leftGoalLineBehindCrease} />
        <View style={styles.leftFaceoffCircleTop} />
        <View style={styles.leftFaceoffCircleBottom} />
        <View style={styles.leftFaceoffDotTop} />
        <View style={styles.leftFaceoffDotBottom} />
        <View style={styles.leftGoalCrease} />
        <View style={styles.leftGoalCreaseOutline} />

        {/* Right zone */}
        <View style={styles.rightGoalLine} />
        <View style={styles.rightGoalLineBehindCrease} />
        <View style={styles.rightFaceoffCircleTop} />
        <View style={styles.rightFaceoffCircleBottom} />
        <View style={styles.rightFaceoffDotTop} />
        <View style={styles.rightFaceoffDotBottom} />
        <View style={styles.rightGoalCrease} />
        <View style={styles.rightGoalCreaseOutline} />

        {/* Neutral zone face-off dots */}
        <View style={styles.neutralZoneDotTopLeft} />
        <View style={styles.neutralZoneDotTopRight} />
        <View style={styles.neutralZoneDotBottomLeft} />
        <View style={styles.neutralZoneDotBottomRight} />

        {/* Play marker */}
        {coordinate &&
          typeof coordinate.x === "number" &&
          typeof coordinate.y === "number" &&
          (() => {
            const pct = normalizeCoordPercent(coordinate.x, coordinate.y);
            const finalTeamColor = teamColor?.startsWith("#")
              ? teamColor
              : `#${teamColor || "999"}`;
            // Convert normalized bottomPercent to top for absolute positioning
            const topStyle = `${100 - pct.bottomPercent}%`;
            const leftStyle = `${pct.leftPercent}%`;

            return (
              <View
                style={[
                  styles.playMarker,
                  {
                    position: "absolute",
                    top: topStyle,
                    left: leftStyle,
                    transform: [{ translateX: "0%" }, { translateY: "-7.5%" }],
                    backgroundColor: finalTeamColor,
                    borderColor: isScoring ? finalTeamColor : "white",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 1,
                    shadowRadius: 2,
                    elevation: 5,
                  },
                ]}
              />
            );
          })()}
      </View>
    );
  }
);

// NFL Field Component for NFL
const NFLField = React.memo(
  ({
    coordinate,
    isScoring,
    teamSide,
    teamColor,
    homeColor,
    awayColor,
    homeAbbr,
    awayAbbr,
    homeLogo,
    awayLogo,
    scale = 1,
    drives = null,
    showDrive = false,
    team1Color,
    team2Color,
    team1Id,
    team2Id,
  }) => {
    const renderYardMarkers = () => {
      const markers = [];
      // Yard lines from 10 to 50 and back down
      const yardNumbers = [10, 20, 30, 40, 50, 40, 30, 20, 10];

      for (let i = 0; i < yardNumbers.length; i++) {
        const leftPosition = 10 + i * 10; // Evenly spaced across 90% of field
        // Main yard line
        markers.push(
          <View
            key={`yard-${i}`}
            style={{
              position: "absolute",
              left: `${leftPosition}%`,
              top: 0,
              bottom: 0,
              width: 2 * scale,
              backgroundColor: "white",
              opacity: 0.5,
            }}
          />
        );

        // Two hash marks per yard line - one below top numbers, one above bottom numbers
        markers.push(
          <View
            key={`hash-top-${i}`}
            style={{
              position: "absolute",
              left: `${leftPosition}%`,
              top: 65 * scale,
              width: 6 * scale,
              height: 2 * scale,
              backgroundColor: "white",
              marginLeft: -2 * scale,
            }}
          />
        );
        markers.push(
          <View
            key={`hash-bottom-${i}`}
            style={{
              position: "absolute",
              left: `${leftPosition}%`,
              bottom: 65 * scale,
              width: 6 * scale,
              height: 2 * scale,
              backgroundColor: "white",
              marginLeft: -2 * scale,
            }}
          />
        );

        // Yard number labels
        markers.push(
          <Text
            key={`label-top-${i}`}
            style={{
              position: "absolute",
              left: `${leftPosition}%`,
              top: 10 * scale,
              fontSize: 14 * scale,
              fontWeight: "bold",
              color: "white",
              marginLeft: -8 * scale,
            }}
          >
            {yardNumbers[i]}
          </Text>
        );
        markers.push(
          <Text
            key={`label-bottom-${i}`}
            style={{
              position: "absolute",
              left: `${leftPosition}%`,
              bottom: 10 * scale,
              fontSize: 14 * scale,
              fontWeight: "bold",
              color: "white",
              marginLeft: -8 * scale,
              transform: [{ rotate: "180deg" }],
            }}
          >
            {yardNumbers[i]}
          </Text>
        );
      }
      return markers;
    };

    const renderHashMarks = () => {
      const marks = [];
      // Hash marks on top and bottom
      for (let i = 1; i < 100; i++) {
        marks.push(
          <View
            key={`hash-top-${i}`}
            style={{
              position: "absolute",
              left: `${i}%`,
              top: 0,
              width: 1 * scale,
              height: 5 * scale,
              backgroundColor: "white",
              opacity: 0.4,
            }}
          />
        );
        marks.push(
          <View
            key={`hash-bottom-${i}`}
            style={{
              position: "absolute",
              left: `${i}%`,
              bottom: 0,
              width: 1 * scale,
              height: 5 * scale,
              backgroundColor: "white",
              opacity: 0.4,
            }}
          />
        );
      }
      return marks;
    };

    // Calculate play marker position
    let markerLeft = 50; // Default center
    if (coordinate && coordinate.x !== undefined) {
      // ESPN coordinate x ranges 0-100 representing yard line
      // 0 = left endzone (away), 100 = right endzone (home)
      markerLeft = Math.max(5, Math.min(95, coordinate.x));
    }

    const finalTeamColor = teamColor?.startsWith("#")
      ? teamColor
      : `#${teamColor || "#666"}`;
    const finalHomeColor = homeColor?.startsWith("#")
      ? homeColor
      : `#${homeColor || "#0066CC"}`;
    const finalAwayColor = awayColor?.startsWith("#")
      ? awayColor
      : `#${awayColor || "#CC0000"}`;

    const fieldWidth = 320 * scale;
    const fieldHeight = 240 * scale; // More square-like ratio (3:4)

    return (
      <View
        style={{
          width: "100%",
          alignItems: "center",
          marginTop: 16 * scale,
          marginBottom: 16 * scale,
        }}
      >
        <View
          style={{
            width: fieldWidth,
            height: fieldHeight,
            position: "relative",
            backgroundColor: "#2d5016",
            borderWidth: 3 * scale,
            borderColor: "#1a3009",
            borderRadius: 4 * scale,
          }}
        >
          {/* Left Endzone (Away) */}
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: "10%",
              backgroundColor: finalAwayColor,
              opacity: 0.6,
              justifyContent: "center",
              alignItems: "center",
              flexDirection: "column",
            }}
          >
            <Text
              style={{
                fontSize: 12 * scale,
                fontWeight: "bold",
                color: "white",
                transform: [{ rotate: "-90deg" }],
                marginBottom: 8 * scale,
              }}
            >
              {awayAbbr}
            </Text>
            {awayLogo && (
              <Image
                source={{ uri: awayLogo }}
                style={{
                  width: 20 * scale,
                  height: 20 * scale,
                  transform: [{ rotate: "-90deg" }],
                }}
                resizeMode="contain"
              />
            )}
          </View>

          {/* Right Endzone (Home) */}
          <View
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: "10%",
              backgroundColor: finalHomeColor,
              opacity: 0.6,
              justifyContent: "center",
              alignItems: "center",
              flexDirection: "column",
            }}
          >
            {homeLogo && (
              <Image
                source={{ uri: homeLogo }}
                style={{
                  width: 20 * scale,
                  height: 20 * scale,
                  transform: [{ rotate: "90deg" }],
                  marginBottom: 8 * scale,
                }}
                resizeMode="contain"
              />
            )}
            <Text
              style={{
                fontSize: 12 * scale,
                fontWeight: "bold",
                color: "white",
                transform: [{ rotate: "90deg" }],
              }}
            >
              {homeAbbr}
            </Text>
          </View>

          {/* Field markings */}
          <View
            style={{
              position: "absolute",
              left: "10%",
              right: "10%",
              top: 0,
              bottom: 0,
            }}
          >
            {renderYardMarkers()}
            {renderHashMarks()}

            {/* 50 yard line (center) - thicker */}
            <View
              style={{
                position: "absolute",
                left: "50%",
                top: 0,
                bottom: 0,
                width: 2.5 * scale,
                backgroundColor: "white",
                opacity: 1,
                marginLeft: -0.2 * scale,
              }}
            />

            {/* Drive Visualization - Gradient from Start to End */}
            {showDrive &&
              drives &&
              drives.start &&
              drives.end &&
              drives.start.yardLine != null &&
              drives.end.yardLine != null &&
              (() => {
                // Swap start and end per user request
                const startPos = drives.end.yardLine;
                const endPos = drives.start.yardLine;

                // Handle both directions (start -> end or end -> start)
                const isReversed = startPos > endPos;
                const leftPos = isReversed ? endPos : startPos;
                const rightPos = isReversed ? startPos : endPos;
                const widthPercent = rightPos - leftPos;

                // Determine team color - check drives.team.id first
                const teamId = drives.team?.id || drives.end?.team?.id;
                // If teamId matches home team (team2), use team2Color, otherwise team1Color
                const gradientColor =
                  teamId === team2Id ? team2Color : team1Color;

                return (
                  <Svg
                    style={{
                      position: "absolute",
                      left: `${leftPos}%`,
                      width: `${widthPercent}%`,
                      top: 0,
                      bottom: 0,
                    }}
                  >
                    <Defs>
                      <LinearGradient
                        id="driveGrad"
                        x1={isReversed ? "100%" : "0%"}
                        y1="0%"
                        x2={isReversed ? "0%" : "100%"}
                        y2="0%"
                      >
                        <Stop
                          offset="0%"
                          stopColor={gradientColor}
                          stopOpacity="0.35"
                        />
                        <Stop
                          offset="100%"
                          stopColor={gradientColor}
                          stopOpacity="0.95"
                        />
                      </LinearGradient>
                    </Defs>
                    <Rect width="100%" height="100%" fill="url(#driveGrad)" />
                  </Svg>
                );
              })()}
          </View>

          {/* Home team logo in center */}
          {homeLogo && (
            <Image
              source={{ uri: homeLogo }}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 40 * scale,
                height: 40 * scale,
                marginLeft: -20 * scale,
                marginTop: -20 * scale,
                opacity: 0.3,
              }}
              resizeMode="contain"
            />
          )}

          {/* Play marker */}
          {coordinate && isScoring !== undefined && (
            <View
              style={{
                position: "absolute",
                left: `${markerLeft}%`,
                top: "50%",
                width: 16 * scale,
                height: 16 * scale,
                borderRadius: 8 * scale,
                marginLeft: -8 * scale,
                marginTop: -8 * scale,
                backgroundColor: isScoring ? finalTeamColor : "white",
                borderWidth: 2 * scale,
                borderColor: isScoring ? "white" : finalTeamColor,
              }}
            />
          )}
        </View>
      </View>
    );
  }
);

// Player Props Tab Component - DraftKings Style
const PropTabContent = ({
  gameData,
  theme,
  colors,
  propTypes,
  gameId,
  navigation,
}) => {
  const { toggleBet, isBetSelected, removeBet, isPro } = useBetSlip();
  const { rostersData, getRosters } = useBetData();
  const oddsContext = useContext(OddsDisplayContext);
  const oddsDisplay = oddsContext ? oddsContext.oddsDisplay : "american";
  const [selectedPropType, setSelectedPropType] = useState(
    propTypes && propTypes.length ? propTypes[0] : null
  );

  // Sport for bet objects
  const sportToUse = gameData?.sport || "NBA";

  // Sport path for ESPN asset URLs (ensure defined inside this component)
  const sportPath = getSportPath(gameData?.sport || "NBA");

  // Debug: log incoming gameData sport and id to detect mismatches
  try {
    console.log(
      "[PROP TAB DEBUG] gameId:",
      gameId,
      "gameData.sport:",
      gameData?.sport,
      "gameData.id:",
      gameData?.id || gameData?.gameId
    );
  } catch (e) {
    /* ignore */
  }

  // Helpers: normalize stat id and format a friendly label
  const normalizeStatId = (s) => (s || "").toString().toLowerCase();

  const splitCamel = (str) => {
    return str
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\+/g, " + ")
      .trim();
  };

  const capitalizeWords = (str) =>
    str
      .split(" ")
      .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");

  const formatStatLabel = (statID) => {
    if (!statID) return "";
    let label = statID;

    // Handle composite keys (_ou, _yn suffixes)
    if (statID.endsWith("_ou")) {
      label = statID.slice(0, -3) + " O/U";
    } else if (statID.endsWith("_yn")) {
      label = statID.slice(0, -3) + " Y/N";
    }

    // Replace underscores with spaces (but preserve the structure)
    label = label.replace(/_/g, " ");

    // Handle plus-joined stats specially
    if (label.includes("+")) {
      return label
        .split("+")
        .map((p) => capitalizeWords(splitCamel(p.trim())))
        .join(" + ");
    }

    // NHL-specific: Change "Points" to "Goals"
    const finalLabel = capitalizeWords(splitCamel(label));
    if (
      (gameData?.sport || "").toUpperCase() === "NHL" &&
      finalLabel === "Points"
    ) {
      return "Goals";
    }
    return finalLabel;
  };

  const parsePropKey = (key) => {
    if (!key) return { statID: null, periodID: null, marketType: null };

    let marketType = null;
    let workingKey = key;

    // Extract market type suffix (_ou or _yn)
    if (key.endsWith("_ou")) {
      marketType = "ou";
      workingKey = key.slice(0, -3);
    } else if (key.endsWith("_yn")) {
      marketType = "yn";
      workingKey = key.slice(0, -3);
    }

    // Check for period prefix
    if (workingKey.includes("_")) {
      const parts = workingKey.split("_");
      // Check if first part looks like a period (e.g., 1H, 2H, Q1, etc.)
      const firstPart = parts[0];
      if (
        /^[0-9]?[HQP]$/i.test(firstPart) ||
        /^[0-9]+st|nd|rd|th$/i.test(firstPart)
      ) {
        const periodID = firstPart;
        const statID = parts.slice(1).join("_");
        return { statID, periodID, marketType };
      }
    }

    return { statID: workingKey, periodID: null, marketType };
  };

  const formatPropTypeLabel = (key) => {
    // NHL-specific: points_yn becomes "Anytime Goals"
    if (
      (gameData?.sport || "").toUpperCase() === "NHL" &&
      key === "points_yn"
    ) {
      return "Anytime Goals";
    }

    const { statID, periodID } = parsePropKey(key);
    const base = formatStatLabel(statID);
    if (periodID) {
      return `${periodID.toUpperCase()} ${base}`;
    }
    return base;
  };

  // Build available prop statIDs from roster odds for the two teams playing
  const availableStatIDs = React.useMemo(() => {
    if (propTypes && propTypes.length) return propTypes;
    const set = new Set();
    try {
      // Prefer rosters from context helper for the specific sport
      let rosterPayload = null;
      let rosterSource = null;
      try {
        if (gameData?.sport && getRosters) {
          const gr = getRosters(gameData.sport);
          if (gr) {
            rosterPayload = gr;
            rosterSource = `getRosters(${gameData.sport})`;
          }
        }
      } catch (e) {
        console.warn("[PROP TAB] getRosters threw", e);
      }
      if (!rosterPayload) {
        const keyDirect = `rosters_${gameData?.sport}`;
        const keyLower = `rosters_${(gameData?.sport || "").toLowerCase()}`;
        if (rostersData?.[keyDirect]) {
          rosterPayload = rostersData[keyDirect];
          rosterSource = keyDirect;
        } else if (rostersData?.[keyLower]) {
          rosterPayload = rostersData[keyLower];
          rosterSource = keyLower;
        } else if (rostersData?.teams) {
          rosterPayload = rostersData;
          rosterSource = "rostersData.teams";
        } else if (rostersData) {
          rosterPayload = rostersData;
          rosterSource = "rostersData";
        } else {
          rosterPayload = null;
        }

        // If still no teams, try to find any rosters_* key that contains the sport string
        if (
          (!rosterPayload || !rosterPayload.teams) &&
          rostersData &&
          typeof rostersData === "object"
        ) {
          const found = Object.keys(rostersData).find((k) =>
            k.toLowerCase().includes((gameData?.sport || "").toLowerCase())
          );
          if (found) {
            rosterPayload = rostersData[found];
            rosterSource = found;
          }
        }
      }
      const teams =
        rosterPayload?.teams ||
        (Array.isArray(rosterPayload) ? rosterPayload : []);
      const abbrs = [gameData.team1Abbr, gameData.team2Abbr].filter(Boolean);
      console.log(
        "[PROP TAB LOG] roster source:",
        rosterSource,
        "rostersData keys:",
        rostersData ? Object.keys(rostersData) : null
      );
      console.log(
        "[PROP TAB LOG] rosterPayload keys:",
        rosterPayload ? Object.keys(rosterPayload) : null,
        "teams:",
        teams.length,
        "abbrs:",
        abbrs,
        "sampleTeamAbbrs:",
        teams.map((t) => t.abbreviation).slice(0, 6)
      );
      abbrs.forEach((abbr) => {
        const team = teams.find(
          (t) =>
            t.abbreviation === abbr || t.abbreviation === abbr.toUpperCase()
        );
        if (team?.athletes) {
          team.athletes.forEach((a) => {
            (a.odds || []).forEach((m) => {
              if (m && m.statID) {
                // Determine side type from variants to differentiate markets with same statID
                const sideIDs = (m.variants || [])
                  .map((v) => v.sideID)
                  .filter(Boolean);
                const hasOverUnder = sideIDs.some(
                  (s) => s === "over" || s === "under"
                );
                const hasYesNo = sideIDs.some((s) => s === "yes" || s === "no");

                // Create composite key if multiple market types exist for this statID
                if (hasOverUnder) {
                  set.add(`${m.statID}_ou`);
                }
                if (hasYesNo) {
                  set.add(`${m.statID}_yn`);
                }
                // Fallback: if neither OU nor YN, add plain statID
                if (!hasOverUnder && !hasYesNo) {
                  set.add(m.statID);
                }

                // add period-aware keys for variants that include a periodID
                (m.variants || []).forEach((v) => {
                  if (v && v.periodID) {
                    if (hasOverUnder) {
                      set.add(`${v.periodID}_${m.statID}_ou`);
                    }
                    if (hasYesNo) {
                      set.add(`${v.periodID}_${m.statID}_yn`);
                    }
                    if (!hasOverUnder && !hasYesNo) {
                      set.add(`${v.periodID}_${m.statID}`);
                    }
                  }
                });
              }
            });
          });
        }
      });
    } catch (e) {
      console.warn("[PROP TAB] error computing availableStatIDs", e);
    }
    const arr = Array.from(set);
    if (!arr || arr.length === 0) {
      const sport = (gameData?.sport || "").toUpperCase();
      const defaults =
        sport === "NBA"
          ? ["Points", "Rebounds", "Assists", "Blocks", "Turnovers", "PRA"]
          : sport === "NFL"
          ? ["Passing Yards", "Rushing Yards", "Receptions", "Touchdowns"]
          : ["Goals", "Assists", "Shots on Target", "Saves"];
      console.log(
        "[PROP TAB LOG] no statIDs found, falling back to defaults for",
        sport,
        defaults
      );
      return defaults;
    }
    // Sort alphabetically based on formatted labels (numbers first, then letters)
    arr.sort((a, b) => {
      const aLabel = formatPropTypeLabel(a);
      const bLabel = formatPropTypeLabel(b);
      const aStartsWithNum = /^\d/.test(aLabel);
      const bStartsWithNum = /^\d/.test(bLabel);
      if (aStartsWithNum && !bStartsWithNum) return -1;
      if (!aStartsWithNum && bStartsWithNum) return 1;
      return aLabel.localeCompare(bLabel, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
    console.log("[PROP TAB LOG] availableStatIDs:", arr);
    return arr;
  }, [rostersData, gameData, propTypes]);

  useEffect(() => {
    if (!selectedPropType && availableStatIDs.length > 0) {
      setSelectedPropType(availableStatIDs[0]);
    }
  }, [availableStatIDs, selectedPropType]);
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

  // Get players from roster data for both teams (include all athletes)
  const players = useMemo(() => {
    if (!gameData) return [];

    const team1Abbr = gameData.team1Abbr;
    const team2Abbr = gameData.team2Abbr;

    let rosterPayload = null;
    let rosterSource = null;
    try {
      if (gameData?.sport && getRosters) {
        const gr = getRosters(gameData.sport);
        if (gr) {
          rosterPayload = gr;
          rosterSource = `getRosters(${gameData.sport})`;
        }
      }
    } catch (e) {
      /* ignore */
    }
    if (!rosterPayload) {
      const keyDirect = `rosters_${gameData?.sport}`;
      const keyLower = `rosters_${(gameData?.sport || "").toLowerCase()}`;
      if (rostersData?.[keyDirect]) {
        rosterPayload = rostersData[keyDirect];
        rosterSource = keyDirect;
      } else if (rostersData?.[keyLower]) {
        rosterPayload = rostersData[keyLower];
        rosterSource = keyLower;
      } else if (rostersData?.teams) {
        rosterPayload = rostersData;
        rosterSource = "rostersData.teams";
      } else if (rostersData) {
        rosterPayload = rostersData;
        rosterSource = "rostersData";
      } else {
        rosterPayload = null;
      }
      if (
        (!rosterPayload || !rosterPayload.teams) &&
        rostersData &&
        typeof rostersData === "object"
      ) {
        const found = Object.keys(rostersData).find((k) =>
          k.toLowerCase().includes((gameData?.sport || "").toLowerCase())
        );
        if (found) {
          rosterPayload = rostersData[found];
          rosterSource = found;
        }
      }
    }
    console.log(
      "[PROP TAB LOG.players] roster source:",
      rosterSource,
      "rostersData keys:",
      rostersData ? Object.keys(rostersData) : null
    );
    const teams =
      rosterPayload?.teams ||
      (Array.isArray(rosterPayload) ? rosterPayload : []);

    // Find both teams in roster data
    const team1Data = teams.find(
      (t) =>
        t.abbreviation === team1Abbr ||
        t.abbreviation === team1Abbr?.toUpperCase()
    );
    const team2Data = teams.find(
      (t) =>
        t.abbreviation === team2Abbr ||
        t.abbreviation === team2Abbr?.toUpperCase()
    );

    const allPlayers = [];
    const statKey = getStatKey(selectedPropType);

    // Helper to push athletes
    const pushAthletes = (teamData) => {
      if (!teamData?.athletes) return;
      teamData.athletes.forEach((athlete) => {
        allPlayers.push({
          ...athlete,
          team: teamData.displayName,
          teamAbbr: teamData.abbreviation,
          statValue: parseFloat(athlete.averages?.[statKey]) || 0,
        });
      });
    };

    pushAthletes(team1Data);
    pushAthletes(team2Data);

    // Sort by stat value descending (players with no averages will be at bottom)
    return allPlayers.sort((a, b) => b.statValue - a.statValue);
  }, [rostersData, gameData, selectedPropType]);

  const navigateToAthleteScreen = (player) => {
    if (!isPro) {
      Alert.alert(
        "Pro Required",
        "Player details are available for Pro members. Purchase Pro in Settings to unlock."
      );
      return;
    }
    if (!navigation) {
      console.warn("[PropTabContent] navigation prop not available");
      return;
    }
    navigation.navigate("BetAthlete", {
      athleteId: player.id,
      sport: gameData?.sport || "NBA",
    });
  };

  // Render milestone section (10+, 15+, 20+, etc)
  const renderMilestoneSection = () => {
    const statKey = getStatKey(selectedPropType);
    const displayPlayers = showAllMilestone ? players : players.slice(0, 5);
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

    // Build list of players that actually have milestone options (from full players list)
    const matchingPlayers = [];
    (players || []).forEach((player) => {
      const { statID, periodID, marketType } = parsePropKey(selectedPropType);

      // Find candidate markets with matching statID
      const candidateMarkets = (player.odds || []).filter(
        (m) => normalizeStatId(m.statID) === normalizeStatId(statID)
      );
      if (!candidateMarkets || candidateMarkets.length === 0) return;

      // Filter by marketType if specified
      let filteredMarkets = candidateMarkets;
      if (marketType) {
        filteredMarkets = candidateMarkets.filter((m) => {
          const sideIDs = (m.variants || [])
            .map((v) => v.sideID)
            .filter(Boolean);
          if (marketType === "ou") {
            return sideIDs.some((s) => s === "over" || s === "under");
          } else if (marketType === "yn") {
            return sideIDs.some((s) => s === "yes" || s === "no");
          }
          return true;
        });
      }

      // Require market matching the periodID when period is selected.
      // For full-game, require a market that has a variant without periodID.
      let market = null;
      if (periodID) {
        market = filteredMarkets.find((m) =>
          (m.variants || []).some((v) => v.periodID === periodID)
        );
      } else {
        market = filteredMarkets.find((m) =>
          (m.variants || []).some((v) => !v.periodID)
        );
      }
      if (!market) return;

      // Collect altLines only from variants that match the selected period (or lack thereof)
      let altLines = [];
      (market.variants || []).forEach((v) => {
        if (periodID) {
          if (v.periodID !== periodID) return;
        } else {
          // for full-game, prefer variants without periodID
          if (v.periodID) return;
        }
        const dk = v.byBookmaker?.draftkings;
        if (dk?.altLines && Array.isArray(dk.altLines))
          altLines = altLines.concat(dk.altLines);
      });
      if (!altLines || altLines.length === 0) return;

      const milestoneOptions = altLines
        .map((a) => {
          const raw = a.overUnder || a.label || a.line || "";
          // extract number if present
          const m = String(raw).match(/-?\d*\.?\d+/);
          let formattedLabel = String(raw);
          if (m) {
            const num = parseFloat(m[0]);
            if (!isNaN(num)) {
              formattedLabel = `${Math.ceil(num)}+`;
            }
          }
          const odds = a.odds || a.price || a.payout || null;
          return { rawLabel: raw, label: formattedLabel, odds };
        })
        .filter((o) => o.label && o.odds);

      if (milestoneOptions.length > 0) {
        matchingPlayers.push({ player, milestoneOptions });
      }
    });

    if (matchingPlayers.length === 0) return null;

    // Show preview slice from matchingPlayers so both teams are represented
    const displayMatching = showAllMilestone
      ? matchingPlayers
      : matchingPlayers.slice(0, 4);

    return (
      <View style={styles.propSection}>
        <Text style={[styles.propSectionTitle, { color: theme.text }]}>
          Milestones
        </Text>

        {displayMatching.map(({ player, milestoneOptions }) => {
          const playerTeamColor =
            player.teamAbbr === gameData.team1Abbr ? team1Color : team2Color;
          const rawPlayerColor =
            player.teamAbbr === gameData.team1Abbr
              ? gameData.team1Color
              : gameData.team2Color;
          const displayName =
            player.shortName || player.name || player.fullName || player.name;

          return (
            <View key={player.id} style={styles.propRow}>
              <TouchableOpacity
                style={styles.propPlayerInfo}
                onPress={() => navigateToAthleteScreen(player)}
              >
                <View
                  style={[
                    styles.propPlayerIcon,
                    { backgroundColor: playerTeamColor },
                  ]}
                >
                  <Image
                    source={{
                      uri: `https://a.espncdn.com/combiner/i?img=/i/headshots/${sportPath}/players/full/${player.id}.png&w=200`,
                    }}
                    style={styles.propPlayerIconImage}
                  />
                </View>
                <View style={styles.propPlayerDetails}>
                  <Text style={[styles.propPlayerName, { color: theme.text }]}>
                    {displayName}
                  </Text>
                  <Text
                    style={[
                      styles.propPlayerPPG,
                      { color: theme.textSecondary },
                    ]}
                  >
                    #{player.jersey || ""} • {player.teamAbbr}
                  </Text>
                </View>
              </TouchableOpacity>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.propOddsScroll}
                contentContainerStyle={styles.propMilestoneContent}
              >
                {milestoneOptions.map((milestone, idx) => {
                  const betId = `${player.id}-${selectedPropType}-${milestone.label}`;
                  const isSelected = isBetSelected(betId);
                  const formattedOdds =
                    milestone.odds && String(milestone.odds).match(/^[+-]/)
                      ? String(milestone.odds)
                      : milestone.odds
                      ? `+${milestone.odds}`
                      : null;
                  const displayOdds = formattedOdds
                    ? formatOddsForDisplay(formattedOdds, oddsDisplay)
                    : "";

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
                        if (isSelected) removeBet(betId);
                        else
                          toggleBet({
                            id: betId,
                            gameId: gameId,
                            sport: sportToUse,
                            gameInfo: {
                              time: gameData.statusDetail || "TBD",
                              teams: `${gameData.team1Abbr} @ ${gameData.team2Abbr}`,
                            },
                            playerId: player.id,
                            player: displayName,
                            team: player.teamAbbr,
                            prop: `${selectedPropType} ${milestone.label}`,
                            statType: selectedPropType.toLowerCase(),
                            betValue: milestone.label,
                            type: "milestone",
                            line: milestone.label,
                            odds: formattedOdds,
                            playerColor: rawPlayerColor,
                            description: `${displayName} ${selectedPropType} ${milestone.label}`,
                          });
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
                        {displayOdds}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          );
        })}

        {matchingPlayers.length > 5 && (
          <TouchableOpacity
            style={styles.viewMoreButton}
            onPress={() => setShowAllMilestone(!showAllMilestone)}
          >
            <Text style={[styles.viewMoreText, { color: theme.text }]}>
              {showAllMilestone ? "View Less" : `View More`}
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

    // Parse the selected prop to get marketType
    const { marketType } = parsePropKey(selectedPropType);

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
          {marketType === "yn" ? "Yes/No" : "Over/Under"}
        </Text>

        {displayPlayers.map((player) => {
          const { statID, periodID, marketType } =
            parsePropKey(selectedPropType);
          // Prefer a market whose variants match the requested period.
          // For full-game (no periodID) prefer a market that has variants without a period.
          const candidateMarkets = (player.odds || []).filter(
            (m) => normalizeStatId(m.statID) === normalizeStatId(statID)
          );

          // Filter by marketType if specified
          let filteredMarkets = candidateMarkets;
          if (marketType) {
            filteredMarkets = candidateMarkets.filter((m) => {
              const sideIDs = (m.variants || [])
                .map((v) => v.sideID)
                .filter(Boolean);
              if (marketType === "ou") {
                return sideIDs.some((s) => s === "over" || s === "under");
              } else if (marketType === "yn") {
                return sideIDs.some((s) => s === "yes" || s === "no");
              }
              return true;
            });
          }

          // Require period-matching market for period tabs; for full-game require period-less variants.
          let market = null;
          if (periodID) {
            market = filteredMarkets.find((m) =>
              (m.variants || []).some((v) => v.periodID === periodID)
            );
          } else {
            market = filteredMarkets.find((m) =>
              (m.variants || []).some((v) => !v.periodID)
            );
          }
          if (!market) return null;

          // If market is a Yes/No type, render single 'Yes' button (respect periodID)
          const yesVariant = (market.variants || []).find(
            (v) =>
              (v.sideID === "yes" || v.sideID === "no") &&
              (periodID ? v.periodID === periodID : !v.periodID)
          );

          // Get smart color for player based on their team
          const playerTeamColor =
            player.teamAbbr === gameData.team1Abbr ? team1Color : team2Color;
          const rawPlayerColor =
            player.teamAbbr === gameData.team1Abbr
              ? gameData.team1Color
              : gameData.team2Color;
          const displayName =
            player.shortName || player.name || player.fullName || player.name;

          // Render player header (no AVG shown)
          const playerHeader = (
            <TouchableOpacity
              style={styles.propPlayerInfo}
              onPress={() => navigateToAthleteScreen(player)}
            >
              <View
                style={[
                  styles.propPlayerIcon,
                  { backgroundColor: playerTeamColor },
                ]}
              >
                <Image
                  source={{
                    uri: `https://a.espncdn.com/combiner/i?img=/i/headshots/${sportPath}/players/full/${player.id}.png&w=200`,
                  }}
                  style={styles.propPlayerIconImage}
                />
              </View>
              <View style={styles.propPlayerDetails}>
                <Text style={[styles.propPlayerName, { color: theme.text }]}>
                  {displayName}
                </Text>
                <Text
                  style={[styles.propPlayerPPG, { color: theme.textSecondary }]}
                >
                  #{player.jersey || ""} • {player.teamAbbr}
                </Text>
              </View>
            </TouchableOpacity>
          );

          if (yesVariant) {
            const dk = yesVariant.byBookmaker?.draftkings || {};
            const oddsVal = dk.odds || dk.price || null;
            const betId = `${player.id}-${selectedPropType}-yes`;
            const formattedOdds =
              oddsVal && String(oddsVal).match(/^[+-]/)
                ? String(oddsVal)
                : oddsVal
                ? `+${oddsVal}`
                : null;
            const displayOdds = formattedOdds
              ? formatOddsForDisplay(formattedOdds, oddsDisplay)
              : "";

            return (
              <View key={player.id} style={styles.propRow}>
                {playerHeader}
                <View style={styles.ouButtonsContainer}>
                  <TouchableOpacity
                    style={[
                      styles.ouButton,
                      { flex: 2 },
                      {
                        backgroundColor: isBetSelected(betId)
                          ? colors.primary
                          : theme.surface,
                        borderColor: colors.primary,
                      },
                    ]}
                    onPress={() => {
                      if (isBetSelected(betId)) removeBet(betId);
                      else
                        toggleBet({
                          id: betId,
                          gameId: gameId,
                          sport: sportToUse,
                          gameInfo: {
                            time: gameData.statusDetail || "TBD",
                            teams: `${gameData.team1Abbr} @ ${gameData.team2Abbr}`,
                          },
                          playerId: player.id,
                          player: displayName,
                          team: player.teamAbbr,
                          prop: `${selectedPropType} YES`,
                          statType: selectedPropType.toLowerCase(),
                          betValue: "yes",
                          type: "yesno",
                          odds: formattedOdds,
                          playerColor: rawPlayerColor,
                          description: `${displayName} ${selectedPropType} YES`,
                        });
                    }}
                  >
                    <Text
                      style={[
                        styles.ouLabel,
                        {
                          color: isBetSelected(betId)
                            ? "white"
                            : theme.textSecondary,
                        },
                      ]}
                    >
                      YES
                    </Text>
                    <Text
                      style={[
                        styles.ouOdds,
                        {
                          color: isBetSelected(betId)
                            ? "white"
                            : colors.primary,
                        },
                      ]}
                    >
                      {displayOdds}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }

          // Otherwise, treat as over/under
          // Find over/under variants that match the periodID (or lack of one)
          const overVariant = (market.variants || []).find(
            (v) =>
              v.sideID === "over" &&
              (periodID ? v.periodID === periodID : !v.periodID)
          );
          const underVariant = (market.variants || []).find(
            (v) =>
              v.sideID === "under" &&
              (periodID ? v.periodID === periodID : !v.periodID)
          );

          const dkOver = overVariant?.byBookmaker?.draftkings || {};
          const dkUnder = underVariant?.byBookmaker?.draftkings || {};
          const line =
            dkOver.overUnder ||
            dkUnder.overUnder ||
            dkOver.line ||
            dkUnder.line ||
            "";
          const overOdds = dkOver.odds || dkOver.price || null;
          const underOdds = dkUnder.odds || dkUnder.price || null;

          const overExists = !!overVariant;
          const underExists = !!underVariant;

          const overBetId = `${player.id}-${selectedPropType}-${line}-over`;
          const underBetId = `${player.id}-${selectedPropType}-${line}-under`;

          const formattedOverOdds =
            overOdds && String(overOdds).match(/^[+-]/)
              ? String(overOdds)
              : overOdds
              ? `+${overOdds}`
              : null;
          const formattedUnderOdds =
            underOdds && String(underOdds).match(/^[+-]/)
              ? String(underOdds)
              : underOdds
              ? `+${underOdds}`
              : null;
          const displayOverOdds = formattedOverOdds
            ? formatOddsForDisplay(formattedOverOdds, oddsDisplay)
            : "";
          const displayUnderOdds = formattedUnderOdds
            ? formatOddsForDisplay(formattedUnderOdds, oddsDisplay)
            : "";

          return (
            <View key={player.id} style={styles.propRow}>
              {playerHeader}

              <View style={styles.ouButtonsContainer}>
                {overExists && (
                  <TouchableOpacity
                    style={[
                      styles.ouButton,
                      overExists && !underExists ? { flex: 2 } : {},
                      {
                        backgroundColor: isBetSelected(overBetId)
                          ? colors.primary
                          : theme.surface,
                        borderColor: colors.primary,
                      },
                    ]}
                    onPress={() => {
                      if (isBetSelected(overBetId)) removeBet(overBetId);
                      else
                        toggleBet({
                          id: overBetId,
                          gameId: gameId,
                          sport: sportToUse,
                          gameInfo: {
                            time: gameData.statusDetail || "TBD",
                            teams: `${gameData.team1Abbr} @ ${gameData.team2Abbr}`,
                          },
                          playerId: player.id,
                          player: displayName,
                          team: player.teamAbbr,
                          prop: `${selectedPropType} O${line}`,
                          statType: selectedPropType.toLowerCase(),
                          betValue: `o${line}`,
                          type: "over",
                          line: line.toString(),
                          odds: formattedOverOdds,
                          playerColor: rawPlayerColor,
                          description: `${displayName} ${selectedPropType} O${line}`,
                        });
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
                          color: isBetSelected(overBetId)
                            ? "white"
                            : theme.text,
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
                      {displayOverOdds}
                    </Text>
                  </TouchableOpacity>
                )}

                {underExists && (
                  <TouchableOpacity
                    style={[
                      styles.ouButton,
                      underExists && !overExists ? { flex: 2 } : {},
                      {
                        backgroundColor: isBetSelected(underBetId)
                          ? colors.primary
                          : theme.surface,
                        borderColor: colors.primary,
                      },
                    ]}
                    onPress={() => {
                      if (isBetSelected(underBetId)) removeBet(underBetId);
                      else
                        toggleBet({
                          id: underBetId,
                          gameId: gameId,
                          sport: sportToUse,
                          gameInfo: {
                            time: gameData.statusDetail || "TBD",
                            teams: `${gameData.team1Abbr} @ ${gameData.team2Abbr}`,
                          },
                          playerId: player.id,
                          player: displayName,
                          team: player.teamAbbr,
                          prop: `${selectedPropType} U${line}`,
                          statType: selectedPropType.toLowerCase(),
                          betValue: `u${line}`,
                          type: "under",
                          line: line.toString(),
                          odds: formattedUnderOdds,
                          playerColor: rawPlayerColor,
                          description: `${displayName} ${selectedPropType} U${line}`,
                        });
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
                          color: isBetSelected(underBetId)
                            ? "white"
                            : theme.text,
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
                      {displayUnderOdds}
                    </Text>
                  </TouchableOpacity>
                )}
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
              {showAllOU ? "View Less" : "View More"}
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
        {availableStatIDs.map((type) => (
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
              {formatPropTypeLabel(type)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Render both milestone and O/U sections */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {renderMilestoneSection()}
        {renderOUSection()}
      </ScrollView>
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
  const { toggleBet, isBetSelected, isPro, setIsSlipOpen } = useBetSlip();
  const { scoreboardData } = useBetData();
  const oddsContext = useContext(OddsDisplayContext);
  const oddsDisplay = oddsContext ? oddsContext.oddsDisplay : "american";
  const { game, sport: routeSport, eventId } = route.params || {};
  const sportToUse = routeSport || game?.sport || "NBA";
  const sportPath = getSportPath(sportToUse);
  const darkSuffix = isDarkMode ? "-dark" : "";
  const useEventId = eventId || route?.params?.eventId || null;
  const [selectedTab, setSelectedTab] = useState("stats");
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [boxScoreRowHeights, setBoxScoreRowHeights] = useState({});
  const [collapsedBoxScoreSections, setCollapsedBoxScoreSections] = useState(
    {}
  );
  const [boxScoreSortState, setBoxScoreSortState] = useState({}); // { sectionKey: { column: string, direction: 'asc'|'desc'|null } }
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

  // Force close betslip when navigating away to prevent modal overlay blocking interactions
  useFocusEffect(
    React.useCallback(() => {
      // Cleanup function runs when screen loses focus
      return () => {
        if (setIsSlipOpen) {
          setIsSlipOpen(false);
        }
      };
    }, [setIsSlipOpen])
  );

  // Pro-only component: PlayParticipants
  const PlayParticipants = ({ participants = {} }) => {
    if (!isPro) return null;
    if (!participants || Object.keys(participants).length === 0) return null;
    const summary = summaryData || {};

    // flatten participants map to array
    const athletes = [];
    Object.keys(participants).forEach((k) => {
      const map = participants[k] || {};
      Object.keys(map).forEach((aid) =>
        athletes.push({ id: aid, displayName: map[aid] })
      );
    });

    // Build athlete metadata map from summary.boxscore if available
    let athleteMeta = summary?.athletes || {};
    try {
      if (
        (!athleteMeta || Object.keys(athleteMeta).length === 0) &&
        summary?.boxscore?.players
      ) {
        athleteMeta = {};
        summary.boxscore.players.forEach((teamBlock) => {
          const team = teamBlock.team || {};
          const teamAbbrev = team.abbreviation || team.displayName || null;
          const athletesArr =
            (teamBlock.statistics && teamBlock.statistics.athletes) || [];
          athletesArr.forEach((entry) => {
            const aid = String(
              entry.athlete?.id || entry.athlete?.athleteId || ""
            );
            if (!aid) return;
            athleteMeta[aid] = athleteMeta[aid] || {};
            athleteMeta[aid].displayName =
              entry.athlete?.displayName || athleteMeta[aid].displayName;
            athleteMeta[aid].position =
              entry.athlete?.position || athleteMeta[aid].position;
            athleteMeta[aid].jersey =
              entry.athlete?.jersey || athleteMeta[aid].jersey;
            athleteMeta[aid].stats = entry.stats || athleteMeta[aid].stats;
            athleteMeta[
              aid
            ].headshot = `https://a.espncdn.com/combiner/i?img=/i/headshots/${sportPath}/players/full/${aid}.png&w=200`;
            athleteMeta[aid].team = athleteMeta[aid].team || {
              abbreviation: teamAbbrev,
            };
            athleteMeta[
              aid
            ].teamLogo = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500${
              isDarkMode ? "-dark" : ""
            }/${(teamAbbrev || "").toLowerCase()}.png&h=100&w=100`;
          });
        });
      }
    } catch (e) {
      // ignore build errors and fall back to provided summary.athletes
    }
    const byTeam = {};
    athletes.forEach((a) => {
      const meta = athleteMeta[a.id] || {};
      const teamAbbrev =
        (meta.team && (meta.team.abbreviation || meta.team?.abbrev)) ||
        meta.teamAbbrev ||
        meta.teamName ||
        "UNK";
      if (!byTeam[teamAbbrev]) byTeam[teamAbbrev] = [];
      byTeam[teamAbbrev].push({ ...a, meta });
    });

    // Build team lookup from summary/header so participants use same logos/colors as header
    const competition = summary?.header?.competitions?.[0] || null;
    const competitors = competition?.competitors || [];
    const awayTeamBlock =
      competitors.find((c) => c.homeAway === "away")?.team || {};
    const homeTeamBlock =
      competitors.find((c) => c.homeAway === "home")?.team || {};

    const darkSuffix = isDarkMode ? "-dark" : "";
    const awayAbbr = (awayTeamBlock.abbreviation || "").toLowerCase();
    const homeAbbr = (homeTeamBlock.abbreviation || "").toLowerCase();

    const headerTeamData = {
      team1Color: awayTeamBlock.color ? `#${awayTeamBlock.color}` : null,
      team1AlternateColor: awayTeamBlock.alternateColor
        ? `#${awayTeamBlock.alternateColor}`
        : null,
    };
    const headerTeam2Data = {
      team2Color: homeTeamBlock.color ? `#${homeTeamBlock.color}` : null,
      team2AlternateColor: homeTeamBlock.alternateColor
        ? `#${homeTeamBlock.alternateColor}`
        : null,
    };

    const { team1Color: resolvedAwayColor, team2Color: resolvedHomeColor } =
      getSmartTeamColors(headerTeamData, headerTeam2Data, colors);

    const teamLookup = {
      [(awayTeamBlock.abbreviation || "").toUpperCase()]: {
        logo: `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500${darkSuffix}/${awayAbbr}.png&h=200&w=200`,
        color: resolvedAwayColor || colors.primary,
      },
      [(homeTeamBlock.abbreviation || "").toUpperCase()]: {
        logo: `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500${darkSuffix}/${homeAbbr}.png&h=200&w=200`,
        color: resolvedHomeColor || colors.primary,
      },
    };

    const participantCount = Object.values(byTeam).reduce(
      (sum, team) => sum + team.length,
      0
    );

    return (
      <View
        style={[styles.participantsSection, { borderTopColor: theme.border }]}
      >
        <Text
          style={[styles.sectionTitle, { color: theme.text }]}
        >{`Play Participant${participantCount !== 1 ? "s" : ""}`}</Text>
        {Object.keys(byTeam).map((team) => (
          <View key={team} style={styles.participantsTeamGroup}>
            {byTeam[team].map((ath, idx) => {
              const m = ath.meta || {};
              const headshot = m.headshot || (m.images && m.images.headshot);
              // Prefer header/teamLookup values for consistent logos/colors, fall back to athlete meta
              const teamColor =
                (teamLookup[team] && teamLookup[team].color) ||
                m.team?.color ||
                m.teamColor ||
                colors.primary;
              const teamLogo =
                (teamLookup[team] && teamLookup[team].logo) ||
                m.team?.logo ||
                m.team?.logoUrl ||
                `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500${
                  isDarkMode ? "-dark" : ""
                }/${(team || "").toLowerCase()}.png&h=100&w=100`;
              const position = m.position || m.pos || "";
              const number = m.jersey || m.number || "";

              const stats = summary?.stats?.[ath.id] || m.stats || {};

              // Sport and position-specific stat order
              let statOrder;
              const sportUpper = (sportToUse || "").toUpperCase();

              if (sportUpper === "NHL" || sportUpper === "HOCKEY") {
                // NHL: Check if goalie (position G)
                if (position.toUpperCase() === "G") {
                  // Goalie stats: GA, SA, SV, SV%, ESSV, TOI
                  statOrder = ["GA", "SA", "SV", "SV%", "ESSV", "TOI"];
                } else {
                  // Skater stats: G, A, S, HT, +/-, TOI
                  statOrder = ["G", "A", "S", "HT", "+/-", "TOI"];
                }
              } else {
                // Default NBA stats: PTS, REB, AST, FG, +/-, MIN
                statOrder = ["PTS", "REB", "AST", "FG", "+/-", "MIN"];
              }

              const statValues = statOrder.map((s) => {
                let value = stats[s] ?? stats[s.toLowerCase()] ?? "-";

                // Format SV% to 2 decimals if present
                if (s === "SV%" && value !== "-" && !isNaN(value)) {
                  value = (parseFloat(value) * 100).toFixed(0) + "%";
                }

                return {
                  key: s,
                  value: value,
                };
              });

              return (
                <View
                  key={ath.id}
                  style={[
                    styles.participantCard,
                    idx !== byTeam[team].length - 1
                      ? styles.participantBorder
                      : null,
                  ]}
                >
                  <View style={styles.participantTop}>
                    <View
                      style={[
                        styles.headshotWrap,
                        { backgroundColor: teamColor },
                      ]}
                    >
                      {headshot ? (
                        <Image
                          source={{ uri: headshot }}
                          style={styles.headshot}
                        />
                      ) : (
                        <View style={styles.headshotPlaceholder} />
                      )}
                      {teamLogo ? (
                        <Image
                          source={{ uri: teamLogo }}
                          style={styles.teamLogoOverlay}
                        />
                      ) : null}
                    </View>
                    <View style={styles.participantInfo}>
                      <Text
                        style={[styles.participantName, { color: theme.text }]}
                      >
                        {ath.displayName || m.displayName || "Unknown"}
                      </Text>
                      <Text
                        style={[
                          styles.participantMeta,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {`${position || ""} ${
                          number ? `• #${number} •` : ""
                        } ${team}`.trim()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.participantStatsRow}>
                    {statValues.map((s) => {
                      const isPlusMinus = s.key === "+/-";
                      const val = s.value == null ? "-" : String(s.value);
                      const color = isPlusMinus
                        ? val > "0"
                          ? theme.success
                          : val.startsWith("-")
                          ? theme.error
                          : theme.text
                        : theme.text;
                      return (
                        <View key={s.key} style={styles.statBubble}>
                          <Text style={[styles.statValue, { color }]}>
                            {val}
                          </Text>
                          <Text
                            style={[
                              styles.statLabel,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {s.key}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

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
      // Determine summary endpoint: prefer sport+eventId if provided (from Home), else fallback to game.id
      const useEventId = eventId || route?.params?.eventId;
      if (!useEventId && !game?.id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const url = useEventId
          ? `https://laraiyeogithubio-production-f5af.up.railway.app/api/summary/${String(
              sportToUse
            ).toLowerCase()}/${useEventId}`
          : `https://laraiyeogithubio-production-f5af.up.railway.app/api/summary/${String(
              sportToUse
            ).toLowerCase()}/${game.id}`;
        const response = await fetch(url);
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
          `https://laraiyeogithubio-production-f5af.up.railway.app/api/summary/${
            useEventId
              ? String(sportToUse).toLowerCase() + "/" + useEventId
              : String(sportToUse).toLowerCase() + "/" + game.id
          }`
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
          sport: sportToUse,
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
      team1Id: awayTeam.team.id,
      team1Abbr: awayTeam.team.abbreviation,
      team1Logo: `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500${darkSuffix}/${team1Abbr}.png&h=200&w=200`,
      team1Color: `#${awayTeam.team.color}`,
      team1AlternateColor: awayTeam.team.alternateColor
        ? `#${awayTeam.team.alternateColor}`
        : null,
      team1Record:
        (awayTeam.record && awayTeam.record.summary) ||
        (typeof awayTeam.record === "string" ? awayTeam.record : null),
      score1: awayTeam.score,
      linescores1: awayTeam.linescores,
      team2: homeTeam.team.displayName,
      team2Id: homeTeam.team.id,
      team2Abbr: homeTeam.team.abbreviation,
      team2Logo: `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500${darkSuffix}/${team2Abbr}.png&h=200&w=200`,
      team2Color: `#${homeTeam.team.color}`,
      team2AlternateColor: homeTeam.team.alternateColor
        ? `#${homeTeam.team.alternateColor}`
        : null,
      team2Record:
        (homeTeam.record && homeTeam.record.summary) ||
        (typeof homeTeam.record === "string" ? homeTeam.record : null),
      score2: homeTeam.score,
      linescores2: homeTeam.linescores,
      status: status.type.state,
      statusDetail: status.type.shortDetail,
      completed: status.type.completed,
      sport: sportToUse,
    };
  }, [summaryData, game, isDarkMode, sportToUse]);

  const venue = useMemo(() => {
    return summaryData?.gameInfo?.venue || getRandomVenue(sportToUse);
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

    // Return all statistics from the boxscore
    return Object.keys(stats).map((label) => {
      return {
        label: label,
        value: stats[label] || "-",
      };
    });
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
      return [
        {
          id: "stats",
          icon: "stats-chart",
          label: "Game Stats",
        },
        {
          id: "props",
          icon: "person",
          label: "Players",
        },
        {
          id: "teams",
          icon: "person",
          label: "Teams",
        },
        {
          id: "lines",
          icon: "list",
          label: "Game",
        },
      ];
    } else if (gameState === "in") {
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
                          : gameData.sport === "NHL" && i >= 3
                          ? `OT${i - 2}`
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

                    // Group players based on sport
                    let groups = [];
                    const sportUpper = (gameData.sport || "").toUpperCase();

                    if (sportUpper === "NHL") {
                      // NHL: Split into Skaters and Goalies
                      const skaters = athletes.filter(
                        (p) => p.athlete?.position?.toUpperCase() !== "G"
                      );
                      const goalies = athletes.filter(
                        (p) => p.athlete?.position?.toUpperCase() === "G"
                      );
                      if (skaters.length > 0) {
                        groups.push({
                          label: "Skaters",
                          players: skaters,
                          statCategory: null,
                        });
                      }
                      if (goalies.length > 0) {
                        groups.push({
                          label: "Goalies",
                          players: goalies,
                          statCategory: null,
                        });
                      }
                    } else if (sportUpper === "NFL") {
                      // NFL: Group by nested stat object keys (passing, rushing, receiving, etc.)
                      const statGroups = {};
                      athletes.forEach((p) => {
                        if (!p.stats || typeof p.stats !== "object") return;
                        Object.keys(p.stats).forEach((statKey) => {
                          if (
                            typeof p.stats[statKey] === "object" &&
                            p.stats[statKey] !== null
                          ) {
                            if (!statGroups[statKey]) statGroups[statKey] = [];
                            statGroups[statKey].push(p);
                          }
                        });
                      });
                      // Sort NFL groups in fixed order
                      const nflOrder = [
                        "passing",
                        "receiving",
                        "rushing",
                        "fumbles",
                        "interceptions",
                        "punting",
                        "kicking",
                        "kickReturns",
                        "defensive",
                      ];
                      nflOrder.forEach((key) => {
                        if (statGroups[key]) {
                          const label =
                            key.charAt(0).toUpperCase() + key.slice(1);
                          groups.push({
                            label,
                            players: statGroups[key],
                            statCategory: key,
                          });
                        }
                      });
                      // Add any remaining groups not in the fixed order
                      Object.keys(statGroups).forEach((key) => {
                        if (!nflOrder.includes(key)) {
                          const label =
                            key.charAt(0).toUpperCase() + key.slice(1);
                          groups.push({
                            label,
                            players: statGroups[key],
                            statCategory: key,
                          });
                        }
                      });
                    } else {
                      // NBA/default: On Court vs Bench (live) or Starters vs Bench (post)
                      let primaryGroup, secondaryGroup;
                      let primaryLabel, secondaryLabel;

                      if (isLive) {
                        primaryGroup = athletes.filter(
                          (p) => p.active === true
                        );
                        secondaryGroup = athletes.filter(
                          (p) => p.active !== true
                        );
                        primaryLabel = "On Court";
                        secondaryLabel = "Bench";
                      } else {
                        primaryGroup = athletes.filter(
                          (p) => p.starter === true
                        );
                        secondaryGroup = athletes
                          .filter((p) => p.starter === false || p.starter == null)
                          .sort((a, b) => {
                            const minA = parseInt(a.stats?.MIN || "0");
                            const minB = parseInt(b.stats?.MIN || "0");
                            return minB - minA;
                          });
                        primaryLabel = "Starters";
                        secondaryLabel = "Bench";
                      }

                      if (primaryGroup.length > 0) {
                        groups.push({
                          label: primaryLabel,
                          players: primaryGroup,
                          statCategory: null,
                        });
                      }
                      if (secondaryGroup.length > 0) {
                        groups.push({
                          label: secondaryLabel,
                          players: secondaryGroup,
                          statCategory: null,
                        });
                      }
                    }

                    // Get team logo and colors based on team abbreviation
                    const isTeam1 = team.abbreviation === gameData.team1Abbr;
                    const teamLogo = isTeam1
                      ? gameData.team1Logo
                      : gameData.team2Logo;

                    // Get smart team colors for headshot backgrounds
                    const team1Data = {
                      team1Color: gameData.team1Color,
                      team1AlternateColor: gameData.team1AlternateColor,
                    };
                    const team2Data = {
                      team2Color: gameData.team2Color,
                      team2AlternateColor: gameData.team2AlternateColor,
                    };
                    const {
                      team1Color: smartTeam1Color,
                      team2Color: smartTeam2Color,
                    } = getSmartTeamColors(team1Data, team2Data, colors);
                    const teamSmartColor = isTeam1
                      ? smartTeam1Color
                      : smartTeam2Color;

                    // Render separate boxscore sections for each group
                    return (
                      <View key={team.id} style={{ marginTop: 24 }}>
                        {groups.map((group, groupIndex) => {
                          // Get stat keys for this specific group
                          let statKeys = [];
                          if (group.statCategory) {
                            // NFL: Extract keys from nested stat object
                            const playerWithStats = group.players.find(
                              (p) =>
                                p.stats?.[group.statCategory] &&
                                typeof p.stats[group.statCategory] === "object"
                            );
                            if (playerWithStats) {
                              statKeys = Object.keys(
                                playerWithStats.stats[group.statCategory]
                              );
                            }
                          } else {
                            // NHL/NBA: Extract keys from top-level stats
                            const playerWithStats = group.players.find(
                              (p) => p.stats && Object.keys(p.stats).length > 0
                            );
                            if (playerWithStats) {
                              statKeys = Object.keys(playerWithStats.stats);
                            }
                          }

                          // Initialize collapsed state for this section (only first group open)
                          const sectionKey = `${team.id}-${group.label}-${groupIndex}`;
                          const isCollapsed =
                            collapsedBoxScoreSections[sectionKey] ??
                            groupIndex !== 0;

                          const toggleCollapse = () => {
                            setCollapsedBoxScoreSections((prev) => ({
                              ...prev,
                              [sectionKey]: !isCollapsed,
                            }));
                          };

                          // Helper function to parse stat values
                          const parseStatValue = (value) => {
                            if (value == null || value === "-" || value === "")
                              return -Infinity;
                            const str = String(value);

                            // Check for time format (MM:SS)
                            if (
                              str.includes(":") &&
                              str.split(":").length === 2
                            ) {
                              const [min, sec] = str.split(":").map(Number);
                              return (min || 0) * 60 + (sec || 0);
                            }

                            // Check for fraction formats (num/num or num-num)
                            if (str.includes("/") || str.includes("-")) {
                              const firstNum = str.split(/[\/\-]/)[0];
                              const parsed = parseFloat(firstNum);
                              return isNaN(parsed) ? -Infinity : parsed;
                            }

                            // Regular number
                            const parsed = parseFloat(str);
                            return isNaN(parsed) ? -Infinity : parsed;
                          };

                          // Sort players based on current sort state
                          const sortState = boxScoreSortState[sectionKey];
                          let sortedPlayers = [...group.players];

                          if (sortState?.column && sortState?.direction) {
                            sortedPlayers.sort((a, b) => {
                              const statsA = group.statCategory
                                ? a.stats?.[group.statCategory]
                                : a.stats;
                              const statsB = group.statCategory
                                ? b.stats?.[group.statCategory]
                                : b.stats;

                              const valueA = parseStatValue(
                                statsA?.[sortState.column]
                              );
                              const valueB = parseStatValue(
                                statsB?.[sortState.column]
                              );

                              if (sortState.direction === "desc") {
                                return valueB - valueA;
                              } else {
                                return valueA - valueB;
                              }
                            });
                          }

                          // Handle sort click
                          const handleSortClick = (statKey) => {
                            setBoxScoreSortState((prev) => {
                              const current = prev[sectionKey];

                              // If clicking same column, cycle through: desc -> asc -> null
                              if (current?.column === statKey) {
                                if (current.direction === "desc") {
                                  return {
                                    ...prev,
                                    [sectionKey]: {
                                      column: statKey,
                                      direction: "asc",
                                    },
                                  };
                                } else if (current.direction === "asc") {
                                  return {
                                    ...prev,
                                    [sectionKey]: {
                                      column: null,
                                      direction: null,
                                    },
                                  };
                                }
                              }

                              // New column, start with descending
                              return {
                                ...prev,
                                [sectionKey]: {
                                  column: statKey,
                                  direction: "desc",
                                },
                              };
                            });
                          };

                          return (
                            <View key={sectionKey} style={{ marginBottom: 16 }}>
                              <TouchableOpacity
                                style={styles.boxScoreTitleContainer}
                                onPress={toggleCollapse}
                                activeOpacity={0.7}
                              >
                                <Image
                                  source={{ uri: teamLogo }}
                                  style={styles.boxScoreTitleLogo}
                                  resizeMode="contain"
                                />
                                <Text
                                  style={[
                                    styles.sectionTitle,
                                    { color: theme.text, flex: 1 },
                                  ]}
                                >
                                  {team.displayName} - {group.label}
                                </Text>
                                <Ionicons
                                  name={
                                    isCollapsed ? "chevron-down" : "chevron-up"
                                  }
                                  size={20}
                                  color={theme.textSecondary}
                                  style={{ marginLeft: 8 }}
                                />
                              </TouchableOpacity>

                              {!isCollapsed && (
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
                                          const { height } =
                                            event.nativeEvent.layout;
                                          setBoxScoreRowHeights((prev) => ({
                                            ...prev,
                                            [`${team.id}-${groupIndex}-header`]:
                                              height,
                                          }));
                                        }}
                                        style={[
                                          styles.boxScorePlayerCell,
                                          styles.boxScoreHeaderCell,
                                          {
                                            backgroundColor:
                                              theme.surfaceSecondary,
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

                                      {/* Players */}
                                      {sortedPlayers.map((player) => {
                                        if (
                                          !player.athlete ||
                                          !player.stats ||
                                          Object.keys(player.stats).length === 0
                                        ) {
                                          return null;
                                        }

                                        const headshotUrl = `https://a.espncdn.com/combiner/i?img=/i/headshots/${sportPath}/players/full/${player.athlete.id}.png&w=200`;
                                        const positionAbbr =
                                          player.athlete.position || "";
                                        const jersey =
                                          player.athlete.jersey || "";
                                        const rowKey = `${team.id}-${groupIndex}-${player.athlete.id}`;

                                        return (
                                          <View
                                            key={rowKey}
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
                                                backgroundColor:
                                                  theme.surfaceSecondary,
                                                borderBottomColor: theme.border,
                                              },
                                            ]}
                                          >
                                            <View
                                              style={[
                                                styles.boxScorePlayerImageContainer,
                                                {
                                                  backgroundColor:
                                                    teamSmartColor,
                                                },
                                              ]}
                                            >
                                              <Image
                                                source={{ uri: headshotUrl }}
                                                style={
                                                  styles.boxScorePlayerImage
                                                }
                                              />
                                            </View>
                                            <View
                                              style={styles.boxScorePlayerInfo}
                                            >
                                              <Text
                                                style={[
                                                  styles.boxScorePlayerName,
                                                  { color: theme.text },
                                                ]}
                                              >
                                                {player.athlete.displayName}
                                              </Text>
                                              <Text
                                                style={[
                                                  styles.boxScorePlayerDetails,
                                                  {
                                                    color: theme.textSecondary,
                                                  },
                                                ]}
                                              >
                                                {positionAbbr
                                                  ? `${positionAbbr} • #${jersey}`
                                                  : `#${jersey}`}
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
                                                  `${team.id}-${groupIndex}-header`
                                                ] || undefined,
                                            },
                                          ]}
                                        >
                                          {" "}
                                          {statKeys.map((statKey) => {
                                            const isCurrentSort =
                                              sortState?.column === statKey;
                                            const sortDirection = isCurrentSort
                                              ? sortState.direction
                                              : null;

                                            return (
                                              <TouchableOpacity
                                                key={statKey}
                                                style={styles.boxScoreStatCell}
                                                onPress={() =>
                                                  handleSortClick(statKey)
                                                }
                                                activeOpacity={0.7}
                                              >
                                                <View
                                                  style={{
                                                    flexDirection: "row",
                                                    alignItems: "center",
                                                    gap: 4,
                                                  }}
                                                >
                                                  <Text
                                                    style={[
                                                      styles.boxScoreHeaderText,
                                                      {
                                                        color: isCurrentSort
                                                          ? colors.primary
                                                          : theme.textSecondary,
                                                      },
                                                    ]}
                                                  >
                                                    {statKey}
                                                  </Text>
                                                  {sortDirection && (
                                                    <Ionicons
                                                      name={
                                                        sortDirection === "desc"
                                                          ? "chevron-down"
                                                          : "chevron-up"
                                                      }
                                                      size={12}
                                                      color={colors.primary}
                                                    />
                                                  )}
                                                </View>
                                              </TouchableOpacity>
                                            );
                                          })}
                                        </View>

                                        {/* Player Stats */}
                                        {sortedPlayers.map((player) => {
                                          if (
                                            !player.athlete ||
                                            !player.stats ||
                                            Object.keys(player.stats).length ===
                                              0
                                          ) {
                                            return null;
                                          }

                                          const rowKey = `${team.id}-${groupIndex}-${player.athlete.id}`;
                                          const rowHeight =
                                            boxScoreRowHeights[rowKey];

                                          // Get stats from nested object for NFL or top-level for others
                                          const statsToDisplay =
                                            group.statCategory
                                              ? player.stats[group.statCategory]
                                              : player.stats;

                                          return (
                                            <View
                                              key={rowKey}
                                              style={[
                                                styles.boxScoreStatsRow,
                                                styles.boxScoreDataCell,
                                                {
                                                  borderBottomColor:
                                                    theme.border,
                                                  height:
                                                    rowHeight || undefined,
                                                },
                                              ]}
                                            >
                                              {statKeys.map((statKey) => (
                                                <View
                                                  key={statKey}
                                                  style={
                                                    styles.boxScoreStatCell
                                                  }
                                                >
                                                  <Text
                                                    style={[
                                                      styles.boxScoreStatText,
                                                      { color: theme.text },
                                                    ]}
                                                  >
                                                    {statsToDisplay?.[
                                                      statKey
                                                    ] || "-"}
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
                              )}
                            </View>
                          );
                        })}
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
              <Text
                style={[
                  styles.contentTitle,
                  { color: theme.text, marginBottom: -5 },
                ]}
              >
                Live Play
              </Text>
            </View>

            {/* Court/Field Visualization */}
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

              const sportUpper = (gameData.sport || "").toUpperCase();
              const isNFL = sportUpper === "NFL" || sportUpper === "FOOTBALL";

              // For NFL, render field with auto-scaling
              if (isNFL) {
                const ordinalSuffix = (n) => {
                  const s = ["th", "st", "nd", "rd"];
                  const v = n % 100;
                  return n + (s[(v - 20) % 10] || s[v] || s[0]);
                };

                return (
                  <View style={{ width: "100%" }}>
                    {/* Down/Distance or Scoring Type */}
                    {summaryData?.drives &&
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

                        // Determine which team the drive belongs to
                        const driveTeamId =
                          summaryData.drives.team?.id ||
                          summaryData.drives.end?.team?.id;
                        const driveTeamColor =
                          driveTeamId === gameData.team2Id
                            ? team2Color
                            : team1Color;

                        return (
                          <View style={styles.playTextWrapper}>
                            <View
                              style={[
                                styles.playTextContainer,
                                {
                                  marginTop: 10,
                                  marginBottom: -15,
                                  backgroundColor: theme.surface,
                                  borderWidth: 2,
                                  borderColor: driveTeamId
                                    ? driveTeamColor
                                    : theme.border,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.playText,
                                  { color: theme.text, textAlign: "center" },
                                ]}
                              >
                                {summaryData.drives.description ||
                                  summaryData.drives.scoringType?.displayName ||
                                  summaryData.drives.start?.downDistanceText ||
                                  ""}
                              </Text>
                            </View>
                          </View>
                        );
                      })()}

                    <View
                      style={{ width: "100%" }}
                      onLayout={(event) => {
                        const { width } = event.nativeEvent.layout;
                        // Field is 320px wide at scale 1
                        const scale = Math.min(width / 320); // Cap at 1.5x
                        setCourtScale(scale); // Reuse courtScale state
                      }}
                    >
                      <NFLField
                        coordinate={summaryData?.plays?.coordinate}
                        isScoring={summaryData?.plays?.scoringPlay}
                        teamSide={
                          summaryData?.plays?.team === gameData.team2Abbr
                            ? "home"
                            : "away"
                        }
                        teamColor={
                          summaryData?.plays?.team === gameData.team2Abbr
                            ? team2Color
                            : team1Color
                        }
                        homeColor={team2Color}
                        awayColor={team1Color}
                        homeAbbr={gameData.team2Abbr}
                        awayAbbr={gameData.team1Abbr}
                        homeLogo={gameData.team2Logo}
                        awayLogo={gameData.team1Logo}
                        scale={courtScale}
                        drives={summaryData?.drives}
                        showDrive={!!summaryData?.drives}
                        team1Color={team1Color}
                        team2Color={team2Color}
                        team1Id={gameData.team1Id}
                        team2Id={gameData.team2Id}
                      />
                    </View>

                    {/* Drive Text */}
                    {summaryData?.drives &&
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

                        // Determine which team the drive belongs to
                        const driveTeamId =
                          summaryData.drives.team?.id ||
                          summaryData.drives.end?.team?.id;
                        const driveTeamColor =
                          driveTeamId === gameData.team2Id
                            ? team2Color
                            : team1Color;

                        return (
                          <View style={styles.playTextWrapper}>
                            <View
                              style={[
                                styles.playTextContainer,
                                {
                                  backgroundColor: theme.surface,
                                  borderWidth: 2,
                                  borderColor: driveTeamId
                                    ? driveTeamColor
                                    : theme.border,
                                },
                              ]}
                            >
                              <Text
                                style={[styles.playText, { color: theme.text }]}
                              >
                                {summaryData.drives.displayResult ||
                                  summaryData.drives.text}
                              </Text>
                              <View style={styles.playMetaContainer}>
                                <Text
                                  style={[
                                    styles.playMeta,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  {summaryData.drives.period?.number &&
                                    `${ordinalSuffix(
                                      summaryData.drives.period.number
                                    )} Quarter`}
                                  {summaryData.drives.clock?.displayValue &&
                                    ` • ${summaryData.drives.clock.displayValue}`}
                                  {summaryData.drives.team?.displayName &&
                                    `${summaryData.drives.team.displayName}`}
                                </Text>
                              </View>
                            </View>
                          </View>
                        );
                      })()}
                  </View>
                );
              }

              // NHL rink rendering - match basketball court pattern exactly
              if (sportUpper === "NHL") {
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
                      // Rink is 200px wide, 150px tall at base
                      const scale = width / 200;
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
                      <HockeyRink
                        coordinate={summaryData?.plays?.coordinate}
                        isScoring={summaryData?.plays?.scoringPlay}
                        teamSide={
                          summaryData?.plays?.team === gameData.team2Abbr
                            ? "home"
                            : "away"
                        }
                        teamColor={
                          summaryData?.plays?.team === gameData.team2Abbr
                            ? team2Color
                            : team1Color
                        }
                        styles={{
                          ...styles,
                          rinkContainer: {
                            ...styles.rinkContainer,
                            transform: [{ scale: courtScale }],
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
                    </View>
                  </View>
                );
              }

              // Basketball court rendering
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
                    {sportUpper === "NHL" ? (
                      <>
                        <HockeyRink
                          coordinate={undefined}
                          isScoring={false}
                          teamSide="home"
                          teamColor="#000000"
                          styles={{
                            ...styles,
                            rinkContainer: {
                              ...styles.rinkContainer,
                              transform: [{ scale: courtScale }],
                            },
                          }}
                        />
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
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
                      {/* ESPN Play Coordinate Visualization (with test override support) */}
                      {/* Only render for NBA - NHL handles coords internally */}
                      {sportUpper === "NBA" &&
                        (() => {
                          // Build array of plays to render. If a debug constant is set,
                          // use those test coords (can include both home and away).
                          const plays = [];
                          if (BASKETBALL_PLAY_TEST_COORDS) {
                            const t = BASKETBALL_PLAY_TEST_COORDS;
                            // Allow per-team period/pointsAttempted/scoringPlay overrides
                            // and apply a tiny X offset so identical test coords don't overlap.
                            if (t.away) {
                              const offsetX =
                                typeof t.away.offsetX === "number"
                                  ? t.away.offsetX
                                  : typeof t.offsetX === "number"
                                  ? t.offsetX
                                  : -0.5;
                              plays.push({
                                coordinate: {
                                  x: (t.away.x ?? t.x) + offsetX,
                                  y: t.away.y ?? t.y,
                                },
                                team: gameData.team1Abbr,
                                period: t.away.period ?? t.period ?? 3,
                                pointsAttempted: t.away.pointsAttempted ?? 0,
                                scoringPlay: !!t.away.scoringPlay,
                              });
                            }
                            if (t.home) {
                              const offsetX =
                                typeof t.home.offsetX === "number"
                                  ? t.home.offsetX
                                  : typeof t.offsetX === "number"
                                  ? t.offsetX
                                  : 0.5;
                              plays.push({
                                coordinate: {
                                  x: (t.home.x ?? t.x) + offsetX,
                                  y: t.home.y ?? t.y,
                                },
                                team: gameData.team2Abbr,
                                period: t.home.period ?? t.period ?? 3,
                                pointsAttempted: t.home.pointsAttempted ?? 0,
                                scoringPlay: !!t.home.scoringPlay,
                              });
                            }
                          } else if (summaryData?.plays?.coordinate) {
                            plays.push({
                              coordinate: summaryData.plays.coordinate,
                              team: summaryData.plays.team,
                              period: summaryData.plays.period?.number || 1,
                              pointsAttempted:
                                summaryData.plays.pointsAttempted,
                              scoringPlay: summaryData.plays.scoringPlay,
                            });
                          }

                          if (plays.length === 0) return null;

                          return plays.map((p, idx) => {
                            const espnX = p.coordinate.x;
                            const espnY = p.coordinate.y;
                            const period = p.period || 1;
                            const playTeam = p.team;

                            // Determine which side teams are on based on period
                            let isHomeOnRight = false;
                            if (period === 3 || period === 4)
                              isHomeOnRight = true;

                            const isHomeTeam = playTeam === gameData.team2Abbr;
                            const isTeamOnRight =
                              (isHomeTeam && isHomeOnRight) ||
                              (!isHomeTeam && !isHomeOnRight);
                            const teamSide = isTeamOnRight ? "home" : "away";

                            const pointsAttempted = p.pointsAttempted;

                            // Use the same coordinate math as `BasketballCourt` to determine
                            // the percent placement, then map those percents into the
                            // un-rotated overlay by swapping axes.
                            let leftPercent, topPercent;
                            if (pointsAttempted === 1) {
                              // Short-hand for free throws / single point attempts
                              leftPercent = isTeamOnRight ? 50 : 50;
                              topPercent = isTeamOnRight ? 28 : 72;
                            } else if (espnX === 0 && espnY === 0) {
                              leftPercent = 50;
                              topPercent = 50;
                            } else {
                              if (teamSide === "home") {
                                topPercent = espnY * 2 - 6;
                                leftPercent = espnX * 2;
                              } else {
                                topPercent = (52 - espnY) * 2;
                                leftPercent = (50 - espnX) * 2;
                              }
                            }

                            const finalLeftPercent = Math.max(
                              2,
                              Math.min(98, leftPercent)
                            );
                            const finalTopPercent = Math.max(
                              1.5,
                              Math.min(98.5, topPercent)
                            );

                            // Clamp to respective sides (home/right vs away/left)
                            let clampedTop = finalTopPercent;
                            if (teamSide === "home") {
                              clampedTop = Math.min(clampedTop, 50.5);
                            } else {
                              clampedTop = Math.max(clampedTop, 49.5);
                            }

                            // Overlay is not rotated, so swap axes: BasketballCourt's
                            // `left` percent maps to vertical (Y) here, and `top`
                            // percent maps to horizontal (X).
                            // Flip percents so markers map to the mirrored half
                            // (fixes markers appearing on the opposite side).
                            const ourXPercent = clampedTop;
                            const ourYPercent = 100 - finalLeftPercent;

                            const padding = 3 * courtScale;
                            const courtWidth = 200 * courtScale - padding * 2;
                            const courtHeight = 150 * courtScale - padding * 2;

                            const actualX =
                              padding + (ourXPercent / 100) * courtWidth;
                            const actualY =
                              padding + (ourYPercent / 100) * courtHeight;

                            const teamColor =
                              playTeam === gameData.team1Abbr
                                ? team1Color
                                : team2Color;
                            const isScoring = !!p.scoringPlay;

                            return (
                              <View
                                key={`play-${idx}`}
                                style={{
                                  position: "absolute",
                                  width: 7.5 * courtScale,
                                  height: 7.5 * courtScale,
                                  borderRadius: 3.75 * courtScale,
                                  backgroundColor: isScoring
                                    ? teamColor
                                    : "white",
                                  borderWidth: 1.25 * courtScale,
                                  borderColor: isScoring ? "white" : teamColor,
                                  left: actualX - 3.75 * courtScale,
                                  top: actualY - 3.75 * courtScale,
                                  zIndex: 400,
                                  elevation: 400,
                                  shadowColor: "#000",
                                  shadowOffset: { width: 0, height: 2 },
                                  shadowOpacity: 1,
                                  shadowRadius: 2 * courtScale,
                                  elevation: 5,
                                }}
                              />
                            );
                          });
                        })()}
                    </View>
                  </View>
                  {/* Play participants (pro only) - moved below play text to avoid overlap */}
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
                  <View>
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

                      {/* Play participants (pro only) - render directly under play card */}
                      {isPro && summaryData?.plays?.participants && (
                        <View style={{ marginTop: 12 }}>
                          <PlayParticipants
                            participants={summaryData.plays.participants}
                          />
                        </View>
                      )}
                    </View>
                  </View>
                );
              })()}
          </View>
        );
      case "props":
        // Let PropTabContent derive available stat IDs from roster/odds dynamically
        return (
          <PropTabContent
            gameData={gameData}
            theme={theme}
            colors={colors}
            gameId={gameData.id}
            navigation={navigation}
          />
        );
      case "teams":
        // Team-level props: use each competitor's `record.odds.sgo` markets
        const competitors =
          summaryData?.header?.competitions?.[0]?.competitors || [];

        const renderTeamMarkets = (competitor, tIndex) => {
          const ensureAmericanLocal = (odds) => {
            if (odds === undefined || odds === null) return null;
            if (typeof odds === "number")
              return odds > 0 ? `+${odds}` : String(odds);
            const asNum = parseFloat(odds);
            if (!isNaN(asNum)) return asNum > 0 ? `+${asNum}` : String(asNum);
            return String(odds);
          };
          const teamAbbr = competitor.team?.abbreviation || "TEAM";
          const teamName = competitor.team?.displayName || teamAbbr;
          const sgo = competitor.record?.odds?.sgo || [];
          // Compute smart team colors using both competitors (same pattern as header)
          const teamA = competitors?.[0]?.team || {};
          const teamB = competitors?.[1]?.team || {};
          const { team1Color, team2Color } = getSmartTeamColors(
            {
              team1Color:
                teamA?.teamColor || teamA?.primaryColor || teamA?.color,
              team1AlternateColor:
                teamA?.alternateColor || teamA?.teamAlternateColor,
            },
            {
              team2Color:
                teamB?.teamColor || teamB?.primaryColor || teamB?.color,
              team2AlternateColor:
                teamB?.alternateColor || teamB?.teamAlternateColor,
            },
            colors
          );
          // Normalize colors to include '#' prefix when missing
          const normalizeColor = (c) => {
            if (!c) return c;
            return String(c).startsWith("#") ? String(c) : `#${String(c)}`;
          };
          const nTeam1Color = normalizeColor(team1Color);
          const nTeam2Color = normalizeColor(team2Color);
          let teamSmartColor =
            competitor.team?.id === teamB?.id ? nTeam2Color : nTeam1Color;
          if (!teamSmartColor) teamSmartColor = theme.border;

          if (!Array.isArray(sgo) || sgo.length === 0) {
            return (
              <View key={teamAbbr} style={{ marginBottom: 12 }}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  {teamName}
                </Text>
                <Text
                  style={[styles.noDataText, { color: theme.textSecondary }]}
                >
                  No team props available
                </Text>
              </View>
            );
          }

          return (
            <View key={teamAbbr} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TeamLogo
                  uri={
                    (typeof teamLookup !== "undefined" &&
                      teamLookup[teamAbbr?.toUpperCase()] &&
                      teamLookup[teamAbbr?.toUpperCase()].logo) ||
                    competitor.team?.logo ||
                    `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500${
                      isDarkMode ? "-dark" : ""
                    }/${(teamAbbr || "").toLowerCase()}.png&h=100&w=100`
                  }
                  style={[styles.teamSmallLogo, { marginBottom: 12 }]}
                />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  {teamName}
                </Text>
              </View>

              {sgo.map((market, mi) => {
                const statId = market.statID || String(mi);
                const marketLabel = market.marketName || statId;
                const variants = Array.isArray(market.variants)
                  ? market.variants
                  : [];

                // Find DraftKings variant grouping by side
                const dkBySide = {};
                variants.forEach((v) => {
                  const side = v.sideID || "none";
                  const bk =
                    (v.byBookmaker && v.byBookmaker.draftkings) || null;
                  if (bk) {
                    dkBySide[side] = dkBySide[side] || [];
                    dkBySide[side].push({ ...v, bookmaker: bk });
                  }
                });

                const overVariant = dkBySide["over"]?.[0] || null;
                const underVariant = dkBySide["under"]?.[0] || null;
                const hasOU = overVariant || underVariant;
                // Collect altLines from every variant and tag with originating side
                const collectedAlts = [];
                variants.forEach((v) => {
                  const side = v.sideID || "other";
                  const bk =
                    (v.byBookmaker && v.byBookmaker.draftkings) || null;
                  const lines =
                    bk && Array.isArray(bk.altLines) ? bk.altLines : [];
                  lines.forEach((a) =>
                    collectedAlts.push({ ...a, _side: side })
                  );
                });
                const altBySide = {
                  over: collectedAlts.filter((a) => a._side === "over"),
                  under: collectedAlts.filter((a) => a._side === "under"),
                  other: collectedAlts.filter(
                    (a) => a._side !== "over" && a._side !== "under"
                  ),
                };

                return (
                  <View
                    key={`${teamAbbr}-${statId}-${mi}`}
                    style={[
                      styles.propCard,
                      { backgroundColor: theme.surface },
                    ]}
                  >
                    <View style={styles.propCardHeader}>
                      <Text
                        style={[styles.propSectionTitle, { color: theme.text }]}
                      >
                        {marketLabel}
                      </Text>
                    </View>

                    {hasOU && (
                      <View style={styles.ouButtonsContainer}>
                        {overVariant && (
                          <TouchableOpacity
                            style={[
                              styles.ouButton,
                              {
                                borderColor: isBetSelected(
                                  `team-${teamAbbr}-ou-${statId}-${marketLabel
                                    .replace(/\s+/g, "-")
                                    .toLowerCase()}-over`
                                )
                                  ? colors.primary
                                  : teamSmartColor,
                                backgroundColor: isBetSelected(
                                  `team-${teamAbbr}-ou-${statId}-${marketLabel
                                    .replace(/\s+/g, "-")
                                    .toLowerCase()}-over`
                                )
                                  ? colors.primary
                                  : theme.surfaceSecondary,
                              },
                            ]}
                            onPress={() => {
                              const betId = `team-${teamAbbr}-ou-${statId}-${marketLabel
                                .replace(/\s+/g, "-")
                                .toLowerCase()}-over`;
                              if (isBetSelected(betId)) toggleBet(betId);
                              else
                                toggleBet({
                                  id: betId,
                                  gameId: `${
                                    gameData.id
                                  }_${sportToUse.toLowerCase()}`,
                                  sport: sportToUse,
                                  gameInfo: {
                                    time: gameData.statusDetail || "TBD",
                                    teams: `${gameData.team1Abbr} @ ${gameData.team2Abbr}`,
                                  },
                                  team: teamAbbr,
                                  type: marketLabel || "Total",
                                  description: `${teamAbbr} Over ${
                                    overVariant.bookmaker.overUnder || ""
                                  }`,
                                  line: `O ${overVariant.bookmaker.overUnder}`,
                                  odds: ensureAmericanLocal(
                                    overVariant.bookmaker.odds
                                  ),
                                });
                            }}
                          >
                            <Text
                              style={[
                                styles.ouLabel,
                                {
                                  color: isBetSelected(
                                    `team-${teamAbbr}-ou-${statId}-${marketLabel
                                      .replace(/\s+/g, "-")
                                      .toLowerCase()}-over`
                                  )
                                    ? "#fff"
                                    : theme.text,
                                },
                              ]}
                            >
                              Over
                            </Text>
                            <Text
                              style={[
                                styles.ouLine,
                                {
                                  color: isBetSelected(
                                    `team-${teamAbbr}-ou-${statId}-${marketLabel
                                      .replace(/\s+/g, "-")
                                      .toLowerCase()}-over`
                                  )
                                    ? "#fff"
                                    : theme.text,
                                },
                              ]}
                            >
                              {overVariant.bookmaker.overUnder}
                            </Text>
                            <Text
                              style={[
                                styles.ouOdds,
                                {
                                  color: isBetSelected(
                                    `team-${teamAbbr}-ou-${statId}-${marketLabel
                                      .replace(/\s+/g, "-")
                                      .toLowerCase()}-over`
                                  )
                                    ? "#fff"
                                    : colors.primary,
                                },
                              ]}
                            >
                              {formatOddsForDisplay(
                                ensureAmericanLocal(overVariant.bookmaker.odds),
                                oddsDisplay
                              )}
                            </Text>
                          </TouchableOpacity>
                        )}

                        {underVariant && (
                          <TouchableOpacity
                            style={[
                              styles.ouButton,
                              {
                                borderColor: isBetSelected(
                                  `team-${teamAbbr}-ou-${statId}-${marketLabel
                                    .replace(/\s+/g, "-")
                                    .toLowerCase()}-under`
                                )
                                  ? colors.primary
                                  : teamSmartColor,
                                backgroundColor: isBetSelected(
                                  `team-${teamAbbr}-ou-${statId}-${marketLabel
                                    .replace(/\s+/g, "-")
                                    .toLowerCase()}-under`
                                )
                                  ? colors.primary
                                  : theme.surfaceSecondary,
                              },
                            ]}
                            onPress={() => {
                              const betId = `team-${teamAbbr}-ou-${statId}-${marketLabel
                                .replace(/\s+/g, "-")
                                .toLowerCase()}-under`;
                              if (isBetSelected(betId)) toggleBet(betId);
                              else
                                toggleBet({
                                  id: betId,
                                  gameId: `${
                                    gameData.id
                                  }_${sportToUse.toLowerCase()}`,
                                  sport: sportToUse,
                                  gameInfo: {
                                    time: gameData.statusDetail || "TBD",
                                    teams: `${gameData.team1Abbr} @ ${gameData.team2Abbr}`,
                                  },
                                  team: teamAbbr,
                                  type: marketLabel || "Total",
                                  description: `${teamAbbr} Under ${
                                    underVariant.bookmaker.overUnder || ""
                                  }`,
                                  line: `U ${underVariant.bookmaker.overUnder}`,
                                  odds: ensureAmericanLocal(
                                    underVariant.bookmaker.odds
                                  ),
                                });
                            }}
                          >
                            <Text
                              style={[
                                styles.ouLabel,
                                {
                                  color: isBetSelected(
                                    `team-${teamAbbr}-ou-${statId}-${marketLabel
                                      .replace(/\s+/g, "-")
                                      .toLowerCase()}-under`
                                  )
                                    ? "#fff"
                                    : theme.text,
                                },
                              ]}
                            >
                              Under
                            </Text>
                            <Text
                              style={[
                                styles.ouLine,
                                {
                                  color: isBetSelected(
                                    `team-${teamAbbr}-ou-${statId}-${marketLabel
                                      .replace(/\s+/g, "-")
                                      .toLowerCase()}-under`
                                  )
                                    ? "#fff"
                                    : theme.text,
                                },
                              ]}
                            >
                              {underVariant.bookmaker.overUnder}
                            </Text>
                            <Text
                              style={[
                                styles.ouOdds,
                                {
                                  color: isBetSelected(
                                    `team-${teamAbbr}-ou-${statId}-${marketLabel
                                      .replace(/\s+/g, "-")
                                      .toLowerCase()}-under`
                                  )
                                    ? "#fff"
                                    : colors.primary,
                                },
                              ]}
                            >
                              {formatOddsForDisplay(
                                ensureAmericanLocal(
                                  underVariant.bookmaker.odds
                                ),
                                oddsDisplay
                              )}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {/* Render non-OU primary buttons (Spread/Moneyline/etc.) so alts appear below them */}
                    {Object.keys(dkBySide).filter(
                      (s) => s !== "over" && s !== "under"
                    ).length > 0 && (
                      <View style={{ marginTop: 8 }}>
                        <View style={styles.ouButtonsContainer}>
                          {Object.keys(dkBySide)
                            .filter((s) => s !== "over" && s !== "under")
                            .map((side) => {
                              const entry = dkBySide[side][0];
                              const bk = entry?.bookmaker || {};
                              const label =
                                market.marketName || side.toUpperCase();
                              const lineValue = bk.spread || bk.overUnder || "";
                              const displayLine = lineValue || teamAbbr;
                              const oddsVal = ensureAmericanLocal(bk.odds);
                              const betId = `team-${teamAbbr}-${marketLabel
                                .replace(/\s+/g, "-")
                                .toLowerCase()}-${statId}-${side}`;
                              const isSelected = isBetSelected(betId);
                              return (
                                <TouchableOpacity
                                  key={`${teamAbbr}-${statId}-${side}`}
                                  style={[
                                    styles.ouButton,
                                    {
                                      borderColor: isSelected
                                        ? colors.primary
                                        : teamSmartColor,
                                      backgroundColor: isSelected
                                        ? colors.primary
                                        : theme.surfaceSecondary,
                                    },
                                  ]}
                                  onPress={() => {
                                    if (isBetSelected(betId)) toggleBet(betId);
                                    else
                                      toggleBet({
                                        id: betId,
                                        gameId: `${
                                          gameData.id
                                        }_${sportToUse.toLowerCase()}`,
                                        sport: sportToUse,
                                        gameInfo: {
                                          time: gameData.statusDetail || "TBD",
                                          teams: `${gameData.team1Abbr} @ ${gameData.team2Abbr}`,
                                        },
                                        team: teamAbbr,
                                        type: label,
                                        description: `${teamAbbr} ${label} ${side.toUpperCase()}`,
                                        line: displayLine,
                                        odds: oddsVal,
                                      });
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.ouLabel,
                                      {
                                        color: isSelected ? "#fff" : theme.text,
                                      },
                                    ]}
                                  >
                                    {label}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.ouLine,
                                      {
                                        color: isSelected ? "#fff" : theme.text,
                                      },
                                    ]}
                                  >
                                    {displayLine}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.ouOdds,
                                      {
                                        color: isSelected
                                          ? "#fff"
                                          : colors.primary,
                                      },
                                    ]}
                                  >
                                    {oddsVal
                                      ? formatOddsForDisplay(
                                          oddsVal,
                                          oddsDisplay
                                        )
                                      : teamAbbr}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                        </View>
                      </View>
                    )}

                    {/* Alt lines grouped by originating side. Always show on Teams tab. */}
                    {(altBySide.over.length > 0 ||
                      altBySide.under.length > 0 ||
                      altBySide.other.length > 0) && (
                      <View style={{ marginTop: 8 }}>
                        {altBySide.over.length > 0 && (
                          <View style={{ marginBottom: 6 }}>
                            <Text
                              style={[
                                { color: theme.textSecondary, marginBottom: 6 },
                              ]}
                            >
                              {"Alt - Over"}
                            </Text>
                            <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                              contentContainerStyle={{ paddingVertical: 8 }}
                            >
                              {altBySide.over.slice(0, 100).map((alt, ai) => {
                                const raw =
                                  alt.overUnder ?? alt.spread ?? alt.line ?? "";
                                const displayVal =
                                  raw === ""
                                    ? ""
                                    : String(Math.ceil(parseFloat(raw)));
                                const odds = ensureAmericanLocal(
                                  alt.odds ?? alt.odds
                                );
                                const betId = `team-${teamAbbr}-alt-over-${marketLabel
                                  .replace(/\s+/g, "-")
                                  .toLowerCase()}-${statId}-${ai}`;
                                const isSelected = isBetSelected(betId);
                                return (
                                  <TouchableOpacity
                                    key={`${teamAbbr}-${statId}-alt-over-${ai}`}
                                    style={[
                                      styles.milestoneButton,
                                      {
                                        borderColor: isSelected
                                          ? colors.primary
                                          : teamSmartColor,
                                        backgroundColor: isSelected
                                          ? colors.primary
                                          : theme.surfaceSecondary,
                                      },
                                    ]}
                                    onPress={() => {
                                      if (isBetSelected(betId))
                                        toggleBet(betId);
                                      else
                                        toggleBet({
                                          id: betId,
                                          gameId: `${
                                            gameData.id
                                          }_${sportToUse.toLowerCase()}`,
                                          sport: sportToUse,
                                          gameInfo: {
                                            time:
                                              gameData.statusDetail || "TBD",
                                            teams: `${gameData.team1Abbr} @ ${gameData.team2Abbr}`,
                                          },
                                          team: teamAbbr,
                                          type: marketLabel
                                            ? `${marketLabel} (Alt)`
                                            : "alt",
                                          statType: "points",
                                          description: `${teamAbbr} ${displayVal}+`,
                                          line: `${displayVal}+`,
                                          odds: odds,
                                        });
                                    }}
                                  >
                                    <Text
                                      style={[
                                        styles.milestoneValue,
                                        {
                                          color: isSelected
                                            ? "#fff"
                                            : theme.text,
                                        },
                                      ]}
                                    >
                                      {displayVal}+
                                    </Text>
                                    <Text
                                      style={[
                                        styles.milestoneOdds,
                                        {
                                          color: isSelected
                                            ? "#fff"
                                            : colors.primary,
                                        },
                                      ]}
                                    >
                                      {odds
                                        ? formatOddsForDisplay(
                                            odds,
                                            oddsDisplay
                                          )
                                        : teamAbbr}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </ScrollView>
                          </View>
                        )}

                        {altBySide.under.length > 0 && (
                          <View style={{ marginBottom: 6 }}>
                            <Text
                              style={[
                                { color: theme.textSecondary, marginBottom: 6 },
                              ]}
                            >
                              {"Alt - Under"}
                            </Text>
                            <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                              contentContainerStyle={{ paddingVertical: 8 }}
                            >
                              {altBySide.under.slice(0, 100).map((alt, ai) => {
                                const raw =
                                  alt.overUnder ?? alt.spread ?? alt.line ?? "";
                                const num = raw === "" ? NaN : parseFloat(raw);
                                const displayVal = isNaN(num)
                                  ? String(raw)
                                  : String(Math.floor(num));
                                const odds = ensureAmericanLocal(
                                  alt.odds ?? alt.odds
                                );
                                const betId = `team-${teamAbbr}-alt-under-${marketLabel
                                  .replace(/\s+/g, "-")
                                  .toLowerCase()}-${statId}-${ai}`;
                                const isSelected = isBetSelected(betId);
                                return (
                                  <TouchableOpacity
                                    key={`${teamAbbr}-${statId}-alt-under-${ai}`}
                                    style={[
                                      styles.milestoneButton,
                                      {
                                        borderColor: isSelected
                                          ? colors.primary
                                          : teamSmartColor,
                                        backgroundColor: isSelected
                                          ? colors.primary
                                          : theme.surfaceSecondary,
                                      },
                                    ]}
                                    onPress={() => {
                                      if (isBetSelected(betId))
                                        toggleBet(betId);
                                      else
                                        toggleBet({
                                          id: betId,
                                          gameId: `${
                                            gameData.id
                                          }_${sportToUse.toLowerCase()}`,
                                          sport: sportToUse,
                                          gameInfo: {
                                            time:
                                              gameData.statusDetail || "TBD",
                                            teams: `${gameData.team1Abbr} @ ${gameData.team2Abbr}`,
                                          },
                                          team: teamAbbr,
                                          type: marketLabel
                                            ? `${marketLabel} (Alt)`
                                            : "alt",
                                          statType: "points",
                                          description: `${teamAbbr} ${displayVal}-`,
                                          line: `${displayVal}-`,
                                          odds: odds,
                                        });
                                    }}
                                  >
                                    <Text
                                      style={[
                                        styles.milestoneValue,
                                        {
                                          color: isSelected
                                            ? "#fff"
                                            : theme.text,
                                        },
                                      ]}
                                    >
                                      {displayVal}-
                                    </Text>
                                    <Text
                                      style={[
                                        styles.milestoneOdds,
                                        {
                                          color: isSelected
                                            ? "#fff"
                                            : colors.primary,
                                        },
                                      ]}
                                    >
                                      {odds
                                        ? formatOddsForDisplay(
                                            odds,
                                            oddsDisplay
                                          )
                                        : teamAbbr}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </ScrollView>
                          </View>
                        )}

                        {altBySide.other.length > 0 && (
                          <View style={{ marginBottom: 6 }}>
                            <Text
                              style={[
                                { color: theme.textSecondary, marginBottom: 6 },
                              ]}
                            >
                              {"Alt - Other"}
                            </Text>
                            <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                              contentContainerStyle={{ paddingVertical: 8 }}
                            >
                              {altBySide.other.slice(0, 100).map((alt, ai) => {
                                const displayVal =
                                  alt.spread ?? alt.line ?? alt.overUnder ?? "";
                                const odds = ensureAmericanLocal(
                                  alt.odds ?? alt.odds
                                );
                                const betId = `team-${teamAbbr}-alt-other-${marketLabel
                                  .replace(/\s+/g, "-")
                                  .toLowerCase()}-${statId}-${ai}`;
                                const isSelected = isBetSelected(betId);
                                return (
                                  <TouchableOpacity
                                    key={`${teamAbbr}-${statId}-alt-other-${ai}`}
                                    style={[
                                      styles.milestoneButton,
                                      {
                                        borderColor: isSelected
                                          ? colors.primary
                                          : teamSmartColor,
                                        backgroundColor: isSelected
                                          ? colors.primary
                                          : theme.surfaceSecondary,
                                      },
                                    ]}
                                    onPress={() => {
                                      if (isBetSelected(betId))
                                        toggleBet(betId);
                                      else
                                        toggleBet({
                                          id: betId,
                                          gameId: `${
                                            gameData.id
                                          }_${sportToUse.toLowerCase()}`,
                                          sport: sportToUse,
                                          gameInfo: {
                                            time:
                                              gameData.statusDetail || "TBD",
                                            teams: `${gameData.team1Abbr} @ ${gameData.team2Abbr}`,
                                          },
                                          team: teamAbbr,
                                          type: marketLabel
                                            ? `${marketLabel} (Alt)`
                                            : "alt",
                                          statType: "spread",
                                          description: `${teamAbbr} ${displayVal}`,
                                          line: `${displayVal}`,
                                          odds: odds,
                                        });
                                    }}
                                  >
                                    <Text
                                      style={[
                                        styles.milestoneValue,
                                        {
                                          color: isSelected
                                            ? "#fff"
                                            : theme.text,
                                        },
                                      ]}
                                    >
                                      {String(displayVal)}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.milestoneOdds,
                                        {
                                          color: isSelected
                                            ? "#fff"
                                            : colors.primary,
                                        },
                                      ]}
                                    >
                                      {odds
                                        ? formatOddsForDisplay(
                                            odds,
                                            oddsDisplay
                                          )
                                        : teamAbbr}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </ScrollView>
                          </View>
                        )}
                      </View>
                    )}

                    {/* (duplicate non-OU block removed) */}
                  </View>
                );
              })}
            </View>
          );
        };

        return (
          <View style={styles.tabContent}>
            <Text style={[styles.contentTitle, { color: theme.text }]}>
              Team Props
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {(() => {
                const displayCompetitors = Array.isArray(competitors)
                  ? competitors.slice().reverse()
                  : competitors;
                return displayCompetitors.map((c, i) =>
                  renderTeamMarkets(c, i)
                );
              })()}
            </ScrollView>
          </View>
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

        // Format line values (spread/total lines) - keep + for positives
        const formatOdds = (odds) => {
          if (odds === undefined || odds === null) return "-";
          const num = parseFloat(odds);
          return num > 0 ? `+${num}` : String(num);
        };

        // Ensure odds are canonical American string (for storing in payloads)
        const ensureAmerican = (odds) => {
          if (odds === undefined || odds === null) return null;
          if (typeof odds === "number")
            return odds > 0 ? `+${odds}` : String(odds);
          const asNum = parseFloat(odds);
          if (!isNaN(asNum)) return asNum > 0 ? `+${asNum}` : String(asNum);
          return String(odds);
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
        const homeWinPct = predictor?.homeTeam?.WIN || null;
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

            {/* Bookmaker Markets (from pickcenter.all) */}
            <View style={styles.gameLineSection}>
              {pickcenter.all &&
              Array.isArray(pickcenter.all) &&
              pickcenter.all.length > 0 ? (
                pickcenter.all.map((market, mi) => {
                  const marketLabel =
                    market.marketName || market.label || `Market ${mi}`;
                  const variants = Array.isArray(market.variants)
                    ? market.variants
                    : [];

                  const dkBySide = {};
                  variants.forEach((v) => {
                    const side = v.sideID || v.side || "none";
                    const bk =
                      (v.byBookmaker && v.byBookmaker.draftkings) ||
                      (v.byBookmaker && Object.values(v.byBookmaker)[0]) ||
                      v.bookmaker ||
                      null;
                    if (bk) {
                      dkBySide[side] = dkBySide[side] || [];
                      dkBySide[side].push({ ...v, bookmaker: bk });
                    }
                  });

                  const overVariant =
                    (dkBySide["over"] && dkBySide["over"][0]) || null;
                  const underVariant =
                    (dkBySide["under"] && dkBySide["under"][0]) || null;
                  const hasOU = overVariant || underVariant;

                  const collectedAlts = [];
                  variants.forEach((v) => {
                    const side = v.sideID || v.side || "other";
                    const bk =
                      (v.byBookmaker && v.byBookmaker.draftkings) ||
                      (v.byBookmaker && Object.values(v.byBookmaker)[0]) ||
                      v.bookmaker ||
                      null;
                    const lines =
                      bk && Array.isArray(bk.altLines) ? bk.altLines : [];
                    lines.forEach((a) =>
                      collectedAlts.push({ ...a, _side: side })
                    );
                  });
                  const altBySide = {
                    over: collectedAlts.filter((a) => a._side === "over"),
                    under: collectedAlts.filter((a) => a._side === "under"),
                    other: collectedAlts.filter(
                      (a) => a._side !== "over" && a._side !== "under"
                    ),
                  };

                  return (
                    <View
                      key={`pc-${mi}`}
                      style={[
                        styles.propCard,
                        { backgroundColor: theme.surface, marginBottom: 12 },
                      ]}
                    >
                      <View style={styles.propCardHeader}>
                        <Text
                          style={[
                            styles.propSectionTitle,
                            { color: theme.text },
                          ]}
                        >
                          {marketLabel}
                        </Text>
                      </View>

                      {hasOU && (
                        <View style={styles.ouButtonsContainer}>
                          {overVariant && (
                            <TouchableOpacity
                              style={[
                                styles.ouButton,
                                {
                                  borderColor: isBetSelected(
                                    `game-${mi}-${marketLabel
                                      .replace(/\s+/g, "-")
                                      .toLowerCase()}-ou-over`
                                  )
                                    ? colors.primary
                                    : theme.border,
                                  backgroundColor: isBetSelected(
                                    `game-${mi}-${marketLabel
                                      .replace(/\s+/g, "-")
                                      .toLowerCase()}-ou-over`
                                  )
                                    ? colors.primary
                                    : theme.surfaceSecondary,
                                },
                              ]}
                              onPress={() => {
                                const betId = `game-${mi}-${marketLabel
                                  .replace(/\s+/g, "-")
                                  .toLowerCase()}-ou-over`;
                                if (isBetSelected(betId)) toggleBet(betId);
                                else
                                  toggleBet({
                                    id: betId,
                                    gameId: `${
                                      gameData.id
                                    }_${sportToUse.toLowerCase()}`,
                                    sport: sportToUse,
                                    period: overVariant.periodID || null,
                                    gameInfo: {
                                      time: gameData.statusDetail || "TBD",
                                      teams: `${gameData.team1Abbr} @ ${gameData.team2Abbr}`,
                                    },
                                    type: "Total",
                                    description: `Over ${overVariant.bookmaker.overUnder}`,
                                    line: `O ${overVariant.bookmaker.overUnder}`,
                                    odds: ensureAmerican(
                                      overVariant.bookmaker.odds
                                    ),
                                  });
                              }}
                            >
                              <Text
                                style={[
                                  styles.ouLabel,
                                  {
                                    color: isBetSelected(
                                      `game-${mi}-${marketLabel
                                        .replace(/\s+/g, "-")
                                        .toLowerCase()}-ou-over`
                                    )
                                      ? "#fff"
                                      : theme.text,
                                  },
                                ]}
                              >
                                Over
                              </Text>
                              <Text
                                style={[
                                  styles.ouLine,
                                  {
                                    color: isBetSelected(
                                      `game-${mi}-${marketLabel
                                        .replace(/\s+/g, "-")
                                        .toLowerCase()}-ou-over`
                                    )
                                      ? "#fff"
                                      : theme.text,
                                  },
                                ]}
                              >
                                {overVariant.bookmaker.overUnder}
                              </Text>
                              <Text
                                style={[
                                  styles.ouOdds,
                                  {
                                    color: isBetSelected(
                                      `game-${mi}-${marketLabel
                                        .replace(/\s+/g, "-")
                                        .toLowerCase()}-ou-over`
                                    )
                                      ? "#fff"
                                      : colors.primary,
                                  },
                                ]}
                              >
                                {formatOddsForDisplay(
                                  ensureAmerican(overVariant.bookmaker.odds),
                                  oddsDisplay
                                )}
                              </Text>
                            </TouchableOpacity>
                          )}
                          {underVariant && (
                            <TouchableOpacity
                              style={[
                                styles.ouButton,
                                {
                                  borderColor: isBetSelected(
                                    `game-${mi}-${marketLabel
                                      .replace(/\s+/g, "-")
                                      .toLowerCase()}-ou-under`
                                  )
                                    ? colors.primary
                                    : theme.border,
                                  backgroundColor: isBetSelected(
                                    `game-${mi}-${marketLabel
                                      .replace(/\s+/g, "-")
                                      .toLowerCase()}-ou-under`
                                  )
                                    ? colors.primary
                                    : theme.surfaceSecondary,
                                },
                              ]}
                              onPress={() => {
                                const betId = `game-${mi}-${marketLabel
                                  .replace(/\s+/g, "-")
                                  .toLowerCase()}-ou-under`;
                                if (isBetSelected(betId)) toggleBet(betId);
                                else
                                  toggleBet({
                                    id: betId,
                                    gameId: `${
                                      gameData.id
                                    }_${sportToUse.toLowerCase()}`,
                                    sport: sportToUse,
                                    period: underVariant.periodID || null,
                                    gameInfo: {
                                      time: gameData.statusDetail || "TBD",
                                      teams: `${gameData.team1Abbr} @ ${gameData.team2Abbr}`,
                                    },
                                    type: "Total",
                                    description: `Under ${underVariant.bookmaker.overUnder}`,
                                    line: `U ${underVariant.bookmaker.overUnder}`,
                                    odds: ensureAmerican(
                                      underVariant.bookmaker.odds
                                    ),
                                  });
                              }}
                            >
                              <Text
                                style={[
                                  styles.ouLabel,
                                  {
                                    color: isBetSelected(
                                      `game-${mi}-${marketLabel
                                        .replace(/\s+/g, "-")
                                        .toLowerCase()}-ou-under`
                                    )
                                      ? "#fff"
                                      : theme.text,
                                  },
                                ]}
                              >
                                Under
                              </Text>
                              <Text
                                style={[
                                  styles.ouLine,
                                  {
                                    color: isBetSelected(
                                      `game-${mi}-${marketLabel
                                        .replace(/\s+/g, "-")
                                        .toLowerCase()}-ou-under`
                                    )
                                      ? "#fff"
                                      : theme.text,
                                  },
                                ]}
                              >
                                {underVariant.bookmaker.overUnder}
                              </Text>
                              <Text
                                style={[
                                  styles.ouOdds,
                                  {
                                    color: isBetSelected(
                                      `game-${mi}-${marketLabel
                                        .replace(/\s+/g, "-")
                                        .toLowerCase()}-ou-under`
                                    )
                                      ? "#fff"
                                      : colors.primary,
                                  },
                                ]}
                              >
                                {formatOddsForDisplay(
                                  ensureAmerican(underVariant.bookmaker.odds),
                                  oddsDisplay
                                )}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}

                      {Object.keys(dkBySide).filter(
                        (s) => s !== "over" && s !== "under"
                      ).length > 0 && (
                        <View style={{ marginTop: 8 }}>
                          <View style={styles.ouButtonsContainer}>
                            {Object.keys(dkBySide)
                              .filter((s) => s !== "over" && s !== "under")
                              .map((side) => {
                                const entry = dkBySide[side][0];
                                const bk = entry?.bookmaker || {};
                                const label =
                                  market.marketName || side.toUpperCase();
                                const lineValue =
                                  bk.spread || bk.overUnder || "";
                                const capitalizedSide =
                                  side.charAt(0).toUpperCase() + side.slice(1);
                                const displayLine =
                                  lineValue || capitalizedSide;
                                const oddsVal = ensureAmerican(bk.odds);
                                const betId = `game-${mi}-${marketLabel
                                  .replace(/\s+/g, "-")
                                  .toLowerCase()}-${side}`;
                                const isSelected = isBetSelected(betId);
                                return (
                                  <TouchableOpacity
                                    key={`pc-${mi}-${side}`}
                                    style={[
                                      styles.ouButton,
                                      {
                                        borderColor: isSelected
                                          ? colors.primary
                                          : theme.border,
                                        backgroundColor: isSelected
                                          ? colors.primary
                                          : theme.surfaceSecondary,
                                      },
                                    ]}
                                    onPress={() => {
                                      if (isBetSelected(betId))
                                        toggleBet(betId);
                                      else
                                        toggleBet({
                                          id: betId,
                                          gameId: `${
                                            gameData.id
                                          }_${sportToUse.toLowerCase()}`,
                                          sport: sportToUse,
                                          period: entry.periodID || null,
                                          gameInfo: {
                                            time:
                                              gameData.statusDetail || "TBD",
                                            teams: `${gameData.team1Abbr} @ ${gameData.team2Abbr}`,
                                          },
                                          type: label,
                                          description: `${label} ${side.toUpperCase()}`,
                                          line: displayLine,
                                          odds: oddsVal,
                                        });
                                    }}
                                  >
                                    <Text
                                      style={[
                                        styles.ouLabel,
                                        {
                                          color: isSelected
                                            ? "#fff"
                                            : theme.text,
                                        },
                                      ]}
                                    >
                                      {label}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.ouLine,
                                        {
                                          color: isSelected
                                            ? "#fff"
                                            : theme.text,
                                        },
                                      ]}
                                    >
                                      {displayLine}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.ouOdds,
                                        {
                                          color: isSelected
                                            ? "#fff"
                                            : colors.primary,
                                        },
                                      ]}
                                    >
                                      {oddsVal
                                        ? formatOddsForDisplay(
                                            oddsVal,
                                            oddsDisplay
                                          )
                                        : ""}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                          </View>
                        </View>
                      )}

                      {(altBySide.over.length > 0 ||
                        altBySide.under.length > 0 ||
                        altBySide.other.length > 0) && (
                        <View style={{ marginTop: 8 }}>
                          {altBySide.over.length > 0 && (
                            <View style={{ marginBottom: 6 }}>
                              <Text
                                style={[
                                  {
                                    color: theme.textSecondary,
                                    marginBottom: 6,
                                  },
                                ]}
                              >
                                Alt - Over
                              </Text>
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ paddingVertical: 8 }}
                              >
                                {altBySide.over.slice(0, 100).map((alt, ai) => {
                                  const raw =
                                    alt.overUnder ??
                                    alt.spread ??
                                    alt.line ??
                                    "";
                                  const displayVal =
                                    raw === ""
                                      ? ""
                                      : String(Math.ceil(parseFloat(raw)));
                                  const odds = ensureAmerican(
                                    alt.odds ?? alt.odds
                                  );
                                  const betId = `game-${mi}-${marketLabel
                                    .replace(/\s+/g, "-")
                                    .toLowerCase()}-alt-over-${ai}`;
                                  const isSelected = isBetSelected(betId);
                                  return (
                                    <TouchableOpacity
                                      key={`pc-${mi}-alt-over-${ai}`}
                                      style={[
                                        styles.milestoneButton,
                                        {
                                          borderColor: isSelected
                                            ? colors.primary
                                            : theme.border,
                                          backgroundColor: isSelected
                                            ? colors.primary
                                            : theme.surfaceSecondary,
                                        },
                                      ]}
                                      onPress={() => {
                                        if (isBetSelected(betId))
                                          toggleBet(betId);
                                        else
                                          toggleBet({
                                            id: betId,
                                            gameId: `${
                                              gameData.id
                                            }_${sportToUse.toLowerCase()}`,
                                            sport: sportToUse,
                                            period:
                                              overVariant?.periodID || null,
                                            gameInfo: {
                                              time:
                                                gameData.statusDetail || "TBD",
                                              teams: `${gameData.team1Abbr} @ ${gameData.team2Abbr}`,
                                            },
                                            type: `${marketLabel} (Alt)`,
                                            description: `${displayVal}+`,
                                            line: `${displayVal}+`,
                                            odds: odds,
                                          });
                                      }}
                                    >
                                      <Text
                                        style={[
                                          styles.milestoneValue,
                                          {
                                            color: isSelected
                                              ? "#fff"
                                              : theme.text,
                                          },
                                        ]}
                                      >
                                        {displayVal}+
                                      </Text>
                                      <Text
                                        style={[
                                          styles.milestoneOdds,
                                          {
                                            color: isSelected
                                              ? "#fff"
                                              : colors.primary,
                                          },
                                        ]}
                                      >
                                        {odds
                                          ? formatOddsForDisplay(
                                              odds,
                                              oddsDisplay
                                            )
                                          : ""}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </ScrollView>
                            </View>
                          )}

                          {altBySide.under.length > 0 && (
                            <View style={{ marginBottom: 6 }}>
                              <Text
                                style={[
                                  {
                                    color: theme.textSecondary,
                                    marginBottom: 6,
                                  },
                                ]}
                              >
                                Alt - Under
                              </Text>
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ paddingVertical: 8 }}
                              >
                                {altBySide.under
                                  .slice(0, 100)
                                  .map((alt, ai) => {
                                    const raw =
                                      alt.overUnder ??
                                      alt.spread ??
                                      alt.line ??
                                      "";
                                    const num =
                                      raw === "" ? NaN : parseFloat(raw);
                                    const displayVal = isNaN(num)
                                      ? String(raw)
                                      : String(Math.floor(num));
                                    const odds = ensureAmerican(
                                      alt.odds ?? alt.odds
                                    );
                                    const betId = `game-${mi}-${marketLabel
                                      .replace(/\s+/g, "-")
                                      .toLowerCase()}-alt-under-${ai}`;
                                    const isSelected = isBetSelected(betId);
                                    return (
                                      <TouchableOpacity
                                        key={`pc-${mi}-alt-under-${ai}`}
                                        style={[
                                          styles.milestoneButton,
                                          {
                                            borderColor: isSelected
                                              ? colors.primary
                                              : theme.border,
                                            backgroundColor: isSelected
                                              ? colors.primary
                                              : theme.surfaceSecondary,
                                          },
                                        ]}
                                        onPress={() => {
                                          if (isBetSelected(betId))
                                            toggleBet(betId);
                                          else
                                            toggleBet({
                                              id: betId,
                                              gameId: `${
                                                gameData.id
                                              }_${sportToUse.toLowerCase()}`,
                                              sport: sportToUse,
                                              period:
                                                underVariant?.periodID || null,
                                              gameInfo: {
                                                time:
                                                  gameData.statusDetail ||
                                                  "TBD",
                                                teams: `${gameData.team1Abbr} @ ${gameData.team2Abbr}`,
                                              },
                                              type: `${marketLabel} (Alt)`,
                                              description: `${displayVal}-`,
                                              line: `${displayVal}-`,
                                              odds: odds,
                                            });
                                        }}
                                      >
                                        <Text
                                          style={[
                                            styles.milestoneValue,
                                            {
                                              color: isSelected
                                                ? "#fff"
                                                : theme.text,
                                            },
                                          ]}
                                        >
                                          {displayVal}-
                                        </Text>
                                        <Text
                                          style={[
                                            styles.milestoneOdds,
                                            {
                                              color: isSelected
                                                ? "#fff"
                                                : colors.primary,
                                            },
                                          ]}
                                        >
                                          {odds
                                            ? formatOddsForDisplay(
                                                odds,
                                                oddsDisplay
                                              )
                                            : ""}
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                              </ScrollView>
                            </View>
                          )}

                          {altBySide.other.length > 0 && (
                            <View style={{ marginBottom: 6 }}>
                              <Text
                                style={[
                                  {
                                    color: theme.textSecondary,
                                    marginBottom: 6,
                                  },
                                ]}
                              >
                                Alt - Other
                              </Text>
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ paddingVertical: 8 }}
                              >
                                {altBySide.other
                                  .slice(0, 100)
                                  .map((alt, ai) => {
                                    const displayVal =
                                      alt.spread ??
                                      alt.line ??
                                      alt.overUnder ??
                                      "";
                                    const odds = ensureAmerican(
                                      alt.odds ?? alt.odds
                                    );
                                    const betId = `game-${mi}-${marketLabel
                                      .replace(/\s+/g, "-")
                                      .toLowerCase()}-alt-other-${ai}`;
                                    const isSelected = isBetSelected(betId);
                                    return (
                                      <TouchableOpacity
                                        key={`pc-${mi}-alt-other-${ai}`}
                                        style={[
                                          styles.milestoneButton,
                                          {
                                            borderColor: isSelected
                                              ? colors.primary
                                              : theme.border,
                                            backgroundColor: isSelected
                                              ? colors.primary
                                              : theme.surfaceSecondary,
                                          },
                                        ]}
                                        onPress={() => {
                                          if (isBetSelected(betId))
                                            toggleBet(betId);
                                          else
                                            toggleBet({
                                              id: betId,
                                              gameId: `${
                                                gameData.id
                                              }_${sportToUse.toLowerCase()}`,
                                              sport: sportToUse,
                                              period:
                                                dkBySide.other?.[0]?.periodID ||
                                                null,
                                              type: `${marketLabel} (Alt)`,
                                              description: `${displayVal}`,
                                              line: `${displayVal}`,
                                              odds: odds,
                                            });
                                        }}
                                      >
                                        <Text
                                          style={[
                                            styles.milestoneValue,
                                            {
                                              color: isSelected
                                                ? "#fff"
                                                : theme.text,
                                            },
                                          ]}
                                        >
                                          {String(displayVal)}
                                        </Text>
                                        <Text
                                          style={[
                                            styles.milestoneOdds,
                                            {
                                              color: isSelected
                                                ? "#fff"
                                                : colors.primary,
                                            },
                                          ]}
                                        >
                                          {odds
                                            ? formatOddsForDisplay(
                                                odds,
                                                oddsDisplay
                                              )
                                            : ""}
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                              </ScrollView>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })
              ) : (
                <Text
                  style={[
                    styles.noDataText,
                    { color: theme.textSecondary, marginTop: 8 },
                  ]}
                >
                  No bookmaker markets available
                </Text>
              )}
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
                              uri: `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500${
                                isDarkMode ? "-dark" : ""
                              }/${game.opponentAbbreviation?.toLowerCase()}.png&h=100&w=100`,
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
                              uri: `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500${
                                isDarkMode ? "-dark" : ""
                              }/${game.opponentAbbreviation?.toLowerCase()}.png&h=100&w=100`,
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
            {/* Predicted Win Section */}
            {awayWinPct !== null && homeWinPct !== null && (
              <View style={styles.lastFiveGamesSection}>
                <Text
                  style={[
                    styles.gameLineSectionTitle,
                    { color: theme.text, marginBottom: 12 },
                  ]}
                >
                  Predicted Win %
                </Text>
                <View
                  style={[
                    styles.gameLineTable,
                    { backgroundColor: theme.surfaceSecondary, padding: 16 },
                  ]}
                >
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
                      Win Probability
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
            )}
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
                      {gameData.status !== "pre" ? gameData.score1 : ""}
                    </Text>
                    <Text
                      style={[
                        styles.scoreDivider,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {gameData.status === "pre" ? "-VS-" : "-"}
                    </Text>
                    <Text style={[styles.scoreText, { color: theme.text }]}>
                      {gameData.status !== "pre" ? gameData.score2 : ""}
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
                {gameData.status !== "pre" && (
                  <Text
                    style={[styles.gameDate, { color: theme.textSecondary }]}
                  >
                    {new Date().toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </Text>
                )}
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
          <View style={{ flex: 1, flexDirection: "row", flexWrap: "nowrap" }}>
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
                      textAlign: "center",
                    },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Tab Content */}
        <View style={styles.contentContainer}>{renderTabContent()}</View>
      </ScrollView>

      {/* Bet Slip Bottom Bar */}
      {!isPro && <BannerAdWrapper />}
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

  // Play Participants styles
  participantsSection: {
    paddingVertical: 12,
  },
  participantsTeamGroup: {
    marginBottom: 8,
  },
  participantCard: {
    paddingVertical: 12,
  },
  participantBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  participantTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  headshotWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: "visible",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  headshot: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  headshotPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  teamLogoOverlay: {
    position: "absolute",
    right: -6,
    bottom: -6,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    zIndex: 10,
    elevation: 10,
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: 16,
    fontWeight: "600",
  },
  participantMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  participantStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statBubble: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 11,
    marginTop: 4,
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
  },
  boxScorePlayerImageContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    marginRight: 10,
  },
  boxScorePlayerInfo: {
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
  // ========================================
  // Hockey Rink Styles (for NHL)
  // Base dimensions: 200x150
  // ========================================
  rinkContainer: {
    width: 200,
    height: 150,
    backgroundColor: "white",
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  rinkOutline: {
    position: "absolute",
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderWidth: 2,
    borderColor: "#4A90E2",
    borderRadius: 8,
  },
  centerLine: {
    position: "absolute",
    left: "50%",
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: "#E74C3C",
    marginLeft: -1,
  },
  centerCircleNHL: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#4A90E2",
    left: "50%",
    top: "50%",
    marginLeft: -20,
    marginTop: -20,
  },
  centerDot: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#4A90E2",
    left: "50%",
    top: "50%",
    marginLeft: -2,
    marginTop: -2,
  },
  leftGoalLine: {
    position: "absolute",
    left: "30%",
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: "#4A90E2",
  },
  leftGoalLineBehindCrease: {
    position: "absolute",
    left: 13,
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: "#E74C3C",
  },
  leftFaceoffCircleTop: {
    position: "absolute",
    left: "12.5%",
    top: "10%",
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: "#E74C3C",
    borderRadius: 12,
  },
  leftFaceoffCircleBottom: {
    position: "absolute",
    left: "12.5%",
    bottom: "20%",
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: "#E74C3C",
    borderRadius: 12,
    marginBottom: -12,
  },
  leftFaceoffDotTop: {
    position: "absolute",
    left: "12.5%",
    top: "10%",
    width: 3,
    height: 3,
    backgroundColor: "#E74C3C",
    borderRadius: 1.5,
    marginLeft: 10.5,
    marginTop: 10.5,
  },
  leftFaceoffDotBottom: {
    position: "absolute",
    left: "12.5%",
    bottom: "4%",
    width: 3,
    height: 3,
    backgroundColor: "#E74C3C",
    borderRadius: 1.5,
    marginLeft: 10.5,
    marginBottom: 22.5,
  },
  leftGoalCrease: {
    position: "absolute",
    left: 15,
    top: "47.5%",
    width: 20,
    height: 30,
    backgroundColor: "#87CEEB",
    opacity: 0.3,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    marginTop: -11,
  },
  leftGoalCreaseOutline: {
    position: "absolute",
    left: 15,
    top: "47.5%",
    width: 20,
    height: 30,
    borderRightWidth: 2,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: "#4A90E2",
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    marginTop: -11,
  },
  rightGoalLine: {
    position: "absolute",
    right: "30%",
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: "#4A90E2",
  },
  rightGoalLineBehindCrease: {
    position: "absolute",
    right: 13,
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: "#E74C3C",
  },
  rightFaceoffCircleTop: {
    position: "absolute",
    right: "12.5%",
    top: "10%",
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: "#E74C3C",
    borderRadius: 12,
  },
  rightFaceoffCircleBottom: {
    position: "absolute",
    right: "12.5%",
    bottom: "20%",
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: "#E74C3C",
    borderRadius: 12,
    marginBottom: -12,
  },
  rightFaceoffDotTop: {
    position: "absolute",
    right: "12.5%",
    top: "10%",
    width: 3,
    height: 3,
    backgroundColor: "#E74C3C",
    borderRadius: 1.5,
    marginRight: 10.5,
    marginTop: 10.5,
  },
  rightFaceoffDotBottom: {
    position: "absolute",
    right: "12.5%",
    bottom: "4%",
    width: 3,
    height: 3,
    backgroundColor: "#E74C3C",
    borderRadius: 1.5,
    marginRight: 10.5,
    marginBottom: 22.5,
  },
  rightGoalCrease: {
    position: "absolute",
    right: 15,
    top: "47.5%",
    width: 20,
    height: 30,
    backgroundColor: "#87CEEB",
    opacity: 0.3,
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
    marginTop: -11,
  },
  rightGoalCreaseOutline: {
    position: "absolute",
    right: 15,
    top: "47.5%",
    width: 20,
    height: 30,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: "#4A90E2",
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
    marginTop: -11,
  },
  neutralZoneDotTopLeft: {
    position: "absolute",
    left: "35%",
    top: "25%",
    width: 3,
    height: 3,
    backgroundColor: "#E74C3C",
    borderRadius: 1.5,
    marginTop: 10.5,
  },
  neutralZoneDotTopRight: {
    position: "absolute",
    right: "35%",
    top: "25%",
    width: 3,
    height: 3,
    backgroundColor: "#E74C3C",
    borderRadius: 1.5,
    marginTop: 10.5,
  },
  neutralZoneDotBottomLeft: {
    position: "absolute",
    left: "35%",
    bottom: "25%",
    width: 3,
    height: 3,
    backgroundColor: "#E74C3C",
    borderRadius: 1.5,
    marginBottom: 10.5,
  },
  neutralZoneDotBottomRight: {
    position: "absolute",
    right: "35%",
    bottom: "25%",
    width: 3,
    height: 3,
    backgroundColor: "#E74C3C",
    borderRadius: 1.5,
    marginBottom: 10.5,
  },
  playMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
});

export default BetGameDetailScreen;

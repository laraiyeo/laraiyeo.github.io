import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Image,
  Animated,
  Modal,
  Dimensions,
  Share,
} from "react-native";
import { Ionicons, FontAwesome6 } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { NFLService } from "../../services/NFLService";
import { useTheme } from "../../context/ThemeContext";
import { useFavorites } from "../../context/FavoritesContext";
import ChatComponent from "../../components/ChatComponent";
import useIsLoggedIn from "../../hooks/useIsLoggedIn";
import { useStreamingAccess } from "../../utils/streamingUtils";
import { useGamePresence } from "../../hooks/useGamePresence";
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Circle,
} from "react-native-svg";

// ── Color utilities (matching ScoreboardScreen) ─────────────────────
const parseHexColor = (hex) => {
  if (!hex || typeof hex !== "string") return null;
  const raw = hex.trim().replace("#", "");
  if (raw.length !== 3 && raw.length !== 6) return null;
  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
};

const areColorsSimilar = (colorA, colorB) => {
  const a = parseHexColor(colorA);
  const b = parseHexColor(colorB);
  if (!a || !b) return false;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db) <= 70;
};

const resolveMatchColors = ({
  homePrimary,
  homeSecondary,
  awayPrimary,
  awaySecondary,
  homeFallback,
  awayFallback,
}) => {
  const homeColor = homePrimary ?? homeSecondary ?? homeFallback;
  const awayColor = awayPrimary ?? awaySecondary ?? awayFallback;
  if (!areColorsSimilar(homePrimary, awayPrimary)) {
    return { homeColor, awayColor };
  }
  const awaySecondarySimilar = areColorsSimilar(homePrimary, awaySecondary);
  if (awaySecondarySimilar) {
    return {
      homeColor: homeSecondary ?? homeColor,
      awayColor: awayPrimary ?? awayColor,
    };
  }
  return {
    homeColor: homeSecondary ?? homeColor,
    awayColor: awaySecondary ?? awayColor,
  };
};

const getSmartTeamColors = (homeTeam, awayTeam, colors) => {
  return resolveMatchColors({
    homePrimary: homeTeam?.color ? `#${homeTeam.color}` : null,
    homeSecondary: homeTeam?.alternateColor
      ? homeTeam.alternateColor.startsWith("#")
        ? homeTeam.alternateColor
        : `#${homeTeam.alternateColor}`
      : null,
    awayPrimary: awayTeam?.color ? `#${awayTeam.color}` : null,
    awaySecondary: awayTeam?.alternateColor
      ? awayTeam.alternateColor.startsWith("#")
        ? awayTeam.alternateColor
        : `#${awayTeam.alternateColor}`
      : null,
    homeFallback: colors.primary,
    awayFallback: colors.secondary || "#666",
  });
};

const getTextOnColor = (hex) => {
  const v = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(v)) return "#FFFFFF";
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return l > 0.55 ? "#111111" : "#FFFFFF";
};

const { width } = Dimensions.get("window");

const NflHeaderGradient = ({ homeColor, awayColor, theme, height }) => (
  <View style={[StyleSheet.absoluteFill, { height }]} pointerEvents="none">
    <Svg width={width} height={height} pointerEvents="none">
      <Defs>
        <LinearGradient id="nflHeaderGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={awayColor} stopOpacity="0.3" />
          <Stop
            offset="40%"
            stopColor={theme.surfaceSecondary || theme.surface}
            stopOpacity="0"
          />
          <Stop
            offset="60%"
            stopColor={theme.surfaceSecondary || theme.surface}
            stopOpacity="0"
          />
          <Stop offset="100%" stopColor={homeColor} stopOpacity="0.3" />
        </LinearGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#nflHeaderGrad)" />
    </Svg>
  </View>
);

const NflStatusBadge = ({
  statusMain,
  statusSub,
  isFinished,
  isPre,
  theme,
  colors,
}) => (
  <View style={nflHeaderStyles.statusBadge}>
    <Text
      style={[
        nflHeaderStyles.statusMain,
        {
          color: isFinished
            ? theme.textSecondary
            : isPre
              ? theme.text
              : theme.error || colors.primary,
        },
      ]}
    >
      {statusMain || "--"}
    </Text>
    {!!statusSub && (
      <Text
        style={[
          nflHeaderStyles.statusSub,
          { color: theme.textTertiary || theme.textSecondary },
        ]}
      >
        {statusSub}
      </Text>
    )}
  </View>
);

const NflPlayFieldMini = ({ play, teamColor, startYard, endYard }) => {
  const safeColor = teamColor || "#888888";

  // Field dimensions (landscape, no rotation)
  const fieldWidth = 300;
  const fieldHeight = 130;

  const hasDriveVisualization = startYard != null && endYard != null;

  // Yard markers (same as share card)
  const renderYardMarkers = () => {
    const markers = [];
    const yardNumbers = [10, 20, 30, 40, 50, 40, 30, 20, 10];
    for (let i = 0; i < yardNumbers.length; i++) {
      const leftPosition = 10 + i * 10;
      markers.push(
        <View
          key={`yard-${i}`}
          style={{
            position: "absolute",
            left: `${leftPosition}%`,
            top: 0,
            bottom: 0,
            width: 1,
            backgroundColor: "white",
            opacity: 0.45,
          }}
        />,
      );
      markers.push(
        <View
          key={`hash-top-${i}`}
          style={{
            position: "absolute",
            left: `${leftPosition}%`,
            top: "15%",
            width: 4,
            height: 1.5,
            backgroundColor: "white",
            marginLeft: -1.5,
          }}
        />,
      );
      markers.push(
        <View
          key={`hash-bot-${i}`}
          style={{
            position: "absolute",
            left: `${leftPosition}%`,
            bottom: "15%",
            width: 4,
            height: 1.5,
            backgroundColor: "white",
            marginLeft: -1.5,
          }}
        />,
      );
      markers.push(
        <Text
          key={`lbl-top-${i}`}
          style={{
            position: "absolute",
            left: `${leftPosition}%`,
            top: "3.5%",
            fontSize: 8,
            fontWeight: "800",
            color: "white",
            marginLeft: -4.5,
          }}
        >
          {yardNumbers[i]}
        </Text>,
      );
      markers.push(
        <Text
          key={`lbl-bot-${i}`}
          style={{
            position: "absolute",
            left: `${leftPosition}%`,
            bottom: "3.5%",
            fontSize: 8,
            fontWeight: "800",
            color: "white",
            marginLeft: -4.5,
            transform: [{ rotate: "180deg" }],
          }}
        >
          {yardNumbers[i]}
        </Text>,
      );
    }
    return markers;
  };

  // Hash marks (same as share card)
  const renderHashMarks = () => {
    const marks = [];
    for (let i = 1; i < 100; i++) {
      marks.push(
        <View
          key={`hm-t-${i}`}
          style={{
            position: "absolute",
            left: `${i}%`,
            top: 0,
            width: 1,
            height: 3,
            backgroundColor: "white",
            opacity: 0.35,
          }}
        />,
      );
      marks.push(
        <View
          key={`hm-b-${i}`}
          style={{
            position: "absolute",
            left: `${i}%`,
            bottom: 0,
            width: 1,
            height: 3,
            backgroundColor: "white",
            opacity: 0.35,
          }}
        />,
      );
    }
    return marks;
  };

  // Play/Drive gradient visualization
  const renderDriveGradient = () => {
    if (!hasDriveVisualization) return null;
    const startPosForStart = 100 - startYard;
    const startPosForEnd = 100 - (endYard ?? startYard);
    const start = Math.min(startPosForStart, startPosForEnd);
    const width = Math.abs(startPosForEnd - startPosForStart);

    const gradientId = `drv-g-${startYard}-${endYard}`;
    const lighter = safeColor.startsWith("#") ? `${safeColor}33` : safeColor;
    const darker = safeColor.startsWith("#") ? `${safeColor}FF` : safeColor;
    const startIsLeft = startPosForStart <= startPosForEnd;

    const stops = startIsLeft
      ? [
          <Stop key="s1" offset="0%" stopColor={lighter} stopOpacity={0.35} />,
          <Stop key="s2" offset="100%" stopColor={darker} stopOpacity={0.95} />,
        ]
      : [
          <Stop key="s3" offset="0%" stopColor={darker} stopOpacity={0.95} />,
          <Stop
            key="s4"
            offset="100%"
            stopColor={lighter}
            stopOpacity={0.35}
          />,
        ];

    return (
      <>
        {width > 0 && (
          <Svg
            width="100%"
            height="100%"
            style={{ position: "absolute", left: `${start}%` }}
          >
            <Defs>
              <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                {stops}
              </LinearGradient>
            </Defs>
            <Rect
              x="0"
              y="0"
              width={`${width}%`}
              height="100%"
              fill={`url(#${gradientId})`}
              opacity={1}
            />
          </Svg>
        )}
        <View
          style={{
            position: "absolute",
            left: `${start}%`,
            top: 0,
            bottom: 0,
            width: 1,
            backgroundColor: safeColor,
            opacity: 1,
            marginLeft: -1,
          }}
        />
        {width > 0 && (
          <View
            style={{
              position: "absolute",
              left: `${start + width}%`,
              top: 0,
              bottom: 0,
              width: 1,
              backgroundColor: safeColor,
              opacity: 1,
              marginLeft: -1,
            }}
          />
        )}
      </>
    );
  };

  return (
    <View style={{ width: "100%", overflow: "hidden", marginVertical: 4 }}>
      <View
        style={{
          width: "100%",
          aspectRatio: fieldWidth / fieldHeight,
          backgroundColor: "#2d5016",
          borderWidth: 2,
          borderColor: "#1a3009",
          borderRadius: 4,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Left end zone */}
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "10%",
            backgroundColor: safeColor,
            opacity: 0.65,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 7,
              fontWeight: "800",
              color: "white",
            }}
          >
            NFL
          </Text>
        </View>

        {/* Right end zone */}
        <View
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: "10%",
            backgroundColor: safeColor,
            opacity: 0.65,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 7,
              fontWeight: "800",
              color: "white",
            }}
          >
            NFL
          </Text>
        </View>

        {/* Field interior */}
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

          {/* Midfield line */}
          <View
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              bottom: 0,
              width: 2,
              backgroundColor: "white",
              opacity: 1,
              marginLeft: -0.5,
            }}
          />

          {/* NFL logo */}
          <Image
            source={require("../../../assets/nfl.png")}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 20,
              height: 20,
              marginLeft: -10,
              marginTop: -10,
              opacity: 1,
            }}
            resizeMode="contain"
          />

          {/* Drive gradient visualization */}
          {renderDriveGradient()}
        </View>
      </View>
    </View>
  );
};

const NflTeamSide = ({
  team,
  logo,
  score,
  record,
  side,
  isPre,
  isFinished,
  isWinner,
  isLoser,
  theme,
  colors,
  showPossession,
  onPress,
}) => (
  <View style={nflHeaderStyles.teamSide}>
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <View style={nflHeaderStyles.logoScoreRow}>
        {side === "home" && !isPre ? (
          <Text
            style={[
              nflHeaderStyles.teamScore,
              {
                color: isWinner
                  ? theme.text
                  : isLoser
                    ? theme.textSecondary
                    : theme.text,
                fontWeight: isWinner ? "800" : "400",
              },
            ]}
          >
            {score}
          </Text>
        ) : null}

        <View style={nflHeaderStyles.logoWrap}>
          {showPossession && side === "home" ? (
            <View style={nflHeaderStyles.possessionBadgeHome}>
              <FontAwesome6 name="football" size={10} color={theme.text} />
            </View>
          ) : null}
          <Image
            source={{ uri: logo }}
            style={[
              nflHeaderStyles.teamLogo,
              { opacity: isFinished ? (isWinner ? 1 : 0.55) : 1 },
            ]}
            resizeMode="contain"
          />
          {showPossession && side === "away" ? (
            <View style={nflHeaderStyles.possessionBadgeAway}>
              <FontAwesome6 name="football" size={10} color={theme.text} />
            </View>
          ) : null}
        </View>

        {side === "away" && !isPre ? (
          <Text
            style={[
              nflHeaderStyles.teamScore,
              {
                color: isWinner
                  ? theme.text
                  : isLoser
                    ? theme.textSecondary
                    : theme.text,
                fontWeight: isWinner ? "800" : "400",
              },
            ]}
          >
            {score}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>

    <View style={nflHeaderStyles.teamNameRow}>
      <Text
        style={[
          nflHeaderStyles.teamName,
          {
            color: theme.text,
            opacity: isFinished ? (isWinner ? 1 : 0.55) : 1,
          },
        ]}
        numberOfLines={2}
      >
        {team?.name || team?.abbreviation || ""}
      </Text>
      {record ? (
        <Text
          style={[
            nflHeaderStyles.teamRecord,
            {
              color: theme.textSecondary,
              opacity: isFinished ? (isWinner ? 1 : 0.55) : 1,
            },
          ]}
          numberOfLines={2}
        >
          {record}
        </Text>
      ) : null}
    </View>
  </View>
);

// Component to display play probability like scoreboard copy card
const PlayProbability = ({ probabilityRef, driveTeam, homeTeam, awayTeam }) => {
  const [probabilityData, setProbabilityData] = useState(null);
  const { theme, isDarkMode } = useTheme();

  useEffect(() => {
    let mounted = true;
    const fetchProbability = async () => {
      try {
        const data = await NFLService.getProbability(probabilityRef);
        if (!mounted || !data) return;

        const homeWinPct =
          data.homeWinPercentage ?? data.homeWinProbability ?? 0;
        const awayWinPct =
          data.awayWinPercentage ??
          data.awayWinProbability ??
          (homeWinPct ? 1 - homeWinPct : 0);

        // Determine which team's probability to show based on drive team
        let displayProbability = "";
        let teamLogo = "";

        if (driveTeam?.id === homeTeam?.id) {
          displayProbability = `${(homeWinPct * 100).toFixed(1)}%`;
          teamLogo = homeTeam?.logo;
        } else if (driveTeam?.id === awayTeam?.id) {
          displayProbability = `${(awayWinPct * 100).toFixed(1)}%`;
          teamLogo = awayTeam?.logo;
        } else {
          if (homeWinPct > awayWinPct) {
            displayProbability = `${(homeWinPct * 100).toFixed(1)}%`;
            teamLogo = homeTeam?.logo;
          } else {
            displayProbability = `${(awayWinPct * 100).toFixed(1)}%`;
            teamLogo = awayTeam?.logo;
          }
        }

        setProbabilityData({ displayProbability, teamLogo });
      } catch (error) {
        console.error("Error fetching probability data:", error);
      }
    };

    if (probabilityRef) fetchProbability();

    return () => {
      mounted = false;
    };
  }, [probabilityRef, driveTeam, homeTeam, awayTeam]);

  if (!probabilityData) return null;

  return (
    <View style={styles.playProbability}>
      <Text
        allowFontScaling={false}
        style={[styles.playProbabilityText, { color: theme.textSecondary }]}
      >
        W {probabilityData.displayProbability}
      </Text>
      {probabilityData.teamLogo && (
        <Image
          source={{ uri: NFLService.convertToHttps(probabilityData.teamLogo) }}
          style={styles.playProbabilityLogo}
        />
      )}
    </View>
  );
};

const GameDetailsScreen = ({ route }) => {
  const { gameId, sport } = route.params;
  const navigation = useNavigation();
  const { theme, colors, getTeamLogoUrl, isDarkMode } = useTheme();
  const { isFavorite } = useFavorites();
  const [gameDetails, setGameDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("main"); // Default to main tab
  const [drivesData, setDrivesData] = useState(null);
  const [loadingDrives, setLoadingDrives] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerModalVisible, setPlayerModalVisible] = useState(false);
  const [playerStats, setPlayerStats] = useState(null);
  const [loadingPlayerStats, setLoadingPlayerStats] = useState(false);
  const [gameSituation, setGameSituation] = useState(null);
  const [formattedGameData, setFormattedGameData] = useState(null); // Formatted like scoreboard
  const [selectedDrive, setSelectedDrive] = useState(null);
  const [driveModalVisible, setDriveModalVisible] = useState(false);
  const [selectedDriveIdx, setSelectedDriveIdx] = useState(null);
  const [livePlayIdx, setLivePlayIdx] = useState(0);

  // Reset livePlayIdx to latest play when drives data updates
  useEffect(() => {
    if (!drivesData || drivesData.length === 0) {
      setLivePlayIdx(0);
      return;
    }
    let totalPlays = 0;
    for (const drive of drivesData) {
      totalPlays += (drive.plays || []).length;
    }
    setLivePlayIdx(Math.max(0, totalPlays - 1));
  }, [drivesData]);

  const [expandedNflPlayId, setExpandedNflPlayId] = useState(null);
  const [updateInterval, setUpdateInterval] = useState(null);
  const [lastUpdateHash, setLastUpdateHash] = useState("");
  const [lastSituationHash, setLastSituationHash] = useState("");
  // Game presence tracking
  const { viewerData, isJoined } = useGamePresence(gameId);

  // Stream-related state variables
  const [streamModalVisible, setStreamModalVisible] = useState(false);
  const [currentStreamType, setCurrentStreamType] = useState("alpha");
  const [availableStreams, setAvailableStreams] = useState({});
  const [streamUrl, setStreamUrl] = useState("");
  const [isStreamLoading, setIsStreamLoading] = useState(true);
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const isLoggedIn = useIsLoggedIn();

  // Share card state
  const [shareCardPlay, setShareCardPlay] = useState(null);
  const nflPlayShareCardRef = useRef(null);
  // Player copy-card state (for player modal long-press copy/share)
  const playerCopyCardRef = useRef(null);
  const [isPlayerCardCapturing, setIsPlayerCardCapturing] = useState(false);
  const [playerCardContentHeight, setPlayerCardContentHeight] = useState(0);
  const [playerCopyModalVisible, setPlayerCopyModalVisible] = useState(false);

  // Streaming access check
  const { isUnlocked: isStreamingUnlocked } = useStreamingAccess();
  const scrollY = useMemo(() => new Animated.Value(0), []);
  const [headerH, setHeaderH] = useState(190);
  const [linescoreAvailableW, setLinescoreAvailableW] = useState(0);
  const [teamPositionFilter, setTeamPositionFilter] = useState("ALL");

  // Stream API functions (adapted from MLB)
  const STREAM_API_BASE = "https://streamed.pk/api";
  let liveMatchesCache = null;
  let cacheTimestamp = 0;
  const CACHE_DURATION = 30000; // 30 seconds cache

  const fetchLiveMatches = async () => {
    try {
      const now = Date.now();
      if (liveMatchesCache && now - cacheTimestamp < CACHE_DURATION) {
        return liveMatchesCache;
      }

      const response = await fetch(
        `${STREAM_API_BASE}/matches/american-football`,
      );
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }

      const allMatches = await response.json();

      // Filter matches by american football / nfl
      const matches = allMatches.filter((match) => {
        const matchSport = match.sport || match.category;
        return (
          matchSport === "american-football" ||
          matchSport === "nfl" ||
          (match.title &&
            (match.title.toLowerCase().includes("nfl") ||
              match.title.toLowerCase().includes("football")))
        );
      });

      liveMatchesCache = matches;
      cacheTimestamp = now;

      return matches;
    } catch (error) {
      console.error("Error fetching live matches:", error);
      return [];
    }
  };

  const fetchStreamsForSource = async (source, sourceId) => {
    try {
      const response = await fetch(
        `${STREAM_API_BASE}/stream/${source}/${sourceId}`,
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch streams: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error fetching streams for ${source}:`, error);
      return [];
    }
  };

  // Team name normalization for NFL
  const normalizeNFLTeamName = (teamName) => {
    if (!teamName) return "";

    // NFL-specific team name mappings and normalizations
    const nflTeamMappings = {
      "New York Giants": "new-york-giants",
      "New York Jets": "new-york-jets",
      "Los Angeles Rams": "los-angeles-rams",
      "Los Angeles Chargers": "los-angeles-chargers",
      "Las Vegas Raiders": "las-vegas-raiders",
      "San Francisco 49ers": "san-francisco-49ers",
      "Tampa Bay Buccaneers": "tampa-bay-buccaneers",
      "Green Bay Packers": "green-bay-packers",
      "New England Patriots": "new-england-patriots",
      "Kansas City Chiefs": "kansas-city-chiefs",
    };

    // Check for direct mapping first
    if (nflTeamMappings[teamName]) {
      return nflTeamMappings[teamName];
    }

    return teamName
      .toLowerCase()
      .replace(/á/g, "a")
      .replace(/é/g, "e")
      .replace(/í/g, "i")
      .replace(/ó/g, "o")
      .replace(/ú/g, "u")
      .replace(/ü/g, "u")
      .replace(/ñ/g, "n")
      .replace(/ç/g, "c")
      .replace(/ß/g, "ss")
      .replace(/ë/g, "e")
      .replace(/ï/g, "i")
      .replace(/ö/g, "o")
      .replace(/ä/g, "a")
      .replace(/å/g, "a")
      .replace(/ø/g, "o")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const findNFLMatchStreams = async (homeTeamName, awayTeamName) => {
    try {
      const liveMatches = await fetchLiveMatches();
      if (
        !liveMatches ||
        !Array.isArray(liveMatches) ||
        liveMatches.length === 0
      ) {
        return {};
      }

      // Try to find our match
      const homeNormalized = normalizeNFLTeamName(homeTeamName).toLowerCase();
      const awayNormalized = normalizeNFLTeamName(awayTeamName).toLowerCase();

      let bestMatch = null;
      let bestScore = 0;

      // Process matches to find the best NFL game match
      for (let i = 0; i < Math.min(liveMatches.length, 100); i++) {
        const match = liveMatches[i];

        if (!match.sources || match.sources.length === 0) continue;

        const matchTitle = match.title.toLowerCase();
        let totalScore = 0;

        // NFL-specific matching strategies
        const strategies = [
          // Strategy 1: Direct team name matching in title
          () => {
            let score = 0;
            const titleWords = matchTitle.split(/[\s\-]+/);

            // Check for full team name matches
            if (
              matchTitle.includes(homeNormalized) &&
              matchTitle.includes(awayNormalized)
            ) {
              score += 1.0;
            } else {
              // Check for partial matches with NFL team parts
              const homeParts = homeNormalized
                .split("-")
                .filter((word) => word.length > 2);
              const awayParts = awayNormalized
                .split("-")
                .filter((word) => word.length > 2);

              let homeMatches = 0;
              let awayMatches = 0;

              homeParts.forEach((part) => {
                if (
                  titleWords.some(
                    (word) => word.includes(part) || part.includes(word),
                  )
                )
                  homeMatches++;
              });
              awayParts.forEach((part) => {
                if (
                  titleWords.some(
                    (word) => word.includes(part) || part.includes(word),
                  )
                )
                  awayMatches++;
              });

              if (homeMatches >= 1 && awayMatches >= 1) {
                score += 0.8;
              }
            }

            return score;
          },
          // Strategy 2: Check team objects if available
          () => {
            let score = 0;
            if (match.teams) {
              const homeTeamMatch = match.teams.home?.name?.toLowerCase();
              const awayTeamMatch = match.teams.away?.name?.toLowerCase();

              if (homeTeamMatch && awayTeamMatch) {
                if (
                  homeTeamMatch.includes(homeNormalized.split("-")[0]) &&
                  awayTeamMatch.includes(awayNormalized.split("-")[0])
                ) {
                  score += 0.9;
                }
              }
            }
            return score;
          },
        ];

        // Apply all strategies and sum scores
        strategies.forEach((strategy) => {
          totalScore += strategy();
        });

        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestMatch = match;

          // Early exit if we find a very good match
          if (bestScore >= 1.0) {
            break;
          }
        }
      }

      if (!bestMatch || bestScore < 0.3) {
        return {};
      }

      // Collect only the first stream from each source (like soccer does)
      const allStreams = {};
      for (const source of bestMatch.sources) {
        try {
          const sourceStreams = await fetchStreamsForSource(
            source.source,
            source.id,
          );

          if (sourceStreams && sourceStreams.length > 0) {
            // Only use the first stream from each source type
            const firstStream = sourceStreams[0];
            const sourceKey = source.source; // Use clean source name as key (admin, alpha, bravo, etc.)
            allStreams[sourceKey] = {
              url: firstStream.embedUrl || firstStream.url,
              embedUrl: firstStream.embedUrl || firstStream.url,
              source: source.source,
              title: `${
                source.source.charAt(0).toUpperCase() + source.source.slice(1)
              } Stream`,
            };
          }
        } catch (error) {
          console.error(
            `Error fetching NFL streams for ${source.source}:`,
            error,
          );
        }
      }

      return allStreams;
    } catch (error) {
      console.error("Error in findNFLMatchStreams:", error);
      return {};
    }
  };

  const generateNFLStreamUrl = (
    awayTeamName,
    homeTeamName,
    streamType = "alpha",
  ) => {
    const normalizedAway = normalizeNFLTeamName(awayTeamName);
    const normalizedHome = normalizeNFLTeamName(homeTeamName);

    const streamUrls = {
      alpha: `https://weakstreams.com/nfl-live-streams/${normalizedAway}-vs-${normalizedHome}-live-stream`,
      bravo: `https://sportsurge.club/nfl/${normalizedAway}-vs-${normalizedHome}`,
      charlie: `https://sportshd.me/nfl/${normalizedAway}-${normalizedHome}`,
    };

    return streamUrls[streamType] || streamUrls.alpha;
  };

  // Stream modal functions
  const openStreamModal = async () => {
    try {
      // Check if streaming is unlocked
      if (!isStreamingUnlocked) {
        Alert.alert(
          "Streaming Locked",
          "Please enter the streaming code in Settings to access live streams.",
          [{ text: "OK" }],
        );
        return;
      }

      // Try to locate the competition object in several common locations
      const competition =
        gameDetails?.header?.competitions?.[0] ||
        gameDetails?.competitions?.[0] ||
        formattedGameData?.competitions?.[0];

      if (!competition) {
        console.warn("openStreamModal: competition not found on gameDetails");
        Alert.alert("Error", "Game information not available");
        return;
      }

      // Competitor extraction with multiple fallbacks
      const competitors = competition?.competitors || competition?.teams || [];

      // Find home and away competitors by common keys
      let homeComp =
        competitors.find(
          (c) => c.homeAway === "home" || c.side === "home" || c.isHome,
        ) || null;
      let awayComp =
        competitors.find(
          (c) =>
            c.homeAway === "away" ||
            c.side === "away" ||
            (!c.homeAway && !c.side && !c.isHome),
        ) || null;

      // If still missing, try alternate heuristics (by order)
      if (!homeComp && competitors.length === 2) {
        homeComp =
          competitors[0]?.homeAway === "home" ? competitors[0] : competitors[1];
      }
      if (!awayComp && competitors.length === 2) {
        awayComp =
          competitors[0] === homeComp ? competitors[1] : competitors[0];
      }

      const homeTeam =
        homeComp?.team ||
        homeComp?.team?.team ||
        homeComp?.home ||
        homeComp?.teamData ||
        null;
      const awayTeam =
        awayComp?.team ||
        awayComp?.team?.team ||
        awayComp?.away ||
        awayComp?.teamData ||
        null;

      if (!awayTeam || !homeTeam) {
        console.warn("openStreamModal: team info missing after fallbacks");
        Alert.alert("Error", "Team information not available");
        return;
      }

      // Show modal immediately so user sees something while we fetch
      setAvailableStreams({});
      setStreamUrl("");
      setCurrentStreamType("alpha");
      setStreamModalVisible(true);
      setIsStreamLoading(true);

      // Fetch available streams
      const homeName =
        homeTeam.displayName ||
        homeTeam.name ||
        homeTeam.fullName ||
        homeTeam.abbreviation ||
        "";
      const awayName =
        awayTeam.displayName ||
        awayTeam.name ||
        awayTeam.fullName ||
        awayTeam.abbreviation ||
        "";

      const streams = await findNFLMatchStreams(homeName, awayName);
      setAvailableStreams(streams || {});

      // Generate initial stream URL - use first available stream
      let initialUrl = "";
      let initialStreamType = "";

      const streamKeys = Object.keys(streams || {});
      if (streamKeys.length > 0) {
        // Prioritize certain stream types if available
        const preferredOrder = ["admin", "alpha", "bravo", "charlie", "delta"];
        initialStreamType =
          preferredOrder.find((type) => streamKeys.includes(type)) ||
          streamKeys[0];

        const streamData = streams[initialStreamType];
        initialUrl = streamData?.embedUrl || streamData?.url || streamData;
        setCurrentStreamType(initialStreamType);
      } else {
        // Fallback to manual URL construction
        initialStreamType = "alpha";
        initialUrl = generateNFLStreamUrl(
          awayName,
          homeName,
          initialStreamType,
        );
        setCurrentStreamType(initialStreamType);
      }
      setStreamUrl(initialUrl);
      setIsStreamLoading(false);
    } catch (err) {
      console.error("openStreamModal: caught error", err);
      setIsStreamLoading(false);
      Alert.alert("Error", err?.message || "Failed to open stream");
    }
  };

  const switchStream = (streamType) => {
    setCurrentStreamType(streamType);
    setIsStreamLoading(true);

    let newUrl = "";
    if (availableStreams[streamType]) {
      const streamData = availableStreams[streamType];
      newUrl = streamData.embedUrl || streamData.url || streamData;
    } else {
      // Fallback to manual URL construction
      const awayTeam = gameDetails?.competitions?.[0]?.competitors?.find(
        (comp) => !comp.homeAway || comp.homeAway === "away",
      )?.team;
      const homeTeam = gameDetails?.competitions?.[0]?.competitors?.find(
        (comp) => comp.homeAway === "home",
      )?.team;
      newUrl = generateNFLStreamUrl(
        awayTeam?.displayName || awayTeam?.name,
        homeTeam?.displayName || homeTeam?.name,
        streamType,
      );
    }

    setStreamUrl(newUrl);
    setTimeout(() => setIsStreamLoading(false), 1000);
  };

  const closeStreamModal = () => {
    setStreamModalVisible(false);
    setStreamUrl("");
    setCurrentStreamType("alpha");
    setAvailableStreams({});
  };

  // Helper function to get NFL team abbreviation from ESPN team data
  const getNFLTeamAbbreviation = (espnTeam) => {
    // First try direct abbreviation if available
    if (espnTeam?.abbreviation) {
      return espnTeam.abbreviation;
    }

    // ESPN team ID to abbreviation mapping
    const teamMapping = {
      2: "BUF",
      15: "MIA",
      17: "NE",
      20: "NYJ",
      33: "BAL",
      4: "CIN",
      5: "CLE",
      23: "PIT",
      34: "HOU",
      11: "IND",
      30: "JAX",
      10: "TEN",
      7: "DEN",
      12: "KC",
      13: "LV",
      24: "LAC",
      6: "DAL",
      19: "NYG",
      21: "PHI",
      28: "WAS",
      3: "CHI",
      8: "DET",
      9: "GB",
      16: "MIN",
      1: "ATL",
      29: "CAR",
      18: "NO",
      27: "TB",
      22: "ARI",
      14: "LAR",
      25: "SF",
      26: "SEA",
    };

    const abbr = teamMapping[espnTeam?.id?.toString()];
    if (abbr) {
      return abbr;
    }

    console.warn("No NFL abbreviation mapping found for team:", espnTeam?.id);
    return null;
  };

  // Helper function to get NFL team ID for favorites
  const getNFLTeamId = (espnTeam) => {
    // ESPN team abbreviations to NFL team IDs mapping
    const teamMapping = {
      BUF: "2",
      MIA: "15",
      NE: "17",
      NYJ: "20",
      BAL: "33",
      CIN: "4",
      CLE: "5",
      PIT: "23",
      HOU: "34",
      IND: "11",
      JAX: "30",
      TEN: "10",
      DEN: "7",
      KC: "12",
      LV: "13",
      LAC: "24",
      DAL: "6",
      NYG: "19",
      PHI: "21",
      WAS: "28",
      CHI: "3",
      DET: "8",
      GB: "9",
      MIN: "16",
      ATL: "1",
      CAR: "29",
      NO: "18",
      TB: "27",
      ARI: "22",
      LAR: "14",
      SF: "25",
      SEA: "26",
    };

    let nflId = teamMapping[espnTeam.abbreviation];

    if (!nflId) {
      console.warn(
        "No NFL ID mapping found for team:",
        espnTeam.abbreviation,
        "ESPN ID:",
        espnTeam.id,
        "Using ESPN ID as fallback",
      );
      return espnTeam.id;
    }
    return nflId;
  };

  // Helper to resolve NFL team color from game data (replaces static color map)
  const getGameTeamColor = (
    abbreviation,
    fallback = colors?.primary || "#888888",
  ) => {
    const abbr = String(abbreviation || "").toUpperCase();
    const competitors =
      gameDetails?.header?.competitions?.[0]?.competitors ||
      gameDetails?.competitions?.[0]?.competitors ||
      [];
    for (const comp of competitors) {
      if ((comp?.team?.abbreviation || "").toUpperCase() === abbr) {
        if (comp?.team?.color) return `#${comp.team.color}`;
      }
    }
    return fallback;
  };

  // TeamLogoImage component with fallback support
  const TeamLogoImage = React.memo(({ team, style, isLosingTeam = false }) => {
    const [logoSource, setLogoSource] = useState(() => {
      const teamAbbr = getNFLTeamAbbreviation(team);
      if (teamAbbr) {
        return { uri: getTeamLogoUrl("nfl", teamAbbr) };
      } else {
        return require("../../../assets/nfl.png");
      }
    });
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
      const teamAbbr = getNFLTeamAbbreviation(team);
      if (teamAbbr) {
        setLogoSource({ uri: getTeamLogoUrl("nfl", teamAbbr) });
        setRetryCount(0);
      } else {
        setLogoSource(require("../../../assets/nfl.png"));
      }
    }, [team]);

    const handleError = () => {
      if (retryCount === 0) {
        const teamAbbr = getNFLTeamAbbreviation(team);
        if (teamAbbr) {
          // Try alternative URL format
          setLogoSource({
            uri: `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/${teamAbbr}.png&w=150&h=150`,
          });
          setRetryCount(1);
        } else {
          setLogoSource(require("../../../assets/nfl.png"));
        }
      } else {
        // Final fallback
        setLogoSource(require("../../../assets/nfl.png"));
      }
    };

    return (
      <Image
        style={[style, isLosingTeam && { opacity: 0.5 }]}
        source={logoSource}
        onError={handleError}
        resizeMode="contain"
      />
    );
  });

  useEffect(() => {
    loadGameDetails();

    // Load drives data immediately in parallel
    loadDrives();

    // Also load game situation data in parallel for live games
    loadGameSituation();
  }, [gameId]);

  // Clear data when gameId changes (different game)
  useEffect(() => {
    setDrivesData(null);
    setFormattedGameData(null);
    setGameSituation(null);
    setLastUpdateHash("");
    setLastSituationHash("");
    setSelectedDriveIdx(null);
    setExpandedNflPlayId(null);
  }, [gameId]);

  // Reload data when the screen comes into focus (useful when navigating back)
  useFocusEffect(
    React.useCallback(() => {
      loadGameDetails();

      return () => {
        // Cleanup if needed
      };
    }, [gameId]),
  );

  // Reset team tab state when switching between away/home
  useEffect(() => {
    if (activeTab === "away" || activeTab === "home") {
      setTeamPositionFilter("ALL");
    }
  }, [activeTab]);

  // Set up live updates when gameDetails is loaded
  useEffect(() => {
    if (!gameDetails) return;

    const competition =
      gameDetails.header?.competitions?.[0] || gameDetails.competitions?.[0];
    const status = competition?.status || gameDetails.header?.status;
    const isLiveGame = !status?.type?.completed;

    if (isLiveGame) {
      const interval = setInterval(() => {
        // Skip update if stream modal is open
        if (streamModalVisible) {
          return;
        }

        const statusDesc = status?.type?.description?.toLowerCase();
        const isScheduled = statusDesc?.includes("scheduled");

        loadGameDetails(true); // Silent update - this will update all game data including stats

        // Always update drives for live games since yard line graphic depends on drive data
        if (!isScheduled) {
          loadDrives(true); // Silent update drives for yard line graphic
        }

        // Only load game situation for non-scheduled games
        if (!isScheduled) {
          loadGameSituation(true); // Silent update
        }
      }, 5000);

      setUpdateInterval(interval);

      return () => {
        clearInterval(interval);
      };
    }
  }, [gameDetails, activeTab, drivesData]); // Include all dependencies

  useEffect(() => {
    if (gameDetails) {
      const competition =
        gameDetails.header?.competitions?.[0] || gameDetails.competitions?.[0];
      const status = competition?.status || gameDetails.header?.status;
      const statusDesc = status?.type?.description?.toLowerCase();
      const isScheduled = statusDesc?.includes("scheduled");

      // If we're on drives tab but game is scheduled, switch to main tab
      if (activeTab === "drives" && isScheduled) {
        setActiveTab("main");
      }

      // Only load drives if we're on drives tab, game is not scheduled, and drives data is not already loaded
      if (activeTab === "drives" && !isScheduled && !drivesData) {
        loadDrives();
      }
    }
  }, [activeTab, gameId, gameDetails]);

  // Update selected drive when drives data changes and modal is visible
  useEffect(() => {
    if (driveModalVisible && selectedDrive && drivesData) {
      // Find the updated drive that matches the selected drive ID
      const updatedDrive = drivesData.find(
        (drive) => drive.id === selectedDrive.id,
      );
      if (updatedDrive) {
        setSelectedDrive(updatedDrive);
      }
    }
  }, [drivesData, driveModalVisible, selectedDrive?.id]);

  // Fetch immediately when stream modal closes
  useEffect(() => {
    if (streamModalVisible === false && gameDetails) {
      const competition =
        gameDetails.header?.competitions?.[0] || gameDetails.competitions?.[0];
      const status = competition?.status || gameDetails.header?.status;
      const statusDesc = status?.type?.description?.toLowerCase();
      const isScheduled = statusDesc?.includes("scheduled");

      loadGameDetails(true);

      if (!isScheduled) {
        loadDrives(true);
        loadGameSituation(true);
      }
    }
  }, [streamModalVisible]);

  const loadGameSituation = async (silentUpdate = false) => {
    try {
      // Extract game date from gameDetails to avoid searching multiple dates
      let gameDate = null;
      if (gameDetails) {
        // Try to get date from multiple possible locations in the response
        const competition =
          gameDetails.header?.competitions?.[0] ||
          gameDetails.competitions?.[0];
        if (competition?.date) {
          gameDate = new Date(competition.date);
        } else if (gameDetails.header?.events?.[0]?.date) {
          gameDate = new Date(gameDetails.header.events[0].date);
        } else if (gameDetails.date) {
          gameDate = new Date(gameDetails.date);
        }
      }

      const situation = await NFLService.getGameSituation(gameId, gameDate);

      // Create hash for change detection
      const currentSituationHash = JSON.stringify({
        down: situation?.down,
        distance: situation?.distance,
        yardLine: situation?.yardLine,
        team: situation?.possession,
        quarter: situation?.status?.period,
        clock: situation?.status?.displayClock,
      });

      // Only update state if data has changed
      if (currentSituationHash !== lastSituationHash || !silentUpdate) {
        setGameSituation(situation);
        setLastSituationHash(currentSituationHash);
      }
    } catch (error) {
      if (!silentUpdate) {
        console.error("Error loading game situation:", error);
      }
    }
  };

  const loadGameDetails = async (silentUpdate = false) => {
    try {
      if (!silentUpdate) {
        setLoading(true);
      }
      const details = await NFLService.getGameDetails(gameId);

      // Get the competition data first for both formatting and hash calculation
      const competition =
        details.header?.competitions?.[0] || details.competitions?.[0];
      const status = competition?.status || details.header?.status;

      // Also create formatted game data like scoreboard screen for possession logic
      const formattedGame = NFLService.formatGameForMobile({
        id: gameId,
        competitions: [competition],
        status: status,
      });

      // Create hash for change detection
      const homeTeam = competition?.competitors?.find(
        (c) => c.homeAway === "home",
      );
      const awayTeam = competition?.competitors?.find(
        (c) => c.homeAway === "away",
      );

      const currentHash = JSON.stringify({
        homeScore: homeTeam?.score,
        awayScore: awayTeam?.score,
        status: status?.type?.description,
        clock: status?.displayClock,
        period: status?.period,
        down: status?.down,
        distance: status?.distance,
        yardLine: status?.yardLine,
      });

      // Only update state if data has changed
      if (currentHash !== lastUpdateHash || !silentUpdate) {
        setGameDetails(details);
        setFormattedGameData(formattedGame);
        setLastUpdateHash(currentHash);
      } else {
      }
    } catch (error) {
      if (!silentUpdate) {
        Alert.alert("Error", "Failed to load game details");
      }
      console.error("Error loading game details:", error);
    } finally {
      if (!silentUpdate) {
        setLoading(false);
      }
    }
  };

  const loadDrives = async (silentUpdate = false) => {
    try {
      if (!silentUpdate) {
        setLoadingDrives(true);
      }
      const drives = await NFLService.getDrivesComplete(gameId);

      // For silent updates we previously tried to skip setting state when
      // only minor/uncaptured changes were present. That caused the UI to
      // stop reflecting updated plays after opening a drive (because
      // the in-memory drives list could differ only in nested `plays`). To
      // ensure the drive modal and yardline graphic always stay current,
      // always apply the fresh drives payload, but avoid toggling loading
      // UI when `silentUpdate` is true.
      setDrivesData(drives);
    } catch (error) {
      if (!silentUpdate) {
        console.error("Error loading drives:", error);
      }
    } finally {
      if (!silentUpdate) {
        setLoadingDrives(false);
      }
    }
  };

  const handlePlayerPress = async (player, statCategory, teamInfo = null) => {
    setSelectedPlayer({
      ...player,
      statCategory: statCategory.text || statCategory.name,
      allStats: statCategory,
      team: teamInfo, // Add team info to selectedPlayer
    });
    setPlayerModalVisible(true);
    setLoadingPlayerStats(true);

    try {
      // Use already-fetched boxscore from `gameDetails` to build player stats
      // This avoids an extra network fetch and matches the shape expected
      // by `renderPositionSpecificStats` (i.e. { splits: { categories: [...] } }).
      const boxscorePlayers = gameDetails?.boxscore?.players || [];

      const categoryMap = {};

      // Iterate teams and their statistic categories to find this player's stats
      for (const teamData of boxscorePlayers) {
        if (!teamData || !teamData.statistics) continue;

        for (const statCategory of teamData.statistics) {
          if (!statCategory || !statCategory.athletes) continue;

          for (const athleteData of statCategory.athletes) {
            const athlete = athleteData?.athlete;
            if (!athlete) continue;

            // Athlete id may be string or number
            if (
              athlete.id === player.id ||
              athlete.id === player.id?.toString() ||
              athlete.id?.toString() === player.id?.toString()
            ) {
              categoryMap[statCategory.name] = {
                stats: athleteData.stats || [],
                text: statCategory.text || statCategory.name,
                labels: statCategory.labels || [],
              };
            }
          }
        }
      }

      const categories = Object.keys(categoryMap).map((name) => ({
        name,
        text: categoryMap[name]?.text || name,
        labels: categoryMap[name]?.labels || [],
        stats: categoryMap[name]?.stats || [],
      }));

      if (categories.length > 0) {
        setPlayerStats({ splits: { categories } });
      } else {
        // No per-game boxscore data found for this player; fall back to null
        setPlayerStats(null);
      }
    } catch (error) {
      console.error("Error extracting player stats from boxscore:", error);
      setPlayerStats(null);
    } finally {
      setLoadingPlayerStats(false);
    }
  };

  const closePlayerModal = () => {
    setPlayerModalVisible(false);
    setSelectedPlayer(null);
    setPlayerStats(null);
  };

  // Long-press handler to open the player copy modal (shares card)
  const handlePlayerLongPress = async (
    player,
    statCategory,
    teamInfo = null,
  ) => {
    setSelectedPlayer({
      ...player,
      statCategory: statCategory.text || statCategory.name,
      allStats: statCategory,
      team: teamInfo,
    });
    setPlayerCopyModalVisible(true);
    setLoadingPlayerStats(true);

    try {
      const boxscorePlayers = gameDetails?.boxscore?.players || [];
      const categoryMap = {};

      for (const teamData of boxscorePlayers) {
        if (!teamData || !teamData.statistics) continue;
        for (const statCategoryItem of teamData.statistics) {
          if (!statCategoryItem || !statCategoryItem.athletes) continue;
          for (const athleteData of statCategoryItem.athletes) {
            const athlete = athleteData?.athlete;
            if (!athlete) continue;
            if (
              athlete.id === player.id ||
              athlete.id === player.id?.toString() ||
              athlete.id?.toString() === player.id?.toString()
            ) {
              categoryMap[statCategoryItem.name] = {
                stats: athleteData.stats || [],
                text: statCategoryItem.text || statCategoryItem.name,
                labels: statCategoryItem.labels || [],
              };
            }
          }
        }
      }

      const categories = Object.keys(categoryMap).map((name) => ({
        name,
        text: categoryMap[name]?.text || name,
        labels: categoryMap[name]?.labels || [],
        stats: categoryMap[name]?.stats || [],
      }));

      if (categories.length > 0) {
        setPlayerStats({ splits: { categories } });
      } else {
        setPlayerStats(null);
      }
    } catch (error) {
      console.error("Error extracting player stats for copy modal:", error);
      setPlayerStats(null);
    } finally {
      setLoadingPlayerStats(false);
    }
  };

  const handleDrivePress = async (drive) => {
    setSelectedDrive(drive);
    setDriveModalVisible(true);

    // Check if we need to load plays on demand
    // Load plays if: no hasPlaysData flag OR no plays array OR empty plays array
    const needsPlaysData =
      !drive.hasPlaysData || !drive.plays || drive.plays.length === 0;
    const hasPlaysRef = drive.plays?.$ref || drive.plays?.href;

    if (needsPlaysData && hasPlaysRef) {
      try {
        const playsData = await NFLService.getDrivePlays(drive);

        // Update the drive with the loaded plays data
        const updatedDrive = {
          ...drive,
          plays: playsData,
          hasPlaysData: true,
        };

        // Update the selected drive with plays data
        setSelectedDrive(updatedDrive);

        // Also update the drive in the drives list for future reference
        if (drivesData) {
          const updatedDrivesData = drivesData.map((d) =>
            d.id === drive.id ? updatedDrive : d,
          );
          setDrivesData(updatedDrivesData);
        }
      } catch (error) {
        console.error("Error loading plays for drive:", error);
        // Continue showing the modal even if plays failed to load
      }
    } else if (!hasPlaysRef) {
    } else {
    }
  };

  const closeDriveModal = () => {
    setDriveModalVisible(false);
    setSelectedDrive(null);
  };

  // Handler for long press on plays in drive modal
  const handlePlayPress = async (play, overrideDrive) => {
    try {
      // Get team information for the scoring team
      const driveTeam = overrideDrive?.team || selectedDrive?.team;
      const teamLogo = driveTeam?.logos?.[0]?.href || "";
      const teamColor = driveTeam?.color ? `#${driveTeam.color}` : "#000000";
      const teamAbbr = driveTeam?.abbreviation || "";
      const teamName = driveTeam?.displayName || driveTeam?.name || "";

      // Get current scores
      const homeScore = homeTeam?.score || 0;
      const awayScore = awayTeam?.score || 0;

      // Calculate win probability from cached data (no fetching needed!)
      let winProbability = 50;

      // Check if probability data is already embedded in the play (from drives API)
      if (play.homeTeamWin !== undefined) {
        // The probability is already in the play data from the drives response
        const isHomeTeamDriving = driveTeam?.id === homeTeam?.team?.id;
        let rawProbability = isHomeTeamDriving
          ? play.homeTeamWin
          : 1 - play.homeTeamWin;

        // Convert to percentage if needed
        winProbability =
          rawProbability <= 1 ? rawProbability * 100 : rawProbability;
      } else if (
        gameDetails?.winprobability &&
        Array.isArray(gameDetails.winprobability)
      ) {
        // Use cached win probability data from game summary
        try {
          // Find the probability entry that matches this play's time or sequence
          const probData = gameDetails.winprobability.find(
            (prob) =>
              prob.sequenceNumber === play.sequenceNumber ||
              prob.playId === play.id ||
              (prob.period === play.period &&
                Math.abs(prob.clock - (play.clock || 0)) < 60),
          );

          if (probData) {
            const isHomeTeamDriving = driveTeam?.id === homeTeam?.team?.id;
            let rawProbability = isHomeTeamDriving
              ? probData.homeWinPercentage || probData.homeWinProbability || 50
              : 1 - probData.homeWinPercentage ||
                1 - probData.homeWinProbability ||
                50;

            winProbability =
              rawProbability <= 1 ? rawProbability * 100 : rawProbability;
          } else {
            // Fallback to the most recent probability data
            const recentProb =
              gameDetails.winprobability[gameDetails.winprobability.length - 1];
            if (recentProb) {
              const isHomeTeamDriving = driveTeam?.id === homeTeam?.team?.id;
              let rawProbability = isHomeTeamDriving
                ? recentProb.homeWinPercentage ||
                  recentProb.homeWinProbability ||
                  50
                : recentProb.awayWinPercentage ||
                  recentProb.awayWinProbability ||
                  50;

              winProbability =
                rawProbability <= 1 ? rawProbability * 100 : rawProbability;
            }
          }
        } catch (error) {}
      } else {
        // Final fallback: use a reasonable default based on score difference
        const scoreDiff = homeScore - awayScore;
        const isHomeTeamDriving = driveTeam?.id === homeTeam?.team?.id;

        // Simple heuristic: team with higher score has slight advantage
        if (scoreDiff > 0) {
          winProbability = isHomeTeamDriving ? 55 : 45;
        } else if (scoreDiff < 0) {
          winProbability = isHomeTeamDriving ? 45 : 55;
        } else {
          winProbability = 50; // Tied game
        }
      }

      // Process participant data - extract athlete IDs and find them in cached boxscore data
      let enrichedParticipants = [];
      if (play.participants && play.participants.length > 0) {
        // Helper function to find athlete in boxscore data
        const findAthleteInBoxscore = (athleteId) => {
          if (!gameDetails?.boxscore?.players) return null;

          for (const teamData of gameDetails.boxscore.players) {
            if (teamData.statistics) {
              for (const statCategory of teamData.statistics) {
                if (statCategory.athletes) {
                  for (const athleteData of statCategory.athletes) {
                    const athlete = athleteData.athlete;
                    if (
                      athlete &&
                      (athlete.id === athleteId ||
                        athlete.id === athleteId.toString())
                    ) {
                      return {
                        ...athlete,
                        headshot:
                          {
                            href: `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${athleteId}.png&w=150`,
                          } || athlete.headshot,
                      };
                    }
                  }
                }
              }
            }
          }
          return null;
        };

        // Process each participant
        enrichedParticipants = play.participants
          .map((participant) => {
            // Check if athlete data is already populated (not just a $ref)
            if (
              participant.athlete &&
              typeof participant.athlete === "object" &&
              participant.athlete.displayName
            ) {
              // Data is already available, use it directly
              return {
                ...participant,
                athlete: {
                  ...participant.athlete,
                  headshot:
                    {
                      href: `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${participant.athlete.id}.png&w=150`,
                    } || participant.athlete.headshot,
                },
                team: participant.team || driveTeam,
              };
            }

            // Extract athlete ID from $ref URL
            if (participant.athlete && participant.athlete.$ref) {
              const athleteRef = participant.athlete.$ref;
              const athleteIdMatch = athleteRef.match(/\/athletes\/(\d+)/);

              if (athleteIdMatch) {
                const athleteId = athleteIdMatch[1];

                // Find athlete in cached boxscore data
                const athleteData = findAthleteInBoxscore(athleteId);

                if (athleteData) {
                  return {
                    ...participant,
                    athlete: {
                      ...athleteData,
                      id: athleteId,
                    },
                    team: driveTeam,
                  };
                }
              }
            }

            return null;
          })
          .filter((p) => p !== null);
      }

      // Enrich play with team and game data for the share card
      setShareCardPlay({
        ...play,
        driveTeam,
        teamLogo,
        teamColor,
        teamAbbr,
        teamName,
        homeTeam: homeTeam,
        awayTeam: awayTeam,
        homeScore,
        awayScore,
        winProbability,
        participants: enrichedParticipants,
        gameDetails: gameDetails,
        _drive: overrideDrive || selectedDrive,
      });
    } catch (error) {
      console.error("Error in handlePlayPress:", error);
      // Don't set shareCardPlay if there's an error
    }
  };

  // Helper function to create drive summary text
  const getDriveSummary = (drive) => {
    const parts = [];

    if (drive.plays && drive.plays.length > 0) {
      parts.push(
        `${drive.plays.length} play${drive.plays.length === 1 ? "" : "s"}`,
      );
    }

    if (drive.yards) {
      parts.push(
        `${drive.yards} yard${Math.abs(drive.yards) === 1 ? "" : "s"}`,
      );
    }

    if (drive.timeElapsed && drive.timeElapsed.displayValue) {
      parts.push(drive.timeElapsed.displayValue);
    }

    return parts.length > 0 ? parts.join(", ") : "Drive information";
  };

  // Helper function to render drive yard line graphic
  const renderDriveYardLine = (drive, awayTeam, homeTeam) => {
    if (!drive.start) return null;

    // Use team color directly
    let teamColor = drive.team?.color ? `#${drive.team.color}` : colors.primary;

    // Determine positions based on drive status (following scoreboard.js logic)
    let startYard,
      currentYard,
      driveIsInProgress = false;
    let currentText = "";

    startYard = drive.start.yardLine || 0;
    const driveEndYard = drive.end?.yardLine;
    const hasDriveEnded = driveEndYard !== undefined && driveEndYard !== null;

    if (hasDriveEnded) {
      // Completed drive
      currentYard = driveEndYard;
      currentText = drive.end?.text || `${driveEndYard}`;
    } else {
      // Drive in progress - find most recent play position
      driveIsInProgress = true;
      currentYard = startYard; // Default to start if no plays

      if (drive.plays && drive.plays.length > 0) {
        // Sort plays by sequence to get most recent
        const sortedPlays = [...drive.plays].sort((a, b) => {
          const seqA = parseInt(a.sequenceNumber) || 0;
          const seqB = parseInt(b.sequenceNumber) || 0;
          return seqB - seqA; // Most recent first
        });

        const mostRecentPlay = sortedPlays[0];
        if (mostRecentPlay.end?.yardLine !== undefined) {
          currentYard = mostRecentPlay.end.yardLine;
          currentText = mostRecentPlay.end.text || `${currentYard}`;
        }
      }

      // Fallback to game situation if available
      if (currentYard === startYard && gameSituation?.possession?.yardLine) {
        currentYard = gameSituation.possession.yardLine;
        currentText = `${currentYard}`;
      }
    }

    // Calculate positions (0-100 scale, flip for proper direction)
    const startPosition = Math.max(0, Math.min(100, 100 - startYard));
    const currentPosition = Math.max(0, Math.min(100, 100 - currentYard));

    // Calculate fill area for continuous gradient
    const fillStart = Math.min(startPosition, currentPosition);
    const fillEnd = Math.max(startPosition, currentPosition);
    const fillWidth = fillEnd - fillStart;

    return (
      <View style={styles.driveYardLineContainer}>
        {/* Drive Progress Bar */}
        <View style={styles.driveProgressBar}>
          {/* Base bar */}
          <View
            style={[
              styles.driveBaseBar,
              { backgroundColor: theme.border, borderColor: theme.border },
            ]}
          />

          {/* Progress fill with solid team color */}
          <View
            style={[
              styles.driveProgressFill,
              {
                left: `${fillStart}%`,
                width: `${fillWidth}%`,
                backgroundColor: teamColor,
                opacity: 0.8,
              },
            ]}
          />

          {/* Start marker - centered */}
          <View
            style={[
              styles.driveMarker,
              styles.driveStartMarker,
              {
                left: `${startPosition}%`,
                borderColor: teamColor,
                transform: [{ translateX: -10 }], // Center the marker,
              },
            ]}
          >
            <Text
              allowFontScaling={false}
              style={[styles.driveMarkerText, { color: teamColor }]}
            >
              S
            </Text>
          </View>

          {/* Current/End marker - centered */}
          <View
            style={[
              styles.driveMarker,
              driveIsInProgress
                ? styles.driveCurrentMarker
                : styles.driveEndMarker,
              {
                left: `${currentPosition}%`,
                borderColor: driveIsInProgress ? colors.primary : teamColor,
                backgroundColor: driveIsInProgress
                  ? colors.secondary
                  : teamColor,
                transform: [{ translateX: -10 }], // Center the marker
              },
            ]}
          >
            <Text allowFontScaling={false} style={styles.driveMarkerText}>
              {driveIsInProgress ? "C" : "E"}
            </Text>
          </View>
        </View>

        {/* Yard line labels */}
        <View style={styles.driveYardLabels}>
          <Text
            allowFontScaling={false}
            style={[styles.driveYardLabel, { color: theme.textTertiary }]}
          >
            0
          </Text>
          <Text
            allowFontScaling={false}
            style={[styles.driveYardLabel, { color: theme.textTertiary }]}
          >
            50
          </Text>
          <Text
            allowFontScaling={false}
            style={[styles.driveYardLabel, { color: theme.textTertiary }]}
          >
            0
          </Text>
        </View>
      </View>
    );
  };

  // Render position-specific stats like team-page.js
  const renderPositionSpecificStats = (playerStats, position) => {
    if (!playerStats?.splits?.categories) {
      return (
        <Text allowFontScaling={false} style={styles.noStatsText}>
          No detailed statistics available
        </Text>
      );
    }

    // Get team info for header
    const team = selectedPlayer?.team?.team; // Access the nested team object
    const teamLogo = team?.logos?.[0]?.href || team?.logo;
    const teamName = team?.displayName || team?.name || team?.abbreviation;

    // Convert categories to a lookup object
    const statsLookup = {};
    playerStats.splits.categories.forEach((category) => {
      statsLookup[category.name] = category.stats || [];
    });

    const passingStats = statsLookup.passing || [];
    const rushingStats = statsLookup.rushing || [];
    const receivingStats = statsLookup.receiving || [];
    const defensiveStats = statsLookup.defensive || [];
    const interceptionStats = statsLookup.interceptions || [];
    const kickingStats = statsLookup.kicking || [];
    const puntingStats = statsLookup.punting || [];

    const renderStatRow = (stats, labels) => {
      // Group stats into rows of 3
      const rows = [];
      for (let i = 0; i < Math.max(stats.length, labels.length); i += 3) {
        const rowStats = stats.slice(i, i + 3);
        const rowLabels = labels.slice(i, i + 3);
        rows.push({ stats: rowStats, labels: rowLabels });
      }

      return rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.statsRow}>
          {row.labels.map((label, index) => {
            // Handle both string/number values and objects with displayValue property
            const statValue = row.stats[index];
            let displayValue = "0";

            if (statValue !== undefined && statValue !== null) {
              if (typeof statValue === "object" && statValue.displayValue) {
                displayValue = statValue.displayValue;
              } else if (
                typeof statValue === "object" &&
                statValue.value !== undefined
              ) {
                displayValue = statValue.value.toString();
              } else {
                displayValue = statValue.toString();
              }
            }

            return (
              <View key={`${rowIndex}-${index}`} style={styles.statItem}>
                <Text
                  allowFontScaling={false}
                  style={[styles.statValue, { color: theme.text }]}
                >
                  {displayValue}
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[styles.statLabel, { color: theme.textSecondary }]}
                >
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      ));
    };

    const renderCategoryHeader = (categoryTitle) => (
      <View
        style={[
          styles.statCategoryHeader,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        {team && <TeamLogoImage team={team} style={styles.teamHeaderLogo} />}
        <Text
          allowFontScaling={false}
          style={[styles.teamHeaderName, { color: theme.text }]}
        >
          {teamName}
        </Text>
      </View>
    );

    // Helper function to format category names properly
    const formatCategoryName = (name) => {
      if (!name) return "";

      // Handle compound words like puntReturn, kickReturn, etc.
      const formatted = name
        // Split on capital letters for camelCase
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        // Capitalize first letter of each word
        .replace(/\b\w/g, (l) => l.toUpperCase());

      return formatted;
    };

    // Debug: log the position to see what we're getting

    if (["QB"].includes(position)) {
      // Handle QB stats - check if we have 8 stats and skip the 7th if so
      let qbLabels = ["C/ATT", "PYDS", "PAVG", "PTD", "INT", "S-YDSLST", "RTG"];
      let qbStats = passingStats;

      if (passingStats.length === 8) {
        // Skip the 7th stat (S-YDSLST) and show 1-6 + 8 (RTG)
        qbStats = [
          passingStats[0], // C/ATT
          passingStats[1], // PYDS
          passingStats[2], // PAVG
          passingStats[3], // PTD
          passingStats[4], // INT
          passingStats[5], // S-YDSLST (6th, but will be labeled as 6th)
          passingStats[7], // RTG (8th stat, but will be 7th in display)
        ];
        qbLabels = ["C/ATT", "PYDS", "PAVG", "PTD", "INT", "S-YDSLST", "RTG"];
      }

      return (
        <View>
          {qbStats.length > 0 && (
            <View
              style={[
                styles.statCategory,
                {
                  backgroundColor: colors.primary,
                  borderTopColor: theme.border,
                },
              ]}
            >
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>
                  🏈
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[styles.statCategoryTitle, { color: theme.text }]}
                >
                  Passing
                </Text>
              </View>
              {renderStatRow(qbStats, qbLabels)}
            </View>
          )}
          {rushingStats.length > 0 && (
            <View
              style={[
                styles.statCategory,
                {
                  backgroundColor: theme.surface,
                  borderTopColor: theme.border,
                },
              ]}
            >
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>
                  🏈
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[styles.statCategoryTitle, { color: theme.text }]}
                >
                  Rushing
                </Text>
              </View>
              {renderStatRow(rushingStats, [
                "CAR",
                "RUSH YDS",
                "YDS/CAR",
                "RUSH TD",
                "LNG",
              ])}
            </View>
          )}
        </View>
      );
    } else if (["RB", "FB"].includes(position)) {
      return (
        <View>
          {rushingStats.length > 0 && (
            <View
              style={[
                styles.statCategory,
                {
                  backgroundColor: theme.surface,
                  borderTopColor: theme.border,
                },
              ]}
            >
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>
                  🏈
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[styles.statCategoryTitle, { color: theme.text }]}
                >
                  Rushing
                </Text>
              </View>
              {renderStatRow(rushingStats, [
                "CAR",
                "RUSH YDS",
                "YDS/CAR",
                "RUSH TD",
                "LNG",
              ])}
            </View>
          )}
          {receivingStats.length > 0 && (
            <View
              style={[
                styles.statCategory,
                {
                  backgroundColor: theme.surface,
                  borderTopColor: theme.border,
                },
              ]}
            >
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>
                  🏈
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[styles.statCategoryTitle, { color: theme.text }]}
                >
                  Receiving
                </Text>
              </View>
              {renderStatRow(receivingStats, [
                "REC",
                "REC YDS",
                "YDS/REC",
                "REC TD",
                "LNG",
                "TGT",
              ])}
            </View>
          )}
        </View>
      );
    } else if (["WR", "TE"].includes(position)) {
      return (
        <View>
          {receivingStats.length > 0 && (
            <View
              style={[
                styles.statCategory,
                {
                  backgroundColor: theme.surface,
                  borderTopColor: theme.border,
                },
              ]}
            >
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>
                  🏈
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[styles.statCategoryTitle, { color: theme.text }]}
                >
                  Receiving
                </Text>
              </View>
              {renderStatRow(receivingStats, [
                "REC",
                "REC YDS",
                "YDS/REC",
                "REC TD",
                "LNG",
                "TGT",
              ])}
            </View>
          )}
          {rushingStats.length > 0 && (
            <View
              style={[
                styles.statCategory,
                {
                  backgroundColor: theme.surface,
                  borderTopColor: theme.border,
                },
              ]}
            >
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>
                  🏈
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[styles.statCategoryTitle, { color: theme.text }]}
                >
                  Rushing
                </Text>
              </View>
              {renderStatRow(rushingStats, [
                "CAR",
                "RUSH YDS",
                "YDS/CAR",
                "RUSH TD",
                "LNG",
              ])}
            </View>
          )}
        </View>
      );
    } else if (["DE", "DT", "LB", "OLB", "MLB", "ILB"].includes(position)) {
      return (
        <View>
          {defensiveStats.length > 0 && (
            <View
              style={[
                styles.statCategory,
                {
                  backgroundColor: theme.surface,
                  borderTopColor: theme.border,
                },
              ]}
            >
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>
                  🏈
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[styles.statCategoryTitle, { color: theme.text }]}
                >
                  Defensive
                </Text>
              </View>
              {renderStatRow(defensiveStats, [
                "TOT TCKL",
                "SOLO",
                "SACKS",
                "TFL",
                "PD",
                "QB HIT",
              ])}
            </View>
          )}
        </View>
      );
    } else if (["CB", "S", "FS", "SS", "DB"].includes(position)) {
      return (
        <View>
          {defensiveStats.length > 0 && (
            <View style={styles.statCategory}>
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>
                  🏈
                </Text>
                <Text allowFontScaling={false} style={styles.statCategoryTitle}>
                  Defensive
                </Text>
              </View>
              {renderStatRow(defensiveStats, [
                "TOT TCKL",
                "SOLO",
                "PD",
                "QB HIT",
              ])}
            </View>
          )}
          {interceptionStats.length > 0 && (
            <View style={styles.statCategory}>
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>
                  🏈
                </Text>
                <Text allowFontScaling={false} style={styles.statCategoryTitle}>
                  Interceptions
                </Text>
              </View>
              {renderStatRow(interceptionStats, [
                "INT",
                "INT YDS",
                "LNG",
                "TD",
              ])}
            </View>
          )}
        </View>
      );
    } else if (["K", "P", "PK"].includes(position)) {
      return (
        <View>
          {kickingStats.length > 0 && (
            <View style={styles.statCategory}>
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>
                  🏈
                </Text>
                <Text allowFontScaling={false} style={styles.statCategoryTitle}>
                  Kicking
                </Text>
              </View>
              {renderStatRow(kickingStats, [
                "FG MADE/ATT",
                "FG PCT",
                "LNG",
                "XP MADE/ATT",
                "KICK PTS",
              ])}
            </View>
          )}
          {puntingStats.length > 0 && (
            <View style={styles.statCategory}>
              <View style={styles.statSubcategoryHeader}>
                <Text allowFontScaling={false} style={styles.footballEmoji}>
                  🏈
                </Text>
                <Text allowFontScaling={false} style={styles.statCategoryTitle}>
                  Punting
                </Text>
              </View>
              {renderStatRow(puntingStats, [
                "PUNTS",
                "PUNT YDS",
                "AVG",
                "LNG",
                "IN 20",
              ])}
            </View>
          )}
        </View>
      );
    } else {
      // Default fallback for other positions - use actual stat names instead of "Stat 1, Stat 2"
      return (
        <View>
          {playerStats.splits.categories.map((category, categoryIndex) => {
            // Try to get labels from the category or construct them from stat names
            let statLabels = [];

            if (category.labels && category.labels.length > 0) {
              statLabels = category.labels;
            } else if (category.stats && category.stats.length > 0) {
              // Define common stat patterns for different categories
              const categoryName = (category.name || "").toLowerCase();

              if (categoryName.includes("fumble")) {
                statLabels = ["Fumbles", "Lost", "Recovered"];
              } else if (
                categoryName.includes("penalty") ||
                categoryName.includes("penalties")
              ) {
                statLabels = ["Penalties", "Yards", "First Downs"];
              } else if (categoryName.includes("passing")) {
                // Handle passing stats - check if we have 8 stats and skip the 7th if so
                if (category.stats && category.stats.length === 8) {
                  // Skip the 7th stat (QBR) and show 1-6 + 8 (RTG)
                  // Modify the stats array to exclude the 7th stat
                  category.stats = [
                    category.stats[0], // C/ATT
                    category.stats[1], // YDS
                    category.stats[2], // AVG
                    category.stats[3], // TD
                    category.stats[4], // INT
                    category.stats[5], // SACK
                    category.stats[7], // RTG (skip QBR at index 6)
                  ];
                  statLabels = [
                    "C/ATT",
                    "YDS",
                    "AVG",
                    "TD",
                    "INT",
                    "SACK",
                    "RTG",
                  ];
                } else {
                  // Default 7 stats
                  statLabels = [
                    "C/ATT",
                    "YDS",
                    "AVG",
                    "TD",
                    "INT",
                    "SACK",
                    "RTG",
                  ];
                }
              } else if (categoryName.includes("rushing")) {
                statLabels = ["ATT", "YDS", "AVG", "TD", "LNG"];
              } else if (categoryName.includes("receiving")) {
                statLabels = ["REC", "YDS", "AVG", "TD", "LNG", "TGT"];
              } else if (
                categoryName.includes("defensive") ||
                categoryName.includes("defense")
              ) {
                statLabels = [
                  "TOT",
                  "SOLO",
                  "SACK",
                  "TFL",
                  "PD",
                  "QB HIT",
                  "D TD",
                ];
              } else if (categoryName.includes("kicking")) {
                statLabels = ["FGM/A", "FG%", "LNG", "XPM/A", "PTS"];
              } else if (categoryName.includes("punting")) {
                statLabels = ["PUNTS", "YDS", "AVG", "TB", "IN20", "LNG"];
              } else if (categoryName.includes("return")) {
                statLabels = ["RET", "YDS", "AVG", "LNG", "TD"];
              } else {
                // Try to extract names from the stats themselves as last resort
                statLabels = category.stats.map((stat, index) => {
                  if (stat && typeof stat === "object" && stat.name) {
                    return formatCategoryName(stat.name);
                  }
                  if (stat && typeof stat === "object" && stat.displayName) {
                    return formatCategoryName(stat.displayName);
                  }
                  return `Stat ${index + 1}`;
                });
              }

              // Ensure we have enough labels for all stats
              while (statLabels.length < category.stats.length) {
                statLabels.push(`Stat ${statLabels.length + 1}`);
              }
            } else {
              statLabels = ["No Stats"];
            }

            return (
              <View key={categoryIndex} style={styles.statCategory}>
                <View style={styles.statSubcategoryHeader}>
                  <Text allowFontScaling={false} style={styles.footballEmoji}>
                    🏈
                  </Text>
                  <Text
                    allowFontScaling={false}
                    style={[styles.statCategoryTitle, { color: theme.text }]}
                  >
                    {formatCategoryName(category.displayName || category.name)}
                  </Text>
                </View>
                {category.stats && category.stats.length > 0 ? (
                  renderStatRow(category.stats, statLabels)
                ) : (
                  <Text
                    allowFontScaling={false}
                    style={[styles.noStatsText, { color: theme.text }]}
                  >
                    No stats available
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      );
    }
  };

  // Render player stats in NBA-style grid (category header + tiles)
  const renderPlayerModalGrid = (playerStats) => {
    if (!playerStats?.splits?.categories) return null;

    // Local helper to format category names (camelCase -> Title Case)
    const formatCategoryName = (name) => {
      if (!name) return "";
      return name
        .toString()
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\b\w/g, (l) => l.toUpperCase());
    };

    // Determine which categories to show based on where the player was clicked from
    const clickedCategoryName = (
      selectedPlayer?.allStats?.name || ""
    ).toLowerCase();

    const mapping = {
      passing: ["passing", "rushing"],
      rushing: ["passing", "rushing", "receiving"],
      receiving: ["receiving", "rushing"],
      defensive: ["defensive", "fumbles", "interceptions"],
      defense: ["defensive", "fumbles", "interceptions"],
      fumbles: ["fumbles", "rushing"],
      interceptions: ["interceptions", "passing", "defensive"],
      "kick-returns": ["kickReturns"],
      "punt-returns": ["puntReturns"],
      kicking: ["kicking"],
      punting: ["punting"],
    };

    const allowed = mapping[clickedCategoryName] || [
      clickedCategoryName || null,
    ];

    const normalize = (n) => (n || "").toString().toLowerCase();

    const filtered = playerStats.splits.categories.filter((c) => {
      const n = normalize(c.name) || normalize(c.text);
      return allowed.some((a) => a && n.includes(a.toLowerCase()));
    });

    const toRender =
      filtered.length > 0 ? filtered : playerStats.splits.categories;

    return (
      <View>
        {toRender.map((category, cIndex) => {
          const rawTitle = category.text || formatCategoryName(category.name);
          const labels = category.labels || [];
          const stats = category.stats || [];

          // Strip common team name prefixes more robustly
          const teamObj = selectedPlayer?.team?.team;
          const prefixes = [];
          if (teamObj) {
            prefixes.push(teamObj.displayName || "");
            prefixes.push(teamObj.name || "");
            prefixes.push(teamObj.abbreviation || "");
            const firstWord = (teamObj.displayName || teamObj.name || "").split(
              " ",
            )[0];
            if (firstWord) prefixes.push(firstWord);
          }

          let titleText = rawTitle;

          // Remove common team name prefixes if present
          for (const p of prefixes) {
            if (p && titleText.startsWith(p)) {
              titleText = titleText.slice(p.length).trim();
              titleText = titleText.replace(/^[-–:\s]+/, "");
              break;
            }
          }

          // Prefer canonical mapping headers only (passing, rushing, receiving, etc.)
          // Build a set of canonical tokens from the mapping object defined above.
          const canonicalTokens = new Set();
          try {
            Object.keys(mapping).forEach((k) =>
              canonicalTokens.add(k.toString().toLowerCase()),
            );
            Object.values(mapping).forEach((arr) => {
              (arr || []).forEach((v) =>
                canonicalTokens.add(v.toString().toLowerCase()),
              );
            });
          } catch (err) {
            // fall back silently if mapping isn't available
          }

          const normalizedTitle = (titleText || "").toString().toLowerCase();
          const matched = Array.from(canonicalTokens).find(
            (tok) => tok && normalizedTitle.includes(tok),
          );
          if (matched) {
            titleText = formatCategoryName(matched);
          } else {
            titleText = titleText.replace(/^\w/, (ch) => ch.toUpperCase());
          }

          const tiles = labels.map((label, i) => {
            const statValue = stats[i];
            let displayValue = "0";
            if (statValue !== undefined && statValue !== null) {
              if (typeof statValue === "object" && statValue.displayValue) {
                displayValue = statValue.displayValue;
              } else if (
                typeof statValue === "object" &&
                statValue.value !== undefined
              ) {
                displayValue = statValue.value.toString();
              } else {
                displayValue = statValue.toString();
              }
            }

            return (
              <View
                key={`${cIndex}-${i}`}
                style={[
                  styles.statTile,
                  { backgroundColor: theme.surfaceSecondary },
                ]}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.statTileValue,
                    { color: theme.text, fontSize: 16 },
                  ]}
                >
                  {displayValue}
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.statTileLabel,
                    { color: theme.textSecondary, fontSize: 11 },
                  ]}
                >
                  {label}
                </Text>
              </View>
            );
          });

          return (
            <View
              key={cIndex}
              style={[styles.statCategory, { backgroundColor: theme.surface }]}
            >
              <View style={styles.statSubcategoryHeader}>
                <Text
                  allowFontScaling={false}
                  style={[styles.statCategoryTitle, { color: theme.text }]}
                >
                  {titleText}
                </Text>
              </View>
              <View style={styles.playerStatsGrid}>{tiles}</View>
            </View>
          );
        })}
      </View>
    );
  };

  if (loading) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text
          allowFontScaling={false}
          style={[styles.loadingText, { color: theme.text }]}
        >
          Loading Game Details...
        </Text>
      </View>
    );
  }

  if (!gameDetails) {
    return (
      <View
        style={[styles.errorContainer, { backgroundColor: theme.background }]}
      >
        <Text allowFontScaling={false} style={styles.errorText}>
          Game details not available
        </Text>
      </View>
    );
  }

  // Get the competition data from the correct path
  const competition =
    gameDetails.header?.competitions?.[0] || gameDetails.competitions?.[0];
  const homeTeam = competition?.competitors?.find((c) => c.homeAway === "home");
  const awayTeam = competition?.competitors?.find((c) => c.homeAway === "away");

  // Get game status, venue, and date - using the direct paths like the web app
  const status = competition.status || gameDetails.header?.status;
  const gameDate = competition?.date || competition.header?.date;
  const venue =
    gameDetails.gameInfo.venue.fullName || competition?.venue?.fullName;

  const gameNote = gameDetails.header?.gameNote || null;

  const headerText =
    gameDetails.season?.type !== 3
      ? `${
          gameDetails.header?.season?.type === 1
            ? "Preseason"
            : gameDetails.header?.season?.type === 2
              ? "Regular Season"
              : null
        } Week ${
          gameDetails.header?.week +
          (gameDetails.header?.season?.type === 1 ? -1 : 0)
        }`
      : null;

  // Helper functions for determining losing team styles
  const isGameFinal = status?.type?.completed;
  const awayScore = parseInt(awayTeam?.score || "0");
  const homeScore = parseInt(homeTeam?.score || "0");
  const awayRecord = awayTeam?.record?.[0]?.summary || "";
  const homeRecord = homeTeam?.record?.[0]?.summary || "";
  const isAwayTeamLosing = isGameFinal && awayScore < homeScore;
  const isHomeTeamLosing = isGameFinal && homeScore < awayScore;

  const getTeamScoreStyle = (isLosing) => {
    return isLosing
      ? [styles.teamScore, { color: theme.textSecondary }]
      : [styles.teamScore, { color: colors.primary }];
  };

  const getTeamNameStyle = (isLosing) => {
    return isLosing
      ? [styles.teamName, { color: theme.textSecondary }]
      : [styles.teamName, { color: theme.text }];
  };

  const getStickyTeamScoreStyle = (isLosing) => {
    return isLosing
      ? [styles.stickyTeamScore, { color: theme.textSecondary }]
      : [styles.stickyTeamScore, { color: colors.primary }];
  };

  // Share the player copy card (long-press)
  const sharePlayerCopyCard = async () => {
    try {
      if (!playerCopyCardRef || !playerCopyCardRef.current) {
        console.warn("sharePlayerCopyCard: playerCopyCardRef not available");
        Alert.alert(
          "Unavailable",
          "The player card is not ready to share yet.",
        );
        return;
      }

      setIsPlayerCardCapturing(true);
      await new Promise((resolve) => setTimeout(resolve, 120));

      const uri = await captureRef(playerCopyCardRef.current, {
        format: "png",
        quality: 0.95,
      });

      setIsPlayerCardCapturing(false);

      if (uri) {
        try {
          const sharingAvailable =
            typeof Sharing.isAvailableAsync === "function"
              ? await Sharing.isAvailableAsync()
              : false;
          if (sharingAvailable) {
            await Sharing.shareAsync(uri, {
              dialogTitle: "Share Player Card",
            });
          } else {
            await Share.share({ message: "Player card", url: uri });
          }
        } catch (shareErr) {
          console.warn(
            "Player share failed, falling back to native Share",
            shareErr,
          );
          await Share.share({ message: "Player card", url: uri });
        }
      }
    } catch (e) {
      console.error("Error sharing player card", e);
      setIsPlayerCardCapturing(false);
      Alert.alert("Error", "Failed to share player card");
    }
  };

  // Helper function to render team stats
  const renderTeamStats = (teams) => {
    if (!teams || teams.length < 2) return null;

    const awayStats = teams[0]?.statistics || [];
    const homeStats = teams[1]?.statistics || [];

    // Common stats to display
    const statsToShow = [
      { key: "totalYards", label: "Total Yards" },
      { key: "netPassingYards", label: "Passing Yards" },
      { key: "rushingYards", label: "Rushing Yards" },
      { key: "firstDowns", label: "First Downs" },
      { key: "thirdDownEff", label: "3rd Down Conv" },
      { key: "fourthDownEff", label: "4th Down Conv" },
      { key: "turnovers", label: "Turnovers" },
      { key: "totalPenaltiesYards", label: "Penalties" },
      { key: "sacksYardsLost", label: "Sacks" },
      { key: "possessionTime", label: "Time of Poss" },
    ];

    const findStatValue = (stats, statKey) => {
      const stat = stats.find((s) => s.name === statKey);
      return stat?.displayValue || "-";
    };

    return (
      <View>
        {statsToShow.map((statConfig, index) => {
          const awayValue = findStatValue(awayStats, statConfig.key);
          const homeValue = findStatValue(homeStats, statConfig.key);

          return (
            <View
              key={index}
              style={[styles.statRow, { borderBottomColor: theme.border }]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.statAwayValue, { color: theme.textSecondary }]}
              >
                {awayValue}
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.statLabel, { color: theme.text }]}
              >
                {statConfig.label}
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.statHomeValue, { color: theme.textSecondary }]}
              >
                {homeValue}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  // Helper function to render game leaders
  const renderGameLeaders = (leaders, awayTeam, homeTeam) => {
    if (!leaders || leaders.length === 0) {
      return null;
    }

    // The leaders array contains team objects with their leaders
    const awayTeamLeaders = leaders.find(
      (teamLeader) =>
        teamLeader.team?.id === awayTeam?.team?.id ||
        teamLeader.team?.abbreviation === awayTeam?.team?.abbreviation,
    );

    const homeTeamLeaders = leaders.find(
      (teamLeader) =>
        teamLeader.team?.id === homeTeam?.team?.id ||
        teamLeader.team?.abbreviation === homeTeam?.team?.abbreviation,
    );

    if (!awayTeamLeaders || !homeTeamLeaders) {
      return null;
    }

    // Get leaders for key categories
    const categories = ["passingYards", "rushingYards", "receivingYards"];

    return (
      <View>
        {categories.map((category, categoryIndex) => {
          const awayCategoryData = awayTeamLeaders.leaders?.find(
            (l) => l.name === category,
          );
          const homeCategoryData = homeTeamLeaders.leaders?.find(
            (l) => l.name === category,
          );

          if (
            !awayCategoryData ||
            !homeCategoryData ||
            !awayCategoryData.leaders?.[0] ||
            !homeCategoryData.leaders?.[0]
          ) {
            return null;
          }

          const awayLeader = awayCategoryData.leaders[0];
          const homeLeader = homeCategoryData.leaders[0];

          return (
            <View
              key={categoryIndex}
              style={[
                styles.leaderCategory,
                { backgroundColor: theme.surface },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.leaderCategoryTitle, { color: theme.text }]}
              >
                {awayCategoryData.displayName || category}
              </Text>

              {/* Away Team Leader Row */}
              <View
                style={[
                  styles.leaderPlayerRow,
                  { borderBottomColor: theme.border },
                ]}
              >
                <View style={styles.leaderTeamLogoContainer}>
                  <TeamLogoImage
                    team={awayTeam?.team}
                    style={styles.leaderTeamLogo}
                  />
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.leaderJerseyNumber,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {awayLeader.athlete?.jersey || "#"}
                  </Text>
                </View>
                <Image
                  source={{
                    uri:
                      awayLeader.athlete?.headshot?.href ||
                      "https://via.placeholder.com/40x40?text=P",
                  }}
                  style={styles.leaderHeadshot}
                  defaultSource={{
                    uri: "https://via.placeholder.com/40x40?text=P",
                  }}
                />
                <View style={styles.leaderPlayerInfo}>
                  <View style={styles.leaderNameRow}>
                    <Text
                      allowFontScaling={false}
                      style={[styles.leaderPlayerName, { color: theme.text }]}
                    >
                      {awayLeader.athlete?.shortName ||
                        awayLeader.athlete?.displayName}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.leaderPlayerPosition,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {" "}
                      {awayLeader.athlete?.position?.abbreviation}
                    </Text>
                  </View>
                  <Text
                    allowFontScaling={false}
                    style={[styles.leaderStatsValue, { color: colors.primary }]}
                  >
                    {awayLeader.displayValue}
                  </Text>
                </View>
              </View>

              {/* Home Team Leader Row */}
              <View
                style={[
                  styles.leaderPlayerRow,
                  { borderBottomColor: theme.border },
                ]}
              >
                <View style={styles.leaderTeamLogoContainer}>
                  <TeamLogoImage
                    team={homeTeam?.team}
                    style={styles.leaderTeamLogo}
                  />
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.leaderJerseyNumber,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {homeLeader.athlete?.jersey || "#"}
                  </Text>
                </View>
                <Image
                  source={{
                    uri:
                      homeLeader.athlete?.headshot?.href ||
                      "https://via.placeholder.com/40x40?text=P",
                  }}
                  style={styles.leaderHeadshot}
                  defaultSource={{
                    uri: "https://via.placeholder.com/40x40?text=P",
                  }}
                />
                <View style={styles.leaderPlayerInfo}>
                  <View style={styles.leaderNameRow}>
                    <Text
                      allowFontScaling={false}
                      style={[styles.leaderPlayerName, { color: theme.text }]}
                    >
                      {homeLeader.athlete?.shortName ||
                        homeLeader.athlete?.displayName}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.leaderPlayerPosition,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {" "}
                      {homeLeader.athlete?.position?.abbreviation}
                    </Text>
                  </View>
                  <Text
                    allowFontScaling={false}
                    style={[styles.leaderStatsValue, { color: colors.primary }]}
                  >
                    {homeLeader.displayValue}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  // Helper function to render individual team stats
  const renderIndividualTeamStats = (team, teamType) => {
    if (!gameDetails.boxscore?.teams) return null;

    const teamIndex = teamType === "away" ? 0 : 1;
    const teamStats = gameDetails.boxscore.teams[teamIndex]?.statistics || [];

    const statsToShow = [
      { key: "totalYards", label: "Total Yards" },
      { key: "netPassingYards", label: "Passing Yards" },
      { key: "rushingYards", label: "Rushing Yards" },
      { key: "firstDowns", label: "First Downs" },
      { key: "thirdDownEff", label: "3rd Down Conv" },
      { key: "fourthDownEff", label: "4th Down Conv" },
      { key: "turnovers", label: "Turnovers" },
      { key: "totalPenaltiesYards", label: "Penalties" },
      { key: "sacksYardsLost", label: "Sacks" },
      { key: "possessionTime", label: "Time of Poss" },
    ];

    const findStatValue = (stats, statKey) => {
      const stat = stats.find((s) => s.name === statKey);
      return stat?.displayValue || "-";
    };

    return (
      <View style={styles.individualStatsContainer}>
        {statsToShow.map((statConfig, index) => {
          const value = findStatValue(teamStats, statConfig.key);

          return (
            <View
              key={index}
              style={[
                styles.individualStatRow,
                { borderBottomColor: theme.border },
              ]}
            >
              <Text allowFontScaling={false} style={styles.individualStatLabel}>
                {statConfig.label}
              </Text>
              <Text allowFontScaling={false} style={styles.individualStatValue}>
                {value}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  // Helper function to render individual team leaders
  const renderIndividualTeamLeaders = (team, teamType) => {
    if (!gameDetails.leaders) return null;

    const teamLeaders = gameDetails.leaders.find(
      (teamLeader) =>
        teamLeader.team?.id === team?.team?.id ||
        teamLeader.team?.abbreviation === team?.team?.abbreviation,
    );

    if (!teamLeaders) return null;

    const categories = ["passingYards", "rushingYards", "receivingYards"];

    return (
      <View>
        {categories.map((category, categoryIndex) => {
          const categoryData = teamLeaders.leaders?.find(
            (l) => l.name === category,
          );

          if (!categoryData || !categoryData.leaders?.[0]) {
            return null;
          }

          const leader = categoryData.leaders[0];

          return (
            <View key={categoryIndex} style={styles.individualLeaderCategory}>
              <Text
                allowFontScaling={false}
                style={styles.individualLeaderCategoryTitle}
              >
                {categoryData.displayName || category}
              </Text>

              <View style={styles.individualLeaderPlayerRow}>
                <Image
                  source={{
                    uri:
                      leader.athlete?.headshot?.href ||
                      "https://via.placeholder.com/40x40?text=P",
                  }}
                  style={styles.individualLeaderHeadshot}
                  defaultSource={{
                    uri: "https://via.placeholder.com/40x40?text=P",
                  }}
                />
                <View style={styles.individualLeaderPlayerInfo}>
                  <View style={styles.individualLeaderNameRow}>
                    <Text
                      allowFontScaling={false}
                      style={styles.individualLeaderPlayerName}
                    >
                      {leader.athlete?.shortName || leader.athlete?.displayName}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={styles.individualLeaderPlayerPosition}
                    >
                      {leader.athlete?.position?.abbreviation}
                    </Text>
                  </View>
                  <Text
                    allowFontScaling={false}
                    style={styles.individualLeaderStatsValue}
                  >
                    {leader.displayValue}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  // Helper function to render stats content (NHL-style: possession ring + bar stats + leaders)
  const renderStatsContent = () => {
    const awayStats = gameDetails.boxscore?.teams?.[0]?.statistics || [];
    const homeStats = gameDetails.boxscore?.teams?.[1]?.statistics || [];

    // Parse a stat display value into a number for bar comparison
    const parseStatNum = (val) => {
      if (val == null) return 0;
      const s = String(val);
      // Handle "9-14" style (take first number)
      const slashMatch = s.match(/^(\d+(?:\.\d+)?)/);
      if (slashMatch) return Number(slashMatch[1]) || 0;
      const n = Number(s.replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(n) ? n : 0;
    };

    // Stats to show as bars
    const barStats = [
      { key: "totalYards", label: "Total Yards" },
      { key: "netPassingYards", label: "Passing Yards" },
      { key: "rushingYards", label: "Rushing Yards" },
      { key: "firstDowns", label: "First Downs" },
      { key: "thirdDownEff", label: "3rd Down Conv" },
      { key: "fourthDownEff", label: "4th Down Conv" },
      { key: "turnovers", label: "Turnovers" },
      { key: "totalPenaltiesYards", label: "Penalties" },
      { key: "sacksYardsLost", label: "Sacks" },
    ];

    const findStat = (stats, key) => stats.find((s) => s.name === key);

    // Possession data
    const awayPossStat = findStat(awayStats, "possessionTime");
    const homePossStat = findStat(homeStats, "possessionTime");
    const awayPossSecs = Number(awayPossStat?.value) || 0;
    const homePossSecs = Number(homePossStat?.value) || 0;
    const totalPoss = awayPossSecs + homePossSecs;
    const awayPossPct = totalPoss > 0 ? awayPossSecs / totalPoss : 0.5;
    const homePossPct = totalPoss > 0 ? homePossSecs / totalPoss : 0.5;

    // Possession ring dimensions
    const possRadius = 52;
    const possStroke = 20;
    const possSize = possRadius * 2 + possStroke * 2;
    const possCirc = 2 * Math.PI * possRadius;
    const homePossLen = possCirc * Math.max(0, Math.min(1, homePossPct));

    return (
      <View style={[{ paddingBottom: 40 }]}>
        {/* Stats Card */}
        <View
          style={[
            nflStatsStyles.card,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View
            style={[
              nflStatsStyles.headerRow,
              { borderBottomColor: theme.border },
            ]}
          >
            <Text style={[nflStatsStyles.headerTitle, { color: theme.text }]}>
              Stats
            </Text>
          </View>

          <View style={nflStatsStyles.body}>
            {/* Possession Ring */}
            {totalPoss > 0 && (
              <View style={nflStatsStyles.featureBlock}>
                <Text
                  style={[
                    nflStatsStyles.featureLabel,
                    { color: theme.textSecondary },
                  ]}
                >
                  Time of Possession
                </Text>
                <View style={nflStatsStyles.featureValuesRow}>
                  <Text
                    style={[
                      nflStatsStyles.featureValueText,
                      { color: theme.text },
                    ]}
                  >
                    {awayPossStat?.displayValue || "0:00"}
                  </Text>

                  <View style={nflStatsStyles.faceoffRingWrap}>
                    <Svg
                      width={possSize}
                      height={possSize}
                      style={{ transform: [{ rotate: "-90deg" }] }}
                    >
                      <Circle
                        cx={possSize / 2}
                        cy={possSize / 2}
                        r={possRadius}
                        stroke={awayColor}
                        strokeWidth={possStroke}
                        fill="none"
                      />
                      <Circle
                        cx={possSize / 2}
                        cy={possSize / 2}
                        r={possRadius}
                        stroke={homeColor}
                        strokeWidth={possStroke}
                        fill="none"
                        strokeDasharray={`${homePossLen} ${Math.max(0, possCirc - homePossLen)}`}
                        strokeLinecap="butt"
                      />
                    </Svg>
                    <View
                      style={[
                        nflStatsStyles.faceoffRingInner,
                        { backgroundColor: theme.surface },
                      ]}
                    >
                      <Text
                        style={[
                          nflStatsStyles.faceoffPctText,
                          nflStatsStyles.faceoffPctLeft,
                          { color: theme.text },
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                      >
                        {(awayPossPct * 100).toFixed(1)}%
                      </Text>
                      <View
                        style={[
                          nflStatsStyles.faceoffSplitLine,
                          { backgroundColor: theme.border },
                        ]}
                      />
                      <Text
                        style={[
                          nflStatsStyles.faceoffPctText,
                          nflStatsStyles.faceoffPctRight,
                          { color: theme.text },
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                      >
                        {(homePossPct * 100).toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      nflStatsStyles.featureValueText,
                      { color: theme.text },
                    ]}
                  >
                    {homePossStat?.displayValue || "0:00"}
                  </Text>
                </View>
              </View>
            )}

            {/* Bar Stats */}
            {barStats.map((stat) => {
              const awayVal = findStat(awayStats, stat.key);
              const homeVal = findStat(homeStats, stat.key);
              const awayNum = parseStatNum(awayVal?.displayValue);
              const homeNum = parseStatNum(homeVal?.displayValue);
              const total = awayNum + homeNum;
              const awayShare = total > 0 ? awayNum / total : 0.5;
              const homeShare = total > 0 ? homeNum / total : 0.5;

              return (
                <View key={stat.key} style={nflStatsStyles.statRowWrap}>
                  <View style={nflStatsStyles.statValueRow}>
                    <Text
                      style={[
                        nflStatsStyles.statValueText,
                        { color: theme.text },
                      ]}
                    >
                      {awayVal?.displayValue || "-"}
                    </Text>
                    <Text
                      style={[
                        nflStatsStyles.statValueText,
                        { color: theme.text },
                      ]}
                    >
                      {homeVal?.displayValue || "-"}
                    </Text>
                  </View>
                  <View
                    style={[
                      nflStatsStyles.statBarTrack,
                      { backgroundColor: theme.surfaceSecondary },
                    ]}
                  >
                    <View
                      style={[
                        nflStatsStyles.statBarFillLeft,
                        {
                          width: `${Math.max(0, Math.min(100, awayShare * 100))}%`,
                          backgroundColor: awayColor,
                        },
                      ]}
                    />
                    <View
                      style={[
                        nflStatsStyles.statBarFillRight,
                        {
                          width: `${Math.max(0, Math.min(100, homeShare * 100))}%`,
                          backgroundColor: homeColor,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      nflStatsStyles.statCategoryLabel,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={2}
                  >
                    {stat.label.toUpperCase()}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Game Leaders */}
        {gameDetails?.leaders &&
          renderGameLeaders(gameDetails.leaders, awayTeam, homeTeam) && (
            <View
              style={[
                nflMainStyles.leadersCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <View
                style={[
                  nflMainStyles.leadersHeaderRow,
                  { borderBottomColor: theme.border },
                ]}
              >
                <Text
                  style={[nflMainStyles.leadersTitle, { color: theme.text }]}
                >
                  {isGamePre ? "Team Leaders" : "Game Leaders"}
                </Text>
              </View>
              <View style={nflMainStyles.leadersBody}>
                {renderGameLeaders(gameDetails.leaders, awayTeam, homeTeam)}
              </View>
            </View>
          )}

        {/* Prediction - scheduled games only */}
        {(() => {
          const statusDesc = status?.type?.description?.toLowerCase();
          const isScheduled = statusDesc?.includes("scheduled");
          const predictor = gameDetails.predictor;
          if (!isScheduled || !predictor) return null;

          const awayWinChance = parseFloat(
            predictor.awayTeam?.gameProjection || "0",
          );
          const homeWinChance = parseFloat(
            predictor.homeTeam?.gameProjection || "0",
          );
          const awayTeamColor = awayTeam?.team?.color
            ? `#${awayTeam.team.color}`
            : colors.primary;
          const homeTeamColor = homeTeam?.team?.color
            ? `#${homeTeam.team.color}`
            : colors.secondary;

          return (
            <View
              style={[
                nflMainStyles.leadersCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  marginTop: 14,
                },
              ]}
            >
              <View
                style={[
                  nflMainStyles.leadersHeaderRow,
                  { borderBottomColor: theme.border },
                ]}
              >
                <Text
                  style={[nflMainStyles.leadersTitle, { color: theme.text }]}
                >
                  {predictor.header || "Prediction"}
                </Text>
              </View>
              <View
                style={[nflMainStyles.leadersBody, { paddingVertical: 12 }]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <TeamLogoImage
                      team={awayTeam?.team}
                      style={{ width: 24, height: 24 }}
                    />
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: theme.text,
                      }}
                    >
                      {awayTeam?.team?.abbreviation}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: theme.textSecondary,
                    }}
                  >
                    vs
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: theme.text,
                      }}
                    >
                      {homeTeam?.team?.abbreviation}
                    </Text>
                    <TeamLogoImage
                      team={homeTeam?.team}
                      style={{ width: 24, height: 24 }}
                    />
                  </View>
                </View>
                <View
                  style={{
                    height: 24,
                    borderRadius: 12,
                    flexDirection: "row",
                    overflow: "hidden",
                    backgroundColor: theme.border,
                  }}
                >
                  <View
                    style={{
                      height: "100%",
                      width: `${awayWinChance}%`,
                      backgroundColor: awayTeamColor,
                      borderTopLeftRadius: 12,
                      borderBottomLeftRadius: 12,
                    }}
                  />
                  <View
                    style={{
                      height: "100%",
                      width: `${homeWinChance}%`,
                      backgroundColor: homeTeamColor,
                      borderTopRightRadius: 12,
                      borderBottomRightRadius: 12,
                    }}
                  />
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginTop: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: theme.textSecondary,
                    }}
                  >
                    {awayWinChance.toFixed(1)}%
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: theme.textSecondary,
                    }}
                  >
                    {homeWinChance.toFixed(1)}%
                  </Text>
                </View>
              </View>
            </View>
          );
        })()}
      </View>
    );
  };

  // Helper to render team injury report for scheduled games
  const renderTeamInjuries = (team) => {
    const teamId = team?.team?.id;
    const teamColor = getGameTeamColor(team?.team?.abbreviation);
    const injuries = gameDetails?.injuries || [];
    const teamInjuryData = injuries.find(
      (entry) => String(entry?.team?.id) === String(teamId),
    );
    const injuryList = teamInjuryData?.injuries || [];

    if (injuryList.length === 0) {
      return (
        <View style={{ paddingVertical: 20, alignItems: "center" }}>
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
            No injury report available
          </Text>
        </View>
      );
    }

    return (
      <View style={nflTeamStyles.playerListWrap}>
        {injuryList.map((entry, idx) => {
          const athlete = entry?.athlete;
          if (!athlete) return null;
          const headshotUri =
            athlete?.headshot?.href ||
            `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${athlete.id}.png&w=150`;
          const statusText = entry?.status || entry?.type?.description || "";
          const statusColor = /out/i.test(statusText)
            ? "#e74c3c"
            : /questionable/i.test(statusText)
              ? "#f39c12"
              : /doubtful/i.test(statusText)
                ? "#e67e22"
                : theme.textSecondary;
          const injuryType = entry?.details?.type || "";
          const injuryLocation = entry?.details?.location || "";
          const injuryDetail = entry?.details?.detail !== "Not Specified" ? entry?.details?.detail : null;
          const returnDate = entry?.details?.returnDate
            ? new Date(entry.details.returnDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            : "";

          return (
            <View
              key={athlete.id || idx}
              style={[
                nflTeamStyles.playerCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: teamColor,
                },
              ]}
            >
              <View style={nflTeamStyles.playerCardTopRow}>
                <View
                  style={[
                    nflTeamStyles.playerCardHeadshotWrap,
                    {
                      backgroundColor: teamColor + "33",
                      borderColor: teamColor,
                    },
                  ]}
                >
                  <Image
                    source={{ uri: headshotUri }}
                    style={nflTeamStyles.playerCardHeadshot}
                    resizeMode="cover"
                  />
                </View>
                <View style={nflTeamStyles.playerCardNameBlock}>
                  <Text
                    style={[
                      nflTeamStyles.playerCardName,
                      { color: theme.text },
                    ]}
                    numberOfLines={1}
                  >
                    {athlete.displayName ||
                      athlete.fullName ||
                      `${athlete.firstName || ""} ${athlete.lastName || ""}`.trim()}
                  </Text>
                  <Text
                    style={[
                      nflTeamStyles.playerCardMeta,
                      { color: theme.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {athlete.jersey ? `#${athlete.jersey}` : ""}
                    {athlete.jersey && athlete.position?.abbreviation
                      ? " · "
                      : ""}
                    {athlete.position?.displayName || ""}
                  </Text>
                </View>
              </View>

              {/* Injury details row */}
              <View style={nflTeamStyles.playerCardStatsRow}>
                <View style={nflTeamStyles.playerCardStatCell}>
                  <Text
                    style={[styles.injuryStatusBadge, { color: statusColor }]}
                  >
                    {statusText.charAt(0).toUpperCase() + statusText.slice(1)}
                  </Text>
                  <Text
                    style={[
                      styles.injuryStatusLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Status
                  </Text>
                </View>
                <View style={nflTeamStyles.playerCardStatCell}>
                  <Text
                    style={[styles.injuryDetailValue, { color: theme.text }]}
                  >
                    {injuryType || "\u2014"}
                  </Text>
                  <Text
                    style={[
                      styles.injuryStatusLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Injury
                  </Text>
                </View>
                <View style={nflTeamStyles.playerCardStatCell}>
                  <Text
                    style={[styles.injuryDetailValue, { color: theme.text }]}
                  >
                    {[injuryDetail, injuryLocation].filter(Boolean).join(" · ") ||
                      "\u2014"}
                  </Text>
                  <Text
                    style={[
                      styles.injuryStatusLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Location
                  </Text>
                </View>
                <View style={nflTeamStyles.playerCardStatCell}>
                  <Text
                    style={[styles.injuryDetailValue, { color: theme.text }]}
                  >
                    {returnDate || "\u2014"}
                  </Text>
                  <Text
                    style={[
                      styles.injuryStatusLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Return
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  // Helper function to render team-specific content
  const renderTeamContent = (team, teamType) => {
    const statusDesc = status?.type?.description?.toLowerCase();
    const isScheduled = statusDesc?.includes("scheduled");

    if (!gameDetails.boxscore?.players && !isScheduled) {
      return (
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text
            allowFontScaling={false}
            style={[styles.placeholderText, { color: theme.textSecondary }]}
          >
            Box score data not available
          </Text>
        </View>
      );
    }

    if (isScheduled) {
      return (
        <View
          style={[
            styles.section,
            {
              backgroundColor: theme.background,
              paddingBottom: 40,
              paddingHorizontal: 0,
            },
          ]}
        >
          {renderTeamInjuries(team)}
        </View>
      );
    }

    const teamBoxScore = gameDetails.boxscore.players.find(
      (playerTeam) =>
        playerTeam.team?.id === team?.team?.id ||
        playerTeam.team?.abbreviation === team?.team?.abbreviation,
    );

    if (!teamBoxScore || !teamBoxScore.statistics) {
      return (
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text
            allowFontScaling={false}
            style={[styles.placeholderText, { color: theme.textSecondary }]}
          >
            No statistics available for this team
          </Text>
        </View>
      );
    }

    // Build filter categories from the statistics array names
    const statCategories = teamBoxScore.statistics
      .filter((cat) => cat.athletes && cat.athletes.length > 0)
      .map((cat) => ({
        name: cat.name,
        text: cat.text || cat.name,
        labels: cat.labels || [],
      }));

    const categoryNames = statCategories.map((c) => c.name);
    const activeFilter =
      teamPositionFilter && categoryNames.includes(teamPositionFilter)
        ? teamPositionFilter
        : categoryNames[0] || "";

    // Format category name: capitalize first letter, split on caps
    const fmtCatName = (name) => {
      if (!name) return "";
      return name
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase())
        .trim();
    };

    // Get player stats for the active category
    const getPlayerStats = (athlete) => {
      const cat = teamBoxScore.statistics.find((c) => c.name === activeFilter);
      if (!cat) return [];
      const entry = cat.athletes?.find(
        (a) =>
          a.athlete?.id === athlete?.id ||
          a.athlete?.id === athlete?.id?.toString(),
      );
      if (!entry) return [];
      const labels = cat.labels || [];
      return entry.stats
        ? entry.stats.slice(0, 6).map((val, i) => ({
            label: labels[i] || `S${i + 1}`,
            value: String(val ?? "0"),
          }))
        : [];
    };

    // Build flat player list for the selected category
    const playersList = [];
    const seenIds = new Set();
    const sourceCategories = teamBoxScore.statistics.filter(
      (c) => c.name === activeFilter,
    );

    sourceCategories.forEach((cat) => {
      (cat.athletes || []).forEach((entry) => {
        const athlete = entry.athlete;
        if (!athlete || seenIds.has(athlete.id)) return;
        seenIds.add(athlete.id);
        const stats = getPlayerStats(athlete);
        if (stats.length > 0) {
          playersList.push({ athlete, stats });
        }
      });
    });

    const teamColor = getGameTeamColor(team?.team?.abbreviation);

    return (
      <View style={{ paddingTop: 12, paddingBottom: 40 }}>
        {/* Category filter bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={nflTeamStyles.posBarContent}
        >
          {categoryNames.map((catName) => {
            const isActive = activeFilter === catName;
            return (
              <TouchableOpacity
                key={catName}
                activeOpacity={0.8}
                onPress={() => setTeamPositionFilter(catName)}
                style={[
                  nflTeamStyles.posChip,
                  {
                    borderColor: isActive ? teamColor : theme.border,
                    backgroundColor: isActive
                      ? teamColor + "22"
                      : theme.surface,
                  },
                ]}
              >
                <Text
                  style={[
                    nflTeamStyles.posChipLabel,
                    {
                      color: isActive ? theme.text : theme.textSecondary,
                      fontWeight: isActive ? "800" : "600",
                    },
                  ]}
                >
                  {fmtCatName(catName)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Player cards */}
        <View style={nflTeamStyles.playerListWrap}>
          {playersList.length === 0 ? (
            <View style={nflTeamStyles.emptyWrap}>
              <Text
                style={[
                  nflTeamStyles.emptyText,
                  { color: theme.textSecondary },
                ]}
              >
                No players found
              </Text>
            </View>
          ) : (
            playersList.map((playerData, idx) => {
              const athlete = playerData.athlete;
              const headshotUri =
                `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${athlete?.id}.png&w=150` ||
                athlete?.headshot?.href;

              return (
                <TouchableOpacity
                  key={athlete?.id || idx}
                  activeOpacity={0.8}
                  onPress={() => {
                    const cat =
                      teamBoxScore.statistics.find(
                        (c) => c.name === activeFilter,
                      ) || teamBoxScore.statistics[0];
                    if (cat) handlePlayerLongPress(athlete, cat, team);
                  }}
                  style={[
                    nflTeamStyles.playerCard,
                    {
                      backgroundColor: theme.surface,
                      borderColor: teamColor,
                    },
                  ]}
                >
                  <View style={nflTeamStyles.playerCardTopRow}>
                    <View
                      style={[
                        nflTeamStyles.playerCardHeadshotWrap,
                        {
                          backgroundColor: teamColor + "33",
                          borderColor: teamColor,
                        },
                      ]}
                    >
                      <Image
                        source={{ uri: headshotUri }}
                        style={nflTeamStyles.playerCardHeadshot}
                        resizeMode="cover"
                      />
                    </View>
                    <View style={nflTeamStyles.playerCardNameBlock}>
                      <Text
                        style={[
                          nflTeamStyles.playerCardName,
                          { color: theme.text },
                        ]}
                        numberOfLines={1}
                      >
                        {athlete?.displayName ||
                          `${athlete?.firstName || ""} ${athlete?.lastName || ""}`.trim() ||
                          "Unknown"}
                      </Text>
                      <Text
                        style={[
                          nflTeamStyles.playerCardMeta,
                          { color: theme.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {athlete?.jersey ? `#${athlete.jersey}` : ""}
                        {athlete?.jersey && athlete?.position?.abbreviation
                          ? " · "
                          : ""}
                        {athlete?.position?.abbreviation || ""}
                      </Text>
                    </View>
                  </View>

                  {/* Stats row (up to 6 stats, like NHL) */}
                  <View style={nflTeamStyles.playerCardStatsRow}>
                    {playerData.stats.map((stat, i) => (
                      <View key={i} style={nflTeamStyles.playerCardStatCell}>
                        <Text
                          style={[
                            nflTeamStyles.playerCardStatValue,
                            { color: theme.text },
                          ]}
                          numberOfLines={1}
                        >
                          {stat.value}
                        </Text>
                        <Text
                          style={[
                            nflTeamStyles.playerCardStatLabel,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {stat.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </View>
    );
  };

  // ── Drives tab: win probability lookup ─────────────────────────────
  const getPlayWinPct = (play, driveTeamId) => {
    if (!play) return null;
    const wpArr = gameDetails?.winprobability;
    if (!Array.isArray(wpArr) || wpArr.length === 0) return null;

    // Try matching by playId
    const playId = String(play.id || "");
    let entry = wpArr.find((w) => String(w.playId) === playId);

    // Fallback: find nearest by sequence
    if (!entry) {
      const seq = Number(play.sequenceNumber) || 0;
      let best = null;
      let bestDist = Infinity;
      for (const w of wpArr) {
        const wSeq = Number(w.playId?.replace(/\D/g, "")) || 0;
        const dist = Math.abs(wSeq - seq);
        if (dist < bestDist) {
          bestDist = dist;
          best = w;
        }
      }
      if (best && bestDist < 500) entry = best;
    }

    if (!entry) return null;
    const homePct = entry.homeWinPercentage ?? entry.homeWinProbability ?? 0.5;
    const isHomeDriving = String(driveTeamId) === String(homeTeam?.team?.id);
    const raw = isHomeDriving ? homePct : 1 - homePct;
    return Math.round(raw * 1000) / 10; // one decimal
  };

  // ── Drives tab content (NHL Plays-style layout) ────────────────────
  const renderDrivesContent = () => {
    if (loadingDrives && !drivesData) {
      return (
        <View style={nflDrivesStyles.emptyWrap}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text
            style={[nflDrivesStyles.emptyText, { color: theme.textSecondary }]}
          >
            Loading drives…
          </Text>
        </View>
      );
    }

    if (!drivesData || drivesData.length === 0) {
      return (
        <View style={nflDrivesStyles.emptyWrap}>
          <Text
            style={[nflDrivesStyles.emptyText, { color: theme.textSecondary }]}
          >
            No drive information available
          </Text>
        </View>
      );
    }

    // drivesData is chronological; we display reversed (last first)
    const totalDrives = drivesData.length;
    const reversedDrives = [...drivesData].reverse();

    // Auto-select last drive on first render (which is first in reversed list = index 0)
    const activeIdx = selectedDriveIdx !== null ? selectedDriveIdx : 0;
    // Map from reversed index back to original index
    const origIdx = totalDrives - 1 - activeIdx;
    const activeDrive = drivesData[origIdx] || drivesData[totalDrives - 1];
    const activeDriveNum = origIdx + 1;

    // Plays for the active drive (reversed - last play first)
    const drivePlays = [...(activeDrive?.plays || [])].reverse();

    // Team info for the active drive
    const driveTeamId = activeDrive?.team?.id;
    const driveTeamAbbr = activeDrive?.team?.abbreviation || "";
    const driveTeamColor = getGameTeamColor(driveTeamAbbr);
    const driveIsTD = activeDrive?.isScore;

    return (
      <View style={nflDrivesStyles.sectionWrap}>
        {/* ── Drive selector bar ──────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={nflDrivesStyles.driveBarContent}
        >
          {reversedDrives.map((drive, revIdx) => {
            const origDriveIdx = totalDrives - 1 - revIdx;
            const num = origDriveIdx + 1;
            const isActive = revIdx === activeIdx;
            const team = drive.team;
            const abbr = team?.abbreviation || "";
            const teamColor = getGameTeamColor(abbr);
            const isTD = drive.isScore;
            const teamLogo = team?.logos?.[0]?.href || team?.logo || "";

            return (
              <TouchableOpacity
                key={`drv-${drive.id || revIdx}`}
                activeOpacity={0.8}
                onPress={() => {
                  setSelectedDriveIdx(revIdx);
                  setExpandedNflPlayId(null);
                }}
                style={[
                  nflDrivesStyles.driveChip,
                  {
                    borderColor: isActive ? teamColor : theme.border,
                    backgroundColor: isTD
                      ? teamColor + "33"
                      : isActive
                        ? theme.surfaceSecondary
                        : theme.surface,
                  },
                ]}
              >
                {teamLogo ? (
                  <Image
                    source={{ uri: teamLogo }}
                    style={nflDrivesStyles.driveChipLogo}
                    resizeMode="contain"
                  />
                ) : null}
                <Text
                  style={[
                    nflDrivesStyles.driveChipLabel,
                    {
                      color: isActive ? theme.text : theme.textSecondary,
                      fontWeight: isActive ? "800" : "600",
                    },
                  ]}
                >
                  {num}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Drive result banner ─────────────────────────────────── */}
        <View
          style={[
            nflDrivesStyles.driveBanner,
            {
              backgroundColor: theme.surfaceSecondary,
              flexDirection: "row",
              borderColor: activeDrive?.team?.color
                ? getGameTeamColor(activeDrive.team.abbreviation)
                : theme.border,
            },
          ]}
        >
          <View
            style={[{ flex: 1, justifyContent: "center", paddingRight: 8 }]}
          >
            <Text
              style={[nflDrivesStyles.driveBannerTitle, { color: theme.text }]}
            >
              Drive {activeDriveNum}
            </Text>
            <Text
              style={[
                nflDrivesStyles.driveBannerResult,
                { color: driveIsTD ? driveTeamColor : theme.textSecondary },
              ]}
            >
              {activeDrive?.displayResult ||
                activeDrive?.result ||
                "In Progress"}
            </Text>
            {!!activeDrive?.description && (
              <Text
                style={[
                  nflDrivesStyles.driveBannerDesc,
                  { color: theme.textTertiary },
                ]}
              >
                {activeDrive.description}
              </Text>
            )}
          </View>
          <View style={[{ alignItems: "center", justifyContent: "center" }]}>
            {activeDrive?.team?.logo ? (
              <Image
                source={{ uri: activeDrive.team.logo }}
                style={nflDrivesStyles.bubbleLogo}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </View>

        {/* ── Play cards (NHL Plays-style) ────────────────────────── */}
        <View style={nflDrivesStyles.playsWrap}>
          {drivePlays.length === 0 ? (
            <View style={nflDrivesStyles.emptyWrap}>
              <Text
                style={[
                  nflDrivesStyles.emptyText,
                  { color: theme.textSecondary },
                ]}
              >
                No plays available for this drive
              </Text>
            </View>
          ) : (
            drivePlays.map((play, pIdx) => {
              const playId = play.id || `p-${pIdx}`;
              const isExpanded = expandedNflPlayId === playId;

              // Period + clock
              const period = play.period?.number || 0;
              const clock = play.clock?.displayValue || "";
              const periodLabel =
                period <= 4
                  ? `Q${period}`
                  : period > 4
                    ? `OT${period - 4}`
                    : "";

              // Play type
              const playType = play.type?.text || play.type?.abbreviation || "";

              // Play text
              const playText = play.text || play.shortText || "";

              // Down & distance
              const ddText =
                play.start?.downDistanceText ||
                play.end?.downDistanceText ||
                "";

              // Win probability
              const winPct = getPlayWinPct(play, driveTeamId);

              // Scoring play?
              const isScoring = !!play.scoringPlay;

              // Expandable?
              const hasYardLine =
                play.start?.yardLine !== undefined ||
                play.end?.yardLine !== undefined;
              const canExpand = hasYardLine || isScoring;

              // Team color for card border
              const cardBorderColor = isScoring ? driveTeamColor : theme.border;

              return (
                <View key={playId} style={nflDrivesStyles.playRowWrap}>
                  {/* Time column */}
                  <View style={nflDrivesStyles.playTimeCol}>
                    <Text
                      style={[
                        nflDrivesStyles.playClockText,
                        { color: theme.text },
                      ]}
                    >
                      {clock || "--:--"}
                    </Text>
                    <Text
                      style={[
                        nflDrivesStyles.playPeriodText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {periodLabel}
                    </Text>
                  </View>

                  {/* Play card */}
                  <TouchableOpacity
                    activeOpacity={canExpand ? 0.85 : 1}
                    disabled={!canExpand}
                    onPress={() =>
                      setExpandedNflPlayId((prev) =>
                        prev === playId ? null : playId,
                      )
                    }
                    style={[
                      nflDrivesStyles.playCard,
                      {
                        borderColor: cardBorderColor,
                        backgroundColor: isScoring
                          ? driveTeamColor + "18"
                          : theme.surface,
                      },
                    ]}
                  >
                    {/* Header row: type + W% */}
                    <View style={nflDrivesStyles.playCardHeaderRow}>
                      <Text
                        style={[
                          nflDrivesStyles.playTypeLabel,
                          { color: isScoring ? driveTeamColor : theme.text },
                        ]}
                      >
                        {playType}
                      </Text>
                      <View
                        style={[{ flexDirection: "row", alignItems: "center" }]}
                      >
                        <Text
                          style={[
                            nflDrivesStyles.playScore,
                            {
                              color: isScoring ? driveTeamColor : theme.text,
                              fontWeight:
                                play.awayScore < play.homeScore ? "500" : "800",
                            },
                          ]}
                        >
                          {play.awayScore ?? null}
                        </Text>
                        <Text
                          style={[
                            nflDrivesStyles.playScore,
                            { color: isScoring ? driveTeamColor : theme.text },
                          ]}
                        >
                          &nbsp;-&nbsp;
                        </Text>
                        <Text
                          style={[
                            nflDrivesStyles.playScore,
                            {
                              color: isScoring ? driveTeamColor : theme.text,
                              fontWeight:
                                play.awayScore > play.homeScore ? "500" : "800",
                            },
                          ]}
                        >
                          {play.homeScore ?? null}
                        </Text>
                      </View>
                    </View>

                    {/* Main description */}
                    <Text
                      style={[
                        nflDrivesStyles.playMainText,
                        { color: theme.text },
                      ]}
                    >
                      {playText}
                    </Text>

                    {!!ddText || winPct !== null ? (
                      <View
                        style={[
                          {
                            flexDirection: "row",
                            alignItems: "center",
                            marginTop: 4,
                          },
                        ]}
                      >
                        {/* Down & distance sub-line */}
                        {!!ddText && (
                          <Text
                            style={[
                              nflDrivesStyles.playSubText,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {ddText}
                          </Text>
                        )}
                        {winPct !== null && (
                          <Text
                            style={[
                              nflDrivesStyles.playWinPct,
                              { color: theme.textSecondary },
                            ]}
                          >
                            W {winPct.toFixed(1)}%
                          </Text>
                        )}
                      </View>
                    ) : null}

                    {/* Expanded: field display + share */}
                    {isExpanded && (
                      <View style={nflDrivesStyles.playExpandedWrap}>
                        {/* Field visualization */}
                        {hasYardLine &&
                          (() => {
                            // Scoring plays use the full drive span;
                            // regular plays use the individual play's yard lines
                            const fieldStartYard = isScoring
                              ? (activeDrive?.start?.yardLine ??
                                play.start?.yardLine)
                              : play.start?.yardLine;
                            const fieldEndYard = isScoring
                              ? (activeDrive?.end?.yardLine ??
                                play.end?.yardLine)
                              : (play.end?.yardLine ?? play.start?.yardLine);
                            return (
                              <NflPlayFieldMini
                                play={play}
                                teamColor={driveTeamColor}
                                startYard={fieldStartYard}
                                endYard={fieldEndYard}
                              />
                            );
                          })()}

                        {/* Share button */}
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={async () => {
                            await handlePlayPress(play, activeDrive);
                          }}
                          style={[
                            nflDrivesStyles.playShareBtn,
                            {
                              backgroundColor: theme.surfaceSecondary,
                              borderColor: theme.border,
                            },
                          ]}
                        >
                          <Ionicons
                            name="share-outline"
                            size={14}
                            color={theme.text}
                          />
                          <Text
                            style={[
                              nflDrivesStyles.playShareBtnText,
                              { color: theme.text },
                            ]}
                          >
                            Share
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      </View>
    );
  };

  // Helper function to render summary content
  const renderSummaryContent = () => {
    if (loadingSummary) {
      return (
        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>
            Game Summary
          </Text>
          <View style={styles.summaryContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text allowFontScaling={false} style={styles.placeholderText}>
              Loading summary...
            </Text>
          </View>
        </View>
      );
    }

    if (!summaryData) {
      return (
        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>
            Game Summary
          </Text>
          <View style={styles.summaryContainer}>
            <Text allowFontScaling={false} style={styles.placeholderText}>
              No summary information available for this game
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.section}>
        <Text allowFontScaling={false} style={styles.sectionTitle}>
          Game Summary
        </Text>
        <ScrollView style={styles.summaryScrollView}>
          {/* Game Recap */}
          {summaryData.recap && (
            <View style={styles.summaryCard}>
              <Text allowFontScaling={false} style={styles.summarySectionTitle}>
                Recap
              </Text>
              <Text allowFontScaling={false} style={styles.summaryText}>
                {summaryData.recap.headline ||
                  summaryData.recap.description ||
                  "No recap available"}
              </Text>
            </View>
          )}

          {/* Highlights */}
          {summaryData.highlights && summaryData.highlights.length > 0 && (
            <View style={styles.summaryCard}>
              <Text allowFontScaling={false} style={styles.summarySectionTitle}>
                Highlights
              </Text>
              {summaryData.highlights.map((highlight, index) => (
                <View
                  key={index}
                  style={[
                    styles.highlightItem,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <Text allowFontScaling={false} style={styles.highlightTitle}>
                    {highlight.headline || highlight.title}
                  </Text>
                  <Text
                    allowFontScaling={false}
                    style={styles.highlightDescription}
                  >
                    {highlight.description || "No description available"}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* News */}
          {summaryData.news && summaryData.news.length > 0 && (
            <View style={styles.summaryCard}>
              <Text allowFontScaling={false} style={styles.summarySectionTitle}>
                News
              </Text>
              {summaryData.news.slice(0, 3).map((article, index) => (
                <View key={index} style={styles.newsItem}>
                  <Text allowFontScaling={false} style={styles.newsTitle}>
                    {article.headline}
                  </Text>
                  <Text allowFontScaling={false} style={styles.newsDescription}>
                    {article.description || "No description available"}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Win Probability */}
          {summaryData.winprobability && (
            <View style={styles.summaryCard}>
              <Text allowFontScaling={false} style={styles.summarySectionTitle}>
                Win Probability
              </Text>
              <Text allowFontScaling={false} style={styles.summaryText}>
                Win probability data available (chart display would require
                additional implementation)
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  // Helper function to render plays content
  const renderPlaysContent = () => {
    if (loadingPlays) {
      return (
        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>
            Play-by-Play
          </Text>
          <View style={styles.playsContainer}>
            <ActivityIndicator size="small" color="#013369" />
            <Text allowFontScaling={false} style={styles.placeholderText}>
              Loading plays...
            </Text>
          </View>
        </View>
      );
    }

    if (!playsData || playsData.length === 0) {
      return (
        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>
            Play-by-Play
          </Text>
          <View style={styles.playsContainer}>
            <Text allowFontScaling={false} style={styles.placeholderText}>
              No play-by-play information available for this game
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.section}>
        <Text allowFontScaling={false} style={styles.sectionTitle}>
          Play-by-Play
        </Text>
        <ScrollView style={styles.playsScrollView}>
          {playsData.reverse().map((play, index) => (
            <View key={`play-${play.id || index}`} style={styles.playCard}>
              <View style={styles.playHeader}>
                <Text allowFontScaling={false} style={styles.playSequence}>
                  Play {playsData.length - index}
                </Text>
                {play.clock?.displayValue && play.period?.number && (
                  <Text allowFontScaling={false} style={styles.playTime}>
                    Q{play.period.number} {play.clock.displayValue}
                  </Text>
                )}
              </View>

              <Text allowFontScaling={false} style={styles.playText}>
                {play.text || "No play description available"}
              </Text>

              {/* Down and Distance Info */}
              {(play.down?.number ||
                play.distance?.yards ||
                play.type?.text) && (
                <View style={styles.playDetails}>
                  <Text allowFontScaling={false} style={styles.playDetailsText}>
                    {[
                      play.down?.number &&
                        play.distance?.yards &&
                        `${play.down.number}${
                          play.down.number === 1
                            ? "st"
                            : play.down.number === 2
                              ? "nd"
                              : play.down.number === 3
                                ? "rd"
                                : "th"
                        } & ${play.distance.yards}`,
                      play.type?.text,
                      play.scoringPlay && "SCORING PLAY",
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </Text>
                </View>
              )}

              {/* Field Position */}
              {(play.start?.yardLine !== undefined ||
                play.end?.yardLine !== undefined) && (
                <View style={styles.playFieldPosition}>
                  <Text allowFontScaling={false} style={styles.playFieldText}>
                    {play.start?.text &&
                      play.end?.text &&
                      `${play.start.text} → ${play.end.text}`}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  // Helper function to render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case "main":
        return renderMainContent();
      case "stats":
        return renderStatsContent();
      case "away":
        return renderTeamContent(awayTeam, "away");
      case "home":
        return renderTeamContent(homeTeam, "home");
      case "drives":
        return renderDrivesContent();
      default:
        return renderMainContent();
    }
  };

  // ── Derived header values ──────────────────────────────────────────
  const isGameFinished = Boolean(status?.type?.completed);
  const isGamePre =
    !status?.period &&
    !status?.type?.completed &&
    (status?.type?.description || "").toLowerCase().includes("scheduled");
  const isGameLive =
    !isGamePre &&
    !isGameFinished &&
    (status?.type?.description === "In Progress" ||
      status?.type?.state === "in" ||
      (status?.period && status?.period > 0));

  const awayAbbr = getNFLTeamAbbreviation(awayTeam?.team) || "AWY";
  const homeAbbr = getNFLTeamAbbreviation(homeTeam?.team) || "HME";
  const { awayColor, homeColor } = getSmartTeamColors(
    homeTeam?.team,
    awayTeam?.team,
    colors,
  );

  const awayWins = isGameFinished && awayScore > homeScore;
  const homeWins = isGameFinished && homeScore > awayScore;

  // Possession from drives data
  let possessionTeamId = null;
  if (drivesData) {
    const currentDrive = drivesData.find(
      (d) => !d.end?.text && d.result !== "End of Game",
    );
    if (currentDrive?.team?.id) possessionTeamId = currentDrive.team.id;
  }
  const awayHasPossession =
    possessionTeamId === awayTeam?.team?.id &&
    status?.type?.description !== "Halftime";
  const homeHasPossession =
    possessionTeamId === homeTeam?.team?.id &&
    status?.type?.description !== "Halftime";

  // Status lines
  const nflStatusLine1 = isGameFinished
    ? "Final"
    : status?.type?.description === "Halftime"
      ? "Halftime"
      : status?.period && status?.period > 0
        ? status.period <= 4
          ? `${["1st", "2nd", "3rd", "4th"][status.period - 1]} QTR`
          : `OT ${status.period - 4}`
        : status?.type?.description || status?.type?.name || "Scheduled";

  const date = new Date(gameDate);

  const nflStatusLine2 =
    isGameLive &&
    status?.displayClock &&
    status?.type?.description !== "Halftime"
      ? status.displayClock
      : `${date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })} · ${date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}`;

  const awayLogoUri = awayTeam?.team?.logo || getTeamLogoUrl("nfl", awayAbbr);
  const homeLogoUri = homeTeam?.team?.logo || getTeamLogoUrl("nfl", homeAbbr);

  // Scroll-driven sticky mini header interpolation (matches NHL pattern)
  const stickyThreshold = headerH > 0 ? headerH - 40 : 120;
  const stickyOpacity = scrollY.interpolate({
    inputRange: [stickyThreshold, stickyThreshold + 40],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const stickyMiniHeight = scrollY.interpolate({
    inputRange: [stickyThreshold, stickyThreshold + 40],
    outputRange: [0, 54],
    extrapolate: "clamp",
  });

  // ── Live field player stats helper (reused by share card + live field) ──
  const getPlayPlayerStats = (player, playTypeId, participantType) => {
    if (!gameDetails?.boxscore?.players || !player?.athlete?.id) return [];

    let playerBoxscoreData = null;
    for (const teamData of gameDetails.boxscore.players) {
      if (teamData.statistics) {
        for (const statCategory of teamData.statistics) {
          if (statCategory.athletes) {
            for (const athleteData of statCategory.athletes) {
              const athlete = athleteData.athlete;
              if (
                athlete &&
                (athlete.id === player.athlete.id ||
                  athlete.id === player.athlete.id.toString())
              ) {
                if (!playerBoxscoreData) playerBoxscoreData = {};
                playerBoxscoreData[statCategory.name] = athleteData.stats || [];
              }
            }
          }
        }
      }
    }
    if (!playerBoxscoreData) return [];

    const stats = [];
    // Interception (26) / Fumble Return (36)
    if (playTypeId === "26" || playTypeId === "36") {
      if (participantType === "passer") {
        const p = playerBoxscoreData.passing || [];
        if (p[1]) stats.push(`${p[1]} yds`);
        if (p[4]) stats.push(`${p[4]} INT`);
      } else if (participantType === "passDefender") {
        const d = playerBoxscoreData.interceptions || [];
        if (d[0]) stats.push(`${d[0]} INT`);
        if (d[1]) stats.push(`${d[1]} INT yds`);
      } else if (participantType === "returner") {
        const r = playerBoxscoreData.receiving || [];
        if (r[5]) stats.push(`${r[5]} tgt`);
        if (r[1]) stats.push(`${r[1]} yds`);
      } else if (
        participantType === "tackler" ||
        participantType === "assistedBy"
      ) {
        const d = playerBoxscoreData.defensive || [];
        if (d[0]) stats.push(`${d[0]} tkl`);
      }
    }
    // Kickoff (53)
    else if (playTypeId === "53") {
      if (participantType === "returner") {
        const r = playerBoxscoreData.kickReturns || [];
        if (r[0]) stats.push(`${r[0]} ret`);
        if (r[1]) stats.push(`${r[1]} yds`);
      } else if (
        participantType === "tackler" ||
        participantType === "assistedBy"
      ) {
        const d = playerBoxscoreData.defensive || [];
        if (d[0]) stats.push(`${d[0]} tkl`);
      }
    }
    // Kick Return TD (32)
    else if (playTypeId === "32") {
      if (participantType === "returner" || participantType === "scorer") {
        const r = playerBoxscoreData.kickReturns || [];
        if (r[0]) stats.push(`${r[0]} ret`);
        if (r[1]) stats.push(`${r[1]} yds`);
        if (r[4]) stats.push(`${r[4]} TD`);
      } else if (
        participantType === "patScorer" ||
        participantType === "kicker"
      ) {
        const k = playerBoxscoreData.kicking || [];
        if (k[3]) stats.push(`${k[3]} XP`);
      }
    }
    // Punt (52) / Punt Return (34)
    else if (playTypeId === "52" || playTypeId === "34") {
      if (participantType === "returner") {
        const r = playerBoxscoreData.puntReturns || [];
        if (r[0]) stats.push(`${r[0]} ret`);
        if (r[1]) stats.push(`${r[1]} yds`);
      } else if (
        participantType === "tackler" ||
        participantType === "assistedBy"
      ) {
        const d = playerBoxscoreData.defensive || [];
        if (d[0]) stats.push(`${d[0]} tkl`);
      } else if (participantType === "punter") {
        const p = playerBoxscoreData.punting || [];
        if (p[0]) stats.push(`${p[0]} punts`);
        if (p[1]) stats.push(`${p[1]} yds`);
      } else if (
        participantType === "patScorer" ||
        participantType === "kicker"
      ) {
        const k = playerBoxscoreData.kicking || [];
        if (k[3]) stats.push(`${k[3]} XP`);
      }
    }
    // Fumble (29) / Fumble Recovery (80)
    else if (playTypeId === "29" || playTypeId === "80") {
      if (
        participantType === "fumbler" ||
        participantType === "rusher" ||
        participantType === "passer"
      ) {
        const f = playerBoxscoreData.fumbles || [];
        if (f[0]) stats.push(`${f[0]} fum`);
      } else if (participantType === "recoverer") {
        const f = playerBoxscoreData.fumbles || [];
        if (f[2]) stats.push(`${f[2]} rec`);
      } else if (
        participantType === "tackler" ||
        participantType === "assistedBy" ||
        participantType === "forcedBy"
      ) {
        const d = playerBoxscoreData.defensive || [];
        if (d[0]) stats.push(`${d[0]} tkl`);
      }
    }
    // Sack (7)
    else if (playTypeId === "7") {
      if (participantType === "passer") {
        const p = playerBoxscoreData.passing || [];
        if (p[5]) stats.push(`${p[5]} sck`);
        if (p[1]) stats.push(`${p[1]} yds`);
      } else if (
        participantType === "sackedBy" ||
        participantType === "tackler" ||
        participantType === "assistedBy"
      ) {
        const d = playerBoxscoreData.defensive || [];
        if (d[2]) stats.push(`${d[2]} sck`);
        if (d[0]) stats.push(`${d[0]} tkl`);
      }
    }
    // Field Goal (59)
    else if (playTypeId === "59") {
      if (participantType === "kicker") {
        const k = playerBoxscoreData.kicking || [];
        if (k[0]) stats.push(`${k[0]} FG`);
        if (k[1]) stats.push(`${k[1]}%`);
      }
    }
    // Regular plays
    else {
      if (participantType === "rusher") {
        const r = playerBoxscoreData.rushing || [];
        if (r[0]) stats.push(`${r[0]} att`);
        if (r[1]) stats.push(`${r[1]} yds`);
        if (r[3]) stats.push(`${r[3]} TD`);
      } else if (participantType === "passer") {
        const p = playerBoxscoreData.passing || [];
        if (p[0]) stats.push(`${p[0]} c/att`);
        if (p[1]) stats.push(`${p[1]} yds`);
        if (p[3]) stats.push(`${p[3]} TD`);
      } else if (participantType === "receiver") {
        const r = playerBoxscoreData.receiving || [];
        if (r[0]) stats.push(`${r[0]} rec`);
        if (r[1]) stats.push(`${r[1]} yds`);
        if (r[3]) stats.push(`${r[3]} TD`);
      } else if (
        participantType === "assistedBy" ||
        participantType === "tackler"
      ) {
        const d = playerBoxscoreData.defensive || [];
        if (d[0]) stats.push(`${d[0]} tkl`);
      } else if (participantType === "passDefender") {
        const d = playerBoxscoreData.defensive || [];
        if (d[4]) stats.push(`${d[4]} PD`);
      } else if (participantType === "kicker") {
        const k = playerBoxscoreData.kicking || [];
        if (k[3]) stats.push(`${k[3]} XP`);
      } else if (participantType === "punter") {
        const p = playerBoxscoreData.punting || [];
        if (p[0]) stats.push(`${p[0]} punts`);
        if (p[1]) stats.push(`${p[1]} yds`);
      }
    }
    return stats;
  };

  // ── Main tab content ─────────────────────────────────────────────
  const renderMainContent = () => {
    const scoringPlays = gameDetails?.scoringPlays || [];

    return (
      <View style={[{ paddingBottom: 20 }]}>
        {/* ── Live Field View (NHL rink-style) ── */}
        {isGameLive &&
          (() => {
            // Collect all plays from all drives in chronological order
            const allPlays = [];
            if (drivesData) {
              for (const drive of drivesData) {
                if (drive.plays?.length) {
                  for (const play of drive.plays) {
                    allPlays.push({ play, drive });
                  }
                }
              }
            }
            allPlays.sort(
              (a, b) =>
                (parseInt(a.play.sequenceNumber) || 0) -
                (parseInt(b.play.sequenceNumber) || 0),
            );

            const safeIdx =
              allPlays.length > 0
                ? Math.max(0, Math.min(livePlayIdx, allPlays.length - 1))
                : 0;
            const currentEntry = allPlays[safeIdx];
            const currentPlay = currentEntry?.play;
            const currentDrive = currentEntry?.drive;

            const navBtn = (label, disabled, onPress) => (
              <TouchableOpacity
                activeOpacity={0.7}
                disabled={disabled}
                onPress={onPress}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: disabled
                    ? theme.surfaceSecondary
                    : colors.primary + "22",
                  borderWidth: 1,
                  borderColor: disabled ? theme.border : colors.primary,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: disabled ? theme.textTertiary : colors.primary,
                  }}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );

            if (!currentPlay) {
              return (
                <View
                  style={[
                    nflMainStyles.fieldCard,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: theme.textSecondary,
                      textAlign: "center",
                      padding: 20,
                    }}
                  >
                    No plays available
                  </Text>   
                </View>
              );
            }

            const play = currentPlay;
            const playTypeId = play.type?.id;
            const playTypeText =
              play.type?.text || play.type?.abbreviation || "";
            const playText = play.text || play.shortText || "";
            const ddText =
              play.start?.downDistanceText || play.end?.downDistanceText || "";
            const period = play.period?.number || 0;
            const clock = play.clock?.displayValue || "";
            const periodLabel =
              period <= 4 ? `Q${period}` : period > 4 ? `OT${period - 4}` : "";

            // ── Team / field info (use drive team, same as drives tab) ──
            const driveTeam = currentDrive?.team;
            const driveTeamAbbr = driveTeam?.abbreviation || "";
            const driveTeamColor = getGameTeamColor(driveTeamAbbr);
            const awayTeamAbbr =
              getNFLTeamAbbreviation(awayTeam?.team) || "AWY";
            const homeTeamAbbr =
              getNFLTeamAbbreviation(homeTeam?.team) || "HME";
            const startYard = play.start?.yardLine;
            const endYard = play.end?.yardLine;

            const isScoring = !!play.scoringPlay;
            const fieldStartYard = isScoring
              ? (currentDrive?.start?.yardLine ?? startYard)
              : startYard;
            const fieldEndYard = isScoring
              ? (currentDrive?.end?.yardLine ?? endYard)
              : (endYard ?? startYard);

            // ── Enrich participants (resolve $ref from drives API, same as handlePlayPress) ──
            const enrichedParticipants = [];
            if (play.participants && play.participants.length > 0) {
              const findAthleteInBoxscore = (athleteId) => {
                if (!gameDetails?.boxscore?.players) return null;
                for (const teamData of gameDetails.boxscore.players) {
                  if (teamData.statistics) {
                    for (const statCategory of teamData.statistics) {
                      if (statCategory.athletes) {
                        for (const athleteData of statCategory.athletes) {
                          const athlete = athleteData.athlete;
                          if (
                            athlete &&
                            (athlete.id === athleteId ||
                              athlete.id === athleteId.toString())
                          ) {
                            return {
                              ...athlete,
                              headshot:
                                {
                                  href: `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${athleteId}.png&w=150`,
                                } || athlete.headshot,
                            };
                          }
                        }
                      }
                    }
                  }
                }
                return null;
              };

              for (const participant of play.participants) {
                // Already populated
                if (
                  participant.athlete &&
                  typeof participant.athlete === "object" &&
                  participant.athlete.displayName
                ) {
                  enrichedParticipants.push({
                    ...participant,
                    athlete: {
                      ...participant.athlete,
                      headshot:
                        {
                          href: `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${participant.athlete.id}.png&w=150`,
                        } || participant.athlete.headshot,
                    },
                    team: participant.team || driveTeam,
                  });
                  continue;
                }

                // Resolve $ref
                if (participant.athlete && participant.athlete.$ref) {
                  const athleteRef = participant.athlete.$ref;
                  const athleteIdMatch = athleteRef.match(/\/athletes\/(\d+)/);
                  if (athleteIdMatch) {
                    const athleteId = athleteIdMatch[1];
                    const athleteData = findAthleteInBoxscore(athleteId);
                    if (athleteData) {
                      enrichedParticipants.push({
                        ...participant,
                        athlete: { ...athleteData, id: athleteId },
                        team: driveTeam,
                      });
                      continue;
                    }
                  }
                }
              }
            }

            // ── Build participants list ──
            let participantsList = [...enrichedParticipants].sort(
              (a, b) => (a.order || 0) - (b.order || 0),
            );

            const isSpecialPlayType = [
              "53",
              "26",
              "36",
              "52",
              "29",
              "80",
              "7",
              "32",
              "34",
            ].includes(playTypeId);
            const isRushingPlay = playTypeId === "5";
            const isPassingPlay = playTypeId === "24";
            const isScoringPlay =
              play.scoringPlay ||
              play.text?.toLowerCase().includes("touchdown");

            let mainPlayer = null;
            if (isScoringPlay) {
              mainPlayer = participantsList.find(
                (p) =>
                  p.type === "scorer" ||
                  p.type === "rusher" ||
                  p.type === "receiver",
              );
            }
            if (!mainPlayer) {
              if (isSpecialPlayType && participantsList.length > 1) {
                mainPlayer = participantsList.find(
                  (p) =>
                    p.type === "recoverer" ||
                    p.type === "returner" ||
                    p.type === "sackedBy" ||
                    p.type === "passDefender",
                );
              } else if (isRushingPlay) {
                mainPlayer = participantsList.find((p) => p.type === "rusher");
              } else if (isPassingPlay) {
                mainPlayer = participantsList.find(
                  (p) => p.type === "receiver",
                );
              }
              if (!mainPlayer) mainPlayer = participantsList[0];
            }
            if (
              mainPlayer &&
              (isSpecialPlayType ||
                isRushingPlay ||
                isPassingPlay ||
                isScoringPlay)
            ) {
              participantsList = [
                mainPlayer,
                ...participantsList.filter(
                  (p) =>
                    p.athlete?.displayName !== mainPlayer?.athlete?.displayName,
                ),
              ];
            }

            const mainAthlete = mainPlayer?.athlete;
            const mainId = mainAthlete?.id;
            const mainHeadshot =
              (mainId
                ? `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${mainId}.png&w=150`
                : null) || mainAthlete?.headshot?.href;
            const mainStats = mainPlayer
              ? getPlayPlayerStats(mainPlayer, playTypeId, mainPlayer.type)
              : [];

            const testLiveField = false; // Set to true to test live field rendering

            return (
              <View
                style={[
                  nflMainStyles.fieldCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                {/* ── Field header ── */}
                <View
                  style={[
                    nflMainStyles.fieldHeaderRow,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      nflMainStyles.fieldHeaderTitle,
                      { color: theme.text },
                    ]}
                  >
                    Live Field
                  </Text>
                </View>

                {/* ── Field body ── */}
                <View style={nflMainStyles.fieldBody}>
                  {/* NflPlayFieldMini (the detailed field from the copy card) */}
                  <NflPlayFieldMini
                    play={play}
                    teamColor={driveTeamColor}
                    startYard={fieldStartYard}
                    endYard={fieldEndYard}
                  />

                  {/* Play description */}
                  <View
                    style={{
                      paddingHorizontal: 2,
                      paddingTop: 6,
                      paddingBottom: 12,
                    }}
                  >
                    {/* Play type + time row */}
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: isScoring
                            ? driveTeamColor
                            : theme.textSecondary,
                          textTransform: "uppercase",
                          letterSpacing: 0.3,
                        }}
                      >
                        {playTypeText}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "600",
                          color: theme.textSecondary,
                        }}
                      >
                        {periodLabel} {clock}
                      </Text>
                    </View>

                    {/* Play text */}
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: theme.text,
                        lineHeight: 18,
                      }}
                    >
                      {playText}
                    </Text>

                    {/* Down & distance + score */}
                    {(!!ddText || play.awayScore !== undefined) && (
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginTop: 4,
                        }}
                      >
                        {!!ddText && (
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: "600",
                              color: colors.primary,
                            }}
                          >
                            {ddText}
                          </Text>
                        )}
                        {play.awayScore !== undefined && (
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: "600",
                              color: theme.textSecondary,
                            }}
                          >
                            {awayTeamAbbr} {play.awayScore} - {play.homeScore}{" "}
                            {homeTeamAbbr}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>

                  {/* ── Players section (NHL LivePlaySection styling) ── */}
                  <View
                    style={{
                      borderRadius: 10,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: theme.border,
                      backgroundColor: theme.surfaceSecondary,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        position: "relative",
                        overflow: "hidden",
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        gap: 7,
                      }}
                    >
                      {/* Gradient background */}
                      <View
                        style={StyleSheet.absoluteFill}
                        pointerEvents="none"
                      >
                        <Svg width="100%" height="100%" pointerEvents="none">
                          <Defs>
                            <LinearGradient
                              id={`liveFieldGrad-${safeIdx}`}
                              x1="0%"
                              y1="0%"
                              x2="100%"
                              y2="0%"
                            >
                              <Stop
                                offset="0%"
                                stopColor={driveTeamColor}
                                stopOpacity="0.22"
                              />
                              <Stop
                                offset="70%"
                                stopColor={driveTeamColor}
                                stopOpacity="0"
                              />
                              <Stop
                                offset="100%"
                                stopColor={driveTeamColor}
                                stopOpacity="0"
                              />
                            </LinearGradient>
                          </Defs>
                          <Rect
                            width="100%"
                            height="100%"
                            fill={`url(#liveFieldGrad-${safeIdx})`}
                          />
                        </Svg>
                      </View>

                      {/* Team header row */}
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "900",
                            letterSpacing: 0.5,
                            color: driveTeamColor,
                          }}
                        >
                          {(
                            driveTeam?.displayName ||
                            driveTeam?.name ||
                            driveTeamAbbr
                          ).toUpperCase()}
                        </Text>
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "700",
                            letterSpacing: 0.35,
                            color: theme.textSecondary,
                          }}
                        >
                          {driveTeamAbbr === awayTeamAbbr ? "AWAY" : "HOME"}
                        </Text>
                      </View>

                      {/* Player row */}
                      {mainAthlete ? (
                        (() => {
                          const fullName = String(
                            mainAthlete?.displayName ||
                              mainAthlete?.fullName ||
                              mainAthlete?.name ||
                              (mainAthlete?.firstName && mainAthlete?.lastName
                                ? `${mainAthlete.firstName} ${mainAthlete.lastName}`
                                : null) ||
                              "Unknown",
                          ).trim();
                          const number =
                            mainAthlete?.jersey != null &&
                            Number.isFinite(Number(mainAthlete.jersey))
                              ? `#${Number(mainAthlete.jersey)}`
                              : mainAthlete?.number != null &&
                                  Number.isFinite(Number(mainAthlete.number))
                                ? `#${Number(mainAthlete.number)}`
                                : "";
                          const position = String(
                            mainPlayer?.type ||
                              mainAthlete?.position?.abbreviation ||
                              "",
                          ).toUpperCase();
                          const meta = [driveTeamAbbr, number, position]
                            .filter(Boolean)
                            .join(" \u00B7 ");

                          return (
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 8,
                                justifyContent: "flex-start",
                              }}
                            >
                              {/* Info block */}
                              <View
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  alignItems: "flex-start",
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 12,
                                    fontWeight: "800",
                                    lineHeight: 15,
                                    color: theme.text,
                                  }}
                                  numberOfLines={1}
                                >
                                  {fullName}
                                </Text>
                                {!!meta && (
                                  <Text
                                    style={{
                                      marginTop: 1,
                                      fontSize: 10,
                                      fontWeight: "600",
                                      lineHeight: 13,
                                      color: theme.textSecondary,
                                    }}
                                    numberOfLines={1}
                                  >
                                    {meta}
                                  </Text>
                                )}
                                {mainStats.length > 0 && (
                                  <View
                                    style={{
                                      marginTop: 4,
                                      flexDirection: "row",
                                      alignItems: "center",
                                      justifyContent: "flex-start",
                                      gap: 6,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    {mainStats.map((stat, idx) => {
                                      const parts = stat
                                        ? stat.split(" ")
                                        : ["—"];
                                      const value = parts.shift() || "—";
                                      const label = parts.join(" ");
                                      return (
                                        <View
                                          key={`stat-${idx}`}
                                          style={{
                                            minWidth: 30,
                                            alignItems: "center",
                                          }}
                                        >
                                          <Text
                                            style={{
                                              fontSize: 12,
                                              fontWeight: "800",
                                              lineHeight: 13,
                                              color: theme.text,
                                            }}
                                            numberOfLines={1}
                                          >
                                            {value}
                                          </Text>
                                          <Text
                                            style={{
                                              marginTop: 1,
                                              fontSize: 8,
                                              fontWeight: "700",
                                              letterSpacing: 0.18,
                                              color: theme.textSecondary,
                                            }}
                                          >
                                            {label || "STAT"}
                                          </Text>
                                        </View>
                                      );
                                    })}
                                  </View>
                                )}
                              </View>

                              {/* Headshot */}
                              <View
                                style={{
                                  width: 58,
                                  height: 58,
                                  borderRadius: 29,
                                  borderWidth: 2,
                                  overflow: "visible",
                                  position: "relative",
                                  borderColor: driveTeamColor,
                                  backgroundColor: driveTeamColor + "66",
                                }}
                              >
                                {mainHeadshot ? (
                                  <Image
                                    source={{ uri: mainHeadshot }}
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      borderRadius: 29,
                                    }}
                                    resizeMode="cover"
                                  />
                                ) : (
                                  <View
                                    style={{
                                      flex: 1,
                                      alignItems: "center",
                                      justifyContent: "center",
                                      borderRadius: 29,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 14,
                                        fontWeight: "700",
                                        color: theme.textSecondary,
                                      }}
                                    >
                                      {fullName
                                        .split(/\s+/)
                                        .filter(Boolean)
                                        .map((p) => p[0])
                                        .slice(0, 2)
                                        .join("")
                                        .toUpperCase() || "?"}
                                    </Text>
                                  </View>
                                )}

                                {/* Team logo badge */}
                                <View
                                  style={{
                                    position: "absolute",
                                    left: -2,
                                    bottom: -3,
                                    width: 20,
                                    height: 20,
                                    borderRadius: 10,
                                    backgroundColor: "rgba(255,255,255,0.95)",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    borderWidth: 1,
                                    borderColor: driveTeamColor,
                                  }}
                                >
                                  <TeamLogoImage
                                    team={driveTeam}
                                    style={{ width: 20, height: 20 }}
                                  />
                                </View>
                              </View>
                            </View>
                          );
                        })()
                      ) : (
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "600",
                            paddingVertical: 2,
                            color: theme.textSecondary,
                            textAlign: "left",
                          }}
                        >
                          No player tagged for this play
                        </Text>
                      )}
                    </View>
                  </View>
                </View>

                {testLiveField && (
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                      paddingHorizontal: 12,
                      paddingBottom: 12,
                      paddingTop: 4,
                    }}
                  >
                    {navBtn("◀ Prev Play", safeIdx <= 0, () =>
                      setLivePlayIdx((i) => Math.max(0, i - 1)),
                    )}
                    {navBtn("Next Play ▶", safeIdx >= allPlays.length - 1, () =>
                      setLivePlayIdx((i) =>
                        Math.min(allPlays.length - 1, i + 1),
                      ),
                    )}
                  </View>
                )}
              </View>
            );
          })()}

        {/* Linescore */}
        {(() => {
          const awayLinescores = awayTeam?.linescores || [];
          const homeLinescores = homeTeam?.linescores || [];
          const hasLinescores =
            awayLinescores.length > 0 || homeLinescores.length > 0;
          if (!hasLinescores) return null;

          const maxPeriods = Math.max(
            awayLinescores.length,
            homeLinescores.length,
            4,
          );
          const periodLabels = [];
          for (let i = 0; i < maxPeriods; i++) {
            if (i < 4) periodLabels.push(String(i + 1));
            else periodLabels.push(`OT${i - 3}`);
          }

          const awayTotal = Number(awayTeam?.score ?? 0);
          const homeTotal = Number(homeTeam?.score ?? 0);
          const awayAbbr = getNFLTeamAbbreviation(awayTeam?.team) || "AWY";
          const homeAbbr = getNFLTeamAbbreviation(homeTeam?.team) || "HME";
          const awayTeamColor = getGameTeamColor(awayAbbr);
          const homeTeamColor = getGameTeamColor(homeAbbr);

          const CELL_W = 32;
          const ROW_H = 34;
          const LABEL_W = 48;
          const TOTAL_W = 38;

          const cellW =
            linescoreAvailableW > 0 && periodLabels.length > 0
              ? Math.max(CELL_W, linescoreAvailableW / periodLabels.length)
              : CELL_W;

          const headerBg = theme.surfaceSecondary ?? "rgba(128,128,128,0.08)";
          const borderCol = theme.border ?? "rgba(128,128,128,0.2)";

          return (
            <View
              style={[
                nflMainStyles.linescoreCard,
                { backgroundColor: theme.surface },
              ]}
            >
              <View style={{ flexDirection: "row" }}>
                {/* Team labels column */}
                <View style={{ width: LABEL_W }}>
                  <View
                    style={[
                      nflMainStyles.linescoreCell,
                      {
                        height: ROW_H,
                        borderBottomColor: borderCol,
                        backgroundColor: headerBg,
                      },
                    ]}
                  />
                  <View
                    style={[
                      nflMainStyles.linescoreCell,
                      {
                        height: ROW_H,
                        borderBottomColor: awayTeamColor,
                        borderBottomWidth: 2,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        nflMainStyles.linescoreTeamAbbr,
                        { color: theme.text },
                      ]}
                    >
                      {awayAbbr}
                    </Text>
                  </View>
                  <View
                    style={[
                      nflMainStyles.linescoreCell,
                      {
                        height: ROW_H,
                        borderBottomColor: homeTeamColor,
                        borderBottomWidth: 2,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        nflMainStyles.linescoreTeamAbbr,
                        { color: theme.text },
                      ]}
                    >
                      {homeAbbr}
                    </Text>
                  </View>
                </View>

                {/* Scrollable period columns */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  bounces={false}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ flexDirection: "column" }}
                  onLayout={(e) =>
                    setLinescoreAvailableW(e.nativeEvent.layout.width)
                  }
                >
                  <View style={{ flexDirection: "row" }}>
                    {periodLabels.map((label, idx) => (
                      <View
                        key={`ph-${idx}`}
                        style={[
                          nflMainStyles.linescoreCell,
                          {
                            width: cellW,
                            height: ROW_H,
                            backgroundColor: headerBg,
                            borderBottomColor: borderCol,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            nflMainStyles.linescorePeriodNum,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {label}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View style={{ flexDirection: "row" }}>
                    {periodLabels.map((_, idx) => (
                      <View
                        key={`pa-${idx}`}
                        style={[
                          nflMainStyles.linescoreCell,
                          {
                            width: cellW,
                            height: ROW_H,
                            borderBottomColor: awayTeamColor,
                            borderBottomWidth: 2,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            nflMainStyles.linescoreRunsText,
                            { color: theme.text },
                          ]}
                        >
                          {awayLinescores[idx]?.displayValue || "-"}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View style={{ flexDirection: "row" }}>
                    {periodLabels.map((_, idx) => (
                      <View
                        key={`phm-${idx}`}
                        style={[
                          nflMainStyles.linescoreCell,
                          {
                            width: cellW,
                            height: ROW_H,
                            borderBottomColor: homeTeamColor,
                            borderBottomWidth: 2,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            nflMainStyles.linescoreRunsText,
                            { color: theme.text },
                          ]}
                        >
                          {homeLinescores[idx]?.displayValue || "-"}
                        </Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>

                {/* Stuck totals column */}
                <View
                  style={[
                    nflMainStyles.linescoreTotalsSection,
                    { borderLeftColor: borderCol },
                  ]}
                >
                  <View
                    style={[
                      nflMainStyles.linescoreTotalsRow,
                      {
                        height: ROW_H,
                        backgroundColor: headerBg,
                        borderBottomColor: borderCol,
                      },
                    ]}
                  >
                    <View style={{ width: TOTAL_W, alignItems: "center" }}>
                      <Text
                        style={[
                          nflMainStyles.linescoreTotalHeader,
                          { color: theme.textSecondary },
                        ]}
                      >
                        T
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      nflMainStyles.linescoreTotalsRow,
                      {
                        height: ROW_H,
                        borderBottomColor: awayTeamColor,
                        borderBottomWidth: 2,
                      },
                    ]}
                  >
                    <View style={{ width: TOTAL_W, alignItems: "center" }}>
                      <Text
                        style={[
                          nflMainStyles.linescoreTotalVal,
                          { color: theme.text },
                        ]}
                      >
                        {awayTotal}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      nflMainStyles.linescoreTotalsRow,
                      {
                        height: ROW_H,
                        borderBottomColor: homeTeamColor,
                        borderBottomWidth: 2,
                      },
                    ]}
                  >
                    <View style={{ width: TOTAL_W, alignItems: "center" }}>
                      <Text
                        style={[
                          nflMainStyles.linescoreTotalVal,
                          { color: theme.text },
                        ]}
                      >
                        {homeTotal}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          );
        })()}

        {/* Scoring Summary */}
        {scoringPlays.length > 0 && (
          <View
            style={[
              nflMainStyles.scoringCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View
              style={[
                nflMainStyles.scoringHeaderRow,
                { borderBottomColor: theme.border },
              ]}
            >
              <Text style={[nflMainStyles.scoringTitle, { color: theme.text }]}>
                Scoring Summary
              </Text>
            </View>
            <View style={nflMainStyles.scoringBody}>
              {scoringPlays.map((play, idx) => {
                const isHome = play.team?.id === homeTeam?.team?.id;
                const teamColor = isHome ? homeColor : awayColor;
                return (
                  <View
                    key={play.id || idx}
                    style={[
                      nflMainStyles.scoringRow,
                      { borderLeftColor: teamColor },
                    ]}
                  >
                    <View style={nflMainStyles.scoringTimeCol}>
                      <Text
                        style={[
                          nflMainStyles.scoringPeriod,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {play.period?.number <= 4
                          ? `Q${play.period?.number || "?"}`
                          : `OT${play.period?.number - 4 || "?"}`}
                      </Text>
                      <Text
                        style={[
                          nflMainStyles.scoringClock,
                          { color: theme.textTertiary },
                        ]}
                      >
                        {play.clock?.displayValue || ""}
                      </Text>
                    </View>
                    <View style={nflMainStyles.scoringInfoCol}>
                      <Text
                        style={[
                          nflMainStyles.scoringPlayText,
                          { color: theme.text },
                        ]}
                        numberOfLines={2}
                      >
                        {play.text || ""}
                      </Text>
                      <Text
                        style={[
                          nflMainStyles.scoringScore,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {play.awayScore} - {play.homeScore}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Officials */}
        {gameDetails?.gameInfo?.officials &&
          gameDetails.gameInfo.officials.length > 0 && (
            <View
              style={[
                nflMainStyles.officialsCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <View
                style={[
                  nflMainStyles.officialsHeaderRow,
                  { borderBottomColor: theme.border },
                ]}
              >
                <Text
                  style={[nflMainStyles.officialsTitle, { color: theme.text }]}
                >
                  Officials
                </Text>
              </View>
              <View style={nflMainStyles.officialsBody}>
                {gameDetails.gameInfo.officials.map((official, idx) => (
                  <View key={idx} style={nflMainStyles.officialRow}>
                    <Text
                      style={[
                        nflMainStyles.officialName,
                        { color: theme.text },
                      ]}
                    >
                      {official.displayName || official.fullName || ""}
                    </Text>
                    <Text
                      style={[
                        nflMainStyles.officialRole,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {official.position?.displayName ||
                        official.position?.name ||
                        ""}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

        {/* Weather */}
        {(() => {
          const w = gameDetails?.gameInfo?.weather;
          if (!w) return null;
          const temp = w.temperature;
          const precip = w.precipitation;
          const gust = w.gust;
          return (
            <View
              style={[
                nflMainStyles.weatherCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <View
                style={[
                  nflMainStyles.weatherHeaderRow,
                  { borderBottomColor: theme.border },
                ]}
              >
                <Text
                  style={[nflMainStyles.weatherTitle, { color: theme.text }]}
                >
                  Weather
                </Text>
              </View>
              <View style={nflMainStyles.weatherBody}>
                <View style={nflMainStyles.weatherRow}>
                  <View style={nflMainStyles.weatherItem}>
                    <Text
                      style={[
                        nflMainStyles.weatherValue,
                        { color: theme.text },
                      ]}
                    >
                      {temp != null ? `${temp}°F` : "\u2014"}
                    </Text>
                    <Text
                      style={[
                        nflMainStyles.weatherLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Temperature
                    </Text>
                  </View>
                  <View style={nflMainStyles.weatherItem}>
                    <Text
                      style={[
                        nflMainStyles.weatherValue,
                        { color: theme.text },
                      ]}
                    >
                      {precip != null ? `${precip}%` : "\u2014"}
                    </Text>
                    <Text
                      style={[
                        nflMainStyles.weatherLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Precipitation
                    </Text>
                  </View>
                  <View style={nflMainStyles.weatherItem}>
                    <Text
                      style={[
                        nflMainStyles.weatherValue,
                        { color: theme.text },
                      ]}
                    >
                      {gust != null ? `${gust} mph` : "\u2014"}
                    </Text>
                    <Text
                      style={[
                        nflMainStyles.weatherLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Wind Gust
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          );
        })()}

        {/* Last 5 Games */}
        {(() => {
          const lastFive = gameDetails?.lastFiveGames;
          if (!lastFive || lastFive.length === 0) return null;
          return (
            <>
              {lastFive.map((teamEntry, teamIdx) => {
                const teamInfo = teamEntry?.team;
                const events = teamEntry?.events || [];
                if (!teamInfo || events.length === 0) return null;
                const teamAbbr = teamInfo.abbreviation || "";
                const teamColor = getGameTeamColor(teamAbbr);
                const isHomeTeam =
                  String(teamInfo.id) === String(homeTeam?.team?.id);
                return (
                  <View
                    key={teamIdx}
                    style={[
                      nflMainStyles.last5Card,
                      {
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        nflMainStyles.last5HeaderRow,
                        { borderBottomColor: theme.border },
                      ]}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {teamInfo.logo && (
                          <Image
                            source={{ uri: teamInfo.logo }}
                            style={{ width: 18, height: 18 }}
                            resizeMode="contain"
                          />
                        )}
                        <Text
                          style={[
                            nflMainStyles.last5Title,
                            { color: theme.text },
                          ]}
                        >
                          {teamInfo.displayName || teamAbbr}
                        </Text>
                      </View>
                      <Text
                        style={[
                          nflMainStyles.last5Subtitle,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Last {events.length} Games
                      </Text>
                    </View>
                    <View style={nflMainStyles.last5Body}>
                      {events.slice().reverse().map((evt, evtIdx) => {
                        const isLastRow = evtIdx === events.length - 1;
                        const isWin = evt.gameResult === "W";
                        const isLoss = evt.gameResult === "L";
                        const opponent = evt.opponent;
                        const opponentAbbr = opponent?.abbreviation || "";
                        const opponentLogo =
                          opponent?.logo || evt.opponentLogo || "";
                        const dateStr = evt.gameDate
                          ? new Date(evt.gameDate).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          : "";
                        return (
                          <TouchableOpacity
                            key={evtIdx}
                            activeOpacity={0.7}
                            onPress={() =>
                              navigation.navigate("GameDetails", {
                                gameId: String(evt.id),
                                sport: "nfl",
                              })
                            }
                            style={[
                              nflMainStyles.last5Row,
                              !isLastRow && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
                            ]}
                          >
                            <View
                              style={[
                                nflMainStyles.last5ResultBadge,
                                {
                                  backgroundColor: isWin
                                    ? "#27ae60"
                                    : isLoss
                                      ? "#e74c3c"
                                      : theme.textSecondary,
                                },
                              ]}
                            >
                              <Text style={nflMainStyles.last5ResultText}>
                                {evt.gameResult || "-"}
                              </Text>
                            </View>
                            <Text
                              style={[
                                nflMainStyles.last5Opponent,
                                { color: theme.text },
                              ]}
                            >
                              {evt.atVs || ""}{" "}
                              {opponent?.displayName || opponentAbbr}
                            </Text>
                            <Text
                              style={[
                                nflMainStyles.last5Score,
                                { color: theme.textSecondary },
                              ]}
                            >
                              {evt.score || ""}
                            </Text>
                            <Text
                              style={[
                                nflMainStyles.last5Date,
                                { color: theme.textTertiary },
                              ]}
                            >
                              {dateStr}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </>
          );
        })()}

        {/* Venue */}
        {(venue || competition?.venue?.fullName) && (
          <View
            style={[
              nflMainStyles.venueCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[nflMainStyles.venueName, { color: theme.text }]}>
              {venue || competition?.venue?.fullName}
            </Text>
            {gameDate && (
              <Text
                style={[
                  nflMainStyles.venueDate,
                  { color: theme.textSecondary },
                ]}
              >
                {new Date(gameDate).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </Text>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Main Content with sticky tab bar */}
      <Animated.ScrollView
        style={[styles.scrollView, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.scrollContent}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        scrollEventThrottle={16}
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── NHL-style Game Header ─────────────────────────────────── */}
        <View
          style={[
            nflHeaderStyles.header,
            { backgroundColor: theme.surfaceSecondary || theme.surface },
          ]}
          onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
        >
          <NflHeaderGradient
            awayColor={awayColor}
            homeColor={homeColor}
            theme={theme}
            height={headerH}
          />

          {/* Venue / League row */}
          <View style={nflHeaderStyles.leagueRow}>
            <Text
              style={[
                nflHeaderStyles.leagueName,
                { color: theme.textTertiary || theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {(venue || competition?.venue?.fullName || "NFL").toString()}
              {" · "}
              {gameNote || headerText || "NFL"}
            </Text>
          </View>

          {/* Teams + Status */}
          <View style={nflHeaderStyles.teamsRow}>
            <NflTeamSide
              team={{
                ...awayTeam?.team,
                name:
                  awayTeam?.team?.shortDisplayName ||
                  awayTeam?.team?.displayName ||
                  awayTeam?.team?.name ||
                  "Away",
              }}
              logo={awayLogoUri}
              score={awayTeam?.score ?? "0"}
              record={awayRecord}
              side="away"
              isPre={isGamePre}
              isFinished={isGameFinished}
              isWinner={awayWins}
              isLoser={homeWins}
              theme={theme}
              colors={colors}
              showPossession={awayHasPossession}
              onPress={() =>
                navigation.navigate("TeamPage", {
                  teamId: awayTeam?.team?.id,
                  team: {
                    id: awayTeam?.team?.id,
                    abbreviation: awayAbbr,
                    displayName:
                      awayTeam?.team?.displayName || awayTeam?.team?.name,
                  },
                  sport: "nfl",
                })
              }
            />

            <View style={nflHeaderStyles.statusCenter}>
              <NflStatusBadge
                statusMain={nflStatusLine1}
                statusSub={nflStatusLine2}
                isFinished={isGameFinished}
                isPre={isGamePre}
                theme={theme}
                colors={colors}
              />

              {isGameLive && isStreamingUnlocked && (
                <TouchableOpacity
                  style={[
                    nflHeaderStyles.streamBtn,
                    { borderColor: colors.primary },
                  ]}
                  onPress={openStreamModal}
                  activeOpacity={0.8}
                >
                  <View style={nflHeaderStyles.streamBtnInner}>
                    <View
                      style={[
                        nflHeaderStyles.streamBtnDot,
                        { backgroundColor: colors.primary },
                      ]}
                    />
                    <Text
                      style={[
                        nflHeaderStyles.streamBtnText,
                        { color: colors.primary },
                      ]}
                    >
                      Stream
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            <NflTeamSide
              team={{
                ...homeTeam?.team,
                name:
                  homeTeam?.team?.shortDisplayName ||
                  homeTeam?.team?.displayName ||
                  homeTeam?.team?.name ||
                  "Home",
              }}
              logo={homeLogoUri}
              record={homeRecord}
              score={homeTeam?.score ?? "0"}
              side="home"
              isPre={isGamePre}
              isFinished={isGameFinished}
              isWinner={homeWins}
              isLoser={awayWins}
              theme={theme}
              colors={colors}
              showPossession={homeHasPossession}
              onPress={() =>
                navigation.navigate("TeamPage", {
                  teamId: homeTeam?.team?.id,
                  team: {
                    id: homeTeam?.team?.id,
                    abbreviation: homeAbbr,
                    displayName:
                      homeTeam?.team?.displayName || homeTeam?.team?.name,
                  },
                  sport: "nfl",
                })
              }
            />
          </View>

          {/* Down & Distance / Venue line under header */}
          {isGameLive && drivesData
            ? (() => {
                const currentDrive = drivesData.find(
                  (d) => !d.end?.text && d.result !== "End of Game",
                );
                if (!currentDrive?.plays?.length) return null;
                const sortedPlays = [...currentDrive.plays].sort(
                  (a, b) =>
                    (parseInt(b.sequenceNumber) || 0) -
                    (parseInt(a.sequenceNumber) || 0),
                );
                const latest = sortedPlays[0];
                if (!latest?.end) return null;
                const ddText = latest.end.shortDownDistanceText;
                const possText = latest.end.possessionText;
                if (!ddText) return null;
                return (
                  <View style={nflHeaderStyles.downDistanceRow}>
                    <Text
                      style={[
                        nflHeaderStyles.downDistanceText,
                        { color: colors.primary },
                      ]}
                    >
                      {ddText}
                    </Text>
                    {!!possText && (
                      <Text
                        style={[
                          nflHeaderStyles.possessionLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {possText}
                      </Text>
                    )}
                  </View>
                );
              })()
            : null}
        </View>

        {/* ── Sticky Unit: Mini Header + Tab Bar ─────────────────── */}
        <View
          style={[
            nflHeaderStyles.stickyUnit,
            {
              backgroundColor: theme.surface,
              borderBottomColor: theme.border,
            },
          ]}
        >
          {/* Mini header (compact score summary) — animated visibility */}
          <Animated.View
            style={[
              nflHeaderStyles.stickyMini,
              {
                height: stickyMiniHeight,
                opacity: stickyOpacity,
                overflow: "hidden",
                backgroundColor: theme.surface,
                borderBottomColor: theme.border,
              },
            ]}
          >
            <View style={nflHeaderStyles.miniSide}>
              <Image
                source={{ uri: awayLogoUri }}
                style={nflHeaderStyles.miniLogo}
                resizeMode="contain"
              />
              <Text
                style={[
                  nflHeaderStyles.miniAbbr,
                  {
                    color: theme.text,
                    opacity: isGameFinished ? (awayWins ? 1 : 0.55) : 1,
                  },
                ]}
                numberOfLines={1}
              >
                {awayAbbr}
              </Text>
              {!isGamePre && (
                <Text
                  style={[
                    nflHeaderStyles.miniScore,
                    {
                      color: awayWins ? theme.text : theme.textSecondary,
                      fontWeight: isGameFinished
                        ? awayWins
                          ? "800"
                          : "500"
                        : "800",
                    },
                  ]}
                >
                  {awayTeam?.score ?? 0}
                </Text>
              )}
            </View>

            <View style={nflHeaderStyles.miniStatusBlock}>
              <Text
                style={[nflHeaderStyles.miniStatusLine, { color: theme.text }]}
                numberOfLines={1}
              >
                {nflStatusLine1}
              </Text>
              {!!nflStatusLine2 && (
                <Text
                  style={[
                    nflHeaderStyles.miniStatusSub,
                    { color: theme.textTertiary || theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {nflStatusLine2}
                </Text>
              )}
            </View>

            <View
              style={[nflHeaderStyles.miniSide, { justifyContent: "flex-end" }]}
            >
              {!isGamePre && (
                <Text
                  style={[
                    nflHeaderStyles.miniScore,
                    {
                      color: homeWins ? theme.text : theme.textSecondary,
                      fontWeight: isGameFinished
                        ? homeWins
                          ? "800"
                          : "500"
                        : "800",
                    },
                  ]}
                >
                  {homeTeam?.score ?? 0}
                </Text>
              )}
              <Text
                style={[
                  nflHeaderStyles.miniAbbr,
                  {
                    color: theme.text,
                    opacity: isGameFinished ? (homeWins ? 1 : 0.55) : 1,
                  },
                ]}
                numberOfLines={1}
              >
                {homeAbbr}
              </Text>
              <Image
                source={{ uri: homeLogoUri }}
                style={nflHeaderStyles.miniLogo}
                resizeMode="contain"
              />
            </View>
          </Animated.View>

          {/* Tab bar */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={nflHeaderStyles.tabBarContent}
          >
            {["main", "drives", "away", "home", "stats"].map((tab) => {
              const isScheduled = (status?.type?.description || "")
                .toLowerCase()
                .includes("scheduled");
              if (tab === "drives" && isScheduled) return null;
              const label = tab.charAt(0).toUpperCase() + tab.slice(1);
              const isActive = activeTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[
                    nflHeaderStyles.tabBarButton,
                    {
                      borderBottomColor: isActive
                        ? colors.primary
                        : "transparent",
                    },
                  ]}
                  onPress={() => setActiveTab(tab)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      nflHeaderStyles.tabBarLabel,
                      {
                        color: isActive ? theme.text : theme.textSecondary,
                        fontWeight: isActive ? "700" : "600",
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Tab Content */}
        {renderTabContent()}

        {/* Player Details Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={playerModalVisible}
          onRequestClose={closePlayerModal}
        >
          <View style={styles.modalOverlay}>
            <View
              style={[styles.modalContent, { backgroundColor: theme.surface }]}
            >
              {/* Close Button */}
              <TouchableOpacity
                style={[
                  styles.modalCloseButton,
                  { backgroundColor: theme.error },
                ]}
                onPress={closePlayerModal}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.modalCloseText, { color: "#fff" }]}
                >
                  ×
                </Text>
              </TouchableOpacity>

              {selectedPlayer && (
                <>
                  <View>
                    {/* Player Header only (no copy-card here) */}
                    <View style={styles.playerHeader}>
                      <Image
                        source={{
                          uri: NFLService.convertToHttps(
                            selectedPlayer.headshot?.href ||
                              selectedPlayer.headshot,
                          ),
                        }}
                        style={[
                          styles.playerHeadshot,
                          {
                            backgroundColor: `#${
                              selectedPlayer?.team?.team?.primaryColor ||
                              selectedPlayer?.team?.team?.color ||
                              colors.primary
                            }`,
                          },
                        ]}
                        defaultSource={{
                          uri: "https://via.placeholder.com/80x80?text=Player",
                        }}
                      />
                      <View style={styles.playerInfo}>
                        <Text
                          allowFontScaling={false}
                          style={[styles.playerName, { color: theme.text }]}
                        >
                          {selectedPlayer.displayName ||
                            `${selectedPlayer.firstName || ""} ${
                              selectedPlayer.lastName || ""
                            }`.trim()}{" "}
                          <Text
                            allowFontScaling={false}
                            style={[
                              styles.playerDetails,
                              { color: theme.textSecondary },
                            ]}
                          >
                            #{selectedPlayer.jersey || "N/A"}
                          </Text>
                        </Text>
                        <View style={styles.playerTeamInfo}>
                          {selectedPlayer.team?.team && (
                            <TeamLogoImage
                              team={selectedPlayer.team.team}
                              style={styles.playerTeamLogo}
                            />
                          )}
                          <Text
                            allowFontScaling={false}
                            style={[
                              styles.playerTeamName,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {selectedPlayer.team?.team?.displayName ||
                              selectedPlayer.team?.team?.name ||
                              selectedPlayer.team?.team?.abbreviation ||
                              "No team info"}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Player Stats */}
                  <View style={styles.playerStatsContainer}>
                    {loadingPlayerStats ? (
                      <View style={styles.playerStatsLoading}>
                        <ActivityIndicator
                          size="large"
                          color={colors.primary}
                        />
                        <Text
                          allowFontScaling={false}
                          style={styles.loadingText}
                        >
                          Loading player stats...
                        </Text>
                      </View>
                    ) : playerStats ? (
                      <View style={styles.playerStatsContent}>
                        {renderPlayerModalGrid(playerStats)}
                      </View>
                    ) : (
                      <Text allowFontScaling={false} style={styles.noStatsText}>
                        Unable to load player statistics
                      </Text>
                    )}
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>

        {/* Player Copy Card Modal (NHL-style, opened on long-press) */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={playerCopyModalVisible}
          onRequestClose={() => setPlayerCopyModalVisible(false)}
        >
          <View style={nflShareStyles.overlay}>
            <View
              ref={playerCopyCardRef}
              collapsable={false}
              style={[nflShareStyles.card, { backgroundColor: theme.surface }]}
            >
              {selectedPlayer ? (
                (() => {
                  const teamColor = `#${
                    selectedPlayer?.team?.team?.primaryColor ||
                    selectedPlayer?.team?.team?.color ||
                    colors.primary.replace("#", "")
                  }`;
                  const headshotUri = NFLService.convertToHttps(
                    selectedPlayer.headshot?.href || selectedPlayer.headshot,
                  );
                  const pos =
                    selectedPlayer?.position?.abbreviation ||
                    selectedPlayer?.allStats?.name ||
                    "";
                  const fullName =
                    selectedPlayer.displayName ||
                    `${selectedPlayer.firstName || ""} ${selectedPlayer.lastName || ""}`.trim();

                  // Build stat grid items in boxscore order (no reordering)
                  const statItems = [];
                  let topStats = [];
                  if (playerStats?.splits?.categories) {
                    const clickedCat = (
                      selectedPlayer?.allStats?.name || ""
                    ).toLowerCase();

                    // Filter categories to clicked one
                    const filteredCats = playerStats.splits.categories.filter(
                      (c) => {
                        const n = (c.name || "").toLowerCase();
                        return n === clickedCat;
                      },
                    );
                    const catsToUse =
                      filteredCats.length > 0
                        ? filteredCats
                        : playerStats.splits.categories;

                    catsToUse.forEach((cat) => {
                      const labels = cat.labels || [];
                      const stats = cat.stats || [];
                      labels.forEach((label, i) => {
                        const val = stats[i];
                        let displayValue = "0";
                        if (val !== undefined && val !== null) {
                          if (typeof val === "object" && val.displayValue) {
                            displayValue = val.displayValue;
                          } else if (
                            typeof val === "object" &&
                            val.value !== undefined
                          ) {
                            displayValue = val.value.toString();
                          } else {
                            displayValue = val.toString();
                          }
                        }
                        statItems.push({ label, value: displayValue });
                      });
                    });

                    // Build top stats using specific indices per category (matching play share card)
                    const topStatIndices = {
                      passing: [0, 1, 3],
                      rushing: [0, 1, 3],
                      receiving: [0, 1, 3],
                      defensive: [0, 2, 4],
                      interceptions: [0, 1],
                      kicking: [0, 1, 4],
                      punting: [0, 1, 2],
                      fumbles: [0, 1, 2],
                      kickReturns: [0, 1, 4],
                      puntReturns: [0, 1, 4],
                    };
                    const indices = topStatIndices[clickedCat] || [0, 1, 2];
                    const firstCat = catsToUse[0];
                    if (firstCat) {
                      const labels = firstCat.labels || [];
                      topStats = indices
                        .filter((i) => i < labels.length)
                        .map((i) => {
                          const label = labels[i];
                          const match = statItems.find(
                            (item) => item.label === label,
                          );
                          return match || null;
                        })
                        .filter(Boolean);
                    }
                  }

                  return (
                    <>
                      {/* Card Header */}
                      <View
                        style={[
                          nflShareStyles.cardHeader,
                          {
                            backgroundColor: `${teamColor}22`,
                            borderBottomColor: teamColor,
                          },
                        ]}
                      >
                        {/* Top row: position badge + score */}
                        <View style={nflShareStyles.headerTopRow}>
                          <View
                            style={[
                              nflShareStyles.posBadge,
                              { backgroundColor: teamColor },
                            ]}
                          >
                            <Text
                              style={[
                                nflShareStyles.posBadgeText,
                                { color: getTextOnColor(teamColor) },
                              ]}
                            >
                              {pos
                                .replace(/([A-Z])/g, " $1")
                                .replace(/^./, (s) => s.toUpperCase())
                                .trim() || "POS"}
                            </Text>
                          </View>
                          {isGameFinished || isGameLive ? (
                            <View style={nflShareStyles.scoreWrap}>
                              <TeamLogoImage
                                team={awayTeam?.team || awayTeam}
                                style={nflShareStyles.scoreLogo}
                              />
                              <Text
                                style={[
                                  nflShareStyles.scoreText,
                                  { color: theme.text },
                                ]}
                              >
                                <Text
                                  style={{
                                    fontWeight:
                                      parseInt(awayTeam?.score) >
                                      parseInt(homeTeam?.score)
                                        ? "800"
                                        : "400",
                                  }}
                                >
                                  {awayTeam?.score ?? "0"}
                                </Text>
                                {" - "}
                                <Text
                                  style={{
                                    fontWeight:
                                      parseInt(homeTeam?.score) >
                                      parseInt(awayTeam?.score)
                                        ? "800"
                                        : "400",
                                  }}
                                >
                                  {homeTeam?.score ?? "0"}
                                </Text>
                              </Text>
                              <TeamLogoImage
                                team={homeTeam?.team || homeTeam}
                                style={nflShareStyles.scoreLogo}
                              />
                            </View>
                          ) : (
                            <Text
                              style={{
                                fontWeight: "800",
                                color: theme.text,
                                fontSize: 10,
                              }}
                            >
                              {gameDate
                                ? new Date(gameDate).toLocaleDateString(
                                    "en-US",
                                    {
                                      month: "short",
                                      day: "numeric",
                                    },
                                  )
                                : "GAME"}
                            </Text>
                          )}
                        </View>

                        {/* Headshot + name row */}
                        <View style={nflShareStyles.headshotRow}>
                          <Image
                            source={{ uri: headshotUri }}
                            style={[
                              nflShareStyles.cardHeadshot,
                              { borderColor: teamColor },
                            ]}
                            resizeMode="cover"
                          />
                          <View style={nflShareStyles.nameBlock}>
                            {/* Top priority stats above name (NHL-style) */}
                            {topStats.length > 0 ? (
                              <View
                                style={{
                                  flexDirection: "row",
                                  gap: 14,
                                  marginBottom: 8,
                                }}
                              >
                                {topStats.map((item, i) => (
                                  <View
                                    key={`top-${i}`}
                                    style={{ alignItems: "center" }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 18,
                                        fontWeight: "800",
                                        color: theme.text,
                                        lineHeight: 20,
                                      }}
                                    >
                                      {item.value}
                                    </Text>
                                    <Text
                                      style={{
                                        fontSize: 9,
                                        fontWeight: "600",
                                        textTransform: "uppercase",
                                        letterSpacing: 0.4,
                                        color: theme.textSecondary,
                                        marginTop: 1,
                                      }}
                                    >
                                      {item.label}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            ) : null}
                            <View style={nflShareStyles.nameDateRow}>
                              <View style={nflShareStyles.nameTeamWrap}>
                                <Text
                                  style={[
                                    nflShareStyles.fullName,
                                    { color: theme.text },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {fullName}
                                </Text>
                                <View style={nflShareStyles.teamNameRow}>
                                  <TeamLogoImage
                                    team={selectedPlayer?.team?.team}
                                    style={nflShareStyles.teamNameLogo}
                                  />
                                  <Text
                                    style={[
                                      nflShareStyles.teamNameLabel,
                                      { color: theme.textSecondary },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {selectedPlayer?.team?.team?.displayName ||
                                      selectedPlayer?.team?.team?.name ||
                                      selectedPlayer?.team?.team
                                        ?.abbreviation ||
                                      ""}
                                  </Text>
                                </View>
                              </View>
                              {gameDate && (
                                <View style={nflShareStyles.dateWrap}>
                                  <Text
                                    style={[
                                      nflShareStyles.gameDateLine,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    {new Date(gameDate).toLocaleDateString(
                                      "en-US",
                                      { month: "short", day: "numeric" },
                                    )}
                                  </Text>
                                  <Text
                                    style={[
                                      nflShareStyles.gameDateLine,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    {new Date(gameDate).toLocaleDateString(
                                      "en-US",
                                      { year: "numeric" },
                                    )}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                        </View>
                      </View>

                      {/* Stat grid (dynamic columns) */}
                      {(() => {
                        const gridItems = statItems.slice(0, 9);
                        const count = gridItems.length;
                        const cols = count >= 3 ? 3 : count === 2 ? 2 : 1;
                        const fullRows = Math.floor(count / cols);
                        const lastRowCount = count % cols || cols;
                        const isLastRowIncomplete = lastRowCount < cols;

                        return (
                          <View style={nflShareStyles.statGrid}>
                            {gridItems.map((item, i) => {
                              const row = Math.floor(i / cols);
                              const col = i % cols;
                              const isInLastRow = row === fullRows;
                              const rowItemCount = isInLastRow
                                ? lastRowCount
                                : cols;
                              const widthPct = `${100 / rowItemCount}%`;
                              const borderRight = col < rowItemCount - 1;
                              const borderBottom = row < fullRows;

                              return (
                                <View
                                  key={`stat-${i}`}
                                  style={[
                                    nflShareStyles.statCell,
                                    {
                                      borderColor: theme.border,
                                      width: widthPct,
                                    },
                                    borderRight && {
                                      borderRightWidth:
                                        StyleSheet.hairlineWidth,
                                    },
                                    borderBottom && {
                                      borderBottomWidth:
                                        StyleSheet.hairlineWidth,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      nflShareStyles.statVal,
                                      { color: theme.text },
                                    ]}
                                  >
                                    {item.value}
                                  </Text>
                                  <Text
                                    style={[
                                      nflShareStyles.statLbl,
                                      { color: theme.textSecondary },
                                    ]}
                                  >
                                    {item.label}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        );
                      })()}

                      {/* Footer */}
                      <View
                        style={[
                          nflShareStyles.cardFooter,
                          { borderTopColor: theme.border },
                        ]}
                      >
                        <Text
                          style={[
                            nflShareStyles.cardBrand,
                            { color: theme.text },
                          ]}
                        >
                          SportsHeart{" "}
                          <Ionicons
                            name="heart"
                            size={10}
                            color={colors.primary}
                          />
                        </Text>
                      </View>
                    </>
                  );
                })()
              ) : (
                <View style={{ padding: 24, alignItems: "center" }}>
                  <Text
                    allowFontScaling={false}
                    style={{ color: theme.textSecondary }}
                  >
                    No player selected
                  </Text>
                </View>
              )}
            </View>

            {/* Actions */}
            <View style={nflShareStyles.actions}>
              <TouchableOpacity
                style={[
                  nflShareStyles.actionBtn,
                  { backgroundColor: colors.secondary },
                ]}
                onPress={async () => {
                  await sharePlayerCopyCard();
                  setPlayerCopyModalVisible(false);
                }}
              >
                <View style={nflShareStyles.actionBtnRow}>
                  <Ionicons name="share-outline" size={16} color="#fff" />
                  <Text style={nflShareStyles.actionBtnTxt}>Share</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  nflShareStyles.actionBtn,
                  {
                    backgroundColor: theme.surface,
                    borderWidth: 1,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => setPlayerCopyModalVisible(false)}
              >
                <View style={nflShareStyles.actionBtnRow}>
                  <Ionicons name="close" size={16} color={theme.text} />
                  <Text
                    style={[nflShareStyles.actionBtnTxt, { color: theme.text }]}
                  >
                    Close
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Drive Details Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={driveModalVisible}
          onRequestClose={closeDriveModal}
        >
          <View style={styles.modalOverlay}>
            <View
              style={[styles.modalContent, { backgroundColor: theme.surface }]}
            >
              {/* Close Button */}
              <TouchableOpacity
                style={[
                  styles.modalCloseButton,
                  { backgroundColor: theme.error },
                ]}
                onPress={closeDriveModal}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.modalCloseText, { color: "#fff" }]}
                >
                  ×
                </Text>
              </TouchableOpacity>

              {selectedDrive && (
                <>
                  {/* Drive Header */}
                  <View style={styles.driveModalHeader}>
                    <View style={styles.driveModalTeamInfo}>
                      {selectedDrive.team && (
                        <TeamLogoImage
                          team={selectedDrive.team}
                          style={styles.driveModalTeamLogo}
                        />
                      )}
                      <View>
                        <Text
                          allowFontScaling={false}
                          style={[
                            styles.driveModalTeamName,
                            { color: theme.text },
                          ]}
                        >
                          {selectedDrive.team?.displayName || "Unknown Team"}
                        </Text>
                        <Text
                          allowFontScaling={false}
                          style={[
                            styles.driveModalResult,
                            { color: colors.primary },
                          ]}
                        >
                          {selectedDrive.displayResult ||
                            selectedDrive.result ||
                            "In Progress"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.driveModalDescriptionContainer}>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.driveModalDescription,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {getDriveSummary(selectedDrive)}
                      </Text>
                    </View>
                  </View>

                  {/* Drive Visual */}
                  {renderDriveYardLine(selectedDrive, awayTeam, homeTeam)}

                  {/* Drive Stats */}
                  <View
                    style={[
                      styles.driveModalStats,
                      { backgroundColor: theme.surfaceSecondary },
                    ]}
                  >
                    <View style={styles.driveModalStatItem}>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.driveModalStatLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Start
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.driveModalStatValue,
                          { color: theme.text },
                        ]}
                      >
                        {selectedDrive.start?.text || "N/A"}
                      </Text>
                    </View>

                    {/* Show End for completed drives or Current for drives in progress */}
                    {(() => {
                      const driveEnded = selectedDrive.end?.text;
                      const driveInProgress = !driveEnded;

                      if (driveEnded) {
                        return (
                          <View style={styles.driveModalStatItem}>
                            <Text
                              allowFontScaling={false}
                              style={[
                                styles.driveModalStatLabel,
                                { color: theme.textSecondary },
                              ]}
                            >
                              End
                            </Text>
                            <Text
                              allowFontScaling={false}
                              style={[
                                styles.driveModalStatValue,
                                { color: theme.text },
                              ]}
                            >
                              {selectedDrive.end.text}
                            </Text>
                          </View>
                        );
                      } else if (driveInProgress) {
                        // Find most recent play for current position
                        let currentPosition = "N/A";

                        if (
                          selectedDrive.plays &&
                          selectedDrive.plays.length > 0
                        ) {
                          const sortedPlays = [...selectedDrive.plays].sort(
                            (a, b) => {
                              const seqA = parseInt(a.sequenceNumber) || 0;
                              const seqB = parseInt(b.sequenceNumber) || 0;
                              return seqB - seqA;
                            },
                          );
                          const mostRecentPlay = sortedPlays[0];

                          if (mostRecentPlay.end?.text) {
                            currentPosition = mostRecentPlay.end.text;
                          } else if (
                            mostRecentPlay.end?.yardLine !== undefined
                          ) {
                            // Format yard line with team abbreviation like "CHI 33" or "MIN 24"
                            const yardLine = mostRecentPlay.end.yardLine;
                            if (yardLine === 50) {
                              currentPosition = "50";
                            } else if (yardLine > 50) {
                              const yardLineFromGoal = 100 - yardLine;
                              const opponentTeam =
                                selectedDrive.team?.abbreviation ===
                                homeTeam?.team?.abbreviation
                                  ? awayTeam
                                  : homeTeam;
                              currentPosition = `${
                                opponentTeam?.team?.abbreviation ||
                                opponentTeam?.abbreviation
                              } ${yardLineFromGoal}`;
                            } else {
                              currentPosition = `${selectedDrive.team?.abbreviation} ${yardLine}`;
                            }
                          }
                        }

                        // Fallback to game situation
                        if (
                          currentPosition === "N/A" &&
                          gameSituation?.possession?.yardLine !== undefined
                        ) {
                          currentPosition = `${gameSituation.possession.yardLine}`;
                        }

                        // Final fallback to start position
                        if (
                          currentPosition === "N/A" &&
                          selectedDrive.start?.text
                        ) {
                          currentPosition = selectedDrive.start.text;
                        }

                        return (
                          <View style={styles.driveModalStatItem}>
                            <Text
                              allowFontScaling={false}
                              style={[
                                styles.driveModalStatLabel,
                                { color: theme.textSecondary },
                              ]}
                            >
                              Current
                            </Text>
                            <Text
                              allowFontScaling={false}
                              style={[
                                styles.driveModalStatValue,
                                { color: theme.text },
                              ]}
                            >
                              {currentPosition}
                            </Text>
                          </View>
                        );
                      }
                      return null;
                    })()}

                    {selectedDrive.timeElapsed?.displayValue && (
                      <View style={styles.driveModalStatItem}>
                        <Text
                          allowFontScaling={false}
                          style={[
                            styles.driveModalStatLabel,
                            { color: theme.textSecondary },
                          ]}
                        >
                          Time
                        </Text>
                        <Text
                          allowFontScaling={false}
                          style={[
                            styles.driveModalStatValue,
                            { color: theme.text },
                          ]}
                        >
                          {selectedDrive.timeElapsed.displayValue}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Plays List */}
                  <View
                    style={[
                      styles.driveModalPlaysContainer,
                      { backgroundColor: theme.surfaceSecondary },
                    ]}
                  >
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.driveModalPlaysTitle,
                        { color: colors.primary },
                      ]}
                    >
                      Plays ({selectedDrive.plays?.length || 0})
                    </Text>
                    <ScrollView
                      style={styles.driveModalPlaysList}
                      scrollEventThrottle={16}
                      showsVerticalScrollIndicator={false}
                    >
                      {/* Show loading if drive doesn't have plays data and plays array is empty */}
                      {!selectedDrive.hasPlaysData &&
                      (!selectedDrive.plays ||
                        selectedDrive.plays.length === 0) ? (
                        <View style={styles.playerStatsLoading}>
                          <ActivityIndicator
                            size="large"
                            color={colors.primary}
                          />
                          <Text
                            allowFontScaling={false}
                            style={[
                              styles.loadingText,
                              { color: theme.textSecondary },
                            ]}
                          >
                            Loading plays...
                          </Text>
                        </View>
                      ) : selectedDrive.plays &&
                        selectedDrive.plays.length > 0 ? (
                        [...selectedDrive.plays]
                          .reverse()
                          .map((play, index) => (
                            <TouchableOpacity
                              key={index}
                              style={[
                                styles.driveModalPlayItem,
                                {
                                  backgroundColor: theme.surface,
                                  borderColor: theme.border,
                                },
                              ]}
                              onPress={() => {
                                handlePlayPress(play, selectedDrive);
                              }}
                              activeOpacity={0.7}
                            >
                              <View style={styles.driveModalPlayHeader}>
                                <Text
                                  allowFontScaling={false}
                                  style={[
                                    styles.driveModalPlayNumber,
                                    { color: colors.primary },
                                  ]}
                                >
                                  Play {selectedDrive.plays.length - index}
                                </Text>
                                {play.clock?.displayValue &&
                                  play.period?.number && (
                                    <Text
                                      allowFontScaling={false}
                                      style={[
                                        styles.driveModalPlayTime,
                                        { color: theme.textSecondary },
                                      ]}
                                    >
                                      Q{play.period.number}{" "}
                                      {play.clock.displayValue}
                                    </Text>
                                  )}
                              </View>
                              <Text
                                allowFontScaling={false}
                                style={[
                                  styles.driveModalPlayText,
                                  { color: theme.text },
                                ]}
                              >
                                {play.text || "No description available"}
                              </Text>
                              {/* Down and Yard information similar to scoreboard copycard */}
                              {(() => {
                                const downDistanceText =
                                  play.start?.downDistanceText ||
                                  play.end?.downDistanceText ||
                                  "";
                                return (
                                  (downDistanceText ||
                                    play.scoringPlay ||
                                    play.type?.text) && (
                                    <Text
                                      allowFontScaling={false}
                                      style={[
                                        styles.driveModalPlayYards,
                                        { color: theme.textSecondary },
                                      ]}
                                    >
                                      {[downDistanceText, play.type?.text]
                                        .filter(Boolean)
                                        .join(" • ")}
                                    </Text>
                                  )
                                );
                              })()}

                              {/* Probability indicator in bottom right like scoreboard copy card */}
                              {play.probability?.$ref && (
                                <PlayProbability
                                  probabilityRef={play.probability.$ref}
                                  driveTeam={selectedDrive.team}
                                  homeTeam={homeTeam?.team}
                                  awayTeam={awayTeam?.team}
                                />
                              )}
                            </TouchableOpacity>
                          ))
                      ) : (
                        <Text
                          allowFontScaling={false}
                          style={[
                            styles.driveModalNoPlays,
                            { color: theme.textSecondary },
                          ]}
                        >
                          No plays available for this drive
                        </Text>
                      )}
                    </ScrollView>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>

        {/* NFL Play Share Card Modal - Standalone, accessible from drives tab */}
        <Modal
          visible={!!shareCardPlay}
          transparent
          animationType="fade"
          onRequestClose={() => setShareCardPlay(null)}
        >
          <View
            style={[
              styles.modalOverlay,
              {
                backgroundColor: "rgba(0,0,0,0.85)",
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 1000,
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <TouchableOpacity
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
              activeOpacity={1}
              onPress={() => {
                setShareCardPlay(null);
              }}
            />
            <View
              ref={nflPlayShareCardRef}
              collapsable={false}
              style={[
                styles.nflPlayShareCard,
                { backgroundColor: theme.surface },
              ]}
            >
              {shareCardPlay &&
                (() => {
                  const play = shareCardPlay;

                  let teamColor = play.teamColor || "#000000";

                  let teamLogo = NFLService.convertToHttps(
                    play.driveTeam || "",
                  );

                  let teamName = play.teamName || "";

                  let teamAbbr = play.teamAbbr || "";

                  let winProbability = play.winProbability || 50;

                  // For interceptions (26) and fumbles (29), use the other team's color instead of the drive team's color
                  const playTypeId = play.type?.id;
                  if (
                    playTypeId === "26" ||
                    playTypeId === "29" ||
                    playTypeId === "36" ||
                    playTypeId === "80" ||
                    playTypeId === "34"
                  ) {
                    // Determine which team is the drive team
                    const driveTeamId = play.driveTeam?.id;
                    const homeTeamId = play.homeTeam?.team?.id;
                    const awayTeamId = play.awayTeam?.team?.id;
                    winProbability = 100 - winProbability;

                    // Use the other team's color
                    if (driveTeamId === homeTeamId) {
                      // Drive team is home, use away team's color
                      teamColor = play.awayTeam?.team?.color
                        ? `#${play.awayTeam.team.color}`
                        : "#000000";
                      teamLogo = play.awayTeam?.team;
                      teamName = play.awayTeam?.team?.displayName || teamName;
                      teamAbbr = play.awayTeam?.team?.abbreviation || teamAbbr;
                    } else if (driveTeamId === awayTeamId) {
                      // Drive team is away, use home team's color
                      teamColor = play.homeTeam?.team?.color
                        ? `#${play.homeTeam.team.color}`
                        : "#000000";
                      teamLogo = play.homeTeam?.team;
                      teamName = play.homeTeam?.team?.displayName || teamName;
                      teamAbbr = play.homeTeam?.team?.abbreviation || teamAbbr;
                    }
                  }
                  const clock = play.clock?.displayValue || "";
                  const period = play.period?.number || "";
                  const playText = play.text || "";
                  const downDistanceText =
                    play.start?.downDistanceText ||
                    play.end?.downDistanceText ||
                    "";
                  const yardLine =
                    play.end?.yardLine || play.end?.yardLine || 0;
                  const possession =
                    play.start?.possessionText || play.start?.yardLine || "";

                  // Get scores
                  const homeScore = parseInt(play.homeScore) || 0;
                  const awayScore = parseInt(play.awayScore) || 0;

                  // Get team logos
                  const homeTeamLogo = NFLService.convertToHttps(
                    play.homeTeam?.team?.logos?.[0]?.href || "",
                  );
                  const awayTeamLogo = NFLService.convertToHttps(
                    play.awayTeam?.team?.logos?.[0]?.href || "",
                  );

                  const headerTint = teamColor.startsWith("#")
                    ? `${teamColor}33`
                    : teamColor;
                  const shareDrive = play._drive;
                  let driveSummary;
                  if (shareDrive) {
                    driveSummary =
                      shareDrive.description ||
                      (() => {
                        const parts = [];
                        if (shareDrive.plays?.length)
                          parts.push(
                            `${shareDrive.plays.length} play${shareDrive.plays.length === 1 ? "" : "s"}`,
                          );
                        if (shareDrive.yards)
                          parts.push(`${shareDrive.yards} yds`);
                        if (shareDrive.timeElapsed?.displayValue)
                          parts.push(shareDrive.timeElapsed.displayValue);
                        if (shareDrive.result || shareDrive.displayResult)
                          parts.push(
                            shareDrive.displayResult || shareDrive.result,
                          );
                        return parts.length > 0 ? parts.join(", ") : "Drive";
                      })();
                  } else {
                    // Fallback: build summary from play data
                    const parts = [];
                    if (period)
                      parts.push(period > 4 ? `OT${period - 4}` : `Q${period}`);
                    if (clock) parts.push(clock);
                    if (play.type?.text) parts.push(play.type.text);
                    if (downDistanceText) parts.push(downDistanceText);
                    driveSummary =
                      parts.length > 0
                        ? parts.join(" · ")
                        : play.text || "Play";
                  }
                  const fieldWidth = 350;
                  const fieldHeight = 240;
                  const fieldWrapAspectRatio = fieldHeight / fieldWidth;
                  const rotatedFieldWidthPct = `${(fieldWidth / fieldHeight) * 100}%`;
                  const rotatedFieldHeightPct = `${(fieldHeight / fieldWidth) * 100}%`;
                  // Scoring plays show full drive span; regular plays show individual play span
                  const isScoringShare = !!play.scoringPlay;
                  const driveStartYard = isScoringShare
                    ? (shareDrive?.start?.yardLine ?? play.start?.yardLine)
                    : play.start?.yardLine;
                  const driveEndYard = isScoringShare
                    ? (shareDrive?.end?.yardLine ?? play.end?.yardLine)
                    : (play.end?.yardLine ?? play.start?.yardLine);
                  const hasDriveVisualization =
                    driveStartYard != null && driveEndYard != null;

                  // Extract players from play (similar to scoreboard.js)
                  const players = play.participants || [];

                  const renderYardMarkers = () => {
                    const markers = [];
                    const yardNumbers = [10, 20, 30, 40, 50, 40, 30, 20, 10];

                    for (let i = 0; i < yardNumbers.length; i++) {
                      const leftPosition = 10 + i * 10;

                      markers.push(
                        <View
                          key={`yard-${i}`}
                          style={{
                            position: "absolute",
                            left: `${leftPosition}%`,
                            top: 0,
                            bottom: 0,
                            width: 1,
                            backgroundColor: "white",
                            opacity: 0.45,
                          }}
                        />,
                      );

                      markers.push(
                        <View
                          key={`hash-top-${i}`}
                          style={{
                            position: "absolute",
                            left: `${leftPosition}%`,
                            top: "15%",
                            width: 4,
                            height: 1.5,
                            backgroundColor: "white",
                            marginLeft: -1.5,
                          }}
                        />,
                      );

                      markers.push(
                        <View
                          key={`hash-bottom-${i}`}
                          style={{
                            position: "absolute",
                            left: `${leftPosition}%`,
                            bottom: "15%",
                            width: 4,
                            height: 1.5,
                            backgroundColor: "white",
                            marginLeft: -1.5,
                          }}
                        />,
                      );

                      markers.push(
                        <Text
                          key={`label-top-${i}`}
                          style={{
                            position: "absolute",
                            left: `${leftPosition}%`,
                            top: "3.5%",
                            fontSize: 8,
                            fontWeight: "800",
                            color: "white",
                            marginLeft: -4.5,
                          }}
                        >
                          {yardNumbers[i]}
                        </Text>,
                      );

                      markers.push(
                        <Text
                          key={`label-bottom-${i}`}
                          style={{
                            position: "absolute",
                            left: `${leftPosition}%`,
                            bottom: "3.5%",
                            fontSize: 8,
                            fontWeight: "800",
                            color: "white",
                            marginLeft: -4.5,
                            transform: [{ rotate: "180deg" }],
                          }}
                        >
                          {yardNumbers[i]}
                        </Text>,
                      );
                    }

                    return markers;
                  };

                  const renderHashMarks = () => {
                    const marks = [];
                    for (let i = 1; i < 100; i++) {
                      marks.push(
                        <View
                          key={`hash-top-${i}`}
                          style={{
                            position: "absolute",
                            left: `${i}%`,
                            top: 0,
                            width: 1,
                            height: 3,
                            backgroundColor: "white",
                            opacity: 0.35,
                          }}
                        />,
                      );
                      marks.push(
                        <View
                          key={`hash-bottom-${i}`}
                          style={{
                            position: "absolute",
                            left: `${i}%`,
                            bottom: 0,
                            width: 1,
                            height: 3,
                            backgroundColor: "white",
                            opacity: 0.35,
                          }}
                        />,
                      );
                    }
                    return marks;
                  };

                  return (
                    <>
                      {/* Header */}
                      <View
                        style={{
                          backgroundColor: headerTint,
                          borderBottomWidth: 2,
                          borderBottomColor: teamColor,
                          paddingHorizontal: 14,
                          paddingTop: 12,
                          paddingBottom: 10,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 6,
                          }}
                        >
                          <View>
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: "800",
                                color: theme.text,
                              }}
                            >
                              {period > 4 ? `OT${period - 4}` : `Q${period}`}{" "}
                              {clock}
                            </Text>
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: "700",
                                color: theme.textSecondary,
                              }}
                            >
                              {downDistanceText || possession}
                            </Text>
                          </View>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            {homeTeamLogo ? (
                              <TeamLogoImage
                                team={play.homeTeam?.team}
                                style={{ width: 18, height: 18 }}
                              />
                            ) : null}
                            <Text
                              style={{
                                fontSize: 14,
                                fontWeight:
                                  homeScore > awayScore ? "800" : "500",
                                color: theme.text,
                              }}
                            >
                              {homeScore}
                            </Text>
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: "700",
                                color: theme.textSecondary,
                              }}
                            >
                              -
                            </Text>
                            <Text
                              style={{
                                fontSize: 14,
                                fontWeight:
                                  awayScore > homeScore ? "800" : "500",
                                color: theme.text,
                              }}
                            >
                              {awayScore}
                            </Text>
                            {awayTeamLogo ? (
                              <TeamLogoImage
                                team={play.awayTeam?.team}
                                style={{ width: 18, height: 18 }}
                              />
                            ) : null}
                          </View>
                        </View>

                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 6,
                          }}
                        >
                          {teamLogo ? (
                            <TeamLogoImage
                              team={teamLogo}
                              style={{ width: 28, height: 28 }}
                            />
                          ) : null}
                          <Text
                            style={{
                              fontSize: 18,
                              fontWeight: "800",
                              color: theme.text,
                            }}
                          >
                            {teamAbbr} - {play.type.text || "Play"}
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontSize: 12,
                            color: theme.textSecondary,
                            lineHeight: 16,
                          }}
                          numberOfLines={2}
                        >
                          {playText}
                        </Text>
                      </View>

                      {/* Body */}
                      <View style={{ flexDirection: "row" }}>
                        <View
                          style={{
                            width: "48%",
                            borderRightWidth: StyleSheet.hairlineWidth,
                            borderRightColor: theme.border,
                            paddingHorizontal: 8,
                            paddingVertical: 12,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: "700",
                              color: theme.textSecondary,
                              marginBottom: 8,
                              textAlign: "center",
                            }}
                          >
                            {driveSummary}
                          </Text>
                          <View
                            style={{
                              width: "100%",
                              alignItems: "center",
                              justifyContent: "center",
                              overflow: "hidden",
                            }}
                          >
                            <View
                              style={{
                                width: "100%",
                                aspectRatio: fieldWrapAspectRatio,
                                position: "relative",
                                overflow: "hidden",
                                alignSelf: "stretch",
                                justifyContent: "center",
                                alignItems: "center",
                              }}
                            >
                              <View
                                style={{
                                  width: rotatedFieldWidthPct,
                                  height: rotatedFieldHeightPct,
                                  position: "relative",
                                  backgroundColor: "#2d5016",
                                  borderWidth: 2,
                                  borderColor: "#1a3009",
                                  borderRadius: 4,
                                  overflow: "hidden",
                                  transform: [{ rotate: "90deg" }],
                                }}
                              >
                                <View
                                  style={{
                                    position: "absolute",
                                    left: 0,
                                    top: 0,
                                    bottom: 0,
                                    width: "10%",
                                    backgroundColor: teamColor,
                                    opacity: 0.65,
                                    justifyContent: "center",
                                    alignItems: "center",
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 8,
                                      fontWeight: "800",
                                      color: "white",
                                      transform: [{ rotate: "-90deg" }],
                                    }}
                                  >
                                    NFL
                                  </Text>
                                </View>

                                <View
                                  style={{
                                    position: "absolute",
                                    right: 0,
                                    top: 0,
                                    bottom: 0,
                                    width: "10%",
                                    backgroundColor: teamColor,
                                    opacity: 0.65,
                                    justifyContent: "center",
                                    alignItems: "center",
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 8,
                                      fontWeight: "800",
                                      color: "white",
                                      transform: [{ rotate: "90deg" }],
                                    }}
                                  >
                                    NFL
                                  </Text>
                                </View>

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

                                  <View
                                    style={{
                                      position: "absolute",
                                      left: "50%",
                                      top: 0,
                                      bottom: 0,
                                      width: 2,
                                      backgroundColor: "white",
                                      opacity: 1,
                                      marginLeft: -0.5,
                                    }}
                                  />

                                  <Image
                                    source={require("../../../assets/nfl.png")}
                                    style={{
                                      position: "absolute",
                                      left: "50%",
                                      top: "50%",
                                      width: 30,
                                      height: 30,
                                      marginLeft: -14.5,
                                      marginTop: -15,
                                      opacity: 1,
                                    }}
                                    resizeMode="contain"
                                  />

                                  {hasDriveVisualization &&
                                    (() => {
                                      const startPosForStart =
                                        100 - driveStartYard;
                                      const startPosForEnd = 100 - driveEndYard;
                                      const start = Math.min(
                                        startPosForStart,
                                        startPosForEnd,
                                      );
                                      const width = Math.abs(
                                        startPosForEnd - startPosForStart,
                                      );
                                      const gradientId = `drive-gradient-${driveStartYard}-${driveEndYard}`;
                                      const lighter =
                                        teamColor && teamColor.startsWith("#")
                                          ? `${teamColor}33`
                                          : teamColor;
                                      const darker =
                                        teamColor && teamColor.startsWith("#")
                                          ? `${teamColor}FF`
                                          : teamColor;
                                      const startIsLeft =
                                        startPosForStart <= startPosForEnd;

                                      const stops = startIsLeft
                                        ? [
                                            <Stop
                                              key="s1"
                                              offset="0%"
                                              stopColor={lighter}
                                              stopOpacity={0.35}
                                            />,
                                            <Stop
                                              key="s2"
                                              offset="100%"
                                              stopColor={darker}
                                              stopOpacity={0.95}
                                            />,
                                          ]
                                        : [
                                            <Stop
                                              key="s3"
                                              offset="0%"
                                              stopColor={darker}
                                              stopOpacity={0.95}
                                            />,
                                            <Stop
                                              key="s4"
                                              offset="100%"
                                              stopColor={lighter}
                                              stopOpacity={0.35}
                                            />,
                                          ];

                                      return (
                                        <>
                                          <Svg
                                            width="100%"
                                            height="100%"
                                            style={{
                                              position: "absolute",
                                              left: `${start}%`,
                                            }}
                                          >
                                            <Defs>
                                              <LinearGradient
                                                id={gradientId}
                                                x1="0%"
                                                y1="0%"
                                                x2="100%"
                                                y2="0%"
                                              >
                                                {stops}
                                              </LinearGradient>
                                            </Defs>
                                            <Rect
                                              x="0"
                                              y="0"
                                              width={`${width}%`}
                                              height="100%"
                                              fill={`url(#${gradientId})`}
                                              opacity={1}
                                            />
                                          </Svg>

                                          {/* Start and end indicator lines */}
                                          <View
                                            style={{
                                              position: "absolute",
                                              left: `${start}%`,
                                              top: 0,
                                              bottom: 0,
                                              width: 1,
                                              backgroundColor: teamColor,
                                              opacity: 1,
                                              marginLeft: -1,
                                            }}
                                          />
                                          <View
                                            style={{
                                              position: "absolute",
                                              left: `${start + width}%`,
                                              top: 0,
                                              bottom: 0,
                                              width: 1,
                                              backgroundColor: teamColor,
                                              opacity: 1,
                                              marginLeft: -1,
                                            }}
                                          />
                                        </>
                                      );
                                    })()}
                                </View>
                              </View>
                            </View>
                          </View>
                        </View>

                        <View
                          style={{
                            flex: 1,
                            paddingHorizontal: 12,
                            paddingVertical: 12,
                            justifyContent: "center",
                          }}
                        >
                          {/* Players Section */}
                          {players.length > 0 &&
                            (() => {
                              // Remove duplicates based on athlete ID
                              const uniquePlayers = [];
                              const seenIds = new Set();

                              players.forEach((player) => {
                                const athleteId = player?.athlete?.id;
                                if (athleteId && !seenIds.has(athleteId)) {
                                  seenIds.add(athleteId);
                                  uniquePlayers.push(player);
                                }
                              });

                              // If no unique players found, return null
                              if (uniquePlayers.length === 0) return null;

                              // Sort participants by order first
                              let participantsList = [...uniquePlayers].sort(
                                (a, b) => (a.order || 0) - (b.order || 0),
                              );

                              // Check for special cases using play type ID (like scoreboard.js)
                              const playTypeId = play.type?.id;
                              const isSpecialPlayType = [
                                "53",
                                "26",
                                "36",
                                "52",
                                "29",
                                "80",
                                "7",
                                "32",
                                "34",
                              ].includes(playTypeId); // Kickoff, Interception, Punt, Fumble, Sack
                              const isRushingPlay = playTypeId === "5"; // Rush
                              const isPassingPlay = playTypeId === "24"; // Pass Reception
                              const isScoringPlay =
                                play.scoringPlay ||
                                play.text?.toLowerCase().includes("touchdown");

                              // Get main participant using same logic as scoreboard.js
                              let mainPlayer;

                              // First check if it's a scoring play and prioritize the scorer
                              if (isScoringPlay) {
                                const scorer = participantsList.find(
                                  (p) =>
                                    p.type === "scorer" ||
                                    p.type === "rusher" ||
                                    p.type === "receiver",
                                );
                                if (scorer) {
                                  mainPlayer = scorer;
                                }
                              }

                              // If no scorer found or not a scoring play, use regular logic
                              if (!mainPlayer) {
                                if (
                                  isSpecialPlayType &&
                                  participantsList.length > 1
                                ) {
                                  // For special play types, look for recoverer, returner, or sackedBy participant type
                                  const specialParticipant =
                                    participantsList.find(
                                      (p) =>
                                        p.type === "recoverer" ||
                                        p.type === "returner" ||
                                        p.type === "sackedBy" ||
                                        p.type === "passDefender",
                                    );
                                  mainPlayer =
                                    specialParticipant || participantsList[0];
                                } else if (isRushingPlay) {
                                  // For rushing plays, prioritize the rusher
                                  const rusher = participantsList.find(
                                    (p) => p.type === "rusher",
                                  );
                                  mainPlayer = rusher || participantsList[0];
                                } else if (isPassingPlay) {
                                  // For passing plays, prioritize the receiver
                                  const receiver = participantsList.find(
                                    (p) => p.type === "receiver",
                                  );
                                  mainPlayer = receiver || participantsList[0];
                                } else {
                                  mainPlayer = participantsList[0]; // Use first participant normally
                                }
                              }

                              // Reorder participants array to put main participant first
                              if (
                                mainPlayer &&
                                (isSpecialPlayType ||
                                  isRushingPlay ||
                                  isPassingPlay ||
                                  isScoringPlay)
                              ) {
                                const otherParticipants =
                                  participantsList.filter(
                                    (p) =>
                                      p.athlete?.displayName !==
                                      mainPlayer.athlete?.displayName,
                                  );
                                participantsList = [
                                  mainPlayer,
                                  ...otherParticipants,
                                ];
                              }

                              // Safety check - ensure mainPlayer exists
                              if (!mainPlayer || !mainPlayer.athlete)
                                return null;

                              // Helper function to get player stats from cached boxscore data
                              const getPlayerStats = (
                                player,
                                playTypeId,
                                participantType,
                              ) => {
                                if (
                                  !gameDetails?.boxscore?.players ||
                                  !player?.athlete?.id
                                )
                                  return [];

                                // Find player in boxscore
                                let playerBoxscoreData = null;
                                for (const teamData of gameDetails.boxscore
                                  .players) {
                                  if (teamData.statistics) {
                                    for (const statCategory of teamData.statistics) {
                                      if (statCategory.athletes) {
                                        for (const athleteData of statCategory.athletes) {
                                          const athlete = athleteData.athlete;
                                          if (
                                            athlete &&
                                            (athlete.id === player.athlete.id ||
                                              athlete.id ===
                                                player.athlete.id.toString())
                                          ) {
                                            if (!playerBoxscoreData)
                                              playerBoxscoreData = {};
                                            playerBoxscoreData[
                                              statCategory.name
                                            ] = athleteData.stats || [];
                                          }
                                        }
                                      }
                                    }
                                  }
                                }

                                if (!playerBoxscoreData) return [];

                                // Define stat display logic based on play type and participant type
                                const stats = [];

                                // Special case: Interception (type 26)
                                if (
                                  playTypeId === "26" ||
                                  playTypeId === "36"
                                ) {
                                  if (participantType === "passer") {
                                    // Show yards and interceptions
                                    const passing =
                                      playerBoxscoreData.passing || [];
                                    if (passing[1])
                                      stats.push(`${passing[1]} yds`);
                                    if (passing[4])
                                      stats.push(`${passing[4]} INT`);
                                  } else if (
                                    participantType === "passDefender"
                                  ) {
                                    // Show interceptions and interception yards
                                    const defensive =
                                      playerBoxscoreData.interceptions || [];
                                    if (defensive[0])
                                      stats.push(`${defensive[0]} INT`);
                                    if (defensive[1])
                                      stats.push(`${defensive[1]} INT yds`);
                                  } else if (participantType === "returner") {
                                    // Show targets and yards
                                    const receiving =
                                      playerBoxscoreData.receiving || [];
                                    if (receiving[5])
                                      stats.push(`${receiving[5]} tgt`);
                                    if (receiving[1])
                                      stats.push(`${receiving[1]} yds`);
                                  } else if (
                                    participantType === "tackler" ||
                                    participantType === "assistedBy"
                                  ) {
                                    // Show total tackles
                                    const defensive =
                                      playerBoxscoreData.defensive || [];
                                    if (defensive[0])
                                      stats.push(`${defensive[0]} tkl`);
                                  }
                                }
                                // Special case: Kickoff (type 53)
                                else if (playTypeId === "53") {
                                  if (participantType === "returner") {
                                    // Show kick returns and yards
                                    const returning =
                                      playerBoxscoreData.kickReturns || [];
                                    if (returning[0])
                                      stats.push(`${returning[0]} ret`);
                                    if (returning[1])
                                      stats.push(`${returning[1]} yds`);
                                  } else if (
                                    participantType === "tackler" ||
                                    participantType === "assistedBy"
                                  ) {
                                    // Show total tackles
                                    const defensive =
                                      playerBoxscoreData.defensive || [];
                                    if (defensive[0])
                                      stats.push(`${defensive[0]} tkl`);
                                  }
                                } else if (playTypeId === "32") {
                                  if (
                                    participantType === "returner" ||
                                    participantType === "scorer"
                                  ) {
                                    const returning =
                                      playerBoxscoreData.kickReturns || [];
                                    if (returning[0])
                                      stats.push(`${returning[0]} ret`);
                                    if (returning[1])
                                      stats.push(`${returning[1]} yds`);
                                    if (returning[4])
                                      stats.push(`${returning[4]} TD`);
                                  } else if (
                                    participantType === "patScorer" ||
                                    participantType === "kicker"
                                  ) {
                                    const kicking =
                                      playerBoxscoreData.kicking || [];
                                    if (kicking[3])
                                      stats.push(`${kicking[3]} XP`);
                                  }
                                }
                                // Special case: Punt (type 52)
                                else if (
                                  playTypeId === "52" ||
                                  playTypeId === "34"
                                ) {
                                  if (participantType === "returner") {
                                    // Show punt returns and yards
                                    const returning =
                                      playerBoxscoreData.puntReturns || [];
                                    if (returning[0])
                                      stats.push(`${returning[0]} ret`);
                                    if (returning[1])
                                      stats.push(`${returning[1]} yds`);
                                  } else if (
                                    participantType === "tackler" ||
                                    participantType === "assistedBy"
                                  ) {
                                    // Show total tackles
                                    const defensive =
                                      playerBoxscoreData.defensive || [];
                                    if (defensive[0])
                                      stats.push(`${defensive[0]} tkl`);
                                  } else if (participantType === "punter") {
                                    // Show punts and yards
                                    const punting =
                                      playerBoxscoreData.punting || [];
                                    if (punting[0])
                                      stats.push(`${punting[0]} punts`);
                                    if (punting[1])
                                      stats.push(`${punting[1]} yds`);
                                  } else if (
                                    participantType === "patScorer" ||
                                    participantType === "kicker"
                                  ) {
                                    const kicking =
                                      playerBoxscoreData.kicking || [];
                                    if (kicking[3])
                                      stats.push(`${kicking[3]} XP`);
                                  }
                                  // Don't show stats for kicker
                                } else if (
                                  playTypeId === "29" ||
                                  playTypeId === "80"
                                ) {
                                  if (
                                    participantType === "fumbler" ||
                                    participantType === "rusher" ||
                                    participantType === "passer"
                                  ) {
                                    // Show fumbles
                                    const fumbles =
                                      playerBoxscoreData.fumbles || [];
                                    if (fumbles[0])
                                      stats.push(`${fumbles[0]} fum`);
                                  } else if (participantType === "recoverer") {
                                    // Show fumbles recovered
                                    const defensive =
                                      playerBoxscoreData.fumbles || [];
                                    if (defensive[2])
                                      stats.push(`${defensive[2]} rec`);
                                  } else if (
                                    participantType === "tackler" ||
                                    participantType === "assistedBy" ||
                                    participantType === "forcedBy"
                                  ) {
                                    // Show total tackles
                                    const defensive =
                                      playerBoxscoreData.defensive || [];
                                    if (defensive[0])
                                      stats.push(`${defensive[0]} tkl`);
                                  }
                                }
                                // Special case: Sack (type 7)
                                else if (playTypeId === "7") {
                                  if (participantType === "passer") {
                                    // Show sacks and yards
                                    const passing =
                                      playerBoxscoreData.passing || [];
                                    if (passing[5])
                                      stats.push(`${passing[5]} sck`);
                                    if (passing[1])
                                      stats.push(`${passing[1]} yds`);
                                  } else if (
                                    participantType === "sackedBy" ||
                                    participantType === "tackler" ||
                                    participantType === "assistedBy"
                                  ) {
                                    // Show sacks and total tackles
                                    const defensive =
                                      playerBoxscoreData.defensive || [];
                                    if (defensive[2])
                                      stats.push(`${defensive[2]} sck`);
                                    if (defensive[0])
                                      stats.push(`${defensive[0]} tkl`);
                                  }
                                }
                                // Special case: Field Goal (type 59)
                                else if (playTypeId === "59") {
                                  if (participantType === "kicker") {
                                    // Show field goals made and percentage
                                    const kicking =
                                      playerBoxscoreData.kicking || [];
                                    if (kicking[0])
                                      stats.push(`${kicking[0]} FG`);
                                    if (kicking[1])
                                      stats.push(`${kicking[1]}%`);
                                  }
                                }
                                // Regular cases
                                else {
                                  if (participantType === "rusher") {
                                    // Show attempts, yards, touchdowns
                                    const rushing =
                                      playerBoxscoreData.rushing || [];
                                    if (rushing[0])
                                      stats.push(`${rushing[0]} att`);
                                    if (rushing[1])
                                      stats.push(`${rushing[1]} yds`);
                                    if (rushing[3])
                                      stats.push(`${rushing[3]} TD`);
                                  } else if (participantType === "passer") {
                                    // Show completions/attempts, yards, touchdowns
                                    const passing =
                                      playerBoxscoreData.passing || [];
                                    if (passing[0])
                                      stats.push(`${passing[0]} c/att`);
                                    if (passing[1])
                                      stats.push(`${passing[1]} yds`);
                                    if (passing[3])
                                      stats.push(`${passing[3]} TD`);
                                  } else if (participantType === "receiver") {
                                    // Show receptions, yards, touchdowns
                                    const receiving =
                                      playerBoxscoreData.receiving || [];
                                    if (receiving[0])
                                      stats.push(`${receiving[0]} rec`);
                                    if (receiving[1])
                                      stats.push(`${receiving[1]} yds`);
                                    if (receiving[3])
                                      stats.push(`${receiving[3]} TD`);
                                  } else if (
                                    participantType === "assistedBy" ||
                                    participantType === "tackler"
                                  ) {
                                    // Show total tackles
                                    const defensive =
                                      playerBoxscoreData.defensive || [];
                                    if (defensive[0])
                                      stats.push(`${defensive[0]} tkl`);
                                  } else if (
                                    participantType === "passDefender"
                                  ) {
                                    // Show passes defended
                                    const defensive =
                                      playerBoxscoreData.defensive || [];
                                    if (defensive[4])
                                      stats.push(`${defensive[4]} PD`);
                                  } else if (participantType === "kicker") {
                                    // Show field goals and extra points
                                    const kicking =
                                      playerBoxscoreData.kicking || [];
                                    if (kicking[0])
                                      stats.push(`${kicking[3]} XP`);
                                  } else if (participantType === "punter") {
                                    // Show punts and yards
                                    const punting =
                                      playerBoxscoreData.punting || [];
                                    if (punting[0])
                                      stats.push(`${punting[0]} punts`);
                                    if (punting[1])
                                      stats.push(`${punting[1]} yds`);
                                  }
                                }

                                return stats;
                              };

                              const formatPlayerName = (player) => {
                                const fullName =
                                  player.athlete?.displayName ||
                                  player.athlete?.fullName;
                                if (!fullName) return "Unknown";

                                const nameParts = fullName.split(" ");
                                const formattedName =
                                  nameParts.length === 1
                                    ? fullName
                                    : `${nameParts[0][0]}. ${nameParts
                                        .slice(1)
                                        .join(" ")}`;

                                return formattedName;
                              };

                              const mainPlayerDisplay =
                                formatPlayerName(mainPlayer);
                              const mainPlayerId = mainPlayer.athlete?.id;
                              const mainPlayerHeadshot =
                                `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${mainPlayerId}.png&w=150` ||
                                mainPlayer.athlete?.headshot?.href;
                              const otherPlayers = participantsList.slice(1);
                              const mainPlayerStats = getPlayerStats(
                                mainPlayer,
                                playTypeId,
                                mainPlayer.type,
                              );
                              const parseStatItem = (stat) => {
                                if (!stat) return { value: "—", label: "" };
                                const parts = stat.split(" ");
                                if (parts.length === 1) {
                                  return { value: stat, label: "" };
                                }
                                const value = parts.shift();
                                return { value, label: parts.join(" ") };
                              };

                              return (
                                <View>
                                  <View
                                    style={{
                                      alignItems: "center",
                                      marginBottom: 10,
                                    }}
                                  >
                                    <Image
                                      source={{ uri: mainPlayerHeadshot }}
                                      style={{
                                        width: 60,
                                        height: 60,
                                        borderRadius: 30,
                                        marginBottom: 8,
                                        backgroundColor: teamColor + "88",
                                        borderWidth: 2,
                                        borderColor: teamColor,
                                      }}
                                    />
                                    <Text
                                      style={{
                                        fontSize: 16,
                                        fontWeight: "800",
                                        color: theme.text,
                                        textAlign: "center",
                                      }}
                                      numberOfLines={2}
                                    >
                                      {mainPlayerDisplay}
                                    </Text>
                                    <View
                                      style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        gap: 4,
                                        marginTop: 4,
                                      }}
                                    >
                                      <TeamLogoImage
                                        team={teamLogo}
                                        style={{ width: 14, height: 14 }}
                                        isDarkMode={isDarkMode}
                                      />
                                      <Text
                                        style={{
                                          fontSize: 11,
                                          fontWeight: "600",
                                          color: theme.textSecondary,
                                          textAlign: "center",
                                        }}
                                        numberOfLines={2}
                                      >
                                        {teamName || teamAbbr}
                                      </Text>
                                    </View>
                                  </View>

                                  <View
                                    style={{
                                      flexDirection: "row",
                                      flexWrap: "wrap",
                                      justifyContent: "space-between",
                                      marginBottom: 10,
                                    }}
                                  >
                                    {(mainPlayerStats.length
                                      ? mainPlayerStats
                                      : ["—"]
                                    ).map((stat, idx) => {
                                      const parsed = parseStatItem(stat);
                                      return (
                                        <View
                                          key={`${stat}-${idx}`}
                                          style={{
                                            width: "31%",
                                            paddingVertical: 6,
                                            alignItems: "center",
                                          }}
                                        >
                                          <Text
                                            style={{
                                              fontSize: 16,
                                              fontWeight: "800",
                                              color: theme.text,
                                              textAlign: "center",
                                            }}
                                          >
                                            {parsed.value}
                                          </Text>
                                          <Text
                                            style={{
                                              fontSize: 10,
                                              fontWeight: "700",
                                              textTransform: "uppercase",
                                              letterSpacing: 0.4,
                                              color: theme.textSecondary,
                                              textAlign: "center",
                                            }}
                                          >
                                            {parsed.label || "STAT"}
                                          </Text>
                                        </View>
                                      );
                                    })}
                                  </View>

                                  {otherPlayers.map((player, idx) => {
                                    const otherName = formatPlayerName(player);
                                    const otherStats = getPlayerStats(
                                      player,
                                      playTypeId,
                                      player.type,
                                    );
                                    if (!otherStats.length) return null;
                                    return (
                                      <View
                                        key={`${player.athlete?.id || idx}`}
                                        style={{ marginBottom: 10 }}
                                      >
                                        <Text
                                          style={{
                                            fontSize: 12,
                                            fontWeight: "700",
                                            color: theme.text,
                                            textAlign: "center",
                                          }}
                                          numberOfLines={1}
                                        >
                                          {otherName}
                                        </Text>
                                        <Text
                                          style={{
                                            fontSize: 11,
                                            color: theme.textSecondary,
                                            textAlign: "center",
                                          }}
                                          numberOfLines={1}
                                        >
                                          {otherStats.join(" • ").toUpperCase()}
                                        </Text>
                                      </View>
                                    );
                                  })}
                                </View>
                              );
                            })()}
                        </View>
                      </View>

                      {/* Footer inside the card */}
                      <View
                        style={[
                          styles.shareCardFooterPlay,
                          { borderTopColor: theme.border },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: "800",
                            color: theme.text,
                          }}
                        >
                          W {winProbability.toFixed(1)}%
                        </Text>
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: "800",
                            letterSpacing: 0.4,
                            color: theme.text,
                          }}
                        >
                          SportsHeart{" "}
                          <Ionicons
                            name="heart"
                            size={10}
                            color={colors.primary}
                          />
                        </Text>
                      </View>
                    </>
                  );
                })()}
            </View>

            {/* Action Buttons */}
            <View style={styles.nflPlayShareCardActions}>
              <View style={styles.nflPlayShareCardTopButtons}>
                <TouchableOpacity
                  style={[
                    styles.nflPlayShareCardButton,
                    { backgroundColor: colors.secondary },
                  ]}
                  onPress={async () => {
                    try {
                      const uri = await captureRef(nflPlayShareCardRef, {
                        format: "png",
                        quality: 2,
                      });
                      await Sharing.shareAsync(uri, {
                        mimeType: "image/png",
                        dialogTitle: "Share Play",
                      });
                    } catch (error) {
                      console.error("Error sharing play:", error);
                    }
                  }}
                >
                  <Ionicons name="share-outline" size={24} color="#fff" />
                  <Text
                    style={[
                      styles.nflPlayShareCardButtonText,
                      { color: "#fff" },
                    ]}
                  >
                    Share
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.nflPlayShareCardButton,
                    styles.nflPlayShareCardCancelButton,
                    { backgroundColor: theme.surfaceSecondary },
                  ]}
                  onPress={() => setShareCardPlay(null)}
                >
                  <Ionicons name="close" size={24} color={theme.text} />
                  <Text
                    style={[
                      styles.nflPlayShareCardButtonText,
                      { color: theme.text },
                    ]}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Stream Modal - Only render when streaming is unlocked */}
        {isStreamingUnlocked && (
          <Modal
            animationType="fade"
            transparent={true}
            visible={streamModalVisible}
            onRequestClose={closeStreamModal}
          >
            <View style={styles.streamModalOverlay}>
              <View
                style={[
                  styles.streamModalContainer,
                  { backgroundColor: theme.surface },
                ]}
              >
                {/* Modal Header */}
                <View
                  style={[
                    styles.streamModalHeader,
                    {
                      backgroundColor: theme.surfaceSecondary,
                      borderBottomColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.streamModalTitle, { color: colors.primary }]}
                  >
                    Live Stream
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.streamCloseButton,
                      { backgroundColor: theme.surfaceSecondary },
                    ]}
                    onPress={closeStreamModal}
                  >
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.streamCloseText,
                        {
                          color: colors.primary,
                          fontSize: 26,
                          fontWeight: "bold",
                        },
                      ]}
                    >
                      ×
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Stream Buttons - Show all available stream types */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={[
                    styles.streamButtonsContainer,
                    {
                      backgroundColor: theme.surfaceSecondary,
                      borderBottomColor: theme.border,
                    },
                  ]}
                  contentContainerStyle={styles.streamButtonsContent}
                >
                  {Object.keys(availableStreams).map((streamKey, index) => {
                    // Use the clean source name (admin, alpha, bravo, etc.)
                    const sourceName = streamKey;
                    const capitalizedName =
                      sourceName.charAt(0).toUpperCase() + sourceName.slice(1);

                    return (
                      <TouchableOpacity
                        key={streamKey}
                        style={[
                          styles.streamTypeButton,
                          {
                            backgroundColor:
                              currentStreamType === streamKey
                                ? colors.primary
                                : theme.surfaceSecondary,
                          },
                          { borderColor: theme.border },
                        ]}
                        onPress={() => switchStream(streamKey)}
                      >
                        <Text
                          allowFontScaling={false}
                          style={[
                            styles.streamTypeButtonText,
                            {
                              color:
                                currentStreamType === streamKey
                                  ? "#fff"
                                  : colors.primary,
                            },
                          ]}
                        >
                          {capitalizedName}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}

                  {/* Show message if no streams are available */}
                  {Object.keys(availableStreams).length === 0 && (
                    <View style={styles.noStreamsMessage}>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.noStreamsText,
                          { color: theme.textSecondary },
                        ]}
                      >
                        No live streams found for this game
                      </Text>
                    </View>
                  )}
                </ScrollView>

                {/* WebView Container */}
                <View style={styles.webViewContainer}>
                  {isStreamLoading && (
                    <View style={styles.streamLoadingOverlay}>
                      <ActivityIndicator size="large" color={colors.primary} />
                      <Text
                        allowFontScaling={false}
                        style={[styles.streamLoadingText, { color: "#fff" }]}
                      >
                        Loading stream...
                      </Text>
                    </View>
                  )}
                  {streamUrl ? (
                    <WebView
                      source={{ uri: streamUrl }}
                      style={styles.streamWebView}
                      javaScriptEnabled={true}
                      domStorageEnabled={true}
                      startInLoadingState={true}
                      scalesPageToFit={true}
                      mixedContentMode="compatibility"
                      allowsInlineMediaPlayback={true}
                      mediaPlaybackRequiresUserAction={false}
                      onLoadStart={() => setIsStreamLoading(true)}
                      onLoadEnd={() => setIsStreamLoading(false)}
                      onError={() => setIsStreamLoading(false)}
                      userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                      injectedJavaScript={`(function(){
                        function post(obj){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(obj)); }catch(e){} }
                        post({type:'instrumentation', event:'init'});
                        window.addEventListener('load', function(){ post({type:'lifecycle', event:'load', href:location.href}); });
                        document.addEventListener('DOMContentLoaded', function(){ post({type:'lifecycle', event:'domcontent', href:location.href}); });
                        try{ const origAssign = Location.prototype.assign; Location.prototype.assign = function(url){ post({type:'nav', method:'assign', url:url}); return origAssign.call(this, url); }; }catch(e){}
                        try{ const origReplace = Location.prototype.replace; Location.prototype.replace = function(url){ post({type:'nav', method:'replace', url:url}); return origReplace.call(this, url); }; }catch(e){}
                        try{ const hrefDesc = Object.getOwnPropertyDescriptor(Location.prototype,'href')||{}; if(hrefDesc && hrefDesc.set){ const origHrefSet = hrefDesc.set; Object.defineProperty(Location.prototype,'href',{ set:function(url){ post({type:'nav', method:'href', url:url}); return origHrefSet.call(this,url); }, get: hrefDesc.get }); } }catch(e){}
                        try{ const origOpen = window.open; window.open = function(url,target,features){ post({type:'nav', method:'window.open', url:url, target:target}); return origOpen.call(this,url,target,features); }; }catch(e){}
                        try{ const observer = new MutationObserver(function(muts){ muts.forEach(m=>{ m.addedNodes && m.addedNodes.forEach(n=>{ if(n.nodeType===1){ const tag=n.tagName.toLowerCase(); if(tag==='video'||tag==='iframe'||(n.querySelector&&(n.querySelector('video')||n.querySelector('iframe')))){ post({type:'dom', action:'added', tag:tag, html:n.outerHTML?(n.outerHTML.substring(0,200)):null, href:location.href}); } } }); m.removedNodes && m.removedNodes.forEach(n=>{ if(n.nodeType===1){ const tag=n.tagName.toLowerCase(); if(tag==='video'||tag==='iframe'||(n.querySelector&&(n.querySelector('video')||n.querySelector('iframe')))){ post({type:'dom', action:'removed', tag:tag, href:location.href}); } } }); }); }); observer.observe(document.documentElement||document.body,{ childList:true, subtree:true }); post({type:'instrumentation', event:'observer_started'}); }catch(e){ post({type:'instrumentation', event:'observer_error', error:String(e)}); }
                        function instrumentExistingVideos(){ const videos=document.querySelectorAll('video'); videos.forEach(v=>{ if(!v.__instrumented){ v.__instrumented=true; v.addEventListener('play',()=>post({type:'video', event:'play', src:v.currentSrc||v.src, href:location.href})); v.addEventListener('pause',()=>post({type:'video', event:'pause', src:v.currentSrc||v.src, href:location.href})); v.addEventListener('ended',()=>post({type:'video', event:'ended', src:v.currentSrc||v.src, href:location.href})); } }); }
                        setInterval(instrumentExistingVideos,1000);
                        true; })();`}
                      onMessage={(event) => {
                        try {
                          const data = JSON.parse(event.nativeEvent.data);
                        } catch (e) {}
                      }}
                      onNavigationStateChange={(navState) => {}}
                      // Block popup navigation within the WebView
                      onShouldStartLoadWithRequest={(request) => {
                        // Allow the initial stream URL to load
                        if (request.url === streamUrl) {
                          return true;
                        }

                        // Keywords that often indicate popups/ads
                        const popupKeywords = [
                          "popup",
                          "ad",
                          "ads",
                          "click",
                          "redirect",
                          "promo",
                        ];
                        const urlLower = request.url.toLowerCase();
                        const hasPopupKeywords = popupKeywords.some((keyword) =>
                          urlLower.includes(keyword),
                        );

                        const currentDomain = new URL(streamUrl).hostname;
                        let requestDomain = "";
                        try {
                          requestDomain = new URL(request.url).hostname;
                        } catch (e) {
                          if (
                            urlLower.startsWith("about:blank") ||
                            urlLower.startsWith("data:")
                          ) {
                            return true;
                          }
                          return false;
                        }

                        const sameRootDomain =
                          requestDomain === currentDomain ||
                          requestDomain.endsWith(`.${currentDomain}`) ||
                          currentDomain.endsWith(`.${requestDomain}`);

                        const allowPatterns = [
                          "/embed/",
                          "/embed-noads/",
                          "/player/",
                          ".html",
                          ".m3u8",
                          ".mpd",
                          "about:blank",
                          "data:",
                        ];
                        const allowIfEmbed = allowPatterns.some((p) =>
                          urlLower.includes(p),
                        );

                        if (hasPopupKeywords && !allowIfEmbed) {
                          return false;
                        }

                        if (sameRootDomain || allowIfEmbed) {
                          return true;
                        }
                        return false;
                      }}
                      onOpenWindow={() => false}
                    />
                  ) : (
                    <View style={styles.noStreamContainer}>
                      <Text
                        allowFontScaling={false}
                        style={styles.noStreamText}
                      >
                        Select a stream to watch
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </Modal>
        )}
      </Animated.ScrollView>

      {isLoggedIn && (
        <>
          {/* Floating Chat Button */}
          <TouchableOpacity
            style={[
              styles.floatingChatButton,
              { backgroundColor: colors.primary },
            ]}
            onPress={() => setChatModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={24}
              color="#fff"
            />
          </TouchableOpacity>

          {/* Chat Modal */}
          <Modal
            animationType="slide"
            transparent={true}
            visible={chatModalVisible}
            onRequestClose={() => setChatModalVisible(false)}
            presentationStyle="pageSheet"
          >
            <View style={styles.chatModalOverlay}>
              <View
                style={[
                  styles.chatModalContent,
                  { backgroundColor: theme.surface, paddingBottom: 20 },
                ]}
              >
                {/* Chat Modal Header */}
                <View
                  style={[
                    styles.chatModalHeader,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.chatModalTitle, { color: theme.text }]}
                  >
                    {gameDetails
                      ? `${
                          gameDetails.header.competitions[0].competitors.find(
                            (c) => c.homeAway === "away",
                          )?.team.name || "Away"
                        } vs ${
                          gameDetails.header.competitions[0].competitors.find(
                            (c) => c.homeAway === "home",
                          )?.team.name || "Home"
                        }`
                      : "Chat"}
                  </Text>
                  <TouchableOpacity
                    style={styles.chatModalCloseButton}
                    onPress={() => setChatModalVisible(false)}
                  >
                    <Ionicons name="close" size={24} color={theme.text} />
                  </TouchableOpacity>
                </View>

                {/* Chat Content */}
                <View style={styles.chatModalBody}>
                  {gameDetails && (
                    <ChatComponent
                      gameId={gameId}
                      gameData={gameDetails}
                      hideHeader={true}
                    />
                  )}
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  stickyTeamAway: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-start",
  },
  stickyTeamHome: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-end",
  },
  stickyTeamLogo: {
    width: 28,
    height: 28,
    marginHorizontal: 8,
  },
  stickyTeamScore: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#013369",
    minWidth: 35,
    textAlign: "center",
  },
  stickyTeamName: {
    fontSize: 14,
    fontWeight: "600",
    marginHorizontal: 8,
  },
  stickyStatus: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  stickyStatusText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#013369",
    textAlign: "center",
  },
  stickyClock: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    marginTop: 2,
  },
  stickyPossessionIndicator: {
    fontSize: 12,
    marginHorizontal: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  errorText: {
    fontSize: 16,
    color: "#666",
  },
  gameHeader: {
    padding: 20,
    marginBottom: 10,
  },
  teamContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  team: {
    alignItems: "center",
    flex: 1,
  },
  teamLogoContainer: {
    position: "relative",
    alignItems: "center",
  },
  teamLogo: {
    width: 50,
    height: 50,
    marginVertical: 8,
  },
  possessionIndicator: {
    fontSize: 12,
    position: "absolute",
    zIndex: 10,
  },
  awayPossession: {
    right: -5,
    top: -2,
  },
  homePossession: {
    left: -5,
    top: -2,
  },
  teamName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  },
  teamNameContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
    gap: 5,
  },
  teamScore: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#013369",
    marginBottom: 5,
  },
  losingTeamScore: {
    color: "#999",
  },
  losingTeamName: {
    color: "#999",
  },
  losingStickyTeamScore: {
    color: "#999",
  },
  vsContainer: {
    alignItems: "center",
    paddingHorizontal: 20,
  },
  vsText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#666",
    marginBottom: 5,
  },
  gameStatus: {
    fontSize: 14,
    fontWeight: "600",
    color: "#013369",
    marginBottom: 2,
  },
  gameClock: {
    fontSize: 12,
    color: "#666",
  },
  gameInfo: {
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingTop: 15,
  },
  venue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    marginBottom: 5,
  },
  date: {
    fontSize: 12,
    color: "#666",
  },
  // Yard Line Graphics Styles
  yardLineContainer: {
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingTop: 15,
  },
  yardLineField: {
    flexDirection: "row",
    width: "100%",
    height: 40,
    backgroundColor: "#2d5a2d",
    borderRadius: 4,
    alignItems: "center",
    position: "relative",
    paddingHorizontal: 5,
  },
  yardLineMark: {
    flex: 1,
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 255, 255, 0.3)",
    height: "100%",
    justifyContent: "center",
  },
  lastYardLineMark: {
    borderRightWidth: 0,
  },
  yardLineNumber: {
    color: "white",
    fontSize: 8,
    fontWeight: "bold",
    textShadow: "1px 1px 1px rgba(0, 0, 0, 0.5)",
  },
  endZoneLogo: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  ballPosition: {
    position: "absolute",
    top: -5,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  ballIcon: {
    fontSize: 16,
  },
  downAndDistance: {
    marginBottom: 10,
    alignItems: "center",
  },
  downText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#013369",
  },
  possessionText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#666",
    marginTop: 2,
  },
  // Tab Navigation Styles
  tabContainer: {
    flexDirection: "row",
    marginBottom: 10,
    borderRadius: 8,
    margin: 10,
    overflow: "hidden",
    elevation: 2,
    boxShadow: "0 2px 3.84px rgba(0, 0, 0, 0.1)",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "#e9ecef",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
  },
  section: {
    backgroundColor: "white",
    padding: 20,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 15,
  },
  summaryText: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
  // Linescore styles
  linescoreContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 10,
  },
  linescoreTable: {
    backgroundColor: "white",
    borderRadius: 6,
    overflow: "hidden",
  },
  linescoreHeader: {
    flexDirection: "row",
    backgroundColor: "#e9ecef",
    paddingVertical: 8,
  },
  linescoreHeaderCell: {
    flex: 1,
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 12,
    color: "#495057",
  },
  linescoreRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e9ecef",
    paddingVertical: 8,
    alignItems: "center",
  },
  linescoreTeamContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  linescoreTeamLogo: {
    width: 20,
    height: 20,
    marginRight: 5,
  },
  linescoreTeamCell: {
    fontWeight: "600",
    fontSize: 14,
    color: "#333",
  },
  linescoreCell: {
    flex: 1,
    textAlign: "center",
    fontSize: 14,
    color: "#333",
  },
  linescoreTotalCell: {
    flex: 1,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "bold",
    color: "#013369",
  },
  // Team stats styles
  statsContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 10,
  },
  statsHeader: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "#013369",
    marginBottom: 5,
    alignItems: "center",
  },
  statsTeamHeader: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  statsTeamLogo: {
    width: 20,
    height: 20,
    marginHorizontal: 5,
  },
  statsTeamName: {
    fontWeight: "bold",
    fontSize: 14,
    color: "#013369",
  },
  statsLabel: {
    flex: 2,
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 14,
    color: "#013369",
  },
  statRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e9ecef",
  },
  statAwayValue: {
    flex: 1,
    textAlign: "center",
    fontSize: 14,
    color: "#333",
  },
  statLabel: {
    flex: 2,
    textAlign: "center",
    fontSize: 13,
    color: "#666",
  },
  statHomeValue: {
    flex: 1,
    textAlign: "center",
    fontSize: 14,
    color: "#333",
  },
  // Leaders styles
  leadersContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 10,
  },
  leaderCategory: {
    marginBottom: 15,
    backgroundColor: "white",
    borderRadius: 6,
    padding: 10,
  },
  leaderCategoryTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#013369",
    textAlign: "center",
    marginBottom: 10,
  },
  leaderPlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  leaderHeadshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 8,
  },
  leaderTeamLogoContainer: {
    alignItems: "center",
    marginRight: 12,
  },
  leaderTeamLogo: {
    width: 18,
    height: 18,
    marginBottom: 2,
  },
  leaderJerseyNumber: {
    fontSize: 10,
    color: "#666",
    fontWeight: "500",
  },
  leaderPlayerInfo: {
    flex: 1,
    justifyContent: "center",
  },
  leaderNameRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  leaderPlayerName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  leaderPlayerPosition: {
    fontSize: 12,
    color: "#666",
    marginLeft: 4,
  },
  leaderStatsContainer: {
    alignItems: "flex-end",
    justifyContent: "center",
    minWidth: 80,
  },
  leaderStatsValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#013369",
    textAlign: "right",
  },
  // Individual Team Content Styles
  teamDetailsContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 15,
  },
  teamHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    backgroundColor: "white",
    padding: 15,
    borderRadius: 8,
  },
  teamDetailLogo: {
    width: 60,
    height: 60,
    marginRight: 15,
  },
  teamDetailName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 5,
  },
  teamRecord: {
    fontSize: 14,
    color: "#666",
  },
  individualTeamStats: {
    marginBottom: 20,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#013369",
    marginBottom: 10,
  },
  individualStatsContainer: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 10,
  },
  individualStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  individualStatLabel: {
    fontSize: 14,
    color: "#666",
    flex: 1,
  },
  individualStatValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    textAlign: "right",
  },
  individualTeamLeaders: {
    marginBottom: 10,
  },
  individualLeaderCategory: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  individualLeaderCategoryTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#013369",
    textAlign: "center",
    marginBottom: 10,
  },
  individualLeaderPlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  individualLeaderHeadshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  individualLeaderPlayerInfo: {
    flex: 1,
    justifyContent: "center",
  },
  individualLeaderNameRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 4,
  },
  individualLeaderPlayerName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  individualLeaderPlayerPosition: {
    fontSize: 12,
    color: "#666",
    marginLeft: 4,
  },
  individualLeaderStatsValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#013369",
  },
  // Drives Content Styles
  drivesContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 20,
    alignItems: "center",
  },
  drivesScrollView: {
    maxHeight: 600,
  },
  driveCard: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
    elevation: 2,
  },
  driveHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  driveTeamInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  driveTeamLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  driveTeamName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  driveNumber: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#013369",
  },
  driveDetails: {
    marginBottom: 10,
  },
  driveResult: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#013369",
    marginBottom: 5,
  },
  driveDescription: {
    fontSize: 14,
    color: "#666",
    fontStyle: "italic",
  },
  driveStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 10,
    paddingVertical: 8,
    backgroundColor: "#f8f9fa",
    borderRadius: 6,
  },
  driveStatItem: {
    alignItems: "center",
  },
  driveStatLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  driveStatValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  drivePlaysList: {
    marginTop: 10,
  },
  drivePlaysTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#013369",
    marginBottom: 8,
  },
  drivePlayItem: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  drivePlayText: {
    fontSize: 13,
    color: "#333",
    marginBottom: 2,
  },
  drivePlayTime: {
    fontSize: 11,
    color: "#666",
  },
  driveMorePlays: {
    fontSize: 12,
    color: "#013369",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 8,
  },
  // Team Box Score Styles
  teamBoxScoreHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  teamBoxScoreLogo: {
    width: 30,
    height: 30,
    marginRight: 12,
    marginTop: -15,
  },
  teamBoxScoreContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 10,
  },
  statCategoryContainer: {
    backgroundColor: "white",
    borderRadius: 6,
    padding: 10,
    marginBottom: 15,
  },
  statCategoryTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#013369",
    marginBottom: 10,
    textAlign: "center",
  },
  statTableHeader: {
    flexDirection: "row",
    backgroundColor: "#e9ecef",
    paddingVertical: 8,
    paddingHorizontal: 5,
    borderRadius: 4,
    marginBottom: 5,
  },
  statTableHeaderPlayer: {
    flex: 2,
    fontSize: 12,
    fontWeight: "bold",
    color: "#495057",
  },
  statTableHeaderStat: {
    flex: 1,
    fontSize: 12,
    fontWeight: "bold",
    color: "#495057",
    textAlign: "center",
  },
  statTableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    alignItems: "center",
  },
  statTablePlayerCell: {
    flex: 2,
    justifyContent: "center",
  },
  statTablePlayerName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  statTablePlayerNumber: {
    fontSize: 11,
    color: "#666",
  },
  statTableStatCell: {
    flex: 1,
    fontSize: 13,
    color: "#333",
    textAlign: "center",
  },
  placeholderText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
    textAlign: "center",
    marginBottom: 10,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    lineHeight: 20,
  },
  // Player Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 12,
    width: "100%",
    maxHeight: "95%",
    padding: 20,
    boxShadow: "0 2px 3.84px rgba(0, 0, 0, 0.25)",
    elevation: 5,
    display: "flex",
    flexDirection: "column",
  },
  modalCloseButton: {
    position: "absolute",
    top: 15,
    right: 15,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  modalCloseText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#666",
  },
  playerHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    marginTop: 10,
  },
  playerCopyCardSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  playerCopyCardDateWrap: {
    flex: 1,
    justifyContent: "center",
  },
  playerCopyCardDate: {
    fontSize: 12,
  },
  playerCopyCardScoresRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  playerCopyCardTeamWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 6,
  },
  playerCopyCardTeamLogo: {
    width: 22,
    height: 22,
    marginHorizontal: 6,
  },
  playerCopyCardScoreText: {
    fontSize: 18,
    fontWeight: "700",
  },
  playerCopyCardVsText: {
    fontSize: 14,
    marginHorizontal: 6,
    fontWeight: "900",
  },
  playerCopyModalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 14,
    alignItems: "center",
  },
  playerCopyCancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  playerCopyCancelText: {
    fontSize: 16,
    fontWeight: "600",
  },
  playerCopyShareButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 15,
  },
  playerCopyShareText: {
    fontSize: 16,
    fontWeight: "600",
  },
  playerHeadshot: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginRight: 15,
    backgroundColor: "#f0f0f0",
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 5,
  },
  playerDetails: {
    fontSize: 18,
    color: "#666",
    marginBottom: 3,
  },
  playerTeamInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  playerTeamLogo: {
    width: 20,
    height: 20,
    marginRight: 6,
  },
  playerTeamName: {
    fontSize: 14,
    color: "#013369",
    fontWeight: "600",
  },
  playerStatsContainer: {
    // allow modal to expand with content; don't cap player stats height here
    maxHeight: undefined,
    marginTop: 10,
  },
  playerStatsLoading: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  playerStatsContent: {
    marginBottom: -20,
  },
  playerStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  statTile: {
    width: "28%",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
    marginBottom: 10,
  },
  statTileValue: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
    color: "#fff",
  },
  statTileLabel: {
    fontSize: 12,
    color: "#bbb",
    textAlign: "center",
  },
  playerStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  playerStatLabel: {
    fontSize: 14,
    color: "#666",
    flex: 1,
  },
  playerStatValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    textAlign: "right",
  },
  noStatsText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    padding: 40,
  },
  // Drive Yard Line Graphic Styles
  driveYardLineContainer: {
    marginVertical: 15,
    paddingHorizontal: 5,
  },
  driveProgressBar: {
    width: "100%",
    height: 20,
    position: "relative",
    marginBottom: 10,
  },
  driveBaseBar: {
    width: "100%",
    height: "100%",
    backgroundColor: "#e0e0e0",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  driveProgressFill: {
    position: "absolute",
    top: 1,
    height: 18,
    borderRadius: 9,
  },
  driveYardLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 5,
  },
  driveYardLabel: {
    fontSize: 10,
    color: "#666",
    fontWeight: "500",
  },
  driveGradientLayer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "100%",
  },
  driveGradientSegment: {
    position: "absolute",
    top: 0,
    bottom: 0,
  },
  driveMarker: {
    position: "absolute",
    top: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  driveStartMarker: {
    backgroundColor: "white",
  },
  driveEndMarker: {
    borderColor: "white",
  },
  driveCurrentMarker: {
    backgroundColor: "orange",
    borderColor: "orange",
  },
  driveMarkerText: {
    fontSize: 8,
    fontWeight: "bold",
    color: "white",
  },
  tapIndicator: {
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    marginTop: 10,
  },
  tapIndicatorText: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
  },
  // Drive Modal Styles
  driveModalHeader: {
    marginBottom: 20,
    marginTop: 10,
  },
  driveModalTeamInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  driveModalTeamLogo: {
    width: 40,
    height: 40,
    marginRight: 15,
  },
  driveModalTeamName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 2,
  },
  driveModalResult: {
    fontSize: 14,
    color: "#013369",
    fontWeight: "600",
  },
  driveModalDescription: {
    fontSize: 14,
    color: "#666",
    fontStyle: "italic",
  },
  driveModalDescriptionContainer: {
    marginTop: 8,
    marginBottom: 8,
  },
  driveModalStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 15,
    marginVertical: 15,
  },
  driveModalStatItem: {
    alignItems: "center",
  },
  driveModalStatLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 5,
  },
  driveModalStatValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  driveModalPlaysContainer: {
    marginTop: 15,
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 15,
    maxHeight: 450,
    minHeight: 200,
  },
  driveModalPlaysTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#013369",
    marginBottom: 15,
  },
  driveModalPlaysList: {
    maxHeight: 300,
  },
  driveModalPlayItem: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e1e5e9",
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
    elevation: 2,
    position: "relative",
  },
  driveModalPlayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  driveModalPlayNumber: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#013369",
  },
  driveModalPlayTime: {
    fontSize: 12,
    color: "#666",
  },
  driveModalPlayText: {
    fontSize: 14,
    color: "#333",
    lineHeight: 22,
    marginBottom: 8,
  },
  driveModalPlayYards: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
    paddingTop: 5,
  },
  driveModalNoPlays: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    padding: 40,
    fontStyle: "italic",
  },
  // Probability Styles
  playProbabilityContainer: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  playProbabilityLogo: {
    width: 14,
    height: 14,
    marginRight: 4,
  },
  playProbabilityText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#ffffff",
  },
  // Summary Content Styles
  summaryContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 20,
    alignItems: "center",
  },
  summaryScrollView: {
    maxHeight: 600,
  },
  summaryCard: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
    elevation: 2,
  },
  summarySectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#013369",
    marginBottom: 10,
  },
  summaryText: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },
  highlightItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  highlightTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#013369",
    marginBottom: 5,
  },
  highlightDescription: {
    fontSize: 13,
    color: "#666",
    lineHeight: 18,
  },
  newsItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  newsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 5,
  },
  newsDescription: {
    fontSize: 13,
    color: "#666",
    lineHeight: 18,
  },
  // Plays Content Styles
  playsContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 20,
    alignItems: "center",
  },
  playsScrollView: {
    maxHeight: 600,
  },
  playCard: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
    elevation: 2,
  },
  playHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  playSequence: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#013369",
  },
  playTime: {
    fontSize: 12,
    color: "#666",
  },
  playText: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
    marginBottom: 8,
  },
  playDetails: {
    backgroundColor: "#f8f9fa",
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 5,
  },
  playDetailsText: {
    fontSize: 12,
    color: "#666",
    fontWeight: "500",
  },
  playFieldPosition: {
    paddingTop: 4,
  },
  playFieldText: {
    fontSize: 12,
    color: "#013369",
    fontStyle: "italic",
  },
  // New position-specific stats styles
  statCategory: {
    marginBottom: 8,
  },
  teamHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  teamHeaderLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  teamHeaderName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#013369",
  },
  statCategoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  statSubcategoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  footballEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  statCategoryTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#555",
  },
  debugText: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    color: "#777",
    textAlign: "center",
  },
  // Roster styles
  rosterContainer: {
    padding: 16,
  },
  rosterSection: {
    marginBottom: 20,
  },
  rosterSectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#013369",
    marginBottom: 12,
  },
  rosterPlayersList: {
    flex: 1,
  },
  rosterPlayerCard: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 8,
    minWidth: 100,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  rosterPlayerNumber: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#013369",
    marginBottom: 2,
  },
  rosterPlayerName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
    marginBottom: 2,
  },
  rosterPlayerPosition: {
    fontSize: 10,
    color: "#666",
    fontWeight: "500",
  },
  rosterPositionGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  rosterPosition: {
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    minWidth: 40,
    textAlign: "center",
  },
  // Roster table styles
  rosterTableHeader: {
    flexDirection: "row",
    backgroundColor: "#e9ecef",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginBottom: 5,
  },
  rosterTableHeaderPlayer: {
    flex: 3,
    fontSize: 12,
    fontWeight: "bold",
    color: "#495057",
  },
  rosterTableHeaderStatus: {
    flex: 1,
    fontSize: 12,
    fontWeight: "bold",
    color: "#495057",
    textAlign: "center",
  },
  rosterTableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    alignItems: "center",
  },
  rosterTablePlayerCell: {
    flex: 3,
  },
  rosterTablePlayerName: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 2,
  },
  rosterTablePlayerDetails: {
    fontSize: 12,
    color: "#666",
  },
  rosterTablePlayerNumber: {
    color: "#666",
    fontWeight: "500",
  },
  rosterTableStatusRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    backgroundColor: "#fafafa",
  },
  rosterTableStatusText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  // Down and distance styles
  headerDownAndDistance: {
    alignItems: "center",
    marginTop: 8,
    paddingHorizontal: 16,
  },
  headerDownText: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  headerPossessionText: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 2,
  },
  // Stream styles
  streamButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    marginVertical: 8,
    borderRadius: 8,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  streamButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  streamModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  streamModalContainer: {
    width: "95%",
    maxWidth: 800,
    height: "85%",
    maxHeight: 325,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  streamModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
  },
  streamModalTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  streamModalCloseButton: {
    padding: 8,
  },
  streamModalCloseText: {
    fontSize: 26,
    fontWeight: "bold",
  },
  streamButtonsContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    maxHeight: 60,
  },
  streamButtonsContent: {
    paddingHorizontal: 10,
    gap: 10,
    alignItems: "center",
  },
  streamSourceButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 80,
    alignItems: "center",
    marginHorizontal: 5,
  },
  streamSourceButtonText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  webViewContainer: {
    flex: 1,
    position: "relative",
  },
  streamLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    zIndex: 1,
  },
  streamTypeContainer: {
    paddingVertical: 12,
  },
  streamTypeScrollView: {
    paddingHorizontal: 16,
  },
  streamTypeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
  },
  streamTypeButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  streamQualityText: {
    fontSize: 12,
    marginTop: 2,
  },
  streamContent: {
    flex: 1,
  },
  streamLoadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  streamLoadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  streamWebView: {
    flex: 1,
  },
  noStreamContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  noStreamText: {
    fontSize: 16,
    textAlign: "center",
  },
  // Floating Chat Button
  floatingChatButton: {
    position: "absolute",
    bottom: 30,
    left: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  // Chat Modal Styles
  chatModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0)",
    justifyContent: "flex-end",
  },
  chatModalContent: {
    height: "85%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  chatModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  chatModalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    flex: 1,
    textAlign: "center",
    marginRight: -20,
  },
  chatModalCloseButton: {
    padding: 4,
  },
  chatModalBody: {
    flex: 1,
  },

  // Injury card styles
  injuryStatusBadge: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  injuryDetailValue: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  injuryStatusLabel: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginTop: 1,
  },

  // Prediction Section Styles
  predictionContainer: {
    padding: 16,
    borderRadius: 8,
  },
  predictionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  predictionTeamHeader: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  predictionTeamHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-start",
  },
  predictionTeamHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-end",
  },
  predictionTeamLogo: {
    width: 32,
    height: 32,
    marginHorizontal: 8,
  },
  predictionTeamName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  predictionVs: {
    fontSize: 14,
    fontWeight: "bold",
    marginHorizontal: 16,
  },
  predictionBarContainer: {
    marginBottom: 12,
  },
  predictionBar: {
    height: 24,
    borderRadius: 12,
    flexDirection: "row",
    overflow: "hidden",
    position: "relative",
  },
  predictionFill: {
    height: "100%",
    position: "absolute",
    top: 0,
  },
  predictionAwayFill: {
    left: 0,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  predictionHomeFill: {
    right: 0,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  predictionPercentages: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  predictionPercentage: {
    fontSize: 16,
    fontWeight: "bold",
  },

  // NFL Play Share Card Styles
  nflPlayShareCard: {
    width: 360,
    backgroundColor: "#fff",
    borderRadius: 0,
  },
  nflPlayShareCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 12,
  },
  nflPlayShareCardTeamLogo: {
    width: 32,
    height: 32,
  },
  nflPlayShareCardTeamName: {
    fontSize: 18,
    fontWeight: "bold",
  },
  nflPlayShareCardInfoBar: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  nflPlayShareCardQuarter: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  nflPlayShareCardScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  nflPlayShareCardScoreBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nflPlayShareCardScoreTeam: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nflPlayShareCardScoreLogo: {
    width: 24,
    height: 24,
  },
  nflPlayShareCardScore: {
    fontSize: 20,
    fontWeight: "bold",
  },
  nflPlayShareCardScoreSeparator: {
    fontSize: 18,
    fontWeight: "600",
  },
  nflPlayShareCardWinProbability: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  nflPlayShareCardWinProbText: {
    fontSize: 13,
    fontWeight: "bold",
  },
  nflPlayShareCardDriveIndicator: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  nflPlayShareCardDriveField: {
    height: 12,
    backgroundColor: "#e0e0e0",
    borderRadius: 6,
    position: "relative",
    marginBottom: 8,
  },
  nflPlayShareCardFieldLine: {
    position: "absolute",
    width: 2,
    height: "100%",
    backgroundColor: "#fff",
    top: 0,
  },
  nflPlayShareCardDriveProgress: {
    position: "absolute",
    height: "100%",
    borderRadius: 6,
    top: 0,
  },
  nflPlayShareCardDriveText: {
    fontSize: 11,
    textAlign: "center",
  },
  nflPlayShareCardPlayDescription: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  nflPlayShareCardPlayText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  nflPlayShareCardPlayersSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  nflPlayShareCardPlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  nflPlayShareCardPlayerInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginTop: -17.5,
  },
  nflPlayShareCardPlayerImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    backgroundColor: "#f0f0f0",
  },
  nflPlayShareCardPlayerDetails: {
    flex: 1,
  },
  nflPlayShareCardPlayerName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  nflPlayShareCardOtherPlayerName: {
    fontSize: 13,
    marginTop: 2,
  },
  nflPlayShareCardPlayerTeam: {
    fontSize: 12,
  },
  nflPlayShareCardPlayerStats: {
    alignItems: "flex-end",
  },
  nflPlayShareCardStatValue: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 2,
  },
  nflPlayShareCardStatLabel: {
    fontSize: 11,
    textTransform: "uppercase",
  },
  nflPlayShareCardActions: {
    marginTop: 24,
    width: "100%",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  nflPlayShareCardTopButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 12,
  },
  shareCardFooter: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: -8,
    paddingBottom: 16,
  },
  shareCardFooterPlay: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e0e0e0",
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shareCardFooterText: {
    fontSize: 15,
    fontWeight: "800",
  },
  nflPlayShareCardButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  nflPlayShareCardCancelButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  nflPlayShareCardButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
});

// ── NHL-style header styles ────────────────────────────────────────
const nflHeaderStyles = StyleSheet.create({
  header: {
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
    overflow: "hidden",
    position: "relative",
  },
  leagueRow: {
    marginTop: -6,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  leagueName: {
    fontSize: 12,
    fontWeight: "500",
  },
  teamsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  teamSide: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  logoScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logoWrap: {
    position: "relative",
  },
  teamLogo: {
    width: 70,
    height: 70,
  },
  possessionBadgeAway: {
    position: "absolute",
    top: -4,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  possessionBadgeHome: {
    position: "absolute",
    top: -4,
    left: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "90deg" }],
  },
  teamScore: {
    fontSize: 32,
    lineHeight: 48,
    fontWeight: "800",
    minWidth: 24,
    textAlign: "center",
  },
  teamNameRow: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    maxWidth: 130,
    gap: 6,
  },
  teamName: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 17,
    maxWidth: 130,
    textAlign: "center",
  },
  teamRecord: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  statusCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  statusBadge: {
    paddingHorizontal: 8,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  statusMain: {
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  statusSub: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 2,
  },
  streamBtn: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
    borderWidth: 1,
    marginHorizontal: 5,
    marginTop: 6,
  },
  streamBtnInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  streamBtnDot: { width: 8, height: 8, borderRadius: 4 },
  streamBtnText: { fontWeight: "700", fontSize: 12 },
  downDistanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 10,
  },
  downDistanceText: {
    fontSize: 13,
    fontWeight: "700",
  },
  possessionLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  // Sticky header
  stickyHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    zIndex: 1000,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    borderBottomWidth: 1,
  },
  stickySide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stickyLogo: {
    width: 34,
    height: 30,
  },
  stickyAbbr: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  stickyScore: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "800",
  },
  stickyStatusBlock: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 1,
    paddingHorizontal: 4,
  },
  stickyStatusLine: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  stickyStatusSub: {
    fontSize: 10,
    textAlign: "center",
    marginTop: 1,
  },
  // Sticky unit (contains mini header + tab bar)
  stickyUnit: {
    borderBottomWidth: 1,
  },
  stickyMini: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    overflow: "hidden",
    borderBottomWidth: 1,
  },
  miniSide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  miniLogo: {
    width: 34,
    height: 30,
  },
  miniAbbr: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  miniScore: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "800",
  },
  miniStatusBlock: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 1,
    paddingHorizontal: 4,
  },
  miniStatusLine: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  miniStatusSub: {
    fontSize: 10,
    textAlign: "center",
    marginTop: 1,
  },
  // Tab bar (horizontal scrollable, 4 visible at a time)
  tabBarContent: {
    flexDirection: "row",
  },
  tabBarButton: {
    width: width / 4,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabBarLabel: {
    fontSize: 13,
    letterSpacing: 0.2,
  },
});

// ── Main tab styles ────────────────────────────────────────────────
const nflMainStyles = StyleSheet.create({
  fieldCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  fieldHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fieldHeaderAccent: {
    width: 4,
    height: 16,
    borderRadius: 2,
  },
  fieldHeaderTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  fieldHeaderDrive: {
    fontSize: 11,
    fontWeight: "600",
  },
  fieldBody: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
  },
  fieldGraphic: {
    width: "100%",
    height: 60,
    borderRadius: 6,
    position: "relative",
    overflow: "hidden",
  },
  endZone: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "10%",
    justifyContent: "center",
    alignItems: "center",
  },
  endZoneText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  yardLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 2,
  },
  yardNum: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 8,
    fontWeight: "700",
  },
  ballMarker: {
    position: "absolute",
    top: "50%",
    marginTop: -10,
    marginLeft: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  downDistRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 10,
  },
  downDistText: {
    fontSize: 14,
    fontWeight: "800",
  },
  possText: {
    fontSize: 12,
    fontWeight: "600",
  },
  // Win probability
  wpCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  wpHeaderRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  wpTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  wpBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  wpTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  wpLogo: {
    width: 24,
    height: 20,
  },
  wpPct: {
    fontSize: 14,
    fontWeight: "800",
    minWidth: 36,
    textAlign: "center",
  },
  wpBarTrack: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
  },
  wpBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  // Scoring summary
  scoringCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  scoringHeaderRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scoringTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  scoringBody: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  scoringRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderLeftWidth: 3,
    paddingLeft: 10,
    marginBottom: 4,
    gap: 10,
  },
  scoringTimeCol: {
    width: 48,
    alignItems: "flex-start",
  },
  scoringPeriod: {
    fontSize: 12,
    fontWeight: "700",
  },
  scoringClock: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },
  scoringInfoCol: {
    flex: 1,
  },
  scoringPlayText: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  scoringScore: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  // Leaders card
  leadersCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  leadersHeaderRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  leadersTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  leadersBody: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  // Officials card
  officialsCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  officialsHeaderRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  officialsTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  officialsBody: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  officialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  officialName: {
    fontSize: 13,
    fontWeight: "600",
  },
  officialRole: {
    fontSize: 12,
    fontWeight: "500",
  },
  // Weather card
  weatherCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  weatherHeaderRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  weatherTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  weatherBody: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  weatherRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  weatherItem: {
    alignItems: "center",
  },
  weatherValue: {
    fontSize: 18,
    fontWeight: "800",
  },
  weatherLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    marginTop: 2,
  },
  // Last 5 Games card
  last5Card: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  last5HeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  last5Title: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  last5Subtitle: {
    fontSize: 11,
    fontWeight: "600",
  },
  last5Body: {
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  last5Row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 8,
  },
  last5ResultBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  last5ResultText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  last5Opponent: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  last5Score: {
    fontSize: 13,
    fontWeight: "700",
    minWidth: 50,
    textAlign: "right",
  },
  last5Date: {
    fontSize: 11,
    fontWeight: "500",
    minWidth: 40,
    textAlign: "right",
  },
  // Venue card
  venueCard: {
    marginHorizontal: 12,
    marginTop: 14,
    marginBottom: 20,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  venueName: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  venueDate: {
    fontSize: 12,
    fontWeight: "500",
  },
  // Linescore
  linescoreCard: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    overflow: "hidden",
  },
  linescoreCell: {
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
  },
  linescoreTeamAbbr: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  linescorePeriodNum: {
    fontSize: 11,
    fontWeight: "600",
  },
  linescoreRunsText: {
    fontSize: 13,
    fontWeight: "700",
  },
  linescoreTotalsSection: {
    borderLeftWidth: 1,
    flexDirection: "column",
  },
  linescoreTotalsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
  },
  linescoreTotalHeader: {
    fontSize: 11,
    fontWeight: "700",
  },
  linescoreTotalVal: {
    fontSize: 13,
    fontWeight: "700",
  },
});

// ── Drives tab styles (NHL Plays-style) ────────────────────────────
const nflDrivesStyles = StyleSheet.create({
  sectionWrap: {
    paddingTop: 12,
    paddingBottom: 40,
  },
  driveBarContent: {
    gap: 8,
    paddingHorizontal: 12,
  },
  driveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  driveChipLogo: {
    width: 18,
    height: 18,
  },
  bubbleLogo: {
    width: 40,
    height: 40,
  },
  driveChipLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  driveBanner: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  driveBannerTitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  driveBannerResult: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  driveBannerDesc: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
  playsWrap: {
    marginTop: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  playRowWrap: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  playTimeCol: {
    width: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
  },
  playClockText: {
    fontSize: 14,
    fontWeight: "800",
  },
  playPeriodText: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "700",
  },
  playCard: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  playCardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  playTypeLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
    flex: 1,
  },
  playScore: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  playWinPct: {
    fontSize: 11,
    fontWeight: "700",
  },
  playMainText: {
    marginTop: 7,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  playSubText: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
  },
  playExpandedWrap: {
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.2)",
    paddingTop: 10,
    gap: 8,
  },
  playScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  playScoreText: {
    fontSize: 13,
    fontWeight: "700",
  },
  playShareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: "center",
  },
  playShareBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  emptyWrap: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
    fontWeight: "500",
  },
  playWinPctExpanded: {
    fontSize: 13,
    fontWeight: "700",
  },
});

// ── Stats tab styles (NHL-style: possession ring + bar stats) ─────
const nflStatsStyles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  body: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 14,
  },
  featureBlock: {
    gap: 8,
  },
  featureValuesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  featureValueText: {
    minWidth: 52,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "800",
  },
  featureLabel: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  faceoffRingWrap: {
    width: 156,
    height: 156,
    alignItems: "center",
    justifyContent: "center",
  },
  faceoffRingInner: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  faceoffPctText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.25,
    textAlign: "center",
  },
  faceoffPctLeft: {
    position: "absolute",
    left: 4,
    width: "40%",
    top: "50%",
    marginTop: -8,
  },
  faceoffPctRight: {
    position: "absolute",
    right: 4,
    width: "40%",
    top: "50%",
    marginTop: -8,
  },
  faceoffSplitLine: {
    width: 2,
    height: "80%",
    opacity: 0.9,
  },
  statRowWrap: {
    gap: 6,
  },
  statValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statValueText: {
    fontSize: 14,
    fontWeight: "700",
  },
  statBarTrack: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    flexDirection: "row",
  },
  statBarFillLeft: {
    height: "100%",
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
  },
  statBarFillRight: {
    height: "100%",
    marginLeft: "auto",
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  statCategoryLabel: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "none",
  },
  emptyText: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "500",
  },
});

// ── Team tab styles (category filter + player cards) ──────────────
const nflTeamStyles = StyleSheet.create({
  posBarContent: {
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  posChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  posChipLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  playerListWrap: {
    paddingHorizontal: 12,
    gap: 8,
  },
  playerCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  playerCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  playerCardHeadshotWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 2,
  },
  playerCardHeadshot: {
    width: "100%",
    height: "100%",
  },
  playerCardNameBlock: {
    flex: 1,
    marginLeft: 10,
  },
  playerCardName: {
    fontSize: 14,
    fontWeight: "700",
  },
  playerCardMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  playerCardStatsRow: {
    flexDirection: "row",
    marginTop: 2,
    paddingTop: 10,
    justifyContent: "space-between",
  },
  playerCardStatCell: {
    alignItems: "center",
    flex: 1,
  },
  playerCardStatValue: {
    fontSize: 14,
    fontWeight: "800",
  },
  playerCardStatLabel: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 1,
  },
  statsWrap: {
    paddingHorizontal: 12,
  },
  emptyWrap: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
    fontWeight: "500",
  },
});

// ── Player share/copy card styles (NHL-style) ────────────────────
const nflShareStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    padding: 24,
  },
  card: {
    width: Math.min(width - 48, 540),
    overflow: "hidden",
    borderRadius: 0,
  },
  cardHeader: {
    padding: 14,
    borderBottomWidth: 2,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  posBadge: {
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  posBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  scoreWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scoreLogo: {
    width: 22,
    height: 22,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: "700",
  },
  headshotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardHeadshot: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2.5,
    backgroundColor: "rgba(128,128,128,0.1)",
  },
  nameBlock: {
    flex: 1,
    gap: 2,
  },
  nameDateRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  nameTeamWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  fullName: {
    fontSize: 13,
    fontWeight: "600",
  },
  teamNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  teamNameLogo: {
    width: 18,
    height: 18,
  },
  teamNameLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  dateWrap: {
    alignItems: "flex-end",
    marginLeft: 6,
    flexShrink: 0,
  },
  gameDateLine: {
    fontSize: 10,
    fontWeight: "500",
    textAlign: "right",
    lineHeight: 12,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  statCell: {
    width: "33.333%",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    position: "relative",
  },
  statVal: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  statLbl: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 3,
    textAlign: "center",
  },
  cardFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: "flex-end",
  },
  cardBrand: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  actionBtn: {
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 28,
    minWidth: 120,
    alignItems: "center",
  },
  actionBtnTxt: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  actionBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});

export default GameDetailsScreen;

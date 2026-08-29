import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Image,
  Animated,
  LayoutAnimation,
  UIManager,
  Dimensions,
  RefreshControl,
  Modal,
} from "react-native";
import { WebView } from "react-native-webview";
import Svg, {
  Line,
  Circle,
  Defs,
  LinearGradient,
  Stop,
  Path,
  Rect,
} from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import ViewShot, { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import ChatComponent from "../../../components/ChatComponent";
import useIsLoggedIn from "../../../hooks/useIsLoggedIn";
import { EuropaConferenceLeagueServiceEnhanced } from "../../../services/soccer/EuropaConferenceLeagueServiceEnhanced";
import { useTheme } from "../../../context/ThemeContext";
import { useFavorites } from "../../../context/FavoritesContext";
import { useStreamingAccess } from "../../../utils/streamingUtils";
import { useGamePresence } from "../../../hooks/useGamePresence";

const { width } = Dimensions.get("window");

// Add this HeaderGradient component near the top of the file, after the imports
const HeaderGradient = ({ awayColor, homeColor, theme, height }) => (
  <View style={[StyleSheet.absoluteFill, { height }]} pointerEvents="none">
    <Svg
      width={width}
      height={height}
      style={{
        transform: [{ translateX: -1 }, { translateY: -1 }],
      }}
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="europaConferenceLeagueHeaderGrad" x1="00%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={homeColor} stopOpacity="0.3" />
          <Stop
            offset="40%"
            stopColor={theme.surfaceSecondary}
            stopOpacity="0"
          />
          <Stop
            offset="60%"
            stopColor={theme.surfaceSecondary}
            stopOpacity="0"
          />
          <Stop offset="100%" stopColor={awayColor} stopOpacity="0.3" />
        </LinearGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#europaConferenceLeagueHeaderGrad)" />
    </Svg>
  </View>
);

// Convert HTTP URLs to HTTPS to avoid mixed content issues
const convertToHttps = (url) => {
  if (url && url.startsWith("http://")) {
    return url.replace("http://", "https://");
  }
  return url;
};

// Helper function to get contrasting text color
const getContrastColor = (backgroundColor) => {
  if (!backgroundColor) return "#FFFFFF";

  // Remove # if present
  const color = backgroundColor.replace("#", "");

  // Convert to RGB
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return black or white based on luminance
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
};

// Helper function for team logo URLs
const getTeamLogoUrls = (teamId, isDarkMode) => {
  const primaryUrl = isDarkMode
    ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500-dark/${teamId}.png&w=200&h=200`
    : `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/${teamId}.png&w=200&h=200`;

  const fallbackUrl = isDarkMode
    ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/${teamId}.png&w=200&h=200`
    : `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500-dark/${teamId}.png&w=200&h=200`;

  return { primaryUrl, fallbackUrl };
};

// Memoized TeamLogoImage component to prevent flickering on state changes
const TeamLogoImage = React.memo(
  ({ teamId, style, isScoring = false, isDarkMode, scoringTextColor }) => {
    const [logoSource, setLogoSource] = useState(null);
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
      const loadLogo = async () => {
        if (teamId) {
          try {
            if (isScoring) {
              // For scoring plays, always use dark variant
              const code = scoringTextColor === "#000" ? "" : "-dark";
              const darkUrl = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500${code}/${teamId}.png&w=200&h=200`;
              setLogoSource({ uri: darkUrl });
            } else {
              // For non-scoring, use normal dark mode logic
              const { primaryUrl, fallbackUrl } = getTeamLogoUrls(
                teamId,
                isDarkMode,
              );
              setLogoSource({ uri: primaryUrl });
            }
          } catch (error) {
            console.error("Error loading team logo:", error);
            setLogoSource(require("../../../../assets/soccer.png"));
          }
        } else {
          setLogoSource(require("../../../../assets/soccer.png"));
        }
        setRetryCount(0);
      };

      loadLogo();
    }, [teamId, isDarkMode, isScoring, scoringTextColor]);

    const handleError = useCallback(() => {
      if (retryCount === 0 && teamId) {
        if (isScoring) {
          // For scoring plays, fallback to regular variant
          const regularUrl = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/${teamId}.png&w=200&h=200`;
          setRetryCount(1);
          setLogoSource({ uri: regularUrl });
        } else {
          // For non-scoring, try the fallback URL (opposite dark mode variant)
          const { fallbackUrl } = getTeamLogoUrls(teamId, isDarkMode);
          setRetryCount(1);
          setLogoSource({ uri: fallbackUrl });
        }
      } else {
        // Final fallback to soccer.png
        setLogoSource(require("../../../../assets/soccer.png"));
      }
    }, [retryCount, teamId, isScoring, isDarkMode]);

    // Get the default source - use actual logo first, then soccer.png
    const getDefaultSource = () => {
      if (teamId) {
        if (isScoring) {
          // For scoring plays, use dark variant as default
          const darkUrl = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500-dark/${teamId}.png&w=200&h=200`;
          return { uri: darkUrl };
        } else {
          // For non-scoring, use normal logic
          const { primaryUrl } = getTeamLogoUrls(teamId, isDarkMode);
          return { uri: primaryUrl };
        }
      }
      return require("../../../../assets/soccer.png");
    };

    return (
      <Image
        style={style}
        source={logoSource || getDefaultSource()}
        defaultSource={getDefaultSource()}
        onError={handleError}
      />
    );
  },
);

const UECLGameDetailsScreen = ({ route, navigation }) => {
  const { gameId, sport, competition, homeTeam, awayTeam } =
    route?.params || {};
  const { theme, colors, isDarkMode } = useTheme();
  const { isFavorite } = useFavorites();
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updateInterval, setUpdateInterval] = useState(null);
  const [lastUpdateHash, setLastUpdateHash] = useState("");
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [activeTab, setActiveTab] = useState("stats");
  const [loadingStats, setLoadingStats] = useState(false);
  const [playsData, setPlaysData] = useState(null);
  const [openPlays, setOpenPlays] = useState(new Set());
  const [loadingPlays, setLoadingPlays] = useState(false);

  // Lazy loading state for plays
  const [visiblePlaysCount, setVisiblePlaysCount] = useState(30);
  const [isLoadingMorePlays, setIsLoadingMorePlays] = useState(false);

  // Game presence tracking
  const { viewerData, isJoined } = useGamePresence(gameId);

  const [lineupData, setLineupData] = useState({
    homeLineup: [],
    awayLineup: [],
    homeFormation: "4-3-3",
    awayFormation: "4-3-3",
  });
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerPopupVisible, setPlayerPopupVisible] = useState(false);
  const [playerGameStats, setPlayerGameStats] = useState(null);
  const [loadingPlayerStats, setLoadingPlayerStats] = useState(false);

  // Player share card state
  const [playerShareVisible, setPlayerShareVisible] = useState(false);
  const [sharingPlayerCard, setSharingPlayerCard] = useState(false);
  const playerShareCardRef = useRef(null);
  const [statsData, setStatsData] = useState(null);
  const [loadingMatchStats, setLoadingMatchStats] = useState(false);

  // Streaming state
  const [availableStreams, setAvailableStreams] = useState({});
  const [currentStreamType, setCurrentStreamType] = useState("admin");
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [showStreamModal, setShowStreamModal] = useState(false);
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const isLoggedIn = useIsLoggedIn();

  // Streaming access check
  const { isUnlocked: isStreamingUnlocked } = useStreamingAccess();

  // Share card state
  const [shareCardPlay, setShareCardPlay] = useState(null);
  const [shareCardPlayerNames, setShareCardPlayerNames] = useState({
    scorer: null,
    assister: null,
  });
  const [shareCardPlayerStats, setShareCardPlayerStats] = useState({
    goals: 0,
    ownGoals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    yellowCards: 0,
    redCards: 0,
  });

  // Helper: look up a player in the lineup roster by name and extract stats
  const lookupPlayerInRoster = (playerName, teamSide) => {
    if (!playerName) return null;
    const roster =
      teamSide === "home" ? lineupData.homeLineup : lineupData.awayLineup;
    if (!roster || roster.length === 0) return null;

    const nameLower = playerName.toLowerCase();
    for (const entry of roster) {
      const athlete = entry.athlete || entry;
      const entryName = (
        athlete.displayName ||
        athlete.name ||
        athlete.fullName ||
        ""
      ).toLowerCase();
      if (
        entryName &&
        (entryName === nameLower ||
          nameLower.includes(entryName) ||
          entryName.includes(nameLower))
      ) {
        // Found the player in roster — extract stats
        const rawStats = entry.stats || [];
        const statsMap = {};
        if (Array.isArray(rawStats)) {
          rawStats.forEach((s) => {
            if (s.abbreviation && s.displayValue !== undefined) {
              statsMap[s.abbreviation] = s.displayValue;
            }
          });
        }
        console.log(
          `[ShareCard] Found player "${playerName}" in ${teamSide} roster:`,
          statsMap,
        );
        return {
          id: athlete.id,
          name: athlete.displayName || athlete.name || playerName,
          statsMap,
        };
      }
    }
    return null;
  };

  // Helper: parse a stats map into our stat shape
  const parseRosterStats = (statsMap) => {
    const get = (keys) => {
      for (const k of keys) {
        const v = statsMap[k];
        if (v !== undefined && v !== null) {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        }
      }
      return 0;
    };
    return {
      goals: get(["G", "goals", "totalGoals"]),
      ownGoals: get(["OG", "ownGoals"]),
      assists: get(["A", "assists", "goalAssists"]),
      shots: get(["SHOT", "shots", "totalShots"]),
      shotsOnTarget: get(["SOG", "shotsOnTarget", "shotsOnGoal"]),
      yellowCards: get(["YC", "yellowCards"]),
      redCards: get(["RC", "redCards"]),
    };
  };

  // Fetch player names and stats when shareCardPlay changes
  useEffect(() => {
    const fetchPlayerData = async () => {
      if (!shareCardPlay?.participants) {
        setShareCardPlayerNames({ scorer: null, assister: null });
        setShareCardPlayerStats({
          goals: 0,
          assists: 0,
          ownGoals: 0,
          shots: 0,
          shotsOnTarget: 0,
          yellowCards: 0,
          redCards: 0,
        });
        return;
      }

      const names = { scorer: null, assister: null };
      let stats = {
        goals: 0,
        assists: 0,
        shots: 0,
        shotsOnTarget: 0,
        yellowCards: 0,
        redCards: 0,
        ownGoals: 0,
      };

      // Determine which team scored from context
      const contextTeamSide = shareCardPlay._contextTeams?.playTeamId
        ? String(shareCardPlay._contextTeams.playTeamId) ===
          String(gameData?.homeCompetitor?.team?.id)
          ? "home"
          : String(shareCardPlay._contextTeams.playTeamId) ===
              String(gameData?.awayCompetitor?.team?.id)
            ? "away"
            : null
        : null;

      // ── Resolve scorer name ────────────────────────────────────────
      const scorerParticipant = shareCardPlay.participants?.[0];
      if (scorerParticipant?.athlete?.displayName) {
        names.scorer = scorerParticipant.athlete.displayName;
      } else if (scorerParticipant?.displayName) {
        names.scorer = scorerParticipant.displayName;
      }

      // ── Resolve assister name ──────────────────────────────────────
      const assisterParticipant = shareCardPlay.participants?.[1];
      if (assisterParticipant?.athlete?.displayName) {
        names.assister = assisterParticipant.athlete.displayName;
      } else if (assisterParticipant?.displayName) {
        names.assister = assisterParticipant.displayName;
      }

      // ── Look up scorer stats in lineupData roster (fast, no API) ──
      if (names.scorer && contextTeamSide) {
        const rosterLookup = lookupPlayerInRoster(
          names.scorer,
          contextTeamSide,
        );
        if (rosterLookup && Object.keys(rosterLookup.statsMap).length > 0) {
          stats = parseRosterStats(rosterLookup.statsMap);
          console.log("[ShareCard] Using roster stats for scorer:", stats);
        }
      }

      // ── Fallback: API fetch if roster lookup failed ────────────────
      if (
        stats.goals === 0 &&
        stats.shots === 0 &&
        stats.assists === 0 &&
        names.scorer
      ) {
        const contextTeamId =
          shareCardPlay._contextTeams?.playTeamId ||
          shareCardPlay.team?.id ||
          shareCardPlay.team?.$ref?.match(/teams\/(\d+)/)?.[1];
        const gameId = route?.params?.gameId;

        if (gameId && contextTeamId) {
          try {
            // Try roster endpoint to find athlete ID by name
            const rosterUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.europa.conf/events/${gameId}/competitions/${gameId}/competitors/${contextTeamId}/roster?lang=en&region=us`;
            const rosterResp = await fetch(convertToHttps(rosterUrl));
            let foundAthleteId = null;

            if (rosterResp.ok) {
              const rosterData = await rosterResp.json();
              const entries = rosterData.items || rosterData.roster || [];
              for (const entry of entries) {
                const athlete = entry.athlete || entry;
                const entryName = (
                  athlete.displayName ||
                  athlete.name ||
                  ""
                ).toLowerCase();
                if (entryName && entryName === names.scorer.toLowerCase()) {
                  foundAthleteId = athlete.id;
                  if (athlete.$ref) {
                    const refId = athlete.$ref.match(/athletes\/(\d+)/)?.[1];
                    if (refId) foundAthleteId = refId;
                  }
                  break;
                }
              }
            }

            if (foundAthleteId) {
              const statsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.europa.conf/events/${gameId}/competitions/${gameId}/competitors/${contextTeamId}/roster/${foundAthleteId}/statistics/0?lang=en&region=us`;
              console.log(
                "[ShareCard] API fallback: Fetching player stats from:",
                statsUrl,
              );
              const statsResponse = await fetch(convertToHttps(statsUrl));
              if (statsResponse.ok) {
                const statsData = await statsResponse.json();
                if (statsData.splits?.categories) {
                  const allStats = {};
                  statsData.splits.categories.forEach((category) => {
                    if (category.stats && Array.isArray(category.stats)) {
                      category.stats.forEach((stat) => {
                        if (stat.name && stat.value !== undefined) {
                          allStats[stat.name] = stat.value;
                        }
                      });
                    }
                  });
                  stats = {
                    goals: allStats.totalGoals || allStats.goalsScored || 0,
                    assists:
                      allStats.goalAssists || allStats.assistsProvided || 0,
                    shots:
                      allStats.totalShots ||
                      allStats.shots ||
                      allStats.shotsTotal ||
                      0,
                    ownGoals: allStats.ownGoals || 0,
                    shotsOnTarget:
                      allStats.shotsOnTarget ||
                      allStats.shotsOnGoal ||
                      allStats.shotsOnTargetTotal ||
                      0,
                    yellowCards:
                      allStats.yellowCards || allStats.yellowCardsReceived || 0,
                    redCards:
                      allStats.redCards || allStats.redCardsReceived || 0,
                  };
                  console.log(
                    "[ShareCard] API fallback: Mapped player stats:",
                    stats,
                  );
                }
              }
            }
          } catch (error) {
            console.error(
              "[ShareCard] Error fetching player stats (API fallback):",
              error,
            );
          }
        }
      }

      setShareCardPlayerNames(names);
      setShareCardPlayerStats(stats);
    };

    if (shareCardPlay) {
      fetchPlayerData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareCardPlay, route?.params?.gameId, lineupData]);

  const scrollViewRef = useRef(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [headerHeight, setHeaderHeight] = useState(0);
  const lastPlaysHashRef = useRef("");
  const goalShareCardRef = useRef();
  const processedPlaysRef = useRef(null); // Ref to always have latest processedPlays

  // Sticky header computed from scrollY (NBA-style)
  const stickyThreshold = headerHeight > 0 ? headerHeight - 30 : 150;
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

  // Enhanced logo function with dark mode support and fallbacks
  const getTeamLogo = async (teamId, isDarkMode) => {
    // Use the service's enhanced logo logic with caching and fallbacks
    const logoUrl =
      await EuropaConferenceLeagueServiceEnhanced.getTeamLogoWithFallback(teamId);
    return { primaryUrl: logoUrl, fallbackUrl: logoUrl };
  };

  // Compute a stable key for a play. Prefer explicit id, fall back to a fingerprint of core fields.
  const computePlayKey = (play) => {
    if (!play) return `play-unknown`;
    if (play.id) return String(play.id);
    if (play.uid) return String(play.uid);
    // Try to extract team id if available
    const extractTeamId = (teamObj) => {
      try {
        if (!teamObj) return "";
        if (typeof teamObj === "string") {
          const m = teamObj.match(/teams\/(\d+)/);
          if (m) return m[1];
          return teamObj;
        }
        if (teamObj.id) return String(teamObj.id);
        if (teamObj.$ref) {
          const m2 = String(teamObj.$ref).match(/teams\/(\d+)/);
          if (m2) return m2[1];
        }
        if (teamObj.team) {
          if (teamObj.team.id) return String(teamObj.team.id);
          if (teamObj.team.$ref) {
            const m3 = String(teamObj.team.$ref).match(/teams\/(\d+)/);
            if (m3) return m3[1];
          }
        }
      } catch (e) {}
      return "";
    };

    // Build a compact, stable fingerprint that avoids volatile fields like the live clock
    const parts = [];
    // Prefer _sequence from commentary (unique per play)
    if (play._sequence != null) parts.push(`seq${play._sequence}`);
    if (play.period) parts.push(`p${play.period.number || play.period}`);
    // Team identity (stable)
    if (play.team) parts.push(`t${extractTeamId(play.team)}`);
    // Play type id (stable)
    if (play.type && (play.type.id || play.type.name))
      parts.push(`ty${play.type.id || play.type.name}`);
    // Use a stable timestamp/sequence if available
    if (play.startTime) parts.push(`s${play.startTime}`);
    if (play.sequence) parts.push(`q${play.sequence}`);

    // Fallback: small slice of text if nothing else available (non-volatile)
    if (parts.length === 0) {
      const txt = (play.text || play.shortText || "")
        .replace(/\s+/g, " ")
        .trim();
      if (txt) return `x${txt.substring(0, 60)}`;
      return JSON.stringify({ type: play.type, team: play.team }).substring(
        0,
        80,
      );
    }

    return parts.join("|");
  };

  // Incremental update helper: prepend new plays, and patch in-place updated plays to avoid full list replacement.
  const scrollYRef = useRef(0);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const playsFetchingRef = useRef(false);

  const updatePlaysDataIncremental = (fetchedPlays) => {
    if (!Array.isArray(fetchedPlays)) return;

    setPlaysData((prevPlays) => {
      // If we don't have existing data, just set it
      if (!Array.isArray(prevPlays) || prevPlays.length === 0) {
        return fetchedPlays;
      }

      // Build map of existing keys -> index
      const existingIndexByKey = new Map();
      prevPlays.forEach((p, i) => existingIndexByKey.set(computePlayKey(p), i));

      const patchedPlays = prevPlays.slice(); // shallow copy
      let changed = false;
      const newPlaysBatch = [];
      let addedCount = 0;
      let patchedCount = 0;

      // fetchedPlays are most-recent-first
      for (let i = 0; i < fetchedPlays.length; i++) {
        const p = fetchedPlays[i];
        const key = computePlayKey(p);
        if (!existingIndexByKey.has(key)) {
          // New play: collect to prepend later (keep fetched order)
          newPlaysBatch.push(p);
          addedCount++;
        } else {
          const idx = existingIndexByKey.get(key);
          const existing = patchedPlays[idx];
          // Only patch if content changed
          if (JSON.stringify(existing) !== JSON.stringify(p)) {
            patchedPlays[idx] = p;
            changed = true;
            patchedCount++;
          }
        }
      }

      if (newPlaysBatch.length > 0) {
        // Prepend new plays in same order (most-recent-first)
        const updated = [...newPlaysBatch, ...patchedPlays];
        changed = true;

        // Try to preserve scroll position after inserting at top
        try {
          const y = scrollYRef.current || 0;
          // Use setTimeout to wait for layout to settle then restore offset
          setTimeout(() => {
            if (
              scrollViewRef.current &&
              typeof scrollViewRef.current.scrollTo === "function"
            ) {
              scrollViewRef.current.scrollTo({ y, animated: false });
            }
          }, 50);
        } catch (e) {
          // ignore
        }

        console.log(
          "[UECLGameDetails] incremental update: added=",
          addedCount,
          "patched=",
          patchedCount,
        );
        return updated;
      }

      if (changed) {
        console.log(
          "[UECLGameDetails] incremental update: added=",
          addedCount,
          "patched=",
          patchedCount,
        );
        return patchedPlays;
      }
      return prevPlays; // no-op: keep same reference to avoid re-render
    });
  };

  // Helper to pick readable text color (black or white) for a given hex background
  const getContrastColor = (hex) => {
    try {
      if (!hex) return "#000";
      const h = hex.replace("#", "");
      const bigint = parseInt(
        h.length === 3
          ? h
              .split("")
              .map((c) => c + c)
              .join("")
          : h,
        16,
      );
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      // Perceived brightness
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness > 186 ? "#000" : "#fff";
    } catch (e) {
      return "#000";
    }
  };

  const getTeamScore = (teamType) => {
    if (!gameData) return "0";

    // Use processed scores first, fallback to original structure
    if (gameData.processedScores) {
      return teamType === "home"
        ? gameData.processedScores.home?.toString() || "0"
        : gameData.processedScores.away?.toString() || "0";
    }

    // Fallback to original structure
    const competition = gameData.header?.competitions?.[0];
    const team =
      teamType === "home"
        ? competition?.competitors?.[0]
        : competition?.competitors?.[1];
    return team?.score?.value?.toString() || team?.score?.toString() || "0";
  };

  const getTeamShootoutScore = (teamType) => {
    if (!gameData) return null;

    console.log(`[getTeamShootoutScore] Getting ${teamType} shootout score`);
    console.log(
      `[getTeamShootoutScore] gameData.processedShootoutScores:`,
      gameData.processedShootoutScores,
    );

    // Use processed shootout scores first (similar to how getTeamScore works)
    if (gameData.processedShootoutScores) {
      const shootoutScore =
        teamType === "home"
          ? gameData.processedShootoutScores.home
          : gameData.processedShootoutScores.away;
      console.log(
        `[getTeamShootoutScore] Processed ${teamType} shootout score:`,
        shootoutScore,
      );
      return shootoutScore !== undefined && shootoutScore !== null
        ? shootoutScore.toString()
        : null;
    }

    // Fallback to original structure
    const competition = gameData.header?.competitions?.[0];
    const team =
      teamType === "home"
        ? competition?.competitors?.[0]
        : competition?.competitors?.[1];

    console.log(
      `[getTeamShootoutScore] Fallback - ${teamType} team score object:`,
      team?.score,
    );

    // Look for shootout score in the same way as regular score
    if (team?.score?.shootout !== undefined && team?.score?.shootout !== null) {
      console.log(
        `[getTeamShootoutScore] Found ${teamType} shootout in fallback:`,
        team.score.shootout,
      );
      return team.score.shootout.toString();
    }

    console.log(`[getTeamShootoutScore] No ${teamType} shootout score found`);
    return null;
  };

  const hasShootout = () => {
    if (!gameData) return false;

    console.log(`[hasShootout] Checking for shootout`);
    console.log(
      `[hasShootout] gameData.processedShootoutScores:`,
      gameData.processedShootoutScores,
    );

    // Check processed shootout scores first (similar to getTeamScore pattern)
    if (gameData.processedShootoutScores) {
      const result =
        (gameData.processedShootoutScores.home !== undefined &&
          gameData.processedShootoutScores.home !== null) ||
        (gameData.processedShootoutScores.away !== undefined &&
          gameData.processedShootoutScores.away !== null);
      console.log(`[hasShootout] Processed shootout check result:`, result);
      return result;
    }

    // Fallback to original structure
    const competition = gameData.header?.competitions?.[0];
    const homeTeam = competition?.competitors?.[0];
    const awayTeam = competition?.competitors?.[1];

    console.log(`[hasShootout] Fallback - homeTeam score:`, homeTeam?.score);
    console.log(`[hasShootout] Fallback - awayTeam score:`, awayTeam?.score);

    // Check if shootout scores exist (indicating a penalty shootout occurred)
    const result =
      (homeTeam?.score?.shootout !== undefined &&
        homeTeam?.score?.shootout !== null) ||
      (awayTeam?.score?.shootout !== undefined &&
        awayTeam?.score?.shootout !== null);
    console.log(`[hasShootout] Fallback shootout check result:`, result);
    return result;
  };

  // Determine winner/loser using shootout scores first if they exist (similar to team page logic)
  const determineWinnerWithShootout = () => {
    if (!gameData)
      return { homeIsWinner: false, awayIsWinner: false, isDraw: false };

    const matchStatus = getMatchStatus();
    if (matchStatus.isLive || matchStatus.isPre) {
      return { homeIsWinner: false, awayIsWinner: false, isDraw: false };
    }

    const homeScore = getTeamScore("home");
    const awayScore = getTeamScore("away");
    const homeShootoutScore = getTeamShootoutScore("home");
    const awayShootoutScore = getTeamShootoutScore("away");

    // If shootout scores exist, use them to determine winner
    if (homeShootoutScore !== null && awayShootoutScore !== null) {
      const homeShootout = parseInt(homeShootoutScore);
      const awayShootout = parseInt(awayShootoutScore);

      if (homeShootout > awayShootout) {
        return { homeIsWinner: true, awayIsWinner: false, isDraw: false };
      } else if (awayShootout > homeShootout) {
        return { homeIsWinner: false, awayIsWinner: true, isDraw: false };
      }
      // If shootout scores are equal, it's still a draw (shouldn't happen but safety)
      return { homeIsWinner: false, awayIsWinner: false, isDraw: true };
    }

    // Fall back to regular scores
    const homeScoreNum = parseInt(homeScore);
    const awayScoreNum = parseInt(awayScore);

    if (homeScoreNum > awayScoreNum) {
      return { homeIsWinner: true, awayIsWinner: false, isDraw: false };
    } else if (awayScoreNum > homeScoreNum) {
      return { homeIsWinner: false, awayIsWinner: true, isDraw: false };
    } else {
      return { homeIsWinner: false, awayIsWinner: false, isDraw: true };
    }
  };

  // Check if game is final (post status)
  const isGameFinal = () => {
    if (!gameData) return false;
    const competition = gameData.header?.competitions?.[0];
    const status = competition?.status;
    return status?.type?.state === "post";
  };

  const handleScroll = (event) => {
    const offsetY = event?.nativeEvent?.contentOffset?.y || 0;
    scrollYRef.current = offsetY;
    scrollY.setValue(offsetY);
  };

  useEffect(() => {
    // Adaptive polling for live games (no initial load - useFocusEffect handles that)
    const isLive =
      gameData &&
      gameData.header?.competitions?.[0]?.status?.type?.state === "in";
    const delay = isLive && activeTab === "plays" ? 4000 : 30000;

    const interval = setInterval(() => {
      try {
        if (showStreamModal) return;
        if (isLive) {
          loadGameDetails(true); // Silent update for live games
        }
      } catch (e) {
        // ignore
      }
    }, delay);

    setUpdateInterval(interval);

    return () => {
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, gameData, activeTab, showStreamModal]);

  // Reload data when the screen comes into focus (useful when navigating back)
  useFocusEffect(
    React.useCallback(() => {
      console.log("[UECLGameDetails] useFocusEffect triggered");
      loadGameDetails();
      // Only clear plays and stats data when the gameId changes, not on every focus
      // This prevents losing data when navigating back from other screens with same gameId

      return () => {
        // no-op cleanup
      };
    }, [gameId]),
  );

  // Enable LayoutAnimation on Android
  useEffect(() => {
    if (UIManager && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // Clear data when gameId changes (different game)
  useEffect(() => {
    console.log("[UECLGameDetails] gameId changed - clearing data states");
    setPlaysData(null);
    setStatsData(null);
  }, [gameId]);

  // Fetch immediately when stream modal closes
  useEffect(() => {
    if (showStreamModal === false && gameData) {
      const isLive =
        gameData &&
        gameData.header?.competitions?.[0]?.status?.type?.state === "in";
      if (isLive) {
        console.log("Stream modal closed, immediately fetching UECL game data");
        loadGameDetails(true);
      }
    }
  }, [showStreamModal]);

  const loadGameDetails = async (silentUpdate = false) => {
    try {
      if (!silentUpdate) {
        setLoading(true);
      }
      console.log("[UECLGameDetails] loadGameDetails START", {
        gameId,
        silentUpdate,
      });
      console.debug("[UECLGameDetails] requesting game details for", gameId);
      const data = await EuropaConferenceLeagueServiceEnhanced.getGameDetails(gameId);

      // Process the data similar to soccer web logic
      const processedData = await processGameData(data);

      // Create hash for change detection
      const currentHash = JSON.stringify({
        homeScore: processedData.processedScores?.home,
        awayScore: processedData.processedScores?.away,
        status: processedData.header?.competitions?.[0]?.status?.type?.state,
        clock: processedData.header?.competitions?.[0]?.status?.displayClock,
        period: processedData.header?.competitions?.[0]?.status?.period,
      });

      if (currentHash !== lastUpdateHash) {
        setGameData(processedData);
        setLastUpdateHash(currentHash);
        console.log(
          "[UECLGameDetails] Game data updated - hash changed",
          currentHash,
        );

        // Clear stats data when game state changes to ensure fresh stats are fetched
        setStatsData(null);

        // Fetch lineup data when game data is updated
        const lineupResult = await fetchLineupData(processedData);
        setLineupData(lineupResult);
        console.log("[UECLGameDetails] Lineup data updated:", lineupResult);

        // Do not forcibly clear playsData here; the plays effect will compare hashes and merge/refresh
      } else {
        console.debug("[UECLGameDetails] Game data hash unchanged");
      }

      setLoading(false);
      console.log("[UECLGameDetails] loadGameDetails END", {
        gameId,
        silentUpdate,
      });
    } catch (error) {
      console.error("Error loading UECL game details:", error);
      if (!silentUpdate) {
        setLoading(false);
        Alert.alert("Error", "Failed to load game details. Please try again.");
      }
    }
  };

  const processGameData = async (data) => {
    // Get team info by homeAway property
    const competition = data.header?.competitions?.[0];
    const competitors = competition?.competitors || [];

    // Find home and away teams based on homeAway property
    const homeCompetitor = competitors.find((comp) => comp.homeAway === "home");
    const awayCompetitor = competitors.find((comp) => comp.homeAway === "away");

    const homeTeamId = homeCompetitor?.team?.id;
    const awayTeamId = awayCompetitor?.team?.id;

    const [homeLogo, awayLogo] = await Promise.all([
      homeTeamId
        ? EuropaConferenceLeagueServiceEnhanced.getTeamLogoWithFallback(homeTeamId)
        : null,
      awayTeamId
        ? EuropaConferenceLeagueServiceEnhanced.getTeamLogoWithFallback(awayTeamId)
        : null,
    ]);

    // Scores - use inline values from the summary first (no extra API calls needed)
    const homeScore =
      homeCompetitor?.score?.value ?? homeCompetitor?.score ?? 0;
    const awayScore =
      awayCompetitor?.score?.value ?? awayCompetitor?.score ?? 0;
    const homeShootoutScore = homeCompetitor?.score?.shootout;
    const awayShootoutScore = awayCompetitor?.score?.shootout;

    console.log("Final scores - Home:", homeScore, "Away:", awayScore);

    // ── Extract ALL data from the summary endpoint ──────────────────────
    // Stats: boxscore.teams has per-team statistics with labels
    const boxscoreTeams = data.boxscore?.teams || [];
    const homeBoxscore = boxscoreTeams.find((t) => t.homeAway === "home");
    const awayBoxscore = boxscoreTeams.find((t) => t.homeAway === "away");

    // Lineups: rosters array has home/away with formation & player list
    const rosters = data.rosters || [];
    const homeRosterData = rosters.find((r) => r.homeAway === "home");
    const awayRosterData = rosters.find((r) => r.homeAway === "away");

    // Plays: commentary array is the full play-by-play
    const commentaryPlays = data.commentary || [];

    // Head-to-head: headToHeadGames array
    const headToHeadGamesData = data.headToHeadGames || [];

    // Key events for highlights
    const keyEventsData = data.keyEvents || [];

    // ── Scorers: from header.competitions[].details[] with scoringPlay: true ─
    const details = competition?.details || [];
    const scoringDetails = details.filter((d) => d.scoringPlay);

    const processScorers = (teamId) => {
      return scoringDetails
        .filter((d) => String(d.team?.id) === String(teamId))
        .map((d) => {
          const scorer = d.participants?.[0]?.athlete;
          const assister = d.participants?.[1]?.athlete;
          const name = scorer?.displayName || scorer?.shortName || "Unknown";
          const clock = d.clock?.displayValue || "";
          const isPenalty = d.penaltyKick || false;
          const isOwnGoal = d.ownGoal || false;
          return {
            displayName: name,
            clock,
            penaltyKick: isPenalty,
            ownGoal: isOwnGoal,
            assisterName: assister?.displayName || assister?.shortName,
          };
        });
    };

    const homeScorers = processScorers(homeTeamId);
    const awayScorers = processScorers(awayTeamId);

    return {
      ...data,
      homeLogo,
      awayLogo,
      homeScorers,
      awayScorers,
      processedScores: { home: homeScore, away: awayScore },
      processedShootoutScores: {
        home: homeShootoutScore,
        away: awayShootoutScore,
      },
      homeCompetitor,
      awayCompetitor,
      boxscoreTeams,
      homeBoxscore,
      awayBoxscore,
      homeRosterData,
      awayRosterData,
      commentaryPlays,
      headToHeadGamesData,
      keyEventsData,
      scoringDetails,
    };
  };

  const fetchPlayerGameStats = async (playerId, teamId) => {
    if (!playerId || !teamId) {
      console.error("Missing playerId or teamId:", { playerId, teamId });
      return;
    }

    setLoadingPlayerStats(true);
    setPlayerGameStats(null);

    try {
      const gameId = route?.params?.gameId;
      if (!gameId) {
        console.error("No gameId available for player stats");
        return;
      }

      const statsUrl = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.europa.conf/events/${gameId}/competitions/${gameId}/competitors/${teamId}/roster/${playerId}/statistics/0?lang=en&region=us`;

      console.log("Fetching player game stats from:", statsUrl);
      console.log("Parameters:", { gameId, teamId, playerId });

      const response = await fetch(convertToHttps(statsUrl));

      console.log("API Response status:", response.status);

      if (response.ok) {
        const statsData = await response.json();
        console.log(
          "Player game stats response:",
          JSON.stringify(statsData, null, 2),
        );

        // Parse the stats structure
        let parsedStats = {
          goals: 0,
          assists: 0,
          ownGoals: 0,
          shots: 0,
          shotsOnTarget: 0,
          yellowCards: 0,
          redCards: 0,
          totalPasses: 0,
          foulsDrawn: 0,
          accuratePasses: 0,
          tackles: 0,
          clearances: 0,
          minutes: 0,
          saves: 0,
          goalsConceded: 0,
        };

        if (statsData.splits?.categories) {
          const allStats = {};

          statsData.splits.categories.forEach((category) => {
            console.log("Processing category:", category.name || "unnamed");
            if (category.stats && Array.isArray(category.stats)) {
              category.stats.forEach((stat) => {
                if (stat.name && stat.value !== undefined) {
                  allStats[stat.name] = stat.value;
                  console.log(`Stat: ${stat.name} = ${stat.value}`);
                }
              });
            }
          });

          console.log("All parsed player stats:", allStats);

          // Map to display stats - try multiple possible field names
          parsedStats = {
            goals: allStats.totalGoals || 0,
            assists: allStats.goalAssists || 0,
            ownGoals: allStats.ownGoals || 0,
            shots: allStats.totalShots || 0,
            shotsOnTarget: allStats.shotsOnTarget || 0,
            yellowCards: allStats.yellowCards || 0,
            redCards: allStats.redCards || allStats.redCardsReceived || 0,
            totalPasses: allStats.totalPasses || 0,
            foulsDrawn: allStats.foulsDrawn || allStats.foulsWon || 0,
            accuratePasses: allStats.accuratePasses || 0,
            tackles: allStats.totalTackles || 0,
            clearances: allStats.totalClearance || 0,
            minutes: allStats.minutes || 0,
            saves: allStats.saves || allStats.totalSaves || 0,
            goalsConceded: allStats.goalsConceded || allStats.goalsAllowed || 0,
          };
        } else {
          console.log("No splits.categories found in response");
        }

        setPlayerGameStats(parsedStats);
        console.log("Final processed player game stats:", parsedStats);
      } else {
        console.warn(
          "Failed to fetch player game stats:",
          response.status,
          response.statusText,
        );
        const errorText = await response.text();
        console.log("Error response body:", errorText);
      }
    } catch (error) {
      console.error("Error fetching player game stats:", error);
    } finally {
      setLoadingPlayerStats(false);
    }
  };

  // Toggle function for plays (track by stable play key/id instead of index)
  const togglePlay = (playKey) => {
    // Animate layout changes for immediate, snappy expansion
    try {
      // Animate opacity only with a short duration to avoid layout size/position morphing
      const animConfig = LayoutAnimation.create(
        120,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity,
      );
      LayoutAnimation.configureNext(animConfig);
    } catch (e) {
      // ignore if LayoutAnimation not available
    }

    const newOpenPlays = new Set(openPlays);
    if (newOpenPlays.has(playKey)) {
      newOpenPlays.delete(playKey);
    } else {
      newOpenPlays.add(playKey);
    }
    setOpenPlays(newOpenPlays);
  };

  // Function to load more plays
  // Uses processedPlaysRef to avoid stale closure issues when gameData polls update
  const loadMorePlays = useCallback(() => {
    const plays = processedPlaysRef.current;
    console.log("[LoadMorePlays] onPress fired!", {
      isLoadingMorePlays,
      hasPlays: !!plays,
      playsLength: plays?.length,
      visiblePlaysCount,
    });
    if (isLoadingMorePlays) {
      console.log("[LoadMorePlays] BLOCKED: already loading");
      return;
    }
    if (!plays) {
      console.log("[LoadMorePlays] BLOCKED: no plays in ref");
      return;
    }
    setIsLoadingMorePlays(true);
    // Compute the same filtered count used in renderPlayByPlay
    const filteredCount = plays.filter((play) => {
      const text = play.text || play.shortText || "";
      return [
        "Out at",
        "Pass at",
        "touch at",
        "Clear at",
        "Take On",
        "Attempted Tackle",
      ].every((phrase) => !text.includes(phrase));
    }).length;
    const newCount = Math.min(visiblePlaysCount + 30, filteredCount);
    console.log("[LoadMorePlays] Updating visiblePlaysCount:", {
      current: visiblePlaysCount,
      newCount,
      filteredCount,
    });
    setTimeout(() => {
      setVisiblePlaysCount((prev) => {
        const next = Math.min(prev + 30, filteredCount);
        console.log("[LoadMorePlays] setVisiblePlaysCount:", { prev, next });
        return next;
      });
      setIsLoadingMorePlays(false);
    }, 100);
  }, [isLoadingMorePlays, visiblePlaysCount]);

  // Reset visible plays count when switching to plays tab
  const resetPlaysCount = useCallback(() => {
    setVisiblePlaysCount(30);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    // Clear stats data to ensure fresh data is fetched
    setStatsData(null);
    await loadGameDetails();
    setRefreshing(false);
  };

  const getMatchStatus = () => {
    if (!gameData) return { text: "", isLive: false };

    const status = gameData.header?.competitions?.[0]?.status;
    const type = status?.type;
    const state = status?.type?.state;

    if (state === "pre") {
      // Match not started - show date and time like scoreboard
      const date = new Date(gameData.header.competitions[0].date);
      const today = new Date();
      const isToday = date.toDateString() === today.toDateString();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const isYesterday = date.toDateString() === yesterday.toDateString();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const isTomorrow = date.toDateString() === tomorrow.toDateString();

      let dateText = "";
      if (isToday) {
        dateText = "Today";
      } else if (isYesterday) {
        dateText = "Yesterday";
      } else if (isTomorrow) {
        dateText = "Tomorrow";
      } else {
        dateText = date.toLocaleDateString([], {
          month: "short",
          day: "numeric",
        });
      }

      const timeText = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      return {
        text: timeText,
        detail: dateText,
        isLive: false,
        isPre: true,
        isPost: false,
        description: type?.description || "",
      };
    } else if (state === "in") {
      // Match in progress - show clock time and half info
      const displayClock = status.type.shortDetail || "0'";
      const period = status.period;

      // Check if it's halftime
      if (status.type?.description === "Halftime") {
        return {
          text: "HT",
          detail: "Halftime",
          isLive: true,
          isPre: false,
          isPost: false,
          description: type?.description || "",
        };
      }

      // Determine half based on period
      let halfText = "";
      if (period === 1) {
        halfText = "1st Half";
      } else if (period === 2) {
        halfText = "2nd Half";
      } else if (period > 2) {
        halfText = "Extra Time";
      } else {
        halfText = "Live";
      }

      return {
        text: displayClock,
        detail: halfText,
        isLive: true,
        isPre: false,
        isPost: false,
        description: type?.description || "",
      };
    } else {
      return {
        text: "FT",
        detail: "Full Time",
        isLive: false,
        isPre: false,
        isPost: true,
        description: type?.shortDetail || "",
      };
    }
  };

  // Streaming functionality based on scoreboard.js logic (lines 1692-2743)
  const STREAM_API_BASE = "https://streamed.pk/api";

  const normalizeTeamName = (teamName) => {
    // Special cases for specific team names (from scoreboard.js)
    const specialCases = {
      "paris saint germain": "psg",
      "paris saint-germain": "psg",
      "tottenham hotspur": "tottenham-hotspur",
      tottenham: "tottenham-hotspur",
      "manchester united": "manchester-united",
      "manchester city": "manchester-city",
      "real madrid": "real-madrid",
      "atletico madrid": "atletico-madrid",
      "bayern munich": "bayern-munich",
      "borussia dortmund": "borussia-dortmund",
      "stade rennais": "rennes",
      marseille: "olympique-marseille",
      lafc: "los-angeles-fc",
      "sporting kansas city": "sporting-kc",
      "chicago fire fc": "chicago-fire",
      "st. louis city sc": "st-louis-city",
      "afc bournemouth": "bournemouth",
      bournemouth: "bournemouth",
      "west ham united": "west-ham-united",
      "west ham": "west-ham-united",
      "brighton & hove albion": "brighton",
      brighton: "brighton",
      "crystal palace": "crystal-palace",
      "newcastle united": "newcastle-united",
      newcastle: "newcastle-united",
      "wolverhampton wanderers": "wolves",
      wolves: "wolves",
      "nottingham forest": "nottingham-forest",
      fulham: "fulham",
      burnley: "burnley",
      "sheffield united": "sheffield-united",
      "luton town": "luton-town",
      millwall: "millwall",
      "preston north end": "preston",
      "coventry city": "coventry-city",
      "swansea city": "swansea-city",
      swansea: "swansea-city",
      "norwich city": "norwich-city",
      norwich: "norwich-city",
      watford: "watford",
      sunderland: "sunderland",
      middlesbrough: "middlesbrough",
      "hull city": "hull-city",
      "cardiff city": "cardiff-city",
      cardiff: "cardiff-city",
      "republic of ireland": "ireland",
    };

    const lowerName = teamName.toLowerCase();
    if (specialCases[lowerName]) {
      return specialCases[lowerName];
    }

    // Convert team names to streaming format with proper special character handling
    return (
      teamName
        .toLowerCase()
        // First, convert special characters to ASCII equivalents (matching API format)
        .replace(/á/g, "a")
        .replace(/é/g, "e")
        .replace(/í/g, "i")
        .replace(/ó/g, "o")
        .replace(/ú/g, "u")
        .replace(/ü/g, "u")
        .replace(/ñ/g, "n")
        .replace(/ç/g, "c")
        .replace(/ß/g, "ss")
        // Handle accented characters that become multiple characters
        .replace(/ë/g, "e")
        .replace(/ï/g, "i")
        .replace(/ö/g, "o")
        .replace(/ä/g, "a")
        .replace(/å/g, "a")
        .replace(/ø/g, "o")
        // Convert spaces to hyphens
        .replace(/\s+/g, "-")
        // Remove any remaining non-alphanumeric characters except hyphens
        .replace(/[^a-z0-9\-]/g, "")
        // Clean up multiple hyphens
        .replace(/-+/g, "-")
        // Remove leading/trailing hyphens
        .replace(/^-+|-+$/g, "")
        // Remove common prefixes/suffixes (be more conservative)
        .replace(/^afc-/, "") // Remove "AFC " prefix
        .replace(/-afc$/, "")
    ); // Remove " AFC" suffix
    // Keep "FC " prefix as it's often part of the official name
  };

  const fetchLiveMatches = async () => {
    try {
      console.log(`Fetching live matches from API...`);
      const response = await fetch(
        convertToHttps(`${STREAM_API_BASE}/matches/football`),
      );

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const allMatches = await response.json();
      console.log(`Found ${allMatches.length} total live matches`);

      // Debug: Check what category values are in the API response
      if (allMatches.length > 0) {
        const uniqueCategories = [
          ...new Set(
            allMatches
              .map((match) => match.category || match.sport)
              .filter((category) => category),
          ),
        ];
        console.log("Available categories in API:", uniqueCategories);

        // Show sample of matches with their category values
        console.log("Sample matches with category values:");
        for (let i = 0; i < Math.min(5, allMatches.length); i++) {
          const match = allMatches[i];
          const categoryValue = match.category || match.sport || "undefined";
          console.log(
            `  Match ${i + 1}: "${match.title}" - Category: "${categoryValue}"`,
          );
        }
      }

      // Filter matches by category (for soccer: football or other)
      const relevantCategories = ["football", "other"];
      const matches = allMatches.filter((match) => {
        const matchCategory = match.category || match.sport;
        return relevantCategories.includes(matchCategory);
      });
      console.log(
        `Filtered to ${
          matches.length
        } soccer matches (${relevantCategories.join(" or ")})`,
      );
      return matches;
    } catch (error) {
      console.error("Error fetching live matches:", error);
      return [];
    }
  };

  const fetchStreamsForSource = async (source, sourceId) => {
    try {
      console.log(`Fetching streams for ${source}/${sourceId}...`);
      const response = await fetch(
        convertToHttps(`${STREAM_API_BASE}/stream/${source}/${sourceId}`),
      );

      if (!response.ok) {
        throw new Error(`Stream API request failed: ${response.status}`);
      }

      const streams = await response.json();
      console.log(`Found ${streams.length} streams for ${source}`);
      return streams;
    } catch (error) {
      console.error(`Error fetching streams for ${source}/${sourceId}:`, error);
      return [];
    }
  };

  const findMatchStreams = async (homeTeamName, awayTeamName) => {
    try {
      console.log(`Looking for streams: ${homeTeamName} vs ${awayTeamName}`);

      // Fetch live matches for soccer (football and other categories)
      let matches = await fetchLiveMatches();

      // Debug: Check if we got any matches and what they look like
      console.log(`After filtering: Got ${matches.length} soccer matches`);
      if (matches.length === 0) {
        console.log("No soccer matches found! This could be due to:");
        console.log("1. API category field name changed");
        console.log("2. Category value is different than expected");
        console.log("3. No football or other category matches currently live");

        // Try fallback: search all matches if no football matches found
        console.log("Trying fallback: searching all matches...");
        try {
          const allMatchesResponse = await fetch(
            convertToHttps(`${STREAM_API_BASE}/matches/football`),
          );
          if (allMatchesResponse.ok) {
            const allMatchesData = await allMatchesResponse.json();
            console.log(
              `Fallback: Found ${allMatchesData.length} total matches`,
            );
            // Use all matches as fallback
            matches = allMatchesData;
          }
        } catch (fallbackError) {
          console.error("Fallback fetch failed:", fallbackError);
        }
      } else {
        console.log("Sample filtered matches:");
        for (let i = 0; i < Math.min(3, matches.length); i++) {
          const match = matches[i];
          console.log(`  ${i + 1}. "${match.title}" - Sport: "${match.sport}"`);
        }
      }

      // Try to find our match
      const homeNormalized = normalizeTeamName(homeTeamName).toLowerCase();
      const awayNormalized = normalizeTeamName(awayTeamName).toLowerCase();

      console.log(`Normalized names: ${homeNormalized} vs ${awayNormalized}`);

      // Check if both teams have the same first word (city name) - this causes confusion
      const homeFirstWord = homeNormalized.split("-")[0];
      const awayFirstWord = awayNormalized.split("-")[0];
      const hasSameCity = homeFirstWord === awayFirstWord;

      console.log(
        `Team analysis: Home first word: "${homeFirstWord}", Away first word: "${awayFirstWord}", Same city: ${hasSameCity}`,
      );

      let bestMatch = null;
      let bestScore = 0;

      // Debug: Show first few matches to understand API format
      if (matches.length > 0) {
        console.log("Sample matches from API:");
        for (let i = 0; i < Math.min(10, matches.length); i++) {
          const match = matches[i];
          console.log(`  ${i + 1}. Title: "${match.title}"`);
          if (match.teams) {
            console.log(
              `     Teams: ${match.teams.home?.name || "N/A"} vs ${
                match.teams.away?.name || "N/A"
              }`,
            );
          }
          if (match.sources) {
            console.log(
              `     Sources: ${match.sources.map((s) => s.source).join(", ")}`,
            );
          }
        }
      }

      // Quick pre-filter to reduce processing - look for obvious matches first
      const quickMatches = matches
        .slice(0, Math.min(matches.length, 100))
        .filter((match) => {
          const title = match.title.toLowerCase();

          if (hasSameCity) {
            // If teams have same city, require BOTH full team names to be present
            const hasHomeTeam =
              title.includes(homeNormalized) ||
              match.teams?.home?.name?.toLowerCase().includes(homeNormalized);
            const hasAwayTeam =
              title.includes(awayNormalized) ||
              match.teams?.away?.name?.toLowerCase().includes(awayNormalized);
            return hasHomeTeam && hasAwayTeam;
          } else {
            // Normal case: require BOTH teams to have some match, not just one
            const homeHasMatch =
              title.includes(homeNormalized.split("-")[0]) ||
              title.includes(homeNormalized.split("-")[1] || "") ||
              match.teams?.home?.name
                ?.toLowerCase()
                .includes(homeNormalized.split("-")[0]);
            const awayHasMatch =
              title.includes(awayNormalized.split("-")[0]) ||
              title.includes(awayNormalized.split("-")[1] || "") ||
              match.teams?.away?.name
                ?.toLowerCase()
                .includes(awayNormalized.split("-")[0]);

            // Require BOTH teams to match, not just one
            return homeHasMatch && awayHasMatch;
          }
        });

      // If we found quick matches, prioritize them
      const matchesToProcess =
        quickMatches.length > 0
          ? quickMatches
          : matches.slice(0, Math.min(matches.length, 100));

      console.log(
        `Processing ${matchesToProcess.length} matches (${
          quickMatches.length > 0 ? "pre-filtered" : "full set"
        })`,
      );

      // Process the filtered matches
      for (let i = 0; i < matchesToProcess.length; i++) {
        const match = matchesToProcess[i];

        if (!match.sources || match.sources.length === 0) continue;

        const matchTitle = match.title.toLowerCase();
        let totalScore = 0;

        // Multiple matching strategies with rough/fuzzy matching
        const strategies = [
          // Strategy 1: Rough name matching in title (more flexible)
          () => {
            let score = 0;
            const titleWords = matchTitle.split(/[\s\-]+/);

            if (hasSameCity) {
              // For same-city teams, require both full team names to be present
              if (
                matchTitle.includes(homeNormalized) &&
                matchTitle.includes(awayNormalized)
              ) {
                score += 1.0; // High score for exact matches
              } else {
                // Check for partial matches but be more strict
                const homeParts = homeNormalized
                  .split("-")
                  .filter((word) => word.length > 2);
                const awayParts = awayNormalized
                  .split("-")
                  .filter((word) => word.length > 2);

                let homeMatches = 0;
                let awayMatches = 0;

                homeParts.forEach((part) => {
                  if (titleWords.some((word) => word.includes(part)))
                    homeMatches++;
                });
                awayParts.forEach((part) => {
                  if (titleWords.some((word) => word.includes(part)))
                    awayMatches++;
                });

                // Require at least 2 parts to match for each team when they have same city
                if (homeMatches >= 2 && awayMatches >= 2) {
                  score += 0.8;
                } else if (homeMatches >= 1 && awayMatches >= 1) {
                  score += 0.4;
                }
              }
            } else {
              // Normal case: check if major parts of team names appear in title
              // Be more strict - require longer words and better matches
              const homeParts = homeNormalized
                .split("-")
                .filter((word) => word.length > 3); // Increased from 2 to 3
              const awayParts = awayNormalized
                .split("-")
                .filter((word) => word.length > 3); // Increased from 2 to 3

              let homeScore = 0;
              let awayScore = 0;

              homeParts.forEach((part) => {
                if (
                  titleWords.some(
                    (word) => word.includes(part) && word.length > 2,
                  )
                )
                  homeScore += 0.3;
                if (part.length > 4) homeScore += 0.2; // Bonus for longer, more specific words
              });
              awayParts.forEach((part) => {
                if (
                  titleWords.some(
                    (word) => word.includes(part) && word.length > 2,
                  )
                )
                  awayScore += 0.3;
                if (part.length > 4) awayScore += 0.2; // Bonus for longer, more specific words
              });

              // Require at least one significant match for each team
              if (homeParts.length > 0 && homeScore > 0)
                score += Math.min(homeScore, 0.8);
              if (awayParts.length > 0 && awayScore > 0)
                score += Math.min(awayScore, 0.8);
            }

            return score;
          },
          // Strategy 2: Check team objects if available (rough matching)
          () => {
            let score = 0;
            if (match.teams) {
              const homeApiName = match.teams.home?.name?.toLowerCase() || "";
              const awayApiName = match.teams.away?.name?.toLowerCase() || "";

              if (hasSameCity) {
                // For same-city teams, require both API team names to match our normalized names
                if (
                  homeApiName.includes(homeNormalized) &&
                  awayApiName.includes(awayNormalized)
                ) {
                  score += 1.2; // Very high score for exact API matches
                } else {
                  // Check for partial matches but be more strict
                  const homeParts = homeNormalized
                    .split("-")
                    .filter((word) => word.length > 2);
                  const awayParts = awayNormalized
                    .split("-")
                    .filter((word) => word.length > 2);

                  let homeMatches = 0;
                  let awayMatches = 0;

                  homeParts.forEach((part) => {
                    if (homeApiName.includes(part)) homeMatches++;
                  });
                  awayParts.forEach((part) => {
                    if (awayApiName.includes(part)) awayMatches++;
                  });

                  // Require at least 2 parts to match for each team when they have same city
                  if (homeMatches >= 2 && awayMatches >= 2) {
                    score += 0.9;
                  } else if (homeMatches >= 1 && awayMatches >= 1) {
                    score += 0.5;
                  }
                }
              } else {
                // Normal case: rough matching against API team names
                const homeParts = homeNormalized
                  .split("-")
                  .filter((word) => word.length > 3); // Increased from 2 to 3
                const awayParts = awayNormalized
                  .split("-")
                  .filter((word) => word.length > 3); // Increased from 2 to 3

                let homeMatches = 0;
                let awayMatches = 0;

                homeParts.forEach((part) => {
                  if (homeApiName.includes(part) && part.length > 2)
                    homeMatches++;
                });
                awayParts.forEach((part) => {
                  if (awayApiName.includes(part) && part.length > 2)
                    awayMatches++;
                });

                // Require more specific matches
                if (homeMatches > 0 && awayMatches > 0) {
                  score += 0.4; // Reduced from 0.6
                } else if (homeMatches > 0 || awayMatches > 0) {
                  score += 0.2; // Reduced from 0.6
                }
              }
            }
            return score;
          },
          // Strategy 3: Soccer-specific abbreviations and common names
          () => {
            const abbreviations = {
              tottenham: [
                "tottenham",
                "spurs",
                "tottenham-hotspur",
                "hotspur",
                "spurs-fc",
              ],
              bournemouth: [
                "bournemouth",
                "afc-bournemouth",
                "bournemouth-afc",
                "cherries",
              ],
              manchester: [
                "manchester",
                "manchester-united",
                "manchester-city",
                "man-utd",
                "man-city",
                "manc",
              ],
              united: [
                "united",
                "man-united",
                "manchester-united",
                "utd",
                "red-devils",
              ],
              city: [
                "city",
                "man-city",
                "manchester-city",
                "citizens",
                "sky-blues",
              ],
              chelsea: ["chelsea", "chelsea-fc", "blues", "pensioners"],
              arsenal: ["arsenal", "arsenal-fc", "gunners", "gooners"],
              liverpool: ["liverpool", "liverpool-fc", "reds", "kop"],
              everton: ["everton", "everton-fc", "toffees", "blues"],
              aston: ["aston-villa", "villa", "villans", "claret-and-blue"],
              west: ["west-brom", "west-ham", "bromwich", "hammers", "irons"],
              newcastle: [
                "newcastle",
                "newcastle-united",
                "magpies",
                "toon-army",
              ],
              brighton: [
                "brighton",
                "brighton-hove-albion",
                "seagulls",
                "albion",
              ],
              crystal: ["crystal-palace", "palace", "eagles", "glaziers"],
              southampton: ["southampton", "saints", "southampton-fc"],
              leicester: ["leicester", "leicester-city", "foxes", "city-foxes"],
              wolves: ["wolves", "wolverhampton", "wanderers", "wolves-fc"],
              fulham: ["fulham", "fulham-fc", "cottagers", "whites"],
              burnley: ["burnley", "burnley-fc", "clarets", "turf-moor"],
              sheffield: [
                "sheffield",
                "sheffield-united",
                "blades",
                "sheff-utd",
              ],
              "west-brom": [
                "west-brom",
                "west-bromwich",
                "bromwich-albion",
                "baggies",
              ],
              "west-ham": ["west-ham", "west-ham-united", "hammers", "irons"],
              norwich: ["norwich", "norwich-city", "canaries", "yellows"],
              watford: ["watford", "watford-fc", "hornets", "golden-boys"],
              brentford: ["brentford", "brentford-fc", "bees", "red-lions"],
              leeds: ["leeds", "leeds-united", "whites", "peacocks"],
              cardiff: [
                "cardiff",
                "cardiff-city",
                "bluebirds",
                "city-bluebirds",
              ],
              swansea: ["swansea", "swansea-city", "swans", "jack-army"],
              hull: ["hull", "hull-city", "tigers", "black-and-amber"],
              middlesbrough: ["middlesbrough", "boro", "boro-fc", "smoggies"],
              stoke: ["stoke", "stoke-city", "potters", "red-and-white"],
              sunderland: [
                "sunderland",
                "sunderland-afc",
                "black-cats",
                "mackems",
              ],
              birmingham: [
                "birmingham",
                "birmingham-city",
                "blues",
                "city-blues",
              ],
              blackburn: [
                "blackburn",
                "blackburn-rovers",
                "rovers",
                "blue-and-whites",
              ],
              bolton: ["bolton", "bolton-wanderers", "wanderers", "trotters"],
              charlton: [
                "charlton",
                "charlton-athletic",
                "addicks",
                "red-army",
              ],
              derby: ["derby", "derby-county", "rams", "county-rams"],
              ipswich: ["ipswich", "ipswich-town", "tractor-boys", "blues"],
              luton: ["luton", "luton-town", "hatters", "town-hatters"],
              millwall: ["millwall", "millwall-fc", "lions", "south-london"],
              nottingham: [
                "nottingham",
                "nottingham-forest",
                "forest",
                "tricky-trees",
              ],
              preston: [
                "preston",
                "preston-north-end",
                "north-end",
                "lilywhites",
              ],
              reading: ["reading", "reading-fc", "royals", "biscuitmen"],
              rotherham: [
                "rotherham",
                "rotherham-united",
                "millers",
                "red-millers",
              ],
              wigan: ["wigan", "wigan-athletic", "latics", "tics"],
            };

            let score = 0;
            const titleWords = matchTitle.split(/[\s\-]+/);

            // Check home team abbreviations (be more selective)
            const homeParts = homeNormalized.split("-");
            homeParts.forEach((part) => {
              if (abbreviations[part]) {
                // Only give points if the abbreviation appears as a complete word, not just substring
                abbreviations[part].forEach((abbr) => {
                  if (
                    titleWords.some(
                      (word) =>
                        word === abbr ||
                        (word.includes(abbr) && abbr.length > 3),
                    )
                  ) {
                    score += 0.2; // Reduced from 0.3
                  }
                });
              }
            });

            // Check away team abbreviations (be more selective)
            const awayParts = awayNormalized.split("-");
            awayParts.forEach((part) => {
              if (abbreviations[part]) {
                // Only give points if the abbreviation appears as a complete word, not just substring
                abbreviations[part].forEach((abbr) => {
                  if (
                    titleWords.some(
                      (word) =>
                        word === abbr ||
                        (word.includes(abbr) && abbr.length > 3),
                    )
                  ) {
                    score += 0.2; // Reduced from 0.3
                  }
                });
              }
            });

            return score;
          },
        ];

        // Apply all strategies and sum scores
        strategies.forEach((strategy) => {
          totalScore += strategy();
        });

        console.log(
          `Match "${match.title.substring(
            0,
            50,
          )}..." score: ${totalScore.toFixed(2)}`,
        );

        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestMatch = match;

          // Early exit if we find a very good match (increased threshold to prevent wrong matches)
          if (bestScore >= 2.0) {
            console.log(
              `Found excellent match with score ${bestScore}, stopping search early`,
            );
            break;
          }
        }
      }

      if (!bestMatch || bestScore < 0.5) {
        // Increased from 0.3 to 0.5 for stricter matching
        console.log(
          `No good matching live match found in API (best score: ${bestScore.toFixed(
            2,
          )})`,
        );
        console.log(`Searched for: ${homeNormalized} vs ${awayNormalized}`);
        console.log(
          `Processed: ${matchesToProcess.length} matches out of ${matches.length} total`,
        );
        return {};
      }

      console.log(
        `Found matching match: ${bestMatch.title} (score: ${bestScore.toFixed(
          2,
        )})`,
      );

      // VALIDATION: Ensure the matched game actually contains both teams with stricter checking
      const matchedTitle = bestMatch.title.toLowerCase();
      const matchedHomeTeam = bestMatch.teams?.home?.name?.toLowerCase() || "";
      const matchedAwayTeam = bestMatch.teams?.away?.name?.toLowerCase() || "";

      // Check if both teams appear in the title (using flexible word matching like relevance check)
      const homeWords = homeNormalized
        .split("-")
        .filter((word) => word.length > 2);
      const awayWords = awayNormalized
        .split("-")
        .filter((word) => word.length > 2);

      let homeInTitle = false;
      let awayInTitle = false;

      // Check if significant words from each team appear in title or API team names
      homeWords.forEach((word) => {
        if (matchedTitle.includes(word) || matchedHomeTeam.includes(word))
          homeInTitle = true;
      });
      awayWords.forEach((word) => {
        if (matchedTitle.includes(word) || matchedAwayTeam.includes(word))
          awayInTitle = true;
      });

      // Additional validation: ensure the matched teams are actually relevant
      // For example, if we're looking for "Manchester City", don't match "Montevideo City Torque"
      let relevantHomeMatches = 0;
      let relevantAwayMatches = 0;

      homeWords.forEach((word) => {
        if (matchedTitle.includes(word) || matchedHomeTeam.includes(word))
          relevantHomeMatches++;
      });
      awayWords.forEach((word) => {
        if (matchedTitle.includes(word) || matchedAwayTeam.includes(word))
          relevantAwayMatches++;
      });

      // Require at least 50% of significant words to match for each team
      const homeRelevanceRatio =
        relevantHomeMatches / Math.max(1, homeWords.length);
      const awayRelevanceRatio =
        relevantAwayMatches / Math.max(1, awayWords.length);

      if (
        !homeInTitle ||
        !awayInTitle ||
        homeRelevanceRatio < 0.5 ||
        awayRelevanceRatio < 0.5
      ) {
        console.log(
          `WARNING: Matched game "${bestMatch.title}" doesn't contain both teams or isn't relevant enough!`,
        );
        console.log(`Expected: ${homeNormalized} vs ${awayNormalized}`);
        console.log(`Found in title: Home=${homeInTitle}, Away=${awayInTitle}`);
        console.log(
          `API teams: Home="${matchedHomeTeam}", Away="${matchedAwayTeam}"`,
        );
        console.log(
          `Relevance: Home=${homeRelevanceRatio.toFixed(
            2,
          )}, Away=${awayRelevanceRatio.toFixed(2)}`,
        );

        // Reject the match if validation fails
        console.log(
          "Rejecting match due to validation failure - teams do not match or are not relevant",
        );
        return {};
      } else {
        console.log(
          `✓ Validation passed: Matched game contains both teams and is relevant`,
        );
        console.log(
          `Relevance scores: Home=${homeRelevanceRatio.toFixed(
            2,
          )}, Away=${awayRelevanceRatio.toFixed(2)}`,
        );
      }

      // Fetch streams for each source
      const streams = {};

      for (const source of bestMatch.sources) {
        const sourceStreams = await fetchStreamsForSource(
          source.source,
          source.id,
        );

        // Store the first stream for each source (usually the best quality)
        if (sourceStreams.length > 0) {
          streams[source.source] = sourceStreams[0];
          console.log(
            `Got stream for ${source.source}: ${sourceStreams[0].embedUrl}`,
          );
        }
      }

      return streams;
    } catch (error) {
      console.error("Error finding match streams:", error);
      return {};
    }
  };

  const loadStreams = async () => {
    if (!gameData) return;

    setStreamLoading(true);
    setStreamError(false);

    try {
      const competition = gameData.header?.competitions?.[0];
      const homeTeam =
        gameData.homeCompetitor ||
        competition?.competitors?.find((comp) => comp.homeAway === "home");
      const awayTeam =
        gameData.awayCompetitor ||
        competition?.competitors?.find((comp) => comp.homeAway === "away");

      const homeTeamName = homeTeam?.team?.displayName || "";
      const awayTeamName = awayTeam?.team?.displayName || "";

      console.log("Loading streams for:", homeTeamName, "vs", awayTeamName);

      // Use the API-based stream finding logic from scoreboard.js
      const streams = await findMatchStreams(homeTeamName, awayTeamName);

      // Convert the API response format to our expected format
      const convertedStreams = {};
      Object.keys(streams).forEach((source) => {
        if (streams[source] && streams[source].embedUrl) {
          convertedStreams[source] = streams[source].embedUrl;
        }
      });

      setAvailableStreams(convertedStreams);

      // Set default stream to first available
      const streamTypes = Object.keys(convertedStreams);
      if (streamTypes.length > 0) {
        setCurrentStreamType(streamTypes[0]);
      }
    } catch (error) {
      console.error("Error loading streams:", error);
      setStreamError(true);
    } finally {
      setStreamLoading(false);
    }
  };

  const renderStickyHeader = () => {
    if (!gameData) return null;

    const competition = gameData.header?.competitions?.[0];
    // Use processed competitors if available, fallback to original structure
    const homeTeamData =
      gameData.homeCompetitor ||
      competition?.competitors?.find((comp) => comp.homeAway === "home") ||
      competition?.competitors?.[0];
    const awayTeamData =
      gameData.awayCompetitor ||
      competition?.competitors?.find((comp) => comp.homeAway === "away") ||
      competition?.competitors?.[1];
    const matchStatus = getMatchStatus();

    const homeScoreNum = parseInt(homeTeamData.score) || 0;
    const awayScoreNum = parseInt(awayTeamData.score) || 0;

    const homeShootoutScore = parseInt(homeTeamData.shootoutScore) || null;
    const awayShootoutScore = parseInt(awayTeamData.shootoutScore) || null;

    const homeIsWinner = matchStatus.isPost && (homeShootoutScore > awayShootoutScore || homeScoreNum > awayScoreNum);
    const awayIsWinner = matchStatus.isPost && (awayShootoutScore > homeShootoutScore || awayScoreNum > homeScoreNum);

    const homeIsLoser =
      !matchStatus.isLive && !matchStatus.isPre && !homeIsWinner;
    const awayIsLoser =
      !matchStatus.isLive && !matchStatus.isPre && !awayIsWinner;

    // Format date for display
    
    const gameDate = competition?.date || "";
    const formatDateLine = () => {
      if (!gameDate) return "";
      const date = new Date(gameDate);
      const today = new Date();
      const isToday = date.toDateString() === today.toDateString();
      if (isToday) {
        return `Today • ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      }
      return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} • ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    };

    return (
      <View
        style={[
          styles.stickyUnit,
          {
            backgroundColor: theme.surface,
            borderBottomColor: theme.border,
          },
        ]}
      >
        {/* Animated Mini Header */}
        <Animated.View
          style={[
            styles.stickyMini,
            {
              height: stickyMiniHeight,
              opacity: stickyOpacity,
              backgroundColor: theme.surface,
              borderBottomColor: theme.border,
            },
          ]}
        >
          {/* Home team (left) */}
          <View style={styles.miniSide}>
            <TeamLogoImage
              teamId={homeTeamData?.team?.id}
              style={[
                styles.miniLogo,
                { opacity: isGameFinal() ? (homeIsWinner ? 1 : 0.55) : 1 },
              ]}
              isDarkMode={isDarkMode}
            />
            <Text
              allowFontScaling={false}
              style={[
                styles.miniAbbr,
                {
                  color: theme.text,
                  opacity: isGameFinal() ? (homeIsWinner ? 1 : 0.55) : 1,
                },
              ]}
              numberOfLines={1}
            >
              {homeTeamData?.team?.abbreviation ||
                homeTeamData?.team?.displayName?.substring(0, 3) ||
                "HOME"}
            </Text>
            {!matchStatus.isPre && (
              <Text
                allowFontScaling={false}
                style={[
                  styles.miniScore,
                  {
                    color: homeIsWinner ? theme.text : theme.textSecondary,
                    fontWeight: isGameFinal() && homeIsWinner ? "700" : "400",
                  },
                ]}
              >
                {homeScoreNum}
              </Text>
            )}
            {!matchStatus.isPre && homeShootoutScore && (
              <Text
                allowFontScaling={false}
                style={[
                  styles.miniShootoutScore,
                  {
                    color: homeIsWinner ? theme.text : theme.textSecondary,
                    fontWeight: isGameFinal() && homeIsWinner ? "700" : "400",
                  },
                ]}
              >
                ({homeShootoutScore})
              </Text>
            )}
          </View>

          {/* Status (center) */}
          <View style={styles.miniStatusBlock}>
            <Text
              allowFontScaling={false}
              style={[styles.miniStatusLine, { color: theme.text }]}
              numberOfLines={1}
            >
              {matchStatus.isPre
                  ? matchStatus.description
                  : matchStatus.isPost
                    ? matchStatus.description
                    : matchStatus.text}
            </Text>
            <Text
              allowFontScaling={false}
              style={[styles.miniStatusSub, { color: theme.textTertiary }]}
              numberOfLines={1}
            >
              {matchStatus.isLive ? matchStatus.detail : formatDateLine()}
            </Text>
          </View>

          {/* Away team (right) */}
          <View style={[styles.miniSide, { justifyContent: "flex-end" }]}>
            {!matchStatus.isPre && awayShootoutScore && (
              <Text
                allowFontScaling={false}
                style={[
                  styles.miniShootoutScore,
                  {
                    color: awayIsWinner ? theme.text : theme.textSecondary,
                    fontWeight: isGameFinal() && awayIsWinner ? "700" : "400",
                  },
                ]}
              >
                ({awayShootoutScore})
              </Text>
            )}
            {!matchStatus.isPre && (
              <Text
                allowFontScaling={false}
                style={[
                  styles.miniScore,
                  {
                    color: awayIsWinner ? theme.text : theme.textSecondary,
                    fontWeight: isGameFinal() && awayIsWinner ? "700" : "400",
                  },
                ]}
              >
                {awayScoreNum}
              </Text>
            )}
            <Text
              allowFontScaling={false}
              style={[
                styles.miniAbbr,
                {
                  color: theme.text,
                  opacity: isGameFinal() ? (awayIsWinner ? 1 : 0.55) : 1,
                },
              ]}
              numberOfLines={1}
            >
              {awayTeamData?.team?.abbreviation ||
                awayTeamData?.team?.displayName?.substring(0, 3) ||
                "AWAY"}
            </Text>
            <TeamLogoImage
              teamId={awayTeamData?.team?.id}
              style={[
                styles.miniLogo,
                { opacity: isGameFinal() ? (awayIsWinner ? 1 : 0.55) : 1 },
              ]}
              isDarkMode={isDarkMode}
            />
          </View>
        </Animated.View>

        {/* Tab Bar */}
        <View style={styles.tabBarWrapper}>
          <View style={styles.tabBarContent}>
            {[
              { key: "stats", label: "Stats" },
              { key: "home", label: "Home" },
              { key: "away", label: "Away" },
              { key: "plays", label: "Plays" },
            ].map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tabBarButton,
                  activeTab === tab.key && {
                    borderBottomColor: colors.primary,
                  },
                ]}
                onPress={() => {
                  if (tab.key === "plays") {
                    resetPlaysCount();
                  }
                  setActiveTab(tab.key);
                }}
                activeOpacity={0.8}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.tabBarLabel,
                    {
                      color:
                        activeTab === tab.key
                          ? colors.primary
                          : theme.textSecondary,
                      fontWeight: activeTab === tab.key ? "700" : "500",
                    },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    );
  };

  const renderHeaderScorersBox = () => {
    const { homeScorers, awayScorers } = scorersData;

    // Always show the scorers box if there's game data
    if (!gameData) {
      return null;
    }

    return (
      homeScorers.length > 0 || awayScorers.length > 0 ? (
      <View style={styles.headerScorersContainer}>
        {/* Home Scorers (Left) */}
        <View style={styles.headerScorersColumn}>
          {homeScorers.length > 0 ? (
            homeScorers.map((scorer, index) => (
              <Text
                allowFontScaling={false}
                key={index}
                style={[styles.headerScorerText, { color: theme.text }]}
              >
                {scorer.displayText}
              </Text>
            ))
          ) : null}
        </View>

        {/* Soccer Ball Separator */}
        <View style={styles.headerSoccerBallContainer}>
          <Text allowFontScaling={false} style={styles.headerSoccerBallEmoji}>
            ⚽
          </Text>
        </View>

        {/* Away Scorers (Right) */}
        <View style={styles.headerScorersColumn}>
          {awayScorers.length > 0 ? (
            awayScorers.map((scorer, index) => (
              <Text
                allowFontScaling={false}
                key={index}
                style={[styles.headerScorerText, { color: theme.text }]}
              >
                {scorer.displayText}
              </Text>
            ))
          ) : null }
        </View>
      </View>
        ) : null
    );
  };

  // Memoized scorers data - use homeScorers/awayScorers from processGameData (details[] with scoringPlay)
  const scorersData = useMemo(() => {
    if (!gameData) return { homeScorers: [], awayScorers: [] };
    const processDetailsScorers = (scorers) => {
      const map = new Map();
      scorers.forEach((s) => {
        const key = s.displayName;
        if (!map.has(key)) {
          map.set(key, {
            name: s.displayName,
            times: [],
            ownGoal: s.ownGoal,
            penaltyKick: s.penaltyKick,
          });
        }
        const suffix = s.ownGoal ? " (OG.)" : s.penaltyKick ? " (P.)" : "";
        map.get(key).times.push(s.clock + suffix);
      });
      return Array.from(map.values()).map((entry) => ({
        displayText: `${entry.name} ${entry.times.join(", ")}`,
        name: entry.name,
        times: entry.times,
      }));
    };
    const homeScorers = processDetailsScorers(gameData.homeScorers || []);
    const awayScorers = processDetailsScorers(gameData.awayScorers || []);
    return { homeScorers, awayScorers };
  }, [gameData]);

  const renderMatchHeader = () => {
    if (!gameData) return null;

    const competition = gameData.header?.competitions?.[0];
    const homeTeamData =
      gameData.homeCompetitor ||
      competition?.competitors?.find((comp) => comp.homeAway === "home") ||
      competition?.competitors?.[0];
    const awayTeamData =
      gameData.awayCompetitor ||
      competition?.competitors?.find((comp) => comp.homeAway === "away") ||
      competition?.competitors?.[1];
    const matchStatus = getMatchStatus();

    const homeScoreNum = parseInt(homeTeamData.score) || 0;
    const awayScoreNum = parseInt(awayTeamData.score) || 0;

    const homeShootoutScore = parseInt(homeTeamData.shootoutScore) || null;
    const awayShootoutScore = parseInt(awayTeamData.shootoutScore) || null;

    const homeIsWinner = matchStatus.isPost && (homeShootoutScore > awayShootoutScore || homeScoreNum > awayScoreNum);
    const awayIsWinner = matchStatus.isPost && (awayShootoutScore > homeShootoutScore || awayScoreNum > homeScoreNum);

    const homeIsLoser =
      !matchStatus.isLive && !matchStatus.isPre && !homeIsWinner;
    const awayIsLoser =
      !matchStatus.isLive && !matchStatus.isPre && !awayIsWinner;

    // Get team colors for gradient
    let homeColor =
      EuropaConferenceLeagueServiceEnhanced.getTeamColorWithAlternateLogic(
        homeTeamData?.team,
      ) || colors.primary;
    let awayColor =
      EuropaConferenceLeagueServiceEnhanced.getTeamColorWithAlternateLogic(
        awayTeamData?.team,
      ) ||
      colors.secondary;

    homeColor = homeColor.startsWith("#") ? homeColor : `#${homeColor}`;
    awayColor = awayColor.startsWith("#") ? awayColor : `#${awayColor}`;

    console.log(matchStatus)

    // Format date
    const gameDate = competition?.date || "";
    const formatDateLine = () => {
      if (!gameDate) return "";
      const date = new Date(gameDate);
      const today = new Date();
      const isToday = date.toDateString() === today.toDateString();
      if (isToday) {
        return `Today • ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      }
      return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} • ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    };

    return (
      <View
        style={[
          styles.simpleHeaderCard,
          {
            backgroundColor: theme.surfaceSecondary,
            borderColor: "rgba(0,0,0,0.08)",
          },
        ]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <HeaderGradient
          homeColor={homeColor}
          awayColor={awayColor}
          theme={theme}
          height={headerHeight}
        />

        {/* League/Competition info */}
        <View style={styles.simpleLeagueRow}>
          <Text
            allowFontScaling={false}
            style={[styles.simpleLeagueText, { color: theme.textTertiary }]}
            numberOfLines={1}
          >
            {gameData.competitionName || "UECL World Cup"}
          </Text>
        </View>

        {/* Main teams and score row */}
        <View style={styles.simpleMainRow}>
          {/* Home Team (Left - NBA convention) */}
          <View style={styles.simpleTeamContainer}>
            <View style={styles.simpleTeamTopRow}>
              <TeamLogoImage
                teamId={homeTeamData?.team?.id}
                style={[
                  styles.simpleTeamLogo,
                  {
                    opacity: matchStatus.isPost ? (homeIsWinner ? 1 : 0.55) : 1,
                  },
                ]}
                isDarkMode={isDarkMode}
              />
              {!matchStatus.isPre && (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.simpleTeamScore,
                    {
                      color: homeIsWinner
                        ? theme.text
                        : homeIsLoser
                          ? theme.textSecondary
                          : theme.text,
                    },
                    styles.scoreRight,
                  ]}
                >
                  {homeScoreNum}
                </Text>
              )}
            </View>
            <View style={styles.simpleTeamInfo}>
              <Text
                allowFontScaling={false}
                style={[
                  styles.simpleTeamName,
                  {
                    color: isFavorite(homeTeamData?.team?.id, "europa conference league")
                      ? colors.primary
                      : theme.text,
                    opacity: matchStatus.isPost ? (homeIsWinner ? 1 : 0.55) : 1,
                  },
                ]}
                numberOfLines={2}
              >
                {isFavorite(homeTeamData?.team?.id, "europa conference league") ? "★ " : ""}
                {homeTeamData?.team?.displayName || "Home Team"}
              </Text>
            </View>
          </View>

          {/* Center Status */}
          <View style={styles.simpleStatusCenter}>
            <View style={styles.simpleStatusBadge}>
                {homeShootoutScore !== null && awayShootoutScore !== null && (
              <Text
                allowFontScaling={false}
                style={[
                  styles.simpleStatusSecondary,
                  {
                    color: theme.text,
                  },
                ]}
              >
                Pen: {homeShootoutScore} - {awayShootoutScore}
              </Text>
                )}
              <Text
                allowFontScaling={false}
                style={[
                  styles.simpleStatusMain,
                  {
                    color: matchStatus.isLive
                      ? theme.error || colors.primary
                      : matchStatus.isPre
                        ? theme.text
                        : theme.textSecondary,
                  },
                ]}
              >
                {matchStatus.isPre
                  ? matchStatus.description
                  : matchStatus.isPost
                    ? matchStatus.description
                    : matchStatus.text}
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.simpleStatusSub, { color: theme.textTertiary }]}
              >
                {matchStatus.isLive ? matchStatus.detail : formatDateLine()}
              </Text>
            </View>

            {/* Stream button - only for live games when unlocked */}
            {matchStatus.isLive && isStreamingUnlocked && (
              <TouchableOpacity
                style={[
                  styles.simpleStreamBtn,
                  { borderColor: colors.primary },
                ]}
                onPress={() => {
                  loadStreams();
                  setShowStreamModal(true);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.simpleStreamBtnInner}>
                  <View
                    style={[
                      styles.simpleStreamBtnDot,
                      { backgroundColor: colors.primary },
                    ]}
                  />
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.simpleStreamBtnText,
                      { color: colors.primary },
                    ]}
                  >
                    Stream
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* Away Team (Right - NBA convention) */}
          <View style={styles.simpleTeamContainer}>
            <View style={styles.simpleTeamTopRow}>
              {!matchStatus.isPre && (
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.simpleTeamScore,
                    {
                      color: awayIsWinner
                        ? theme.text
                        : awayIsLoser
                          ? theme.textSecondary
                          : theme.text,
                    },
                    styles.scoreLeft,
                  ]}
                >
                  {awayScoreNum}
                </Text>
              )}
              <TeamLogoImage
                teamId={awayTeamData?.team?.id}
                style={[
                  styles.simpleTeamLogo,
                  {
                    opacity: matchStatus.isPost ? (awayIsWinner ? 1 : 0.55) : 1,
                  },
                ]}
                isDarkMode={isDarkMode}
              />
            </View>
            <View style={styles.simpleTeamInfo}>
              <Text
                allowFontScaling={false}
                style={[
                  styles.simpleTeamName,
                  {
                    color: isFavorite(awayTeamData?.team?.id, "europa conference league")
                      ? colors.primary
                      : theme.text,
                    opacity: matchStatus.isPost ? (awayIsWinner ? 1 : 0.55) : 1,
                  },
                ]}
                numberOfLines={2}
              >
                {isFavorite(awayTeamData?.team?.id, "europa conference league") ? "★ " : ""}
                {awayTeamData?.team?.displayName || "Away Team"}
              </Text>
            </View>
          </View>
        </View>

        {/* Scorers Box (UECL-specific addition) */}
        {renderHeaderScorersBox()}
      </View>
    );
  };

  const renderTabs = () => {
    // Tabs are now rendered in the sticky header
    return null;
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "stats":
        return renderStatsTab();
      case "home":
        return renderHomeTab();
      case "away":
        return renderAwayTab();
      case "plays":
        return renderPlaysTab();
      default:
        return renderStatsTab();
    }
  };

  const renderStatsTab = () => {
    if (loadingMatchStats) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text
              allowFontScaling={false}
              style={[styles.loadingText, { color: theme.textSecondary }]}
            >
              Loading match statistics...
            </Text>
          </View>
        </View>
      );
    }

    if (!statsData || !statsData.homeTeam || !statsData.awayTeam) {
      return (
        <View style={styles.tabContent}>
          <Text
            allowFontScaling={false}
            style={[styles.comingSoonText, { color: theme.textSecondary }]}
          >
            Match statistics not available
          </Text>
        </View>
      );
    }

    const { homeTeam, awayTeam, headToHeadData } = statsData;

    // Helper function to get stat value preferring normalizedStats (from competitor.$ref)
    const getStat = (team, statName) => {
      try {
        const ns = team?.normalizedStats;
        if (ns) {
          switch (statName) {
            case "possessionPct":
              if (ns.possession && ns.possession.num != null)
                return Number(ns.possession.num);
              if (ns.possession && ns.possession.display)
                return (
                  parseFloat(String(ns.possession.display).replace("%", "")) ||
                  0
                );
              break;
            case "shotsOnTarget":
              if (ns.shots && ns.shots.onGoal != null)
                return Number(ns.shots.onGoal);
              if (ns.shots && ns.shots.onGoalDisplay)
                return parseFloat(ns.shots.onGoalDisplay) || 0;
              break;
            case "totalShots":
            case "shotAttempts":
              if (ns.shots && ns.shots.total != null)
                return Number(ns.shots.total);
              if (ns.shots && ns.shots.totalDisplay)
                return parseFloat(ns.shots.totalDisplay) || 0;
              break;
            case "foulsCommitted":
              if (ns.discipline && ns.discipline.fouls != null)
                return Number(ns.discipline.fouls);
              if (ns.discipline && ns.discipline.foulsDisplay)
                return parseFloat(ns.discipline.foulsDisplay) || 0;
              break;
            case "yellowCards":
              if (ns.discipline && ns.discipline.yellow != null)
                return Number(ns.discipline.yellow);
              if (ns.discipline && ns.discipline.yellowDisplay)
                return parseFloat(ns.discipline.yellowDisplay) || 0;
              break;
            case "redCards":
              if (ns.discipline && ns.discipline.red != null)
                return Number(ns.discipline.red);
              if (ns.discipline && ns.discipline.redDisplay)
                return parseFloat(ns.discipline.redDisplay) || 0;
              break;
            case "wonCorners":
              if (ns.setPieces && ns.setPieces.corners != null)
                return Number(ns.setPieces.corners);
              if (ns.setPieces && ns.setPieces.cornersDisplay)
                return parseFloat(ns.setPieces.cornersDisplay) || 0;
              break;
            case "saves":
              if (ns.setPieces && ns.setPieces.saves != null)
                return Number(ns.setPieces.saves);
              if (ns.setPieces && ns.setPieces.savesDisplay)
                return parseFloat(ns.setPieces.savesDisplay) || 0;
              break;
            default:
              // If caller asked for a direct stat name that might exist in normalizedStats.shots or other groups
              // attempt to resolve common keys
              if (
                statName === "shotsInsideBox" &&
                ns.shots &&
                ns.shots.insideBox != null
              )
                return Number(ns.shots.insideBox);
              if (
                statName === "shotsOutsideBox" &&
                ns.shots &&
                ns.shots.outsideBox != null
              )
                return Number(ns.shots.outsideBox);
          }
        }

        // Fallback: old flattened team.statistics array
        const stat = team.statistics?.find((s) => s.name === statName);
        if (stat) {
          const parsed = parseFloat(String(stat.displayValue).replace("%", ""));
          return Number.isFinite(parsed)
            ? parsed
            : stat.value != null
              ? stat.value
              : 0;
        }
      } catch (err) {
        console.log("[UECLGameDetails] getStat error:", err);
      }
      return 0;
    };

    // Get possession percentages (prefer normalizedStats)
    const homePossession =
      homeTeam?.normalizedStats?.possession?.num != null
        ? Number(homeTeam.normalizedStats.possession.num)
        : getStat(homeTeam, "possessionPct");
    const awayPossession =
      awayTeam?.normalizedStats?.possession?.num != null
        ? Number(awayTeam.normalizedStats.possession.num)
        : getStat(awayTeam, "possessionPct");

    // Get team logos using enhanced service with fallbacks
    const homeLogo = gameData?.homeLogo || "https://via.placeholder.com/40";
    const awayLogo = gameData?.awayLogo || "https://via.placeholder.com/40";

    // Ensure colors are properly formatted with # prefix
    let homeColor =
      EuropaConferenceLeagueServiceEnhanced.getTeamColorWithAlternateLogic(homeTeam?.team) ||
      "#007bff";
    let awayColor =
      EuropaConferenceLeagueServiceEnhanced.getTeamColorWithAlternateLogic(awayTeam?.team) ||
      "#28a745";

    // Add # prefix if missing
    homeColor = homeColor.startsWith("#") ? homeColor : `#${homeColor}`;
    awayColor = awayColor.startsWith("#") ? awayColor : `#${awayColor}`;

    console.log("Team colors:", { homeColor, awayColor });

    return (
      <ScrollView
        style={styles.tabContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats Section Wrapper */}
        <View style={[styles.statsSection, { backgroundColor: theme.card }]}>
          {/* Main Match Stats Container */}
          <View
            style={[
              styles.matchStatsContainer,
              { backgroundColor: theme.surface },
            ]}
          >
            <Text
              allowFontScaling={false}
              style={[styles.statsHeader, { color: colors.primary }]}
            >
              Match Stats
            </Text>

            {/* Teams Header */}
            <View style={styles.statsTeams}>
              <View style={styles.statsTeamHome}>
                <TeamLogoImage
                  teamId={homeTeam?.team?.id}
                  style={styles.statsTeamLogo}
                  isDarkMode={isDarkMode}
                />
                <Text
                  allowFontScaling={false}
                  style={[styles.statsTeamName, { color: theme.text }]}
                >
                  {homeTeam.team.shortDisplayName}
                </Text>
              </View>
              <View style={styles.statsTeamAway}>
                <Text
                  allowFontScaling={false}
                  style={[styles.statsTeamName, { color: theme.text }]}
                >
                  {awayTeam.team.shortDisplayName}
                </Text>
                <TeamLogoImage
                  teamId={awayTeam?.team?.id}
                  style={styles.statsTeamLogo}
                  isDarkMode={isDarkMode}
                />
              </View>
            </View>

            {/* Possession Section */}
            <View style={styles.statsSectionInner}>
              <Text
                allowFontScaling={false}
                style={[styles.statsSectionTitle, { color: theme.text }]}
              >
                Possession
              </Text>
              <View style={styles.possessionSection}>
                <View style={styles.possessionCircleContainer}>
                  <View style={styles.possessionCircle}>
                    <Svg width={120} height={120} style={styles.possessionSvg}>
                      <Defs>
                        <LinearGradient
                          id="grad"
                          x1="0%"
                          y1="0%"
                          x2="100%"
                          y2="0%"
                        >
                          <Stop
                            offset="0%"
                            stopColor={awayColor}
                            stopOpacity="1"
                          />
                          <Stop
                            offset={`${awayPossession}%`}
                            stopColor={awayColor}
                            stopOpacity="1"
                          />
                          <Stop
                            offset={`${awayPossession}%`}
                            stopColor={homeColor}
                            stopOpacity="1"
                          />
                          <Stop
                            offset="100%"
                            stopColor={homeColor}
                            stopOpacity="1"
                          />
                        </LinearGradient>
                      </Defs>

                      {/* Background circle */}
                      <Circle
                        cx="60"
                        cy="60"
                        r="50"
                        stroke="#ddd"
                        strokeWidth="20"
                        fill="transparent"
                      />

                      {/* Away team arc */}
                      <Circle
                        cx="60"
                        cy="60"
                        r="50"
                        stroke={awayColor}
                        strokeWidth="20"
                        fill="transparent"
                        strokeDasharray={`${
                          (awayPossession / 100) * 314.159
                        } 314.159`}
                        strokeDashoffset="0"
                        transform="rotate(-90 60 60)"
                      />

                      {/* Home team arc */}
                      <Circle
                        cx="60"
                        cy="60"
                        r="50"
                        stroke={homeColor}
                        strokeWidth="20"
                        fill="transparent"
                        strokeDasharray={`${
                          (homePossession / 100) * 314.159
                        } 314.159`}
                        strokeDashoffset="0"
                        transform={`rotate(${
                          (awayPossession / 100) * 360 - 90
                        } 60 60)`}
                      />
                    </Svg>

                    <View
                      style={[
                        styles.possessionCenter,
                        { backgroundColor: theme.surface },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.possessionCenterText,
                          { color: theme.text },
                        ]}
                      >
                        Possession
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.possessionValues}>
                  <View style={styles.possessionTeam}>
                    <View
                      style={[
                        styles.possessionColor,
                        { backgroundColor: homeColor },
                      ]}
                    />
                    <Text
                      allowFontScaling={false}
                      style={[styles.possessionTeamText, { color: theme.text }]}
                    >
                      {homeTeam.team.abbreviation} {homePossession}%
                    </Text>
                  </View>
                  <View style={styles.possessionTeam}>
                    <Text
                      allowFontScaling={false}
                      style={[styles.possessionTeamText, { color: theme.text }]}
                    >
                      {awayPossession}% {awayTeam.team.abbreviation}
                    </Text>
                    <View
                      style={[
                        styles.possessionColor,
                        { backgroundColor: awayColor },
                      ]}
                    />
                  </View>
                </View>
              </View>
            </View>

            {/* Shots Section */}
            <View style={styles.statsSectionInner}>
              <Text
                allowFontScaling={false}
                style={[styles.statsSectionTitle, { color: theme.text }]}
              >
                Shots
              </Text>
              {/* Prefer normalizedStats where available, fall back to getStat */}
              {(() => {
                const homeShotsOnGoal =
                  homeTeam?.normalizedStats?.shots?.onGoal != null
                    ? homeTeam.normalizedStats.shots.onGoal
                    : getStat(homeTeam, "shotsOnTarget");
                const awayShotsOnGoal =
                  awayTeam?.normalizedStats?.shots?.onGoal != null
                    ? awayTeam.normalizedStats.shots.onGoal
                    : getStat(awayTeam, "shotsOnTarget");
                const homeTotalShots =
                  homeTeam?.normalizedStats?.shots?.total != null
                    ? homeTeam.normalizedStats.shots.total
                    : getStat(homeTeam, "totalShots");
                const awayTotalShots =
                  awayTeam?.normalizedStats?.shots?.total != null
                    ? awayTeam.normalizedStats.shots.total
                    : getStat(awayTeam, "totalShots");
                return (
                  <>
                    {renderStatsRow(
                      "Shots on Goal",
                      homeShotsOnGoal,
                      awayShotsOnGoal,
                      homeColor,
                      awayColor,
                    )}
                    {renderStatsRow(
                      "Shot Attempts",
                      homeTotalShots,
                      awayTotalShots,
                      homeColor,
                      awayColor,
                    )}
                  </>
                );
              })()}
            </View>

            {/* Discipline Section */}
            <View style={styles.statsSectionInner}>
              <Text
                allowFontScaling={false}
                style={[styles.statsSectionTitle, { color: theme.text }]}
              >
                Discipline
              </Text>
              {(() => {
                const homeFouls =
                  homeTeam?.normalizedStats?.discipline?.fouls != null
                    ? homeTeam.normalizedStats.discipline.fouls
                    : getStat(homeTeam, "foulsCommitted");
                const awayFouls =
                  awayTeam?.normalizedStats?.discipline?.fouls != null
                    ? awayTeam.normalizedStats.discipline.fouls
                    : getStat(awayTeam, "foulsCommitted");
                const homeYellow =
                  homeTeam?.normalizedStats?.discipline?.yellow != null
                    ? homeTeam.normalizedStats.discipline.yellow
                    : getStat(homeTeam, "yellowCards");
                const awayYellow =
                  awayTeam?.normalizedStats?.discipline?.yellow != null
                    ? awayTeam.normalizedStats.discipline.yellow
                    : getStat(awayTeam, "yellowCards");
                const homeRed =
                  homeTeam?.normalizedStats?.discipline?.red != null
                    ? homeTeam.normalizedStats.discipline.red
                    : getStat(homeTeam, "redCards");
                const awayRed =
                  awayTeam?.normalizedStats?.discipline?.red != null
                    ? awayTeam.normalizedStats.discipline.red
                    : getStat(awayTeam, "redCards");
                return (
                  <>
                    {renderStatsRow(
                      "Fouls",
                      homeFouls,
                      awayFouls,
                      homeColor,
                      awayColor,
                    )}
                    {renderStatsRow(
                      "Yellow Cards",
                      homeYellow,
                      awayYellow,
                      homeColor,
                      awayColor,
                    )}
                    {renderStatsRow(
                      "Red Cards",
                      homeRed,
                      awayRed,
                      homeColor,
                      awayColor,
                    )}
                  </>
                );
              })()}
            </View>

            {/* Set Pieces Section */}
            <View style={styles.statsSectionInner}>
              <Text
                allowFontScaling={false}
                style={[styles.statsSectionTitle, { color: theme.text }]}
              >
                Set Pieces
              </Text>
              {(() => {
                const homeCorners =
                  homeTeam?.normalizedStats?.setPieces?.corners != null
                    ? homeTeam.normalizedStats.setPieces.corners
                    : getStat(homeTeam, "wonCorners");
                const awayCorners =
                  awayTeam?.normalizedStats?.setPieces?.corners != null
                    ? awayTeam.normalizedStats.setPieces.corners
                    : getStat(awayTeam, "wonCorners");
                const homeSaves =
                  homeTeam?.normalizedStats?.setPieces?.saves != null
                    ? homeTeam.normalizedStats.setPieces.saves
                    : getStat(homeTeam, "saves");
                const awaySaves =
                  awayTeam?.normalizedStats?.setPieces?.saves != null
                    ? awayTeam.normalizedStats.setPieces.saves
                    : getStat(awayTeam, "saves");
                return (
                  <>
                    {renderStatsRow(
                      "Corner Kicks",
                      homeCorners,
                      awayCorners,
                      homeColor,
                      awayColor,
                    )}
                    {renderStatsRow(
                      "Saves",
                      homeSaves,
                      awaySaves,
                      homeColor,
                      awayColor,
                    )}
                  </>
                );
              })()}
            </View>
          </View>

          {/* Head to Head Container */}
          <View
            style={[styles.h2hContainer, { backgroundColor: theme.surface }]}
          >
            <View style={styles.h2hHeader}>
              <Text
                allowFontScaling={false}
                style={[styles.h2hTitle, { color: colors.primary }]}
              >
                Head To Head Record
              </Text>
            </View>
            <View style={styles.h2hMatches}>
              {renderHeadToHeadMatches(
                headToHeadData,
                homeTeam,
                awayTeam,
                homeLogo,
                awayLogo,
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    );
  };

  // Helper function to render stats row with single bar (like MLB)
  const renderStatsRow = (
    label,
    homeValue,
    awayValue,
    homeColor,
    awayColor,
  ) => {
    const homeNum =
      typeof homeValue === "number" ? homeValue : parseFloat(homeValue) || 0;
    const awayNum =
      typeof awayValue === "number" ? awayValue : parseFloat(awayValue) || 0;
    const total = homeNum + awayNum;
    const homePercent = total > 0 ? (homeNum / total) * 100 : 50;
    const awayPercent = total > 0 ? (awayNum / total) * 100 : 50;

    return (
      <View key={label} style={styles.statsRow}>
        <Text
          allowFontScaling={false}
          style={[
            styles.statsValue,
            styles.statsValueAway,
            { color: theme.text },
          ]}
        >
          {homeValue}
        </Text>
        <View style={styles.statsBarContainer}>
          <View style={[styles.statsBar, { backgroundColor: theme.border }]}>
            <View
              style={[
                styles.statsBarFill,
                styles.statsBarFillAway,
                { width: `${homePercent}%`, backgroundColor: homeColor },
              ]}
            />
            <View
              style={[
                styles.statsBarFill,
                styles.statsBarFillHome,
                { width: `${awayPercent}%`, backgroundColor: awayColor },
              ]}
            />
          </View>
          <Text
            allowFontScaling={false}
            style={[styles.statsLabel, { color: theme.textSecondary }]}
          >
            {label}
          </Text>
        </View>
        <Text
          allowFontScaling={false}
          style={[
            styles.statsValue,
            styles.statsValueHome,
            { color: theme.text },
          ]}
        >
          {awayValue}
        </Text>
      </View>
    );
  };

  // Helper function to render head-to-head matches
  const renderHeadToHeadMatches = (
    h2hData,
    homeTeamData,
    awayTeamData,
    homeLogoUrl,
    awayLogoUrl,
  ) => {
    if (!h2hData || h2hData.length === 0) {
      return (
        <Text
          allowFontScaling={false}
          style={[styles.h2hNoData, { color: theme.textSecondary }]}
        >
          No recent head-to-head matches
        </Text>
      );
    }

    // Extract events from the first team data and limit to 5
    const events = h2hData[0]?.events || [];

    return events.slice(0, 5).map((event, index) => {
      if (!event) return null;

      const date = new Date(event.gameDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const isHomeTeamAtHome = event.homeTeamId === homeTeamData?.team?.id;
      const homeTeamInMatch = isHomeTeamAtHome
        ? homeTeamData?.team?.abbreviation ||
          homeTeamData?.team?.shortDisplayName ||
          "HOME"
        : awayTeamData?.team?.abbreviation ||
          awayTeamData?.team?.shortDisplayName ||
          "AWAY";
      const awayTeamInMatch = isHomeTeamAtHome
        ? awayTeamData?.team?.abbreviation ||
          awayTeamData?.team?.shortDisplayName ||
          "AWAY"
        : homeTeamData?.team?.abbreviation ||
          homeTeamData?.team?.shortDisplayName ||
          "HOME";
      const homeTeamIdInMatch = isHomeTeamAtHome
        ? homeTeamData?.team?.id
        : awayTeamData?.team?.id;
      const awayTeamIdInMatch = isHomeTeamAtHome
        ? awayTeamData?.team?.id
        : homeTeamData?.team?.id;
      const score = `${event.homeTeamScore || "0"}-${
        event.awayTeamScore || "0"
      }`;

      return (
        <TouchableOpacity
          key={index}
          style={[
            styles.h2hMatch,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
          onPress={() => {
            // Navigate to the game details for this head-to-head match
            if (event.id) {
              // Try to pass a competition hint so the details service queries the correct competition first
              const competitionHint =
                event.competitionCode ||
                event.competition?.id ||
                event.leagueId ||
                event.league?.id ||
                event.competitionName ||
                event.leagueName ||
                null;
              navigation.navigate("EuropaConferenceLeagueGameDetails", {
                gameId: event.id,
                sport: "UECL",
                competitionHint,
              });
            }
          }}
        >
          <View style={styles.h2hMatchHeader}>
            <Text
              allowFontScaling={false}
              style={[styles.h2hDate, { color: theme.textSecondary }]}
            >
              {date}
            </Text>
            <Text
              allowFontScaling={false}
              style={[styles.h2hCompetition, { color: theme.textSecondary }]}
            >
              {event.leagueName || event.leagueAbbreviation || ""}
            </Text>
          </View>
          <View style={styles.h2hMatchTeams}>
            <View style={styles.h2hTeam}>
              <TeamLogoImage
                teamId={homeTeamIdInMatch}
                style={styles.h2hTeamLogo}
                isDarkMode={isDarkMode}
              />
              <Text
                allowFontScaling={false}
                style={[styles.h2hTeamName, { color: theme.text }]}
              >
                {homeTeamInMatch}
              </Text>
            </View>
            <Text
              allowFontScaling={false}
              style={[styles.h2hScore, { color: theme.text }]}
            >
              {score}
            </Text>
            <View style={[styles.h2hTeam, styles.h2hTeamReverse]}>
              <TeamLogoImage
                teamId={awayTeamIdInMatch}
                style={styles.h2hTeamLogo}
                isDarkMode={isDarkMode}
              />
              <Text
                allowFontScaling={false}
                style={[styles.h2hTeamName, { color: theme.text }]}
              >
                {awayTeamInMatch}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    });
  };

  const renderHomeTab = () => {
    if (!gameData) return null;

    console.log("GAMEDATA KEYS:", Object.keys(gameData));

    const competition = gameData.header?.competitions?.[0];
    const homeTeam =
      gameData.homeCompetitor ||
      competition?.competitors?.find((comp) => comp.homeAway === "home") ||
      competition?.competitors?.[0];

    // Extract players and formation from fetched lineup data (like scoreboard.js)
    const extractPlayersAndSubs = (teamLineup) => {
      console.log(
        "EXTRACTING FROM LINEUP DATA:",
        teamLineup.length,
        teamLineup,
      );

      const normalized = (Array.isArray(teamLineup) ? teamLineup : []).map(
        (entry) => {
          // Use the data structure from scoreboard.js roster format
          const athlete = entry.athlete || entry;
          const starter = entry.starter === true; // Use direct starter flag
          const position = entry.position || {};
          return {
            athlete: {
              displayName:
                athlete?.displayName ||
                athlete?.fullName ||
                athlete?.name ||
                athlete?.shortName ||
                "",
              lastName:
                athlete?.lastName ||
                athlete?.displayName?.split(" ").slice(-1)[0] ||
                "",
              id:
                athlete?.id ||
                `${entry.jersey || "unknown"}-${starter ? "starter" : "sub"}`,
            },
            jersey: entry.jersey || athlete?.jersey || entry.jerseyNumber || "",
            starter: starter,
            position: {
              abbreviation: (
                position?.abbreviation ||
                position?.code ||
                position?.name ||
                ""
              ).toString(),
            },
            formationPlace: entry.formationPlace || "0",
            // CRITICAL: Preserve substitution and stats data from original entry
            subbedOutFor: entry.subbedOutFor, // For players on pitch who were substituted
            subbedInFor: entry.subbedInFor, // For substitutes who came in
            plays: entry.plays, // For substitution timing
            stats: entry.stats || [], // For player statistics popup
          };
        },
      );

      // Filter starters and subs like scoreboard.js does
      const starters = normalized.filter((x) => x.starter);
      const subs = normalized.filter((x) => !x.starter); // Simply filter non-starters as subs
      const formation = lineupData.homeFormation || "4-3-3"; // Use actual formation from API

      console.log("EXTRACTED PLAYERS:", {
        starters: starters.length,
        subs: subs.length,
        formation,
      });
      return { starters, subs, formation };
    };

    const {
      starters: homeStarters,
      subs: homeSubs,
      formation: homeFormation,
    } = extractPlayersAndSubs(lineupData.homeLineup);

    console.log("HOME TAB - homeStarters:", homeStarters.length, homeStarters);
    console.log("HOME TAB - homeFormation:", homeFormation);

    return (
      <View style={styles.tabContent}>
        <View
          style={[styles.teamTabHeader, { backgroundColor: theme.surface }]}
        >
          <TeamLogoImage
            teamId={gameData.homeCompetitor?.team?.id}
            style={styles.teamTabLogo}
            isDarkMode={isDarkMode}
          />
          <View style={styles.teamTabInfo}>
            <Text
              allowFontScaling={false}
              style={[styles.teamTabName, { color: theme.text }]}
            >
              {homeTeam?.team?.displayName || "Home Team"}
            </Text>
            <Text
              allowFontScaling={false}
              style={[
                styles.teamTabDescription,
                { color: theme.textSecondary },
              ]}
            >
              {homeTeam?.team?.location || ""} • Home
            </Text>
          </View>
        </View>
        {renderSingleTeamPitch(
          homeStarters,
          homeFormation,
          gameData.homeLogo,
          homeSubs,
          "home",
          gameData.homeCompetitor?.team?.id,
        )}
      </View>
    );
  };

  const renderAwayTab = () => {
    if (!gameData) return null;

    const competition = gameData.header?.competitions?.[0];
    const awayTeam =
      gameData.awayCompetitor ||
      competition?.competitors?.find((comp) => comp.homeAway === "away") ||
      competition?.competitors?.[1];

    const extractPlayersAndSubs = (teamLineup) => {
      console.log(
        "AWAY EXTRACTING FROM LINEUP DATA:",
        teamLineup.length,
        teamLineup,
      );

      const normalized = (Array.isArray(teamLineup) ? teamLineup : []).map(
        (entry) => {
          // Use the data structure from scoreboard.js roster format
          const athlete = entry.athlete || entry;
          const starter = entry.starter === true; // Use direct starter flag
          const position = entry.position || {};
          return {
            athlete: {
              displayName:
                athlete?.displayName ||
                athlete?.fullName ||
                athlete?.name ||
                athlete?.shortName ||
                "",
              lastName:
                athlete?.lastName ||
                athlete?.displayName?.split(" ").slice(-1)[0] ||
                "",
              id:
                athlete?.id ||
                `${entry.jersey || "unknown"}-${starter ? "starter" : "sub"}`,
              shortName: athlete?.shortName || athlete?.displayName || "",
            },
            jersey: entry.jersey || athlete?.jersey || entry.jerseyNumber || "",
            starter: starter,
            position: {
              abbreviation: (
                position?.abbreviation ||
                position?.code ||
                position?.name ||
                ""
              ).toString(),
            },
            formationPlace: entry.formationPlace || "0",
            // CRITICAL: Preserve substitution and stats data from original entry
            subbedOutFor: entry.subbedOutFor, // For players on pitch who were substituted
            subbedInFor: entry.subbedInFor, // For substitutes who came in
            plays: entry.plays, // For substitution timing
            stats: entry.stats || [], // For player statistics popup
          };
        },
      );

      // Filter starters and subs like scoreboard.js does
      const starters = normalized.filter((x) => x.starter);
      const subs = normalized.filter((x) => !x.starter); // Simply filter non-starters as subs
      const formation = lineupData.awayFormation || "4-3-3"; // Use actual formation from API

      console.log("AWAY EXTRACTED PLAYERS:", {
        starters: starters.length,
        subs: subs.length,
        formation,
      });
      return { starters, subs, formation };
    };

    const {
      starters: awayStarters,
      subs: awaySubs,
      formation: awayFormation,
    } = extractPlayersAndSubs(lineupData.awayLineup);

    console.log("AWAY TAB - awayStarters:", awayStarters.length, awayStarters);
    console.log("AWAY TAB - awayFormation:", awayFormation);

    return (
      <View style={styles.tabContent}>
        <View
          style={[styles.teamTabHeader, { backgroundColor: theme.surface }]}
        >
          <TeamLogoImage
            teamId={gameData.awayCompetitor?.team?.id}
            style={styles.teamTabLogo}
            isDarkMode={isDarkMode}
          />
          <View style={styles.teamTabInfo}>
            <Text
              allowFontScaling={false}
              style={[styles.teamTabName, { color: theme.text }]}
            >
              {awayTeam?.team?.displayName || "Away Team"}
            </Text>
            <Text
              allowFontScaling={false}
              style={[
                styles.teamTabDescription,
                { color: theme.textSecondary },
              ]}
            >
              {awayTeam?.team?.location || ""} • Away
            </Text>
          </View>
        </View>
        {renderSingleTeamPitch(
          awayStarters,
          awayFormation,
          gameData.awayLogo,
          awaySubs,
          "away",
          gameData.awayCompetitor?.team?.id,
        )}
      </View>
    );
  };

  // ----- Football pitch rendering (EXACT COPY of scoreboard.js) -----
  const getPositionStyles = (formation) => {
    switch (formation) {
      case "4-2-3-1":
        return {
          G: { bottom: 2.5, left: 50 },
          "CD-L": { bottom: 20, left: 30 },
          "CD-R": { bottom: 20, left: 70 },
          LB: { bottom: 30, left: 15 },
          RB: { bottom: 30, left: 85 },
          LM: { bottom: 45, left: 32.5 },
          "AM-L": { bottom: 65, left: 17.5 },
          AM: { bottom: 65, left: 50 },
          "AM-R": { bottom: 65, left: 82.5 },
          RM: { bottom: 45, left: 67.5 },
          F: { bottom: 85, left: 50 },
        };
      case "3-5-2":
        return {
          G: { bottom: 2.5, left: 50 },
          "CD-L": { bottom: 20, left: 25 },
          CD: { bottom: 20, left: 50 },
          "CD-R": { bottom: 20, left: 75 },
          LM: { bottom: 60, left: 15 },
          "CM-L": { bottom: 45, left: 25 },
          AM: { bottom: 45, left: 50 },
          "CM-R": { bottom: 45, left: 75 },
          RM: { bottom: 60, left: 85 },
          "CF-L": { bottom: 85, left: 40 },
          "CF-R": { bottom: 85, left: 60 },
        };
      case "3-4-1-2":
        return {
          G: { bottom: 2.5, left: 50 },
          "CD-L": { bottom: 20, left: 25 },
          CD: { bottom: 20, left: 50 },
          "CD-R": { bottom: 20, left: 75 },
          LM: { bottom: 42.5, left: 15 },
          "CM-L": { bottom: 42.5, left: 37.5 },
          AM: { bottom: 62.5, left: 50 },
          "CM-R": { bottom: 42.5, left: 62.5 },
          RM: { bottom: 42.5, left: 85 },
          "CF-L": { bottom: 85, left: 40 },
          "CF-R": { bottom: 85, left: 60 },
        };
      case "3-4-2-1":
        return {
          G: { bottom: 2.5, left: 50 },
          "CD-L": { bottom: 20, left: 25 },
          CD: { bottom: 20, left: 50 },
          "CD-R": { bottom: 20, left: 75 },
          LM: { bottom: 42.5, left: 15 },
          "CM-L": { bottom: 42.5, left: 37.5 },
          "CM-R": { bottom: 42.5, left: 62.5 },
          RM: { bottom: 42.5, left: 85 },
          "CF-L": { bottom: 65, left: 37.5 },
          F: { bottom: 85, left: 50 },
          "CF-R": { bottom: 65, left: 62.5 },
        };
      case "4-1-4-1":
        return {
          G: { bottom: 2.5, left: 50 },
          "CD-L": { bottom: 20, left: 30 },
          "CD-R": { bottom: 20, left: 70 },
          LB: { bottom: 30, left: 15 },
          RB: { bottom: 30, left: 85 },
          LM: { bottom: 70, left: 17.5 },
          "CM-L": { bottom: 62.5, left: 35 },
          "CM-R": { bottom: 62.5, left: 65 },
          DM: { bottom: 40, left: 50 },
          RM: { bottom: 70, left: 82.5 },
          F: { bottom: 85, left: 50 },
        };
      case "4-4-2":
        return {
          G: { bottom: 2.5, left: 50 },
          "CD-L": { bottom: 20, left: 30 },
          "CD-R": { bottom: 20, left: 70 },
          LB: { bottom: 30, left: 10 },
          RB: { bottom: 30, left: 90 },
          LM: { bottom: 55, left: 10 },
          "CM-L": { bottom: 45, left: 30 },
          "CM-R": { bottom: 45, left: 70 },
          RM: { bottom: 55, left: 90 },
          "CF-L": { bottom: 85, left: 40 },
          "CF-R": { bottom: 85, left: 60 },
        };
      case "3-4-3":
        return {
          G: { bottom: 2.5, left: 50 },
          "CD-L": { bottom: 20, left: 30 },
          CD: { bottom: 20, left: 50 },
          "CD-R": { bottom: 20, left: 70 },
          LM: { bottom: 55, left: 10 },
          "CM-L": { bottom: 45, left: 30 },
          "CM-R": { bottom: 45, left: 70 },
          RM: { bottom: 55, left: 90 },
          "CF-L": { bottom: 80, left: 22.5 },
          F: { bottom: 85, left: 50 },
          "CF-R": { bottom: 80, left: 77.5 },
        };
      case "4-1-2-1-2":
        return {
          G: { bottom: 2.5, left: 50 },
          "CD-L": { bottom: 20, left: 30 },
          "CD-R": { bottom: 20, left: 70 },
          LB: { bottom: 30, left: 10 },
          RB: { bottom: 30, left: 90 },
          LM: { bottom: 52.5, left: 17.5 },
          AM: { bottom: 62.5, left: 50 },
          DM: { bottom: 40, left: 50 },
          RM: { bottom: 52.5, left: 82.5 },
          "CF-L": { bottom: 85, left: 40 },
          "CF-R": { bottom: 85, left: 60 },
        };
      case "4-4-1-1":
        return {
          G: { bottom: 2.5, left: 50 },
          "CD-L": { bottom: 20, left: 30 },
          "CD-R": { bottom: 20, left: 70 },
          LB: { bottom: 30, left: 10 },
          RB: { bottom: 30, left: 90 },
          LM: { bottom: 52.5, left: 10 },
          "CM-L": { bottom: 42.5, left: 35 },
          "CM-R": { bottom: 42.5, left: 65 },
          RM: { bottom: 52.5, left: 90 },
          RCF: { bottom: 65, left: 50 },
          F: { bottom: 85, left: 50 },
        };
      case "4-3-1-2":
        return {
          G: { bottom: 2.5, left: 50 },
          "CD-L": { bottom: 20, left: 30 },
          "CD-R": { bottom: 20, left: 70 },
          LB: { bottom: 30, left: 10 },
          RB: { bottom: 30, left: 90 },
          LM: { bottom: 50, left: 22.5 },
          CM: { bottom: 40, left: 50 },
          RM: { bottom: 50, left: 77.5 },
          AM: { bottom: 62.5, left: 50 },
          M: { bottom: 85, left: 40 },
          "CF-R": { bottom: 85, left: 60 },
        };
      case "3-1-4-2":
        return {
          G: { bottom: 2.5, left: 50 },
          "CD-L": { bottom: 20, left: 30 },
          CD: { bottom: 20, left: 50 },
          "CD-R": { bottom: 20, left: 70 },
          SW: { bottom: 40, left: 50 },
          LM: { bottom: 60, left: 15 },
          "CM-L": { bottom: 60, left: 40 },
          "CM-R": { bottom: 60, left: 60 },
          RM: { bottom: 60, left: 85 },
          "CF-L": { bottom: 85, left: 40 },
          "CF-R": { bottom: 85, left: 60 },
        };
      case "5-3-2":
        return {
          G: { bottom: 2.5, left: 50 },
          LB: { bottom: 30, left: 10 },
          "CD-L": { bottom: 20, left: 25 },
          CD: { bottom: 20, left: 50 },
          "CD-R": { bottom: 20, left: 75 },
          RB: { bottom: 30, left: 90 },
          "CM-L": { bottom: 55, left: 30 },
          CM: { bottom: 55, left: 50 },
          "CM-R": { bottom: 55, left: 70 },
          "CF-L": { bottom: 85, left: 40 },
          "CF-R": { bottom: 85, left: 60 },
        };
      case "5-4-1":
        return {
          G: { bottom: 2.5, left: 50 },
          LB: { bottom: 30, left: 5 },
          "CD-L": { bottom: 20, left: 25 },
          CD: { bottom: 20, left: 50 },
          "CD-R": { bottom: 20, left: 75 },
          RB: { bottom: 30, left: 95 },
          LM: { bottom: 55, left: 15 },
          "CM-L": { bottom: 55, left: 37.5 },
          "CM-R": { bottom: 55, left: 62.5 },
          RM: { bottom: 55, left: 85 },
          F: { bottom: 85, left: 50 },
        };
      default:
        return {
          G: { bottom: 2.5, left: 50 },
          "CD-L": { bottom: 20, left: 30 },
          "CD-R": { bottom: 20, left: 70 },
          LB: { bottom: 30, left: 10 },
          RB: { bottom: 30, left: 90 },
          LM: { bottom: 50, left: 22.5 },
          CM: { bottom: 55, left: 50 },
          RM: { bottom: 50, left: 77.5 },
          LF: { bottom: 80, left: 17.5 },
          F: { bottom: 85, left: 50 },
          RF: { bottom: 80, left: 82.5 },
        };
    }
  };

  const renderPlayer = (player, positionStyle, teamLogo, teamType, teamId) => {
    const name =
      player.athlete && (player.athlete.lastName || player.athlete.displayName)
        ? player.athlete.lastName || player.athlete.displayName
        : "Unknown Player";
    const jersey = player.jersey || "N/A";

    // Check if player was substituted out (exactly like scoreboard.js)
    const wasSubbedOut = player.subbedOutFor?.athlete;

    // Process player stats like scoreboard.js
    const stats =
      player.stats && Array.isArray(player.stats)
        ? player.stats.reduce((acc, stat) => {
            acc[stat.abbreviation] = stat.displayValue;
            return acc;
          }, {})
        : {};

    const yellowCard = stats["YC"] === "1";
    const redCard = stats["RC"] === "1";

    const handlePlayerPress = async () => {
      setSelectedPlayer({
        ...player,
        stats,
        teamLogo,
        teamId,
        teamType, // Add team type for color determination
        yellowCard,
        redCard,
      });
      setPlayerPopupVisible(true);

      // Fetch player game stats - use athlete.id instead of player.id
      const athleteId = player.athlete?.id || player.id;
      console.log(
        "Fetching stats for athlete ID:",
        athleteId,
        "team ID:",
        teamId,
      );
      if (athleteId && teamId) {
        await fetchPlayerGameStats(athleteId, teamId);
      }
    };

    return (
      <TouchableOpacity
        key={`player-${jersey}-${name}`}
        style={[styles.playerContainer, positionStyle]}
        onPress={handlePlayerPress}
        onLongPress={() => {
          // Long press: open share card directly (no player stats popup)
          setSelectedPlayer({
            ...player,
            stats,
            teamLogo,
            teamId,
            teamType,
            yellowCard,
            redCard,
          });
          const athleteId = player.athlete?.id || player.id;
          if (athleteId && teamId) {
            fetchPlayerGameStats(athleteId, teamId).then(() => {
              setPlayerShareVisible(true);
            });
          } else {
            setTimeout(() => setPlayerShareVisible(true), 300);
          }
        }}
            delayLongPress={250}
        activeOpacity={0.7}
      >
        <View style={styles.playerCircle}>
          <Text allowFontScaling={false} style={styles.playerNumber}>
            {jersey}
          </Text>
        </View>
        <Text
          allowFontScaling={false}
          style={styles.playerName}
          numberOfLines={1}
        >
          {wasSubbedOut && (
            <Text allowFontScaling={false} style={styles.subArrow}>
              ←{" "}
            </Text>
          )}
          {name}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderTeamPlayers = (
    players,
    positionStyles,
    teamLogo,
    teamType,
    teamId,
  ) => {
    console.log("renderTeamPlayers called with:", players.length, "players");
    const starters = players.filter((player) => player.starter);
    console.log("Filtered starters:", starters.length, starters);

    return starters.map((player) => {
      const positionAbbr =
        player.position && player.position.abbreviation
          ? player.position.abbreviation
          : "";
      console.log(
        "Player position:",
        positionAbbr,
        "for player:",
        player.athlete?.displayName,
      );
      const style = positionStyles[positionAbbr] || {};
      console.log("Position style for", positionAbbr, ":", style);
      const positionStyle = {
        position: "absolute",
        top: `${100 - (style.bottom || 50) - 7.25}%`, // Shift up by 7.25% for better positioning
        left: `${style.left - 3.5 || 50}%`,
        transform: [{ translateX: "-50%" }, { translateY: "-50%" }], // Center both X and Y like CSS
        alignItems: "center",
      };
      return renderPlayer(player, positionStyle, teamLogo, teamType, teamId);
    });
  };

  const renderSubstitutes = (subs, teamLogo, teamType) => {
    return (
      <View
        style={[
          styles.subsBox,
          { backgroundColor: theme.surface, borderColor: colors.primary },
        ]}
      >
        <View style={styles.subsHeader}>
          <TeamLogoImage
            teamId={
              teamType === "home"
                ? gameData?.homeCompetitor?.team?.id
                : gameData?.awayCompetitor?.team?.id
            }
            style={styles.subsTeamLogo}
            isDarkMode={isDarkMode}
          />
          <Text
            allowFontScaling={false}
            style={[styles.subsTitle, { color: theme.text }]}
          >
            Subs
          </Text>
        </View>
        <View style={styles.subsList}>
          {subs.slice(0, 30).map((sub, index) => {
            const name =
              sub.athlete?.displayName || sub.athlete?.lastName || "Unknown";
            const jersey = sub.jersey || "N/A";

            // Check if this sub came in for someone (like scoreboard.js)
            const subbedInFor = sub.subbedInFor?.athlete;
            const subTime = sub.plays?.[0]?.clock?.displayValue || "";
            const subOutPlayer = subbedInFor
              ? `Out: #${sub.subbedInFor.jersey || ""}, ${
                  subbedInFor.displayName || "Unknown"
                }`
              : "";

            // Process player stats like scoreboard.js
            const stats =
              sub.stats && Array.isArray(sub.stats)
                ? sub.stats.reduce((acc, stat) => {
                    acc[stat.abbreviation] = stat.displayValue;
                    return acc;
                  }, {})
                : {};

            const yellowCard = stats["YC"] === "1";
            const redCard = stats["RC"] === "1";

            const handleSubPress = async () => {
              const subTeamId =
                teamType === "home"
                  ? gameData?.homeCompetitor?.team?.id
                  : gameData?.awayCompetitor?.team?.id;
              setSelectedPlayer({
                ...sub,
                stats,
                teamLogo,
                teamId: subTeamId,
                teamType, // Add team type for color determination
                yellowCard,
                redCard,
              });
              setPlayerPopupVisible(true);

              // Fetch player game stats - use athlete.id instead of sub.id
              const athleteId = sub.athlete?.id || sub.id;
              console.log(
                "Fetching stats for sub athlete ID:",
                athleteId,
                "team ID:",
                subTeamId,
              );
              if (athleteId && subTeamId) {
                await fetchPlayerGameStats(athleteId, subTeamId);
              }
            };

            return (
              <TouchableOpacity
                key={`sub-${index}`}
                style={styles.subsListItemContainer}
                onPress={handleSubPress}
                onLongPress={() => {
                  const subTeamId =
                    teamType === "home"
                      ? gameData?.homeCompetitor?.team?.id
                      : gameData?.awayCompetitor?.team?.id;
                  setSelectedPlayer({
                    ...sub,
                    stats,
                    teamLogo,
                    teamId: subTeamId,
                    teamType,
                    yellowCard,
                    redCard,
                  });
                  const athleteId = sub.athlete?.id || sub.id;
                  if (athleteId && subTeamId) {
                    fetchPlayerGameStats(athleteId, subTeamId).then(() => {
                      setPlayerShareVisible(true);
                    });
                  } else {
                    setTimeout(() => setPlayerShareVisible(true), 300);
                  }
                }}
            delayLongPress={250}
                activeOpacity={0.7}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.subsListItem, { color: theme.textSecondary }]}
                >
                  <Text allowFontScaling={false} style={styles.jerseyNumber}>
                    {jersey}
                  </Text>{" "}
                  {name}
                  {subbedInFor && (
                    <Text allowFontScaling={false} style={styles.subArrowIn}>
                      {" "}
                      →
                    </Text>
                  )}
                </Text>
                {subbedInFor && (
                  <Text
                    allowFontScaling={false}
                    style={[styles.subDetails, { color: theme.textSecondary }]}
                  >
                    {subTime && (
                      <Text allowFontScaling={false} style={styles.subTime}>
                        {subTime}{" "}
                      </Text>
                    )}
                    <Text allowFontScaling={false} style={styles.subOut}>
                      {subOutPlayer}
                    </Text>
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderFootballPitches = (
    homePlayers = [],
    awayPlayers = [],
    homeFormation = "",
    awayFormation = "",
    homeLogo = "",
    awayLogo = "",
    homeSubs = [],
    awaySubs = [],
    homeTeamId = null,
    awayTeamId = null,
  ) => {
    const homePositionStyles = getPositionStyles(homeFormation);
    const awayPositionStyles = getPositionStyles(awayFormation);

    return (
      <View style={styles.pitchesWrapper}>
        <View style={styles.pitchContainer}>
          <View style={styles.teamInfo}>
            <TeamLogoImage
              teamId={gameData?.awayCompetitor?.team?.id}
              style={styles.formTeamLogo}
              isDarkMode={isDarkMode}
            />
            <Text
              allowFontScaling={false}
              style={[styles.teamFormation, { color: theme.text }]}
            >
              {awayFormation}
            </Text>
          </View>
          <View style={styles.footballPitch}>
            <View style={styles.centerCircle} />
            <View style={styles.penaltyBox} />
            <View style={styles.goalBox} />
            <View style={styles.penaltyBoxCircle} />
            {renderTeamPlayers(
              awayPlayers,
              awayPositionStyles,
              awayLogo,
              "away",
              awayTeamId,
            )}
          </View>
          {renderSubstitutes(awaySubs, awayLogo, "away")}
        </View>

        <View style={styles.pitchContainer}>
          <View style={styles.teamInfo}>
            <Text
              allowFontScaling={false}
              style={[styles.teamFormation, { color: theme.text }]}
            >
              {homeFormation}
            </Text>
            <TeamLogoImage
              teamId={gameData?.homeCompetitor?.team?.id}
              style={styles.formTeamLogo}
              isDarkMode={isDarkMode}
            />
          </View>
          <View style={styles.footballPitch}>
            <View style={styles.centerCircle} />
            <View style={styles.penaltyBox} />
            <View style={styles.goalBox} />
            <View style={styles.penaltyBoxCircle} />
            {renderTeamPlayers(
              homePlayers,
              homePositionStyles,
              homeLogo,
              "home",
              homeTeamId,
            )}
          </View>
          {renderSubstitutes(homeSubs, homeLogo, "home")}
        </View>
      </View>
    );
  };

  const renderSingleTeamPitch = (
    players,
    formation,
    teamLogo,
    subs,
    teamType,
    teamId,
  ) => {
    const positionStyles = getPositionStyles(formation);

    return (
      <View style={styles.pitchContainer}>
        <View style={styles.teamInfo}>
          <TeamLogoImage
            teamId={
              teamType === "home"
                ? gameData?.homeCompetitor?.team?.id
                : gameData?.awayCompetitor?.team?.id
            }
            style={styles.formTeamLogo}
            isDarkMode={isDarkMode}
          />
          <Text
            allowFontScaling={false}
            style={[styles.teamFormation, { color: theme.text }]}
          >
            {formation}
          </Text>
        </View>
        <View style={styles.footballPitch}>
          <View style={styles.centerCircle} />
          <View style={styles.penaltyBox} />
          <View style={styles.goalBox} />
          <View style={styles.penaltyBoxCircle} />
          {renderTeamPlayers(
            players,
            positionStyles,
            teamLogo,
            teamType,
            teamId,
          )}
        </View>
        {renderSubstitutes(subs, teamLogo, teamType)}
      </View>
    );
  };

  // Fetch lineup data from summary rosters (already loaded via processGameData)
  const fetchLineupData = async (sourceData = null) => {
    if (!gameId)
      return {
        homeLineup: [],
        awayLineup: [],
        homeFormation: "4-3-3",
        awayFormation: "4-3-3",
      };

    try {
      // Use the rosters already extracted from the summary in processGameData
      const homeRosterData =
        sourceData?.homeRosterData || gameData?.homeRosterData;
      const awayRosterData =
        sourceData?.awayRosterData || gameData?.awayRosterData;

      const homeLineup = homeRosterData?.roster || [];
      const awayLineup = awayRosterData?.roster || [];
      const homeFormation = homeRosterData?.formation || "4-3-3";
      const awayFormation = awayRosterData?.formation || "4-3-3";

      console.log("[UECLGameDetails] Extracted lineups from summary:", {
        homeLineup: homeLineup.length,
        awayLineup: awayLineup.length,
        homeFormation,
        awayFormation,
      });

      return { homeLineup, awayLineup, homeFormation, awayFormation };
    } catch (error) {
      console.error("[UECLGameDetails] fetchLineupData error:", error);
      return {
        homeLineup: [],
        awayLineup: [],
        homeFormation: "4-3-3",
        awayFormation: "4-3-3",
      };
    }
  };

  const fetchMatchStats = async () => {
    try {
      if (!gameData) return null;

      const homeBoxscore = gameData.homeBoxscore;
      const awayBoxscore = gameData.awayBoxscore;
      const headToHeadData = gameData.headToHeadGamesData || [];

      // Convert boxscore statistics array into a format compatible with the UI.
      // Boxscore stat entries: { name, displayValue (string), label }
      const mapBoxscoreToTeamStats = (boxscore) => {
        if (!boxscore) return null;
        const rawStats = boxscore.statistics || [];

        // Find value by label (case-insensitive), parsing displayValue to number
        const findStatByLabel = (label) => {
          const s = rawStats.find(
            (x) => (x.label || "").toLowerCase() === label.toLowerCase(),
          );
          if (s && s.displayValue !== undefined) {
            const v = parseFloat(String(s.displayValue).replace("%", ""));
            return Number.isFinite(v) ? v : 0;
          }
          return 0;
        };

        const statsArray = rawStats.map((s) => ({
          name: s.name,
          displayValue: s.displayValue ?? "",
          value:
            parseFloat(String(s.displayValue ?? "0").replace("%", "")) || 0,
        }));

        const normalizedStats = {
          possession: { num: findStatByLabel("possession") },
          shots: {
            onGoal: findStatByLabel("on goal"),
            total: findStatByLabel("shots"),
          },
          discipline: {
            fouls: findStatByLabel("fouls"),
            yellow: findStatByLabel("yellow cards"),
            red: findStatByLabel("red cards"),
          },
          setPieces: {
            corners: findStatByLabel("corner kicks"),
            saves: findStatByLabel("saves"),
          },
        };

        return {
          team: boxscore.team,
          statistics: statsArray,
          normalizedStats,
          homeAway: boxscore.homeAway,
        };
      };

      const homeTeam = mapBoxscoreToTeamStats(homeBoxscore);
      const awayTeam = mapBoxscoreToTeamStats(awayBoxscore);

      return { homeTeam, awayTeam, headToHeadData };
    } catch (error) {
      console.error("[UECLGameDetails] fetchMatchStats error:", error);
      return null;
    }
  };

  const renderPlaysTab = () => {
    if (!gameData) {
      return (
        <View style={styles.tabContent}>
          <Text
            allowFontScaling={false}
            style={[styles.comingSoonText, { color: theme.textSecondary }]}
          >
            Loading plays...
          </Text>
        </View>
      );
    }
    return <View style={styles.tabContent}>{renderPlayByPlay()}</View>;
  };

  // ── Process plays from gameData.commentaryPlays (no separate fetch) ───
  // Includes score tracking: start at 0-0, update whenever a goal is scored
  const processedPlays = useMemo(() => {
    if (!gameData?.commentaryPlays?.length) return null;

    const homeId = String(gameData.homeCompetitor?.team?.id || "");
    const awayId = String(gameData.awayCompetitor?.team?.id || "");

    // Get team colors
    const homeColor =
      EuropaConferenceLeagueServiceEnhanced.getTeamColorWithAlternateLogic(
        gameData.homeCompetitor?.team,
      ) || "007bff";
    const awayColor =
      EuropaConferenceLeagueServiceEnhanced.getTeamColorWithAlternateLogic(
        gameData.awayCompetitor?.team,
      ) || "28a745";

    let homeScore = 0;
    let awayScore = 0;

    const plays = gameData.commentaryPlays
      .map((entry) => {
        const play = entry.play;
        if (!play) return null;

        // Determine team side from play.team
        let teamSide = null;
        if (play.team) {
          const playTeamId = String(play.team.id || "");
          if (playTeamId === homeId) teamSide = "home";
          else if (playTeamId === awayId) teamSide = "away";

          // Fallback: match by displayName when id is not available
          if (!teamSide && play.team.displayName) {
            const playTeamName = play.team.displayName.toLowerCase();
            const homeName = (
              gameData.homeCompetitor?.team?.displayName || ""
            ).toLowerCase();
            const awayName = (
              gameData.awayCompetitor?.team?.displayName || ""
            ).toLowerCase();
            if (playTeamName === homeName) teamSide = "home";
            else if (playTeamName === awayName) teamSide = "away";
          }
        }

        const teamColor =
          teamSide === "home"
            ? homeColor
            : teamSide === "away"
              ? awayColor
              : null;

        // Detect goal plays: scoringPlay flag OR type.type includes "goal" OR type.id === "70"/"71"
        // Use includes() to catch "goal", "ownGoal", "penaltyGoal", etc.
        const isGoalPlay =
          play.scoringPlay ||
          play.type?.type?.toLowerCase?.().includes("goal") ||
          play.type?.name?.toLowerCase?.().includes("goal") ||
          play.type?.id === "70" ||
          play.type?.id === "71" ||
          play.type?.id === "97" ||
          play.type?.id === "98";

        // Track scores from goal text
        // ESPN format: "Goal! HomeTeam X, AwayTeam Y. ..." — home team is ALWAYS listed first
        const text = play.text || "";
        const goalMatch = text.match(/([A-Za-z\s]+)\s+(\d+),\s*([A-Za-z\s]+)\s+(\d+)/);
        if (isGoalPlay && goalMatch) {
          const score1 = parseInt(goalMatch[2], 10);
          const score2 = parseInt(goalMatch[4], 10);
          if (!isNaN(score1) && !isNaN(score2)) {
            // ESPN always puts home team score first in the text
            homeScore = score1;
            awayScore = score2;
            console.log(
              `[ProcessedPlays] Sequence: ${entry.sequence}. Score: ${
                gameData.homeCompetitor?.team?.displayName || "Home"
              } - ${homeScore}, ${
                gameData.awayCompetitor?.team?.displayName || "Away"
              } - ${awayScore}. Identifier: ${text}`,
            );
          }
        }

        return {
          ...play,
          _commentaryTime: entry.time,
          _commentaryText: entry.text,
          _sequence: entry.sequence,
          _teamSide: teamSide,
          _teamColor: teamColor,
          _homeScore: homeScore,
          _awayScore: awayScore,
          _isGoalPlay: isGoalPlay,
        };
      })
      .filter(Boolean)
      .reverse(); // Most recent first

    console.log(
      `[ProcessedPlays] Total plays processed: ${plays.length}. ` +
        `Home score: ${homeScore}, Away score: ${awayScore}`,
    );
    return plays;
  }, [gameData]);

  // Keep processedPlaysRef in sync with the memoized value
  useEffect(() => {
    processedPlaysRef.current = processedPlays;
    console.log("[ProcessedPlaysRef] Updated ref:", {
      hasPlays: !!processedPlays,
      length: processedPlays?.length,
    });
  }, [processedPlays]);

  // Fetch stats data when stats tab becomes active
  useEffect(() => {
    const loadStats = async () => {
      if (activeTab === "stats" && gameId && !statsData && !loadingMatchStats) {
        setLoadingMatchStats(true);
        const stats = await fetchMatchStats();
        setStatsData(stats);
        setLoadingMatchStats(false);
      }
    };

    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, gameId, statsData, gameData]);

  // Add scroll listeners to detect user scroll start/stop inside the plays ScrollView
  useEffect(() => {
    const onScroll = (event) => {
      if (!event) return;
      // Mark that user is scrolling; debounce to detect end
      isUserScrollingRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isUserScrollingRef.current = false;
        console.log(
          "[UECLGameDetails] user stopped scrolling - updates will resume",
        );
      }, 600);
    };

    // Attach to scrollViewRef if available
    const sv = scrollViewRef.current;
    if (sv && sv.props) {
      // We can't directly add DOM listeners in RN; the ScrollView's onScroll already calls handleScroll
      // so we rely on handleScroll writing to scrollYRef and use the timeout logic above.
    }

    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  // Main play-by-play rendering function adapted from scoreboard.js
  const renderPlayByPlay = () => {
    if (!gameData) return null;

    const playsArray = processedPlays;

    if (!playsArray || playsArray.length === 0) {
      return (
        <View style={styles.tabContent}>
          <Text
            allowFontScaling={false}
            style={[styles.comingSoonText, { color: theme.textSecondary }]}
          >
            Play-by-play data is currently unavailable
          </Text>
        </View>
      );
    }

    const competition = gameData.header?.competitions?.[0];
    const homeTeam =
      gameData.homeCompetitor ||
      competition?.competitors?.find((comp) => comp.homeAway === "home");
    const awayTeam =
      gameData.awayCompetitor ||
      competition?.competitors?.find((comp) => comp.homeAway === "away");

    const homeLogo = gameData.homeLogo || "https://via.placeholder.com/40";
    const awayLogo = gameData.awayLogo || "https://via.placeholder.com/40";

    // Filter out plays with noise phrases
    const filteredPlays = playsArray.filter((play) => {
      const text = play.text || play.shortText || "";
      return [
        "Out at",
        "Pass at",
        "touch at",
        "Clear at",
        "Take On",
        "Attempted Tackle",
      ].every((phrase) => !text.includes(phrase));
    });

    // Only render the visible plays for performance
    const visiblePlays = filteredPlays.slice(0, visiblePlaysCount);

    const renderedPlays = visiblePlays.map((play, index) => {
      const playKey = `${computePlayKey(play)}-${index}`;
      const isOpen = openPlays.has(playKey);
      // Use pre-computed goal flag from processedPlays (checks type.type === "goal" / type.id "70"/"71" / scoringPlay)
      const isScoring = play._isGoalPlay || false;

      // Use tracked scores from processedPlays
      const currentHomeScore = play._homeScore ?? 0;
      const currentAwayScore = play._awayScore ?? 0;

      const period = play.period ? play.period.number || 1 : 1;
      const clock = play.clock
        ? play.clock.displayValue
        : play._commentaryTime?.displayValue || "";
      const text =
        play.text ||
        play.shortText ||
        play.type?.text ||
        "No description available";

      // Use pre-computed team side and color from processedPlays
      let teamSide = play._teamSide || "home";
      let teamColor =
        play._teamColor ||
        (teamSide === "home"
          ? EuropaConferenceLeagueServiceEnhanced.getTeamColorWithAlternateLogic(
              homeTeam?.team || homeTeam,
            ) || "#007bff"
          : EuropaConferenceLeagueServiceEnhanced.getTeamColorWithAlternateLogic(
              awayTeam?.team || awayTeam,
            ) || "#28a745");

      // If teamSide was not resolved by ID, try displayName fallback here too
      if (!play._teamSide && play.team?.displayName) {
        const playTeamName = play.team.displayName.toLowerCase();
        const hName = (homeTeam?.team?.displayName || "").toLowerCase();
        const aName = (awayTeam?.team?.displayName || "").toLowerCase();
        if (playTeamName === hName) {
          teamSide = "home";
          teamColor =
            EuropaConferenceLeagueServiceEnhanced.getTeamColorWithAlternateLogic(
              homeTeam?.team || homeTeam,
            ) || "#007bff";
        } else if (playTeamName === aName) {
          teamSide = "away";
          teamColor =
            EuropaConferenceLeagueServiceEnhanced.getTeamColorWithAlternateLogic(
              awayTeam?.team || awayTeam,
            ) || "#28a745";
        }
      }

      // Determine event type (isScoring is now resolved from _isGoalPlay)
      let eventType = "gen";
      if (isScoring) {
        eventType = "goal";
      } else if (text.toLowerCase().includes("yellow card")) {
        eventType = "card";
      } else if (text.toLowerCase().includes("red card")) {
        eventType = "red-card";
      } else if (text.toLowerCase().includes("substitution")) {
        eventType = "substitution";
      } else if (
        text.toLowerCase().includes("attempt") ||
        text.toLowerCase().includes("saved") ||
        text.toLowerCase().includes("blocked") ||
        text.toLowerCase().includes("post") ||
        text.toLowerCase().includes("miss")
      ) {
        eventType = "shot";
      } else if (text.toLowerCase().includes("offside")) {
        eventType = "offside";
      }

      // Extract coordinates for mini field
      const coordinate =
        play.fieldPositionX !== undefined && play.fieldPositionY !== undefined
          ? { x: play.fieldPositionX, y: play.fieldPositionY }
          : null;

      const coordinate2 =
        play.fieldPosition2X !== undefined && play.fieldPosition2Y !== undefined
          ? { x: play.fieldPosition2X, y: play.fieldPosition2Y }
          : null;

      // Determine final background and text colors for scoring plays
      const finalTeamColor =
        teamColor && typeof teamColor === "string"
          ? teamColor.startsWith("#")
            ? teamColor
            : `#${teamColor}`
          : colors?.primary || "#007bff";
      const scoringTextColor = getContrastColor(finalTeamColor);

      // Border left style: show when we have a resolved team side
      const resolvedTeamId =
        teamSide === "home"
          ? homeTeam?.team?.id
          : teamSide === "away"
            ? awayTeam?.team?.id
            : null;
      const borderLeftStyle = resolvedTeamId
        ? { borderLeftWidth: 6, borderLeftColor: finalTeamColor }
        : { borderLeftWidth: 0 };

      // Handler for long press on scoring plays
      const handleGoalLongPress = () => {
        if (isScoring) {
          // Pass play along with team context data for the modal
          const playWithContext = {
            ...play,
            _contextTeams: {
              homeTeam: homeTeam,
              awayTeam: awayTeam,
              teamColor: teamColor,
              playTeamId: resolvedTeamId,
            },
          };
          setShareCardPlay(playWithContext);
        }
      };

      return (
        <View
          key={playKey}
          style={[
            styles.playContainer,
            { backgroundColor: isScoring ? finalTeamColor : theme.surface },
            borderLeftStyle,
          ]}
        >
          <TouchableOpacity
            style={styles.playHeader}
            onPress={() => togglePlay(playKey)}
            onLongPress={handleGoalLongPress}
            delayLongPress={250}
          >
            <View style={styles.playMainInfo}>
              <View style={styles.playTeamsScore}>
                <View style={styles.teamScoreDisplay}>
                  <TeamLogoImage
                    teamId={homeTeam?.team?.id}
                    isDarkMode={
                      isScoring
                        ? scoringTextColor === "#000"
                          ? false
                          : true
                        : isDarkMode
                    }
                    style={styles.teamLogoSmall}
                    isScoring={isScoring}
                    scoringTextColor={scoringTextColor}
                  />
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.scoreSmall,
                      { color: isScoring ? scoringTextColor : theme.text },
                    ]}
                  >
                    {currentHomeScore}
                  </Text>
                </View>
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.scoreSeparator,
                    { color: isScoring ? scoringTextColor : theme.text },
                  ]}
                >
                  -
                </Text>
                <View style={styles.teamScoreDisplay}>
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.scoreSmall,
                      { color: isScoring ? scoringTextColor : theme.text },
                    ]}
                  >
                    {currentAwayScore}
                  </Text>
                  <TeamLogoImage
                    teamId={awayTeam?.team?.id}
                    isDarkMode={
                      isScoring
                        ? scoringTextColor === "#000"
                          ? false
                          : true
                        : isDarkMode
                    }
                    style={styles.teamLogoSmall}
                    isScoring={isScoring}
                    scoringTextColor={scoringTextColor}
                  />
                </View>
              </View>

              <View style={styles.playSummary}>
                <View style={styles.playTimePeriod}>
                  {period && (
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.playPeriod,
                        {
                          color: isScoring
                            ? scoringTextColor
                            : theme.textSecondary,
                        },
                      ]}
                    >
                      {period === 1 ? "1st Half" : "2nd Half"}
                    </Text>
                  )}
                  {clock && (
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.playClock,
                        {
                          color: isScoring
                            ? scoringTextColor
                            : theme.textSecondary,
                        },
                      ]}
                    >
                      {clock}
                    </Text>
                  )}
                </View>
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.playDescription,
                    { color: isScoring ? scoringTextColor : theme.text },
                  ]}
                  numberOfLines={2}
                >
                  {text}
                </Text>
                {isScoring && (
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.scoreIndicator,
                      {
                        color: scoringTextColor,
                        backgroundColor: "rgba(255,255,255,0.2)",
                        borderRadius: 4,
                        paddingHorizontal: 6,
                      },
                    ]}
                  >
                    GOAL
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.playToggle}>
              <Text
                allowFontScaling={false}
                style={[
                  styles.toggleIcon,
                  { color: isScoring ? scoringTextColor : theme.text },
                ]}
              >
                {isOpen ? "▲" : "▼"}
              </Text>
            </View>
          </TouchableOpacity>

          {isOpen && (
            <View style={styles.playDetails}>
              <View style={styles.playDetailsContent}>
                {/* Row layout: Mini field on left, event info on right */}
                <View style={styles.playDetailsRow}>
                  {coordinate && (
                    <View style={styles.miniFieldContainer}>
                      {renderMiniField(
                        coordinate,
                        coordinate2,
                        eventType,
                        teamSide,
                        teamColor,
                      )}
                    </View>
                  )}

                  <View
                    style={[
                      styles.playEventInfo,
                      {
                        backgroundColor: isScoring
                          ? "rgba(255,255,255,0.2)"
                          : theme.background,
                        flex: 1,
                      },
                    ]}
                  >
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.playDescription,
                        { color: isScoring ? scoringTextColor : theme.text },
                      ]}
                    >
                      {text}
                    </Text>
                    {clock && (
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.playClock,
                          { color: isScoring ? scoringTextColor : theme.text },
                        ]}
                      >
                        {period
                          ? `${period === 1 ? "1st" : "2nd"} Half - ${clock}`
                          : clock}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>
      );
    });

    // Add load more button if there are more plays to show
    const loadMoreButton = [];
    if (visiblePlaysCount < filteredPlays.length) {
      const remaining = filteredPlays.length - visiblePlaysCount;
      loadMoreButton.push(
        <TouchableOpacity
          key="load-more-button"
          style={[
            styles.loadMoreButton,
            { backgroundColor: colors.primary, marginBottom: 80 },
          ]}
          onPress={() => {
            console.log("[LoadMorePlays] Button onPress triggered!");
            loadMorePlays();
          }}
          disabled={isLoadingMorePlays}
          activeOpacity={0.7}
        >
          {isLoadingMorePlays ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[styles.loadMoreText, { color: "#fff" }]}>
              Load More Plays ({remaining} remaining)
            </Text>
          )}
        </TouchableOpacity>,
      );
    }

    return <View>{[...renderedPlays, ...loadMoreButton]}</View>;
  };

  // Landscape Mini Field Component - Exact replica of web version
  const renderMiniField = (
    coordinate,
    coordinate2,
    eventType = "gen",
    teamSide = "home",
    teamColor = "#007bff",
  ) => {
    if (
      !coordinate ||
      coordinate.x === undefined ||
      coordinate.y === undefined
    ) {
      return (
        <View style={styles.miniField}>
          <View style={[styles.fieldContainer, { backgroundColor: "#2d5a2d" }]}>
            <View style={styles.fieldOutline} />
            <View style={styles.centerLine} />
            <View style={styles.centerCircleMini} />
            <View style={styles.penaltyAreaLeft} />
            <View style={styles.penaltyAreaRight} />
            <View style={styles.goalAreaLeft} />
            <View style={styles.goalAreaRight} />
            <View style={styles.goalLeft} />
            <View style={styles.goalRight} />
          </View>
        </View>
      );
    }

    // Exact coordinate system from web version:
    // Field split into 2 halves - right half = home, left half = away
    // X: 0 = far end, 1 = half line (center)
    // Position relative to field outline (white lines), not container
    const espnX =
      teamSide === "home" ? 1 + coordinate.x / 100 : coordinate.x / 100;
    const espnY = coordinate.y / 100;

    // Convert ESPN coordinates with exact web logic
    let leftPercent, topPercent;

    if (teamSide === "home") {
      // Home team on right half of field
      // X=0 (far right) → 96% left position (near right goal)
      // X=1 (center line) → 50% left position
      leftPercent = 55 + (1 - espnX) * 46;
      topPercent = 4 + espnY * 92; // Y=0→4%, Y=1→96% (within field outline)
      console.log(
        `[MiniField] Home team coordinates: ESPN(${espnX}, ${espnY}) → Position: ${leftPercent}%, ${topPercent}%`,
      );
    } else {
      // Away team on left half of field
      // X=0 (far left) → 4% left position (near left goal)
      // X=1 (center line) → 50% left position
      leftPercent = 40 + (4 + espnX * 46); // X=0→4%, X=1→50%
      topPercent = 4 + (1 - espnY) * 92; // Y=0→96%, Y=1→4% (inverted, within field outline)
      console.log(
        `[MiniField] Away team coordinates: ESPN(${espnX}, ${espnY}) → Position: ${leftPercent}%, ${topPercent}%`,
      );
    }

    // Constrain to field outline bounds (white lines area)
    const finalLeftPercent = Math.max(4, Math.min(96, leftPercent));
    const finalTopPercent = Math.max(4, Math.min(96, topPercent));

    // Handle second coordinate (ball end position) - always render when available
    let ballEndPosition = null;
    let secondLeftPercent = null;
    let secondTopPercent = null;

    // Don't render the second marker/trajectory if coordinate2 is missing or is exactly (0,0)
    if (
      coordinate2 &&
      coordinate2.x !== undefined &&
      coordinate2.y !== undefined &&
      !(coordinate2.x === 0 && coordinate2.y === 0)
    ) {
      const espnX2 =
        teamSide === "home" ? 1 + coordinate2.x / 100 : coordinate2.x / 100;
      const espnY2 = coordinate2.y / 100;

      let leftPercent2, topPercent2;

      if (teamSide === "home") {
        // Home team on right half
        leftPercent2 = 50 + (1 - espnX2) * 46; // X=0→96%, X=1→50%
        topPercent2 = 4 + espnY2 * 92; // Y=0→4%, Y=1→96%
      } else {
        // Away team on left half
        leftPercent2 = 40 + (4 + espnX2) * 46; // X=0→4%, X=1→50%
        topPercent2 = 4 + (1 - espnY2) * 92; // Y=0→96%, Y=1→4% (inverted)
      }

      secondLeftPercent = Math.max(4, Math.min(96, leftPercent2));
      secondTopPercent = Math.max(4, Math.min(96, topPercent2));

      ballEndPosition = (
        <View
          style={[
            styles.eventMarker,
            styles.ballEndMarker,
            {
              left: `${secondLeftPercent}%`,
              top: `${secondTopPercent}%`,
              backgroundColor: teamColor.startsWith("#")
                ? teamColor
                : `#${teamColor}`,
            },
          ]}
        />
      );
    }

    // Event class determination - exact web logic
    const eventClass =
      eventType === "goal"
        ? "goal"
        : eventType === "shot"
          ? "attempt"
          : eventType === "card"
            ? "card"
            : eventType === "red-card"
              ? "red-card"
              : eventType === "offside"
                ? "offside"
                : eventType === "substitution"
                  ? "substitution"
                  : "goal";

    // Ensure team color has # prefix
    const finalTeamColor = teamColor.startsWith("#")
      ? teamColor
      : `#${teamColor}`;

    // Determine marker style based on event type
    const getMarkerStyle = () => {
      const baseStyle = [styles.eventMarker];

      switch (eventClass) {
        case "goal":
          return [
            ...baseStyle,
            styles.goalMarker,
            { backgroundColor: finalTeamColor },
          ];
        case "attempt":
          return [
            ...baseStyle,
            styles.shotMarker,
            { backgroundColor: finalTeamColor },
          ];
        case "card":
          return [...baseStyle, styles.cardMarker];
        case "red-card":
          return [...baseStyle, styles.redCardMarker];
        case "substitution":
          return [...baseStyle, styles.substitutionMarker];
        case "offside":
          return [...baseStyle, styles.offsideMarker];
        default:
          return [...baseStyle, { backgroundColor: finalTeamColor }];
      }
    };

    // Trajectory line component using native React Native (no SVG dependency)
    const TrajectoryLine = () => {
      if (
        !ballEndPosition ||
        secondLeftPercent === null ||
        secondTopPercent === null
      ) {
        return null;
      }

      // Field pixel dimensions
      const FIELD_WIDTH = 180;
      const FIELD_HEIGHT = 120;

      // Convert start/end percents into pixel coordinates inside the field
      const x1 = (finalLeftPercent / 100) * FIELD_WIDTH;
      const y1 = (finalTopPercent / 100) * FIELD_HEIGHT;
      const x2 = (secondLeftPercent / 100) * FIELD_WIDTH;
      const y2 = (secondTopPercent / 100) * FIELD_HEIGHT;

      return (
        // Render SVG covering the whole mini field so coordinates map directly
        <Svg
          width={FIELD_WIDTH}
          height={FIELD_HEIGHT}
          style={{ position: "absolute", left: 0, top: 0, zIndex: 8 }}
          pointerEvents="none"
        >
          <Line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={finalTeamColor}
            strokeWidth={2}
            strokeOpacity={0.85}
          />
        </Svg>
      );
    };

    return (
      <View style={styles.miniField}>
        <View style={[styles.fieldContainer, { backgroundColor: "#2d5a2d" }]}>
          <View style={styles.fieldOutline} />
          <View style={styles.centerLine} />
          <View style={styles.centerCircleMini} />
          <View style={styles.penaltyAreaLeft} />
          <View style={styles.penaltyAreaRight} />
          <View style={styles.goalAreaLeft} />
          <View style={styles.goalAreaRight} />
          <View style={styles.goalLeft} />
          <View style={styles.goalRight} />

          {/* Trajectory line */}
          <TrajectoryLine />

          {/* Player position marker */}
          <View
            style={[
              ...getMarkerStyle(),
              {
                left: `${finalLeftPercent}%`,
                top: `${finalTopPercent}%`,
              },
            ]}
          />

          {/* Ball end position marker */}
          {ballEndPosition}
        </View>
      </View>
    );
  };

  const renderPlayerShotsField = (player, teamColor) => {
    if (!player || !playsData) {
      return (
        <View style={[styles.halfField, { borderColor: "#fff" }]}>
          {/* Goal area */}
          <View style={[styles.goal, { backgroundColor: "#fff" }]} />
          {/* Goal area */}
          <View style={[styles.goalArea, { borderColor: "#fff" }]} />
          {/* Penalty area */}
          <View style={[styles.penaltyArea, { borderColor: "#fff" }]} />
          {/* Center circle (half) */}
          <View style={[styles.centerCircleHalf, { borderColor: "#fff" }]} />
        </View>
      );
    }

    // Get player's shots from plays data
    const playerShots = [];
    const playerId = player.athlete?.id || player.id;

    if (playerId && Array.isArray(playsData)) {
      playsData.forEach((play) => {
        // Check if this play is a shot/goal based on type
        const isGoal =
          play.scoringPlay ||
          play.type?.type === "goal" ||
          play.type?.id === "70" ||
          play.type?.id === "71";
        const isShot =
          isGoal ||
          play.type?.text?.toLowerCase().includes("shot") ||
          play.type?.text?.toLowerCase().includes("goal") ||
          play.type?.text?.toLowerCase().includes("attempt");

        if (
          isShot &&
          play.participants &&
          play.fieldPositionX !== undefined &&
          play.fieldPositionY !== undefined &&
          play.fieldPosition2X !== undefined &&
          play.fieldPosition2Y !== undefined
        ) {
          // For goals, look for "scorer" type participant
          // For shots, look for order 1 participant (the shooter)
          let shooterParticipant = null;

          if (isGoal) {
            // For goals, find the scorer
            shooterParticipant = play.participants.find(
              (p) => p.type === "scorer",
            );
            // Fallback: if no scorer type, use first participant
            if (!shooterParticipant) {
              shooterParticipant = play.participants[0];
            }
          } else {
            // For shots, find the participant with order 1
            shooterParticipant = play.participants.find((p) => p.order === 1);
            if (!shooterParticipant) {
              shooterParticipant = play.participants[0];
            }
          }

          if (shooterParticipant && shooterParticipant.athlete?.$ref) {
            // Extract athlete ID from the $ref URL
            const athleteIdMatch =
              shooterParticipant.athlete.$ref.match(/athletes\/(\d+)/);
            const participantAthleteId = athleteIdMatch
              ? athleteIdMatch[1]
              : null;

            console.log(
              `Comparing player ID ${playerId} with participant ID ${participantAthleteId}`,
            );

            if (
              participantAthleteId &&
              (participantAthleteId === String(playerId) ||
                participantAthleteId === playerId)
            ) {
              // Skip shots with (0,0) coordinates
              if (play.fieldPositionX === 0 && play.fieldPositionY === 0) {
                console.log(`Skipping shot with (0,0) coordinates`);
                return;
              }

              playerShots.push({
                x: play.fieldPositionX,
                y: play.fieldPositionY,
                x2: play.fieldPosition2X,
                y2: play.fieldPosition2Y,
                isGoal: isGoal || false,
                text: play.text || play.shortText || "",
                clock: play.clock?.displayValue || "",
                type: play.type?.text || "",
              });
              console.log(
                `Found shot for player: ${play.type?.text} at ${play.clock?.displayValue}`,
              );
            }
          }
        }
      });
    }

    console.log(
      `Found ${playerShots.length} shots for player ${player.athlete?.displayName}`,
    );

    // Field dimensions
    const FIELD_WIDTH = 320;
    const FIELD_HEIGHT = 180;

    // Coordinate conversion - ESPN field to half-field display
    const convertCoordinates = (shot) => {
      const espnX = shot.x; // 0 to 1
      const espnY = shot.y; // 0 to 1

      // Direct mapping without margins:
      // ESPN Y (0-1) maps to field width (left-right) 0% to 100%
      // ESPN X (0-1) maps to field height 0% to 100%
      const leftPercent = espnY * 100; // 0% to 100% horizontally
      const topPercent = espnX * 100; // 0% to 100% vertically

      console.log(
        `Shot coordinates: ESPN(${espnX}, ${espnY}) → Screen(${leftPercent}%, ${topPercent}%)`,
      );

      return {
        left: leftPercent,
        top: topPercent,
      };
    };

    // Convert second coordinates if available
    const convertSecondCoordinates = (shot) => {
      if (
        shot.x2 === undefined ||
        shot.y2 === undefined ||
        (shot.x2 === 0 && shot.y2 === 0)
      )
        return null;

      const espnX2 = shot.x2;
      const espnY2 = shot.y2;

      const leftPercent2 = espnY2 * 100; // 0% to 100% horizontally
      const topPercent2 = espnX2 * 100; // 0% to 100% vertically

      console.log(
        `Shot end coordinates: ESPN(${espnX2}, ${espnY2}) → Screen(${leftPercent2}%, ${topPercent2}%)`,
      );

      return {
        left: leftPercent2,
        top: topPercent2,
      };
    };

    // Sort shots so goals appear on top
    const sortedShots = [...playerShots].sort((a, b) => (a.isGoal ? 1 : -1));

    return (
      <View style={[styles.halfField, { borderColor: theme.border }]}>
        {/* Goal area */}
        <View style={[styles.goal, { backgroundColor: "#fff" }]} />
        {/* Goal area */}
        <View style={[styles.goalArea, { borderColor: "#fff" }]} />
        {/* Penalty area */}
        <View style={[styles.penaltyArea, { borderColor: "#fff" }]} />
        {/* Center circle (half) */}
        <View style={[styles.centerCircleHalf, { borderColor: "#fff" }]} />

        {/* SVG for trajectory lines */}
        {FIELD_WIDTH && FIELD_HEIGHT && (
          <Svg
            width={FIELD_WIDTH}
            height={FIELD_HEIGHT}
            style={{ position: "absolute", left: 0, top: 0, zIndex: 0 }}
            pointerEvents="none"
          >
            {sortedShots
              .map((shot, index) => {
                const startPos = convertCoordinates(shot);
                const endPos = convertSecondCoordinates(shot);

                if (endPos) {
                  const x1 = (startPos.left / 100) * FIELD_WIDTH;
                  const y1 = (startPos.top / 100) * FIELD_HEIGHT;
                  const x2 = (endPos.left / 100) * FIELD_WIDTH;
                  const y2 = (endPos.top / 100) * FIELD_HEIGHT;

                  return (
                    <Line
                      key={`line-${index}`}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={teamColor}
                      strokeWidth={2}
                      strokeOpacity={0.7}
                    />
                  );
                }
                return null;
              })
              .filter(Boolean)}
          </Svg>
        )}

        {/* Shot markers */}
        {sortedShots.map((shot, index) => {
          const startPos = convertCoordinates(shot);
          const endPos = convertSecondCoordinates(shot);

          // Convert percentages to absolute positions
          const startLeft = (startPos.left / 100) * FIELD_WIDTH;
          const startTop = (startPos.top / 100) * FIELD_HEIGHT;
          const endLeft = endPos ? (endPos.left / 100) * FIELD_WIDTH : 0;
          const endTop = endPos ? (endPos.top / 100) * FIELD_HEIGHT : 0;

          return (
            <View key={`shot-${index}`}>
              {/* Start position marker (player position) */}
              <View
                style={[
                  styles.shotMarker,
                  {
                    left: startLeft,
                    top: startTop,
                    backgroundColor: shot.isGoal ? teamColor : "white",
                    borderColor: teamColor,
                    borderWidth: shot.isGoal ? 0 : 2,
                    zIndex: shot.isGoal ? 10 : 5,
                  },
                ]}
              />

              {/* End position marker (ball destination) */}
              {endPos && (
                <View
                  style={[
                    styles.shotMarker,
                    {
                      left: endLeft,
                      top: endTop,
                      backgroundColor: shot.isGoal ? teamColor : "white",
                      borderColor: teamColor,
                      borderWidth: shot.isGoal ? 0 : 2,
                      zIndex: shot.isGoal ? 10 : 5,
                    },
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>
    );
  };

  // ── Player Share Card helpers ───────────────────────────────────────
  const resetPlayerShare = useCallback(() => {
    setPlayerShareVisible(false);
    setSharingPlayerCard(false);
  }, []);

  useEffect(() => {
    if (!playerPopupVisible) resetPlayerShare();
  }, [playerPopupVisible, resetPlayerShare]);

  const handlePlayerShareCard = useCallback(async () => {
    if (sharingPlayerCard || !playerShareCardRef.current) return;
    try {
      setSharingPlayerCard(true);
      await new Promise((r) => setTimeout(r, 350));
      const uri = await playerShareCardRef.current.capture();
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: "Share Player Stats",
      });
    } catch (err) {
      console.error("Error sharing player card:", err);
    } finally {
      setSharingPlayerCard(false);
    }
  }, [sharingPlayerCard]);

  // Build share stats for the selected player
  const buildPlayerShareData = useCallback(() => {
    if (!selectedPlayer) return null;

    const player = selectedPlayer;
    const athlete = player.athlete || {};
    const fullName =
      athlete.displayName || athlete.fullName || athlete.lastName || "Unknown";
    const jersey = player.jersey || "";
    const teamType = player.teamType;

    // Determine team color
    const competition = gameData?.header?.competitions?.[0];
    const homeTeamData =
      gameData?.homeCompetitor ||
      competition?.competitors?.find((c) => c.homeAway === "home");
    const awayTeamData =
      gameData?.awayCompetitor ||
      competition?.competitors?.find((c) => c.homeAway === "away");

    let teamColor = "#007bff";
    if (teamType === "home") {
      teamColor =
        EuropaConferenceLeagueServiceEnhanced.getTeamColorWithAlternateLogic(
          homeTeamData?.team,
        ) || colors.primary;
    } else if (teamType === "away") {
      teamColor =
        EuropaConferenceLeagueServiceEnhanced.getTeamColorWithAlternateLogic(
          awayTeamData?.team,
        ) || colors.secondary;
    }
    teamColor = teamColor.startsWith("#") ? teamColor : `#${teamColor}`;

    const textOnBg = (() => {
      const c = teamColor.replace("#", "");
      const r = parseInt(c.substr(0, 2), 16);
      const g = parseInt(c.substr(2, 2), 16);
      const b = parseInt(c.substr(4, 2), 16);
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5
        ? "#000000"
        : "#FFFFFF";
    })();

    // Get ESPN stat abbreviations from player.stats (roster stats)
    const stats = player.stats || {};
    const s = (key) => {
      const v = stats[key];
      return v != null && v !== "" ? v : null;
    };

    // Position info
    const posName = player.position?.displayName || "";
    const posAbbr = player.position?.abbreviation || "";
    const isGK = posAbbr === "G" || posName.toLowerCase().includes("goalkeeper");
    const isDEF =
      posAbbr.includes("D") || posName.toLowerCase().includes("defender") || posName.toLowerCase().includes("back");
    const isMF =
      posAbbr.includes("M") || posName.toLowerCase().includes("midfielder");

    // Get detailed stats from playerGameStats (fetched per player)
    const gs = playerGameStats || {};

    // Team scores
    const homeScore = getTeamScore("home");
    const awayScore = getTeamScore("away");
    const matchStatus = getMatchStatus();

    // Build stat grid based on position
    let shareStatItems;
    if (isGK) {
      shareStatItems = [
        { label: "SV", value: s("SV") ?? gs.saves ?? 0 },
        { label: "GA", value: s("GA") ?? gs.goalsConceded ?? 0 },
        { label: "PASS", value: s("APP") != null ? (gs.totalPasses ?? "—") : "—" },
        { label: "PASS %", value: gs.totalPasses > 0 ? `${Math.round((gs.accuratePasses / gs.totalPasses) * 100)}%` : "—" },
        { label: "CLR", value: gs.clearances ?? "—" },
        { label: "MIN", value: s("APP") != null ? gs.minutes ?? "—" : "—" },
        { label: "YC", value: s("YC") ?? gs.yellowCards ?? 0 },
        { label: "RC", value: s("RC") ?? gs.redCards ?? 0 },
        { label: "OG", value: s("OG") ?? gs.ownGoals ?? 0 },
      ];
    } else {
      shareStatItems = [
        { label: "GLS", value: s("G") ?? gs.goals ?? 0 },
        { label: "AST", value: s("A") ?? gs.assists ?? 0 },
        { label: "SHOT", value: s("SHOT") ?? gs.shots ?? 0 },
        { label: "SOG", value: s("SOG") ?? gs.shotsOnTarget ?? 0 },
        { label: "TCKL", value: gs.tackles ?? "—" },
        { label: "CLR", value: gs.clearances ?? "—" },
        { label: "PASS", value: gs.totalPasses ?? "—" },
        { label: "PASS %", value: gs.totalPasses > 0 ? `${Math.round((gs.accuratePasses / gs.totalPasses) * 100)}%` : "—" },
        { label: "MIN", value: gs.minutes ?? "—" },
        { label: "YC", value: s("YC") ?? gs.yellowCards ?? 0 },
        { label: "RC", value: s("RC") ?? gs.redCards ?? 0 },
        { label: "OG", value: s("OG") ?? gs.ownGoals ?? 0 },
      ];
    }

    // Summary row (first 4 non-zero)
    const summaryItems = shareStatItems.filter(
      (i) => i.value != null && i.value !== 0 && i.value !== "—" && i.value !== "",
    ).slice(0, 4);
    const summaryFill = shareStatItems
      .filter((i) => !summaryItems.find((s) => s.label === i.label))
      .slice(0, 4 - summaryItems.length);
    const summaryStats = [...summaryItems, ...summaryFill].slice(0, 4);

    const initials = [athlete.shortName?.[0], athlete.lastName?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || fullName.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "P";

    console.log(athlete);

    return {
      fullName,
      initials,
      jersey,
      posAbbr: posAbbr || "—",
      posName : posName || null,
      teamType,
      teamColor,
      textOnBg,
      homeScore,
      awayScore,
      homeTeamData,
      awayTeamData,
      matchStatus,
      shareStatItems,
      summaryStats,
    };
  }, [selectedPlayer, playerGameStats, gameData, colors]);

  const playerShareData = buildPlayerShareData();

  const renderPlayerShareCard = () => {
    if (!playerShareData) return null;
    const d = playerShareData;
    const cardWidth = Math.min(width - 48, 540);

    return (
      <Modal
        visible={playerShareVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setPlayerShareVisible(false)}
      >
        <View style={styles.playerShareOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setPlayerShareVisible(false)}
          />
          <View style={styles.playerShareCenterWrap}>
            <ViewShot
              ref={playerShareCardRef}
              options={{ format: "png", quality: 1 }}
              style={{ overflow: "hidden" }}
            >
              <View
                style={[styles.playerShareCard, { width: cardWidth, backgroundColor: theme.surface }]}
              >
                {/* Header */}
                <View
                  style={[
                    styles.playerShareHeader,
                    { backgroundColor: `${d.teamColor}22`, borderBottomColor: d.teamColor },
                  ]}
                >
                  <View style={styles.playerShareTopRow}>
                    <View style={[styles.playerSharePosBadge, { backgroundColor: d.teamColor }]}>
                      <Text style={[styles.playerSharePosBadgeText, { color: d.textOnBg }]}>
                        #{d.jersey || "?"} · {d.posName || d.posAbbr}
                      </Text>
                    </View>
                    <View style={styles.playerShareScoreWrap}>
                      {d.homeTeamData?.team?.id && (
                        <TeamLogoImage
                          teamId={d.homeTeamData.team.id}
                          style={styles.playerShareScoreLogo}
                          isDarkMode={isDarkMode}
                        />
                      )}
                      <Text style={[styles.playerShareScoreText, { color: theme.text }]}>
                        <Text style={{ fontWeight: Number(d.homeScore) > Number(d.awayScore) ? "800" : "400" }}>
                          {d.homeScore}
                        </Text>
                        {" - "}
                        <Text style={{ fontWeight: Number(d.awayScore) > Number(d.homeScore) ? "800" : "400" }}>
                          {d.awayScore}
                        </Text>
                      </Text>
                      {d.awayTeamData?.team?.id && (
                        <TeamLogoImage
                          teamId={d.awayTeamData.team.id}
                          style={styles.playerShareScoreLogo}
                          isDarkMode={isDarkMode}
                        />
                      )}
                    </View>
                  </View>

                  <View style={styles.playerShareNameRow}>
                    <View
                      style={[
                        styles.playerShareAvatar,
                        { backgroundColor: `${d.teamColor}30`, borderColor: d.teamColor, borderWidth: 2 },
                      ]}
                    >
                      <Text style={[styles.playerShareInitials, { color: d.textOnBg }]}>
                        {d.initials}
                      </Text>
                    </View>
                    <View style={styles.playerShareNameRight}>
                      <View style={styles.playerShareSummaryRow}>
                        {d.summaryStats.map(({ label, value }) => (
                          <View key={label} style={styles.playerShareSummaryCell}>
                            <Text style={[styles.playerShareSummaryVal, { color: theme.text }]}>
                              {value != null ? String(value) : "0"}
                            </Text>
                            <Text style={[styles.playerShareSummaryLbl, { color: theme.textSecondary }]}>
                              {label}
                            </Text>
                          </View>
                        ))}
                      </View>
                      <View style={styles.playerShareMetaRow}>
                        <View style={styles.playerShareMetaLeft}>
                          <Text style={[styles.playerSharePlayerName, { color: theme.text }]} numberOfLines={1}>
                            {d.fullName}
                          </Text>
                          <View style={styles.playerShareTeamRow}>
                            {d.teamType === "home" && d.homeTeamData?.team?.id && (
                              <TeamLogoImage
                                teamId={d.homeTeamData.team.id}
                                style={styles.playerShareTeamLogo}
                                isDarkMode={isDarkMode}
                              />
                            )}
                            {d.teamType === "away" && d.awayTeamData?.team?.id && (
                              <TeamLogoImage
                                teamId={d.awayTeamData.team.id}
                                style={styles.playerShareTeamLogo}
                                isDarkMode={isDarkMode}
                              />
                            )}
                            <Text style={[styles.playerShareTeamName, { color: theme.textSecondary }]} numberOfLines={1}>
                              {d.teamType === "home"
                                ? d.homeTeamData?.team?.displayName || "Home"
                                : d.awayTeamData?.team?.displayName || "Away"}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Stats Grid */}
                <View style={styles.playerShareStatGrid}>
                  {d.shareStatItems.map(({ label, value }, i) => (
                    <View
                      key={label}
                      style={[
                        styles.playerShareStatCell,
                        { borderColor: theme.border },
                        i % 3 !== 2 && { borderRightWidth: StyleSheet.hairlineWidth },
                        i < Math.ceil(d.shareStatItems.length / 3) * 3 - 3 && { borderBottomWidth: StyleSheet.hairlineWidth },
                      ]}
                    >
                      <Text style={[styles.playerShareStatVal, { color: theme.text }]}>
                        {value != null ? String(value) : "0"}
                      </Text>
                      <Text style={[styles.playerShareStatLbl, { color: theme.textSecondary }]}>
                        {label}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Footer */}
                <View style={[styles.playerShareFooter, { borderTopColor: theme.border }]}>
                  <Text style={[styles.playerShareFooterBrand, { color: theme.text }]}>
                    SportsHeart{" "}
                    <Ionicons name="heart" size={10} color={colors.primary} />
                  </Text>
                </View>
              </View>
            </ViewShot>

            {/* Action buttons outside ViewShot */}
            <View style={styles.playerShareActions}>
              <TouchableOpacity
                style={[styles.playerShareActionBtn, { backgroundColor: colors.primary }]}
                onPress={handlePlayerShareCard}
                disabled={sharingPlayerCard}
              >
                {sharingPlayerCard ? (
                  <Text style={styles.playerShareActionBtnText}>Sharing...</Text>
                ) : (
                  <>
                    <Ionicons name="share-outline" size={18} color="#fff" />
                    <Text style={styles.playerShareActionBtnText}>Share</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.playerShareActionBtn, { backgroundColor: theme.surfaceSecondary }]}
                onPress={() => setPlayerShareVisible(false)}
              >
                <Text style={[styles.playerShareActionBtnText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderPlayerPopup = () => {
    if (!selectedPlayer) return null;

    const name =
      selectedPlayer.athlete?.displayName ||
      selectedPlayer.athlete?.lastName ||
      "Unknown Player";
    const id = selectedPlayer.athlete?.id || selectedPlayer.id;
    const jersey = selectedPlayer.jersey || "N/A";
    const stats = selectedPlayer.stats || {};
    const yellowCard = selectedPlayer.yellowCard;
    const redCard = selectedPlayer.redCard;
    const playerNameColor = redCard
      ? theme.error
      : yellowCard
        ? theme.warning
        : theme.text;
    const isGoalkeeper = selectedPlayer.position?.abbreviation === "G";

    // Get team info and color
    const competition = gameData.header?.competitions?.[0];
    const homeTeamData =
      gameData.homeCompetitor ||
      competition?.competitors?.find((comp) => comp.homeAway === "home");
    const awayTeamData =
      gameData.awayCompetitor ||
      competition?.competitors?.find((comp) => comp.homeAway === "away");

    let teamColor = "#000"; // Default black
    if (selectedPlayer.teamType === "home") {
      teamColor =
        EuropaConferenceLeagueServiceEnhanced.getTeamColorWithAlternateLogic(
          homeTeamData?.team,
        ) || "#007bff";
    } else if (selectedPlayer.teamType === "away") {
      teamColor =
        EuropaConferenceLeagueServiceEnhanced.getTeamColorWithAlternateLogic(
          awayTeamData?.team,
        ) || "#28a745";
    }

    // Ensure the color has a # prefix
    const finalTeamColor =
      teamColor && typeof teamColor === "string"
        ? teamColor.startsWith("#")
          ? teamColor
          : `#${teamColor}`
        : "#000";

    // Get current match scores
    const homeScore = getTeamScore("home");
    const awayScore = getTeamScore("away");

    // Get team names
    const homeTeamName =
      homeTeamData?.team?.displayName || homeTeamData?.team?.name || "Home";
    const awayTeamName =
      awayTeamData?.team?.displayName || awayTeamData?.team?.name || "Away";

    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={playerPopupVisible}
        onRequestClose={() => {
          setPlayerPopupVisible(false);
          setPlayerGameStats(null);
        }}
      >
        <View style={styles.enhancedModalOverlay}>
          <TouchableOpacity
            style={styles.enhancedModalBackground}
            activeOpacity={1}
            onPress={() => {
              setPlayerPopupVisible(false);
              setPlayerGameStats(null);
            }}
          />

          <View
            style={[
              styles.enhancedPlayerModal,
              { backgroundColor: theme.surface },
            ]}
          >
            {/* Header Section with Player Info */}
            <View style={styles.playerModalHeader}>
              {/* Player Circle and Info */}
              <View style={styles.playerHeaderInfo}>
                <View
                  style={[
                    styles.playerModalCircle,
                    { backgroundColor: finalTeamColor },
                  ]}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.playerModalNumber, { color: "white" }]}
                  >
                    {jersey}
                  </Text>
                </View>
                <View style={styles.playerModalNameSection}>
                  <TouchableOpacity
                    onPress={() => {
                      navigation.navigate("EuropaConferenceLeaguePlayerPage", {
                        playerId: id,
                        playerName: name,
                        teamId: selectedPlayer.teamId,
                        competitionId: gameData.header?.league?.slug,
                        sport: "soccer",
                      });
                      setPlayerPopupVisible(false);
                    }}
                  >
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.playerModalName,
                        { color: playerNameColor },
                      ]}
                    >
                      {name}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.playerTeamInfo}>
                    <TeamLogoImage
                      teamId={selectedPlayer.teamId}
                      style={styles.playerModalTeamLogo}
                      isDarkMode={isDarkMode}
                    />
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.playerTeamName,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {selectedPlayer.teamType === "home"
                        ? homeTeamName
                        : awayTeamName}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.playerPosition,
                        { color: theme.textSecondary },
                      ]}
                    >
                      • {selectedPlayer.position?.abbreviation || "N/A"}
                    </Text>
                  </View>
                </View>
                <View style={styles.playerModalHeaderActions}>
                  <TouchableOpacity
                    style={[
                      styles.playerCloseButton,
                      { backgroundColor: theme.error || "#FF3B30" },
                    ]}
                    onPress={() => {
                      setPlayerPopupVisible(false);
                      setSelectedPlayer(null);
                    }}
                  >
                    <Text allowFontScaling={false} style={styles.playerCloseText}>
                      ×
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Current Score Section */}
            <View style={styles.playerModalScoreSection}>
              <View style={styles.scoreTeamContainer}>
                <TeamLogoImage
                  teamId={homeTeamData?.team?.id}
                  style={styles.scoreTeamLogo}
                  isDarkMode={isDarkMode}
                />
                <Text
                  allowFontScaling={false}
                  style={[styles.scoreTeamScore, { color: theme.text }]}
                >
                  {homeScore}
                </Text>
              </View>

              <Text
                allowFontScaling={false}
                style={[styles.scoreDash, { color: theme.textSecondary }]}
              >
                -
              </Text>

              <View style={styles.scoreTeamContainer}>
                <Text
                  allowFontScaling={false}
                  style={[styles.scoreTeamScore, { color: theme.text }]}
                >
                  {awayScore}
                </Text>
                <TeamLogoImage
                  teamId={awayTeamData?.team?.id}
                  style={styles.scoreTeamLogo}
                  isDarkMode={isDarkMode}
                />
              </View>
            </View>

            {/* Stats Grid - 9 boxes for players, 6 for goalkeepers */}
            <View
              style={[
                styles.playerModalStatsGrid,
                { height: isGoalkeeper ? 200 : 275 },
              ]}
            >
              {loadingPlayerStats ? (
                <View style={styles.statsLoadingContainer}>
                  <ActivityIndicator size="large" color={finalTeamColor} />
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.statsLoadingText,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Loading player stats...
                  </Text>
                </View>
              ) : playerGameStats ? (
                isGoalkeeper ? (
                  // Goalkeeper-specific stats (6 boxes)
                  <>
                    <View
                      style={[
                        styles.statBox,
                        {
                          backgroundColor: theme.surfaceSecondary,
                          height: "46%",
                        },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[styles.statValue, { color: theme.text }]}
                      >
                        {playerGameStats.saves}
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.statLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Saves
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statBox,
                        {
                          backgroundColor: theme.surfaceSecondary,
                          height: "46%",
                        },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[styles.statValue, { color: theme.text }]}
                      >
                        {playerGameStats.goalsConceded}
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.statLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Goals Conceded
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statBox,
                        {
                          backgroundColor: theme.surfaceSecondary,
                          height: "46%",
                        },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[styles.statValue, { color: theme.text }]}
                      >
                        {playerGameStats.totalPasses}
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.statLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Passes
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statBox,
                        {
                          backgroundColor: theme.surfaceSecondary,
                          height: "46%",
                        },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[styles.statValue, { color: theme.text }]}
                      >
                        {playerGameStats.totalPasses > 0
                          ? (
                              (playerGameStats.accuratePasses /
                                playerGameStats.totalPasses) *
                              100
                            ).toFixed(1) + "%"
                          : "0%"}
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.statLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Pass Acc.
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statBox,
                        {
                          backgroundColor: theme.surfaceSecondary,
                          height: "46%",
                        },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[styles.statValue, { color: theme.text }]}
                      >
                        {playerGameStats.clearances}
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.statLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Clearances
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statBox,
                        {
                          backgroundColor: theme.surfaceSecondary,
                          height: "46%",
                        },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[styles.statValue, { color: theme.text }]}
                      >
                        {playerGameStats.minutes}
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.statLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Minutes
                      </Text>
                    </View>
                  </>
                ) : (
                  // Regular player stats (9 boxes)
                  <>
                    <View
                      style={[
                        styles.statBox,
                        {
                          backgroundColor: theme.surfaceSecondary || theme.card,
                        },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[styles.statValue, { color: theme.text }]}
                      >
                        {playerGameStats.goals}
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.statLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Goals
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statBox,
                        {
                          backgroundColor: theme.surfaceSecondary || theme.card,
                        },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[styles.statValue, { color: theme.text }]}
                      >
                        {playerGameStats.assists}
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.statLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Assists
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statBox,
                        {
                          backgroundColor: theme.surfaceSecondary || theme.card,
                        },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[styles.statValue, { color: theme.text }]}
                      >
                        {playerGameStats.shots}
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.statLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Shots
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statBox,
                        {
                          backgroundColor: theme.surfaceSecondary || theme.card,
                        },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[styles.statValue, { color: theme.text }]}
                      >
                        {playerGameStats.shotsOnTarget}
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.statLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        On Target
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statBox,
                        {
                          backgroundColor: theme.surfaceSecondary || theme.card,
                        },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[styles.statValue, { color: theme.text }]}
                      >
                        {playerGameStats.totalPasses}
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.statLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Passes
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statBox,
                        {
                          backgroundColor: theme.surfaceSecondary || theme.card,
                        },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[styles.statValue, { color: theme.text }]}
                      >
                        {playerGameStats.totalPasses > 0
                          ? (
                              (playerGameStats.accuratePasses /
                                playerGameStats.totalPasses) *
                              100
                            ).toFixed(1) + "%"
                          : "0%"}
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.statLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Pass Acc.
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statBox,
                        {
                          backgroundColor: theme.surfaceSecondary || theme.card,
                        },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[styles.statValue, { color: theme.text }]}
                      >
                        {playerGameStats.tackles}
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.statLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Tackles
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statBox,
                        {
                          backgroundColor: theme.surfaceSecondary || theme.card,
                        },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[styles.statValue, { color: theme.text }]}
                      >
                        {playerGameStats.clearances}
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.statLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Clearances
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statBox,
                        {
                          backgroundColor: theme.surfaceSecondary || theme.card,
                        },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[styles.statValue, { color: theme.text }]}
                      >
                        {playerGameStats.minutes}
                      </Text>
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.statLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Minutes
                      </Text>
                    </View>
                  </>
                )
              ) : (
                <View style={styles.statsErrorContainer}>
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.statsErrorText,
                      { color: theme.textSecondary },
                    ]}
                  >
                    No stats available
                  </Text>
                </View>
              )}
            </View>

            {/* Half Field Display - Only show for non-goalkeepers */}
            {!isGoalkeeper && (
              <View style={styles.playerModalFieldContainer}>
                {renderPlayerShotsField(selectedPlayer, finalTeamColor)}
              </View>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  if (loading && !gameData) {
    return (
      <View
        style={[
          styles.container,
          styles.loadingContainer,
          { backgroundColor: theme.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text
          allowFontScaling={false}
          style={[styles.loadingText, { color: theme.text }]}
        >
          Loading match details...
        </Text>
      </View>
    );
  }

  if (!gameData) {
    return (
      <View
        style={[
          styles.container,
          styles.errorContainer,
          { backgroundColor: theme.background },
        ]}
      >
        <Text
          allowFontScaling={false}
          style={[styles.errorText, { color: theme.text }]}
        >
          Failed to load match details
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={() => loadGameDetails()}
        >
          <Text allowFontScaling={false} style={styles.retryText}>
            Retry
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Animated.ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        stickyHeaderIndices={[1]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* Main Header Section */}
        {renderMatchHeader()}

        {/* Sticky Header Section containing Mini Header and Tab Bar */}
        {renderStickyHeader()}

        {/* Tab Content */}
        <View style={styles.contentArea}>
          <View style={styles.tabContent}>{renderTabContent()}</View>
        </View>
      </Animated.ScrollView>

      {renderPlayerPopup()}
      {renderPlayerShareCard()}

      {/* Stream Modal - Only render when streaming is unlocked */}
      {isStreamingUnlocked && (
        <Modal
          animationType="fade"
          transparent={true}
          visible={showStreamModal}
          onRequestClose={() => setShowStreamModal(false)}
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
                  onPress={() => setShowStreamModal(false)}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.streamCloseText, { color: colors.primary }]}
                  >
                    ×
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Stream Source Buttons */}
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
                {Object.keys(availableStreams)
                  .slice(0, 5)
                  .map((source) => (
                    <TouchableOpacity
                      key={source}
                      style={[
                        styles.streamSourceButton,
                        {
                          backgroundColor:
                            currentStreamType === source
                              ? colors.primary
                              : theme.surfaceSecondary,
                        },
                        { borderColor: theme.border },
                      ]}
                      onPress={() => setCurrentStreamType(source)}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.streamSourceButtonText,
                          {
                            color:
                              currentStreamType === source
                                ? "#fff"
                                : colors.primary,
                          },
                        ]}
                      >
                        {source.charAt(0).toUpperCase() + source.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>

              {/* WebView Container */}
              <View style={styles.webViewContainer}>
                {streamLoading && (
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
                {currentStreamType && availableStreams[currentStreamType] && (
                  <WebView
                    source={{ uri: availableStreams[currentStreamType] }}
                    style={styles.streamWebView}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    allowsInlineMediaPlayback={true}
                    mediaPlaybackRequiresUserAction={false}
                    onLoadStart={() => setStreamLoading(true)}
                    onLoadEnd={() => setStreamLoading(false)}
                    onError={() => setStreamLoading(false)}
                    userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                    injectedJavaScript={`(function(){
                      function post(obj){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(obj)); }catch(e){} }
                      post({type:'instrumentation', event:'init'});
                      window.addEventListener('load', function(){ post({type:'lifecycle', event:'load', href:location.href}); });
                      document.addEventListener('DOMContentLoaded', function(){ post({type:'lifecycle', event:'domcontent', href:location.href}); });
                      try{ const origOpen = window.open; window.open = function(url,target,features){ post({type:'nav', method:'window.open', url:url, target:target}); return origOpen.call(this,url,target,features); }; }catch(e){}
                      try{ const observer = new MutationObserver(function(muts){ muts.forEach(m=>{ m.addedNodes && m.addedNodes.forEach(n=>{ if(n.nodeType===1){ const tag=n.tagName.toLowerCase(); if(tag==='video'||tag==='iframe'||(n.querySelector&&(n.querySelector('video')||n.querySelector('iframe')))){ post({type:'dom', action:'added', tag:tag, html:n.outerHTML?(n.outerHTML.substring(0,200)):null, href:location.href}); } } }); m.removedNodes && m.removedNodes.forEach(n=>{ if(n.nodeType===1){ const tag=n.tagName.toLowerCase(); if(tag==='video'||tag==='iframe'||(n.querySelector&&(n.querySelector('video')||n.querySelector('iframe')))){ post({type:'dom', action:'removed', tag:tag, href:location.href}); } } }); }); }); observer.observe(document.documentElement||document.body,{ childList:true, subtree:true }); post({type:'instrumentation', event:'observer_started'}); }catch(e){ post({type:'instrumentation', event:'observer_error', error:String(e)}); }
                      function instrumentExistingVideos(){ const videos=document.querySelectorAll('video'); videos.forEach(v=>{ if(!v.__instrumented){ v.__instrumented=true; v.addEventListener('play',()=>post({type:'video', event:'play', src:v.currentSrc||v.src, href:location.href})); v.addEventListener('pause',()=>post({type:'video', event:'pause', src:v.currentSrc||v.src, href:location.href})); v.addEventListener('ended',()=>post({type:'video', event:'ended', src:v.currentSrc||v.src, href:location.href})); } }); }
                      setInterval(instrumentExistingVideos,1000);
                      true; })();`}
                    onMessage={(event) => {
                      try {
                        const data = JSON.parse(event.nativeEvent.data);
                        console.log("WebView instrumentation:", data);
                      } catch (e) {
                        console.log(
                          "WebView message (raw):",
                          event.nativeEvent.data,
                        );
                      }
                    }}
                    onNavigationStateChange={(navState) => {
                      console.log("WebView navigation state change:", {
                        url: navState.url,
                        title: navState.title,
                        loading: navState.loading,
                      });
                    }}
                    // Block popup navigation within the WebView
                    onShouldStartLoadWithRequest={(request) => {
                      console.log(
                        "UECL WebView navigation request:",
                        request.url,
                      );

                      // Allow the initial stream URL to load
                      if (request.url === availableStreams[currentStreamType]) {
                        return true;
                      }

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

                      const currentDomain = new URL(
                        availableStreams[currentStreamType],
                      ).hostname;
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
                        console.log("Invalid URL:", request.url);
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
                        console.log(
                          "Blocked UECL popup/cross-domain navigation:",
                          request.url,
                        );
                        return false;
                      }

                      if (sameRootDomain || allowIfEmbed) {
                        return true;
                      }

                      console.log(
                        "Blocked UECL popup/cross-domain navigation:",
                        request.url,
                      );
                      return false;
                    }}
                    // Handle when WebView tries to open a new window (popup)
                    onOpenWindow={(syntheticEvent) => {
                      const { nativeEvent } = syntheticEvent;
                      console.log(
                        "Blocked UECL popup window:",
                        nativeEvent.targetUrl,
                      );
                      // Don't open the popup - just log it
                      return false;
                    }}
                  />
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}

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
                    {gameData
                      ? `${
                          gameData.header.competitions[0].competitors.find(
                            (c) => c.homeAway === "home",
                          )?.team.name || "Home"
                        } vs ${
                          gameData.header.competitions[0].competitors.find(
                            (c) => c.homeAway === "away",
                          )?.team.name || "Away"
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
                  {gameData && (
                    <ChatComponent
                      gameId={gameId}
                      gameData={gameData}
                      hideHeader={true}
                    />
                  )}
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}

      {/* Goal Share Card Modal */}
      {shareCardPlay && (
        <Modal
          visible={!!shareCardPlay}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShareCardPlay(null)}
        >
          <View
            style={[
              styles.goalShareCardOverlay,
              {
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
                console.log("Modal overlay tapped - closing goal card");
                setShareCardPlay(null);
              }}
            />

            <View style={{ alignItems: "center" }}>
              {/* Goal card content - what gets captured */}
              <ViewShot
                ref={goalShareCardRef}
                options={{
                  format: "png",
                  quality: 1,
                }}
                style={{ overflow: "hidden" }}
              >
                <View
                  style={[
                    styles.goalShareCard,
                    {
                      backgroundColor: theme.surface,
                      width: Math.min(width - 48, 540),
                    },
                  ]}
                >
                  {shareCardPlay &&
                    (() => {
                      console.log(
                        "Rendering goal share card modal with play data:",
                        shareCardPlay,
                      );
                      const play = shareCardPlay;

                      // Get team info from the context passed by long press handler
                      let homeTeamData = play._contextTeams?.homeTeam;
                      let awayTeamData = play._contextTeams?.awayTeam;
                      let contextTeamColor = play._contextTeams?.teamColor;
                      let contextPlayTeamId = play._contextTeams?.playTeamId;

                      // Fallbacks if context data is not available
                      if (!homeTeamData || !awayTeamData) {
                        // Try route params as fallback
                        homeTeamData = homeTeamData || homeTeam;
                        awayTeamData = awayTeamData || awayTeam;

                        // Try gameData as additional fallback
                        if (
                          !homeTeamData &&
                          gameData?.competitions?.[0]?.competitors
                        ) {
                          const competitors =
                            gameData.competitions[0].competitors;
                          homeTeamData = competitors.find(
                            (c) => c.homeAway === "home",
                          )?.team;
                          awayTeamData = competitors.find(
                            (c) => c.homeAway === "away",
                          )?.team;
                        }

                        // Try direct gameData structure
                        if (!homeTeamData && gameData?.homeCompetitor) {
                          homeTeamData = gameData.homeCompetitor;
                          awayTeamData = gameData.awayCompetitor;
                        }
                      }

                      console.log("Team data from context:", {
                        homeTeamData,
                        awayTeamData,
                        contextTeamColor,
                        contextPlayTeamId,
                        playContextTeams: play._contextTeams,
                      });

                      // Determine which team scored - more robust detection
                      const homeId = homeTeamData?.id || homeTeamData?.team?.id;
                      const awayId = awayTeamData?.id || awayTeamData?.team?.id;

                      // Use context team ID first, then try multiple fallback methods
                      let playTeamId = contextPlayTeamId;

                      if (!playTeamId) {
                        if (play.team?.id) {
                          playTeamId = play.team.id;
                        } else if (play.team?.$ref) {
                          // Extract team ID from $ref and remove URL parameters
                          const refParts = play.team.$ref.split("/");
                          const teamIdWithParams =
                            refParts[refParts.length - 1];
                          playTeamId = teamIdWithParams.split("?")[0]; // Remove ?lang=en&region=us
                        } else if (play.participants?.length > 0) {
                          // Try to get team from scorer's team
                          const scorer = play.participants.find(
                            (p) => p.type === "scorer",
                          );
                          if (scorer?.athlete?.team?.id) {
                            playTeamId = scorer.athlete.team.id;
                          } else if (scorer?.athlete?.team?.$ref) {
                            const refParts =
                              scorer.athlete.team.$ref.split("/");
                            const teamIdWithParams =
                              refParts[refParts.length - 1];
                            playTeamId = teamIdWithParams.split("?")[0]; // Remove URL parameters
                          }
                        }
                      }

                      let scoringTeam = null;
                      let scoringTeamSide = "";
                      let teamAbbr = "";

                      const isOwnGoal =
                        play.ownGoal ||
                        play.text?.toLowerCase().includes("own goal") ||
                        play.shortText?.toLowerCase().includes("own goal") ||
                        play.type?.name?.toLowerCase().includes("own goal") ||
                        play.type?.id === "97" ||
                        play.type?.id === 97;

                      console.log("Trying to match team IDs:", {
                        playTeamId,
                        homeId,
                        awayId,
                        fromContext: !!contextPlayTeamId,
                      });

                      if (String(playTeamId) === String(homeId)) {
                        scoringTeam = homeTeamData;
                        scoringTeamSide = "home";
                        teamAbbr =
                          `${isOwnGoal ? awayTeamData?.team?.abbreviation : homeTeamData?.team?.abbreviation}` ||
                          "HOME";
                      } else if (String(playTeamId) === String(awayId)) {
                        scoringTeam = awayTeamData;
                        scoringTeamSide = "away";
                        teamAbbr =
                          `${isOwnGoal ? homeTeamData?.team?.abbreviation : awayTeamData?.team?.abbreviation}` ||
                          "AWAY";
                      }

                      // Fallback: use text analysis to determine team
                      if (!scoringTeam && play.text) {
                        const homeTeamName =
                          homeTeamData?.name || homeTeamData?.displayName || "";
                        const awayTeamName =
                          awayTeamData?.name || awayTeamData?.displayName || "";

                        console.log("Fallback text analysis:", {
                          homeTeamName,
                          awayTeamName,
                          playText: play.text,
                        });

                        if (homeTeamName && play.text.includes(homeTeamName)) {
                          scoringTeam = homeTeamData;
                          scoringTeamSide = "home";
                          teamAbbr = homeTeamData?.abbreviation || "HOME";
                        } else if (
                          awayTeamName &&
                          play.text.includes(awayTeamName)
                        ) {
                          scoringTeam = awayTeamData;
                          scoringTeamSide = "away";
                          teamAbbr = awayTeamData?.abbreviation || "AWAY";
                        } else {
                          // Advanced fallback - parse team names from play text
                          // Format: "Goal! Manchester City 5, Burnley 1. Player..."
                          const textMatch = play.text.match(
                            /([A-Za-z\s]+)\s+(\d+),\s*([A-Za-z\s]+)\s+(\d+)/,
                          );
                          if (textMatch) {
                            const [, team1Name, team2Name] = textMatch;
                            console.log("Parsed team names from text:", {
                              team1Name,
                              team2Name,
                            });

                            // Create mock team objects from text
                            const team1 = {
                              name: team1Name.trim(),
                              abbreviation: team1Name
                                .split(" ")[0]
                                .substring(0, 3)
                                .toUpperCase(),
                            };
                            const team2 = {
                              name: team2Name.trim(),
                              abbreviation: team2Name
                                .split(" ")[0]
                                .substring(0, 3)
                                .toUpperCase(),
                            };

                            // Determine which team scored based on player mention
                            if (play.text.includes(`(${team1Name})`)) {
                              scoringTeam = team1;
                              scoringTeamSide = "home"; // Assume first team is home
                              teamAbbr = team1.abbreviation;
                              // Set team data for later use
                              if (!homeTeamData) homeTeamData = team1;
                              if (!awayTeamData) awayTeamData = team2;
                            } else if (play.text.includes(`(${team2Name})`)) {
                              scoringTeam = team2;
                              scoringTeamSide = "away"; // Assume second team is away
                              teamAbbr = team2.abbreviation;
                              // Set team data for later use
                              if (!homeTeamData) homeTeamData = team1;
                              if (!awayTeamData) awayTeamData = team2;
                            }
                          }

                          // Final fallback - use available team data
                          if (!scoringTeam) {
                            scoringTeam = homeTeamData ||
                              awayTeamData || {
                                name: "Unknown Team",
                                abbreviation: "UNK",
                              };
                            scoringTeamSide = "home";
                            teamAbbr = scoringTeam?.abbreviation || "UNK";
                          }
                        }
                      }

                      console.log("Final scoring team:", {
                        scoringTeam,
                        scoringTeamSide,
                        teamAbbr,
                      });

                      // Get team color - use context color first
                      let teamColor = contextTeamColor || "#007bff"; // Use context color or default blue

                      if (!contextTeamColor && scoringTeam) {
                        // Try the existing service if context color not available
                        teamColor =
                          EuropaConferenceLeagueServiceEnhanced.getTeamColorWithAlternateLogic(
                            scoringTeam,
                          ) || teamColor;

                        // Fallback to direct color properties
                        if (teamColor === "#007bff") {
                          teamColor =
                            scoringTeam.color ||
                            scoringTeam.alternateColor ||
                            scoringTeam.team?.color ||
                            scoringTeam.team?.alternateColor ||
                            "#007bff";
                        }
                      }

                      const finalTeamColor = teamColor.startsWith("#")
                        ? teamColor
                        : `#${teamColor}`;
                      const textColor = getContrastColor(finalTeamColor);

                      // For own goals the circle + team row shows the OWN GOALER's team
                      // (the team that conceded), not the team that received the goal.
                      const ownGoalerTeamData = isOwnGoal
                        ? scoringTeamSide === "home"
                          ? awayTeamData
                          : homeTeamData
                        : null;
                      let playerCircleColor = finalTeamColor;
                      if (isOwnGoal && ownGoalerTeamData) {
                        const ogRaw =
                          EuropaConferenceLeagueServiceEnhanced.getTeamColorWithAlternateLogic(
                            ownGoalerTeamData?.team || ownGoalerTeamData,
                          ) ||
                          ownGoalerTeamData.color ||
                          ownGoalerTeamData.alternateColor ||
                          ownGoalerTeamData.team?.color ||
                          ownGoalerTeamData.team?.alternateColor ||
                          "#888888";
                        playerCircleColor = ogRaw.startsWith("#")
                          ? ogRaw
                          : `#${ogRaw}`;
                      }
                      const playerCircleTextColor =
                        getContrastColor(playerCircleColor);
                      const playerCircleTeam = isOwnGoal
                        ? ownGoalerTeamData
                        : scoringTeam;

                      // Get scorer and assister info from state (fetched via useEffect)
                      const scorerName =
                        shareCardPlayerNames.scorer || "Loading...";
                      const assisterName = shareCardPlayerNames.assister;

                      console.log("Using player names from state:", {
                        scorerName,
                        assisterName,
                      });

                      // Get time info
                      const period = play.period ? play.period.number || 1 : 1;
                      const clock = play.clock?.displayValue || "";
                      const periodText =
                        period === 1
                          ? "1st Half"
                          : period === 2
                            ? "2nd Half"
                            : `Extra Time`;

                      // Get current scores (use tracked scores from processedPlays)
                      const homeScore = play._homeScore || play.homeScore || 0;
                      const awayScore = play._awayScore || play.awayScore || 0;

                      // Determine goal type and situation
                      const playText = play.text || play.shortText || "";
                      const isPenalty = playText
                        .toLowerCase()
                        .includes("penalty");

                      let goalType = "Goal";
                      if (isOwnGoal) {
                        goalType = "Own Goal";
                      } else if (isPenalty) {
                        goalType = "Penalty Goal";
                      }

                      // Determine goal situation (opening, equalizer, go-ahead, etc.)
                      let goalSituation = "";
                      if (scoringTeamSide === "home") {
                        if (homeScore > awayScore) {
                          if (homeScore - awayScore === 1) {
                            goalSituation =
                              awayScore === 0
                                ? "Opening Goal"
                                : "Go-ahead Goal";
                          } else {
                            goalSituation = "Extends Lead";
                          }
                        } else if (homeScore === awayScore) {
                          goalSituation = "Equalizer";
                        }
                      } else {
                        if (awayScore > homeScore) {
                          if (awayScore - homeScore === 1) {
                            goalSituation =
                              homeScore === 0
                                ? "Opening Goal"
                                : "Go-ahead Goal";
                          } else {
                            goalSituation = "Extends Lead";
                          }
                        } else if (awayScore === homeScore) {
                          goalSituation = "Equalizer";
                        }
                      }

                      // Use real player stats from API (fetched via useEffect)
                      const playerStats = shareCardPlayerStats;
                      console.log("Using player stats from API:", playerStats);

                      // Helper: get first + last initials from a player name
                      const getInitials = (name) => {
                        if (!name || name === "Loading...") return "?";
                        const parts = name.split(" ").filter(Boolean);
                        if (parts.length === 0) return "?";
                        if (parts.length === 1)
                          return parts[0][0].toUpperCase();
                        return (
                          parts[0][0] + parts[parts.length - 1][0]
                        ).toUpperCase();
                      };

                      const sgcStatItems = [
                        {
                          label: isOwnGoal ? "OG" : "G",
                          value: isOwnGoal
                            ? playerStats.ownGoals
                            : playerStats.goals,
                        },
                        { label: "A", value: playerStats.assists },
                        { label: "SH", value: playerStats.shots },
                        { label: "SOT", value: playerStats.shotsOnTarget },
                        { label: "YC", value: playerStats.yellowCards },
                        { label: "RC", value: playerStats.redCards },
                      ];

                      const CARD_SIZE = Math.min(width - 48, 540);

                      // ── Field scaling ───────────────────────────────────────
                      // 0.41 matches the old hardcoded 130/320 = 40.6% ratio.
                      // -12 leaves ~6px padding each side of the portrait field.
                      const FIELD_LEFT_PANEL_W = Math.round(CARD_SIZE * 0.41);
                      const FIELD_SCALE = (FIELD_LEFT_PANEL_W - 12) / 120;
                      const FIELD_MARG_H = (120 * FIELD_SCALE - 180) / 2;
                      const FIELD_MARG_V = (180 * FIELD_SCALE - 120) / 2;

                      console.log(
                        "[ShareCard] width:",
                        width,
                        "| CARD_SIZE:",
                        CARD_SIZE,
                        "| FIELD_LEFT_PANEL_W:",
                        FIELD_LEFT_PANEL_W,
                        "| FIELD_SCALE:",
                        FIELD_SCALE.toFixed(3),
                        "| FIELD_MARG_H:",
                        FIELD_MARG_H.toFixed(1),
                        "| FIELD_MARG_V:",
                        FIELD_MARG_V.toFixed(1),
                      );

                      return (
                        <View
                          style={[
                            styles.goalShareCard,
                            {
                              backgroundColor: theme.surface,
                              width: CARD_SIZE,
                            },
                          ]}
                        >
                          {/* ── Header: time + score + goal event + description ── */}
                          <View
                            style={{
                              backgroundColor: finalTeamColor + "33",
                              borderBottomWidth: 2,
                              borderBottomColor: finalTeamColor,
                              paddingHorizontal: 14,
                              paddingTop: 12,
                              paddingBottom: 10,
                            }}
                          >
                            {/* Row 1: time/half on left, score on right */}
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
                                  fontWeight: "800",
                                  textTransform: "uppercase",
                                  letterSpacing: 0.6,
                                  color: theme.text,
                                }}
                              >
                                {clock ? `${clock} • ` : ""}
                                {periodText}
                              </Text>
                              {/* Score with team logos */}
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 5,
                                }}
                              >
                                <TeamLogoImage
                                  teamId={
                                    homeTeamData?.id || homeTeamData?.team?.id
                                  }
                                  style={{ width: 18, height: 18 }}
                                  isDarkMode={isDarkMode}
                                />
                                <Text
                                  style={{
                                    fontSize: 13,
                                    fontWeight: "700",
                                    color: theme.text,
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontWeight:
                                        awayScore < homeScore ? "800" : "400",
                                    }}
                                  >
                                    {homeScore}
                                  </Text>{" "}
                                  <Text>-</Text>{" "}
                                  <Text
                                    style={{
                                      fontWeight:
                                        homeScore < awayScore ? "800" : "400",
                                    }}
                                  >
                                    {awayScore}
                                  </Text>
                                </Text>
                                <TeamLogoImage
                                  teamId={
                                    awayTeamData?.id || awayTeamData?.team?.id
                                  }
                                  style={{ width: 18, height: 18 }}
                                  isDarkMode={isDarkMode}
                                />
                              </View>
                            </View>
                            {/* Goal situation */}
                            <Text
                              style={{
                                fontSize: 17,
                                fontWeight: "800",
                                color: theme.text,
                                marginBottom: 3,
                              }}
                            >
                              ⚽ {goalType}
                              {goalSituation ? ` • ${goalSituation}` : ""}
                            </Text>
                            {/* Description */}
                            {!!playText && (
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
                            )}
                          </View>

                          {/* ── Body: left = vertical field, right = player info ── */}
                          <View style={{ flexDirection: "row" }}>
                            {/* Left – vertical soccer field (width scales with card) */}
                            <View
                              style={{
                                width: 150 * FIELD_SCALE,
                                height: 200 * FIELD_SCALE,
                                justifyContent: "center",
                                alignItems: "center",
                                borderRightWidth: StyleSheet.hairlineWidth,
                                borderRightColor: theme.border,
                                paddingVertical: 12,
                              }}
                              onLayout={(e) =>
                                console.log(
                                  "[ShareCard] left panel actual width:",
                                  e.nativeEvent.layout.width,
                                  "expected:",
                                  FIELD_LEFT_PANEL_W,
                                )
                              }
                            >
                              {/*
                                The field (180×120 landscape) is rotated 90 ° + scaled.
                                Margins are computed from the scaled visual size so
                                the layout box matches the visual portrait dimensions.
                              */}
                              <View
                                style={{
                                  width: 180,
                                  height: 120,
                                  transform: [
                                    { rotate: "90deg" },
                                    { scale: FIELD_SCALE },
                                  ],
                                  justifyContent: "center",
                                  alignItems: "center",
                                }}
                              >
                                {play.fieldPositionX !== undefined &&
                                play.fieldPositionY !== undefined
                                  ? renderMiniField(
                                      {
                                        x: play.fieldPositionX,
                                        y: play.fieldPositionY,
                                      },
                                      play.fieldPosition2X !== undefined &&
                                        play.fieldPosition2Y !== undefined
                                        ? {
                                            x: play.fieldPosition2X,
                                            y: play.fieldPosition2Y,
                                          }
                                        : null,
                                      "owngoal",
                                      scoringTeamSide,
                                      playerCircleColor,
                                    )
                                  : renderMiniField(
                                      null,
                                      null,
                                      "goal",
                                      scoringTeamSide,
                                      playerCircleColor,
                                    )}
                              </View>
                            </View>

                            {/* Right – player avatar + info + stats */}
                            <View
                              style={{
                                flex: 1,
                                paddingHorizontal: 12,
                                paddingVertical: 12,
                                justifyContent: "center",
                                alignItems: "center",
                              }}
                            >
                              {/* Initial circle — for own goals uses the OWN GOALER's team color */}
                              <View
                                style={{
                                  width: 54,
                                  height: 54,
                                  borderRadius: 27,
                                  backgroundColor: playerCircleColor,
                                  justifyContent: "center",
                                  alignItems: "center",
                                  borderWidth: 2,
                                  borderColor: theme.border,
                                  marginBottom: 5,
                                }}
                              >
                                <Text
                                  style={{
                                    color: playerCircleTextColor,
                                    fontSize: 22.5,
                                    fontWeight: "800",
                                  }}
                                >
                                  {getInitials(scorerName)}
                                </Text>
                              </View>

                              {/* Player name */}
                              <Text
                                style={{
                                  fontSize: 13,
                                  fontWeight: "700",
                                  color: theme.text,
                                  textAlign: "center",
                                  marginBottom: 3,
                                }}
                                numberOfLines={1}
                              >
                                {scorerName}
                              </Text>

                              {/* Team name with logo — for own goals shows the OWN GOALER's team */}
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 4,
                                  marginBottom: assisterName ? 6 : 8,
                                }}
                              >
                                <TeamLogoImage
                                  teamId={
                                    playerCircleTeam?.id ||
                                    playerCircleTeam?.team?.id
                                  }
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
                                  {playerCircleTeam?.name ||
                                    playerCircleTeam?.team?.name ||
                                    teamAbbr}
                                </Text>
                              </View>

                              {/* Assister (if present) */}
                              {!!assisterName && (
                                <View
                                  style={{
                                    alignItems: "center",
                                    marginBottom: 8,
                                  }}
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
                                    {assisterName}
                                  </Text>
                                  <Text
                                    style={{
                                      fontSize: 9,
                                      fontWeight: "700",
                                      textTransform: "uppercase",
                                      letterSpacing: 0.4,
                                      color: theme.textSecondary,
                                    }}
                                  >
                                    Assist
                                  </Text>
                                </View>
                              )}

                              {/* 6-stat grid (3 columns × 2 rows) */}
                              <View
                                style={{
                                  flexDirection: "row",
                                  flexWrap: "wrap",
                                  justifyContent: "center",
                                  width: "100%",
                                  marginTop: 2,
                                }}
                              >
                                {sgcStatItems.map(({ label, value }) => (
                                  <View
                                    key={label}
                                    style={{
                                      width: "33.333%",
                                      alignItems: "center",
                                      paddingVertical: 6,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 15,
                                        fontWeight: "800",
                                        color: theme.text,
                                      }}
                                    >
                                      {value ?? "—"}
                                    </Text>
                                    <Text
                                      style={{
                                        fontSize: 9,
                                        fontWeight: "600",
                                        textTransform: "uppercase",
                                        letterSpacing: 0.4,
                                        color: theme.textSecondary,
                                        marginTop: 2,
                                      }}
                                    >
                                      {label}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            </View>
                          </View>

                          {/* ── Branding footer ── */}
                          <View
                            style={{
                              borderTopWidth: StyleSheet.hairlineWidth,
                              borderTopColor: theme.border,
                              paddingVertical: 6,
                              paddingHorizontal: 12,
                              alignItems: "flex-end",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 9,
                                fontWeight: "800",
                                letterSpacing: 0.5,
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
                        </View>
                      );
                    })()}
                </View>
              </ViewShot>

              {/* Action Buttons - Outside ViewShot like MLB */}
              <View style={styles.goalShareCardActions}>
                <TouchableOpacity
                  style={[
                    styles.goalShareCardButton,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={async () => {
                    try {
                      const uri = await captureRef(goalShareCardRef, {
                        format: "png",
                        quality: 2,
                      });
                      await Sharing.shareAsync(uri, {
                        mimeType: "image/png",
                        dialogTitle: "Share Goal",
                      });
                    } catch (error) {
                      console.error("Error sharing goal:", error);
                    }
                  }}
                >
                  <Ionicons name="share-outline" size={24} color="#fff" />
                  <Text style={styles.goalShareCardButtonText}>Share</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.goalShareCardButton,
                    { backgroundColor: theme.surfaceSecondary },
                  ]}
                  onPress={() => setShareCardPlay(null)}
                >
                  <Ionicons name="close" size={24} color={theme.text} />
                  <Text
                    style={[
                      styles.goalShareCardButtonText,
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
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  // NBA-style sticky unit (mini header + tab bar)
  stickyUnit: {
    borderBottomWidth: 1,
  },
  // Animated mini header
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
  miniAbbr: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  miniLogo: {
    width: 35,
    height: 35,
  },
  miniScore: {
    fontSize: 22,
    lineHeight: 26,
  },
  miniShootoutScore: {
    fontSize: 16,
    lineHeight: 26,
    marginHorizontal: -4,
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
  // Tab bar styles (NBA-style)
  tabBarWrapper: {
    height: 40,
    justifyContent: "center",
    borderBottomWidth: 0,
  },
  tabBarContent: {
    flexDirection: "row",
  },
  tabBarButton: {
    width: Dimensions.get("window").width / 4,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabBarLabel: {
    fontSize: 13,
  },
  // Content area
  contentArea: {
    flex: 1,
    padding: 12,
    marginTop: 12,
  },
  // NBA-style header card
  simpleHeaderCard: {
    padding: 20,
    overflow: "hidden",
    position: "relative",
    borderBottomWidth: 0,
    marginBottom: 0,
    borderWidth: 1,
  },
  simpleLeagueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  simpleLeagueText: {
    fontSize: 12,
    fontWeight: "500",
  },
  simpleMainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 0,
  },
  simpleTeamContainer: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  simpleTeamLogo: {
    width: 65,
    height: 65,
  },
  simpleTeamInfo: {
    alignItems: "center",
    justifyContent: "center",
    maxWidth: 120,
    flexDirection: "row",
    gap: 6,
  },
  simpleTeamName: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 17,
    textAlign: "center",
    marginBottom: 14,
  },
  simpleTeamScore: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "800",
    minWidth: 24,
    textAlign: "center",
  },
  simpleTeamTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: -5,
    gap: 8,
  },
  scoreRight: {
    marginRight: 8,
  },
  scoreLeft: {
    marginLeft: 8,
  },
  simpleStatusCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  simpleStatusBadge: {
    paddingHorizontal: 8,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  simpleStatusMain: {
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  simpleStatusSecondary: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    marginTop: -12,
    marginBottom: 4,
  },
  simpleStatusSub: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 2,
  },
  simpleStreamBtn: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
    borderWidth: 1,
  },
  simpleStreamBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  simpleStreamBtnDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  simpleStreamBtnText: {
    fontWeight: "700",
    fontSize: 12,
  },
  simpleDateText: {
    marginTop: 12,
    textAlign: "center",
    fontSize: 11,
  },
  dateText: {
    fontSize: 12,
    textAlign: "center",
  },
  venueContainer: {
    marginTop: 16,
    alignItems: "center",
  },
  venueText: {
    fontSize: 12,
  },
  headerScorersContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: -10,
  },
  headerScorersColumn: {
    flex: 1,
    alignItems: "center",
  },
  headerSoccerBallContainer: {
    paddingHorizontal: 16,
  },
  headerSoccerBallEmoji: {
    fontSize: 16,
  },
  headerScorerText: {
    fontSize: 13,
    textAlign: "center",
    marginVertical: 1,
  },
  scorersContainer: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  scorersTitle: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
  },
  scorersBox: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  scorersColumn: {
    flex: 1,
  },
  scorersHeader: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  scorerText: {
    fontSize: 12,
    textAlign: "center",
    marginBottom: 4,
  },
  noScorers: {
    fontSize: 12,
    textAlign: "center",
    fontStyle: "italic",
  },
  soccerBallContainer: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  soccerBallEmoji: {
    fontSize: 24,
  },
  tabContent: {
    minHeight: 200,
  },
  comingSoonText: {
    fontSize: 16,
    textAlign: "center",
    marginTop: 40,
  },
  teamTabHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  teamTabLogo: {
    width: 48,
    height: 48,
    marginRight: 16,
  },
  teamTabInfo: {
    flex: 1,
  },
  teamTabName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  teamTabDescription: {
    fontSize: 14,
  },
  // Play-by-play styles
  playContainer: {
    marginVertical: 8,
    borderRadius: 12,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  playHeader: {
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playMainInfo: {
    flex: 1,
    marginRight: 16,
  },
  playTeamsScore: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  teamScoreDisplay: {
    flexDirection: "row",
    alignItems: "center",
  },
  teamLogoSmall: {
    width: 20,
    height: 20,
    marginHorizontal: 4,
  },
  scoreSmall: {
    fontSize: 14,
    fontWeight: "bold",
  },
  scoreSeparator: {
    fontSize: 14,
    fontWeight: "bold",
    marginHorizontal: 8,
  },
  playSummary: {
    flex: 1,
  },
  playTimePeriod: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  playPeriod: {
    fontSize: 12,
    fontWeight: "600",
    marginRight: 8,
  },
  playClock: {
    fontSize: 12,
    fontWeight: "600",
  },
  playDescription: {
    fontSize: 14,
    marginBottom: 4,
  },
  scoreIndicator: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#ff6b35",
    backgroundColor: "rgba(255, 107, 53, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  playToggle: {
    padding: 8,
  },
  toggleIcon: {
    fontSize: 16,
    fontWeight: "bold",
  },
  playDetails: {
    padding: 16,
    paddingTop: 0,
  },
  playDetailsContent: {
    alignItems: "center",
  },
  playDetailsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
  },
  miniFieldContainer: {
    marginRight: 16,
  },
  playEventInfo: {
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    width: "100%",
  },
  // Landscape Mini Field styles (exact replica of web version)
  miniField: {
    width: 180,
    height: 120, // Landscape orientation - wider than tall
    marginVertical: 16,
    alignSelf: "center",
  },
  fieldContainer: {
    width: "100%",
    height: "100%",
    backgroundColor: "#2d5a2d",
    borderRadius: 8,
    position: "relative",
    overflow: "hidden",
  },
  fieldOutline: {
    position: "absolute",
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderWidth: 2,
    borderColor: "white",
    borderRadius: 4,
  },
  centerLine: {
    position: "absolute",
    left: "50%",
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: "white",
    marginLeft: -1,
  },
  centerCircleMini: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 40,
    height: 40,
    borderWidth: 2,
    borderColor: "white",
    borderRadius: 20,
    marginLeft: -20,
    marginTop: -20,
  },
  penaltyAreaLeft: {
    position: "absolute",
    left: 4,
    top: "25%",
    bottom: "25%",
    width: 30,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: "white",
  },
  penaltyAreaRight: {
    position: "absolute",
    right: 4,
    top: "25%",
    bottom: "25%",
    width: 30,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: "white",
  },
  goalAreaLeft: {
    position: "absolute",
    left: 4,
    top: "37.5%",
    bottom: "37.5%",
    width: 15,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: "white",
  },
  goalAreaRight: {
    position: "absolute",
    right: 4,
    top: "37.5%",
    bottom: "37.5%",
    width: 15,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: "white",
  },
  goalLeft: {
    position: "absolute",
    left: 2,
    top: "42.5%",
    bottom: "42.5%",
    width: 4,
    backgroundColor: "white",
  },
  goalRight: {
    position: "absolute",
    right: 2,
    top: "42.5%",
    bottom: "42.5%",
    width: 4,
    backgroundColor: "white",
  },
  eventMarker: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#ff6b35",
    borderWidth: 2,
    borderColor: "white",
    marginTop: -6,
    marginLeft: -6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  ballEndMarker: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: -4,
    marginLeft: -4,
    opacity: 0.8,
  },
  goalMarker: {
    backgroundColor: "#00ff00",
  },
  cardMarker: {
    backgroundColor: "#ffff00",
  },
  redCardMarker: {
    backgroundColor: "#ff0000",
  },
  shotMarker: {
    backgroundColor: "#ffa500",
  },
  substitutionMarker: {
    backgroundColor: "#0080ff",
  },
  offsideMarker: {
    backgroundColor: "#800080",
  },
  // Pitch rendering styles (matching scoreboard.js)
  pitchesWrapper: {
    marginTop: 20,
  },
  pitchContainer: {
    marginBottom: 30,
    alignItems: "center",
    width: "100%", // Allow full width for large pitch
  },
  teamInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  formTeamLogo: {
    width: 30,
    height: 30,
    marginHorizontal: 10,
  },
  teamFormation: {
    fontSize: 16,
    fontWeight: "bold",
  },
  footballPitch: {
    width: width - 20, // Full screen width with small padding (like web)
    height: Math.round(((width - 20) * 600) / 610), // Increased height for better player spacing
    backgroundColor: "#006400", // Exact green from CSS
    borderWidth: 2,
    borderColor: "#ffffff",
    borderRadius: 10, // Matches CSS
    position: "relative",
    alignSelf: "center",
  },
  centerCircle: {
    position: "absolute",
    top: "-0.5%", // Matches CSS positioning
    left: "50%",
    width: "40.98%", // 250px of 610px from CSS
    height: "20%", // Reduced height for half circle effect
    borderWidth: 2,
    borderColor: "#ffffff",
    borderTopLeftRadius: 0, // No rounding at top
    borderTopRightRadius: 0, // No rounding at top
    borderBottomLeftRadius: 120, // Round the bottom (flipped)
    borderBottomRightRadius: 120, // Round the bottom (flipped)
    backgroundColor: "transparent",
    transform: [{ translateX: "-50%" }],
  },
  penaltyBox: {
    position: "absolute",
    bottom: 0,
    left: "20%", // Matches CSS left: 20%
    width: "60%", // Matches CSS width: 60%
    height: "25%", // 125px of 500px from CSS
    borderWidth: 2,
    borderColor: "#ffffff",
    borderBottomWidth: 0,
    backgroundColor: "transparent",
  },
  goalBox: {
    position: "absolute",
    bottom: 0,
    left: "32.5%", // Matches CSS left: 32.5%
    width: "35%", // Matches CSS width: 35%
    height: "12%", // 60px of 500px from CSS
    borderWidth: 2,
    borderColor: "#ffffff",
    borderBottomWidth: 0,
    backgroundColor: "transparent",
  },
  penaltyBoxCircle: {
    position: "absolute",
    top: "63.5%", // Adjusted positioning for better visibility
    left: "50%",
    width: "24.59%", // 150px of 610px from CSS
    height: "12%", // Reduced height for half circle effect
    borderWidth: 2,
    borderColor: "#ffffff",
    borderTopLeftRadius: 60, // Only round the top (half of full radius)
    borderTopRightRadius: 60, // Only round the top
    borderBottomLeftRadius: 0, // No rounding at bottom
    borderBottomRightRadius: 0, // No rounding at bottom
    backgroundColor: "transparent",
    transform: [{ translateX: "-50%" }],
  },
  playerContainer: {
    alignItems: "center",
    position: "absolute", // Important for positioning
    marginLeft: 12.5,
    marginTop: 3.5
  },
  playerCircle: {
    width: 50, // Matches scoreboard.js exactly
    height: 50,
    borderRadius: 40,
    backgroundColor: "#ffffff", // White background like web
    borderWidth: 2.5,
    borderColor: "#000000", // Black border like web
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 5,
  },
  playerNumber: {
    color: "#000000", // Black text like web
    fontSize: 15, // Slightly larger to match 1.2rem
    fontWeight: "bold",
  },
  playerName: {
    fontSize: 9, // Matches 0.9rem from web
    color: "#ffffff",
    textAlign: "center",
    textShadowColor: "#000000", // Black text shadow like web
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
    width: 80,
  },
  subsBox: {
    width: width - 20, // Match the pitch width
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    alignSelf: "center",
  },
  subsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  subsTeamLogo: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  subsTitle: {
    fontSize: 14,
    fontWeight: "bold",
  },
  subsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between", // Ensure equal spacing
  },
  subsListItemContainer: {
    width: "48%", // Match the previous width setting
    marginBottom: 8,
    flexGrow: 0,
    flexShrink: 0,
  },
  subsListItem: {
    fontSize: 16, // Reduced from 18 to 16 for better fit
    marginBottom: 2, // Reduced since we have container spacing
  },
  jerseyNumber: {
    fontWeight: "bold",
    fontSize: 16, // Match the subsListItem font size
  },
  subArrow: {
    color: "#ff0000", // Red arrow for subbed out players
    fontWeight: "bold",
    fontSize: 16,
  },
  subArrowIn: {
    color: "#00ff00", // Green arrow for subbed in players
    fontWeight: "bold",
    fontSize: 16,
  },
  subDetails: {
    fontSize: 12,
    marginTop: 2,
    marginLeft: 4,
  },
  subTime: {
    fontWeight: "bold",
    color: "#666",
  },
  subOut: {
    fontStyle: "italic",
    opacity: 0.8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  playerHoverCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 16,
    minWidth: 300,
    maxWidth: 350, // Increased width for longer names
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.5,
    shadowRadius: 3.84,
    elevation: 5,
  },
  hoverTeamLogo: {
    width: 70,
    height: 70,
    marginBottom: 15,
  },
  hoverPlayerName: {
    alignItems: "center", // Changed from row to center everything
    marginBottom: 12,
  },
  hoverJersey: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  hoverName: {
    fontSize: 18,
    fontWeight: "bold",
  },
  playerStatsContainer: {
    alignItems: "center",
  },
  playerStat: {
    fontSize: 14,
    marginBottom: 4,
  },
  // Stats Section Styles (exact 1:1 replica of scoreboard.js)
  matchStatsContainer: {
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statsSection: {
    padding: 16,
    marginBottom: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statsHeader: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
  },
  statsTeams: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  statsTeamHome: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  statsTeamAway: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-end",
  },
  statsTeamLogo: {
    width: 30,
    height: 30,
    marginHorizontal: 8,
  },
  statsTeamName: {
    fontSize: 14,
    fontWeight: "600",
  },
  statsSection: {
    marginBottom: 20,
  },
  statsSectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 12,
  },
  possessionSection: {
    alignItems: "center",
    marginBottom: 16,
  },
  possessionCircleContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  possessionCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    position: "relative",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  possessionBackground: {
    position: "absolute",
    width: "100%",
    height: "100%",
    borderRadius: 60,
  },
  possessionFill: {
    position: "absolute",
    height: "100%",
    borderRadius: 60,
  },
  possessionCenter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    position: "absolute",
    zIndex: 10,
    borderWidth: 2,
    borderColor: "#fff",
  },
  possessionCenterText: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  // New possession styles
  statsSectionInner: {
    marginBottom: 20,
  },
  possessionDisplay: {
    alignItems: "center",
    marginBottom: 16,
    width: "100%",
  },
  possessionBar: {
    width: 200,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#ddd",
    position: "relative",
    overflow: "hidden",
    marginBottom: 12,
  },
  possessionBarFill: {
    position: "absolute",
    height: "100%",
    borderRadius: 10,
  },
  possessionBarFillAway: {
    left: "auto",
  },
  possessionTextContainer: {
    alignItems: "center",
  },
  possessionText: {
    fontSize: 14,
    fontWeight: "600",
  },
  // New possession circle styles
  possessionCircleContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  possessionCircle: {
    width: 120,
    height: 120,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  possessionSvg: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  possessionCenter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: "center",
    alignItems: "center",
    position: "absolute",
    zIndex: 10,
    backgroundColor: "#fff",
  },
  possessionValues: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    gap: 50,
  },
  possessionTeam: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  possessionColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  possessionTeamText: {
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
    fontWeight: "bold",
    minWidth: 30,
    textAlign: "center",
  },
  statsValueAway: {
    // Away team value on left
  },
  statsValueHome: {
    // Home team value on right
  },
  statsBarContainer: {
    flex: 1,
    marginHorizontal: 12,
    alignItems: "center",
  },
  statsBar: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    flexDirection: "row",
    marginBottom: 4,
  },
  statsBarFill: {
    height: "100%",
  },
  statsBarFillAway: {
    // Away team fill (left side)
  },
  statsBarFillHome: {
    // Home team fill (right side)
  },
  statsLabel: {
    fontSize: 12,
    textAlign: "center",
  },
  // Head to Head Styles
  h2hContainer: {
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    marginTop: 20,
  },
  h2hHeader: {
    alignItems: "center",
    marginBottom: 16,
  },
  h2hTitle: {
    fontSize: 16,
    fontWeight: "bold",
  },
  h2hMatches: {
    gap: 12,
  },
  h2hMatch: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  h2hMatchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  h2hDate: {
    fontSize: 12,
    fontWeight: "600",
  },
  h2hCompetition: {
    fontSize: 12,
  },
  h2hMatchTeams: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  h2hTeam: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  h2hTeamReverse: {
    justifyContent: "flex-end",
  },
  h2hTeamLogo: {
    width: 20,
    height: 20,
    marginHorizontal: 6,
  },
  h2hTeamName: {
    fontSize: 12,
    fontWeight: "600",
  },
  h2hScore: {
    fontSize: 14,
    fontWeight: "bold",
    marginHorizontal: 16,
  },
  h2hNoData: {
    fontSize: 14,
    textAlign: "center",
    fontStyle: "italic",
    padding: 20,
    marginBottom: 12,
    width: "100%", // Take full width
  },
  hoverJersey: {
    fontSize: 28, // Slightly smaller
    fontWeight: "bold",
    marginBottom: 4, // Add space below jersey number
    color: "#666",
  },
  hoverName: {
    fontSize: 30, // Slightly smaller but still prominent
    fontWeight: "600",
    textAlign: "center",
    flexWrap: "wrap", // Allow text wrapping
    paddingHorizontal: 8, // Add some padding
  },
  playerStatsContainer: {
    alignItems: "center",
  },
  playerStat: {
    fontSize: 20,
    marginVertical: 2,
    textAlign: "center",
  },
  // Stream-related styles - MLB popup style
  streamButton: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: "center",
  },
  streamButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  // Stream Modal - Popup overlay style
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  streamModalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    flex: 1,
    textAlign: "center",
  },
  streamCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  streamCloseText: {
    fontSize: 20,
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
  streamWebView: {
    flex: 1,
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
  streamLoadingText: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "600",
  },
  floatingChatButton: {
    position: "absolute",
    bottom: 30,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 999,
  },
  chatModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0)",
    paddingTop: 50,
  },
  chatModalContent: {
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  chatModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
  },
  chatModalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    flex: 1,
    marginRight: 10,
  },
  chatModalCloseButton: {
    padding: 5,
  },
  chatModalBody: {
    flex: 1,
  },
  loadMoreButton: {
    margin: 16,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  loadMoreText: {
    fontSize: 16,
    fontWeight: "600",
  },
  // Goal Share Card Styles
  goalShareCardOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    padding: 20,
  },
  goalShareCard: {
    overflow: "hidden",
  },
  goalCardContent: {
    padding: 20,
    borderRadius: 0,
    minHeight: 400,
  },
  goalShareCardActions: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginTop: 16,
  },
  goalShareCardButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    minWidth: 120,
    justifyContent: "center",
  },
  goalShareCardButtonText: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
    color: "#fff",
  },
  goalCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  goalCardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  goalCardTeamLogo: {
    width: 48,
    height: 48,
    marginRight: 16,
  },
  goalCardHeaderText: {
    flex: 1,
  },
  goalCardGoalText: {
    fontSize: 18,
    fontWeight: "bold",
    lineHeight: 22,
  },
  goalCardTime: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: 2,
    opacity: 0.9,
  },
  goalCardCloseButton: {
    padding: 8,
  },
  goalCardFieldContainer: {
    alignItems: "center",
    marginBottom: 20,
    marginTop: -15,
  },
  goalCardMiniField: {
    width: 240,
    height: 120,
  },
  miniFieldBackground: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    position: "relative",
  },
  miniFieldLines: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  miniFieldBorder: {
    position: "absolute",
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    borderWidth: 2,
    borderColor: "#ffffff",
    borderRadius: 4,
  },
  miniFieldCenterLine: {
    position: "absolute",
    left: "50%",
    top: 2,
    bottom: 2,
    width: 2,
    backgroundColor: "#ffffff",
    marginLeft: -1,
  },
  miniFieldCenterCircle: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 40,
    height: 40,
    borderWidth: 2,
    borderColor: "#ffffff",
    borderRadius: 20,
    marginTop: -20,
    marginLeft: -20,
  },
  miniFieldGoalBox: {
    position: "absolute",
    top: "25%",
    bottom: "25%",
    width: 30,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  miniFieldGoalBoxLeft: {
    left: 2,
    borderRightWidth: 2,
    borderLeftWidth: 0,
  },
  miniFieldGoalBoxRight: {
    right: 2,
    borderLeftWidth: 2,
    borderRightWidth: 0,
  },
  miniFieldGoal: {
    position: "absolute",
    top: "40%",
    bottom: "40%",
    width: 8,
    backgroundColor: "#ffffff",
  },
  miniFieldGoalLeft: {
    left: 2,
  },
  miniFieldGoalRight: {
    right: 2,
  },
  goalMarker: {
    position: "absolute",
    width: 12,
    height: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  goalMarkerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  goalCardScorer: {
    marginTop: -15,
    marginBottom: 22.5,
    alignItems: "center",
  },
  goalCardScorerName: {
    fontSize: 20,
    fontWeight: "bold",
    lineHeight: 28,
    textAlign: "center",
  },
  goalCardAssist: {
    fontSize: 16,
    opacity: 0.9,
    marginTop: 4,
    textAlign: "center",
  },
  goalCardScoreLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  goalCardScoreTeams: {
    flexDirection: "row",
    alignItems: "center",
  },
  goalCardScoreLogoSmall: {
    width: 24,
    height: 24,
    marginHorizontal: 8,
  },
  goalCardScoreText: {
    fontSize: 24,
    fontWeight: "bold",
  },
  goalCardBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  goalCardBadgeText: {
    fontSize: 14,
    fontWeight: "bold",
  },
  goalCardStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  goalCardStatItem: {
    width: "31%",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 8,
    borderRadius: 12,
    minHeight: 70,
  },
  goalCardStatValue: {
    fontSize: 20,
    fontWeight: "bold",
    lineHeight: 24,
  },
  goalCardStatLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
    opacity: 0.8,
  },
  goalShareCardActions: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 0, 0, 0.1)",
    gap: 15,
  },
  goalShareCardButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    minWidth: 120,
    justifyContent: "center",
  },
  goalShareCardButtonText: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
    color: "#fff",
  },

  // Enhanced Player Modal Styles
  enhancedModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  enhancedModalBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  enhancedPlayerModal: {
    width: "90%",
    maxWidth: 400,
    borderRadius: 16,
    padding: 0,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.44,
    shadowRadius: 10.32,
    elevation: 16,
    overflow: "hidden",
  },
  playerModalHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  playerHeaderInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playerModalCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  playerCloseButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  playerCloseText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
    lineHeight: 16,
  },
  playerModalNumber: {
    fontSize: 18,
    fontWeight: "bold",
  },
  playerModalNameSection: {
    flex: 1,
  },
  playerModalName: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 6,
  },
  playerTeamInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  playerTeamName: {
    fontSize: 14,
    marginLeft: 8,
    fontWeight: "bold",
  },
  playerPosition: {
    fontSize: 14,
    marginLeft: 4,
  },
  playerModalTeamLogo: {
    width: 20,
    height: 20,
  },
  playerModalScoreSection: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  scoreTeamContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  scoreTeamLogo: {
    width: 24,
    height: 24,
    marginHorizontal: 8,
  },
  scoreTeamScore: {
    fontSize: 24,
    fontWeight: "bold",
  },
  scoreDash: {
    fontSize: 20,
    marginHorizontal: 16,
  },
  playerModalStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "space-between",
    height: 275,
  },
  statBox: {
    width: "32%",
    height: "31%",
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    textAlign: "center",
  },
  statsLoadingContainer: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  statsLoadingText: {
    marginTop: 8,
    fontSize: 14,
  },
  statsErrorContainer: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  statsErrorText: {
    fontSize: 14,
  },
  playerModalFieldContainer: {
    padding: 20,
    alignItems: "center",
  },
  halfField: {
    width: 320,
    height: 180,
    borderWidth: 2,
    borderRadius: 4,
    position: "relative",
    backgroundColor: "#006400",
  },
  goal: {
    position: "absolute",
    top: 0,
    left: 137.5,
    width: 45,
    height: 4,
    backgroundColor: "#ffffff",
  },
  goalArea: {
    position: "absolute",
    top: -2,
    left: 105,
    width: 110,
    height: 40,
    borderWidth: 2,
    borderTopWidth: 0,
  },
  penaltyArea: {
    position: "absolute",
    top: -2,
    left: 70,
    width: 180,
    height: 70,
    borderWidth: 2,
    borderTopWidth: 0,
  },
  centerCircleHalf: {
    position: "absolute",
    bottom: -2,
    left: 105,
    width: 110,
    height: 50,
    borderTopLeftRadius: 90,
    borderTopRightRadius: 90,
    borderWidth: 2,
    borderBottomWidth: 0,
  },
  shotMarker: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    transform: [{ translateX: -7 }, { translateY: -7 }],
  },
  shareCardFooter: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
  },
  shareCardFooterText: {
    fontSize: 15,
    fontWeight: "800",
  },
  // ── Player Share Card styles ───────────────────────────────────────
  playerShareOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  playerShareCenterWrap: {
    alignItems: "center",
  },
  playerShareCard: {
    borderRadius: 0,
    overflow: "hidden",
  },
  playerShareHeader: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 2,
  },
  playerShareTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    gap: 8,
  },
  playerSharePosBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  playerSharePosBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  playerShareScoreWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  playerShareScoreLogo: {
    width: 18,
    height: 18,
  },
  playerShareScoreText: {
    fontSize: 15,
    fontWeight: "700",
  },
  playerShareNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  playerShareAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  playerShareInitials: {
    fontSize: 20,
    fontWeight: "800",
  },
  playerShareNameRight: {
    flex: 1,
    minWidth: 0,
  },
  playerShareSummaryRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 4,
  },
  playerShareSummaryCell: {
    alignItems: "center",
  },
  playerShareSummaryVal: {
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 20,
  },
  playerShareSummaryLbl: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  playerShareMetaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 2,
  },
  playerShareMetaLeft: {
    flex: 1,
    gap: 2,
  },
  playerSharePlayerName: {
    fontSize: 13,
    fontWeight: "700",
  },
  playerShareTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  playerShareTeamLogo: {
    width: 14,
    height: 14,
  },
  playerShareTeamName: {
    fontSize: 11,
    fontWeight: "500",
  },
  playerShareStatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  playerShareStatCell: {
    width: "33.333%",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  playerShareStatVal: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  playerShareStatLbl: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
    textAlign: "center",
  },
  playerShareFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: "flex-end",
  },
  playerShareFooterBrand: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  playerShareActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
    paddingHorizontal: 4,
  },
  playerShareActionBtn: {
    minWidth: 132,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 28,
    gap: 6,
  },
  playerShareActionBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  // ── Player modal header actions row ────────────────────────────────
  playerModalHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  playerShareButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
});

export default UECLGameDetailsScreen;

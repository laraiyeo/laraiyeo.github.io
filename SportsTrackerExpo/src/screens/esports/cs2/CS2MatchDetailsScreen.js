import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Animated,
} from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons, FontAwesome6 } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";
import { getLiveMatchData } from "../../../services/cs2MatchService";

const { width: screenWidth } = Dimensions.get("window");

const CS2MatchDetailsScreen = ({ navigation, route }) => {
  const { colors, theme } = useTheme();
  const { matchId, matchData: basicMatchData } = route.params;
  const [liveMatchData, setLiveMatchData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStreamIndex, setSelectedStreamIndex] = useState(0);
  const [expandedTeam, setExpandedTeam] = useState(null); // null, 'team1', or 'team2'
  const roundCarouselRef = useRef(null);
  const streamInitialized = useRef(false);

  useEffect(() => {
    loadLiveMatchData();

    // Auto-refresh every 5 seconds for live data
    const interval = setInterval(loadLiveMatchData, 5000);
    return () => clearInterval(interval);
  }, [matchId]);

  const loadLiveMatchData = async () => {
    try {
      if (!loading) setRefreshing(true);

      const liveData = await getLiveMatchData(matchId, basicMatchData);
      setLiveMatchData(liveData);

      // Only auto-select first stream on very first load, never reset after user has made a selection
      if (
        liveData.basicMatch?.streams?.length > 0 &&
        !streamInitialized.current
      ) {
        setSelectedStreamIndex(0);
        streamInitialized.current = true;
      }
    } catch (error) {
      console.error("Error loading live match data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    await loadLiveMatchData();
  };

  const formatRoundTime = (timeMs) => {
    const seconds = Math.floor(timeMs / 1000);
    if (seconds >= 60) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
    }
    return `${(seconds / 10).toFixed(1)}s`;
  };

  const getHealthBarColor = (health) => {
    if (health > 75) return "#4CAF50"; // Green
    if (health > 50) return "#FFC107"; // Yellow
    if (health > 25) return "#FF9800"; // Orange
    return "#F44336"; // Red
  };

  // CS2 weapon icon mapping - converts weapon names to SVG file names
  const getCS2WeaponIconName = (weaponName) => {
    if (!weaponName) return null;

    // Convert to lowercase and remove spaces/dashes/underscores
    const cleanWeapon = weaponName.toLowerCase().replace(/[\s\-_]/g, "");

    // Map weapon names to SVG file names (based on the C++ mapping and available SVGs)
    const weaponIconMap = {
      // Pistols
      deagle: "deagle",
      deserteagle: "deagle",
      elite: "elite",
      fiveseven: "fiveseven",
      glock18: "glock",
      hkp2000: "hkp2000",
      p2000: "hkp2000",
      p250: "p250",
      cz75auto: "cz75a",
      tec9: "tec9",
      usp: "usps",
      usps: "usps",
      uspsilencer: "usps",
      revolver: "revolver",

      // Rifles
      ak47: "ak47",
      aug: "aug",
      famas: "famas",
      galilar: "galilar",
      galil: "galilar",
      m4a1: "m4a1",
      m4a4: "m4a1",
      m4a1silencer: "m4a1silencer",
      m4a1s: "m4a1silencer",
      sg556: "sg556",
      sg553: "sg556",

      // Sniper Rifles
      awp: "awp",
      g3sg1: "g3sg1",
      scar20: "scar20",
      ssg08: "ssg08",
      scout: "ssg08",

      // SMGs
      bizon: "bizon",
      mac10: "mac10",
      mp5sd: "mp5sd",
      mp7: "mp7",
      mp9: "mp9",
      p90: "p90",
      ump45: "ump451",
      ump: "ump451",

      // Shotguns
      mag7: "mag7",
      nova: "nova",
      sawedoff: "sawedoff",
      xm1014: "xm1014",

      // Machine Guns
      m249: "m249",
      negev: "negev",

      // Grenades
      flashbang: "flashbang",
      hegrenade: "hegrenade",
      he: "hegrenade",
      smokegrenade: "smokegrenade",
      smoke: "smokegrenade",
      molotov: "molotov",
      incgrenade: "incgrenade0",
      incendiarygrenade: "incgrenade0",
      decoy: "decoy",

      // Knives
      knife: "knife",
      knifet: "knife_t",
      knifebayonet: "knife_bayonet",
      knifebutterfly: "knife_butterfly",
      knifecanis: "knife_canis",
      knifecord: "knife_cord",
      knifecss: "knife_css",
      knifefalchion: "knife_falchion",
      knifeflip: "knife_flip",
      knifegut: "knife_gut",
      knifegypsyjackknife: "knife_gypsy_jackknife",
      knifekarambit: "knife_karambit",
      knifem9bayonet: "knife_m9_bayonet",
      knifeoutdoor: "knife_outdoor",
      knifepush: "knife_push",
      knifeskeleton: "knife_skeleton",
      knifestiletto: "knife_stiletto",
      knifesurvivalbowie: "knife_survival_bowie",
      knifetactical: "knife_tactical",
      knifeursus: "knife_ursus",
      knifewidowmaker: "knife_widowmaker",

      // Special
      c4: "c4",
      bomb: "bomb",
      taser: "taser",
    };

    return weaponIconMap[cleanWeapon] || null;
  };

  // CS2 Weapon PNG Images Map
  const CS2WeaponPNGs = {
    // Pistols
    deagle: require("../../../../assets/icons/deagle.png"),
    elite: require("../../../../assets/icons/elite.png"),
    fiveseven: require("../../../../assets/icons/fiveseven.png"),
    glock: require("../../../../assets/icons/glock.png"),
    hkp2000: require("../../../../assets/icons/hkp2000.png"),
    p250: require("../../../../assets/icons/p250.png"),
    cz75a: require("../../../../assets/icons/cz75a.png"),
    tec9: require("../../../../assets/icons/tec9.png"),
    usps: require("../../../../assets/icons/usp_silencer.png"),
    revolver: require("../../../../assets/icons/revolver.png"),

    // Rifles
    ak47: require("../../../../assets/icons/ak47.png"),
    aug: require("../../../../assets/icons/aug.png"),
    famas: require("../../../../assets/icons/famas.png"),
    galilar: require("../../../../assets/icons/galilar.png"),
    m4a1: require("../../../../assets/icons/m4a1.png"),
    m4a1silencer: require("../../../../assets/icons/m4a1_silencer.png"),
    sg556: require("../../../../assets/icons/sg556.png"),

    // Sniper Rifles
    awp: require("../../../../assets/icons/awp.png"),
    g3sg1: require("../../../../assets/icons/g3sg1.png"),
    scar20: require("../../../../assets/icons/scar20.png"),
    ssg08: require("../../../../assets/icons/ssg08.png"),

    // SMGs
    bizon: require("../../../../assets/icons/bizon.png"),
    mac10: require("../../../../assets/icons/mac10.png"),
    mp5sd: require("../../../../assets/icons/mp5sd.png"),
    mp7: require("../../../../assets/icons/mp7.png"),
    mp9: require("../../../../assets/icons/mp9.png"),
    p90: require("../../../../assets/icons/p90.png"),
    ump451: require("../../../../assets/icons/ump451.png"),

    // Shotguns
    mag7: require("../../../../assets/icons/mag7.png"),
    nova: require("../../../../assets/icons/nova.png"),
    sawedoff: require("../../../../assets/icons/sawedoff.png"),
    xm1014: require("../../../../assets/icons/xm1014.png"),

    // Machine Guns
    m249: require("../../../../assets/icons/m249.png"),
    negev: require("../../../../assets/icons/negev.png"),

    // Grenades
    flashbang: require("../../../../assets/icons/flashbang.png"),
    hegrenade: require("../../../../assets/icons/hegrenade.png"),
    smokegrenade: require("../../../../assets/icons/smokegrenade.png"),
    molotov: require("../../../../assets/icons/molotov.png"),
    incgrenade0: require("../../../../assets/icons/incgrenade0.png"),
    decoy: require("../../../../assets/icons/decoy.png"),

    // Knives
    knife: require("../../../../assets/icons/knife.png"),
    knife_t: require("../../../../assets/icons/knife_t.png"),
    knife_bayonet: require("../../../../assets/icons/knife_bayonet.png"),
    knife_butterfly: require("../../../../assets/icons/knife_butterfly.png"),
    knife_canis: require("../../../../assets/icons/knife_canis.png"),
    knife_cord: require("../../../../assets/icons/knife_cord.png"),
    knife_css: require("../../../../assets/icons/knife_css.png"),
    knife_falchion: require("../../../../assets/icons/knife_falchion.png"),
    knife_flip: require("../../../../assets/icons/knife_flip.png"),
    knife_gut: require("../../../../assets/icons/knife_gut.png"),
    knife_gypsy_jackknife: require("../../../../assets/icons/knife_gypsy_jackknife.png"),
    knife_karambit: require("../../../../assets/icons/knife_karambit.png"),
    knife_m9_bayonet: require("../../../../assets/icons/knife_m9_bayonet.png"),
    knife_outdoor: require("../../../../assets/icons/knife_outdoor.png"),
    knife_push: require("../../../../assets/icons/knife_push.png"),
    knife_skeleton: require("../../../../assets/icons/knife_skeleton.png"),
    knife_stiletto: require("../../../../assets/icons/knife_stiletto.png"),
    knife_survival_bowie: require("../../../../assets/icons/knife_survival_bowie.png"),
    knife_tactical: require("../../../../assets/icons/knife_tactical.png"),
    knife_ursus: require("../../../../assets/icons/knife_ursus.png"),
    knife_widowmaker: require("../../../../assets/icons/knife_widowmaker.png"),

    // Special
    c4: require("../../../../assets/icons/c4.png"),
    bomb: require("../../../../assets/icons/bomb.png"),
    taser: require("../../../../assets/icons/taser.png"),
  };

  // Get CS2 weapon icon - returns PNG image source or fallback Ionicon
  const getCS2WeaponIcon = (weaponName) => {
    const iconName = getCS2WeaponIconName(weaponName);

    // Return PNG image source if weapon is recognized
    if (iconName && CS2WeaponPNGs[iconName]) {
      return { type: "png", source: CS2WeaponPNGs[iconName] };
    }

    // Fallback to generic weapon categories with Ionicons
    if (!weaponName) return { type: "ionicon", name: "help" };

    const weapon = weaponName.toLowerCase();
    if (
      weapon.includes("awp") ||
      weapon.includes("scout") ||
      weapon.includes("ssg08")
    ) {
      return { type: "ionicon", name: "telescope" };
    }
    if (
      weapon.includes("ak") ||
      weapon.includes("m4") ||
      weapon.includes("rifle")
    ) {
      return { type: "ionicon", name: "rifle" };
    }
    if (
      weapon.includes("glock") ||
      weapon.includes("usp") ||
      weapon.includes("p250") ||
      weapon.includes("pistol")
    ) {
      return { type: "ionicon", name: "nuclear" };
    }
    if (weapon.includes("knife")) {
      return { type: "ionicon", name: "cut" };
    }
    if (
      weapon.includes("grenade") ||
      weapon.includes("he") ||
      weapon.includes("flash") ||
      weapon.includes("smoke")
    ) {
      return { type: "ionicon", name: "radio-button-on" };
    }

    return { type: "ionicon", name: "flash" }; // generic weapon icon
  };

  // Determine if stream URL is from Twitch
  const isTwitchStream = (url) => {
    if (!url) return false;
    return url.toLowerCase().includes("twitch.tv");
  };

  // Create proper Twitch embed URL based on official Twitch documentation
  const createTwitchEmbedUrl = (stream) => {
    if (!stream) return null;

    // Extract channel name from various possible stream URL formats
    let channelName = null;

    // If embed_url is already provided, try to extract channel from it
    if (stream.embed_url) {
      const embedUrl = stream.embed_url;

      // Check if it's already a proper Twitch player URL
      if (embedUrl.includes("player.twitch.tv")) {
        // Extract channel parameter if it exists
        const channelMatch = embedUrl.match(/[?&]channel=([^&]+)/);
        if (channelMatch) {
          channelName = channelMatch[1];
        }
      }

      // Check if it's a regular Twitch URL
      else if (embedUrl.includes("twitch.tv/")) {
        const urlMatch = embedUrl.match(/twitch\.tv\/([^/?]+)/);
        if (urlMatch) {
          channelName = urlMatch[1];
        }
      }
    }

    // Try to get channel name from stream.name or stream.channel
    if (!channelName && stream.name) {
      channelName = stream.name.toLowerCase().replace(/[^a-z0-9_]/g, "");
    }

    if (!channelName && stream.channel) {
      channelName = stream.channel;
    }

    // Fallback to a cleaned version of the stream name
    if (!channelName) {
      channelName = "twitchdev"; // Fallback channel
    }

    // Create proper Twitch player embed URL according to official documentation
    // Determine the parent domain based on environment
    let parentDomain = "localhost";

    if (typeof window !== "undefined" && window.location) {
      parentDomain = window.location.hostname;
    }

    // Handle different development environments
    const parentDomains = [
      parentDomain,
      "localhost",
      "127.0.0.1",
      "exp.host", // Expo web
      "snack.expo.dev", // Expo Snack
    ]
      .filter(Boolean)
      .join("&parent=");

    return `https://player.twitch.tv/?channel=${encodeURIComponent(
      channelName
    )}&parent=${parentDomains}&muted=false&autoplay=true`;
  };

  // Check if URL is from YouTube
  const isYouTubeStream = (url) => {
    if (!url) return false;
    return (
      url.toLowerCase().includes("youtube.com") ||
      url.toLowerCase().includes("youtu.be")
    );
  };

  // Create proper YouTube embed URL for mobile WebView
  const createYouTubeEmbedUrl = (stream) => {
    if (!stream || !stream.embed_url) return null;

    const embedUrl = stream.embed_url;
    let videoId = null;
    let existingParams = "";

    // Extract video ID from various YouTube URL formats
    if (embedUrl.includes("/embed/")) {
      const match = embedUrl.match(/\/embed\/([^?&]+)/);
      if (match) videoId = match[1];

      // Preserve existing parameters like 'si' parameter
      const paramMatch = embedUrl.match(/\?(.+)$/);
      if (paramMatch) {
        existingParams = paramMatch[1];
      }
    } else if (embedUrl.includes("watch?v=")) {
      const match = embedUrl.match(/[?&]v=([^&]+)/);
      if (match) videoId = match[1];
    } else if (embedUrl.includes("youtu.be/")) {
      const match = embedUrl.match(/youtu\.be\/([^?&]+)/);
      if (match) videoId = match[1];
    }

    if (!videoId) return embedUrl; // Fallback to original URL

    // Build parameters according to YouTube documentation
    const params = new URLSearchParams(existingParams);

    // Add essential parameters for mobile WebView (don't override existing ones)
    if (!params.has("autoplay")) params.set("autoplay", "1");
    if (!params.has("controls")) params.set("controls", "1"); // Enable controls for better UX
    if (!params.has("rel")) params.set("rel", "0"); // Don't show related videos
    if (!params.has("modestbranding")) params.set("modestbranding", "1"); // Reduce YouTube branding
    if (!params.has("playsinline")) params.set("playsinline", "1"); // Play inline on iOS

    // Add origin parameter to identify the embedder (required to prevent "embedder.identity.missing.referrer" error)
    if (!params.has("origin")) {
      // Determine the origin based on environment
      let origin = "localhost";
      if (typeof window !== "undefined" && window.location) {
        origin = window.location.hostname;
      }

      // For mobile apps, use a generic origin
      if (origin === "localhost" || !origin) {
        origin = "localhost";
      }

      params.set("origin", `https://${origin}`);
    }

    // Create the final URL
    return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
  };

  // Get the appropriate stream URL - handle different platforms appropriately
  const getStreamEmbedUrl = (stream) => {
    if (!stream) return null;

    // Handle YouTube streams with special mobile-friendly parameters
    if (stream.embed_url && isYouTubeStream(stream.embed_url)) {
      return createYouTubeEmbedUrl(stream);
    }

    // If the stream has an embed_url and it's not from Twitch or YouTube, use it directly
    if (stream.embed_url && !isTwitchStream(stream.embed_url)) {
      return stream.embed_url;
    }

    // If it's a Twitch stream or no embed_url, use the Twitch converter
    return createTwitchEmbedUrl(stream);
  };

  if (loading) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.text }]}>
          Loading live match...
        </Text>
      </View>
    );
  }

  if (!liveMatchData) {
    return (
      <View
        style={[styles.errorContainer, { backgroundColor: theme.background }]}
      >
        <Ionicons name="alert-circle" size={48} color={theme.textSecondary} />
        <Text style={[styles.errorText, { color: theme.text }]}>
          Unable to load live match data
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={loadLiveMatchData}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { basicMatch, snapshot, gameState } = liveMatchData;
  const team1Data = snapshot?.team_one;
  const team2Data = snapshot?.team_two;
  const streams = basicMatch?.streams || [];
  const selectedStream = streams[selectedStreamIndex];

  // Debug logging for streams
  if (streams.length > 0) {
    console.log(
      "Available streams:",
      streams.map((s, i) => ({
        index: i,
        name: s.name,
        original_url: s.embed_url,
        is_twitch: isTwitchStream(s.embed_url),
        is_youtube: isYouTubeStream(s.embed_url),
        final_url: getStreamEmbedUrl(s),
      }))
    );
    console.log("Selected stream index:", selectedStreamIndex);
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Match Header */}
      <View style={[styles.matchHeader, { backgroundColor: colors.card }]}>
        <View style={styles.matchHeaderContent}>
          {/* Map Background */}
          <Image
            source={{
              uri: `https://bo3.gg/img/maps/backgrounds/${
                snapshot?.map_name?.replace("de_", "") || "mirage"
              }.webp`,
            }}
            style={styles.mapBackground}
          />
          <View style={styles.mapOverlay} />

          {/* Match Info */}
          <View style={styles.matchInfo}>
            <Text style={[styles.mapName, { color: "#fff" }]}>
              {snapshot?.map_name?.replace("de_", "").charAt(0).toUpperCase() +
                snapshot?.map_name?.replace("de_", "").slice(1) || "Unknown"}
            </Text>

            {/* Team Score */}
            <View style={styles.teamScoreContainer}>
              <View style={styles.teamSection}>
                {basicMatch?.team1?.image_url ? (
                  <Image
                    source={{ uri: basicMatch.team1.image_url }}
                    style={styles.teamLogo}
                    resizeMode="contain"
                  />
                ) : (
                  <View
                    style={[
                      styles.teamLogo,
                      {
                        backgroundColor: colors.primary,
                        justifyContent: "center",
                        alignItems: "center",
                        borderRadius: 24,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "bold",
                        color: "white",
                      }}
                    >
                      {(basicMatch?.team1?.name || "T1")
                        .substring(0, 2)
                        .toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={[styles.teamName, { color: "#fff" }]}>
                  {basicMatch?.team1?.name || "Team 1"}
                </Text>

                {/* Team 1 Players Alive */}
                <View style={styles.teamPlayersContainer}>
                  <View style={styles.teamPlayersAlive}>
                    {[...Array(5)].map((_, i) => (
                      <Ionicons
                        key={`t1-${i}`}
                        name="person"
                        size={12}
                        color={
                          i < (team1Data?.players_alive || 0) ? "#fff" : "#666"
                        }
                      />
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.scoreSection}>
                <Text style={[styles.finalScore, { color: "#fff" }]}>
                  {team1Data?.score || 0} - {team2Data?.score || 0}
                </Text>
                <View
                  style={[styles.statusBadge, { backgroundColor: "#ff4444" }]}
                >
                  <Text style={styles.statusText}>
                    {formatRoundTime(snapshot?.round_time_remaining || 0)}
                  </Text>
                </View>

                {/* Players Remaining Text */}
                <Text style={[styles.playersRemainingText, { color: "#fff" }]}>
                  Players Remaining
                </Text>

                {/* Bomb Status */}
                {snapshot?.is_bomb_planted && (
                  <View style={styles.bombStatus}>
                    <Ionicons name="radio" size={14} color="#ff4444" />
                    <Text style={[styles.bombText, { color: "#ff4444" }]}>
                      Planted
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.teamSection}>
                {basicMatch?.team2?.image_url ? (
                  <Image
                    source={{ uri: basicMatch.team2.image_url }}
                    style={styles.teamLogo}
                    resizeMode="contain"
                  />
                ) : (
                  <View
                    style={[
                      styles.teamLogo,
                      {
                        backgroundColor: colors.secondary,
                        justifyContent: "center",
                        alignItems: "center",
                        borderRadius: 24,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "bold",
                        color: "white",
                      }}
                    >
                      {(basicMatch?.team2?.name || "T2")
                        .substring(0, 2)
                        .toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={[styles.teamName, { color: "#fff" }]}>
                  {basicMatch?.team2?.name || "Team 2"}
                </Text>

                {/* Team 2 Players Alive */}
                <View style={styles.teamPlayersContainer}>
                  <View
                    style={[
                      styles.teamPlayersAlive,
                      { flexDirection: "row-reverse" },
                    ]}
                  >
                    {[...Array(5)].map((_, i) => (
                      <Ionicons
                        key={`t2-${i}`}
                        name="person"
                        size={12}
                        color={
                          i < (team2Data?.players_alive || 0) ? "#fff" : "#666"
                        }
                      />
                    ))}
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Round Carousel */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.roundsScroll}
      >
        {/* Current Round Box */}
        <View
          style={[
            styles.roundCard,
            styles.currentRoundCard,
            {
              backgroundColor: theme.surface,
              borderColor: colors.primary,
              borderWidth: 2,
            },
          ]}
        >
          <Text style={[styles.currentRoundText, { color: theme.text }]}>
            Current Round
          </Text>
          <Text style={[styles.currentRoundNumber, { color: theme.text }]}>
            {snapshot?.round_number || 1}
          </Text>
        </View>

        {/* Previous Rounds */}
        {gameState?.rounds_results &&
          gameState.rounds_results.map((round, index) => {
            const winCondition = round.win_reason || "Elimination";
            const getCS2EndReasonIcon = (endReason) => {
              const iconMap = {
                BOMB_EXPLODED: "bomb",
                BOMB_DEFUSED: "wrench",
                TEAM_ELIMINATION: "skull",
                TARGET_SAVED: "clock",
              };
              return iconMap[endReason] || "skull";
            };

            const getCS2EndReasonDisplayText = (endReason) => {
              const textMap = {
                BOMB_EXPLODED: "BOMB",
                BOMB_DEFUSED: "DEFUSED",
                TEAM_ELIMINATION: "KILLS",
                TARGET_SAVED: "TIME",
              };
              return textMap[endReason] || "KILLS";
            };

            const winConditionIcon = getCS2EndReasonIcon(winCondition);

            let winningTeamNumber = 1;
            if (round.winning_team_name === basicMatch?.team2?.name) {
              winningTeamNumber = 2;
            } else if (round.winning_team_name === basicMatch?.team1?.name) {
              winningTeamNumber = 1;
            }

            return (
              <TouchableOpacity
                key={round.id || index}
                style={[
                  styles.roundCard,
                  {
                    backgroundColor: theme.surface,
                  },
                ]}
              >
                <Text style={[styles.roundNumber, { color: theme.text }]}>
                  Round {round.round_number}
                </Text>
                <View style={styles.roundWinnerSection}>
                  {winningTeamNumber === 1 ? (
                    basicMatch?.team1?.image_url ? (
                      <Image
                        source={{ uri: basicMatch.team1.image_url }}
                        style={styles.roundWinnerLogo}
                        resizeMode="contain"
                      />
                    ) : (
                      <View
                        style={[
                          styles.roundWinnerLogo,
                          {
                            backgroundColor: colors.primary,
                            justifyContent: "center",
                            alignItems: "center",
                            borderRadius: 12,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 8,
                            fontWeight: "bold",
                            color: "white",
                          }}
                        >
                          {(basicMatch?.team1?.name || "T1")
                            .substring(0, 1)
                            .toUpperCase()}
                        </Text>
                      </View>
                    )
                  ) : basicMatch?.team2?.image_url ? (
                    <Image
                      source={{ uri: basicMatch.team2.image_url }}
                      style={styles.roundWinnerLogo}
                      resizeMode="contain"
                    />
                  ) : (
                    <View
                      style={[
                        styles.roundWinnerLogo,
                        {
                          backgroundColor: colors.secondary,
                          justifyContent: "center",
                          alignItems: "center",
                          borderRadius: 12,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 8,
                          fontWeight: "bold",
                          color: "white",
                        }}
                      >
                        {(basicMatch?.team2?.name || "T2")
                          .substring(0, 1)
                          .toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View
                    style={[
                      styles.roundWinner,
                      { backgroundColor: theme.surfaceSecondary },
                    ]}
                  >
                    <View style={styles.winConditionContainer}>
                      <FontAwesome6
                        name={winConditionIcon}
                        size={12}
                        color={theme.text}
                        style={styles.winConditionIcon}
                      />
                      <Text
                        style={[styles.roundWinnerText, { color: theme.text }]}
                      >
                        {getCS2EndReasonDisplayText(winCondition)}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
      </ScrollView>

      {/* Stream Section */}
      {streams.length > 0 && (
        <View
          style={[
            styles.section,
            styles.sectionWithPadding,
            { backgroundColor: theme.surfaceSecondary },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Live Stream
          </Text>

          {/* Stream Player */}
          <View style={styles.streamContainer}>
            {selectedStream ? (
              <WebView
                source={{
                  uri: getStreamEmbedUrl(selectedStream),
                  headers: {
                    Referer: "https://localhost/",
                    "User-Agent":
                      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                  },
                }}
                style={styles.streamPlayer}
                allowsFullscreenVideo={true}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                scalesPageToFit={false}
                mixedContentMode="compatibility"
                thirdPartyCookiesEnabled={true}
                sharedCookiesEnabled={true}
                allowsBackForwardNavigationGestures={false}
                onError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.error("WebView error: ", nativeEvent);
                }}
                onHttpError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.error("WebView HTTP error: ", nativeEvent);
                }}
                onLoadStart={() => {
                  console.log(
                    "Loading stream:",
                    getStreamEmbedUrl(selectedStream)
                  );
                }}
              />
            ) : (
              <View
                style={[
                  styles.streamPlayer,
                  {
                    backgroundColor: theme.surface,
                    justifyContent: "center",
                    alignItems: "center",
                  },
                ]}
              >
                <Text style={[{ color: theme.textSecondary }]}>
                  No stream available
                </Text>
              </View>
            )}
          </View>

          {/* Stream Selection Buttons */}
          <View
            style={[
              styles.streamButtons,
              screenWidth < 400 && styles.streamButtonsSmall,
            ]}
          >
            {streams.slice(0, 3).map((stream, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.streamButton,
                  screenWidth < 400 && styles.streamButtonSmall,
                  {
                    borderColor:
                      selectedStreamIndex === index
                        ? colors.primary
                        : "transparent",
                    backgroundColor: theme.surface,
                  },
                ]}
                onPress={() => setSelectedStreamIndex(index)}
              >
                <View style={styles.streamButtonContent}>
                  {stream.channel_image_url && screenWidth >= 360 && (
                    <Image
                      source={{ uri: stream.channel_image_url }}
                      style={[
                        styles.streamChannelImage,
                        screenWidth < 400 && styles.streamChannelImageSmall,
                      ]}
                      resizeMode="cover"
                    />
                  )}
                  <Text
                    style={[
                      styles.streamName,
                      screenWidth < 400 && styles.streamNameSmall,
                      { color: theme.text },
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {stream.name}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Team Player Sections */}
      {team1Data && (
        <View
          style={[
            styles.section,
            styles.sectionWithPadding,
            { backgroundColor: theme.surfaceSecondary },
          ]}
        >
          <TouchableOpacity
            style={styles.teamSectionHeader}
            onPress={() =>
              setExpandedTeam(expandedTeam === "team1" ? null : "team1")
            }
          >
            <View style={styles.teamHeaderContent}>
              {basicMatch?.team1?.image_url ? (
                <Image
                  source={{ uri: basicMatch.team1.image_url }}
                  style={styles.teamHeaderLogo}
                  resizeMode="contain"
                />
              ) : (
                <View
                  style={[
                    styles.teamHeaderLogo,
                    {
                      backgroundColor: colors.primary,
                      justifyContent: "center",
                      alignItems: "center",
                      borderRadius: 12,
                    },
                  ]}
                >
                  <Text
                    style={{ fontSize: 8, fontWeight: "bold", color: "white" }}
                  >
                    {(basicMatch?.team1?.name || "T1")
                      .substring(0, 1)
                      .toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                {basicMatch?.team1?.name} Players
              </Text>
            </View>
            <Ionicons
              name={expandedTeam === "team1" ? "chevron-up" : "chevron-down"}
              size={20}
              color={theme.text}
            />
          </TouchableOpacity>

          {team1Data.player_states?.map((player, index) => (
            <View
              key={index}
              style={[styles.playerCard, { backgroundColor: theme.surface }]}
            >
              {/* Collapsed View */}
              <View style={styles.playerCardCollapsed}>
                <View style={styles.playerInfo}>
                  {/* Player Image with 1:1 crop */}
                  <View
                    style={[
                      styles.playerImageContainer,
                      { opacity: player.is_alive ? 1 : 0.5 },
                    ]}
                  >
                    {player.fixture?.player_image_url ? (
                      <Image
                        source={{ uri: player.fixture.player_image_url }}
                        style={styles.playerImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={[
                          styles.playerAvatar,
                          { backgroundColor: colors.primary },
                        ]}
                      >
                        <Text style={styles.playerAvatarText}>
                          {player.fixture.name.substring(0, 2).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.playerName,
                      { color: theme.text, opacity: player.is_alive ? 1 : 0.5 },
                    ]}
                  >
                    {player.fixture.name}
                  </Text>
                </View>

                <View style={styles.playerStats}>
                  {/* Weapon */}
                  {(() => {
                    const weaponIcon = getCS2WeaponIcon(
                      player.primary_weapon || player.secondary_weapon
                    );
                    return weaponIcon.type === "png" ? (
                      <Image
                        source={weaponIcon.source}
                        style={[
                          styles.weaponIcon,
                          {
                            transform: [{ scaleX: -1 }],
                            tintColor: theme.text,
                          },
                        ]}
                        resizeMode="contain"
                      />
                    ) : (
                      <Ionicons
                        name={weaponIcon.name}
                        size={16}
                        color={theme.surface}
                      />
                    );
                  })()}

                  {/* HP Bar */}
                  <View style={styles.healthContainer}>
                    <View style={styles.healthBarBackground}>
                      <View
                        style={[
                          styles.healthBar,
                          {
                            width: `${Math.max(
                              0,
                              Math.min(100, player.health)
                            )}%`,
                            backgroundColor: getHealthBarColor(player.health),
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.healthText, { color: theme.text }]}>
                      {player.health}
                    </Text>
                  </View>

                  {/* Kills/Assists */}
                  <View style={styles.killsAssistsContainer}>
                    <Text style={[styles.killsText, { color: theme.text }]}>
                      {player.kills_in_round}/{player.assists_in_round}
                    </Text>
                    <Text
                      style={[
                        styles.killsAssistsLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      K/A
                    </Text>
                  </View>
                </View>
              </View>

              {/* Expanded View */}
              {expandedTeam === "team1" && (
                <View style={styles.playerCardExpanded}>
                  <View style={styles.expandedStats}>
                    <Text
                      style={[
                        styles.expandedStatText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Money: ${player.balance}
                    </Text>
                    <Text
                      style={[
                        styles.expandedStatText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      K/D/A: {player.kills}/{player.deaths}/{player.assists}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Team 2 Players */}
      {team2Data && (
        <View
          style={[
            styles.section,
            styles.sectionWithPadding,
            { backgroundColor: theme.surfaceSecondary },
          ]}
        >
          <TouchableOpacity
            style={styles.teamSectionHeader}
            onPress={() =>
              setExpandedTeam(expandedTeam === "team2" ? null : "team2")
            }
          >
            <View style={styles.teamHeaderContent}>
              {basicMatch?.team2?.image_url ? (
                <Image
                  source={{ uri: basicMatch.team2.image_url }}
                  style={styles.teamHeaderLogo}
                  resizeMode="contain"
                />
              ) : (
                <View
                  style={[
                    styles.teamHeaderLogo,
                    {
                      backgroundColor: colors.secondary,
                      justifyContent: "center",
                      alignItems: "center",
                      borderRadius: 12,
                    },
                  ]}
                >
                  <Text
                    style={{ fontSize: 8, fontWeight: "bold", color: "white" }}
                  >
                    {(basicMatch?.team2?.name || "T2")
                      .substring(0, 1)
                      .toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                {basicMatch?.team2?.name} Players
              </Text>
            </View>
            <Ionicons
              name={expandedTeam === "team2" ? "chevron-up" : "chevron-down"}
              size={20}
              color={theme.text}
            />
          </TouchableOpacity>

          {team2Data.player_states?.map((player, index) => (
            <View
              key={index}
              style={[styles.playerCard, { backgroundColor: theme.surface }]}
            >
              {/* Collapsed View */}
              <View style={styles.playerCardCollapsed}>
                <View style={styles.playerInfo}>
                  {/* Player Image with 1:1 crop */}
                  <View
                    style={[
                      styles.playerImageContainer,
                      { opacity: player.is_alive ? 1 : 0.5 },
                    ]}
                  >
                    {player.fixture?.player_image_url ? (
                      <Image
                        source={{ uri: player.fixture.player_image_url }}
                        style={styles.playerImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={[
                          styles.playerAvatar,
                          { backgroundColor: colors.primary },
                        ]}
                      >
                        <Text style={styles.playerAvatarText}>
                          {player.fixture.name.substring(0, 2).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.playerName,
                      { color: theme.text, opacity: player.is_alive ? 1 : 0.5 },
                    ]}
                  >
                    {player.fixture.name}
                  </Text>
                </View>

                <View style={styles.playerStats}>
                  {/* Weapon */}
                  {(() => {
                    const weaponIcon = getCS2WeaponIcon(
                      player.primary_weapon || player.secondary_weapon
                    );
                    return weaponIcon.type === "png" ? (
                      <Image
                        source={weaponIcon.source}
                        style={[
                          styles.weaponIcon,
                          {
                            transform: [{ scaleX: -1 }],
                            tintColor: theme.text,
                          },
                        ]}
                        resizeMode="contain"
                      />
                    ) : (
                      <Ionicons
                        name={weaponIcon.name}
                        size={16}
                        color={theme.surface}
                      />
                    );
                  })()}

                  {/* HP Bar */}
                  <View style={styles.healthContainer}>
                    <View style={styles.healthBarBackground}>
                      <View
                        style={[
                          styles.healthBar,
                          {
                            width: `${Math.max(
                              0,
                              Math.min(100, player.health)
                            )}%`,
                            backgroundColor: getHealthBarColor(player.health),
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.healthText, { color: theme.text }]}>
                      {player.health}
                    </Text>
                  </View>

                  {/* Kills/Assists */}
                  <View style={styles.killsAssistsContainer}>
                    <Text style={[styles.killsText, { color: theme.text }]}>
                      {player.kills_in_round}/{player.assists_in_round}
                    </Text>
                    <Text
                      style={[
                        styles.killsAssistsLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      K/A
                    </Text>
                  </View>
                </View>
              </View>

              {/* Expanded View */}
              {expandedTeam === "team2" && (
                <View style={styles.playerCardExpanded}>
                  <View style={styles.expandedStats}>
                    <Text
                      style={[
                        styles.expandedStatText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Money: ${player.balance}
                    </Text>
                    <Text
                      style={[
                        styles.expandedStatText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      K/D/A: {player.kills}/{player.deaths}/{player.assists}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 16,
    marginTop: 10,
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "white",
    fontWeight: "600",
  },
  matchHeader: {
    margin: 16,
    borderRadius: 12,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  matchHeaderContent: {
    position: "relative",
    height: 175,
  },
  mapBackground: {
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  mapOverlay: {
    position: "absolute",
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  matchInfo: {
    marginTop: -5,
    position: "absolute",
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  mapName: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  teamScoreContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  teamSection: {
    alignItems: "center",
    flex: 1,
  },
  teamLogo: {
    width: 48,
    height: 48,
    marginBottom: 8,
  },
  teamName: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  scoreSection: {
    alignItems: "center",
    flex: 1,
  },
  finalScore: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 8,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  playersRemainingText: {
    fontSize: 10,
    fontWeight: "500",
    marginBottom: 4,
    marginTop: 8,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  playersAliveRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 4,
  },
  teamPlayersContainer: {
    marginTop: 8,
    alignItems: "center",
  },
  teamPlayersAlive: {
    flexDirection: "row",
    gap: 2,
  },
  bombStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  bombText: {
    fontSize: 10,
    fontWeight: "600",
  },

  roundsScroll: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  roundCard: {
    width: 120,
    padding: 12,
    borderRadius: 8,
    marginRight: 12,
    alignItems: "center",
  },
  roundNumber: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
  },
  roundWinnerSection: {
    alignItems: "center",
  },
  roundWinnerLogo: {
    width: 24,
    height: 24,
    marginBottom: 4,
  },
  roundWinner: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: -4,
  },
  winConditionContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  winConditionIcon: {
    marginRight: 2,
  },
  roundWinnerText: {
    fontSize: 9,
    fontWeight: "bold",
  },
  currentRoundCard: {
    width: 120,
    padding: 12,
    borderRadius: 8,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  currentRoundText: {
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
    marginTop: -5,
    marginBottom: 4,
  },
  currentRoundNumber: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
  },

  section: {
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
  },
  sectionWithPadding: {
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  teamSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  teamHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  teamHeaderLogo: {
    width: 24,
    height: 24,
  },

  streamContainer: {
    aspectRatio: 16 / 12,
    width: "100%",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 12,
  },
  streamPlayer: {
    flex: 1,
  },
  streamButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 4,
    flexWrap: "wrap",
  },
  streamButtonsSmall: {
    gap: 2,
  },
  streamButton: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    maxWidth: "32%",
  },
  streamButtonSmall: {
    paddingHorizontal: 4,
    paddingVertical: 6,
    minHeight: 36,
  },
  streamButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    width: "100%",
    maxWidth: "100%",
    justifyContent: "center",
  },
  streamChannelImage: {
    width: 18,
    height: 18,
    borderRadius: 9,
    flexShrink: 0,
  },
  streamChannelImageSmall: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  streamName: {
    fontSize: 9,
    fontWeight: "500",
    flex: 1,
    textAlign: "center",
    minWidth: 0,
  },
  streamNameSmall: {
    fontSize: 8,
  },
  playerCard: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  playerCardCollapsed: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  playerInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  playerImageContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: "hidden",
    marginRight: 12,
  },
  playerImage: {
    width: 32,
    height: 32,
    aspectRatio: 1, // 1:1 aspect ratio to crop the top portion
  },
  playerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  playerAvatarText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "white",
  },
  playerName: {
    fontSize: 14,
    fontWeight: "500",
  },
  playerStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  healthContainer: {
    alignItems: "center",
    minWidth: 60,
  },
  healthBarBackground: {
    width: 50,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: 4,
    overflow: "hidden",
  },
  healthBar: {
    height: "100%",
    borderRadius: 3,
    minWidth: 2,
  },
  healthText: {
    fontSize: 10,
    fontWeight: "500",
  },
  killsAssistsContainer: {
    alignItems: "center",
    minWidth: 40,
  },
  killsText: {
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  killsAssistsLabel: {
    fontSize: 8,
    fontWeight: "400",
    textAlign: "center",
    marginTop: 2,
  },
  weaponIcon: {
    width: 40,
    height: 30,
  },
  playerCardExpanded: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  expandedStats: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  expandedStatText: {
    fontSize: 12,
  },

  tabsContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
  },
  content: {
    padding: 16,
  },
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  gameCard: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  gameHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  gameTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  gameScore: {
    gap: 8,
  },
  gameTeam: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  gameTeamName: {
    fontSize: 14,
    fontWeight: "500",
  },
  gameTeamScore: {
    fontSize: 16,
    fontWeight: "bold",
  },
  tournamentCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tournamentTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  tournamentFormat: {
    fontSize: 12,
  },
  followButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "currentColor",
  },
  followButtonText: {
    fontSize: 12,
    fontWeight: "500",
    marginLeft: 4,
  },
  teamStats: {
    marginBottom: 24,
  },
  teamStatsTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  playerStat: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  playerName: {
    fontSize: 14,
    fontWeight: "500",
  },
  playerStats: {
    flexDirection: "row",
    gap: 12,
  },
  statItem: {
    fontSize: 12,
  },
});

export default CS2MatchDetailsScreen;

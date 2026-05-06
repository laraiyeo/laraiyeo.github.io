import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
} from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";
import { useFavorites } from "../../context/FavoritesContext";

const StandingsScreen = ({ route }) => {
  const { theme, colors, isDarkMode } = useTheme();
  const { isFavorite, toggleFavorite } = useFavorites();
  const navigation = useNavigation();

  const [selectedType, setSelectedType] = useState("DRIVERS");
  const [driverStandings, setDriverStandings] = useState([]);
  const [constructorStandings, setConstructorStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logoUrls, setLogoUrls] = useState({});

  const standingTypes = [
    { key: "DRIVERS", name: "Drivers" },
    { key: "CONSTRUCTORS", name: "Constructors" },
  ];

  const constructorColors = {
    Mercedes: "#00D7B6",
    "Red Bull": "#4781D7",
    Ferrari: "#ED1131",
    McLaren: "#F47600",
    Alpine: "#00A1E8",
    "Racing Bulls": "#6C98FF",
    "Aston Martin": "#229971",
    Williams: "#1878D8",
    Sauber: "#52E252",
    Haas: "#9C9FA2",
    Audi: "#F50537",
    Cadillac: "#909090",
  };

  const normalizeTeamName = (raw) => {
    if (!raw) return raw;
    const s = raw.toLowerCase();
    if (s.includes("red bull")) return "Red Bull";
    if (s.includes("haas")) return "Haas";
    if (s.includes("ferrari")) return "Ferrari";
    if (s.includes("mclaren")) return "McLaren";
    if (s.includes("mercedes")) return "Mercedes";
    if (s.includes("alpine")) return "Alpine";
    if (s.includes("racing bulls")) return "Racing Bulls";
    if (s.includes("audi")) return "Audi";
    if (s.includes("cadillac")) return "Cadillac";
    if (s.includes("williams")) return "Williams";
    if (s.includes("aston")) return "Aston Martin";
    return raw
      .replace(/ F1 Team$/i, "")
      .replace(/ Racing$/i, "")
      .trim();
  };

  // Helper to format color from API (adds # if missing)
  const formatColor = (color) => {
    if (!color) return "#000000";
    return color.startsWith("#") ? color : `#${color}`;
  };

  // Helper to get F1 team ID for favorites (use team name as ID for F1)
  const getF1TeamId = (teamName) => {
    if (!teamName) return null;
    // Use team name as ID for F1 since there's no consistent numeric ID
    return `f1_${teamName.toLowerCase().replace(/\s+/g, "_")}`;
  };

  // Helper to handle team favorite toggle
  const handleTeamFavoriteToggle = async (teamName, teamColor) => {
    if (!teamName) return;

    const teamId = getF1TeamId(teamName);
    try {
      await toggleFavorite({
        teamId: teamId,
        teamName: teamName,
        sport: "f1",
        leagueCode: "f1",
        teamColor: teamColor,
      });
    } catch (error) {
      console.error("Error toggling F1 team favorite:", error);
    }
  };

  useEffect(() => {
    fetchStandings();
  }, []);

  const fetchStandings = async () => {
    try {
      console.log("[StandingsScreen] Starting fetchStandings (cache-only)");
      setLoading(true);

      const STANDINGS_URL =
        "https://laraiyeogithubio-production-ed10.up.railway.app/standings/f1";
      const F1_STANDINGS_CACHE_KEY = "F1_STANDINGS_CACHE_KEY";
      const F1_STANDINGS_TTL = 1000 * 60 * 60; // 1 hour

      const fetchSharedStandings = async () => {
        try {
          const raw = await AsyncStorage.getItem(F1_STANDINGS_CACHE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.ts && Date.now() - parsed.ts < F1_STANDINGS_TTL) {
              console.log("[StandingsScreen] Using cached standings");
              return parsed.data?.data ?? parsed.data ?? parsed;
            }
          }

          console.log(
            "[StandingsScreen] Fetching shared standings from",
            STANDINGS_URL,
          );
          const resp = await fetch(STANDINGS_URL);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const payload = await resp.json();
          const actual = payload?.data ?? payload;
          try {
            await AsyncStorage.setItem(
              F1_STANDINGS_CACHE_KEY,
              JSON.stringify({ ts: Date.now(), data: actual }),
            );
          } catch (e) {
            console.warn(e);
          }
          return actual;
        } catch (err) {
          console.warn(
            "[StandingsScreen] Error fetching shared standings",
            err,
          );
          return null;
        }
      };

      const payload = await fetchSharedStandings();
      if (!payload) {
        console.warn("[StandingsScreen] No shared standings payload");
        setDriverStandings([]);
        setConstructorStandings([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Map drivers
      const driversArr = payload.drivers || payload.data?.drivers || [];
      const driversMap = payload.drivers_map || payload.data?.drivers_map || {};
      const driversByTeam =
        payload.drivers_by_team || payload.data?.drivers_by_team || {};

      const normalizedDrivers = driversArr.map((d) => {
        const num = d.driver_number?.toString();
        const map = driversMap?.[num] || {};
        // find team
        let teamNameRaw = null;
        let membersForTeam = null;
        for (const teamKey of Object.keys(driversByTeam || {})) {
          const members = driversByTeam[teamKey] || {};
          if (members && Object.prototype.hasOwnProperty.call(members, num)) {
            teamNameRaw = teamKey;
            membersForTeam = members;
            break;
          }
        }
        const lookup = normalizeTeamName(teamNameRaw) || null;
        const teamColor = formatColor(constructorColors[lookup]) || "#000000";

        return {
          position: d.position_current ?? d.position ?? null,
          driver: {
            id: num,
            name:
              map.name ||
              (membersForTeam ? membersForTeam[num] : null) ||
              map ||
              `#${num}`,
            firstName: "",
            lastName: "",
            headshot: map.headshot_url || null,
          },
          team: {
            name: lookup,
            color: teamColor,
          },
          points: d.points_current ?? d.points ?? 0,
        };
      });

      setDriverStandings(
        normalizedDrivers.sort((a, b) => (a.position || 0) - (b.position || 0)),
      );

      // Map constructors
      const teamsArr = payload.teams || payload.data?.teams || [];
      const constructors = teamsArr.map((t) => {
        const rawName = t.team_name || t.team || t.name;
        const driversObj = driversByTeam[rawName] || {};
        const driversList = Object.values(driversObj || {}).map((name) => name);
        const lookup = normalizeTeamName(rawName);
        return {
          position: t.position_current ?? t.position ?? null,
          id: lookup,
          name: lookup,
          displayName: rawName,
          color: formatColor(constructorColors[lookup]) || "#000000",
          points: t.points_current ?? t.points ?? 0,
          drivers: driversList,
        };
      });

      setConstructorStandings(
        constructors.sort((a, b) => (a.position || 0) - (b.position || 0)),
      );
    } catch (error) {
      console.error("Error fetching F1 standings (cache-based):", error);
      Alert.alert("Error", "Failed to load standings");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const convertToHttps = (url) => {
    if (url && url.startsWith("http://")) {
      return url.replace("http://", "https://");
    }
    return url;
  };

  // Build ESPN headshot URL from athlete ID
  const buildESPNHeadshotUrl = (athleteId) => {
    if (!athleteId) return null;
    return `https://a.espncdn.com/combiner/i?img=/i/headshots/rpm/players/full/${athleteId}.png&w=200`;
  };

  // Helper to get initials from a name
  const getInitials = (firstName = "", lastName = "") => {
    const first = firstName?.trim()?.[0] || "";
    const last = lastName?.trim()?.[0] || "";
    return (first + last).toUpperCase() || "--";
  };

  // Component for driver image with fallback to initials
  const DriverImage = ({ driver, teamColor }) => {
    const [imageError, setImageError] = useState(false);

    if (!driver.headshot || imageError) {
      return (
        <View
          style={[
            styles.driverImagePlaceholder,
            { backgroundColor: teamColor || theme.border },
          ]}
        >
          <Text
            allowFontScaling={false}
            style={[styles.driverInitials, { color: "#fff" }]}
          >
            {getInitials(driver.firstName, driver.lastName)}
          </Text>
        </View>
      );
    }

    return (
      <Image
        source={{ uri: driver.headshot }}
        style={[
          styles.driverImage,
          {
            backgroundColor: teamColor + "50" || theme.border,
            borderWidth: 1,
            borderColor: teamColor || theme.border,
          },
        ]}
        onError={() => setImageError(true)}
      />
    );
  };

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetchStandings();
  }, []);

  const renderDriverStanding = (standing) => (
    <TouchableOpacity
      key={`driver-${standing.position}`}
      style={[
        styles.standingItem,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
      onPress={() => {
        navigation.navigate("F1RacerDetails", {
          racerId: standing.driver.id,
          driverNumber: standing.driver.id,
          driverName: standing.driver.name,
          racerName: standing.driver.name,
          teamColor: standing.team.color,
        });
      }}
    >
      <View style={styles.rightGradientOverlay} pointerEvents="none">
        <Svg width="100%" height="100%" pointerEvents="none">
          <Defs>
            <SvgLinearGradient
              id={`standingsGrad-driver-${standing.driver.id || "x"}`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <Stop
                offset="0%"
                stopColor={standing.team?.color || theme.surface}
                stopOpacity="0"
              />
              <Stop
                offset="100%"
                stopColor={standing.team?.color || theme.surface}
                stopOpacity="0.72"
              />
            </SvgLinearGradient>
          </Defs>
          <Rect
            width="100%"
            height="100%"
            fill={`url(#standingsGrad-driver-${standing.driver.id || "x"})`}
          />
        </Svg>
      </View>
      <View style={styles.positionContainer}>
        <Text
          allowFontScaling={false}
          style={[styles.position, { color: theme.textSecondary }]}
        >
          {standing.position}
        </Text>
      </View>

      <View style={styles.driverInfo}>
        <DriverImage
          driver={standing.driver}
          teamColor={standing.team?.color}
        />

        <View style={styles.driverDetails}>
          <Text
            allowFontScaling={false}
            style={[styles.driverName, { color: theme.text }]}
            numberOfLines={1}
          >
            {standing.driver.name}
          </Text>
          <View style={styles.teamNameContainer}>
            {isFavorite(getF1TeamId(standing.team.name)) && (
              <TouchableOpacity
                onPress={() =>
                  handleTeamFavoriteToggle(
                    standing.team.name,
                    standing.team.color,
                  )
                }
                activeOpacity={0.7}
                style={styles.teamFavoriteButton}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.teamFavoriteIcon, { color: colors.primary }]}
                >
                  ★
                </Text>
              </TouchableOpacity>
            )}
            <Text
              allowFontScaling={false}
              style={[
                styles.teamName,
                {
                  color: isFavorite(getF1TeamId(standing.team.name))
                    ? colors.primary
                    : theme.textSecondary,
                },
              ]}
              numberOfLines={1}
            >
              {standing.team.name}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text
            allowFontScaling={false}
            style={[styles.statValue, { color: theme.text }]}
          >
            {standing.points}
          </Text>
          <Text
            allowFontScaling={false}
            style={[styles.statLabel, { color: theme.textSecondary }]}
          >
            PTS
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderConstructorStanding = (standing) => (
    <View
      key={`constructor-${standing.position}`}
      style={[
        styles.standingItem,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={styles.rightGradientOverlay} pointerEvents="none">
        <Svg width="100%" height="100%" pointerEvents="none">
          <Defs>
            <SvgLinearGradient
              id={`standingsGrad-ctor-${standing.id || "x"}`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <Stop
                offset="0%"
                stopColor={standing.color || theme.surface}
                stopOpacity="0"
              />
              <Stop
                offset="100%"
                stopColor={standing.color || theme.surface}
                stopOpacity="0.72"
              />
            </SvgLinearGradient>
          </Defs>
          <Rect
            width="100%"
            height="100%"
            fill={`url(#standingsGrad-ctor-${standing.id || "x"})`}
          />
        </Svg>
      </View>
      <View style={styles.positionContainer}>
        <Text
          allowFontScaling={false}
          style={[styles.position, { color: theme.textSecondary }]}
        >
          {standing.position}
        </Text>
      </View>

      <View style={styles.constructorInfo}>
        <ConstructorLogo name={standing.name} color={standing.color} />

        <View style={styles.constructorDetails}>
          <View style={styles.constructorNameContainer}>
            {isFavorite(getF1TeamId(standing.name)) && (
              <TouchableOpacity
                onPress={() =>
                  handleTeamFavoriteToggle(standing.name, standing.color)
                }
                activeOpacity={0.7}
                style={styles.constructorFavoriteButton}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.constructorFavoriteIcon,
                    { color: colors.primary },
                  ]}
                >
                  ★
                </Text>
              </TouchableOpacity>
            )}
            <Text
              allowFontScaling={false}
              style={[
                styles.constructorName,
                {
                  color: isFavorite(getF1TeamId(standing.name))
                    ? colors.primary
                    : theme.text,
                },
              ]}
              numberOfLines={1}
            >
              {standing.name}
            </Text>
          </View>
          <Text
            allowFontScaling={false}
            style={[styles.driversText, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {standing.drivers.join(", ")}
          </Text>
        </View>
      </View>

      <View style={styles.constructorStatsContainer}>
        <View style={styles.statItem}>
          <Text
            allowFontScaling={false}
            style={[styles.statValue, { color: theme.text }]}
          >
            {standing.points}
          </Text>
          <Text
            allowFontScaling={false}
            style={[styles.statLabel, { color: theme.textSecondary }]}
          >
            POINTS
          </Text>
        </View>
      </View>
    </View>
  );

  // Build constructor logo URL using the same mapping as teams.js
  const getConstructorLogo = (constructorName, forceWhite = false) => {
    if (!constructorName) return "";

    const nameMap = {
      McLaren: "mclaren",
      Ferrari: "ferrari",
      "Red Bull": "redbullracing",
      Mercedes: "mercedes",
      "Aston Martin": "astonmartin",
      Alpine: "alpine",
      Williams: "williams",
      RB: "rb",
      Haas: "haas",
      Sauber: "kicksauber",
    };

    const logoName =
      nameMap[constructorName] ||
      constructorName.toLowerCase().replace(/\s+/g, "");
    const variant = isDarkMode ? "logowhite" : "logoblack";
    const currentYear = new Date().getFullYear();
    return `https://media.formula1.com/image/upload/c_fit,h_1080/q_auto/v1740000000/common/f1/${currentYear}/${logoName}/${currentYear}${logoName}${variant}.webp`;
  };

  const getLogoUrl = (constructorName) => {
    return logoUrls[constructorName] || getConstructorLogo(constructorName);
  };

  const handleLogoError = (constructorName) => {
    const currentYear = new Date().getFullYear();
    const nameMap = {
      McLaren: "mclaren",
      Ferrari: "ferrari",
      "Red Bull": "redbullracing",
      Mercedes: "mercedes",
      "Aston Martin": "astonmartin",
      Alpine: "alpine",
      Williams: "williams",
      RB: "rb",
      Haas: "haas",
      Sauber: "kicksauber",
    };
    const variant = isDarkMode ? "logowhite" : "logoblack";
    const logoName =
      nameMap[constructorName] ||
      constructorName.toLowerCase().replace(/\s+/g, "");
    const fallbackUrl = `https://media.formula1.com/image/upload/c_fit,h_1080/q_auto/v1740000000/common/f1/${currentYear}/${logoName}/${currentYear}${logoName}${variant}.webp`;

    setLogoUrls((prev) => ({
      ...prev,
      [constructorName]: fallbackUrl,
    }));
  };

  const ConstructorLogo = ({ name, color }) => {
    const uri = getLogoUrl(name);
    if (!uri) {
      return (
        <View
          style={[
            styles.constructorInitialsContainer,
            { backgroundColor: color },
          ]}
        >
          <Text
            allowFontScaling={false}
            style={[styles.constructorInitials, { color: "#fff" }]}
          >
            {name
              .split(" ")
              .map((word) => word[0])
              .join("")
              .substring(0, 2)}
          </Text>
        </View>
      );
    }

    return (
      <Image
        source={{ uri }}
        style={styles.constructorLogoImage}
        resizeMode="contain"
        onError={() => handleLogoError(name)}
      />
    );
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      backgroundColor: colors.primary,
      paddingTop: 50,
      paddingBottom: 20,
      paddingHorizontal: 20,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: "bold",
      color: "#fff",
      textAlign: "center",
    },
    typeContainer: {
      flexDirection: "row",
      backgroundColor: theme.surface,
      marginHorizontal: 20,
      marginVertical: 15,
      borderRadius: 8,
      padding: 4,
    },
    typeButton: {
      flex: 1,
      paddingVertical: 12,
      alignItems: "center",
      borderRadius: 6,
    },
    activeTypeButton: {
      backgroundColor: colors.primary,
    },
    typeButtonText: {
      fontSize: 14,
      fontWeight: "600",
    },
    activeTypeButtonText: {
      color: "#fff",
    },
    inactiveTypeButtonText: {
      color: theme.textSecondary,
    },
    content: {
      flex: 1,
      paddingHorizontal: 20,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    loadingText: {
      marginTop: 10,
      fontSize: 16,
      color: theme.textSecondary,
    },
    standingItem: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      elevation: 5,
      overflow: "hidden",
    },
    positionContainer: {
      width: 30,
      alignItems: "center",
      marginRight: 10,
    },
    position: {
      fontSize: 12,
      fontWeight: "600",
    },
    teamColorBar: {
      width: 4,
      height: 50,
      borderRadius: 2,
      marginHorizontal: 12,
    },
    rightGradientOverlay: {
      position: "absolute",
      right: 0,
      top: 0,
      bottom: 0,
      width: "44%",
    },
    driverInfo: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
    },
    driverImage: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.border,
    },
    driverImagePlaceholder: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
    },
    driverInitials: {
      fontSize: 14,
      fontWeight: "bold",
    },
    driverDetails: {
      flex: 1,
      marginLeft: 12,
    },
    driverName: {
      fontSize: 16,
      fontWeight: "bold",
    },
    teamName: {
      fontSize: 12,
      marginTop: 2,
    },
    teamNameContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 2,
    },
    teamFavoriteButton: {
      paddingHorizontal: 4,
      paddingVertical: 2,
      marginRight: 4,
    },
    teamFavoriteIcon: {
      fontSize: 12,
      fontWeight: "bold",
    },
    constructorNameContainer: {
      flexDirection: "row",
      alignItems: "center",
    },
    constructorFavoriteButton: {
      paddingHorizontal: 4,
      paddingVertical: 2,
      marginRight: 6,
    },
    constructorFavoriteIcon: {
      fontSize: 14,
      fontWeight: "bold",
    },
    statsContainer: {
      flexDirection: "row",
      alignItems: "center",
    },
    statItem: {
      alignItems: "center",
      marginLeft: 16,
      minWidth: 35,
    },
    statValue: {
      fontSize: 16,
      fontWeight: "bold",
    },
    statLabel: {
      fontSize: 10,
      marginTop: 2,
    },
    constructorInfo: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
    },
    constructorLogoImage: {
      width: 40,
      height: 40,
    },
    constructorInitialsContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
    },
    constructorInitials: {
      fontSize: 14,
      fontWeight: "bold",
    },
    constructorDetails: {
      flex: 1,
      marginLeft: 12,
    },
    constructorName: {
      fontSize: 16,
      fontWeight: "bold",
    },
    driversText: {
      fontSize: 12,
      marginTop: 2,
    },
    constructorStatsContainer: {
      alignItems: "center",
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 40,
    },
    emptyText: {
      fontSize: 16,
      color: theme.textSecondary,
      textAlign: "center",
    },
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.typeContainer}>
          {standingTypes.map((type) => (
            <TouchableOpacity
              key={type.key}
              style={[
                styles.typeButton,
                selectedType === type.key && styles.activeTypeButton,
              ]}
              onPress={() => setSelectedType(type.key)}
            >
              <Text
                allowFontScaling={false}
                style={[
                  styles.typeButtonText,
                  selectedType === type.key
                    ? styles.activeTypeButtonText
                    : styles.inactiveTypeButtonText,
                ]}
              >
                {type.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text allowFontScaling={false} style={styles.loadingText}>
            Loading F1 Standings...
          </Text>
        </View>
      </View>
    );
  }

  const currentStandings =
    selectedType === "DRIVERS" ? driverStandings : constructorStandings;

  console.log(`[StandingsScreen] Render - selectedType: ${selectedType}`);
  console.log(
    `[StandingsScreen] Render - driverStandings.length: ${driverStandings.length}`,
  );
  console.log(
    `[StandingsScreen] Render - constructorStandings.length: ${constructorStandings.length}`,
  );
  console.log(
    `[StandingsScreen] Render - currentStandings.length: ${currentStandings.length}`,
  );

  return (
    <View style={styles.container}>
      <View style={styles.typeContainer}>
        {standingTypes.map((type) => (
          <TouchableOpacity
            key={type.key}
            style={[
              styles.typeButton,
              selectedType === type.key && styles.activeTypeButton,
            ]}
            onPress={() => setSelectedType(type.key)}
          >
            <Text
              allowFontScaling={false}
              style={[
                styles.typeButtonText,
                selectedType === type.key
                  ? styles.activeTypeButtonText
                  : styles.inactiveTypeButtonText,
              ]}
            >
              {type.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {currentStandings.length > 0 ? (
          currentStandings.map(
            selectedType === "DRIVERS"
              ? renderDriverStanding
              : renderConstructorStanding,
          )
        ) : (
          <View style={styles.emptyContainer}>
            <Text allowFontScaling={false} style={styles.emptyText}>
              No standings data available
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default StandingsScreen;

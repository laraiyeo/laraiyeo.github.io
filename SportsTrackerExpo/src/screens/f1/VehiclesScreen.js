import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../context/ThemeContext";

const VehiclesScreen = () => {
  const { theme, colors } = useTheme();
  const [constructors, setConstructors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logoUrls, setLogoUrls] = useState({});
  const [carUrls, setCarUrls] = useState({});

  // Team color mapping (same as teams.js)
  const getTeamColor = (constructorName) => {
    const colorMap = {
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

    return colorMap[constructorName] || "#000000";
  };

  // Get constructor logo (same as teams.js)
  const getConstructorLogo = (constructorName, forceWhite = false) => {
    if (!constructorName) {
      console.error("Constructor name is undefined in getConstructorLogo");
      return "";
    }

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

    const blackLogoConstructors = ["Williams", "Alpine", "Mercedes", "Sauber"];
    const logoColor =
      forceWhite || !blackLogoConstructors.includes(constructorName)
        ? "logowhite"
        : "logoblack";

    const logoName =
      nameMap[constructorName] ||
      constructorName.toLowerCase().replace(/\s+/g, "");

    // Use current year for logo URLs
    const currentYear = new Date().getFullYear();

    // Return current year URL
    return `https://media.formula1.com/image/upload/c_fit,h_1080/q_auto/v1740000000/common/f1/${currentYear}/${logoName}/${currentYear}${logoName}${logoColor}.webp`;
  };

  // Get constructor car (same as teams.js)
  const getConstructorCar = (constructorName) => {
    if (!constructorName) {
      console.error("Constructor name is undefined in getConstructorCar");
      return "";
    }

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

    const carName =
      nameMap[constructorName] ||
      constructorName.toLowerCase().replace(/\s+/g, "");

    // Use current year for car URLs
    const currentYear = new Date().getFullYear();

    // Return current year URL
    return `https://media.formula1.com/image/upload/c_lfill,w_3392/q_auto/v1740000000/common/f1/${currentYear}/${carName}/${currentYear}${carName}carright.webp`;
  };

  // Note: ESPN constructor fetch removed - use shared standings cache only

  // Shared standings cache constants
  const STANDINGS_URL =
    "https://laraiyeogithubio-production-ed10.up.railway.app/standings/f1";
  const F1_STANDINGS_CACHE_KEY = "F1_STANDINGS_CACHE_KEY";
  const F1_STANDINGS_TTL = 1000 * 60 * 60; // 1 hour

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
    // Fallback: strip common suffixes
    return raw
      .replace(/ F1 Team$/i, "")
      .replace(/ Racing$/i, "")
      .trim();
  };

  const fetchSharedStandings = async () => {
    try {
      // Try cache first
      const raw = await AsyncStorage.getItem(F1_STANDINGS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.ts && Date.now() - parsed.ts < F1_STANDINGS_TTL) {
          console.log("[VehiclesScreen] Using cached standings");
          // Normalize wrapper shapes (some payloads are { source, data: { teams: [...] } })
          const cached = parsed.data;
          return cached?.data ?? cached;
        }
      }

      // Not cached or expired — fetch from shared standings URL
      console.log(
        "[VehiclesScreen] Fetching shared standings from",
        STANDINGS_URL,
      );
      const resp = await fetch(STANDINGS_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const payload = await resp.json();

      // Normalize payload (some servers wrap under `data`)
      const actual = payload?.data ?? payload;

      // Cache the normalized payload with timestamp
      try {
        await AsyncStorage.setItem(
          F1_STANDINGS_CACHE_KEY,
          JSON.stringify({ ts: Date.now(), data: actual }),
        );
      } catch (e) {
        console.warn("[VehiclesScreen] Failed to cache standings", e);
      }

      return actual;
    } catch (error) {
      console.warn("[VehiclesScreen] Error fetching shared standings:", error);
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setLoading(true);
      const payload = await fetchSharedStandings();
      if (mounted && payload && payload.teams && payload.teams.length > 0) {
        // Map teams into the constructor-like state used in this screen
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
          // Fallback: strip common suffixes
          return raw
            .replace(/ F1 Team$/i, "")
            .replace(/ Racing$/i, "")
            .trim();
        };

        const constructorList = payload.teams.map((t, idx) => {
          const rawName = t.team_name || t.team || `Team ${idx + 1}`;
          const lookup = normalizeTeamName(rawName);
          return {
            id: lookup || `team-${idx}`,
            name: lookup,
            displayName: rawName,
            rank: t.position_current ?? t.position ?? idx + 1,
            points: parseInt(t.points_current ?? t.points ?? 0) || 0,
          };
        });
        setConstructors(constructorList);
        setLoading(false);
        return;
      }

      // If shared standings not available, stop loading and leave constructors empty
      console.warn(
        "[VehiclesScreen] Shared standings not available; not fetching ESPN source per config",
      );
      setConstructors([]);
      setLoading(false);
    };

    init();
    return () => {
      mounted = false;
    };
  }, []);

  const refreshStandings = async () => {
    setLoading(true);
    const payload = await fetchSharedStandings();
    if (payload && payload.teams && payload.teams.length > 0) {
      const constructorList = payload.teams.map((t, idx) => {
        const rawName = t.team_name || t.team || `Team ${idx + 1}`;
        const lookup = normalizeTeamName(rawName);
        return {
          id: lookup || `team-${idx}`,
          name: lookup,
          displayName: rawName,
          rank: t.position_current ?? t.position ?? idx + 1,
          points: parseInt(t.points_current ?? t.points ?? 0) || 0,
        };
      });
      setConstructors(constructorList);
    } else {
      setConstructors([]);
    }
    setLoading(false);
  };

  const getLogoUrl = (constructorName) => {
    return logoUrls[constructorName] || getConstructorLogo(constructorName);
  };

  const getCarUrlForConstructor = (constructorName) => {
    return carUrls[constructorName] || getConstructorCar(constructorName);
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
    const blackLogoConstructors = ["Williams", "Alpine", "Mercedes", "Sauber"];
    const logoColor = !blackLogoConstructors.includes(constructorName)
      ? "logowhite"
      : "logoblack";
    const logoName =
      nameMap[constructorName] ||
      constructorName.toLowerCase().replace(/\s+/g, "");
    const fallbackUrl = `https://media.formula1.com/image/upload/c_fit,h_1080/q_auto/v1740000000/common/f1/${currentYear}/${logoName}/${currentYear}${logoName}${logoColor}.webp`;

    setLogoUrls((prev) => ({
      ...prev,
      [constructorName]: fallbackUrl,
    }));
  };

  const handleCarError = (constructorName) => {
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
    const carName =
      nameMap[constructorName] ||
      constructorName.toLowerCase().replace(/\s+/g, "");
    const fallbackUrl = `https://media.formula1.com/image/upload/c_lfill,w_3392/q_auto/v1740000000/common/f1/${currentYear}/${carName}/${currentYear}${carName}carright.webp`;

    setCarUrls((prev) => ({
      ...prev,
      [constructorName]: fallbackUrl,
    }));
  };

  const renderConstructorCard = (constructor) => {
    const lookupName = constructor.name;
    const teamColor = getTeamColor(lookupName);
    const logoUrl = getLogoUrl(lookupName);
    const carUrl = getCarUrlForConstructor(lookupName);

    const blackTextConstructors = [
      "Williams",
      "Alpine",
      "Mercedes",
      "Sauber",
      "Haas",
    ];
    const needsBlackText = blackTextConstructors.includes(lookupName);

    const ordinal = (n) => {
      const s = ["th", "st", "nd", "rd"],
        v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    return (
      <View
        key={constructor.id}
        style={[styles.constructorCard, { backgroundColor: teamColor }]}
      >
        <View style={styles.cardHeader}>
          <Image
            source={{ uri: logoUrl }}
            style={styles.teamLogo}
            resizeMode="contain"
            onError={() => handleLogoError(constructor.name)}
          />

          <View style={styles.teamInfo}>
            <Text
              style={[
                styles.teamName,
                { color: needsBlackText ? "#000" : "#fff" },
              ]}
            >
              {constructor.displayName}
            </Text>
            <Text
              style={[
                styles.teamRank,
                { color: needsBlackText ? "#000" : "#fff" },
              ]}
            >
              {ordinal(constructor.rank)} Place
            </Text>
          </View>

          <View style={styles.rightCol}>
            <Text
              allowFontScaling={false}
              style={[
                styles.pointsValue,
                { color: needsBlackText ? "#000" : "#fff" },
              ]}
            >
              {constructor.points}
            </Text>
            <Text
              allowFontScaling={false}
              style={[
                styles.pointsLabel,
                { color: needsBlackText ? "#000" : "#fff" },
              ]}
            >
              PTS
            </Text>
          </View>
        </View>

        <View style={styles.carContainer}>
          <Image
            source={{ uri: carUrl }}
            style={styles.carImage}
            resizeMode="contain"
            onError={() => handleCarError(constructor.name)}
          />
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: theme.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: theme.text }]}>
          Loading vehicles...
        </Text>
      </View>
    );
  }

  if (!loading && constructors.length === 0) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: theme.background },
        ]}
      >
        <Text style={[styles.emptyText, { color: theme.text }]}>
          Standings not available
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={refreshStandings}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  console.log(
    `[VehiclesScreen] Render - constructors.length: ${constructors.length}`,
  );
  console.log("[VehiclesScreen] Render - loading:", loading);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.headerText, { color: theme.text }]}>
          Formula 1 Vehicles
        </Text>

        {constructors.map(renderConstructorCard)}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  headerText: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  constructorCard: {
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  teamLogo: {
    width: 57.5,
    height: 57.5,
    marginRight: 10,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  teamRank: {
    fontSize: 14,
    color: "#FFFFFF",
    opacity: 0.9,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statText: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  carContainer: {
    alignItems: "center",
    marginTop: 8,
  },
  carImage: {
    width: "100%",
    height: 120,
  },
  rightCol: {
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  pointsValue: {
    fontSize: 20,
    fontWeight: "800",
  },
  pointsLabel: {
    fontSize: 14,
    marginTop: -2,
  },
  emptyText: {
    fontSize: 16,
    marginBottom: 12,
  },
  retryButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  retryText: {
    color: "#fff",
    fontWeight: "700",
  },
});

export default VehiclesScreen;

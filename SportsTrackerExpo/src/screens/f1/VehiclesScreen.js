import React, { useState, useEffect, useCallback, useRef } from "react";
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
import { useFocusEffect } from "@react-navigation/native";

const VehiclesScreen = () => {
  const { theme, colors } = useTheme();
  const [selectedSeries, setSelectedSeries] = useState("F1");
  const [seriesLoaded, setSeriesLoaded] = useState(false);
  const [constructors, setConstructors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logoUrls, setLogoUrls] = useState({});
  const [carUrls, setCarUrls] = useState({});
  const lastLoadedSeriesRef = useRef(null);

  const seriesColors = {
    F1: {
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
    },
    NASCAR: {
      Chevrolet: "#FFD700",
      Ford: "#003399",
      Toyota: "#E60012",
    },
  };
  const SERIES_PREFERENCE_KEY = "SPORTS_TRACKER_SELECTED_SERIES";

  const getTeamColor = (constructorName) => {
    const colorMap = seriesColors[selectedSeries] || seriesColors.F1;
    return colorMap[constructorName] || "#000000";
  };

  const normalizeF1TeamName = (raw) => {
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

  const normalizeNASCARManufacturer = (raw) => {
    if (!raw) return raw;
    const s = raw.toLowerCase();
    if (s.includes("chevrolet")) return "Chevrolet";
    if (s.includes("ford")) return "Ford";
    if (s.includes("toyota")) return "Toyota";
    return raw.trim();
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

  // Shared standings cache constants
  const F1_STANDINGS_URL =
    "https://laraiyeogithubio-production-ed10.up.railway.app/f1/standings";
  const NASCAR_STANDINGS_URL =
    "https://laraiyeogithubio-production-ed10.up.railway.app/nascar/standings";
  const F1_STANDINGS_CACHE_KEY = "F1_STANDINGS_CACHE_KEY";
  const NASCAR_STANDINGS_CACHE_KEY = "NASCAR_STANDINGS_CACHE_KEY";
  const F1_STANDINGS_TTL = 1000 * 60 * 60; // 1 hour
  const NASCAR_STANDINGS_TTL = 1000 * 60 * 30; // 30 min

  const fetchSharedStandings = async (series) => {
    try {
      const isNASCAR = series === "NASCAR";
      const cacheKey = isNASCAR
        ? NASCAR_STANDINGS_CACHE_KEY
        : F1_STANDINGS_CACHE_KEY;
      const ttl = isNASCAR ? NASCAR_STANDINGS_TTL : F1_STANDINGS_TTL;
      const url = isNASCAR ? NASCAR_STANDINGS_URL : F1_STANDINGS_URL;

      const raw = await AsyncStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.ts && Date.now() - parsed.ts < ttl) {
          const cached = parsed.data;
          return cached?.data ?? cached;
        }
      }

      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const payload = await resp.json();
      const actual = payload?.data ?? payload;

      try {
        await AsyncStorage.setItem(
          cacheKey,
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

  const buildF1ConstructorList = (payload) => {
    const teamsArr = payload.teams || payload.data?.teams || [];
    return teamsArr.map((t, idx) => {
      const rawName = t.team_name || t.team || `Team ${idx + 1}`;
      const lookup = normalizeF1TeamName(rawName);
      return {
        id: lookup || `team-${idx}`,
        name: lookup,
        displayName: rawName,
        rank: t.position_current ?? t.position ?? idx + 1,
        points: parseInt(t.points_current ?? t.points ?? 0) || 0,
      };
    });
  };

  const buildNascarConstructorList = (payload) => {
    const manufacturers =
      payload.manufacturers || payload.data?.manufacturers || [];
    return manufacturers.map((manufacturer, idx) => {
      const name = normalizeNASCARManufacturer(manufacturer.manufacturer);
      return {
        id: name || `manufacturer-${idx}`,
        name,
        displayName: manufacturer.manufacturer || name,
        rank: manufacturer.position ?? idx + 1,
        points: parseInt(manufacturer.points ?? 0, 10) || 0,
        wins: parseInt(manufacturer.wins ?? 0, 10) || 0,
        behind:
          manufacturer.delta_leader === "LEADER"
            ? 0
            : parseInt(manufacturer.delta_leader ?? 0, 10) || 0,
        logo: manufacturer.logo || null,
      };
    });
  };

  const handleSeriesChange = async (series) => {
    setSeriesLoaded(true);
    setSelectedSeries(series);

    try {
      await AsyncStorage.setItem(SERIES_PREFERENCE_KEY, series);
    } catch (error) {
      console.warn("[VehiclesScreen] Failed to save series preference", error);
    }
  };

  useEffect(() => {
    if (!seriesLoaded) {
      return;
    }

    const hasLoadedData = constructors.length > 0;
    if (lastLoadedSeriesRef.current === selectedSeries && hasLoadedData) {
      setLoading(false);
      return;
    }

    let mounted = true;
    const init = async () => {
      setLoading(true);
      const payload = await fetchSharedStandings(selectedSeries);
      if (mounted && payload) {
        const constructorList =
          selectedSeries === "NASCAR"
            ? buildNascarConstructorList(payload)
            : buildF1ConstructorList(payload);
        setConstructors(constructorList);
        lastLoadedSeriesRef.current = selectedSeries;
        setLoading(false);
        return;
      }

      console.warn("[VehiclesScreen] Standings not available");
      setConstructors([]);
      setLoading(false);
    };

    init();
    return () => {
      mounted = false;
    };
  }, [selectedSeries, seriesLoaded, constructors.length]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let shouldFetch = true;

      setLoading(true);
      setSeriesLoaded(false);

      const restoreSeries = async () => {
        try {
          const savedSeries = await AsyncStorage.getItem(SERIES_PREFERENCE_KEY);
          const resolvedSeries =
            savedSeries === "F1" || savedSeries === "NASCAR"
              ? savedSeries
              : "F1";

          console.log(
            `[VehiclesScreen] page load selected series: ${resolvedSeries}`,
          );

          shouldFetch =
            lastLoadedSeriesRef.current !== resolvedSeries ||
            constructors.length === 0;

          if (active) {
            setSelectedSeries(resolvedSeries);
            setSeriesLoaded(true);
            if (!shouldFetch) {
              setLoading(false);
            }
          }

          if (!savedSeries) {
            try {
              await AsyncStorage.setItem(SERIES_PREFERENCE_KEY, "F1");
            } catch (error) {
              console.warn(
                "[VehiclesScreen] Failed to save default series preference",
                error,
              );
            }
          }
        } catch (error) {
          console.warn(
            "[VehiclesScreen] Failed to restore series preference",
            error,
          );
        } finally {
          if (active) {
            if (!shouldFetch) {
              setLoading(false);
            }
          }
        }
      };

      restoreSeries();

      return () => {
        active = false;
        setSeriesLoaded(false);
      };
    }, []),
  );

  const refreshStandings = async () => {
    setLoading(true);
    const payload = await fetchSharedStandings(selectedSeries);
    if (payload) {
      const constructorList =
        selectedSeries === "NASCAR"
          ? buildNascarConstructorList(payload)
          : buildF1ConstructorList(payload);
      setConstructors(constructorList);
    } else {
      setConstructors([]);
    }
    setLoading(false);
  };

  const getLogoUrl = (constructorName, overrideLogo) => {
    return (
      overrideLogo ||
      logoUrls[constructorName] ||
      getConstructorLogo(constructorName)
    );
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
    const logoUrl = getLogoUrl(lookupName, constructor.logo);
    const carUrl = getCarUrlForConstructor(lookupName);

    const blackTextConstructors = [
      "Williams",
      "Alpine",
      "Mercedes",
      "Sauber",
      "Haas",
    ];
    const needsBlackText =
      blackTextConstructors.includes(lookupName) ||
      (selectedSeries === "NASCAR" && lookupName === "Chevrolet");

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

        {selectedSeries === "F1" ? (
          <View style={styles.carContainer}>
            <Image
              source={{ uri: carUrl }}
              style={styles.carImage}
              resizeMode="contain"
              onError={() => handleCarError(constructor.name)}
            />
          </View>
        ) : (
          <View style={styles.nascarBodyRow}>
            <View style={styles.nascarStatBlock}>
              <Text
                allowFontScaling={false}
                style={[
                  styles.nascarStatValue,
                  { color: needsBlackText ? "#000" : "#fff" },
                ]}
              >
                {constructor.wins ?? 0}
              </Text>
              <Text
                allowFontScaling={false}
                style={[
                  styles.nascarStatLabel,
                  { color: needsBlackText ? "#000" : "#fff" },
                ]}
              >
                WINS
              </Text>
            </View>
            <View style={styles.nascarStatBlock}>
              <Text
                allowFontScaling={false}
                style={[
                  styles.nascarStatValue,
                  { color: needsBlackText ? "#000" : "#fff" },
                ]}
              >
                {constructor.behind ?? 0}
              </Text>
              <Text
                allowFontScaling={false}
                style={[
                  styles.nascarStatLabel,
                  { color: needsBlackText ? "#000" : "#fff" },
                ]}
              >
                BEHIND
              </Text>
            </View>
          </View>
        )}
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

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.seriesContainer}>
        <TouchableOpacity
          style={[
            styles.seriesButton,
            selectedSeries === "F1" && { backgroundColor: colors.primary },
          ]}
          onPress={() => handleSeriesChange("F1")}
        >
          <Text
            style={[
              styles.seriesButtonText,
              { color: selectedSeries === "F1" ? "#fff" : theme.textSecondary },
            ]}
          >
            Formula 1
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.seriesButton,
            selectedSeries === "NASCAR" && { backgroundColor: colors.primary },
          ]}
          onPress={() => handleSeriesChange("NASCAR")}
        >
          <Text
            style={[
              styles.seriesButtonText,
              {
                color:
                  selectedSeries === "NASCAR" ? "#fff" : theme.textSecondary,
              },
            ]}
          >
            NASCAR
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.headerText, { color: theme.text }]}>
          {selectedSeries === "F1"
            ? "Formula 1 Vehicles"
            : "NASCAR Manufacturers"}
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  seriesContainer: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 4,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  seriesButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  seriesButtonText: {
    fontSize: 14,
    fontWeight: "700",
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
  nascarBodyRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.18)",
  },
  nascarStatBlock: {
    flex: 1,
    alignItems: "center",
  },
  nascarStatValue: {
    fontSize: 20,
    fontWeight: "800",
  },
  nascarStatLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
    letterSpacing: 0.4,
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

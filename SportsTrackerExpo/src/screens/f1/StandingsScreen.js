import React, { useState, useEffect, useCallback, useRef } from "react";
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
import { useNavigation, useFocusEffect } from "@react-navigation/native";
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
  const SERIES_PREFERENCE_KEY = "SPORTS_TRACKER_SELECTED_SERIES";

  const [selectedType, setSelectedType] = useState("DRIVERS");
  const [selectedSeries, setSelectedSeries] = useState("F1"); // 'F1' or 'NASCAR'
  const [seriesLoaded, setSeriesLoaded] = useState(false);
  const [driverStandings, setDriverStandings] = useState([]);
  const [constructorStandings, setConstructorStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logoUrls, setLogoUrls] = useState({});
  const lastLoadedSeriesRef = useRef(null);

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
    if (!color) return null;
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

  const handleSeriesChange = async (series) => {
    setSeriesLoaded(true);
    setSelectedSeries(series);

    try {
      await AsyncStorage.setItem(SERIES_PREFERENCE_KEY, series);
    } catch (error) {
      console.warn("[StandingsScreen] Failed to save series preference", error);
    }
  };

  useEffect(() => {
    if (!seriesLoaded) {
      return;
    }

    const hasLoadedData =
      driverStandings.length > 0 || constructorStandings.length > 0;
    if (lastLoadedSeriesRef.current === selectedSeries && hasLoadedData) {
      setLoading(false);
      return;
    }

    fetchStandings();
    // refresh when series or type changes
  }, [
    selectedSeries,
    selectedType,
    seriesLoaded,
    driverStandings.length,
    constructorStandings.length,
  ]);

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
            `[StandingsScreen] page load selected series: ${resolvedSeries}`,
          );

          shouldFetch =
            lastLoadedSeriesRef.current !== resolvedSeries ||
            driverStandings.length === 0 ||
            constructorStandings.length === 0;

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
                "[StandingsScreen] Failed to save default series preference",
                error,
              );
            }
          }
        } catch (error) {
          console.warn(
            "[StandingsScreen] Failed to restore series preference",
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

  useEffect(() => {
    if (selectedSeries === "F1" && selectedType === "OWNERS") {
      setSelectedType("CONSTRUCTORS");
    } else if (selectedSeries === "NASCAR" && selectedType === "CONSTRUCTORS") {
      setSelectedType("OWNERS");
    }
  }, [selectedSeries, selectedType]);

  const fetchStandings = async () => {
    try {
      setLoading(true);

      if (selectedSeries === "NASCAR") {
        // Fetch NASCAR standings and cache
        const NASCAR_URL =
          "https://sportsheart-motorsports.up.railway.app/nascar/standings";
        const NASCAR_CACHE_KEY = "NASCAR_STANDINGS_CACHE_KEY";
        const NASCAR_TTL = 1000 * 60 * 30; // 30 min

        const raw = await AsyncStorage.getItem(NASCAR_CACHE_KEY);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed?.ts && Date.now() - parsed.ts < NASCAR_TTL) {
              const payload = parsed.data;
              mapNascarPayload(payload);
              setLoading(false);
              setRefreshing(false);
              return;
            }
          } catch (e) {
            console.warn(e);
          }
        }

        const resp = await fetch(NASCAR_URL);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const payload = await resp.json();
        const actual = payload?.data ?? payload;
        try {
          await AsyncStorage.setItem(
            NASCAR_CACHE_KEY,
            JSON.stringify({ ts: Date.now(), data: actual }),
          );
        } catch (e) {
          console.warn(e);
        }
        mapNascarPayload(actual);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // reuse existing F1 cache + mapping logic
      const STANDINGS_URL =
        "https://sportsheart-motorsports.up.railway.app/f1/standings";
      const F1_STANDINGS_CACHE_KEY = "F1_STANDINGS_CACHE_KEY";
      const F1_STANDINGS_TTL = 1000 * 60 * 60; // 1 hour

      const fetchSharedStandings = async () => {
        try {
          const raw = await AsyncStorage.getItem(F1_STANDINGS_CACHE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.ts && Date.now() - parsed.ts < F1_STANDINGS_TTL) {
              return parsed.data?.data ?? parsed.data ?? parsed;
            }
          }

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
        setDriverStandings([]);
        setConstructorStandings([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Map drivers (existing F1 mapping)
      const driversArr = payload.drivers || payload.data?.drivers || [];
      const driversMap = payload.drivers_map || payload.data?.drivers_map || {};
      const driversByTeam =
        payload.drivers_by_team || payload.data?.drivers_by_team || {};

      const normalizedDrivers = driversArr.map((d) => {
        const num = d.driver_number?.toString();
        const map = driversMap?.[num] || {};
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
        const teamColor = formatColor(constructorColors[lookup]) || null;

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
          color: formatColor(constructorColors[lookup]) || null,
          points: t.points_current ?? t.points ?? 0,
          drivers: driversList,
        };
      });

      setConstructorStandings(
        constructors.sort((a, b) => (a.position || 0) - (b.position || 0)),
      );
    } catch (error) {
      console.error("Error fetching standings:", error);
      Alert.alert("Error", "Failed to load standings");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Map a NASCAR payload (drivers + owners) into driverStandings and constructorStandings (owners)
  const mapNascarPayload = (payload) => {
    if (!payload) {
      setDriverStandings([]);
      setConstructorStandings([]);
      return;
    }

    const driversArr = payload.drivers || payload.data?.drivers || [];
    const ownersArr = payload.owners || payload.data?.owners || [];
    const serverDriversMap = payload.maps?.drivers || {};

    // helper to find owner name by car number
    const findOwnerByCarNo = (carNo) => {
      if (!carNo) return null;
      for (const o of ownersArr || []) {
        // common possible fields
        if (o.vehicle_number && o.vehicle_number.toString() === carNo) return o;
        if (o.car_no && o.car_no.toString() === carNo) return o;
        if (o.vehicles && Array.isArray(o.vehicles)) {
          if (o.vehicles.find((v) => v?.car_no?.toString() === carNo)) return o;
          if (o.vehicles.find((v) => v?.vehicle_number?.toString() === carNo))
            return o;
        }
        if (o.vehicle_numbers && Array.isArray(o.vehicle_numbers)) {
          if (o.vehicle_numbers.map(String).includes(carNo)) return o;
        }
      }
      return null;
    };

    const normalized = driversArr.map((d) => {
      const carNoRaw =
        d.car_no || d.carNo || d.car_no_str || d.car_number || d.car;
      const carNo = carNoRaw != null ? carNoRaw.toString() : null;
      const owner = findOwnerByCarNo(carNo);
      const teamName =
        owner?.owner_name ||
        owner?.name ||
        d.manufacturer ||
        d.manufacturer_name ||
        "";
      const teamColor = constructorColors[teamName] || null;
      return {
        position: d.position ?? d.rank ?? null,
        carNo,
        driver: {
          id:
            d.driver_id?.toString() ||
            d.driver_id ||
            d.driver_number?.toString() ||
            carNo ||
            null,
          name:
            d.driver_name ||
            `${d.driver_first_name || ""} ${d.driver_last_name || ""}`.trim(),
          firstName: d.driver_first_name || d.driver_first || "",
          lastName: d.driver_last_name || d.driver_last || "",
          // Prefer server-provided map image keyed by nascar id, then fallback
          headshot:
            serverDriversMap[
              d.driver_id?.toString() || d.driver_number?.toString()
            ]?.image ||
            d.driver_image ||
            d.headshot ||
            null,
        },
        team: {
          name: teamName,
          color: teamColor,
        },
        points: d.points ?? d.points_current ?? d.points_total ?? 0,
        wins: d.wins ?? d.win_count ?? 0,
        delta_leader: d.delta_leader ?? d.delta ?? 0,
      };
    });

    // sort by position
    normalized.sort((a, b) => (a.position || 0) - (b.position || 0));
    setDriverStandings(normalized);

    // Build owners listing for constructorStandings
    const ownersList = ownersArr
      .map((owner) => {
        const carNoRaw =
          owner.vehicle_number ||
          owner.car_no ||
          owner.car_number ||
          owner.vehicle;
        const carNo = carNoRaw != null ? carNoRaw.toString() : null;
        return {
          id:
            owner.owner_id?.toString() ||
            owner.owner_id ||
            carNo ||
            owner.owner_name,
          position: owner.position ?? null,
          name: owner.owner_name || owner.name || "",
          firstName: owner.owner_first_name || "",
          lastName: owner.owner_last_name || "",
          headshot: null,
          vehicleNumber: carNo,
          points: owner.points ?? owner.points_current ?? 0,
          wins: owner.wins ?? 0,
          delta_leader: owner.delta_leader ?? owner.delta_next ?? 0,
        };
      })
      .filter((owner) => owner.name);

    setConstructorStandings(ownersList);
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

    // support different headshot fields (F1: headshot, NASCAR: driver_image)
    const uri =
      driver.headshot || driver.driver_image || driver.headshot_url || null;

    if (!uri || imageError) {
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
      <View
        style={[
          styles.driverImage,
          {
            backgroundColor: teamColor + "50" || theme.background,
            borderWidth: 1,
            borderColor: teamColor || theme.border,
            overflow: "hidden",
          },
        ]}
      >
        <Image
          source={{ uri }}
          style={[
            {
              width: "100%",
            },
            selectedSeries === "NASCAR"
              ? {
                  height: "150%",
                  transform: [{ translateY: 1.5 }, { translateX: -2 }],
                }
              : {
                  height: "100%",
                },
          ]}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
      </View>
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
      {selectedSeries === "F1" && (
        <View style={styles.rightGradientOverlay} pointerEvents="none">
          <Svg width="100%" height="100%" pointerEvents="none">
            <Defs>
              <SvgLinearGradient
                id={`standingsGrad-driver-${standing.driver.id || "x"}`}
                x1="100%"
                y1="0%"
                x2="0%"
                y2="0%"
              >
                <Stop
                  offset="0%"
                  stopColor={standing.team?.color || theme.surface}
                  stopOpacity="0.72"
                />
                <Stop
                  offset="100%"
                  stopColor={standing.team?.color || theme.surface}
                  stopOpacity="0"
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
      )}
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
        {selectedSeries === "NASCAR" && (
          <>
            <View style={styles.statItem}>
              <Text
                allowFontScaling={false}
                style={[styles.statValue, { color: theme.text }]}
              >
                {(standing.wins ?? standing.w) || 0}
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.statLabel, { color: theme.textSecondary }]}
              >
                W
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text
                allowFontScaling={false}
                style={[styles.statValue, { color: theme.text }]}
              >
                {(standing.delta_leader ?? standing.delta) || 0}
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.statLabel, { color: theme.textSecondary }]}
              >
                BHND
              </Text>
            </View>
          </>
        )}
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
      {selectedSeries === "F1" && (
        <View style={styles.rightGradientOverlay} pointerEvents="none">
          <Svg width="100%" height="100%" pointerEvents="none">
            <Defs>
              <SvgLinearGradient
                id={`standingsGrad-ctor-${standing.id || "x"}`}
                x1="100%"
                y1="0%"
                x2="0%"
                y2="0%"
              >
                <Stop
                  offset="0%"
                  stopColor={standing.color || theme.surface}
                  stopOpacity="0.72"
                />
                <Stop
                  offset="100%"
                  stopColor={standing.color || theme.surface}
                  stopOpacity="0"
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
      )}
      <View style={styles.positionContainer}>
        <Text
          allowFontScaling={false}
          style={[styles.position, { color: theme.textSecondary }]}
        >
          {standing.position}
        </Text>
      </View>

      <View style={styles.constructorInfo}>
        {selectedSeries === "NASCAR" ? (
          <DriverImage
            driver={{
              firstName: standing.firstName,
              lastName: standing.lastName,
              headshot: null,
            }}
            teamColor={theme.border}
          />
        ) : (
          <ConstructorLogo name={standing.name} color={standing.color} />
        )}

        <View style={styles.constructorDetails}>
          {selectedSeries === "NASCAR" ? (
            <>
              <Text
                allowFontScaling={false}
                style={[styles.driverName, { color: theme.text }]}
                numberOfLines={1}
              >
                {standing.name}
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.driversText, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {standing.firstName || ""} {standing.lastName || ""}
              </Text>
            </>
          ) : (
            <>
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
                {standing.drivers?.join(", ") ||
                  standing.subName ||
                  standing.driverName ||
                  ""}
              </Text>
            </>
          )}
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
            PTS
          </Text>
        </View>
        {selectedSeries === "NASCAR" && (
          <>
            <View style={styles.statItem}>
              <Text
                allowFontScaling={false}
                style={[styles.statValue, { color: theme.text }]}
              >
                {(standing.wins ?? 0) || 0}
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.statLabel, { color: theme.textSecondary }]}
              >
                W
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text
                allowFontScaling={false}
                style={[styles.statValue, { color: theme.text }]}
              >
                {(standing.delta_leader ?? standing.delta_next ?? 0) || 0}
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.statLabel, { color: theme.textSecondary }]}
              >
                BHND
              </Text>
            </View>
          </>
        )}
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
      paddingHorizontal: 12,
    },
    scrollContent: {
      paddingBottom: 70,
      flexGrow: 1,
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
    // removed right gradient per design
    seriesContainer: {
      flexDirection: "row",
      justifyContent: "center",
      marginHorizontal: 20,
      marginVertical: 8,
      borderRadius: 8,
      backgroundColor: theme.surface,
      padding: 6,
    },
    seriesButton: {
      flex: 1,
      paddingVertical: 10,
      alignItems: "center",
      borderRadius: 6,
    },
    activeSeriesButton: {
      backgroundColor: colors.primary,
    },
    stickyBottom: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 20,
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
      flexDirection: "row",
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
        <View style={styles.seriesContainer}>
          <TouchableOpacity
            style={[
              styles.seriesButton,
              selectedSeries === "F1" && styles.activeSeriesButton,
            ]}
            onPress={() => handleSeriesChange("F1")}
          >
            <Text
              style={[
                styles.typeButtonText,
                selectedSeries === "F1"
                  ? styles.activeTypeButtonText
                  : styles.inactiveTypeButtonText,
              ]}
            >
              Formula 1
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.seriesButton,
              selectedSeries === "NASCAR" && styles.activeSeriesButton,
            ]}
            onPress={() => handleSeriesChange("NASCAR")}
          >
            <Text
              style={[
                styles.typeButtonText,
                selectedSeries === "NASCAR"
                  ? styles.activeTypeButtonText
                  : styles.inactiveTypeButtonText,
              ]}
            >
              NASCAR
            </Text>
          </TouchableOpacity>
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

  return (
    <View style={styles.container}>
      {/* Top series toggle */}
      <View style={styles.seriesContainer}>
        <TouchableOpacity
          style={[
            styles.seriesButton,
            selectedSeries === "F1" && styles.activeSeriesButton,
          ]}
          onPress={() => handleSeriesChange("F1")}
        >
          <Text
            style={[
              styles.typeButtonText,
              selectedSeries === "F1"
                ? styles.activeTypeButtonText
                : styles.inactiveTypeButtonText,
            ]}
          >
            Formula 1
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.seriesButton,
            selectedSeries === "NASCAR" && styles.activeSeriesButton,
          ]}
          onPress={() => handleSeriesChange("NASCAR")}
        >
          <Text
            style={[
              styles.typeButtonText,
              selectedSeries === "NASCAR"
                ? styles.activeTypeButtonText
                : styles.inactiveTypeButtonText,
            ]}
          >
            NASCAR
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
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

      {/* Sticky bottom bar with type buttons - changes depending on series */}
      <View style={styles.stickyBottom} pointerEvents="box-none">
        <View style={styles.typeContainer}>
          {(selectedSeries === "F1"
            ? [
                { key: "DRIVERS", name: "Drivers" },
                { key: "CONSTRUCTORS", name: "Constructors" },
              ]
            : [
                { key: "DRIVERS", name: "Drivers" },
                { key: "OWNERS", name: "Owners" },
              ]
          ).map((type) => (
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
      </View>
    </View>
  );
};

export default StandingsScreen;

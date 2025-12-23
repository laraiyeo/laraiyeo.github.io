import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { FontAwesome6, FontAwesome } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import analyticsService from "../services/AnalyticsService";
import UpdateService from "../services/UpdateService";

// Base home tile definitions without runtime theme colors (used by prefetch)
const HOME_SPORTS_BASE = [
  {
    id: "mlb",
    title: "MLB",
    description: "View all live MLB games happening right now.",
    icon: require("../../assets/mlb.png"),
  },
  {
    id: "nhl",
    title: "NHL",
    description: "View all live NHL games happening right now.",
    icon: require("../../assets/nhl.png"),
  },
  {
    id: "nba",
    title: "NBA",
    description: "View all live NBA games happening right now.",
    icon: require("../../assets/nba.png"),
  },
  {
    id: "nfl",
    title: "NFL",
    description: "View all live NFL games happening right now.",
    icon: require("../../assets/nfl.png"),
  },
  {
    id: "soccer",
    title: "SOCCER",
    description: "View all live Soccer matches happening right now.",
    icon: require("../../assets/soccer.png"),
  },
  {
    id: "wnba",
    title: "WNBA",
    description: "View all live WNBA games happening right now.",
    icon: require("../../assets/wnba.png"),
  },
  {
    id: "f1",
    title: "F1",
    description: "View all live F1 races happening right now.",
    icon: require("../../assets/f1.png"),
  },
  {
    id: "esports",
    title: "ESPORTS",
    description: "View all live E-Sports games happening right now.",
    iconName: "computer",
  },
];

const STORAGE_KEY = "home_sports_config_v1";

// Prefetch helper used by app startup to prepare home tiles while splash is visible.
// Returns the reconstructed sports array (same shape as the in-component state).
async function prefetchHomeSportsConfig() {
  try {
    // If another caller already prefetched and cached the value, return it silently.
    if (typeof module !== "undefined" && module.exports && module.exports.__prefetchedHomeSports) {
      return module.exports.__prefetchedHomeSports;
    }
    const t0 = Date.now();
    console.log("prefetchHomeSportsConfig: start", new Date().toISOString());
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const byId = {};
    HOME_SPORTS_BASE.forEach((s) => (byId[s.id] = s));
    const reconstructed = [];
    parsed.forEach((p) => {
      const base = byId[p.id];
      if (base) reconstructed.push({ ...base, hidden: !!p.hidden });
    });
    HOME_SPORTS_BASE.forEach((d) => {
      if (!reconstructed.find((r) => r.id === d.id))
        reconstructed.push({ ...d, hidden: false });
    });
    // Expose on module.exports so the component's loadSportsConfig can pick it up
    if (typeof module !== "undefined" && module.exports) {
      module.exports.__prefetchedHomeSports = reconstructed;
    }
    const t1 = Date.now();
    console.log("prefetchHomeSportsConfig: done; duration_ms=", t1 - t0);
    return reconstructed;
  } catch (err) {
    console.warn("prefetchHomeSportsConfig failed:", err);
    return null;
  }
}

export { prefetchHomeSportsConfig };

const HomeScreen = () => {
  const navigation = useNavigation();
  const { theme, colors } = useTheme();

  // Update popup state
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);

  // Manual features list - update this when you have new features
  const updateFeatures = ["Bug fixes and performance improvements."];
  const defaultSports = HOME_SPORTS_BASE.map((s) => ({
    ...s,
    color: colors.primary,
  }));

  const STORAGE_KEY = "home_sports_config_v1";

  const [sportsState, setSportsState] = useState(
    defaultSports.map((s) => ({ ...s, hidden: false }))
  );
  const [editMode, setEditMode] = useState(false);
  const [pickedId, setPickedId] = useState(null);
  const loadedRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const bannerAnim = useRef(new Animated.Value(-60)).current; // slide from -height to 0
  const [bannerData, setBannerData] = useState(null);
  const [headerHeight, setHeaderHeight] = useState(80);

  // Check for update restart on component mount and set up update checking
  useEffect(() => {
    const checkForUpdateRestart = async () => {
      try {
        const restartResult = await UpdateService.checkAndClearUpdateRestart();
        if (restartResult.didRestart) {
          // Show "What's New" popup after restart
          setTimeout(() => {
            setShowUpdateModal(true);
          }, 500); // 500ms delay as requested
        }
      } catch (error) {
        console.error("Error checking update restart:", error);
      }
    };

    const setupUpdateCheck = async () => {
      try {
        // Check for updates and show prompt if available
        await UpdateService.checkForUpdatesOnStartup(() => {
          setShowUpdatePrompt(true);
        });
      } catch (error) {
        console.error("Error setting up update check:", error);
      }
    };

    checkForUpdateRestart();
    setupUpdateCheck();
    loadSportsConfig();
  }, []);

  const saveSportsConfig = async (arr) => {
    try {
      const payload = arr.map((s) => ({ id: s.id, hidden: !!s.hidden }));
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error("Failed to save sports config", e);
    }
  };

  const loadSportsConfig = async () => {
    const startLoadTs = Date.now();
    console.log("loadSportsConfig: start", new Date().toISOString());
    try {
      // If a prefetched value exists (populated by app startup), use it to avoid waiting
      if (
        typeof module !== "undefined" &&
        module.exports &&
        module.exports.__prefetchedHomeSports
      ) {
        const pref = module.exports.__prefetchedHomeSports;
        if (Array.isArray(pref) && pref.length > 0) {
          setSportsState(pref);
          loadedRef.current = true;
          setIsReady(true);
          const usedTs = Date.now();
          console.log("loadSportsConfig: used prefetched value; time_to_ready_ms=", usedTs - startLoadTs);
          return;
        }
      }
      const tBeforeStorage = Date.now();
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const tAfterStorage = Date.now();
      console.log("loadSportsConfig: AsyncStorage.getItem duration_ms=", tAfterStorage - tBeforeStorage);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const byId = {};
      defaultSports.forEach((s) => (byId[s.id] = s));
      const reconstructed = [];
      parsed.forEach((p) => {
        const base = byId[p.id];
        if (base) reconstructed.push({ ...base, hidden: !!p.hidden });
      });
      defaultSports.forEach((d) => {
        if (!reconstructed.find((r) => r.id === d.id))
          reconstructed.push({ ...d, hidden: false });
      });
      setSportsState(reconstructed);
      loadedRef.current = true;
      setIsReady(true);
      const doneTs = Date.now();
      console.log("loadSportsConfig: finished; total_time_ms=", doneTs - startLoadTs);
    } catch (e) {
      console.error("Failed to load sports config", e);
    }
  };

  // (prefetch helper is defined at module top-level and exported there)

  const showBanner = (data) => {
    setBannerData(data);
    setBannerVisible(true);
    Animated.timing(bannerAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  };

  const hideBanner = (delay = 0) => {
    setTimeout(() => {
      Animated.timing(bannerAnim, {
        toValue: -60,
        duration: 220,
        useNativeDriver: true,
      }).start(() => {
        setBannerVisible(false);
        setBannerData(null);
      });
    }, delay);
  };

  // Fallback: if config isn't loaded quickly, avoid flashing UI by marking ready
  useEffect(() => {
    const t = setTimeout(() => {
      if (!loadedRef.current) {
        loadedRef.current = true;
        setIsReady(true);
      }
    }, 600);
    return () => clearTimeout(t);
  }, []);

  const handleSportPress = async (sport) => {
    if (editMode) {
      if (sport.hidden) {
        // re-add: mark visible and move to front
        const next = sportsState.map((s) =>
          s.id === sport.id ? { ...s, hidden: false } : s
        );
        const item = next.find((s) => s.id === sport.id);
        const others = next.filter((s) => s.id !== sport.id);
        const reordered = [item, ...others];
        setSportsState(reordered);
        await saveSportsConfig(reordered);
      }

      if (pickedId && pickedId !== sport.id) {
        const idxA = sportsState.findIndex((s) => s.id === pickedId);
        const idxB = sportsState.findIndex((s) => s.id === sport.id);
        if (idxA >= 0 && idxB >= 0) {
          const copy = [...sportsState];
          const tmp = copy[idxA];
          copy[idxA] = copy[idxB];
          copy[idxB] = tmp;
          setSportsState(copy);
          await saveSportsConfig(copy);
        }
        setPickedId(null);
        // update banner to show swapped with target then hide after 1.5s
        showBanner({
          id: sport.id,
          title: sport.title,
          icon: sport.icon,
          status: "Swapped with",
        });
        hideBanner(1500);
        return;
      }

      // otherwise ignore taps while editing
      return;
    }

    // Normal behaviour: Log analytics event for sport selection
    analyticsService.logSportSelection(sport.id);
    navigation.navigate("SportTabs", { sport: sport.id });
  };

  const handleLongPress = (sport) => {
    if (!editMode) return;
    setPickedId(sport.id);
    // show banner with pressed info
    showBanner({
      id: sport.id,
      title: sport.title,
      icon: sport.icon,
      status: "Pressed",
    });
  };

  const handleHideSport = async (sportId) => {
    const next = sportsState.map((s) =>
      s.id === sportId ? { ...s, hidden: true } : s
    );
    const visible = next.filter((s) => !s.hidden);
    const hidden = next.filter((s) => s.hidden);
    const reordered = [...visible, ...hidden];
    setSportsState(reordered);
    await saveSportsConfig(reordered);
  };

  // Persist when sportsState changes after initial load
  useEffect(() => {
    if (!loadedRef.current) return;
    saveSportsConfig(sportsState);
  }, [sportsState]);

  if (!isReady) {
    return (
      <View
        style={[styles.splashPlaceholder, { backgroundColor: theme.surface }]}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.surface,
            borderBottomColor: theme.border,
            zIndex: 20,
            elevation: 20,
          },
        ]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <View style={styles.titleContainer}>
          <Text
            allowFontScaling={false}
            style={[styles.title, { color: theme.text }]}
          >
            SportsHeart
          </Text>
          <FontAwesome
            name="heart"
            size={24}
            color={colors.primary}
            style={styles.heartIcon}
          />
        </View>
        <Text
          allowFontScaling={false}
          style={[styles.subtitle, { color: theme.textSecondary }]}
        >
          Choose your sport to get started
        </Text>
      </View>

      {/* Animated banner that drops under the header */}
      {bannerVisible && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.banner,
            { transform: [{ translateY: bannerAnim }], top: headerHeight - 0 },
            { backgroundColor: theme.surface },
          ]}
        >
          {bannerData && (
            <View style={styles.bannerInner}>
              <View style={styles.bannerIcon}>
                {bannerData.icon ? (
                  <Image
                    source={bannerData.icon}
                    style={styles.bannerIconImage}
                  />
                ) : (
                  <FontAwesome6
                    name="computer"
                    size={20}
                    color={colors.primary}
                  />
                )}
              </View>
              <Text
                allowFontScaling={false}
                style={[styles.bannerText, { color: theme.text }]}
              >
                {" "}
                {bannerData.status === "Pressed"
                  ? `${bannerData.title} - Pressed`
                  : `Swapped with ${bannerData.title}`}
              </Text>
            </View>
          )}
        </Animated.View>
      )}
      <ScrollView
        style={styles.scrollArea}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sportsGrid}>
          {sportsState
            .filter((s) => !s.hidden)
            .map((sport) => {
              const isPicked = pickedId === sport.id;
              return (
                <TouchableOpacity
                  key={sport.id}
                  style={[
                    styles.sportCard,
                    {
                      backgroundColor: theme.surface,
                      borderColor: colors.primary,
                      opacity: editMode ? 0.5 : 1,
                    },
                    isPicked ? styles.pickedCard : null,
                  ]}
                  onPress={() => handleSportPress(sport)}
                  onLongPress={() => handleLongPress(sport)}
                  delayLongPress={250}
                  activeOpacity={0.9}
                >
                  {/* close X shown in edit mode */}
                  {editMode && (
                    <TouchableOpacity
                      style={[
                        styles.smallClose,
                        { backgroundColor: colors.error || "#e74c3c" },
                      ]}
                      onPress={() => handleHideSport(sport.id)}
                    >
                      <Text
                        allowFontScaling={false}
                        style={styles.smallCloseText}
                      >
                        ✕
                      </Text>
                    </TouchableOpacity>
                  )}

                  <View style={styles.sportContent}>
                    <View style={styles.iconWrapper}>
                      {sport.icon ? (
                        <Image
                          source={sport.icon}
                          style={styles.sportIconImage}
                        />
                      ) : (
                        <FontAwesome6
                          name={sport.iconName}
                          size={48}
                          color={colors.primary}
                          style={styles.sportIconFA}
                        />
                      )}
                    </View>

                    <Text
                      allowFontScaling={false}
                      style={[styles.sportTitle, { color: colors.secondary }]}
                    >
                      {sport.title}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.sportDescription,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {sport.description}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

          {/* Hidden cards shown at bottom as add-cards (only in edit mode) */}
          {editMode &&
            sportsState
              .filter((s) => s.hidden)
              .map((sport) => (
                <TouchableOpacity
                  key={sport.id}
                  style={[
                    styles.sportCard,
                    styles.addCard,
                    { backgroundColor: colors.success || "#27ae60" },
                  ]}
                  onPress={() => handleSportPress(sport)}
                  activeOpacity={0.9}
                >
                  <View style={styles.sportContent}>
                    <Text allowFontScaling={false} style={styles.addPlus}>
                      +
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.sportTitle,
                        { color: "#fff", marginTop: 8 },
                      ]}
                    >
                      {sport.title}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
        </View>

        {/* Edit controls below the grid */}
        <View style={styles.editBar}>
          {editMode ? (
            <>
              <View style={styles.editButtonsRow}>
                <TouchableOpacity
                  style={[
                    styles.editButton,
                    { backgroundColor: colors.secondary, marginRight: 12 },
                  ]}
                  onPress={() => {
                    setEditMode(false);
                    setPickedId(null);
                  }}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.editButtonText, { color: "#fff" }]}
                  >
                    Done
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.revertButton, { borderColor: theme.error }]}
                  onPress={async () => {
                    // revert to default order and visibility
                    const reset = defaultSports.map((s) => ({
                      ...s,
                      hidden: false,
                    }));
                    setSportsState(reset);
                    setPickedId(null);
                    await saveSportsConfig(reset);
                  }}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.revertButtonText, { color: theme.error }]}
                  >
                    Revert
                  </Text>
                </TouchableOpacity>
              </View>

              <Text
                allowFontScaling={false}
                style={[styles.hintText, { color: theme.textSecondary }]}
              >
                Long-press a card to pick it up, then tap another to swap. Tap ✕
                to hide.
              </Text>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.editButton, { backgroundColor: theme.surface }]}
              onPress={() => {
                setEditMode(true);
                setPickedId(null);
              }}
            >
              <Text
                allowFontScaling={false}
                style={[styles.editButtonText, { color: colors.primary }]}
              >
                Edit Layout
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Update Modal */}
      <Modal
        visible={showUpdateModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowUpdateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[styles.updateModal, { backgroundColor: theme.surface }]}
          >
            <View
              style={[styles.updateHeader, { backgroundColor: colors.primary }]}
            >
              <Text allowFontScaling={false} style={styles.updateTitle}>
                🎉 App Updated!
              </Text>
            </View>

            <View style={styles.updateContent}>
              <Text
                allowFontScaling={false}
                style={[styles.updateSubtitle, { color: theme.text }]}
              >
                What's New
              </Text>

              <View style={styles.featuresList}>
                {updateFeatures.map((feature, index) => (
                  <View key={index} style={styles.featureItem}>
                    <Text
                      allowFontScaling={false}
                      style={[styles.featureBullet, { color: colors.accent }]}
                    >
                      •
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={[styles.featureText, { color: theme.text }]}
                    >
                      {feature}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.singleButtonContainer}>
              <TouchableOpacity
                style={[
                  styles.updateButtonSingle,
                  { backgroundColor: colors.secondary },
                ]}
                onPress={() => setShowUpdateModal(false)}
              >
                <Text allowFontScaling={false} style={styles.updateButtonText}>
                  Got it, thanks!
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Update Available Prompt */}
      <Modal
        visible={showUpdatePrompt}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowUpdatePrompt(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[styles.updateModal, { backgroundColor: theme.surface }]}
          >
            <View
              style={[styles.updateHeader, { backgroundColor: colors.primary }]}
            >
              <Text allowFontScaling={false} style={styles.updateTitle}>
                📱 Update Available
              </Text>
            </View>

            <View style={styles.updateContent}>
              <Text
                allowFontScaling={false}
                style={[styles.updateSubtitle, { color: theme.text }]}
              >
                A new version of the app is available. Would you like to update
                now?
              </Text>

              <Text
                allowFontScaling={false}
                style={[
                  styles.updateDescription,
                  { color: theme.textSecondary },
                ]}
              >
                The app will restart automatically after updating.
              </Text>
            </View>

            <View style={styles.updateButtons}>
              <TouchableOpacity
                style={[
                  styles.updateButtonSecondary,
                  { borderColor: colors.primary },
                ]}
                onPress={() => setShowUpdatePrompt(false)}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.updateButtonSecondaryText,
                    { color: colors.primary },
                  ]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.updateButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={async () => {
                  setShowUpdatePrompt(false);
                  console.log("User chose to update - downloading...");
                  const downloadResult = await UpdateService.downloadUpdate();
                  if (downloadResult.success) {
                    console.log("Download successful, restarting app...");
                    await UpdateService.restartApp(true);
                  } else {
                    console.error("Download failed:", downloadResult.error);
                    // Could show an error message here
                  }
                }}
              >
                <Text allowFontScaling={false} style={styles.updateButtonText}>
                  Update Now
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    alignItems: "center",
    borderBottomWidth: 1,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  heartIcon: {
    marginLeft: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
  },
  scrollArea: {
    flex: 1,
  },
  sportsGrid: {
    padding: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  sportCard: {
    width: "48%",
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1,
  },
  sportContent: {
    padding: 16,
    alignItems: "center",
  },
  iconWrapper: {
    width: 100,
    height: 60,
    marginBottom: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sportIconImage: {
    width: 100,
    height: 60,
    resizeMode: "contain",
  },
  sportIconFA: {
    // FontAwesome is a glyph; centering via wrapper
    textAlign: "center",
  },
  sportTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  sportDescription: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  // Update Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  updateModal: {
    width: "85%",
    maxWidth: 400,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  updateHeader: {
    padding: 20,
    alignItems: "center",
  },
  updateTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  updateContent: {
    padding: 20,
  },
  updateSubtitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
  },
  featuresList: {
    marginBottom: 5,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  featureBullet: {
    fontSize: 20,
    marginRight: 12,
    marginTop: -2,
  },
  featureText: {
    fontSize: 16,
    lineHeight: 22,
    flex: 1,
  },
  updateDetails: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 10,
    fontStyle: "italic",
  },
  updateButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  updateButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  updateDescription: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 10,
  },
  updateButtons: {
    flexDirection: "row",
    margin: 20,
    marginTop: 0,
    gap: 10,
  },
  updateButtonSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 2,
  },
  updateButtonSecondaryText: {
    fontSize: 16,
    fontWeight: "600",
  },
  singleButtonContainer: {
    margin: 20,
    marginTop: 0,
  },
  updateButtonSingle: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  smallClose: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
    elevation: 50,
  },
  smallCloseText: {
    color: "#fff",
    fontWeight: "700",
  },
  addCard: {
    alignItems: "center",
    justifyContent: "center",
  },
  addPlus: {
    fontSize: 48,
    color: "#fff",
    fontWeight: "600",
  },
  editBar: {
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  editButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  editButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  revertButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: "transparent",
  },
  revertButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  hintText: {
    marginTop: 8,
    fontSize: 12,
    textAlign: "center",
  },
  pickedCard: {
    transform: [{ scale: 1.02 }],
    elevation: 8,
  },
  banner: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 56,
    zIndex: 5,
    elevation: 5,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  bannerInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  bannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  bannerIconImage: {
    width: 36,
    height: 36,
    resizeMode: "contain",
  },
  bannerText: {
    fontSize: 16,
    fontWeight: "600",
  },
  splashPlaceholder: {
    flex: 1,
  },
});

export default HomeScreen;
